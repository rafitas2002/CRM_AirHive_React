/**
 * Utility to format a Date object as a local ISO string (YYYY-MM-DDTHH:mm)
 * compatible with <input type="datetime-local">.
 * Unlike toISOString(), this maintains the local timezone.
 */
export function toLocalISOString(date: Date | string | null): string {
    if (!date) return ''
    const d = typeof date === 'string' ? new Date(date) : date

    // Check if valid date
    if (isNaN(d.getTime())) return ''

    const pad = (num: number) => num.toString().padStart(2, '0')
    const year = d.getFullYear()
    const month = pad(d.getMonth() + 1)
    const day = pad(d.getDate())
    const hours = pad(d.getHours())
    const minutes = pad(d.getMinutes())

    return `${year}-${month}-${day}T${hours}:${minutes}`
}

/**
 * Creates a Date object from a local ISO string (YYYY-MM-DDTHH:mm).
 * Treats the input as being in the local timezone of the browser.
 */
export function fromLocalISOString(isoString: string): Date {
    if (!isoString) return new Date()
    return new Date(isoString)
}

/**
 * Parses a date-only string (YYYY-MM-DD) as a local calendar date.
 * Uses noon local time to avoid timezone/UTC shifts when formatting later.
 */
export function parseLocalDateOnly(dateString?: string | null): Date | null {
    const raw = String(dateString || '').trim()
    if (!raw) return null
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!match) {
        const fallback = new Date(raw)
        return Number.isNaN(fallback.getTime()) ? null : fallback
    }
    const [, y, m, d] = match
    const parsed = new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0, 0)
    return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function formatLocalDateOnly(
    dateString?: string | null,
    locale = 'es-MX',
    options?: Intl.DateTimeFormatOptions
): string {
    const parsed = parseLocalDateOnly(dateString)
    if (!parsed) return '-'
    return parsed.toLocaleDateString(locale, options)
}
