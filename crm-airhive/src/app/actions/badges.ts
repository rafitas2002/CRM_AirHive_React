'use server'

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

const BADGE_GRANT_ALLOWED_ADMINS = new Set([
    'Jesus Gracia',
    'Rafael Sedas',
    'Eduardo Castro',
    'Alberto Castro'
])

const CLOSURE_MILESTONE_EIGHT_TIER_THRESHOLDS = [1, 5, 10, 15, 20, 30, 40, 50] as const

function getThresholdLevelMetaFromList(progress: number, thresholds: readonly number[]) {
    const safeProgress = Math.max(0, Number(progress || 0))
    let level = 0
    let next: number | null = thresholds[0] ?? null
    thresholds.forEach((threshold, index) => {
        if (safeProgress >= threshold) {
            level = index + 1
            next = thresholds[index + 1] ?? null
        }
    })
    return { level, next }
}

function normalizeSpecialBadgeKey(type: string, key: string) {
    const safeType = String(type || '')
    const safeKey = String(key || '').trim()
    if (safeType === 'closure_milestone') return 'closure_milestone'
    return safeKey
}

export async function grantAdminBadgeToSeller(sellerId: string) {
    try {
        if (!sellerId) return { success: false, error: 'Usuario objetivo inválido' }

        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)
        const supabaseAdmin = createAdminClient()

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'No autenticado' }

        const { data: me } = await (supabase
            .from('profiles') as any)
            .select('id, role, full_name')
            .eq('id', user.id)
            .single()

        const adminName = String(me?.full_name || '').trim()
        if (!me || me.role !== 'admin' || !BADGE_GRANT_ALLOWED_ADMINS.has(adminName)) {
            return { success: false, error: 'Tu usuario no está autorizado para otorgar badges administrativos' }
        }

        if (user.id === sellerId) {
            return { success: false, error: 'No puedes otorgarte este badge a ti mismo' }
        }

        const { data: targetProfile } = await (supabaseAdmin
            .from('profiles') as any)
            .select('id, role, full_name')
            .eq('id', sellerId)
            .maybeSingle()

        const targetName = String(targetProfile?.full_name || '').trim()
        const targetIsGrantingAdmin = targetProfile?.role === 'admin' && BADGE_GRANT_ALLOWED_ADMINS.has(targetName)
        if (targetIsGrantingAdmin) {
            return { success: false, error: 'Los directivos que otorgan distinciones no pueden recibir distinciones directivas' }
        }

        const adminKey = `admin_${adminName.toLowerCase().replace(/\s+/g, '_')}`
        const adminBadgeLabel = `Distinción de ${adminName}`

        const { error: grantError } = await (supabaseAdmin
            .from('admin_badge_grants') as any)
            .insert({
                admin_id: user.id,
                seller_id: sellerId,
                badge_type: 'admin_granted',
                badge_key: adminKey,
                badge_label: adminBadgeLabel
            })

        if (grantError) {
            if (grantError.code === '23505') {
                return { success: false, error: 'Ya otorgaste tu badge mensual. Podrás otorgar otro el próximo mes.' }
            }
            return { success: false, error: grantError.message || 'No se pudo registrar el otorgamiento' }
        }

        const { count } = await (supabaseAdmin
            .from('admin_badge_grants') as any)
            .select('id', { count: 'exact', head: true })
            .eq('seller_id', sellerId)
            .eq('badge_type', 'admin_granted')
            .eq('badge_key', adminKey)

        const totalGranted = count || 1

        const { data: current } = await (supabaseAdmin
            .from('seller_special_badges') as any)
            .select('id, unlocked_at')
            .eq('seller_id', sellerId)
            .eq('badge_type', 'admin_granted')
            .eq('badge_key', adminKey)
            .maybeSingle()

        const nowIso = new Date().toISOString()

        const payload = {
            seller_id: sellerId,
            badge_type: 'admin_granted',
            badge_key: adminKey,
            badge_label: adminBadgeLabel,
            progress_count: totalGranted,
            level: 1,
            next_level_threshold: null,
            unlocked_at: current?.unlocked_at || nowIso,
            updated_at: nowIso
        }

        const { error: upsertError } = await (supabaseAdmin
            .from('seller_special_badges') as any)
            .upsert(payload, { onConflict: 'seller_id,badge_type,badge_key' })

        if (upsertError) {
            return { success: false, error: upsertError.message || 'No se pudo aplicar el badge al perfil' }
        }

        const { error: eventError } = await (supabaseAdmin
            .from('seller_special_badge_events') as any)
            .insert({
                seller_id: sellerId,
                badge_type: 'admin_granted',
                badge_key: adminKey,
                badge_label: adminBadgeLabel,
                level: 1,
                event_type: 'unlocked',
                progress_count: totalGranted,
                source_lead_id: null
            })

        if (eventError && eventError.code !== '23505') {
            console.warn('[grantAdminBadgeToSeller] Event insert warning:', eventError.message)
        }

        return { success: true, message: `Badge de ${adminName} otorgado correctamente.` }
    } catch (error: any) {
        console.error('[grantAdminBadgeToSeller] Error:', error)
        return { success: false, error: error?.message || 'Error inesperado al otorgar badge' }
    }
}

export async function getUserPublicBadgesSummary(targetUserId: string) {
    try {
        if (!targetUserId) return { success: false, error: 'Usuario objetivo inválido' }

        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'No autenticado' }

        let dbClient: any = supabase
        try {
            dbClient = createAdminClient()
        } catch {
            // Fallback to session client if service role is unavailable.
        }

        const [{ data: industryBadges }, { data: specialBadges }, { count: closureCount }] = await Promise.all([
            (dbClient
                .from('seller_industry_badges')
                .select('industria_id, closures_count, level, industrias(name)')
                .eq('seller_id', targetUserId)
                .gt('level', 0) as any),
            (dbClient
                .from('seller_special_badges')
                .select('badge_type, badge_key, badge_label, progress_count, level')
                .eq('seller_id', targetUserId)
                .gt('level', 0) as any),
            (dbClient
                .from('seller_badge_closures')
                .select('lead_id', { count: 'exact', head: true })
                .eq('seller_id', targetUserId) as any)
        ])

        const mergedSpecialByKey = new Map<string, {
            type: string
            key: string
            label: string
            level: number
            progress: number
        }>()

        for (const row of (specialBadges || [])) {
            const type = String((row as any)?.badge_type || 'special')
            const key = normalizeSpecialBadgeKey(type, String((row as any)?.badge_key || ''))
            const normalized = {
                type,
                key,
                label: String((row as any)?.badge_label || 'Badge especial'),
                level: Number((row as any)?.level || 0),
                progress: Number((row as any)?.progress_count || 0)
            }
            const identity = `${normalized.type}::${normalized.key}`
            const prev = mergedSpecialByKey.get(identity)
            if (!prev || normalized.level >= prev.level) mergedSpecialByKey.set(identity, normalized)
        }

        const closureProgress = Math.max(0, Number(closureCount || 0))
        const closureMeta = getThresholdLevelMetaFromList(closureProgress, CLOSURE_MILESTONE_EIGHT_TIER_THRESHOLDS)
        if (closureMeta.level > 0) {
            const closureIdentity = 'closure_milestone::closure_milestone'
            const prevClosure = mergedSpecialByKey.get(closureIdentity)
            if (
                !prevClosure
                || closureMeta.level > prevClosure.level
                || (closureMeta.level === prevClosure.level && closureProgress > prevClosure.progress)
            ) {
                mergedSpecialByKey.set(closureIdentity, {
                    type: 'closure_milestone',
                    key: 'closure_milestone',
                    label: 'Cierres de Empresas',
                    level: closureMeta.level,
                    progress: closureProgress
                })
            }
        }

        return {
            success: true,
            data: {
                badges: {
                    industry: (industryBadges || []).map((row: any) => ({
                        type: 'industry',
                        key: String(row?.industria_id || ''),
                        label: String(row?.industrias?.name || 'Industria'),
                        level: Number(row?.level || 0),
                        progress: Number(row?.closures_count || 0)
                    })),
                    special: Array.from(mergedSpecialByKey.values())
                }
            }
        }
    } catch (error: any) {
        console.error('[getUserPublicBadgesSummary] Error:', error)
        return { success: false, error: error?.message || 'Error al consultar badges del usuario' }
    }
}
