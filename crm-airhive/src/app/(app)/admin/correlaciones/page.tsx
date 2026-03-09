'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import {
    createAdminProspectQueryPreset,
    createMyAdminProspectQueryFavorite,
    deleteAdminProspectQueryPreset,
    deleteMyAdminProspectQueryFavorite,
    getAdminCommercialForecast,
    getAdminCorrelationData,
    getAdminProspectQueryPresets,
    getMyAdminProspectQueryFavorites
} from '@/app/actions/admin'
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
    Hash,
    Eye,
    EyeOff,
    Save,
    Play,
    Trash2,
    Download,
    FileText,
    Star
} from 'lucide-react'
import RichardDawkinsFooter from '@/components/RichardDawkinsFooter'
import TableEmployeeAvatar from '@/components/TableEmployeeAvatar'
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

    { key: 'preLeadsCount', label: 'Suspects Totales', group: 'Prospección y Conversión', scopes: ['team'] },
    { key: 'preLeadConversionRate', label: 'Conversión Suspect %', group: 'Prospección y Conversión', scopes: ['team'] },
    { key: 'avgPreLeadsPerDay', label: 'Suspects / Día', group: 'Prospección y Conversión', scopes: ['team'] },
    { key: 'avgConvertedPreLeadsPerMonth', label: 'Conv. Suspect / Mes', group: 'Prospección y Conversión', scopes: ['team'] },
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
    { key: 'preLeadCreatedEvents90d', label: 'Suspects Creados 90d', group: 'Telemetría 90d', scopes: ['team'] },
    { key: 'preLeadConvertedEvents90d', label: 'Suspects Convertidos 90d', group: 'Telemetría 90d', scopes: ['team'] },

    { key: 'probabilidad', label: 'Probabilidad Forecast', group: 'Calidad de Lead (Usuario)', scopes: ['individual'] },
    { key: 'valorEstimado', label: 'Valor Estimado', group: 'Calidad de Lead (Usuario)', scopes: ['individual'] },
    { key: 'calificacion', label: 'Calificación', group: 'Calidad de Lead (Usuario)', scopes: ['individual'] },
    { key: 'meetingsCount', label: 'Reuniones del Lead', group: 'Proceso Comercial (Usuario)', scopes: ['individual'] },
    { key: 'responseHours', label: 'Horas a Primera Reunión', group: 'Proceso Comercial (Usuario)', scopes: ['individual'] },
    { key: 'hasPhysicalMeeting', label: 'Incluye Reunión Presencial', group: 'Proceso Comercial (Usuario)', scopes: ['individual'] },
    { key: 'fromPreLead', label: 'Origen Suspect', group: 'Proceso Comercial (Usuario)', scopes: ['individual'] },
    { key: 'conversionLagDays', label: 'Lag Conversión Suspect->Lead', group: 'Proceso Comercial (Usuario)', scopes: ['individual'] },
    { key: 'closedOutcome', label: 'Resultado Cierre (1/0)', group: 'Resultado Lead (Usuario)', scopes: ['individual'] }
]

const QUICK_PRESETS: Array<{ id: string, label: string, scope: CorrelationScope, x: MetricKey, y: MetricKey }> = [
    { id: 'team_prelead_sales', label: 'Equipo: Suspects / Día vs Ventas', scope: 'team', x: 'avgPreLeadsPerDay', y: 'totalSales' },
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

type ProspectAnalyticsRow = {
    leadId: number
    ownerId: string | null
    companyId: string | null
    companyName: string | null
    companyIndustry: string | null
    companySizeValue: number | null
    companySizeLabel: string | null
    prospectAgeExact: number | null
    prospectRoleCatalogId: string | null
    prospectRoleAreaLabel: string | null
    prospectRoleExactTitle: string | null
    prospectRoleCustom: string | null
    stage: string | null
    isClosedWon: boolean
    createdAt: string | null
    monthlyForecastAmount: number | null
    monthlyRealAmount: number | null
    implementationForecastAmount: number | null
    implementationRealAmount: number | null
    totalForecastAmount: number | null
    totalRealAmount: number | null
    forecastCloseDate: string | null
    realClosedAt: string | null
    forecastCloseDays: number | null
    realCloseDays: number | null
    closeDaysGapRealMinusForecast: number | null
}

type ProspectAnalyticsOptions = {
    industries: string[]
    companySizes: Array<{ value: number, label: string }>
    roleAreas: Array<{ id: string, label: string }>
}

type ProspectQuestionMetric =
    | 'avg_age'
    | 'median_age'
    | 'top_role_area'
    | 'top3_role_area'
    | 'top_industry'
    | 'count_prospects'
    | 'won_rate_by_role_area'
    | 'won_rate_by_age_range'
    | 'avg_age_period_compare'
    | 'top_role_area_period_compare'
    | 'builder_prospects_count'
    | 'builder_won_count'
    | 'builder_closed_count'
    | 'builder_won_rate'
    | 'builder_avg_age'
    | 'builder_median_age'
    | 'builder_avg_company_size'
    | 'builder_max_company_size'
    | 'builder_sum_forecast_monthly_amount'
    | 'builder_sum_real_monthly_amount'
    | 'builder_sum_forecast_implementation_amount'
    | 'builder_sum_real_implementation_amount'
    | 'builder_sum_forecast_total_amount'
    | 'builder_sum_real_total_amount'
    | 'builder_avg_forecast_monthly_amount'
    | 'builder_avg_real_monthly_amount'
    | 'builder_avg_forecast_implementation_amount'
    | 'builder_avg_real_implementation_amount'
    | 'builder_avg_forecast_total_amount'
    | 'builder_avg_real_total_amount'
    | 'builder_sum_amount_gap_real_minus_forecast_total'
    | 'builder_avg_amount_gap_real_minus_forecast_total'
    | 'builder_real_vs_forecast_amount_ratio_total'
    | 'builder_avg_forecast_close_days'
    | 'builder_avg_real_close_days'
    | 'builder_median_forecast_close_days'
    | 'builder_median_real_close_days'
    | 'builder_avg_close_days_gap_real_minus_forecast'

type ProspectQuestionAnswer = {
    success: boolean
    message: string
    metric?: ProspectQuestionMetric
    filteredCount?: number
    sampleCount?: number
    filters?: {
        companySize?: string | null
        industry?: string | null
        roleArea?: string | null
        period?: string | null
    }
    topBreakdown?: Array<{ label: string, count: number, valueText?: string }>
}

type ProspectQueryPreset = {
    id: string
    name: string
    queryText: string
    displayText: string
    createdAt: string | null
    createdByName: string | null
}

type ProspectQueryFavorite = {
    id: string
    name: string
    queryText: string
    displayText: string
    createdAt: string | null
}

type ActiveForecastMetricAnswer = {
    metric: ProspectBuilderMetric
    answer: ProspectQuestionAnswer
}

type ProspectBuilderMetric =
    | 'prospects_count'
    | 'won_count'
    | 'closed_count'
    | 'won_rate'
    | 'avg_age'
    | 'median_age'
    | 'avg_company_size'
    | 'max_company_size'
    | 'sum_forecast_monthly_amount'
    | 'sum_real_monthly_amount'
    | 'sum_forecast_implementation_amount'
    | 'sum_real_implementation_amount'
    | 'sum_forecast_total_amount'
    | 'sum_real_total_amount'
    | 'avg_forecast_monthly_amount'
    | 'avg_real_monthly_amount'
    | 'avg_forecast_implementation_amount'
    | 'avg_real_implementation_amount'
    | 'avg_forecast_total_amount'
    | 'avg_real_total_amount'
    | 'sum_amount_gap_real_minus_forecast_total'
    | 'avg_amount_gap_real_minus_forecast_total'
    | 'real_vs_forecast_amount_ratio_total'
    | 'avg_forecast_close_days'
    | 'avg_real_close_days'
    | 'median_forecast_close_days'
    | 'median_real_close_days'
    | 'avg_close_days_gap_real_minus_forecast'

type ProspectBuilderGroupBy =
    | 'industry'
    | 'company_size'
    | 'month_created'
    | 'month_forecast_close'
    | 'month_real_close'
    | 'role_area'
    | 'outcome_status'
    | 'none'

type ProspectBuilderSort = 'desc' | 'asc'
type ProspectBuilderPeriod = 'all' | 'this_month' | 'last_month' | 'last_30' | 'last_90' | 'this_year'
type ProspectBuilderOutcomeFilter = 'all' | 'won_only' | 'closed_only' | 'open_only'
type ProspectBuilderDateFilterMode = 'preset' | 'months' | 'range'
type ProspectBuilderRangeGranularity = 'month' | 'day'

type ProspectBuilderConfig = {
    metric: ProspectBuilderMetric
    groupBy: ProspectBuilderGroupBy
    sortDirection: ProspectBuilderSort
    topN: number
    period: ProspectBuilderPeriod
    industry: string
    companySize: string
    roleAreaId: string
    outcomeFilter: ProspectBuilderOutcomeFilter
    dateFilterMode: ProspectBuilderDateFilterMode
    rangeGranularity: ProspectBuilderRangeGranularity
    selectedMonths: string[]
    monthRangeStart: string
    monthRangeEnd: string
    dayRangeStart: string
    dayRangeEnd: string
    forecastMetrics?: ProspectBuilderMetric[]
}

const PROSPECT_BUILDER_QUERY_PREFIX = 'builder::'
const PROSPECT_BUILDER_TOP_N_OPTIONS = [1, 3, 5, 10, 20]

const PROSPECT_BUILDER_METRIC_OPTIONS: Array<{ value: ProspectBuilderMetric, label: string }> = [
    { value: 'prospects_count', label: 'Prospectos / Leads' },
    { value: 'won_count', label: 'Conversiones (Cerrado Ganado)' },
    { value: 'closed_count', label: 'Cierres (Cualquier cierre)' },
    { value: 'won_rate', label: 'Tasa de Conversión (Ganado / Total)' },
    { value: 'avg_age', label: 'Edad Promedio de Prospecto' },
    { value: 'median_age', label: 'Mediana de Edad de Prospecto' },
    { value: 'avg_company_size', label: 'Tamaño Promedio de Empresa' },
    { value: 'max_company_size', label: 'Tamaño Máximo de Empresa' },
    { value: 'sum_forecast_monthly_amount', label: 'Monto Pronosticado Mensual (Total)' },
    { value: 'sum_real_monthly_amount', label: 'Monto REAL Mensual (Total)' },
    { value: 'sum_forecast_implementation_amount', label: 'Monto Pronosticado Implementación (Total)' },
    { value: 'sum_real_implementation_amount', label: 'Monto REAL Implementación (Total)' },
    { value: 'sum_forecast_total_amount', label: 'Monto Pronosticado Total (Mensual + Implementación)' },
    { value: 'sum_real_total_amount', label: 'Monto REAL Total (Mensual + Implementación)' },
    { value: 'avg_forecast_monthly_amount', label: 'Monto Pronosticado Mensual (Promedio)' },
    { value: 'avg_real_monthly_amount', label: 'Monto REAL Mensual (Promedio)' },
    { value: 'avg_forecast_implementation_amount', label: 'Monto Pronosticado Implementación (Promedio)' },
    { value: 'avg_real_implementation_amount', label: 'Monto REAL Implementación (Promedio)' },
    { value: 'avg_forecast_total_amount', label: 'Monto Pronosticado Total (Promedio)' },
    { value: 'avg_real_total_amount', label: 'Monto REAL Total (Promedio)' },
    { value: 'sum_amount_gap_real_minus_forecast_total', label: 'Brecha Total Monto (REAL - Pronosticado)' },
    { value: 'avg_amount_gap_real_minus_forecast_total', label: 'Brecha Promedio Monto (REAL - Pronosticado)' },
    { value: 'real_vs_forecast_amount_ratio_total', label: 'Ratio REAL vs Pronosticado (%)' },
    { value: 'avg_forecast_close_days', label: 'Tiempo de Cierre Pronosticado (Promedio días)' },
    { value: 'avg_real_close_days', label: 'Tiempo de Cierre REAL (Promedio días)' },
    { value: 'median_forecast_close_days', label: 'Tiempo de Cierre Pronosticado (Mediana días)' },
    { value: 'median_real_close_days', label: 'Tiempo de Cierre REAL (Mediana días)' },
    { value: 'avg_close_days_gap_real_minus_forecast', label: 'Diferencia Promedio (REAL - Pronóstico en días)' }
]

const FORECAST_BUILDER_METRIC_VALUES: ProspectBuilderMetric[] = [
    'sum_forecast_monthly_amount',
    'sum_real_monthly_amount',
    'sum_forecast_implementation_amount',
    'sum_real_implementation_amount',
    'sum_forecast_total_amount',
    'sum_real_total_amount',
    'avg_forecast_monthly_amount',
    'avg_real_monthly_amount',
    'avg_forecast_implementation_amount',
    'avg_real_implementation_amount',
    'avg_forecast_total_amount',
    'avg_real_total_amount',
    'sum_amount_gap_real_minus_forecast_total',
    'avg_amount_gap_real_minus_forecast_total',
    'real_vs_forecast_amount_ratio_total',
    'avg_forecast_close_days',
    'avg_real_close_days',
    'median_forecast_close_days',
    'median_real_close_days',
    'avg_close_days_gap_real_minus_forecast'
]

const FORECAST_BUILDER_METRIC_SET = new Set<ProspectBuilderMetric>(FORECAST_BUILDER_METRIC_VALUES)

const PROSPECT_BUILDER_BASE_METRIC_OPTIONS = PROSPECT_BUILDER_METRIC_OPTIONS.filter(
    (option) => !FORECAST_BUILDER_METRIC_SET.has(option.value)
)

type ForecastMetricSourceView = 'forecast' | 'real' | 'compare'

const FORECAST_SOURCE_OPTIONS: Array<{ value: ForecastMetricSourceView, label: string }> = [
    { value: 'forecast', label: 'Pronóstico' },
    { value: 'real', label: 'REAL' },
    { value: 'compare', label: 'Comparativa' }
]

const FORECAST_SOURCE_METRICS: Record<ForecastMetricSourceView, ProspectBuilderMetric[]> = {
    forecast: [
        'sum_forecast_monthly_amount',
        'sum_forecast_implementation_amount',
        'sum_forecast_total_amount',
        'avg_forecast_monthly_amount',
        'avg_forecast_implementation_amount',
        'avg_forecast_total_amount',
        'avg_forecast_close_days',
        'median_forecast_close_days'
    ],
    real: [
        'sum_real_monthly_amount',
        'sum_real_implementation_amount',
        'sum_real_total_amount',
        'avg_real_monthly_amount',
        'avg_real_implementation_amount',
        'avg_real_total_amount',
        'avg_real_close_days',
        'median_real_close_days'
    ],
    compare: [
        'sum_amount_gap_real_minus_forecast_total',
        'avg_amount_gap_real_minus_forecast_total',
        'real_vs_forecast_amount_ratio_total',
        'avg_close_days_gap_real_minus_forecast'
    ]
}

const FORECAST_SOURCE_METRIC_SETS: Record<ForecastMetricSourceView, Set<ProspectBuilderMetric>> = {
    forecast: new Set<ProspectBuilderMetric>(FORECAST_SOURCE_METRICS.forecast),
    real: new Set<ProspectBuilderMetric>(FORECAST_SOURCE_METRICS.real),
    compare: new Set<ProspectBuilderMetric>(FORECAST_SOURCE_METRICS.compare)
}

const FORECAST_METRIC_LAYOUT: Record<
ForecastMetricSourceView,
Array<{ id: string, title: string, options: Array<{ metric: ProspectBuilderMetric, shortLabel: string }> }>
> = {
    forecast: [
        {
            id: 'forecast-amount-total',
            title: 'Montos Totales',
            options: [
                { metric: 'sum_forecast_monthly_amount', shortLabel: 'Mensual' },
                { metric: 'sum_forecast_implementation_amount', shortLabel: 'Implementación' },
                { metric: 'sum_forecast_total_amount', shortLabel: 'Total' }
            ]
        },
        {
            id: 'forecast-amount-avg',
            title: 'Montos Promedio',
            options: [
                { metric: 'avg_forecast_monthly_amount', shortLabel: 'Mensual' },
                { metric: 'avg_forecast_implementation_amount', shortLabel: 'Implementación' },
                { metric: 'avg_forecast_total_amount', shortLabel: 'Total' }
            ]
        },
        {
            id: 'forecast-close-time',
            title: 'Tiempo de Cierre',
            options: [
                { metric: 'avg_forecast_close_days', shortLabel: 'Promedio días' },
                { metric: 'median_forecast_close_days', shortLabel: 'Mediana días' }
            ]
        }
    ],
    real: [
        {
            id: 'real-amount-total',
            title: 'Montos Totales',
            options: [
                { metric: 'sum_real_monthly_amount', shortLabel: 'Mensual' },
                { metric: 'sum_real_implementation_amount', shortLabel: 'Implementación' },
                { metric: 'sum_real_total_amount', shortLabel: 'Total' }
            ]
        },
        {
            id: 'real-amount-avg',
            title: 'Montos Promedio',
            options: [
                { metric: 'avg_real_monthly_amount', shortLabel: 'Mensual' },
                { metric: 'avg_real_implementation_amount', shortLabel: 'Implementación' },
                { metric: 'avg_real_total_amount', shortLabel: 'Total' }
            ]
        },
        {
            id: 'real-close-time',
            title: 'Tiempo de Cierre',
            options: [
                { metric: 'avg_real_close_days', shortLabel: 'Promedio días' },
                { metric: 'median_real_close_days', shortLabel: 'Mediana días' }
            ]
        }
    ],
    compare: [
        {
            id: 'compare-money',
            title: 'Real vs Pronóstico (Monto)',
            options: [
                { metric: 'sum_amount_gap_real_minus_forecast_total', shortLabel: 'Brecha total' },
                { metric: 'avg_amount_gap_real_minus_forecast_total', shortLabel: 'Brecha promedio' },
                { metric: 'real_vs_forecast_amount_ratio_total', shortLabel: 'Ratio %' }
            ]
        },
        {
            id: 'compare-close',
            title: 'Real vs Pronóstico (Tiempo)',
            options: [
                { metric: 'avg_close_days_gap_real_minus_forecast', shortLabel: 'Diferencia promedio días' }
            ]
        }
    ]
}

const PROSPECT_BUILDER_GROUP_OPTIONS: Array<{ value: ProspectBuilderGroupBy, label: string }> = [
    { value: 'industry', label: 'Industria' },
    { value: 'company_size', label: 'Tamaño de Empresa' },
    { value: 'month_created', label: 'Mes de Creación' },
    { value: 'month_forecast_close', label: 'Mes de Cierre Pronosticado' },
    { value: 'month_real_close', label: 'Mes de Cierre REAL' },
    { value: 'role_area', label: 'Área del Puesto' },
    { value: 'outcome_status', label: 'Estado Comercial' },
    { value: 'none', label: 'Sin Agrupar (Global)' }
]

const PROSPECT_BUILDER_PERIOD_OPTIONS: Array<{ value: ProspectBuilderPeriod, label: string }> = [
    { value: 'all', label: 'Todo el historial' },
    { value: 'this_month', label: 'Este mes' },
    { value: 'last_month', label: 'Mes pasado' },
    { value: 'last_30', label: 'Últimos 30 días' },
    { value: 'last_90', label: 'Últimos 90 días' },
    { value: 'this_year', label: 'Año actual' }
]

const PROSPECT_BUILDER_OUTCOME_OPTIONS: Array<{ value: ProspectBuilderOutcomeFilter, label: string }> = [
    { value: 'all', label: 'Todos los estados' },
    { value: 'won_only', label: 'Solo Cerrado Ganado' },
    { value: 'closed_only', label: 'Solo cerrados' },
    { value: 'open_only', label: 'Solo abiertos' }
]

const PROSPECT_BUILDER_DATE_FILTER_MODE_OPTIONS: Array<{ value: ProspectBuilderDateFilterMode, label: string }> = [
    { value: 'preset', label: 'Periodo rápido' },
    { value: 'months', label: 'Meses específicos' },
    { value: 'range', label: 'Rango' }
]

const PROSPECT_BUILDER_RANGE_GRANULARITY_OPTIONS: Array<{ value: ProspectBuilderRangeGranularity, label: string }> = [
    { value: 'month', label: 'Por mes' },
    { value: 'day', label: 'Por días específicos' }
]

const PROSPECT_DEFAULT_BUILDER_CONFIG: ProspectBuilderConfig = {
    metric: 'prospects_count',
    groupBy: 'industry',
    sortDirection: 'desc',
    topN: 5,
    period: 'all',
    industry: 'all',
    companySize: 'all',
    roleAreaId: 'all',
    outcomeFilter: 'all',
    dateFilterMode: 'preset',
    rangeGranularity: 'month',
    selectedMonths: [],
    monthRangeStart: '',
    monthRangeEnd: '',
    dayRangeStart: '',
    dayRangeEnd: '',
    forecastMetrics: []
}

const escapeHtml = (input: string) => String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const csvCell = (value: unknown) => {
    const raw = String(value ?? '')
    if (raw.includes('"') || raw.includes(',') || raw.includes('\n')) {
        return `"${raw.replace(/"/g, '""')}"`
    }
    return raw
}

const parseBreakdownNumericValue = (item: { count: number, valueText?: string }) => {
    const directCount = Number(item?.count)
    if (Number.isFinite(directCount)) return directCount

    const raw = String(item?.valueText || '').trim()
    if (raw) {
        const match = raw.match(/-?\d+(\.\d+)?/)
        if (match) {
            const parsed = Number(match[0])
            if (Number.isFinite(parsed)) return parsed
        }
    }
    const fallback = Number(item?.count ?? 0)
    return Number.isFinite(fallback) ? fallback : 0
}

const normalizeQuestionText = (value: string) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const MONTH_KEY_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/
const DAY_KEY_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

const normalizeMonthKey = (value: unknown): string | null => {
    const raw = String(value || '').trim()
    return MONTH_KEY_REGEX.test(raw) ? raw : null
}

const normalizeBuilderMonthSelection = (rawSelection: unknown): string[] => {
    if (!Array.isArray(rawSelection)) return []
    const deduped: string[] = []
    rawSelection.forEach((value) => {
        const monthKey = normalizeMonthKey(value)
        if (!monthKey) return
        if (deduped.includes(monthKey)) return
        deduped.push(monthKey)
    })
    return deduped.sort()
}

const normalizeDayKey = (value: unknown): string | null => {
    const raw = String(value || '').trim()
    return DAY_KEY_REGEX.test(raw) ? raw : null
}

const getMonthKeyFromDateValue = (value: string | null | undefined): string | null => {
    const raw = String(value || '').trim()
    if (!raw) return null

    // Prefer raw ISO prefix to avoid timezone shifts around month boundaries.
    const directMonth = normalizeMonthKey(raw.slice(0, 7))
    if (directMonth) return directMonth

    const directDay = normalizeDayKey(raw.slice(0, 10))
    if (directDay) return directDay.slice(0, 7)

    const date = new Date(raw)
    if (!Number.isFinite(date.getTime())) return null
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

const monthLabelFormatter = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' })
const dayLabelFormatter = new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })

const formatMonthKeyLabel = (monthKey: string) => {
    const normalized = normalizeMonthKey(monthKey)
    if (!normalized) return monthKey
    const [yearRaw, monthRaw] = normalized.split('-')
    const year = Number(yearRaw)
    const month = Number(monthRaw)
    const date = new Date(year, month - 1, 1)
    if (!Number.isFinite(date.getTime())) return monthKey
    return monthLabelFormatter.format(date)
}

const buildSelectedMonthsPreview = (monthKeys: string[]) => {
    if (monthKeys.length === 0) return null
    const sortedDesc = [...monthKeys].sort((a, b) => b.localeCompare(a))
    const labels = sortedDesc.map((key) => formatMonthKeyLabel(key))
    const preview = labels.slice(0, 3).join(', ')
    const overflow = labels.length - 3
    return overflow > 0
        ? `${preview} +${overflow}`
        : preview
}

const formatDayKeyLabel = (dayKey: string) => {
    const normalized = normalizeDayKey(dayKey)
    if (!normalized) return dayKey
    const date = new Date(`${normalized}T00:00:00`)
    if (!Number.isFinite(date.getTime())) return dayKey
    return dayLabelFormatter.format(date)
}

const normalizeForecastMetricSelection = (rawSelection: unknown): ProspectBuilderMetric[] => {
    if (!Array.isArray(rawSelection)) return []
    const deduped: ProspectBuilderMetric[] = []
    rawSelection.forEach((value) => {
        const candidate = String(value || '') as ProspectBuilderMetric
        if (!FORECAST_BUILDER_METRIC_SET.has(candidate)) return
        if (deduped.includes(candidate)) return
        deduped.push(candidate)
    })
    return deduped
}

const getForecastMetricSource = (metric: ProspectBuilderMetric): ForecastMetricSourceView | null => {
    if (FORECAST_SOURCE_METRIC_SETS.forecast.has(metric)) return 'forecast'
    if (FORECAST_SOURCE_METRIC_SETS.real.has(metric)) return 'real'
    if (FORECAST_SOURCE_METRIC_SETS.compare.has(metric)) return 'compare'
    return null
}

type TimeWindow = { label: string, start: number, end: number }

function parseQuestionTimeWindows(normalizedQuestion: string): { primary: TimeWindow | null, secondary: TimeWindow | null } {
    const includesAny = (tokens: string[]) => tokens.some((token) => normalizedQuestion.includes(token))
    const now = new Date()
    const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime()

    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
    const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime()
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime()
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999).getTime()

    const last30Start = dayEnd - ((30 * 24 * 60 * 60 * 1000) - 1)
    const prev30Start = last30Start - (30 * 24 * 60 * 60 * 1000)
    const prev30End = last30Start - 1

    const last90Start = dayEnd - ((90 * 24 * 60 * 60 * 1000) - 1)
    const prev90Start = last90Start - (90 * 24 * 60 * 60 * 1000)
    const prev90End = last90Start - 1

    const hasCompare = includesAny([' vs ', ' versus ', 'contra', 'compar', 'periodo anterior', 'anterior'])

    if (normalizedQuestion.includes('este mes') && (normalizedQuestion.includes('mes pasado') || hasCompare)) {
        return {
            primary: { label: 'Este mes', start: thisMonthStart, end: thisMonthEnd },
            secondary: { label: 'Mes pasado', start: prevMonthStart, end: prevMonthEnd }
        }
    }
    if (includesAny(['ultimos 30 dias', 'ultimo 30 dias', 'ultimos treinta dias']) && hasCompare) {
        return {
            primary: { label: 'Ultimos 30 dias', start: last30Start, end: dayEnd },
            secondary: { label: '30 dias anteriores', start: prev30Start, end: prev30End }
        }
    }
    if (includesAny(['ultimos 90 dias', 'ultimo 90 dias', 'ultimos noventa dias']) && hasCompare) {
        return {
            primary: { label: 'Ultimos 90 dias', start: last90Start, end: dayEnd },
            secondary: { label: '90 dias anteriores', start: prev90Start, end: prev90End }
        }
    }
    if (normalizedQuestion.includes('este mes')) {
        return { primary: { label: 'Este mes', start: thisMonthStart, end: thisMonthEnd }, secondary: null }
    }
    if (normalizedQuestion.includes('mes pasado')) {
        return { primary: { label: 'Mes pasado', start: prevMonthStart, end: prevMonthEnd }, secondary: null }
    }
    if (includesAny(['ultimos 30 dias', 'ultimo 30 dias', 'ultimos treinta dias'])) {
        return { primary: { label: 'Ultimos 30 dias', start: last30Start, end: dayEnd }, secondary: null }
    }
    if (includesAny(['ultimos 90 dias', 'ultimo 90 dias', 'ultimos noventa dias'])) {
        return { primary: { label: 'Ultimos 90 dias', start: last90Start, end: dayEnd }, secondary: null }
    }
    return { primary: null, secondary: null }
}

const builderMetricToAnswerMetric: Record<ProspectBuilderMetric, ProspectQuestionMetric> = {
    prospects_count: 'builder_prospects_count',
    won_count: 'builder_won_count',
    closed_count: 'builder_closed_count',
    won_rate: 'builder_won_rate',
    avg_age: 'builder_avg_age',
    median_age: 'builder_median_age',
    avg_company_size: 'builder_avg_company_size',
    max_company_size: 'builder_max_company_size',
    sum_forecast_monthly_amount: 'builder_sum_forecast_monthly_amount',
    sum_real_monthly_amount: 'builder_sum_real_monthly_amount',
    sum_forecast_implementation_amount: 'builder_sum_forecast_implementation_amount',
    sum_real_implementation_amount: 'builder_sum_real_implementation_amount',
    sum_forecast_total_amount: 'builder_sum_forecast_total_amount',
    sum_real_total_amount: 'builder_sum_real_total_amount',
    avg_forecast_monthly_amount: 'builder_avg_forecast_monthly_amount',
    avg_real_monthly_amount: 'builder_avg_real_monthly_amount',
    avg_forecast_implementation_amount: 'builder_avg_forecast_implementation_amount',
    avg_real_implementation_amount: 'builder_avg_real_implementation_amount',
    avg_forecast_total_amount: 'builder_avg_forecast_total_amount',
    avg_real_total_amount: 'builder_avg_real_total_amount',
    sum_amount_gap_real_minus_forecast_total: 'builder_sum_amount_gap_real_minus_forecast_total',
    avg_amount_gap_real_minus_forecast_total: 'builder_avg_amount_gap_real_minus_forecast_total',
    real_vs_forecast_amount_ratio_total: 'builder_real_vs_forecast_amount_ratio_total',
    avg_forecast_close_days: 'builder_avg_forecast_close_days',
    avg_real_close_days: 'builder_avg_real_close_days',
    median_forecast_close_days: 'builder_median_forecast_close_days',
    median_real_close_days: 'builder_median_real_close_days',
    avg_close_days_gap_real_minus_forecast: 'builder_avg_close_days_gap_real_minus_forecast'
}

const getBuilderMetricLabel = (metric: ProspectBuilderMetric) =>
    PROSPECT_BUILDER_METRIC_OPTIONS.find((item) => item.value === metric)?.label || metric

const getBuilderGroupLabel = (groupBy: ProspectBuilderGroupBy) =>
    PROSPECT_BUILDER_GROUP_OPTIONS.find((item) => item.value === groupBy)?.label || groupBy

const getBuilderPeriodLabel = (period: ProspectBuilderPeriod) =>
    PROSPECT_BUILDER_PERIOD_OPTIONS.find((item) => item.value === period)?.label || period

const getBuilderOutcomeLabel = (outcome: ProspectBuilderOutcomeFilter) =>
    PROSPECT_BUILDER_OUTCOME_OPTIONS.find((item) => item.value === outcome)?.label || outcome

const isClosedStageValue = (stage: string | null | undefined) => normalizeQuestionText(String(stage || '')).includes('cerrad')

const CLOSE_TIME_SPEED_METRICS = new Set<ProspectBuilderMetric>([
    'avg_forecast_close_days',
    'avg_real_close_days',
    'median_forecast_close_days',
    'median_real_close_days'
])

const CURRENCY_METRICS = new Set<ProspectBuilderMetric>([
    'sum_forecast_monthly_amount',
    'sum_real_monthly_amount',
    'sum_forecast_implementation_amount',
    'sum_real_implementation_amount',
    'sum_forecast_total_amount',
    'sum_real_total_amount',
    'avg_forecast_monthly_amount',
    'avg_real_monthly_amount',
    'avg_forecast_implementation_amount',
    'avg_real_implementation_amount',
    'avg_forecast_total_amount',
    'avg_real_total_amount',
    'sum_amount_gap_real_minus_forecast_total',
    'avg_amount_gap_real_minus_forecast_total'
])

const DAY_METRICS = new Set<ProspectBuilderMetric>([
    'avg_forecast_close_days',
    'avg_real_close_days',
    'median_forecast_close_days',
    'median_real_close_days',
    'avg_close_days_gap_real_minus_forecast'
])

const PERCENT_METRICS = new Set<ProspectBuilderMetric>([
    'won_rate',
    'real_vs_forecast_amount_ratio_total'
])

const getBuilderSortLabels = (metric: ProspectBuilderMetric) => {
    if (CLOSE_TIME_SPEED_METRICS.has(metric)) {
        return {
            desc: 'Más tardado a más rápido',
            asc: 'Más rápido a más tardado'
        }
    }
    return {
        desc: 'Mayor a menor',
        asc: 'Menor a mayor'
    }
}

const avgNumber = (values: number[]) => values.length > 0
    ? values.reduce((acc, value) => acc + value, 0) / values.length
    : null

const medianNumber = (values: number[]) => {
    if (values.length === 0) return null
    const sorted = [...values].sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle]
}

const formatBuilderMetricValue = (metric: ProspectBuilderMetric, value: number) => {
    if (PERCENT_METRICS.has(metric)) return `${value.toFixed(1)}%`
    if (metric === 'avg_age' || metric === 'median_age') return `${value.toFixed(1)} años`
    if (CURRENCY_METRICS.has(metric)) {
        return `$${value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }
    if (DAY_METRICS.has(metric)) {
        return `${value.toFixed(1)} días`
    }
    if (metric === 'avg_company_size') return `${value.toFixed(2)} / 5`
    if (metric === 'max_company_size') return `${Math.round(value)} / 5`
    return Math.round(value).toLocaleString('es-MX')
}

const getBuilderPeriodWindow = (period: ProspectBuilderPeriod): TimeWindow | null => {
    const now = new Date()
    const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime()

    if (period === 'all') return null
    if (period === 'this_month') {
        return {
            label: getBuilderPeriodLabel(period),
            start: new Date(now.getFullYear(), now.getMonth(), 1).getTime(),
            end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime()
        }
    }
    if (period === 'last_month') {
        return {
            label: getBuilderPeriodLabel(period),
            start: new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime(),
            end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999).getTime()
        }
    }
    if (period === 'last_30') {
        return {
            label: getBuilderPeriodLabel(period),
            start: dayEnd - ((30 * 24 * 60 * 60 * 1000) - 1),
            end: dayEnd
        }
    }
    if (period === 'last_90') {
        return {
            label: getBuilderPeriodLabel(period),
            start: dayEnd - ((90 * 24 * 60 * 60 * 1000) - 1),
            end: dayEnd
        }
    }
    return {
        label: getBuilderPeriodLabel(period),
        start: new Date(now.getFullYear(), 0, 1).getTime(),
        end: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999).getTime()
    }
}

const serializeBuilderQueryConfig = (config: ProspectBuilderConfig) =>
    `${PROSPECT_BUILDER_QUERY_PREFIX}${JSON.stringify(config)}`

const parseBuilderQueryConfig = (queryText: string): ProspectBuilderConfig | null => {
    const raw = String(queryText || '')
    if (!raw.startsWith(PROSPECT_BUILDER_QUERY_PREFIX)) return null
    try {
        const parsed = JSON.parse(raw.slice(PROSPECT_BUILDER_QUERY_PREFIX.length)) as Partial<ProspectBuilderConfig>
        const metricSet = new Set(PROSPECT_BUILDER_METRIC_OPTIONS.map((item) => item.value))
        const groupSet = new Set(PROSPECT_BUILDER_GROUP_OPTIONS.map((item) => item.value))
        const periodSet = new Set(PROSPECT_BUILDER_PERIOD_OPTIONS.map((item) => item.value))
        const outcomeSet = new Set(PROSPECT_BUILDER_OUTCOME_OPTIONS.map((item) => item.value))
        const dateFilterModeSet = new Set(PROSPECT_BUILDER_DATE_FILTER_MODE_OPTIONS.map((item) => item.value))
        const rangeGranularitySet = new Set(PROSPECT_BUILDER_RANGE_GRANULARITY_OPTIONS.map((item) => item.value))

        const metric = metricSet.has(parsed.metric as ProspectBuilderMetric)
            ? parsed.metric as ProspectBuilderMetric
            : PROSPECT_DEFAULT_BUILDER_CONFIG.metric
        const groupBy = groupSet.has(parsed.groupBy as ProspectBuilderGroupBy)
            ? parsed.groupBy as ProspectBuilderGroupBy
            : PROSPECT_DEFAULT_BUILDER_CONFIG.groupBy
        const sortDirection = parsed.sortDirection === 'asc'
            ? 'asc'
            : PROSPECT_DEFAULT_BUILDER_CONFIG.sortDirection
        const parsedTopN = Number(parsed.topN)
        const topN = Number.isFinite(parsedTopN)
            ? Math.max(1, Math.min(50, Math.round(parsedTopN)))
            : PROSPECT_DEFAULT_BUILDER_CONFIG.topN
        const period = periodSet.has(parsed.period as ProspectBuilderPeriod)
            ? parsed.period as ProspectBuilderPeriod
            : PROSPECT_DEFAULT_BUILDER_CONFIG.period
        const outcomeFilter = outcomeSet.has(parsed.outcomeFilter as ProspectBuilderOutcomeFilter)
            ? parsed.outcomeFilter as ProspectBuilderOutcomeFilter
            : PROSPECT_DEFAULT_BUILDER_CONFIG.outcomeFilter
        const dateFilterMode = dateFilterModeSet.has(parsed.dateFilterMode as ProspectBuilderDateFilterMode)
            ? parsed.dateFilterMode as ProspectBuilderDateFilterMode
            : PROSPECT_DEFAULT_BUILDER_CONFIG.dateFilterMode
        const rangeGranularity = rangeGranularitySet.has(parsed.rangeGranularity as ProspectBuilderRangeGranularity)
            ? parsed.rangeGranularity as ProspectBuilderRangeGranularity
            : PROSPECT_DEFAULT_BUILDER_CONFIG.rangeGranularity
        const selectedMonths = normalizeBuilderMonthSelection(parsed.selectedMonths)
        const monthRangeStart = normalizeMonthKey(parsed.monthRangeStart) || ''
        const monthRangeEnd = normalizeMonthKey(parsed.monthRangeEnd) || ''
        const dayRangeStart = normalizeDayKey(parsed.dayRangeStart) || ''
        const dayRangeEnd = normalizeDayKey(parsed.dayRangeEnd) || ''
        const forecastMetrics = normalizeForecastMetricSelection(parsed.forecastMetrics)

        return {
            metric,
            groupBy,
            sortDirection,
            topN,
            period,
            industry: String(parsed.industry || 'all'),
            companySize: String(parsed.companySize || 'all'),
            roleAreaId: String(parsed.roleAreaId || 'all'),
            outcomeFilter,
            dateFilterMode,
            rangeGranularity,
            selectedMonths,
            monthRangeStart,
            monthRangeEnd,
            dayRangeStart,
            dayRangeEnd,
            forecastMetrics
        }
    } catch {
        return null
    }
}

const describeBuilderQueryConfig = (config: ProspectBuilderConfig, options: ProspectAnalyticsOptions) => {
    const activeForecastMetrics = normalizeForecastMetricSelection(config.forecastMetrics)
    const effectiveMetric = activeForecastMetrics[0] || config.metric
    const metricLabel = getBuilderMetricLabel(effectiveMetric)
    const groupLabel = getBuilderGroupLabel(config.groupBy)
    const sortLabels = getBuilderSortLabels(effectiveMetric)
    const directionLabel = config.sortDirection === 'desc' ? sortLabels.desc.toLowerCase() : sortLabels.asc.toLowerCase()

    const industryLabel = config.industry !== 'all'
        ? config.industry
        : null
    const companySizeLabel = config.companySize !== 'all'
        ? (options.companySizes.find((size) => String(size.value) === String(config.companySize))?.label || `Tamaño ${config.companySize}`)
        : null
    const roleAreaLabel = config.roleAreaId !== 'all'
        ? (options.roleAreas.find((role) => String(role.id) === String(config.roleAreaId))?.label || 'Área específica')
        : null
    const outcomeLabel = config.outcomeFilter !== 'all'
        ? getBuilderOutcomeLabel(config.outcomeFilter)
        : null
    const rangeGranularity: ProspectBuilderRangeGranularity = config.rangeGranularity === 'day' ? 'day' : 'month'
    const selectedMonths = normalizeBuilderMonthSelection(config.selectedMonths)
    const monthRangeStart = normalizeMonthKey(config.monthRangeStart)
    const monthRangeEnd = normalizeMonthKey(config.monthRangeEnd)
    const normalizedRangeStart = monthRangeStart && monthRangeEnd
        ? (monthRangeStart <= monthRangeEnd ? monthRangeStart : monthRangeEnd)
        : (monthRangeStart || monthRangeEnd)
    const normalizedRangeEnd = monthRangeStart && monthRangeEnd
        ? (monthRangeStart <= monthRangeEnd ? monthRangeEnd : monthRangeStart)
        : (monthRangeStart || monthRangeEnd)
    const dayRangeStart = normalizeDayKey(config.dayRangeStart)
    const dayRangeEnd = normalizeDayKey(config.dayRangeEnd)
    const normalizedDayRangeStart = dayRangeStart && dayRangeEnd
        ? (dayRangeStart <= dayRangeEnd ? dayRangeStart : dayRangeEnd)
        : (dayRangeStart || dayRangeEnd)
    const normalizedDayRangeEnd = dayRangeStart && dayRangeEnd
        ? (dayRangeStart <= dayRangeEnd ? dayRangeEnd : dayRangeStart)
        : (dayRangeStart || dayRangeEnd)
    const dateFilterLabel = (() => {
        if (config.dateFilterMode === 'months') {
            const preview = buildSelectedMonthsPreview(selectedMonths)
            return preview ? `Meses: ${preview}` : 'Meses específicos (sin selección)'
        }
        if (config.dateFilterMode === 'range') {
            if (rangeGranularity === 'day') {
                if (!normalizedDayRangeStart && !normalizedDayRangeEnd) return 'Rango por días (sin definir)'
                const startLabel = normalizedDayRangeStart ? formatDayKeyLabel(normalizedDayRangeStart) : 'Sin inicio'
                const endLabel = normalizedDayRangeEnd ? formatDayKeyLabel(normalizedDayRangeEnd) : 'Sin fin'
                return `Rango días: ${startLabel} → ${endLabel}`
            }
            if (!normalizedRangeStart && !normalizedRangeEnd) return 'Rango por mes (sin definir)'
            const startLabel = normalizedRangeStart ? formatMonthKeyLabel(normalizedRangeStart) : 'Sin inicio'
            const endLabel = normalizedRangeEnd ? formatMonthKeyLabel(normalizedRangeEnd) : 'Sin fin'
            return `Rango mes: ${startLabel} → ${endLabel}`
        }
        const periodLabel = getBuilderPeriodLabel(config.period)
        return periodLabel !== getBuilderPeriodLabel('all') ? periodLabel : null
    })()

    const activeFilters = [
        dateFilterLabel,
        industryLabel ? `Industria: ${industryLabel}` : null,
        companySizeLabel ? `Tamaño: ${companySizeLabel}` : null,
        roleAreaLabel ? `Área: ${roleAreaLabel}` : null,
        outcomeLabel
    ].filter(Boolean)
    const activeForecastLabel = activeForecastMetrics.length > 0
        ? (() => {
            const labels = activeForecastMetrics.map((metric) => getBuilderMetricLabel(metric))
            const preview = labels.slice(0, 3).join(', ')
            const overflow = labels.length - 3
            return overflow > 0
                ? `Pronósticos activos: ${preview} +${overflow}`
                : `Pronósticos activos: ${preview}`
        })()
        : null

    if (config.groupBy === 'none') {
        const globalParts = [
            `Global de ${metricLabel}`,
            ...activeFilters,
            activeForecastLabel
        ].filter(Boolean)
        return globalParts.join(' · ')
    }

    const rankingParts = [
        `Top ${config.topN} ${groupLabel.toLowerCase()} por ${metricLabel.toLowerCase()}`,
        directionLabel,
        ...activeFilters,
        activeForecastLabel
    ].filter(Boolean)
    return rankingParts.join(' · ')
}

const answerProspectBuilderQuery = (
    config: ProspectBuilderConfig,
    rows: ProspectAnalyticsRow[],
    options: ProspectAnalyticsOptions
): ProspectQuestionAnswer => {
    const periodWindow = getBuilderPeriodWindow(config.period)
    const rangeGranularity: ProspectBuilderRangeGranularity = config.rangeGranularity === 'day' ? 'day' : 'month'
    const selectedMonths = normalizeBuilderMonthSelection(config.selectedMonths)
    const selectedMonthsSet = new Set(selectedMonths)
    const monthRangeStart = normalizeMonthKey(config.monthRangeStart)
    const monthRangeEnd = normalizeMonthKey(config.monthRangeEnd)
    const normalizedRangeStart = monthRangeStart && monthRangeEnd
        ? (monthRangeStart <= monthRangeEnd ? monthRangeStart : monthRangeEnd)
        : (monthRangeStart || monthRangeEnd)
    const normalizedRangeEnd = monthRangeStart && monthRangeEnd
        ? (monthRangeStart <= monthRangeEnd ? monthRangeEnd : monthRangeStart)
        : (monthRangeStart || monthRangeEnd)
    const dayRangeStart = normalizeDayKey(config.dayRangeStart)
    const dayRangeEnd = normalizeDayKey(config.dayRangeEnd)
    const normalizedDayRangeStart = dayRangeStart && dayRangeEnd
        ? (dayRangeStart <= dayRangeEnd ? dayRangeStart : dayRangeEnd)
        : (dayRangeStart || dayRangeEnd)
    const normalizedDayRangeEnd = dayRangeStart && dayRangeEnd
        ? (dayRangeStart <= dayRangeEnd ? dayRangeEnd : dayRangeStart)
        : (dayRangeStart || dayRangeEnd)
    const dayRangeStartTs = normalizedDayRangeStart ? new Date(`${normalizedDayRangeStart}T00:00:00`).getTime() : NaN
    const dayRangeEndTs = normalizedDayRangeEnd ? new Date(`${normalizedDayRangeEnd}T23:59:59.999`).getTime() : NaN
    const hasValidDayRangeBounds = Number.isFinite(dayRangeStartTs) && Number.isFinite(dayRangeEndTs)
    const periodFilterLabel = (() => {
        if (config.dateFilterMode === 'months') {
            const preview = buildSelectedMonthsPreview(selectedMonths)
            return preview ? `Meses: ${preview}` : null
        }
        if (config.dateFilterMode === 'range') {
            if (rangeGranularity === 'day') {
                if (!normalizedDayRangeStart && !normalizedDayRangeEnd) return null
                const startLabel = normalizedDayRangeStart ? formatDayKeyLabel(normalizedDayRangeStart) : 'Sin inicio'
                const endLabel = normalizedDayRangeEnd ? formatDayKeyLabel(normalizedDayRangeEnd) : 'Sin fin'
                return `Rango días: ${startLabel} → ${endLabel}`
            }
            if (!normalizedRangeStart && !normalizedRangeEnd) return null
            const startLabel = normalizedRangeStart ? formatMonthKeyLabel(normalizedRangeStart) : 'Sin inicio'
            const endLabel = normalizedRangeEnd ? formatMonthKeyLabel(normalizedRangeEnd) : 'Sin fin'
            return `Rango mes: ${startLabel} → ${endLabel}`
        }
        return periodWindow?.label || null
    })()
    const normalizedIndustryFilter = normalizeQuestionText(config.industry)
    const numericCompanySizeFilter = Number(config.companySize)
    const hasCompanySizeFilter = config.companySize !== 'all' && Number.isFinite(numericCompanySizeFilter)
    const selectedRoleArea = config.roleAreaId !== 'all'
        ? options.roleAreas.find((role) => String(role.id) === String(config.roleAreaId))
        : null

    const metricsUsingRealCloseDate = new Set<ProspectBuilderMetric>([
        'sum_real_monthly_amount',
        'sum_real_implementation_amount',
        'sum_real_total_amount',
        'avg_real_monthly_amount',
        'avg_real_implementation_amount',
        'avg_real_total_amount',
        'sum_amount_gap_real_minus_forecast_total',
        'avg_amount_gap_real_minus_forecast_total',
        'real_vs_forecast_amount_ratio_total',
        'avg_real_close_days',
        'median_real_close_days',
        'avg_close_days_gap_real_minus_forecast'
    ])
    const metricsUsingForecastCloseDate = new Set<ProspectBuilderMetric>([
        'sum_forecast_monthly_amount',
        'sum_forecast_implementation_amount',
        'sum_forecast_total_amount',
        'avg_forecast_monthly_amount',
        'avg_forecast_implementation_amount',
        'avg_forecast_total_amount',
        'avg_forecast_close_days',
        'median_forecast_close_days'
    ])
    const resolvePeriodAnchor = (row: ProspectAnalyticsRow) => {
        if (config.groupBy === 'month_real_close') return row.realClosedAt || row.createdAt
        if (config.groupBy === 'month_forecast_close') return row.forecastCloseDate || row.createdAt
        if (metricsUsingRealCloseDate.has(config.metric)) return row.realClosedAt || row.createdAt
        if (metricsUsingForecastCloseDate.has(config.metric)) return row.forecastCloseDate || row.createdAt
        return row.createdAt
    }

    const filteredRows = rows.filter((row) => {
        const anchorDate = resolvePeriodAnchor(row)
        const timestamp = anchorDate ? new Date(anchorDate).getTime() : NaN
        const anchorMonthKey = getMonthKeyFromDateValue(anchorDate)

        if (config.dateFilterMode === 'preset' && periodWindow) {
            if (!Number.isFinite(timestamp) || timestamp < periodWindow.start || timestamp > periodWindow.end) return false
        }
        if (config.dateFilterMode === 'months' && selectedMonthsSet.size > 0) {
            if (!anchorMonthKey || !selectedMonthsSet.has(anchorMonthKey)) return false
        }
        if (config.dateFilterMode === 'range' && rangeGranularity === 'month' && normalizedRangeStart && normalizedRangeEnd) {
            if (!anchorMonthKey || anchorMonthKey < normalizedRangeStart || anchorMonthKey > normalizedRangeEnd) return false
        }
        if (config.dateFilterMode === 'range' && rangeGranularity === 'day' && hasValidDayRangeBounds) {
            if (!Number.isFinite(timestamp) || timestamp < dayRangeStartTs || timestamp > dayRangeEndTs) return false
        }

        if (config.industry !== 'all') {
            const rowIndustry = normalizeQuestionText(row.companyIndustry || '')
            if (!rowIndustry || rowIndustry !== normalizedIndustryFilter) return false
        }
        if (hasCompanySizeFilter) {
            if (Number(row.companySizeValue || 0) !== numericCompanySizeFilter) return false
        }
        if (config.roleAreaId !== 'all') {
            if (String(row.prospectRoleCatalogId || '') !== String(config.roleAreaId)) return false
        }

        const isClosed = isClosedStageValue(row.stage)
        if (config.outcomeFilter === 'won_only' && !row.isClosedWon) return false
        if (config.outcomeFilter === 'closed_only' && !isClosed) return false
        if (config.outcomeFilter === 'open_only' && isClosed) return false

        return true
    })

    if (filteredRows.length === 0) {
        return {
            success: false,
            metric: builderMetricToAnswerMetric[config.metric],
            message: 'No hay datos para la combinación seleccionada de métrica, agrupación y filtros.',
            filteredCount: 0,
            sampleCount: 0,
            filters: {
                companySize: hasCompanySizeFilter
                    ? (options.companySizes.find((size) => Number(size.value) === numericCompanySizeFilter)?.label || `Tamaño ${numericCompanySizeFilter}`)
                    : null,
                industry: config.industry !== 'all' ? config.industry : null,
                roleArea: selectedRoleArea?.label || null,
                period: periodFilterLabel
            }
        }
    }

    const monthFormatter = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' })
    const resolveGroup = (row: ProspectAnalyticsRow): { key: string, label: string, sortSeed: number } => {
        const buildMonthGroup = (rawDate: string | null | undefined, prefix: string) => {
            const date = rawDate ? new Date(rawDate) : null
            const hasValidDate = !!date && Number.isFinite(date.getTime())
            if (!hasValidDate) return { key: `${prefix}:unknown`, label: 'Sin fecha', sortSeed: -999999999999 }
            const key = `${date!.getFullYear()}-${String(date!.getMonth() + 1).padStart(2, '0')}`
            const label = monthFormatter.format(date!)
            const sortSeed = new Date(date!.getFullYear(), date!.getMonth(), 1).getTime()
            return { key: `${prefix}:${key}`, label, sortSeed }
        }

        if (config.groupBy === 'industry') {
            const label = String(row.companyIndustry || '').trim() || 'Sin industria'
            return { key: `industry:${label}`, label, sortSeed: 0 }
        }
        if (config.groupBy === 'company_size') {
            const value = Number(row.companySizeValue)
            const isValid = Number.isFinite(value)
            const label = isValid
                ? (String(row.companySizeLabel || '').trim() || `Tamaño ${Math.round(value)}`)
                : 'Sin tamaño'
            return { key: isValid ? `size:${Math.round(value)}` : 'size:unknown', label, sortSeed: isValid ? value : -999 }
        }
        if (config.groupBy === 'month_created') {
            return buildMonthGroup(row.createdAt, 'month_created')
        }
        if (config.groupBy === 'month_forecast_close') {
            return buildMonthGroup(row.forecastCloseDate, 'month_forecast_close')
        }
        if (config.groupBy === 'month_real_close') {
            return buildMonthGroup(row.realClosedAt, 'month_real_close')
        }
        if (config.groupBy === 'role_area') {
            const label = String(row.prospectRoleAreaLabel || '').trim() || 'Sin área de puesto'
            return { key: `role:${label}`, label, sortSeed: 0 }
        }
        if (config.groupBy === 'outcome_status') {
            const isClosed = isClosedStageValue(row.stage)
            const label = row.isClosedWon
                ? 'Cerrado Ganado'
                : (isClosed ? 'Cerrado No Ganado' : 'Abierto')
            return { key: `outcome:${label}`, label, sortSeed: row.isClosedWon ? 3 : (isClosed ? 2 : 1) }
        }
        return { key: 'global:all', label: 'Global', sortSeed: 0 }
    }

    type AggregationBucket = {
        key: string
        label: string
        sortSeed: number
        total: number
        won: number
        closed: number
        ages: number[]
        sizes: number[]
        forecastMonthlyTotal: number
        forecastMonthlySamples: number
        realMonthlyTotal: number
        realMonthlySamples: number
        forecastImplementationTotal: number
        forecastImplementationSamples: number
        realImplementationTotal: number
        realImplementationSamples: number
        forecastTotalAmount: number
        forecastTotalSamples: number
        realTotalAmount: number
        realTotalSamples: number
        pairedForecastTotalAmount: number
        pairedRealTotalAmount: number
        pairedTotalSamples: number
        amountGapRealMinusForecastTotal: number
        amountGapRealMinusForecastSamples: number
        forecastCloseDays: number[]
        realCloseDays: number[]
        closeDaysGapRealMinusForecast: number[]
    }

    const buckets = new Map<string, AggregationBucket>()
    filteredRows.forEach((row) => {
        const group = resolveGroup(row)
        if (!buckets.has(group.key)) {
            buckets.set(group.key, {
                key: group.key,
                label: group.label,
                sortSeed: group.sortSeed,
                total: 0,
                won: 0,
                closed: 0,
                ages: [],
                sizes: [],
                forecastMonthlyTotal: 0,
                forecastMonthlySamples: 0,
                realMonthlyTotal: 0,
                realMonthlySamples: 0,
                forecastImplementationTotal: 0,
                forecastImplementationSamples: 0,
                realImplementationTotal: 0,
                realImplementationSamples: 0,
                forecastTotalAmount: 0,
                forecastTotalSamples: 0,
                realTotalAmount: 0,
                realTotalSamples: 0,
                pairedForecastTotalAmount: 0,
                pairedRealTotalAmount: 0,
                pairedTotalSamples: 0,
                amountGapRealMinusForecastTotal: 0,
                amountGapRealMinusForecastSamples: 0,
                forecastCloseDays: [],
                realCloseDays: [],
                closeDaysGapRealMinusForecast: []
            })
        }
        const bucket = buckets.get(group.key)!
        bucket.total += 1
        if (row.isClosedWon) bucket.won += 1
        if (isClosedStageValue(row.stage)) bucket.closed += 1
        if (row.prospectAgeExact != null && Number.isFinite(Number(row.prospectAgeExact))) {
            bucket.ages.push(Number(row.prospectAgeExact))
        }
        if (row.companySizeValue != null && Number.isFinite(Number(row.companySizeValue))) {
            bucket.sizes.push(Number(row.companySizeValue))
        }
        if (row.monthlyForecastAmount != null && Number.isFinite(Number(row.monthlyForecastAmount))) {
            bucket.forecastMonthlyTotal += Number(row.monthlyForecastAmount)
            bucket.forecastMonthlySamples += 1
        }
        if (row.monthlyRealAmount != null && Number.isFinite(Number(row.monthlyRealAmount))) {
            bucket.realMonthlyTotal += Number(row.monthlyRealAmount)
            bucket.realMonthlySamples += 1
        }
        if (row.implementationForecastAmount != null && Number.isFinite(Number(row.implementationForecastAmount))) {
            bucket.forecastImplementationTotal += Number(row.implementationForecastAmount)
            bucket.forecastImplementationSamples += 1
        }
        if (row.implementationRealAmount != null && Number.isFinite(Number(row.implementationRealAmount))) {
            bucket.realImplementationTotal += Number(row.implementationRealAmount)
            bucket.realImplementationSamples += 1
        }
        if (row.totalForecastAmount != null && Number.isFinite(Number(row.totalForecastAmount))) {
            bucket.forecastTotalAmount += Number(row.totalForecastAmount)
            bucket.forecastTotalSamples += 1
        }
        if (row.totalRealAmount != null && Number.isFinite(Number(row.totalRealAmount))) {
            bucket.realTotalAmount += Number(row.totalRealAmount)
            bucket.realTotalSamples += 1
        }
        if (
            row.totalRealAmount != null
            && Number.isFinite(Number(row.totalRealAmount))
            && row.totalForecastAmount != null
            && Number.isFinite(Number(row.totalForecastAmount))
        ) {
            const realAmount = Number(row.totalRealAmount)
            const forecastAmount = Number(row.totalForecastAmount)
            bucket.pairedRealTotalAmount += realAmount
            bucket.pairedForecastTotalAmount += forecastAmount
            bucket.pairedTotalSamples += 1
            bucket.amountGapRealMinusForecastTotal += (realAmount - forecastAmount)
            bucket.amountGapRealMinusForecastSamples += 1
        }
        if (row.forecastCloseDays != null && Number.isFinite(Number(row.forecastCloseDays))) {
            bucket.forecastCloseDays.push(Number(row.forecastCloseDays))
        }
        if (row.realCloseDays != null && Number.isFinite(Number(row.realCloseDays))) {
            bucket.realCloseDays.push(Number(row.realCloseDays))
        }
        if (row.closeDaysGapRealMinusForecast != null && Number.isFinite(Number(row.closeDaysGapRealMinusForecast))) {
            bucket.closeDaysGapRealMinusForecast.push(Number(row.closeDaysGapRealMinusForecast))
        }
    })

    const valueByMetric = (bucket: AggregationBucket): number | null => {
        if (config.metric === 'prospects_count') return bucket.total
        if (config.metric === 'won_count') return bucket.won
        if (config.metric === 'closed_count') return bucket.closed
        if (config.metric === 'won_rate') return bucket.total > 0 ? (bucket.won / bucket.total) * 100 : null
        if (config.metric === 'avg_age') return avgNumber(bucket.ages)
        if (config.metric === 'median_age') return medianNumber(bucket.ages)
        if (config.metric === 'avg_company_size') return avgNumber(bucket.sizes)
        if (config.metric === 'max_company_size') return bucket.sizes.length > 0 ? Math.max(...bucket.sizes) : null
        if (config.metric === 'sum_forecast_monthly_amount') return bucket.forecastMonthlySamples > 0 ? bucket.forecastMonthlyTotal : null
        if (config.metric === 'sum_real_monthly_amount') return bucket.realMonthlySamples > 0 ? bucket.realMonthlyTotal : null
        if (config.metric === 'sum_forecast_implementation_amount') return bucket.forecastImplementationSamples > 0 ? bucket.forecastImplementationTotal : null
        if (config.metric === 'sum_real_implementation_amount') return bucket.realImplementationSamples > 0 ? bucket.realImplementationTotal : null
        if (config.metric === 'sum_forecast_total_amount') return bucket.forecastTotalSamples > 0 ? bucket.forecastTotalAmount : null
        if (config.metric === 'sum_real_total_amount') return bucket.realTotalSamples > 0 ? bucket.realTotalAmount : null
        if (config.metric === 'avg_forecast_monthly_amount') return bucket.forecastMonthlySamples > 0 ? bucket.forecastMonthlyTotal / bucket.forecastMonthlySamples : null
        if (config.metric === 'avg_real_monthly_amount') return bucket.realMonthlySamples > 0 ? bucket.realMonthlyTotal / bucket.realMonthlySamples : null
        if (config.metric === 'avg_forecast_implementation_amount') return bucket.forecastImplementationSamples > 0 ? bucket.forecastImplementationTotal / bucket.forecastImplementationSamples : null
        if (config.metric === 'avg_real_implementation_amount') return bucket.realImplementationSamples > 0 ? bucket.realImplementationTotal / bucket.realImplementationSamples : null
        if (config.metric === 'avg_forecast_total_amount') return bucket.forecastTotalSamples > 0 ? bucket.forecastTotalAmount / bucket.forecastTotalSamples : null
        if (config.metric === 'avg_real_total_amount') return bucket.realTotalSamples > 0 ? bucket.realTotalAmount / bucket.realTotalSamples : null
        if (config.metric === 'sum_amount_gap_real_minus_forecast_total') return bucket.amountGapRealMinusForecastSamples > 0 ? bucket.amountGapRealMinusForecastTotal : null
        if (config.metric === 'avg_amount_gap_real_minus_forecast_total') return bucket.amountGapRealMinusForecastSamples > 0 ? (bucket.amountGapRealMinusForecastTotal / bucket.amountGapRealMinusForecastSamples) : null
        if (config.metric === 'real_vs_forecast_amount_ratio_total') return bucket.pairedForecastTotalAmount > 0 ? (bucket.pairedRealTotalAmount / bucket.pairedForecastTotalAmount) * 100 : null
        if (config.metric === 'avg_forecast_close_days') return avgNumber(bucket.forecastCloseDays)
        if (config.metric === 'avg_real_close_days') return avgNumber(bucket.realCloseDays)
        if (config.metric === 'median_forecast_close_days') return medianNumber(bucket.forecastCloseDays)
        if (config.metric === 'median_real_close_days') return medianNumber(bucket.realCloseDays)
        if (config.metric === 'avg_close_days_gap_real_minus_forecast') return avgNumber(bucket.closeDaysGapRealMinusForecast)
        return null
    }

    const ranking = Array.from(buckets.values())
        .map((bucket) => {
            const value = valueByMetric(bucket)
            return value == null
                ? null
                : { ...bucket, value }
        })
        .filter((item): item is AggregationBucket & { value: number } => !!item)
        .sort((a, b) => {
            if (config.sortDirection === 'desc') {
                if (b.value !== a.value) return b.value - a.value
                if (config.groupBy === 'month_created' || config.groupBy === 'month_forecast_close' || config.groupBy === 'month_real_close') return b.sortSeed - a.sortSeed
                return a.label.localeCompare(b.label, 'es')
            }
            if (a.value !== b.value) return a.value - b.value
            if (config.groupBy === 'month_created' || config.groupBy === 'month_forecast_close' || config.groupBy === 'month_real_close') return a.sortSeed - b.sortSeed
            return a.label.localeCompare(b.label, 'es')
        })

    if (ranking.length === 0) {
        return {
            success: false,
            metric: builderMetricToAnswerMetric[config.metric],
            message: 'No hay valores suficientes para calcular la métrica seleccionada con esos filtros.',
            filteredCount: filteredRows.length,
            sampleCount: 0,
            filters: {
                companySize: hasCompanySizeFilter
                    ? (options.companySizes.find((size) => Number(size.value) === numericCompanySizeFilter)?.label || `Tamaño ${numericCompanySizeFilter}`)
                    : null,
                industry: config.industry !== 'all' ? config.industry : null,
                roleArea: selectedRoleArea?.label || null,
                period: periodFilterLabel
            }
        }
    }

    const topLimit = config.groupBy === 'none'
        ? 1
        : Math.max(1, Math.min(50, Number(config.topN || PROSPECT_DEFAULT_BUILDER_CONFIG.topN)))
    const topRows = ranking.slice(0, topLimit)
    const metricLabel = getBuilderMetricLabel(config.metric)
    const groupLabel = getBuilderGroupLabel(config.groupBy)
    const lead = topRows[0]
    const qualifier = CLOSE_TIME_SPEED_METRICS.has(config.metric)
        ? (config.sortDirection === 'asc' ? 'más rápido' : 'más tardado')
        : (config.sortDirection === 'desc' ? 'mayor' : 'menor')

    const message = config.groupBy === 'none'
        ? `${metricLabel}: ${formatBuilderMetricValue(config.metric, lead.value)}.`
        : `${groupLabel} con ${qualifier} ${metricLabel.toLowerCase()}: "${lead.label}" (${formatBuilderMetricValue(config.metric, lead.value)}).`

    const filtersPeriodParts = [
        periodFilterLabel,
        config.outcomeFilter !== 'all' ? getBuilderOutcomeLabel(config.outcomeFilter) : null
    ].filter(Boolean)

    return {
        success: true,
        metric: builderMetricToAnswerMetric[config.metric],
        message,
        filteredCount: filteredRows.length,
        sampleCount: filteredRows.length,
        filters: {
            companySize: hasCompanySizeFilter
                ? (options.companySizes.find((size) => Number(size.value) === numericCompanySizeFilter)?.label || `Tamaño ${numericCompanySizeFilter}`)
                : null,
            industry: config.industry !== 'all' ? config.industry : null,
            roleArea: selectedRoleArea?.label || null,
            period: filtersPeriodParts.length > 0 ? filtersPeriodParts.join(' · ') : null
        },
        topBreakdown: topRows.map((row) => ({
            label: row.label,
            count: Number(row.value),
            valueText: formatBuilderMetricValue(config.metric, row.value)
        }))
    }
}

const answerProspectQuestion = (
    question: string,
    rows: ProspectAnalyticsRow[],
    options: ProspectAnalyticsOptions
): ProspectQuestionAnswer => {
    const normalizedQuestion = normalizeQuestionText(question)
    if (!normalizedQuestion) {
        return { success: false, message: 'Escribe una pregunta para analizar los datos de prospectos.' }
    }

    const includesAny = (tokens: string[]) => tokens.some((token) => normalizedQuestion.includes(token))

    const asksAge = normalizedQuestion.includes('edad')
    const asksAverage = includesAny(['promedio', 'media'])
    const asksMedian = includesAny(['mediana', 'p50'])
    const asksTop = includesAny(['mas comun', 'mas frecuente', 'top'])
    const asksRoleArea = includesAny(['area', 'rol', 'puesto'])
    const asksIndustry = normalizedQuestion.includes('industria')
    const asksCount = includesAny(['cuantos', 'cuantas', 'total', 'conteo'])
    const asksConversion = includesAny(['conversion', 'convert', 'cierre', 'ganado', 'win rate', 'tasa'])
    const asksTop3 = includesAny(['top 3', 'top3', 'top tres'])

    let metric: ProspectQuestionMetric | null = null

    if (asksConversion && asksRoleArea) metric = 'won_rate_by_role_area'
    else if (asksConversion && asksAge) metric = 'won_rate_by_age_range'
    else if (asksAge && asksMedian) metric = 'median_age'
    else if (asksAge && asksAverage) metric = 'avg_age'
    else if (asksRoleArea && asksTop && asksTop3) metric = 'top3_role_area'
    else if (asksRoleArea && asksTop) metric = 'top_role_area'
    else if (asksIndustry && asksTop) metric = 'top_industry'
    else if (asksCount) metric = 'count_prospects'

    const parsedWindows = parseQuestionTimeWindows(normalizedQuestion)
    if (parsedWindows.primary && parsedWindows.secondary && metric === 'avg_age') {
        metric = 'avg_age_period_compare'
    } else if (parsedWindows.primary && parsedWindows.secondary && (metric === 'top_role_area' || metric === 'top3_role_area')) {
        metric = 'top_role_area_period_compare'
    }

    if (!metric) {
        return {
            success: false,
            message: 'No pude interpretar la pregunta. Prueba con: "edad promedio", "mediana de edad", "top 3 áreas", "tasa de cierre por área" o "este mes vs mes pasado".'
        }
    }

    const sizeMatchers: Array<{ value: number, tokens: string[] }> = [
        { value: 1, tokens: ['microempresa', 'micro', 'tamano 1', 'size 1', 'nivel 1'] },
        { value: 2, tokens: ['pequena', 'small', 'tamano 2', 'size 2', 'nivel 2'] },
        { value: 3, tokens: ['mediana', 'pyme', 'medium', 'tamano 3', 'size 3', 'nivel 3'] },
        { value: 4, tokens: ['grande', 'large', 'tamano 4', 'size 4', 'nivel 4'] },
        { value: 5, tokens: ['corporativo', 'corporativa', 'enterprise', 'tamano 5', 'size 5', 'nivel 5'] }
    ]
    const regexSizeMatch = normalizedQuestion.match(/\b(?:tamano|size|nivel)\s*([1-5])\b/)
    const numericSize = regexSizeMatch ? Number(regexSizeMatch[1]) : null
    const matchedSize =
        (numericSize && numericSize >= 1 && numericSize <= 5
            ? numericSize
            : (sizeMatchers.find((candidate) => includesAny(candidate.tokens))?.value || null))

    let industryMatch = [...(options.industries || [])]
        .sort((a, b) => normalizeQuestionText(b).length - normalizeQuestionText(a).length)
        .find((industry) => {
            const normIndustry = normalizeQuestionText(industry)
            return normIndustry && normalizedQuestion.includes(normIndustry)
        }) || null
    if (!industryMatch) {
        industryMatch = [...(options.industries || [])]
            .find((industry) => {
                const normIndustry = normalizeQuestionText(industry)
                const root = normIndustry.slice(0, 5)
                return root.length >= 5 && normalizedQuestion.includes(root)
            }) || null
    }

    const roleAreaMatch = [...(options.roleAreas || [])]
        .sort((a, b) => normalizeQuestionText(b.label).length - normalizeQuestionText(a.label).length)
        .find((roleArea) => {
            const normLabel = normalizeQuestionText(roleArea.label)
            return normLabel && normalizedQuestion.includes(normLabel)
        }) || null

    const allFilteredRows = rows.filter((row) => {
        if (matchedSize != null && Number(row.companySizeValue || 0) !== matchedSize) return false
        if (industryMatch) {
            const rowIndustry = normalizeQuestionText(row.companyIndustry || '')
            const targetIndustry = normalizeQuestionText(industryMatch)
            if (!rowIndustry || (!rowIndustry.includes(targetIndustry) && !targetIndustry.includes(rowIndustry))) return false
        }
        if (roleAreaMatch && String(row.prospectRoleCatalogId || '') !== String(roleAreaMatch.id || '')) return false
        return true
    })
    const filterByWindow = (sourceRows: ProspectAnalyticsRow[], window: TimeWindow | null) => {
        if (!window) return sourceRows
        return sourceRows.filter((row) => {
            const timestamp = row.createdAt ? new Date(row.createdAt).getTime() : NaN
            if (!Number.isFinite(timestamp)) return false
            return timestamp >= window.start && timestamp <= window.end
        })
    }

    const primaryRows = filterByWindow(allFilteredRows, parsedWindows.primary)
    const secondaryRows = filterByWindow(allFilteredRows, parsedWindows.secondary)

    const selectedSizeLabel = matchedSize != null
        ? ((options.companySizes || []).find((size) => Number(size.value) === matchedSize)?.label || `Tamaño ${matchedSize}`)
        : null

    if (metric === 'avg_age') {
        const withAge = primaryRows
            .map((row) => row.prospectAgeExact)
            .filter((age): age is number => age != null && Number.isFinite(Number(age)))
            .map((age) => Number(age))
        if (withAge.length === 0) {
            return {
                success: false,
                message: 'No hay edades exactas registradas para ese filtro.',
                metric,
                filteredCount: primaryRows.length,
                sampleCount: 0,
                filters: { companySize: selectedSizeLabel, industry: industryMatch, roleArea: roleAreaMatch?.label || null, period: parsedWindows.primary?.label || null }
            }
        }
        const avg = withAge.reduce((acc, age) => acc + age, 0) / withAge.length
        return {
            success: true,
            metric,
            message: `La edad promedio es ${avg.toFixed(1)} años.`,
            filteredCount: primaryRows.length,
            sampleCount: withAge.length,
            filters: { companySize: selectedSizeLabel, industry: industryMatch, roleArea: roleAreaMatch?.label || null, period: parsedWindows.primary?.label || null }
        }
    }

    if (metric === 'median_age') {
        const withAge = primaryRows
            .map((row) => row.prospectAgeExact)
            .filter((age): age is number => age != null && Number.isFinite(Number(age)))
            .map((age) => Number(age))
            .sort((a, b) => a - b)
        if (withAge.length === 0) {
            return {
                success: false,
                message: 'No hay edades exactas registradas para calcular mediana con ese filtro.',
                metric,
                filteredCount: primaryRows.length,
                sampleCount: 0,
                filters: { companySize: selectedSizeLabel, industry: industryMatch, roleArea: roleAreaMatch?.label || null, period: parsedWindows.primary?.label || null }
            }
        }
        const middle = Math.floor(withAge.length / 2)
        const median = withAge.length % 2 === 0
            ? (withAge[middle - 1] + withAge[middle]) / 2
            : withAge[middle]
        return {
            success: true,
            metric,
            message: `La mediana de edad es ${median.toFixed(1)} años.`,
            filteredCount: primaryRows.length,
            sampleCount: withAge.length,
            filters: { companySize: selectedSizeLabel, industry: industryMatch, roleArea: roleAreaMatch?.label || null, period: parsedWindows.primary?.label || null }
        }
    }

    if (metric === 'top_role_area' || metric === 'top3_role_area') {
        const areaCounts = new Map<string, number>()
        primaryRows.forEach((row) => {
            const label = String(row.prospectRoleAreaLabel || '').trim()
            if (!label) return
            areaCounts.set(label, (areaCounts.get(label) || 0) + 1)
        })
        const ranking = Array.from(areaCounts.entries())
            .map(([label, count]) => ({ label, count }))
            .sort((a, b) => b.count - a.count)
        if (ranking.length === 0) {
            return {
                success: false,
                message: 'No hay áreas de puesto registradas para ese filtro.',
                metric,
                filteredCount: primaryRows.length,
                sampleCount: 0,
                filters: { companySize: selectedSizeLabel, industry: industryMatch, roleArea: roleAreaMatch?.label || null, period: parsedWindows.primary?.label || null }
            }
        }
        const top = ranking[0]
        return {
            success: true,
            metric,
            message: metric === 'top3_role_area'
                ? `Top 3 áreas más comunes: ${ranking.slice(0, 3).map((item) => `${item.label} (${item.count})`).join(', ')}.`
                : `El área más común es "${top.label}" con ${top.count} prospectos.`,
            filteredCount: primaryRows.length,
            sampleCount: ranking.reduce((acc, item) => acc + item.count, 0),
            filters: { companySize: selectedSizeLabel, industry: industryMatch, roleArea: roleAreaMatch?.label || null, period: parsedWindows.primary?.label || null },
            topBreakdown: ranking.slice(0, metric === 'top3_role_area' ? 3 : 5)
        }
    }

    if (metric === 'top_industry') {
        const industryCounts = new Map<string, number>()
        primaryRows.forEach((row) => {
            const label = String(row.companyIndustry || '').trim()
            if (!label) return
            industryCounts.set(label, (industryCounts.get(label) || 0) + 1)
        })
        const ranking = Array.from(industryCounts.entries())
            .map(([label, count]) => ({ label, count }))
            .sort((a, b) => b.count - a.count)
        if (ranking.length === 0) {
            return {
                success: false,
                message: 'No hay industria registrada para ese filtro.',
                metric,
                filteredCount: primaryRows.length,
                sampleCount: 0,
                filters: { companySize: selectedSizeLabel, industry: industryMatch, roleArea: roleAreaMatch?.label || null, period: parsedWindows.primary?.label || null }
            }
        }
        const top = ranking[0]
        return {
            success: true,
            metric,
            message: `La industria más común es "${top.label}" con ${top.count} prospectos.`,
            filteredCount: primaryRows.length,
            sampleCount: ranking.reduce((acc, item) => acc + item.count, 0),
            filters: { companySize: selectedSizeLabel, industry: industryMatch, roleArea: roleAreaMatch?.label || null, period: parsedWindows.primary?.label || null },
            topBreakdown: ranking.slice(0, 5)
        }
    }

    if (metric === 'won_rate_by_role_area') {
        const statsByArea = new Map<string, { total: number, won: number }>()
        primaryRows.forEach((row) => {
            const area = String(row.prospectRoleAreaLabel || '').trim()
            if (!area) return
            const current = statsByArea.get(area) || { total: 0, won: 0 }
            current.total += 1
            if (row.isClosedWon) current.won += 1
            statsByArea.set(area, current)
        })
        const ranking = Array.from(statsByArea.entries())
            .map(([label, stats]) => {
                const rate = stats.total > 0 ? (stats.won / stats.total) * 100 : 0
                return { label, count: stats.total, won: stats.won, rate }
            })
            .sort((a, b) => (b.rate - a.rate) || (b.count - a.count))
        if (ranking.length === 0) {
            return {
                success: false,
                message: 'No hay suficiente data de área para calcular tasa de cierre por área.',
                metric,
                filteredCount: primaryRows.length,
                sampleCount: 0,
                filters: { companySize: selectedSizeLabel, industry: industryMatch, roleArea: roleAreaMatch?.label || null, period: parsedWindows.primary?.label || null }
            }
        }
        const top = ranking[0]
        return {
            success: true,
            metric,
            message: `La mayor tasa de cierre ganado por área es "${top.label}" con ${top.rate.toFixed(1)}% (${top.won}/${top.count}).`,
            filteredCount: primaryRows.length,
            sampleCount: ranking.reduce((acc, item) => acc + item.count, 0),
            filters: { companySize: selectedSizeLabel, industry: industryMatch, roleArea: roleAreaMatch?.label || null, period: parsedWindows.primary?.label || null },
            topBreakdown: ranking.slice(0, 5).map((item) => ({
                label: item.label,
                count: item.count,
                valueText: `${item.rate.toFixed(1)}% (${item.won}/${item.count})`
            }))
        }
    }

    if (metric === 'won_rate_by_age_range') {
        const ageBuckets: Array<{ id: string, label: string, min: number, max: number | null }> = [
            { id: '16_24', label: '16-24', min: 16, max: 24 },
            { id: '25_34', label: '25-34', min: 25, max: 34 },
            { id: '35_44', label: '35-44', min: 35, max: 44 },
            { id: '45_54', label: '45-54', min: 45, max: 54 },
            { id: '55_plus', label: '55+', min: 55, max: null }
        ]
        const statsByBucket = new Map<string, { label: string, total: number, won: number }>()
        primaryRows.forEach((row) => {
            const age = row.prospectAgeExact
            if (age == null) return
            const bucket = ageBuckets.find((candidate) => age >= candidate.min && (candidate.max == null || age <= candidate.max))
            if (!bucket) return
            const current = statsByBucket.get(bucket.id) || { label: bucket.label, total: 0, won: 0 }
            current.total += 1
            if (row.isClosedWon) current.won += 1
            statsByBucket.set(bucket.id, current)
        })
        const ranking = Array.from(statsByBucket.values())
            .map((item) => ({
                ...item,
                rate: item.total > 0 ? (item.won / item.total) * 100 : 0
            }))
            .sort((a, b) => (b.rate - a.rate) || (b.total - a.total))
        if (ranking.length === 0) {
            return {
                success: false,
                message: 'No hay edades exactas para calcular tasa de cierre por rango de edad.',
                metric,
                filteredCount: primaryRows.length,
                sampleCount: 0,
                filters: { companySize: selectedSizeLabel, industry: industryMatch, roleArea: roleAreaMatch?.label || null, period: parsedWindows.primary?.label || null }
            }
        }
        const top = ranking[0]
        return {
            success: true,
            metric,
            message: `El rango con mayor tasa de cierre ganado es ${top.label} con ${top.rate.toFixed(1)}% (${top.won}/${top.total}).`,
            filteredCount: primaryRows.length,
            sampleCount: ranking.reduce((acc, item) => acc + item.total, 0),
            filters: { companySize: selectedSizeLabel, industry: industryMatch, roleArea: roleAreaMatch?.label || null, period: parsedWindows.primary?.label || null },
            topBreakdown: ranking.map((item) => ({
                label: item.label,
                count: item.total,
                valueText: `${item.rate.toFixed(1)}% (${item.won}/${item.total})`
            }))
        }
    }

    if (metric === 'avg_age_period_compare') {
        const withAgePrimary = primaryRows
            .map((row) => row.prospectAgeExact)
            .filter((age): age is number => age != null && Number.isFinite(Number(age)))
            .map((age) => Number(age))
        const withAgeSecondary = secondaryRows
            .map((row) => row.prospectAgeExact)
            .filter((age): age is number => age != null && Number.isFinite(Number(age)))
            .map((age) => Number(age))
        if (withAgePrimary.length === 0 || withAgeSecondary.length === 0) {
            return {
                success: false,
                message: 'No hay datos suficientes de edad en ambos periodos para comparar.',
                metric,
                filteredCount: primaryRows.length + secondaryRows.length,
                sampleCount: withAgePrimary.length + withAgeSecondary.length,
                filters: { companySize: selectedSizeLabel, industry: industryMatch, roleArea: roleAreaMatch?.label || null, period: `${parsedWindows.primary?.label || 'Periodo A'} vs ${parsedWindows.secondary?.label || 'Periodo B'}` }
            }
        }
        const avgPrimary = withAgePrimary.reduce((acc, age) => acc + age, 0) / withAgePrimary.length
        const avgSecondary = withAgeSecondary.reduce((acc, age) => acc + age, 0) / withAgeSecondary.length
        const delta = avgPrimary - avgSecondary
        const sign = delta >= 0 ? '+' : ''
        return {
            success: true,
            metric,
            message: `${parsedWindows.primary?.label || 'Periodo A'}: ${avgPrimary.toFixed(1)} años vs ${parsedWindows.secondary?.label || 'Periodo B'}: ${avgSecondary.toFixed(1)} años (${sign}${delta.toFixed(1)}).`,
            filteredCount: primaryRows.length + secondaryRows.length,
            sampleCount: withAgePrimary.length + withAgeSecondary.length,
            filters: { companySize: selectedSizeLabel, industry: industryMatch, roleArea: roleAreaMatch?.label || null, period: `${parsedWindows.primary?.label || 'Periodo A'} vs ${parsedWindows.secondary?.label || 'Periodo B'}` }
        }
    }

    if (metric === 'top_role_area_period_compare') {
        const getTopArea = (sourceRows: ProspectAnalyticsRow[]) => {
            const areaCounts = new Map<string, number>()
            sourceRows.forEach((row) => {
                const label = String(row.prospectRoleAreaLabel || '').trim()
                if (!label) return
                areaCounts.set(label, (areaCounts.get(label) || 0) + 1)
            })
            const ranking = Array.from(areaCounts.entries())
                .map(([label, count]) => ({ label, count }))
                .sort((a, b) => b.count - a.count)
            return ranking[0] || null
        }
        const topPrimary = getTopArea(primaryRows)
        const topSecondary = getTopArea(secondaryRows)
        if (!topPrimary || !topSecondary) {
            return {
                success: false,
                message: 'No hay áreas registradas en ambos periodos para comparar.',
                metric,
                filteredCount: primaryRows.length + secondaryRows.length,
                sampleCount: (topPrimary?.count || 0) + (topSecondary?.count || 0),
                filters: { companySize: selectedSizeLabel, industry: industryMatch, roleArea: roleAreaMatch?.label || null, period: `${parsedWindows.primary?.label || 'Periodo A'} vs ${parsedWindows.secondary?.label || 'Periodo B'}` }
            }
        }
        return {
            success: true,
            metric,
            message: `${parsedWindows.primary?.label || 'Periodo A'}: "${topPrimary.label}" (${topPrimary.count}) vs ${parsedWindows.secondary?.label || 'Periodo B'}: "${topSecondary.label}" (${topSecondary.count}).`,
            filteredCount: primaryRows.length + secondaryRows.length,
            sampleCount: topPrimary.count + topSecondary.count,
            filters: { companySize: selectedSizeLabel, industry: industryMatch, roleArea: roleAreaMatch?.label || null, period: `${parsedWindows.primary?.label || 'Periodo A'} vs ${parsedWindows.secondary?.label || 'Periodo B'}` }
        }
    }

    return {
        success: true,
        metric,
        message: `El total de prospectos para el filtro actual es ${primaryRows.length}.`,
        filteredCount: primaryRows.length,
        sampleCount: primaryRows.length,
        filters: { companySize: selectedSizeLabel, industry: industryMatch, roleArea: roleAreaMatch?.label || null, period: parsedWindows.primary?.label || null }
    }
}

export default function CorrelacionesPage({ forcedView }: { forcedView?: 'general' | 'grafica' | 'pronostico' } = {}) {
    const auth = useAuth()
    const router = useRouter()
    const searchParams = useSearchParams()
    const [data, setData] = useState<any[]>([])
    const [leadRows, setLeadRows] = useState<any[]>([])
    const [prospectRows, setProspectRows] = useState<ProspectAnalyticsRow[]>([])
    const [prospectOptions, setProspectOptions] = useState<ProspectAnalyticsOptions>({
        industries: [],
        companySizes: [],
        roleAreas: []
    })
    const [prospectQuestionInput, setProspectQuestionInput] = useState('')
    const [prospectAnswer, setProspectAnswer] = useState<ProspectQuestionAnswer | null>(null)
    const [builderMetric, setBuilderMetric] = useState<ProspectBuilderMetric>(PROSPECT_DEFAULT_BUILDER_CONFIG.metric)
    const [builderGroupBy, setBuilderGroupBy] = useState<ProspectBuilderGroupBy>(PROSPECT_DEFAULT_BUILDER_CONFIG.groupBy)
    const [builderSortDirection, setBuilderSortDirection] = useState<ProspectBuilderSort>(PROSPECT_DEFAULT_BUILDER_CONFIG.sortDirection)
    const [builderTopN, setBuilderTopN] = useState<number>(PROSPECT_DEFAULT_BUILDER_CONFIG.topN)
    const [builderPeriod, setBuilderPeriod] = useState<ProspectBuilderPeriod>(PROSPECT_DEFAULT_BUILDER_CONFIG.period)
    const [builderIndustryFilter, setBuilderIndustryFilter] = useState<string>(PROSPECT_DEFAULT_BUILDER_CONFIG.industry)
    const [builderCompanySizeFilter, setBuilderCompanySizeFilter] = useState<string>(PROSPECT_DEFAULT_BUILDER_CONFIG.companySize)
    const [builderRoleAreaFilter, setBuilderRoleAreaFilter] = useState<string>(PROSPECT_DEFAULT_BUILDER_CONFIG.roleAreaId)
    const [builderOutcomeFilter, setBuilderOutcomeFilter] = useState<ProspectBuilderOutcomeFilter>(PROSPECT_DEFAULT_BUILDER_CONFIG.outcomeFilter)
    const [builderDateFilterMode, setBuilderDateFilterMode] = useState<ProspectBuilderDateFilterMode>(PROSPECT_DEFAULT_BUILDER_CONFIG.dateFilterMode)
    const [builderRangeGranularity, setBuilderRangeGranularity] = useState<ProspectBuilderRangeGranularity>(PROSPECT_DEFAULT_BUILDER_CONFIG.rangeGranularity)
    const [builderSelectedMonths, setBuilderSelectedMonths] = useState<string[]>(
        normalizeBuilderMonthSelection(PROSPECT_DEFAULT_BUILDER_CONFIG.selectedMonths)
    )
    const [builderMonthRangeStart, setBuilderMonthRangeStart] = useState<string>(PROSPECT_DEFAULT_BUILDER_CONFIG.monthRangeStart)
    const [builderMonthRangeEnd, setBuilderMonthRangeEnd] = useState<string>(PROSPECT_DEFAULT_BUILDER_CONFIG.monthRangeEnd)
    const [builderDayRangeStart, setBuilderDayRangeStart] = useState<string>(PROSPECT_DEFAULT_BUILDER_CONFIG.dayRangeStart)
    const [builderDayRangeEnd, setBuilderDayRangeEnd] = useState<string>(PROSPECT_DEFAULT_BUILDER_CONFIG.dayRangeEnd)
    const dayRangeStartInputRef = useRef<HTMLInputElement | null>(null)
    const dayRangeEndInputRef = useRef<HTMLInputElement | null>(null)
    const [forecastMetricSourceView, setForecastMetricSourceView] = useState<ForecastMetricSourceView>('forecast')
    const [activeForecastMetrics, setActiveForecastMetrics] = useState<ProspectBuilderMetric[]>(
        normalizeForecastMetricSelection(PROSPECT_DEFAULT_BUILDER_CONFIG.forecastMetrics)
    )
    const [activeForecastMetricAnswers, setActiveForecastMetricAnswers] = useState<ActiveForecastMetricAnswer[]>([])
    const [prospectPresetNameInput, setProspectPresetNameInput] = useState('')
    const [prospectFavoriteNameInput, setProspectFavoriteNameInput] = useState('')
    const [prospectQueryPresets, setProspectQueryPresets] = useState<ProspectQueryPreset[]>([])
    const [prospectQueryFavorites, setProspectQueryFavorites] = useState<ProspectQueryFavorite[]>([])
    const [isSavingProspectPreset, setIsSavingProspectPreset] = useState(false)
    const [isSavingProspectFavorite, setIsSavingProspectFavorite] = useState(false)
    const [deletingPresetId, setDeletingPresetId] = useState<string | null>(null)
    const [deletingFavoriteId, setDeletingFavoriteId] = useState<string | null>(null)
    const [companyRegistry, setCompanyRegistry] = useState<any[]>([])
    const [analytics, setAnalytics] = useState<{
        correlationData: any[],
        correlations: any[],
        postponeByCompanySize: any[]
    }>({
        correlationData: [],
        correlations: [],
        postponeByCompanySize: []
    })
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
    const [showCompanyRegistry, setShowCompanyRegistry] = useState(false)
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
            let fetchedProspectOptions: ProspectAnalyticsOptions = {
                industries: [],
                companySizes: [],
                roleAreas: []
            }
            const [corrRes, raceRes, forecastRes, presetsRes, favoritesRes] = await Promise.all([
                getAdminCorrelationData(),
                getPastRaces(),
                getAdminCommercialForecast(),
                getAdminProspectQueryPresets(),
                getMyAdminProspectQueryFavorites()
            ])

            if (corrRes.success && corrRes.data) {
                // Backward compatible parsing
                if (Array.isArray(corrRes.data)) {
                    setData(corrRes.data)
                    setLeadRows([])
                    setCompanyRegistry([])
                    setProspectRows([])
                    setProspectOptions({ industries: [], companySizes: [], roleAreas: [] })
                    setProspectAnswer(null)
                    setAnalytics({
                        correlationData: [],
                        correlations: [],
                        postponeByCompanySize: []
                    })
                } else {
                    setData(corrRes.data.users || [])
                    setLeadRows(corrRes.data.leadRows || [])
                    setCompanyRegistry(corrRes.data.companyRegistry || [])
                    setProspectRows(corrRes.data.prospectAnalytics?.rows || [])
                    const rawProspectOptions = corrRes.data.prospectAnalytics?.options || { industries: [], companySizes: [], roleAreas: [] }
                    fetchedProspectOptions = {
                        industries: Array.isArray(rawProspectOptions.industries)
                            ? rawProspectOptions.industries.map((value: any) => String(value))
                            : [],
                        companySizes: Array.isArray(rawProspectOptions.companySizes)
                            ? rawProspectOptions.companySizes
                                .map((size: any) => ({
                                    value: Number(size?.value),
                                    label: String(size?.label || '')
                                }))
                                .filter((size: any) => Number.isFinite(size.value) && size.label)
                            : [],
                        roleAreas: Array.isArray(rawProspectOptions.roleAreas)
                            ? rawProspectOptions.roleAreas
                                .map((role: any) => ({
                                    id: String(role?.id || ''),
                                    label: String(role?.label || '')
                                }))
                                .filter((role: any) => role.id && role.label)
                            : []
                    }
                    setProspectOptions(fetchedProspectOptions)
                    setProspectAnswer(null)
                    setAnalytics({
                        correlationData: corrRes.data.analytics?.correlationData || [],
                        correlations: corrRes.data.analytics?.correlations || [],
                        postponeByCompanySize: corrRes.data.analytics?.postponeByCompanySize || []
                    })
                }
            } else {
                setError(corrRes.error || 'Error al cargar correlaciones')
            }

            if (presetsRes.success && Array.isArray((presetsRes as any).data)) {
                setProspectQueryPresets(
                    ((presetsRes as any).data || []).map((preset: any) => {
                        const rawQueryText = String(preset.queryText || '').trim()
                        const parsedBuilder = parseBuilderQueryConfig(rawQueryText)
                        return {
                            id: String(preset.id),
                            name: String(preset.name || '').trim() || 'Preset sin nombre',
                            queryText: rawQueryText,
                            displayText: parsedBuilder
                                ? describeBuilderQueryConfig(parsedBuilder, fetchedProspectOptions)
                                : rawQueryText,
                            createdAt: preset.createdAt || null,
                            createdByName: String(preset.createdByName || '').trim() || null
                        }
                    })
                )
            } else if (!(presetsRes as any).success) {
                setProspectQueryPresets([])
            }

            if (favoritesRes.success && Array.isArray((favoritesRes as any).data)) {
                setProspectQueryFavorites(
                    ((favoritesRes as any).data || []).map((favorite: any) => {
                        const rawQueryText = String(favorite.queryText || '').trim()
                        const parsedBuilder = parseBuilderQueryConfig(rawQueryText)
                        return {
                            id: String(favorite.id),
                            name: String(favorite.name || '').trim() || 'Favorito sin nombre',
                            queryText: rawQueryText,
                            displayText: parsedBuilder
                                ? describeBuilderQueryConfig(parsedBuilder, fetchedProspectOptions)
                                : rawQueryText,
                            createdAt: favorite.createdAt || null
                        }
                    })
                )
            } else if (!(favoritesRes as any).success) {
                setProspectQueryFavorites([])
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

    const getMeetingsHeld = (row: any) => Number(row?.meetingsHeldCount || 0)
    const getMeetingsPending = (row: any) => Number(row?.meetingsPendingCount || 0)
    const getMeetingsPresencial = (row: any) => Number(row?.meetingsPresencialCount || 0)
    const getMeetingsLlamada = (row: any) => Number(row?.meetingsLlamadaCount || 0)
    const getMeetingsZoom = (row: any) => Number(row?.meetingsVideoCount || 0)

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
            if (sortBy === 'badgesAccumulated') return (b.badgesAccumulated || 0) - (a.badgesAccumulated || 0)
            if (sortBy === 'totalMedals') return b.totalMedals - a.totalMedals
            if (sortBy === 'gold') return b.medals.gold - a.medals.gold
            if (sortBy === 'silver') return b.medals.silver - a.medals.silver
            if (sortBy === 'bronze') return b.medals.bronze - a.medals.bronze
            if (sortBy === 'preLeadsDay') return b.avgPreLeadsPerDay - a.avgPreLeadsPerDay
            if (sortBy === 'convertedMonth') return b.avgConvertedPreLeadsPerMonth - a.avgConvertedPreLeadsPerMonth
            if (sortBy === 'companyMonth') return b.avgCompaniesPerMonth - a.avgCompaniesPerMonth
            if (sortBy === 'closedProjects') return (b.closedProjectsCount || 0) - (a.closedProjectsCount || 0)
            if (sortBy === 'distinctClosedProjects') return (b.closedDistinctProjectsCount || 0) - (a.closedDistinctProjectsCount || 0)
            if (sortBy === 'tenure') return b.tenureMonths - a.tenureMonths
            if (sortBy === 'age') return (b.age || 0) - (a.age || 0)
            if (sortBy === 'growth') return b.growth - a.growth
            if (sortBy === 'efficiency') return b.medalRatio - a.medalRatio
            if (sortBy === 'meetings') return a.meetingsPerClose - b.meetingsPerClose // Lower is better
            if (sortBy === 'meetingsHeld') return getMeetingsHeld(b) - getMeetingsHeld(a)
            if (sortBy === 'meetingsPending') return getMeetingsPending(b) - getMeetingsPending(a)
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
                desc: `El equipo registra en promedio ${avgPreLeadsPerDayTeam.toFixed(2)} suspects por día por vendedor.`,
                icon: Calendar,
                color: 'purple'
            },
            {
                title: 'Conversión Operativa',
                desc: `Promedio de ${avgConvertedPerMonthTeam.toFixed(2)} conversiones de suspect a lead por mes por vendedor.`,
                icon: CheckCircle,
                color: 'emerald'
            },
            {
                title: 'Velocidad de Conversión',
                desc: `Tiempo promedio de conversión suspect → lead: ${avgConversionLagTeam.toFixed(1)} días.`,
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

    const currentBuilderConfig = useMemo<ProspectBuilderConfig>(() => ({
        metric: builderMetric,
        groupBy: builderGroupBy,
        sortDirection: builderSortDirection,
        topN: builderTopN,
        period: builderPeriod,
        industry: builderIndustryFilter,
        companySize: builderCompanySizeFilter,
        roleAreaId: builderRoleAreaFilter,
        outcomeFilter: builderOutcomeFilter,
        dateFilterMode: builderDateFilterMode,
        rangeGranularity: builderRangeGranularity,
        selectedMonths: builderSelectedMonths,
        monthRangeStart: builderMonthRangeStart,
        monthRangeEnd: builderMonthRangeEnd,
        dayRangeStart: builderDayRangeStart,
        dayRangeEnd: builderDayRangeEnd,
        forecastMetrics: activeForecastMetrics
    }), [
        builderMetric,
        builderGroupBy,
        builderSortDirection,
        builderTopN,
        builderPeriod,
        builderIndustryFilter,
        builderCompanySizeFilter,
        builderRoleAreaFilter,
        builderOutcomeFilter,
        builderDateFilterMode,
        builderRangeGranularity,
        builderSelectedMonths,
        builderMonthRangeStart,
        builderMonthRangeEnd,
        builderDayRangeStart,
        builderDayRangeEnd,
        activeForecastMetrics
    ])

    const currentBuilderSummary = useMemo(
        () => describeBuilderQueryConfig(currentBuilderConfig, prospectOptions),
        [currentBuilderConfig, prospectOptions]
    )
    const effectiveBuilderMetric = useMemo<ProspectBuilderMetric>(
        () => activeForecastMetrics[0] || builderMetric,
        [activeForecastMetrics, builderMetric]
    )
    const builderSortLabels = useMemo(
        () => getBuilderSortLabels(effectiveBuilderMetric),
        [effectiveBuilderMetric]
    )
    const activeForecastMetricsBySource = useMemo(() => ({
        forecast: activeForecastMetrics.filter((metric) => FORECAST_SOURCE_METRIC_SETS.forecast.has(metric)),
        real: activeForecastMetrics.filter((metric) => FORECAST_SOURCE_METRIC_SETS.real.has(metric)),
        compare: activeForecastMetrics.filter((metric) => FORECAST_SOURCE_METRIC_SETS.compare.has(metric))
    }), [activeForecastMetrics])
    const visibleForecastMetricGroups = useMemo(
        () => FORECAST_METRIC_LAYOUT[forecastMetricSourceView],
        [forecastMetricSourceView]
    )
    const availableBuilderMonths = useMemo<Array<{ value: string, label: string }>>(() => {
        const monthKeys = new Set<string>()
        prospectRows.forEach((row) => {
            const createdMonth = getMonthKeyFromDateValue(row.createdAt)
            const forecastMonth = getMonthKeyFromDateValue(row.forecastCloseDate)
            const realMonth = getMonthKeyFromDateValue(row.realClosedAt)
            if (createdMonth) monthKeys.add(createdMonth)
            if (forecastMonth) monthKeys.add(forecastMonth)
            if (realMonth) monthKeys.add(realMonth)
        })

        const mergedMonthKeys = new Set<string>(monthKeys)
        normalizeBuilderMonthSelection(builderSelectedMonths).forEach((monthKey) => mergedMonthKeys.add(monthKey))
        const selectedRangeMonths = [normalizeMonthKey(builderMonthRangeStart), normalizeMonthKey(builderMonthRangeEnd)]
            .filter((monthKey): monthKey is string => !!monthKey)
        selectedRangeMonths.forEach((monthKey) => mergedMonthKeys.add(monthKey))

        return Array.from(mergedMonthKeys)
            .sort((a, b) => b.localeCompare(a))
            .map((monthKey) => ({
                value: monthKey,
                label: formatMonthKeyLabel(monthKey)
            }))
    }, [prospectRows, builderSelectedMonths, builderMonthRangeStart, builderMonthRangeEnd])
    const hasDateFilterApplied = useMemo(() => {
        if (builderDateFilterMode === 'preset') return builderPeriod !== 'all'
        if (builderDateFilterMode === 'months') return normalizeBuilderMonthSelection(builderSelectedMonths).length > 0
        if (builderRangeGranularity === 'day') {
            return !!(normalizeDayKey(builderDayRangeStart) || normalizeDayKey(builderDayRangeEnd))
        }
        return !!(normalizeMonthKey(builderMonthRangeStart) || normalizeMonthKey(builderMonthRangeEnd))
    }, [
        builderDateFilterMode,
        builderRangeGranularity,
        builderPeriod,
        builderSelectedMonths,
        builderMonthRangeStart,
        builderMonthRangeEnd,
        builderDayRangeStart,
        builderDayRangeEnd
    ])

    const quickAnswerChartRows = useMemo(() => {
        const source = prospectAnswer?.topBreakdown || []
        return source.slice(0, 10).map((item) => {
            const numericValue = parseBreakdownNumericValue(item)
            return {
                label: item.label,
                numericValue,
                valueText: item.valueText || item.count.toLocaleString('es-MX')
            }
        })
    }, [prospectAnswer])

    const quickAnswerChartMax = useMemo(() => {
        return quickAnswerChartRows.reduce((max, row) => Math.max(max, row.numericValue), 0)
    }, [quickAnswerChartRows])

    const activeForecastMetricCharts = useMemo(() => {
        return activeForecastMetricAnswers.map((item) => {
            const rows = (item.answer.topBreakdown || []).slice(0, 10).map((entry) => {
                const numericValue = parseBreakdownNumericValue(entry)
                return {
                    label: entry.label,
                    numericValue,
                    valueText: entry.valueText || entry.count.toLocaleString('es-MX')
                }
            })
            const maxValue = rows.reduce((max, row) => Math.max(max, row.numericValue), 0)
            return {
                metric: item.metric,
                metricLabel: getBuilderMetricLabel(item.metric),
                answer: item.answer,
                rows,
                maxValue
            }
        })
    }, [activeForecastMetricAnswers])

    const runProspectQuestion = (rawQuestion?: string) => {
        const candidate = String(rawQuestion ?? prospectQuestionInput ?? '').trim()
        setProspectQuestionInput(candidate)
        const answer = answerProspectQuestion(candidate, prospectRows, prospectOptions)
        setProspectAnswer(answer)
        setActiveForecastMetricAnswers([])
    }

    const toggleForecastMetric = (metric: ProspectBuilderMetric) => {
        setActiveForecastMetrics((prev) => (
            prev.includes(metric)
                ? prev.filter((item) => item !== metric)
                : [...prev, metric]
        ))
        setActiveForecastMetricAnswers([])
    }

    const toggleBuilderSelectedMonth = (monthKey: string) => {
        const normalized = normalizeMonthKey(monthKey)
        if (!normalized) return
        setBuilderSelectedMonths((prev) => {
            const normalizedPrev = normalizeBuilderMonthSelection(prev)
            if (normalizedPrev.includes(normalized)) {
                return normalizedPrev.filter((value) => value !== normalized)
            }
            return [...normalizedPrev, normalized].sort()
        })
        setActiveForecastMetricAnswers([])
    }

    const openDateInputPicker = (input: HTMLInputElement | null) => {
        if (!input) return
        const nativeInput = input as HTMLInputElement & { showPicker?: () => void }
        if (typeof nativeInput.showPicker === 'function') {
            try {
                nativeInput.showPicker()
                return
            } catch {
                // Fallback for browsers that block showPicker unless triggered by direct user gesture.
            }
        }
        input.focus()
        input.click()
    }

    const clearBuilderDateFilters = () => {
        setBuilderPeriod(PROSPECT_DEFAULT_BUILDER_CONFIG.period)
        setBuilderRangeGranularity(PROSPECT_DEFAULT_BUILDER_CONFIG.rangeGranularity)
        setBuilderSelectedMonths([])
        setBuilderMonthRangeStart('')
        setBuilderMonthRangeEnd('')
        setBuilderDayRangeStart('')
        setBuilderDayRangeEnd('')
        setActiveForecastMetricAnswers([])
    }

    const applyBuilderConfig = (config: ProspectBuilderConfig) => {
        const parsedForecastMetrics = normalizeForecastMetricSelection(config.forecastMetrics)
        const fallbackForecastMetrics = parsedForecastMetrics.length > 0
            ? parsedForecastMetrics
            : (FORECAST_BUILDER_METRIC_SET.has(config.metric) ? [config.metric] : [])
        const inferredSourceFromMetrics = fallbackForecastMetrics.length > 0
            ? getForecastMetricSource(fallbackForecastMetrics[0]) || 'forecast'
            : null
        const nextBaseMetric = FORECAST_BUILDER_METRIC_SET.has(config.metric)
            ? PROSPECT_DEFAULT_BUILDER_CONFIG.metric
            : config.metric

        setBuilderMetric(nextBaseMetric)
        setBuilderGroupBy(config.groupBy)
        setBuilderSortDirection(config.sortDirection)
        setBuilderTopN(Math.max(1, Math.min(50, Number(config.topN || PROSPECT_DEFAULT_BUILDER_CONFIG.topN))))
        setBuilderPeriod(config.period)
        setBuilderIndustryFilter(config.industry || 'all')
        setBuilderCompanySizeFilter(config.companySize || 'all')
        setBuilderRoleAreaFilter(config.roleAreaId || 'all')
        setBuilderOutcomeFilter(config.outcomeFilter)
        setBuilderDateFilterMode(config.dateFilterMode)
        setBuilderRangeGranularity(config.rangeGranularity === 'day' ? 'day' : 'month')
        setBuilderSelectedMonths(normalizeBuilderMonthSelection(config.selectedMonths))
        setBuilderMonthRangeStart(normalizeMonthKey(config.monthRangeStart) || '')
        setBuilderMonthRangeEnd(normalizeMonthKey(config.monthRangeEnd) || '')
        setBuilderDayRangeStart(normalizeDayKey(config.dayRangeStart) || '')
        setBuilderDayRangeEnd(normalizeDayKey(config.dayRangeEnd) || '')
        if (inferredSourceFromMetrics) setForecastMetricSourceView(inferredSourceFromMetrics)
        setActiveForecastMetrics(fallbackForecastMetrics)
    }

    const runProspectBuilder = (overrideConfig?: ProspectBuilderConfig) => {
        const rawConfig = overrideConfig || currentBuilderConfig
        const parsedForecastMetrics = normalizeForecastMetricSelection(rawConfig.forecastMetrics)
        const fallbackForecastMetrics = parsedForecastMetrics.length > 0
            ? parsedForecastMetrics
            : (FORECAST_BUILDER_METRIC_SET.has(rawConfig.metric) ? [rawConfig.metric] : [])
        const effectiveMetric = fallbackForecastMetrics[0] || rawConfig.metric
        const runtimeConfig: ProspectBuilderConfig = {
            ...rawConfig,
            metric: effectiveMetric,
            forecastMetrics: fallbackForecastMetrics
        }
        const summary = describeBuilderQueryConfig(runtimeConfig, prospectOptions)
        setProspectQuestionInput(summary)

        if (fallbackForecastMetrics.length > 0) {
            const answers = fallbackForecastMetrics.map((metric) => ({
                metric,
                answer: answerProspectBuilderQuery(
                    { ...runtimeConfig, metric },
                    prospectRows,
                    prospectOptions
                )
            }))
            setActiveForecastMetricAnswers(answers)
            setProspectAnswer(answers[0]?.answer || answerProspectBuilderQuery(runtimeConfig, prospectRows, prospectOptions))
            return
        }

        const answer = answerProspectBuilderQuery(runtimeConfig, prospectRows, prospectOptions)
        setProspectAnswer(answer)
        setActiveForecastMetricAnswers([])
    }

    useEffect(() => {
        if (!prospectRows.length) return
        if (prospectAnswer) return
        runProspectBuilder()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [prospectRows.length])

    const handleRunProspectPreset = (preset: ProspectQueryPreset) => {
        const parsedBuilder = parseBuilderQueryConfig(preset.queryText)
        if (parsedBuilder) {
            applyBuilderConfig(parsedBuilder)
            runProspectBuilder(parsedBuilder)
            return
        }
        runProspectQuestion(preset.queryText)
    }

    const handleRunProspectFavorite = (favorite: ProspectQueryFavorite) => {
        const parsedBuilder = parseBuilderQueryConfig(favorite.queryText)
        if (parsedBuilder) {
            applyBuilderConfig(parsedBuilder)
            runProspectBuilder(parsedBuilder)
            return
        }
        runProspectQuestion(favorite.queryText)
    }

    const handleSaveProspectPreset = async () => {
        const queryText = serializeBuilderQueryConfig(currentBuilderConfig)
        const querySummary = currentBuilderSummary
        if (!queryText) {
            alert('Configura la consulta antes de guardar un preset.')
            return
        }

        const fallbackName = querySummary.length > 60 ? `${querySummary.slice(0, 60)}...` : querySummary
        const presetName = String(prospectPresetNameInput || '').trim() || fallbackName
        if (!presetName) {
            alert('Define un nombre para guardar el preset.')
            return
        }

        if (prospectQueryPresets.some((preset) => preset.name.trim().toLowerCase() === presetName.toLowerCase())) {
            alert('Ya existe un preset con ese nombre. Usa otro nombre para evitar confusiones.')
            return
        }

        setIsSavingProspectPreset(true)
        try {
            const result = await createAdminProspectQueryPreset({ name: presetName, queryText })
            if (!result.success || !(result as any).data) {
                alert((result as any).error || 'No se pudo guardar el preset.')
                return
            }
            const created = (result as any).data
            const createdQueryText = String(created.queryText || '').trim()
            const createdBuilder = parseBuilderQueryConfig(createdQueryText)
            const normalized: ProspectQueryPreset = {
                id: String(created.id),
                name: String(created.name || '').trim() || 'Preset sin nombre',
                queryText: createdQueryText,
                displayText: createdBuilder
                    ? describeBuilderQueryConfig(createdBuilder, prospectOptions)
                    : createdQueryText,
                createdAt: created.createdAt || null,
                createdByName: String(created.createdByName || '').trim() || null
            }
            setProspectQueryPresets((prev) => [normalized, ...prev.filter((item) => item.id !== normalized.id)])
            setProspectQuestionInput(querySummary)
            setProspectPresetNameInput('')
        } catch (error: any) {
            alert(error?.message || 'Error al guardar preset.')
        } finally {
            setIsSavingProspectPreset(false)
        }
    }

    const handleDeleteProspectPreset = async (presetId: string) => {
        const safeId = String(presetId || '').trim()
        if (!safeId) return
        const shouldDelete = window.confirm('¿Eliminar este preset compartido para admins?')
        if (!shouldDelete) return

        setDeletingPresetId(safeId)
        try {
            const result = await deleteAdminProspectQueryPreset(safeId)
            if (!result.success) {
                alert((result as any).error || 'No se pudo eliminar el preset.')
                return
            }
            setProspectQueryPresets((prev) => prev.filter((item) => item.id !== safeId))
        } catch (error: any) {
            alert(error?.message || 'Error al eliminar preset.')
        } finally {
            setDeletingPresetId(null)
        }
    }

    const handleSaveProspectFavorite = async () => {
        const queryText = serializeBuilderQueryConfig(currentBuilderConfig)
        const querySummary = currentBuilderSummary
        if (!queryText) {
            alert('Configura la consulta antes de guardar un favorito.')
            return
        }

        const fallbackName = querySummary.length > 60 ? `${querySummary.slice(0, 60)}...` : querySummary
        const favoriteName = String(prospectFavoriteNameInput || '').trim() || fallbackName
        if (!favoriteName) {
            alert('Define un nombre para guardar el favorito.')
            return
        }

        if (prospectQueryFavorites.some((favorite) => favorite.name.trim().toLowerCase() === favoriteName.toLowerCase())) {
            alert('Ya tienes un favorito con ese nombre. Usa otro para evitar confusiones.')
            return
        }

        setIsSavingProspectFavorite(true)
        try {
            const result = await createMyAdminProspectQueryFavorite({ name: favoriteName, queryText })
            if (!result.success || !(result as any).data) {
                alert((result as any).error || 'No se pudo guardar el favorito.')
                return
            }
            const created = (result as any).data
            const createdQueryText = String(created.queryText || '').trim()
            const createdBuilder = parseBuilderQueryConfig(createdQueryText)
            const normalized: ProspectQueryFavorite = {
                id: String(created.id),
                name: String(created.name || '').trim() || 'Favorito sin nombre',
                queryText: createdQueryText,
                displayText: createdBuilder
                    ? describeBuilderQueryConfig(createdBuilder, prospectOptions)
                    : createdQueryText,
                createdAt: created.createdAt || null
            }
            setProspectQueryFavorites((prev) => [normalized, ...prev.filter((item) => item.id !== normalized.id)])
            setProspectQuestionInput(querySummary)
            setProspectFavoriteNameInput('')
        } catch (error: any) {
            alert(error?.message || 'Error al guardar favorito.')
        } finally {
            setIsSavingProspectFavorite(false)
        }
    }

    const handleDeleteProspectFavorite = async (favoriteId: string) => {
        const safeId = String(favoriteId || '').trim()
        if (!safeId) return
        const shouldDelete = window.confirm('¿Eliminar este favorito personal?')
        if (!shouldDelete) return

        setDeletingFavoriteId(safeId)
        try {
            const result = await deleteMyAdminProspectQueryFavorite(safeId)
            if (!result.success) {
                alert((result as any).error || 'No se pudo eliminar el favorito.')
                return
            }
            setProspectQueryFavorites((prev) => prev.filter((item) => item.id !== safeId))
        } catch (error: any) {
            alert(error?.message || 'Error al eliminar favorito.')
        } finally {
            setDeletingFavoriteId(null)
        }
    }

    const exportProspectAnswerCsv = () => {
        if (!prospectAnswer) {
            alert('Primero genera una respuesta para exportar.')
            return
        }
        const generatedAt = new Date()
        const rows = (prospectAnswer.topBreakdown && prospectAnswer.topBreakdown.length > 0)
            ? prospectAnswer.topBreakdown
            : [{ label: '', count: 0, valueText: '' }]
        const headers = [
            'generated_at',
            'question',
            'answer',
            'metric',
            'filtered_count',
            'sample_count',
            'filter_company_size',
            'filter_industry',
            'filter_role_area',
            'filter_period',
            'breakdown_label',
            'breakdown_count',
            'breakdown_value'
        ]
        const lines = rows.map((row) => [
            generatedAt.toISOString(),
            prospectQuestionInput || '',
            prospectAnswer.message || '',
            prospectAnswer.metric || '',
            prospectAnswer.filteredCount ?? '',
            prospectAnswer.sampleCount ?? '',
            prospectAnswer.filters?.companySize || '',
            prospectAnswer.filters?.industry || '',
            prospectAnswer.filters?.roleArea || '',
            prospectAnswer.filters?.period || '',
            row.label || '',
            row.count ?? '',
            row.valueText || ''
        ])

        const csvContent = [
            headers.map(csvCell).join(','),
            ...lines.map((line) => line.map(csvCell).join(','))
        ].join('\n')

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = `prospect-query-${generatedAt.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`
        document.body.appendChild(anchor)
        anchor.click()
        document.body.removeChild(anchor)
        URL.revokeObjectURL(url)
    }

    const exportProspectAnswerPdf = () => {
        if (!prospectAnswer) {
            alert('Primero genera una respuesta para exportar.')
            return
        }
        const generatedAt = new Date()
        const breakdownRows = prospectAnswer.topBreakdown || []
        const popup = window.open('', '_blank', 'width=960,height=1200')
        if (!popup) {
            alert('Tu navegador bloqueó la ventana de impresión. Habilita popups para exportar PDF.')
            return
        }

        const breakdownHtml = breakdownRows.length > 0
            ? `
                <table style="width:100%; border-collapse: collapse; margin-top: 12px;">
                    <thead>
                        <tr>
                            <th style="text-align:left; padding:8px; border:1px solid #d1d5db;">Segmento</th>
                            <th style="text-align:right; padding:8px; border:1px solid #d1d5db;">Valor</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${breakdownRows.map((row) => `
                            <tr>
                                <td style="padding:8px; border:1px solid #d1d5db;">${escapeHtml(row.label)}</td>
                                <td style="padding:8px; border:1px solid #d1d5db; text-align:right;">${escapeHtml(row.valueText || String(row.count || 0))}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `
            : '<p style="margin-top:12px; color:#6b7280;">Sin desglose adicional.</p>'

        popup.document.write(`
            <!doctype html>
            <html lang="es">
            <head>
                <meta charset="utf-8" />
                <title>Reporte de Consulta de Prospectos</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 28px; color: #111827; }
                    h1 { margin: 0 0 10px 0; font-size: 24px; }
                    h2 { margin: 22px 0 8px 0; font-size: 16px; }
                    .meta { font-size: 12px; color: #6b7280; margin-bottom: 16px; }
                    .box { border: 1px solid #d1d5db; border-radius: 10px; padding: 14px; background: #f9fafb; }
                    .filters { margin-top: 12px; font-size: 12px; color: #374151; }
                    .filters span { display: inline-block; margin-right: 10px; margin-top: 6px; }
                </style>
            </head>
            <body>
                <h1>Reporte de Consulta de Prospectos</h1>
                <p class="meta">Generado: ${escapeHtml(generatedAt.toLocaleString('es-MX'))}</p>
                <h2>Pregunta</h2>
                <div class="box">${escapeHtml(prospectQuestionInput || '')}</div>
                <h2>Respuesta</h2>
                <div class="box">${escapeHtml(prospectAnswer.message || '')}</div>
                <div class="filters">
                    <span>Leads filtrados: ${escapeHtml(String(prospectAnswer.filteredCount ?? 0))}</span>
                    <span>Muestra válida: ${escapeHtml(String(prospectAnswer.sampleCount ?? 0))}</span>
                    ${prospectAnswer.filters?.companySize ? `<span>Tamaño: ${escapeHtml(prospectAnswer.filters.companySize)}</span>` : ''}
                    ${prospectAnswer.filters?.industry ? `<span>Industria: ${escapeHtml(prospectAnswer.filters.industry)}</span>` : ''}
                    ${prospectAnswer.filters?.roleArea ? `<span>Área: ${escapeHtml(prospectAnswer.filters.roleArea)}</span>` : ''}
                    ${prospectAnswer.filters?.period ? `<span>Periodo: ${escapeHtml(prospectAnswer.filters.period)}</span>` : ''}
                </div>
                <h2>Desglose</h2>
                ${breakdownHtml}
            </body>
            </html>
        `)
        popup.document.close()
        popup.focus()
        setTimeout(() => {
            popup.print()
            popup.close()
        }, 250)
    }

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
                    <div className='flex flex-col md:flex-row md:items-center justify-between gap-6'>
                        <div className='flex items-center gap-6'>
                            <div className='ah-icon-card'>
                                <BarChart3 size={34} strokeWidth={1.9} />
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

                    {/* Insights Grid */}
                    <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
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
                                    <div className='ah-icon-card ah-icon-card-sm'>
                                        <insight.icon size={20} strokeWidth={2} />
                                    </div>
                                    <div className='space-y-2'>
                                        <h3 className='font-black text-lg' style={{ color: 'var(--text-primary)' }}>{insight.title}</h3>
                                        <p className='font-medium leading-relaxed text-sm opacity-80' style={{ color: 'var(--text-secondary)' }}>{insight.desc}</p>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    {showGeneralView && (
                        <div className='rounded-[32px] border p-7 shadow-sm space-y-5' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                            <div className='flex items-start gap-4'>
                                <div className='ah-icon-card ah-icon-card-sm'>
                                    <Search size={20} strokeWidth={2} />
                                </div>
                                <div className='space-y-1'>
                                    <h2 className='text-xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>Consultas Rápidas de Prospectos</h2>
                                    <p className='text-sm font-medium' style={{ color: 'var(--text-secondary)' }}>
                                        Selecciona métrica, agrupación y filtros para responder preguntas de negocio en segundos.
                                    </p>
                                </div>
                            </div>

                            <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3'>
                                <select
                                    value={builderMetric}
                                    onChange={(e) => setBuilderMetric(e.target.value as ProspectBuilderMetric)}
                                    className='w-full px-3 py-2 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all'
                                    style={{ borderColor: 'var(--card-border)', background: 'var(--background)', color: 'var(--text-primary)' }}
                                >
                                    {PROSPECT_BUILDER_BASE_METRIC_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                                <select
                                    value={builderGroupBy}
                                    onChange={(e) => setBuilderGroupBy(e.target.value as ProspectBuilderGroupBy)}
                                    className='w-full px-3 py-2 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all'
                                    style={{ borderColor: 'var(--card-border)', background: 'var(--background)', color: 'var(--text-primary)' }}
                                >
                                    {PROSPECT_BUILDER_GROUP_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                                <select
                                    value={builderSortDirection}
                                    onChange={(e) => setBuilderSortDirection(e.target.value as ProspectBuilderSort)}
                                    className='w-full px-3 py-2 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all'
                                    style={{ borderColor: 'var(--card-border)', background: 'var(--background)', color: 'var(--text-primary)' }}
                                >
                                    <option value='desc'>{builderSortLabels.desc}</option>
                                    <option value='asc'>{builderSortLabels.asc}</option>
                                </select>
                                <select
                                    value={String(builderTopN)}
                                    onChange={(e) => setBuilderTopN(Math.max(1, Number(e.target.value || PROSPECT_DEFAULT_BUILDER_CONFIG.topN)))}
                                    disabled={builderGroupBy === 'none'}
                                    className='w-full px-3 py-2 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all disabled:opacity-60'
                                    style={{ borderColor: 'var(--card-border)', background: 'var(--background)', color: 'var(--text-primary)' }}
                                >
                                    {PROSPECT_BUILDER_TOP_N_OPTIONS.map((value) => (
                                        <option key={value} value={value}>{`Top ${value}`}</option>
                                    ))}
                                </select>
                                <select
                                    value={builderPeriod}
                                    onChange={(e) => setBuilderPeriod(e.target.value as ProspectBuilderPeriod)}
                                    disabled={builderDateFilterMode !== 'preset'}
                                    className='w-full px-3 py-2 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all disabled:opacity-60'
                                    style={{ borderColor: 'var(--card-border)', background: 'var(--background)', color: 'var(--text-primary)' }}
                                >
                                    {PROSPECT_BUILDER_PERIOD_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div className='rounded-2xl border p-4 space-y-3' style={{ borderColor: 'var(--card-border)', background: 'var(--background)' }}>
                                <div className='flex flex-col md:flex-row md:items-center md:justify-between gap-2'>
                                    <p className='text-[11px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)' }}>
                                        Filtro de Fechas para Análisis Histórico
                                    </p>
                                    <button
                                        type='button'
                                        onClick={clearBuilderDateFilters}
                                        disabled={!hasDateFilterApplied}
                                        className='ah-toggle-pill ah-accent-hover-surface px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider disabled:opacity-50'
                                    >
                                        Limpiar fechas
                                    </button>
                                </div>

                                <div className='grid grid-cols-1 md:grid-cols-4 gap-3'>
                                    <select
                                        value={builderDateFilterMode}
                                        onChange={(e) => {
                                            setBuilderDateFilterMode(e.target.value as ProspectBuilderDateFilterMode)
                                            setActiveForecastMetricAnswers([])
                                        }}
                                        className='w-full px-3 py-2 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all'
                                        style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)', color: 'var(--text-primary)' }}
                                    >
                                        {PROSPECT_BUILDER_DATE_FILTER_MODE_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                    </select>
                                    {builderDateFilterMode === 'range' && (
                                        <>
                                            <select
                                                value={builderRangeGranularity}
                                                onChange={(e) => {
                                                    setBuilderRangeGranularity(e.target.value as ProspectBuilderRangeGranularity)
                                                    setActiveForecastMetricAnswers([])
                                                }}
                                                className='w-full px-3 py-2 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all'
                                                style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)', color: 'var(--text-primary)' }}
                                            >
                                                {PROSPECT_BUILDER_RANGE_GRANULARITY_OPTIONS.map((option) => (
                                                    <option key={option.value} value={option.value}>{option.label}</option>
                                                ))}
                                            </select>
                                            {builderRangeGranularity === 'month' ? (
                                                <>
                                                    <select
                                                        value={builderMonthRangeStart}
                                                        onChange={(e) => {
                                                            setBuilderMonthRangeStart(e.target.value)
                                                            setActiveForecastMetricAnswers([])
                                                        }}
                                                        className='w-full px-3 py-2 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all'
                                                        style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)', color: 'var(--text-primary)' }}
                                                        aria-label='Seleccionar mes inicial del rango'
                                                    >
                                                        <option value=''>Seleccionar mes inicial</option>
                                                        {availableBuilderMonths.map((month) => {
                                                            const disabled = !!builderMonthRangeEnd && month.value > builderMonthRangeEnd
                                                            return (
                                                                <option key={`range-start-${month.value}`} value={month.value} disabled={disabled}>
                                                                    {month.label}
                                                                </option>
                                                            )
                                                        })}
                                                    </select>
                                                    <select
                                                        value={builderMonthRangeEnd}
                                                        onChange={(e) => {
                                                            setBuilderMonthRangeEnd(e.target.value)
                                                            setActiveForecastMetricAnswers([])
                                                        }}
                                                        className='w-full px-3 py-2 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all'
                                                        style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)', color: 'var(--text-primary)' }}
                                                        aria-label='Seleccionar mes final del rango'
                                                    >
                                                        <option value=''>Seleccionar mes final</option>
                                                        {availableBuilderMonths.map((month) => {
                                                            const disabled = !!builderMonthRangeStart && month.value < builderMonthRangeStart
                                                            return (
                                                                <option key={`range-end-${month.value}`} value={month.value} disabled={disabled}>
                                                                    {month.label}
                                                                </option>
                                                            )
                                                        })}
                                                    </select>
                                                </>
                                            ) : (
                                                <>
                                                    <div className='grid grid-cols-[1fr_auto] gap-2'>
                                                        <input
                                                            ref={dayRangeStartInputRef}
                                                            type='date'
                                                            value={builderDayRangeStart}
                                                            max={builderDayRangeEnd || undefined}
                                                            onChange={(e) => {
                                                                setBuilderDayRangeStart(e.target.value)
                                                                setActiveForecastMetricAnswers([])
                                                            }}
                                                            className='w-full px-3 py-2 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all'
                                                            style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)', color: 'var(--text-primary)' }}
                                                            aria-label='Fecha inicial del rango'
                                                        />
                                                        <button
                                                            type='button'
                                                            onClick={() => openDateInputPicker(dayRangeStartInputRef.current)}
                                                            className='ah-toggle-pill ah-accent-hover-surface px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1'
                                                            style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)', color: 'var(--text-primary)' }}
                                                            aria-label='Abrir calendario de fecha inicial'
                                                        >
                                                            <Calendar size={12} />
                                                            Inicio
                                                        </button>
                                                    </div>
                                                    <div className='grid grid-cols-[1fr_auto] gap-2'>
                                                        <input
                                                            ref={dayRangeEndInputRef}
                                                            type='date'
                                                            value={builderDayRangeEnd}
                                                            min={builderDayRangeStart || undefined}
                                                            onChange={(e) => {
                                                                setBuilderDayRangeEnd(e.target.value)
                                                                setActiveForecastMetricAnswers([])
                                                            }}
                                                            className='w-full px-3 py-2 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all'
                                                            style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)', color: 'var(--text-primary)' }}
                                                            aria-label='Fecha final del rango'
                                                        />
                                                        <button
                                                            type='button'
                                                            onClick={() => openDateInputPicker(dayRangeEndInputRef.current)}
                                                            className='ah-toggle-pill ah-accent-hover-surface px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1'
                                                            style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)', color: 'var(--text-primary)' }}
                                                            aria-label='Abrir calendario de fecha final'
                                                        >
                                                            <Calendar size={12} />
                                                            Fin
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </>
                                    )}
                                </div>
                                {builderDateFilterMode === 'range' && builderRangeGranularity === 'month' && (
                                    <p className='text-[11px] font-semibold' style={{ color: 'var(--text-secondary)' }}>
                                        Selecciona mes inicial y mes final desde la lista. El análisis se filtra por el mes real capturado en cada registro.
                                    </p>
                                )}
                                {builderDateFilterMode === 'range' && builderRangeGranularity === 'day' && (
                                    <p className='text-[11px] font-semibold' style={{ color: 'var(--text-secondary)' }}>
                                        Selecciona fecha exacta de inicio y fin. Ejemplo: 15 enero 2026 → 5 marzo 2026.
                                    </p>
                                )}

                                {builderDateFilterMode === 'months' && (
                                    <div className='space-y-2'>
                                        <p className='text-[11px] font-semibold' style={{ color: 'var(--text-secondary)' }}>
                                            Selecciona meses individuales (puedes activar septiembre y noviembre 2025 sin incluir los meses intermedios).
                                        </p>
                                        <div className='max-h-[180px] overflow-auto custom-scrollbar rounded-xl border p-3 flex flex-wrap gap-2'
                                            style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}
                                        >
                                            {availableBuilderMonths.length > 0 ? availableBuilderMonths.map((month) => {
                                                const isActive = builderSelectedMonths.includes(month.value)
                                                return (
                                                    <button
                                                        key={month.value}
                                                        type='button'
                                                        onClick={() => toggleBuilderSelectedMonth(month.value)}
                                                        className={`ah-toggle-pill px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-[0.12em] ${isActive ? 'ah-toggle-pill--active' : ''}`}
                                                    >
                                                        {isActive ? 'ON · ' : 'OFF · '}
                                                        {month.label}
                                                    </button>
                                                )
                                            }) : (
                                                <p className='text-xs font-semibold' style={{ color: 'var(--text-secondary)' }}>
                                                    Aún no hay meses disponibles en el dataset.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {builderDateFilterMode === 'preset' && (
                                    <p className='text-[11px] font-semibold' style={{ color: 'var(--text-secondary)' }}>
                                        Usa el selector de periodo rápido para comparar ventanas como "Este mes", "Mes pasado", "Últimos 30/90 días" o todo el historial.
                                    </p>
                                )}
                            </div>

                            <div className='rounded-2xl border p-4 space-y-3' style={{ borderColor: 'var(--card-border)', background: 'var(--background)' }}>
                                <div className='flex flex-col md:flex-row md:items-center md:justify-between gap-2'>
                                    <p className='text-[11px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)' }}>
                                        Métricas Comerciales (Pronóstico / REAL / Comparativa)
                                    </p>
                                    <div className='flex items-center gap-3'>
                                        <span className='text-[10px] font-bold uppercase tracking-wider' style={{ color: 'var(--text-secondary)' }}>
                                            {activeForecastMetrics.length > 0
                                                ? `${activeForecastMetrics.length} activas`
                                                : 'Todas desactivadas'}
                                        </span>
                                        <span className='text-[10px] font-bold uppercase tracking-wider' style={{ color: 'var(--text-secondary)' }}>
                                            P {activeForecastMetricsBySource.forecast.length} · R {activeForecastMetricsBySource.real.length} · C {activeForecastMetricsBySource.compare.length}
                                        </span>
                                        <button
                                            type='button'
                                            onClick={() => {
                                                setActiveForecastMetrics([])
                                                setActiveForecastMetricAnswers([])
                                            }}
                                            disabled={activeForecastMetrics.length === 0}
                                            className='ah-toggle-pill ah-accent-hover-surface px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider disabled:opacity-50'
                                        >
                                            Desactivar todo
                                        </button>
                                    </div>
                                </div>

                                <div className='flex flex-wrap gap-2'>
                                    {FORECAST_SOURCE_OPTIONS.map((sourceOption) => {
                                        const isActive = forecastMetricSourceView === sourceOption.value
                                        const sourceCount = activeForecastMetricsBySource[sourceOption.value].length
                                        return (
                                            <button
                                                key={sourceOption.value}
                                                type='button'
                                                onClick={() => setForecastMetricSourceView(sourceOption.value)}
                                                className={`ah-toggle-pill px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-[0.12em] ${isActive ? 'ah-toggle-pill--active' : ''}`}
                                            >
                                                {sourceOption.label} · {sourceCount}
                                            </button>
                                        )
                                    })}
                                </div>

                                <div className='flex flex-wrap gap-2'>
                                    <button
                                        type='button'
                                        onClick={() => {
                                            setActiveForecastMetrics((prev) => {
                                                const next = [...prev]
                                                FORECAST_SOURCE_METRICS[forecastMetricSourceView].forEach((metric) => {
                                                    if (!next.includes(metric)) next.push(metric)
                                                })
                                                return next
                                            })
                                            setActiveForecastMetricAnswers([])
                                        }}
                                        className='ah-toggle-pill ah-accent-hover-surface px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider'
                                    >
                                        Activar visibles
                                    </button>
                                    <button
                                        type='button'
                                        onClick={() => {
                                            const visibleSet = FORECAST_SOURCE_METRIC_SETS[forecastMetricSourceView]
                                            setActiveForecastMetrics((prev) => prev.filter((metric) => !visibleSet.has(metric)))
                                            setActiveForecastMetricAnswers([])
                                        }}
                                        className='ah-toggle-pill ah-accent-hover-surface px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider'
                                    >
                                        Desactivar visibles
                                    </button>
                                </div>

                                <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3'>
                                    {visibleForecastMetricGroups.map((group) => (
                                        <div key={group.id} className='rounded-xl border p-3 space-y-2' style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
                                            <p className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)' }}>
                                                {group.title}
                                            </p>
                                            <div className='flex flex-wrap gap-2'>
                                                {group.options.map((option) => {
                                                    const isActive = activeForecastMetrics.includes(option.metric)
                                                    return (
                                                        <button
                                                            key={option.metric}
                                                            type='button'
                                                            onClick={() => toggleForecastMetric(option.metric)}
                                                            className={`ah-toggle-pill px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-[0.12em] ${isActive ? 'ah-toggle-pill--active' : ''}`}
                                                        >
                                                            {isActive ? 'ON · ' : 'OFF · '}
                                                            {option.shortLabel}
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3'>
                                <select
                                    value={builderIndustryFilter}
                                    onChange={(e) => setBuilderIndustryFilter(e.target.value)}
                                    className='w-full px-3 py-2 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all'
                                    style={{ borderColor: 'var(--card-border)', background: 'var(--background)', color: 'var(--text-primary)' }}
                                >
                                    <option value='all'>Todas las industrias</option>
                                    {prospectOptions.industries.map((industry) => (
                                        <option key={industry} value={industry}>{industry}</option>
                                    ))}
                                </select>
                                <select
                                    value={builderCompanySizeFilter}
                                    onChange={(e) => setBuilderCompanySizeFilter(e.target.value)}
                                    className='w-full px-3 py-2 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all'
                                    style={{ borderColor: 'var(--card-border)', background: 'var(--background)', color: 'var(--text-primary)' }}
                                >
                                    <option value='all'>Todos los tamaños</option>
                                    {prospectOptions.companySizes.map((size) => (
                                        <option key={String(size.value)} value={String(size.value)}>{size.label}</option>
                                    ))}
                                </select>
                                <select
                                    value={builderRoleAreaFilter}
                                    onChange={(e) => setBuilderRoleAreaFilter(e.target.value)}
                                    className='w-full px-3 py-2 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all'
                                    style={{ borderColor: 'var(--card-border)', background: 'var(--background)', color: 'var(--text-primary)' }}
                                >
                                    <option value='all'>Todas las áreas de puesto</option>
                                    {prospectOptions.roleAreas.map((role) => (
                                        <option key={role.id} value={role.id}>{role.label}</option>
                                    ))}
                                </select>
                                <select
                                    value={builderOutcomeFilter}
                                    onChange={(e) => setBuilderOutcomeFilter(e.target.value as ProspectBuilderOutcomeFilter)}
                                    className='w-full px-3 py-2 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all'
                                    style={{ borderColor: 'var(--card-border)', background: 'var(--background)', color: 'var(--text-primary)' }}
                                >
                                    {PROSPECT_BUILDER_OUTCOME_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div className='grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 items-center'>
                                <div className='px-4 py-3 rounded-2xl border text-sm font-semibold'
                                    style={{ borderColor: 'var(--card-border)', background: 'var(--background)', color: 'var(--text-primary)' }}
                                >
                                    {currentBuilderSummary}
                                </div>
                                <button
                                    type='button'
                                    onClick={() => runProspectBuilder()}
                                    className='px-5 py-3 rounded-2xl font-black uppercase tracking-wider text-xs border border-blue-500/30 bg-blue-600 text-white hover:bg-blue-500 transition-colors cursor-pointer'
                                >
                                    Analizar
                                </button>
                            </div>

                            <div className='grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-3 items-center'>
                                <div className='grid grid-cols-1 xl:grid-cols-2 gap-2'>
                                    <div className='grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2'>
                                        <input
                                            type='text'
                                            value={prospectPresetNameInput}
                                            onChange={(e) => setProspectPresetNameInput(e.target.value)}
                                            placeholder='Nombre del preset compartido (opcional)'
                                            className='w-full px-3 py-2 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all'
                                            style={{ borderColor: 'var(--card-border)', background: 'var(--background)', color: 'var(--text-primary)' }}
                                        />
                                        <button
                                            type='button'
                                            onClick={handleSaveProspectPreset}
                                            disabled={isSavingProspectPreset}
                                            className='inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-50'
                                            style={{ borderColor: 'var(--card-border)', background: 'var(--background)', color: 'var(--text-primary)' }}
                                        >
                                            <Save size={14} />
                                            {isSavingProspectPreset ? 'Guardando...' : 'Guardar Preset'}
                                        </button>
                                    </div>
                                    <div className='grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2'>
                                        <input
                                            type='text'
                                            value={prospectFavoriteNameInput}
                                            onChange={(e) => setProspectFavoriteNameInput(e.target.value)}
                                            placeholder='Nombre del favorito personal (opcional)'
                                            className='w-full px-3 py-2 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all'
                                            style={{ borderColor: 'var(--card-border)', background: 'var(--background)', color: 'var(--text-primary)' }}
                                        />
                                        <button
                                            type='button'
                                            onClick={handleSaveProspectFavorite}
                                            disabled={isSavingProspectFavorite}
                                            className='inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-50'
                                            style={{ borderColor: 'var(--card-border)', background: 'var(--background)', color: 'var(--text-primary)' }}
                                        >
                                            <Star size={14} />
                                            {isSavingProspectFavorite ? 'Guardando...' : 'Guardar Favorito'}
                                        </button>
                                    </div>
                                </div>
                                <div className='flex flex-wrap gap-2 justify-start xl:justify-end'>
                                    <button
                                        type='button'
                                        onClick={exportProspectAnswerCsv}
                                        disabled={!prospectAnswer}
                                        className='inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-50'
                                        style={{ borderColor: 'var(--card-border)', background: 'var(--background)', color: 'var(--text-primary)' }}
                                    >
                                        <Download size={14} />
                                        Exportar CSV
                                    </button>
                                    <button
                                        type='button'
                                        onClick={exportProspectAnswerPdf}
                                        disabled={!prospectAnswer}
                                        className='inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-50'
                                        style={{ borderColor: 'var(--card-border)', background: 'var(--background)', color: 'var(--text-primary)' }}
                                    >
                                        <FileText size={14} />
                                        Exportar PDF
                                    </button>
                                </div>
                            </div>

                            {prospectQueryPresets.length > 0 && (
                                <div className='rounded-2xl border p-4 space-y-3' style={{ borderColor: 'var(--card-border)', background: 'var(--background)' }}>
                                    <p className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)' }}>
                                        Presets Compartidos ({prospectQueryPresets.length.toLocaleString('es-MX')})
                                    </p>
                                    <div className='grid grid-cols-1 md:grid-cols-2 gap-2'>
                                        {prospectQueryPresets.map((preset) => (
                                            <div key={preset.id} className='rounded-xl border px-3 py-2 flex flex-col gap-2' style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
                                                <div className='flex items-center justify-between gap-2'>
                                                    <p className='font-black text-xs truncate' style={{ color: 'var(--text-primary)' }}>{preset.name}</p>
                                                    <div className='flex items-center gap-1'>
                                                        <button
                                                            type='button'
                                                            onClick={() => handleRunProspectPreset(preset)}
                                                            className='inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wider cursor-pointer'
                                                            style={{ borderColor: 'var(--card-border)', background: 'var(--background)', color: 'var(--text-primary)' }}
                                                        >
                                                            <Play size={12} />
                                                            Usar
                                                        </button>
                                                        <button
                                                            type='button'
                                                            onClick={() => handleDeleteProspectPreset(preset.id)}
                                                            disabled={deletingPresetId === preset.id}
                                                            className='inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wider cursor-pointer disabled:opacity-50'
                                                            style={{ borderColor: 'rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.08)', color: '#ef4444' }}
                                                        >
                                                            <Trash2 size={12} />
                                                            {deletingPresetId === preset.id ? '...' : 'Borrar'}
                                                        </button>
                                                    </div>
                                                </div>
                                                <p className='text-[11px] font-semibold truncate' style={{ color: 'var(--text-secondary)' }} title={preset.displayText}>
                                                    {preset.displayText}
                                                </p>
                                                <p className='text-[10px] font-semibold' style={{ color: 'var(--text-secondary)' }}>
                                                    {preset.createdByName || 'Admin'} · {preset.createdAt ? new Date(preset.createdAt).toLocaleString('es-MX') : 'sin fecha'}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {prospectQueryFavorites.length > 0 && (
                                <div className='rounded-2xl border p-4 space-y-3' style={{ borderColor: 'var(--card-border)', background: 'var(--background)' }}>
                                    <p className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)' }}>
                                        Mis Favoritos (personales) ({prospectQueryFavorites.length.toLocaleString('es-MX')})
                                    </p>
                                    <div className='grid grid-cols-1 md:grid-cols-2 gap-2'>
                                        {prospectQueryFavorites.map((favorite) => (
                                            <div key={favorite.id} className='rounded-xl border px-3 py-2 flex flex-col gap-2' style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
                                                <div className='flex items-center justify-between gap-2'>
                                                    <p className='font-black text-xs truncate' style={{ color: 'var(--text-primary)' }}>{favorite.name}</p>
                                                    <div className='flex items-center gap-1'>
                                                        <button
                                                            type='button'
                                                            onClick={() => handleRunProspectFavorite(favorite)}
                                                            className='inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wider cursor-pointer'
                                                            style={{ borderColor: 'var(--card-border)', background: 'var(--background)', color: 'var(--text-primary)' }}
                                                        >
                                                            <Play size={12} />
                                                            Usar
                                                        </button>
                                                        <button
                                                            type='button'
                                                            onClick={() => handleDeleteProspectFavorite(favorite.id)}
                                                            disabled={deletingFavoriteId === favorite.id}
                                                            className='inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wider cursor-pointer disabled:opacity-50'
                                                            style={{ borderColor: 'rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.08)', color: '#ef4444' }}
                                                        >
                                                            <Trash2 size={12} />
                                                            {deletingFavoriteId === favorite.id ? '...' : 'Borrar'}
                                                        </button>
                                                    </div>
                                                </div>
                                                <p className='text-[11px] font-semibold truncate' style={{ color: 'var(--text-secondary)' }} title={favorite.displayText}>
                                                    {favorite.displayText}
                                                </p>
                                                <p className='text-[10px] font-semibold' style={{ color: 'var(--text-secondary)' }}>
                                                    {favorite.createdAt ? new Date(favorite.createdAt).toLocaleString('es-MX') : 'sin fecha'}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <p className='text-[11px] font-semibold' style={{ color: 'var(--text-secondary)' }}>
                                Dataset activo: {prospectRows.length.toLocaleString('es-MX')} leads | {prospectOptions.industries.length.toLocaleString('es-MX')} industrias | {prospectOptions.roleAreas.length.toLocaleString('es-MX')} áreas de puesto.
                            </p>

                            {prospectAnswer && (
                                <div
                                    className='rounded-2xl border p-5 space-y-3'
                                    style={{
                                        borderColor: prospectAnswer.success ? 'rgba(16,185,129,0.35)' : 'rgba(245,158,11,0.35)',
                                        background: prospectAnswer.success ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)'
                                    }}
                                >
                                    <p className='text-[11px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)' }}>
                                        Respuesta Analítica
                                    </p>
                                    <p className='font-black text-lg leading-snug' style={{ color: 'var(--text-primary)' }}>
                                        {prospectAnswer.message}
                                    </p>
                                    <div className='flex flex-wrap gap-3 text-[11px] font-bold' style={{ color: 'var(--text-secondary)' }}>
                                        <span>Leads filtrados: {(prospectAnswer.filteredCount || 0).toLocaleString('es-MX')}</span>
                                        <span>Muestra válida: {(prospectAnswer.sampleCount || 0).toLocaleString('es-MX')}</span>
                                        {prospectAnswer.filters?.companySize && <span>Tamaño: {prospectAnswer.filters.companySize}</span>}
                                        {prospectAnswer.filters?.industry && <span>Industria: {prospectAnswer.filters.industry}</span>}
                                        {prospectAnswer.filters?.roleArea && <span>Área: {prospectAnswer.filters.roleArea}</span>}
                                        {prospectAnswer.filters?.period && <span>Periodo: {prospectAnswer.filters.period}</span>}
                                    </div>
                                    {activeForecastMetricCharts.length > 0 && (
                                        <div className='rounded-xl border p-4 space-y-3' style={{ borderColor: 'var(--card-border)', background: 'var(--background)' }}>
                                            <p className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)' }}>
                                                Barras de Pronóstico Activas
                                            </p>
                                            <div className='space-y-4'>
                                                {activeForecastMetricCharts.map((chart) => (
                                                    <div key={chart.metric} className='rounded-xl border p-3 space-y-2' style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
                                                        <div className='flex flex-wrap items-center justify-between gap-2'>
                                                            <p className='text-[11px] font-black uppercase tracking-wider' style={{ color: 'var(--text-primary)' }}>
                                                                {chart.metricLabel}
                                                            </p>
                                                            <p className='text-[10px] font-bold uppercase tracking-widest' style={{ color: 'var(--text-secondary)' }}>
                                                                {(chart.answer.sampleCount || 0).toLocaleString('es-MX')} muestra válida
                                                            </p>
                                                        </div>
                                                        {chart.rows.length > 0 ? (
                                                            <div className='space-y-2'>
                                                                {chart.rows.map((row) => {
                                                                    const widthPct = chart.maxValue > 0
                                                                        ? Math.max(4, Math.min(100, (row.numericValue / chart.maxValue) * 100))
                                                                        : 4
                                                                    return (
                                                                        <div key={`${chart.metric}-${row.label}`} className='space-y-1'>
                                                                            <div className='flex items-center justify-between gap-2 text-[11px] font-bold'>
                                                                                <p className='truncate' style={{ color: 'var(--text-primary)' }}>{row.label}</p>
                                                                                <p style={{ color: 'var(--text-secondary)' }}>{row.valueText}</p>
                                                                            </div>
                                                                            <div className='h-2 rounded-full overflow-hidden' style={{ background: 'rgba(148,163,184,0.2)' }}>
                                                                                <div
                                                                                    className='h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400'
                                                                                    style={{ width: `${widthPct}%` }}
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                    )
                                                                })}
                                                            </div>
                                                        ) : (
                                                            <p className='text-xs font-semibold' style={{ color: 'var(--text-secondary)' }}>
                                                                Sin valores suficientes para esta métrica con los filtros actuales.
                                                            </p>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {activeForecastMetricCharts.length === 0 && quickAnswerChartRows.length > 0 && (
                                        <div className='rounded-xl border p-4 space-y-3' style={{ borderColor: 'var(--card-border)', background: 'var(--background)' }}>
                                            <p className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)' }}>
                                                Gráfica Vinculada a la Respuesta
                                            </p>
                                            <div className='space-y-2'>
                                                {quickAnswerChartRows.map((row) => {
                                                    const widthPct = quickAnswerChartMax > 0
                                                        ? Math.max(4, Math.min(100, (row.numericValue / quickAnswerChartMax) * 100))
                                                        : 4
                                                    return (
                                                        <div key={row.label} className='space-y-1'>
                                                            <div className='flex items-center justify-between gap-2 text-[11px] font-bold'>
                                                                <p className='truncate' style={{ color: 'var(--text-primary)' }}>{row.label}</p>
                                                                <p style={{ color: 'var(--text-secondary)' }}>{row.valueText}</p>
                                                            </div>
                                                            <div className='h-2 rounded-full overflow-hidden' style={{ background: 'rgba(148,163,184,0.2)' }}>
                                                                <div
                                                                    className='h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400'
                                                                    style={{ width: `${widthPct}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
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
                                <div className='ah-icon-card ah-icon-card-sm'>
                                    <TableIcon size={22} strokeWidth={2} />
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
                                    <option value="badgesAccumulated">Ordenar por: Cantidad de badges</option>
                                    <option value="totalMedals">Ordenar por: Total Medallas</option>
                                    <option value="gold">Ordenar por: Oro</option>
                                    <option value="efficiency">Ordenar por: Eficiencia (Pts/Mes)</option>
                                    <option value="preLeadsDay">Ordenar por: Suspects / Día</option>
                                    <option value="convertedMonth">Ordenar por: Conv. Suspect / Mes</option>
                                    <option value="companyMonth">Ordenar por: Empresas / Mes</option>
                                    <option value="closedProjects">Ordenar por: Proyectos cerrados</option>
                                    <option value="distinctClosedProjects">Ordenar por: Proyectos distintos cerrados</option>
                                    <option value="meetings">Ordenar por: Effort (Mtg/Close)</option>
                                    <option value="meetingsHeld">Ordenar por: Juntas realizadas</option>
                                    <option value="meetingsPending">Ordenar por: Juntas pendientes</option>
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
                                        <th className='px-8 py-5 text-center'>Suspects</th>
                                        <th className='px-8 py-5 text-center'>% Conv</th>
                                        <th className='px-8 py-5 text-center'>Empresas</th>
                                        <th className='px-8 py-5 text-center'>Proj. Cerrados</th>
                                        <th className='px-8 py-5 text-center'>Proj. Distintos</th>
                                        <th className='px-8 py-5'>Ventas Totales</th>
                                        <th className='px-8 py-5'>Crecimiento</th>
                                        <th className='px-8 py-5 text-center'>Badges Acum.</th>
                                        <th className='px-8 py-5 text-center'>Medallas</th>
                                        <th className='px-8 py-5 text-center'>Effort (Mtg/C)</th>
                                        <th className='px-8 py-5 text-center'>Juntas (R/P + Modalidad)</th>
                                        <th className='px-8 py-5 text-center'>Accuracy</th>
                                        <th className='px-8 py-5 text-center'>Top Ind.</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredData.map((item, idx) => (
                                        <tr key={item.userId} className='transition-colors group hover:bg-black/5'>
                                            <td className='px-8 py-5'>
                                                <div className='flex items-center gap-3'>
                                                    <TableEmployeeAvatar name={item.name} size='md' />
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
                                            <td className='px-8 py-5 text-center'>
                                                <span className='font-black text-sm' style={{ color: 'var(--text-primary)' }}>
                                                    {item.closedProjectsCount || 0}
                                                </span>
                                            </td>
                                            <td className='px-8 py-5 text-center'>
                                                <span className='font-black text-sm' style={{ color: 'var(--text-primary)' }}>
                                                    {item.closedDistinctProjectsCount || 0}
                                                </span>
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
                                            <td className='px-8 py-5 text-center'>
                                                <span className='font-black text-sm' style={{ color: 'var(--text-primary)' }}>
                                                    {(item.badgesAccumulated || 0).toLocaleString('es-MX')}
                                                </span>
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
                                                <div className='flex flex-col items-center gap-1'>
                                                    <span className='font-black text-sm' style={{ color: 'var(--text-primary)' }}>
                                                        R {getMeetingsHeld(item)} · P {getMeetingsPending(item)}
                                                    </span>
                                                    <span className='text-[9px] font-bold opacity-70' style={{ color: 'var(--text-secondary)' }}>
                                                        Pres {getMeetingsPresencial(item)} · Llam {getMeetingsLlamada(item)} · Zoom {getMeetingsZoom(item)}
                                                    </span>
                                                </div>
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
                    <div className='order-8 space-y-4'>
                        <div className='flex flex-col md:flex-row md:items-center md:justify-between gap-4'>
                            <div className='flex items-center gap-4'>
                                <div className='ah-icon-card ah-icon-card-sm'>
                                    <Trophy size={22} strokeWidth={2} />
                                </div>
                                <div>
                                    <h2 className='text-2xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>Registro de Empresas</h2>
                                    <p className='text-xs font-bold uppercase tracking-widest' style={{ color: 'var(--text-secondary)' }}>
                                        Historial de empresas registradas por usuarios
                                    </p>
                                </div>
                            </div>
                            <button
                                type='button'
                                onClick={() => setShowCompanyRegistry((prev) => !prev)}
                                className='inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all hover:opacity-90 cursor-pointer'
                                style={{ borderColor: 'var(--card-border)', color: 'var(--text-primary)', background: 'var(--card-bg)' }}
                            >
                                {showCompanyRegistry ? <EyeOff size={14} /> : <Eye size={14} />}
                                {showCompanyRegistry ? 'Ocultar registro' : 'Mostrar registro'}
                            </button>
                        </div>

                        {showCompanyRegistry ? (
                            <div className='rounded-[22px] border overflow-hidden max-w-5xl' style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
                                <div className='px-5 py-3 border-b flex items-center justify-between text-[10px] font-black uppercase tracking-widest' style={{ borderColor: 'var(--card-border)', color: 'var(--text-secondary)', background: 'var(--background)' }}>
                                    <span>Tabla compacta con scroll</span>
                                    <span>{companyRegistry.length.toLocaleString('es-MX')} registros</span>
                                </div>
                                <div className='max-h-[300px] overflow-auto custom-scrollbar'>
                                    <table className='w-full text-left border-collapse'>
                                        <thead className='uppercase text-[10px] font-black tracking-[0.2em]' style={{ background: 'var(--background)', color: 'var(--text-secondary)' }}>
                                            <tr>
                                                <th className='px-5 py-3'>Fecha Registro</th>
                                                <th className='px-5 py-3'>Empresa</th>
                                                <th className='px-5 py-3'>Registrada Por</th>
                                                <th className='px-5 py-3'>Industria</th>
                                                <th className='px-5 py-3'>Ubicación</th>
                                            </tr>
                                        </thead>
                                        <tbody className='divide-y' style={{ borderColor: 'var(--card-border)' }}>
                                            {companyRegistry.map((entry) => (
                                                <tr key={entry.id} className='hover:bg-black/5 transition-colors'>
                                                    <td className='px-5 py-3 font-bold text-xs' style={{ color: 'var(--text-primary)' }}>
                                                        {entry.createdAt ? new Date(entry.createdAt).toLocaleString('es-MX') : 'N/A'}
                                                    </td>
                                                    <td className='px-5 py-3 font-black text-xs' style={{ color: 'var(--text-primary)' }}>{entry.nombre}</td>
                                                    <td className='px-5 py-3 font-bold text-xs' style={{ color: 'var(--text-secondary)' }}>{entry.ownerName}</td>
                                                    <td className='px-5 py-3 font-bold text-xs' style={{ color: 'var(--text-secondary)' }}>{entry.industria}</td>
                                                    <td className='px-5 py-3 font-bold text-xs' style={{ color: 'var(--text-secondary)' }}>{entry.ubicacion}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {companyRegistry.length === 0 && (
                                    <div className='p-6 text-center font-bold text-sm' style={{ color: 'var(--text-secondary)' }}>
                                        Aún no hay registros de empresas para mostrar.
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className='rounded-2xl border border-dashed px-5 py-4 text-sm font-semibold max-w-3xl' style={{ borderColor: 'var(--card-border)', color: 'var(--text-secondary)', background: 'var(--card-bg)' }}>
                                Registro de empresas oculto. Usa <strong style={{ color: 'var(--text-primary)' }}>Mostrar registro</strong> para desplegarlo.
                            </div>
                        )}
                    </div>
                    )}

                    {/* Past Races History */}
                    {showGeneralView && (
                    <div className='order-9 space-y-6'>
                        <div className='flex items-center gap-4'>
                            <div className='ah-icon-card ah-icon-card-sm'>
                                <Trophy size={22} strokeWidth={2} />
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
