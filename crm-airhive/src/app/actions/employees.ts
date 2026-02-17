'use server'

import { createAdminClient } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

function normalizeAreaIds(details: any): string[] {
    const raw = details?.area_ids ?? details?.areas_ids ?? details?.areas
    const normalized = new Set<string>()

    if (Array.isArray(raw)) {
        raw.forEach((item: any) => {
            if (typeof item === 'string' && item.trim()) normalized.add(item.trim())
            if (item && typeof item === 'object' && typeof item.id === 'string' && item.id.trim()) normalized.add(item.id.trim())
        })
    } else if (typeof raw === 'string' && raw.trim()) {
        raw.split(',').map((v: string) => v.trim()).filter(Boolean).forEach((v: string) => normalized.add(v))
    }

    if (typeof details?.area_id === 'string' && details.area_id.trim()) {
        normalized.add(details.area_id.trim())
    }

    return Array.from(normalized)
}

function buildDetailsPayload(userId: string, details: any) {
    const areaIds = normalizeAreaIds(details)
    const payload = {
        user_id: userId,
        ...details,
        area_ids: areaIds,
        area_id: areaIds[0] || null,
        birth_date: details?.birth_date || null,
        start_date: details?.start_date || null
    }

    return payload
}

async function hasAreaIdsColumn(supabaseAdmin: any): Promise<boolean> {
    const { error } = await (supabaseAdmin
        .from('employee_profiles') as any)
        .select('area_ids')
        .limit(1)

    if (!error) return true

    const message = (error.message || '').toLowerCase()
    const code = (error.code || '').toString()
    if (code === '42703' || message.includes('column') && message.includes('area_ids')) return false

    return true
}

export async function createEmployee(data: any) {
    try {
        const supabaseAdmin = createAdminClient()
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)

        // Verify current user is admin
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('No autenticado')

        const { data: adminProfile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()

        if ((adminProfile as any)?.role !== 'admin' && (adminProfile as any)?.role !== 'rh') {
            throw new Error('No tienes permisos suficientes')
        }

        // 1. Create Auth User
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email: data.email,
            password: data.password,
            email_confirm: true
        })

        if (createError) throw createError
        if (!newUser.user) throw new Error('Error al crear usuario')

        // 2. Insert into Profiles
        const { error: profileError } = await (supabaseAdmin
            .from('profiles') as any)
            .upsert({
                id: newUser.user.id,
                full_name: data.fullName,
                role: data.role,
                username: data.email.split('@')[0],
                created_at: new Date().toISOString()
            })

        if (profileError) {
            await supabaseAdmin.auth.admin.deleteUser(newUser.user.id)
            throw new Error('Error al crear perfil: ' + profileError.message)
        }

        // 3. Insert into Employee Profiles
        const detailsPayload = buildDetailsPayload(newUser.user.id, data.details || {})

        let { error: detailsError } = await (supabaseAdmin
            .from('employee_profiles') as any)
            .insert(detailsPayload)

        if (detailsError && detailsError.message?.includes('area_ids')) {
            const requestedAreaIds = normalizeAreaIds(data.details || {})
            if (requestedAreaIds.length > 1) {
                const supportsAreaIds = await hasAreaIdsColumn(supabaseAdmin)
                if (!supportsAreaIds) {
                    throw new Error('Tu base de datos aún no soporta múltiples áreas por empleado. Ejecuta la migración 012_ensure_multi_area_and_design_area.sql y vuelve a intentar.')
                }
                throw new Error('Error al guardar múltiples áreas: ' + detailsError.message)
            }

            const fallbackPayload = { ...detailsPayload }
            delete (fallbackPayload as any).area_ids

            const fallbackInsert = await (supabaseAdmin
                .from('employee_profiles') as any)
                .insert(fallbackPayload)

            detailsError = fallbackInsert.error
        }

        if (detailsError) {
            console.error('Error creating profile details:', detailsError)
            await supabaseAdmin.auth.admin.deleteUser(newUser.user.id)
            throw new Error('Error al crear perfil detallado: ' + detailsError.message)
        }

        revalidatePath('/settings/equipo')
        return { success: true }
    } catch (error: any) {
        console.error('Create Employee Error:', error)
        return { success: false, error: error.message }
    }
}

export async function updateEmployee(id: string, data: any) {
    try {
        const supabaseAdmin = createAdminClient()
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)

        // Verify current user is admin
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('No autenticado')

        const { data: adminProfile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()

        if ((adminProfile as any)?.role !== 'admin' && (adminProfile as any)?.role !== 'rh') {
            throw new Error('No tienes permisos suficientes')
        }

        // Update Profile
        const { error: profileError } = await (supabaseAdmin
            .from('profiles') as any)
            .update({
                full_name: data.fullName,
                role: data.role,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)

        if (profileError) throw profileError

        // Update Auth Email/Password if provided
        const authUpdates: any = {}
        if (data.email) authUpdates.email = data.email
        if (data.password) authUpdates.password = data.password

        if (Object.keys(authUpdates).length > 0) {
            const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
                id,
                authUpdates
            )
            if (authError) throw authError
        }

        // Update Details
        if (data.details) {
            // Sanitize nullable fields (Dates & UUIDs) to handle empty strings
            const detailsPayload = buildDetailsPayload(id, data.details)
            const nullableFields = [
                'birth_date', 'start_date',
                'job_position_id', 'area_id', 'seniority_id', 'gender_id',
                'education_level_id', 'career_id', 'university_id',
                'contract_type_id', 'work_modality_id', 'city_id', 'country_id'
            ]

            nullableFields.forEach(field => {
                if (detailsPayload[field] === '') detailsPayload[field] = null
            })

            let { error: detailsError } = await (supabaseAdmin
                .from('employee_profiles') as any)
                .upsert({
                    ...detailsPayload,
                    updated_at: new Date().toISOString()
                })

            if (detailsError && detailsError.message?.includes('area_ids')) {
                const requestedAreaIds = normalizeAreaIds(data.details || {})
                if (requestedAreaIds.length > 1) {
                    const supportsAreaIds = await hasAreaIdsColumn(supabaseAdmin)
                    if (!supportsAreaIds) {
                        throw new Error('Tu base de datos aún no soporta múltiples áreas por empleado. Ejecuta la migración 012_ensure_multi_area_and_design_area.sql y vuelve a intentar.')
                    }
                    throw new Error('Error al guardar múltiples áreas: ' + detailsError.message)
                }

                const fallbackPayload = { ...detailsPayload }
                delete (fallbackPayload as any).area_ids

                const fallbackUpdate = await (supabaseAdmin
                    .from('employee_profiles') as any)
                    .upsert({
                        ...fallbackPayload,
                        updated_at: new Date().toISOString()
                    })

                detailsError = fallbackUpdate.error
            }

            if (detailsError) throw detailsError
        }

        revalidatePath('/settings/equipo')
        return { success: true }
    } catch (error: any) {
        console.error('Update Employee Error:', error)
        return { success: false, error: error.message }
    }
}

export async function toggleEmployeeStatus(id: string, banned: boolean) {
    try {
        const supabaseAdmin = createAdminClient()
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)

        // Verify current user is admin
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('No autenticado')

        const { data: adminProfile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()

        if ((adminProfile as any)?.role !== 'admin' && (adminProfile as any)?.role !== 'rh') {
            throw new Error('No tienes permisos suficientes')
        }

        const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
            ban_duration: banned ? '876000h' : 'none' // 100 years ban or unban
        })

        if (error) throw error

        revalidatePath('/settings/equipo')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function getEmployeesList() {
    try {
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('No autenticado')

        // Fetch profiles with email (username in this system seems to be email)
        const { data, error } = await supabase
            .from('profiles')
            .select('id, full_name, username')
            .order('full_name')

        if (error) throw error

        return { success: true, data }
    } catch (error: any) {
        console.error('Error fetching employees list:', error)
        return { success: false, error: error.message }
    }
}
