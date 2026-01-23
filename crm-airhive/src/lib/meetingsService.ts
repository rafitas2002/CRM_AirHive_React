import { createClient } from './supabase'
import { Database } from './supabase'
import {
    createGoogleCalendarEvent,
    updateGoogleCalendarEvent,
    deleteGoogleCalendarEvent,
    getUserAccessToken
} from './googleCalendarService'

type Meeting = Database['public']['Tables']['meetings']['Row']
type MeetingInsert = Database['public']['Tables']['meetings']['Insert']
type MeetingUpdate = Database['public']['Tables']['meetings']['Update']
type Snapshot = Database['public']['Tables']['forecast_snapshots']['Row']
type SnapshotInsert = Database['public']['Tables']['forecast_snapshots']['Insert']
type Lead = Database['public']['Tables']['clientes']['Row']

const supabase = createClient()

/**
 * Meeting Management Service
 * Handles CRUD operations for meetings and automatic snapshot capture
 */

// ============================================
// Meeting CRUD Operations
// ============================================

export async function createMeeting(meetingData: MeetingInsert) {
    console.log('----------------------------------------')
    console.log('🚀 Starting createMeeting')
    console.log('📦 Payload:', meetingData)

    // Check Auth State
    const { data: { session }, error: authError } = await supabase.auth.getSession()
    console.log('👤 Auth Session User:', session?.user?.id)
    if (authError) console.error('❌ Auth Error:', authError)

    if (!session?.user) {
        console.error('❌ NO ACTIVE SESSION. Database request will likely fail RLS.')
    } else if (session.user.id !== meetingData.seller_id) {
        console.warn('⚠️ WARNING: Session User ID does not match Seller ID in payload!')
        console.warn(`Session: ${session.user.id} vs Payload: ${meetingData.seller_id}`)
    }

    // Attempt Insert
    const response = await (supabase
        .from('meetings') as any)
        .insert([meetingData])
        .select()

    // Log raw response
    console.log('📡 Supabase Response:', response)

    const { data, error } = response

    if (error) {
        console.error('❌ Supabase Insert Error:', error)
        console.error('❌ JSON Stringified Error:', JSON.stringify(error, null, 2))
        throw error
    }

    if (!data || data.length === 0) {
        console.error('❌ No data returned from insert. RLS might have blocked the SELECT.')
        throw new Error('Meeting created but no data returned (RLS blocking?)')
    }

    const createdMeeting = data[0]

    // Google Calendar Sync
    if (meetingData.calendar_provider === 'google') {
        try {
            const accessToken = await getUserAccessToken(supabase, meetingData.seller_id)
            if (accessToken) {
                // Fetch lead name for description
                const { data: lead } = await supabase
                    .from('clientes')
                    .select('nombre, apellido')
                    .eq('id', meetingData.lead_id)
                    .single()

                const leadName = lead ? `${(lead as any).nombre} ${(lead as any).apellido}` : 'Cliente'
                const googleEventId = await createGoogleCalendarEvent(accessToken, meetingData, leadName)

                if (googleEventId) {
                    await (supabase.from('meetings') as any)
                        .update({ calendar_event_id: googleEventId } as any)
                        .eq('id', createdMeeting.id)
                }
            }
        } catch (syncError) {
            console.error('⚠️ Google Calendar Sync Error (non-critical):', syncError)
        }
    }

    // Update lead's next_meeting_id if this is the next scheduled meeting
    try {
        await updateLeadNextMeeting(meetingData.lead_id)
    } catch (updateError) {
        console.error('⚠️ Error updating lead next meeting (non-critical):', updateError)
    }

    return createdMeeting
}

export async function updateMeeting(meetingId: string, updates: MeetingUpdate) {
    const { data, error } = await (supabase
        .from('meetings') as any)
        .update(updates)
        .eq('id', meetingId)
        .select()
        .single()

    if (error) {
        console.error('Error updating meeting:', error)
        throw error
    }

    // Google Calendar Sync Logic
    const hadEvent = !!data.calendar_event_id
    const wantsSync = updates.calendar_provider === 'google' || (updates.calendar_provider === undefined && data.calendar_provider === 'google')
    const stoppedSync = updates.calendar_provider === null && data.calendar_provider === 'google'

    try {
        const accessToken = await getUserAccessToken(supabase, data.seller_id)
        if (accessToken) {
            // Fetch lead name for description
            const { data: lead } = await supabase
                .from('clientes')
                .select('nombre, apellido')
                .eq('id', data.lead_id)
                .single()
            const leadName = lead ? `${(lead as any).nombre} ${(lead as any).apellido}` : 'Cliente'

            if (wantsSync && !hadEvent) {
                // CREATE new event if toggle turned ON
                const googleEventId = await createGoogleCalendarEvent(accessToken, { ...data, ...updates } as any, leadName)
                if (googleEventId) {
                    await (supabase.from('meetings') as any)
                        .update({ calendar_event_id: googleEventId } as any)
                        .eq('id', meetingId)
                }
            } else if (wantsSync && hadEvent) {
                // UPDATE existing event
                await updateGoogleCalendarEvent(accessToken, data.calendar_event_id!, updates, leadName)
            } else if (stoppedSync && hadEvent) {
                // DELETE event if toggle turned OFF
                await deleteGoogleCalendarEvent(accessToken, data.calendar_event_id!)
                await (supabase.from('meetings') as any)
                    .update({ calendar_event_id: null } as any)
                    .eq('id', meetingId)
            }
        }
    } catch (syncError) {
        console.error('⚠️ Google Calendar Sync Sync Error:', syncError)
    }

    // If start_time changed, update lead's next_meeting_id
    if (updates.start_time && data) {
        await updateLeadNextMeeting(data.lead_id)
    }

    return data
}

export async function deleteMeeting(meetingId: string) {
    // Get meeting info before deleting
    const { data: meeting } = await (supabase
        .from('meetings') as any)
        .select('*')
        .eq('id', meetingId)
        .single()

    if (meeting && meeting.calendar_provider === 'google' && meeting.calendar_event_id) {
        try {
            const accessToken = await getUserAccessToken(supabase, meeting.seller_id)
            if (accessToken) {
                await deleteGoogleCalendarEvent(accessToken, meeting.calendar_event_id)
            }
        } catch (syncError) {
            console.error('⚠️ Google Calendar Delete Sync Error:', syncError)
        }
    }

    const { error } = await (supabase
        .from('meetings') as any)
        .delete()
        .eq('id', meetingId)

    if (error) {
        console.error('Error deleting meeting:', error)
        throw error
    }

    // Update lead's next_meeting_id
    if (meeting) {
        await updateLeadNextMeeting(meeting.lead_id)
    }

    return true
}

export async function cancelMeeting(meetingId: string) {
    return await updateMeeting(meetingId, { status: 'cancelled' })
}

export async function completeMeeting(meetingId: string) {
    return await updateMeeting(meetingId, { status: 'completed' })
}

// ============================================
// Query Operations
// ============================================

export async function getLeadMeetings(leadId: number) {
    const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('lead_id', leadId)
        .order('start_time', { ascending: true })

    if (error) {
        console.error('Error fetching lead meetings:', error)
        throw error
    }

    return data || []
}

export async function getNextMeeting(leadId: number): Promise<Meeting | null> {
    const now = new Date().toISOString()

    const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('lead_id', leadId)
        .eq('status', 'scheduled')
        .gt('start_time', now)
        .order('start_time', { ascending: true })
        .limit(1)
        .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error fetching next meeting:', error)
    }

    return data || null
}

export async function getMeeting(meetingId: string): Promise<Meeting | null> {
    const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('id', meetingId)
        .single()

    if (error) {
        console.error('Error fetching meeting:', error)
        return null
    }

    return data
}

// ============================================
// Snapshot Operations
// ============================================

export async function captureSnapshot(leadId: number, meetingId: string): Promise<Snapshot | null> {
    // Get current lead data
    const { data: lead, error: leadError } = await (supabase
        .from('clientes') as any)
        .select('*')
        .eq('id', leadId)
        .single()

    if (leadError || !lead) {
        console.error('Error fetching lead for snapshot:', leadError)
        return null
    }

    // Get meeting data
    const meeting = await getMeeting(meetingId)
    if (!meeting) {
        console.error('Meeting not found for snapshot')
        return null
    }

    // Check if snapshot already exists
    const { data: existingSnapshot } = await (supabase
        .from('forecast_snapshots') as any)
        .select('id')
        .eq('meeting_id', meetingId)
        .single()

    if (existingSnapshot) {
        console.log('Snapshot already exists for this meeting')
        return null
    }

    // Get next snapshot number
    const snapshotNumber = await getNextSnapshotNumber(leadId)

    // Create snapshot
    const snapshotData: SnapshotInsert = {
        lead_id: leadId,
        seller_id: meeting.seller_id,
        meeting_id: meetingId,
        snapshot_number: snapshotNumber,
        probability: lead.probabilidad || 50,
        snapshot_timestamp: meeting.start_time,
        source: 'meeting_start_snapshot'
    }

    const { data: snapshot, error: snapshotError } = await (supabase
        .from('forecast_snapshots') as any)
        .insert([snapshotData])
        .select()
        .single()

    if (snapshotError) {
        console.error('Error creating snapshot:', snapshotError)
        throw snapshotError
    }

    // Update lead: lock probability and set last_snapshot_at
    await (supabase
        .from('clientes') as any)
        .update({
            probability_locked: true,
            last_snapshot_at: meeting.start_time
        })
        .eq('id', leadId)

    // Check for next meeting and unlock if exists
    const nextMeeting = await getNextMeeting(leadId)
    if (nextMeeting) {
        await (supabase
            .from('clientes') as any)
            .update({
                probability_locked: false,
                next_meeting_id: nextMeeting.id
            })
            .eq('id', leadId)
    }

    return snapshot
}

export async function getLeadSnapshots(leadId: number): Promise<Snapshot[]> {
    const { data, error } = await (supabase
        .from('forecast_snapshots') as any)
        .select('*')
        .eq('lead_id', leadId)
        .order('snapshot_number', { ascending: true })

    if (error) {
        console.error('Error fetching snapshots:', error)
        return []
    }

    return data || []
}

async function getNextSnapshotNumber(leadId: number): Promise<number> {
    const { data, error } = await (supabase
        .from('forecast_snapshots') as any)
        .select('snapshot_number')
        .eq('lead_id', leadId)
        .order('snapshot_number', { ascending: false })
        .limit(1)
        .single()

    if (error && error.code !== 'PGRST116') {
        console.error('Error getting snapshot count:', error)
        return 1
    }

    return data ? data.snapshot_number + 1 : 1
}

// ============================================
// Probability Lock Management
// ============================================

export async function isProbabilityEditable(
    lead: Lead,
    currentUserId: string
): Promise<{ editable: boolean; reason?: string; nextMeeting?: Meeting | null }> {
    // 1. Only editable in "Negociación" stage
    if (lead.etapa !== 'Negociación') {
        return {
            editable: false,
            reason: 'Solo se puede editar la probabilidad en etapa de Negociación'
        }
    }

    // 2. User must be the owner
    if (lead.owner_id !== currentUserId) {
        return {
            editable: false,
            reason: 'Solo el vendedor asignado puede editar la probabilidad'
        }
    }

    // 3. Check if there's a next meeting
    const nextMeeting = await getNextMeeting(lead.id)

    if (!nextMeeting) {
        // User request: Should be editable even without a scheduled meeting
        // (Unless we want to force scheduling, but user said "nunca bloquear")
        return {
            editable: true,
            nextMeeting: null
        }
    }

    // 4. Check if meeting is CURRENTLY happening (Lock ONLY during meeting)
    const now = new Date()
    const meetingStart = new Date(nextMeeting.start_time)
    const durationMs = (nextMeeting.duration_minutes || 60) * 60 * 1000
    const meetingEnd = new Date(meetingStart.getTime() + durationMs)

    if (now >= meetingStart && now <= meetingEnd) {
        return {
            editable: false,
            reason: 'La reunión está en curso. El pronóstico está temporalmente congelado.',
            nextMeeting
        }
    }

    return {
        editable: true,
        nextMeeting
    }
}

export async function updateLeadNextMeeting(leadId: number) {
    const nextMeeting = await getNextMeeting(leadId)

    const updates: any = {
        next_meeting_id: nextMeeting?.id || null
    }

    // If there's a next meeting and lead is in Negociación, unlock probability
    const { data: lead } = await (supabase
        .from('clientes') as any)
        .select('etapa')
        .eq('id', leadId)
        .single()

    if (lead?.etapa === 'Negociación') {
        updates.probability_locked = !nextMeeting
    }

    await (supabase
        .from('clientes') as any)
        .update(updates)
        .eq('id', leadId)
}

// ============================================
// Scheduled Job Helper (to be called by cron/edge function)
// ============================================

export async function checkAndCaptureSnapshots() {
    const now = new Date()
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000)

    // Find meetings that started in the last 5 minutes
    const { data: recentMeetings, error } = await (supabase
        .from('meetings') as any)
        .select('*')
        .gte('start_time', fiveMinutesAgo.toISOString())
        .lte('start_time', now.toISOString())
        .eq('status', 'scheduled')

    if (error) {
        console.error('Error fetching recent meetings:', error)
        return
    }

    if (!recentMeetings || recentMeetings.length === 0) {
        console.log('No recent meetings to process')
        return
    }

    console.log(`Processing ${recentMeetings.length} recent meetings...`)

    for (const meeting of recentMeetings) {
        try {
            await captureSnapshot(meeting.lead_id, meeting.id)
            console.log(`Snapshot captured for meeting ${meeting.id}`)
        } catch (error) {
            console.error(`Failed to capture snapshot for meeting ${meeting.id}:`, error)
        }
    }
}
