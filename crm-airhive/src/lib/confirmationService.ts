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
        console.log('🚀 Starting confirmMeeting:', { meetingId, wasHeld, userId })

        // 1. Get meeting with frozen probability
        const { data: meeting, error: meetingError } = await (supabase
            .from('meetings') as any)
            .select('*')
            .eq('id', meetingId)
            .single()

        if (meetingError) {
            console.error('❌ Error fetching meeting:', meetingError)
            throw new Error(`Error al buscar la junta: ${meetingError.message}`)
        }
        if (!meeting) {
            console.error('❌ Meeting not found for ID:', meetingId)
            throw new Error('La junta no existe')
        }

        // --- IDEMPOTENCY CHECK ---
        if (meeting.status === 'completed' || meeting.meeting_status === 'held' || meeting.meeting_status === 'not_held') {
            console.log('✅ Meeting already confirmed, returning success (Idempotency)')
            return {
                success: true,
                snapshotCreated: !!meeting.frozen_probability_value,
                snapshotId: undefined // We don't necessarily need the ID if it's already done
            }
        }

        let snapshotId: string | null = null
        let snapshotCreated = false

        let frozenProbability = meeting.frozen_probability_value

        // Fallback if not frozen (unlikely but possible)
        if (wasHeld && frozenProbability === null) {
            console.log('⚠️ Frozen probability missing, fetching current lead probability as fallback')
            const { data: clientData, error: clientError } = await supabase
                .from('clientes')
                .select('probabilidad')
                .eq('id', meeting.lead_id)
                .single()

            if (!clientError && clientData) {
                frozenProbability = (clientData as any).probabilidad
            } else {
                console.warn('⚠️ Could not fetch client probability for fallback:', clientError)
                frozenProbability = 50 // Default fallback
            }
        }

        // 2. Create Snapshot if held
        if (wasHeld && frozenProbability !== null) {
            // Check if snapshot already exists for this meeting (Idempotency)
            const { data: existingSnapshot } = await (supabase
                .from('forecast_snapshots') as any)
                .select('id')
                .eq('meeting_id', meetingId)
                .maybeSingle()

            if (existingSnapshot) {
                console.log('✅ Snapshot already exists for this meeting:', existingSnapshot.id)
                snapshotId = existingSnapshot.id
                snapshotCreated = true
            } else {
                console.log('📸 Creating snapshot with probability:', frozenProbability)
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

                if (snapshotError) {
                    console.error('❌ Error creating snapshot:', snapshotError)
                    throw new Error(`Error al crear el snapshot: ${snapshotError.message}`)
                }

                if (snapshot) {
                    snapshotId = snapshot.id
                    snapshotCreated = true
                    console.log('✅ Snapshot created:', snapshotId)
                }
            }
        }

        // 3. Update meeting status
        console.log('📝 Updating meeting status to completed')
        const { error: updateMtgError } = await (supabase
            .from('meetings') as any)
            .update({
                status: 'completed',
                meeting_status: wasHeld ? 'held' : 'not_held',
                confirmation_timestamp: new Date().toISOString(),
                confirmed_by: userId,
                confirmation_notes: notes
            })
            .eq('id', meetingId)

        if (updateMtgError) {
            console.error('❌ Error updating meeting status:', updateMtgError)
            throw new Error(`Error al actualizar la junta: ${updateMtgError.message}`)
        }

        // 4. Record confirmation log (Manual check for idempotency)
        console.log('📄 Recording confirmation log')
        const confirmationData: MeetingConfirmation = {
            meeting_id: meetingId,
            confirmed_by: userId,
            was_held: wasHeld,
            confirmation_notes: notes,
            snapshot_created: snapshotCreated,
            snapshot_id: snapshotId
        }

        const { data: existingLog } = await (supabase
            .from('meeting_confirmations') as any)
            .select('id')
            .eq('meeting_id', meetingId)
            .maybeSingle()

        if (existingLog) {
            console.log('📝 Updating existing confirmation log')
            const { error: updateLogError } = await (supabase
                .from('meeting_confirmations') as any)
                .update(confirmationData)
                .eq('id', existingLog.id)

            if (updateLogError) {
                console.error('❌ Error updating confirmation log:', updateLogError.message || updateLogError)
            }
        } else {
            console.log('📝 Creating new confirmation log')
            const { error: insertLogError } = await (supabase
                .from('meeting_confirmations') as any)
                .insert(confirmationData)

            if (insertLogError) {
                // If it's a duplicate key error (race condition), we can ignore it
                if (insertLogError.code === '23505') {
                    console.log('✅ Confirmation log already inserted by another process.')
                } else {
                    console.error('❌ Error inserting confirmation log:', insertLogError.message || insertLogError)
                }
            }
        }

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

        if (nextError) console.error('⚠️ Error finding next meeting:', nextError)

        console.log('🔓 Unlocking lead probability')
        const { error: leadUpdateError } = await (supabase
            .from('clientes') as any)
            .update({
                probability_locked: false,
                next_meeting_id: nextMeeting?.id || null
            })
            .eq('id', meeting.lead_id)

        if (leadUpdateError) {
            console.error('❌ Error updating lead status:', leadUpdateError)
            throw new Error(`Error al desbloquear el lead: ${leadUpdateError.message}`)
        }

        console.log('✨ confirmMeeting finished successfully')
        return {
            success: true,
            snapshotCreated,
            snapshotId: snapshotId || undefined
        }
    } catch (error) {
        console.error('💥 Severe Error in confirmMeeting:', error)
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
