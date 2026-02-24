'use client'

export type TenureBadgeMetrics = {
    years: number
    months: number
    days: number
    totalDays: number
    nextLevelYears: number
    progressPctToNextLevel: number
}

function parseStartDateInput(startDate: string): Date | null {
    const raw = String(startDate || '').trim()
    if (!raw) return null
    const hasTime = raw.includes('T')
    const d = new Date(hasTime ? raw : `${raw}T12:00:00`)
    return Number.isNaN(d.getTime()) ? null : d
}

export function getTenureBadgeMetrics(startDate?: string | null, nowInput?: Date): TenureBadgeMetrics | null {
    if (!startDate) return null
    const start = parseStartDateInput(startDate)
    if (!start) return null
    const now = nowInput ? new Date(nowInput) : new Date()
    if (Number.isNaN(now.getTime()) || now < start) return null

    let years = now.getFullYear() - start.getFullYear()
    let months = now.getMonth() - start.getMonth()
    let days = now.getDate() - start.getDate()

    if (days < 0) {
        const prevMonthDays = new Date(now.getFullYear(), now.getMonth(), 0).getDate()
        days += prevMonthDays
        months -= 1
    }
    if (months < 0) {
        months += 12
        years -= 1
    }
    if (years < 0) return null

    const lastAnniversary = new Date(start)
    lastAnniversary.setFullYear(start.getFullYear() + years)
    const nextAnniversary = new Date(start)
    nextAnniversary.setFullYear(start.getFullYear() + years + 1)

    const elapsedMs = Math.max(0, now.getTime() - lastAnniversary.getTime())
    const spanMs = Math.max(1, nextAnniversary.getTime() - lastAnniversary.getTime())
    const progressPctToNextLevel = Math.max(0, Math.min(100, (elapsedMs / spanMs) * 100))
    const totalDays = Math.floor((now.getTime() - start.getTime()) / 86400000)

    return {
        years,
        months,
        days,
        totalDays,
        nextLevelYears: years + 1,
        progressPctToNextLevel
    }
}

export function formatTenureExactLabel(metrics: TenureBadgeMetrics | null): string {
    if (!metrics) return '-'
    const parts: string[] = []
    parts.push(`${metrics.years} año${metrics.years === 1 ? '' : 's'}`)
    parts.push(`${metrics.months} mes${metrics.months === 1 ? '' : 'es'}`)
    parts.push(`${metrics.days} día${metrics.days === 1 ? '' : 's'}`)
    return parts.join(', ')
}

