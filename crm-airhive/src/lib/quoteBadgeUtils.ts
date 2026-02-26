export function normalizeComparableName(value: unknown): string {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
}

export function isAirHiveOwnQuoteLike(input: {
    is_own_quote?: boolean | null
    quote_source?: string | null
} | null | undefined): boolean {
    if (Boolean(input?.is_own_quote)) return true

    const source = normalizeComparableName(input?.quote_source)
    if (!source) return false

    return (
        (source.includes('interna') && source.includes('airhive')) ||
        (source.includes('interna') && source.includes('air hive'))
    )
}

export function isQuoteAttributedToUser(input: {
    contributed_by?: string | null
    contributed_by_name?: string | null
    quote_author?: string | null
    quote_source?: string | null
    is_own_quote?: boolean | null
}, userId: string, fullName: string): boolean {
    if (String(input?.contributed_by || '') === String(userId || '')) return true

    const normalizedFullName = normalizeComparableName(fullName)
    if (!normalizedFullName) return false

    if (normalizeComparableName(input?.contributed_by_name) === normalizedFullName) return true

    const authorMatches = normalizeComparableName(input?.quote_author) === normalizedFullName
    return authorMatches && isAirHiveOwnQuoteLike(input)
}

export function getQuoteContributionLevelMeta(progress: number): { level: number, next: number | null } {
    const safe = Math.max(0, Number(progress || 0))
    if (safe >= 20) return { level: 8, next: null }
    if (safe >= 15) return { level: 7, next: 20 }
    if (safe >= 12) return { level: 6, next: 15 }
    if (safe >= 10) return { level: 5, next: 12 }
    if (safe >= 8) return { level: 4, next: 10 }
    if (safe >= 5) return { level: 3, next: 8 }
    if (safe >= 3) return { level: 2, next: 5 }
    if (safe >= 1) return { level: 1, next: 3 }
    return { level: 0, next: 1 }
}

export function getQuoteLikesReceivedLevelMeta(progress: number): { level: number, next: number | null } {
    const safe = Math.max(0, Number(progress || 0))
    if (safe >= 200) return { level: 8, next: null }
    if (safe >= 100) return { level: 7, next: 200 }
    if (safe >= 75) return { level: 6, next: 100 }
    if (safe >= 50) return { level: 5, next: 75 }
    if (safe >= 25) return { level: 4, next: 50 }
    if (safe >= 15) return { level: 3, next: 25 }
    if (safe >= 5) return { level: 2, next: 15 }
    if (safe >= 1) return { level: 1, next: 5 }
    return { level: 0, next: 1 }
}
