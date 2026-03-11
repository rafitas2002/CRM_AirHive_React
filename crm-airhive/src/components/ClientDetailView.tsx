'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import MeetingModal from './MeetingModal'
import MeetingsList from './MeetingsList'
import TaskModal from './TaskModal'
import TasksList from './TasksList'
import { createMeeting, getNextMeeting, getLeadSnapshots, isProbabilityEditable } from '@/lib/meetingsService'
import { Database } from '@/lib/supabase'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'
import { useTheme } from '@/lib/ThemeContext'
import { ArrowDownRight, ArrowUpRight, BarChart3, Building2, CalendarDays, Camera, CheckCircle2, CheckSquare, ChevronDown, ChevronUp, Mail, MessageCircle, Minus, PencilLine, Plus, User, NotebookPen, Link2, X } from 'lucide-react'
import { buildIndustryBadgeVisualMap, getIndustryBadgeVisualFromMap } from '@/lib/industryBadgeVisuals'

type ClientData = {
    id: number
    empresa: string
    nombre: string
    contacto: string
    etapa: string
    valor_estimado: number | null
    oportunidad: string
    calificacion: number
    notas: string
    empresa_id?: string
    owner_username?: string
    owner_id?: string
    probabilidad?: number
    fecha_registro?: string
    forecast_logloss?: number | null
    forecast_evaluated_probability?: number | null
    forecast_outcome?: number | null
    forecast_scored_at?: string | null
    probability_locked?: boolean | null
    next_meeting_id?: string | null
    last_snapshot_at?: string | null
    email?: string | null
    telefono?: string | null
    loss_reason_id?: string | null
    loss_subreason_id?: string | null
    loss_notes?: string | null
    loss_recorded_at?: string | null
    loss_recorded_by?: string | null
}

type Meeting = Database['public']['Tables']['meetings']['Row']
type Snapshot = Database['public']['Tables']['forecast_snapshots']['Row']
type SnapshotTrend = 'up' | 'down' | 'flat' | 'na'
type SnapshotComparisonRow = {
    snapshot: Snapshot
    previous: Snapshot | null
    deltaProbability: number | null
    deltaProbabilityPct: number | null
    deltaMonthly: number | null
    deltaMonthlyPct: number | null
    deltaImplementation: number | null
    deltaImplementationPct: number | null
    deltaTotal: number | null
    deltaTotalPct: number | null
    deltaCloseDateDays: number | null
}

type CompanyData = {
    id: string
    nombre: string
    tamano: number
    ubicacion: string
    logo_url: string
    industria: string
    industria_id?: string
    industria_ids?: string[]
    industrias?: string[]
    website: string
    descripcion: string
}

interface ClientDetailViewProps {
    client: ClientData | null
    isOpen: boolean
    onClose: () => void
    onEditClient: (client: ClientData) => void
    onEditCompany: (company: CompanyData) => void
    onEmailClick: (email: string, name: string) => void
    userEmail?: string
}

export default function ClientDetailView({
    client,
    isOpen,
    onClose,
    onEditClient,
    onEditCompany,
    onEmailClick,
    userEmail
}: ClientDetailViewProps) {
    useBodyScrollLock(isOpen)
    const { theme } = useTheme()
    const [company, setCompany] = useState<CompanyData | null>(null)
    const [loadingCompany, setLoadingCompany] = useState(false)
    const [supabase] = useState(() => createClient())

    // Meetings & Snapshots State
    const [isMeetingModalOpen, setIsMeetingModalOpen] = useState(false)
    const [meetingCreationMode, setMeetingCreationMode] = useState<'schedule' | 'past_record'>('schedule')
    const [nextMeeting, setNextMeeting] = useState<Meeting | null>(null)
    const [snapshots, setSnapshots] = useState<Snapshot[]>([])
    const [snapshotOwnerProfilesById, setSnapshotOwnerProfilesById] = useState<Record<string, { fullName?: string | null, username?: string | null }>>({})
    const [isSnapshotsModalOpen, setIsSnapshotsModalOpen] = useState(false)
    const [currentUser, setCurrentUser] = useState<any>(null)
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false)
    const [taskKey, setTaskKey] = useState(0)
    const [lossReasonLabel, setLossReasonLabel] = useState<string | null>(null)
    const [lossSubreasonLabel, setLossSubreasonLabel] = useState<string | null>(null)
    const [isMeetingsPanelExpanded, setIsMeetingsPanelExpanded] = useState(false)
    const [companyMeetingsCount, setCompanyMeetingsCount] = useState(0)
    const [companyOtherLeadsCount, setCompanyOtherLeadsCount] = useState(0)

    useEffect(() => {
        if (client?.empresa_id) {
            fetchCompany(client.empresa_id)
        } else {
            setCompany(null)
        }

        if (client) {
            fetchMeetingsData()
            fetchCurrentUser()
            fetchLossLabels(client)
        }
        setIsMeetingsPanelExpanded(false)
        setIsSnapshotsModalOpen(false)
    }, [client])

    const sortedSnapshots = useMemo(
        () => [...snapshots].sort((a, b) => {
            const aTime = new Date(String(a.snapshot_timestamp || a.created_at || '')).getTime()
            const bTime = new Date(String(b.snapshot_timestamp || b.created_at || '')).getTime()
            return bTime - aTime
        }),
        [snapshots]
    )

    const parseSnapshotComparableDate = (value?: string | null) => {
        const normalized = String(value || '').trim()
        if (!normalized) return Number.NaN
        const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized)
        if (dateOnly) {
            const parsedDate = new Date(
                Number(dateOnly[1]),
                Number(dateOnly[2]) - 1,
                Number(dateOnly[3]),
                12,
                0,
                0,
                0
            )
            return Number.isFinite(parsedDate.getTime()) ? parsedDate.getTime() : Number.NaN
        }
        const parsed = new Date(normalized).getTime()
        return Number.isFinite(parsed) ? parsed : Number.NaN
    }

    const calculatePctDelta = (current: number, previous: number) => {
        if (!Number.isFinite(current) || !Number.isFinite(previous)) return null
        if (Math.abs(previous) < 0.00001) {
            return Math.abs(current) < 0.00001 ? 0 : null
        }
        return ((current - previous) / Math.abs(previous)) * 100
    }

    const snapshotComparisons = useMemo<SnapshotComparisonRow[]>(() => {
        return sortedSnapshots.map((snapshot, index) => {
            const previous = sortedSnapshots[index + 1] || null
            const currentProbability = Number(snapshot.probability || 0)
            const currentMonthly = Number(snapshot.forecast_value_amount || 0)
            const currentImplementation = Number(snapshot.forecast_implementation_amount || 0)
            const currentTotal = currentMonthly + currentImplementation

            if (!previous) {
                return {
                    snapshot,
                    previous: null,
                    deltaProbability: null,
                    deltaProbabilityPct: null,
                    deltaMonthly: null,
                    deltaMonthlyPct: null,
                    deltaImplementation: null,
                    deltaImplementationPct: null,
                    deltaTotal: null,
                    deltaTotalPct: null,
                    deltaCloseDateDays: null
                }
            }

            const previousProbability = Number(previous.probability || 0)
            const previousMonthly = Number(previous.forecast_value_amount || 0)
            const previousImplementation = Number(previous.forecast_implementation_amount || 0)
            const previousTotal = previousMonthly + previousImplementation
            const currentCloseDateTs = parseSnapshotComparableDate(snapshot.forecast_close_date)
            const previousCloseDateTs = parseSnapshotComparableDate(previous.forecast_close_date)
            const closeDateDeltaDays = Number.isFinite(currentCloseDateTs) && Number.isFinite(previousCloseDateTs)
                ? Math.round((Number(currentCloseDateTs) - Number(previousCloseDateTs)) / (1000 * 60 * 60 * 24))
                : null

            return {
                snapshot,
                previous,
                deltaProbability: currentProbability - previousProbability,
                deltaProbabilityPct: calculatePctDelta(currentProbability, previousProbability),
                deltaMonthly: currentMonthly - previousMonthly,
                deltaMonthlyPct: calculatePctDelta(currentMonthly, previousMonthly),
                deltaImplementation: currentImplementation - previousImplementation,
                deltaImplementationPct: calculatePctDelta(currentImplementation, previousImplementation),
                deltaTotal: currentTotal - previousTotal,
                deltaTotalPct: calculatePctDelta(currentTotal, previousTotal),
                deltaCloseDateDays: closeDateDeltaDays
            }
        })
    }, [sortedSnapshots])

    const snapshotComparisonById = useMemo(() => {
        const map = new Map<string, SnapshotComparisonRow>()
        snapshotComparisons.forEach((row) => {
            map.set(String(row.snapshot.id), row)
        })
        return map
    }, [snapshotComparisons])

    const snapshotGroupsByCaptureDate = useMemo(() => {
        const map = new Map<string, Snapshot[]>()

        sortedSnapshots.forEach((snapshot) => {
            const ts = new Date(String(snapshot.snapshot_timestamp || snapshot.created_at || ''))
            const key = Number.isFinite(ts.getTime())
                ? `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}-${String(ts.getDate()).padStart(2, '0')}`
                : 'sin-fecha'
            const current = map.get(key) || []
            current.push(snapshot)
            map.set(key, current)
        })

        return Array.from(map.entries()).map(([key, items]) => ({
            key,
            label: key === 'sin-fecha'
                ? 'Fecha de captura no disponible'
                : new Date(`${key}T12:00:00`).toLocaleDateString('es-MX', {
                    weekday: 'long',
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric'
                }),
            items
        }))
    }, [sortedSnapshots])

    const companyPrimaryIndustryBadgeVisual = useMemo(() => {
        if (!company) return null

        const primaryIndustryName = String(
            company.industria
            || (Array.isArray(company.industrias) ? company.industrias[0] : '')
            || ''
        ).trim()

        if (!primaryIndustryName) return null

        const normalizedName = primaryIndustryName
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '')

        const industryId = String(company.industria_id || `virtual-industry-${normalizedName || 'generic'}`)
        const visualMap = buildIndustryBadgeVisualMap([{ id: industryId, name: primaryIndustryName }])
        return getIndustryBadgeVisualFromMap(industryId, visualMap, primaryIndustryName)
    }, [company])
    const formatSnapshotDateTime = (value?: string | null) => {
        if (!value) return 'Sin fecha de captura'
        const dt = new Date(value)
        if (!Number.isFinite(dt.getTime())) return 'Sin fecha de captura'
        return dt.toLocaleString('es-MX', {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    const formatSnapshotDateOnly = (value?: string | null) => {
        if (!value) return 'Sin fecha pronosticada'
        const dt = new Date(value)
        if (!Number.isFinite(dt.getTime())) return 'Sin fecha pronosticada'
        return dt.toLocaleDateString('es-MX', {
            year: 'numeric',
            month: 'short',
            day: '2-digit'
        })
    }

    const formatSnapshotCurrency = (value?: number | null) => {
        if (value == null || Number.isNaN(Number(value))) return 'Sin dato'
        return `$${Number(value).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }

    const formatSignedPercent = (value: number | null | undefined) => {
        if (value == null || !Number.isFinite(value)) return 'N/D'
        const rounded = Number(value.toFixed(1))
        const sign = rounded > 0 ? '+' : ''
        return `${sign}${rounded.toFixed(1)}%`
    }

    const formatSignedPointsWithPercent = (points: number | null | undefined, pct: number | null | undefined) => {
        if (points == null || !Number.isFinite(points)) return 'Sin referencia'
        const rounded = Math.round(points)
        const sign = rounded > 0 ? '+' : ''
        const pctText = formatSignedPercent(pct)
        if (pctText === 'N/D') return `${sign}${rounded} pts`
        return `${sign}${rounded} pts (${pctText})`
    }

    const formatSignedCurrencyWithPercent = (amount: number | null | undefined, pct: number | null | undefined) => {
        if (amount == null || !Number.isFinite(amount)) return 'Sin referencia'
        const absAmount = `$${Math.abs(amount).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        const amountSign = amount > 0 ? '+' : amount < 0 ? '-' : ''
        const pctText = formatSignedPercent(pct)
        if (pctText === 'N/D') return `${amountSign}${absAmount}`
        return `${amountSign}${absAmount} (${pctText})`
    }

    const formatCloseDateShift = (value: number | null | undefined) => {
        if (value == null || !Number.isFinite(value)) return 'Sin referencia'
        if (value === 0) return 'Sin cambio'
        const absDays = Math.abs(Math.round(value))
        const dayWord = absDays === 1 ? 'día' : 'días'
        if (value > 0) return `+${absDays} ${dayWord} (más tarde)`
        return `-${absDays} ${dayWord} (más temprano)`
    }

    const getSnapshotDeltaTrend = (delta: number | null | undefined): SnapshotTrend => {
        if (delta == null || !Number.isFinite(delta)) return 'na'
        if (Math.abs(delta) < 0.00001) return 'flat'
        return delta > 0 ? 'up' : 'down'
    }

    const getSnapshotDeltaColor = (trend: SnapshotTrend, mode: 'value' | 'closeDate' = 'value') => {
        if (trend === 'na' || trend === 'flat') return 'var(--text-secondary)'
        if (mode === 'closeDate') {
            return trend === 'down' ? 'color-mix(in srgb, #10b981 72%, var(--text-primary))' : 'color-mix(in srgb, #f97316 72%, var(--text-primary))'
        }
        return trend === 'up'
            ? 'color-mix(in srgb, #2563eb 72%, var(--text-primary))'
            : 'color-mix(in srgb, #f97316 72%, var(--text-primary))'
    }

    const renderSnapshotTrendIcon = (trend: SnapshotTrend) => {
        if (trend === 'up') return <ArrowUpRight size={12} strokeWidth={2.5} />
        if (trend === 'down') return <ArrowDownRight size={12} strokeWidth={2.5} />
        return <Minus size={12} strokeWidth={2.5} />
    }

    const getSnapshotSourceLabel = (source?: string | null) => {
        const normalized = String(source || '').toLowerCase()
        if (normalized === 'meeting_confirmed_held') return 'Captura por junta confirmada'
        if (normalized === 'meeting_start_snapshot') return 'Captura al iniciar junta'
        return 'Captura de pronóstico'
    }

    const formatSnapshotOwnerDisplay = (raw?: string | null) => {
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

    const getSnapshotOwnerName = (snapshot?: Snapshot | null) => {
        const sellerId = String(snapshot?.seller_id || '').trim()
        if (sellerId) {
            const profile = snapshotOwnerProfilesById[sellerId]
            if (profile?.fullName) return profile.fullName
            if (profile?.username) return formatSnapshotOwnerDisplay(profile.username)
        }
        return formatSnapshotOwnerDisplay(client?.owner_username || null)
    }

    const fetchCompany = async (id: string) => {
        setLoadingCompany(true)
        const { data, error } = await supabase
            .from('empresas')
            .select('*')
            .eq('id', id)
            .single()

        if (!error && data) {
            setCompany(data)
        }
        setLoadingCompany(false)
    }

    const fetchCurrentUser = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        setCurrentUser(user)
    }

    const fetchMeetingsData = async () => {
        if (!client) return
        try {
            const companyStatsPromise = (async () => {
                let leadIds: number[] = []
                if (client.empresa_id) {
                    const { data: companyLeads, error: companyLeadsError } = await (supabase
                        .from('clientes') as any)
                        .select('id')
                        .eq('empresa_id', client.empresa_id)
                    if (companyLeadsError) throw companyLeadsError

                    leadIds = ((companyLeads || []) as Array<{ id: number | string }>)
                        .map((lead) => Number(lead.id))
                        .filter((leadId) => Number.isFinite(leadId))
                } else {
                    const companyName = String(client.empresa || '').trim()
                    if (companyName) {
                        const { data: companyLeadsByName, error: companyLeadsByNameError } = await (supabase
                            .from('clientes') as any)
                            .select('id')
                            .eq('empresa', companyName)
                        if (companyLeadsByNameError) throw companyLeadsByNameError

                        leadIds = ((companyLeadsByName || []) as Array<{ id: number | string }>)
                            .map((lead) => Number(lead.id))
                            .filter((leadId) => Number.isFinite(leadId))
                    }
                }

                const uniqueLeadIds = Array.from(new Set(leadIds))
                const hasCompanyLinkedLeads = uniqueLeadIds.length > 0
                const normalizedCurrentLeadId = Number(client.id)
                const otherLeadsCount = hasCompanyLinkedLeads
                    ? uniqueLeadIds.filter((leadId) => leadId !== normalizedCurrentLeadId).length
                    : 0

                if (!hasCompanyLinkedLeads) {
                    const { count, error: leadMeetingsError } = await (supabase
                        .from('meetings') as any)
                        .select('id', { count: 'exact', head: true })
                        .eq('lead_id', client.id)
                    if (leadMeetingsError) throw leadMeetingsError
                    return { meetingsCount: Number(count || 0), otherLeadsCount }
                }

                const { count, error: companyMeetingsError } = await (supabase
                    .from('meetings') as any)
                    .select('id', { count: 'exact', head: true })
                    .in('lead_id', uniqueLeadIds)
                if (companyMeetingsError) throw companyMeetingsError
                return { meetingsCount: Number(count || 0), otherLeadsCount }
            })()

            const [nextMtg, snaps, companyStats] = await Promise.all([
                getNextMeeting(client.id),
                getLeadSnapshots(client.id),
                companyStatsPromise
            ])
            setNextMeeting(nextMtg)
            setSnapshots(snaps)
            setCompanyMeetingsCount(Math.max(0, Number(companyStats.meetingsCount || 0)))
            setCompanyOtherLeadsCount(Math.max(0, Number(companyStats.otherLeadsCount || 0)))

            const sellerIds = Array.from(new Set(
                (snaps || [])
                    .map((snapshot) => String(snapshot?.seller_id || '').trim())
                    .filter(Boolean)
            ))
            if (sellerIds.length > 0) {
                const { data: profiles } = await (supabase.from('profiles') as any)
                    .select('id, full_name, username')
                    .in('id', sellerIds)
                const nextMap: Record<string, { fullName?: string | null, username?: string | null }> = {}
                ;((profiles || []) as any[]).forEach((row) => {
                    const id = String(row?.id || '')
                    if (!id) return
                    nextMap[id] = {
                        fullName: row?.full_name || null,
                        username: row?.username || null
                    }
                })
                setSnapshotOwnerProfilesById(nextMap)
            } else {
                setSnapshotOwnerProfilesById({})
            }
        } catch (error) {
            console.error('Error fetching meetings data:', error)
            setCompanyMeetingsCount(0)
            setCompanyOtherLeadsCount(0)
        }
    }

    const fetchLossLabels = async (clientRow: ClientData) => {
        const reasonId = (clientRow as any).loss_reason_id || null
        const subreasonId = (clientRow as any).loss_subreason_id || null

        if (!reasonId && !subreasonId) {
            setLossReasonLabel(null)
            setLossSubreasonLabel(null)
            return
        }

        try {
            const [reasonRes, subreasonRes] = await Promise.all([
                reasonId
                    ? (supabase.from('lead_loss_reasons') as any).select('label').eq('id', reasonId).maybeSingle()
                    : Promise.resolve({ data: null, error: null }),
                subreasonId
                    ? (supabase.from('lead_loss_subreasons') as any).select('label').eq('id', subreasonId).maybeSingle()
                    : Promise.resolve({ data: null, error: null })
            ])

            setLossReasonLabel((reasonRes as any)?.data?.label ? String((reasonRes as any).data.label) : null)
            setLossSubreasonLabel((subreasonRes as any)?.data?.label ? String((subreasonRes as any).data.label) : null)
        } catch {
            setLossReasonLabel(null)
            setLossSubreasonLabel(null)
        }
    }

    const handleCreateMeeting = async (meetingData: any) => {
        try {
            await createMeeting(meetingData)
            await fetchMeetingsData()
        } catch (error) {
            console.error('Error creating meeting:', error)
            throw error
        }
    }

    const handleCreateTask = async (taskData: any) => {
        try {
            const { error } = await supabase.from('tareas').insert({
                ...taskData,
                vendedor_id: currentUser?.id
            })
            if (error) throw error
            setTaskKey(prev => prev + 1)
            setIsTaskModalOpen(false)
        } catch (error: any) {
            alert('Error al crear tarea: ' + error.message)
        }
    }

    if (!isOpen || !client) return null
    const isLostLead = ['cerrado perdido', 'cerrada perdida'].includes(String(client.etapa || '').trim().toLowerCase())

    const headerTheme = {
        claro: {
            background: 'linear-gradient(135deg, #0A1635 0%, #0f2352 56%, #17306b 100%)',
            border: 'rgba(255,255,255,0.12)'
        },
        gris: {
            background: 'linear-gradient(135deg, #111827 0%, #1F2937 56%, #0F172A 100%)',
            border: 'rgba(255,255,255,0.08)'
        },
        oscuro: {
            background: 'linear-gradient(135deg, #070B14 0%, #0B1220 56%, #111827 100%)',
            border: 'rgba(255,255,255,0.08)'
        }
    }[theme]

    return (
        <div className='fixed inset-x-0 bottom-0 top-[70px] z-[130] bg-[var(--background)] flex flex-col animate-in slide-in-from-bottom duration-300'>
            {/* Header */}
            <div className='px-8 py-5 flex items-center justify-between shadow-xl shrink-0 border-b' style={{ background: headerTheme.background, borderBottomColor: headerTheme.border }}>
                <div className='space-y-0.5'>
                    <h1 className='text-2xl font-black text-white tracking-tight leading-none'>
                        {client.nombre}
                    </h1>
                    <p className='text-[10px] font-black text-blue-400 uppercase tracking-[0.2em]'>Ficha Detallada del Lead</p>
                </div>
                <div className='flex gap-4'>
                    <button
                        onClick={() => onEditClient(client)}
                        className='h-11 px-6 bg-[#2048FF] text-white rounded-2xl font-black hover:bg-[#1700AC] transition-all shadow-xl shadow-blue-500/20 flex items-center gap-2 transform active:scale-95 uppercase text-[10px] tracking-widest cursor-pointer'
                    >
                        <PencilLine size={14} /> Editar Lead
                    </button>
                    {company && (
                        <button
                            onClick={() => onEditCompany(company)}
                            className='h-11 px-6 bg-white/5 text-white rounded-2xl font-black hover:bg-white/10 transition-all border border-white/10 flex items-center gap-2 uppercase text-[10px] tracking-widest cursor-pointer'
                        >
                            <Building2 size={14} /> Catálogo
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className='h-11 px-6 rounded-2xl font-black transition-all border uppercase text-[10px] tracking-widest hover:brightness-110 hover:shadow-lg hover:scale-[1.02] active:scale-95'
                        style={{ background: 'var(--card-bg)', color: 'var(--text-primary)', borderColor: 'var(--card-border)' }}
                        title='Regresar'
                    >
                        Regresar
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className='flex-1 overflow-y-auto custom-scrollbar p-8 bg-[var(--background)]'>
                <div className='max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8'>

                    {/* Column 1: Lead Information */}
                    <div className='space-y-8'>
                        <div className='bg-[var(--card-bg)] p-8 rounded-[40px] shadow-2xl shadow-[#0A1635]/5 border border-[var(--card-border)]'>
                            <h2 className='text-xs font-black text-[var(--text-secondary)] mb-8 uppercase tracking-[0.3em] border-b border-[var(--card-border)] pb-4 flex items-center gap-2'>
                                <User size={14} style={{ color: 'var(--input-focus)' }} /> Información del Lead
                            </h2>

                            <div className='space-y-8'>
                                <div className='group'>
                                    <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest block mb-2 group-hover:text-blue-500 transition-colors'>Empresa (Lead)</label>
                                    <p className='text-[var(--text-primary)] font-black text-xl tracking-tight'>{client.empresa}</p>
                                    <p className='text-[10px] font-black uppercase tracking-widest mt-2' style={{ color: 'var(--text-secondary)' }}>
                                        Otros leads vinculados a esta empresa: <span style={{ color: 'var(--text-primary)' }}>{companyOtherLeadsCount}</span>
                                    </p>
                                </div>

                                <div>
                                    <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest block mb-2'>Contacto Directo</label>
                                    <div className='flex flex-wrap gap-2'>
                                        {client.email && (
                                            <button
                                                onClick={() => {
                                                    onEmailClick(client.email!, client.nombre || client.empresa)
                                                    import('@/app/actions/events').then(({ trackEvent }) => {
                                                        trackEvent({
                                                            eventType: 'call_finished', // Email is a form of contact
                                                            entityType: 'call',
                                                            entityId: client.id.toString(),
                                                            metadata: { type: 'email', to: client.email }
                                                        })
                                                    })
                                                }}
                                                className='px-4 py-2.5 rounded-2xl border font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 hover:brightness-95 cursor-pointer'
                                                style={{ background: 'color-mix(in srgb, #3b82f6 10%, var(--card-bg))', color: '#2563eb', borderColor: 'color-mix(in srgb, #3b82f6 24%, var(--card-border))' }}
                                            >
                                                <Mail size={14} /> {client.email}
                                            </button>
                                        )}
                                        {client.telefono && (
                                            <button
                                                onClick={() => {
                                                    const url = `https://wa.me/${client.telefono!.replace(/\D/g, '')}`
                                                    window.open(url, '_blank')
                                                    import('@/app/actions/events').then(({ trackEvent }) => {
                                                        trackEvent({
                                                            eventType: 'call_started',
                                                            entityType: 'call',
                                                            entityId: client.id.toString(),
                                                            metadata: { type: 'whatsapp', to: client.telefono }
                                                        })
                                                        // For WhatsApp we simulate immediate finish or just log the start
                                                        setTimeout(() => {
                                                            trackEvent({
                                                                eventType: 'call_finished',
                                                                entityType: 'call',
                                                                entityId: client.id.toString(),
                                                                metadata: { type: 'whatsapp', outcome: 'connected' }
                                                            })
                                                        }, 2000)
                                                    })
                                                }}
                                                className='px-4 py-2.5 rounded-2xl border font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 hover:brightness-95 cursor-pointer'
                                                style={{ background: 'color-mix(in srgb, #10b981 10%, var(--card-bg))', color: '#059669', borderColor: 'color-mix(in srgb, #10b981 24%, var(--card-border))' }}
                                            >
                                                <MessageCircle size={14} /> {client.telefono}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className='grid grid-cols-2 gap-6 pt-4 border-t border-[var(--card-border)]'>
                                    <div className='space-y-1.5'>
                                        <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest block'>Etapa Actual</label>
                                        <div className='inline-block'>
                                            <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border-2
                                                ${client.etapa === 'Cerrado Ganado' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                                    client.etapa === 'Negociación' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                                        client.etapa === 'Cerrado Perdido' ? 'bg-red-50 text-red-600 border-red-100' :
                                                            'bg-blue-50 text-blue-600 border-blue-100'}`}>
                                                {client.etapa}
                                            </span>
                                        </div>
                                    </div>
                                    <div className='space-y-1.5'>
                                        <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest block'>Calificación</label>
                                        <div className='text-lg font-bold flex gap-0.5'>
                                            {[1, 2, 3, 4, 5].map((star) => (
                                                <span key={star} style={{ color: star <= (client.calificacion || 0) ? '#f59e0b' : 'var(--card-border)' }}>
                                                    ★
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {isLostLead && (
                                    <div className='space-y-4 pt-4 border-t border-[var(--card-border)]'>
                                        <div className='rounded-3xl border p-4 space-y-3'
                                            style={{
                                                background: 'color-mix(in srgb, #ef4444 8%, var(--card-bg))',
                                                borderColor: 'color-mix(in srgb, #ef4444 22%, var(--card-border))'
                                            }}>
                                            <div className='flex items-center justify-between gap-3'>
                                                <label className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'color-mix(in srgb, #f87171 85%, white)' }}>
                                                    Razón de pérdida
                                                </label>
                                                {(client as any).loss_recorded_at && (
                                                    <span className='text-[9px] font-black uppercase tracking-wider'
                                                        style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
                                                        {new Date((client as any).loss_recorded_at).toLocaleDateString('es-MX')}
                                                    </span>
                                                )}
                                            </div>
                                            <div className='grid grid-cols-1 gap-3'>
                                                <div>
                                                    <p className='text-[9px] font-black uppercase tracking-wider mb-1'
                                                        style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                                                        Motivo
                                                    </p>
                                                    <p className='text-xs font-black' style={{ color: 'var(--text-primary)' }}>
                                                        {lossReasonLabel || 'Sin motivo registrado'}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className='text-[9px] font-black uppercase tracking-wider mb-1'
                                                        style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                                                        Submotivo
                                                    </p>
                                                    <p className='text-xs font-black' style={{ color: 'var(--text-primary)' }}>
                                                        {lossSubreasonLabel || 'Sin submotivo registrado'}
                                                    </p>
                                                </div>
                                                {((client as any).loss_notes || '').trim() && (
                                                    <div>
                                                        <p className='text-[9px] font-black uppercase tracking-wider mb-1'
                                                            style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                                                            Nota de pérdida
                                                        </p>
                                                        <p className='text-[11px] font-bold leading-relaxed whitespace-pre-wrap'
                                                            style={{ color: 'var(--text-primary)' }}>
                                                            {(client as any).loss_notes}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className='space-y-3 pt-4 border-t border-[var(--card-border)]'>
                                    <div className='flex justify-between items-end'>
                                        <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest'>Confianza de Cierre</label>
                                        <span
                                            className='text-xl font-black'
                                            style={{ color: getForecastColor((client as any).probabilidad || 0) }}
                                        >
                                            {(client as any).probabilidad || 0}%
                                        </span>
                                    </div>
                                    <div className='h-3 rounded-full overflow-hidden p-0.5 border shadow-inner' style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}>
                                        <div
                                            className='h-full rounded-full transition-all duration-1000'
                                            style={{
                                                width: `${(client as any).probabilidad || 0}%`,
                                                backgroundColor: getForecastColor((client as any).probabilidad || 0)
                                            }}
                                        />
                                    </div>
                                </div>

                                <div className='pt-6 border-t border-[var(--card-border)]'>
                                    <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest block mb-1'>Valor del Negocio</label>
                                    <p className='text-3xl font-black text-[var(--text-primary)] tracking-tight'>
                                        {client?.valor_estimado == null
                                            ? 'N/D'
                                            : (
                                                <>
                                                    <span className='text-blue-600 mr-1'>$</span>
                                                    {client.valor_estimado.toLocaleString()}
                                                </>
                                            )}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className='bg-[var(--card-bg)] p-8 rounded-[40px] shadow-2xl shadow-[#0A1635]/5 border border-[var(--card-border)]'>
                            <h2 className='text-xs font-black text-[var(--text-secondary)] mb-6 uppercase tracking-[0.3em] border-b border-[var(--card-border)] pb-4 flex items-center gap-2'>
                                <NotebookPen size={14} style={{ color: 'var(--input-focus)' }} /> Notas y Estrategia
                            </h2>
                            <div className='space-y-6'>
                                <div>
                                    <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest block mb-2'>Oportunidad Detectada</label>
                                    <p className='text-xs font-bold text-[var(--text-primary)] leading-relaxed bg-[var(--hover-bg)] p-4 rounded-3xl border border-[var(--card-border)]'>{client.oportunidad || 'Sin descripción de oportunidad.'}</p>
                                </div>
                                <div className='relative'>
                                    <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest block mb-2'>Notas Internas</label>
                                    <div className='p-4 rounded-3xl border' style={{ background: 'color-mix(in srgb, #f59e0b 8%, var(--card-bg))', borderColor: 'color-mix(in srgb, #f59e0b 22%, var(--card-border))' }}>
                                        <p className='text-[11px] font-bold italic leading-loose whitespace-pre-wrap' style={{ color: 'color-mix(in srgb, #b45309 72%, var(--text-primary))' }}>
                                            {client.notas || 'No se han agregado notas adicionales aún.'}
                                        </p>
                                    </div>
                                    <NotebookPen size={16} className='absolute top-3 right-4 opacity-35' style={{ color: 'var(--text-secondary)' }} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Column 2: Activities Hub */}
                    <div className='space-y-8'>
                        <div className='bg-[var(--card-bg)] p-8 rounded-[40px] shadow-2xl shadow-[#0A1635]/5 border border-[var(--card-border)] flex flex-col'>
                            <div className='flex justify-between items-center mb-8 border-b border-[var(--card-border)] pb-4'>
                                <h2 className='text-xs font-black text-[var(--text-secondary)] uppercase tracking-[0.3em] flex items-center gap-2'>
                                    <CalendarDays size={14} style={{ color: 'var(--input-focus)' }} /> Juntas Agendadas
                                </h2>
                                <div className='flex items-center gap-2'>
                                    <button
                                        type='button'
                                        onClick={() => setIsMeetingsPanelExpanded((prev) => !prev)}
                                        className='h-10 px-3 rounded-2xl border border-[var(--card-border)] bg-[var(--background)] text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-primary)] hover:border-blue-400 hover:text-blue-500 transition-colors inline-flex items-center gap-1.5 cursor-pointer'
                                    >
                                        {isMeetingsPanelExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                        {isMeetingsPanelExpanded ? 'Ocultar' : 'Mostrar'}
                                    </button>
                                    <button
                                        onClick={() => {
                                            setMeetingCreationMode('schedule')
                                            setIsMeetingModalOpen(true)
                                        }}
                                        className='w-10 h-10 rounded-2xl flex items-center justify-center transition-all transform hover:scale-105 shadow-sm cursor-pointer'
                                        style={{ background: 'color-mix(in srgb, var(--input-focus) 10%, var(--card-bg))', color: 'var(--input-focus)' }}
                                        title='Agendar junta'
                                    >
                                        <Plus size={18} />
                                    </button>
                                    <button
                                        onClick={() => {
                                            setMeetingCreationMode('past_record')
                                            setIsMeetingModalOpen(true)
                                        }}
                                        className='h-10 px-3 rounded-2xl flex items-center justify-center gap-1.5 transition-all transform hover:scale-105 shadow-sm cursor-pointer text-[10px] font-black uppercase tracking-[0.12em]'
                                        style={{ background: 'color-mix(in srgb, #10b981 10%, var(--card-bg))', color: 'color-mix(in srgb, #10b981 78%, var(--text-primary))' }}
                                        title='Registrar junta realizada'
                                    >
                                        <CheckCircle2 size={14} />
                                        Realizada
                                    </button>
                                </div>
                            </div>

                            {isMeetingsPanelExpanded ? (
                                <div className='flex-1 min-h-[300px]'>
                                    <MeetingsList
                                        leadId={client.id}
                                        onRefresh={fetchMeetingsData}
                                    />
                                </div>
                            ) : (
                                <div className='flex-1 min-h-[88px] flex items-center'>
                                    <div className='w-full rounded-3xl border border-[var(--card-border)] bg-[var(--hover-bg)] px-4 py-3'>
                                        <p className='text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]'>
                                            Total de juntas de esta empresa
                                        </p>
                                        <p className='mt-1 text-lg font-black text-[var(--text-primary)] tracking-tight'>
                                            {companyMeetingsCount.toLocaleString('es-MX')} {companyMeetingsCount === 1 ? 'junta' : 'juntas'}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className='bg-[var(--card-bg)] p-8 rounded-[40px] shadow-2xl shadow-[#0A1635]/5 border border-[var(--card-border)] flex flex-col'>
                            <div className='flex justify-between items-center mb-8 border-b border-[var(--card-border)] pb-4'>
                                <h2 className='text-xs font-black text-[var(--text-secondary)] uppercase tracking-[0.3em] flex items-center gap-2'>
                                    <CheckSquare size={14} style={{ color: 'var(--input-focus)' }} /> Tareas Pendientes
                                </h2>
                                <button
                                    onClick={() => setIsTaskModalOpen(true)}
                                    className='w-10 h-10 rounded-2xl flex items-center justify-center transition-all transform hover:scale-105 shadow-sm cursor-pointer'
                                    style={{ background: 'color-mix(in srgb, #8b5cf6 10%, var(--card-bg))', color: '#8b5cf6' }}
                                >
                                    <Plus size={18} />
                                </button>
                            </div>

                            <div className='flex-1 min-h-[300px]'>
                                <TasksList
                                    key={taskKey}
                                    leadId={client.id}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Column 3: Company & Intelligence */}
                    <div className='space-y-8'>
                        {/* Company Card */}
                        <div className='bg-[var(--card-bg)] p-8 rounded-[40px] shadow-2xl shadow-[#0A1635]/5 border border-[var(--card-border)] overflow-hidden'>
                            <h2 className='text-xs font-black text-[var(--text-secondary)] mb-8 uppercase tracking-[0.3em] border-b border-[var(--card-border)] pb-4 flex items-center gap-2'>
                                <Building2 size={14} style={{ color: 'var(--input-focus)' }} /> Perfil Corporativo
                            </h2>

                            {loadingCompany ? (
                                <div className='py-12 flex flex-col items-center justify-center gap-4'>
                                    <div className='w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin'></div>
                                    <p className='text-[10px] font-black text-[var(--text-secondary)] uppercase animate-pulse'>Sincronizando...</p>
                                </div>
                            ) : company ? (
                                <div className='space-y-8'>
                                    <div className='flex items-center gap-6'>
                                        <div className='w-24 h-24 rounded-3xl border-2 border-[var(--card-border)] shadow-xl overflow-hidden flex items-center justify-center bg-[var(--hover-bg)] shrink-0 transform -rotate-3'>
                                            {company.logo_url ? (
                                                <img src={company.logo_url} alt={company.nombre} className='w-full h-full object-cover' />
                                            ) : (
                                                <Building2 size={36} style={{ color: 'var(--input-focus)' }} />
                                            )}
                                        </div>
                                        <div className='space-y-1 min-w-0 flex-1'>
                                            <div className='flex items-center justify-between gap-3'>
                                                <h3 className='text-xl font-black text-[var(--text-primary)] leading-tight tracking-tight truncate'>{company.nombre}</h3>
                                                {companyPrimaryIndustryBadgeVisual ? (
                                                    <span
                                                        className='w-10 h-10 rounded-2xl border-2 border-[var(--card-border)] shadow-sm flex items-center justify-center shrink-0'
                                                        style={{ background: 'color-mix(in srgb, var(--input-focus) 32%, var(--hover-bg))' }}
                                                        title={`Badge industria: ${company.industria || 'Industria'}`}
                                                        aria-hidden='true'
                                                    >
                                                        <companyPrimaryIndustryBadgeVisual.icon size={15} className='text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]' />
                                                    </span>
                                                ) : null}
                                            </div>
                                            <p className='text-[10px] font-black text-blue-500 uppercase tracking-widest'>{company.industria}</p>
                                            {!!company.industrias?.length && (
                                                <div className='flex flex-wrap gap-1.5'>
                                                    {company.industrias.map((industry) => (
                                                        <span
                                                            key={industry}
                                                            className='px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-500 border border-blue-500/20'
                                                        >
                                                            {industry}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                            {company.website && (
                                                <a href={company.website.startsWith('http') ? company.website : `https://${company.website}`} target='_blank' className='text-[10px] font-bold transition-colors flex items-center gap-1.5 w-fit cursor-pointer' style={{ color: 'var(--text-secondary)' }} onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--input-focus)')} onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}><Link2 size={12} /> {company.website}</a>
                                            )}
                                        </div>
                                    </div>

                                    <div className='grid grid-cols-2 gap-4'>
                                        <div className='bg-[var(--hover-bg)] p-4 rounded-3xl border border-[var(--card-border)] flex flex-col justify-between'>
                                            <label className='text-[9px] font-black text-[var(--text-secondary)] uppercase tracking-[0.2em] mb-3 block'>Score de Tamaño</label>
                                            <div className='flex items-center gap-2'>
                                                <span className='text-3xl font-black text-[#2048FF] leading-none'>{company.tamano}</span>
                                                <div className='flex-1 flex gap-1 h-2'>
                                                    {[1, 2, 3, 4, 5].map(i => (
                                                        <div key={i} className={`flex-1 rounded-full ${i <= company.tamano ? 'bg-[#2048FF]' : 'bg-[var(--background)]'}`} />
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                        <div className='bg-[var(--hover-bg)] p-4 rounded-3xl border border-[var(--card-border)]'>
                                            <label className='text-[9px] font-black text-[var(--text-secondary)] uppercase tracking-[0.2em] mb-3 block'>Ubicación Central</label>
                                            <p className='text-[10px] font-black text-[var(--text-primary)] leading-relaxed break-words'>{company.ubicacion || 'Global / Multinacional'}</p>
                                        </div>
                                    </div>

                                    <div className='bg-[var(--hover-bg)] p-6 rounded-3xl border border-[var(--card-border)] relative group'>
                                        <label className='text-[9px] font-black text-[var(--text-secondary)] uppercase tracking-[0.2em] mb-3 block'>Historia de Empresa</label>
                                        <p className='text-[11px] font-bold text-[var(--text-secondary)] leading-loose max-h-[120px] overflow-y-auto custom-scrollbar pr-2'>
                                            {company.descripcion || 'No hay una biografía corporativa disponible en este momento.'}
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={() => onEditClient(client)}
                                    className='w-full py-12 flex flex-col items-center justify-center gap-4 rounded-[40px] border-2 border-dashed transition-all group cursor-pointer'
                                    style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)', color: 'var(--text-secondary)' }}
                                >
                                    <div className='w-16 h-16 bg-[var(--card-bg)] rounded-full flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform'><Building2 size={30} style={{ color: 'var(--input-focus)' }} /></div>
                                    <span className='text-[10px] font-black uppercase tracking-[0.3em]'>Vincular Empresa</span>
                                </button>
                            )}
                        </div>

                        {/* Audit & Intelligence */}
                        {client.forecast_scored_at && (
                            <div className='bg-gradient-to-br from-[#0F2A44] to-[#1700AC] p-8 rounded-[40px] shadow-2xl shadow-blue-900/40 border border-white/10 text-white relative overflow-hidden group'>
                                <div className='absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-white/10 transition-all'></div>
                                <h2 className='text-xs font-black mb-8 border-b border-white/10 pb-4 uppercase tracking-[0.3em] flex items-center gap-2'>
                                    <BarChart3 size={14} className='text-blue-300' /> Análisis de IA
                                </h2>
                                <div className='space-y-8'>
                                    <div className='flex justify-between items-center'>
                                        <div>
                                            <label className='text-[10px] font-black text-blue-300 uppercase tracking-widest block mb-1'>Métrica Log Loss</label>
                                            <p className='text-[9px] font-bold text-white/40 uppercase tracking-widest'>{(client.forecast_logloss ?? 1) < 0.2 ? 'Excelente Precisión' : 'Revisión Necesaria'}</p>
                                        </div>
                                        <div className='text-right'>
                                            <span className={`text-4xl font-black tabular-nums ${(client.forecast_logloss ?? 1) < 0.2 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                {client.forecast_logloss?.toFixed(4) || '0.0000'}
                                            </span>
                                        </div>
                                    </div>

                                    <div className='grid grid-cols-2 gap-6'>
                                        <div className='bg-white/5 p-4 rounded-3xl border border-white/5'>
                                            <label className='text-[9px] font-black text-blue-300 uppercase tracking-widest block mb-2'>Prob. IA</label>
                                            <p className='text-2xl font-black'>{client.forecast_evaluated_probability}%</p>
                                        </div>
                                        <div className='bg-white/5 p-4 rounded-3xl border border-white/5'>
                                            <label className='text-[9px] font-black text-blue-300 uppercase tracking-widest block mb-2'>Estado Final</label>
                                            <p className={`text-xs font-black uppercase tracking-widest py-1.5 rounded-lg text-center ${client.forecast_outcome === 1 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                                {client.forecast_outcome === 1 ? 'Ganada' : 'Perdida'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className='pt-6 border-t border-white/5 flex items-center justify-between opacity-50 hover:opacity-100 transition-opacity'>
                                        <span className='text-[9px] font-black uppercase tracking-widest'>Última Auditoría</span>
                                        <span className='text-[9px] font-bold'>{new Date(client.forecast_scored_at).toLocaleDateString()}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Snapshots Columnar */}
                        <div className='bg-[var(--card-bg)] p-8 rounded-[40px] shadow-2xl shadow-[#0A1635]/5 border border-[var(--card-border)]'>
                            <div className='mb-6 border-b border-[var(--card-border)] pb-4 flex items-center justify-between gap-3'>
                                <h2 className='text-xs font-black text-[var(--text-secondary)] uppercase tracking-[0.3em] flex items-center gap-2'>
                                    <Camera size={14} style={{ color: 'var(--input-focus)' }} /> Snapshots
                                </h2>
                                <button
                                    type='button'
                                    onClick={() => setIsSnapshotsModalOpen(true)}
                                    className='px-3 py-1.5 rounded-xl border border-[var(--card-border)] bg-[var(--background)] text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-primary)] hover:border-blue-400 hover:text-blue-500 transition-colors cursor-pointer'
                                >
                                    Abrir Popup
                                </button>
                            </div>
                            <div className='space-y-4 max-h-[300px] overflow-y-auto custom-scrollbar pr-3'>
                                {sortedSnapshots.length === 0 ? (
                                    <div className='rounded-2xl border border-[var(--card-border)] bg-[var(--hover-bg)] p-5 text-center text-[var(--text-secondary)] text-sm font-bold'>
                                        Sin snapshots por ahora.
                                    </div>
                                ) : (
                                    sortedSnapshots.slice(0, 3).map((snapshot) => (
                                        <div key={snapshot.id} className='flex justify-between items-center p-4 bg-[var(--hover-bg)] rounded-3xl border border-[var(--card-border)] group hover:border-blue-100 hover:bg-[var(--card-bg)] transition-all'>
                                            <div className='space-y-1'>
                                                <p className='text-[10px] font-black text-[var(--text-primary)] uppercase tracking-widest group-hover:text-blue-600 transition-colors'>Corte #{snapshot.snapshot_number}</p>
                                                <p className='text-[9px] font-bold text-[var(--text-secondary)] uppercase'>
                                                    {formatSnapshotDateTime(snapshot.snapshot_timestamp || snapshot.created_at)}
                                                </p>
                                                <p className='text-[9px] font-bold text-[var(--text-secondary)]'>
                                                    Usuario: {getSnapshotOwnerName(snapshot)}
                                                </p>
                                                <p className='text-[9px] font-bold text-[var(--text-secondary)]'>
                                                    Mensualidad: {formatSnapshotCurrency(snapshot.forecast_value_amount)}
                                                </p>
                                                <p className='text-[9px] font-bold text-[var(--text-secondary)]'>
                                                    Implementación: {formatSnapshotCurrency(snapshot.forecast_implementation_amount)}
                                                </p>
                                            </div>
                                            <div className='h-10 w-10 bg-[var(--card-bg)] rounded-2xl flex items-center justify-center border border-[var(--card-border)] shadow-sm'>
                                                <span className='text-xs font-black text-[var(--text-primary)]'>
                                                    {snapshot.probability}%
                                                </span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                            {sortedSnapshots.length > 3 && (
                                <p className='mt-4 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--text-secondary)]'>
                                    Mostrando 3 de {sortedSnapshots.length} capturas · abre el popup para ver todo
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Modals */}
            {currentUser && (
                <MeetingModal
                    isOpen={isMeetingModalOpen}
                    onClose={() => {
                        setIsMeetingModalOpen(false)
                        setMeetingCreationMode('schedule')
                    }}
                    onSave={handleCreateMeeting}
                    leadId={client.id}
                    sellerId={client.owner_id || currentUser.id}
                    creationMode={meetingCreationMode}
                    leadContactSeed={{
                        contactName: client.contacto || client.nombre || null,
                        contactEmail: client.email || null,
                        contactPhone: client.telefono || null,
                        companyId: client.empresa_id || null,
                        companyName: client.empresa || null,
                        leadName: client.nombre || null
                    }}
                />
            )}
            <TaskModal
                isOpen={isTaskModalOpen}
                onClose={() => setIsTaskModalOpen(false)}
                onSave={handleCreateTask}
                leadId={client.id}
                mode='create'
            />

            {isSnapshotsModalOpen && (
                <div className='ah-modal-overlay z-[210]'>
                    <div className='ah-modal-panel w-full max-w-5xl'>
                        <div className='ah-modal-header'>
                            <div>
                                <h3 className='ah-modal-title text-lg flex items-center gap-2'>
                                    <Camera size={16} /> Snapshots de Pronóstico
                                </h3>
                                <p className='ah-modal-subtitle'>
                                    {client.nombre || client.empresa || 'Lead'} · {sortedSnapshots.length} captura(s)
                                </p>
                            </div>
                            <button
                                className='ah-modal-close cursor-pointer'
                                onClick={() => setIsSnapshotsModalOpen(false)}
                                aria-label='Cerrar snapshots'
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className='p-5 overflow-y-auto custom-scrollbar space-y-5'>
                            <div className='rounded-2xl border border-[var(--card-border)] bg-[var(--hover-bg)] px-4 py-3'>
                                <p className='text-xs font-black text-[var(--text-primary)]'>
                                    Cada captura incluye: probabilidad de cierre, monto pronosticado mensual, monto pronosticado de implementación y fecha pronosticada de cierre.
                                </p>
                            </div>

                            {snapshotGroupsByCaptureDate.length === 0 ? (
                                <div className='py-10 text-center text-[var(--text-secondary)] font-bold rounded-2xl border border-[var(--card-border)] bg-[var(--hover-bg)]'>
                                    Aún no hay snapshots registrados para este lead.
                                </div>
                            ) : (
                                <div className='space-y-6'>
                                    {snapshotGroupsByCaptureDate.map((group) => (
                                        <div key={group.key} className='space-y-3'>
                                            <p className='text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-secondary)]'>
                                                {group.label}
                                            </p>
                                            <div className='space-y-3'>
                                                {group.items.map((snapshot) => (
                                                    (() => {
                                                        const comparison = snapshotComparisonById.get(String(snapshot.id))
                                                        const hasPrevious = Boolean(comparison?.previous)
                                                        const totalForecast = Number(snapshot.forecast_value_amount || 0) + Number(snapshot.forecast_implementation_amount || 0)
                                                        const probabilityTrend = getSnapshotDeltaTrend(comparison?.deltaProbability)
                                                        const monthlyTrend = getSnapshotDeltaTrend(comparison?.deltaMonthly)
                                                        const implementationTrend = getSnapshotDeltaTrend(comparison?.deltaImplementation)
                                                        const closeDateTrend = getSnapshotDeltaTrend(comparison?.deltaCloseDateDays)
                                                        const totalTrend = getSnapshotDeltaTrend(comparison?.deltaTotal)

                                                        return (
                                                            <div key={snapshot.id} className='rounded-2xl border border-[var(--card-border)] bg-[var(--hover-bg)] p-4'>
                                                                <div className='flex items-start justify-between gap-3'>
                                                                    <div className='min-w-0'>
                                                                        <p className='text-sm font-black text-[var(--text-primary)] truncate'>
                                                                            Corte #{snapshot.snapshot_number}
                                                                        </p>
                                                                        <p className='text-[10px] font-black uppercase tracking-[0.12em] text-[var(--text-secondary)] mt-1'>
                                                                            {getSnapshotSourceLabel(snapshot.source)}
                                                                        </p>
                                                                        <p className='text-xs font-bold text-[var(--text-secondary)] mt-1'>
                                                                            Fecha de captura: {formatSnapshotDateTime(snapshot.snapshot_timestamp || snapshot.created_at)}
                                                                        </p>
                                                                        <p className='text-xs font-bold text-[var(--text-secondary)] mt-1'>
                                                                            Usuario: {getSnapshotOwnerName(snapshot)}
                                                                        </p>
                                                                    </div>
                                                                    <span className='shrink-0 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-1 text-xs font-black text-[var(--text-primary)]'>
                                                                        {snapshot.probability}%
                                                                    </span>
                                                                </div>

                                                                {hasPrevious ? (
                                                                    <p className='mt-3 text-[10px] font-black uppercase tracking-[0.13em] text-[var(--text-secondary)]'>
                                                                        Comparado vs corte #{comparison?.previous?.snapshot_number} · {formatSnapshotDateTime(comparison?.previous?.snapshot_timestamp || comparison?.previous?.created_at)}
                                                                    </p>
                                                                ) : (
                                                                    <p className='mt-3 text-[10px] font-black uppercase tracking-[0.13em] text-[var(--text-secondary)]'>
                                                                        Snapshot base (sin referencia previa)
                                                                    </p>
                                                                )}

                                                                <div className='mt-2 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2 text-xs'>
                                                                    <div className='rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2'>
                                                                        <p className='text-[10px] font-black uppercase tracking-[0.12em] text-[var(--text-secondary)]'>Probabilidad</p>
                                                                        <p className='font-black text-[var(--text-primary)]'>{snapshot.probability}%</p>
                                                                        {hasPrevious && (
                                                                            <p className='mt-1 text-[10px] font-black inline-flex items-center gap-1.5' style={{ color: getSnapshotDeltaColor(probabilityTrend) }}>
                                                                                {renderSnapshotTrendIcon(probabilityTrend)}
                                                                                <span>{formatSignedPointsWithPercent(comparison?.deltaProbability, comparison?.deltaProbabilityPct)}</span>
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                    <div className='rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2'>
                                                                        <p className='text-[10px] font-black uppercase tracking-[0.12em] text-[var(--text-secondary)]'>Forecast Mensualidad</p>
                                                                        <p className='font-black text-[var(--text-primary)]'>{formatSnapshotCurrency(snapshot.forecast_value_amount)}</p>
                                                                        {hasPrevious && (
                                                                            <p className='mt-1 text-[10px] font-black inline-flex items-center gap-1.5' style={{ color: getSnapshotDeltaColor(monthlyTrend) }}>
                                                                                {renderSnapshotTrendIcon(monthlyTrend)}
                                                                                <span>{formatSignedCurrencyWithPercent(comparison?.deltaMonthly, comparison?.deltaMonthlyPct)}</span>
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                    <div className='rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2'>
                                                                        <p className='text-[10px] font-black uppercase tracking-[0.12em] text-[var(--text-secondary)]'>Forecast Implementación</p>
                                                                        <p className='font-black text-[var(--text-primary)]'>{formatSnapshotCurrency(snapshot.forecast_implementation_amount)}</p>
                                                                        {hasPrevious && (
                                                                            <p className='mt-1 text-[10px] font-black inline-flex items-center gap-1.5' style={{ color: getSnapshotDeltaColor(implementationTrend) }}>
                                                                                {renderSnapshotTrendIcon(implementationTrend)}
                                                                                <span>{formatSignedCurrencyWithPercent(comparison?.deltaImplementation, comparison?.deltaImplementationPct)}</span>
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                    <div className='rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2'>
                                                                        <p className='text-[10px] font-black uppercase tracking-[0.12em] text-[var(--text-secondary)]'>Fecha Cierre Forecast</p>
                                                                        <p className='font-black text-[var(--text-primary)]'>{formatSnapshotDateOnly(snapshot.forecast_close_date)}</p>
                                                                        {hasPrevious && (
                                                                            <p className='mt-1 text-[10px] font-black inline-flex items-center gap-1.5' style={{ color: getSnapshotDeltaColor(closeDateTrend, 'closeDate') }}>
                                                                                {renderSnapshotTrendIcon(closeDateTrend)}
                                                                                <span>{formatCloseDateShift(comparison?.deltaCloseDateDays)}</span>
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {hasPrevious && (
                                                                    <div
                                                                        className='mt-2 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2 flex flex-wrap items-center justify-between gap-2'
                                                                    >
                                                                        <p className='text-[10px] font-black uppercase tracking-[0.12em] text-[var(--text-secondary)]'>Total Forecast</p>
                                                                        <p className='text-xs font-black text-[var(--text-primary)]'>{formatSnapshotCurrency(totalForecast)}</p>
                                                                        <p className='text-[10px] font-black inline-flex items-center gap-1.5' style={{ color: getSnapshotDeltaColor(totalTrend) }}>
                                                                            {renderSnapshotTrendIcon(totalTrend)}
                                                                            <span>{formatSignedCurrencyWithPercent(comparison?.deltaTotal, comparison?.deltaTotalPct)}</span>
                                                                        </p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )
                                                    })()
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className='px-5 py-4 border-t border-[var(--card-border)] flex items-center justify-end'>
                            <button
                                onClick={() => setIsSnapshotsModalOpen(false)}
                                className='h-10 px-4 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--text-primary)] text-[10px] font-black uppercase tracking-[0.14em] cursor-pointer'
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function getForecastColor(probability: number) {
    const clamped = Math.max(0, Math.min(100, probability))
    // 0 -> red, 100 -> green, with orange/yellow in between.
    const hue = (clamped / 100) * 120
    return `hsl(${hue} 92% 45%)`
}
