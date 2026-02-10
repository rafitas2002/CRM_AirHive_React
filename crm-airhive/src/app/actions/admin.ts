'use server'

import { createClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'

export async function getAdminCorrelationData() {
    try {
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)

        // 0. Verify Auth & Role (Admin or RH)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('No autenticado')

        const { data: profile } = await (supabase
            .from('profiles') as any)
            .select('role')
            .eq('id', user.id)
            .single()

        if (profile?.role !== 'admin' && profile?.role !== 'rh') {
            throw new Error('No tienes permisos para acceder a estos datos')
        }

        // 1. Fetch tables individually for robustness
        const [
            { data: profiles, error: profError },
            { data: employeeProfiles, error: empError },
            { data: genders, error: genderError },
            { data: raceResults, error: raceError }
        ] = await Promise.all([
            supabase.from('profiles').select('id, full_name') as any,
            supabase.from('employee_profiles').select('*') as any,
            supabase.from('genders').select('id, name') as any,
            supabase.from('race_results').select('*').order('period', { ascending: true }) as any
        ])

        if (profError) throw profError
        if (empError) throw empError
        if (genderError) throw genderError
        if (raceError) throw raceError

        // 2. Aggregate Performance by User
        const performanceMap: Record<string, {
            totalSales: number,
            medals: { gold: number, silver: number, bronze: number },
            salesHistory: { period: string, amount: number }[]
        }> = {}

        raceResults?.forEach((res: any) => {
            if (!performanceMap[res.user_id]) {
                performanceMap[res.user_id] = { totalSales: 0, medals: { gold: 0, silver: 0, bronze: 0 }, salesHistory: [] }
            }
            const p = performanceMap[res.user_id]
            p.totalSales += Number(res.total_sales || 0)
            p.salesHistory.push({ period: res.period, amount: Number(res.total_sales || 0) })

            if (res.medal === 'gold') p.medals.gold++
            if (res.medal === 'silver') p.medals.silver++
            if (res.medal === 'bronze') p.medals.bronze++
        })

        // 3. Combine Data
        const masterData = (employeeProfiles || []).map((emp: any) => {
            const profile = (profiles || []).find((p: any) => p.id === emp.user_id)
            const gender = (genders || []).find((g: any) => g.id === emp.gender_id)
            const perf = performanceMap[emp.user_id] || { totalSales: 0, medals: { gold: 0, silver: 0, bronze: 0 }, salesHistory: [] }

            // Age Calculation
            let age = null
            if (emp.birth_date) {
                const birth = new Date(emp.birth_date)
                const today = new Date()
                age = today.getFullYear() - birth.getFullYear()
                const m = today.getMonth() - birth.getMonth()
                if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
            }

            // Tenure Calculation (Months)
            let tenureMonths = 0
            if (emp.start_date) {
                const start = new Date(emp.start_date)
                const today = new Date()
                tenureMonths = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth())
            }

            // Growth Calculation
            let growth = 0
            if (perf.salesHistory.length >= 2) {
                const last = perf.salesHistory[perf.salesHistory.length - 1].amount
                const prev = perf.salesHistory[perf.salesHistory.length - 2].amount
                if (prev > 0) growth = ((last - prev) / prev) * 100
            }

            return {
                userId: emp.user_id,
                name: profile?.full_name || 'Desconocido',
                gender: gender?.name || 'N/A',
                age,
                tenureMonths,
                totalSales: perf.totalSales,
                medals: perf.medals,
                growth,
                lastRaceAmount: perf.salesHistory.length > 0 ? perf.salesHistory[perf.salesHistory.length - 1].amount : 0
            }
        })

        return { success: true, data: masterData }
    } catch (error: any) {
        console.error('Error fetching correlation data:', error)
        return { success: false, error: error.message }
    }
}
