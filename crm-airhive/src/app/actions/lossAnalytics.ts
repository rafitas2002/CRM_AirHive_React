'use server'

import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase-admin'
import { createClient as createServerSupabaseClient } from '@/lib/supabase-server'

type LossAnalyticsRawRow = {
    lead_id: number
    seller_id: string | null
    seller_username: string | null
    empresa_id: string | null
    empresa: string | null
    nombre: string | null
    etapa: string | null
    valor_estimado: number | null
    valor_real_cierre: number | null
    closed_at_real: string | null
    loss_recorded_at: string | null
    loss_recorded_by: string | null
    loss_month: string | null
    loss_reason_id: string | null
    loss_reason_code: string | null
    loss_reason_label: string | null
    loss_subreason_id: string | null
    loss_subreason_code: string | null
    loss_subreason_label: string | null
    loss_notes: string | null
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

        let analyticsQuery = (adminClient.from('lead_loss_analytics_view') as any)
            .select('*')
            .order('closed_at_real', { ascending: false, nullsFirst: false })
            .order('loss_recorded_at', { ascending: false, nullsFirst: false })

        if (!canSeeAll) {
            analyticsQuery = analyticsQuery.eq('seller_id', user.id)
        }

        const { data: analyticsRows, error: analyticsError } = await analyticsQuery

        if (analyticsError) {
            throw analyticsError
        }

        const rawRows = (analyticsRows || []) as LossAnalyticsRawRow[]
        const sellerIds = Array.from(new Set(rawRows.map((r) => String(r.seller_id || '')).filter(Boolean)))
        const companyIds = Array.from(new Set(rawRows.map((r) => String(r.empresa_id || '')).filter(Boolean)))
        const leadIds = Array.from(new Set(rawRows.map((r) => Number(r.lead_id)).filter((id) => Number.isFinite(id))))

        const [profilesRes, companiesRes, leadsRes] = await Promise.all([
            sellerIds.length > 0
                ? (adminClient.from('profiles') as any)
                    .select('id, full_name, avatar_url')
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

        const profileMap = new Map<string, { full_name?: string | null; avatar_url?: string | null }>(
            ((profilesRes.data || []) as any[]).map((row) => [String(row.id), row])
        )
        const companyMap = new Map<string, { industria_id?: string | null; industria?: string | null; tamano?: number | null }>(
            ((companiesRes.data || []) as any[]).map((row) => [String(row.id), row])
        )
        const leadMap = new Map<number, { valor_implementacion_estimado?: number | null; fecha_registro?: string | null; created_at?: string | null }>(
            ((leadsRes.data || []) as any[]).map((row) => [Number(row.id), row])
        )

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
                seller_full_name: profile?.full_name ? String(profile.full_name) : null,
                seller_avatar_url: profile?.avatar_url ? String(profile.avatar_url) : null,
                empresa_id: companyId,
                empresa: row.empresa ? String(row.empresa) : null,
                nombre: row.nombre ? String(row.nombre) : null,
                etapa: row.etapa ? String(row.etapa) : null,
                valor_estimado: row.valor_estimado == null ? 0 : Number(row.valor_estimado),
                valor_implementacion_estimado: leadMeta?.valor_implementacion_estimado == null ? 0 : Number(leadMeta.valor_implementacion_estimado),
                closed_at_real: row.closed_at_real ? String(row.closed_at_real) : null,
                loss_recorded_at: row.loss_recorded_at ? String(row.loss_recorded_at) : null,
                fecha_registro: leadMeta?.fecha_registro ? String(leadMeta.fecha_registro) : null,
                created_at: leadMeta?.created_at ? String(leadMeta.created_at) : null,
                loss_reason_id: row.loss_reason_id ? String(row.loss_reason_id) : null,
                loss_reason_code: row.loss_reason_code ? String(row.loss_reason_code) : null,
                loss_reason_label: row.loss_reason_label ? String(row.loss_reason_label) : null,
                loss_subreason_id: row.loss_subreason_id ? String(row.loss_subreason_id) : null,
                loss_subreason_code: row.loss_subreason_code ? String(row.loss_subreason_code) : null,
                loss_subreason_label: row.loss_subreason_label ? String(row.loss_subreason_label) : null,
                loss_notes: row.loss_notes ? String(row.loss_notes) : null,
                industria_id: company?.industria_id ? String(company.industria_id) : null,
                industria: company?.industria ? String(company.industria) : null,
                tamano_empresa: company?.tamano == null ? null : Number(company.tamano)
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

        const reasonOptions = Array.from(new Map(
            rows
                .filter((row) => row.loss_reason_id && row.loss_reason_label)
                .map((row) => [String(row.loss_reason_id), { id: String(row.loss_reason_id), label: String(row.loss_reason_label) }])
        ).values()).sort((a, b) => a.label.localeCompare(b.label, 'es'))

        const subreasonOptions = Array.from(new Map(
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

