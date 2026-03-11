'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { getIndustryApprovalQueue, resolveIndustryApprovalRequest } from '@/app/actions/catalogs'
import { getPendingQuoteRequestsForAdmin, reviewQuoteRequest } from '@/app/actions/quotes'
import { getCrmAuditLog, getCrmAuditSummary } from '@/app/actions/audit'
import { fromLocalISOString, toLocalISOString } from '@/lib/dateUtils'
import { Activity, Check, CheckCircle2, Factory, Loader2, MessageSquareQuote, ShieldCheck, Shuffle, X, XCircle } from 'lucide-react'

type IndustryOption = {
    id: string
    name: string
    is_active?: boolean
}

type IndustryWithoutBadge = {
    id: string
    name: string
    is_active?: boolean
}

type PendingIndustryRequest = {
    id: string
    proposed_name: string
    requested_by_name: string
    context_module?: string
    context_entity_name?: string
    context_entity_type?: string
    created_at?: string
    impacted_companies_count?: number
    impacted_pre_leads_count?: number
    impacted_companies_sample?: string[]
    impacted_pre_leads_sample?: string[]
}

type QuoteRequestRow = {
    id: number
    quote_text: string
    quote_author: string
    quote_author_context: string | null
    quote_source: string | null
    contributed_by_name: string
    created_at: string
    requester_name: string
    requester_email: string | null
}

type AuditLogRow = {
    id: number
    event_type: string
    entity_type: string
    entity_id: string
    actor_user_id: string | null
    event_source: string
    before_data: Record<string, any> | null
    after_data: Record<string, any> | null
    context_data: Record<string, any> | null
    created_at: string
}

type AuditFilterState = {
    eventType: string
    entityType: string
    entityId: string
    actorUserId: string
    fromLocal: string
    toLocal: string
}

const normalizeSignature = (value: unknown) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

const formatContextLabel = (request: PendingIndustryRequest) => {
    const contextType = String(request.context_entity_type || '').trim().toLowerCase()
    const contextName = String(request.context_entity_name || '').trim()
    if (!contextName) return 'Sin contexto específico'
    if (contextType === 'pre_lead') return `Suspect: ${contextName}`
    if (contextType === 'company') return `Empresa: ${contextName}`
    return contextName
}

const formatDateTime = (value?: string) => {
    if (!value) return 'Sin fecha'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return 'Sin fecha'
    return date.toLocaleString('es-MX', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    })
}

const AUDIT_EVENT_LABELS: Record<string, string> = {
    lead_created: 'Lead creado',
    lead_updated: 'Lead actualizado',
    lead_stage_changed: 'Etapa de lead',
    lead_closed: 'Lead cerrado',
    lead_deleted: 'Lead eliminado',
    lead_forecast_updated: 'Pronóstico actualizado',
    lead_reassigned: 'Lead reasignado',
    meeting_scheduled: 'Junta agendada',
    meeting_updated: 'Junta actualizada',
    meeting_rescheduled: 'Junta reagendada',
    meeting_confirmed_held: 'Junta confirmada realizada',
    meeting_confirmed_not_held: 'Junta no realizada/cancelada',
    meeting_deleted: 'Junta eliminada',
    forecast_snapshot_created: 'Snapshot de pronóstico'
}

const AUDIT_ENTITY_LABELS: Record<string, string> = {
    lead: 'Lead',
    meeting: 'Junta',
    forecast_snapshot: 'Snapshot'
}

const formatAuditEventLabel = (eventType: unknown) => {
    const key = String(eventType || '').trim().toLowerCase()
    return AUDIT_EVENT_LABELS[key] || key || 'Evento'
}

const formatAuditEntityLabel = (entityType: unknown) => {
    const key = String(entityType || '').trim().toLowerCase()
    return AUDIT_ENTITY_LABELS[key] || key || 'Entidad'
}

export default function SettingsApprovalsPanel() {
    const { user, profile, loading: authLoading } = useAuth()
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [savingRequestId, setSavingRequestId] = useState<string | null>(null)
    const [pendingRequests, setPendingRequests] = useState<PendingIndustryRequest[]>([])
    const [industryCatalog, setIndustryCatalog] = useState<IndustryOption[]>([])
    const [industriesWithoutBadge, setIndustriesWithoutBadge] = useState<IndustryWithoutBadge[]>([])
    const [pendingCount, setPendingCount] = useState(0)
    const [selectedExistingByRequest, setSelectedExistingByRequest] = useState<Record<string, string>>({})
    const [newNameByRequest, setNewNameByRequest] = useState<Record<string, string>>({})
    const [quoteRequests, setQuoteRequests] = useState<QuoteRequestRow[]>([])
    const [reviewingQuoteRequestId, setReviewingQuoteRequestId] = useState<number | null>(null)
    const [auditRows, setAuditRows] = useState<AuditLogRow[]>([])
    const [auditLoading, setAuditLoading] = useState(false)
    const [auditRefreshing, setAuditRefreshing] = useState(false)
    const [auditTotalEvents, setAuditTotalEvents] = useState(0)
    const [auditByEventType, setAuditByEventType] = useState<{ eventType: string, count: number }[]>([])
    const [auditByEntityType, setAuditByEntityType] = useState<{ entityType: string, count: number }[]>([])
    const [auditEventTypeFilter, setAuditEventTypeFilter] = useState('')
    const [auditEntityTypeFilter, setAuditEntityTypeFilter] = useState('')
    const [auditEntityIdFilter, setAuditEntityIdFilter] = useState('')
    const [auditActorFilter, setAuditActorFilter] = useState('')
    const [auditFromLocal, setAuditFromLocal] = useState('')
    const [auditToLocal, setAuditToLocal] = useState('')

    const normalizedRole = String(profile?.role || '').trim().toLowerCase()
    const isAdmin = normalizedRole === 'admin'
    const isApprover = useMemo(() => {
        const normalizedUsername = normalizeSignature(profile?.username)
        const normalizedFullName = normalizeSignature(profile?.full_name)
        const normalizedEmailUser = normalizeSignature(String(user?.email || '').split('@')[0])
        return normalizedRole === 'admin'
            || normalizedRole === 'rh'
            || normalizedUsername === 'jesus.gracia'
            || normalizedFullName === 'jesus gracia'
            || normalizedEmailUser === 'jesus.gracia'
    }, [normalizedRole, profile?.username, profile?.full_name, user?.email])

    const availableAuditEventTypes = useMemo(() => {
        const set = new Set<string>()
        auditByEventType.forEach((row) => {
            const key = String(row?.eventType || '').trim()
            if (key) set.add(key)
        })
        auditRows.forEach((row) => {
            const key = String(row?.event_type || '').trim()
            if (key) set.add(key)
        })
        return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'))
    }, [auditByEventType, auditRows])

    const availableAuditEntityTypes = useMemo(() => {
        const set = new Set<string>()
        auditByEntityType.forEach((row) => {
            const key = String(row?.entityType || '').trim()
            if (key) set.add(key)
        })
        auditRows.forEach((row) => {
            const key = String(row?.entity_type || '').trim()
            if (key) set.add(key)
        })
        return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'))
    }, [auditByEntityType, auditRows])

    const loadIndustryQueue = async (background = false) => {
        if (!background) setLoading(true)
        if (background) setRefreshing(true)
        const response = await getIndustryApprovalQueue({ limit: 100, includeCatalog: true })
        if (response.success && response.data) {
            const requests = (Array.isArray(response.data.pendingRequests) ? response.data.pendingRequests : []) as PendingIndustryRequest[]
            const industries = (Array.isArray(response.data.industries) ? response.data.industries : []) as IndustryOption[]
            const noBadgeIndustries = (Array.isArray((response.data as any)?.industriesWithoutBadge)
                ? (response.data as any).industriesWithoutBadge
                : []) as IndustryWithoutBadge[]
            setPendingRequests(requests)
            setIndustryCatalog(industries)
            setIndustriesWithoutBadge(noBadgeIndustries)
            setPendingCount(Number(response.data.pendingCount || requests.length || 0))

            setNewNameByRequest((prev) => {
                const next = { ...prev }
                for (const request of requests) {
                    if (!next[request.id]) next[request.id] = request.proposed_name || ''
                }
                return next
            })
        } else if (!response.success) {
            console.error('Error loading industry approval queue:', response.error)
        }
        if (!background) setLoading(false)
        if (background) setRefreshing(false)
    }

    const loadQuoteRequests = async () => {
        if (!isAdmin) {
            setQuoteRequests([])
            return
        }
        const response = await getPendingQuoteRequestsForAdmin()
        if (response.success) {
            setQuoteRequests((Array.isArray(response.data) ? response.data : []) as QuoteRequestRow[])
        }
    }

    const loadAuditData = async (background = false, overrideFilters?: Partial<AuditFilterState>) => {
        const activeFilters: AuditFilterState = {
            eventType: String((overrideFilters?.eventType ?? auditEventTypeFilter) || '').trim(),
            entityType: String((overrideFilters?.entityType ?? auditEntityTypeFilter) || '').trim(),
            entityId: String((overrideFilters?.entityId ?? auditEntityIdFilter) || '').trim(),
            actorUserId: String((overrideFilters?.actorUserId ?? auditActorFilter) || '').trim(),
            fromLocal: String((overrideFilters?.fromLocal ?? auditFromLocal) || '').trim(),
            toLocal: String((overrideFilters?.toLocal ?? auditToLocal) || '').trim()
        }

        const fromISO = activeFilters.fromLocal
            ? fromLocalISOString(activeFilters.fromLocal).toISOString()
            : ''
        const toISO = activeFilters.toLocal
            ? fromLocalISOString(activeFilters.toLocal).toISOString()
            : ''

        if (!background) setAuditLoading(true)
        if (background) setAuditRefreshing(true)

        const [logResponse, summaryResponse] = await Promise.all([
            getCrmAuditLog({
                eventType: activeFilters.eventType || undefined,
                entityType: activeFilters.entityType || undefined,
                entityId: activeFilters.entityId || undefined,
                actorUserId: activeFilters.actorUserId || undefined,
                from: fromISO || undefined,
                to: toISO || undefined,
                limit: 400
            }),
            getCrmAuditSummary({
                from: fromISO || undefined,
                to: toISO || undefined
            })
        ])

        if (logResponse.success) {
            setAuditRows((Array.isArray(logResponse.data) ? logResponse.data : []) as AuditLogRow[])
        } else {
            console.error('Error loading CRM audit log:', logResponse.error)
            if (!background) setAuditRows([])
        }

        if (summaryResponse.success && summaryResponse.data) {
            setAuditTotalEvents(Number(summaryResponse.data.totalEvents || 0))
            setAuditByEventType(
                (Array.isArray(summaryResponse.data.byEventType) ? summaryResponse.data.byEventType : [])
                    .map((row: any) => ({
                        eventType: String(row?.eventType || ''),
                        count: Number(row?.count || 0)
                    }))
                    .filter((row: any) => row.eventType)
            )
            setAuditByEntityType(
                (Array.isArray(summaryResponse.data.byEntityType) ? summaryResponse.data.byEntityType : [])
                    .map((row: any) => ({
                        entityType: String(row?.entityType || ''),
                        count: Number(row?.count || 0)
                    }))
                    .filter((row: any) => row.entityType)
            )
        } else if (!summaryResponse.success) {
            console.error('Error loading CRM audit summary:', summaryResponse.error)
            if (!background) {
                setAuditTotalEvents(0)
                setAuditByEventType([])
                setAuditByEntityType([])
            }
        }

        if (!background) setAuditLoading(false)
        if (background) setAuditRefreshing(false)
    }

    useEffect(() => {
        if (authLoading) return
        if (!isApprover) {
            setLoading(false)
            return
        }
        void loadIndustryQueue()
        void loadQuoteRequests()
        void loadAuditData()
        const timer = setInterval(() => {
            void loadIndustryQueue(true)
            void loadQuoteRequests()
        }, 30000)
        return () => clearInterval(timer)
    }, [authLoading, isApprover, isAdmin])

    const handleMapExisting = async (request: PendingIndustryRequest) => {
        const selectedIndustryId = String(selectedExistingByRequest[request.id] || '').trim()
        if (!selectedIndustryId) {
            alert('Selecciona una industria existente para mapear esta solicitud.')
            return
        }
        setSavingRequestId(request.id)
        const result = await resolveIndustryApprovalRequest({
            requestId: request.id,
            decision: 'map_existing',
            targetIndustryId: selectedIndustryId
        })
        setSavingRequestId(null)
        if (!result.success) {
            alert(result.error || 'No se pudo mapear la solicitud.')
            return
        }
        await loadIndustryQueue(true)
    }

    const handleApproveNew = async (request: PendingIndustryRequest) => {
        const proposedName = String(newNameByRequest[request.id] || '').trim()
        if (!proposedName) {
            alert('Escribe el nombre final de la industria para aprobar.')
            return
        }
        setSavingRequestId(request.id)
        const result = await resolveIndustryApprovalRequest({
            requestId: request.id,
            decision: 'approve_new',
            newIndustryName: proposedName
        })
        setSavingRequestId(null)
        if (!result.success) {
            alert(result.error || 'No se pudo aprobar la industria.')
            return
        }
        await loadIndustryQueue(true)
    }

    const handleReject = async (request: PendingIndustryRequest) => {
        setSavingRequestId(request.id)
        const result = await resolveIndustryApprovalRequest({
            requestId: request.id,
            decision: 'reject'
        })
        setSavingRequestId(null)
        if (!result.success) {
            alert(result.error || 'No se pudo rechazar la solicitud.')
            return
        }
        await loadIndustryQueue(true)
    }

    const handleReviewQuoteRequest = async (requestId: number, decision: 'approved' | 'rejected') => {
        setReviewingQuoteRequestId(requestId)
        const result = await reviewQuoteRequest(requestId, decision)
        setReviewingQuoteRequestId(null)
        if (!result.success) {
            alert(result.error || 'No se pudo resolver la solicitud de frase.')
            return
        }
        await loadQuoteRequests()
    }

    const handleApplyAuditFilters = async () => {
        await loadAuditData(false)
    }

    const handleClearAuditFilters = async () => {
        setAuditEventTypeFilter('')
        setAuditEntityTypeFilter('')
        setAuditEntityIdFilter('')
        setAuditActorFilter('')
        setAuditFromLocal('')
        setAuditToLocal('')
        await loadAuditData(false, {
            eventType: '',
            entityType: '',
            entityId: '',
            actorUserId: '',
            fromLocal: '',
            toLocal: ''
        })
    }

    const handleSetAuditQuickWindow = async (days: number) => {
        const endDate = new Date()
        const startDate = new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000))
        const nextFromLocal = toLocalISOString(startDate)
        const nextToLocal = toLocalISOString(endDate)
        setAuditFromLocal(nextFromLocal)
        setAuditToLocal(nextToLocal)
        await loadAuditData(false, {
            fromLocal: nextFromLocal,
            toLocal: nextToLocal
        })
    }

    if (loading) {
        return (
            <div className='p-8 max-w-6xl'>
                <div className='rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-6 flex items-center gap-3 text-[var(--text-secondary)] font-bold'>
                    <Loader2 size={18} className='animate-spin' />
                    Cargando aprobaciones...
                </div>
            </div>
        )
    }

    if (!isApprover) {
        return (
            <div className='p-8 max-w-5xl space-y-4'>
                <div className='flex items-center gap-4 mb-2'>
                    <div className='ah-icon-card ah-icon-card-sm'>
                        <ShieldCheck size={22} strokeWidth={2.1} />
                    </div>
                    <h1 className='text-3xl font-bold' style={{ color: 'var(--text-primary)' }}>
                        Aprobaciones
                    </h1>
                </div>
                <div className='rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-6'>
                    <p className='font-bold text-[var(--text-secondary)]'>
                        Esta vista está disponible para el aprobador designado y usuarios admin/RH.
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className='p-8 max-w-6xl space-y-6'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
                <div>
                    <div className='flex items-center gap-4 mb-2'>
                        <div className='ah-icon-card ah-icon-card-sm'>
                            <ShieldCheck size={22} strokeWidth={2.1} />
                        </div>
                        <h1 className='text-3xl font-bold' style={{ color: 'var(--text-primary)' }}>
                            Aprobaciones
                        </h1>
                    </div>
                    <p className='text-sm font-bold text-[var(--text-secondary)]'>
                        Gestiona aprobaciones pendientes de frases e industrias.
                    </p>
                </div>

                <div className='flex items-center gap-3'>
                    <span className='inline-flex items-center rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-blue-300'>
                        Ind. pendientes: {pendingCount}
                    </span>
                    <span className='inline-flex items-center rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-rose-300'>
                        Ind. sin badge: {industriesWithoutBadge.length}
                    </span>
                    {isAdmin && (
                        <span className='inline-flex items-center rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-amber-300'>
                            Frases pendientes: {quoteRequests.length}
                        </span>
                    )}
                    <button
                        type='button'
                        onClick={() => {
                            void loadIndustryQueue(true)
                            void loadQuoteRequests()
                            void loadAuditData(true)
                        }}
                        className='rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-4 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--text-primary)] hover:border-blue-400 hover:text-blue-500 transition-colors cursor-pointer disabled:opacity-60'
                        disabled={refreshing}
                    >
                        {refreshing ? 'Actualizando...' : 'Actualizar'}
                    </button>
                </div>
            </div>

            {isAdmin && (
                <div id='solicitudes-frases' className='rounded-2xl border overflow-hidden' style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
                    <div className='px-4 py-3 border-b' style={{ borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}>
                        <p className='text-xs font-black uppercase tracking-[0.2em] flex items-center gap-2' style={{ color: 'var(--text-secondary)' }}>
                            <MessageSquareQuote size={14} />
                            Solicitudes pendientes de frases
                        </p>
                    </div>
                    {quoteRequests.length === 0 ? (
                        <div className='px-4 py-4 text-sm font-medium' style={{ color: 'var(--text-secondary)' }}>
                            No hay solicitudes pendientes.
                        </div>
                    ) : (
                        <div className='overflow-x-auto'>
                            <table className='w-full min-w-[900px]'>
                                <thead>
                                    <tr style={{ background: 'var(--hover-bg)' }}>
                                        <th className='px-4 py-3 text-left text-xs font-black uppercase tracking-[0.2em]' style={{ color: 'var(--text-secondary)' }}>Frase</th>
                                        <th className='px-4 py-3 text-left text-xs font-black uppercase tracking-[0.2em]' style={{ color: 'var(--text-secondary)' }}>Autor</th>
                                        <th className='px-4 py-3 text-left text-xs font-black uppercase tracking-[0.2em]' style={{ color: 'var(--text-secondary)' }}>Aportador</th>
                                        <th className='px-4 py-3 text-left text-xs font-black uppercase tracking-[0.2em]' style={{ color: 'var(--text-secondary)' }}>Solicitó</th>
                                        <th className='px-4 py-3 text-left text-xs font-black uppercase tracking-[0.2em]' style={{ color: 'var(--text-secondary)' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {quoteRequests.map((request) => (
                                        <tr key={`pending-request-${request.id}`} className='border-t' style={{ borderColor: 'var(--card-border)' }}>
                                            <td className='px-4 py-4 align-top'>
                                                <p className='text-sm italic leading-relaxed' style={{ color: 'var(--text-primary)' }}>
                                                    &quot;{request.quote_text}&quot;
                                                </p>
                                            </td>
                                            <td className='px-4 py-4 align-top'>
                                                <p className='text-xs font-bold uppercase tracking-[0.12em]' style={{ color: 'var(--text-primary)' }}>
                                                    {request.quote_author}
                                                </p>
                                                {!!request.quote_author_context && (
                                                    <p className='text-xs mt-1' style={{ color: 'var(--text-secondary)' }}>
                                                        {request.quote_author_context}
                                                    </p>
                                                )}
                                            </td>
                                            <td className='px-4 py-4 align-top'>
                                                <p className='text-sm font-semibold' style={{ color: 'var(--text-primary)' }}>
                                                    {request.contributed_by_name}
                                                </p>
                                            </td>
                                            <td className='px-4 py-4 align-top'>
                                                <p className='text-sm font-semibold' style={{ color: 'var(--text-primary)' }}>
                                                    {request.requester_name}
                                                </p>
                                                <p className='text-xs mt-1' style={{ color: 'var(--text-secondary)' }}>
                                                    {new Date(request.created_at).toLocaleDateString('es-MX')}
                                                </p>
                                            </td>
                                            <td className='px-4 py-4 align-top'>
                                                <div className='flex items-center gap-1.5'>
                                                    <button
                                                        type='button'
                                                        onClick={() => void handleReviewQuoteRequest(request.id, 'approved')}
                                                        disabled={reviewingQuoteRequestId === request.id}
                                                        className='p-2 rounded-xl border border-transparent text-emerald-500 hover:bg-emerald-500/10 hover:border-emerald-500/35 hover:text-emerald-400 transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer'
                                                        title='Aprobar solicitud'
                                                    >
                                                        {reviewingQuoteRequestId === request.id ? <Loader2 size={16} className='animate-spin' /> : <Check size={16} strokeWidth={2.4} />}
                                                    </button>
                                                    <button
                                                        type='button'
                                                        onClick={() => void handleReviewQuoteRequest(request.id, 'rejected')}
                                                        disabled={reviewingQuoteRequestId === request.id}
                                                        className='p-2 rounded-xl border border-transparent text-rose-500 hover:bg-rose-500/10 hover:border-rose-500/35 hover:text-rose-400 transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer'
                                                        title='Rechazar solicitud'
                                                    >
                                                        {reviewingQuoteRequestId === request.id ? <Loader2 size={16} className='animate-spin' /> : <X size={16} strokeWidth={2.4} />}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            <div id='industrias' className='space-y-4'>
                <div className='rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-5 space-y-3'>
                    <div className='flex items-center justify-between gap-3 flex-wrap'>
                        <p className='text-[11px] font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]'>
                            Industrias registradas sin badge
                        </p>
                        <span className='inline-flex items-center rounded-xl border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-rose-300'>
                            {industriesWithoutBadge.length} sin badge
                        </span>
                    </div>
                    {industriesWithoutBadge.length === 0 ? (
                        <p className='text-sm font-bold text-[var(--text-secondary)]'>
                            Todas las industrias registradas ya tienen badge vinculado.
                        </p>
                    ) : (
                        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2'>
                            {industriesWithoutBadge.map((industry) => (
                                <div
                                    key={`industry-without-badge-${industry.id}`}
                                    className='rounded-xl border border-[var(--card-border)] bg-[var(--hover-bg)] px-3 py-2'
                                >
                                    <p className='text-sm font-black text-[var(--text-primary)]'>{industry.name}</p>
                                    <p className='text-[10px] font-black uppercase tracking-[0.12em] text-[var(--text-secondary)] mt-1'>
                                        {industry.is_active ? 'Activa' : 'Inactiva'}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {pendingRequests.length === 0 ? (
                    <div className='rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-8 text-center'>
                        <p className='text-base font-black text-[var(--text-primary)]'>No hay solicitudes de industrias pendientes.</p>
                        <p className='text-sm font-bold text-[var(--text-secondary)] mt-2'>
                            Cuando un vendedor capture una industria nueva, aparecerá aquí para aprobación.
                        </p>
                    </div>
                ) : (
                    <div className='space-y-4'>
                        {pendingRequests.map((request) => {
                            const requestIsSaving = savingRequestId === request.id
                            return (
                                <div key={request.id} className='rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-5 space-y-4'>
                                    <div className='flex flex-wrap items-start justify-between gap-3'>
                                        <div>
                                            <p className='text-[11px] font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]'>
                                                Solicitud de industria nueva
                                            </p>
                                            <h2 className='mt-1 text-xl font-black text-[var(--text-primary)]'>{request.proposed_name}</h2>
                                            <p className='mt-1 text-xs font-bold text-[var(--text-secondary)]'>
                                                Solicitó: {request.requested_by_name} · {formatDateTime(request.created_at)}
                                            </p>
                                            <p className='mt-1 text-xs font-bold text-[var(--text-secondary)]'>
                                                Contexto: {formatContextLabel(request)}
                                            </p>
                                        </div>
                                        <div className='text-right space-y-1'>
                                            <p className='text-[11px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]'>
                                                Impacto detectado
                                            </p>
                                            <p className='text-xs font-black text-[var(--text-primary)]'>
                                                {request.impacted_companies_count || 0} empresa(s) · {request.impacted_pre_leads_count || 0} suspect(s)
                                            </p>
                                        </div>
                                    </div>

                                    <div className='grid grid-cols-1 lg:grid-cols-2 gap-3'>
                                        <div className='rounded-xl border border-[var(--card-border)] bg-[var(--hover-bg)] p-3'>
                                            <p className='text-[10px] font-black uppercase tracking-[0.12em] text-[var(--text-secondary)] mb-2'>
                                                Asignar a industria existente
                                            </p>
                                            <div className='flex flex-wrap items-center gap-2'>
                                                <select
                                                    value={selectedExistingByRequest[request.id] || ''}
                                                    onChange={(event) => {
                                                        const value = event.target.value
                                                        setSelectedExistingByRequest((prev) => ({ ...prev, [request.id]: value }))
                                                    }}
                                                    className='min-w-[220px] px-3 py-2 rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] text-sm font-bold text-[var(--text-primary)]'
                                                >
                                                    <option value=''>Seleccionar industria...</option>
                                                    {industryCatalog.map((industry) => (
                                                        <option key={industry.id} value={industry.id}>
                                                            {industry.name}
                                                        </option>
                                                    ))}
                                                </select>
                                                <button
                                                    type='button'
                                                    onClick={() => void handleMapExisting(request)}
                                                    disabled={requestIsSaving}
                                                    className='inline-flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] font-black uppercase tracking-[0.1em] text-amber-300 hover:bg-amber-500/20 transition-colors cursor-pointer disabled:opacity-60'
                                                >
                                                    {requestIsSaving ? <Loader2 size={14} className='animate-spin' /> : <Shuffle size={14} />}
                                                    Asignar
                                                </button>
                                            </div>
                                        </div>

                                        <div className='rounded-xl border border-[var(--card-border)] bg-[var(--hover-bg)] p-3'>
                                            <p className='text-[10px] font-black uppercase tracking-[0.12em] text-[var(--text-secondary)] mb-2'>
                                                Aprobar como industria nueva
                                            </p>
                                            <div className='flex flex-wrap items-center gap-2'>
                                                <input
                                                    type='text'
                                                    value={newNameByRequest[request.id] || ''}
                                                    onChange={(event) => {
                                                        const value = event.target.value
                                                        setNewNameByRequest((prev) => ({ ...prev, [request.id]: value }))
                                                    }}
                                                    className='min-w-[220px] px-3 py-2 rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] text-sm font-bold text-[var(--text-primary)]'
                                                    placeholder='Nombre final de industria'
                                                />
                                                <button
                                                    type='button'
                                                    onClick={() => void handleApproveNew(request)}
                                                    disabled={requestIsSaving}
                                                    className='inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[11px] font-black uppercase tracking-[0.1em] text-emerald-300 hover:bg-emerald-500/20 transition-colors cursor-pointer disabled:opacity-60'
                                                >
                                                    {requestIsSaving ? <Loader2 size={14} className='animate-spin' /> : <CheckCircle2 size={14} />}
                                                    Aprobar
                                                </button>
                                                <button
                                                    type='button'
                                                    onClick={() => void handleReject(request)}
                                                    disabled={requestIsSaving}
                                                    className='inline-flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[11px] font-black uppercase tracking-[0.1em] text-rose-300 hover:bg-rose-500/20 transition-colors cursor-pointer disabled:opacity-60'
                                                >
                                                    {requestIsSaving ? <Loader2 size={14} className='animate-spin' /> : <XCircle size={14} />}
                                                    Rechazar
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className='grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-bold text-[var(--text-secondary)]'>
                                        <div className='rounded-xl border border-[var(--card-border)] bg-[var(--hover-bg)] p-3'>
                                            <p className='text-[10px] font-black uppercase tracking-[0.12em] mb-2 text-[var(--text-primary)]'>
                                                Empresas detectadas
                                            </p>
                                            {(request.impacted_companies_sample || []).length === 0
                                                ? <p>Sin coincidencias directas.</p>
                                                : (
                                                    <ul className='space-y-1'>
                                                        {(request.impacted_companies_sample || []).map((name) => (
                                                            <li key={`${request.id}-company-${name}`}>• {name}</li>
                                                        ))}
                                                    </ul>
                                                )}
                                        </div>
                                        <div className='rounded-xl border border-[var(--card-border)] bg-[var(--hover-bg)] p-3'>
                                            <p className='text-[10px] font-black uppercase tracking-[0.12em] mb-2 text-[var(--text-primary)]'>
                                                Suspects detectados
                                            </p>
                                            {(request.impacted_pre_leads_sample || []).length === 0
                                                ? <p>Sin coincidencias directas.</p>
                                                : (
                                                    <ul className='space-y-1'>
                                                        {(request.impacted_pre_leads_sample || []).map((name) => (
                                                            <li key={`${request.id}-prelead-${name}`}>• {name}</li>
                                                        ))}
                                                    </ul>
                                                )}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            <div id='bitacora' className='rounded-2xl border overflow-hidden' style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
                <div className='px-5 py-4 border-b flex flex-wrap items-center justify-between gap-3' style={{ borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}>
                    <p className='text-xs font-black uppercase tracking-[0.2em] flex items-center gap-2' style={{ color: 'var(--text-secondary)' }}>
                        <Activity size={14} />
                        Bitácora CRM (DB-first)
                    </p>
                    <div className='flex items-center gap-2'>
                        <span className='inline-flex items-center rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-blue-300'>
                            Eventos: {auditTotalEvents}
                        </span>
                        <button
                            type='button'
                            onClick={() => void loadAuditData(true)}
                            className='rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--text-primary)] hover:border-blue-400 hover:text-blue-500 transition-colors cursor-pointer disabled:opacity-60'
                            disabled={auditRefreshing}
                        >
                            {auditRefreshing ? 'Actualizando...' : 'Refrescar'}
                        </button>
                    </div>
                </div>

                <div className='p-5 space-y-4'>
                    <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3'>
                        <select
                            value={auditEventTypeFilter}
                            onChange={(event) => setAuditEventTypeFilter(event.target.value)}
                            className='px-3 py-2 rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] text-sm font-bold text-[var(--text-primary)]'
                        >
                            <option value=''>Todos los eventos</option>
                            {availableAuditEventTypes.map((eventType) => (
                                <option key={`audit-event-${eventType}`} value={eventType}>
                                    {formatAuditEventLabel(eventType)}
                                </option>
                            ))}
                        </select>

                        <select
                            value={auditEntityTypeFilter}
                            onChange={(event) => setAuditEntityTypeFilter(event.target.value)}
                            className='px-3 py-2 rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] text-sm font-bold text-[var(--text-primary)]'
                        >
                            <option value=''>Todas las entidades</option>
                            {availableAuditEntityTypes.map((entityType) => (
                                <option key={`audit-entity-${entityType}`} value={entityType}>
                                    {formatAuditEntityLabel(entityType)}
                                </option>
                            ))}
                        </select>

                        <input
                            type='text'
                            value={auditEntityIdFilter}
                            onChange={(event) => setAuditEntityIdFilter(event.target.value)}
                            className='px-3 py-2 rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] text-sm font-bold text-[var(--text-primary)]'
                            placeholder='ID de entidad (opcional)'
                        />

                        <input
                            type='text'
                            value={auditActorFilter}
                            onChange={(event) => setAuditActorFilter(event.target.value)}
                            className='px-3 py-2 rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] text-sm font-bold text-[var(--text-primary)]'
                            placeholder='Actor user_id (opcional)'
                        />

                        <input
                            type='datetime-local'
                            value={auditFromLocal}
                            onChange={(event) => setAuditFromLocal(event.target.value)}
                            className='px-3 py-2 rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] text-sm font-bold text-[var(--text-primary)]'
                        />

                        <input
                            type='datetime-local'
                            value={auditToLocal}
                            onChange={(event) => setAuditToLocal(event.target.value)}
                            className='px-3 py-2 rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] text-sm font-bold text-[var(--text-primary)]'
                        />
                    </div>

                    <div className='flex flex-wrap items-center gap-2'>
                        <button
                            type='button'
                            onClick={() => void handleApplyAuditFilters()}
                            className='rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-blue-300 hover:bg-blue-500/20 transition-colors cursor-pointer'
                        >
                            Aplicar filtros
                        </button>
                        <button
                            type='button'
                            onClick={() => void handleSetAuditQuickWindow(7)}
                            className='rounded-lg border border-[var(--card-border)] bg-[var(--hover-bg)] px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-[var(--text-primary)] hover:border-blue-400/50 hover:text-blue-400 transition-colors cursor-pointer'
                        >
                            Últimos 7 días
                        </button>
                        <button
                            type='button'
                            onClick={() => void handleSetAuditQuickWindow(30)}
                            className='rounded-lg border border-[var(--card-border)] bg-[var(--hover-bg)] px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-[var(--text-primary)] hover:border-blue-400/50 hover:text-blue-400 transition-colors cursor-pointer'
                        >
                            Últimos 30 días
                        </button>
                        <button
                            type='button'
                            onClick={() => void handleSetAuditQuickWindow(90)}
                            className='rounded-lg border border-[var(--card-border)] bg-[var(--hover-bg)] px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-[var(--text-primary)] hover:border-blue-400/50 hover:text-blue-400 transition-colors cursor-pointer'
                        >
                            Últimos 90 días
                        </button>
                        <button
                            type='button'
                            onClick={() => void handleClearAuditFilters()}
                            className='rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-rose-300 hover:bg-rose-500/20 transition-colors cursor-pointer'
                        >
                            Limpiar
                        </button>
                    </div>

                    <p className='text-xs font-bold text-[var(--text-secondary)]'>
                        Rango activo: {auditFromLocal ? formatDateTime(fromLocalISOString(auditFromLocal).toISOString()) : 'Inicio abierto'} · {auditToLocal ? formatDateTime(fromLocalISOString(auditToLocal).toISOString()) : 'Fin abierto'}
                    </p>

                    {auditLoading ? (
                        <div className='rounded-xl border border-[var(--card-border)] bg-[var(--hover-bg)] p-6 flex items-center gap-2 text-sm font-bold text-[var(--text-secondary)]'>
                            <Loader2 size={16} className='animate-spin' />
                            Cargando bitácora...
                        </div>
                    ) : auditRows.length === 0 ? (
                        <div className='rounded-xl border border-[var(--card-border)] bg-[var(--hover-bg)] p-6 text-sm font-bold text-[var(--text-secondary)]'>
                            No hay eventos para los filtros seleccionados.
                        </div>
                    ) : (
                        <div className='overflow-x-auto rounded-xl border border-[var(--card-border)]'>
                            <table className='w-full min-w-[980px]'>
                                <thead>
                                    <tr style={{ background: 'var(--hover-bg)' }}>
                                        <th className='px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.16em]' style={{ color: 'var(--text-secondary)' }}>Fecha</th>
                                        <th className='px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.16em]' style={{ color: 'var(--text-secondary)' }}>Evento</th>
                                        <th className='px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.16em]' style={{ color: 'var(--text-secondary)' }}>Entidad</th>
                                        <th className='px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.16em]' style={{ color: 'var(--text-secondary)' }}>Actor</th>
                                        <th className='px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.16em]' style={{ color: 'var(--text-secondary)' }}>Detalle</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {auditRows.map((row) => {
                                        const contextData = (row.context_data || {}) as Record<string, any>
                                        const changedFields = Array.isArray(contextData?.changed_fields)
                                            ? contextData.changed_fields.map((field: unknown) => String(field || '')).filter(Boolean)
                                            : []
                                        const actorLabel = String(row.actor_user_id || '').trim()
                                        const deltaProbability = Number(contextData?.delta_probability)
                                        const deltaForecastMonthly = Number(contextData?.delta_forecast_value_amount)
                                        const deltaForecastImplementation = Number(contextData?.delta_forecast_implementation_amount)
                                        const deltaCloseDays = Number(contextData?.delta_forecast_close_date_days)
                                        return (
                                            <tr key={`audit-row-${row.id}`} className='border-t' style={{ borderColor: 'var(--card-border)' }}>
                                                <td className='px-4 py-3 align-top text-xs font-bold text-[var(--text-secondary)] whitespace-nowrap'>
                                                    {formatDateTime(row.created_at)}
                                                </td>
                                                <td className='px-4 py-3 align-top'>
                                                    <p className='text-xs font-black uppercase tracking-[0.12em] text-[var(--text-primary)]'>
                                                        {formatAuditEventLabel(row.event_type)}
                                                    </p>
                                                </td>
                                                <td className='px-4 py-3 align-top'>
                                                    <p className='text-xs font-black text-[var(--text-primary)]'>
                                                        {formatAuditEntityLabel(row.entity_type)}
                                                    </p>
                                                    <p className='text-[11px] font-bold text-[var(--text-secondary)] mt-1'>
                                                        ID: {String(row.entity_id || '-')}
                                                    </p>
                                                </td>
                                                <td className='px-4 py-3 align-top text-[11px] font-bold text-[var(--text-secondary)]'>
                                                    {actorLabel ? `${actorLabel.slice(0, 8)}…` : '-'}
                                                </td>
                                                <td className='px-4 py-3 align-top'>
                                                    <p className='text-[11px] font-bold text-[var(--text-secondary)]'>
                                                        {changedFields.length > 0
                                                            ? `Campos: ${changedFields.join(', ')}`
                                                            : `Fuente: ${String(row.event_source || 'db_trigger')}`}
                                                    </p>
                                                    <div className='mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-black'>
                                                        {Number.isFinite(deltaProbability) && (
                                                            <span className={deltaProbability >= 0 ? 'text-blue-400' : 'text-amber-400'}>
                                                                Δ Prob: {deltaProbability >= 0 ? '+' : ''}{deltaProbability.toFixed(2)}
                                                            </span>
                                                        )}
                                                        {Number.isFinite(deltaForecastMonthly) && (
                                                            <span className={deltaForecastMonthly >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                                                Δ Mensual: {deltaForecastMonthly >= 0 ? '+' : ''}{deltaForecastMonthly.toLocaleString('es-MX')}
                                                            </span>
                                                        )}
                                                        {Number.isFinite(deltaForecastImplementation) && (
                                                            <span className={deltaForecastImplementation >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                                                Δ Implementación: {deltaForecastImplementation >= 0 ? '+' : ''}{deltaForecastImplementation.toLocaleString('es-MX')}
                                                            </span>
                                                        )}
                                                        {Number.isFinite(deltaCloseDays) && (
                                                            <span className={deltaCloseDays <= 0 ? 'text-blue-400' : 'text-amber-400'}>
                                                                Δ Cierre (días): {deltaCloseDays >= 0 ? '+' : ''}{deltaCloseDays}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            <div className='rounded-2xl border border-[var(--card-border)] bg-[var(--hover-bg)] p-4 text-xs font-bold text-[var(--text-secondary)]'>
                <p className='inline-flex items-center gap-2 text-[var(--text-primary)] font-black uppercase tracking-[0.12em] mb-2'>
                    <Factory size={14} />
                    Nota operativa
                </p>
                <p>
                    Al aprobar una industria nueva, queda disponible en catálogo y se habilita su badge de industria automáticamente en el sistema de progresión.
                </p>
            </div>
        </div>
    )
}
