'use server'

import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
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
    'industrias'
]

const ADMIN_DELETABLE_TABLES = [
    'industrias'
]

export async function getCatalogs() {
    try {
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)

        const results: Record<string, any[]> = {}
        const errors: string[] = []

        // Parallel fetch for speed
        await Promise.all(CATALOG_TABLES.map(async (table) => {
            const { data, error } = await supabase
                .from(table)
                .select('id, name')
                .eq('is_active', true)
                .order('name')

            if (!error) {
                results[table] = data || []
            } else {
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

export async function createCatalogItem(table: string, name: string) {
    try {
        if (!CATALOG_TABLES.includes(table)) {
            throw new Error('Invalid catalog table')
        }

        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)
        const supabaseAdmin = createAdminClient()

        // Verify permissions (Admin or RH only)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('No autenticado')

        const { data: profile } = await (supabase
            .from('profiles') as any)
            .select('role')
            .eq('id', user.id)
            .single()

        if (profile?.role !== 'admin' && profile?.role !== 'rh') {
            throw new Error('No tienes permisos para modificar catálogos')
        }

        // trim and capitalize?
        const formattedName = name.trim()

        const { data, error } = await (supabaseAdmin
            .from(table) as any)
            .insert({ name: formattedName, is_active: true })
            .select('id, name')
            .single()

        if (error) throw error

        return { success: true, data }
    } catch (error: any) {
        console.error(`Error creating item in ${table}:`, error)
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
