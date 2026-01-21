import { createClient } from './supabase'
import { Database } from './supabase'

type Meeting = Database['public']['Tables']['meetings']['Row']
type MeetingAlert = Database['public']['Tables']['meeting_alerts']['Row']
type MeetingConfirmation = Database['public']['Tables']['meeting_confirmations']['Insert']
type Snapshot = Database['public']['Tables']['forecast_snapshots']['Row']

const supabase = createClient()

/**
 * Meeting Confirmation Service
 * Handles post-meeting confirmation flow and conditional snapshot creation
 */

// ============================================
// Confirmation Operations
// ============================================

export async function confirmMeeting(
    meetingId: string,
    wasHeld: boolean,
    notes: string,
    userId: string
): Promise<{ success: boolean; snapshotCreated: boolean; snapshotId?: string }> {
    try {
        // 1. Get meeting with frozen probability
        const { data: meeting, error: meetingError } = await (supabase
            .from('meetings') as any)
            .select('*, clientes(*)')
            .eq('id', meetingId)
            .single()

        if (meetingError || !meeting) {
            throw new Error('Meeting not found')
        }

        let snapshotId: string | null = null
        let snapshotCreated = false

        // 2. If meeting was held AND we have a frozen probability, create snapshot
        if (wasHeld && meeting.frozen_probability_value !== null) {
            // Get next snapshot number
            const { data: lastSnapshot } = await (supabase
                .from('forecast_snapshots') as any)
                .select('snapshot_number')
                .eq('lead_id', meeting.lead_id)
                .order('snapshot_number', { ascending: false })
                .limit(1)
                .single()

            const snapshotNumber = lastSnapshot ? lastSnapshot.snapshot_number + 1 : 1

            // Create snapshot with frozen value
            const { data: snapshot, error: snapshotError } = await (supabase
                .from('forecast_snapshots') as any)
                .insert({
                    lead_id: meeting.lead_id,
                    seller_id: meeting.seller_id,
                    meeting_id: meetingId,
                    snapshot_number: snapshotNumber,
                    probability: meeting.frozen_probability_value,
                    snapshot_timestamp: meeting.start_time,
                    source: 'meeting_confirmed_held'
                })
                .select()
                .single()

            if (!snapshotError && snapshot) {
                snapshotId = snapshot.id
                snapshotCreated = true
            }
        }

        // 3. Update meeting status
        await (supabase
            .from('meetings') as any)
            .update({
                meeting_status: wasHeld ? 'held' : 'not_held',
                confirmation_timestamp: new Date().toISOString(),
                confirmed_by: userId,
                confirmation_notes: notes
            })
            .eq('id', meetingId)

        // 4. Record confirmation in history
        const confirmationData: MeetingConfirmation = {
            meeting_id: meetingId,
            confirmed_by: userId,
            was_held: wasHeld,
            confirmation_notes: notes,
            snapshot_created: snapshotCreated,
            snapshot_id: snapshotId
        }

        await (supabase
            .from('meeting_confirmations') as any)
            .insert(confirmationData)

        // 5. Update lead's next_meeting_id and unlock probability if needed
        const { data: nextMeeting } = await (supabase
            .from('meetings') as any)
            .select('id')
            .eq('lead_id', meeting.lead_id)
            .eq('status', 'scheduled')
            .eq('meeting_status', 'scheduled')
            .gt('start_time', new Date().toISOString())
            .order('start_time', { ascending: true })
            .limit(1)
            .single()

        if (nextMeeting) {
            // Unlock probability for next meeting
            await (supabase
                .from('clientes') as any)
                .update({
                    probability_locked: false,
                    next_meeting_id: nextMeeting.id
                })
                .eq('id', meeting.lead_id)
        } else {
            // No more meetings, keep locked
            await (supabase
                .from('clientes') as any)
                .update({
                    next_meeting_id: null
                })
                .eq('id', meeting.lead_id)
        }

        return {
            success: true,
            snapshotCreated,
            snapshotId: snapshotId || undefined
        }
    } catch (error) {
        console.error('Error confirming meeting:', error)
        throw error
    }
}

// ============================================
// Pending Confirmations
// ============================================

export async function getPendingConfirmations(userId: string) {
    try {
        console.log('Fetching pending confirmations for user:', userId)

        // 1. Fetch meetings only (simplified query)
        const { data: meetings, error: meetingsError } = await (supabase
            .from('meetings') as any)
            .select('*')
            .eq('seller_id', userId)
            .eq('meeting_status', 'pending_confirmation')
            .lt('start_time', new Date().toISOString())
            .order('start_time', { ascending: true })

        if (meetingsError) {
            console.error('Error fetching pending meetings:', meetingsError)
            console.error('Details:', JSON.stringify(meetingsError, null, 2))
            console.error('Hint:', meetingsError.hint)
            console.error('Message:', meetingsError.message)
            return []
        }

        if (!meetings || meetings.length === 0) {
            return []
        }

        // 2. Fetch clients for these meetings
        const leadIds = Array.from(new Set((meetings as Meeting[]).map(m => m.lead_id)))
        const { data: clients, error: clientsError } = await supabase
            .from('clientes')
            .select('id, empresa, etapa')
            .in('id', leadIds)

        if (clientsError) {
            console.error('Error fetching clients for confirmations:', clientsError)
        }

        const clientsMap = (clients || []).reduce((acc: any, client: any) => {
            acc[client.id] = client
            return acc
        }, {})

        // 3. Combine data
        const combined = (meetings as Meeting[]).map(meeting => ({
            ...meeting,
            clientes: clientsMap[meeting.lead_id] || { empresa: 'Desconocida', etapa: '-' }
        }))

        console.log('Fetched pending confirmations:', combined.length)
        return combined
    } catch (err) {
        console.error('Exception in getPendingConfirmations:', err)
        return []
    }
}

// ============================================
// Alert Operations
// ============================================

export async function getPendingAlerts(userId: string) {
    const { data, error } = await (supabase
        .from('meeting_alerts') as any)
        .select('*, meetings(*, clientes(empresa, etapa))')
        .eq('user_id', userId)
        .eq('sent', false)
        .eq('dismissed', false)
        .lte('alert_time', new Date().toISOString())
        .order('alert_time', { ascending: true })

    if (error) {
        console.error('Error fetching pending alerts:', error)
        return []
    }

    return data || []
}

export async function dismissAlert(alertId: string) {
    const { error } = await (supabase
        .from('meeting_alerts') as any)
        .update({
            dismissed: true,
            dismissed_at: new Date().toISOString()
        })
        .eq('id', alertId)

    if (error) {
        console.error('Error dismissing alert:', error)
        throw error
    }

    return true
}

export async function markAlertAsSent(alertId: string) {
    const { error } = await (supabase
        .from('meeting_alerts') as any)
        .update({
            sent: true,
            sent_at: new Date().toISOString()
        })
        .eq('id', alertId)

    if (error) {
        console.error('Error marking alert as sent:', error)
        throw error
    }

    return true
}

// ============================================
// Upcoming Meetings with Urgency
// ============================================

export interface MeetingWithUrgency extends Meeting {
    empresa?: string
    etapa?: string
    hoursUntil?: number
    urgencyLevel?: 'overdue' | 'urgent' | 'today' | 'soon' | 'scheduled'
}

export async function getUpcomingMeetings(userId: string, limit: number = 10): Promise<MeetingWithUrgency[]> {
    try {
        console.log('Fetching upcoming meetings for user:', userId)

        // 1. Fetch meetings only
        const { data: meetings, error: meetingsError } = await supabase
            .from('meetings')
            .select('*')
            .eq('seller_id', userId)
            .eq('status', 'scheduled')
            .order('start_time', { ascending: true })
            .limit(limit * 2)

        if (meetingsError) {
            console.error('Error fetching upcoming meetings:', meetingsError)
            console.error('Error details:', JSON.stringify(meetingsError, null, 2))
            return []
        }

        // Filter status manually
        const filteredMeetings = (meetings || []).filter((m: any) =>
            m.meeting_status === 'scheduled' || m.meeting_status === 'pending_confirmation'
        ).slice(0, limit)

        if (filteredMeetings.length === 0) {
            return []
        }

        // 2. Fetch clients
        const leadIds = Array.from(new Set(filteredMeetings.map((m: any) => m.lead_id)))
        const { data: clients, error: clientsError } = await supabase
            .from('clientes')
            .select('id, empresa, etapa')
            .in('id', leadIds)

        if (clientsError) {
            console.error('Error fetching clients for meetings:', clientsError)
        }

        const clientsMap = (clients || []).reduce((acc: any, client: any) => {
            acc[client.id] = client
            return acc
        }, {})

        // 3. Combine and calculate urgency
        const now = new Date()
        return filteredMeetings.map((meeting: any) => {
            const client = clientsMap[meeting.lead_id]
            const startTime = new Date(meeting.start_time)
            const hoursUntil = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60)

            let urgencyLevel: 'overdue' | 'urgent' | 'today' | 'soon' | 'scheduled'
            if (hoursUntil < 0) {
                urgencyLevel = 'overdue'
            } else if (hoursUntil < 2) {
                urgencyLevel = 'urgent'
            } else if (hoursUntil < 24) {
                urgencyLevel = 'today'
            } else if (hoursUntil < 48) {
                urgencyLevel = 'soon'
            } else {
                urgencyLevel = 'scheduled'
            }

            return {
                ...meeting,
                empresa: client?.empresa,
                etapa: client?.etapa,
                hoursUntil,
                urgencyLevel
            }
        })
    } catch (err) {
        console.error('Exception in getUpcomingMeetings:', err)
        return []
    }
}

// ============================================
// Urgency Helper
// ============================================

export function getUrgencyColor(urgencyLevel: string): {
    bg: string
    border: string
    text: string
    label: string
} {
    switch (urgencyLevel) {
        case 'overdue':
            return {
                bg: 'bg-red-100',
                border: 'border-red-500',
                text: 'text-red-800',
                label: 'Vencida'
            }
        case 'urgent':
            return {
                bg: 'bg-orange-100',
                border: 'border-orange-500',
                text: 'text-orange-800',
                label: 'Urgente'
            }
        case 'today':
            return {
                bg: 'bg-yellow-100',
                border: 'border-yellow-500',
                text: 'text-yellow-800',
                label: 'Hoy'
            }
        case 'soon':
            return {
                bg: 'bg-blue-100',
                border: 'border-blue-400',
                text: 'text-blue-800',
                label: 'Próxima'
            }
        default:
            return {
                bg: 'bg-gray-100',
                border: 'border-gray-300',
                text: 'text-gray-700',
                label: 'Programada'
            }
    }
}

export function getStageColor(etapa: string): {
    bg: string
    border: string
    text: string
} {
    switch (etapa) {
        case 'Negociación':
            return {
                bg: 'bg-amber-100',
                border: 'border-amber-400',
                text: 'text-amber-800'
            }
        case 'Prospección':
            return {
                bg: 'bg-blue-100',
                border: 'border-blue-400',
                text: 'text-blue-800'
            }
        case 'Cerrado Ganado':
            return {
                bg: 'bg-emerald-100',
                border: 'border-emerald-400',
                text: 'text-emerald-800'
            }
        case 'Cerrado Perdido':
            return {
                bg: 'bg-gray-100',
                border: 'border-gray-400',
                text: 'text-gray-800'
            }
        default:
            return {
                bg: 'bg-gray-100',
                border: 'border-gray-300',
                text: 'text-gray-700'
            }
    }
}
