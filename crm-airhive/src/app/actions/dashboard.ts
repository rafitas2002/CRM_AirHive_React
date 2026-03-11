'use server'

import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase-admin'
import { createClient as createServerSupabaseClient } from '@/lib/supabase-server'

const OPERATIONAL_EVENT_TYPES = new Set<string>([
    'lead_created', 'lead_updated', 'lead_stage_change', 'lead_assigned', 'lead_closed',
    'meeting_scheduled', 'meeting_started', 'meeting_finished', 'meeting_no_show', 'meeting_rescheduled',
    'call_started', 'call_finished',
    'forecast_registered', 'forecast_frozen',
    'pre_lead_created', 'pre_lead_updated', 'pre_lead_converted',
    'task_created', 'task_updated', 'task_status_changed',
    'company_created', 'company_updated'
])

export async function getAdminExecutiveDashboardSupportData() {
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

        if (!meProfile || meProfile.role !== 'admin') {
            return { success: false as const, error: 'Acceso denegado' }
        }

        const adminClient = createAdminClient()
        const riskWindowStart = new Date()
        riskWindowStart.setUTCDate(riskWindowStart.getUTCDate() - 35)

        const [profilesRes, eventsRes, assignmentsRes] = await Promise.all([
            (adminClient.from('profiles') as any)
                .select('id, full_name, role')
                .in('role', ['seller', 'admin']),
            (adminClient.from('crm_events') as any)
                .select('id, user_id, event_type, created_at')
                .gte('created_at', riskWindowStart.toISOString())
                .order('created_at', { ascending: false }),
            (adminClient.from('empresa_proyecto_asignaciones') as any)
                .select('empresa_id')
                .eq('assignment_stage', 'implemented_real')
        ])

        if (profilesRes.error) throw profilesRes.error
        if (eventsRes.error) throw eventsRes.error
        if (assignmentsRes.error) throw assignmentsRes.error

        const latestOperationalEventByUser = new Map<string, { user_id: string; event_type: string | null; created_at: string | null }>()
        ;((eventsRes.data || []) as any[]).forEach((evt) => {
            const userId = String(evt?.user_id || '')
            if (!userId) return
            const eventType = String(evt?.event_type || '')
            if (!OPERATIONAL_EVENT_TYPES.has(eventType)) return
            if (!latestOperationalEventByUser.has(userId)) {
                latestOperationalEventByUser.set(userId, {
                    user_id: userId,
                    event_type: evt?.event_type ? String(evt.event_type) : null,
                    created_at: evt?.created_at ? String(evt.created_at) : null
                })
            }
        })

        const activeCompanyIds = new Set<string>()
        ;((assignmentsRes.data || []) as any[]).forEach((row) => {
            const companyId = String(row?.empresa_id || '')
            if (companyId) activeCompanyIds.add(companyId)
        })

        return {
            success: true as const,
            data: {
                profiles: Array.isArray(profilesRes.data) ? profilesRes.data : [],
                latestOperationalEvents: Array.from(latestOperationalEventByUser.values()),
                activeCompaniesCount: activeCompanyIds.size
            }
        }
    } catch (error: any) {
        return {
            success: false as const,
            error: error?.message || 'No se pudo cargar soporte ejecutivo del dashboard'
        }
    }
}

type HomeBirthdaySupportRow = {
    userId: string
    fullName: string
    birthDate: string
}

export async function getHomeBirthdaysSupportData() {
    try {
        const cookieStore = await cookies()
        const supabase = createServerSupabaseClient(cookieStore)
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return { success: false as const, error: 'Sesión no encontrada' }
        }

        const adminClient = createAdminClient()
        const { data: employeeProfiles, error: employeeProfilesError } = await (adminClient.from('employee_profiles') as any)
            .select('user_id, birth_date')
            .not('birth_date', 'is', null)
            .limit(5000)

        if (employeeProfilesError) {
            throw employeeProfilesError
        }

        const rows = Array.isArray(employeeProfiles) ? employeeProfiles : []
        const userIds = Array.from(new Set(
            rows
                .map((row: any) => String(row?.user_id || ''))
                .filter(Boolean)
        ))

        if (userIds.length === 0) {
            return { success: true as const, data: [] as HomeBirthdaySupportRow[] }
        }

        const { data: profiles, error: profilesError } = await (adminClient.from('profiles') as any)
            .select('id, full_name, username')
            .in('id', userIds)

        if (profilesError) {
            throw profilesError
        }

        const profileById = new Map<string, { full_name?: string | null; username?: string | null }>()
        ;(Array.isArray(profiles) ? profiles : []).forEach((profile: any) => {
            const id = String(profile?.id || '')
            if (!id) return
            profileById.set(id, {
                full_name: profile?.full_name ? String(profile.full_name) : null,
                username: profile?.username ? String(profile.username) : null
            })
        })

        const normalizedRows = rows
            .map((row: any) => {
                const userId = String(row?.user_id || '')
                const birthDate = String(row?.birth_date || '').trim()
                if (!userId || !birthDate) return null
                const profile = profileById.get(userId)
                const fullName = String(profile?.full_name || profile?.username || 'Usuario').trim() || 'Usuario'

                return {
                    userId,
                    fullName,
                    birthDate
                } as HomeBirthdaySupportRow
            })
            .filter((row: HomeBirthdaySupportRow | null): row is HomeBirthdaySupportRow => !!row)
            .sort((a, b) => a.fullName.localeCompare(b.fullName, 'es', { sensitivity: 'base' }))

        return {
            success: true as const,
            data: normalizedRows
        }
    } catch (error: any) {
        return {
            success: false as const,
            error: error?.message || 'No se pudo cargar soporte de cumpleaños'
        }
    }
}
