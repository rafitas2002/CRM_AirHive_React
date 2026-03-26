'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { createClient } from '@/lib/supabase'
import type { Database } from '@/lib/supabase'
import { Handshake, Building2, ChevronDown, Search, ShieldCheck, XCircle, TrendingDown, AlertTriangle, BarChart3 } from 'lucide-react'
import TableEmployeeAvatar from '@/components/TableEmployeeAvatar'
import RichardDawkinsFooter from '@/components/RichardDawkinsFooter'
import AdminCompanyDetailView from '@/components/AdminCompanyDetailView'
import ClientDetailView from '@/components/ClientDetailView'
import CompanyModal, { type CompanyData } from '@/components/CompanyModal'
import { useAuth } from '@/lib/auth'
import { useTheme } from '@/lib/ThemeContext'
import { buildSemanticToneCssVars, getSemanticTonePalette, type UiToneLane } from '@/lib/semanticUiTones'
import { getLeadLossAnalyticsSupportData, type LeadLossAnalyticsRow } from '@/app/actions/lossAnalytics'
import { getCommercialMetricDefinition } from '@/lib/metricsDefinitions'
import { normalizeCompanySizeConfidenceValue, normalizeCompanySizeSourceValue } from '@/lib/companySizeUtils'

type LeadRow = Database['public']['Tables']['clientes']['Row']

type ClosedCompanyRow = {
    companyKey: string
    empresaId: string | null
    empresaNombre: string
    ownerIds: string[]
    ownerNames: string[]
    wonLeadsCount: number
    latestWonLeadName: string
    latestWonLeadId: number | null
    latestWonDate: string | null
    activeProjectsCount: number
}

type LossPeriodPreset = 'month' | '30d' | 'quarter' | 'all'

type LossAnalyticsKpi = {
    lostCount: number
    monthlyLostValue: number
    implementationLostValue: number
    totalLostValue: number
    topReasonLabel: string
    unclassifiedPct: number
    avgCycleDays: number | null
}

type LossAnalyticsTrendRow = {
    monthKey: string
    label: string
    lostCount: number
    totalLostValue: number
}

const LOSS_ANALYTICS_METRICS = {
    lostCount: getCommercialMetricDefinition('loss_lost_count'),
    monthlyLostValue: getCommercialMetricDefinition('loss_monthly_value'),
    implementationLostValue: getCommercialMetricDefinition('loss_implementation_value'),
    totalLostValue: getCommercialMetricDefinition('loss_total_estimated_value'),
    topReason: getCommercialMetricDefinition('loss_top_reason'),
    unclassifiedPct: getCommercialMetricDefinition('loss_unclassified_pct'),
    avgCycleDays: getCommercialMetricDefinition('loss_avg_cycle_days')
} as const

function isWonStage(stage: unknown) {
    const normalized = String(stage || '').trim().toLowerCase()
    return normalized === 'cerrado ganado' || normalized === 'cerrada ganada'
}

function isLostStage(stage: unknown) {
    const normalized = String(stage || '').trim().toLowerCase()
    return normalized === 'cerrado perdido' || normalized === 'cerrada perdida'
}

function formatSellerDisplayName(raw?: string | null) {
    const value = String(raw || '').trim()
    if (!value) return 'Sin asignar'
    if (value.includes('.')) {
        return value
            .split('.')
            .filter(Boolean)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
            .join(' ')
    }
    return value
}

function formatDate(value?: string | null) {
    if (!value) return '-'
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return '-'
    return d.toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatCurrency(value?: number | null) {
    if (value == null || Number.isNaN(Number(value))) return '$0'
    return `$${Number(value).toLocaleString('es-MX')}`
}

function formatPercent(value?: number | null) {
    if (value == null || Number.isNaN(Number(value))) return '0%'
    return `${Math.round(Number(value))}%`
}

function parseSupabaseError(error: any, fallback: string) {
    const message = String(error?.message || '').trim()
    if (!message) return fallback
    if (message.toLowerCase().includes('duplicate key')) return 'Ya existe un registro con ese nombre.'
    return message
}

function getLossReferenceDate(row: Pick<LeadLossAnalyticsRow, 'closed_at_real' | 'loss_recorded_at' | 'fecha_registro' | 'created_at'>) {
    return row.closed_at_real || row.loss_recorded_at || row.fecha_registro || row.created_at || null
}

function getPeriodRange(preset: LossPeriodPreset) {
    if (preset === 'all') return null
    const now = new Date()
    const end = new Date(now)
    end.setHours(23, 59, 59, 999)
    const start = new Date(now)
    if (preset === '30d') {
        start.setDate(start.getDate() - 29)
        start.setHours(0, 0, 0, 0)
        return { start, end }
    }
    if (preset === 'quarter') {
        start.setMonth(start.getMonth() - 2, 1)
        start.setHours(0, 0, 0, 0)
        return { start, end }
    }
    start.setDate(1)
    start.setHours(0, 0, 0, 0)
    return { start, end }
}

function getPreviousPeriodRange(preset: LossPeriodPreset) {
    if (preset === 'all') return null
    const current = getPeriodRange(preset)
    if (!current) return null

    if (preset === '30d') {
        const end = new Date(current.start)
        end.setMilliseconds(end.getMilliseconds() - 1)
        const start = new Date(end)
        start.setDate(start.getDate() - 29)
        start.setHours(0, 0, 0, 0)
        return { start, end }
    }

    if (preset === 'quarter') {
        const end = new Date(current.start)
        end.setMilliseconds(end.getMilliseconds() - 1)
        const start = new Date(current.start)
        start.setMonth(start.getMonth() - 3, 1)
        start.setHours(0, 0, 0, 0)
        return { start, end }
    }

    const end = new Date(current.start)
    end.setMilliseconds(end.getMilliseconds() - 1)
    const start = new Date(current.start)
    start.setMonth(start.getMonth() - 1, 1)
    start.setHours(0, 0, 0, 0)
    return { start, end }
}

function formatSignedPercent(value: number | null) {
    if (value == null || !Number.isFinite(value)) return '—'
    const rounded = Math.round(value)
    if (rounded === 0) return '0%'
    return `${rounded > 0 ? '+' : ''}${rounded}%`
}

function calculateLossAnalyticsKpis(rows: LeadLossAnalyticsRow[]): LossAnalyticsKpi {
    if (rows.length === 0) {
        return {
            lostCount: 0,
            monthlyLostValue: 0,
            implementationLostValue: 0,
            totalLostValue: 0,
            topReasonLabel: 'Sin datos',
            unclassifiedPct: 0,
            avgCycleDays: null
        }
    }

    let monthlyLostValue = 0
    let implementationLostValue = 0
    let unclassified = 0
    const reasonCounts = new Map<string, { label: string; count: number }>()
    let cycleDaysTotal = 0
    let cycleDaysCount = 0

    rows.forEach((row) => {
        monthlyLostValue += Number(row.valor_estimado || 0)
        implementationLostValue += Number(row.valor_implementacion_estimado || 0)
        const reasonKey = String(row.loss_reason_id || 'sin-clasificar')
        const reasonLabel = String(row.loss_reason_label || 'Sin clasificar')
        const current = reasonCounts.get(reasonKey) || { label: reasonLabel, count: 0 }
        current.count += 1
        reasonCounts.set(reasonKey, current)

        if (!row.loss_reason_id || !row.loss_subreason_id) unclassified += 1

        const startRaw = row.fecha_registro || row.created_at || null
        const endRaw = getLossReferenceDate(row)
        if (startRaw && endRaw) {
            const startMs = new Date(startRaw).getTime()
            const endMs = new Date(endRaw).getTime()
            if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) {
                cycleDaysTotal += Math.round((endMs - startMs) / (1000 * 60 * 60 * 24))
                cycleDaysCount += 1
            }
        }
    })

    const topReason = Array.from(reasonCounts.values()).sort((a, b) => b.count - a.count)[0]
    const totalLostValue = monthlyLostValue + implementationLostValue

    return {
        lostCount: rows.length,
        monthlyLostValue,
        implementationLostValue,
        totalLostValue,
        topReasonLabel: topReason?.label || 'Sin datos',
        unclassifiedPct: (unclassified / Math.max(1, rows.length)) * 100,
        avgCycleDays: cycleDaysCount > 0 ? (cycleDaysTotal / cycleDaysCount) : null
    }
}

export default function ClosedCompaniesPage() {
    const auth = useAuth()
    const { theme } = useTheme()
    const [supabase] = useState(() => createClient())
    const [loading, setLoading] = useState(true)
    const [allLeads, setAllLeads] = useState<LeadRow[]>([])
    const [search, setSearch] = useState('')
    const [sellerProfilesById, setSellerProfilesById] = useState<Record<string, { fullName?: string | null; avatarUrl?: string | null }>>({})
    const [activeProjectCountByCompanyId, setActiveProjectCountByCompanyId] = useState<Record<string, number>>({})
    const [lostLeadsOpen, setLostLeadsOpen] = useState(false)
    const [selectedCompany, setSelectedCompany] = useState<CompanyData | null>(null)
    const [isCompanyDetailOpen, setIsCompanyDetailOpen] = useState(false)
    const [loadingCompanyDetail, setLoadingCompanyDetail] = useState(false)
    const [companyDetailError, setCompanyDetailError] = useState<string | null>(null)
    const [isCompanyEditModalOpen, setIsCompanyEditModalOpen] = useState(false)
    const [lossAnalyticsRows, setLossAnalyticsRows] = useState<LeadLossAnalyticsRow[]>([])
    const [lossAnalyticsLoading, setLossAnalyticsLoading] = useState(true)
    const [lossAnalyticsError, setLossAnalyticsError] = useState<string | null>(null)
    const [lossPeriodPreset, setLossPeriodPreset] = useState<LossPeriodPreset>('month')
    const [lossSellerFilter, setLossSellerFilter] = useState<string>('all')
    const [lossIndustryFilter, setLossIndustryFilter] = useState<string>('all')
    const [lossSizeFilter, setLossSizeFilter] = useState<string>('all')
    const [lossReasonFilter, setLossReasonFilter] = useState<string>('all')
    const [lossSubreasonFilter, setLossSubreasonFilter] = useState<string>('all')
    const [lossAnalyticsGeneratedAt, setLossAnalyticsGeneratedAt] = useState<string | null>(null)
    const [lossAnalyticsScope, setLossAnalyticsScope] = useState<'all' | 'own'>('all')
    const [lossSellerOptions, setLossSellerOptions] = useState<Array<{ id: string; label: string }>>([])
    const [lossIndustryOptions, setLossIndustryOptions] = useState<Array<{ label: string }>>([])
    const [lossReasonOptions, setLossReasonOptions] = useState<Array<{ id: string; label: string }>>([])
    const [lossSubreasonOptions, setLossSubreasonOptions] = useState<Array<{ id: string; reason_id: string | null; label: string }>>([])
    const [selectedLossLead, setSelectedLossLead] = useState<LeadRow | null>(null)
    const [isLossLeadDetailOpen, setIsLossLeadDetailOpen] = useState(false)
    const toneVars = (lane: UiToneLane): CSSProperties => buildSemanticToneCssVars(getSemanticTonePalette(lane, theme)) as CSSProperties
    const toneChipClassName = 'border shadow-sm [background:var(--tone-chip-bg)] [border-color:var(--tone-chip-border)] [color:var(--tone-chip-text)]'
    const tonePanelClassName = 'border [background:var(--tone-panel-bg)] [border-color:var(--tone-panel-border)] [color:var(--tone-panel-text)]'

    useEffect(() => {
        let cancelled = false
        const load = async () => {
            setLoading(true)
            try {
                const { data: leadsData } = await supabase
                    .from('clientes')
                    .select('*')
                    .order('created_at', { ascending: false })

                if (cancelled) return
                const leads = (leadsData || []) as LeadRow[]
                setAllLeads(leads)

                const ownerIds = Array.from(new Set(leads.map((l: any) => String(l?.owner_id || '')).filter(Boolean)))
                if (ownerIds.length > 0) {
                    const { data: profiles } = await (supabase.from('profiles') as any)
                        .select('id, full_name, avatar_url')
                        .in('id', ownerIds)

                    if (cancelled) return
                    const nextProfiles: Record<string, { fullName?: string | null; avatarUrl?: string | null }> = {}
                    ;((profiles || []) as any[]).forEach((row) => {
                        const id = String(row?.id || '')
                        if (!id) return
                        nextProfiles[id] = {
                            fullName: row?.full_name || null,
                            avatarUrl: row?.avatar_url || null
                        }
                    })
                    setSellerProfilesById(nextProfiles)
                } else {
                    setSellerProfilesById({})
                }

                const wonCompanyIds = Array.from(new Set(
                    leads.filter((l) => isWonStage(l.etapa)).map((l: any) => String(l?.empresa_id || '')).filter(Boolean)
                ))

                if (wonCompanyIds.length > 0) {
                    const { data: assignments } = await (supabase
                        .from('empresa_proyecto_asignaciones') as any)
                        .select('empresa_id, proyecto_id')
                        .eq('assignment_stage', 'implemented_real')
                        .in('empresa_id', wonCompanyIds)

                    if (cancelled) return
                    const map: Record<string, Set<string>> = {}
                    ;((assignments || []) as any[]).forEach((row) => {
                        const empresaId = String(row?.empresa_id || '')
                        const proyectoId = String(row?.proyecto_id || '')
                        if (!empresaId || !proyectoId) return
                        if (!map[empresaId]) map[empresaId] = new Set<string>()
                        map[empresaId].add(proyectoId)
                    })
                    const counts: Record<string, number> = {}
                    Object.entries(map).forEach(([empresaId, set]) => {
                        counts[empresaId] = set.size
                    })
                    setActiveProjectCountByCompanyId(counts)
                } else {
                    setActiveProjectCountByCompanyId({})
                }
            } finally {
                if (!cancelled) setLoading(false)
            }
        }

        void load()
        return () => { cancelled = true }
    }, [supabase])

    useEffect(() => {
        let cancelled = false
        const loadLossAnalytics = async () => {
            setLossAnalyticsLoading(true)
            try {
                const res = await getLeadLossAnalyticsSupportData()
                if (cancelled) return
                if (res?.success) {
                    setLossAnalyticsRows(Array.isArray(res.data?.rows) ? res.data.rows : [])
                    setLossSellerOptions(Array.isArray(res.data?.sellerOptions) ? res.data.sellerOptions : [])
                    setLossIndustryOptions(Array.isArray(res.data?.industryOptions) ? res.data.industryOptions : [])
                    setLossReasonOptions(Array.isArray(res.data?.reasonOptions) ? res.data.reasonOptions : [])
                    setLossSubreasonOptions(Array.isArray(res.data?.subreasonOptions) ? res.data.subreasonOptions : [])
                    setLossAnalyticsGeneratedAt(res.data?.generatedAt || null)
                    setLossAnalyticsScope(res.data?.scope === 'own' ? 'own' : 'all')
                    setLossAnalyticsError(null)
                } else {
                    setLossAnalyticsRows([])
                    setLossAnalyticsError(res?.error || 'No se pudo cargar analytics de pérdidas.')
                }
            } catch (error: any) {
                if (cancelled) return
                setLossAnalyticsRows([])
                setLossAnalyticsError(error?.message || 'No se pudo cargar analytics de pérdidas.')
            } finally {
                if (!cancelled) setLossAnalyticsLoading(false)
            }
        }

        void loadLossAnalytics()
        return () => { cancelled = true }
    }, [])

    const wonLeads = useMemo(() => allLeads.filter((lead) => isWonStage(lead.etapa)), [allLeads])
    const lostLeads = useMemo(() => allLeads.filter((lead) => isLostStage(lead.etapa)), [allLeads])

    const closedCompanies = useMemo<ClosedCompanyRow[]>(() => {
        const groups = new Map<string, ClosedCompanyRow & { latestWonMs: number }>()

        for (const lead of wonLeads) {
            const empresaId = (lead as any).empresa_id ? String((lead as any).empresa_id) : null
            const empresaNombre = String(lead.empresa || 'Sin empresa').trim() || 'Sin empresa'
            const key = empresaId ? `id:${empresaId}` : `name:${empresaNombre.toLowerCase()}`
            const ownerId = String((lead as any).owner_id || '')
            const leadDate = String((lead as any).closed_at_real || (lead as any).fecha_registro || lead.created_at || '')
            const leadMs = leadDate ? new Date(leadDate).getTime() : 0

            const existing = groups.get(key)
            if (!existing) {
                groups.set(key, {
                    companyKey: key,
                    empresaId,
                    empresaNombre,
                    ownerIds: ownerId ? [ownerId] : [],
                    ownerNames: [String((lead as any).owner_username || '')].filter(Boolean),
                    wonLeadsCount: 1,
                    latestWonLeadName: String(lead.nombre || lead.empresa || 'Lead'),
                    latestWonLeadId: lead.id,
                    latestWonDate: leadDate || null,
                    activeProjectsCount: empresaId ? (activeProjectCountByCompanyId[empresaId] || 0) : 0,
                    latestWonMs: Number.isFinite(leadMs) ? leadMs : 0
                })
                continue
            }

            existing.wonLeadsCount += 1
            if (ownerId && !existing.ownerIds.includes(ownerId)) existing.ownerIds.push(ownerId)
            const ownerUsername = String((lead as any).owner_username || '')
            if (ownerUsername && !existing.ownerNames.includes(ownerUsername)) existing.ownerNames.push(ownerUsername)
            if (leadMs >= existing.latestWonMs) {
                existing.latestWonMs = leadMs
                existing.latestWonLeadName = String(lead.nombre || lead.empresa || 'Lead')
                existing.latestWonLeadId = lead.id
                existing.latestWonDate = leadDate || null
            }
            if (empresaId) existing.activeProjectsCount = activeProjectCountByCompanyId[empresaId] || 0
        }

        return Array.from(groups.values())
            .map(({ latestWonMs: _drop, ...row }) => row)
            .sort((a, b) => {
                const aProjects = a.activeProjectsCount || 0
                const bProjects = b.activeProjectsCount || 0
                if (aProjects !== bProjects) return bProjects - aProjects
                return new Date(String(b.latestWonDate || 0)).getTime() - new Date(String(a.latestWonDate || 0)).getTime()
            })
    }, [wonLeads, activeProjectCountByCompanyId])

    const normalizedSearch = search.trim().toLowerCase()

    const filteredClosedCompanies = useMemo(
        () => closedCompanies.filter((row) => {
            if (!normalizedSearch) return true
            return (
                row.empresaNombre.toLowerCase().includes(normalizedSearch)
                || row.ownerNames.some((name) => formatSellerDisplayName(name).toLowerCase().includes(normalizedSearch))
                || row.latestWonLeadName.toLowerCase().includes(normalizedSearch)
            )
        }),
        [closedCompanies, normalizedSearch]
    )

    const filteredLostLeads = useMemo(
        () => lostLeads.filter((lead) => {
            if (!normalizedSearch) return true
            return (
                String(lead.empresa || '').toLowerCase().includes(normalizedSearch)
                || String(lead.nombre || '').toLowerCase().includes(normalizedSearch)
                || String(lead.email || '').toLowerCase().includes(normalizedSearch)
            )
        }),
        [lostLeads, normalizedSearch]
    )

    const filteredLossSubreasonOptions = useMemo(() => {
        if (lossReasonFilter === 'all') return lossSubreasonOptions
        return lossSubreasonOptions.filter((item) => String(item.reason_id || '') === lossReasonFilter)
    }, [lossSubreasonOptions, lossReasonFilter])

    const lossAnalyticsFilteredRows = useMemo(() => {
        const periodRange = getPeriodRange(lossPeriodPreset)
        return lossAnalyticsRows.filter((row) => {
            const refDate = getLossReferenceDate(row)
            if (periodRange) {
                if (!refDate) return false
                const ms = new Date(refDate).getTime()
                if (!Number.isFinite(ms)) return false
                if (ms < periodRange.start.getTime() || ms > periodRange.end.getTime()) return false
            }

            if (lossSellerFilter !== 'all' && String(row.seller_id || '') !== lossSellerFilter) return false
            if (lossIndustryFilter !== 'all' && String(row.industria || '') !== lossIndustryFilter) return false
            if (lossSizeFilter !== 'all' && String(row.tamano_empresa ?? '') !== lossSizeFilter) return false
            if (lossReasonFilter !== 'all' && String(row.loss_reason_id || '') !== lossReasonFilter) return false
            if (lossSubreasonFilter !== 'all' && String(row.loss_subreason_id || '') !== lossSubreasonFilter) return false
            return true
        })
    }, [lossAnalyticsRows, lossPeriodPreset, lossSellerFilter, lossIndustryFilter, lossSizeFilter, lossReasonFilter, lossSubreasonFilter])

    const lossAnalyticsKpis = useMemo<LossAnalyticsKpi>(() => {
        return calculateLossAnalyticsKpis(lossAnalyticsFilteredRows)
    }, [lossAnalyticsFilteredRows])

    const lossAnalyticsPreviousRows = useMemo(() => {
        const previousRange = getPreviousPeriodRange(lossPeriodPreset)
        if (!previousRange) return [] as LeadLossAnalyticsRow[]
        return lossAnalyticsRows.filter((row) => {
            const refDate = getLossReferenceDate(row)
            if (!refDate) return false
            const ms = new Date(refDate).getTime()
            if (!Number.isFinite(ms)) return false
            if (ms < previousRange.start.getTime() || ms > previousRange.end.getTime()) return false
            if (lossSellerFilter !== 'all' && String(row.seller_id || '') !== lossSellerFilter) return false
            if (lossIndustryFilter !== 'all' && String(row.industria || '') !== lossIndustryFilter) return false
            if (lossSizeFilter !== 'all' && String(row.tamano_empresa ?? '') !== lossSizeFilter) return false
            if (lossReasonFilter !== 'all' && String(row.loss_reason_id || '') !== lossReasonFilter) return false
            if (lossSubreasonFilter !== 'all' && String(row.loss_subreason_id || '') !== lossSubreasonFilter) return false
            return true
        })
    }, [lossAnalyticsRows, lossPeriodPreset, lossSellerFilter, lossIndustryFilter, lossSizeFilter, lossReasonFilter, lossSubreasonFilter])

    const lossAnalyticsPreviousKpis = useMemo<LossAnalyticsKpi>(() => {
        return calculateLossAnalyticsKpis(lossAnalyticsPreviousRows)
    }, [lossAnalyticsPreviousRows])

    const lossAnalyticsComparison = useMemo(() => {
        const prev = lossAnalyticsPreviousKpis
        const current = lossAnalyticsKpis
        const pctDelta = (curr: number, previous: number) => {
            if (previous === 0) {
                if (curr === 0) return 0
                return null
            }
            return ((curr - previous) / previous) * 100
        }

        return {
            lostCountPct: pctDelta(current.lostCount, prev.lostCount),
            totalLostValuePct: pctDelta(current.totalLostValue, prev.totalLostValue),
            avgCycleDaysDiff: (current.avgCycleDays == null || prev.avgCycleDays == null)
                ? null
                : current.avgCycleDays - prev.avgCycleDays,
            topReasonChanged: current.topReasonLabel !== prev.topReasonLabel
                && current.topReasonLabel !== 'Sin datos'
                && prev.topReasonLabel !== 'Sin datos'
        }
    }, [lossAnalyticsKpis, lossAnalyticsPreviousKpis])

    const lossAnalyticsMonthlyTrend = useMemo<LossAnalyticsTrendRow[]>(() => {
        const monthMap = new Map<string, { lostCount: number; totalLostValue: number; date: Date }>()
        lossAnalyticsFilteredRows.forEach((row) => {
            const refDate = getLossReferenceDate(row)
            if (!refDate) return
            const d = new Date(refDate)
            if (Number.isNaN(d.getTime())) return
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
            const bucketDate = new Date(d.getFullYear(), d.getMonth(), 1)
            const current = monthMap.get(key) || { lostCount: 0, totalLostValue: 0, date: bucketDate }
            current.lostCount += 1
            current.totalLostValue += Number(row.valor_estimado || 0) + Number(row.valor_implementacion_estimado || 0)
            monthMap.set(key, current)
        })
        return Array.from(monthMap.entries())
            .sort((a, b) => a[1].date.getTime() - b[1].date.getTime())
            .slice(-6)
            .map(([monthKey, row]) => ({
                monthKey,
                label: row.date.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' }),
                lostCount: row.lostCount,
                totalLostValue: row.totalLostValue
            }))
    }, [lossAnalyticsFilteredRows])

    const lossAnalyticsSignals = useMemo(() => {
        const signals: string[] = []
        if (lossAnalyticsComparison.topReasonChanged) {
            signals.push(`Cambio de patrón: el motivo principal cambió a "${lossAnalyticsKpis.topReasonLabel}".`)
        }
        const topReasonLower = String(lossAnalyticsKpis.topReasonLabel || '').toLowerCase()
        if (topReasonLower.includes('compet')) {
            signals.push('Competencia domina las pérdidas en este filtro. Revisa propuesta de valor y diferenciadores.')
        } else if (topReasonLower.includes('tim')) {
            signals.push('Timing domina el periodo. Conviene reforzar follow-up y fechas de recontacto.')
        } else if (topReasonLower.includes('fit')) {
            signals.push('No fit domina el filtro. Revisa calificación y discovery antes de avanzar a negociación.')
        }
        if (lossAnalyticsKpis.unclassifiedPct > 10) {
            signals.push(`Calidad de captura: ${Math.round(lossAnalyticsKpis.unclassifiedPct)}% de pérdidas sin clasificar.`)
        }
        const topSeller = Array.from(
            lossAnalyticsFilteredRows.reduce((acc, row) => {
                const key = String(row.seller_id || row.seller_username || 'sin-asignar')
                const name = String(row.seller_full_name || formatSellerDisplayName(row.seller_username) || 'Sin asignar')
                const current = acc.get(key) || { name, count: 0 }
                current.count += 1
                acc.set(key, current)
                return acc
            }, new Map<string, { name: string; count: number }>())
                .values()
        ).sort((a, b) => b.count - a.count)[0]

        if (topSeller && topSeller.count >= 2) {
            signals.push(`${topSeller.name} concentra más pérdidas (${topSeller.count}) en el filtro actual.`)
        }
        return signals.slice(0, 4)
    }, [lossAnalyticsComparison.topReasonChanged, lossAnalyticsKpis.topReasonLabel, lossAnalyticsKpis.unclassifiedPct, lossAnalyticsFilteredRows])

    const topLossReasons = useMemo(() => {
        const total = Math.max(1, lossAnalyticsFilteredRows.length)
        const map = new Map<string, { label: string; count: number; monthlyValue: number; implementationValue: number }>()
        lossAnalyticsFilteredRows.forEach((row) => {
            const key = String(row.loss_reason_id || 'sin-clasificar')
            const label = String(row.loss_reason_label || 'Sin clasificar')
            const current = map.get(key) || { label, count: 0, monthlyValue: 0, implementationValue: 0 }
            current.count += 1
            current.monthlyValue += Number(row.valor_estimado || 0)
            current.implementationValue += Number(row.valor_implementacion_estimado || 0)
            map.set(key, current)
        })
        return Array.from(map.values())
            .map((row) => ({ ...row, sharePct: (row.count / total) * 100, totalValue: row.monthlyValue + row.implementationValue }))
            .sort((a, b) => b.count - a.count || b.totalValue - a.totalValue)
            .slice(0, 8)
    }, [lossAnalyticsFilteredRows])

    const topLossSubreasons = useMemo(() => {
        const map = new Map<string, { label: string; reasonLabel: string; count: number; totalValue: number }>()
        lossAnalyticsFilteredRows.forEach((row) => {
            const key = String(row.loss_subreason_id || 'sin-submotivo')
            const label = String(row.loss_subreason_label || 'Sin submotivo')
            const reasonLabel = String(row.loss_reason_label || 'Sin clasificar')
            const current = map.get(key) || { label, reasonLabel, count: 0, totalValue: 0 }
            current.count += 1
            current.totalValue += Number(row.valor_estimado || 0) + Number(row.valor_implementacion_estimado || 0)
            map.set(key, current)
        })
        return Array.from(map.values())
            .sort((a, b) => b.count - a.count || b.totalValue - a.totalValue)
            .slice(0, 10)
    }, [lossAnalyticsFilteredRows])

    const lossBySeller = useMemo(() => {
        const map = new Map<string, { sellerId: string | null; name: string; avatarUrl: string | null; count: number; totalValue: number }>()
        lossAnalyticsFilteredRows.forEach((row) => {
            const key = String(row.seller_id || row.seller_username || 'sin-asignar')
            const name = String(row.seller_full_name || formatSellerDisplayName(row.seller_username) || 'Sin asignar')
            const current = map.get(key) || { sellerId: row.seller_id, name, avatarUrl: row.seller_avatar_url || null, count: 0, totalValue: 0 }
            current.count += 1
            current.totalValue += Number(row.valor_estimado || 0) + Number(row.valor_implementacion_estimado || 0)
            map.set(key, current)
        })
        return Array.from(map.values()).sort((a, b) => b.count - a.count || b.totalValue - a.totalValue).slice(0, 10)
    }, [lossAnalyticsFilteredRows])

    const lossByIndustry = useMemo(() => {
        const map = new Map<string, { label: string; count: number; totalValue: number }>()
        lossAnalyticsFilteredRows.forEach((row) => {
            const label = String(row.industria || 'Sin industria')
            const current = map.get(label) || { label, count: 0, totalValue: 0 }
            current.count += 1
            current.totalValue += Number(row.valor_estimado || 0) + Number(row.valor_implementacion_estimado || 0)
            map.set(label, current)
        })
        return Array.from(map.values()).sort((a, b) => b.count - a.count || b.totalValue - a.totalValue).slice(0, 10)
    }, [lossAnalyticsFilteredRows])

    const lossAnalyticsDetailRows = useMemo(() => {
        return [...lossAnalyticsFilteredRows]
            .sort((a, b) => new Date(getLossReferenceDate(b) || 0).getTime() - new Date(getLossReferenceDate(a) || 0).getTime())
            .slice(0, 80)
    }, [lossAnalyticsFilteredRows])

    const handleOpenLossLeadDetail = (leadId: number) => {
        const lead = allLeads.find((row) => Number(row.id) === Number(leadId)) || null
        if (!lead) return
        setSelectedLossLead(lead)
        setIsLossLeadDetailOpen(true)
    }

    const handleClosedCompanyClick = async (row: ClosedCompanyRow) => {
        if (!row.empresaId || loadingCompanyDetail) return
        setCompanyDetailError(null)
        setLoadingCompanyDetail(true)
        try {
            const [{ data: company, error: companyError }, companyIndustriesResult] = await Promise.all([
                (supabase.from('empresas') as any)
                    .select('*')
                    .eq('id', row.empresaId)
                    .single(),
                (supabase.from('company_industries') as any)
                    .select('empresa_id, industria_id, is_primary, industrias(name)')
                    .eq('empresa_id', row.empresaId)
            ])

            if (companyError || !company) {
                throw new Error(companyError?.message || 'No se encontró la empresa.')
            }

            const companyIndustries = (companyIndustriesResult?.data || []) as any[]
            const pairedIndustries: Array<{ id: string; name: string }> = []
            const seenIndustryIds = new Set<string>()
            companyIndustries.forEach((rel) => {
                const industryId = String(rel?.industria_id || '').trim()
                const industryName = String(rel?.industrias?.name || '').trim()
                if (!industryId || !industryName || seenIndustryIds.has(industryId)) return
                seenIndustryIds.add(industryId)
                pairedIndustries.push({ id: industryId, name: industryName })
            })
            const industryIds = pairedIndustries.map((item) => item.id)
            const industryNames = pairedIndustries.map((item) => item.name)
            const primaryRel = companyIndustries.find((rel) => !!rel?.is_primary)

            const companyData: CompanyData = {
                id: company.id,
                nombre: String(company.nombre || ''),
                tamano: Number(company.tamano || 1),
                tamano_fuente: company.tamano_fuente || null,
                tamano_confianza: company.tamano_confianza || null,
                tamano_senal_principal: company.tamano_senal_principal || null,
                ubicacion: String(company.ubicacion || ''),
                logo_url: String(company.logo_url || ''),
                industria: String(primaryRel?.industrias?.name || company.industria || industryNames[0] || ''),
                industria_id: primaryRel?.industria_id || company.industria_id || industryIds[0] || '',
                industria_ids: industryIds as string[],
                industrias: industryNames as string[],
                website: String(company.website || company.sitio_web || ''),
                descripcion: String(company.descripcion || '')
            }

            setSelectedCompany(companyData)
            setIsCompanyDetailOpen(true)
        } catch (error: any) {
            setCompanyDetailError(error?.message || 'No se pudo cargar el detalle de la empresa.')
        } finally {
            setLoadingCompanyDetail(false)
        }
    }

    const syncCompanyIndustries = async (companyId: string, companyData: CompanyData) => {
        const fallbackPrimary = (companyData.industria_ids || [])[0] || ''
        const primaryIndustryId = companyData.industria_id || fallbackPrimary
        const allIndustryIds = Array.from(new Set([
            ...(primaryIndustryId ? [primaryIndustryId] : []),
            ...(companyData.industria_ids || [])
        ])).filter(Boolean)

        const { error: deleteError } = await (supabase.from('company_industries') as any)
            .delete()
            .eq('empresa_id', companyId)
        if (deleteError) throw deleteError

        if (allIndustryIds.length === 0) return

        const payload = allIndustryIds.map((industryId) => ({
            empresa_id: companyId,
            industria_id: industryId,
            is_primary: industryId === primaryIndustryId
        }))

        const { error: insertError } = await (supabase.from('company_industries') as any).insert(payload as any)
        if (insertError) throw insertError
    }

    const handleSaveCompanyFromDetail = async (companyData: CompanyData) => {
        if (!selectedCompany?.id) {
            alert('No se encontró la empresa a editar.')
            return
        }

        const normalizeOptionalText = (value: unknown) => {
            const normalized = String(value ?? '').trim()
            return normalized ? normalized : null
        }
        const normalizeIndustryIds = (ids: string[] | undefined, fallbackPrimary: string | undefined) =>
            Array.from(new Set([...(ids || []), ...(fallbackPrimary ? [fallbackPrimary] : [])]))
                .filter(Boolean)
                .sort()
        const basePayload: any = {
            nombre: companyData.nombre,
            tamano: companyData.tamano,
            ubicacion: companyData.ubicacion,
            industria: companyData.industria,
            industria_id: companyData.industria_id || null
        }
        const sizeAssessmentPayload: any = {
            tamano_fuente: normalizeCompanySizeSourceValue((companyData as any).tamano_fuente),
            tamano_confianza: normalizeCompanySizeConfidenceValue((companyData as any).tamano_confianza),
            tamano_senal_principal: normalizeOptionalText((companyData as any).tamano_senal_principal)
        }
        const basePayloadWithSizeAssessment = {
            ...basePayload,
            ...sizeAssessmentPayload
        }
        const profileFieldsPayload: any = {
            logo_url: normalizeOptionalText(companyData.logo_url),
            descripcion: normalizeOptionalText(companyData.descripcion)
        }
        const websiteValue = ((companyData as any)?.website ?? (companyData as any)?.sitio_web ?? '').toString().trim() || null
        const candidates = (() => {
            const corePayloadVariants = [
                { ...basePayloadWithSizeAssessment, ...profileFieldsPayload },
                { ...basePayload, ...profileFieldsPayload },
                basePayloadWithSizeAssessment,
                basePayload
            ]
            const next: any[] = []
            for (const corePayload of corePayloadVariants) {
                if (websiteValue !== null) {
                    next.push({ ...corePayload, website: websiteValue })
                    next.push({ ...corePayload, sitio_web: websiteValue })
                }
                next.push(corePayload)
            }
            return next
        })()

        const isUnknownColumnError = (error: any) => {
            const msg = String(parseSupabaseError(error, '') || '').toLowerCase()
            return msg.includes('could not find the') && msg.includes('column of')
        }

        let updateError: any = null
        for (const candidate of candidates) {
            const { error } = await ((supabase.from('empresas') as any).update(candidate).eq('id', selectedCompany.id))
            if (!error) {
                updateError = null
                break
            }
            updateError = error
            if (!isUnknownColumnError(error)) break
        }

        if (updateError) {
            alert(`Error al actualizar la empresa: ${parseSupabaseError(updateError, 'No se pudo actualizar la empresa.')}`)
            return
        }

        const prevPrimaryIndustryId = String(selectedCompany.industria_id || '').trim()
        const nextPrimaryIndustryId = String(companyData.industria_id || '').trim()
        const prevIndustryIds = normalizeIndustryIds(selectedCompany.industria_ids, prevPrimaryIndustryId)
        const nextIndustryIds = normalizeIndustryIds(companyData.industria_ids, nextPrimaryIndustryId)
        const industriesChanged =
            prevPrimaryIndustryId !== nextPrimaryIndustryId ||
            prevIndustryIds.join('|') !== nextIndustryIds.join('|')

        if (industriesChanged) {
            try {
                await syncCompanyIndustries(String(selectedCompany.id), companyData)
            } catch (industryError: any) {
                console.error('Error updating company industries from /cierres:', industryError)
                alert('La empresa se actualizó, pero no se pudieron guardar todas las industrias.')
            }
        }

        setSelectedCompany((prev) => (prev ? { ...prev, ...companyData } : prev))
        setIsCompanyEditModalOpen(false)
    }

    return (
        <div className='p-8 max-w-[1600px] mx-auto space-y-6'>
            <div className='flex flex-col md:flex-row md:items-center justify-between gap-6'>
                <div className='flex items-center gap-6'>
                    <div className='ah-icon-card h-20 w-20 rounded-[30px] shrink-0'>
                        <Handshake size={34} strokeWidth={2.1} />
                    </div>
                    <div>
                        <h1 className='text-4xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>Proyectos Activos</h1>
                        <p className='text-sm font-black uppercase tracking-[0.18em]' style={{ color: 'var(--text-secondary)' }}>
                            Empresas con cierres ganados y operación activa, con seguimiento de cierres perdidos
                        </p>
                    </div>
                </div>

                <div className='flex items-center gap-3'>
                    <div className='ah-count-chip'>
                        <span className='ah-count-chip-number'>{filteredClosedCompanies.length}</span>
                        <div className='ah-count-chip-meta'>
                            <span className='ah-count-chip-title'>Empresas activas</span>
                            <span className='ah-count-chip-subtitle'>con operación activa</span>
                        </div>
                    </div>
                    <div
                        className='ah-count-chip'
                        style={{
                            borderColor: 'color-mix(in srgb, #fb7185 42%, var(--card-border))',
                            background: 'color-mix(in srgb, #fb7185 14%, var(--card-bg))'
                        }}
                    >
                        <span className='ah-count-chip-number' style={{ color: 'color-mix(in srgb, #be123c 62%, var(--text-primary))' }}>{filteredLostLeads.length}</span>
                        <div className='ah-count-chip-meta'>
                            <span className='ah-count-chip-title'>Cerrados perdidos</span>
                            <span className='ah-count-chip-subtitle'>histórico</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className='rounded-[40px] border shadow-xl overflow-hidden' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                <div className='px-8 py-6 border-b' style={{ borderColor: 'var(--card-border)' }}>
                    <div className='ah-search-control'>
                        <Search className='ah-search-icon' size={20} />
                        <input
                            type='text'
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder='Buscar empresa, lead o vendedor...'
                            className='ah-search-input'
                        />
                    </div>

                    {companyDetailError && (
                        <div className={`mt-4 rounded-xl px-4 py-3 text-sm font-bold ${tonePanelClassName}`} style={toneVars('rose')}>
                            {companyDetailError}
                        </div>
                    )}
                </div>

                <div className='p-6'>
                    <section className='rounded-2xl border overflow-hidden' style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
                        <div className='px-5 py-4 border-b flex items-center gap-2' style={{ borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}>
                            <ShieldCheck size={16} style={{ color: 'color-mix(in srgb, #10b981 76%, var(--text-primary))' }} />
                            <h2 className='text-xs font-black uppercase tracking-[0.16em]' style={{ color: 'var(--text-primary)' }}>
                                Empresas con proyectos activos
                            </h2>
                        </div>

                        {loading ? (
                            <div className='p-8 text-center animate-pulse' style={{ color: 'var(--text-secondary)' }}>Cargando proyectos activos...</div>
                        ) : filteredClosedCompanies.length === 0 ? (
                            <div className='p-8 text-center' style={{ color: 'var(--text-secondary)' }}>No hay proyectos activos para mostrar.</div>
                        ) : (
                            <div className='ah-table-scroll custom-scrollbar'>
                                <table className='ah-table'>
                                    <thead>
                                        <tr>
                                            <th className='px-6 py-4 whitespace-nowrap'>Vendedor</th>
                                            <th className='px-6 py-4 whitespace-nowrap'>Empresa</th>
                                            <th className='px-6 py-4 whitespace-nowrap text-center'>Cierres</th>
                                            <th className='px-6 py-4 whitespace-nowrap text-center'>Proyectos Activos</th>
                                            <th className='px-6 py-4 whitespace-nowrap'>Último Lead Ganado</th>
                                            <th className='px-6 py-4 whitespace-nowrap'>Último Cierre</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredClosedCompanies.map((row) => {
                                            const primaryOwnerId = row.ownerIds[0] || ''
                                            const ownerProfile = primaryOwnerId ? sellerProfilesById[primaryOwnerId] : undefined
                                            const primaryOwnerName = ownerProfile?.fullName
                                                || formatSellerDisplayName(row.ownerNames[0])
                                            const extraOwners = Math.max(0, row.ownerNames.length - 1)
                                            return (
                                                <tr
                                                    key={row.companyKey}
                                                    onClick={() => void handleClosedCompanyClick(row)}
                                                    className={`transition-colors ${
                                                        row.empresaId
                                                            ? 'hover:bg-[var(--hover-bg)] cursor-pointer'
                                                            : 'opacity-80'
                                                    } ${loadingCompanyDetail ? 'cursor-wait' : ''}`}
                                                    title={row.empresaId ? 'Ver detalle completo de empresa' : 'Empresa sin vínculo directo'}
                                                >
                                                    <td className='px-6 py-4'>
                                                        <div className='flex items-center gap-3'>
                                                            <TableEmployeeAvatar
                                                                name={primaryOwnerName}
                                                                avatarUrl={ownerProfile?.avatarUrl}
                                                                size='sm'
                                                            />
                                                            <div>
                                                                <p className='font-black text-sm text-[var(--text-primary)] whitespace-nowrap'>{primaryOwnerName}</p>
                                                                {extraOwners > 0 && (
                                                                    <p className='text-[11px] font-bold text-[var(--text-secondary)]'>+{extraOwners} vendedor{extraOwners === 1 ? '' : 'es'}</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className='px-6 py-4'>
                                                        <p className='font-black text-sm text-[var(--text-primary)]'>{row.empresaNombre}</p>
                                                    </td>
                                                    <td className='px-6 py-4 text-center'>
                                                        <span
                                                            className={`inline-flex min-w-[44px] justify-center rounded-lg px-2 py-1 text-xs font-black ${toneChipClassName}`}
                                                            style={toneVars('blue')}
                                                        >
                                                            {row.wonLeadsCount}
                                                        </span>
                                                    </td>
                                                    <td className='px-6 py-4 text-center'>
                                                        <span
                                                            className={`inline-flex min-w-[44px] justify-center rounded-lg px-2 py-1 text-xs font-black ${toneChipClassName}`}
                                                            style={toneVars(row.activeProjectsCount > 0 ? 'emerald' : 'slate')}
                                                        >
                                                            {row.activeProjectsCount}
                                                        </span>
                                                    </td>
                                                    <td className='px-6 py-4'>
                                                        <p className='font-bold text-sm text-[var(--text-secondary)]'>{row.latestWonLeadName || '-'}</p>
                                                    </td>
                                                    <td className='px-6 py-4'>
                                                        <p className='font-bold text-sm text-[var(--text-secondary)]'>{formatDate(row.latestWonDate)}</p>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>

                    <section className='mt-6 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] overflow-hidden'>
                        <div className='px-5 py-4 border-b border-[var(--card-border)] flex flex-col gap-3'>
                            <div className='flex items-center justify-between gap-3 flex-wrap'>
                                <div className='flex items-center gap-2'>
                                    <TrendingDown size={16} className='text-amber-500 dark:text-amber-300' />
                                    <div>
                                        <p className='text-xs font-black uppercase tracking-[0.16em] text-[var(--text-primary)]'>Análisis de pérdidas</p>
                                        <p className='text-[11px] font-semibold text-[var(--text-secondary)]'>
                                            Top motivos/submotivos, monto perdido y distribución por vendedor/industria
                                            {lossAnalyticsScope === 'own' ? ' (tu cartera)' : ''}
                                        </p>
                                    </div>
                                </div>
                                <div className='text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]'>
                                    {lossAnalyticsGeneratedAt ? `Actualizado ${formatDate(lossAnalyticsGeneratedAt)}` : 'Sin actualización'}
                                </div>
                            </div>

                            <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-2'>
                                <div className='flex rounded-xl border border-[var(--card-border)] bg-[var(--hover-bg)] p-1 gap-1 md:col-span-2 xl:col-span-2'>
                                    {([
                                        ['month', 'Mes'],
                                        ['30d', '30d'],
                                        ['quarter', 'Trimestre'],
                                        ['all', 'Todo']
                                    ] as Array<[LossPeriodPreset, string]>).map(([preset, label]) => (
                                        <button
                                            key={preset}
                                            onClick={() => setLossPeriodPreset(preset)}
                                            className={`flex-1 h-9 rounded-lg text-[10px] font-black uppercase tracking-[0.12em] transition-all cursor-pointer ${
                                                lossPeriodPreset === preset
                                                    ? 'bg-[#2048FF] text-white shadow-lg shadow-blue-500/20'
                                                    : 'text-[var(--text-secondary)] hover:bg-[var(--card-bg)]'
                                            }`}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>

                                <select
                                    value={lossSellerFilter}
                                    onChange={(e) => setLossSellerFilter(e.target.value)}
                                    className='h-11 rounded-xl border border-[var(--card-border)] bg-[var(--hover-bg)] px-3 text-[11px] font-black uppercase tracking-[0.08em] text-[var(--text-primary)]'
                                >
                                    <option value='all'>Vendedor: Todos</option>
                                    {lossSellerOptions.map((opt) => (
                                        <option key={opt.id} value={opt.id}>{opt.label}</option>
                                    ))}
                                </select>

                                <select
                                    value={lossIndustryFilter}
                                    onChange={(e) => setLossIndustryFilter(e.target.value)}
                                    className='h-11 rounded-xl border border-[var(--card-border)] bg-[var(--hover-bg)] px-3 text-[11px] font-black uppercase tracking-[0.08em] text-[var(--text-primary)]'
                                >
                                    <option value='all'>Industria: Todas</option>
                                    {lossIndustryOptions.map((opt) => (
                                        <option key={opt.label} value={opt.label}>{opt.label}</option>
                                    ))}
                                </select>

                                <select
                                    value={lossSizeFilter}
                                    onChange={(e) => setLossSizeFilter(e.target.value)}
                                    className='h-11 rounded-xl border border-[var(--card-border)] bg-[var(--hover-bg)] px-3 text-[11px] font-black uppercase tracking-[0.08em] text-[var(--text-primary)]'
                                >
                                    <option value='all'>Tamaño: Todos</option>
                                    {[1, 2, 3, 4, 5].map((size) => (
                                        <option key={size} value={String(size)}>{`Tamaño ${size}`}</option>
                                    ))}
                                </select>

                                <select
                                    value={lossReasonFilter}
                                    onChange={(e) => {
                                        setLossReasonFilter(e.target.value)
                                        setLossSubreasonFilter('all')
                                    }}
                                    className='h-11 rounded-xl border border-[var(--card-border)] bg-[var(--hover-bg)] px-3 text-[11px] font-black uppercase tracking-[0.08em] text-[var(--text-primary)]'
                                >
                                    <option value='all'>Motivo: Todos</option>
                                    {lossReasonOptions.map((opt) => (
                                        <option key={opt.id} value={opt.id}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div className='grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_220px] gap-2'>
                                <div className='rounded-xl border border-[var(--card-border)] bg-[var(--hover-bg)] px-3 py-2'>
                                    <p className='text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]'>Submotivo</p>
                                    <select
                                        value={lossSubreasonFilter}
                                        onChange={(e) => setLossSubreasonFilter(e.target.value)}
                                        className='mt-1 w-full h-9 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] px-2 text-[11px] font-bold text-[var(--text-primary)]'
                                    >
                                        <option value='all'>Todos</option>
                                        {filteredLossSubreasonOptions.map((opt) => (
                                            <option key={opt.id} value={opt.id}>{opt.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <button
                                    onClick={() => {
                                        setLossPeriodPreset('month')
                                        setLossSellerFilter('all')
                                        setLossIndustryFilter('all')
                                        setLossSizeFilter('all')
                                        setLossReasonFilter('all')
                                        setLossSubreasonFilter('all')
                                    }}
                                    className='h-[58px] rounded-xl border border-[var(--card-border)] bg-[var(--hover-bg)] text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)] hover:bg-[var(--card-bg)] transition-colors cursor-pointer'
                                >
                                    Limpiar filtros
                                </button>
                            </div>
                        </div>

                        {lossAnalyticsError ? (
                            <div className='px-5 py-4 border-b border-[var(--card-border)]'>
                                <div className='rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-700 dark:text-amber-200 flex items-start gap-2'>
                                    <AlertTriangle size={16} className='shrink-0 mt-0.5' />
                                    <span>{lossAnalyticsError}</span>
                                </div>
                            </div>
                        ) : null}

                        <div className='p-5'>
                            {lossAnalyticsLoading ? (
                                <div className='py-10 text-center text-[var(--text-secondary)] font-bold animate-pulse'>Cargando analytics de pérdidas...</div>
                            ) : (
                                <>
                                    <div className='grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3'>
                                        <div
                                            className={`rounded-2xl p-4 ${tonePanelClassName} shadow-[0_10px_26px_-22px_var(--tone-shadow)]`}
                                            style={toneVars('rose')}
                                            title={LOSS_ANALYTICS_METRICS.lostCount.shortHelp}
                                        >
                                            <p className='text-[10px] font-black uppercase tracking-[0.14em]' style={{ color: 'var(--tone-panel-text)' }}>{LOSS_ANALYTICS_METRICS.lostCount.label}</p>
                                            <p className='mt-1 text-2xl font-black' style={{ color: 'var(--text-primary)' }}>{lossAnalyticsKpis.lostCount}</p>
                                        </div>
                                        <div
                                            className={`rounded-2xl p-4 ${tonePanelClassName} shadow-[0_10px_26px_-22px_var(--tone-shadow)]`}
                                            style={toneVars('amber')}
                                            title={LOSS_ANALYTICS_METRICS.monthlyLostValue.shortHelp}
                                        >
                                            <p className='text-[10px] font-black uppercase tracking-[0.14em]' style={{ color: 'var(--tone-panel-text)' }}>{LOSS_ANALYTICS_METRICS.monthlyLostValue.label}</p>
                                            <p className='mt-1 text-xl font-black' style={{ color: 'var(--text-primary)' }}>{formatCurrency(lossAnalyticsKpis.monthlyLostValue)}</p>
                                        </div>
                                        <div
                                            className={`rounded-2xl p-4 ${tonePanelClassName} shadow-[0_10px_26px_-22px_var(--tone-shadow)]`}
                                            style={toneVars('orange')}
                                            title={LOSS_ANALYTICS_METRICS.implementationLostValue.shortHelp}
                                        >
                                            <p className='text-[10px] font-black uppercase tracking-[0.14em]' style={{ color: 'var(--tone-panel-text)' }}>{LOSS_ANALYTICS_METRICS.implementationLostValue.label}</p>
                                            <p className='mt-1 text-xl font-black' style={{ color: 'var(--text-primary)' }}>{formatCurrency(lossAnalyticsKpis.implementationLostValue)}</p>
                                        </div>
                                        <div
                                            className={`rounded-2xl p-4 ${tonePanelClassName} shadow-[0_10px_26px_-22px_var(--tone-shadow)]`}
                                            style={toneVars('blue')}
                                            title={LOSS_ANALYTICS_METRICS.totalLostValue.shortHelp}
                                        >
                                            <p className='text-[10px] font-black uppercase tracking-[0.14em]' style={{ color: 'var(--tone-panel-text)' }}>{LOSS_ANALYTICS_METRICS.totalLostValue.label}</p>
                                            <p className='mt-1 text-xl font-black' style={{ color: 'var(--text-primary)' }}>{formatCurrency(lossAnalyticsKpis.totalLostValue)}</p>
                                        </div>
                                        <div
                                            className={`rounded-2xl p-4 ${tonePanelClassName} shadow-[0_10px_26px_-22px_var(--tone-shadow)]`}
                                            style={toneVars('fuchsia')}
                                            title={LOSS_ANALYTICS_METRICS.topReason.shortHelp}
                                        >
                                            <p className='text-[10px] font-black uppercase tracking-[0.14em]' style={{ color: 'var(--tone-panel-text)' }}>{LOSS_ANALYTICS_METRICS.topReason.label}</p>
                                            <p className='mt-1 text-sm font-black line-clamp-2' style={{ color: 'var(--text-primary)' }}>{lossAnalyticsKpis.topReasonLabel}</p>
                                        </div>
                                        <div
                                            className={`rounded-2xl p-4 ${tonePanelClassName} shadow-[0_10px_26px_-22px_var(--tone-shadow)]`}
                                            style={toneVars('cyan')}
                                            title={`${LOSS_ANALYTICS_METRICS.unclassifiedPct.shortHelp} ${LOSS_ANALYTICS_METRICS.avgCycleDays.shortHelp}`}
                                        >
                                            <p className='text-[10px] font-black uppercase tracking-[0.14em]' style={{ color: 'var(--tone-panel-text)' }}>Calidad / ciclo</p>
                                            <p className='mt-1 text-sm font-black' style={{ color: 'var(--text-primary)' }}>
                                                {formatPercent(lossAnalyticsKpis.unclassifiedPct)} sin clasificar
                                            </p>
                                            <p className='mt-1 text-[11px] font-bold' style={{ color: 'var(--text-secondary)' }}>
                                                Ciclo prom.: {lossAnalyticsKpis.avgCycleDays == null ? '—' : `${Math.round(lossAnalyticsKpis.avgCycleDays)} días`}
                                            </p>
                                        </div>
                                    </div>

                                    {lossPeriodPreset !== 'all' && (
                                        <div className='mt-4 grid grid-cols-1 xl:grid-cols-3 gap-4'>
                                            <div className='rounded-2xl border border-[var(--card-border)] bg-[var(--hover-bg)] p-4 xl:col-span-2'>
                                                <div className='flex items-center justify-between gap-3 mb-3'>
                                                    <p className='text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-primary)]'>Comparativo vs periodo anterior</p>
                                                    <span className='text-[10px] font-black uppercase tracking-[0.12em] text-[var(--text-secondary)]'>
                                                        Prev: {lossAnalyticsPreviousKpis.lostCount} perdidos
                                                    </span>
                                                </div>
                                                <div className='grid grid-cols-1 sm:grid-cols-3 gap-3'>
                                                    <div className='rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2.5'>
                                                        <p className='text-[10px] font-black uppercase tracking-[0.12em] text-[var(--text-secondary)]'>Cierres perdidos</p>
                                                        <p className='mt-1 text-sm font-black text-[var(--text-primary)]'>{formatSignedPercent(lossAnalyticsComparison.lostCountPct)}</p>
                                                    </div>
                                                    <div className='rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2.5'>
                                                        <p className='text-[10px] font-black uppercase tracking-[0.12em] text-[var(--text-secondary)]'>Monto perdido</p>
                                                        <p className='mt-1 text-sm font-black text-[var(--text-primary)]'>{formatSignedPercent(lossAnalyticsComparison.totalLostValuePct)}</p>
                                                    </div>
                                                    <div className='rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2.5'>
                                                        <p className='text-[10px] font-black uppercase tracking-[0.12em] text-[var(--text-secondary)]'>Ciclo promedio</p>
                                                        <p className='mt-1 text-sm font-black text-[var(--text-primary)]'>
                                                            {lossAnalyticsComparison.avgCycleDaysDiff == null
                                                                ? '—'
                                                                : `${lossAnalyticsComparison.avgCycleDaysDiff > 0 ? '+' : ''}${Math.round(lossAnalyticsComparison.avgCycleDaysDiff)}d`}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className='rounded-2xl border border-[var(--card-border)] bg-[var(--hover-bg)] p-4'>
                                                <p className='text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-primary)] mb-3'>Señales accionables</p>
                                                {lossAnalyticsSignals.length === 0 ? (
                                                    <p className='text-xs font-semibold text-[var(--text-secondary)]'>Sin señales destacadas con el filtro actual.</p>
                                                ) : (
                                                    <div className='space-y-2'>
                                                        {lossAnalyticsSignals.map((signal, idx) => (
                                                            <div key={`loss-signal-${idx}`} className='rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)]'>
                                                                {signal}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    <div className='mt-4 rounded-2xl border overflow-hidden' style={{ borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}>
                                        <div className='px-4 py-3 border-b flex items-center justify-between gap-2' style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
                                            <p className='text-[11px] font-black uppercase tracking-[0.14em]' style={{ color: 'var(--text-primary)' }}>Tendencia mensual (filtro actual)</p>
                                            <span className='text-[10px] font-black uppercase tracking-[0.12em]' style={{ color: 'var(--text-secondary)' }}>Últimos 6 meses</span>
                                        </div>
                                        <div className='p-3'>
                                            {lossAnalyticsMonthlyTrend.length === 0 ? (
                                                <div className='py-4 text-center font-bold text-sm' style={{ color: 'var(--text-secondary)' }}>Sin datos para tendencia.</div>
                                            ) : (
                                                <div className='space-y-2'>
                                                    {(() => {
                                                        const maxCount = Math.max(1, ...lossAnalyticsMonthlyTrend.map((row) => row.lostCount))
                                                        return lossAnalyticsMonthlyTrend.map((row) => (
                                                            <div key={row.monthKey} className='rounded-xl border px-3 py-2.5' style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
                                                                <div className='flex items-center justify-between gap-3 text-xs font-bold'>
                                                                    <span style={{ color: 'var(--text-primary)' }}>{row.label}</span>
                                                                    <span style={{ color: 'var(--text-secondary)' }}>{row.lostCount} perdidos · {formatCurrency(row.totalLostValue)}</span>
                                                                </div>
                                                                <div className='mt-2 h-2 rounded-full overflow-hidden' style={{ background: 'var(--card-border)' }}>
                                                                    <div
                                                                        className='h-full rounded-full'
                                                                        style={{
                                                                            width: `${Math.max(6, (row.lostCount / maxCount) * 100)}%`,
                                                                            background: 'linear-gradient(90deg, rgba(251,113,133,0.9), rgba(244,63,94,0.75))'
                                                                        }}
                                                                    />
                                                                </div>
                                                            </div>
                                                        ))
                                                    })()}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className='mt-5 grid grid-cols-1 xl:grid-cols-2 gap-5'>
                                        <div className='rounded-2xl border overflow-hidden' style={{ borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}>
                                            <div className='px-4 py-3 border-b flex items-center gap-2' style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
                                                <BarChart3 size={14} style={{ color: 'color-mix(in srgb, #f59e0b 72%, var(--text-primary))' }} />
                                                <p className='text-[11px] font-black uppercase tracking-[0.14em]' style={{ color: 'var(--text-primary)' }}>Top motivos de pérdida</p>
                                            </div>
                                            <div className='p-3'>
                                                {topLossReasons.length === 0 ? (
                                                    <div className='py-6 text-center font-bold text-sm' style={{ color: 'var(--text-secondary)' }}>Sin datos en este filtro.</div>
                                                ) : (
                                                    <div className='space-y-2'>
                                                        {topLossReasons.map((row) => (
                                                            <div key={row.label} className='rounded-xl border px-3 py-2.5' style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
                                                                <div className='flex items-center justify-between gap-3'>
                                                                    <p className='text-sm font-black truncate' style={{ color: 'var(--text-primary)' }}>{row.label}</p>
                                                                    <span className='text-xs font-black' style={{ color: 'var(--text-primary)' }}>{row.count}</span>
                                                                </div>
                                                                <div className='mt-1 flex items-center justify-between gap-2 text-[11px] font-bold' style={{ color: 'var(--text-secondary)' }}>
                                                                    <span>{formatPercent(row.sharePct)} del total</span>
                                                                    <span>{formatCurrency(row.totalValue)}</span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className='rounded-2xl border overflow-hidden' style={{ borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}>
                                            <div className='px-4 py-3 border-b flex items-center gap-2' style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
                                                <BarChart3 size={14} style={{ color: 'color-mix(in srgb, #d946ef 72%, var(--text-primary))' }} />
                                                <p className='text-[11px] font-black uppercase tracking-[0.14em]' style={{ color: 'var(--text-primary)' }}>Top submotivos de pérdida</p>
                                            </div>
                                            <div className='p-3'>
                                                {topLossSubreasons.length === 0 ? (
                                                    <div className='py-6 text-center font-bold text-sm' style={{ color: 'var(--text-secondary)' }}>Sin datos en este filtro.</div>
                                                ) : (
                                                    <div className='space-y-2'>
                                                        {topLossSubreasons.map((row) => (
                                                            <div key={`${row.reasonLabel}-${row.label}`} className='rounded-xl border px-3 py-2.5' style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
                                                                <div className='flex items-center justify-between gap-3'>
                                                                    <div className='min-w-0'>
                                                                        <p className='text-sm font-black truncate' style={{ color: 'var(--text-primary)' }}>{row.label}</p>
                                                                        <p className='text-[10px] font-bold uppercase tracking-[0.12em] truncate' style={{ color: 'var(--text-secondary)' }}>{row.reasonLabel}</p>
                                                                    </div>
                                                                    <span className='text-xs font-black' style={{ color: 'var(--text-primary)' }}>{row.count}</span>
                                                                </div>
                                                                <div className='mt-1 text-right text-[11px] font-bold' style={{ color: 'var(--text-secondary)' }}>{formatCurrency(row.totalValue)}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className='mt-5 grid grid-cols-1 xl:grid-cols-2 gap-5'>
                                        <div className='rounded-2xl border overflow-hidden' style={{ borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}>
                                            <div className='px-4 py-3 border-b flex items-center gap-2' style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
                                                <ShieldCheck size={14} style={{ color: 'color-mix(in srgb, #3b82f6 72%, var(--text-primary))' }} />
                                                <p className='text-[11px] font-black uppercase tracking-[0.14em]' style={{ color: 'var(--text-primary)' }}>Pérdidas por vendedor</p>
                                            </div>
                                            <div className='p-3'>
                                                {lossBySeller.length === 0 ? (
                                                    <div className='py-6 text-center font-bold text-sm' style={{ color: 'var(--text-secondary)' }}>Sin datos en este filtro.</div>
                                                ) : (
                                                    <div className='space-y-2'>
                                                        {lossBySeller.map((row) => (
                                                            <div key={`${row.sellerId || row.name}`} className='rounded-xl border px-3 py-2.5 flex items-center justify-between gap-3' style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
                                                                <div className='flex items-center gap-3 min-w-0'>
                                                                    <TableEmployeeAvatar name={row.name} avatarUrl={row.avatarUrl} size='sm' />
                                                                    <div className='min-w-0'>
                                                                        <p className='text-sm font-black truncate' style={{ color: 'var(--text-primary)' }}>{row.name}</p>
                                                                        <p className='text-[10px] font-bold uppercase tracking-[0.12em]' style={{ color: 'var(--text-secondary)' }}>{row.count} perdidos</p>
                                                                    </div>
                                                                </div>
                                                                <div className='text-right'>
                                                                    <p className='text-xs font-black' style={{ color: 'var(--text-primary)' }}>{formatCurrency(row.totalValue)}</p>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className='rounded-2xl border overflow-hidden' style={{ borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}>
                                            <div className='px-4 py-3 border-b flex items-center gap-2' style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
                                                <Building2 size={14} style={{ color: 'color-mix(in srgb, #06b6d4 72%, var(--text-primary))' }} />
                                                <p className='text-[11px] font-black uppercase tracking-[0.14em]' style={{ color: 'var(--text-primary)' }}>Pérdidas por industria</p>
                                            </div>
                                            <div className='p-3'>
                                                {lossByIndustry.length === 0 ? (
                                                    <div className='py-6 text-center font-bold text-sm' style={{ color: 'var(--text-secondary)' }}>Sin datos en este filtro.</div>
                                                ) : (
                                                    <div className='space-y-2'>
                                                        {lossByIndustry.map((row) => (
                                                            <div key={row.label} className='rounded-xl border px-3 py-2.5 flex items-center justify-between gap-3' style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
                                                                <div className='min-w-0'>
                                                                    <p className='text-sm font-black truncate' style={{ color: 'var(--text-primary)' }}>{row.label}</p>
                                                                    <p className='text-[10px] font-bold uppercase tracking-[0.12em]' style={{ color: 'var(--text-secondary)' }}>{row.count} perdidos</p>
                                                                </div>
                                                                <p className='text-xs font-black' style={{ color: 'var(--text-primary)' }}>{formatCurrency(row.totalValue)}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className='mt-5 rounded-2xl border overflow-hidden' style={{ borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}>
                                        <div className='px-4 py-3 border-b flex items-center justify-between gap-2' style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
                                            <div className='flex items-center gap-2'>
                                                <XCircle size={14} style={{ color: 'color-mix(in srgb, #fb7185 72%, var(--text-primary))' }} />
                                                <p className='text-[11px] font-black uppercase tracking-[0.14em]' style={{ color: 'var(--text-primary)' }}>Detalle de cerrados perdidos (drill-down)</p>
                                            </div>
                                            <span className='text-[10px] font-black uppercase tracking-[0.12em]' style={{ color: 'var(--text-secondary)' }}>
                                                {lossAnalyticsDetailRows.length} mostrados
                                            </span>
                                        </div>
                                        {lossAnalyticsDetailRows.length === 0 ? (
                                            <div className='p-6 text-center font-bold text-sm' style={{ color: 'var(--text-secondary)' }}>Sin leads perdidos para este filtro.</div>
                                        ) : (
                                            <div className='ah-table-scroll custom-scrollbar'>
                                                <table className='ah-table'>
                                                    <thead>
                                                        <tr>
                                                            <th className='px-4 py-3 whitespace-nowrap'>Vendedor</th>
                                                            <th className='px-4 py-3 whitespace-nowrap'>Empresa / Lead</th>
                                                            <th className='px-4 py-3 whitespace-nowrap'>Motivo</th>
                                                            <th className='px-4 py-3 whitespace-nowrap'>Submotivo</th>
                                                            <th className='px-4 py-3 whitespace-nowrap'>Industria</th>
                                                            <th className='px-4 py-3 whitespace-nowrap text-right'>Monto Perdido</th>
                                                            <th className='px-4 py-3 whitespace-nowrap'>Fecha</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {lossAnalyticsDetailRows.map((row) => (
                                                            <tr
                                                                key={`loss-analytics-${row.lead_id}`}
                                                                onClick={() => handleOpenLossLeadDetail(row.lead_id)}
                                                                className='hover:bg-[var(--hover-bg)] transition-colors cursor-pointer'
                                                                title='Abrir ficha del lead'
                                                            >
                                                                <td className='px-4 py-3'>
                                                                    <div className='flex items-center gap-2'>
                                                                        <TableEmployeeAvatar
                                                                            name={row.seller_full_name || formatSellerDisplayName(row.seller_username)}
                                                                            avatarUrl={row.seller_avatar_url || undefined}
                                                                            size='sm'
                                                                        />
                                                                        <span className='font-bold text-xs text-[var(--text-primary)]'>
                                                                            {row.seller_full_name || formatSellerDisplayName(row.seller_username)}
                                                                        </span>
                                                                    </div>
                                                                </td>
                                                                <td className='px-4 py-3'>
                                                                    <p className='font-black text-sm text-[var(--text-primary)]'>{row.empresa || '-'}</p>
                                                                    <p className='text-[11px] font-bold text-[var(--text-secondary)]'>{row.nombre || '-'}</p>
                                                                </td>
                                                                <td className='px-4 py-3'>
                                                                    <span className={`rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${toneChipClassName}`} style={toneVars('slate')}>
                                                                        {row.loss_reason_label || 'Sin clasificar'}
                                                                    </span>
                                                                </td>
                                                                <td className='px-4 py-3'>
                                                                    <span className='text-xs font-bold text-[var(--text-secondary)]'>{row.loss_subreason_label || 'Sin submotivo'}</span>
                                                                </td>
                                                                <td className='px-4 py-3'>
                                                                    <span className='text-xs font-bold text-[var(--text-secondary)]'>{row.industria || 'Sin industria'}</span>
                                                                </td>
                                                                <td className='px-4 py-3 text-right'>
                                                                    <p className='font-black text-sm text-[var(--text-primary)]'>
                                                                        {formatCurrency((row.valor_estimado || 0) + (row.valor_implementacion_estimado || 0))}
                                                                    </p>
                                                                    <p className='text-[10px] font-bold text-[var(--text-secondary)]'>
                                                                        M {formatCurrency(row.valor_estimado)} · I {formatCurrency(row.valor_implementacion_estimado)}
                                                                    </p>
                                                                </td>
                                                                <td className='px-4 py-3'>
                                                                    <span className='text-xs font-bold text-[var(--text-secondary)]'>{formatDate(getLossReferenceDate(row))}</span>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </section>

                    <section className='mt-6 rounded-2xl border overflow-hidden' style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
                        <button
                            type='button'
                            onClick={() => setLostLeadsOpen((v) => !v)}
                            className='w-full px-5 py-4 flex items-center justify-between text-left hover:bg-[var(--hover-bg)] transition-colors cursor-pointer'
                        >
                            <div className='flex items-center gap-2'>
                                <XCircle size={16} style={{ color: 'color-mix(in srgb, #fb7185 72%, var(--text-primary))' }} />
                                <div>
                                <p className='text-xs font-black uppercase tracking-[0.16em]' style={{ color: 'var(--text-primary)' }}>Cierres perdidos</p>
                                    <p className='text-[11px] font-semibold' style={{ color: 'var(--text-secondary)' }}>Tabla secundaria para revisión histórica</p>
                                </div>
                            </div>
                            <div className='flex items-center gap-3'>
                                <span className={`text-xs font-black rounded-lg px-2 py-1 ${toneChipClassName}`} style={toneVars('slate')}>
                                    {filteredLostLeads.length}
                                </span>
                                <ChevronDown
                                    size={16}
                                    className={`transition-transform ${lostLeadsOpen ? 'rotate-180' : ''}`}
                                    style={{ color: 'var(--text-secondary)' }}
                                />
                            </div>
                        </button>

                        {lostLeadsOpen && (
                            <div className='border-t' style={{ borderColor: 'var(--card-border)' }}>
                                {filteredLostLeads.length === 0 ? (
                                    <div className='p-6 text-center' style={{ color: 'var(--text-secondary)' }}>No hay leads cerrados perdidos.</div>
                                ) : (
                                    <div className='ah-table-scroll custom-scrollbar'>
                                        <table className='ah-table'>
                                            <thead>
                                                <tr>
                                                    <th className='px-6 py-4 whitespace-nowrap'>Vendedor</th>
                                                    <th className='px-6 py-4 whitespace-nowrap'>Empresa</th>
                                                    <th className='px-6 py-4 whitespace-nowrap'>Contacto</th>
                                                    <th className='px-6 py-4 whitespace-nowrap'>Email</th>
                                                    <th className='px-6 py-4 whitespace-nowrap'>Valor Est.</th>
                                                    <th className='px-6 py-4 whitespace-nowrap'>Última Actualización</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredLostLeads.map((lead: any) => {
                                                    const ownerId = String(lead?.owner_id || '')
                                                    const ownerProfile = ownerId ? sellerProfilesById[ownerId] : undefined
                                                    const sellerName = ownerProfile?.fullName || formatSellerDisplayName(lead?.owner_username)
                                                    return (
                                                        <tr key={`lost-${lead.id}`} className='hover:bg-[var(--hover-bg)] transition-colors'>
                                                            <td className='px-6 py-4'>
                                                                <div className='flex items-center gap-3'>
                                                                    <TableEmployeeAvatar
                                                                        name={sellerName}
                                                                        avatarUrl={ownerProfile?.avatarUrl}
                                                                        size='sm'
                                                                    />
                                                                    <span className='font-black text-sm text-[var(--text-primary)]'>{sellerName}</span>
                                                                </div>
                                                            </td>
                                                            <td className='px-6 py-4 font-black text-sm text-[var(--text-primary)]'>{lead.empresa || '-'}</td>
                                                            <td className='px-6 py-4 font-bold text-sm text-[var(--text-secondary)]'>{lead.nombre || '-'}</td>
                                                            <td className='px-6 py-4 font-bold text-sm text-[var(--text-secondary)]'>{lead.email || '-'}</td>
                                                            <td className='px-6 py-4 font-black text-sm text-[var(--text-primary)]'>
                                                                ${Number(lead.valor_estimado || 0).toLocaleString('es-MX')}
                                                            </td>
                                                            <td className='px-6 py-4 font-bold text-sm text-[var(--text-secondary)]'>
                                                                {formatDate((lead as any).closed_at_real || (lead as any).fecha_registro || lead.created_at)}
                                                            </td>
                                                        </tr>
                                                    )
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}
                    </section>
                </div>
            </div>

            <RichardDawkinsFooter />

            {selectedCompany && (
                <AdminCompanyDetailView
                    isOpen={isCompanyDetailOpen}
                    onClose={() => setIsCompanyDetailOpen(false)}
                    company={selectedCompany}
                    currentUserProfile={auth.profile}
                    onEditCompany={() => setIsCompanyEditModalOpen(true)}
                />
            )}

            {selectedCompany && (
                <CompanyModal
                    isOpen={isCompanyEditModalOpen}
                    onClose={() => setIsCompanyEditModalOpen(false)}
                    onSave={handleSaveCompanyFromDetail}
                    initialData={selectedCompany}
                    mode='edit'
                    overlayClassName='z-[160]'
                    overlayStyle={{ zIndex: 160 }}
                />
            )}

            {selectedLossLead && (
                <ClientDetailView
                    isOpen={isLossLeadDetailOpen}
                    onClose={() => setIsLossLeadDetailOpen(false)}
                    client={selectedLossLead as any}
                    onEditClient={() => { }}
                    onEditCompany={() => { }}
                    onEmailClick={() => { }}
                />
            )}
        </div>
    )
}
