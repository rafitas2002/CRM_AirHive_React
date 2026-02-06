'use server'

import { createAdminClient } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

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

        if (adminProfile?.role !== 'admin' && adminProfile?.role !== 'rh') {
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
        const { error: profileError } = await supabaseAdmin
            .from('profiles')
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
        const detailsPayload = {
            user_id: newUser.user.id,
            ...data.details,
            birth_date: data.details?.birth_date || null,
            start_date: data.details?.start_date || null
        }

        const { error: detailsError } = await (supabaseAdmin
            .from('employee_profiles') as any)
            .insert(detailsPayload)

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

        if (adminProfile?.role !== 'admin' && adminProfile?.role !== 'rh') {
            throw new Error('No tienes permisos suficientes')
        }

        // Update Profile
        const { error: profileError } = await supabaseAdmin
            .from('profiles')
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
            const detailsPayload = { ...data.details }
            const nullableFields = [
                'birth_date', 'start_date',
                'job_position_id', 'area_id', 'seniority_id', 'gender_id',
                'education_level_id', 'career_id', 'university_id',
                'contract_type_id', 'work_modality_id', 'city_id', 'country_id'
            ]

            nullableFields.forEach(field => {
                if (detailsPayload[field] === '') detailsPayload[field] = null
            })

            const { error: detailsError } = await (supabaseAdmin
                .from('employee_profiles') as any)
                .upsert({
                    user_id: id,
                    ...detailsPayload,
                    updated_at: new Date().toISOString()
                })

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

        if (adminProfile?.role !== 'admin' && adminProfile?.role !== 'rh') {
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
