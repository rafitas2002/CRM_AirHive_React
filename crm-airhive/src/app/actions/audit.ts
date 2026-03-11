'use server'

import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { cookies } from 'next/headers'

type AuditFilters = {
    eventType?: string
    entityType?: string
    entityId?: string
    actorUserId?: string
    from?: string
    to?: string
    limit?: number
}

type AuditInsightsFilters = {
    from?: string
    to?: string
    limit?: number
}

const isAdminOrRH = (role: unknown) => {
    const normalized = String(role || '').trim().toLowerCase()
    return normalized === 'admin' || normalized === 'rh'
}

const normalizeSignature = (value: unknown) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

const isDesignatedApprover = (profile: any, email?: string | null) => {
    const normalizedUsername = normalizeSignature(profile?.username)
    const normalizedFullName = normalizeSignature(profile?.full_name)
    const normalizedEmailUser = normalizeSignature(String(email || '').split('@')[0])
    return normalizedUsername === 'jesus.gracia'
        || normalizedFullName === 'jesus gracia'
        || normalizedEmailUser === 'jesus.gracia'
}

const formatActorLabel = (profile: any, actorId: string) => {
    const fullName = String(profile?.full_name || '').trim()
    const username = String(profile?.username || '').trim()
    if (fullName) return fullName
    if (username) return username
    return actorId
}

const normalizeStageLabel = (stageRaw: unknown) => {
    const normalized = String(stageRaw || '').trim().toLowerCase()
    if (!normalized) return 'Sin etapa'
    if (['negociacion', 'negociación', 'in negotiation', 'in_negotiation'].includes(normalized)) return 'Negociación'
    if (['cerrado ganado', 'cerrada ganada', 'won', 'closed won'].includes(normalized)) return 'Cerrado Ganado'
    if (['cerrado perdido', 'cerrada perdida', 'lost', 'closed lost'].includes(normalized)) return 'Cerrado Perdido'
    if (['activo', 'active'].includes(normalized)) return 'Activo'
    if (['suspect', 'prelead', 'pre_lead'].includes(normalized)) return 'Suspect'
    return String(stageRaw || '').trim() || 'Sin etapa'
}

export async function getCrmAuditLog(filters: AuditFilters = {}) {
    try {
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)
        const adminClient = createAdminClient()

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('No autenticado')

        const { data: profile, error: profileError } = await (supabase.from('profiles') as any)
            .select('id, role, username, full_name')
            .eq('id', user.id)
            .single()

        if (profileError) throw profileError
        if (!isAdminOrRH(profile?.role) && !isDesignatedApprover(profile, user.email || null)) {
            throw new Error('No tienes permisos para consultar la bitácora')
        }

        const limit = Math.max(1, Math.min(2000, Number(filters.limit || 200)))
        const eventType = String(filters.eventType || '').trim()
        const entityType = String(filters.entityType || '').trim()
        const entityId = String(filters.entityId || '').trim()
        const actorUserId = String(filters.actorUserId || '').trim()
        const from = String(filters.from || '').trim()
        const to = String(filters.to || '').trim()

        let query = (adminClient.from('crm_audit_log_latest_v') as any)
            .select('*')
            .limit(limit)

        if (eventType) query = query.eq('event_type', eventType)
        if (entityType) query = query.eq('entity_type', entityType)
        if (entityId) query = query.eq('entity_id', entityId)
        if (actorUserId) query = query.eq('actor_user_id', actorUserId)
        if (from) query = query.gte('created_at', from)
        if (to) query = query.lte('created_at', to)

        query = query.order('created_at', { ascending: false }).order('id', { ascending: false })

        const { data, error } = await query
        if (error) throw error

        return {
            success: true,
            data: Array.isArray(data) ? data : []
        }
    } catch (error: any) {
        console.error('Error fetching CRM audit log:', error)
        return { success: false, error: error?.message || 'No se pudo consultar la bitácora' }
    }
}

export async function getCrmAuditSummary(params?: { from?: string; to?: string }) {
    try {
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)
        const adminClient = createAdminClient()

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('No autenticado')

        const { data: profile, error: profileError } = await (supabase.from('profiles') as any)
            .select('id, role, username, full_name')
            .eq('id', user.id)
            .single()
        if (profileError) throw profileError
        if (!isAdminOrRH(profile?.role) && !isDesignatedApprover(profile, user.email || null)) {
            throw new Error('No tienes permisos para consultar la bitácora')
        }

        const from = String(params?.from || '').trim()
        const to = String(params?.to || '').trim()

        let query = (adminClient.from('crm_audit_log') as any)
            .select('event_type, entity_type, created_at')
            .limit(50000)

        if (from) query = query.gte('created_at', from)
        if (to) query = query.lte('created_at', to)

        const { data, error } = await query
        if (error) throw error

        const rows = Array.isArray(data) ? data : []
        const byEventType = new Map<string, number>()
        const byEntityType = new Map<string, number>()

        rows.forEach((row: any) => {
            const eventType = String(row?.event_type || 'unknown')
            const entityType = String(row?.entity_type || 'unknown')
            byEventType.set(eventType, Number(byEventType.get(eventType) || 0) + 1)
            byEntityType.set(entityType, Number(byEntityType.get(entityType) || 0) + 1)
        })

        return {
            success: true,
            data: {
                totalEvents: rows.length,
                byEventType: Array.from(byEventType.entries())
                    .map(([eventType, count]) => ({ eventType, count }))
                    .sort((a, b) => b.count - a.count),
                byEntityType: Array.from(byEntityType.entries())
                    .map(([entityType, count]) => ({ entityType, count }))
                    .sort((a, b) => b.count - a.count)
            }
        }
    } catch (error: any) {
        console.error('Error fetching CRM audit summary:', error)
        return { success: false, error: error?.message || 'No se pudo resumir la bitácora' }
    }
}

export async function getCrmAuditInsights(filters: AuditInsightsFilters = {}) {
    try {
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)
        const adminClient = createAdminClient()

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('No autenticado')

        const { data: profile, error: profileError } = await (supabase.from('profiles') as any)
            .select('id, role, username, full_name')
            .eq('id', user.id)
            .single()
        if (profileError) throw profileError
        if (!isAdminOrRH(profile?.role) && !isDesignatedApprover(profile, user.email || null)) {
            throw new Error('No tienes permisos para consultar insights de bitácora')
        }

        const from = String(filters.from || '').trim()
        const to = String(filters.to || '').trim()
        const limit = Math.max(100, Math.min(25000, Number(filters.limit || 12000)))

        let query = (adminClient.from('crm_audit_log') as any)
            .select('id, event_type, entity_type, entity_id, actor_user_id, before_data, after_data, context_data, created_at')
            .limit(limit)
            .order('created_at', { ascending: false })

        if (from) query = query.gte('created_at', from)
        if (to) query = query.lte('created_at', to)

        const { data, error } = await query
        if (error) throw error

        const rows = Array.isArray(data) ? data : []
        const actorIds = new Set<string>()
        const companyIds = new Set<string>()

        rows.forEach((row: any) => {
            const actorId = String(row?.actor_user_id || '').trim()
            if (actorId) actorIds.add(actorId)

            const afterData = row?.after_data && typeof row.after_data === 'object' ? row.after_data : {}
            const beforeData = row?.before_data && typeof row.before_data === 'object' ? row.before_data : {}
            const companyIdFromAfter = String((afterData as any)?.empresa_id || '').trim()
            const companyIdFromBefore = String((beforeData as any)?.empresa_id || '').trim()
            if (companyIdFromAfter) companyIds.add(companyIdFromAfter)
            if (companyIdFromBefore) companyIds.add(companyIdFromBefore)
        })

        const [profilesResult, companiesResult] = await Promise.all([
            actorIds.size > 0
                ? (adminClient.from('profiles') as any)
                    .select('id, full_name, username')
                    .in('id', Array.from(actorIds))
                : Promise.resolve({ data: [], error: null }),
            companyIds.size > 0
                ? (adminClient.from('empresas') as any)
                    .select('id, industria')
                    .in('id', Array.from(companyIds))
                : Promise.resolve({ data: [], error: null })
        ])

        if (profilesResult?.error) throw profilesResult.error
        if (companiesResult?.error) throw companiesResult.error

        const profileById = new Map<string, any>()
        for (const row of profilesResult?.data || []) {
            const id = String((row as any)?.id || '').trim()
            if (!id) continue
            profileById.set(id, row)
        }

        const companyIndustryById = new Map<string, string>()
        for (const row of companiesResult?.data || []) {
            const id = String((row as any)?.id || '').trim()
            if (!id) continue
            const industryName = String((row as any)?.industria || '').trim() || 'Sin industria'
            companyIndustryById.set(id, industryName)
        }

        const byEventTypeMap = new Map<string, number>()
        const bySellerMap = new Map<string, number>()
        const byIndustryMap = new Map<string, number>()
        const byStageMap = new Map<string, number>()

        rows.forEach((row: any) => {
            const eventType = String(row?.event_type || '').trim() || 'unknown'
            byEventTypeMap.set(eventType, Number(byEventTypeMap.get(eventType) || 0) + 1)

            const actorId = String(row?.actor_user_id || '').trim()
            if (actorId) {
                const actorLabel = formatActorLabel(profileById.get(actorId), actorId)
                bySellerMap.set(actorLabel, Number(bySellerMap.get(actorLabel) || 0) + 1)
            }

            const entityType = String(row?.entity_type || '').trim().toLowerCase()
            if (entityType !== 'lead') return

            const afterData = row?.after_data && typeof row.after_data === 'object' ? row.after_data : {}
            const beforeData = row?.before_data && typeof row.before_data === 'object' ? row.before_data : {}
            const companyId = String((afterData as any)?.empresa_id || (beforeData as any)?.empresa_id || '').trim()
            const stageEventType = eventType.toLowerCase()
            const isStageTransitionEvent = stageEventType === 'lead_stage_changed'
                || stageEventType === 'lead_closed'
                || stageEventType === 'lead_created'

            if (isStageTransitionEvent) {
                const stageLabel = normalizeStageLabel((afterData as any)?.etapa ?? (beforeData as any)?.etapa)
                if (stageLabel) {
                    byStageMap.set(stageLabel, Number(byStageMap.get(stageLabel) || 0) + 1)
                }
            }

            const industryLabel = companyId
                ? (companyIndustryById.get(companyId) || 'Sin industria')
                : 'Sin industria'
            byIndustryMap.set(industryLabel, Number(byIndustryMap.get(industryLabel) || 0) + 1)
        })

        const toSortedRows = (map: Map<string, number>, keyName: 'label' | 'eventType') => {
            return Array.from(map.entries())
                .map(([key, count]) => (
                    keyName === 'eventType'
                        ? { eventType: key, count }
                        : { label: key, count }
                ))
                .sort((a: any, b: any) => b.count - a.count)
        }

        return {
            success: true,
            data: {
                totalEvents: rows.length,
                range: {
                    from: from || null,
                    to: to || null
                },
                byEventType: toSortedRows(byEventTypeMap, 'eventType'),
                bySeller: toSortedRows(bySellerMap, 'label'),
                byIndustry: toSortedRows(byIndustryMap, 'label'),
                byStage: toSortedRows(byStageMap, 'label'),
                definitions: {
                    bySeller: 'Cuenta eventos auditados con actor_user_id por usuario dentro del rango.',
                    byIndustry: 'Cuenta eventos de entidad lead y los agrupa por industria de la empresa vinculada.',
                    byStage: 'Cuenta solo transiciones de etapa (lead_created, lead_stage_changed, lead_closed) agrupadas por etapa destino.'
                },
                recentEvents: rows.slice(0, 40)
            }
        }
    } catch (error: any) {
        console.error('Error fetching CRM audit insights:', error)
        return { success: false, error: error?.message || 'No se pudieron cargar los insights de bitácora' }
    }
}

export async function getCrmAuditIntegrityCheck() {
    try {
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)
        const adminClient = createAdminClient()

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('No autenticado')

        const { data: profile, error: profileError } = await (supabase.from('profiles') as any)
            .select('id, role, username, full_name')
            .eq('id', user.id)
            .single()
        if (profileError) throw profileError
        if (!isAdminOrRH(profile?.role) && !isDesignatedApprover(profile, user.email || null)) {
            throw new Error('No tienes permisos para revisar integridad de bitácora')
        }

        const [
            meetingsTotalRes,
            meetingsHeldRes,
            meetingsNotHeldRes,
            snapshotsTotalRes,
            auditMeetingScheduledRes,
            auditMeetingHeldRes,
            auditMeetingNotHeldRes,
            auditSnapshotRes
        ] = await Promise.all([
            (adminClient.from('meetings') as any)
                .select('id', { count: 'exact', head: true }),
            (adminClient.from('meetings') as any)
                .select('id', { count: 'exact', head: true })
                .eq('meeting_status', 'held'),
            (adminClient.from('meetings') as any)
                .select('id', { count: 'exact', head: true })
                .in('meeting_status', ['not_held', 'cancelled']),
            (adminClient.from('forecast_snapshots') as any)
                .select('id', { count: 'exact', head: true }),
            (adminClient.from('crm_audit_log') as any)
                .select('id', { count: 'exact', head: true })
                .eq('event_type', 'meeting_scheduled'),
            (adminClient.from('crm_audit_log') as any)
                .select('id', { count: 'exact', head: true })
                .eq('event_type', 'meeting_confirmed_held'),
            (adminClient.from('crm_audit_log') as any)
                .select('id', { count: 'exact', head: true })
                .eq('event_type', 'meeting_confirmed_not_held'),
            (adminClient.from('crm_audit_log') as any)
                .select('id', { count: 'exact', head: true })
                .eq('event_type', 'forecast_snapshot_created')
        ])

        const errors = [
            meetingsTotalRes?.error,
            meetingsHeldRes?.error,
            meetingsNotHeldRes?.error,
            snapshotsTotalRes?.error,
            auditMeetingScheduledRes?.error,
            auditMeetingHeldRes?.error,
            auditMeetingNotHeldRes?.error,
            auditSnapshotRes?.error
        ].filter(Boolean)
        if (errors.length > 0) throw errors[0]

        const source = {
            meetingsTotal: Number(meetingsTotalRes?.count || 0),
            meetingsHeld: Number(meetingsHeldRes?.count || 0),
            meetingsNotHeld: Number(meetingsNotHeldRes?.count || 0),
            forecastSnapshotsTotal: Number(snapshotsTotalRes?.count || 0)
        }
        const audit = {
            meetingScheduledEvents: Number(auditMeetingScheduledRes?.count || 0),
            meetingHeldEvents: Number(auditMeetingHeldRes?.count || 0),
            meetingNotHeldEvents: Number(auditMeetingNotHeldRes?.count || 0),
            forecastSnapshotEvents: Number(auditSnapshotRes?.count || 0)
        }

        const gaps = {
            meetingsScheduledGap: audit.meetingScheduledEvents - source.meetingsTotal,
            meetingsHeldGap: audit.meetingHeldEvents - source.meetingsHeld,
            meetingsNotHeldGap: audit.meetingNotHeldEvents - source.meetingsNotHeld,
            forecastSnapshotsGap: audit.forecastSnapshotEvents - source.forecastSnapshotsTotal
        }

        const maybeNeedsBackfill = (
            source.meetingsTotal > 0 && audit.meetingScheduledEvents === 0
        ) || (
            source.forecastSnapshotsTotal > 0 && audit.forecastSnapshotEvents === 0
        )

        return {
            success: true,
            data: {
                source,
                audit,
                gaps,
                maybeNeedsBackfill
            }
        }
    } catch (error: any) {
        console.error('Error checking CRM audit integrity:', error)
        return { success: false, error: error?.message || 'No se pudo revisar la integridad de la bitácora' }
    }
}
