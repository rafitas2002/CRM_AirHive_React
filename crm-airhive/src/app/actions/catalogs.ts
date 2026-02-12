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
    'countries'
]

export async function getCatalogs() {
    try {
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)

        const results: Record<string, any[]> = {}

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
                results[table] = []
            }
        }))

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
