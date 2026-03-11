'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { fromLocalISOString, toLocalISOString } from '@/lib/dateUtils'
import { getCrmAuditInsights, getCrmAuditIntegrityCheck } from '@/app/actions/audit'
import { Activity, BarChart3, Building2, CalendarRange, GitBranch, Loader2, RefreshCw, UserRound } from 'lucide-react'

type RankedRow = { label: string; count: number }
type EventTypeRow = { eventType: string; count: number }
type RecentEventRow = {
    id: number
    event_type: string
    entity_type: string
    entity_id: string
    actor_user_id: string | null
    created_at: string
}

type InsightDataset = {
    totalEvents: number
    bySeller: RankedRow[]
    byIndustry: RankedRow[]
    byStage: RankedRow[]
    byEventType: EventTypeRow[]
    recentEvents: RecentEventRow[]
}

type DeltaRow = {
    label: string
    countA: number
    countB: number
    delta: number
    deltaPct: number | null
}

type IntegritySummary = {
    source: {
        meetingsTotal: number
        meetingsHeld: number
        meetingsNotHeld: number
        forecastSnapshotsTotal: number
    }
    audit: {
        meetingScheduledEvents: number
        meetingHeldEvents: number
        meetingNotHeldEvents: number
        forecastSnapshotEvents: number
    }
    gaps: {
        meetingsScheduledGap: number
        meetingsHeldGap: number
        meetingsNotHeldGap: number
        forecastSnapshotsGap: number
    }
    maybeNeedsBackfill: boolean
}

const EVENT_LABELS: Record<string, string> = {
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

const ENTITY_LABELS: Record<string, string> = {
    lead: 'Lead',
    meeting: 'Junta',
    forecast_snapshot: 'Snapshot'
}

const formatDateTime = (value?: string | null) => {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '-'
    return date.toLocaleString('es-MX', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    })
}

const eventLabel = (value: string) => EVENT_LABELS[String(value || '').trim().toLowerCase()] || value || 'Evento'
const entityLabel = (value: string) => ENTITY_LABELS[String(value || '').trim().toLowerCase()] || value || 'Entidad'

const toRankedRows = (rows: any[]) => (Array.isArray(rows) ? rows : [])
    .map((row: any) => ({
        label: String(row?.label || '').trim() || 'Sin etiqueta',
        count: Number(row?.count || 0)
    }))
    .sort((a: RankedRow, b: RankedRow) => b.count - a.count)

const toEventTypeRows = (rows: any[]) => (Array.isArray(rows) ? rows : [])
    .map((row: any) => ({
        eventType: String(row?.eventType || '').trim(),
        count: Number(row?.count || 0)
    }))
    .filter((row: EventTypeRow) => row.eventType)
    .sort((a: EventTypeRow, b: EventTypeRow) => b.count - a.count)

const toRecentEvents = (rows: any[]) => (Array.isArray(rows) ? rows : [])
    .map((row: any) => ({
        id: Number(row?.id || 0),
        event_type: String(row?.event_type || ''),
        entity_type: String(row?.entity_type || ''),
        entity_id: String(row?.entity_id || ''),
        actor_user_id: row?.actor_user_id ? String(row.actor_user_id) : null,
        created_at: String(row?.created_at || '')
    }))
    .filter((row: RecentEventRow) => Number(row.id) > 0)

const toDataset = (raw: any): InsightDataset => ({
    totalEvents: Number(raw?.totalEvents || 0),
    bySeller: toRankedRows(raw?.bySeller),
    byIndustry: toRankedRows(raw?.byIndustry),
    byStage: toRankedRows(raw?.byStage),
    byEventType: toEventTypeRows(raw?.byEventType),
    recentEvents: toRecentEvents(raw?.recentEvents)
})

const getEventCount = (rows: EventTypeRow[], eventType: string) => {
    const target = String(eventType || '').trim().toLowerCase()
    if (!target) return 0
    const found = rows.find((row) => String(row.eventType || '').trim().toLowerCase() === target)
    return Number(found?.count || 0)
}

const computeDeltaPct = (periodA: number, periodB: number) => {
    if (periodA === 0) return null
    return ((periodB - periodA) / Math.abs(periodA)) * 100
}

const buildDeltaRows = (rowsA: RankedRow[], rowsB: RankedRow[], limit = 10): DeltaRow[] => {
    const mapA = new Map<string, number>()
    const mapB = new Map<string, number>()

    rowsA.forEach((row) => mapA.set(row.label, Number(row.count || 0)))
    rowsB.forEach((row) => mapB.set(row.label, Number(row.count || 0)))

    const labels = Array.from(new Set([...mapA.keys(), ...mapB.keys()]))
    return labels
        .map((label) => {
            const countA = Number(mapA.get(label) || 0)
            const countB = Number(mapB.get(label) || 0)
            return {
                label,
                countA,
                countB,
                delta: countB - countA,
                deltaPct: computeDeltaPct(countA, countB)
            }
        })
        .sort((a, b) => {
            const absDiff = Math.abs(b.delta) - Math.abs(a.delta)
            if (absDiff !== 0) return absDiff
            return b.countB - a.countB
        })
        .slice(0, limit)
}

function RankedBars({
    title,
    rows,
    accentClassName
}: {
    title: string
    rows: RankedRow[]
    accentClassName: string
}) {
    const maxCount = useMemo(() => rows.reduce((max, row) => Math.max(max, Number(row.count || 0)), 0), [rows])

    return (
        <div className='rounded-2xl border p-4 space-y-3' style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
            <p className='text-[11px] font-black uppercase tracking-[0.16em]' style={{ color: 'var(--text-secondary)' }}>
                {title}
            </p>
            {rows.length === 0 ? (
                <p className='text-sm font-bold' style={{ color: 'var(--text-secondary)' }}>
                    Sin datos para este filtro.
                </p>
            ) : (
                <div className='space-y-2'>
                    {rows.map((row) => {
                        const count = Number(row.count || 0)
                        const width = maxCount > 0 ? Math.max(5, Math.min(100, (count / maxCount) * 100)) : 0
                        return (
                            <div key={`${title}-${row.label}`} className='space-y-1'>
                                <div className='flex items-center justify-between gap-2 text-xs font-black'>
                                    <span className='truncate' style={{ color: 'var(--text-primary)' }}>{row.label}</span>
                                    <span style={{ color: 'var(--text-secondary)' }}>{count.toLocaleString('es-MX')}</span>
                                </div>
                                <div className='h-2.5 rounded-full bg-black/25 border border-white/5 overflow-hidden'>
                                    <div
                                        className={`h-full rounded-full transition-all duration-300 ${accentClassName}`}
                                        style={{ width: `${width}%` }}
                                    />
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

function DeltaTable({
    title,
    rows
}: {
    title: string
    rows: DeltaRow[]
}) {
    return (
        <div className='rounded-2xl border p-4 space-y-3' style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
            <p className='text-[11px] font-black uppercase tracking-[0.16em]' style={{ color: 'var(--text-secondary)' }}>
                {title}
            </p>
            {rows.length === 0 ? (
                <p className='text-sm font-bold' style={{ color: 'var(--text-secondary)' }}>
                    Sin cambios para comparar.
                </p>
            ) : (
                <div className='overflow-x-auto rounded-xl border' style={{ borderColor: 'var(--card-border)' }}>
                    <table className='w-full min-w-[520px]'>
                        <thead>
                            <tr style={{ background: 'var(--hover-bg)' }}>
                                <th className='px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.16em]' style={{ color: 'var(--text-secondary)' }}>
                                    Dimensión
                                </th>
                                <th className='px-3 py-2 text-right text-[10px] font-black uppercase tracking-[0.16em]' style={{ color: 'var(--text-secondary)' }}>
                                    A
                                </th>
                                <th className='px-3 py-2 text-right text-[10px] font-black uppercase tracking-[0.16em]' style={{ color: 'var(--text-secondary)' }}>
                                    B
                                </th>
                                <th className='px-3 py-2 text-right text-[10px] font-black uppercase tracking-[0.16em]' style={{ color: 'var(--text-secondary)' }}>
                                    Δ
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => {
                                const deltaClass = row.delta > 0
                                    ? 'text-emerald-400'
                                    : row.delta < 0
                                        ? 'text-rose-400'
                                        : 'text-[var(--text-secondary)]'
                                return (
                                    <tr key={`${title}-${row.label}`} className='border-t' style={{ borderColor: 'var(--card-border)' }}>
                                        <td className='px-3 py-2 text-xs font-black' style={{ color: 'var(--text-primary)' }}>
                                            {row.label}
                                        </td>
                                        <td className='px-3 py-2 text-xs font-bold text-right' style={{ color: 'var(--text-secondary)' }}>
                                            {row.countA.toLocaleString('es-MX')}
                                        </td>
                                        <td className='px-3 py-2 text-xs font-bold text-right' style={{ color: 'var(--text-secondary)' }}>
                                            {row.countB.toLocaleString('es-MX')}
                                        </td>
                                        <td className={`px-3 py-2 text-xs font-black text-right ${deltaClass}`}>
                                            {row.delta > 0 ? '+' : ''}{row.delta.toLocaleString('es-MX')}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}

export default function InsightsBitacoraPage() {
    const auth = useAuth()
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [fromLocal, setFromLocal] = useState('')
    const [toLocal, setToLocal] = useState('')
    const [compareFromLocal, setCompareFromLocal] = useState('')
    const [compareToLocal, setCompareToLocal] = useState('')
    const [totalEvents, setTotalEvents] = useState(0)
    const [bySeller, setBySeller] = useState<RankedRow[]>([])
    const [byIndustry, setByIndustry] = useState<RankedRow[]>([])
    const [byStage, setByStage] = useState<RankedRow[]>([])
    const [byEventType, setByEventType] = useState<EventTypeRow[]>([])
    const [recentEvents, setRecentEvents] = useState<RecentEventRow[]>([])
    const [showRecentEvents, setShowRecentEvents] = useState(false)
    const [compareLoading, setCompareLoading] = useState(false)
    const [compareError, setCompareError] = useState<string | null>(null)
    const [compareDatasetA, setCompareDatasetA] = useState<InsightDataset | null>(null)
    const [compareDatasetB, setCompareDatasetB] = useState<InsightDataset | null>(null)
    const [integrityLoading, setIntegrityLoading] = useState(false)
    const [integrityError, setIntegrityError] = useState<string | null>(null)
    const [integritySummary, setIntegritySummary] = useState<IntegritySummary | null>(null)

    const fetchDataset = useCallback(async (range: { fromLocal?: string; toLocal?: string }) => {
        const nextFromLocal = String(range.fromLocal || '').trim()
        const nextToLocal = String(range.toLocal || '').trim()
        const fromISO = nextFromLocal ? fromLocalISOString(nextFromLocal).toISOString() : undefined
        const toISO = nextToLocal ? fromLocalISOString(nextToLocal).toISOString() : undefined

        const res = await getCrmAuditInsights({
            from: fromISO,
            to: toISO,
            limit: 12000
        })
        if (!res.success || !res.data) {
            throw new Error(res.error || 'No se pudo cargar Insights de bitácora')
        }
        return toDataset(res.data)
    }, [])

    const fetchInsights = useCallback(async (background = false, overrides?: { fromLocal?: string; toLocal?: string }) => {
        const nextFromLocal = String((overrides?.fromLocal ?? fromLocal) || '').trim()
        const nextToLocal = String((overrides?.toLocal ?? toLocal) || '').trim()

        if (background) setRefreshing(true)
        if (!background) setLoading(true)
        setError(null)

        try {
            const dataset = await fetchDataset({ fromLocal: nextFromLocal, toLocal: nextToLocal })
            setTotalEvents(dataset.totalEvents)
            setBySeller(dataset.bySeller.slice(0, 12))
            setByIndustry(dataset.byIndustry.slice(0, 12))
            setByStage(dataset.byStage.slice(0, 12))
            setByEventType(dataset.byEventType.slice(0, 12))
            setRecentEvents(dataset.recentEvents.slice(0, 30))
        } catch (err: any) {
            setError(err?.message || 'Respuesta inesperada al cargar Insights de bitácora')
            setBySeller([])
            setByIndustry([])
            setByStage([])
            setByEventType([])
            setRecentEvents([])
            setTotalEvents(0)
        } finally {
            if (background) setRefreshing(false)
            if (!background) setLoading(false)
        }
    }, [fetchDataset, fromLocal, toLocal])

    const fetchIntegrity = useCallback(async () => {
        setIntegrityLoading(true)
        setIntegrityError(null)
        try {
            const res = await getCrmAuditIntegrityCheck()
            if (!res.success || !res.data) {
                setIntegrityError(res.error || 'No se pudo validar la integridad de captura')
                setIntegritySummary(null)
                return
            }
            setIntegritySummary(res.data as IntegritySummary)
        } catch (err: any) {
            setIntegrityError(err?.message || 'No se pudo validar la integridad de captura')
            setIntegritySummary(null)
        } finally {
            setIntegrityLoading(false)
        }
    }, [])

    useEffect(() => {
        if (!auth.loading && !auth.loggedIn) {
            router.push('/home')
            return
        }
        if (auth.profile && auth.profile.role !== 'admin') {
            const normalizedRole = String(auth.profile?.role || '').trim().toLowerCase()
            const normalizedUsername = String(auth.profile?.username || '').trim().toLowerCase()
            if (normalizedRole !== 'rh' && normalizedUsername !== 'jesus.gracia') {
                router.push('/home')
                return
            }
        }
        void fetchInsights()
        void fetchIntegrity()
    }, [auth.loading, auth.loggedIn, auth.profile, router, fetchInsights, fetchIntegrity])

    const setQuickRange = async (days: number) => {
        const endDate = new Date()
        const startDate = new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000))
        const nextFromLocal = toLocalISOString(startDate)
        const nextToLocal = toLocalISOString(endDate)
        setFromLocal(nextFromLocal)
        setToLocal(nextToLocal)
        await fetchInsights(false, {
            fromLocal: nextFromLocal,
            toLocal: nextToLocal
        })
    }

    const clearRange = async () => {
        setFromLocal('')
        setToLocal('')
        await fetchInsights(false, {
            fromLocal: '',
            toLocal: ''
        })
    }

    const setQuickRangeCompare = (days: number) => {
        const endDate = new Date()
        const startDate = new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000))
        setCompareFromLocal(toLocalISOString(startDate))
        setCompareToLocal(toLocalISOString(endDate))
    }

    const runComparison = async () => {
        setCompareLoading(true)
        setCompareError(null)
        try {
            const [datasetA, datasetB] = await Promise.all([
                fetchDataset({ fromLocal, toLocal }),
                fetchDataset({ fromLocal: compareFromLocal, toLocal: compareToLocal })
            ])
            setCompareDatasetA(datasetA)
            setCompareDatasetB(datasetB)
        } catch (err: any) {
            setCompareError(err?.message || 'No se pudo comparar periodos')
            setCompareDatasetA(null)
            setCompareDatasetB(null)
        } finally {
            setCompareLoading(false)
        }
    }

    const clearComparison = () => {
        setCompareDatasetA(null)
        setCompareDatasetB(null)
        setCompareError(null)
        setCompareFromLocal('')
        setCompareToLocal('')
    }

    const comparisonMetrics = useMemo(() => {
        if (!compareDatasetA || !compareDatasetB) return []

        const totalA = compareDatasetA.totalEvents
        const totalB = compareDatasetB.totalEvents
        const meetingsHeldA = getEventCount(compareDatasetA.byEventType, 'meeting_confirmed_held')
        const meetingsHeldB = getEventCount(compareDatasetB.byEventType, 'meeting_confirmed_held')
        const snapshotsA = getEventCount(compareDatasetA.byEventType, 'forecast_snapshot_created')
        const snapshotsB = getEventCount(compareDatasetB.byEventType, 'forecast_snapshot_created')
        const stageChangesA = getEventCount(compareDatasetA.byEventType, 'lead_stage_changed')
        const stageChangesB = getEventCount(compareDatasetB.byEventType, 'lead_stage_changed')
        const closedA = getEventCount(compareDatasetA.byEventType, 'lead_closed')
        const closedB = getEventCount(compareDatasetB.byEventType, 'lead_closed')

        return [
            { label: 'Eventos totales', a: totalA, b: totalB },
            { label: 'Juntas confirmadas realizadas', a: meetingsHeldA, b: meetingsHeldB },
            { label: 'Snapshots de pronóstico', a: snapshotsA, b: snapshotsB },
            { label: 'Cambios de etapa', a: stageChangesA, b: stageChangesB },
            { label: 'Leads cerrados', a: closedA, b: closedB }
        ].map((row) => ({
            ...row,
            delta: row.b - row.a,
            deltaPct: computeDeltaPct(row.a, row.b)
        }))
    }, [compareDatasetA, compareDatasetB])

    const comparisonSellerDelta = useMemo(
        () => (compareDatasetA && compareDatasetB)
            ? buildDeltaRows(compareDatasetA.bySeller, compareDatasetB.bySeller, 10)
            : [],
        [compareDatasetA, compareDatasetB]
    )
    const comparisonIndustryDelta = useMemo(
        () => (compareDatasetA && compareDatasetB)
            ? buildDeltaRows(compareDatasetA.byIndustry, compareDatasetB.byIndustry, 10)
            : [],
        [compareDatasetA, compareDatasetB]
    )
    const comparisonStageDelta = useMemo(
        () => (compareDatasetA && compareDatasetB)
            ? buildDeltaRows(compareDatasetA.byStage, compareDatasetB.byStage, 10)
            : [],
        [compareDatasetA, compareDatasetB]
    )

    if (loading || auth.loading) {
        return (
            <div className='h-full flex items-center justify-center gap-2 font-bold' style={{ color: 'var(--text-secondary)' }}>
                <Loader2 size={18} className='animate-spin' />
                Cargando Insights de bitácora...
            </div>
        )
    }

    return (
        <div className='min-h-full p-8'>
            <div className='max-w-7xl mx-auto space-y-5'>
                <div className='rounded-2xl border p-5' style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
                    <div className='flex flex-wrap items-center justify-between gap-3'>
                        <div>
                            <div className='flex items-center gap-3'>
                                <div className='ah-icon-card ah-icon-card-sm'>
                                    <Activity size={22} strokeWidth={2.2} />
                                </div>
                                <h1 className='text-3xl font-black' style={{ color: 'var(--text-primary)' }}>
                                    Insights: Bitácora CRM
                                </h1>
                            </div>
                            <p className='mt-2 font-bold text-sm' style={{ color: 'var(--text-secondary)' }}>
                                Analiza trazabilidad por vendedor, industria y etapa usando eventos auditados en base de datos.
                            </p>
                            <p className='mt-1 text-xs font-bold' style={{ color: 'var(--text-secondary)' }}>
                                Vendedor = eventos auditados con actor. Etapa = transiciones reales (creado/cambio/cierre), no cualquier edición.
                            </p>
                        </div>
                        <div className='flex items-center gap-2'>
                            <span className='inline-flex items-center gap-2 rounded-xl border border-blue-500/35 bg-blue-500/10 px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-blue-300'>
                                <BarChart3 size={13} />
                                {totalEvents.toLocaleString('es-MX')} eventos
                            </span>
                            <button
                                type='button'
                                onClick={() => {
                                    void fetchInsights(true)
                                    void fetchIntegrity()
                                }}
                                className='inline-flex items-center gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--hover-bg)] px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-[var(--text-primary)] hover:border-blue-400/55 hover:text-blue-400 transition-colors cursor-pointer'
                                disabled={refreshing}
                            >
                                {refreshing ? <Loader2 size={14} className='animate-spin' /> : <RefreshCw size={14} />}
                                Refrescar
                            </button>
                        </div>
                    </div>
                </div>

                <div className='rounded-2xl border p-4 space-y-3' style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
                    <p className='text-[11px] font-black uppercase tracking-[0.16em] flex items-center gap-2' style={{ color: 'var(--text-secondary)' }}>
                        <CalendarRange size={13} />
                        Rango de análisis (Periodo A)
                    </p>
                    <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2'>
                        <input
                            type='datetime-local'
                            value={fromLocal}
                            onChange={(event) => setFromLocal(event.target.value)}
                            className='px-3 py-2 rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] text-sm font-bold text-[var(--text-primary)]'
                        />
                        <input
                            type='datetime-local'
                            value={toLocal}
                            onChange={(event) => setToLocal(event.target.value)}
                            className='px-3 py-2 rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] text-sm font-bold text-[var(--text-primary)]'
                        />
                        <button
                            type='button'
                            onClick={() => void fetchInsights(false)}
                            className='rounded-lg border border-blue-500/45 bg-blue-500/10 px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-blue-300 hover:bg-blue-500/20 transition-colors cursor-pointer'
                        >
                            Aplicar
                        </button>
                        <button
                            type='button'
                            onClick={() => void clearRange()}
                            className='rounded-lg border border-rose-500/45 bg-rose-500/10 px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-rose-300 hover:bg-rose-500/20 transition-colors cursor-pointer'
                        >
                            Limpiar A
                        </button>
                    </div>
                    <div className='flex flex-wrap items-center gap-2'>
                        <button
                            type='button'
                            onClick={() => void setQuickRange(7)}
                            className='rounded-lg border border-[var(--card-border)] bg-[var(--hover-bg)] px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-[var(--text-primary)] hover:border-blue-400/55 hover:text-blue-400 transition-colors cursor-pointer'
                        >
                            Últimos 7 días
                        </button>
                        <button
                            type='button'
                            onClick={() => void setQuickRange(30)}
                            className='rounded-lg border border-[var(--card-border)] bg-[var(--hover-bg)] px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-[var(--text-primary)] hover:border-blue-400/55 hover:text-blue-400 transition-colors cursor-pointer'
                        >
                            Últimos 30 días
                        </button>
                        <button
                            type='button'
                            onClick={() => void setQuickRange(90)}
                            className='rounded-lg border border-[var(--card-border)] bg-[var(--hover-bg)] px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-[var(--text-primary)] hover:border-blue-400/55 hover:text-blue-400 transition-colors cursor-pointer'
                        >
                            Últimos 90 días
                        </button>
                    </div>
                    <p className='text-xs font-bold' style={{ color: 'var(--text-secondary)' }}>
                        A: {fromLocal ? formatDateTime(fromLocalISOString(fromLocal).toISOString()) : 'Inicio abierto'} · {toLocal ? formatDateTime(fromLocalISOString(toLocal).toISOString()) : 'Fin abierto'}
                    </p>

                    <div className='pt-2 border-t space-y-3' style={{ borderColor: 'var(--card-border)' }}>
                        <p className='text-[11px] font-black uppercase tracking-[0.16em] flex items-center gap-2' style={{ color: 'var(--text-secondary)' }}>
                            <CalendarRange size={13} />
                            Comparación (Periodo B)
                        </p>
                        <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2'>
                            <input
                                type='datetime-local'
                                value={compareFromLocal}
                                onChange={(event) => setCompareFromLocal(event.target.value)}
                                className='px-3 py-2 rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] text-sm font-bold text-[var(--text-primary)]'
                            />
                            <input
                                type='datetime-local'
                                value={compareToLocal}
                                onChange={(event) => setCompareToLocal(event.target.value)}
                                className='px-3 py-2 rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] text-sm font-bold text-[var(--text-primary)]'
                            />
                            <button
                                type='button'
                                onClick={() => void runComparison()}
                                className='inline-flex items-center justify-center gap-2 rounded-lg border border-indigo-500/45 bg-indigo-500/10 px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-indigo-300 hover:bg-indigo-500/20 transition-colors cursor-pointer'
                                disabled={compareLoading}
                            >
                                {compareLoading ? <Loader2 size={13} className='animate-spin' /> : <GitBranch size={13} />}
                                Comparar A vs B
                            </button>
                            <button
                                type='button'
                                onClick={clearComparison}
                                className='rounded-lg border border-rose-500/45 bg-rose-500/10 px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-rose-300 hover:bg-rose-500/20 transition-colors cursor-pointer'
                            >
                                Limpiar comparación
                            </button>
                        </div>
                        <div className='flex flex-wrap items-center gap-2'>
                            <button
                                type='button'
                                onClick={() => setQuickRangeCompare(7)}
                                className='rounded-lg border border-[var(--card-border)] bg-[var(--hover-bg)] px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-[var(--text-primary)] hover:border-indigo-400/55 hover:text-indigo-400 transition-colors cursor-pointer'
                            >
                                B: Últimos 7 días
                            </button>
                            <button
                                type='button'
                                onClick={() => setQuickRangeCompare(30)}
                                className='rounded-lg border border-[var(--card-border)] bg-[var(--hover-bg)] px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-[var(--text-primary)] hover:border-indigo-400/55 hover:text-indigo-400 transition-colors cursor-pointer'
                            >
                                B: Últimos 30 días
                            </button>
                            <button
                                type='button'
                                onClick={() => setQuickRangeCompare(90)}
                                className='rounded-lg border border-[var(--card-border)] bg-[var(--hover-bg)] px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-[var(--text-primary)] hover:border-indigo-400/55 hover:text-indigo-400 transition-colors cursor-pointer'
                            >
                                B: Últimos 90 días
                            </button>
                        </div>
                        <p className='text-xs font-bold' style={{ color: 'var(--text-secondary)' }}>
                            B: {compareFromLocal ? formatDateTime(fromLocalISOString(compareFromLocal).toISOString()) : 'Inicio abierto'} · {compareToLocal ? formatDateTime(fromLocalISOString(compareToLocal).toISOString()) : 'Fin abierto'}
                        </p>
                    </div>
                </div>

                {error && (
                    <div className='rounded-2xl border p-4 font-bold text-sm' style={{ borderColor: '#ef4444', color: '#ef4444' }}>
                        {error}
                    </div>
                )}

                <div className='rounded-2xl border p-4 space-y-3' style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
                    <div className='flex flex-wrap items-center justify-between gap-2'>
                        <p className='text-[11px] font-black uppercase tracking-[0.16em] flex items-center gap-2' style={{ color: 'var(--text-secondary)' }}>
                            <Activity size={13} />
                            Integridad de captura de bitácora
                        </p>
                        <button
                            type='button'
                            onClick={() => void fetchIntegrity()}
                            className='rounded-lg border border-[var(--card-border)] bg-[var(--hover-bg)] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--text-primary)] hover:border-blue-400/55 hover:text-blue-400 transition-colors cursor-pointer'
                            disabled={integrityLoading}
                        >
                            {integrityLoading ? 'Validando...' : 'Validar'}
                        </button>
                    </div>

                    {integrityError && (
                        <div className='rounded-xl border px-3 py-2 text-xs font-bold' style={{ borderColor: '#ef4444', color: '#ef4444' }}>
                            {integrityError}
                        </div>
                    )}

                    {integritySummary && (
                        <>
                            <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2'>
                                <div className='rounded-xl border p-3' style={{ borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}>
                                    <p className='text-[10px] font-black uppercase tracking-[0.12em]' style={{ color: 'var(--text-secondary)' }}>Juntas totales</p>
                                    <p className='text-sm font-black mt-1' style={{ color: 'var(--text-primary)' }}>
                                        Fuente: {integritySummary.source.meetingsTotal.toLocaleString('es-MX')} · Audit: {integritySummary.audit.meetingScheduledEvents.toLocaleString('es-MX')}
                                    </p>
                                </div>
                                <div className='rounded-xl border p-3' style={{ borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}>
                                    <p className='text-[10px] font-black uppercase tracking-[0.12em]' style={{ color: 'var(--text-secondary)' }}>Juntas realizadas</p>
                                    <p className='text-sm font-black mt-1' style={{ color: 'var(--text-primary)' }}>
                                        Fuente: {integritySummary.source.meetingsHeld.toLocaleString('es-MX')} · Audit: {integritySummary.audit.meetingHeldEvents.toLocaleString('es-MX')}
                                    </p>
                                </div>
                                <div className='rounded-xl border p-3' style={{ borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}>
                                    <p className='text-[10px] font-black uppercase tracking-[0.12em]' style={{ color: 'var(--text-secondary)' }}>Juntas no realizadas</p>
                                    <p className='text-sm font-black mt-1' style={{ color: 'var(--text-primary)' }}>
                                        Fuente: {integritySummary.source.meetingsNotHeld.toLocaleString('es-MX')} · Audit: {integritySummary.audit.meetingNotHeldEvents.toLocaleString('es-MX')}
                                    </p>
                                </div>
                                <div className='rounded-xl border p-3' style={{ borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}>
                                    <p className='text-[10px] font-black uppercase tracking-[0.12em]' style={{ color: 'var(--text-secondary)' }}>Snapshots</p>
                                    <p className='text-sm font-black mt-1' style={{ color: 'var(--text-primary)' }}>
                                        Fuente: {integritySummary.source.forecastSnapshotsTotal.toLocaleString('es-MX')} · Audit: {integritySummary.audit.forecastSnapshotEvents.toLocaleString('es-MX')}
                                    </p>
                                </div>
                            </div>

                            <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2'>
                                {[
                                    { label: 'Gap juntas totales', value: integritySummary.gaps.meetingsScheduledGap },
                                    { label: 'Gap juntas realizadas', value: integritySummary.gaps.meetingsHeldGap },
                                    { label: 'Gap juntas no realizadas', value: integritySummary.gaps.meetingsNotHeldGap },
                                    { label: 'Gap snapshots', value: integritySummary.gaps.forecastSnapshotsGap }
                                ].map((row) => {
                                    const value = Number(row.value || 0)
                                    const valueClass = value === 0
                                        ? 'text-emerald-400'
                                        : value > 0
                                            ? 'text-blue-400'
                                            : 'text-amber-400'
                                    return (
                                        <div key={`integrity-gap-${row.label}`} className='rounded-xl border p-2.5' style={{ borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}>
                                            <p className='text-[10px] font-black uppercase tracking-[0.12em]' style={{ color: 'var(--text-secondary)' }}>{row.label}</p>
                                            <p className={`text-sm font-black mt-1 ${valueClass}`}>
                                                {value > 0 ? '+' : ''}{value.toLocaleString('es-MX')}
                                            </p>
                                        </div>
                                    )
                                })}
                            </div>

                            {integritySummary.maybeNeedsBackfill && (
                                <div className='rounded-xl border border-amber-500/45 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-300'>
                                    Se detectó data fuente sin eventos auditados equivalentes. Ejecuta la migración 102 para backfill histórico.
                                </div>
                            )}
                        </>
                    )}
                </div>

                {compareError && (
                    <div className='rounded-2xl border p-4 font-bold text-sm' style={{ borderColor: '#ef4444', color: '#ef4444' }}>
                        {compareError}
                    </div>
                )}

                {compareLoading && (
                    <div className='rounded-2xl border p-4 flex items-center gap-2 text-sm font-bold' style={{ borderColor: 'var(--card-border)', color: 'var(--text-secondary)', background: 'var(--card-bg)' }}>
                        <Loader2 size={15} className='animate-spin' />
                        Comparando periodos...
                    </div>
                )}

                {compareDatasetA && compareDatasetB && !compareLoading && (
                    <div className='rounded-2xl border p-4 space-y-4' style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
                        <p className='text-[11px] font-black uppercase tracking-[0.18em] flex items-center gap-2' style={{ color: 'var(--text-secondary)' }}>
                            <GitBranch size={13} />
                            Comparativa A vs B
                        </p>
                        <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3'>
                            {comparisonMetrics.map((metric) => {
                                const deltaPositive = metric.delta > 0
                                const deltaNegative = metric.delta < 0
                                const deltaColor = deltaPositive
                                    ? 'text-emerald-400'
                                    : deltaNegative
                                        ? 'text-rose-400'
                                        : 'text-[var(--text-secondary)]'
                                return (
                                    <div key={`comparison-metric-${metric.label}`} className='rounded-xl border p-3 space-y-1' style={{ borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}>
                                        <p className='text-[10px] font-black uppercase tracking-[0.12em]' style={{ color: 'var(--text-secondary)' }}>
                                            {metric.label}
                                        </p>
                                        <p className='text-sm font-black' style={{ color: 'var(--text-primary)' }}>
                                            A: {metric.a.toLocaleString('es-MX')}
                                        </p>
                                        <p className='text-sm font-black' style={{ color: 'var(--text-primary)' }}>
                                            B: {metric.b.toLocaleString('es-MX')}
                                        </p>
                                        <p className={`text-xs font-black ${deltaColor}`}>
                                            Δ {metric.delta > 0 ? '+' : ''}{metric.delta.toLocaleString('es-MX')}
                                            {metric.deltaPct != null ? ` (${metric.deltaPct > 0 ? '+' : ''}${metric.deltaPct.toFixed(1)}%)` : ''}
                                        </p>
                                    </div>
                                )
                            })}
                        </div>

                        <div className='grid grid-cols-1 xl:grid-cols-3 gap-3'>
                            <DeltaTable title='Δ por vendedor (Top 10)' rows={comparisonSellerDelta} />
                            <DeltaTable title='Δ por industria (Top 10)' rows={comparisonIndustryDelta} />
                            <DeltaTable title='Δ por etapa (Top 10)' rows={comparisonStageDelta} />
                        </div>
                    </div>
                )}

                <div className='grid grid-cols-1 xl:grid-cols-2 gap-4'>
                    <div className='space-y-3'>
                        <p className='text-[11px] font-black uppercase tracking-[0.16em] flex items-center gap-2' style={{ color: 'var(--text-secondary)' }}>
                            <UserRound size={13} />
                            Actividad por vendedor
                        </p>
                        <RankedBars title='Top vendedores por eventos' rows={bySeller} accentClassName='bg-gradient-to-r from-[#60a5fa] to-[#2563eb]' />
                    </div>

                    <div className='space-y-3'>
                        <p className='text-[11px] font-black uppercase tracking-[0.16em] flex items-center gap-2' style={{ color: 'var(--text-secondary)' }}>
                            <Building2 size={13} />
                            Actividad por industria
                        </p>
                        <RankedBars title='Top industrias impactadas' rows={byIndustry} accentClassName='bg-gradient-to-r from-[#34d399] to-[#059669]' />
                    </div>

                    <div className='space-y-3'>
                        <p className='text-[11px] font-black uppercase tracking-[0.16em] flex items-center gap-2' style={{ color: 'var(--text-secondary)' }}>
                            <GitBranch size={13} />
                            Actividad por etapa
                        </p>
                        <RankedBars title='Etapas más actualizadas' rows={byStage} accentClassName='bg-gradient-to-r from-[#f59e0b] to-[#d97706]' />
                    </div>

                    <div className='space-y-3'>
                        <p className='text-[11px] font-black uppercase tracking-[0.16em] flex items-center gap-2' style={{ color: 'var(--text-secondary)' }}>
                            <Activity size={13} />
                            Eventos más frecuentes
                        </p>
                        <RankedBars
                            title='Top eventos auditados'
                            rows={byEventType.map((row) => ({ label: eventLabel(row.eventType), count: row.count }))}
                            accentClassName='bg-gradient-to-r from-[#a78bfa] to-[#7c3aed]'
                        />
                    </div>
                </div>

                <div className='rounded-2xl border overflow-hidden' style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
                    <div className='px-4 py-3 border-b flex items-center justify-between gap-3' style={{ borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}>
                        <p className='text-xs font-black uppercase tracking-[0.2em]' style={{ color: 'var(--text-secondary)' }}>
                            Eventos recientes
                        </p>
                        <button
                            type='button'
                            onClick={() => setShowRecentEvents((prev) => !prev)}
                            className='h-8 px-3 rounded-xl border text-[10px] font-black uppercase tracking-[0.14em] transition-all cursor-pointer hover:scale-[1.01]'
                            style={{
                                borderColor: showRecentEvents ? '#1d4ed8' : 'var(--card-border)',
                                background: showRecentEvents ? 'rgba(37,99,235,0.14)' : 'var(--card-bg)',
                                color: showRecentEvents ? '#93c5fd' : 'var(--text-secondary)'
                            }}
                        >
                            {showRecentEvents ? 'Ocultar' : `Mostrar (${recentEvents.length})`}
                        </button>
                    </div>
                    {!showRecentEvents ? null : recentEvents.length === 0 ? (
                        <div className='p-6 text-sm font-bold' style={{ color: 'var(--text-secondary)' }}>
                            No hay eventos en el rango seleccionado.
                        </div>
                    ) : (
                        <div className='overflow-x-auto'>
                            <table className='w-full min-w-[920px]'>
                                <thead>
                                    <tr style={{ background: 'var(--hover-bg)' }}>
                                        <th className='px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.16em]' style={{ color: 'var(--text-secondary)' }}>Fecha</th>
                                        <th className='px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.16em]' style={{ color: 'var(--text-secondary)' }}>Evento</th>
                                        <th className='px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.16em]' style={{ color: 'var(--text-secondary)' }}>Entidad</th>
                                        <th className='px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.16em]' style={{ color: 'var(--text-secondary)' }}>ID Entidad</th>
                                        <th className='px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.16em]' style={{ color: 'var(--text-secondary)' }}>Actor</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentEvents.map((row) => (
                                        <tr key={`recent-audit-${row.id}`} className='border-t' style={{ borderColor: 'var(--card-border)' }}>
                                            <td className='px-4 py-3 text-xs font-bold whitespace-nowrap' style={{ color: 'var(--text-secondary)' }}>
                                                {formatDateTime(row.created_at)}
                                            </td>
                                            <td className='px-4 py-3 text-xs font-black' style={{ color: 'var(--text-primary)' }}>
                                                {eventLabel(row.event_type)}
                                            </td>
                                            <td className='px-4 py-3 text-xs font-black' style={{ color: 'var(--text-primary)' }}>
                                                {entityLabel(row.entity_type)}
                                            </td>
                                            <td className='px-4 py-3 text-xs font-bold' style={{ color: 'var(--text-secondary)' }}>
                                                {row.entity_id}
                                            </td>
                                            <td className='px-4 py-3 text-xs font-bold' style={{ color: 'var(--text-secondary)' }}>
                                                {row.actor_user_id ? `${row.actor_user_id.slice(0, 8)}…` : '-'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
