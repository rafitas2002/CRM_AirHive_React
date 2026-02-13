'use server'

import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

export async function getRaceStats() {
    try {
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)

        const { data, error } = await supabase
            .from('race_results')
            .select(`
                user_id,
                medal,
                profiles (full_name)
            `)
            .not('medal', 'is', null)

        if (error) throw error

        // Aggregation in JS
        const stats: Record<string, { name: string, gold: number, silver: number, bronze: number }> = {}

        data.forEach((row: any) => {
            const uid = row.user_id
            const name = row.profiles?.full_name || 'Desconocido'
            if (!stats[uid]) stats[uid] = { name, gold: 0, silver: 0, bronze: 0 }

            if (row.medal === 'gold') stats[uid].gold++
            if (row.medal === 'silver') stats[uid].silver++
            if (row.medal === 'bronze') stats[uid].bronze++
        })

        return { success: true, data: Object.values(stats) }
    } catch (error: any) {
        console.error('Error fetching race stats:', error)
        return { success: false, error: error.message }
    }
}

export async function getPastRaces() {
    try {
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)

        // Fetch distinct periods
        const { data, error } = await supabase
            .from('race_results')
            .select(`
                period,
                title,
                user_id,
                total_sales,
                rank,
                medal,
                profiles (full_name)
            `)
            .order('period', { ascending: false })
            .order('rank', { ascending: true })

        if (error) throw error

        // Group by period
        const races: Record<string, any[]> = {}
        data.forEach((row: any) => {
            const period = row.period
            if (!races[period]) races[period] = []
            races[period].push({
                ...row,
                name: row.profiles?.full_name || 'Desconocido'
            })
        })

        return { success: true, data: races }
    } catch (error: any) {
        console.error('Error fetching past races:', error)
        return { success: false, error: error.message }
    }
}

function getMonthlyTitle(date: Date) {
    const months = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ]
    return `Carrera de ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

export async function syncRaceResults() {
    try {
        const supabaseAdmin = createAdminClient()

        // 1. Fetch Closed Won deals
        // We use updated_at as close date proxy
        const { data: deals, error: dealsError } = await supabaseAdmin
            .from('clientes')
            .select('owner_id, valor_estimado, updated_at')
            .eq('etapa', 'Cerrada Ganada')
            .not('owner_id', 'is', null)

        if (dealsError) throw dealsError
        if (!deals || deals.length === 0) return { success: true, message: 'No closed deals found' }

        // 2. Aggregate by Month & Owner
        // Map: 'YYYY-MM-01' -> { ownerId: total }
        const monthlyStats: Record<string, Record<string, number>> = {}

        deals.forEach((deal: any) => {
            if (!deal.updated_at || !deal.owner_id) return
            const date = new Date(deal.updated_at)
            // Set to first day of month in UTC
            const periodDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
            const period = periodDate.toISOString().split('T')[0]

            if (!monthlyStats[period]) monthlyStats[period] = {}
            if (!monthlyStats[period][deal.owner_id]) monthlyStats[period][deal.owner_id] = 0

            monthlyStats[period][deal.owner_id] += Number(deal.valor_estimado || 0)
        })

        // 3. Calculate Rankings & Prepare Inserts
        const upsertData: any[] = []

        Object.keys(monthlyStats).forEach(period => {
            const date = new Date(period)
            const title = getMonthlyTitle(date)

            const sellers = Object.entries(monthlyStats[period])
                .map(([uid, total]) => ({ uid, total }))
                .sort((a, b) => b.total - a.total)

            sellers.forEach((seller, index) => {
                const rank = index + 1
                let medal = null
                if (rank === 1) medal = 'gold'
                if (rank === 2) medal = 'silver'
                if (rank === 3) medal = 'bronze'

                upsertData.push({
                    period,
                    title,
                    user_id: seller.uid,
                    total_sales: seller.total,
                    rank,
                    medal,
                    created_at: new Date().toISOString()
                })
            })
        })

        if (upsertData.length === 0) return { success: true, message: 'No data to sync' }

        // 4. Batch Upsert to race_results
        const { error: upsertError } = await (supabaseAdmin.from('race_results') as any)
            .upsert(upsertData, { onConflict: 'period, user_id' })

        if (upsertError) throw upsertError

        revalidatePath('/')
        return { success: true, count: upsertData.length }

    } catch (error: any) {
        console.error('Sync Error:', error)
        return { success: false, error: error.message }
    }
}
