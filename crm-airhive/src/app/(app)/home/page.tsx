'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { Database } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import {
    LayoutDashboard,
    TrendingUp,
    Target,
    AlertCircle,
    ChevronRight,
    Search,
    Filter,
    Zap,
    Building2,
    Clock3,
    Percent,
    ShieldAlert,
    Activity
} from 'lucide-react'
import SellerRace from '@/components/SellerRace'
import PipelineVisualizer from '@/components/PipelineVisualizer'
import UpcomingMeetingsWidget from '@/components/UpcomingMeetingsWidget'
import MyTasksWidget from '@/components/MyTasksWidget'
import { rankRaceItems } from '@/lib/raceRanking'
import { computeAdjustedMonthlyRaceLeadValue, computeSellerForecastRaceReliability } from '@/lib/forecastRaceAdjustments'
import { getAdminExecutiveDashboardSupportData } from '@/app/actions/dashboard'

type Lead = Database['public']['Tables']['clientes']['Row']
type ForecastReliabilityMetric = Database['public']['Tables']['seller_forecast_reliability_metrics']['Row']
type CrmEventRow = {
    id?: number | string | null
    user_id?: string | null
    event_type?: string | null
    created_at?: string | null
}
type History = {
    lead_id: number
    field_name: string
    old_value: string | null
    new_value: string | null
    created_at: string
}

const normalizeStage = (stage: string | null | undefined) => String(stage || '').trim().toLowerCase()
const isWonStage = (stage: string | null | undefined) => normalizeStage(stage).includes('ganad')
const isLostStage = (stage: string | null | undefined) => normalizeStage(stage).includes('perdid')
const isClosedStage = (stage: string | null | undefined) => normalizeStage(stage).includes('cerrado')
const isNegotiationStage = (stage: string | null | undefined) => normalizeStage(stage).includes('negoci')
const isCurrentUtcMonth = (isoLike: string | null | undefined) => {
    if (!isoLike) return false
    const d = new Date(isoLike)
    if (Number.isNaN(d.getTime())) return false
    const now = new Date()
    return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth()
}
const getRealCloseValue = (lead: Lead) => Number((lead as any).valor_real_cierre ?? lead.valor_estimado ?? 0)
const getRealCloseTimestamp = (lead: Lead) =>
    ((lead as any).closed_at_real as string | null)
    || (lead.forecast_scored_at as string | null)
    || (lead.created_at as string | null)
const getStrictClosedAtReal = (lead: Lead) => ((lead as any).closed_at_real as string | null) || null
const isInUtcMonthFromIso = (isoLike: string | null | undefined, year: number, month0: number) => {
    if (!isoLike) return false
    const d = new Date(isoLike)
    if (Number.isNaN(d.getTime())) return false
    return d.getUTCFullYear() === year && d.getUTCMonth() === month0
}
const monthDateRangeUtc = (year: number, month0: number) => ({
    start: new Date(Date.UTC(year, month0, 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(year, month0 + 1, 1, 0, 0, 0, 0))
})
const diffDaysFloat = (fromIso: string | null | undefined, toIso: string | null | undefined) => {
    if (!fromIso || !toIso) return null
    const from = new Date(fromIso)
    const to = new Date(toIso)
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null
    const diff = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)
    return diff >= 0 ? diff : null
}
const OPERATIONAL_EVENT_TYPES = new Set<string>([
    'lead_created', 'lead_updated', 'lead_stage_change', 'lead_assigned', 'lead_closed',
    'meeting_scheduled', 'meeting_started', 'meeting_finished', 'meeting_no_show', 'meeting_rescheduled',
    'call_started', 'call_finished',
    'forecast_registered', 'forecast_frozen',
    'pre_lead_created', 'pre_lead_updated', 'pre_lead_converted',
    'task_created', 'task_updated', 'task_status_changed',
    'company_created', 'company_updated'
])

function formatUserDisplayName(raw?: string | null) {
    const value = String(raw || '').trim()
    if (!value) return 'Usuario'
    if (value.includes('.')) {
        return value
            .split('.')
            .filter(Boolean)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
            .join(' ')
    }
    if (value === value.toUpperCase()) {
        return value
            .split(/\s+/)
            .filter(Boolean)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
            .join(' ')
    }
    return value
}

function AdminDashboardView({ displayName }: { displayName: string }) {
    const [leads, setLeads] = useState<Lead[]>([])
    const [history, setHistory] = useState<History[]>([])
    const [reliabilityMetricsBySellerId, setReliabilityMetricsBySellerId] = useState<Record<string, ForecastReliabilityMetric>>({})
    const [sellerProfilesById, setSellerProfilesById] = useState<Record<string, { fullName?: string | null; role?: string | null; banned?: boolean | null }>>({})
    const [crmEvents, setCrmEvents] = useState<CrmEventRow[]>([])
    const [activeCompaniesCountSupport, setActiveCompaniesCountSupport] = useState<number | null>(null)
    const [executiveSupportWarning, setExecutiveSupportWarning] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [supabase] = useState(() => createClient())

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true)
            try {
                const [
                    { data: leadData },
                    { data: histData },
                    { data: reliabilityData },
                    supportDataRes
                ] = await Promise.all([
                    supabase.from('clientes').select('*'),
                    (supabase.from('lead_history') as any).select('*').eq('field_name', 'probabilidad').order('created_at', { ascending: false }),
                    (supabase.from('seller_forecast_reliability_metrics') as any).select('*'),
                    getAdminExecutiveDashboardSupportData()
                ])

                if (leadData) setLeads(leadData)
                if (histData) setHistory(histData as any)
                if (reliabilityData) {
                    const nextMap: Record<string, ForecastReliabilityMetric> = {}
                    ;(reliabilityData as ForecastReliabilityMetric[]).forEach((row) => {
                        if (row?.seller_id) nextMap[String(row.seller_id)] = row
                    })
                    setReliabilityMetricsBySellerId(nextMap)
                }
                if (supportDataRes?.success) {
                    const profilesData = supportDataRes.data?.profiles
                    const eventsData = supportDataRes.data?.latestOperationalEvents
                    const nextProfiles: Record<string, { fullName?: string | null; role?: string | null; banned?: boolean | null }> = {}
                    ;(profilesData as any[]).forEach((row) => {
                        if (!row?.id) return
                        nextProfiles[String(row.id)] = {
                            fullName: row.full_name ? String(row.full_name) : null,
                            role: row.role ? String(row.role) : null,
                            banned: row.banned == null ? null : Boolean(row.banned)
                        }
                    })
                    setSellerProfilesById(nextProfiles)
                    setCrmEvents(Array.isArray(eventsData) ? (eventsData as any) : [])
                    setActiveCompaniesCountSupport(typeof supportDataRes.data?.activeCompaniesCount === 'number' ? supportDataRes.data.activeCompaniesCount : null)
                    setExecutiveSupportWarning(null)
                } else {
                    setSellerProfilesById({})
                    setCrmEvents([])
                    setActiveCompaniesCountSupport(null)
                    setExecutiveSupportWarning(supportDataRes?.error || 'Sin acceso al soporte ejecutivo (eventos/perfiles)')
                }
            } catch (error: any) {
                console.error('Error loading admin dashboard:', error)
                setSellerProfilesById({})
                setCrmEvents([])
                setActiveCompaniesCountSupport(null)
                setExecutiveSupportWarning(error?.message || 'Fallo al cargar señales ejecutivas')
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [supabase])

    const stats = useMemo(() => {
        const executiveSupportAvailable = !executiveSupportWarning
        const sellerMap: Record<string, {
            sellerId: string | null
            name: string
            historicalLeads: Lead[]
            activeLeads: Lead[]
            score: number
            negotiationPipeline: number
            raceRealClosedValue: number
            raceForecastValue: number
            raceForecastLeadCount: number
            raceForecastAdjustedValue: number
            raceForecastAdjustedReliability: number
            monthlyWonCount: number
            monthlyLostCount: number
            monthlyConversionRate: number | null
            monthlyAvgCycleDays: number | null
        }> = {}

        const now = new Date()
        const currentYear = now.getUTCFullYear()
        const currentMonth0 = now.getUTCMonth()
        const riskThreshold = new Date(now)
        riskThreshold.setUTCDate(riskThreshold.getUTCDate() - 7)

        const latestProbHistoryByLeadId = new Map<number, History>()
        history.forEach((item) => {
            if (!latestProbHistoryByLeadId.has(item.lead_id)) latestProbHistoryByLeadId.set(item.lead_id, item)
        })

        const closed = leads.filter((l) => isClosedStage(l.etapa))
        const active = leads.filter((l) => !isClosedStage(l.etapa))

        leads.forEach((lead) => {
            const sellerKey = String(lead.owner_id || lead.owner_username || 'Unknown')
            const profile = lead.owner_id ? sellerProfilesById[String(lead.owner_id)] : undefined
            const sellerName = formatUserDisplayName(profile?.fullName || lead.owner_username || 'Unknown')
            if (!sellerMap[sellerKey]) {
                sellerMap[sellerKey] = {
                    sellerId: lead.owner_id ? String(lead.owner_id) : null,
                    name: sellerName,
                    historicalLeads: [],
                    activeLeads: [],
                    score: 0,
                    negotiationPipeline: 0,
                    raceRealClosedValue: 0,
                    raceForecastValue: 0,
                    raceForecastLeadCount: 0,
                    raceForecastAdjustedValue: 0,
                    raceForecastAdjustedReliability: 0,
                    monthlyWonCount: 0,
                    monthlyLostCount: 0,
                    monthlyConversionRate: null,
                    monthlyAvgCycleDays: null
                }
            }
            if (isClosedStage(lead.etapa)) sellerMap[sellerKey].historicalLeads.push(lead)
            else sellerMap[sellerKey].activeLeads.push(lead)
        })

        const sellers = Object.values(sellerMap).map((s) => {
            const scoredLeads = s.historicalLeads.map((l) => {
                let p = 0
                let y = isWonStage(l.etapa) ? 1 : 0
                if (l.forecast_evaluated_probability !== null) {
                    p = l.forecast_evaluated_probability / 100
                    y = l.forecast_outcome ?? (isWonStage(l.etapa) ? 1 : 0)
                } else {
                    const h = latestProbHistoryByLeadId.get(l.id)
                    if (h?.new_value) p = parseInt(h.new_value) / 100
                    else return null
                }
                return Math.pow(y - p, 2)
            }).filter((err) => err !== null) as number[]

            const scoredN = scoredLeads.length
            const rawAcc = scoredN > 0 ? 1 - (scoredLeads.reduce((a, b) => a + b, 0) / scoredN) : 0
            const relScore = scoredN > 0 ? (rawAcc * (scoredN / (scoredN + 4))) * 100 : 0

            const negotiationLeads = s.activeLeads.filter((l) => isNegotiationStage(l.etapa))
            const negPipeline = negotiationLeads
                .reduce((acc, l) => acc + ((l.probabilidad || 0) / 100 * (l.valor_estimado || 0)), 0)

            const raceForecastValue = negotiationLeads
                .reduce((acc, l) => acc + ((l.probabilidad || 0) / 100 * (l.valor_estimado || 0)), 0)
            const reliabilityMetrics = s.sellerId ? reliabilityMetricsBySellerId[String(s.sellerId)] : null
            const raceForecastAdjustedValue = negotiationLeads
                .reduce((acc, l) => acc + computeAdjustedMonthlyRaceLeadValue(l, reliabilityMetrics), 0)
            const raceForecastAdjustedReliability = computeSellerForecastRaceReliability(reliabilityMetrics)

            const wonThisMonth = s.historicalLeads.filter((l) => isWonStage(l.etapa) && isInUtcMonthFromIso(getStrictClosedAtReal(l), currentYear, currentMonth0))
            const lostThisMonth = s.historicalLeads.filter((l) => isLostStage(l.etapa) && isInUtcMonthFromIso(getStrictClosedAtReal(l), currentYear, currentMonth0))
            const closedThisMonthCount = wonThisMonth.length + lostThisMonth.length

            const raceRealClosedValue = wonThisMonth
                .reduce((acc, l) => acc + getRealCloseValue(l), 0)

            const cycleDays = wonThisMonth
                .map((l) => diffDaysFloat(((l as any).fecha_registro as string | null) || (l.created_at as string | null), getStrictClosedAtReal(l)))
                .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
            const avgCycleDays = cycleDays.length > 0 ? cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length : null

            return {
                ...s,
                score: relScore,
                negotiationPipeline: negPipeline,
                raceRealClosedValue,
                raceForecastValue,
                raceForecastLeadCount: negotiationLeads.length,
                raceForecastAdjustedValue,
                raceForecastAdjustedReliability,
                monthlyWonCount: wonThisMonth.length,
                monthlyLostCount: lostThisMonth.length,
                monthlyConversionRate: closedThisMonthCount > 0 ? (wonThisMonth.length / closedThisMonthCount) * 100 : null,
                monthlyAvgCycleDays: avgCycleDays
            }
        }).sort((a, b) => b.raceRealClosedValue - a.raceRealClosedValue)

        const totalPipeline = active.reduce((acc, l) => acc + (l.valor_estimado || 0), 0)
        const adjustedForecast = sellers.reduce((acc, s) => acc + s.raceForecastAdjustedValue, 0)

        const stages = ['Prospección', 'Negociación', 'Cerrado Ganado', 'Cerrado Perdido']
        const funnel = stages.map((stage) => ({
            stage,
            count: leads.filter((l) => String(l.etapa || '').trim() === stage).length,
            value: leads.filter((l) => String(l.etapa || '').trim() === stage).reduce((acc, l) => acc + (l.valor_estimado || 0), 0),
            color: stage.includes('Ganado')
                ? '#10B981'
                : stage.includes('Perdido')
                    ? '#EF4444'
                    : stage === 'Negociación'
                        ? '#3B82F6'
                        : '#A855F7'
        }))

        const monthWonLeads = closed.filter((l) => isWonStage(l.etapa) && isInUtcMonthFromIso(getStrictClosedAtReal(l), currentYear, currentMonth0))
        const monthLostLeads = closed.filter((l) => isLostStage(l.etapa) && isInUtcMonthFromIso(getStrictClosedAtReal(l), currentYear, currentMonth0))
        const monthClosedCount = monthWonLeads.length
        const monthClosedDecisions = monthWonLeads.length + monthLostLeads.length
        const conversionRate = monthClosedDecisions > 0 ? (monthWonLeads.length / monthClosedDecisions) * 100 : 0
        const cycleDaysAll = monthWonLeads
            .map((l) => diffDaysFloat(((l as any).fecha_registro as string | null) || (l.created_at as string | null), getStrictClosedAtReal(l)))
            .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
        const avgCycleDays = cycleDaysAll.length > 0 ? cycleDaysAll.reduce((a, b) => a + b, 0) / cycleDaysAll.length : 0

        const latestOperationalEventByUserId = new Map<string, CrmEventRow>()
        ;(crmEvents || []).forEach((evt) => {
            const userId = String(evt.user_id || '')
            if (!userId) return
            if (!OPERATIONAL_EVENT_TYPES.has(String(evt.event_type || ''))) return
            if (!latestOperationalEventByUserId.has(userId)) {
                latestOperationalEventByUserId.set(userId, evt)
            }
        })

        const candidateSellerIds = new Set<string>()
        Object.keys(sellerProfilesById).forEach((sellerId) => {
            const profile = sellerProfilesById[sellerId]
            if (!profile) return
            if (profile.banned) return
            if (profile.role !== 'seller' && profile.role !== 'admin') return
            candidateSellerIds.add(sellerId)
        })
        Object.values(sellerMap).forEach((seller) => {
            if (seller.sellerId) candidateSellerIds.add(String(seller.sellerId))
        })

        const sellersAtRisk = Array.from(candidateSellerIds)
            .map((sellerId) => {
                const profile = sellerProfilesById[sellerId]
                const sellerStats = Object.values(sellerMap).find((entry) => entry.sellerId === sellerId)
                const latestEvt = latestOperationalEventByUserId.get(sellerId)
                const latestAt = latestEvt?.created_at ? new Date(latestEvt.created_at) : null
                const daysWithoutActivity = latestAt ? Math.floor((now.getTime() - latestAt.getTime()) / (1000 * 60 * 60 * 24)) : 999
                const atRisk = !latestAt || latestAt < riskThreshold
                return {
                    sellerId,
                    name: formatUserDisplayName(profile?.fullName || sellerStats?.name || 'Usuario'),
                    role: profile?.role || null,
                    lastActivityAt: latestEvt?.created_at || null,
                    daysWithoutActivity,
                    activeLeadCount: sellerStats?.activeLeads.length || 0,
                    negotiationLeadCount: sellerStats?.activeLeads.filter((l) => isNegotiationStage(l.etapa)).length || 0,
                    atRisk
                }
            })
            .filter((row) => row.atRisk)
            .sort((a, b) => {
                if (b.daysWithoutActivity !== a.daysWithoutActivity) return b.daysWithoutActivity - a.daysWithoutActivity
                if (b.negotiationLeadCount !== a.negotiationLeadCount) return b.negotiationLeadCount - a.negotiationLeadCount
                return a.name.localeCompare(b.name, 'es')
            })

        return {
            sellers,
            totalPipeline,
            adjustedForecast,
            funnel,
            activeCount: active.length,
            dataWarnings: active.filter((l) => !l.valor_estimado).length,
            executive: {
                supportAvailable: executiveSupportAvailable,
                activeCompaniesCount: executiveSupportAvailable ? activeCompaniesCountSupport : null,
                monthlyWonClosuresCount: monthClosedCount,
                adjustedForecastAmount: adjustedForecast,
                conversionRate,
                avgCycleDays,
                sellersAtRiskCount: executiveSupportAvailable ? sellersAtRisk.length : null,
                sellersAtRisk: executiveSupportAvailable ? sellersAtRisk : [],
                sellerPerformanceRows: sellers
                    .map((seller) => ({
                        sellerId: seller.sellerId,
                        name: seller.name,
                        won: seller.monthlyWonCount,
                        lost: seller.monthlyLostCount,
                        conversionRate: seller.monthlyConversionRate,
                        avgCycleDays: seller.monthlyAvgCycleDays,
                        forecastAdjusted: seller.raceForecastAdjustedValue
                    }))
                    .sort((a, b) => {
                        if (b.won !== a.won) return b.won - a.won
                        return (b.forecastAdjusted || 0) - (a.forecastAdjusted || 0)
                    })
            }
        }
    }, [leads, history, reliabilityMetricsBySellerId, sellerProfilesById, crmEvents, activeCompaniesCountSupport, executiveSupportWarning])

    if (loading && leads.length === 0) return <div className='h-full flex items-center justify-center' style={{ background: 'transparent' }}><div className='animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600'></div></div>

    const teamGoal = Math.max(...stats.sellers.map(s => s.raceRealClosedValue)) * 1.5 || 1000000
    const forecastCombinedGoal = Math.max(
        ...stats.sellers.map((s) => s.raceRealClosedValue + s.raceForecastAdjustedValue)
    ) * 1.5 || teamGoal
    const goalProgress = Math.min(100, (stats.adjustedForecast / teamGoal) * 100)
    const auditImpact = leads.length > 0 ? (stats.dataWarnings / leads.length * 100) : 0
    const rankedSellers = rankRaceItems(stats.sellers, (seller) => seller.raceRealClosedValue)

    return (
        <div className='h-full flex flex-col p-8 overflow-y-auto' style={{ background: 'transparent' }}>
            <div className='max-w-7xl mx-auto w-full space-y-10'>
                {/* Welcome Header - Executive CRM Style */}
                <div className='relative overflow-hidden p-8 md:p-10 rounded-[40px] border shadow-xl' style={{ background: 'var(--home-hero-bg)', borderColor: 'var(--home-hero-border)' }}>
                    <div className='absolute -top-24 -right-16 w-80 h-80 rounded-full blur-3xl opacity-30 pointer-events-none' style={{ background: 'var(--home-hero-glow)' }} />
                    <div className='absolute -bottom-24 -left-20 w-72 h-72 rounded-full blur-3xl opacity-15 pointer-events-none' style={{ background: 'var(--home-hero-glow)' }} />
                    <div className='absolute inset-0 pointer-events-none opacity-55' style={{ background: 'linear-gradient(125deg, transparent 0%, rgba(255,255,255,0.1) 38%, transparent 75%)' }} />

                    <div className='relative z-10 grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-8 items-center'>
                        <div className='space-y-6'>
                            <div className='flex flex-wrap items-center gap-3'>
                                <div className='inline-flex items-center gap-2.5 px-4 py-2 rounded-2xl border shadow-sm' style={{ background: 'var(--home-hero-chip-bg)', borderColor: 'var(--home-hero-chip-border)' }}>
                                    <LayoutDashboard size={14} style={{ color: 'var(--home-hero-chip-text)' }} />
                                    <span className='text-[10px] font-black uppercase tracking-[0.2em]' style={{ color: 'var(--home-hero-chip-text)' }}>
                                        Panel de Control AirHive
                                    </span>
                                </div>
                                <div className='inline-flex items-center gap-2 px-3 py-2 rounded-2xl border shadow-sm' style={{ background: 'rgba(3, 12, 34, 0.45)', borderColor: 'rgba(148, 163, 184, 0.18)' }}>
                                    <span className='h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.6)]' />
                                    <span className='text-[10px] font-black uppercase tracking-[0.18em]' style={{ color: 'var(--home-hero-muted)' }}>
                                        Operación en línea
                                    </span>
                                </div>
                            </div>

                            <div className='space-y-4'>
                                <div>
                                    <p className='text-[11px] font-black uppercase tracking-[0.22em]' style={{ color: 'var(--home-hero-muted)' }}>
                                        Resumen Ejecutivo
                                    </p>
                                    <h1 className='text-3xl md:text-5xl font-black tracking-tight leading-[0.95]' style={{ color: 'var(--home-hero-text)' }}>
                                        Bienvenido, {displayName}
                                    </h1>
                                </div>
                                <p className='text-base md:text-xl font-semibold max-w-3xl leading-relaxed' style={{ color: 'var(--home-hero-muted)' }}>
                                    Panorama comercial del día con foco en pipeline activo, forecast y calidad de captura.
                                </p>
                            </div>

                            <div className='grid grid-cols-2 md:grid-cols-4 gap-3 pt-1'>
                                <div className='px-4 py-3 rounded-2xl border backdrop-blur-sm' style={{ background: 'var(--home-hero-chip-bg)', borderColor: 'var(--home-hero-chip-border)' }}>
                                    <p className='text-[9px] font-black uppercase tracking-[0.2em]' style={{ color: 'var(--home-hero-muted)' }}>Leads Activos</p>
                                    <p className='text-xl font-black tabular-nums' style={{ color: 'var(--home-hero-text)' }}>{stats.activeCount}</p>
                                </div>
                                <div className='px-4 py-3 rounded-2xl border backdrop-blur-sm' style={{ background: 'var(--home-hero-chip-bg)', borderColor: 'var(--home-hero-chip-border)' }}>
                                    <p className='text-[9px] font-black uppercase tracking-[0.2em]' style={{ color: 'var(--home-hero-muted)' }}>Sin Valor</p>
                                    <p className='text-xl font-black tabular-nums' style={{ color: 'var(--home-hero-text)' }}>{stats.dataWarnings}</p>
                                </div>
                                <div className='px-4 py-3 rounded-2xl border backdrop-blur-sm' style={{ background: 'var(--home-hero-chip-bg)', borderColor: 'var(--home-hero-chip-border)' }}>
                                    <p className='text-[9px] font-black uppercase tracking-[0.2em]' style={{ color: 'var(--home-hero-muted)' }}>Forecast</p>
                                    <p className='text-xl font-black tabular-nums' style={{ color: 'var(--home-hero-text)' }}>{goalProgress.toFixed(0)}%</p>
                                </div>
                                <div className='px-4 py-3 rounded-2xl border backdrop-blur-sm' style={{ background: 'var(--home-hero-chip-bg)', borderColor: 'var(--home-hero-chip-border)' }}>
                                    <p className='text-[9px] font-black uppercase tracking-[0.2em]' style={{ color: 'var(--home-hero-muted)' }}>Meta Equipo</p>
                                    <p className='text-lg font-black tabular-nums truncate' style={{ color: 'var(--home-hero-text)' }}>
                                        ${teamGoal.toLocaleString('es-MX', { maximumFractionDigits: 0 })}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className='relative w-full xl:w-[380px] rounded-[30px] border p-5 md:p-6 shadow-lg overflow-hidden' style={{ background: 'var(--home-hero-panel-bg)', borderColor: 'var(--home-hero-panel-border)' }}>
                            <div className='absolute inset-x-0 top-0 h-px opacity-60' style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)' }} />
                            <div className='flex items-center justify-between mb-4'>
                                <p className='text-[10px] font-black uppercase tracking-[0.2em]' style={{ color: 'var(--home-hero-muted)' }}>
                                    Pipeline Estratégico
                                </p>
                                <TrendingUp size={17} style={{ color: 'var(--home-hero-text)' }} />
                            </div>
                            <p className='text-4xl md:text-5xl font-black tracking-tight tabular-nums mb-5' style={{ color: 'var(--home-hero-text)' }}>
                                ${stats.totalPipeline.toLocaleString('es-MX')}
                            </p>

                            <div className='space-y-2'>
                                <div className='flex items-center justify-between'>
                                    <span className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--home-hero-muted)' }}>
                                        Avance del forecast
                                    </span>
                                    <span className='text-sm font-black tabular-nums' style={{ color: 'var(--home-hero-text)' }}>
                                        {goalProgress.toFixed(0)}%
                                    </span>
                                </div>
                                <div className='h-2.5 rounded-full overflow-hidden' style={{ background: 'rgba(15, 23, 42, 0.65)' }}>
                                    <div
                                        className='h-full rounded-full transition-all duration-700'
                                        style={{ width: `${goalProgress}%`, background: 'linear-gradient(90deg, #60a5fa 0%, #22d3ee 100%)' }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Executive KPI Board */}
                <div className='space-y-4'>
                    <div className='flex items-center justify-between gap-3'>
                        <div>
                            <h2 className='text-lg font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>Dashboard Ejecutivo</h2>
                            <p className='text-[10px] font-black uppercase tracking-[0.18em]' style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                                Señales de dirección para decidir hoy
                            </p>
                        </div>
                        <a
                            href='/cierres'
                            className='inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-[0.15em] transition-all hover:brightness-110 cursor-pointer'
                            style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                        >
                            Ver Cierres
                            <ChevronRight size={14} />
                        </a>
                    </div>

                    {executiveSupportWarning && (
                        <div className='rounded-2xl border px-4 py-3 text-xs font-semibold'
                            style={{
                                background: 'color-mix(in srgb, #f59e0b 8%, var(--card-bg))',
                                borderColor: 'color-mix(in srgb, #f59e0b 22%, var(--card-border))',
                                color: 'var(--text-secondary)'
                            }}>
                            Algunas señales ejecutivas (empresas activas / vendedores en riesgo) no están disponibles en esta sesión: {executiveSupportWarning}
                        </div>
                    )}

                    <div className='grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4'>
                        <div className='rounded-[24px] border p-5 shadow-sm' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                            <div className='flex items-center justify-between mb-2'>
                                <p className='text-[10px] font-black uppercase tracking-[0.18em]' style={{ color: 'var(--text-secondary)', opacity: 0.75 }}>Empresas activas</p>
                                <Building2 size={16} className='text-emerald-400' />
                            </div>
                            <p className='text-3xl font-black tabular-nums' style={{ color: 'var(--text-primary)' }}>
                                {stats.executive.activeCompaniesCount == null ? '—' : stats.executive.activeCompaniesCount}
                            </p>
                            <p className='text-[11px] font-semibold mt-1' style={{ color: 'var(--text-secondary)' }}>
                                Con proyecto implementado real
                            </p>
                        </div>

                        <div className='rounded-[24px] border p-5 shadow-sm' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                            <div className='flex items-center justify-between mb-2'>
                                <p className='text-[10px] font-black uppercase tracking-[0.18em]' style={{ color: 'var(--text-secondary)', opacity: 0.75 }}>Cierres del mes</p>
                                <Target size={16} className='text-emerald-400' />
                            </div>
                            <p className='text-3xl font-black tabular-nums' style={{ color: 'var(--text-primary)' }}>{stats.executive.monthlyWonClosuresCount}</p>
                            <p className='text-[11px] font-semibold mt-1' style={{ color: 'var(--text-secondary)' }}>
                                Cerrado ganado con fecha real
                            </p>
                        </div>

                        <div className='rounded-[24px] border p-5 shadow-sm' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                            <div className='flex items-center justify-between mb-2'>
                                <p className='text-[10px] font-black uppercase tracking-[0.18em]' style={{ color: 'var(--text-secondary)', opacity: 0.75 }}>Forecast ajustado</p>
                                <Zap size={16} className='text-cyan-300' />
                            </div>
                            <p className='text-3xl font-black tabular-nums truncate' style={{ color: 'var(--text-primary)' }}>
                                ${stats.executive.adjustedForecastAmount.toLocaleString('es-MX', { maximumFractionDigits: 0 })}
                            </p>
                            <p className='text-[11px] font-semibold mt-1' style={{ color: 'var(--text-secondary)' }}>
                                Negociación ponderada por confiabilidad
                            </p>
                        </div>

                        <div className='rounded-[24px] border p-5 shadow-sm' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                            <div className='flex items-center justify-between mb-2'>
                                <p className='text-[10px] font-black uppercase tracking-[0.18em]' style={{ color: 'var(--text-secondary)', opacity: 0.75 }}>Tasa de conversión</p>
                                <Percent size={16} className='text-blue-300' />
                            </div>
                            <p className='text-3xl font-black tabular-nums' style={{ color: 'var(--text-primary)' }}>
                                {stats.executive.conversionRate.toFixed(0)}%
                            </p>
                            <p className='text-[11px] font-semibold mt-1' style={{ color: 'var(--text-secondary)' }}>
                                Ganados / cerrados del mes
                            </p>
                        </div>

                        <div className='rounded-[24px] border p-5 shadow-sm' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                            <div className='flex items-center justify-between mb-2'>
                                <p className='text-[10px] font-black uppercase tracking-[0.18em]' style={{ color: 'var(--text-secondary)', opacity: 0.75 }}>Ciclo promedio</p>
                                <Clock3 size={16} className='text-amber-300' />
                            </div>
                            <p className='text-3xl font-black tabular-nums' style={{ color: 'var(--text-primary)' }}>
                                {stats.executive.avgCycleDays > 0 ? `${Math.round(stats.executive.avgCycleDays)}d` : '—'}
                            </p>
                            <p className='text-[11px] font-semibold mt-1' style={{ color: 'var(--text-secondary)' }}>
                                De alta a cierre ganado (mes)
                            </p>
                        </div>

                        <div className='rounded-[24px] border p-5 shadow-sm' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                            <div className='flex items-center justify-between mb-2'>
                                <p className='text-[10px] font-black uppercase tracking-[0.18em]' style={{ color: 'var(--text-secondary)', opacity: 0.75 }}>Vendedores en riesgo</p>
                                <ShieldAlert size={16} className={(stats.executive.sellersAtRiskCount ?? 0) > 0 ? 'text-rose-300' : 'text-emerald-300'} />
                            </div>
                            <p className='text-3xl font-black tabular-nums' style={{ color: 'var(--text-primary)' }}>
                                {stats.executive.sellersAtRiskCount == null ? '—' : stats.executive.sellersAtRiskCount}
                            </p>
                            <p className='text-[11px] font-semibold mt-1' style={{ color: 'var(--text-secondary)' }}>
                                Sin actividad operativa en 7 días
                            </p>
                        </div>
                    </div>
                </div>

                {/* Main Content Sections */}
                <div className='grid grid-cols-1 xl:grid-cols-3 gap-8'>
                    {/* Left & Middle: Sales Performance */}
                    <div className='xl:col-span-2 space-y-8'>
                        {/* Personal Agenda - New for Admins */}
                        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                            <UpcomingMeetingsWidget />
                            <MyTasksWidget />
                        </div>

                        <SellerRace
                            maxGoal={teamGoal}
                            sellers={stats.sellers.map(s => ({
                                name: s.name,
                                value: s.raceRealClosedValue,
                                percentage: (s.raceRealClosedValue / teamGoal) * 100,
                                reliability: s.score
                            }))}
                            forecastRace={{
                                maxGoal: forecastCombinedGoal,
                                title: 'Carrera de Pronóstico Ajustado',
                                subtitle: 'Cierres reales del mes + pronóstico mensual ajustado con confiabilidad de probabilidad, valor y fecha',
                                sellers: stats.sellers.map((s) => ({
                                    name: s.name,
                                    value: s.raceRealClosedValue + s.raceForecastAdjustedValue,
                                    percentage: ((s.raceRealClosedValue + s.raceForecastAdjustedValue) / forecastCombinedGoal) * 100,
                                    reliability: s.raceForecastAdjustedReliability,
                                    rawValueBeforeAdjustment: s.raceRealClosedValue + s.raceForecastValue
                                }))
                            }}
                            subtitle='Cierres reales ganados del mes (fecha real de cierre) vs meta de equipo'
                        />

                        <div className='rounded-[32px] border shadow-sm overflow-hidden' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                            <div className='px-6 py-5 border-b flex items-center justify-between gap-3' style={{ borderColor: 'var(--card-border)' }}>
                                <div>
                                    <h3 className='text-sm font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>
                                        Rendimiento por Vendedor (Mes)
                                    </h3>
                                    <p className='text-[10px] font-black uppercase tracking-[0.18em]' style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                                        Cierres, conversión, ciclo y forecast ajustado
                                    </p>
                                </div>
                                <div className='inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-[0.15em]'
                                    style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)', color: 'var(--text-secondary)' }}>
                                    <Activity size={14} />
                                    Señales
                                </div>
                            </div>

                            <div className='overflow-x-auto'>
                                <table className='w-full min-w-[760px]'>
                                    <thead>
                                        <tr className='text-left'>
                                            {['Vendedor', 'Ganados', 'Perdidos', 'Conversión', 'Ciclo Prom.', 'Forecast Ajustado'].map((col) => (
                                                <th key={col} className='px-6 py-3 text-[10px] font-black uppercase tracking-[0.18em]'
                                                    style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
                                                    {col}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {stats.executive.sellerPerformanceRows.map((row, idx) => (
                                            <tr key={`exec-seller-row-${row.sellerId || row.name}-${idx}`} className='border-t'
                                                style={{ borderColor: 'var(--card-border)' }}>
                                                <td className='px-6 py-4'>
                                                    <div className='flex items-center gap-3'>
                                                        <div className='w-8 h-8 rounded-xl border flex items-center justify-center text-[10px] font-black'
                                                            style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}>
                                                            {String(row.name || 'U').slice(0, 1).toUpperCase()}
                                                        </div>
                                                        <span className='text-sm font-black' style={{ color: 'var(--text-primary)' }}>{row.name}</span>
                                                    </div>
                                                </td>
                                                <td className='px-6 py-4 text-sm font-black tabular-nums text-emerald-300'>{row.won}</td>
                                                <td className='px-6 py-4 text-sm font-black tabular-nums text-rose-300'>{row.lost}</td>
                                                <td className='px-6 py-4 text-sm font-black tabular-nums' style={{ color: 'var(--text-primary)' }}>
                                                    {row.conversionRate == null ? '—' : `${row.conversionRate.toFixed(0)}%`}
                                                </td>
                                                <td className='px-6 py-4 text-sm font-black tabular-nums' style={{ color: 'var(--text-primary)' }}>
                                                    {row.avgCycleDays == null ? '—' : `${Math.round(row.avgCycleDays)}d`}
                                                </td>
                                                <td className='px-6 py-4 text-sm font-black tabular-nums text-cyan-300'>
                                                    ${row.forecastAdjusted.toLocaleString('es-MX', { maximumFractionDigits: 0 })}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                    </div>

                    {/* Right: Insights & Pipeline */}
                    <div className='xl:col-span-1 space-y-8'>
                        <PipelineVisualizer data={stats.funnel} />

                        <div className='rounded-[32px] border shadow-sm overflow-hidden' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                            <div className='px-6 py-5 border-b flex items-center justify-between gap-3' style={{ borderColor: 'var(--card-border)' }}>
                                <div>
                                    <h4 className='text-sm font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>Señales de Dirección</h4>
                                    <p className='text-[10px] font-black uppercase tracking-[0.18em]' style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                                        Riesgo operativo y calidad de captura
                                    </p>
                                </div>
                                <ShieldAlert size={16} className={(stats.executive.sellersAtRiskCount ?? 0) > 0 ? 'text-rose-300' : 'text-emerald-300'} />
                            </div>

                            <div className='p-6 space-y-5'>
                                <div className='rounded-2xl border p-4' style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}>
                                    <div className='flex items-center justify-between gap-3 mb-2'>
                                        <p className='text-[10px] font-black uppercase tracking-[0.16em]' style={{ color: 'var(--text-secondary)', opacity: 0.75 }}>
                                            Vendedores en riesgo (7d)
                                        </p>
                                        <span className='text-xs font-black tabular-nums' style={{ color: (stats.executive.sellersAtRiskCount ?? 0) > 0 ? '#fda4af' : '#86efac' }}>
                                            {stats.executive.sellersAtRiskCount == null ? '—' : stats.executive.sellersAtRiskCount}
                                        </span>
                                    </div>

                                    {stats.executive.sellersAtRiskCount == null ? (
                                        <p className='text-xs font-semibold' style={{ color: 'var(--text-secondary)' }}>
                                            Riesgo no disponible en esta sesión (soporte ejecutivo sin acceso).
                                        </p>
                                    ) : stats.executive.sellersAtRisk.length === 0 ? (
                                        <p className='text-xs font-semibold' style={{ color: 'var(--text-secondary)' }}>
                                            Sin vendedores en riesgo detectados en los últimos 7 días.
                                        </p>
                                    ) : (
                                        <div className='space-y-2'>
                                            {stats.executive.sellersAtRisk.slice(0, 4).map((seller) => (
                                                <div key={`risk-${seller.sellerId}`} className='flex items-center justify-between gap-3 rounded-xl px-3 py-2 border'
                                                    style={{ background: 'rgba(15,23,42,0.35)', borderColor: 'rgba(148,163,184,0.12)' }}>
                                                    <div className='min-w-0'>
                                                        <p className='text-xs font-black truncate' style={{ color: 'var(--text-primary)' }}>{seller.name}</p>
                                                        <p className='text-[10px] font-bold uppercase tracking-wider' style={{ color: 'var(--text-secondary)', opacity: 0.75 }}>
                                                            {seller.negotiationLeadCount} negociación · {seller.activeLeadCount} activos
                                                        </p>
                                                    </div>
                                                    <div className='text-right shrink-0'>
                                                        <p className='text-xs font-black tabular-nums text-rose-300'>{seller.daysWithoutActivity}d</p>
                                                        <p className='text-[9px] font-bold uppercase tracking-wider' style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                                                            sin actividad
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className='rounded-2xl border p-4' style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}>
                                    <div className='flex items-center justify-between gap-3 mb-2'>
                                        <p className='text-[10px] font-black uppercase tracking-[0.16em]' style={{ color: 'var(--text-secondary)', opacity: 0.75 }}>
                                            Calidad de pipeline
                                        </p>
                                        <AlertCircle size={14} className='text-amber-300' />
                                    </div>
                                    <p className='text-sm font-semibold leading-relaxed' style={{ color: 'var(--text-secondary)' }}>
                                        Hay <strong style={{ color: 'var(--text-primary)' }}>{stats.dataWarnings}</strong> leads sin valor estimado.
                                        Corregirlos puede mejorar la precisión del forecast en aproximadamente <strong style={{ color: 'var(--text-primary)' }}>{auditImpact.toFixed(0)}%</strong>.
                                    </p>
                                    <div className='mt-3 flex flex-wrap gap-2'>
                                        <a
                                            href='/clientes'
                                            className='px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-[0.15em] transition-all hover:brightness-110'
                                            style={{ background: 'rgba(59,130,246,0.08)', borderColor: 'rgba(59,130,246,0.24)', color: '#93c5fd' }}
                                        >
                                            Revisar leads activos
                                        </a>
                                        <a
                                            href='/cierres'
                                            className='px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-[0.15em] transition-all hover:brightness-110'
                                            style={{ background: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.24)', color: '#86efac' }}
                                        >
                                            Revisar cierres
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

function SellerHomeView({ displayName }: { displayName: string }) {
    const [supabase] = useState(() => createClient())
    const [stats, setStats] = useState({ activeLeads: 0, negotiationLeads: 0, totalValue: 0 })
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchStats = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data: leads } = await (supabase
                .from('clientes') as any)
                .select('*')
                .eq('owner_id', user.id)

            if (leads) {
                const active = leads.filter((l: any) => !l.etapa?.toLowerCase().includes('cerrado'))
                const negotiation = leads.filter((l: any) => l.etapa === 'Negociación')
                const totalValue = negotiation.reduce((acc: number, l: any) => acc + ((l.probabilidad || 0) / 100 * (l.valor_estimado || 0)), 0)

                setStats({
                    activeLeads: active.length,
                    negotiationLeads: negotiation.length,
                    totalValue
                })
            }
            setLoading(false)
        }
        fetchStats()
    }, [supabase])

    if (loading) {
        return (
            <div className='h-full flex items-center justify-center' style={{ background: 'transparent' }}>
                <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600'></div>
            </div>
        )
    }

    return (
        <div className='h-full flex flex-col p-8 overflow-y-auto' style={{ background: 'transparent' }}>
            <div className='max-w-7xl mx-auto w-full space-y-8'>
                {/* Welcome Header */}
                <div className='relative overflow-hidden p-8 rounded-[34px] border shadow-xl' style={{ background: 'var(--home-hero-bg)', borderColor: 'var(--home-hero-border)' }}>
                    <div className='absolute -top-20 -right-12 w-64 h-64 rounded-full blur-3xl opacity-30 pointer-events-none' style={{ background: 'var(--home-hero-glow)' }} />
                    <div className='absolute inset-0 pointer-events-none opacity-40' style={{ background: 'linear-gradient(120deg, transparent 0%, rgba(32,72,255,0.08) 45%, transparent 80%)' }} />

                    <div className='relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6'>
                        <div className='space-y-3'>
                            <div className='inline-flex items-center gap-2.5 px-3.5 py-2 rounded-2xl border' style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}>
                                <LayoutDashboard size={14} style={{ color: 'var(--accent-secondary)' }} />
                                <span className='text-[10px] font-black uppercase tracking-[0.2em]' style={{ color: 'var(--text-secondary)' }}>
                                    Resumen de operación
                                </span>
                            </div>

                            <h1 className='text-4xl font-black tracking-tight leading-none' style={{ color: 'var(--text-primary)' }}>
                                Bienvenido, {displayName}
                            </h1>
                            <p className='text-lg font-semibold' style={{ color: 'var(--text-secondary)' }}>
                                Aquí tienes tu estado comercial del día.
                            </p>
                        </div>

                        <div className='grid grid-cols-2 gap-3 min-w-[300px]'>
                            <div className='rounded-2xl border px-4 py-3' style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}>
                                <p className='text-[9px] font-black uppercase tracking-[0.2em]' style={{ color: 'var(--text-secondary)' }}>Activos</p>
                                <p className='text-2xl font-black tabular-nums' style={{ color: 'var(--text-primary)' }}>{stats.activeLeads}</p>
                            </div>
                            <div className='rounded-2xl border px-4 py-3' style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}>
                                <p className='text-[9px] font-black uppercase tracking-[0.2em]' style={{ color: 'var(--text-secondary)' }}>Negociación</p>
                                <p className='text-2xl font-black tabular-nums' style={{ color: 'var(--accent-secondary)' }}>{stats.negotiationLeads}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Stats Cards */}
                <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
                    <div className='p-6 rounded-2xl shadow-sm border' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                        <label className='text-xs font-bold uppercase tracking-wider' style={{ color: 'var(--text-secondary)' }}>Leads Activos</label>
                        <p className='text-4xl font-black mt-2' style={{ color: 'var(--text-primary)' }}>{stats.activeLeads}</p>
                        <p className='text-xs mt-1' style={{ color: 'var(--text-secondary)' }}>En tu pipeline</p>
                    </div>

                    <div className='p-6 rounded-2xl shadow-sm border' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                        <label className='text-xs font-bold uppercase tracking-wider' style={{ color: 'var(--text-secondary)' }}>En Negociación</label>
                        <p className='text-4xl font-black text-amber-600 mt-2'>{stats.negotiationLeads}</p>
                        <p className='text-xs mt-1' style={{ color: 'var(--text-secondary)' }}>Requieren seguimiento</p>
                    </div>

                    <div className='p-6 rounded-2xl shadow-sm border' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                        <label className='text-xs font-bold uppercase tracking-wider' style={{ color: 'var(--text-secondary)' }}>Forecast Ponderado</label>
                        <p className='text-4xl font-black text-emerald-600 mt-2'>
                            ${stats.totalValue.toLocaleString('es-MX', { maximumFractionDigits: 0 })}
                        </p>
                        <p className='text-xs mt-1' style={{ color: 'var(--text-secondary)' }}>Valor esperado</p>
                    </div>
                </div>

                {/* Main Content Grid */}
                <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
                    {/* Left Column - Upcoming Meetings */}
                    <div className='lg:col-span-1'>
                        <UpcomingMeetingsWidget />
                    </div>

                    {/* Right Column - Quick Actions */}
                    <div className='lg:col-span-2 space-y-6'>
                        <div className='p-6 rounded-2xl shadow-sm border' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                            <h2 className='text-lg font-bold mb-4' style={{ color: 'var(--text-primary)' }}>
                                🎯 Acciones Rápidas
                            </h2>
                            <div className='grid grid-cols-2 gap-4'>
                                <a
                                    href='/clientes'
                                    className='p-4 rounded-xl transition-all border-2 hover:scale-105'
                                    style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}
                                >
                                    <p className='font-bold mb-1 text-blue-600'>📊 Ver Leads</p>
                                    <p className='text-xs' style={{ color: 'var(--text-secondary)' }}>Gestiona tu pipeline</p>
                                </a>
                                <a
                                    href='/calendario'
                                    className='p-4 rounded-xl transition-all border-2 hover:scale-105'
                                    style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}
                                >
                                    <p className='font-bold mb-1 text-purple-600'>📅 Calendario</p>
                                    <p className='text-xs' style={{ color: 'var(--text-secondary)' }}>Ver todas las juntas</p>
                                </a>
                                <a
                                    href='/empresas'
                                    className='p-4 rounded-xl transition-all border-2 hover:scale-105'
                                    style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}
                                >
                                    <p className='font-bold mb-1 text-emerald-600'>🏢 Empresas</p>
                                    <p className='text-xs' style={{ color: 'var(--text-secondary)' }}>Gestionar cuentas</p>
                                </a>
                                <a
                                    href='/tareas'
                                    className='p-4 rounded-xl transition-all border-2 hover:scale-105'
                                    style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}
                                >
                                    <p className='font-bold mb-1 text-amber-600'>✅ Tareas</p>
                                    <p className='text-xs' style={{ color: 'var(--text-secondary)' }}>Seguimiento diario</p>
                                </a>
                            </div>
                        </div>

                        <div className='p-6 rounded-2xl border-2' style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}>
                            <h3 className='text-lg font-bold mb-2' style={{ color: 'var(--text-primary)' }}>
                                💡 Tip del Día
                            </h3>
                            <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>
                                Recuerda actualizar la probabilidad de cierre de tus leads en <strong>Negociación</strong> antes de cada junta.
                                El sistema congelará automáticamente el pronóstico al inicio de la reunión.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default function HomePage() {
    const auth = useAuth()
    const isAdmin = auth.profile?.role === 'admin'
    const displayName = formatUserDisplayName(auth.profile?.full_name || auth.username || auth.user?.email || 'Usuario')

    // Only block if we are loading AND don't have a session
    if (auth.loading && !auth.loggedIn) return <div className='h-full flex items-center justify-center' style={{ background: 'transparent' }}><div className='animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600'></div></div>

    if (isAdmin) {
        return <AdminDashboardView displayName={displayName} />
    }

    return <SellerHomeView displayName={displayName} />
}
