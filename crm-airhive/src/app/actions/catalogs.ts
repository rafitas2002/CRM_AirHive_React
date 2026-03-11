'use server'

import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { normalizeLocationDuplicateKey, normalizeLocationLabel } from '@/lib/locationUtils'
import { cookies } from 'next/headers'

const CATALOG_TABLES = [
    'job_positions',
    'areas',
    'seniority_levels',
    'genders',
    'education_levels',
    'careers',
    'universities',
    'contract_types',
    'work_modalities',
    'cities',
    'countries',
    'industrias',
    'company_locations',
    'company_sizes'
]

const ADMIN_DELETABLE_TABLES = [
    'industrias'
]

const OPTIONAL_CATALOG_TABLES = new Set([
    'company_locations',
    'company_sizes'
])

const INDUSTRY_APPROVER_USERNAME = 'jesus.gracia'
const INDUSTRY_APPROVER_FULL_NAME = 'jesus gracia'

type CatalogCreateContext = {
    module?: string
    entityType?: string
    entityId?: string
    entityName?: string
}

const normalizeSignature = (value: unknown) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

const isAdminOrRH = (role: unknown) => {
    const normalized = String(role || '').trim().toLowerCase()
    return normalized === 'admin' || normalized === 'rh'
}

const isIndustryApproverProfile = (profile: any, email?: string | null) => {
    const normalizedUsername = normalizeSignature(profile?.username)
    const normalizedFullName = normalizeSignature(profile?.full_name)
    const normalizedEmailUser = normalizeSignature(String(email || '').split('@')[0])
    return normalizedUsername === INDUSTRY_APPROVER_USERNAME
        || normalizedFullName === INDUSTRY_APPROVER_FULL_NAME
        || normalizedEmailUser === INDUSTRY_APPROVER_USERNAME
}

const findIndustryApproverProfile = async (supabaseAdmin: ReturnType<typeof createAdminClient>) => {
    const byUsername = await (supabaseAdmin.from('profiles') as any)
        .select('id, username, full_name, role')
        .ilike('username', INDUSTRY_APPROVER_USERNAME)
        .limit(1)
        .maybeSingle()

    if (byUsername?.data?.id) return byUsername.data

    const byFullName = await (supabaseAdmin.from('profiles') as any)
        .select('id, username, full_name, role')
        .ilike('full_name', 'Jesus Gracia')
        .limit(1)
        .maybeSingle()

    if (byFullName?.data?.id) return byFullName.data

    const adminFallback = await (supabaseAdmin.from('profiles') as any)
        .select('id, username, full_name, role')
        .eq('role', 'admin')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

    return adminFallback?.data || null
}

const buildIndustryContextPayload = (context?: CatalogCreateContext) => ({
    context_module: String(context?.module || '').trim() || null,
    context_entity_type: String(context?.entityType || '').trim() || null,
    context_entity_id: String(context?.entityId || '').trim() || null,
    context_entity_name: String(context?.entityName || '').trim() || null
})

export async function getCatalogs() {
    try {
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)

        const results: Record<string, any[]> = {}
        const errors: string[] = []

        // Parallel fetch for speed
        await Promise.all(CATALOG_TABLES.map(async (table) => {
            const query = (supabase.from(table) as any)
            let data: any[] | null = null
            let error: any = null

            if (table === 'company_sizes') {
                const res = await query
                    .select('id, name, size_value, code, sort_order')
                    .eq('is_active', true)
                    .order('sort_order', { ascending: true })
                    .order('size_value', { ascending: true })
                data = res.data || []
                error = res.error
            } else {
                const res = await query
                    .select('id, name')
                    .eq('is_active', true)
                    .order('name')
                data = res.data || []
                error = res.error
            }

            if (!error) {
                results[table] = data || []
            } else {
                const errorCode = String((error as any)?.code || '')
                const errorMessage = String((error as any)?.message || '')
                const isMissingOptionalTable = OPTIONAL_CATALOG_TABLES.has(table)
                    && (errorCode === '42P01' || errorCode === 'PGRST205' || errorMessage.includes(table))
                if (isMissingOptionalTable) {
                    results[table] = []
                    return
                }
                console.error(`Error fetching catalog ${table}:`, error)
                errors.push(`${table}: ${error.message}`)
                results[table] = []
            }
        }))

        if (errors.length > 0) {
            return { success: false, error: errors.join(', '), data: results }
        }

        return { success: true, data: results }
    } catch (error: any) {
        console.error('Error fetching catalogs:', error)
        return { success: false, error: error.message }
    }
}

export async function ensureCompanyLocationCatalogItem(locationLabel: string) {
    try {
        const canonicalName = normalizeLocationLabel(locationLabel)
        const duplicateKey = normalizeLocationDuplicateKey(canonicalName)

        if (!canonicalName || !duplicateKey) {
            return { success: true, skipped: true, data: null }
        }

        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)
        const supabaseAdmin = createAdminClient()

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('No autenticado')

        const { data, error } = await (supabaseAdmin
            .from('company_locations') as any)
            .upsert(
                {
                    name: canonicalName,
                    duplicate_key: duplicateKey,
                    is_active: true
                },
                { onConflict: 'duplicate_key' }
            )
            .select('id, name')
            .single()

        if (error) throw error

        return { success: true, data }
    } catch (error: any) {
        const code = String(error?.code || '')
        const message = String(error?.message || '')
        const missingTable = code === '42P01' || code === 'PGRST205' || /company_locations/i.test(message)

        if (missingTable) {
            console.warn('Tabla company_locations no disponible. Aplica la migración del catálogo de ubicaciones para persistencia automática.')
        } else {
            console.error('Error ensuring company location catalog item:', error)
        }

        return { success: false, error: message || 'No se pudo guardar la ubicación en catálogo' }
    }
}

export async function createCatalogItem(table: string, name: string, context?: CatalogCreateContext) {
    try {
        if (!CATALOG_TABLES.includes(table)) {
            throw new Error('Invalid catalog table')
        }
        if (table === 'company_sizes') {
            throw new Error('El catálogo de tamaños de empresa se administra por migración (DB-first) y no permite altas manuales desde esta pantalla')
        }

        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)
        const supabaseAdmin = createAdminClient()

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('No autenticado')

        const { data: profile } = await (supabase
            .from('profiles') as any)
            .select('role, username, full_name')
            .eq('id', user.id)
            .single()

        const formattedName = name.trim()
        if (!formattedName) throw new Error('Escribe un nombre válido')

        if (table === 'industrias') {
            const normalizedName = normalizeSignature(formattedName)
            const { data: existingIndustry } = await (supabaseAdmin.from('industrias') as any)
                .select('id, name, is_active')
                .ilike('name', formattedName)
                .limit(1)
                .maybeSingle()

            if (existingIndustry?.id) {
                return {
                    success: true,
                    data: {
                        id: String(existingIndustry.id),
                        name: String(existingIndustry.name || formattedName)
                    },
                    alreadyExists: true
                }
            }

            const approver = await findIndustryApproverProfile(supabaseAdmin)
            const userIsApprover = approver?.id
                ? String(approver.id) === String(user.id)
                : isIndustryApproverProfile(profile, user.email || null)
            if (userIsApprover) {
                const { data: approvedIndustry, error: approvedIndustryError } = await (supabaseAdmin
                    .from('industrias') as any)
                    .insert({ name: formattedName, is_active: true })
                    .select('id, name')
                    .single()

                if (approvedIndustryError) throw approvedIndustryError

                return {
                    success: true,
                    data: approvedIndustry,
                    approvedDirectly: true
                }
            }

            const requesterName = String(profile?.full_name || profile?.username || user.email || 'Usuario').trim() || 'Usuario'

            const { data: pendingRequest, error: pendingRequestError } = await (supabaseAdmin
                .from('industry_change_requests') as any)
                .insert({
                    proposed_name: formattedName,
                    normalized_name: normalizedName,
                    status: 'pending',
                    requested_by: user.id,
                    requested_by_name: requesterName,
                    ...buildIndustryContextPayload(context)
                })
                .select('id, proposed_name')
                .single()

            if (pendingRequestError) throw pendingRequestError

            const pendingOptionId = `pending_industry:${pendingRequest.id}`

            return {
                success: true,
                data: {
                    id: pendingOptionId,
                    name: String(pendingRequest.proposed_name || formattedName)
                },
                pendingApproval: true,
                approver: approver
                    ? {
                        id: String(approver.id),
                        name: String(approver.full_name || approver.username || 'Admin')
                    }
                    : null
            }
        }

        if (!isAdminOrRH(profile?.role)) {
            throw new Error('No tienes permisos para modificar catálogos')
        }

        const { data, error } = await (supabaseAdmin
            .from(table) as any)
            .insert({ name: formattedName, is_active: true })
            .select('id, name')
            .single()

        if (error) throw error

        return { success: true, data }
    } catch (error: any) {
        console.error(`Error creating item in ${table}:`, error)
        const errorCode = String(error?.code || '')
        const errorMessage = String(error?.message || '')
        if (table === 'industrias' && (errorCode === '42P01' || /industry_change_requests/i.test(errorMessage))) {
            return { success: false, error: 'Falta la migración 100 de aprobación de industrias. Ejecútala en Supabase y vuelve a intentar.' }
        }
        return { success: false, error: error.message }
    }
}

export async function deleteCatalogItem(table: string, id: string) {
    try {
        if (!ADMIN_DELETABLE_TABLES.includes(table)) {
            throw new Error('Este catálogo no permite eliminaciones')
        }

        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)
        const supabaseAdmin = createAdminClient()

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('No autenticado')

        const { data: profile } = await (supabase
            .from('profiles') as any)
            .select('role')
            .eq('id', user.id)
            .single()

        if (profile?.role !== 'admin') {
            throw new Error('Solo los admins pueden eliminar industrias')
        }

        const [{ data: primaryCompanies }, { data: companyIndustryLinks, error: linksError }] = await Promise.all([
            (supabaseAdmin
                .from('empresas') as any)
                .select('id, nombre')
                .eq('industria_id', id),
            (supabaseAdmin
                .from('company_industries') as any)
                .select('empresa_id')
                .eq('industria_id', id)
        ])

        const linkedCompanyIds = new Set<string>((companyIndustryLinks || []).map((row: any) => row.empresa_id).filter(Boolean))
        const primaryList = (primaryCompanies || []) as { id: string; nombre: string }[]
        primaryList.forEach((c) => linkedCompanyIds.add(c.id))

        let linkedCompanies: { id: string; nombre: string }[] = []
        if (linkedCompanyIds.size > 0) {
            const { data: companiesFromLinks } = await (supabaseAdmin
                .from('empresas') as any)
                .select('id, nombre')
                .in('id', Array.from(linkedCompanyIds))

            linkedCompanies = (companiesFromLinks || []) as { id: string; nombre: string }[]
        } else if (linksError?.code && linksError.code !== '42P01') {
            throw linksError
        }

        if (linkedCompanies.length > 0) {
            const companyNames = linkedCompanies
                .map((c) => c.nombre)
                .filter(Boolean)
                .sort((a, b) => a.localeCompare(b, 'es'))

            return {
                success: false,
                error: 'Existen empresas registradas con la industria que deseas borrar.',
                companies: companyNames
            }
        }

        const { error } = await (supabaseAdmin
            .from(table) as any)
            .delete()
            .eq('id', id)

        if (error) throw error

        return { success: true }
    } catch (error: any) {
        console.error(`Error deleting item from ${table}:`, error)
        if (error?.code === '23503') {
            return { success: false, error: 'No se puede eliminar porque está relacionado con registros existentes.' }
        }
        return { success: false, error: error.message || 'Error al eliminar opción' }
    }
}

export async function getIndustryApprovalQueue(options?: { limit?: number; includeCatalog?: boolean }) {
    try {
        const limit = Math.max(1, Math.min(200, Number(options?.limit || 20)))
        const includeCatalog = Boolean(options?.includeCatalog)

        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)
        const supabaseAdmin = createAdminClient()

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('No autenticado')

        const { data: profile } = await (supabase.from('profiles') as any)
            .select('id, role, username, full_name')
            .eq('id', user.id)
            .single()

        const approver = await findIndustryApproverProfile(supabaseAdmin)
        const userIsApprover = approver?.id
            ? String(approver.id) === String(user.id)
            : isIndustryApproverProfile(profile, user.email || null)
        const canReview = userIsApprover || (!approver?.id && isAdminOrRH(profile?.role))
        if (!canReview) {
            return {
                success: true,
                data: {
                    isApprover: false,
                    pendingCount: 0,
                    pendingRequests: [],
                    industries: [],
                    industriesWithoutBadge: []
                }
            }
        }

        const [pendingRes, pendingCountRes, industriesRes, allIndustriesRes] = await Promise.all([
            (supabaseAdmin.from('industry_change_requests') as any)
                .select('id, proposed_name, normalized_name, requested_by, requested_by_name, context_module, context_entity_type, context_entity_id, context_entity_name, created_at')
                .eq('status', 'pending')
                .order('created_at', { ascending: false })
                .limit(limit),
            (supabaseAdmin.from('industry_change_requests') as any)
                .select('id', { count: 'exact', head: true })
                .eq('status', 'pending'),
            includeCatalog
                ? (supabaseAdmin.from('industrias') as any)
                    .select('id, name, is_active')
                    .eq('is_active', true)
                    .order('name', { ascending: true })
                : Promise.resolve({ data: [] as any[], error: null }),
            includeCatalog
                ? (supabaseAdmin.from('industrias') as any)
                    .select('id, name, is_active')
                    .order('name', { ascending: true })
                : Promise.resolve({ data: [] as any[], error: null })
        ])

        if (pendingRes?.error) throw pendingRes.error
        if (pendingCountRes?.error) throw pendingCountRes.error
        if (industriesRes?.error) throw industriesRes.error
        if (allIndustriesRes?.error) throw allIndustriesRes.error

        const pendingRows = Array.isArray(pendingRes?.data) ? pendingRes.data : []
        const pendingCount = Number(pendingCountRes?.count || 0)
        const allIndustries = Array.isArray(allIndustriesRes?.data) ? allIndustriesRes.data : []

        // A nivel de catálogo, toda industria registrada tiene badge de industria vinculado.
        // Aquí solo marcamos entradas corruptas/incompletas (sin id o sin nombre) como "sin badge".
        const industriesWithoutBadge = allIndustries
            .filter((industry: any) => {
                const industryId = String(industry?.id || '').trim()
                const industryName = String(industry?.name || '').trim()
                return !industryId || !industryName
            })
            .map((industry: any) => ({
                id: String(industry?.id || ''),
                name: String(industry?.name || 'Industria sin nombre'),
                is_active: Boolean(industry?.is_active)
            }))
            .sort((a: any, b: any) => a.name.localeCompare(b.name, 'es'))

        const requesterIds = Array.from(new Set(
            pendingRows
                .map((row: any) => String(row?.requested_by || '').trim())
                .filter(Boolean)
        ))
        const requesterNameById = new Map<string, string>()
        if (requesterIds.length > 0) {
            const { data: requesterProfiles } = await (supabaseAdmin.from('profiles') as any)
                .select('id, full_name, username')
                .in('id', requesterIds)
            for (const row of requesterProfiles || []) {
                const rowId = String((row as any)?.id || '').trim()
                if (!rowId) continue
                requesterNameById.set(
                    rowId,
                    String((row as any)?.full_name || (row as any)?.username || 'Usuario').trim() || 'Usuario'
                )
            }
        }

        const proposedNames = Array.from(new Set(
            pendingRows
                .map((row: any) => String(row?.proposed_name || '').trim())
                .filter(Boolean)
        ))

        const [companiesRes, preLeadsByGiroRes, preLeadsByIndustriaRes] = proposedNames.length > 0
            ? await Promise.all([
                (supabaseAdmin.from('empresas') as any)
                    .select('id, nombre, industria')
                    .in('industria', proposedNames),
                (supabaseAdmin.from('pre_leads') as any)
                    .select('id, nombre_empresa, giro_empresa')
                    .in('giro_empresa', proposedNames),
                (supabaseAdmin.from('pre_leads') as any)
                    .select('id, nombre_empresa, industria')
                    .in('industria', proposedNames)
            ])
            : [
                { data: [], error: null } as any,
                { data: [], error: null } as any,
                { data: [], error: null } as any
            ]

        if (companiesRes?.error) throw companiesRes.error
        if (preLeadsByGiroRes?.error) throw preLeadsByGiroRes.error
        if (preLeadsByIndustriaRes?.error && String(preLeadsByIndustriaRes.error?.code || '') !== '42703') {
            throw preLeadsByIndustriaRes.error
        }

        const companies = Array.isArray(companiesRes?.data) ? companiesRes.data : []
        const preLeadsByGiro = Array.isArray(preLeadsByGiroRes?.data) ? preLeadsByGiroRes.data : []
        const preLeadsByIndustria = Array.isArray(preLeadsByIndustriaRes?.data) ? preLeadsByIndustriaRes.data : []

        const preLeadById = new Map<string, any>()
        for (const row of [...preLeadsByGiro, ...preLeadsByIndustria]) {
            const key = String((row as any)?.id || '').trim()
            if (!key) continue
            preLeadById.set(key, row)
        }
        const preLeads = Array.from(preLeadById.values())

        const queue = pendingRows.map((row: any) => {
            const proposedName = String(row?.proposed_name || '').trim()
            const normalized = normalizeSignature(proposedName)
            const matchingCompanies = companies.filter((company: any) => normalizeSignature(company?.industria) === normalized)
            const matchingPreLeads = preLeads.filter((preLead: any) => (
                normalizeSignature((preLead as any)?.giro_empresa) === normalized
                || normalizeSignature((preLead as any)?.industria) === normalized
            ))
            const requestedBy = String(row?.requested_by || '').trim()

            return {
                id: String(row?.id || ''),
                proposed_name: proposedName,
                requested_by: requestedBy || null,
                requested_by_name: String(row?.requested_by_name || requesterNameById.get(requestedBy) || 'Usuario'),
                context_module: String(row?.context_module || ''),
                context_entity_type: String(row?.context_entity_type || ''),
                context_entity_id: String(row?.context_entity_id || ''),
                context_entity_name: String(row?.context_entity_name || ''),
                created_at: String(row?.created_at || ''),
                impacted_companies_count: matchingCompanies.length,
                impacted_pre_leads_count: matchingPreLeads.length,
                impacted_companies_sample: matchingCompanies
                    .slice(0, 3)
                    .map((company: any) => String(company?.nombre || '').trim())
                    .filter(Boolean),
                impacted_pre_leads_sample: matchingPreLeads
                    .slice(0, 3)
                    .map((preLead: any) => String((preLead as any)?.nombre_empresa || '').trim())
                    .filter(Boolean)
            }
        })

        return {
            success: true,
            data: {
                isApprover: true,
                pendingCount,
                pendingRequests: queue,
                industries: Array.isArray(industriesRes?.data) ? industriesRes.data : [],
                industriesWithoutBadge
            }
        }
    } catch (error: any) {
        console.error('Error fetching industry approval queue:', error)
        return { success: false, error: error.message || 'No se pudo cargar la cola de aprobación de industrias' }
    }
}

export async function resolveIndustryApprovalRequest(payload: {
    requestId: string
    decision: 'approve_new' | 'map_existing' | 'reject'
    targetIndustryId?: string
    newIndustryName?: string
    note?: string
}) {
    try {
        const requestId = String(payload?.requestId || '').trim()
        const decision = String(payload?.decision || '').trim() as 'approve_new' | 'map_existing' | 'reject'

        if (!requestId) throw new Error('Solicitud inválida')
        if (!['approve_new', 'map_existing', 'reject'].includes(decision)) {
            throw new Error('Decisión inválida')
        }

        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)
        const supabaseAdmin = createAdminClient()

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('No autenticado')

        const { data: profile } = await (supabase.from('profiles') as any)
            .select('id, role, username, full_name')
            .eq('id', user.id)
            .single()

        const approver = await findIndustryApproverProfile(supabaseAdmin)
        const userIsApprover = approver?.id
            ? String(approver.id) === String(user.id)
            : isIndustryApproverProfile(profile, user.email || null)
        const canReview = userIsApprover || (!approver?.id && isAdminOrRH(profile?.role))
        if (!canReview) throw new Error('No tienes permisos para resolver solicitudes de industria')

        const { data: requestRow, error: requestError } = await (supabaseAdmin.from('industry_change_requests') as any)
            .select('id, proposed_name, status, context_entity_type, context_entity_id, context_entity_name')
            .eq('id', requestId)
            .maybeSingle()
        if (requestError) throw requestError
        if (!requestRow?.id) throw new Error('Solicitud no encontrada')
        if (String(requestRow.status || '') !== 'pending') {
            throw new Error('La solicitud ya fue resuelta anteriormente')
        }

        const proposedName = String(requestRow.proposed_name || '').trim()
        const contextEntityType = String(requestRow.context_entity_type || '').trim().toLowerCase()
        const contextEntityId = String(requestRow.context_entity_id || '').trim()
        const contextEntityName = String(requestRow.context_entity_name || '').trim()

        let resolvedIndustryId: string | null = null
        let resolvedIndustryName: string | null = null

        if (decision === 'approve_new') {
            const desiredName = String(payload?.newIndustryName || '').trim() || proposedName
            if (!desiredName) throw new Error('Nombre de industria inválido')

            const { data: existingIndustry, error: existingIndustryError } = await (supabaseAdmin.from('industrias') as any)
                .select('id, name')
                .ilike('name', desiredName)
                .limit(1)
                .maybeSingle()
            if (existingIndustryError) throw existingIndustryError

            if (existingIndustry?.id) {
                resolvedIndustryId = String(existingIndustry.id)
                resolvedIndustryName = String(existingIndustry.name || desiredName)
            } else {
                const { data: createdIndustry, error: createdIndustryError } = await (supabaseAdmin.from('industrias') as any)
                    .insert({ name: desiredName, is_active: true })
                    .select('id, name')
                    .single()
                if (createdIndustryError) throw createdIndustryError
                resolvedIndustryId = String(createdIndustry.id)
                resolvedIndustryName = String(createdIndustry.name || desiredName)
            }
        } else if (decision === 'map_existing') {
            const targetIndustryId = String(payload?.targetIndustryId || '').trim()
            if (!targetIndustryId) throw new Error('Selecciona una industria existente para mapear')

            const { data: targetIndustry, error: targetIndustryError } = await (supabaseAdmin.from('industrias') as any)
                .select('id, name')
                .eq('id', targetIndustryId)
                .maybeSingle()
            if (targetIndustryError) throw targetIndustryError
            if (!targetIndustry?.id) throw new Error('La industria seleccionada no existe')

            resolvedIndustryId = String(targetIndustry.id)
            resolvedIndustryName = String(targetIndustry.name || '')
        }

        if (decision !== 'reject' && resolvedIndustryId && resolvedIndustryName) {
            const companyPayload = {
                industria_id: resolvedIndustryId,
                industria: resolvedIndustryName
            }
            const preLeadPayloadFull = {
                industria_id: resolvedIndustryId,
                industria: resolvedIndustryName,
                giro_empresa: resolvedIndustryName
            }
            const preLeadPayloadFallback = {
                industria_id: resolvedIndustryId,
                giro_empresa: resolvedIndustryName
            }

            const applyCompanyScope = (query: any) => {
                if (contextEntityType === 'company' && contextEntityId) return query.eq('id', contextEntityId)
                if (contextEntityName) return query.ilike('nombre', contextEntityName).ilike('industria', proposedName)
                return query.ilike('industria', proposedName)
            }
            const applyPreLeadScope = (query: any) => {
                if (contextEntityType === 'pre_lead' && contextEntityId) return query.eq('id', Number(contextEntityId))
                if (contextEntityName) return query.ilike('nombre_empresa', contextEntityName).ilike('giro_empresa', proposedName)
                return query.ilike('giro_empresa', proposedName)
            }

            const companyResult = await applyCompanyScope((supabaseAdmin.from('empresas') as any).update(companyPayload))
            if (companyResult?.error) throw companyResult.error

            const preLeadResult = await applyPreLeadScope((supabaseAdmin.from('pre_leads') as any).update(preLeadPayloadFull))
            if (preLeadResult?.error) {
                if (String(preLeadResult.error?.code || '') === '42703') {
                    const preLeadFallbackResult = await applyPreLeadScope((supabaseAdmin.from('pre_leads') as any).update(preLeadPayloadFallback))
                    if (preLeadFallbackResult?.error) throw preLeadFallbackResult.error
                } else {
                    throw preLeadResult.error
                }
            }
        }

        const statusByDecision = {
            approve_new: 'approved_new',
            map_existing: 'mapped_existing',
            reject: 'rejected'
        } as const

        const { error: resolveError } = await (supabaseAdmin.from('industry_change_requests') as any)
            .update({
                status: statusByDecision[decision],
                resolved_industria_id: resolvedIndustryId,
                resolved_industria_name: resolvedIndustryName,
                resolution_note: String(payload?.note || '').trim() || null,
                resolved_by: user.id,
                resolved_at: new Date().toISOString()
            })
            .eq('id', requestId)
        if (resolveError) throw resolveError

        return {
            success: true,
            data: {
                requestId,
                status: statusByDecision[decision],
                resolvedIndustryId,
                resolvedIndustryName
            }
        }
    } catch (error: any) {
        console.error('Error resolving industry approval request:', error)
        return { success: false, error: error.message || 'No se pudo resolver la solicitud de industria' }
    }
}

export async function getIndustriesForBadges() {
    try {
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)
        const supabaseAdmin = createAdminClient()

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('No autenticado')

        const [{ data: industries, error: indError }, { data: companies, error: compError }, companyIndustriesResult] = await Promise.all([
            (supabaseAdmin.from('industrias') as any)
                .select('id, name, is_active')
                .order('name', { ascending: true }),
            (supabaseAdmin.from('empresas') as any)
                .select('industria_id, industria')
                .not('industria_id', 'is', null),
            (supabaseAdmin.from('company_industries') as any)
                .select('industria_id, industrias(name, is_active)')
        ])

        if (indError) throw indError
        if (compError) throw compError
        if (companyIndustriesResult.error && companyIndustriesResult.error.code !== '42P01') {
            throw companyIndustriesResult.error
        }

        const map = new Map<string, { id: string, name: string, is_active?: boolean }>()

        for (const ind of industries || []) {
            if (ind?.id) {
                map.set(ind.id, {
                    id: ind.id,
                    name: ind.name || 'Sin nombre',
                    is_active: ind.is_active
                })
            }
        }

        for (const row of companies || []) {
            if (!row?.industria_id) continue
            if (!map.has(row.industria_id)) {
                map.set(row.industria_id, {
                    id: row.industria_id,
                    name: row.industria || 'Industria vinculada',
                    is_active: false
                })
            } else if (row.industria && !map.get(row.industria_id)?.name) {
                map.set(row.industria_id, {
                    ...(map.get(row.industria_id) as { id: string, name: string, is_active?: boolean }),
                    name: row.industria
                })
            }
        }

        for (const row of companyIndustriesResult.data || []) {
            if (!row?.industria_id) continue
            const linked = row.industrias
            const linkedName = linked?.name
            const linkedActive = linked?.is_active
            if (!map.has(row.industria_id)) {
                map.set(row.industria_id, {
                    id: row.industria_id,
                    name: linkedName || 'Industria vinculada',
                    is_active: linkedActive ?? false
                })
            }
        }

        const result = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'))
        return { success: true, data: result }
    } catch (error: any) {
        console.error('Error fetching industries for badges:', error)
        return { success: false, error: error.message || 'Error al cargar industrias para badges' }
    }
}
