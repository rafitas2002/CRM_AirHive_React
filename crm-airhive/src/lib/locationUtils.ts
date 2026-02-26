const MONTERREY_MUNICIPALITY_CANONICAL: Record<string, string> = {
    'san pedro': 'San Pedro Garza García',
    'san pedro garza garcia': 'San Pedro Garza García',
    'san pedro garza garcía': 'San Pedro Garza García',
    'santa catarina': 'Santa Catarina',
    monterrey: 'Monterrey',
    guadalupe: 'Guadalupe',
    'san nicolas': 'San Nicolás',
    'san nicolas de los garza': 'San Nicolás',
    'san nicolás': 'San Nicolás',
    'san nicolás de los garza': 'San Nicolás',
    escobedo: 'Escobedo',
    'gral escobedo': 'Escobedo',
    'gral. escobedo': 'Escobedo',
    'general escobedo': 'Escobedo',
    apodaca: 'Apodaca',
    'garcia': 'García',
    'garcía': 'García',
    juarez: 'Juárez',
    'juárez': 'Juárez',
    santiago: 'Santiago',
    pesqueria: 'Pesquería',
    'pesquería': 'Pesquería',
    'el carmen': 'El Carmen',
    allende: 'Allende',
    cadereyta: 'Cadereyta Jiménez',
    'cadereyta jimenez': 'Cadereyta Jiménez',
    'cadereyta jiménez': 'Cadereyta Jiménez',
    'cienega de flores': 'Ciénega de Flores',
    'ciénega de flores': 'Ciénega de Flores',
    'salinas victoria': 'Salinas Victoria',
    zuazua: 'General Zuazua',
    'general zuazua': 'General Zuazua'
}

export const MONTERREY_MUNICIPALITY_OPTIONS: Array<{ value: string, label: string }> = [
    { value: 'San Pedro Garza García', label: 'San Pedro' },
    { value: 'Santa Catarina', label: 'Santa Catarina' },
    { value: 'Monterrey', label: 'Monterrey (Centro)' },
    { value: 'Guadalupe', label: 'Guadalupe' },
    { value: 'San Nicolás', label: 'San Nicolás' },
    { value: 'Escobedo', label: 'Escobedo' },
    { value: 'Apodaca', label: 'Apodaca' },
    { value: 'García', label: 'García' },
    { value: 'Juárez', label: 'Juárez' },
    { value: 'Santiago', label: 'Santiago' },
    { value: 'Pesquería', label: 'Pesquería' },
    { value: 'El Carmen', label: 'El Carmen' },
    { value: 'Ciénega de Flores', label: 'Ciénega de Flores' },
    { value: 'Cadereyta Jiménez', label: 'Cadereyta Jiménez' },
    { value: 'Allende', label: 'Allende' },
    { value: 'Salinas Victoria', label: 'Salinas Victoria' },
    { value: 'General Zuazua', label: 'General Zuazua' }
]

const MONTERREY_MUNICIPALITY_OPTION_VALUES = new Set(
    MONTERREY_MUNICIPALITY_OPTIONS.map((option) => option.value)
)

const MONTERREY_MUNICIPALITY_OPTION_ORDER = new Map(
    MONTERREY_MUNICIPALITY_OPTIONS.map((option, index) => [option.value, index] as const)
)

const NUEVO_LEON_STATE_ALIASES = new Set([
    'nl',
    'n l',
    'n.l',
    'n.l.',
    'nuevo leon',
    'nuevo león'
])

function stripDiacritics(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function normalizeKey(value: string): string {
    return stripDiacritics(value)
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
}

function normalizePunctuation(value: string): string {
    return value
        .replace(/\s+/g, ' ')
        .replace(/\s*,\s*/g, ', ')
        .replace(/(?:,\s*)+$/g, '')
        .trim()
}

function normalizePrimaryCity(cityRaw: string): string {
    const key = normalizeKey(cityRaw)
    if (!key) return ''
    if (key === 'cdmx' || key === 'ciudad de mexico' || key === 'ciudad de méxico') return 'CDMX'
    if (key === 'queretaro' || key === 'queretaro, qro' || key === 'querétaro') return 'Querétaro'
    if (key === 'monterrey') return 'Monterrey'
    if (key === 'guadalajara') return 'Guadalajara'
    if (key === 'san pedro garza garcia' || key === 'san pedro garza garcía') return 'San Pedro Garza García'
    if (key === 'san nicolas de los garza' || key === 'san nicolas' || key === 'san nicolás') return 'San Nicolás de los Garza'
    if (key === 'cienega de flores' || key === 'ciénega de flores') return 'Ciénega de Flores'
    if (key === 'cadereyta' || key === 'cadereyta jimenez' || key === 'cadereyta jiménez') return 'Cadereyta Jiménez'
    if (key === 'juarez' || key === 'juárez') return 'Juárez'
    if (key === 'pesqueria' || key === 'pesquería') return 'Pesquería'
    if (key === 'gral escobedo' || key === 'gral. escobedo' || key === 'general escobedo') return 'Escobedo'
    if (key === 'zuazua' || key === 'general zuazua') return 'General Zuazua'
    return cityRaw.trim().replace(/\b\w/g, (c) => c.toUpperCase())
}

function normalizeMonterreyMunicipality(municipalityRaw: string): string {
    const key = normalizeKey(municipalityRaw)
    if (!key) return ''
    if (NUEVO_LEON_STATE_ALIASES.has(key)) return ''
    return MONTERREY_MUNICIPALITY_CANONICAL[key] || municipalityRaw.trim().replace(/\b\w/g, (c) => c.toUpperCase())
}

function normalizeLocationSecondaryPart(partRaw: string): string {
    const key = normalizeKey(partRaw)
    if (!key) return ''
    if (NUEVO_LEON_STATE_ALIASES.has(key)) return 'N.L.'
    return normalizePunctuation(partRaw)
}

export function normalizeLocationLabel(input?: string | null): string {
    const raw = String(input || '').trim()
    if (!raw) return ''

    const cleaned = normalizePunctuation(raw)
    if (!cleaned) return ''

    const cleanedKey = normalizeKey(cleaned)
    if (cleanedKey === 'otra') return ''

    let firstPartRaw = ''
    let restPartsRaw: string[] = []

    // Soporta variantes sin coma del tipo "ALLENDE NUEVO LEON" / "SAN PEDRO GARZA GARCIA N.L."
    if (!cleaned.includes(',')) {
        const stateSuffixMatch = cleaned.match(/^(.*?)(?:\s+)(n\s*\.?\s*l\s*\.?|nuevo le[oó]n)$/i)
        if (stateSuffixMatch) {
            firstPartRaw = (stateSuffixMatch[1] || '').trim()
            const suffix = (stateSuffixMatch[2] || '').trim()
            restPartsRaw = suffix ? [suffix] : []
        } else {
            const parts = cleaned.split(',').map((part) => part.trim()).filter(Boolean)
            firstPartRaw = parts[0] || ''
            restPartsRaw = parts.slice(1)
        }
    } else {
        const parts = cleaned.split(',').map((part) => part.trim()).filter(Boolean)
        firstPartRaw = parts[0] || ''
        restPartsRaw = parts.slice(1)
    }

    const city = normalizePrimaryCity(firstPartRaw)
    if (!city) return ''

    if (city === 'Monterrey') {
        const municipalityRaw = restPartsRaw[0] || ''
        const municipality = normalizeMonterreyMunicipality(municipalityRaw)
        return municipality ? `Monterrey, ${municipality}` : 'Monterrey'
    }

    if (city === 'CDMX') return 'CDMX'
    if (city === 'Guadalajara') return 'Guadalajara'
    if (city === 'Querétaro') return 'Querétaro'

    if (restPartsRaw.length === 0) return city
    const normalizedRest = restPartsRaw.map((part) => normalizeLocationSecondaryPart(part)).filter(Boolean)
    return [city, ...normalizedRest].join(', ')
}

export type LocationFilterFacet = {
    normalizedLabel: string
    groupLabel: string
    groupKey: string
    isMonterreyMetro: boolean
    monterreyMunicipality: string | null
    monterreyMunicipalityKey: string | null
}

export type LocationStructuredFacetSource = {
    ubicacion?: string | null
    ubicacion_group?: string | null
    ubicacion_group_key?: string | null
    ubicacion_municipio?: string | null
    ubicacion_municipio_key?: string | null
    ubicacion_is_monterrey_metro?: boolean | null
}

export function getLocationFilterFacet(input?: string | null): LocationFilterFacet {
    const normalizedLabel = normalizeLocationLabel(input)
    if (!normalizedLabel) {
        return {
            normalizedLabel: '',
            groupLabel: '',
            groupKey: '',
            isMonterreyMetro: false,
            monterreyMunicipality: null,
            monterreyMunicipalityKey: null
        }
    }

    const parts = normalizedLabel.split(', ').map((part) => part.trim()).filter(Boolean)
    const first = parts[0] || ''
    const second = parts[1] || ''

    let isMonterreyMetro = false
    let monterreyMunicipality: string | null = null

    if (first === 'Monterrey') {
        isMonterreyMetro = true
        monterreyMunicipality = normalizeMonterreyMunicipality(second) || 'Monterrey'
    } else {
        const municipalityFromPrimary = normalizeMonterreyMunicipality(first)
        if (municipalityFromPrimary && MONTERREY_MUNICIPALITY_OPTION_VALUES.has(municipalityFromPrimary)) {
            isMonterreyMetro = true
            monterreyMunicipality = municipalityFromPrimary
        }
    }

    const groupLabel = isMonterreyMetro ? 'Monterrey' : normalizedLabel
    const groupKey = normalizeLocationDuplicateKey(groupLabel)
    const monterreyMunicipalityKey = monterreyMunicipality ? normalizeLocationDuplicateKey(monterreyMunicipality) : null

    return {
        normalizedLabel,
        groupLabel,
        groupKey,
        isMonterreyMetro,
        monterreyMunicipality,
        monterreyMunicipalityKey
    }
}

export function getLocationFilterFacetFromStructured(source?: LocationStructuredFacetSource | null): LocationFilterFacet {
    if (!source) return getLocationFilterFacet('')

    const legacyFacet = getLocationFilterFacet(source.ubicacion)
    const hasStructuredData =
        source.ubicacion_group != null
        || source.ubicacion_group_key != null
        || source.ubicacion_municipio != null
        || source.ubicacion_municipio_key != null
        || source.ubicacion_is_monterrey_metro != null

    if (!hasStructuredData) return legacyFacet

    const normalizedLabel = legacyFacet.normalizedLabel
    const structuredMetro = Boolean(source.ubicacion_is_monterrey_metro)
    const structuredGroupLabel = normalizeLocationLabel(source.ubicacion_group)
    const structuredMunicipality = normalizeMonterreyMunicipality(String(source.ubicacion_municipio || '')) || null

    const isMonterreyMetro = structuredMetro || legacyFacet.isMonterreyMetro
    const groupLabel = isMonterreyMetro
        ? 'Monterrey'
        : (structuredGroupLabel || legacyFacet.groupLabel)

    const monterreyMunicipality = isMonterreyMetro
        ? (structuredMunicipality || legacyFacet.monterreyMunicipality || 'Monterrey')
        : null

    const groupKey = String(source.ubicacion_group_key || '').trim()
        || normalizeLocationDuplicateKey(groupLabel)

    const monterreyMunicipalityKey = monterreyMunicipality
        ? (String(source.ubicacion_municipio_key || '').trim()
            || normalizeLocationDuplicateKey(monterreyMunicipality))
        : null

    return {
        normalizedLabel,
        groupLabel,
        groupKey,
        isMonterreyMetro,
        monterreyMunicipality,
        monterreyMunicipalityKey
    }
}

export function sortMonterreyMunicipalityLabels(labels: string[]): string[] {
    return [...labels].sort((a, b) => {
        const aIndex = MONTERREY_MUNICIPALITY_OPTION_ORDER.get(a)
        const bIndex = MONTERREY_MUNICIPALITY_OPTION_ORDER.get(b)

        if (aIndex != null && bIndex != null) return aIndex - bIndex
        if (aIndex != null) return -1
        if (bIndex != null) return 1

        return a.localeCompare(b, 'es')
    })
}

export function getLocationBaseForSelector(input?: string | null): string {
    const normalized = normalizeLocationLabel(input)
    if (!normalized) return ''
    const base = normalized.split(', ')[0]
    const mainCities = ['Monterrey', 'Guadalajara', 'CDMX', 'Querétaro']
    return mainCities.includes(base) ? base : 'Otra'
}

export function normalizeLocationFilterKey(input?: string | null): string {
    return normalizeLocationDuplicateKey(input)
}

export function normalizeLocationDuplicateKey(input?: string | null): string {
    const normalized = normalizeLocationLabel(input)
    if (!normalized) return ''

    let key = stripDiacritics(normalizePunctuation(normalized))
        .toLowerCase()
        .replace(/\bnuevo\s+leon\b/g, 'nl')
        .replace(/\bn\.?\s*l\.?\b/g, 'nl')
        .replace(/[.]/g, '')
        .replace(/\s*,\s*/g, ', ')
        .replace(/\s+/g, ' ')
        .trim()

    // Treat explicit Nuevo León suffixes as the same place key to avoid variant duplicates.
    key = key.replace(/,\s*nl$/g, '').replace(/\s+nl$/g, '').trim()

    return key
}

export function resolveLocationAgainstExistingLabels(
    input: string | null | undefined,
    existingLabels: Array<string | null | undefined>
): {
    candidateNormalized: string
    valueToPersist: string
    duplicateVariantOf: string | null
} {
    const candidateNormalized = normalizeLocationLabel(input)
    if (!candidateNormalized) {
        return {
            candidateNormalized: '',
            valueToPersist: '',
            duplicateVariantOf: null
        }
    }

    const candidateKey = normalizeLocationDuplicateKey(candidateNormalized)
    if (!candidateKey) {
        return {
            candidateNormalized,
            valueToPersist: candidateNormalized,
            duplicateVariantOf: null
        }
    }

    const normalizedExistingUnique = Array.from(new Set(
        existingLabels
            .map((label) => normalizeLocationLabel(label))
            .filter((label): label is string => !!label)
    ))

    const sameKeyLabels = normalizedExistingUnique.filter((label) => normalizeLocationDuplicateKey(label) === candidateKey)

    if (sameKeyLabels.length === 0) {
        return {
            candidateNormalized,
            valueToPersist: candidateNormalized,
            duplicateVariantOf: null
        }
    }

    if (sameKeyLabels.includes(candidateNormalized)) {
        return {
            candidateNormalized,
            valueToPersist: candidateNormalized,
            duplicateVariantOf: null
        }
    }

    const canonicalExisting = [...sameKeyLabels].sort((a, b) => {
        if (a.length !== b.length) return a.length - b.length
        return a.localeCompare(b, 'es')
    })[0]

    return {
        candidateNormalized,
        valueToPersist: canonicalExisting,
        duplicateVariantOf: canonicalExisting
    }
}

export function getSavedLocationCatalogLabels(
    rows: Array<{ name?: string | null } | string | null | undefined>
): string[] {
    const defaultBaseOptions = new Set(['Monterrey', 'Guadalajara', 'CDMX', 'Querétaro'])
    const byKey = new Map<string, string>()

    for (const row of rows || []) {
        const rawLabel = typeof row === 'string'
            ? row
            : String((row as { name?: string | null } | null | undefined)?.name || '')

        const normalizedLabel = normalizeLocationLabel(rawLabel)
        if (!normalizedLabel) continue
        if (defaultBaseOptions.has(normalizedLabel)) continue

        const facet = getLocationFilterFacet(normalizedLabel)
        if (facet.isMonterreyMetro) {
            // Monterrey + municipios ya se gestionan en el selector estructurado.
            continue
        }

        const duplicateKey = normalizeLocationDuplicateKey(normalizedLabel)
        if (!duplicateKey || byKey.has(duplicateKey)) continue
        byKey.set(duplicateKey, normalizedLabel)
    }

    return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b, 'es'))
}
