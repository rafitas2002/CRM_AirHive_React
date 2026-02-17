'use server'

import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { cookies } from 'next/headers'

export async function getAdminCorrelationData() {
    try {
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)

        // 0. Verify Auth
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'No autenticado' }

        // 1. Verify Role with regular server client
        const { data: profile, error: roleError } = await (supabase
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

        let dbClient: any = supabase
        try {
            dbClient = createAdminClient()
        } catch (envError: any) {
            console.warn('[AdminCorrelation] Admin env vars missing; using server client fallback:', envError?.message)
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
            { data: companies, error: compError },
            { data: taskHistory, error: taskError },
            { data: preLeads, error: preError }
        ] = await Promise.all([
            dbClient.from('profiles').select('id, full_name') as any,
            dbClient.from('employee_profiles').select('*') as any,
            dbClient.from('genders').select('id, name') as any,
            dbClient.from('race_results').select('*').order('period', { ascending: true }) as any,
            dbClient.from('meetings').select('*') as any,
            dbClient.from('clientes').select('*') as any,
            dbClient.from('industrias').select('*') as any,
            dbClient.from('empresas').select('*') as any,
            dbClient.from('historial_tareas').select('user_id') as any,
            dbClient.from('pre_leads').select('*') as any
        ])

        if (profError) throw profError
        if (empError) throw empError
        if (genderError) throw genderError
        if (raceError) throw raceError
        if (meetError) throw meetError
        if (clientError) throw clientError
        if (indError) throw indError
        if (compError) throw compError
        if (taskError) throw taskError
        if (preError) throw preError

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

        const DAY_MS = 24 * 60 * 60 * 1000
        const monthDiff = (start: Date, end: Date) =>
            (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1

        const computeAveragesBySpan = (dates: Date[]) => {
            if (dates.length === 0) {
                return { perDay: 0, perMonth: 0 }
            }

            const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime())
            const first = sorted[0]
            const last = sorted[sorted.length - 1]
            const spanDays = Math.max(1, Math.ceil((last.getTime() - first.getTime()) / DAY_MS) + 1)
            const spanMonths = Math.max(1, monthDiff(first, last))

            return {
                perDay: dates.length / spanDays,
                perMonth: dates.length / spanMonths
            }
        }

        const preLeadById = new Map<number, any>(
            (preLeads || []).map((pl: any) => [pl.id, pl])
        )

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

            // Task Completion Metric
            const completedTasks = (taskHistory || []).filter((t: any) => t.user_id === p.id).length

            // New Metrics: Pre-Leads & Conversions
            const userPreLeads = (preLeads || []).filter((pl: any) => pl.vendedor_id === p.id)
            const preLeadsCount = userPreLeads.length
            const preLeadDates = userPreLeads
                .map((pl: any) => pl.created_at ? new Date(pl.created_at) : null)
                .filter((d: Date | null): d is Date => !!d)
            const preLeadAvg = computeAveragesBySpan(preLeadDates)

            const conversions = (clients || []).filter((c: any) =>
                !!c.original_pre_lead_id &&
                c.original_vendedor_id === p.id &&
                !!c.converted_at
            )
            const convertedFromPreLeadTable = userPreLeads.filter((pl: any) => pl.is_converted)
            const convertedPreLeads = Math.max(conversions.length, convertedFromPreLeadTable.length)
            const preLeadConversionRate = preLeadsCount > 0 ? (convertedPreLeads / preLeadsCount) * 100 : 0
            const conversionDates = [
                ...conversions.map((c: any) => c.converted_at ? new Date(c.converted_at) : null),
                ...convertedFromPreLeadTable.map((pl: any) => pl.converted_at ? new Date(pl.converted_at) : null)
            ]
                .filter((d: Date | null): d is Date => !!d)
            const conversionAvg = computeAveragesBySpan(conversionDates)

            const conversionLagDaysList = conversions
                .map((c: any) => {
                    const source = preLeadById.get(c.original_pre_lead_id)
                    if (!source?.created_at || !c.converted_at) return null
                    const lag = (new Date(c.converted_at).getTime() - new Date(source.created_at).getTime()) / DAY_MS
                    return lag >= 0 ? lag : null
                })
                .filter((n: number | null): n is number => n !== null)
            const avgConversionLagDays = conversionLagDaysList.length > 0
                ? conversionLagDaysList.reduce((a: number, b: number) => a + b, 0) / conversionLagDaysList.length
                : 0

            const userCompanies = (companies || []).filter((comp: any) => comp.owner_id === p.id)
            const companiesCreated = userCompanies.length
            const companyDates = userCompanies
                .map((comp: any) => comp.created_at ? new Date(comp.created_at) : null)
                .filter((d: Date | null): d is Date => !!d)
            const companyAvg = computeAveragesBySpan(companyDates)
            const lastCompanyCreatedAt = userCompanies
                .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]?.created_at || null

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
                completedTasks,
                growth,
                meetingsPerClose,
                forecastAccuracy,
                topIndustry,
                physicalCloseRate,
                avgResponseTimeHours,
                lastRaceAmount: perf.salesHistory.length > 0 ? perf.salesHistory[perf.salesHistory.length - 1].amount : 0,
                preLeadsCount,
                preLeadConversionRate,
                convertedPreLeadsCount: convertedPreLeads,
                avgPreLeadsPerDay: preLeadAvg.perDay,
                avgPreLeadsPerMonth: preLeadAvg.perMonth,
                avgConvertedPreLeadsPerDay: conversionAvg.perDay,
                avgConvertedPreLeadsPerMonth: conversionAvg.perMonth,
                avgConversionLagDays,
                companiesCreated,
                avgCompaniesPerDay: companyAvg.perDay,
                avgCompaniesPerMonth: companyAvg.perMonth,
                lastCompanyCreatedAt
            }
        })

        const profileNameById = new Map<string, string>(
            (profiles || []).map((p: any) => [p.id, p.full_name || 'Desconocido'])
        )

        const companyRegistry = (companies || [])
            .map((company: any) => ({
                id: company.id,
                nombre: company.nombre,
                ownerId: company.owner_id || null,
                ownerName: company.owner_id ? profileNameById.get(company.owner_id) || 'Desconocido' : 'Sin asignar',
                createdAt: company.created_at,
                industria: company.industria || 'Sin clasificar',
                ubicacion: company.ubicacion || 'N/A'
            }))
            .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

        return {
            success: true,
            data: {
                users: masterData,
                companyRegistry
            }
        }
    } catch (error: any) {
        console.error('[AdminCorrelation] General Exception:', error)
        return { success: false, error: error.message }
    }
}

export async function getUserActivitySummary(targetUserId: string) {
    try {
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)

        // 1. Verify Auth & Role
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'No autenticado' }

        const { data: profile } = await (supabase.from('profiles') as any).select('role').eq('id', user.id).single()
        if (profile?.role !== 'admin' && profile?.role !== 'rh') {
            return { success: false, error: 'Acceso denegado' }
        }

        let dbClient: any = supabase
        try {
            dbClient = createAdminClient()
        } catch (envError: any) {
            console.warn('[UserActivitySummary] Admin env vars missing; using server client fallback:', envError?.message)
        }

        // 2. Fetch Data
        const [
            { data: raceResults },
            { data: meetings },
            { data: clients },
            { data: tasks },
            { data: taskHistory },
            { data: industries },
            { data: companies }
        ] = await Promise.all([
            dbClient.from('race_results').select('*').eq('user_id', targetUserId).order('period', { ascending: true }) as any,
            dbClient.from('meetings').select('*').eq('seller_id', targetUserId).order('start_time', { ascending: false }) as any,
            dbClient.from('clientes').select('*').eq('owner_id', targetUserId) as any,
            dbClient.from('tareas').select('*').eq('vendedor_id', targetUserId).order('fecha_vencimiento', { ascending: false }) as any,
            dbClient.from('historial_tareas').select('*').eq('user_id', targetUserId).order('fecha_completado', { ascending: false }) as any,
            dbClient.from('industrias').select('*') as any,
            dbClient.from('empresas').select('*') as any
        ])

        // 3. Performance Aggregation
        let totalSales = 0
        const medals = { gold: 0, silver: 0, bronze: 0 }
        const salesHistory: any[] = []
        raceResults?.forEach((res: any) => {
            totalSales += Number(res.total_sales || 0)
            salesHistory.push({ period: res.period, amount: Number(res.total_sales || 0) })
            if (res.medal === 'gold') medals.gold++
            if (res.medal === 'silver') medals.silver++
            if (res.medal === 'bronze') medals.bronze++
        })

        const closedWon = (clients || []).filter((c: any) => c.etapa === 'Cerrada Ganada')
        const meetingsPerClose = closedWon.length > 0 ? (meetings || []).length / closedWon.length : (meetings || []).length

        let totalForecastError = 0
        closedWon.forEach((c: any) => totalForecastError += (100 - (c.probabilidad || 0)))
        const forecastAccuracy = closedWon.length > 0 ? 100 - (totalForecastError / closedWon.length) : 0

        const industryMap: Record<string, number> = {}
        closedWon.forEach((c: any) => {
            const company = (companies || []).find((comp: any) => comp.id === c.empresa_id)
            const industry = (industries || []).find((ind: any) => ind.id === company?.industria_id)
            const indName = industry?.name || 'Otro'
            industryMap[indName] = (industryMap[indName] || 0) + 1
        })
        const topIndustry = Object.entries(industryMap).sort((a: any, b: any) => b[1] - a[1])[0]?.[0] || 'N/A'

        // 3.1 Modal Impact
        const closedWithPhysical = closedWon.filter((c: any) => {
            const clientMeetings = (meetings || []).filter((m: any) => m.lead_id === c.id)
            return clientMeetings.some((m: any) => m.meeting_type === 'presencial')
        })
        const physicalCloseRate = closedWon.length > 0 ? (closedWithPhysical.length / closedWon.length) * 100 : 0

        // 3.2 Response Speed
        let totalResponseTimeMs = 0
        let responseCount = 0
        const userClients = (clients || [])
        userClients.forEach((c: any) => {
            const firstMeeting = (meetings || [])
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

        // 4. Combined Activity List
        const activityList = [
            ...(tasks || []).map((t: any) => ({
                id: t.id,
                type: 'task',
                title: t.titulo,
                description: t.descripcion,
                status: t.estado,
                date: t.fecha_vencimiento,
                created_at: t.created_at
            })),
            ...(taskHistory || []).map((h: any) => ({
                id: `h-${h.id}`,
                type: 'task_completion',
                title: h.titulo,
                description: `Completada en ${h.empresa}`,
                status: 'completada',
                date: h.fecha_completado,
                created_at: h.fecha_completado
            })),
            ...(meetings || []).map((m: any) => ({
                id: m.id,
                type: 'meeting',
                title: m.title,
                description: m.notes,
                status: m.meeting_status,
                date: m.start_time,
                created_at: m.created_at
            }))
        ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

        return {
            success: true,
            data: {
                metrics: {
                    totalSales,
                    medals,
                    totalMedals: medals.gold + medals.silver + medals.bronze,
                    meetingsPerClose,
                    forecastAccuracy,
                    topIndustry,
                    physicalCloseRate,
                    avgResponseTimeHours,
                    lastRaceAmount: salesHistory.length > 0 ? salesHistory[salesHistory.length - 1].amount : 0,
                    completedTasksCount: (taskHistory || []).length,
                    pendingTasksCount: (tasks || []).filter((t: any) => t.estado === 'pendiente').length
                },
                activities: activityList
            }
        }
    } catch (error: any) {
        console.error('[AdminUserActivity] Error:', error)
        return { success: false, error: error.message }
    }
}
