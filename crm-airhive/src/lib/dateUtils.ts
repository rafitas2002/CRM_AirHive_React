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
