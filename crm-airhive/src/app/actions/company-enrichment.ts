'use server'

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { normalizeLocationLabel } from '@/lib/locationUtils'
import { generateCompanyEnrichmentSuggestion, type CompanyEnrichmentSuggestion } from '@/lib/companyEnrichment'
import { normalizeCompanySizeConfidenceValue, normalizeCompanySizeSourceValue } from '@/lib/companySizeUtils'

type EnrichmentApplyMode = 'fill_missing' | 'overwrite'

type EnrichmentCompanyRow = {
    id: string
    nombre: string | null
    tamano: number | null
    tamano_fuente: string | null
    tamano_confianza: string | null
    tamano_senal_principal: string | null
    website: string | null
    ubicacion: string | null
    alcance_empresa: string | null
    sede_objetivo: string | null
    sedes_sugeridas: string[] | null
    industria: string | null
    industria_id: string | null
    descripcion: string | null
    created_at?: string | null
}

type JobStatus = 'queued' | 'processing' | 'ready' | 'applied' | 'failed'

type CompanyEnrichmentRunResult = {
    companyId: string
    companyName: string
    status: 'applied' | 'ready' | 'failed'
    confidence: number
    appliedFields: string[]
    suggestion?: CompanyEnrichmentSuggestion
    error?: string
}

const OPTIONAL_EMPRESA_ENRICHMENT_COLUMNS = new Set([
    'enrichment_status',
    'enrichment_payload',
    'enrichment_last_run_at',
    'enrichment_last_error',
    'enriched_at',
    'alcance_empresa',
    'sede_objetivo',
    'sedes_sugeridas'
])

const ENRICHMENT_COMPANY_REQUIRED_COLUMNS = [
    'id',
    'nombre',
    'tamano',
    'tamano_fuente',
    'tamano_confianza',
    'tamano_senal_principal',
    'website',
    'ubicacion',
    'industria',
    'industria_id',
    'descripcion',
    'created_at'
] as const

const ENRICHMENT_COMPANY_OPTIONAL_COLUMNS = [
    'alcance_empresa',
    'sede_objetivo',
    'sedes_sugeridas'
] as const

const ENRICHMENT_COMPANY_OPTIONAL_COLUMN_SET = new Set<string>(ENRICHMENT_COMPANY_OPTIONAL_COLUMNS as readonly string[])

function parseErrorMessage(error: any, fallback: string): string {
    if (!error) return fallback
    if (typeof error === 'string') return error
    if (error?.message) return String(error.message)
    try {
        return JSON.stringify(error)
    } catch {
        return fallback
    }
}

function isMissingTableError(error: any): boolean {
    const code = String(error?.code || '')
    const message = String(error?.message || '').toLowerCase()
    return code === '42P01' || message.includes('relation') && message.includes('does not exist')
}

function extractMissingColumn(error: any): string | null {
    const message = String(error?.message || '')
    const directMatch = message.match(/column\s+["']?(?:[a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+)["']?\s+does not exist/i)
    if (directMatch?.[1]) return directMatch[1]
    const match = message.match(/column\s+["']?([a-zA-Z0-9_]+)["']?\s+of\s+relation/i)
    return match?.[1] || null
}

function isBlank(value: unknown): boolean {
    return String(value ?? '').trim().length === 0
}

function isAdminOrRh(role: unknown): boolean {
    const normalized = String(role || '').toLowerCase().trim()
    return normalized === 'admin' || normalized === 'rh'
}

function normalizeLimit(rawLimit: unknown, fallback: number): number {
    const value = Number(rawLimit)
    if (!Number.isFinite(value)) return fallback
    return Math.min(30, Math.max(1, Math.round(value)))
}

function normalizeWebsite(rawWebsite: unknown): string {
    const trimmed = String(rawWebsite || '').trim()
    if (!trimmed) return ''
    if (/^https?:\/\//i.test(trimmed)) return trimmed
    return `https://${trimmed}`
}

function isLikelyWebsite(rawWebsite: string): boolean {
    return rawWebsite.includes('.') && rawWebsite.length >= 6
}

function normalizeCompanyScopeValue(value: unknown): 'local' | 'nacional' | 'internacional' | 'por_definir' | null {
    const normalized = String(value || '').trim().toLowerCase()
    if (!normalized) return null
    if (normalized === 'local' || normalized === 'nacional' || normalized === 'internacional' || normalized === 'por_definir') {
        return normalized
    }
    return null
}

function normalizeSiteSuggestions(value: unknown): string[] {
    const list = Array.isArray(value) ? value : []
    const seen = new Set<string>()
    const result: string[] = []
    for (const item of list) {
        const normalized = String(item || '').trim()
        if (!normalized) continue
        const key = normalized.toLocaleLowerCase('es-MX')
        if (seen.has(key)) continue
        seen.add(key)
        result.push(normalized)
        if (result.length >= 12) break
    }
    return result
}

function buildEnrichmentCompanySelectColumns(optionalColumns: string[]) {
    return [...ENRICHMENT_COMPANY_REQUIRED_COLUMNS, ...optionalColumns].join(', ')
}

async function safeSelectEnrichmentCompanyById(adminClient: ReturnType<typeof createAdminClient>, companyId: string) {
    let optionalColumns: string[] = [...ENRICHMENT_COMPANY_OPTIONAL_COLUMNS]
    let attempts = 0

    while (attempts < 8) {
        const selectColumns = buildEnrichmentCompanySelectColumns(optionalColumns)
        const { data, error } = await (adminClient.from('empresas') as any)
            .select(selectColumns)
            .eq('id', companyId)
            .maybeSingle()
        if (!error) {
            return { data: (data || null) as EnrichmentCompanyRow | null, error: null as any }
        }

        const missingColumn = extractMissingColumn(error)
        if (!missingColumn || !ENRICHMENT_COMPANY_OPTIONAL_COLUMN_SET.has(missingColumn) || !optionalColumns.includes(missingColumn)) {
            return { data: null as EnrichmentCompanyRow | null, error }
        }

        optionalColumns = optionalColumns.filter((column) => column !== missingColumn)
        attempts += 1
    }

    return { data: null as EnrichmentCompanyRow | null, error: new Error('No se pudo leer empresa para enriquecimiento') }
}

async function safeSelectRecentEnrichmentCompanies(adminClient: ReturnType<typeof createAdminClient>, maxRows: number) {
    let optionalColumns: string[] = [...ENRICHMENT_COMPANY_OPTIONAL_COLUMNS]
    let attempts = 0

    while (attempts < 8) {
        const selectColumns = buildEnrichmentCompanySelectColumns(optionalColumns)
        const { data, error } = await (adminClient.from('empresas') as any)
            .select(selectColumns)
            .order('created_at', { ascending: false })
            .limit(maxRows)
        if (!error) {
            return { data: ((data || []) as EnrichmentCompanyRow[]), error: null as any }
        }

        const missingColumn = extractMissingColumn(error)
        if (!missingColumn || !ENRICHMENT_COMPANY_OPTIONAL_COLUMN_SET.has(missingColumn) || !optionalColumns.includes(missingColumn)) {
            return { data: [] as EnrichmentCompanyRow[], error }
        }

        optionalColumns = optionalColumns.filter((column) => column !== missingColumn)
        attempts += 1
    }

    return { data: [] as EnrichmentCompanyRow[], error: new Error('No se pudo leer empresas para enriquecimiento') }
}

async function safeUpdateEmpresa(adminClient: ReturnType<typeof createAdminClient>, companyId: string, payload: Record<string, any>) {
    const mutablePayload: Record<string, any> = { ...payload }
    let attempts = 0

    while (attempts < 8) {
        const { error } = await (adminClient.from('empresas') as any)
            .update(mutablePayload)
            .eq('id', companyId)
        if (!error) return { success: true as const }

        const missingColumn = extractMissingColumn(error)
        if (!missingColumn || !OPTIONAL_EMPRESA_ENRICHMENT_COLUMNS.has(missingColumn) || !(missingColumn in mutablePayload)) {
            return { success: false as const, error }
        }

        delete mutablePayload[missingColumn]
        attempts += 1
    }

    return { success: false as const, error: new Error('No se pudo actualizar la empresa tras múltiples intentos') }
}

async function ensureIndustryCatalogMatch(adminClient: ReturnType<typeof createAdminClient>, suggestedIndustry: string | null): Promise<string | null> {
    const normalized = String(suggestedIndustry || '').trim()
    if (!normalized) return null

    const exact = await (adminClient.from('industrias') as any)
        .select('id, name')
        .eq('is_active', true)
        .ilike('name', normalized)
        .limit(1)
        .maybeSingle()
    if (exact?.data?.id) return String(exact.data.id)

    const fuzzy = await (adminClient.from('industrias') as any)
        .select('id, name')
        .eq('is_active', true)
        .ilike('name', `%${normalized}%`)
        .order('name', { ascending: true })
        .limit(1)
        .maybeSingle()
    if (fuzzy?.data?.id) return String(fuzzy.data.id)

    return null
}

async function updateIndustryRelations(adminClient: ReturnType<typeof createAdminClient>, companyId: string, industryId: string) {
    try {
        await (adminClient.from('company_industries') as any)
            .update({ is_primary: false })
            .eq('empresa_id', companyId)

        await (adminClient.from('company_industries') as any)
            .upsert(
                [{
                    empresa_id: companyId,
                    industria_id: industryId,
                    is_primary: true
                }],
                { onConflict: 'empresa_id,industria_id' }
            )
    } catch (error) {
        console.warn('Could not sync company_industries from enrichment:', error)
    }
}

async function getOrCreateJob(adminClient: ReturnType<typeof createAdminClient>, company: EnrichmentCompanyRow, requestedBy: string | null) {
    const readExisting = await (adminClient.from('company_enrichment_jobs') as any)
        .select('id, status')
        .eq('empresa_id', company.id)
        .in('status', ['queued', 'processing'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (readExisting.error) {
        if (isMissingTableError(readExisting.error)) return null
        throw readExisting.error
    }

    if (readExisting.data?.id) return String(readExisting.data.id)

    const inputPayload = {
        empresa_id: company.id,
        nombre: company.nombre,
        website: company.website,
        ubicacion: company.ubicacion,
        industria: company.industria,
        tamano: company.tamano
    }

    const inserted = await (adminClient.from('company_enrichment_jobs') as any)
        .insert({
            empresa_id: company.id,
            requested_by: requestedBy,
            status: 'queued',
            provider: 'heuristic_v1',
            input_payload: inputPayload
        })
        .select('id')
        .single()

    if (inserted.error) {
        if (isMissingTableError(inserted.error)) return null
        throw inserted.error
    }

    return String(inserted.data?.id || '')
}

async function setJobStatus(
    adminClient: ReturnType<typeof createAdminClient>,
    jobId: string | null,
    status: JobStatus,
    payload: {
        confidence?: number | null
        result_payload?: any
        error_message?: string | null
    } = {}
) {
    if (!jobId) return
    const nowIso = new Date().toISOString()

    try {
        const basePayload: Record<string, any> = {
            status,
            confidence: payload.confidence ?? null,
            result_payload: payload.result_payload ?? null,
            error_message: payload.error_message ?? null
        }
        if (status === 'ready' || status === 'failed') basePayload.processed_at = nowIso
        if (status === 'applied') basePayload.applied_at = nowIso

        await (adminClient.from('company_enrichment_jobs') as any)
            .update(basePayload)
            .eq('id', jobId)
    } catch (error) {
        if (!isMissingTableError(error)) {
            console.warn('Could not update company enrichment job status:', error)
        }
    }
}

async function runEnrichmentForCompany(
    adminClient: ReturnType<typeof createAdminClient>,
    company: EnrichmentCompanyRow,
    options: { applyMode: EnrichmentApplyMode; autoApply: boolean; requestedBy: string | null }
): Promise<CompanyEnrichmentRunResult> {
    const companyId = String(company.id || '')
    const companyName = String(company.nombre || '').trim() || `Empresa ${companyId}`
    const nowIso = new Date().toISOString()
    let jobId: string | null = null

    try {
        jobId = await getOrCreateJob(adminClient, company, options.requestedBy)
    } catch (error: any) {
        console.warn('Could not create enrichment job row:', error)
        jobId = null
    }

    await safeUpdateEmpresa(adminClient, companyId, {
        enrichment_status: 'processing',
        enrichment_last_error: null,
        enrichment_last_run_at: nowIso
    })
    await setJobStatus(adminClient, jobId, 'processing')

    try {
        const suggestion = await generateCompanyEnrichmentSuggestion({
            id: company.id,
            nombre: company.nombre,
            website: company.website,
            ubicacion: company.ubicacion,
            industria: company.industria,
            descripcion: company.descripcion,
            tamano: company.tamano
        })

        const appliedFields: string[] = []
        const updatePayload: Record<string, any> = {
            enrichment_payload: suggestion,
            enrichment_last_run_at: nowIso,
            enrichment_last_error: null
        }

        const canApplyName = suggestion.nombre && (options.applyMode === 'overwrite' || isBlank(company.nombre))
        if (canApplyName) {
            updatePayload.nombre = suggestion.nombre
            appliedFields.push('nombre')
        }

        const canApplySize = suggestion.tamano && (options.applyMode === 'overwrite' || !company.tamano || Number(company.tamano) <= 0)
        if (canApplySize) {
            updatePayload.tamano = suggestion.tamano
            updatePayload.tamano_fuente = normalizeCompanySizeSourceValue(suggestion.tamano_fuente) || 'inferencia_comercial'
            updatePayload.tamano_confianza = normalizeCompanySizeConfidenceValue(suggestion.tamano_confianza) || 'media'
            updatePayload.tamano_senal_principal = suggestion.tamano_senal_principal || company.tamano_senal_principal || ''
            appliedFields.push('tamano')
        }

        const canApplyLocation = suggestion.ubicacion && (options.applyMode === 'overwrite' || isBlank(company.ubicacion))
        if (canApplyLocation) {
            updatePayload.ubicacion = normalizeLocationLabel(suggestion.ubicacion)
            appliedFields.push('ubicacion')
        }

        const normalizedScope = normalizeCompanyScopeValue(suggestion.alcance_empresa)
        const canApplyScope = normalizedScope && (options.applyMode === 'overwrite' || isBlank(company.alcance_empresa))
        if (canApplyScope) {
            updatePayload.alcance_empresa = normalizedScope
            appliedFields.push('alcance_empresa')
        }

        const normalizedSuggestedSites = normalizeSiteSuggestions(suggestion.sedes_sugeridas)
        if (normalizedSuggestedSites.length > 0) {
            updatePayload.sedes_sugeridas = normalizedSuggestedSites
        }

        const normalizedSuggestedSite = String(suggestion.sede_objetivo_sugerida || '').trim()
        const canApplySuggestedSite = normalizedSuggestedSite && (options.applyMode === 'overwrite' || isBlank(company.sede_objetivo))
        if (canApplySuggestedSite) {
            updatePayload.sede_objetivo = normalizedSuggestedSite
            appliedFields.push('sede_objetivo')
        }

        const canApplyIndustry = suggestion.industria && (options.applyMode === 'overwrite' || isBlank(company.industria))
        let matchedIndustryId: string | null = null
        if (canApplyIndustry) {
            updatePayload.industria = suggestion.industria
            matchedIndustryId = await ensureIndustryCatalogMatch(adminClient, suggestion.industria)
            if (matchedIndustryId) updatePayload.industria_id = matchedIndustryId
            appliedFields.push('industria')
        }

        const shouldApply = options.autoApply && (appliedFields.length > 0 || suggestion.shouldAutoApply)
        if (shouldApply && appliedFields.length > 0) {
            updatePayload.enrichment_status = 'applied'
            updatePayload.enriched_at = nowIso
            await safeUpdateEmpresa(adminClient, companyId, updatePayload)
            if (matchedIndustryId) {
                await updateIndustryRelations(adminClient, companyId, matchedIndustryId)
            }
            await setJobStatus(adminClient, jobId, 'applied', {
                confidence: suggestion.confidence,
                result_payload: suggestion
            })
            return {
                companyId,
                companyName,
                status: 'applied',
                confidence: suggestion.confidence,
                appliedFields,
                suggestion
            }
        }

        updatePayload.enrichment_status = 'ready'
        await safeUpdateEmpresa(adminClient, companyId, updatePayload)
        await setJobStatus(adminClient, jobId, 'ready', {
            confidence: suggestion.confidence,
            result_payload: suggestion
        })

        return {
            companyId,
            companyName,
            status: 'ready',
            confidence: suggestion.confidence,
            appliedFields,
            suggestion
        }
    } catch (error: any) {
        const parsed = parseErrorMessage(error, 'No se pudo enriquecer la empresa.')
        await safeUpdateEmpresa(adminClient, companyId, {
            enrichment_status: 'failed',
            enrichment_last_run_at: nowIso,
            enrichment_last_error: parsed
        })
        await setJobStatus(adminClient, jobId, 'failed', {
            error_message: parsed
        })
        return {
            companyId,
            companyName,
            status: 'failed',
            confidence: 0,
            appliedFields: [],
            error: parsed
        }
    }
}

async function requireAuthenticatedProfile() {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false as const, error: 'No autenticado' }

    const { data: profile, error: profileError } = await (supabase.from('profiles') as any)
        .select('id, role')
        .eq('id', user.id)
        .maybeSingle()
    if (profileError) return { ok: false as const, error: profileError.message }
    if (!profile?.id) return { ok: false as const, error: 'Perfil no encontrado' }

    const role = String(profile.role || '').trim().toLowerCase()
    if (!isAdminOrRh(role) && role !== 'seller') {
        return { ok: false as const, error: 'No tienes permisos para enriquecer empresas' }
    }

    return { ok: true as const, userId: String(user.id), role }
}

export async function enrichCompanyNow(
    companyId: string,
    options?: {
        applyMode?: EnrichmentApplyMode
        autoApply?: boolean
    }
) {
    try {
        const auth = await requireAuthenticatedProfile()
        if (!auth.ok) return { success: false as const, error: auth.error }

        const normalizedCompanyId = String(companyId || '').trim()
        if (!normalizedCompanyId) return { success: false as const, error: 'Empresa inválida' }

        const adminClient = createAdminClient()
        const { data: company, error: companyError } = await safeSelectEnrichmentCompanyById(adminClient, normalizedCompanyId)

        if (companyError) return { success: false as const, error: companyError.message }
        if (!company?.id) return { success: false as const, error: 'Empresa no encontrada' }

        const result = await runEnrichmentForCompany(adminClient, company as EnrichmentCompanyRow, {
            applyMode: options?.applyMode || 'fill_missing',
            autoApply: options?.autoApply ?? true,
            requestedBy: auth.userId
        })

        return {
            success: true as const,
            data: result
        }
    } catch (error: any) {
        return {
            success: false as const,
            error: parseErrorMessage(error, 'No se pudo ejecutar enriquecimiento de empresa')
        }
    }
}

export async function previewCompanyAutofillByWebsite(input: {
    website: string
    nombre?: string | null
    ubicacion?: string | null
    industria?: string | null
    descripcion?: string | null
    tamano?: number | null
}) {
    try {
        const auth = await requireAuthenticatedProfile()
        if (!auth.ok) return { success: false as const, error: auth.error }

        const normalizedWebsite = normalizeWebsite(input?.website)
        if (!isLikelyWebsite(normalizedWebsite)) {
            return { success: false as const, error: 'Ingresa una pagina web valida para autocompletar datos.' }
        }

        const suggestion = await generateCompanyEnrichmentSuggestion({
            nombre: input?.nombre || null,
            website: normalizedWebsite,
            ubicacion: input?.ubicacion || null,
            industria: input?.industria || null,
            descripcion: input?.descripcion || null,
            tamano: Number.isFinite(Number(input?.tamano)) ? Number(input?.tamano) : null
        })

        const availableFields = [
            suggestion.nombre ? 'nombre' : null,
            suggestion.industria ? 'industria' : null,
            suggestion.ubicacion ? 'ubicacion' : null,
            suggestion.alcance_empresa ? 'alcance_empresa' : null,
            suggestion.sede_objetivo_sugerida ? 'sede_objetivo' : null,
            (suggestion.sedes_sugeridas || []).length > 0 ? 'sedes_sugeridas' : null,
            suggestion.tamano ? 'tamano' : null,
            (suggestion.empleados_estimados_min || suggestion.empleados_estimados_max) ? 'empleados_estimados' : null
        ].filter((field): field is string => Boolean(field))

        return {
            success: true as const,
            data: {
                normalizedWebsite,
                suggestion,
                availableFields
            }
        }
    } catch (error: any) {
        return {
            success: false as const,
            error: parseErrorMessage(error, 'No se pudo analizar el sitio web para autocompletar.')
        }
    }
}

export async function enrichMissingCompanies(options?: {
    limit?: number
    applyMode?: EnrichmentApplyMode
    autoApply?: boolean
}) {
    try {
        const auth = await requireAuthenticatedProfile()
        if (!auth.ok) return { success: false as const, error: auth.error }

        const limit = normalizeLimit(options?.limit, 8)
        const applyMode = options?.applyMode || 'fill_missing'
        const autoApply = options?.autoApply ?? true

        const adminClient = createAdminClient()
        const { data: companies, error: companiesError } = await safeSelectRecentEnrichmentCompanies(adminClient, 120)

        if (companiesError) {
            return { success: false as const, error: companiesError.message }
        }

        const incompleteCompanies = (companies || [])
            .filter((company) => {
                const missingSize = !Number(company.tamano || 0)
                const missingLocation = isBlank(company.ubicacion)
                const missingIndustry = isBlank(company.industria)
                return missingSize || missingLocation || missingIndustry
            })
            .slice(0, limit)

        if (incompleteCompanies.length === 0) {
            return {
                success: true as const,
                data: {
                    processed: 0,
                    applied: 0,
                    ready: 0,
                    failed: 0,
                    results: [] as CompanyEnrichmentRunResult[]
                }
            }
        }

        const results: CompanyEnrichmentRunResult[] = []
        for (const company of incompleteCompanies) {
            const result = await runEnrichmentForCompany(adminClient, company, {
                applyMode,
                autoApply,
                requestedBy: auth.userId
            })
            results.push(result)
        }

        const applied = results.filter((row) => row.status === 'applied').length
        const ready = results.filter((row) => row.status === 'ready').length
        const failed = results.filter((row) => row.status === 'failed').length

        return {
            success: true as const,
            data: {
                processed: results.length,
                applied,
                ready,
                failed,
                results
            }
        }
    } catch (error: any) {
        return {
            success: false as const,
            error: parseErrorMessage(error, 'No se pudo enriquecer empresas faltantes')
        }
    }
}
