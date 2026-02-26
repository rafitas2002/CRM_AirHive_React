'use server'

import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase-admin'
import { createClient as createServerSupabaseClient } from '@/lib/supabase-server'

type LossAnalyticsRawRow = {
    lead_id: number
    seller_id: string | null
    seller_username: string | null
    seller_full_name?: string | null
    seller_avatar_url?: string | null
    empresa_id: string | null
    empresa: string | null
    nombre: string | null
    etapa: string | null
    valor_estimado: number | null
    valor_real_cierre: number | null
    valor_implementacion_estimado?: number | null
    closed_at_real: string | null
    loss_recorded_at: string | null
    loss_recorded_by: string | null
    fecha_registro?: string | null
    created_at?: string | null
    loss_month: string | null
    loss_reason_id: string | null
    loss_reason_code: string | null
    loss_reason_label: string | null
    loss_subreason_id: string | null
    loss_subreason_code: string | null
    loss_subreason_label: string | null
    loss_notes: string | null
    industria_id?: string | null
    industria?: string | null
    tamano_empresa?: number | null
}

export type LeadLossAnalyticsRow = {
    lead_id: number
    seller_id: string | null
    seller_username: string | null
    seller_full_name: string | null
    seller_avatar_url: string | null
    empresa_id: string | null
    empresa: string | null
    nombre: string | null
    etapa: string | null
    valor_estimado: number
    valor_implementacion_estimado: number
    closed_at_real: string | null
    loss_recorded_at: string | null
    fecha_registro: string | null
    created_at: string | null
    loss_reason_id: string | null
    loss_reason_code: string | null
    loss_reason_label: string | null
    loss_subreason_id: string | null
    loss_subreason_code: string | null
    loss_subreason_label: string | null
    loss_notes: string | null
    industria_id: string | null
    industria: string | null
    tamano_empresa: number | null
}

type LossAnalyticsSupportPayload = {
    rows: LeadLossAnalyticsRow[]
    sellerOptions: Array<{ id: string; label: string }>
    industryOptions: Array<{ label: string }>
    reasonOptions: Array<{ id: string; label: string }>
    subreasonOptions: Array<{ id: string; reason_id: string | null; label: string }>
    generatedAt: string
    scope: 'all' | 'own'
}

type LossAnalyticsPreset = 'month' | '30d' | 'quarter'

type AggregatedLossKpis = {
    lostCount: number
    monthlyLostValue: number
    implementationLostValue: number
    totalLostValue: number
    topReasonLabel: string
    unclassifiedPct: number
    avgCycleDays: number | null
}

export type LeadLossExecutiveSummaryPayload = {
    generatedAt: string
    scope: 'all' | 'own'
    currentPreset: LossAnalyticsPreset
    current: AggregatedLossKpis
    previous: AggregatedLossKpis
    delta: {
        lostCountPct: number | null
        totalLostValuePct: number | null
        avgCycleDaysDiff: number | null
        topReasonChanged: boolean
    }
    topReasons: Array<{ label: string; count: number; totalValue: number; sharePct: number }>
    topSellers: Array<{ sellerId: string | null; name: string; count: number; totalValue: number }>
    topIndustries: Array<{ label: string; count: number; totalValue: number }>
    signals: string[]
}

function getLossReferenceDate(row: Pick<LeadLossAnalyticsRow, 'closed_at_real' | 'loss_recorded_at' | 'fecha_registro' | 'created_at'>) {
    return row.closed_at_real || row.loss_recorded_at || row.fecha_registro || row.created_at || null
}

function getLossPeriodRange(preset: LossAnalyticsPreset, now = new Date()) {
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

function getPreviousLossPeriodRange(preset: LossAnalyticsPreset, now = new Date()) {
    const current = getLossPeriodRange(preset, now)
    if (preset === '30d') {
        const previousEnd = new Date(current.start)
        previousEnd.setMilliseconds(previousEnd.getMilliseconds() - 1)
        const previousStart = new Date(previousEnd)
        previousStart.setDate(previousStart.getDate() - 29)
        previousStart.setHours(0, 0, 0, 0)
        return { start: previousStart, end: previousEnd }
    }
    if (preset === 'quarter') {
        const previousEnd = new Date(current.start)
        previousEnd.setMilliseconds(previousEnd.getMilliseconds() - 1)
        const previousStart = new Date(current.start)
        previousStart.setMonth(previousStart.getMonth() - 3, 1)
        previousStart.setHours(0, 0, 0, 0)
        return { start: previousStart, end: previousEnd }
    }
    const previousMonthStart = new Date(current.start)
    previousMonthStart.setMonth(previousMonthStart.getMonth() - 1, 1)
    previousMonthStart.setHours(0, 0, 0, 0)
    const previousMonthEnd = new Date(current.start)
    previousMonthEnd.setMilliseconds(previousMonthEnd.getMilliseconds() - 1)
    return { start: previousMonthStart, end: previousMonthEnd }
}

function filterLossRowsByRange(rows: LeadLossAnalyticsRow[], range: { start: Date; end: Date }) {
    const startMs = range.start.getTime()
    const endMs = range.end.getTime()
    return rows.filter((row) => {
        const refDate = getLossReferenceDate(row)
        if (!refDate) return false
        const ms = new Date(refDate).getTime()
        if (!Number.isFinite(ms)) return false
        return ms >= startMs && ms <= endMs
    })
}

function aggregateLossRows(rows: LeadLossAnalyticsRow[]): AggregatedLossKpis {
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
        const currentReason = reasonCounts.get(reasonKey) || { label: reasonLabel, count: 0 }
        currentReason.count += 1
        reasonCounts.set(reasonKey, currentReason)

        if (!row.loss_reason_id || !row.loss_subreason_id) unclassified += 1

        const startRaw = row.fecha_registro || row.created_at || null
        const endRaw = getLossReferenceDate(row)
        if (startRaw && endRaw) {
            const startMs = new Date(startRaw).getTime()
            const endMs = new Date(endRaw).getTime()
            if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) {
                cycleDaysTotal += (endMs - startMs) / (1000 * 60 * 60 * 24)
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

function pctDelta(current: number, previous: number) {
    if (previous === 0) {
        if (current === 0) return 0
        return null
    }
    return ((current - previous) / previous) * 100
}

export async function getLeadLossAnalyticsSupportData() {
    try {
        const cookieStore = await cookies()
        const supabase = createServerSupabaseClient(cookieStore)
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return { success: false as const, error: 'Sesión no encontrada' }
        }

        const { data: meProfile } = await (supabase.from('profiles') as any)
            .select('id, role')
            .eq('id', user.id)
            .maybeSingle()

        if (!meProfile) {
            return { success: false as const, error: 'Perfil no encontrado' }
        }

        const canSeeAll = ['admin', 'rh'].includes(String(meProfile.role || '').toLowerCase())
        const adminClient = createAdminClient()

        const buildAnalyticsQuery = (viewName: 'lead_loss_analytics_enriched_view' | 'lead_loss_analytics_view') => {
            let query = (adminClient.from(viewName) as any)
                .select('*')
                .order('closed_at_real', { ascending: false, nullsFirst: false })
                .order('loss_recorded_at', { ascending: false, nullsFirst: false })
            if (!canSeeAll) query = query.eq('seller_id', user.id)
            return query
        }

        let usingEnrichedView = true
        let analyticsRows: any[] | null = null

        const enrichedRes = await buildAnalyticsQuery('lead_loss_analytics_enriched_view')
        if (enrichedRes.error) {
            const normalizedEnrichedError = String(enrichedRes.error?.message || '').toLowerCase()
            const enrichedViewMissing =
                normalizedEnrichedError.includes('lead_loss_analytics_enriched_view')
                || normalizedEnrichedError.includes('42p01')
                || normalizedEnrichedError.includes('does not exist')

            if (!enrichedViewMissing) {
                throw enrichedRes.error
            }

            usingEnrichedView = false
            const baseRes = await buildAnalyticsQuery('lead_loss_analytics_view')
            if (baseRes.error) throw baseRes.error
            analyticsRows = baseRes.data || []
        } else {
            analyticsRows = enrichedRes.data || []
        }

        const rawRows = (analyticsRows || []) as LossAnalyticsRawRow[]
        let profileMap = new Map<string, { full_name?: string | null; avatar_url?: string | null }>()
        let companyMap = new Map<string, { industria_id?: string | null; industria?: string | null; tamano?: number | null }>()
        let leadMap = new Map<number, { valor_implementacion_estimado?: number | null; fecha_registro?: string | null; created_at?: string | null }>()

        if (!usingEnrichedView) {
            const sellerIds = Array.from(new Set(rawRows.map((r) => String(r.seller_id || '')).filter(Boolean)))
            const companyIds = Array.from(new Set(rawRows.map((r) => String(r.empresa_id || '')).filter(Boolean)))
            const leadIds = Array.from(new Set(rawRows.map((r) => Number(r.lead_id)).filter((id) => Number.isFinite(id))))

            const [profilesRes, companiesRes, leadsRes] = await Promise.all([
                sellerIds.length > 0
                    ? (adminClient.from('profiles') as any)
                        .select('id, full_name')
                        .in('id', sellerIds)
                    : Promise.resolve({ data: [], error: null } as any),
                companyIds.length > 0
                    ? (adminClient.from('empresas') as any)
                        .select('id, industria_id, industria, tamano')
                        .in('id', companyIds)
                    : Promise.resolve({ data: [], error: null } as any),
                leadIds.length > 0
                    ? (adminClient.from('clientes') as any)
                        .select('id, valor_implementacion_estimado, fecha_registro, created_at')
                        .in('id', leadIds)
                    : Promise.resolve({ data: [], error: null } as any)
            ])

            if (profilesRes.error) throw profilesRes.error
            if (companiesRes.error) throw companiesRes.error
            if (leadsRes.error) throw leadsRes.error

            profileMap = new Map<string, { full_name?: string | null; avatar_url?: string | null }>(
                ((profilesRes.data || []) as any[]).map((row) => [String(row.id), row])
            )
            companyMap = new Map<string, { industria_id?: string | null; industria?: string | null; tamano?: number | null }>(
                ((companiesRes.data || []) as any[]).map((row) => [String(row.id), row])
            )
            leadMap = new Map<number, { valor_implementacion_estimado?: number | null; fecha_registro?: string | null; created_at?: string | null }>(
                ((leadsRes.data || []) as any[]).map((row) => [Number(row.id), row])
            )
        }

        const rows: LeadLossAnalyticsRow[] = rawRows.map((row) => {
            const sellerId = row.seller_id ? String(row.seller_id) : null
            const profile = sellerId ? profileMap.get(sellerId) : null
            const companyId = row.empresa_id ? String(row.empresa_id) : null
            const company = companyId ? companyMap.get(companyId) : null
            const leadMeta = leadMap.get(Number(row.lead_id))

            return {
                lead_id: Number(row.lead_id),
                seller_id: sellerId,
                seller_username: row.seller_username ? String(row.seller_username) : null,
                seller_full_name: row.seller_full_name != null
                    ? String(row.seller_full_name)
                    : (profile?.full_name ? String(profile.full_name) : null),
                seller_avatar_url: row.seller_avatar_url != null
                    ? String(row.seller_avatar_url)
                    : (profile?.avatar_url ? String(profile.avatar_url) : null),
                empresa_id: companyId,
                empresa: row.empresa ? String(row.empresa) : null,
                nombre: row.nombre ? String(row.nombre) : null,
                etapa: row.etapa ? String(row.etapa) : null,
                valor_estimado: row.valor_estimado == null ? 0 : Number(row.valor_estimado),
                valor_implementacion_estimado: row.valor_implementacion_estimado != null
                    ? Number(row.valor_implementacion_estimado)
                    : (leadMeta?.valor_implementacion_estimado == null ? 0 : Number(leadMeta.valor_implementacion_estimado)),
                closed_at_real: row.closed_at_real ? String(row.closed_at_real) : null,
                loss_recorded_at: row.loss_recorded_at ? String(row.loss_recorded_at) : null,
                fecha_registro: row.fecha_registro != null
                    ? String(row.fecha_registro)
                    : (leadMeta?.fecha_registro ? String(leadMeta.fecha_registro) : null),
                created_at: row.created_at != null
                    ? String(row.created_at)
                    : (leadMeta?.created_at ? String(leadMeta.created_at) : null),
                loss_reason_id: row.loss_reason_id ? String(row.loss_reason_id) : null,
                loss_reason_code: row.loss_reason_code ? String(row.loss_reason_code) : null,
                loss_reason_label: row.loss_reason_label ? String(row.loss_reason_label) : null,
                loss_subreason_id: row.loss_subreason_id ? String(row.loss_subreason_id) : null,
                loss_subreason_code: row.loss_subreason_code ? String(row.loss_subreason_code) : null,
                loss_subreason_label: row.loss_subreason_label ? String(row.loss_subreason_label) : null,
                loss_notes: row.loss_notes ? String(row.loss_notes) : null,
                industria_id: row.industria_id != null
                    ? String(row.industria_id)
                    : (company?.industria_id ? String(company.industria_id) : null),
                industria: row.industria != null
                    ? String(row.industria)
                    : (company?.industria ? String(company.industria) : null),
                tamano_empresa: row.tamano_empresa != null
                    ? Number(row.tamano_empresa)
                    : (company?.tamano == null ? null : Number(company.tamano))
            }
        })

        const sellerOptions = Array.from(new Map(
            rows
                .filter((row) => row.seller_id)
                .map((row) => [
                    String(row.seller_id),
                    {
                        id: String(row.seller_id),
                        label: String(row.seller_full_name || row.seller_username || 'Sin asignar')
                    }
                ])
        ).values()).sort((a, b) => a.label.localeCompare(b.label, 'es'))

        const industryOptions = Array.from(new Set(
            rows.map((row) => String(row.industria || '').trim()).filter(Boolean)
        ))
            .sort((a, b) => a.localeCompare(b, 'es'))
            .map((label) => ({ label }))

        const reasonOptionsFromRows = Array.from(new Map(
            rows
                .filter((row) => row.loss_reason_id && row.loss_reason_label)
                .map((row) => [String(row.loss_reason_id), { id: String(row.loss_reason_id), label: String(row.loss_reason_label) }])
        ).values()).sort((a, b) => a.label.localeCompare(b.label, 'es'))

        const subreasonOptionsFromRows = Array.from(new Map(
            rows
                .filter((row) => row.loss_subreason_id && row.loss_subreason_label)
                .map((row) => [
                    String(row.loss_subreason_id),
                    {
                        id: String(row.loss_subreason_id),
                        reason_id: row.loss_reason_id ? String(row.loss_reason_id) : null,
                        label: String(row.loss_subreason_label)
                    }
                ])
        ).values()).sort((a, b) => a.label.localeCompare(b.label, 'es'))

        let reasonOptions = reasonOptionsFromRows
        let subreasonOptions = subreasonOptionsFromRows

        const [reasonCatalogRes, subreasonCatalogRes] = await Promise.all([
            (adminClient.from('lead_loss_reasons') as any)
                .select('id, label, sort_order, is_active')
                .eq('is_active', true)
                .order('sort_order', { ascending: true })
                .order('label', { ascending: true }),
            (adminClient.from('lead_loss_subreasons') as any)
                .select('id, reason_id, label, sort_order, is_active')
                .eq('is_active', true)
                .order('sort_order', { ascending: true })
                .order('label', { ascending: true })
        ])

        if (!reasonCatalogRes.error && Array.isArray(reasonCatalogRes.data) && reasonCatalogRes.data.length > 0) {
            reasonOptions = (reasonCatalogRes.data as any[])
                .map((row) => ({
                    id: String(row?.id || ''),
                    label: String(row?.label || 'Motivo')
                }))
                .filter((row) => row.id)
        }

        if (!subreasonCatalogRes.error && Array.isArray(subreasonCatalogRes.data) && subreasonCatalogRes.data.length > 0) {
            subreasonOptions = (subreasonCatalogRes.data as any[])
                .map((row) => ({
                    id: String(row?.id || ''),
                    reason_id: row?.reason_id ? String(row.reason_id) : null,
                    label: String(row?.label || 'Submotivo')
                }))
                .filter((row) => row.id)
        }

        const payload: LossAnalyticsSupportPayload = {
            rows,
            sellerOptions,
            industryOptions,
            reasonOptions,
            subreasonOptions,
            generatedAt: new Date().toISOString(),
            scope: canSeeAll ? 'all' : 'own'
        }

        return { success: true as const, data: payload }
    } catch (error: any) {
        const rawMessage = String(error?.message || 'No se pudo cargar analytics de pérdidas.')
        const normalized = rawMessage.toLowerCase()
        const missingSchema =
            normalized.includes('lead_loss_analytics_view')
            || normalized.includes('lead_loss_analytics_enriched_view')
            || normalized.includes('lead_loss_reasons')
            || normalized.includes('lead_loss_subreasons')
            || normalized.includes('42p01')
            || normalized.includes('does not exist')

        return {
            success: false as const,
            error: missingSchema
                ? 'Analytics de pérdidas no disponibles en esta base. Ejecuta la migración 060.'
                : rawMessage
        }
    }
}

export async function getLeadLossExecutiveSummarySupportData(preset: LossAnalyticsPreset = 'month') {
    const base = await getLeadLossAnalyticsSupportData()
    if (!base.success) return base

    try {
        const rows = base.data.rows || []
        const currentRange = getLossPeriodRange(preset)
        const previousRange = getPreviousLossPeriodRange(preset)
        const currentRows = filterLossRowsByRange(rows, currentRange)
        const previousRows = filterLossRowsByRange(rows, previousRange)

        const current = aggregateLossRows(currentRows)
        const previous = aggregateLossRows(previousRows)

        const totalCurrentCount = Math.max(1, currentRows.length)

        const topReasons = Array.from(
            currentRows.reduce((acc, row) => {
                const key = String(row.loss_reason_id || 'sin-clasificar')
                const label = String(row.loss_reason_label || 'Sin clasificar')
                const currentRow = acc.get(key) || { label, count: 0, totalValue: 0 }
                currentRow.count += 1
                currentRow.totalValue += Number(row.valor_estimado || 0) + Number(row.valor_implementacion_estimado || 0)
                acc.set(key, currentRow)
                return acc
            }, new Map<string, { label: string; count: number; totalValue: number }>())
                .values()
        )
            .map((row) => ({ ...row, sharePct: (row.count / totalCurrentCount) * 100 }))
            .sort((a, b) => b.count - a.count || b.totalValue - a.totalValue)
            .slice(0, 3)

        const topSellers = Array.from(
            currentRows.reduce((acc, row) => {
                const key = String(row.seller_id || row.seller_username || 'sin-asignar')
                const name = String(row.seller_full_name || row.seller_username || 'Sin asignar')
                const currentRow = acc.get(key) || { sellerId: row.seller_id, name, count: 0, totalValue: 0 }
                currentRow.count += 1
                currentRow.totalValue += Number(row.valor_estimado || 0) + Number(row.valor_implementacion_estimado || 0)
                acc.set(key, currentRow)
                return acc
            }, new Map<string, { sellerId: string | null; name: string; count: number; totalValue: number }>())
                .values()
        ).sort((a, b) => b.count - a.count || b.totalValue - a.totalValue).slice(0, 3)

        const topIndustries = Array.from(
            currentRows.reduce((acc, row) => {
                const key = String(row.industria || 'Sin industria')
                const currentRow = acc.get(key) || { label: key, count: 0, totalValue: 0 }
                currentRow.count += 1
                currentRow.totalValue += Number(row.valor_estimado || 0) + Number(row.valor_implementacion_estimado || 0)
                acc.set(key, currentRow)
                return acc
            }, new Map<string, { label: string; count: number; totalValue: number }>())
                .values()
        ).sort((a, b) => b.count - a.count || b.totalValue - a.totalValue).slice(0, 3)

        const signals: string[] = []
        const currentTopReason = topReasons[0]
        if (currentTopReason) {
            if (currentTopReason.label.toLowerCase().includes('compet')) {
                signals.push(`Competencia domina pérdidas (${Math.round(currentTopReason.sharePct)}% del periodo).`)
            }
            if (currentTopReason.label.toLowerCase().includes('tim')) {
                signals.push(`Timing es el motivo principal de pérdida este periodo.`)
            }
            if (currentTopReason.label.toLowerCase().includes('fit')) {
                signals.push(`No fit domina el periodo; revisar calificación y discovery.`)
            }
        }
        const previousTopReasonLabel = previous.topReasonLabel
        if (current.topReasonLabel !== 'Sin datos' && previousTopReasonLabel !== 'Sin datos' && current.topReasonLabel !== previousTopReasonLabel) {
            signals.push(`Cambio de patrón: motivo principal pasó de "${previousTopReasonLabel}" a "${current.topReasonLabel}".`)
        }
        if (topSellers[0]) {
            signals.push(`${topSellers[0].name} concentra más pérdidas (${topSellers[0].count}) en el periodo.`)
        }
        if (current.unclassifiedPct > 10) {
            signals.push(`Calidad de captura: ${Math.round(current.unclassifiedPct)}% sin clasificar.`)
        }

        const payload: LeadLossExecutiveSummaryPayload = {
            generatedAt: base.data.generatedAt,
            scope: base.data.scope,
            currentPreset: preset,
            current,
            previous,
            delta: {
                lostCountPct: pctDelta(current.lostCount, previous.lostCount),
                totalLostValuePct: pctDelta(current.totalLostValue, previous.totalLostValue),
                avgCycleDaysDiff: (current.avgCycleDays == null || previous.avgCycleDays == null)
                    ? null
                    : (current.avgCycleDays - previous.avgCycleDays),
                topReasonChanged: current.topReasonLabel !== previous.topReasonLabel
                    && current.topReasonLabel !== 'Sin datos'
                    && previous.topReasonLabel !== 'Sin datos'
            },
            topReasons,
            topSellers,
            topIndustries,
            signals: signals.slice(0, 4)
        }

        return { success: true as const, data: payload }
    } catch (error: any) {
        return { success: false as const, error: error?.message || 'No se pudo construir el resumen ejecutivo de pérdidas' }
    }
}
