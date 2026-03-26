type SizeConfidence = 'baja' | 'media' | 'alta'
export type CompanyScopeValue = 'local' | 'nacional' | 'internacional' | 'por_definir'

export type CompanyEnrichmentInput = {
    id?: string | null
    nombre?: string | null
    website?: string | null
    ubicacion?: string | null
    industria?: string | null
    descripcion?: string | null
    tamano?: number | null
}

export type CompanyEnrichmentSuggestion = {
    nombre: string | null
    tamano: number | null
    empleados_estimados_min: number | null
    empleados_estimados_max: number | null
    tamano_confianza: SizeConfidence
    tamano_fuente: string
    tamano_senal_principal: string
    alcance_empresa: CompanyScopeValue | null
    sede_objetivo_sugerida: string | null
    sedes_sugeridas: string[]
    ubicacion: string | null
    industria: string | null
    confidence: number
    sources: string[]
    signals: string[]
    shouldAutoApply: boolean
}

type WebsiteSnapshot = {
    source: string
    siteName: string
    title: string
    description: string
    bodyText: string
}

type IndustryRule = {
    label: string
    keywords: string[]
}

type DomainProfile = {
    hostname: string
    stem: string
    tld: string
    isCountrySite: boolean
}

const WEBSITE_TIMEOUT_MS = 9000
const WEBSITE_CONTEXT_PATHS = [
    '',
    '/about-us',
    '/about',
    '/nosotros',
    '/quienes-somos',
    '/acerca-de',
    '/servicios',
    '/contacto',
    '/support',
    '/help',
    '/ayuda'
]
const WEBSITE_MAX_SNAPSHOTS = 8
const WEBSITE_MAX_BODY_TEXT = 50000

const INTERNATIONAL_LOCATION_KEYWORDS = [
    'united states',
    'usa',
    'eeuu',
    'canada',
    'spain',
    'españa',
    'colombia',
    'argentina',
    'chile',
    'peru',
    'brazil',
    'brasil',
    'reino unido',
    'uk',
    'germany',
    'france'
]

const INTERNATIONAL_CORPORATE_MARKERS = [
    'corporation',
    'headquartered',
    'headquarters',
    'global leader',
    'lider mundial',
    'world leader',
    'multinational',
    'multinacional'
]

const MONTERREY_METRO_MUNICIPALITIES: Array<{ key: string, label: string }> = [
    { key: 'santa catarina', label: 'Santa Catarina' },
    { key: 'san pedro garza garcia', label: 'San Pedro Garza García' },
    { key: 'san nicolas', label: 'San Nicolás' },
    { key: 'san nicolas de los garza', label: 'San Nicolás' },
    { key: 'guadalupe', label: 'Guadalupe' },
    { key: 'apodaca', label: 'Apodaca' },
    { key: 'escobedo', label: 'Escobedo' },
    { key: 'garcia', label: 'García' },
    { key: 'juarez', label: 'Juárez' },
    { key: 'pesqueria', label: 'Pesquería' },
    { key: 'santiago', label: 'Santiago' },
    { key: 'cadereyta', label: 'Cadereyta Jiménez' },
    { key: 'allende', label: 'Allende' }
]

const SITE_LOCATION_TOKENS: Array<{ key: string; label: string; scope: CompanyScopeValue }> = [
    ...MONTERREY_METRO_MUNICIPALITIES.map((municipality) => ({
        key: municipality.key,
        label: `${municipality.label}, Monterrey`,
        scope: 'local' as const
    })),
    { key: 'monterrey', label: 'Monterrey', scope: 'local' },
    { key: 'nuevo leon', label: 'Nuevo León', scope: 'local' },
    { key: 'ciudad de mexico', label: 'Ciudad de México', scope: 'nacional' },
    { key: 'cdmx', label: 'Ciudad de México', scope: 'nacional' },
    { key: 'guadalajara', label: 'Guadalajara', scope: 'nacional' },
    { key: 'queretaro', label: 'Querétaro', scope: 'nacional' },
    { key: 'puebla', label: 'Puebla', scope: 'nacional' },
    { key: 'ramos arizpe', label: 'Ramos Arizpe', scope: 'nacional' },
    { key: 'saltillo', label: 'Saltillo', scope: 'nacional' },
    { key: 'celaya', label: 'Celaya', scope: 'nacional' },
    { key: 'san luis potosi', label: 'San Luis Potosí', scope: 'nacional' },
    { key: 'mexico', label: 'México', scope: 'nacional' },
    { key: 'usa', label: 'Estados Unidos', scope: 'internacional' },
    { key: 'united states', label: 'Estados Unidos', scope: 'internacional' },
    { key: 'canada', label: 'Canadá', scope: 'internacional' },
    { key: 'china', label: 'China', scope: 'internacional' },
    { key: 'europe', label: 'Europa', scope: 'internacional' },
    { key: 'latam', label: 'LatAm', scope: 'internacional' },
    { key: 'global', label: 'Global', scope: 'internacional' }
]

const MEXICO_PRESENCE_KEYWORDS = [
    'mexico',
    'monterrey',
    'nuevo leon',
    'guadalajara',
    'queretaro',
    'puebla',
    'ramos arizpe',
    'saltillo',
    'santa catarina',
    'guadalupe',
    'apodaca',
    'san nicolas',
    'san luis potosi',
    'ciudad de mexico',
    'cdmx',
    'mexicali',
    'tijuana',
    'leon',
    'celaya'
]

const LOCAL_SITE_CANDIDATE_MARKERS = Array.from(new Set([
    ...SITE_LOCATION_TOKENS
        .filter((token) => token.scope !== 'internacional')
        .flatMap((token) => [normalizeText(token.key), normalizeText(token.label)]),
    ...MEXICO_PRESENCE_KEYWORDS.map((keyword) => normalizeText(keyword))
]))

const INDUSTRY_RULES: IndustryRule[] = [
    {
        label: 'Tecnología y Software',
        keywords: ['saas', 'software', 'tecnologia', 'technology', 'it services', 'cloud', 'plataforma']
    },
    {
        label: 'Logística y Transporte',
        keywords: ['logistica', 'logistics', 'transporte', 'freight', 'paqueteria', 'shipment', 'courier']
    },
    {
        label: 'Manufactura',
        keywords: ['manufactura', 'manufacturing', 'fabrica', 'planta', 'industrial', 'produccion']
    },
    {
        label: 'Retail y E-commerce',
        keywords: ['retail', 'ecommerce', 'e-commerce', 'tienda', 'catalogo', 'marketplace']
    },
    {
        label: 'Finanzas',
        keywords: ['fintech', 'finanzas', 'financial', 'banking', 'pagos', 'payments']
    },
    {
        label: 'Salud',
        keywords: ['health', 'salud', 'medical', 'hospital', 'clinic', 'clinica', 'farmaceutica']
    },
    {
        label: 'Educación',
        keywords: ['education', 'educacion', 'universidad', 'escuela', 'edtech', 'academia']
    },
    {
        label: 'Servicios Profesionales',
        keywords: ['consultoria', 'consulting', 'despacho', 'professional services', 'asesoria']
    }
]

const GENERIC_COMPANY_NAME_TOKENS = [
    'home',
    'inicio',
    'welcome',
    'bienvenido',
    'official site',
    'sitio oficial',
    'main page',
    'landing page',
    'index'
]

const COMPANY_NAME_DESCRIPTOR_KEYWORDS = [
    'lavadora',
    'lavadoras',
    'estufa',
    'estufas',
    'refrigerador',
    'refrigeradores',
    'electrodomesticos',
    'electrodomestico',
    'appliances',
    'home appliances',
    'productos',
    'catalogo',
    'ofertas',
    'promociones',
    'comprar',
    'tienda',
    'shop'
]

function normalizeText(value: unknown): string {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
}

function buildSearchBlob(input: CompanyEnrichmentInput, snapshot: WebsiteSnapshot | null): string {
    return [
        input.nombre,
        input.descripcion,
        input.industria,
        input.ubicacion,
        snapshot?.title,
        snapshot?.description,
        snapshot?.bodyText
    ]
        .map((part) => normalizeText(part))
        .filter(Boolean)
        .join(' ')
}

function normalizeWebsiteUrl(raw: string): string {
    const trimmed = String(raw || '').trim()
    if (!trimmed) return ''
    if (/^https?:\/\//i.test(trimmed)) return trimmed
    return `https://${trimmed}`
}

function profileDomain(hostnameRaw: string): DomainProfile | null {
    const hostname = String(hostnameRaw || '')
        .trim()
        .toLowerCase()
        .replace(/^www\./, '')
    if (!hostname) return null

    const parts = hostname.split('.').filter(Boolean)
    if (parts.length < 2) return null

    const tld = parts[parts.length - 1]
    let stem = parts[parts.length - 2] || ''

    // Handles hosts like brand.com.mx
    if (parts.length >= 3 && stem === 'com' && tld.length === 2) {
        stem = parts[parts.length - 3] || stem
    }

    return {
        hostname,
        stem,
        tld,
        isCountrySite: tld.length === 2
    }
}

function getWebsiteDomainProfile(rawWebsite: string): DomainProfile | null {
    const normalized = normalizeWebsiteUrl(rawWebsite)
    if (!normalized) return null

    try {
        const url = new URL(normalized)
        return profileDomain(url.hostname)
    } catch {
        return null
    }
}

function detectCrossBorderCorporateSignal(searchBlob: string, rawWebsite: string): { matched: boolean; evidence: string | null } {
    const siteProfile = getWebsiteDomainProfile(rawWebsite)
    if (!siteProfile?.isCountrySite || !siteProfile.stem) {
        return { matched: false, evidence: null }
    }

    const emailDomainRegex = /[a-z0-9._%+-]+@([a-z0-9.-]+\.[a-z]{2,})/gi
    const seen = new Set<string>()
    for (const match of searchBlob.matchAll(emailDomainRegex)) {
        const domainHost = String(match[1] || '').trim().toLowerCase()
        if (!domainHost || seen.has(domainHost)) continue
        seen.add(domainHost)

        const domainProfile = profileDomain(domainHost)
        if (!domainProfile?.stem) continue
        if (domainProfile.stem !== siteProfile.stem) continue
        if (domainProfile.tld === siteProfile.tld) continue

        return {
            matched: true,
            evidence: `email_corporativo_${domainProfile.hostname}`
        }
    }

    return { matched: false, evidence: null }
}

function toTitleCase(raw: string): string {
    return String(raw || '')
        .split(/\s+/g)
        .filter(Boolean)
        .map((part) => part[0] ? `${part[0].toUpperCase()}${part.slice(1).toLowerCase()}` : part)
        .join(' ')
}

function cleanupNameCandidate(raw: string): string {
    const collapsed = String(raw || '')
        .replace(/&amp;/gi, '&')
        .replace(/\s+/g, ' ')
        .replace(/[|]+/g, '|')
        .replace(/[-]{2,}/g, '-')
        .trim()

    if (!collapsed) return ''

    const parts = collapsed
        .split(/\s*[|:•·»\-–—]\s*/g)
        .map((part) => part.trim())
        .filter(Boolean)

    const scoredParts = (parts.length > 0 ? parts : [collapsed])
        .map((part) => {
            const normalized = normalizeText(part)
            const hasGenericToken = GENERIC_COMPANY_NAME_TOKENS.some((token) => normalized.includes(token))
            const wordCount = part.split(/\s+/g).filter(Boolean).length
            const score = (wordCount * 10) + Math.min(20, part.length) - (hasGenericToken ? 18 : 0)
            return { part, score }
        })
        .sort((a, b) => b.score - a.score)

    const best = scoredParts[0]?.part || ''
    const cleaned = best.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '').trim()
    if (!cleaned) return ''
    return cleaned
}

function isLikelyDescriptiveNamePhrase(raw: string): boolean {
    const normalized = normalizeText(raw)
    if (!normalized) return false
    const keywordHits = COMPANY_NAME_DESCRIPTOR_KEYWORDS.reduce((acc, keyword) => (
        normalized.includes(normalizeText(keyword)) ? acc + 1 : acc
    ), 0)
    const commaCount = (String(raw || '').match(/,/g) || []).length
    const hasTooManyWords = normalized.split(/\s+/g).filter(Boolean).length >= 7
    return keywordHits >= 2 || (keywordHits >= 1 && (commaCount >= 1 || hasTooManyWords))
}

function extractNameFromWebsiteHost(rawWebsite: string): string {
    const normalizedUrl = normalizeWebsiteUrl(rawWebsite)
    if (!normalizedUrl) return ''

    try {
        const hostname = new URL(normalizedUrl).hostname.replace(/^www\./i, '').trim()
        if (!hostname) return ''
        const parts = hostname.split('.').filter(Boolean)
        if (parts.length === 0) return ''
        const hostLabel = parts[0]
            .replace(/[-_]+/g, ' ')
            .replace(/\d{2,}/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
        if (!hostLabel) return ''
        return toTitleCase(hostLabel)
    } catch {
        return ''
    }
}

function stripHtml(html: string): string {
    return String(html || '')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function parseMetaContent(html: string, metaName: string): string {
    const regex = new RegExp(`<meta[^>]+(?:name|property)=["']${metaName}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i')
    const match = String(html || '').match(regex)
    return String(match?.[1] || '').trim()
}

function buildWebsiteContextUrls(website: string): string[] {
    const normalizedUrl = normalizeWebsiteUrl(website)
    if (!normalizedUrl) return []

    try {
        const base = new URL(normalizedUrl)
        const baseOrigin = `${base.protocol}//${base.hostname}`
        const normalizedPath = base.pathname.replace(/\/+$/, '')
        const inferredRoot = normalizedPath && normalizedPath !== '/' ? normalizedPath : ''
        const candidatePaths = Array.from(new Set([
            inferredRoot,
            ...WEBSITE_CONTEXT_PATHS
        ]))

        return candidatePaths
            .map((path) => path.startsWith('/') ? path : `/${path}`)
            .map((path) => `${baseOrigin}${path === '/' ? '' : path}`)
            .slice(0, WEBSITE_MAX_SNAPSHOTS)
    } catch {
        return [normalizedUrl]
    }
}

async function fetchSingleWebsiteSnapshot(url: string): Promise<WebsiteSnapshot | null> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), WEBSITE_TIMEOUT_MS)

    try {
        const response = await fetch(url, {
            method: 'GET',
            redirect: 'follow',
            signal: controller.signal,
            headers: {
                'User-Agent': 'AirHiveCRM-EnrichmentBot/1.0 (+https://airhive.mx)'
            },
            cache: 'no-store'
        })

        if (!response.ok) return null

        const html = await response.text()
        const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i)

        return {
            source: String(response.url || url),
            siteName: parseMetaContent(html, 'og:site_name') || parseMetaContent(html, 'application-name'),
            title: String(titleMatch?.[1] || '').replace(/\s+/g, ' ').trim(),
            description: parseMetaContent(html, 'description') || parseMetaContent(html, 'og:description'),
            bodyText: stripHtml(html).slice(0, 25000)
        }
    } catch {
        return null
    } finally {
        clearTimeout(timeout)
    }
}

async function fetchWebsiteSnapshot(website: string): Promise<WebsiteSnapshot | null> {
    const candidateUrls = buildWebsiteContextUrls(website)
    if (candidateUrls.length === 0) return null

    const snapshots = (await Promise.all(candidateUrls.map((url) => fetchSingleWebsiteSnapshot(url))))
        .filter((snapshot): snapshot is WebsiteSnapshot => snapshot !== null)

    if (snapshots.length === 0) return null

    const primary = snapshots[0]
    const allDescriptions = Array.from(new Set(
        snapshots
            .map((snapshot) => snapshot.description)
            .filter(Boolean)
    ))

    const bodyText = snapshots
        .map((snapshot) => snapshot.bodyText)
        .filter(Boolean)
        .join(' ')
        .slice(0, WEBSITE_MAX_BODY_TEXT)

    return {
        source: snapshots.map((snapshot) => snapshot.source).join(','),
        siteName: primary.siteName,
        title: primary.title,
        description: allDescriptions.join(' | ').slice(0, 1200),
        bodyText
    }
}

function inferCompanyNameFromInput(
    input: CompanyEnrichmentInput,
    websiteSnapshot: WebsiteSnapshot | null
): { value: string | null; confidence: number; signal: string | null } {
    const existingName = String(input.nombre || '').trim()
    if (existingName) {
        return {
            value: existingName,
            confidence: 0,
            signal: null
        }
    }

    const hostCandidate = cleanupNameCandidate(extractNameFromWebsiteHost(String(input.website || '')))
    const normalizedHostCandidate = normalizeText(hostCandidate)
    const siteNameCandidate = cleanupNameCandidate(websiteSnapshot?.siteName || '')
    if (siteNameCandidate.length >= 2) {
        const normalizedSiteName = normalizeText(siteNameCandidate)
        if (isLikelyDescriptiveNamePhrase(siteNameCandidate) && hostCandidate.length >= 2) {
            return {
                value: hostCandidate,
                confidence: 0.9,
                signal: 'website_hostname_brand'
            }
        }
        if (normalizedHostCandidate && normalizedSiteName && !normalizedSiteName.includes(normalizedHostCandidate) && hostCandidate.length >= 2) {
            return {
                value: hostCandidate,
                confidence: 0.86,
                signal: 'website_hostname_brand'
            }
        }
        return {
            value: siteNameCandidate,
            confidence: 0.92,
            signal: 'website_meta_site_name'
        }
    }

    const titleCandidate = cleanupNameCandidate(websiteSnapshot?.title || '')
    if (titleCandidate.length >= 2) {
        const normalizedTitle = normalizeText(titleCandidate)
        const titleLooksDescriptive = isLikelyDescriptiveNamePhrase(titleCandidate)
        if (hostCandidate.length >= 2 && (titleLooksDescriptive || (normalizedHostCandidate && !normalizedTitle.includes(normalizedHostCandidate)))) {
            return {
                value: hostCandidate,
                confidence: 0.84,
                signal: 'website_hostname_brand'
            }
        }
        return {
            value: titleCandidate,
            confidence: 0.82,
            signal: 'website_title'
        }
    }

    if (hostCandidate.length >= 2) {
        return {
            value: hostCandidate,
            confidence: 0.66,
            signal: 'website_hostname'
        }
    }

    return {
        value: null,
        confidence: 0,
        signal: null
    }
}

function inferMonterreyMunicipalityFromText(text: string): string | null {
    const normalized = normalizeText(text)
    if (!normalized) return null

    for (const municipality of MONTERREY_METRO_MUNICIPALITIES) {
        if (normalized.includes(municipality.key)) {
            return municipality.label
        }
    }
    return null
}

function inferLocationFromText(searchBlob: string, existingLocation: string, website: string): { value: string | null; confidence: number; signal: string | null } {
    const normalizedLocation = normalizeText(existingLocation)
    const existingMunicipality = inferMonterreyMunicipalityFromText(normalizedLocation)
    if (existingMunicipality) {
        return {
            value: `Monterrey, ${existingMunicipality}`,
            confidence: 0.95,
            signal: `ubicacion_actual_monterrey_${normalizeText(existingMunicipality).replace(/\s+/g, '_')}`
        }
    }
    if (normalizedLocation.includes('monterrey') || normalizedLocation.includes('nuevo leon')) {
        return { value: 'Monterrey', confidence: 0.92, signal: 'ubicacion_actual_monterrey' }
    }
    if (normalizedLocation.includes('mexico') || normalizedLocation.includes('cdmx') || normalizedLocation.includes('guadalajara') || normalizedLocation.includes('queretaro')) {
        return { value: existingLocation.trim() || 'México', confidence: 0.82, signal: 'ubicacion_actual_mexico' }
    }

    const inferredMunicipality = inferMonterreyMunicipalityFromText(searchBlob)
    const hasMonterreyContext = searchBlob.includes('nuevo leon')
        || searchBlob.includes('monterrey')
        || searchBlob.includes('zona metropolitana')
        || searchBlob.includes('area metropolitana')
        || searchBlob.includes('metropolitan area')
    if (inferredMunicipality && hasMonterreyContext) {
        return {
            value: `Monterrey, ${inferredMunicipality}`,
            confidence: 0.88,
            signal: `keyword_monterrey_${normalizeText(inferredMunicipality).replace(/\s+/g, '_')}`
        }
    }
    if (inferredMunicipality) {
        return {
            value: `Monterrey, ${inferredMunicipality}`,
            confidence: 0.76,
            signal: `keyword_municipio_${normalizeText(inferredMunicipality).replace(/\s+/g, '_')}`
        }
    }

    if (searchBlob.includes('monterrey') || searchBlob.includes('nuevo leon') || searchBlob.includes('san pedro')) {
        return { value: 'Monterrey', confidence: 0.84, signal: 'keyword_monterrey' }
    }

    const crossBorderCorporateSignal = detectCrossBorderCorporateSignal(searchBlob, website)
    const hasInternationalCountryKeyword = INTERNATIONAL_LOCATION_KEYWORDS.some((keyword) => searchBlob.includes(keyword))
    const hasCorporateInternationalMarker = INTERNATIONAL_CORPORATE_MARKERS.some((keyword) => searchBlob.includes(keyword))

    if (crossBorderCorporateSignal.matched) {
        return {
            value: 'Internacional',
            confidence: 0.82,
            signal: crossBorderCorporateSignal.evidence || 'keyword_internacional'
        }
    }

    if (hasInternationalCountryKeyword || hasCorporateInternationalMarker) {
        return { value: 'Internacional', confidence: 0.74, signal: 'keyword_internacional' }
    }

    if (searchBlob.includes('mexico') || searchBlob.includes('ciudad de mexico') || searchBlob.includes('cdmx')) {
        return { value: 'México', confidence: 0.68, signal: 'keyword_mexico' }
    }

    return { value: null, confidence: 0, signal: null }
}

function extractSiteCandidates(searchBlob: string, locationValue: string | null): string[] {
    const byLabel = new Map<string, { label: string; score: number }>()

    for (const token of SITE_LOCATION_TOKENS) {
        if (!searchBlob.includes(token.key)) continue
        const score = token.scope === 'local' ? 3 : token.scope === 'nacional' ? 2 : 1
        const existing = byLabel.get(token.label)
        if (!existing || score > existing.score) {
            byLabel.set(token.label, { label: token.label, score })
        }
    }

    const normalizedLocation = normalizeText(locationValue)
    if (normalizedLocation) {
        if (normalizedLocation.includes('monterrey')) {
            byLabel.set(String(locationValue || 'Monterrey').trim(), {
                label: String(locationValue || 'Monterrey').trim(),
                score: 4
            })
        } else if (normalizedLocation.includes('mexico')) {
            byLabel.set(String(locationValue || 'México').trim(), {
                label: String(locationValue || 'México').trim(),
                score: 3
            })
        }
    }

    return Array.from(byLabel.values())
        .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, 'es'))
        .map((row) => row.label)
        .slice(0, 8)
}

function normalizeSiteCandidateList(values: string[]): string[] {
    const seen = new Set<string>()
    const result: string[] = []
    for (const value of values || []) {
        const normalized = String(value || '').trim()
        if (!normalized) continue
        const key = normalizeText(normalized)
        if (!key || seen.has(key)) continue
        seen.add(key)
        result.push(normalized)
        if (result.length >= 16) break
    }
    return result
}

function isLikelyMexicoLocalSiteCandidate(value: string): boolean {
    const normalized = normalizeText(value)
    if (!normalized) return false
    return LOCAL_SITE_CANDIDATE_MARKERS.some((marker) => marker && normalized.includes(marker))
}

function hasMexicoPresenceSignal(searchBlob: string, locationValue: string | null, siteCandidates: string[]): boolean {
    const normalizedLocation = normalizeText(locationValue)
    if (
        normalizedLocation.includes('mexico')
        || normalizedLocation.includes('monterrey')
        || normalizedLocation.includes('nuevo leon')
    ) {
        return true
    }

    if ((siteCandidates || []).some((candidate) => isLikelyMexicoLocalSiteCandidate(candidate))) {
        return true
    }

    return MEXICO_PRESENCE_KEYWORDS.some((keyword) => searchBlob.includes(normalizeText(keyword)))
}

function prioritizeSiteCandidatesForOperationalContext(
    rawSiteCandidates: string[],
    options: {
        scopeValue: CompanyScopeValue | null
        searchBlob: string
        locationValue: string | null
    }
): string[] {
    const normalizedCandidates = normalizeSiteCandidateList(rawSiteCandidates)
    if (normalizedCandidates.length <= 1) return normalizedCandidates

    const hasMexicoPresence = hasMexicoPresenceSignal(
        options.searchBlob,
        options.locationValue,
        normalizedCandidates
    )
    const shouldPrioritizeMexicoLocalSites = options.scopeValue === 'internacional' && hasMexicoPresence
    if (!shouldPrioritizeMexicoLocalSites) {
        return normalizedCandidates.slice(0, 8)
    }

    const localCandidates = normalizedCandidates.filter((candidate) => isLikelyMexicoLocalSiteCandidate(candidate))
    if (localCandidates.length > 0) {
        return localCandidates.slice(0, 8)
    }

    return normalizedCandidates.slice(0, 8)
}

function inferCompanyScope(
    searchBlob: string,
    locationValue: string | null,
    siteCandidates: string[],
    website: string
): { value: CompanyScopeValue | null; confidence: number; signal: string | null } {
    const normalizedLocation = normalizeText(locationValue)
    if (normalizedLocation.includes('internacional')) {
        return { value: 'internacional', confidence: 0.9, signal: 'scope_from_location_internacional' }
    }
    if (normalizedLocation.includes('monterrey') || normalizedLocation.includes('nuevo leon')) {
        return { value: 'local', confidence: 0.84, signal: 'scope_from_location_local' }
    }
    if (normalizedLocation.includes('mexico')) {
        return { value: 'nacional', confidence: 0.78, signal: 'scope_from_location_nacional' }
    }

    const crossBorderCorporateSignal = detectCrossBorderCorporateSignal(searchBlob, website)
    const hasInternationalCountryKeyword = INTERNATIONAL_LOCATION_KEYWORDS.some((keyword) => searchBlob.includes(keyword))
    const hasCorporateInternationalMarker = INTERNATIONAL_CORPORATE_MARKERS.some((keyword) => searchBlob.includes(keyword))
    if (crossBorderCorporateSignal.matched || hasInternationalCountryKeyword || hasCorporateInternationalMarker) {
        return { value: 'internacional', confidence: 0.8, signal: 'scope_keyword_internacional' }
    }

    const localHits = siteCandidates.filter((candidate) => {
        const normalized = normalizeText(candidate)
        return normalized.includes('monterrey') || normalized.includes('nuevo leon')
    }).length
    const nacionalHits = siteCandidates.filter((candidate) => {
        const normalized = normalizeText(candidate)
        return normalized.includes('mexico')
            || normalized.includes('ciudad de mexico')
            || normalized.includes('guadalajara')
            || normalized.includes('queretaro')
            || normalized.includes('puebla')
    }).length

    if (localHits >= 1 && nacionalHits >= 1) {
        return { value: 'nacional', confidence: 0.7, signal: 'scope_sites_mixed_mx' }
    }
    if (nacionalHits >= 1) {
        return { value: 'nacional', confidence: 0.66, signal: 'scope_sites_nacional' }
    }
    if (localHits >= 1) {
        return { value: 'local', confidence: 0.66, signal: 'scope_sites_local' }
    }

    return { value: 'por_definir', confidence: 0.35, signal: 'scope_por_definir' }
}

function inferIndustryFromText(searchBlob: string, existingIndustry: string): { value: string | null; confidence: number; signal: string | null } {
    const normalizedExisting = normalizeText(existingIndustry)
    if (normalizedExisting) {
        return { value: existingIndustry.trim(), confidence: 0.94, signal: 'industria_actual' }
    }

    let bestRule: IndustryRule | null = null
    let bestHits = 0

    for (const rule of INDUSTRY_RULES) {
        const hits = rule.keywords.reduce((acc, keyword) => (
            searchBlob.includes(normalizeText(keyword)) ? acc + 1 : acc
        ), 0)
        if (hits > bestHits) {
            bestHits = hits
            bestRule = rule
        }
    }

    if (!bestRule || bestHits === 0) return { value: null, confidence: 0, signal: null }
    const confidence = bestHits >= 3 ? 0.85 : bestHits === 2 ? 0.72 : 0.58
    return {
        value: bestRule.label,
        confidence,
        signal: `industry_keywords_${bestHits}`
    }
}

const DEFAULT_EMPLOYEE_RANGE_BY_SIZE: Record<number, { min: number, max: number }> = {
    1: { min: 1, max: 10 },
    2: { min: 11, max: 50 },
    3: { min: 51, max: 250 },
    4: { min: 251, max: 999 },
    5: { min: 1000, max: 5000 }
}

const NUMBER_WORD_VALUES: Record<string, number> = {
    cero: 0,
    zero: 0,
    uno: 1,
    una: 1,
    one: 1,
    dos: 2,
    two: 2,
    tres: 3,
    three: 3,
    cuatro: 4,
    four: 4,
    cinco: 5,
    five: 5,
    seis: 6,
    six: 6,
    siete: 7,
    seven: 7,
    ocho: 8,
    eight: 8,
    nueve: 9,
    nine: 9,
    diez: 10,
    ten: 10,
    once: 11,
    eleven: 11,
    doce: 12,
    twelve: 12,
    trece: 13,
    thirteen: 13,
    catorce: 14,
    fourteen: 14,
    quince: 15,
    fifteen: 15,
    dieciseis: 16,
    sixteen: 16,
    diecisiete: 17,
    seventeen: 17,
    dieciocho: 18,
    eighteen: 18,
    diecinueve: 19,
    nineteen: 19,
    veinte: 20,
    twenty: 20
}

const GLOBAL_SCALE_KEYWORDS = [
    'global',
    'worldwide',
    'multinacional',
    'multinational',
    'international presence',
    'presencia internacional',
    'presencia global',
    'operacion global'
]

const CORPORATE_SCALE_KEYWORDS = [
    'holding',
    'grupo empresarial',
    'corporativo',
    'corporate',
    'business group'
]

const LARGE_OPERATION_KEYWORDS = [
    'tier 1',
    'tier1',
    'oem',
    'automotive supplier',
    'manufacturing footprint',
    'supply chain'
]

const HEADCOUNT_VALUE_PATTERN = String.raw`\d{1,3}(?:[.,]\d{3})+|\d{1,6}(?:[.,]\d+)?(?:\s*(?:k|m|mil|thousand|million|millones))?|[a-zA-Z]+`
const HEADCOUNT_UNIT_PATTERN = String.raw`empleados|employees|colaboradores|team members|associates|workforce|staff|headcount|personas|people`

function isWeakHeadcountUnit(unit: string): boolean {
    const normalized = normalizeText(unit)
    return normalized === 'people'
        || normalized === 'personas'
        || normalized === 'team members'
        || normalized === 'associates'
}

function clampNumber(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}

function parseNumericToken(raw: string | undefined): number | null {
    const normalized = String(raw || '').trim().toLowerCase()
    if (!normalized) return null

    const normalizedWord = normalizeText(normalized)
    if (normalizedWord in NUMBER_WORD_VALUES) {
        const wordValue = NUMBER_WORD_VALUES[normalizedWord]
        return Number.isFinite(wordValue) && wordValue > 0 ? wordValue : null
    }

    const compact = normalized.replace(/\s+/g, '')
    const suffixMatch = compact.match(/(k|m|mil|thousand|million|millones)$/i)
    const suffix = String(suffixMatch?.[1] || '').toLowerCase()
    const multiplier = suffix
        ? (suffix === 'k' || suffix === 'mil' || suffix === 'thousand'
            ? 1000
            : suffix === 'm' || suffix === 'million' || suffix === 'millones'
                ? 1000000
                : 1)
        : 1

    const numericPart = suffix ? compact.slice(0, -suffix.length) : compact
    const groupedThousands = /^\d{1,3}(?:[.,]\d{3})+$/.test(numericPart)
    const normalizedNumeric = groupedThousands
        ? numericPart.replace(/[.,]/g, '')
        : numericPart.replace(',', '.')
    const parsed = Number(normalizedNumeric)
    if (!Number.isFinite(parsed) || parsed <= 0) return null

    const value = Math.round(parsed * multiplier)
    if (!Number.isFinite(value) || value <= 0) return null
    return value
}

function mapEmployeeCountToSize(employeeCount: number): number {
    if (employeeCount <= 10) return 1
    if (employeeCount <= 50) return 2
    if (employeeCount <= 250) return 3
    if (employeeCount <= 999) return 4
    return 5
}

function getEmployeeRangeForSize(size: number): { min: number, max: number } | null {
    if (!Number.isInteger(size) || size < 1 || size > 5) return null
    return DEFAULT_EMPLOYEE_RANGE_BY_SIZE[size] || null
}

function extractLargestCount(searchBlob: string, patterns: RegExp[]): number | null {
    let best: number | null = null

    for (const pattern of patterns) {
        const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`
        const globalPattern = new RegExp(pattern.source, flags)
        for (const match of searchBlob.matchAll(globalPattern)) {
            const parsed = parseNumericToken(match[1])
            if (!parsed) continue
            if (best === null || parsed > best) best = parsed
        }
    }

    return best
}

function extractEmployeeEstimate(searchBlob: string): {
    min: number | null
    max: number | null
    confidenceScore: number
    evidence: string | null
} {
    const rangePattern = new RegExp(
        `(${HEADCOUNT_VALUE_PATTERN})\\s*(?:-|–|—|a|to)\\s*(${HEADCOUNT_VALUE_PATTERN})\\s*(${HEADCOUNT_UNIT_PATTERN})`,
        'gi'
    )
    let bestRange: { min: number, max: number } | null = null

    for (const match of searchBlob.matchAll(rangePattern)) {
        const unit = normalizeText(match[3] || '')
        const min = parseNumericToken(match[1])
        const max = parseNumericToken(match[2])
        if (isWeakHeadcountUnit(unit) && ((max || 0) < 120)) continue
        if (!min || !max || max < min) continue
        if (!bestRange || max > bestRange.max) bestRange = { min, max }
    }

    if (bestRange) {
        return {
            min: bestRange.min,
            max: bestRange.max,
            confidenceScore: 0.9,
            evidence: `Rango detectado: ${bestRange.min}-${bestRange.max} empleados`
        }
    }

    const directPattern = new RegExp(
        `((?:mas de|more than|over|up to|hasta|around|aprox(?:imadamente)?|approximately|cerca de)?)\\s*` +
        `(${HEADCOUNT_VALUE_PATTERN})\\s*\\+?\\s*(${HEADCOUNT_UNIT_PATTERN})`,
        'gi'
    )
    const inversePattern = new RegExp(
        `(${HEADCOUNT_UNIT_PATTERN})\\s*(?:de|of|:)?\\s*` +
        `(?:mas de|more than|over|up to|hasta|around|aprox(?:imadamente)?|approximately|cerca de)?\\s*` +
        `(${HEADCOUNT_VALUE_PATTERN})\\s*\\+?`,
        'gi'
    )
    let bestSingle: { min: number, max: number, raw: number } | null = null

    for (const match of searchBlob.matchAll(directPattern)) {
        const qualifier = String(match[1] || '').trim()
        const unit = normalizeText(match[3] || '')
        const rawValue = parseNumericToken(match[2])
        if (!rawValue) continue
        if (isWeakHeadcountUnit(unit) && rawValue < 120) continue

        let min = Math.round(rawValue * 0.9)
        let max = Math.round(rawValue * 1.1)

        if (/(mas de|more than|over|\+)/i.test(qualifier)) {
            min = rawValue
            max = Math.round(rawValue * 1.35)
        } else if (/(up to|hasta)/i.test(qualifier)) {
            min = Math.max(1, Math.round(rawValue * 0.5))
            max = rawValue
        } else if (/(around|aprox|approximately|cerca de)/i.test(qualifier)) {
            min = Math.max(1, Math.round(rawValue * 0.8))
            max = Math.round(rawValue * 1.2)
        }

        if (!bestSingle || max > bestSingle.max) {
            bestSingle = { min, max, raw: rawValue }
        }
    }

    for (const match of searchBlob.matchAll(inversePattern)) {
        const unit = normalizeText(match[1] || '')
        const rawValue = parseNumericToken(match[2])
        if (!rawValue) continue
        if (isWeakHeadcountUnit(unit) && rawValue < 120) continue
        const min = Math.round(rawValue * 0.9)
        const max = Math.round(rawValue * 1.12)
        if (!bestSingle || max > bestSingle.max) {
            bestSingle = { min, max, raw: rawValue }
        }
    }

    if (bestSingle) {
        return {
            min: bestSingle.min,
            max: bestSingle.max,
            confidenceScore: 0.82,
            evidence: `Plantilla detectada alrededor de ${bestSingle.raw} empleados`
        }
    }

    return {
        min: null,
        max: null,
        confidenceScore: 0,
        evidence: null
    }
}

function inferOperationalScaleSignals(searchBlob: string, website: string): {
    minSize: number | null
    confidenceBoost: number
    evidence: string[]
} {
    let minSize: number | null = null
    let confidenceBoost = 0
    const evidence: string[] = []

    const countries = extractLargestCount(searchBlob, [
        new RegExp(`(${HEADCOUNT_VALUE_PATTERN})\\s*(?:paises|countries|markets)`, 'i'),
        new RegExp(`(?:present in|across|en|in)\\s*(${HEADCOUNT_VALUE_PATTERN})\\s*(?:countries|markets|paises)`, 'i')
    ])
    if (countries && countries >= 6) {
        minSize = Math.max(minSize || 0, 5)
        confidenceBoost += 0.2
        evidence.push(`${countries} paises`)
    } else if (countries && countries >= 3) {
        minSize = Math.max(minSize || 0, 4)
        confidenceBoost += 0.12
        evidence.push(`${countries} paises`)
    }

    const plants = extractLargestCount(searchBlob, [
        new RegExp(`(${HEADCOUNT_VALUE_PATTERN})\\s*(?:manufacturing\\s+)?(?:plantas|plants|sites|production\\s+sites|manufacturing\\s+sites|facilities)`, 'i'),
        new RegExp(`(?:manufacturing\\s+plants|plantas|facilities)\\s*(?:in|en)?\\s*(${HEADCOUNT_VALUE_PATTERN})`, 'i')
    ])
    if (plants && plants >= 10) {
        minSize = Math.max(minSize || 0, 5)
        confidenceBoost += 0.18
        evidence.push(`${plants} plantas`)
    } else if (plants && plants >= 4) {
        minSize = Math.max(minSize || 0, 4)
        confidenceBoost += 0.12
        evidence.push(`${plants} plantas`)
    }

    const offices = extractLargestCount(searchBlob, [
        new RegExp(`(${HEADCOUNT_VALUE_PATTERN})\\s*(?:sucursales|sedes|offices|locations|sites)`, 'i')
    ])
    if (offices && offices >= 15) {
        minSize = Math.max(minSize || 0, 5)
        confidenceBoost += 0.15
        evidence.push(`${offices} sedes`)
    } else if (offices && offices >= 6) {
        minSize = Math.max(minSize || 0, 4)
        confidenceBoost += 0.1
        evidence.push(`${offices} sedes`)
    }

    const hasGlobalKeyword = GLOBAL_SCALE_KEYWORDS.some((keyword) => searchBlob.includes(keyword))
    const hasCorporateKeyword = CORPORATE_SCALE_KEYWORDS.some((keyword) => searchBlob.includes(keyword))
    const hasLargeOperationKeyword = LARGE_OPERATION_KEYWORDS.some((keyword) => searchBlob.includes(keyword))

    if (hasGlobalKeyword) {
        minSize = Math.max(minSize || 0, 4)
        confidenceBoost += 0.08
        evidence.push('operacion global')
    }

    if (hasCorporateKeyword) {
        minSize = Math.max(minSize || 0, 5)
        confidenceBoost += 0.08
        evidence.push('estructura corporativa')
    }

    if (hasLargeOperationKeyword) {
        minSize = Math.max(minSize || 0, 4)
        confidenceBoost += 0.06
        evidence.push('senal industrial de gran escala')
    }

    const hasIndustrialGlobalCombination = hasLargeOperationKeyword && (
        hasGlobalKeyword
        || (countries !== null && countries >= 5)
        || (plants !== null && plants >= 6)
    )
    if (hasIndustrialGlobalCombination) {
        minSize = Math.max(minSize || 0, 5)
        confidenceBoost += 0.12
        evidence.push('combinacion industrial global')
    }

    const modelCodeMatches = new Set<string>()
    const modelCodePattern = /\b[a-z0-9]{6,20}\b/gi
    for (const match of searchBlob.matchAll(modelCodePattern)) {
        const token = String(match[0] || '').toLowerCase()
        if (!token) continue
        if (!/[a-z]/i.test(token) || !/\d/.test(token)) continue
        modelCodeMatches.add(token)
        if (modelCodeMatches.size >= 80) break
    }
    const modelCodeCount = modelCodeMatches.size
    if (modelCodeCount >= 35) {
        minSize = Math.max(minSize || 0, 4)
        confidenceBoost += 0.12
        evidence.push(`catalogo_extenso_${modelCodeCount}_skus`)
    } else if (modelCodeCount >= 12) {
        minSize = Math.max(minSize || 0, 3)
        confidenceBoost += 0.08
        evidence.push(`catalogo_medio_${modelCodeCount}_skus`)
    }

    const crossBorderCorporateSignal = detectCrossBorderCorporateSignal(searchBlob, website)
    if (crossBorderCorporateSignal.matched) {
        minSize = Math.max(minSize || 0, 4)
        confidenceBoost += 0.1
        evidence.push('presencia corporativa internacional')
    }

    return {
        minSize,
        confidenceBoost: clampNumber(confidenceBoost, 0, 0.35),
        evidence
    }
}

function inferSizeFromText(searchBlob: string, existingSize: number | null | undefined, website: string): {
    size: number | null
    estimatedEmployeesMin: number | null
    estimatedEmployeesMax: number | null
    confidence: SizeConfidence
    confidenceScore: number
    signal: string | null
} {
    const existing = Number(existingSize || 0)
    if (Number.isFinite(existing) && existing >= 1 && existing <= 5) {
        const existingRange = getEmployeeRangeForSize(existing)
        return {
            size: existing,
            estimatedEmployeesMin: existingRange?.min || null,
            estimatedEmployeesMax: existingRange?.max || null,
            confidence: 'alta',
            confidenceScore: 0.94,
            signal: 'Tamano conservado por dato previo validado.'
        }
    }

    const employeeEstimate = extractEmployeeEstimate(searchBlob)
    const operationalSignals = inferOperationalScaleSignals(searchBlob, website)

    const evidenceParts: string[] = []
    let inferredSize: number | null = null
    let confidenceScore = 0
    let estimatedEmployeesMin = employeeEstimate.min
    let estimatedEmployeesMax = employeeEstimate.max

    if (employeeEstimate.min && employeeEstimate.max) {
        const midpoint = Math.round((employeeEstimate.min + employeeEstimate.max) / 2)
        inferredSize = mapEmployeeCountToSize(midpoint)
        confidenceScore = Math.max(confidenceScore, employeeEstimate.confidenceScore)
        if (employeeEstimate.evidence) evidenceParts.push(employeeEstimate.evidence)
    }

    if (operationalSignals.minSize) {
        if (!inferredSize || operationalSignals.minSize > inferredSize) {
            inferredSize = operationalSignals.minSize
        }
        confidenceScore = Math.max(confidenceScore, 0.58 + operationalSignals.confidenceBoost)
    }
    if (operationalSignals.evidence.length > 0) {
        evidenceParts.push(`Escala operativa detectada: ${operationalSignals.evidence.join(', ')}`)
    }

    if (!inferredSize && (searchBlob.includes('startup') || searchBlob.includes('pyme'))) {
        inferredSize = 2
        confidenceScore = Math.max(confidenceScore, 0.56)
        evidenceParts.push('Keyword detectada: startup/pyme')
    }

    const hasEnterpriseScaleKeywords =
        searchBlob.includes('multinacional')
        || searchBlob.includes('enterprise')
        || searchBlob.includes('global')
        || searchBlob.includes('world leader')
        || searchBlob.includes('lider mundial')
    const hasEnterpriseIndustrialKeywords =
        searchBlob.includes('tier 1')
        || searchBlob.includes('tier1')
        || searchBlob.includes('oem')
        || searchBlob.includes('automotive supplier')

    if (!inferredSize && hasEnterpriseScaleKeywords) {
        inferredSize = hasEnterpriseIndustrialKeywords ? 5 : 4
        confidenceScore = Math.max(confidenceScore, 0.54)
        evidenceParts.push(
            hasEnterpriseIndustrialKeywords
                ? 'Keyword detectada: escala enterprise industrial global'
                : 'Keyword detectada: multinacional/enterprise/global'
        )
    }

    if (!inferredSize) {
        return {
            size: null,
            estimatedEmployeesMin: null,
            estimatedEmployeesMax: null,
            confidence: 'baja',
            confidenceScore: 0,
            signal: null
        }
    }

    if (!estimatedEmployeesMin || !estimatedEmployeesMax) {
        const fallbackRange = getEmployeeRangeForSize(inferredSize)
        estimatedEmployeesMin = fallbackRange?.min || null
        estimatedEmployeesMax = fallbackRange?.max || null
    }

    const clampedScore = clampNumber(confidenceScore, 0, 0.95)
    const confidence: SizeConfidence = clampedScore >= 0.8
        ? 'alta'
        : clampedScore >= 0.57
            ? 'media'
            : 'baja'

    const signal = evidenceParts.join(' | ').slice(0, 260) || null

    return {
        size: inferredSize,
        estimatedEmployeesMin,
        estimatedEmployeesMax,
        confidence,
        confidenceScore: clampedScore,
        signal
    }
}

export async function generateCompanyEnrichmentSuggestion(input: CompanyEnrichmentInput): Promise<CompanyEnrichmentSuggestion> {
    const websiteSnapshot = await fetchWebsiteSnapshot(String(input.website || ''))
    const searchBlob = buildSearchBlob(input, websiteSnapshot)
    const normalizedWebsite = String(input.website || '')

    const companyNameInference = inferCompanyNameFromInput(input, websiteSnapshot)
    const sizeInference = inferSizeFromText(searchBlob, input.tamano, normalizedWebsite)
    const locationInference = inferLocationFromText(searchBlob, String(input.ubicacion || ''), normalizedWebsite)
    const industryInference = inferIndustryFromText(searchBlob, String(input.industria || ''))
    const rawSiteCandidates = extractSiteCandidates(searchBlob, locationInference.value)
    const scopeInference = inferCompanyScope(searchBlob, locationInference.value, rawSiteCandidates, normalizedWebsite)
    const siteCandidates = prioritizeSiteCandidatesForOperationalContext(rawSiteCandidates, {
        scopeValue: scopeInference.value,
        searchBlob,
        locationValue: locationInference.value
    })
    const suggestedSite = siteCandidates[0] || rawSiteCandidates[0] || null

    const confidenceParts = [
        companyNameInference.confidence,
        sizeInference.confidenceScore,
        locationInference.confidence,
        industryInference.confidence,
        scopeInference.confidence
    ].filter((value) => Number.isFinite(value) && value > 0)

    const confidence = confidenceParts.length > 0
        ? Math.min(0.99, confidenceParts.reduce((acc, value) => acc + value, 0) / confidenceParts.length)
        : 0

    const signals = [
        companyNameInference.signal,
        sizeInference.signal,
        locationInference.signal,
        industryInference.signal,
        scopeInference.signal
    ].filter((value): value is string => !!value)

    const sources = [
        'modelo_heuristico_v2',
        websiteSnapshot?.source ? `website:${websiteSnapshot.source}` : null
    ].filter((value): value is string => !!value)

    const inferredFields = [
        companyNameInference.value ? 1 : 0,
        sizeInference.size ? 1 : 0,
        locationInference.value ? 1 : 0,
        industryInference.value ? 1 : 0
    ].reduce((acc, value) => acc + value, 0)

    return {
        nombre: companyNameInference.value,
        tamano: sizeInference.size,
        empleados_estimados_min: sizeInference.estimatedEmployeesMin,
        empleados_estimados_max: sizeInference.estimatedEmployeesMax,
        tamano_confianza: sizeInference.confidence,
        tamano_fuente: websiteSnapshot?.source ? 'sitio_web' : 'inferencia_comercial',
        tamano_senal_principal: sizeInference.signal || '',
        alcance_empresa: scopeInference.value,
        sede_objetivo_sugerida: suggestedSite,
        sedes_sugeridas: siteCandidates,
        ubicacion: locationInference.value,
        industria: industryInference.value,
        confidence: Number(confidence.toFixed(4)),
        sources,
        signals,
        shouldAutoApply: confidence >= 0.72 && inferredFields >= 2
    }
}
