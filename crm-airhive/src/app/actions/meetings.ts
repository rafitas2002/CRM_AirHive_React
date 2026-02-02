'use server'

import { createAdminClient } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'
import { Database } from '@/lib/supabase'

type Meeting = Database['public']['Tables']['meetings']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

/**
 * System-level function to update lead's next meeting ID.
 * Uses Admin Client to bypass RLS.
 */
async function updateLeadNextMeetingSystem(leadId: number) {
    const adminClient = createAdminClient()
    const now = new Date().toISOString()

    // 1. Find next scheduled meeting
    const { data: nextMeeting } = await adminClient
        .from('meetings')
        .select('id')
        .eq('lead_id', leadId)
        .eq('status', 'scheduled')
        .gt('start_time', now)
        .order('start_time', { ascending: true })
        .limit(1)
        .maybeSingle()

    // 2. Update lead record
    await (adminClient
        .from('clientes') as any)
        .update({
            next_meeting_id: (nextMeeting as any)?.id || null,
            probability_locked: false // Always unlock when updating next meeting
        })
        .eq('id', leadId)
}

/**
 * Deletes a meeting from the local database and Google Calendar (if integrated)
 * This is a Server Action to allow admins to delete meetings they don't own.
 */
export async function deleteMeetingAction(meetingId: string) {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return { success: false, error: 'No autenticado' }
    }

    // 1. Get user profile to check role
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single() as { data: Profile | null }

    const isAdmin = profile?.role === 'admin'
    const adminClient = createAdminClient()

    try {
        // 2. Get meeting info before deleting
        const { data: meeting, error: fetchError } = await adminClient
            .from('meetings')
            .select('*')
            .eq('id', meetingId)
            .single() as { data: Meeting | null, error: any }

        if (fetchError || !meeting) {
            return { success: false, error: 'Reunión no encontrada' }
        }

        // 3. Security check: Only owner or admin can delete
        if (!isAdmin && meeting.seller_id !== user.id) {
            return { success: false, error: 'No tienes permisos para eliminar esta reunión' }
        }

        // 4. Delete the meeting using admin client to bypass RLS
        const { error: deleteError } = await adminClient
            .from('meetings')
            .delete()
            .eq('id', meetingId)

        if (deleteError) {
            console.error('Error deleting meeting via admin client:', deleteError)
            return { success: false, error: deleteError.message }
        }

        // 5. Update lead's next_meeting_id using system-level function
        await updateLeadNextMeetingSystem(meeting.lead_id)

        return { success: true }
    } catch (error: any) {
        console.error('Exception in deleteMeetingAction:', error)
        return { success: false, error: error.message || 'Error interno del servidor' }
    }
}
