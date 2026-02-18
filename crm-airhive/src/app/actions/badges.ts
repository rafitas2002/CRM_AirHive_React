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
