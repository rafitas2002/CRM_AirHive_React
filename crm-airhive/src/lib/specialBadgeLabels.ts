export function getDealValueTierShortLabelByKey(badgeKey?: string | null): string | null {
    const key = String(badgeKey || '').trim().toLowerCase()
    if (key === 'value_1k_2k') return '1K'
    if (key === 'value_2k_5k') return '2K'
    if (key === 'value_5k_10k') return '5K'
    if (key === 'value_10k_100k' || key === 'value_10k_plus') return '10K'
    return null
}

export function normalizeDealValueTierLabel(badgeLabel?: string | null): string | null {
    const label = String(badgeLabel || '').trim().toLowerCase()
    if (!label) return null
    if (label.includes('10,000-100,000') || label.includes('10k') || label.includes('10k+')) return '10K'
    if (label.includes('5,000-9,999') || label.includes('5k-10k') || label.includes('5k')) return '5K'
    if (label.includes('2,000-4,999') || label.includes('2k-5k') || label.includes('2k')) return '2K'
    if (label.includes('1,000-1,999') || label.includes('1k-2k') || label.includes('1k')) return '1K'
    return null
}

export function getNormalizedSpecialBadgeDisplayLabel(params: {
    badgeType?: string | null
    badgeKey?: string | null
    badgeLabel?: string | null
}): string {
    const badgeType = String(params.badgeType || '').trim().toLowerCase()
    const fallback = String(params.badgeLabel || '').trim() || 'Badge especial'

    if (badgeType === 'deal_value_tier') {
        return getDealValueTierShortLabelByKey(params.badgeKey)
            || normalizeDealValueTierLabel(params.badgeLabel)
            || fallback
    }

    return fallback
}
