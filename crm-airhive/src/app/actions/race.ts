'use server'

import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { rankRaceItems } from '@/lib/raceRanking'

const normalizeStage = (stage: string | null | undefined) => String(stage || '').trim().toLowerCase()
const isWonStage = (stage: string | null | undefined) => {
    const value = normalizeStage(stage)
    return value.includes('ganad')
}

const getCurrentMonthPeriod = () => {
    const now = new Date()
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().split('T')[0]
}

const getNextMonthPeriod = (period: string) => {
    const base = new Date(`${period}T00:00:00.000Z`)
    const next = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 1))
    return next.toISOString().split('T')[0]
}

async function requireAdminUser() {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false as const, error: 'No autenticado' }

    const { data: profile } = await (supabase.from('profiles') as any).select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return { ok: false as const, error: 'Acceso denegado' }

    return { ok: true as const, userId: user.id }
}

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
                id,
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

export async function syncRaceResults(options?: { period?: string, forceOverwriteManual?: boolean }) {
    try {
        const supabaseAdmin = createAdminClient()
        const targetPeriod = options?.period || getCurrentMonthPeriod()
        const nextPeriod = getNextMonthPeriod(targetPeriod)

        // 1. Fetch deals for period window
        const { data: deals, error: dealsError } = await supabaseAdmin
            .from('clientes')
            .select('owner_id, valor_estimado, updated_at, etapa')
            .not('owner_id', 'is', null)
            .gte('updated_at', `${targetPeriod}T00:00:00.000Z`)
            .lt('updated_at', `${nextPeriod}T00:00:00.000Z`)

        if (dealsError) throw dealsError

        // 2. Fetch all eligible sellers to include zero rows in ranking
        const { data: sellers, error: sellersError } = await supabaseAdmin
            .from('profiles')
            .select('id, role')
            .in('role', ['seller', 'admin'])

        if (sellersError) throw sellersError

        const totalsByUser: Record<string, number> = {}
        ;(sellers || []).forEach((seller: any) => {
            totalsByUser[seller.id] = 0
        })

        ;(deals || []).forEach((deal: any) => {
            if (!deal.owner_id || !isWonStage(deal.etapa)) return
            if (totalsByUser[deal.owner_id] === undefined) totalsByUser[deal.owner_id] = 0
            totalsByUser[deal.owner_id] += Number(deal.valor_estimado || 0)
        })

        // 3. Prepare ranking rows for the period
        const title = getMonthlyTitle(new Date(`${targetPeriod}T00:00:00.000Z`))
        const entries = Object.entries(totalsByUser).map(([uid, total]) => ({ uid, total }))
        const ranked = rankRaceItems(entries, (entry) => entry.total)

        const { data: existingRows, error: existingError } = await supabaseAdmin
            .from('race_results')
            .select('user_id, is_manual_override')
            .eq('period', targetPeriod)

        if (existingError && existingError.code !== '42703') throw existingError
        const manualByUser = new Map<string, boolean>(
            ((existingRows as any[]) || []).map((row: any) => [row.user_id, !!row.is_manual_override])
        )

        // 4. Build upsert payload
        const upsertData: any[] = []
        ranked.forEach((seller) => {
            const isManual = manualByUser.get(seller.item.uid) || false
            if (isManual && !options?.forceOverwriteManual) return

            upsertData.push({
                period: targetPeriod,
                title,
                user_id: seller.item.uid,
                total_sales: seller.value,
                rank: seller.rank,
                medal: seller.medal,
                created_at: new Date().toISOString(),
                is_manual_override: false,
                override_note: null
            })
        })

        if (upsertData.length === 0) return { success: true, message: 'No data to sync' }

        // 5. Batch Upsert to race_results
        const { error: upsertError } = await (supabaseAdmin.from('race_results') as any)
            .upsert(upsertData, { onConflict: 'period, user_id' })

        if (upsertError) throw upsertError

        revalidatePath('/')
        return { success: true, count: upsertData.length, period: targetPeriod }

    } catch (error: any) {
        console.error('Sync Error:', error)
        return { success: false, error: error.message }
    }
}

export async function recalculateRacePeriod(period: string) {
    try {
        const auth = await requireAdminUser()
        if (!auth.ok) return { success: false, error: auth.error }

        const normalizedPeriod = `${period}`.slice(0, 10)
        const res = await syncRaceResults({ period: normalizedPeriod, forceOverwriteManual: true })
        if (!res.success) return res

        return { success: true, period: normalizedPeriod }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function overrideRaceResult(params: {
    resultId: string
    rank: number
    medal: 'gold' | 'silver' | 'bronze' | null
    totalSales: number
    note?: string
}) {
    try {
        const auth = await requireAdminUser()
        if (!auth.ok) return { success: false, error: auth.error }

        const supabaseAdmin = createAdminClient()
        const { error } = await (supabaseAdmin.from('race_results') as any)
            .update({
                rank: params.rank,
                medal: params.medal,
                total_sales: Math.max(0, Number(params.totalSales || 0)),
                is_manual_override: true,
                override_note: params.note || null,
                updated_by: auth.userId,
                updated_at: new Date().toISOString()
            })
            .eq('id', params.resultId)

        if (error) throw error
        revalidatePath('/')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}
