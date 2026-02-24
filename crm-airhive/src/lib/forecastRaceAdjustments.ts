type ReliabilityMetricsLike = {
    probability_reliability_score?: number | null
    probability_reliability_samples?: number | null
    probability_bias_pct_signed?: number | null
    value_reliability_score?: number | null
    value_reliability_samples?: number | null
    value_bias_pct_signed?: number | null
    close_date_reliability_score?: number | null
    close_date_reliability_samples?: number | null
    close_date_bias_days_signed?: number | null
}

type ForecastRaceLeadLike = {
    probabilidad?: number | null
    valor_estimado?: number | null
    forecast_close_date?: string | null
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const toFiniteNumber = (value: unknown, fallback = 0) => {
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
}

const average = (values: number[]) => values.length > 0 ? values.reduce((acc, v) => acc + v, 0) / values.length : 0

export function computeForecastShrinkageWeight(samples: number | null | undefined, k = 8) {
    const n = Math.max(toFiniteNumber(samples, 0), 0)
    const safeK = Math.max(toFiniteNumber(k, 8), 0.0001)
    return Number((n / (n + safeK)).toFixed(6))
}

function parseUtcDateOnly(raw: string | null | undefined) {
    if (!raw) return null
    const date = new Date(`${String(raw).slice(0, 10)}T00:00:00.000Z`)
    return Number.isNaN(date.getTime()) ? null : date
}

function shiftUtcDateDays(date: Date, days: number) {
    const copy = new Date(date.getTime())
    copy.setUTCDate(copy.getUTCDate() + days)
    return copy
}

function monthDistanceUtc(a: Date, b: Date) {
    return (a.getUTCFullYear() - b.getUTCFullYear()) * 12 + (a.getUTCMonth() - b.getUTCMonth())
}

function computeMonthAlignmentFactor(adjustedCloseDate: Date | null, targetMonthDate: Date) {
    if (!adjustedCloseDate) {
        // No date forecast -> keep partial credit instead of zeroing the lead.
        return 0.7
    }

    const delta = monthDistanceUtc(adjustedCloseDate, targetMonthDate)
    if (delta === 0) return 1
    if (Math.abs(delta) === 1) return 0.25
    return 0
}

export function computeSellerForecastRaceReliability(metrics?: ReliabilityMetricsLike | null) {
    if (!metrics) return 70

    const scores = [
        clamp(toFiniteNumber(metrics.probability_reliability_score, 70), 0, 100),
        clamp(toFiniteNumber(metrics.value_reliability_score, 70), 0, 100),
        clamp(toFiniteNumber(metrics.close_date_reliability_score, 70), 0, 100)
    ]

    return average(scores)
}

export function computeAdjustedMonthlyRaceLeadValue(
    lead: ForecastRaceLeadLike,
    metrics?: ReliabilityMetricsLike | null,
    options?: {
        targetMonthDate?: Date
    }
) {
    const rawProbability = clamp(toFiniteNumber(lead.probabilidad, 0), 0, 100)
    const rawMonthlyValue = Math.max(toFiniteNumber(lead.valor_estimado, 0), 0)

    if (rawProbability <= 0 || rawMonthlyValue <= 0) return 0

    const targetMonthDate = options?.targetMonthDate ?? new Date()

    const probWeight = computeForecastShrinkageWeight(metrics?.probability_reliability_samples, 12)
    const monthlyWeight = computeForecastShrinkageWeight(metrics?.value_reliability_samples, 10)
    const dateWeight = computeForecastShrinkageWeight(metrics?.close_date_reliability_samples, 8)

    const adjustedProbability = clamp(
        rawProbability + (toFiniteNumber(metrics?.probability_bias_pct_signed, 0) * probWeight),
        0,
        100
    )

    const effectiveMonthlyBiasPct = clamp(toFiniteNumber(metrics?.value_bias_pct_signed, 0) * monthlyWeight, -50, 50)
    const adjustedMonthlyValue = Math.max(0, rawMonthlyValue * (1 + (effectiveMonthlyBiasPct / 100)))

    const rawCloseDate = parseUtcDateOnly(lead.forecast_close_date)
    const shiftedDays = Math.round(clamp(toFiniteNumber(metrics?.close_date_bias_days_signed, 0) * dateWeight, -90, 90))
    const adjustedCloseDate = rawCloseDate ? shiftUtcDateDays(rawCloseDate, shiftedDays) : null

    const monthAlignmentFactor = computeMonthAlignmentFactor(adjustedCloseDate, targetMonthDate)
    if (monthAlignmentFactor <= 0) return 0

    const sellerReliabilityAvg = computeSellerForecastRaceReliability(metrics)
    const confidenceBlend = 0.4 + (0.6 * (sellerReliabilityAvg / 100))

    return (adjustedProbability / 100) * adjustedMonthlyValue * monthAlignmentFactor * confidenceBlend
}

