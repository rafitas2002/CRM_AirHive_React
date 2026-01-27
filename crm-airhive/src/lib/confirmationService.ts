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
        console.log('Confirming meeting:', meetingId, 'Held:', wasHeld, 'User:', userId)

        // 1. Get meeting with frozen probability
        const { data: meeting, error: meetingError } = await (supabase
            .from('meetings') as any)
            .select('*')
            .eq('id', meetingId)
            .single()

        if (meetingError) {
            console.error('Error fetching meeting to confirm:', meetingError)
            throw new Error(`Error finding meeting: ${meetingError.message}`)
        }
        if (!meeting) {
            console.error('Meeting not found (null data) for ID:', meetingId)
            throw new Error('Meeting not found')
        }

        let snapshotId: string | null = null
        let snapshotCreated = false

        let frozenProbability = meeting.frozen_probability_value

        if (wasHeld && frozenProbability === null) {
            const { data: clientData, error: clientError } = await supabase
                .from('clientes')
                .select('probabilidad')
                .eq('id', meeting.lead_id)
                .single()

            if (!clientError && clientData) {
                frozenProbability = (clientData as any).probabilidad
            } else {
                console.warn('Could not fetch client probability for fallback:', clientError)
                frozenProbability = 50 // Default fallback
            }
        }

        if (wasHeld && frozenProbability !== null) {
            const { data: lastSnapshot } = await (supabase
                .from('forecast_snapshots') as any)
                .select('snapshot_number')
                .eq('lead_id', meeting.lead_id)
                .order('snapshot_number', { ascending: false })
                .limit(1)
                .maybeSingle()

            const snapshotNumber = lastSnapshot ? lastSnapshot.snapshot_number + 1 : 1

            const { data: snapshot, error: snapshotError } = await (supabase
                .from('forecast_snapshots') as any)
                .insert({
                    lead_id: meeting.lead_id,
                    seller_id: meeting.seller_id,
                    meeting_id: meetingId,
                    snapshot_number: snapshotNumber,
                    probability: frozenProbability,
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
                status: 'completed',
                meeting_status: wasHeld ? 'held' : 'not_held',
                confirmation_timestamp: new Date().toISOString(),
                confirmed_by: userId,
                confirmation_notes: notes
            })
            .eq('id', meetingId)

        // 4. Record confirmation
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

        // 5. Update lead's next_meeting_id and UNLOCK probability
        const nowStr = new Date().toISOString()
        const { data: nextMeeting, error: nextError } = await (supabase
            .from('meetings') as any)
            .select('id')
            .eq('lead_id', meeting.lead_id)
            .eq('status', 'scheduled')
            .gt('start_time', nowStr)
            .order('start_time', { ascending: true })
            .limit(1)
            .maybeSingle()

        if (nextError) console.error('Error finding next meeting after confirmation:', nextError)

        console.log('🔓 Unlocking lead and setting next meeting:', nextMeeting?.id || 'None')

        await (supabase
            .from('clientes') as any)
            .update({
                probability_locked: false, // Always unlock after confirmation so they can prepare for the next one
                next_meeting_id: nextMeeting?.id || null
            })
            .eq('id', meeting.lead_id)

        return {
            success: true,
            snapshotCreated,
            snapshotId: snapshotId || undefined
        }
    } catch (error) {
        console.error('Error in confirmMeeting service:', error)
        throw error
    }
}

// ============================================
// Pending Confirmations
// ============================================

export async function getPendingConfirmations(userId: string) {
    try {
        const { data: meetings, error: meetingsError } = await (supabase
            .from('meetings') as any)
            .select('*')
            .eq('seller_id', userId)
            .or('meeting_status.eq.pending_confirmation,and(status.eq.scheduled,start_time.lt.' + new Date().toISOString() + ')')
            .order('start_time', { ascending: true })

        if (meetingsError) {
            console.error('Error fetching pending meetings:', meetingsError)
            return []
        }

        if (!meetings || meetings.length === 0) return []

        const now = new Date()
        const historicalMeetings = (meetings as Meeting[]).filter(m => {
            const start = new Date(m.start_time)
            const durationMs = (m.duration_minutes || 60) * 60 * 1000
            const end = new Date(start.getTime() + durationMs)
            return now > end || m.meeting_status === 'pending_confirmation'
        })

        if (historicalMeetings.length === 0) return []

        const leadIds = Array.from(new Set(historicalMeetings.map(m => m.lead_id)))
        const { data: clients } = await supabase
            .from('clientes')
            .select('id, empresa, etapa')
            .in('id', leadIds)

        const clientsMap = (clients || []).reduce((acc: any, client: any) => {
            acc[client.id] = client
            return acc
        }, {})

        return historicalMeetings.map(meeting => ({
            ...meeting,
            clientes: clientsMap[meeting.lead_id] || { empresa: 'Desconocida', etapa: '-' }
        }))
    } catch (err) {
        console.error('Exception in getPendingConfirmations:', err)
        return []
    }
}

// ============================================
// Alert Operations
// ============================================

export async function getPendingAlerts(userId: string) {
    try {
        const { data, error } = await (supabase
            .from('meeting_alerts') as any)
            .select(`
                *,
                meetings:meeting_id (
                    id,
                    title,
                    start_time,
                    lead_id,
                    clientes:lead_id (
                        empresa,
                        etapa
                    )
                )
            `)
            .eq('user_id', userId)
            .eq('sent', false)
            .eq('dismissed', false)
            .lte('alert_time', new Date().toISOString())
            .order('alert_time', { ascending: true })

        return data || []
    } catch (err) {
        console.error('Exception in getPendingAlerts:', err)
        return []
    }
}

export async function dismissAlert(alertId: string) {
    const { error } = await (supabase.from('meeting_alerts') as any).update({
        dismissed: true,
        dismissed_at: new Date().toISOString()
    }).eq('id', alertId)
    return !error
}

export async function markAlertAsSent(alertId: string) {
    const { error } = await (supabase.from('meeting_alerts') as any).update({
        sent: true,
        sent_at: new Date().toISOString()
    }).eq('id', alertId)
    return !error
}

// ============================================
// Upcoming Meetings with Urgency
// ============================================

export interface MeetingWithUrgency extends Meeting {
    empresa?: string
    etapa?: string
    hoursUntil?: number
    urgencyLevel?: 'overdue' | 'urgent' | 'today' | 'soon' | 'scheduled' | 'in_progress'
    seller_name?: string
}

export function calculateMeetingUrgency(startTimeStr: string, durationMinutes: number = 60, now: Date = new Date()): { level: MeetingWithUrgency['urgencyLevel']; hoursUntil: number } {
    const startTime = new Date(startTimeStr)
    const hoursUntil = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60)
    const durationMs = durationMinutes * 60 * 1000
    const endTime = new Date(startTime.getTime() + durationMs)

    let level: MeetingWithUrgency['urgencyLevel']

    if (now >= startTime && now <= endTime) {
        level = 'in_progress'
    } else if (hoursUntil < 0) {
        level = 'overdue'
    } else if (hoursUntil < 2) {
        level = 'urgent'
    } else if (hoursUntil < 24) {
        level = 'today'
    } else if (hoursUntil < 48) {
        level = 'soon'
    } else {
        level = 'scheduled'
    }

    return { level, hoursUntil }
}

export async function getUpcomingMeetings(userId: string, limit: number = 10, allMeetings: boolean = false, userEmail?: string): Promise<MeetingWithUrgency[]> {
    try {
        let query = supabase.from('meetings').select('*')
        if (!allMeetings) {
            if (userEmail) query = query.or(`seller_id.eq.${userId},attendees.cs.{"${userEmail}"}`)
            else query = query.eq('seller_id', userId)
        }

        const { data: meetings, error } = await query
            .eq('status', 'scheduled')
            .order('start_time', { ascending: true })
            .limit(limit * 2)

        if (error) return []

        const filteredMeetings = (meetings || []).filter((m: any) =>
            m.meeting_status === 'scheduled' || m.meeting_status === 'pending_confirmation'
        ).slice(0, limit)

        if (filteredMeetings.length === 0) return []

        const leadIds = Array.from(new Set(filteredMeetings.map((m: any) => m.lead_id)))
        const { data: clients } = await supabase.from('clientes').select('id, empresa, etapa').in('id', leadIds)
        const clientsMap = (clients || []).reduce((acc: any, client: any) => { acc[client.id] = client; return acc }, {})

        let sellersMap: Record<string, string> = {}
        if (allMeetings) {
            const sellerIds = Array.from(new Set(filteredMeetings.map((m: any) => m.seller_id)))
            const { data: profiles } = await supabase.from('profiles').select('id, username, full_name').in('id', sellerIds)
            if (profiles) sellersMap = profiles.reduce((acc: any, p: any) => { acc[p.id] = p.full_name || p.username || 'Desconocido'; return acc }, {})
        }

        const now = new Date()
        return filteredMeetings.map((meeting: any) => {
            const client = clientsMap[meeting.lead_id]
            const { level, hoursUntil } = calculateMeetingUrgency(meeting.start_time, meeting.duration_minutes, now)
            return {
                ...meeting,
                empresa: client?.empresa,
                etapa: client?.etapa,
                hoursUntil,
                urgencyLevel: level,
                seller_name: sellersMap[meeting.seller_id]
            }
        })
    } catch (err) {
        return []
    }
}

export function getUrgencyColor(urgencyLevel: string): { bg: string, border: string, text: string, label: string } {
    switch (urgencyLevel) {
        case 'in_progress': return { bg: 'bg-indigo-100', border: 'border-indigo-500', text: 'text-indigo-800', label: 'En transcurso' }
        case 'overdue': return { bg: 'bg-red-100', border: 'border-red-500', text: 'text-red-800', label: 'Vencida' }
        case 'urgent': return { bg: 'bg-orange-100', border: 'border-orange-500', text: 'text-orange-800', label: 'Urgente' }
        case 'today': return { bg: 'bg-yellow-100', border: 'border-yellow-500', text: 'text-yellow-800', label: 'Hoy' }
        case 'soon': return { bg: 'bg-blue-100', border: 'border-blue-400', text: 'text-blue-800', label: 'Próxima' }
        default: return { bg: 'bg-gray-100', border: 'border-gray-300', text: 'text-gray-700', label: 'Programada' }
    }
}

export function getStageColor(etapa: string): { bg: string, border: string, text: string } {
    switch (etapa) {
        case 'Negociación': return { bg: 'bg-amber-100', border: 'border-amber-400', text: 'text-amber-800' }
        case 'Prospección': return { bg: 'bg-blue-100', border: 'border-blue-400', text: 'text-blue-800' }
        case 'Cerrado Ganado': return { bg: 'bg-emerald-100', border: 'border-emerald-400', text: 'text-emerald-800' }
        case 'Cerrado Perdido': return { bg: 'bg-gray-100', border: 'border-gray-400', text: 'text-gray-800' }
        default: return { bg: 'bg-gray-100', border: 'border-gray-300', text: 'text-gray-700' }
    }
}
