import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Search for an existing company by name (case-insensitive)
 */
export async function findCompanyByName(
    supabase: SupabaseClient,
    companyName: string
): Promise<{ id: string; nombre: string } | null> {
    if (!companyName || companyName.trim() === '') {
        return null
    }

    const { data, error } = await supabase
        .from('empresas')
        .select('id, nombre')
        .ilike('nombre', companyName.trim())
        .limit(1)
        .single()

    if (error || !data) {
        return null
    }

    return data
}

/**
 * Create a new company from pre-lead data
 */
export async function createCompanyFromPreLead(
    supabase: SupabaseClient,
    preLead: {
        nombre_empresa: string
        telefonos?: string[]
        correos?: string[]
        ubicacion?: string
        notas?: string
        industria?: string
        industria_id?: string
        tamano?: number
        website?: string
        logo_url?: string
    },
    userId: string
): Promise<{ id: string; nombre: string } | null> {
    const companyData = {
        nombre: preLead.nombre_empresa.trim(),
        ubicacion: preLead.ubicacion || null,
        descripcion: preLead.notas || null,
        owner_id: userId,
        industria: preLead.industria || 'Sin clasificar',
        industria_id: preLead.industria_id || null,
        tamano: preLead.tamano || 1,
        website: preLead.website || null,
        logo_url: preLead.logo_url || null
    }

    const { data, error } = await (supabase.from('empresas') as any).insert(companyData).select('id, nombre').single()

    if (error) {
        console.error('Error in createCompanyFromPreLead [Full Object]:', error)
        console.error('Error Message:', error.message)
        console.error('Error Code:', error.code)
        console.error('Error Details:', error.details)
        console.error('Data attempted to insert:', companyData)
        return null
    }

    return data
}

/**
 * Find existing company or create a new one from pre-lead data
 * Returns the company ID to link with the pre-lead
 */
export async function findOrCreateCompany(
    supabase: SupabaseClient,
    preLead: {
        nombre_empresa: string
        telefonos?: string[]
        correos?: string[]
        ubicacion?: string
        notas?: string
        industria?: string
        industria_id?: string
        tamano?: number
        website?: string
        logo_url?: string
    },
    userId: string
): Promise<{ id: string; nombre: string; isNew: boolean } | null> {
    // First, try to find existing company
    const existingCompany = await findCompanyByName(supabase, preLead.nombre_empresa)

    if (existingCompany) {
        return {
            ...existingCompany,
            isNew: false
        }
    }

    // If not found, create a new one
    const newCompany = await createCompanyFromPreLead(supabase, preLead, userId)

    if (!newCompany) {
        return null
    }

    return {
        ...newCompany,
        isNew: true
    }
}
