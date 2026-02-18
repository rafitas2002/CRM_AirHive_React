'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { getAdminCorrelationData, getAdminCommercialForecast } from '@/app/actions/admin'
import { getPastRaces, syncRaceResults } from '@/app/actions/race'
import { RaceHistoryTable } from '@/components/RaceHistoryTable'
import {
    Users,
    TrendingUp,
    Calendar,
    Venus,
    Mars,
    Trophy,
    ArrowUpRight,
    ArrowDownRight,
    Search,
    Filter,
    Table as TableIcon,
    Zap,
    BarChart3,
    Building2,
    Timer,
    CheckCircle,
    MapPin,
    Hash
} from 'lucide-react'
import RichardDawkinsFooter from '@/components/RichardDawkinsFooter'
import { motion, AnimatePresence } from 'framer-motion'

type CorrelationScope = 'team' | 'individual'

type MetricKey =
    | 'totalSales' | 'totalMedals' | 'goldMedals' | 'medalRatio' | 'tenureMonths' | 'age' | 'growth'
    | 'meetingsPerClose' | 'forecastAccuracy' | 'avgResponseTimeHours'
    | 'preLeadsCount' | 'preLeadConversionRate' | 'avgPreLeadsPerDay' | 'avgConvertedPreLeadsPerMonth' | 'avgConversionLagDays'
    | 'companiesCreated' | 'avgCompaniesPerMonth'
    | 'activityEvents90d' | 'activityDays90d' | 'leadCreatedEvents90d' | 'leadClosedEvents90d'
    | 'forecastUpdatedEvents90d' | 'meetingsScheduledEvents90d' | 'meetingsFinishedEvents90d' | 'taskStatusChangedEvents90d'
    | 'preLeadCreatedEvents90d' | 'preLeadConvertedEvents90d'
    | 'probabilidad' | 'valorEstimado' | 'calificacion' | 'meetingsCount' | 'responseHours' | 'hasPhysicalMeeting'
    | 'fromPreLead' | 'conversionLagDays' | 'closedOutcome'

interface MetricDefinition {
    key: MetricKey
    label: string
    group: string
    scopes: CorrelationScope[]
}

const METRIC_CATALOG: MetricDefinition[] = [
    { key: 'totalSales', label: 'Ventas Totales', group: 'Resultado Comercial', scopes: ['team'] },
    { key: 'totalMedals', label: 'Total Medallas', group: 'Resultado Comercial', scopes: ['team'] },
    { key: 'goldMedals', label: 'Medallas Oro', group: 'Resultado Comercial', scopes: ['team'] },
    { key: 'medalRatio', label: 'Eficiencia de Medallas', group: 'Resultado Comercial', scopes: ['team'] },
    { key: 'growth', label: 'Crecimiento %', group: 'Resultado Comercial', scopes: ['team'] },
    { key: 'forecastAccuracy', label: 'Forecast Accuracy %', group: 'Resultado Comercial', scopes: ['team'] },

    { key: 'preLeadsCount', label: 'Pre-Leads Totales', group: 'Prospección y Conversión', scopes: ['team'] },
    { key: 'preLeadConversionRate', label: 'Conversión Pre-Lead %', group: 'Prospección y Conversión', scopes: ['team'] },
    { key: 'avgPreLeadsPerDay', label: 'Pre-Leads / Día', group: 'Prospección y Conversión', scopes: ['team'] },
    { key: 'avgConvertedPreLeadsPerMonth', label: 'Conv. Pre-Lead / Mes', group: 'Prospección y Conversión', scopes: ['team'] },
    { key: 'avgConversionLagDays', label: 'Lag Conversión (días)', group: 'Prospección y Conversión', scopes: ['team'] },
    { key: 'companiesCreated', label: 'Empresas Creadas', group: 'Prospección y Conversión', scopes: ['team'] },
    { key: 'avgCompaniesPerMonth', label: 'Empresas / Mes', group: 'Prospección y Conversión', scopes: ['team'] },

    { key: 'meetingsPerClose', label: 'Reuniones por Cierre', group: 'Cadencia Operativa', scopes: ['team'] },
    { key: 'avgResponseTimeHours', label: 'Respuesta Promedio (hrs)', group: 'Cadencia Operativa', scopes: ['team'] },
    { key: 'tenureMonths', label: 'Antigüedad (meses)', group: 'Cadencia Operativa', scopes: ['team'] },
    { key: 'age', label: 'Edad', group: 'Cadencia Operativa', scopes: ['team'] },

    { key: 'activityEvents90d', label: 'Actividad Total 90d', group: 'Telemetría 90d', scopes: ['team'] },
    { key: 'activityDays90d', label: 'Días Activos 90d', group: 'Telemetría 90d', scopes: ['team'] },
    { key: 'leadCreatedEvents90d', label: 'Eventos Lead Creado 90d', group: 'Telemetría 90d', scopes: ['team'] },
    { key: 'leadClosedEvents90d', label: 'Eventos Lead Cerrado 90d', group: 'Telemetría 90d', scopes: ['team'] },
    { key: 'forecastUpdatedEvents90d', label: 'Eventos Forecast 90d', group: 'Telemetría 90d', scopes: ['team'] },
    { key: 'meetingsScheduledEvents90d', label: 'Juntas Agendadas 90d', group: 'Telemetría 90d', scopes: ['team'] },
    { key: 'meetingsFinishedEvents90d', label: 'Juntas Finalizadas 90d', group: 'Telemetría 90d', scopes: ['team'] },
    { key: 'taskStatusChangedEvents90d', label: 'Cambios Estado Tarea 90d', group: 'Telemetría 90d', scopes: ['team'] },
    { key: 'preLeadCreatedEvents90d', label: 'Pre-Leads Creados 90d', group: 'Telemetría 90d', scopes: ['team'] },
    { key: 'preLeadConvertedEvents90d', label: 'Pre-Leads Convertidos 90d', group: 'Telemetría 90d', scopes: ['team'] },

    { key: 'probabilidad', label: 'Probabilidad Forecast', group: 'Calidad de Lead (Usuario)', scopes: ['individual'] },
    { key: 'valorEstimado', label: 'Valor Estimado', group: 'Calidad de Lead (Usuario)', scopes: ['individual'] },
    { key: 'calificacion', label: 'Calificación', group: 'Calidad de Lead (Usuario)', scopes: ['individual'] },
    { key: 'meetingsCount', label: 'Reuniones del Lead', group: 'Proceso Comercial (Usuario)', scopes: ['individual'] },
    { key: 'responseHours', label: 'Horas a Primera Reunión', group: 'Proceso Comercial (Usuario)', scopes: ['individual'] },
    { key: 'hasPhysicalMeeting', label: 'Incluye Reunión Presencial', group: 'Proceso Comercial (Usuario)', scopes: ['individual'] },
    { key: 'fromPreLead', label: 'Origen Pre-Lead', group: 'Proceso Comercial (Usuario)', scopes: ['individual'] },
    { key: 'conversionLagDays', label: 'Lag Conversión PreLead->Lead', group: 'Proceso Comercial (Usuario)', scopes: ['individual'] },
    { key: 'closedOutcome', label: 'Resultado Cierre (1/0)', group: 'Resultado Lead (Usuario)', scopes: ['individual'] }
]

const QUICK_PRESETS: Array<{ id: string, label: string, scope: CorrelationScope, x: MetricKey, y: MetricKey }> = [
    { id: 'team_prelead_sales', label: 'Equipo: Pre-Leads / Día vs Ventas', scope: 'team', x: 'avgPreLeadsPerDay', y: 'totalSales' },
    { id: 'team_speed_accuracy', label: 'Equipo: Respuesta vs Forecast Accuracy', scope: 'team', x: 'avgResponseTimeHours', y: 'forecastAccuracy' },
    { id: 'team_effort_close', label: 'Equipo: Reuniones por Cierre vs Ventas', scope: 'team', x: 'meetingsPerClose', y: 'totalSales' },
    { id: 'user_prob_outcome', label: 'Usuario: Probabilidad vs Resultado', scope: 'individual', x: 'probabilidad', y: 'closedOutcome' },
    { id: 'user_speed_outcome', label: 'Usuario: Tiempo Respuesta vs Resultado', scope: 'individual', x: 'responseHours', y: 'closedOutcome' },
    { id: 'user_meetings_value', label: 'Usuario: Reuniones vs Valor Estimado', scope: 'individual', x: 'meetingsCount', y: 'valorEstimado' }
]

const metricLabelByKey: Record<MetricKey, string> = METRIC_CATALOG.reduce((acc, metric) => {
    acc[metric.key] = metric.label
    return acc
}, {} as Record<MetricKey, string>)

const metricHigherIsBetter: Partial<Record<MetricKey, boolean>> = {
    totalSales: true,
    totalMedals: true,
    goldMedals: true,
    medalRatio: true,
    forecastAccuracy: true,
    preLeadConversionRate: true,
    avgConvertedPreLeadsPerMonth: true,
    activityEvents90d: true,
    meetingsPerClose: false,
    avgResponseTimeHours: false,
    avgConversionLagDays: false,
    responseHours: false,
    conversionLagDays: false,
    closedOutcome: true
}

const getMetricValue = (row: any, metric: MetricKey): number | null => {
    if (metric === 'goldMedals') return Number(row?.medals?.gold || 0)
    const raw = row?.[metric]
    if (raw === null || raw === undefined) return null
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : null
}

const pearsonCorrelation = (rows: any[], xMetric: MetricKey, yMetric: MetricKey) => {
    const pairs = rows
        .map((row) => ({ x: getMetricValue(row, xMetric), y: getMetricValue(row, yMetric) }))
        .filter((pair) => pair.x !== null && pair.y !== null) as Array<{ x: number, y: number }>

    if (pairs.length < 3) return { r: null, n: pairs.length }

    const n = pairs.length
    const sumX = pairs.reduce((acc, p) => acc + p.x, 0)
    const sumY = pairs.reduce((acc, p) => acc + p.y, 0)
    const meanX = sumX / n
    const meanY = sumY / n

    let numerator = 0
    let denominatorX = 0
    let denominatorY = 0

    pairs.forEach((p) => {
        const dx = p.x - meanX
        const dy = p.y - meanY
        numerator += dx * dy
        denominatorX += dx * dx
        denominatorY += dy * dy
    })

    const denominator = Math.sqrt(denominatorX * denominatorY)
    if (denominator === 0) return { r: null, n }

    return { r: numerator / denominator, n }
}

const getStrengthLabel = (r: number) => {
    const abs = Math.abs(r)
    if (abs >= 0.7) return 'Muy fuerte'
    if (abs >= 0.5) return 'Fuerte'
    if (abs >= 0.3) return 'Moderada'
    return 'Débil'
}

const buildRecommendation = (xMetric: MetricKey, yMetric: MetricKey, r: number) => {
    const xBetter = metricHigherIsBetter[xMetric]
    const yBetter = metricHigherIsBetter[yMetric]
    const direction = r >= 0 ? 'positiva' : 'negativa'

    if (xBetter !== undefined && yBetter !== undefined) {
        const favorable = (xBetter === yBetter && r > 0) || (xBetter !== yBetter && r < 0)
        if (favorable) {
            return `La relación es ${direction} y favorece resultado: estandariza esta práctica como playbook operativo.`
        }
        return `La relación es ${direction} y parece fricción: revisa proceso/segmentación para evitar efecto adverso.`
    }

    return r >= 0
        ? 'A mayor valor en X, también sube Y. Conviene reforzar el proceso que impulsa X y monitorear causalidad.'
        : 'A mayor valor en X, Y cae. Conviene identificar cuellos de botella y diseñar un experimento A/B para corregir.'
}

export default function CorrelacionesPage({ forcedView }: { forcedView?: 'general' | 'grafica' | 'pronostico' } = {}) {
    const auth = useAuth()
    const router = useRouter()
    const searchParams = useSearchParams()
    const [data, setData] = useState<any[]>([])
    const [leadRows, setLeadRows] = useState<any[]>([])
    const [companyRegistry, setCompanyRegistry] = useState<any[]>([])
    const [pastRaces, setPastRaces] = useState<Record<string, any[]>>({})
    const [forecastData, setForecastData] = useState<any>(null)
    const [forecastOptions, setForecastOptions] = useState<{ sizes: any[], industries: any[], locations: any[] }>({ sizes: [], industries: [], locations: [] })
    const [forecastFilters, setForecastFilters] = useState<{
        dateFrom: string
        dateTo: string
        size: string
        industry: string
        location: string
        sourceChannel: 'all' | 'pre_lead' | 'direct'
    }>({
        dateFrom: '',
        dateTo: '',
        size: 'all',
        industry: 'all',
        location: 'all',
        sourceChannel: 'all'
    })
    const [loading, setLoading] = useState(true)
    const [forecastLoading, setForecastLoading] = useState(false)
    const [autoClosingMonth, setAutoClosingMonth] = useState(false)
    const [searchTerm, setSearchTerm] = useState('')
    const [sortBy, setSortBy] = useState('totalSales')
    const [genderFilter, setGenderFilter] = useState('all')
    const [ageRange, setAgeRange] = useState('all')
    const [analysisScope, setAnalysisScope] = useState<CorrelationScope>('team')
    const [correlationView, setCorrelationView] = useState<'important' | 'explorer'>('important')
    const [selectedPresetId, setSelectedPresetId] = useState<string>('team_prelead_sales')
    const [selectedUserId, setSelectedUserId] = useState<string>('all')
    const [xMetric, setXMetric] = useState<MetricKey>('avgPreLeadsPerDay')
    const [yMetric, setYMetric] = useState<MetricKey>('totalSales')
    const [strengthFilter, setStrengthFilter] = useState<'all' | 'strong' | 'moderate' | 'weak'>('all')
    const [directionFilter, setDirectionFilter] = useState<'all' | 'positive' | 'negative'>('all')
    const [error, setError] = useState<string | null>(null)
    const currentView = (forcedView || searchParams.get('view') || 'general').toLowerCase()
    const showGraphView = currentView === 'grafica'
    const showForecastView = currentView === 'pronostico'
    const showGeneralView = !showGraphView && !showForecastView

    useEffect(() => {
        if (!auth.loading && !auth.loggedIn) {
            router.push('/home')
            return
        }
        if (auth.profile && auth.profile.role !== 'admin') {
            router.push('/home')
            return
        }

        fetchData()
    }, [auth.loading, auth.loggedIn, auth.profile, router])

    useEffect(() => {
        const runAutomaticMonthlyClose = async () => {
            if (!auth.profile || auth.profile.role !== 'admin') return

            const now = new Date()
            const currentDay = now.getDate()
            const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
            if (currentDay !== lastDayOfMonth) return

            const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
            const storageKey = `ah:auto-close-month:${monthKey}`
            if (typeof window !== 'undefined' && window.localStorage.getItem(storageKey) === 'done') return

            setAutoClosingMonth(true)
            const res = await syncRaceResults()
            if (res.success) {
                await fetchData()
                if (typeof window !== 'undefined') window.localStorage.setItem(storageKey, 'done')
            } else {
                console.error('Automatic monthly close failed:', res.error)
            }
            setAutoClosingMonth(false)
        }

        runAutomaticMonthlyClose()
    }, [auth.profile])

    async function fetchData() {
        setLoading(true)
        setError(null)
        try {
            const [corrRes, raceRes, forecastRes] = await Promise.all([
                getAdminCorrelationData(),
                getPastRaces(),
                getAdminCommercialForecast()
            ])

            if (corrRes.success && corrRes.data) {
                // Backward compatible parsing
                if (Array.isArray(corrRes.data)) {
                    setData(corrRes.data)
                    setCompanyRegistry([])
                    setLeadRows([])
                } else {
                    setData(corrRes.data.users || [])
                    setCompanyRegistry(corrRes.data.companyRegistry || [])
                    setLeadRows(corrRes.data.leadAnalyticsRows || [])
                }
            } else {
                setError(corrRes.error || 'Error al cargar correlaciones')
            }

            if (raceRes.success && raceRes.data) {
                setPastRaces(raceRes.data)
            }

            if (forecastRes.success && forecastRes.data) {
                setForecastData(forecastRes.data)
                setForecastOptions(forecastRes.data.options || { sizes: [], industries: [], locations: [] })
            }
        } catch (err: any) {
            setError(err.message || 'Error inesperado')
        }
        setLoading(false)
    }

    const fetchForecast = async () => {
        setForecastLoading(true)
        try {
            const res = await getAdminCommercialForecast(forecastFilters)
            if (res.success && res.data) {
                setForecastData(res.data)
                setForecastOptions(res.data.options || { sizes: [], industries: [], locations: [] })
            } else {
                setError(res.error || 'No se pudo calcular el pronóstico')
            }
        } catch (err: any) {
            setError(err.message || 'Error recalculando pronósticos')
        }
        setForecastLoading(false)
    }

    useEffect(() => {
        const preset = QUICK_PRESETS.find((item) => item.id === selectedPresetId)
        if (!preset) return
        setAnalysisScope(preset.scope)
        setXMetric(preset.x)
        setYMetric(preset.y)
    }, [selectedPresetId])

    const scopeMetrics = useMemo(() => METRIC_CATALOG.filter((metric) => metric.scopes.includes(analysisScope)), [analysisScope])

    useEffect(() => {
        const keys = new Set(scopeMetrics.map((metric) => metric.key))
        if (!keys.has(xMetric)) setXMetric(scopeMetrics[0]?.key || 'totalSales')
        if (!keys.has(yMetric)) setYMetric(scopeMetrics[1]?.key || scopeMetrics[0]?.key || 'totalSales')
    }, [scopeMetrics, xMetric, yMetric])

    const filteredData = useMemo(() => {
        let result = data.filter(item =>
            item.name.toLowerCase().includes(searchTerm.toLowerCase())
        )

        if (genderFilter !== 'all') {
            result = result.filter(item => item.gender === genderFilter)
        }

        if (ageRange !== 'all') {
            if (ageRange === '30-') result = result.filter(item => item.age && item.age < 30)
            if (ageRange === '30-45') result = result.filter(item => item.age && item.age >= 30 && item.age <= 45)
            if (ageRange === '45+') result = result.filter(item => item.age && item.age > 45)
        }

        result.sort((a, b) => {
            if (sortBy === 'totalSales') return b.totalSales - a.totalSales
            if (sortBy === 'totalMedals') return b.totalMedals - a.totalMedals
            if (sortBy === 'gold') return b.medals.gold - a.medals.gold
            if (sortBy === 'silver') return b.medals.silver - a.medals.silver
            if (sortBy === 'bronze') return b.medals.bronze - a.medals.bronze
            if (sortBy === 'preLeadsDay') return b.avgPreLeadsPerDay - a.avgPreLeadsPerDay
            if (sortBy === 'convertedMonth') return b.avgConvertedPreLeadsPerMonth - a.avgConvertedPreLeadsPerMonth
            if (sortBy === 'companyMonth') return b.avgCompaniesPerMonth - a.avgCompaniesPerMonth
            if (sortBy === 'tenure') return b.tenureMonths - a.tenureMonths
            if (sortBy === 'age') return (b.age || 0) - (a.age || 0)
            if (sortBy === 'growth') return b.growth - a.growth
            if (sortBy === 'efficiency') return b.medalRatio - a.medalRatio
            if (sortBy === 'meetings') return a.meetingsPerClose - b.meetingsPerClose // Lower is better
            if (sortBy === 'accuracy') return b.forecastAccuracy - a.forecastAccuracy
            if (sortBy === 'speed') return a.avgResponseTimeHours - b.avgResponseTimeHours // Lower is better
            return 0
        })

        return result
    }, [data, searchTerm, sortBy, genderFilter, ageRange])

    const risingStars = useMemo(() => {
        // Sellers with < 6 months tenure but high medal ratio
        return data
            .filter(d => d.tenureMonths <= 6 && d.medalRatio > 0)
            .sort((a, b) => b.medalRatio - a.medalRatio)
            .slice(0, 3)
    }, [data])

    const userOptions = useMemo(() => {
        return data
            .map((row) => ({ id: row.userId, name: row.name }))
            .sort((a, b) => a.name.localeCompare(b.name))
    }, [data])

    const correlationRows = useMemo(() => {
        if (analysisScope === 'team') return filteredData
        if (selectedUserId === 'all') return leadRows
        return leadRows.filter((row) => row.ownerId === selectedUserId)
    }, [analysisScope, filteredData, leadRows, selectedUserId])

    const correlationCombinations = useMemo(() => {
        const metrics = scopeMetrics
        const combos: Array<{ x: MetricKey, y: MetricKey, r: number, n: number }> = []
        for (let i = 0; i < metrics.length; i++) {
            for (let j = i + 1; j < metrics.length; j++) {
                const x = metrics[i].key
                const y = metrics[j].key
                const { r, n } = pearsonCorrelation(correlationRows, x, y)
                if (r !== null) combos.push({ x, y, r, n })
            }
        }
        return combos
            .filter((combo) => combo.n >= (analysisScope === 'team' ? 4 : 8))
            .sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
    }, [scopeMetrics, correlationRows, analysisScope])

    const filteredCorrelationCombinations = useMemo(() => {
        return correlationCombinations.filter((combo) => {
            const abs = Math.abs(combo.r)
            if (strengthFilter === 'strong' && abs < 0.6) return false
            if (strengthFilter === 'moderate' && (abs < 0.3 || abs >= 0.6)) return false
            if (strengthFilter === 'weak' && abs >= 0.3) return false
            if (directionFilter === 'positive' && combo.r <= 0) return false
            if (directionFilter === 'negative' && combo.r >= 0) return false
            return true
        })
    }, [correlationCombinations, strengthFilter, directionFilter])

    const importantCorrelations = useMemo(() => {
        return correlationCombinations
            .filter((combo) => Math.abs(combo.r) >= 0.5)
            .slice(0, 8)
            .map((combo) => ({
                ...combo,
                strengthLabel: getStrengthLabel(combo.r),
                recommendation: buildRecommendation(combo.x, combo.y, combo.r)
            }))
    }, [correlationCombinations])

    const activeCorrelation = useMemo(() => {
        const selected = pearsonCorrelation(correlationRows, xMetric, yMetric)
        return {
            r: selected.r,
            n: selected.n,
            xLabel: metricLabelByKey[xMetric],
            yLabel: metricLabelByKey[yMetric],
            strengthLabel: selected.r !== null ? getStrengthLabel(selected.r) : 'N/A',
            recommendation: selected.r !== null ? buildRecommendation(xMetric, yMetric, selected.r) : 'No hay suficientes datos para recomendar.'
        }
    }, [correlationRows, xMetric, yMetric])

    const scatterPoints = useMemo(() => {
        return correlationRows
            .map((row, idx) => {
                const x = getMetricValue(row, xMetric)
                const y = getMetricValue(row, yMetric)
                if (x === null || y === null) return null
                return {
                    pointId: String(row.userId || row.leadId || idx),
                    name: row.name || row.ownerName || `Lead ${row.leadId}`,
                    gender: row.gender || 'N/A',
                    x,
                    y
                }
            })
            .filter((item): item is { pointId: string, name: string, gender: string, x: number, y: number } => !!item)
    }, [correlationRows, xMetric, yMetric])

    // Analysis Logic
    const insights = useMemo(() => {
        if (data.length === 0) return []

        const byGender = {
            Male: data.filter(d => d.gender === 'Masculino'),
            Female: data.filter(d => d.gender === 'Femenino'),
            Other: data.filter(d => d.gender !== 'Masculino' && d.gender !== 'Femenino')
        }

        const avgTenureMale = byGender.Male.length ? byGender.Male.reduce((acc, d) => acc + d.tenureMonths, 0) / byGender.Male.length : 0
        const avgTenureFemale = byGender.Female.length ? byGender.Female.reduce((acc, d) => acc + d.tenureMonths, 0) / byGender.Female.length : 0

        const youngSellers = data.filter(d => d.age && d.age < 30)
        const seniorSellers = data.filter(d => d.age && d.age >= 30)

        const avgGrowthYoung = youngSellers.length ? youngSellers.reduce((acc, d) => acc + d.growth, 0) / youngSellers.length : 0
        const avgGrowthSenior = seniorSellers.length ? seniorSellers.reduce((acc, d) => acc + d.growth, 0) / seniorSellers.length : 0

        const topSellers = [...data].sort((a, b) => b.medalScore - a.medalScore)
        const dominantSeller = topSellers[0]
        const totalMedals = data.reduce((acc, d) => acc + d.totalMedals, 0)

        const avgMeetingsPerClose = data.reduce((acc, d) => acc + d.meetingsPerClose, 0) / (data.length || 1)
        const avgForecastAccuracy = data.reduce((acc, d) => acc + d.forecastAccuracy, 0) / (data.length || 1)
        const avgResponseTime = data.reduce((acc, d) => acc + d.avgResponseTimeHours, 0) / (data.length || 1)
        const avgPreLeadsPerDayTeam = data.reduce((acc, d) => acc + (d.avgPreLeadsPerDay || 0), 0) / (data.length || 1)
        const avgConvertedPerMonthTeam = data.reduce((acc, d) => acc + (d.avgConvertedPreLeadsPerMonth || 0), 0) / (data.length || 1)
        const avgConversionLagTeam = data.reduce((acc, d) => acc + (d.avgConversionLagDays || 0), 0) / (data.length || 1)

        // Industry aggregate
        const indMap: Record<string, number> = {}
        data.forEach(d => { if (d.topIndustry !== 'N/A') indMap[d.topIndustry] = (indMap[d.topIndustry] || 0) + 1 })
        const topOverallIndustry = Object.entries(indMap).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A'

        return [
            {
                title: 'Esfuerzo vs Éxito',
                desc: `El promedio del equipo es de ${avgMeetingsPerClose.toFixed(1)} reuniones por cada cierre ganado.`,
                icon: Zap,
                color: 'amber'
            },
            {
                title: 'Alineación de Expectativa',
                desc: `Precisión promedio del forecast: ${avgForecastAccuracy.toFixed(1)}%. Los cierres coinciden con el optimismo inicial.`,
                icon: BarChart3,
                color: 'indigo'
            },
            {
                title: 'Dominancia por Industria',
                desc: `La industria "${topOverallIndustry}" es donde más sellers están encontrando éxito de cierre.`,
                icon: Building2,
                color: 'rose'
            },
            {
                title: 'Velocidad de Respuesta',
                desc: `Tiempo promedio al primer contacto: ${avgResponseTime.toFixed(1)} horas desde el registro del lead.`,
                icon: Timer,
                color: 'emerald'
            },
            {
                title: 'Dominancia y Consistencia',
                desc: dominantSeller && totalMedals > 0
                    ? `${dominantSeller.name} lidera con ${dominantSeller.medals.gold} oros y una eficiencia de ${dominantSeller.medalRatio.toFixed(2)}.`
                    : 'Aún no hay suficientes datos para determinar dominancia.',
                icon: Trophy,
                color: 'yellow'
            },
            {
                title: 'Impacto Modalidad',
                desc: `Casi el ${(data.reduce((acc, d) => acc + d.physicalCloseRate, 0) / (data.length || 1)).toFixed(1)}% de cierres exitosos tuvieron presencia física.`,
                icon: MapPin,
                color: 'blue'
            },
            {
                title: 'Cadencia de Prospección',
                desc: `El equipo registra en promedio ${avgPreLeadsPerDayTeam.toFixed(2)} pre-leads por día por vendedor.`,
                icon: Calendar,
                color: 'purple'
            },
            {
                title: 'Conversión Operativa',
                desc: `Promedio de ${avgConvertedPerMonthTeam.toFixed(2)} conversiones de pre-lead a lead por mes por vendedor.`,
                icon: CheckCircle,
                color: 'emerald'
            },
            {
                title: 'Velocidad de Conversión',
                desc: `Tiempo promedio de conversión pre-lead → lead: ${avgConversionLagTeam.toFixed(1)} días.`,
                icon: Hash,
                color: 'amber'
            }
        ]
    }, [data])

    const forecastSegmentRows = useMemo(() => {
        if (!forecastData) return []
        const byIndustry = (forecastData.projectsForecast?.byIndustry || []).slice(0, 4).map((row: any) => ({
            segment: `Industria: ${row.label}`,
            avgProjects: row.avgProjects || 0,
            postponeProb: (forecastData.postponementForecast?.byIndustry || []).find((item: any) => item.label === row.label)?.probability || 0
        }))
        const bySize = (forecastData.projectsForecast?.bySize || []).slice(0, 4).map((row: any) => ({
            segment: `Tamaño: ${row.label}`,
            avgProjects: row.avgProjects || 0,
            postponeProb: (forecastData.postponementForecast?.bySize || []).find((item: any) => item.label === row.label)?.probability || 0
        }))
        return [...byIndustry, ...bySize].slice(0, 8)
    }, [forecastData])

    if (loading || auth.loading) {
        return (
            <div className='h-full flex items-center justify-center' style={{ background: 'transparent' }}>
                <div className='flex flex-col items-center gap-4'>
                    <div className='w-12 h-12 border-4 border-[#2048FF] border-t-transparent rounded-full animate-spin' />
                    <p className='font-bold' style={{ color: 'var(--text-secondary)' }}>Analizando correlaciones maestras...</p>
                </div>
            </div>
        )
    }

    return (
        <div className='h-full flex flex-col overflow-hidden' style={{ background: 'transparent' }}>
            <div className='flex-1 overflow-y-auto p-8 custom-scrollbar'>
                <div className='max-w-7xl mx-auto flex flex-col gap-10'>

                    {/* Header */}
                    <div className='order-1 flex flex-col md:flex-row md:items-center justify-between gap-6'>
                        <div className='flex items-center gap-6'>
                            <div
                                className='w-16 h-16 rounded-[22px] border shadow-lg flex items-center justify-center shrink-0 ah-window-title-icon-shell'
                            >
                                <BarChart3 size={34} strokeWidth={1.9} className='ah-window-title-icon' />
                            </div>
                            <div>
                            <h1 className='text-4xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>Data & Correlaciones</h1>
                            <p className='font-medium' style={{ color: 'var(--text-secondary)' }}>Análisis profundo de desempeño vs demografía de vendedores.</p>
                            </div>
                        </div>
                        <div className='flex items-center gap-4 p-2 rounded-2xl shadow-sm border' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                            <div className='px-4 py-2 bg-blue-50/10 text-[#2048FF] rounded-xl font-black text-xs uppercase tracking-widest border border-blue-100/20'>
                                Modo Admin
                            </div>
                            <div className='px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-wider border'
                                style={{
                                    color: 'var(--text-secondary)',
                                    borderColor: 'var(--card-border)',
                                    background: 'var(--background)'
                                }}
                            >
                                {autoClosingMonth ? 'Cierre mensual automático en proceso...' : 'Cierre mensual automático activo'}
                            </div>
                        </div>
                    </div>

                    {/* Error Alert */}
                    <div className='order-2'>
                        <AnimatePresence>
                            {error && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className='p-6 bg-red-50 border-2 border-red-100 rounded-[32px] flex items-center gap-4 text-red-700'
                                >
                                    <div className='w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-red-500 shadow-sm'>
                                        ⚠️
                                    </div>
                                    <div>
                                        <p className='font-black text-sm uppercase tracking-widest'>Error de Carga</p>
                                        <p className='font-bold text-xs opacity-80'>{error}</p>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Insights Grid */}
                    {showGeneralView && (
                    <div className='order-3 rounded-[36px] border shadow-xl overflow-hidden' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                        <div className='p-8 border-b flex items-center gap-4' style={{ borderColor: 'var(--card-border)' }}>
                            <div className='w-12 h-12 rounded-2xl flex items-center justify-center' style={{ background: 'var(--background)', color: 'var(--text-secondary)' }}>
                                <Users size={24} />
                            </div>
                            <div>
                                <h2 className='text-2xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>Insights Estratégicos</h2>
                                <p className='text-xs font-bold uppercase tracking-widest' style={{ color: 'var(--text-secondary)' }}>Información clave del desempeño histórico</p>
                            </div>
                        </div>
                        <div className='p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
                            {insights.map((insight, idx) => (
                                <motion.div
                                    key={idx}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.1 }}
                                    className='p-8 rounded-[32px] border shadow-sm relative overflow-hidden group'
                                    style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
                                >
                                    <div className={`absolute top-0 right-0 w-32 h-32 opacity-10 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110`} style={{ background: `var(--${insight.color}-500, #2048FF)` }} />
                                    <div className='relative z-10 flex items-start gap-6'>
                                        <div className='w-14 h-14 rounded-2xl flex items-center justify-center' style={{ background: 'var(--background)', color: `var(--${insight.color}-500, #2048FF)` }}>
                                            <insight.icon size={28} />
                                        </div>
                                        <div className='space-y-2'>
                                            <h3 className='font-black text-lg' style={{ color: 'var(--text-primary)' }}>{insight.title}</h3>
                                            <p className='font-medium leading-relaxed text-sm opacity-80' style={{ color: 'var(--text-secondary)' }}>{insight.desc}</p>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                    )}

                    {/* Commercial Forecasts */}
                    {showForecastView && (
                    <div className='order-5 rounded-[36px] border shadow-xl overflow-hidden' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                        <div className='p-8 border-b space-y-5' style={{ borderColor: 'var(--card-border)' }}>
                            <div className='flex flex-col md:flex-row md:items-center justify-between gap-4'>
                                <div className='flex items-center gap-4'>
                                    <div className='w-12 h-12 rounded-2xl flex items-center justify-center' style={{ background: 'var(--background)', color: 'var(--text-secondary)' }}>
                                        <Timer size={24} />
                                    </div>
                                    <div>
                                    <h2 className='text-2xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>Pronósticos Comerciales</h2>
                                    <p className='text-xs font-bold uppercase tracking-widest' style={{ color: 'var(--text-secondary)' }}>
                                        Basado en historial real de juntas, cierres y proyectos
                                    </p>
                                    </div>
                                </div>
                                <button
                                    onClick={fetchForecast}
                                    disabled={forecastLoading}
                                    className='px-5 py-2.5 rounded-2xl bg-[#2048FF] text-white font-black text-[10px] uppercase tracking-widest shadow-lg shadow-blue-500/20 disabled:opacity-50'
                                >
                                    {forecastLoading ? 'Recalculando...' : 'Recalcular Pronóstico'}
                                </button>
                            </div>

                            <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3'>
                                <select
                                    value={forecastFilters.size}
                                    onChange={(e) => setForecastFilters((prev) => ({ ...prev, size: e.target.value }))}
                                    className='ah-select-control'
                                >
                                    <option value='all'>Tamaño: Todos</option>
                                    {forecastOptions.sizes.map((size: any) => <option key={String(size)} value={String(size)}>{`Tamaño ${size}`}</option>)}
                                </select>
                                <select
                                    value={forecastFilters.industry}
                                    onChange={(e) => setForecastFilters((prev) => ({ ...prev, industry: e.target.value }))}
                                    className='ah-select-control'
                                >
                                    <option value='all'>Industria: Todas</option>
                                    {forecastOptions.industries.map((industry: any) => <option key={String(industry)} value={String(industry)}>{String(industry)}</option>)}
                                </select>
                                <select
                                    value={forecastFilters.location}
                                    onChange={(e) => setForecastFilters((prev) => ({ ...prev, location: e.target.value }))}
                                    className='ah-select-control'
                                >
                                    <option value='all'>Ubicación: Todas</option>
                                    {forecastOptions.locations.map((location: any) => <option key={String(location)} value={String(location)}>{String(location)}</option>)}
                                </select>
                                <select
                                    value={forecastFilters.sourceChannel}
                                    onChange={(e) => setForecastFilters((prev) => ({ ...prev, sourceChannel: e.target.value as 'all' | 'pre_lead' | 'direct' }))}
                                    className='ah-select-control'
                                >
                                    <option value='all'>Canal: Todos</option>
                                    <option value='pre_lead'>Canal: Pre-Lead</option>
                                    <option value='direct'>Canal: Directo</option>
                                </select>
                            </div>

                            <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                                <input
                                    type='date'
                                    value={forecastFilters.dateFrom}
                                    onChange={(e) => setForecastFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
                                    className='ah-search-input'
                                />
                                <input
                                    type='date'
                                    value={forecastFilters.dateTo}
                                    onChange={(e) => setForecastFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
                                    className='ah-search-input'
                                />
                            </div>
                        </div>

                        {!forecastData ? (
                            <div className='p-8 text-center font-bold text-sm' style={{ color: 'var(--text-secondary)' }}>
                                Aún no hay datos de pronóstico disponibles.
                            </div>
                        ) : (
                            <div className='p-8 space-y-6'>
                                <div className='grid grid-cols-1 lg:grid-cols-3 gap-4'>
                                    <div className='rounded-2xl border p-5' style={{ borderColor: 'var(--card-border)', background: 'var(--background)' }}>
                                        <p className='text-[10px] uppercase tracking-widest font-black' style={{ color: 'var(--text-secondary)' }}>Juntas para Cerrar</p>
                                        <p className='text-3xl font-black mt-2' style={{ color: 'var(--text-primary)' }}>{(forecastData.meetingsToCloseForecast?.averageMeetings || 0).toFixed(2)}</p>
                                        <p className='text-xs font-bold mt-1' style={{ color: 'var(--text-secondary)' }}>
                                            Rango: {Number(forecastData.meetingsToCloseForecast?.p25 || 0).toFixed(1)} - {Number(forecastData.meetingsToCloseForecast?.p75 || 0).toFixed(1)} · n={forecastData.meetingsToCloseForecast?.sampleSize || 0}
                                        </p>
                                        <p className='text-[11px] font-black mt-2 uppercase tracking-wider' style={{ color: forecastData.meetingsToCloseForecast?.insufficientSample ? '#f59e0b' : '#10b981' }}>
                                            Confianza: {forecastData.meetingsToCloseForecast?.confidence || 'N/A'}
                                        </p>
                                    </div>

                                    <div className='rounded-2xl border p-5' style={{ borderColor: 'var(--card-border)', background: 'var(--background)' }}>
                                        <p className='text-[10px] uppercase tracking-widest font-black' style={{ color: 'var(--text-secondary)' }}>Prob. Posponer Junta</p>
                                        <p className='text-3xl font-black mt-2' style={{ color: 'var(--text-primary)' }}>
                                            {((forecastData.postponementForecast?.globalProbability || 0) * 100).toFixed(1)}%
                                        </p>
                                        <p className='text-xs font-bold mt-1' style={{ color: 'var(--text-secondary)' }}>
                                            Reagendadas: {forecastData.postponementForecast?.rescheduledMeetings || 0} / {forecastData.postponementForecast?.sampleSize || 0}
                                        </p>
                                        <p className='text-[11px] font-black mt-2 uppercase tracking-wider' style={{ color: forecastData.postponementForecast?.insufficientSample ? '#f59e0b' : '#10b981' }}>
                                            Confianza: {forecastData.postponementForecast?.confidence || 'N/A'}
                                        </p>
                                    </div>

                                    <div className='rounded-2xl border p-5' style={{ borderColor: 'var(--card-border)', background: 'var(--background)' }}>
                                        <p className='text-[10px] uppercase tracking-widest font-black' style={{ color: 'var(--text-secondary)' }}>Proyectos por Nueva Empresa</p>
                                        <p className='text-3xl font-black mt-2' style={{ color: 'var(--text-primary)' }}>
                                            {(forecastData.projectsForecast?.avgProjectsPerNewCompany || 0).toFixed(2)}
                                        </p>
                                        <p className='text-xs font-bold mt-1' style={{ color: 'var(--text-secondary)' }}>
                                            P(0): {((forecastData.projectsForecast?.distribution?.p0 || 0) * 100).toFixed(0)}% · P(1): {((forecastData.projectsForecast?.distribution?.p1 || 0) * 100).toFixed(0)}% · P(2+): {((forecastData.projectsForecast?.distribution?.p2plus || 0) * 100).toFixed(0)}%
                                        </p>
                                        <p className='text-[11px] font-black mt-2 uppercase tracking-wider' style={{ color: forecastData.projectsForecast?.insufficientSample ? '#f59e0b' : '#10b981' }}>
                                            Confianza: {forecastData.projectsForecast?.confidence || 'N/A'} · n={forecastData.projectsForecast?.sampleSizeCompanies || 0}
                                        </p>
                                    </div>
                                </div>

                                <div className='rounded-2xl border overflow-hidden' style={{ borderColor: 'var(--card-border)' }}>
                                    <div className='px-6 py-4 border-b' style={{ borderColor: 'var(--card-border)', background: 'var(--background)' }}>
                                        <p className='text-[10px] uppercase tracking-widest font-black' style={{ color: 'var(--text-secondary)' }}>
                                            Segmentos sugeridos para decisión
                                        </p>
                                    </div>
                                    <div className='overflow-x-auto'>
                                        <table className='w-full text-left border-collapse'>
                                            <thead>
                                                <tr className='uppercase text-[10px] font-black tracking-[0.16em]' style={{ color: 'var(--text-secondary)' }}>
                                                    <th className='px-6 py-3'>Segmento</th>
                                                    <th className='px-6 py-3'>Avg Proyectos</th>
                                                    <th className='px-6 py-3'>Prob. Posponer</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {forecastSegmentRows.map((row: any, idx: number) => (
                                                    <tr key={`${row.segment}-${idx}`} className='border-t' style={{ borderColor: 'var(--card-border)' }}>
                                                        <td className='px-6 py-4 font-black text-sm' style={{ color: 'var(--text-primary)' }}>{row.segment}</td>
                                                        <td className='px-6 py-4 font-bold text-sm' style={{ color: 'var(--text-secondary)' }}>{Number(row.avgProjects || 0).toFixed(2)}</td>
                                                        <td className='px-6 py-4 font-bold text-sm' style={{ color: 'var(--text-secondary)' }}>{(Number(row.postponeProb || 0) * 100).toFixed(1)}%</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    {forecastSegmentRows.length === 0 && (
                                        <div className='p-6 text-center font-bold text-sm' style={{ color: 'var(--text-secondary)' }}>
                                            Muestra insuficiente para desglosar segmentos con estos filtros.
                                        </div>
                                    )}
                                </div>

                                <div className='rounded-2xl border p-5' style={{ borderColor: 'var(--card-border)', background: 'var(--background)' }}>
                                    <p className='text-[10px] uppercase tracking-widest font-black mb-3' style={{ color: 'var(--text-secondary)' }}>
                                        Top factores asociados a aplazamiento
                                    </p>
                                    <div className='space-y-2'>
                                        {(forecastData.postponementForecast?.topFactors || []).slice(0, 6).map((factor: any, idx: number) => (
                                            <div key={`${factor.dimension}-${factor.label}-${idx}`} className='flex items-center justify-between rounded-xl border px-4 py-3' style={{ borderColor: 'var(--card-border)' }}>
                                                <div>
                                                    <p className='font-black text-sm' style={{ color: 'var(--text-primary)' }}>{factor.dimension}: {factor.label}</p>
                                                    <p className='text-[10px] font-bold uppercase tracking-widest' style={{ color: 'var(--text-secondary)' }}>n={factor.n}</p>
                                                </div>
                                                <div className='text-right'>
                                                    <p className='font-black text-sm' style={{ color: factor.liftVsGlobal >= 0 ? '#ef4444' : '#10b981' }}>
                                                        {factor.liftVsGlobal >= 0 ? '+' : ''}{(factor.liftVsGlobal * 100).toFixed(1)} pts
                                                    </p>
                                                    <p className='text-[10px] font-bold uppercase tracking-widest' style={{ color: 'var(--text-secondary)' }}>
                                                        {(factor.probability * 100).toFixed(1)}%
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    {(forecastData.postponementForecast?.topFactors || []).length === 0 && (
                                        <p className='font-bold text-sm' style={{ color: 'var(--text-secondary)' }}>
                                            No hay suficientes segmentos con muestra mínima para detectar factores sólidos.
                                        </p>
                                    )}
                                </div>

                                {(forecastData.meetingsToCloseForecast?.insufficientSample || forecastData.postponementForecast?.insufficientSample || forecastData.projectsForecast?.insufficientSample) && (
                                    <div className='rounded-2xl border p-4 text-sm font-bold' style={{ borderColor: 'rgba(245, 158, 11, 0.35)', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.08)' }}>
                                        Insuficiente muestra en uno o más pronósticos. Amplía rango de fechas o reduce filtros para mejorar confiabilidad.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    )}

                    {/* Correlation Explorer */}
                    {showGraphView && (
                    <div className='order-4 rounded-[36px] border shadow-xl overflow-hidden' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                        <div className='p-8 border-b space-y-5' style={{ borderColor: 'var(--card-border)' }}>
                            <div className='flex flex-col lg:flex-row lg:items-center justify-between gap-4'>
                                <div className='flex items-center gap-4'>
                                    <div className='w-12 h-12 rounded-2xl flex items-center justify-center' style={{ background: 'var(--background)', color: 'var(--text-secondary)' }}>
                                        <TrendingUp size={24} />
                                    </div>
                                    <div>
                                        <h2 className='text-2xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>Correlation Explorer</h2>
                                        <p className='text-xs font-bold uppercase tracking-widest' style={{ color: 'var(--text-secondary)' }}>
                                            {filteredCorrelationCombinations.length} combinaciones válidas de {correlationCombinations.length} posibles
                                        </p>
                                    </div>
                                </div>
                                <div className='flex items-center gap-2'>
                                    <button
                                        onClick={() => setCorrelationView('important')}
                                        className={`ah-toggle-pill ${correlationView === 'important' ? 'ah-toggle-pill--active' : ''}`}
                                    >
                                        Importantes
                                    </button>
                                    <button
                                        onClick={() => setCorrelationView('explorer')}
                                        className={`ah-toggle-pill ${correlationView === 'explorer' ? 'ah-toggle-pill--active' : ''}`}
                                    >
                                        Explorador
                                    </button>
                                </div>
                            </div>

                            <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3'>
                                <select
                                    value={selectedPresetId}
                                    onChange={(e) => setSelectedPresetId(e.target.value)}
                                    className='ah-select-control'
                                >
                                    {QUICK_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>Preset: {preset.label}</option>)}
                                </select>

                                <select
                                    value={analysisScope}
                                    onChange={(e) => setAnalysisScope(e.target.value as CorrelationScope)}
                                    className='ah-select-control'
                                >
                                    <option value='team'>Modo: Correlación Equipo</option>
                                    <option value='individual'>Modo: Correlación Individual (por usuario)</option>
                                </select>

                                {analysisScope === 'individual' && (
                                    <select
                                        value={selectedUserId}
                                        onChange={(e) => setSelectedUserId(e.target.value)}
                                        className='ah-select-control'
                                    >
                                        <option value='all'>Usuario: Todos</option>
                                        {userOptions.map((opt) => <option key={opt.id} value={opt.id}>{opt.name}</option>)}
                                    </select>
                                )}
                            </div>

                            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3'>
                                <select
                                    value={xMetric}
                                    onChange={(e) => setXMetric(e.target.value as MetricKey)}
                                    className='ah-select-control'
                                >
                                    {Array.from(new Set(scopeMetrics.map((metric) => metric.group))).map((group) => (
                                        <optgroup key={group} label={group}>
                                            {scopeMetrics.filter((metric) => metric.group === group).map((metric) => (
                                                <option key={metric.key} value={metric.key}>Eje X: {metric.label}</option>
                                            ))}
                                        </optgroup>
                                    ))}
                                </select>
                                <select
                                    value={yMetric}
                                    onChange={(e) => setYMetric(e.target.value as MetricKey)}
                                    className='ah-select-control'
                                >
                                    {Array.from(new Set(scopeMetrics.map((metric) => metric.group))).map((group) => (
                                        <optgroup key={group} label={group}>
                                            {scopeMetrics.filter((metric) => metric.group === group).map((metric) => (
                                                <option key={metric.key} value={metric.key}>Eje Y: {metric.label}</option>
                                            ))}
                                        </optgroup>
                                    ))}
                                </select>
                                <select
                                    value={strengthFilter}
                                    onChange={(e) => setStrengthFilter(e.target.value as 'all' | 'strong' | 'moderate' | 'weak')}
                                    className='ah-select-control'
                                >
                                    <option value='all'>Fuerza: Todas</option>
                                    <option value='strong'>Fuerza: Fuerte (|r| ≥ 0.60)</option>
                                    <option value='moderate'>Fuerza: Moderada (0.30 - 0.59)</option>
                                    <option value='weak'>Fuerza: Débil (&lt; 0.30)</option>
                                </select>
                                <select
                                    value={directionFilter}
                                    onChange={(e) => setDirectionFilter(e.target.value as 'all' | 'positive' | 'negative')}
                                    className='ah-select-control'
                                >
                                    <option value='all'>Dirección: Todas</option>
                                    <option value='positive'>Dirección: Positiva</option>
                                    <option value='negative'>Dirección: Negativa</option>
                                </select>
                            </div>
                        </div>

                        <div className='grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-0'>
                            <div className='p-8 border-r' style={{ borderColor: 'var(--card-border)' }}>
                                <div className='mb-5 flex items-center justify-between'>
                                    <div>
                                        <p className='text-[10px] font-black uppercase tracking-[0.18em]' style={{ color: 'var(--text-secondary)' }}>Scatter</p>
                                        <h3 className='font-black text-lg' style={{ color: 'var(--text-primary)' }}>{activeCorrelation.xLabel} vs {activeCorrelation.yLabel}</h3>
                                    </div>
                                    <div className='text-right'>
                                        <p className='text-[10px] font-black uppercase tracking-[0.15em]' style={{ color: 'var(--text-secondary)' }}>Correlación</p>
                                        <p className='font-black text-xl' style={{ color: activeCorrelation.r !== null && activeCorrelation.r >= 0 ? '#10b981' : '#ef4444' }}>
                                            {activeCorrelation.r !== null ? activeCorrelation.r.toFixed(3) : 'N/A'}
                                        </p>
                                        <p className='text-[10px] font-bold uppercase tracking-widest' style={{ color: 'var(--text-secondary)' }}>
                                            {activeCorrelation.strengthLabel} · n={activeCorrelation.n}
                                        </p>
                                    </div>
                                </div>

                                <div className='rounded-[24px] border p-4 mb-4' style={{ borderColor: 'var(--card-border)', background: 'var(--background)' }}>
                                    {(() => {
                                        const chartW = 920
                                        const chartH = 430
                                        const padding = 54
                                        const xs = scatterPoints.map((p) => p.x)
                                        const ys = scatterPoints.map((p) => p.y)

                                        if (xs.length < 2 || ys.length < 2) {
                                            return (
                                                <div className='h-[430px] flex items-center justify-center'>
                                                    <p className='font-bold text-sm' style={{ color: 'var(--text-secondary)' }}>No hay suficientes datos para graficar esta combinación.</p>
                                                </div>
                                            )
                                        }

                                        const minX = Math.min(...xs)
                                        const maxX = Math.max(...xs)
                                        const minY = Math.min(...ys)
                                        const maxY = Math.max(...ys)
                                        const xRange = Math.max(1, maxX - minX)
                                        const yRange = Math.max(1, maxY - minY)

                                        const scaleX = (val: number) => padding + ((val - minX) / xRange) * (chartW - padding * 2)
                                        const scaleY = (val: number) => chartH - padding - ((val - minY) / yRange) * (chartH - padding * 2)

                                        return (
                                            <svg viewBox={`0 0 ${chartW} ${chartH}`} className='w-full h-[430px]'>
                                                <line x1={padding} y1={chartH - padding} x2={chartW - padding} y2={chartH - padding} stroke='rgba(148,163,184,0.45)' />
                                                <line x1={padding} y1={padding} x2={padding} y2={chartH - padding} stroke='rgba(148,163,184,0.45)' />

                                                {scatterPoints.map((point) => (
                                                    <g key={point.pointId}>
                                                        <circle
                                                            cx={scaleX(point.x)}
                                                            cy={scaleY(point.y)}
                                                            r={6.2}
                                                            fill={point.gender === 'Femenino' ? '#ec4899' : point.gender === 'Masculino' ? '#3b82f6' : '#14b8a6'}
                                                            opacity='0.9'
                                                        >
                                                            <title>{`${point.name} · X: ${point.x.toFixed(2)} · Y: ${point.y.toFixed(2)}`}</title>
                                                        </circle>
                                                    </g>
                                                ))}
                                            </svg>
                                        )
                                    })()}
                                </div>

                                <div className='rounded-2xl border p-4' style={{ borderColor: 'var(--card-border)', background: 'var(--background)' }}>
                                    <p className='text-[10px] font-black uppercase tracking-[0.15em] mb-2' style={{ color: 'var(--text-secondary)' }}>Interpretación</p>
                                    <p className='font-black text-sm mb-2' style={{ color: 'var(--text-primary)' }}>
                                        Relación {activeCorrelation.r !== null && activeCorrelation.r >= 0 ? 'positiva' : 'negativa'} {activeCorrelation.strengthLabel.toLowerCase()} entre {activeCorrelation.xLabel} y {activeCorrelation.yLabel}.
                                    </p>
                                    <p className='font-medium text-sm leading-relaxed' style={{ color: 'var(--text-secondary)' }}>
                                        Recomendación: {activeCorrelation.recommendation}
                                    </p>
                                </div>
                            </div>

                            <div className='p-8'>
                                <div className='mb-4'>
                                    <p className='text-[10px] font-black uppercase tracking-[0.18em]' style={{ color: 'var(--text-secondary)' }}>
                                        {correlationView === 'important' ? 'Detección automática' : 'Combinaciones filtradas'}
                                    </p>
                                    <h3 className='font-black text-lg' style={{ color: 'var(--text-primary)' }}>
                                        {correlationView === 'important' ? 'Correlaciones Importantes' : 'Matriz total de pares'}
                                    </h3>
                                </div>
                                <div className='max-h-[560px] overflow-y-auto custom-scrollbar pr-1 space-y-2'>
                                    {(correlationView === 'important' ? importantCorrelations : filteredCorrelationCombinations).map((combo: {
                                        x: MetricKey
                                        y: MetricKey
                                        r: number
                                        n: number
                                        strengthLabel?: string
                                        recommendation?: string
                                    }) => (
                                        <button
                                            key={`${combo.x}-${combo.y}`}
                                            onClick={() => { setXMetric(combo.x); setYMetric(combo.y) }}
                                            className='w-full text-left rounded-2xl border p-4 transition-all hover:scale-[1.01]'
                                            style={{ borderColor: 'var(--card-border)', background: 'var(--background)' }}
                                        >
                                            <p className='font-black text-sm leading-tight' style={{ color: 'var(--text-primary)' }}>
                                                {metricLabelByKey[combo.x]} <span style={{ color: 'var(--text-secondary)' }}>vs</span> {metricLabelByKey[combo.y]}
                                            </p>
                                            <div className='mt-1 flex items-center justify-between'>
                                                <span className='text-[10px] font-bold uppercase tracking-widest' style={{ color: 'var(--text-secondary)' }}>
                                                    n={combo.n} {combo.strengthLabel ? `· ${combo.strengthLabel}` : ''}
                                                </span>
                                                <span className='text-sm font-black' style={{ color: combo.r >= 0 ? '#10b981' : '#ef4444' }}>r={combo.r.toFixed(3)}</span>
                                            </div>
                                            {combo.recommendation && (
                                                <p className='mt-2 text-xs font-medium leading-relaxed' style={{ color: 'var(--text-secondary)' }}>
                                                    {combo.recommendation}
                                                </p>
                                            )}
                                        </button>
                                    ))}
                                    {(correlationView === 'important' ? importantCorrelations.length === 0 : filteredCorrelationCombinations.length === 0) && (
                                        <div className='rounded-2xl border p-6 text-center' style={{ borderColor: 'var(--card-border)', background: 'var(--background)', color: 'var(--text-secondary)' }}>
                                            No hay correlaciones disponibles con los filtros y muestra actual.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                    )}

                    {/* Rising Stars Section */}
                    {showGeneralView && risingStars.length > 0 && (
                        <div className="order-7 bg-gradient-to-r from-blue-600/10 to-purple-600/10 rounded-[32px] p-8 border border-blue-500/20">
                            <div className="flex items-center gap-4 mb-6">
                                <div className="p-3 bg-blue-500 rounded-2xl text-white shadow-lg shadow-blue-500/30">
                                    <ArrowUpRight size={24} />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black text-white">Rising Stars</h2>
                                    <p className="text-sm text-blue-200 font-bold uppercase tracking-wider">Nuevos talentos con mayor eficiencia de medallas</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {risingStars.map((star, idx) => (
                                    <div key={star.userId} className="bg-slate-900/40 rounded-2xl p-6 border border-white/5 backdrop-blur-sm">
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white">
                                                {star.name.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="font-bold text-white">{star.name}</p>
                                                <p className="text-xs text-slate-400">{star.tenureMonths} meses en AirHive</p>
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-end">
                                            <div>
                                                <p className="text-[10px] font-black text-blue-400 uppercase">Eficiencia</p>
                                                <p className="text-xl font-black text-white">{star.medalRatio.toFixed(2)}</p>
                                            </div>
                                            <div className="flex gap-1">
                                                {Array.from({ length: Math.min(3, Math.ceil(star.medalRatio)) }).map((_, i) => (
                                                    <Trophy key={i} size={14} className="text-yellow-500" />
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Master Table Section */}
                    {showGeneralView && (
                    <div className='order-4 rounded-[40px] shadow-xl border overflow-hidden flex flex-col' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                        <div className='p-8 border-b flex flex-col md:flex-row md:items-center justify-between gap-6' style={{ borderColor: 'var(--card-border)' }}>
                            <div className='flex items-center gap-4'>
                                <div className='w-12 h-12 rounded-2xl flex items-center justify-center' style={{ background: 'var(--background)', color: 'var(--text-secondary)' }}>
                                    <TableIcon size={24} />
                                </div>
                                <div>
                                    <h2 className='text-xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>Tabla Maestra de Sellers</h2>
                                    <p className='text-[10px] font-bold uppercase tracking-widest' style={{ color: 'var(--text-secondary)' }}>Filtra y correlaciona manualmente</p>
                                </div>
                            </div>

                            <div className='ah-table-controls'>
                                <div className='ah-search-control'>
                                    <Search className='ah-search-icon' size={18} />
                                    <input
                                        type='text'
                                        placeholder='Buscar seller...'
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className='ah-search-input'
                                    />
                                </div>

                                <select
                                    value={sortBy}
                                    onChange={(e) => setSortBy(e.target.value)}
                                    className='ah-select-control ah-select-control-order'
                                >
                                    <option value="totalSales">Ordenar por: Ventas</option>
                                    <option value="totalMedals">Ordenar por: Total Medallas</option>
                                    <option value="gold">Ordenar por: Oro</option>
                                    <option value="efficiency">Ordenar por: Eficiencia (Pts/Mes)</option>
                                    <option value="preLeadsDay">Ordenar por: Pre-Leads / Día</option>
                                    <option value="convertedMonth">Ordenar por: Conv. PreLead / Mes</option>
                                    <option value="companyMonth">Ordenar por: Empresas / Mes</option>
                                    <option value="meetings">Ordenar por: Effort (Mtg/Close)</option>
                                    <option value="accuracy">Ordenar por: Forecast Accuracy</option>
                                    <option value="speed">Ordenar por: Response Speed</option>
                                    <option value="tenure">Ordenar por: Antigüedad</option>
                                    <option value="growth">Ordenar por: Crecimiento</option>
                                </select>

                                <select
                                    value={genderFilter}
                                    onChange={(e) => setGenderFilter(e.target.value)}
                                    className='ah-select-control'
                                >
                                    <option value="all">Filtro: Todo Género</option>
                                    <option value="Masculino">Masculino</option>
                                    <option value="Femenino">Femenino</option>
                                </select>

                                <select
                                    value={ageRange}
                                    onChange={(e) => setAgeRange(e.target.value)}
                                    className='ah-select-control'
                                >
                                    <option value="all">Filtro: Toda Edad</option>
                                    <option value="30-">Menores de 30</option>
                                    <option value="30-45">30 a 45 años</option>
                                    <option value="45+">Mayores de 45</option>
                                </select>
                            </div>
                        </div>

                        <div className='ah-table-scroll custom-scrollbar'>
                            <table className='ah-table'>
                                <thead>
                                    <tr>
                                        <th className='px-8 py-5'>Vendedor</th>
                                        <th className='px-8 py-5'>Género</th>
                                        <th className='px-8 py-5'>Edad</th>
                                        <th className='px-8 py-5'>Antigüedad</th>
                                        <th className='px-8 py-5 text-center'>Pre-Leads</th>
                                        <th className='px-8 py-5 text-center'>% Conv</th>
                                        <th className='px-8 py-5 text-center'>Empresas</th>
                                        <th className='px-8 py-5'>Ventas Totales</th>
                                        <th className='px-8 py-5'>Crecimiento</th>
                                        <th className='px-8 py-5 text-center'>Medallas</th>
                                        <th className='px-8 py-5 text-center'>Effort (Mtg/C)</th>
                                        <th className='px-8 py-5 text-center'>Accuracy</th>
                                        <th className='px-8 py-5 text-center'>Top Ind.</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredData.map((item, idx) => (
                                        <tr key={item.userId} className='transition-colors group hover:bg-black/5'>
                                            <td className='px-8 py-5'>
                                                <div className='flex items-center gap-3'>
                                                    <div className='w-10 h-10 rounded-full bg-gradient-to-tr from-[#2048FF] to-[#8B5CF6] flex items-center justify-center text-white font-black text-sm shadow-md'>
                                                        {item.name.charAt(0)}
                                                    </div>
                                                    <p className='font-black text-sm' style={{ color: 'var(--text-primary)' }}>{item.name}</p>
                                                </div>
                                            </td>
                                            <td className='px-8 py-5'>
                                                <div className='flex items-center gap-2'>
                                                    {item.gender === 'Masculino' ? <Mars className='text-blue-500' size={16} /> : <Venus className='text-pink-500' size={16} />}
                                                    <span className='font-bold text-sm' style={{ color: 'var(--text-secondary)' }}>{item.gender}</span>
                                                </div>
                                            </td>
                                            <td className='px-8 py-5 font-black text-sm' style={{ color: 'var(--text-secondary)' }}>{item.age || '-'} años</td>
                                            <td className='px-8 py-5'>
                                                <div className='flex flex-col'>
                                                    <span className='font-black text-sm' style={{ color: 'var(--text-primary)' }}>{item.tenureMonths} meses</span>
                                                    <span className='text-[10px] font-bold uppercase' style={{ color: 'var(--text-secondary)' }}>En AirHive</span>
                                                </div>
                                            </td>
                                            <td className='px-8 py-5 text-center'>
                                                <div className='flex flex-col'>
                                                    <span className='font-black text-sm' style={{ color: 'var(--text-primary)' }}>{item.preLeadsCount}</span>
                                                    <span className='text-[10px] font-bold opacity-60' style={{ color: 'var(--text-secondary)' }}>
                                                        {item.avgPreLeadsPerDay.toFixed(2)}/día · {item.avgPreLeadsPerMonth.toFixed(1)}/mes
                                                    </span>
                                                </div>
                                            </td>
                                            <td className='px-8 py-5 text-center'>
                                                <div className='flex flex-col'>
                                                    <span className='font-black text-sm' style={{ color: item.preLeadConversionRate > 20 ? '#10b981' : 'var(--text-primary)' }}>
                                                        {item.preLeadConversionRate.toFixed(1)}%
                                                    </span>
                                                    <span className='text-[10px] font-bold opacity-60' style={{ color: 'var(--text-secondary)' }}>
                                                        {item.convertedPreLeadsCount} conv. · {item.avgConvertedPreLeadsPerMonth.toFixed(1)}/mes
                                                    </span>
                                                </div>
                                            </td>
                                            <td className='px-8 py-5 text-center'>
                                                <div className='flex flex-col'>
                                                    <span className='font-black text-sm' style={{ color: 'var(--text-primary)' }}>
                                                        {item.companiesCreated}
                                                    </span>
                                                    <span className='text-[10px] font-bold opacity-60' style={{ color: 'var(--text-secondary)' }}>
                                                        {item.avgCompaniesPerMonth.toFixed(1)}/mes
                                                    </span>
                                                    <span className='text-[9px] font-bold opacity-50' style={{ color: 'var(--text-secondary)' }}>
                                                        {item.lastCompanyCreatedAt ? new Date(item.lastCompanyCreatedAt).toLocaleDateString('es-MX') : 'sin registro'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className='px-8 py-5 font-black text-sm' style={{ color: 'var(--text-primary)' }}>
                                                ${item.totalSales.toLocaleString()}
                                            </td>
                                            <td className='px-8 py-5'>
                                                <div className='flex items-center gap-1.5'>
                                                    {item.growth > 0 ? (
                                                        <>
                                                            <ArrowUpRight className='text-emerald-500' size={16} />
                                                            <span className='text-emerald-500 font-black text-sm'>+{item.growth.toFixed(1)}%</span>
                                                        </>
                                                    ) : item.growth < 0 ? (
                                                        <>
                                                            <ArrowDownRight className='text-red-500' size={16} />
                                                            <span className='text-red-500 font-black text-sm'>{item.growth.toFixed(1)}%</span>
                                                        </>
                                                    ) : (
                                                        <span className='font-bold text-sm' style={{ color: 'var(--text-secondary)' }}>0%</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className='px-8 py-5'>
                                                <div className='flex items-center justify-center gap-3'>
                                                    <span title='Oro' className='flex items-center gap-1'><Trophy size={14} className='text-amber-500' /> <span className='text-xs font-black' style={{ color: 'var(--text-primary)' }}>{item.medals.gold}</span></span>
                                                    <span title='Plata' className='flex items-center gap-1'><Trophy size={14} className='text-gray-400' /> <span className='text-xs font-black' style={{ color: 'var(--text-primary)' }}>{item.medals.silver}</span></span>
                                                    <span title='Bronce' className='flex items-center gap-1'><Trophy size={14} className='text-amber-700' /> <span className='text-xs font-black' style={{ color: 'var(--text-primary)' }}>{item.medals.bronze}</span></span>
                                                </div>
                                            </td>
                                            <td className='px-8 py-5 text-center'>
                                                <span className='font-black text-sm' style={{ color: item.meetingsPerClose < 3 ? '#10b981' : 'var(--text-primary)' }}>
                                                    {item.meetingsPerClose.toFixed(1)}
                                                </span>
                                            </td>
                                            <td className='px-8 py-5 text-center'>
                                                <span className='font-black text-sm' style={{ color: item.forecastAccuracy > 80 ? '#10b981' : 'var(--text-primary)' }}>
                                                    {item.forecastAccuracy.toFixed(0)}%
                                                </span>
                                            </td>
                                            <td className='px-8 py-5 text-center'>
                                                <span className='font-bold text-[10px] uppercase truncate max-w-[80px] block' title={item.topIndustry} style={{ color: 'var(--text-secondary)' }}>
                                                    {item.topIndustry}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {filteredData.length === 0 && (
                            <div className='py-20 text-center' style={{ background: 'var(--background)' }}>
                                <p className='font-bold' style={{ color: 'var(--text-secondary)' }}>No se encontraron datos para los filtros seleccionados.</p>
                            </div>
                        )}
                    </div>
                    )}
                    {/* Past Races History */}
                    {showGeneralView && (
                    <div className='order-8 space-y-6'>
                        <div className='flex items-center gap-4'>
                            <div className='w-12 h-12 rounded-2xl flex items-center justify-center bg-blue-500/10 text-blue-500'>
                                <Building2 size={24} />
                            </div>
                            <div>
                                <h2 className='text-2xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>Registro de Empresas</h2>
                                <p className='text-xs font-bold uppercase tracking-widest' style={{ color: 'var(--text-secondary)' }}>
                                    Historial de empresas registradas por usuarios
                                </p>
                            </div>
                        </div>

                        <div className='rounded-[28px] border overflow-hidden' style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
                            <div className='overflow-x-auto'>
                                <table className='w-full text-left border-collapse'>
                                    <thead className='uppercase text-[10px] font-black tracking-[0.2em]' style={{ background: 'var(--background)', color: 'var(--text-secondary)' }}>
                                        <tr>
                                            <th className='px-8 py-4'>Fecha Registro</th>
                                            <th className='px-8 py-4'>Empresa</th>
                                            <th className='px-8 py-4'>Registrada Por</th>
                                            <th className='px-8 py-4'>Industria</th>
                                            <th className='px-8 py-4'>Ubicación</th>
                                        </tr>
                                    </thead>
                                    <tbody className='divide-y' style={{ borderColor: 'var(--card-border)' }}>
                                        {companyRegistry.slice(0, 120).map((entry) => (
                                            <tr key={entry.id} className='hover:bg-black/5 transition-colors'>
                                                <td className='px-8 py-4 font-bold text-sm' style={{ color: 'var(--text-primary)' }}>
                                                    {entry.createdAt ? new Date(entry.createdAt).toLocaleString('es-MX') : 'N/A'}
                                                </td>
                                                <td className='px-8 py-4 font-black text-sm' style={{ color: 'var(--text-primary)' }}>{entry.nombre}</td>
                                                <td className='px-8 py-4 font-bold text-sm' style={{ color: 'var(--text-secondary)' }}>{entry.ownerName}</td>
                                                <td className='px-8 py-4 font-bold text-sm' style={{ color: 'var(--text-secondary)' }}>{entry.industria}</td>
                                                <td className='px-8 py-4 font-bold text-sm' style={{ color: 'var(--text-secondary)' }}>{entry.ubicacion}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {companyRegistry.length === 0 && (
                                <div className='p-8 text-center font-bold text-sm' style={{ color: 'var(--text-secondary)' }}>
                                    Aún no hay registros de empresas para mostrar.
                                </div>
                            )}
                        </div>
                    </div>
                    )}

                    {/* Past Races History */}
                    {showGeneralView && (
                    <div className='order-9 space-y-6'>
                        <div className='flex items-center gap-4'>
                            <div className='w-12 h-12 rounded-2xl flex items-center justify-center bg-yellow-500/10 text-yellow-500'>
                                <Trophy size={24} />
                            </div>
                            <div>
                                <h2 className='text-2xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>Historial de Carreras</h2>
                                <p className='text-xs font-bold uppercase tracking-widest' style={{ color: 'var(--text-secondary)' }}>Resultados finales por mes</p>
                            </div>
                        </div>
                        <RaceHistoryTable races={pastRaces} />
                    </div>
                    )}
                </div>
                <RichardDawkinsFooter />
            </div>
        </div>
    )
}
