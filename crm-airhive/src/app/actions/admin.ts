'use server'

import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { cookies } from 'next/headers'

export interface CommercialForecastFilters {
    dateFrom?: string
    dateTo?: string
    size?: string
    industry?: string
    location?: string
    sourceChannel?: 'all' | 'pre_lead' | 'direct'
}

const getConfidenceLabel = (n: number) => {
    if (n >= 80) return 'alta'
    if (n >= 30) return 'media'
    if (n >= 10) return 'baja'
    return 'insuficiente'
}

const getPercentile = (values: number[], p: number) => {
    if (values.length === 0) return 0
    const sorted = [...values].sort((a, b) => a - b)
    const index = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p)))
    return sorted[index]
}

const normalizeStage = (stage: string | null | undefined) => String(stage || '').toLowerCase()

const isWonStage = (stage: string | null | undefined) => {
    const value = normalizeStage(stage)
    return value.includes('ganad')
}

const isClosedStage = (stage: string | null | undefined) => {
    const value = normalizeStage(stage)
    return value.includes('cerrad')
}

const norm = (value: string | null | undefined) => (value || '').trim().toLowerCase()

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

        if (profile.role !== 'admin') {
            return { success: false, error: 'No tienes permisos para acceder a estos datos' }
        }

        let dbClient: any
        try {
            dbClient = createAdminClient()
        } catch (envError: any) {
            console.error('[AdminCorrelation] Admin client unavailable. Full cross-user analytics requires service role.', envError?.message)
            return {
                success: false,
                error: 'No se pudo inicializar el cliente admin para analítica global. Configura SUPABASE_SERVICE_ROLE_KEY para ver correlaciones de todos los usuarios.'
            }
        }

        // 2. Fetch tables with ADMIN client
        console.log('[AdminCorrelation] Fetching data tables...')
        const eventsWindowStart = new Date()
        eventsWindowStart.setDate(eventsWindowStart.getDate() - 90)

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
            { data: preLeads, error: preError },
            { data: crmEvents, error: eventsError }
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
            dbClient.from('pre_leads').select('*') as any,
            dbClient.from('crm_events')
                .select('user_id, event_type, created_at')
                .gte('created_at', eventsWindowStart.toISOString()) as any
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
        if (eventsError && eventsError.code !== '42P01') {
            throw eventsError
        }

        const eventsByUser = (crmEvents || []).reduce((acc: Record<string, any[]>, evt: any) => {
            if (!evt?.user_id) return acc
            if (!acc[evt.user_id]) acc[evt.user_id] = []
            acc[evt.user_id].push(evt)
            return acc
        }, {})

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

        const pearson = (pairs: Array<{ x: number, y: number }>) => {
            const valid = pairs.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
            const n = valid.length
            if (n < 2) return 0

            const sumX = valid.reduce((acc, p) => acc + p.x, 0)
            const sumY = valid.reduce((acc, p) => acc + p.y, 0)
            const sumXY = valid.reduce((acc, p) => acc + (p.x * p.y), 0)
            const sumX2 = valid.reduce((acc, p) => acc + (p.x * p.x), 0)
            const sumY2 = valid.reduce((acc, p) => acc + (p.y * p.y), 0)

            const num = (n * sumXY) - (sumX * sumY)
            const den = Math.sqrt(((n * sumX2) - (sumX * sumX)) * ((n * sumY2) - (sumY * sumY)))
            if (!Number.isFinite(den) || den === 0) return 0
            return num / den
        }

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

            // Activity telemetry (last 90 days) from crm_events
            const userEvents = eventsByUser[p.id] || []
            const activityDays = new Set(
                userEvents
                    .map((evt: any) => evt.created_at ? new Date(evt.created_at).toISOString().slice(0, 10) : null)
                    .filter((day: string | null): day is string => !!day)
            )
            const countByType = userEvents.reduce((acc: Record<string, number>, evt: any) => {
                const key = evt.event_type || 'unknown'
                acc[key] = (acc[key] || 0) + 1
                return acc
            }, {})

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
                lastCompanyCreatedAt,
                activityEvents90d: userEvents.length,
                activityDays90d: activityDays.size,
                leadCreatedEvents90d: countByType.lead_created || 0,
                leadClosedEvents90d: countByType.lead_closed || 0,
                forecastUpdatedEvents90d: countByType.forecast_registered || 0,
                meetingsScheduledEvents90d: countByType.meeting_scheduled || 0,
                meetingsFinishedEvents90d: countByType.meeting_finished || 0,
                taskStatusChangedEvents90d: countByType.task_status_changed || 0,
                preLeadCreatedEvents90d: countByType.pre_lead_created || 0,
                preLeadConvertedEvents90d: countByType.pre_lead_converted || 0
            }
        })

        const profileNameById = new Map<string, string>(
            (profiles || []).map((p: any) => [p.id, p.full_name || 'Desconocido'])
        )

        const meetingsByLeadId = (meetings || []).reduce((acc: Record<number, any[]>, meeting: any) => {
            const leadId = Number(meeting.lead_id)
            if (!leadId) return acc
            if (!acc[leadId]) acc[leadId] = []
            acc[leadId].push(meeting)
            return acc
        }, {})

        const leadAnalyticsRows = (clients || [])
            .map((lead: any) => {
                const ownerId = lead.owner_id || null
                const leadMeetings = meetingsByLeadId[lead.id] || []
                const firstMeeting = [...leadMeetings]
                    .sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())[0]

                const responseHours = firstMeeting && lead.created_at
                    ? Math.max(0, (new Date(firstMeeting.start_time).getTime() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60))
                    : 0

                const stage = String(lead.etapa || '').toLowerCase()
                const isClosed = stage.includes('cerrad')
                const closedOutcome = stage.includes('ganad') ? 1 : isClosed ? 0 : null

                const sourcePreLead = lead.original_pre_lead_id ? preLeadById.get(lead.original_pre_lead_id) : null
                const conversionLagDays = sourcePreLead?.created_at && lead.converted_at
                    ? Math.max(0, (new Date(lead.converted_at).getTime() - new Date(sourcePreLead.created_at).getTime()) / DAY_MS)
                    : null

                return {
                    leadId: lead.id,
                    ownerId,
                    ownerName: ownerId ? profileNameById.get(ownerId) || 'Desconocido' : 'Sin asignar',
                    createdAt: lead.created_at,
                    stage: lead.etapa || 'N/A',
                    probabilidad: Number(lead.probabilidad || 0),
                    valorEstimado: Number(lead.valor_estimado || 0),
                    calificacion: Number(lead.calificacion || 0),
                    meetingsCount: leadMeetings.length,
                    responseHours,
                    hasPhysicalMeeting: leadMeetings.some((m: any) => m.meeting_type === 'presencial') ? 1 : 0,
                    fromPreLead: lead.original_pre_lead_id ? 1 : 0,
                    conversionLagDays,
                    closedOutcome
                }
            })
            .filter((row: any) => !!row.ownerId)

        const companyRegistry = (companies || [])
            .map((company: any) => ({
                id: String(company.id),
                nombre: company.nombre || '',
                ownerId: company.owner_id || null,
                ownerName: company.owner_id ? profileNameById.get(company.owner_id) || 'Desconocido' : 'Sin asignar',
                createdAt: company.created_at,
                industria: company.industria || 'Sin clasificar',
                ubicacion: company.ubicacion || 'N/A'
            }))
            .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

        const companyById = new Map<number, any>((companies || []).map((comp: any) => [comp.id, comp]))
        const leadById = new Map<number, any>((clients || []).map((client: any) => [client.id, client]))

        const sizeBucket: Record<number, { total: number, postponed: number, held: number }> = {
            1: { total: 0, postponed: 0, held: 0 },
            2: { total: 0, postponed: 0, held: 0 },
            3: { total: 0, postponed: 0, held: 0 },
            4: { total: 0, postponed: 0, held: 0 },
            5: { total: 0, postponed: 0, held: 0 }
        }

        ;(meetings || []).forEach((m: any) => {
            const lead = leadById.get(m.lead_id)
            const company = lead?.empresa_id ? companyById.get(lead.empresa_id) : null
            const size = Number(company?.tamano || 0)
            if (!sizeBucket[size]) return

            sizeBucket[size].total += 1
            if (m.meeting_status === 'held') {
                sizeBucket[size].held += 1
            }
            if (m.meeting_status === 'not_held' || m.meeting_status === 'cancelled') {
                sizeBucket[size].postponed += 1
            }
        })

        const postponeByCompanySize = [1, 2, 3, 4, 5].map((size) => {
            const bucket = sizeBucket[size]
            const total = bucket.total
            const postponed = bucket.postponed
            const held = bucket.held
            return {
                size,
                totalMeetings: total,
                postponedMeetings: postponed,
                heldMeetings: held,
                postponeProbability: total > 0 ? (postponed / total) * 100 : 0
            }
        })

        const correlationData = masterData.map((row: any) => ({
            name: row.name,
            tenureMonths: Number(row.tenureMonths || 0),
            totalSales: Number(row.totalSales || 0),
            forecastAccuracy: Number(row.forecastAccuracy || 0),
            meetingsPerClose: Number(row.meetingsPerClose || 0)
        }))

        const correlations = [
            {
                key: 'tenure_sales',
                label: 'Antigüedad vs Ventas',
                r: pearson(correlationData.map((d: any) => ({ x: d.tenureMonths, y: d.totalSales })))
            },
            {
                key: 'tenure_accuracy',
                label: 'Antigüedad vs Accuracy',
                r: pearson(correlationData.map((d: any) => ({ x: d.tenureMonths, y: d.forecastAccuracy })))
            },
            {
                key: 'effort_sales',
                label: 'Meetings por Cierre vs Ventas',
                r: pearson(correlationData.map((d: any) => ({ x: d.meetingsPerClose, y: d.totalSales })))
            }
        ]

        return {
            success: true,
            data: {
                users: masterData,
                companyRegistry,
                analytics: {
                    correlationData,
                    correlations,
                    postponeByCompanySize
                }
            }
        }
    } catch (error: any) {
        console.error('[AdminCorrelation] General Exception:', error)
        return { success: false, error: error.message }
    }
}

export async function getAdminCommercialForecast(filters: CommercialForecastFilters = {}) {
    try {
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'No autenticado' }

        const { data: profile, error: roleError } = await (supabase
            .from('profiles') as any)
            .select('role')
            .eq('id', user.id)
            .single()

        if (roleError || !profile) {
            return { success: false, error: 'No se pudo verificar el rol' }
        }
        if (profile.role !== 'admin') {
            return { success: false, error: 'No tienes permisos para acceder a estos datos' }
        }

        let dbClient: any
        try {
            dbClient = createAdminClient()
        } catch (envError: any) {
            return {
                success: false,
                error: 'No se pudo inicializar el cliente admin para pronósticos globales. Configura SUPABASE_SERVICE_ROLE_KEY.'
            }
        }

        const [
            { data: clients, error: clientError },
            { data: companies, error: companyError },
            { data: meetings, error: meetingError },
            { data: crmEvents, error: crmEventsError },
            { data: rescheduleEvents, error: rescheduleError }
        ] = await Promise.all([
            dbClient.from('clientes').select('*') as any,
            dbClient.from('empresas').select('id, nombre, industria, ubicacion, tamano, created_at') as any,
            dbClient.from('meetings').select('*') as any,
            dbClient.from('crm_events').select('event_type, entity_id, metadata, created_at') as any,
            dbClient.from('meeting_reschedule_events').select('meeting_id, old_start_time, new_start_time, created_at') as any
        ])

        if (clientError) throw clientError
        if (companyError) throw companyError
        if (meetingError) throw meetingError
        if (crmEventsError && crmEventsError.code !== '42P01') throw crmEventsError
        if (rescheduleError && rescheduleError.code !== '42P01') throw rescheduleError

        const dateFrom = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00`) : null
        const dateTo = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59`) : null

        const companyById = new Map<string, any>((companies || []).map((comp: any) => [comp.id, comp]))
        const meetingsByLeadId = (meetings || []).reduce((acc: Record<number, any[]>, meeting: any) => {
            const leadId = Number(meeting.lead_id)
            if (!leadId) return acc
            if (!acc[leadId]) acc[leadId] = []
            acc[leadId].push(meeting)
            return acc
        }, {})

        const leadCreatedEvents = (crmEvents || []).filter((evt: any) => evt.event_type === 'lead_created')
        const leadSourceById = new Map<number, 'pre_lead' | 'direct'>()
        leadCreatedEvents.forEach((evt: any) => {
            const leadId = Number(evt.entity_id)
            if (!leadId) return
            const sourceRaw = String(evt.metadata?.source || '').toLowerCase()
            leadSourceById.set(leadId, sourceRaw.includes('pre') ? 'pre_lead' : 'direct')
        })

        const rescheduledMeetingIds = new Set<string>()
        ;(rescheduleEvents || []).forEach((evt: any) => {
            if (evt.meeting_id) rescheduledMeetingIds.add(evt.meeting_id)
        })
        ;(crmEvents || []).forEach((evt: any) => {
            if (evt.event_type === 'meeting_rescheduled' && evt.entity_id) {
                rescheduledMeetingIds.add(String(evt.entity_id))
            }
        })

        const leadRows = (clients || []).map((lead: any) => {
            const company = lead.empresa_id ? companyById.get(lead.empresa_id) : null
            const leadMeetings = meetingsByLeadId[lead.id] || []
            const sourceChannel = leadSourceById.get(lead.id) || (lead.original_pre_lead_id ? 'pre_lead' : 'direct')
            const leadCreatedAt = lead.created_at ? new Date(lead.created_at) : null

            return {
                lead,
                company,
                leadMeetings,
                sourceChannel,
                leadCreatedAt
            }
        }).filter((row: any) => !!row.company)

        const filteredLeadRows = leadRows.filter((row: any) => {
            const company = row.company
            if (!company) return false
            if (filters.size && filters.size !== 'all' && String(company.tamano || '') !== filters.size) return false
            if (filters.industry && filters.industry !== 'all' && norm(company.industria) !== norm(filters.industry)) return false
            if (filters.location && filters.location !== 'all' && norm(company.ubicacion) !== norm(filters.location)) return false
            if (filters.sourceChannel && filters.sourceChannel !== 'all' && row.sourceChannel !== filters.sourceChannel) return false
            if (dateFrom && row.leadCreatedAt && row.leadCreatedAt < dateFrom) return false
            if (dateTo && row.leadCreatedAt && row.leadCreatedAt > dateTo) return false
            return true
        })

        // 1) Forecast: meetings needed to close (won leads only)
        const wonLeadRows = filteredLeadRows.filter((row: any) => isWonStage(row.lead.etapa))
        const meetingsCounts = wonLeadRows.map((row: any) => row.leadMeetings.length)
        const meetingsAvg = meetingsCounts.length > 0
            ? meetingsCounts.reduce((acc: number, value: number) => acc + value, 0) / meetingsCounts.length
            : 0

        const meetingsToCloseForecast = {
            averageMeetings: meetingsAvg,
            p25: getPercentile(meetingsCounts, 0.25),
            p75: getPercentile(meetingsCounts, 0.75),
            sampleSize: meetingsCounts.length,
            confidence: getConfidenceLabel(meetingsCounts.length),
            insufficientSample: meetingsCounts.length < 10
        }

        // 2) Postponement probability (rescheduled meetings / total meetings)
        const candidateMeetings = filteredLeadRows.flatMap((row: any) =>
            row.leadMeetings.map((meeting: any) => ({
                meeting,
                company: row.company
            }))
        )

        const postponeTotal = candidateMeetings.length
        const postponeHits = candidateMeetings.filter((row: any) => rescheduledMeetingIds.has(String(row.meeting.id))).length
        const postponeGlobal = postponeTotal > 0 ? postponeHits / postponeTotal : 0

        const groupPostpone = (getKey: (row: any) => string) => {
            const map: Record<string, { total: number, rescheduled: number }> = {}
            candidateMeetings.forEach((row: any) => {
                const key = getKey(row)
                if (!map[key]) map[key] = { total: 0, rescheduled: 0 }
                map[key].total++
                if (rescheduledMeetingIds.has(String(row.meeting.id))) map[key].rescheduled++
            })
            return Object.entries(map).map(([label, stats]) => ({
                label,
                n: stats.total,
                probability: stats.total > 0 ? stats.rescheduled / stats.total : 0,
                liftVsGlobal: stats.total > 0 ? (stats.rescheduled / stats.total) - postponeGlobal : 0
            }))
        }

        const postponeByIndustry = groupPostpone((row) => row.company?.industria || 'Sin clasificar')
        const postponeBySize = groupPostpone((row) => row.company?.tamano ? `Tamaño ${row.company.tamano}` : 'Sin tamaño')
        const postponeByLocation = groupPostpone((row) => row.company?.ubicacion || 'Sin ubicación')

        const topPostponeFactors = [
            ...postponeByIndustry.map((item) => ({ dimension: 'industria', ...item })),
            ...postponeBySize.map((item) => ({ dimension: 'tamano', ...item })),
            ...postponeByLocation.map((item) => ({ dimension: 'ubicacion', ...item }))
        ]
            .filter((item) => item.n >= 5)
            .sort((a, b) => Math.abs(b.liftVsGlobal) - Math.abs(a.liftVsGlobal))
            .slice(0, 8)

        const postponementForecast = {
            globalProbability: postponeGlobal,
            sampleSize: postponeTotal,
            rescheduledMeetings: postponeHits,
            confidence: getConfidenceLabel(postponeTotal),
            insufficientSample: postponeTotal < 20,
            byIndustry: postponeByIndustry,
            bySize: postponeBySize,
            byLocation: postponeByLocation,
            topFactors: topPostponeFactors
        }

        // 3) Projects expected per new company
        const filteredCompanies = (companies || []).filter((company: any) => {
            if (filters.size && filters.size !== 'all' && String(company.tamano || '') !== filters.size) return false
            if (filters.industry && filters.industry !== 'all' && norm(company.industria) !== norm(filters.industry)) return false
            if (filters.location && filters.location !== 'all' && norm(company.ubicacion) !== norm(filters.location)) return false
            const createdAt = company.created_at ? new Date(company.created_at) : null
            if (dateFrom && createdAt && createdAt < dateFrom) return false
            if (dateTo && createdAt && createdAt > dateTo) return false
            return true
        })

        const leadsByCompanyId = (clients || []).reduce((acc: Record<string, number>, lead: any) => {
            if (!lead.empresa_id) return acc
            acc[lead.empresa_id] = (acc[lead.empresa_id] || 0) + 1
            return acc
        }, {})

        const projectCounts = filteredCompanies.map((company: any) => leadsByCompanyId[company.id] || 0)
        const projectAvg = projectCounts.length > 0
            ? projectCounts.reduce((acc: number, value: number) => acc + value, 0) / projectCounts.length
            : 0

        const bucketCount = {
            zero: projectCounts.filter((count: number) => count === 0).length,
            one: projectCounts.filter((count: number) => count === 1).length,
            twoPlus: projectCounts.filter((count: number) => count >= 2).length
        }

        const safeProb = (count: number, total: number) => total > 0 ? count / total : 0
        const companySample = projectCounts.length

        const groupProjects = (getKey: (company: any) => string) => {
            const grouped: Record<string, number[]> = {}
            filteredCompanies.forEach((company: any) => {
                const key = getKey(company)
                if (!grouped[key]) grouped[key] = []
                grouped[key].push(leadsByCompanyId[company.id] || 0)
            })
            return Object.entries(grouped).map(([label, counts]) => {
                const avg = counts.length > 0 ? counts.reduce((acc, value) => acc + value, 0) / counts.length : 0
                return {
                    label,
                    n: counts.length,
                    avgProjects: avg,
                    pZero: safeProb(counts.filter((c) => c === 0).length, counts.length),
                    pOne: safeProb(counts.filter((c) => c === 1).length, counts.length),
                    pTwoPlus: safeProb(counts.filter((c) => c >= 2).length, counts.length)
                }
            })
        }

        const projectsForecast = {
            avgProjectsPerNewCompany: projectAvg,
            sampleSizeCompanies: companySample,
            confidence: getConfidenceLabel(companySample),
            insufficientSample: companySample < 10,
            distribution: {
                p0: safeProb(bucketCount.zero, companySample),
                p1: safeProb(bucketCount.one, companySample),
                p2plus: safeProb(bucketCount.twoPlus, companySample)
            },
            byIndustry: groupProjects((company) => company.industria || 'Sin clasificar'),
            bySize: groupProjects((company) => company.tamano ? `Tamaño ${company.tamano}` : 'Sin tamaño'),
            byLocation: groupProjects((company) => company.ubicacion || 'Sin ubicación')
        }

        return {
            success: true,
            data: {
                filtersApplied: {
                    dateFrom: filters.dateFrom || null,
                    dateTo: filters.dateTo || null,
                    size: filters.size || 'all',
                    industry: filters.industry || 'all',
                    location: filters.location || 'all',
                    sourceChannel: filters.sourceChannel || 'all'
                },
                meetingsToCloseForecast,
                postponementForecast,
                projectsForecast,
                options: {
                    sizes: Array.from(new Set((companies || []).map((c: any) => c.tamano).filter((v: any) => v !== null))).sort((a: any, b: any) => Number(a) - Number(b)),
                    industries: Array.from(new Set((companies || []).map((c: any) => c.industria).filter((v: any) => !!v))).sort(),
                    locations: Array.from(new Set((companies || []).map((c: any) => c.ubicacion).filter((v: any) => !!v))).sort()
                }
            }
        }
    } catch (error: any) {
        console.error('[AdminCommercialForecast] Error:', error)
        return { success: false, error: error.message || 'Error calculando pronósticos comerciales' }
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
