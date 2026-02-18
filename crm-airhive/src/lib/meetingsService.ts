import { createClient } from './supabase'
import { Database } from './supabase'
import { trackEvent } from '@/app/actions/events'
// Google Calendar Service logic moved to Server Actions

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

    try {
        await updateLeadNextMeeting(meetingData.lead_id)

        // Track Event: meeting_scheduled
        trackEvent({
            eventType: 'meeting_scheduled',
            entityType: 'meeting',
            entityId: (createdMeeting as any).id,
            userId: meetingData.seller_id,
            metadata: { lead_id: meetingData.lead_id, title: meetingData.title }
        })
    } catch (updateError) {
        console.error('⚠️ Error updating lead next meeting (non-critical):', updateError)
    }

    return createdMeeting
}

export async function updateMeeting(meetingId: string, updates: MeetingUpdate) {
    const { data: previousMeeting } = await (supabase
        .from('meetings') as any)
        .select('*')
        .eq('id', meetingId)
        .single()

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

    // Google Calendar Sync - Handled via Server Actions separately

    // If start_time changed, update lead's next_meeting_id
    if (updates.start_time && data) {
        await updateLeadNextMeeting(data.lead_id)

        const prevStart = previousMeeting?.start_time ? new Date(previousMeeting.start_time).toISOString() : null
        const newStart = new Date(updates.start_time).toISOString()
        const wasRescheduled = !!prevStart && prevStart !== newStart

        if (wasRescheduled) {
            try {
                await (supabase
                    .from('meeting_reschedule_events') as any)
                    .insert({
                        meeting_id: meetingId,
                        lead_id: data.lead_id,
                        seller_id: data.seller_id,
                        old_start_time: prevStart,
                        new_start_time: newStart,
                        changed_by: data.seller_id,
                        reason: 'manual_update'
                    })
            } catch (auditError) {
                // Non-blocking telemetry
                console.warn('[MeetingRescheduleAudit] Could not persist audit event:', auditError)
            }

            trackEvent({
                eventType: 'meeting_rescheduled',
                entityType: 'meeting',
                entityId: meetingId,
                userId: data.seller_id,
                metadata: {
                    lead_id: data.lead_id,
                    old_start_time: prevStart,
                    new_start_time: newStart
                }
            })
        }
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

    // Google Calendar Sync logic has been moved to Server Actions and is triggered separately
    // We no longer sync directly here to avoid issues.

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
    const meeting = await getMeeting(meetingId)
    const result = await updateMeeting(meetingId, { status: 'completed' })

    // Track Event: meeting_finished
    if (meeting) {
        trackEvent({
            eventType: 'meeting_finished',
            entityType: 'meeting',
            entityId: meetingId,
            userId: meeting.seller_id,
            metadata: { lead_id: meeting.lead_id }
        })

        // Also track forecast_registered (re-enabling forecast) if appropriate
        // Actually the trackEvent for meeting_finished is enough to know it's re-enabled
    }

    return result
}

// ============================================
// Query Operations
// ============================================

export async function getLeadMeetings(leadId: number) {
    const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('lead_id', leadId)
        .neq('meeting_status', 'cancelled')  // Exclude cancelled meetings from display
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
        .neq('meeting_status', 'cancelled')  // Explicit filter to exclude cancelled meetings
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
            last_snapshot_at: meeting.start_time,
            next_meeting_id: null // Clear this as this meeting just started/snapshotted
        })
        .eq('id', leadId)

    // Track Event: forecast_frozen
    trackEvent({
        eventType: 'forecast_frozen',
        entityType: 'forecast',
        entityId: meetingId,
        userId: meeting.seller_id,
        metadata: {
            lead_id: leadId,
            probability: lead.probabilidad,
            snapshot_number: snapshotNumber
        }
    })

    return snapshot
}

export async function freezeMeetingProbability(meetingId: string, leadId: number): Promise<boolean> {
    try {
        console.log(`❄️ Freezing probability for meeting ${meetingId} (Lead ${leadId})`)

        // 1. Get current lead probability
        const { data: lead, error: leadError } = await (supabase
            .from('clientes') as any)
            .select('probabilidad, owner_id')
            .eq('id', leadId)
            .single()

        if (leadError || !lead) {
            console.error('Error fetching lead for freezing:', leadError)
            return false
        }

        // 2. Update meeting with the frozen value
        const { error: updateError } = await (supabase
            .from('meetings') as any)
            .update({
                frozen_probability_value: lead.probabilidad || 50
            })
            .eq('id', meetingId)

        if (updateError) {
            console.error('Error updating meeting with frozen value:', updateError)
            return false
        }

        // 3. Lock the lead's probability field in the DB
        await (supabase
            .from('clientes') as any)
            .update({ probability_locked: true })
            .eq('id', leadId)

        console.log('✅ Probability frozen and locked successfully')
        return true
    } catch (err) {
        console.error('Exception in freezeMeetingProbability:', err)
        return false
    }
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
    currentUserId: string,
    userRole?: string | null
): Promise<{ editable: boolean; reason?: string; nextMeeting?: Meeting | null }> {
    console.log(`🔐 Checking editability for Lead ${lead.id}. User: ${currentUserId}, Role: ${userRole}`)
    console.log(`Current Stage: ${lead.etapa}, Owner ID: ${lead.owner_id}`)

    // 1. Only editable in "Negociación" stage
    if (lead.etapa !== 'Negociación') {
        return {
            editable: false,
            reason: 'Solo se puede editar la probabilidad en etapa de Negociación'
        }
    }

    // 2. Permission check (Sellers see their own, Admins see all - simplified as per user request)
    // We already know the lead is in 'Negociación' from step 1.
    // We don't need to check for owner_id explicitly here because the UI/Supabase RLS
    // already filters which leads a user can see/access.
    console.log(`🔓 Lead is in Negociación. Allowing edit check (assuming visibility = permission).`)

    // 3. Check for the absolute next meeting (scheduled and in the future)
    const nextMeeting = await getNextMeeting(lead.id)

    if (!nextMeeting) {
        // No future meetings scheduled means we can edit
        return {
            editable: true,
            nextMeeting: null
        }
    }

    // 4. Check if meeting is CURRENTLY happening (Lock ONLY during core meeting time)
    const now = new Date()
    const meetingStart = new Date(nextMeeting.start_time)
    const durationMs = (nextMeeting.duration_minutes || 60) * 60 * 1000
    const meetingEnd = new Date(meetingStart.getTime() + durationMs)

    // Safety margin: Lock 5 minutes before and until it ends
    const lockStart = new Date(meetingStart.getTime() - 5 * 60 * 1000)

    if (now >= lockStart && now <= meetingEnd) {
        return {
            editable: false,
            reason: 'La reunión está por iniciar o en curso. El pronóstico está temporalmente congelado.',
            nextMeeting
        }
    }

    // If it's in the future and not starting in the next 5 mins, it's editable
    return {
        editable: true,
        nextMeeting
    }
}

export async function updateLeadNextMeeting(leadId: number) {
    console.log('🔄 Updating next_meeting_id for lead:', leadId)

    const nextMeeting = await getNextMeeting(leadId)

    const updates: any = {
        next_meeting_id: nextMeeting?.id || null
    }

    // IMPORTANT: If a next meeting exists, we MUST unlock it so the user can prepare
    // the forecast for THAT meeting. 
    // The only time it should be locked is DURING the meeting (handled by isProbabilityEditable)
    // or if the DB flag probability_locked is true (which should only happen until next meeting is set)

    // We unlock whenever a new meeting is found or if there's no meeting at all (to avoid getting stuck)
    updates.probability_locked = false

    await (supabase
        .from('clientes') as any)
        .update(updates)
        .eq('id', leadId)

    console.log('✅ Lead updated. Next meeting:', nextMeeting?.id || 'None', 'Unlocked: true')
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
