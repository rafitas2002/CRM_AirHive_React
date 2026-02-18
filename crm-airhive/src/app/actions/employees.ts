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

function normalizeJobPositionIds(details: any): string[] {
    const raw = details?.job_position_ids ?? details?.job_positions
    const normalized = new Set<string>()

    if (Array.isArray(raw)) {
        raw.forEach((item: any) => {
            if (typeof item === 'string' && item.trim()) normalized.add(item.trim())
            if (item && typeof item === 'object' && typeof item.id === 'string' && item.id.trim()) normalized.add(item.id.trim())
        })
    } else if (typeof raw === 'string' && raw.trim()) {
        raw.split(',').map((v: string) => v.trim()).filter(Boolean).forEach((v: string) => normalized.add(v))
    }

    if (typeof details?.job_position_id === 'string' && details.job_position_id.trim()) {
        normalized.add(details.job_position_id.trim())
    }

    return Array.from(normalized)
}

function buildDetailsPayload(userId: string, details: any) {
    const areaIds = normalizeAreaIds(details)
    const jobPositionIds = normalizeJobPositionIds(details)
    const payload = {
        user_id: userId,
        ...details,
        job_position_ids: jobPositionIds,
        job_position_id: jobPositionIds[0] || null,
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

async function hasJobPositionIdsColumn(supabaseAdmin: any): Promise<boolean> {
    const { error } = await (supabaseAdmin
        .from('employee_profiles') as any)
        .select('job_position_ids')
        .limit(1)

    if (!error) return true

    const message = (error.message || '').toLowerCase()
    const code = (error.code || '').toString()
    if (code === '42703' || message.includes('column') && message.includes('job_position_ids')) return false

    return true
}

function isMissingColumn(error: any, column: string): boolean {
    const message = String(error?.message || '').toLowerCase()
    const code = String(error?.code || '')
    return code === '42703' || (message.includes('column') && message.includes(column.toLowerCase()))
}

async function isRhMasterEnabled(supabaseAdmin: any): Promise<boolean> {
    const { data, error } = await (supabaseAdmin
        .from('rh_sync_settings') as any)
        .select('rh_master_enabled')
        .eq('id', 1)
        .maybeSingle()

    if (error) {
        const message = (error.message || '').toLowerCase()
        const code = (error.code || '').toString().toLowerCase()
        const missingTable = code === '42p01' || message.includes('rh_sync_settings') && message.includes('does not exist')

        if (missingTable) return false

        throw new Error('No se pudo validar el estado de sincronización RH')
    }

    return !!data?.rh_master_enabled
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

        const rhMasterEnabled = await isRhMasterEnabled(supabaseAdmin)
        if (rhMasterEnabled) {
            throw new Error('Edición bloqueada: RH maestro está activo. Gestiona usuarios desde el módulo de RH.')
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
        const profileBasePayload = {
            id: newUser.user.id,
            full_name: data.fullName,
            role: data.role,
            avatar_url: data.avatar_url || null,
            username: data.email.split('@')[0],
            created_at: new Date().toISOString()
        }

        let profilePayload: any = { ...profileBasePayload }
        let { error: profileError } = await (supabaseAdmin
            .from('profiles') as any)
            .upsert(profilePayload)

        if (profileError && isMissingColumn(profileError, 'avatar_url')) {
            delete profilePayload.avatar_url
            const retry = await (supabaseAdmin
                .from('profiles') as any)
                .upsert(profilePayload)
            profileError = retry.error
        }

        if (profileError && isMissingColumn(profileError, 'created_at')) {
            delete profilePayload.created_at
            const retry = await (supabaseAdmin
                .from('profiles') as any)
                .upsert(profilePayload)
            profileError = retry.error
        }

        if (profileError) {
            await supabaseAdmin.auth.admin.deleteUser(newUser.user.id)
            throw new Error('Error al crear perfil: ' + profileError.message)
        }

        // 3. Insert into Employee Profiles
        const detailsPayload = buildDetailsPayload(newUser.user.id, data.details || {})

        let { error: detailsError } = await (supabaseAdmin
            .from('employee_profiles') as any)
            .insert(detailsPayload)

        if (detailsError && (detailsError.message?.includes('area_ids') || detailsError.message?.includes('job_position_ids'))) {
            const requestedAreaIds = normalizeAreaIds(data.details || {})
            const requestedJobPositionIds = normalizeJobPositionIds(data.details || {})
            const fallbackPayload = { ...detailsPayload }

            const supportsAreaIds = await hasAreaIdsColumn(supabaseAdmin)
            const supportsJobPositionIds = await hasJobPositionIdsColumn(supabaseAdmin)

            if (!supportsAreaIds && requestedAreaIds.length > 1) {
                throw new Error('Tu base de datos aún no soporta múltiples áreas por empleado. Ejecuta la migración 012_ensure_multi_area_and_design_area.sql y vuelve a intentar.')
            }
            if (!supportsJobPositionIds && requestedJobPositionIds.length > 1) {
                throw new Error('Tu base de datos aún no soporta múltiples puestos por empleado. Ejecuta la migración 024_add_profile_avatars_and_multi_job_positions.sql y vuelve a intentar.')
            }

            if (!supportsAreaIds) delete (fallbackPayload as any).area_ids
            if (!supportsJobPositionIds) delete (fallbackPayload as any).job_position_ids

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

        const rhMasterEnabled = await isRhMasterEnabled(supabaseAdmin)
        if (rhMasterEnabled) {
            throw new Error('Edición bloqueada: RH maestro está activo. Gestiona usuarios desde el módulo de RH.')
        }

        // Update Profile
        const profileBasePayload = {
            full_name: data.fullName,
            role: data.role,
            avatar_url: data.avatar_url || null,
            updated_at: new Date().toISOString()
        }

        let profilePayload: any = { ...profileBasePayload }
        let profileUpdate = await (supabaseAdmin
            .from('profiles') as any)
            .update(profilePayload)
            .eq('id', id)
        let profileError = profileUpdate.error

        if (profileError && isMissingColumn(profileError, 'avatar_url')) {
            delete profilePayload.avatar_url
            profileUpdate = await (supabaseAdmin
                .from('profiles') as any)
                .update(profilePayload)
                .eq('id', id)
            profileError = profileUpdate.error
        }

        if (profileError && isMissingColumn(profileError, 'updated_at')) {
            delete profilePayload.updated_at
            profileUpdate = await (supabaseAdmin
                .from('profiles') as any)
                .update(profilePayload)
                .eq('id', id)
            profileError = profileUpdate.error
        }

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

            const upsertWithTimestamp = async (includeUpdatedAt: boolean) => {
                const payload = includeUpdatedAt
                    ? { ...detailsPayload, updated_at: new Date().toISOString() }
                    : { ...detailsPayload }
                return (supabaseAdmin
                    .from('employee_profiles') as any)
                    .upsert(payload)
            }

            let upsertResult = await upsertWithTimestamp(true)
            let detailsError = upsertResult.error

            if (detailsError && isMissingColumn(detailsError, 'updated_at')) {
                upsertResult = await upsertWithTimestamp(false)
                detailsError = upsertResult.error
            }

            if (detailsError && (detailsError.message?.includes('area_ids') || detailsError.message?.includes('job_position_ids'))) {
                const requestedAreaIds = normalizeAreaIds(data.details || {})
                const requestedJobPositionIds = normalizeJobPositionIds(data.details || {})
                const fallbackPayload = { ...detailsPayload }

                const supportsAreaIds = await hasAreaIdsColumn(supabaseAdmin)
                const supportsJobPositionIds = await hasJobPositionIdsColumn(supabaseAdmin)

                if (!supportsAreaIds && requestedAreaIds.length > 1) {
                    throw new Error('Tu base de datos aún no soporta múltiples áreas por empleado. Ejecuta la migración 012_ensure_multi_area_and_design_area.sql y vuelve a intentar.')
                }
                if (!supportsJobPositionIds && requestedJobPositionIds.length > 1) {
                    throw new Error('Tu base de datos aún no soporta múltiples puestos por empleado. Ejecuta la migración 024_add_profile_avatars_and_multi_job_positions.sql y vuelve a intentar.')
                }

                if (!supportsAreaIds) delete (fallbackPayload as any).area_ids
                if (!supportsJobPositionIds) delete (fallbackPayload as any).job_position_ids

                let fallbackUpdate = await (supabaseAdmin
                    .from('employee_profiles') as any)
                    .upsert({
                        ...fallbackPayload,
                        updated_at: new Date().toISOString()
                    })

                detailsError = fallbackUpdate.error

                if (detailsError && isMissingColumn(detailsError, 'updated_at')) {
                    fallbackUpdate = await (supabaseAdmin
                        .from('employee_profiles') as any)
                        .upsert(fallbackPayload)
                    detailsError = fallbackUpdate.error
                }
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

        const rhMasterEnabled = await isRhMasterEnabled(supabaseAdmin)
        if (rhMasterEnabled) {
            throw new Error('Edición bloqueada: RH maestro está activo. Gestiona usuarios desde el módulo de RH.')
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

export async function setRhMasterEnabled(enabled: boolean) {
    try {
        const supabaseAdmin = createAdminClient()
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)

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

        const { error } = await (supabaseAdmin
            .from('rh_sync_settings') as any)
            .upsert({
                id: 1,
                rh_master_enabled: enabled,
                updated_by: user.id
            }, { onConflict: 'id' })

        if (error) throw error

        revalidatePath('/settings/equipo')
        return { success: true }
    } catch (error: any) {
        console.error('Set RH Master Error:', error)
        return { success: false, error: error.message || 'No se pudo actualizar RH maestro' }
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
