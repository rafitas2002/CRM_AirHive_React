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
    const baseData = {
        nombre: preLead.nombre_empresa.trim(),
        ubicacion: preLead.ubicacion || null,
        descripcion: preLead.notas || null,
        owner_id: userId,
        industria: preLead.industria || 'Sin clasificar',
        industria_id: preLead.industria_id || null,
        tamano: preLead.tamano || 1,
        website: preLead.website || null,
        logo_url: preLead.logo_url || null,
        source_channel: 'pre_lead',
        lifecycle_stage: 'pre_lead',
        created_by: userId,
        updated_by: userId,
        pre_leads_count: 1,
        leads_count: 0,
        first_pre_lead_at: new Date().toISOString(),
        last_pre_lead_at: new Date().toISOString()
    }

    const insertVariants = [
        baseData,
        // DB without lifecycle/source audit columns
        (() => {
            const v = { ...baseData } as any
            delete v.source_channel
            delete v.lifecycle_stage
            delete v.created_by
            delete v.updated_by
            delete v.pre_leads_count
            delete v.leads_count
            delete v.first_pre_lead_at
            delete v.last_pre_lead_at
            return v
        })(),
        // Legacy minimal fallback
        {
            nombre: baseData.nombre,
            ubicacion: baseData.ubicacion,
            descripcion: baseData.descripcion,
            owner_id: baseData.owner_id,
            industria: baseData.industria
        }
    ]

    for (const variant of insertVariants) {
        const { data, error } = await (supabase.from('empresas') as any).insert(variant).select('id, nombre').single()
        if (!error && data) return data
    }

    console.error('Error in createCompanyFromPreLead: could not insert with any variant')
    return null
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
