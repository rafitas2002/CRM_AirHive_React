'use server'

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

export async function getMyBadgeCelebrationFeed() {
    try {
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)
        const { data: { user } } = await supabase.auth.getUser()

        if (!user?.id) return { success: false, error: 'No autenticado' }

        let dbClient: any = supabase
        try {
            dbClient = createAdminClient()
        } catch {
            dbClient = supabase
        }

        const userId = user.id
        const [industryEventsRes, specialEventsRes, industryLevelsRes, specialLevelsRes] = await Promise.all([
            (dbClient
                .from('seller_badge_events')
                .select('id, industria_id, level, event_type, closures_count, created_at, industrias(name)')
                .eq('seller_id', userId)
                .order('created_at', { ascending: false })
                .limit(12) as any),
            (dbClient
                .from('seller_special_badge_events')
                .select('id, badge_type, badge_key, badge_label, level, event_type, progress_count, created_at')
                .eq('seller_id', userId)
                .order('created_at', { ascending: false })
                .limit(12) as any),
            (dbClient
                .from('seller_industry_badges')
                .select('industria_id, level, closures_count, industrias(name)')
                .eq('seller_id', userId)
                .gt('level', 0) as any),
            (dbClient
                .from('seller_special_badges')
                .select('badge_type, badge_key, badge_label, level, progress_count')
                .eq('seller_id', userId)
                .gt('level', 0) as any)
        ])

        return {
            success: true,
            data: {
                industryEvents: Array.isArray(industryEventsRes?.data) ? industryEventsRes.data : [],
                specialEvents: Array.isArray(specialEventsRes?.data) ? specialEventsRes.data : [],
                industryLevels: Array.isArray(industryLevelsRes?.data) ? industryLevelsRes.data : [],
                specialLevels: Array.isArray(specialLevelsRes?.data) ? specialLevelsRes.data : []
            }
        }
    } catch (error: any) {
        return { success: false, error: error?.message || 'Error al cargar eventos de badges' }
    }
}

