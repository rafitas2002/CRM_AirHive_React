'use server'

import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { rankRaceItems } from '@/lib/raceRanking'

type RaceDealRow = {
    owner_id: string | null
    valor_real_cierre: number | null
    closed_at_real: string | null
    created_at: string | null
    etapa: string | null
}

type RaceSellerRow = {
    id: string
    role?: string | null
}

type RaceProfileRow = {
    id: string
    full_name: string | null
}

const normalizeStage = (stage: string | null | undefined) => String(stage || '').trim().toLowerCase()
const normalizeRole = (role: string | null | undefined) => String(role || '').trim().toLowerCase()
const isWonStage = (stage: string | null | undefined) => {
    const value = normalizeStage(stage)
    return value.includes('ganad')
}

const toPeriodKey = (date: Date) =>
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString().slice(0, 10)

const getCurrentMonthPeriod = () => {
    return toPeriodKey(new Date())
}

const getPreviousMonthPeriod = () => {
    const now = new Date()
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 10)
}

const getNextMonthPeriod = (period: string) => {
    const base = new Date(`${period}T00:00:00.000Z`)
    const next = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 1))
    return next.toISOString().slice(0, 10)
}

const parseDateValue = (value: string | null | undefined) => {
    const raw = String(value || '').trim()
    if (!raw) return null

    const dateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (dateOnlyMatch) {
        const year = Number(dateOnlyMatch[1])
        const month = Number(dateOnlyMatch[2])
        const day = Number(dateOnlyMatch[3])
        const date = new Date(Date.UTC(year, month - 1, day))
        return Number.isNaN(date.getTime()) ? null : date
    }

    const parsed = new Date(raw)
    return Number.isNaN(parsed.getTime()) ? null : parsed
}

const getDealCloseDate = (deal: RaceDealRow) => {
    const closeDateReal = parseDateValue(deal.closed_at_real)
    if (closeDateReal) return closeDateReal

    // Race/trophies must only use real closed dates.
    return null
}

const getDealRealValue = (deal: RaceDealRow) => {
    const parsed = Number(deal.valor_real_cierre)
    if (!Number.isFinite(parsed) || parsed <= 0) return null
    return parsed
}

const getDealPeriod = (deal: RaceDealRow) => {
    const closeDate = getDealCloseDate(deal)
    if (!closeDate) return null
    return toPeriodKey(closeDate)
}

function getMonthlyTitle(date: Date) {
    const months = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ]
    return `Carrera de ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

async function loadRaceSourceData(supabaseAdmin: ReturnType<typeof createAdminClient>) {
    const [{ data: deals, error: dealsError }, { data: sellers, error: sellersError }] = await Promise.all([
        supabaseAdmin
            .from('clientes')
            .select('owner_id, valor_real_cierre, closed_at_real, created_at, etapa')
            .not('owner_id', 'is', null),
        supabaseAdmin
            .from('profiles')
            .select('id, role')
    ])

    if (dealsError) throw dealsError
    if (sellersError) throw sellersError

    const safeDeals = (deals || []) as RaceDealRow[]
    const safeProfiles = (sellers || []) as RaceSellerRow[]

    // Robust participant resolution:
    // - include canonical seller/admin roles
    // - include any owner_id found in deals (historical data can have non-canonical roles)
    const participantIds = new Set<string>()
    safeProfiles.forEach((profile) => {
        const role = normalizeRole(profile?.role)
        if (role === 'seller' || role === 'admin') {
            participantIds.add(String(profile.id))
        }
    })
    safeDeals.forEach((deal) => {
        if (deal.owner_id) participantIds.add(String(deal.owner_id))
    })

    return {
        deals: safeDeals,
        sellers: Array.from(participantIds).map((id) => ({ id }))
    }
}

async function loadProfileNamesByUserId(
    supabaseAdmin: ReturnType<typeof createAdminClient>,
    userIds: string[]
) {
    const uniqueIds = Array.from(new Set((userIds || []).map((id) => String(id || '')).filter(Boolean)))
    if (uniqueIds.length === 0) return new Map<string, string>()

    const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name')
        .in('id', uniqueIds)

    if (error) throw error

    const map = new Map<string, string>()
    ;((data || []) as RaceProfileRow[]).forEach((profile) => {
        const id = String(profile?.id || '')
        if (!id) return
        const name = String(profile?.full_name || '').trim()
        if (name) map.set(id, name)
    })
    return map
}

async function syncRacePeriodWithSourceData(params: {
    supabaseAdmin: ReturnType<typeof createAdminClient>
    period: string
    deals: RaceDealRow[]
    sellers: RaceSellerRow[]
    forceOverwriteManual?: boolean
}) {
    const { supabaseAdmin, period, deals, sellers, forceOverwriteManual } = params
    const nextPeriod = getNextMonthPeriod(period)
    const periodStart = new Date(`${period}T00:00:00.000Z`)
    const periodEnd = new Date(`${nextPeriod}T00:00:00.000Z`)

    const totalsByUser: Record<string, number> = {}
    sellers.forEach((seller) => {
        totalsByUser[seller.id] = 0
    })

    deals.forEach((deal) => {
        if (!deal.owner_id || !isWonStage(deal.etapa)) return
        const closeDate = getDealCloseDate(deal)
        const realValue = getDealRealValue(deal)
        if (!closeDate) return
        if (realValue === null) return
        if (closeDate < periodStart || closeDate >= periodEnd) return

        if (totalsByUser[deal.owner_id] === undefined) {
            totalsByUser[deal.owner_id] = 0
        }
        totalsByUser[deal.owner_id] += realValue
    })

    const title = getMonthlyTitle(new Date(`${period}T00:00:00.000Z`))
    const entries = Object.entries(totalsByUser).map(([uid, total]) => ({ uid, total }))
    const ranked = rankRaceItems(entries, (entry) => entry.total)

    const { data: existingRows, error: existingError } = await supabaseAdmin
        .from('race_results')
        .select('user_id, is_manual_override')
        .eq('period', period)

    if (existingError && existingError.code !== '42703') throw existingError
    const manualByUser = new Map<string, boolean>(
        ((existingRows as any[]) || []).map((row: any) => [row.user_id, !!row.is_manual_override])
    )

    const upsertData: any[] = []
    ranked.forEach((seller) => {
        const isManual = manualByUser.get(seller.item.uid) || false
        if (isManual && !forceOverwriteManual) return

        upsertData.push({
            period,
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

    if (upsertData.length === 0) {
        return { success: true as const, period, count: 0 }
    }

    const { error: upsertError } = await (supabaseAdmin.from('race_results') as any)
        .upsert(upsertData, { onConflict: 'period, user_id' })

    if (upsertError) throw upsertError
    return { success: true as const, period, count: upsertData.length }
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
        const ensureRes = await ensureRaceResultsUpToDate()
        if (!ensureRes.success) {
            console.warn('Race auto-sync warning (stats):', ensureRes.error)
        }

        const supabaseAdmin = createAdminClient()
        const { data, error } = await supabaseAdmin
            .from('race_results')
            .select('user_id, medal')
            .not('medal', 'is', null)

        if (error) throw error
        const profileNameById = await loadProfileNamesByUserId(
            supabaseAdmin,
            ((data || []) as any[]).map((row) => String(row?.user_id || '')).filter(Boolean)
        )

        // Aggregation in JS
        const stats: Record<string, { name: string, gold: number, silver: number, bronze: number, points: number }> = {}

        ;((data || []) as any[]).forEach((row: any) => {
            const uid = row.user_id
            if (!uid) return
            const name = profileNameById.get(String(uid)) || 'Desconocido'
            if (!stats[uid]) stats[uid] = { name, gold: 0, silver: 0, bronze: 0, points: 0 }

            if (row.medal === 'gold') stats[uid].gold++
            if (row.medal === 'silver') stats[uid].silver++
            if (row.medal === 'bronze') stats[uid].bronze++
            stats[uid].points = (stats[uid].gold * 3) + (stats[uid].silver * 2) + stats[uid].bronze
        })

        const ranked = Object.values(stats).sort((a, b) =>
            (b.points - a.points)
            || (b.gold - a.gold)
            || (b.silver - a.silver)
            || (b.bronze - a.bronze)
            || a.name.localeCompare(b.name, 'es')
        )

        return { success: true, data: ranked }
    } catch (error: any) {
        console.error('Error fetching race stats:', error)
        return { success: false, error: error.message }
    }
}

export async function getPastRaces() {
    try {
        const ensureRes = await ensureRaceResultsUpToDate()
        if (!ensureRes.success) {
            console.warn('Race auto-sync warning (history):', ensureRes.error)
        }

        const supabaseAdmin = createAdminClient()
        const previousPeriod = getPreviousMonthPeriod()

        // Fetch distinct periods
        const { data, error } = await supabaseAdmin
            .from('race_results')
            .select('id, period, title, user_id, total_sales, rank, medal, is_manual_override, override_note, updated_at')
            .order('period', { ascending: false })
            .order('rank', { ascending: true })

        if (error) throw error
        const profileNameById = await loadProfileNamesByUserId(
            supabaseAdmin,
            ((data || []) as any[]).map((row) => String(row?.user_id || '')).filter(Boolean)
        )

        // Group by period
        const races: Record<string, any[]> = {}
        ;((data || []) as any[]).forEach((row: any) => {
            const period = String(row?.period || '').slice(0, 10)
            if (!period) return
            if (!races[period]) races[period] = []
            races[period].push({
                ...row,
                name: profileNameById.get(String(row?.user_id || '')) || 'Desconocido'
            })
        })

        // Compatibility fallback:
        // If history is lagged exactly one month (e.g. shows Jan when previous month is Feb),
        // remap the latest historical period to previous month for display consistency.
        const availablePeriods = Object.keys(races).sort((a, b) => b.localeCompare(a))
        const latestPeriod = availablePeriods[0]
        const now = new Date()
        const isEarlyMonth = now.getUTCDate() <= 10
        if (
            isEarlyMonth &&
            latestPeriod &&
            !races[previousPeriod] &&
            getNextMonthPeriod(latestPeriod) === previousPeriod
        ) {
            const shiftedTitle = getMonthlyTitle(new Date(`${previousPeriod}T00:00:00.000Z`))
            races[previousPeriod] = (races[latestPeriod] || []).map((row) => ({
                ...row,
                period: previousPeriod,
                title: shiftedTitle
            }))
            delete races[latestPeriod]
        }

        return { success: true, data: races }
    } catch (error: any) {
        console.error('Error fetching past races:', error)
        return { success: false, error: error.message }
    }
}

export async function ensureRaceResultsUpToDate() {
    try {
        const supabaseAdmin = createAdminClient()
        const { deals, sellers } = await loadRaceSourceData(supabaseAdmin)
        const currentPeriod = getCurrentMonthPeriod()
        const previousPeriod = getPreviousMonthPeriod()
        const currentPeriodStart = new Date(`${currentPeriod}T00:00:00.000Z`)

        const candidatePeriods = new Set<string>([previousPeriod])
        const wonPeriods = new Set<string>()
        deals.forEach((deal) => {
            if (!deal.owner_id || !isWonStage(deal.etapa)) return
            const closeDate = getDealCloseDate(deal)
            const realValue = getDealRealValue(deal)
            if (realValue === null) return
            if (!closeDate || closeDate >= currentPeriodStart) return
            const period = getDealPeriod(deal)
            if (!period) return
            candidatePeriods.add(period)
            wonPeriods.add(period)
        })

        const periods = Array.from(candidatePeriods).sort()
        if (periods.length === 0) {
            return { success: true as const, syncedPeriods: 0, syncedRows: 0, skippedPeriods: 0 }
        }

        const { data: existingRows, error: existingError } = await supabaseAdmin
            .from('race_results')
            .select('period, user_id')
            .in('period', periods)

        if (existingError) throw existingError

        const existingUsersByPeriod = new Map<string, Set<string>>()
        ;((existingRows as any[]) || []).forEach((row: any) => {
            const period = String(row?.period || '').slice(0, 10)
            const userId = String(row?.user_id || '')
            if (!period || !userId) return
            if (!existingUsersByPeriod.has(period)) {
                existingUsersByPeriod.set(period, new Set())
            }
            existingUsersByPeriod.get(period)!.add(userId)
        })

        const eligibleSellerCount = sellers.length
        const periodsToSync = periods.filter((period) => {
            const currentUsers = existingUsersByPeriod.get(period)?.size || 0
            const hasWonDeals = wonPeriods.has(period)
            const hasExistingRows = currentUsers > 0

            const shouldRefreshPreviousMonth = period === previousPeriod
            const isMissingPeriod = hasWonDeals && currentUsers === 0
            const isIncompletePeriod = hasWonDeals && eligibleSellerCount > 0 && currentUsers < eligibleSellerCount
            return shouldRefreshPreviousMonth || isMissingPeriod || isIncompletePeriod
        })

        if (periodsToSync.length === 0) {
            return { success: true as const, syncedPeriods: 0, syncedRows: 0, skippedPeriods: periods.length }
        }

        let syncedRows = 0
        for (const period of periodsToSync) {
            const result = await syncRacePeriodWithSourceData({
                supabaseAdmin,
                period,
                deals,
                sellers,
                forceOverwriteManual: false
            })
            syncedRows += result.count
        }

        revalidatePath('/')
        return {
            success: true as const,
            syncedPeriods: periodsToSync.length,
            syncedRows,
            skippedPeriods: periods.length - periodsToSync.length
        }
    } catch (error: any) {
        console.error('Race auto-sync error:', error)
        return { success: false as const, error: error?.message || 'No se pudo actualizar la carrera automáticamente.' }
    }
}

export async function syncRaceResults(options?: { period?: string, forceOverwriteManual?: boolean }) {
    try {
        const supabaseAdmin = createAdminClient()
        const targetPeriod = options?.period || getCurrentMonthPeriod()
        const { deals, sellers } = await loadRaceSourceData(supabaseAdmin)
        const result = await syncRacePeriodWithSourceData({
            supabaseAdmin,
            period: targetPeriod,
            deals,
            sellers,
            forceOverwriteManual: options?.forceOverwriteManual
        })

        revalidatePath('/')
        return { success: true, count: result.count, period: targetPeriod }
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

export async function recalculateAllRacePeriods() {
    try {
        const auth = await requireAdminUser()
        if (!auth.ok) return { success: false, error: auth.error }

        const supabaseAdmin = createAdminClient()

        const [{ data: deals, error: dealsError }, { data: existingPeriods, error: periodsError }] = await Promise.all([
            supabaseAdmin
                .from('clientes')
                .select('owner_id, valor_real_cierre, closed_at_real, created_at, etapa')
                .not('owner_id', 'is', null),
            supabaseAdmin
                .from('race_results')
                .select('period')
        ])

        if (dealsError) throw dealsError
        if (periodsError) throw periodsError

        const periodSet = new Set<string>()

        ;(existingPeriods || []).forEach((row: any) => {
            if (row?.period) periodSet.add(String(row.period).slice(0, 10))
        })

        ;((deals || []) as RaceDealRow[]).forEach((deal) => {
            if (!isWonStage(deal?.etapa)) return
            const realValue = getDealRealValue(deal)
            if (realValue === null) return
            const d = getDealCloseDate(deal)
            if (!d) return
            const period = toPeriodKey(d)
            periodSet.add(period)
        })

        const periods = Array.from(periodSet).sort()
        const failures: Array<{ period: string; error: string }> = []
        let processed = 0

        for (const period of periods) {
            const res = await syncRaceResults({ period, forceOverwriteManual: true })
            if (!res.success) {
                failures.push({ period, error: String((res as any).error || 'Error desconocido') })
                continue
            }
            processed++
        }

        revalidatePath('/')
        return {
            success: failures.length === 0,
            processed,
            totalPeriods: periods.length,
            failures
        }
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
