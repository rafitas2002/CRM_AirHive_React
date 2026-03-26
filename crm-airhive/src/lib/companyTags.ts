const MAX_COMPANY_TAGS = 20
const MAX_COMPANY_TAG_LENGTH = 40

function normalizeTagToken(value: unknown): string {
    return String(value ?? '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, MAX_COMPANY_TAG_LENGTH)
}

function splitRawTags(raw: unknown): string[] {
    if (Array.isArray(raw)) {
        return raw.map((value) => String(value ?? ''))
    }
    if (typeof raw === 'string') {
        return raw.split(/[,\n;]+/g)
    }
    return []
}

export function normalizeCompanyTags(raw: unknown): string[] {
    const normalized: string[] = []
    const seen = new Set<string>()

    for (const part of splitRawTags(raw)) {
        const cleaned = normalizeTagToken(part)
        if (!cleaned) continue

        const key = cleaned.toLocaleLowerCase('es-MX')
        if (seen.has(key)) continue

        seen.add(key)
        normalized.push(cleaned)

        if (normalized.length >= MAX_COMPANY_TAGS) break
    }

    return normalized
}

export function companyHasTag(rawTags: unknown, tag: string): boolean {
    const normalizedTag = normalizeTagToken(tag).toLocaleLowerCase('es-MX')
    if (!normalizedTag) return false
    return normalizeCompanyTags(rawTags).some((value) => value.toLocaleLowerCase('es-MX') === normalizedTag)
}
