'use server'

import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { cookies } from 'next/headers'

export async function getAdminCorrelationData() {
    try {
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)
        const supabaseAdmin = createAdminClient()

        // 0. Verify Auth
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'No autenticado' }

        // 1. Verify Role using Admin Client (to bypass RLS for checking others if needed, though here it is self)
        const { data: profile, error: roleError } = await (supabaseAdmin
            .from('profiles') as any)
            .select('role')
            .eq('id', user.id)
            .single()

        if (roleError || !profile) {
            console.error('[AdminCorrelation] Role check error:', roleError)
            return { success: false, error: 'No se pudo verificar el rol' }
        }

        if (profile.role !== 'admin' && profile.role !== 'rh') {
            return { success: false, error: 'No tienes permisos para acceder a estos datos' }
        }

        // 2. Fetch tables with ADMIN client
        console.log('[AdminCorrelation] Fetching data tables...')
        const [
            { data: profiles, error: profError },
            { data: employeeProfiles, error: empError },
            { data: genders, error: genderError },
            { data: raceResults, error: raceError },
            { data: meetings, error: meetError },
            { data: clients, error: clientError },
            { data: industries, error: indError },
            { data: companies, error: compError }
        ] = await Promise.all([
            supabaseAdmin.from('profiles').select('id, full_name') as any,
            supabaseAdmin.from('employee_profiles').select('*') as any,
            supabaseAdmin.from('genders').select('id, name') as any,
            supabaseAdmin.from('race_results').select('*').order('period', { ascending: true }) as any,
            supabaseAdmin.from('meetings').select('*') as any,
            supabaseAdmin.from('clientes').select('*') as any,
            supabaseAdmin.from('industrias').select('*') as any,
            supabaseAdmin.from('empresas').select('*') as any
        ])

        if (profError) throw profError
        if (empError) throw empError
        if (genderError) throw genderError
        if (raceError) throw raceError
        if (meetError) throw meetError
        if (clientError) throw clientError
        if (indError) throw indError
        if (compError) throw compError

        // 3. Aggregate Performance by User
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

        // 4. Combine Data - Iteramos sobre PROFILES para asegurar que todos aparezcan
        const masterData = (profiles || []).map((p: any) => {
            const emp = (employeeProfiles || []).find((e: any) => e.user_id === p.id) || {}
            const gender = (genders || []).find((g: any) => g.id === emp.gender_id)
            const perf = performanceMap[p.id] || { totalSales: 0, medals: { gold: 0, silver: 0, bronze: 0 }, salesHistory: [] }

            // Metrics Calculations
            const userMeetings = (meetings || []).filter((m: any) => m.seller_id === p.id)
            const userClients = (clients || []).filter((c: any) => c.owner_id === p.id)
            const closedWon = userClients.filter((c: any) => c.etapa === 'Cerrada Ganada')

            // Effort vs Success (Meetings per Close)
            const meetingsPerClose = closedWon.length > 0 ? userMeetings.length / closedWon.length : userMeetings.length

            // Forecast Accuracy (Error mean)
            let totalForecastError = 0
            closedWon.forEach((c: any) => {
                const prob = c.probabilidad || 0
                // Expectation for closed won is 100%
                totalForecastError += (100 - prob)
            })
            const forecastAccuracy = closedWon.length > 0 ? 100 - (totalForecastError / closedWon.length) : 0

            // Industry Success
            const industryMap: Record<string, number> = {}
            closedWon.forEach((c: any) => {
                const company = (companies || []).find((comp: any) => comp.id === c.empresa_id)
                const industry = (industries || []).find((ind: any) => ind.id === company?.industria_id)
                const indName = industry?.name || 'Otro'
                industryMap[indName] = (industryMap[indName] || 0) + 1
            })
            const topIndustry = Object.entries(industryMap).sort((a: [string, number], b: [string, number]) => b[1] - a[1])[0]?.[0] || 'N/A'

            // Modal Impact
            const closedWithPhysical = closedWon.filter((c: any) => {
                const clientMeetings = userMeetings.filter((m: any) => m.lead_id === c.id)
                return clientMeetings.some((m: any) => m.meeting_type === 'presencial')
            })
            const physicalCloseRate = closedWon.length > 0 ? (closedWithPhysical.length / closedWon.length) * 100 : 0

            // Response Speed (Lead to 1st Meeting)
            let totalResponseTimeMs = 0
            let responseCount = 0
            userClients.forEach((c: any) => {
                const firstMeeting = userMeetings
                    .filter((m: any) => m.lead_id === c.id)
                    .sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())[0]

                if (firstMeeting) {
                    const diff = new Date(firstMeeting.start_time).getTime() - new Date(c.created_at).getTime()
                    if (diff > 0) {
                        totalResponseTimeMs += diff
                        responseCount++
                    }
                }
            })
            const avgResponseTimeHours = responseCount > 0 ? (totalResponseTimeMs / responseCount) / (1000 * 60 * 60) : 0

            // Tenure Calculation (Months)
            let tenureMonths = 0
            if (emp.start_date) {
                const start = new Date(emp.start_date)
                const today = new Date()
                tenureMonths = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth())
            }

            // Age Calculation
            let age = null
            if (emp.birth_date) {
                const birth = new Date(emp.birth_date)
                const today = new Date()
                age = today.getFullYear() - birth.getFullYear()
                const m = today.getMonth() - birth.getMonth()
                if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
            }

            // Growth Calculation
            let growth = 0
            if (perf.salesHistory.length >= 2) {
                const last = perf.salesHistory[perf.salesHistory.length - 1].amount
                const prev = perf.salesHistory[perf.salesHistory.length - 2].amount
                if (prev > 0) growth = ((last - prev) / prev) * 100
            }

            // Medal Metrics
            const totalMedals = perf.medals.gold + perf.medals.silver + perf.medals.bronze
            const medalScore = (perf.medals.gold * 3) + (perf.medals.silver * 2) + perf.medals.bronze
            const effectiveTenure = Math.max(1, tenureMonths)
            const medalRatio = medalScore / effectiveTenure

            return {
                userId: p.id,
                name: p.full_name || 'Desconocido',
                gender: gender?.name || 'N/A',
                age,
                tenureMonths,
                totalSales: perf.totalSales,
                medals: perf.medals,
                totalMedals,
                medalScore,
                medalRatio,
                growth,
                meetingsPerClose,
                forecastAccuracy,
                topIndustry,
                physicalCloseRate,
                avgResponseTimeHours,
                lastRaceAmount: perf.salesHistory.length > 0 ? perf.salesHistory[perf.salesHistory.length - 1].amount : 0
            }
        })

        return { success: true, data: masterData }
    } catch (error: any) {
        console.error('[AdminCorrelation] General Exception:', error)
        return { success: false, error: error.message }
    }
}
