'use server'

import { createClient } from '@/lib/supabase-server'
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

        const { data, error } = await (supabase
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
