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
type MeetingStatusLike = Pick<Meeting, 'status' | 'meeting_status'>
type MeetingRescheduleReasonInput = {
    reasonId?: string | null
    reasonCustom?: string | null
    responsibility?: 'propia' | 'ajena' | null
    notes?: string | null
}

const supabase = createClient()

function isUnknownColumnError(error: any): boolean {
    if (!error) return false
    if (String(error?.code || '') === '42703') return true
    const message = String(error?.message || '').toLowerCase()
    return message.includes('column') && (
        message.includes('does not exist')
        || message.includes('could not find')
        || message.includes('unknown')
    )
}

const MEETING_ALERT_DEFINITIONS: Array<{ type: string; minutesBefore: number }> = [
    { type: '24h', minutesBefore: 24 * 60 },
    { type: '2h', minutesBefore: 2 * 60 },
    { type: '15min', minutesBefore: 15 },
    { type: '5min', minutesBefore: 5 }
]

function shouldScheduleMeetingAlerts(startTimeIso: string, status: string, meetingStatus: string) {
    const normalizedStatus = String(status || '').trim().toLowerCase()
    const normalizedMeetingStatus = String(meetingStatus || '').trim().toLowerCase()
    const startTimeMs = new Date(String(startTimeIso || '')).getTime()

    if (!Number.isFinite(startTimeMs)) return false
    if (startTimeMs <= Date.now()) return false
    if (normalizedStatus !== 'scheduled') return false
    if (normalizedMeetingStatus && normalizedMeetingStatus !== 'scheduled' && normalizedMeetingStatus !== 'pending_confirmation') return false
    return true
}

function buildDesiredMeetingAlertSchedule(startTimeIso: string, nowMs: number = Date.now()) {
    const startTimeMs = new Date(String(startTimeIso || '')).getTime()
    if (!Number.isFinite(startTimeMs)) return new Map<string, string>()

    const schedule = new Map<string, string>()
    for (const item of MEETING_ALERT_DEFINITIONS) {
        const alertMs = startTimeMs - (item.minutesBefore * 60 * 1000)
        if (alertMs > nowMs) {
            schedule.set(item.type, new Date(alertMs).toISOString())
        }
    }
    return schedule
}

async function syncMeetingAlertsForUpdatedSchedule(params: {
    meetingId: string
    sellerId: string
    startTimeIso: string
    status: string
    meetingStatus: string
}) {
    const meetingId = String(params.meetingId || '').trim()
    const sellerId = String(params.sellerId || '').trim()
    if (!meetingId || !sellerId) return

    const { data: existingAlerts, error: existingAlertsError } = await (supabase
        .from('meeting_alerts') as any)
        .select('id, alert_type, alert_time, sent, dismissed')
        .eq('meeting_id', meetingId)
        .eq('sent', false)

    if (existingAlertsError) {
        console.warn('[MeetingAlerts] Could not load existing alerts while syncing reschedule:', existingAlertsError)
        return
    }

    const alertRows = Array.isArray(existingAlerts) ? existingAlerts : []
    const shouldSchedule = shouldScheduleMeetingAlerts(params.startTimeIso, params.status, params.meetingStatus)

    if (!shouldSchedule) {
        for (const row of alertRows) {
            const id = String(row?.id || '').trim()
            if (!id || Boolean(row?.dismissed)) continue
            const { error: dismissError } = await (supabase
                .from('meeting_alerts') as any)
                .update({
                    dismissed: true,
                    dismissed_at: new Date().toISOString()
                })
                .eq('id', id)

            if (dismissError) {
                console.warn(`[MeetingAlerts] Could not dismiss alert ${id}:`, dismissError)
            }
        }
        return
    }

    const desiredSchedule = buildDesiredMeetingAlertSchedule(params.startTimeIso)
    const toleranceMs = 60 * 1000

    for (const row of alertRows) {
        const id = String(row?.id || '').trim()
        const alertType = String(row?.alert_type || '').trim()
        if (!id || !alertType) continue

        const desiredAlertTime = desiredSchedule.get(alertType) || null
        if (!desiredAlertTime) {
            if (!row?.dismissed) {
                const { error: dismissError } = await (supabase
                    .from('meeting_alerts') as any)
                    .update({
                        dismissed: true,
                        dismissed_at: new Date().toISOString()
                    })
                    .eq('id', id)
                if (dismissError) {
                    console.warn(`[MeetingAlerts] Could not dismiss obsolete alert ${id}:`, dismissError)
                }
            }
            continue
        }

        desiredSchedule.delete(alertType)

        const currentAlertMs = new Date(String(row?.alert_time || '')).getTime()
        const desiredAlertMs = new Date(desiredAlertTime).getTime()
        const shouldUpdateTime = !Number.isFinite(currentAlertMs) || Math.abs(currentAlertMs - desiredAlertMs) > toleranceMs
        const shouldResetDismissState = Boolean(row?.dismissed)

        if (!shouldUpdateTime && !shouldResetDismissState) continue

        const { error: updateError } = await (supabase
            .from('meeting_alerts') as any)
            .update({
                alert_time: desiredAlertTime,
                dismissed: false,
                dismissed_at: null,
                sent: false,
                sent_at: null
            })
            .eq('id', id)

        if (updateError) {
            console.warn(`[MeetingAlerts] Could not refresh alert ${id}:`, updateError)
        }
    }

    for (const [alertType, alertTime] of desiredSchedule.entries()) {
        const { error: insertError } = await (supabase
            .from('meeting_alerts') as any)
            .insert({
                meeting_id: meetingId,
                user_id: sellerId,
                alert_type: alertType,
                alert_time: alertTime,
                sent: false,
                dismissed: false
            })

        if (insertError) {
            console.warn(`[MeetingAlerts] Could not create missing ${alertType} alert for meeting ${meetingId}:`, insertError)
        }
    }
}

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

    const parsedStart = new Date(String(meetingData.start_time || ''))
    if (Number.isNaN(parsedStart.getTime())) {
        throw new Error('La fecha de la junta es inválida.')
    }

    const nowTs = Date.now()
    const startTs = parsedStart.getTime()
    const isPastDate = startTs < nowTs
    const isHistoricalRegistration = String(meetingData.meeting_status || '').trim().toLowerCase() === 'pending_confirmation'

    if (isPastDate && !isHistoricalRegistration) {
        throw new Error('No se puede agendar una junta en el pasado. Usa la opción "Registrar junta realizada".')
    }

    if (!isPastDate && isHistoricalRegistration) {
        throw new Error('La opción "Registrar junta realizada" solo permite fechas pasadas.')
    }

    // Check Auth State
    const { data: { session }, error: authError } = await supabase.auth.getSession()
    console.log('👤 Auth Session User:', session?.user?.id)
    if (authError) console.error('❌ Auth Error:', authError)

    if (!session?.user) {
        console.error('❌ NO ACTIVE SESSION. Database request will likely fail RLS.')
        throw new Error('No hay sesión activa para registrar la junta. Vuelve a iniciar sesión.')
    }

    const schedulerUserId = String(session.user.id)
    if (schedulerUserId !== String(meetingData.seller_id || '')) {
        console.warn('⚠️ Seller ID del payload no coincide con la sesión. Se usará auth.uid() para cumplir RLS.')
        console.warn(`Session: ${schedulerUserId} vs Payload: ${meetingData.seller_id}`)
    }

    const sanitizedMeetingData: MeetingInsert = {
        ...meetingData,
        seller_id: schedulerUserId
    }

    // Attempt Insert
    const response = await (supabase
        .from('meetings') as any)
        .insert([sanitizedMeetingData])
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
        await updateLeadNextMeeting(sanitizedMeetingData.lead_id)

        // Track Event: meeting_scheduled
        trackEvent({
            eventType: 'meeting_scheduled',
            entityType: 'meeting',
            entityId: (createdMeeting as any).id,
            userId: schedulerUserId,
            metadata: { lead_id: sanitizedMeetingData.lead_id, title: sanitizedMeetingData.title }
        })
    } catch (updateError) {
        console.error('⚠️ Error updating lead next meeting (non-critical):', updateError)
    }

    return createdMeeting
}

export async function updateMeeting(
    meetingId: string,
    updates: MeetingUpdate,
    rescheduleReason?: MeetingRescheduleReasonInput | null
) {
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

    if (data) {
        const shouldSyncAlerts = (
            updates.start_time !== undefined
            || updates.seller_id !== undefined
            || updates.status !== undefined
            || updates.meeting_status !== undefined
        )

        if (shouldSyncAlerts) {
            try {
                await syncMeetingAlertsForUpdatedSchedule({
                    meetingId: String(data.id || meetingId),
                    sellerId: String(data.seller_id || ''),
                    startTimeIso: String(data.start_time || ''),
                    status: String(data.status || ''),
                    meetingStatus: String(data.meeting_status || '')
                })
            } catch (alertSyncError) {
                console.warn('[MeetingAlerts] Could not sync alerts after meeting update:', alertSyncError)
            }
        }
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
                const normalizedReasonId = String(rescheduleReason?.reasonId || '').trim() || null
                const normalizedReasonCustom = String(rescheduleReason?.reasonCustom || '').trim() || null
                const normalizedResponsibility =
                    rescheduleReason?.responsibility === 'propia' || rescheduleReason?.responsibility === 'ajena'
                        ? rescheduleReason.responsibility
                        : null
                const normalizedNotes = String(rescheduleReason?.notes || '').trim() || null

                let normalizedReasonText = normalizedReasonCustom
                if (!normalizedReasonText && normalizedReasonId) {
                    const { data: reasonRow, error: reasonError } = await (supabase
                        .from('meeting_cancellation_reasons') as any)
                        .select('label')
                        .eq('id', normalizedReasonId)
                        .maybeSingle()

                    if (!reasonError && reasonRow?.label) {
                        normalizedReasonText = String(reasonRow.label || '').trim() || null
                    }
                }

                if (!normalizedReasonText && normalizedReasonId) {
                    normalizedReasonText = `catalog:${normalizedReasonId}`
                }
                if (!normalizedReasonText) normalizedReasonText = 'manual_update'

                const baseAuditPayload = {
                    meeting_id: meetingId,
                    lead_id: data.lead_id,
                    seller_id: data.seller_id,
                    old_start_time: prevStart,
                    new_start_time: newStart,
                    changed_by: data.seller_id,
                    reason: normalizedReasonText
                }

                const { error: structuredAuditError } = await (supabase
                    .from('meeting_reschedule_events') as any)
                    .insert({
                        ...baseAuditPayload,
                        reason_catalog_id: normalizedReasonId,
                        reason_custom: normalizedReasonCustom,
                        responsibility: normalizedResponsibility,
                        notes: normalizedNotes
                    })

                if (structuredAuditError) {
                    if (isUnknownColumnError(structuredAuditError)) {
                        const { error: fallbackAuditError } = await (supabase
                            .from('meeting_reschedule_events') as any)
                            .insert(baseAuditPayload)

                        if (fallbackAuditError) throw fallbackAuditError
                    } else {
                        throw structuredAuditError
                    }
                }
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
                    new_start_time: newStart,
                    reason_id: String(rescheduleReason?.reasonId || '').trim() || null,
                    reason_custom: String(rescheduleReason?.reasonCustom || '').trim() || null,
                    responsibility: rescheduleReason?.responsibility || null
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

export type MeetingPostponeCancelForecast = {
    probabilityPct: number
    sampleSize: number
    postponedOrCancelledCount: number
    heldCount: number
    confidence: 'alta' | 'media' | 'baja' | 'insuficiente'
    basedOn: 'company' | 'lead'
}

function getMeetingRiskConfidenceLabel(sampleSize: number): 'alta' | 'media' | 'baja' | 'insuficiente' {
    if (sampleSize >= 30) return 'alta'
    if (sampleSize >= 12) return 'media'
    if (sampleSize >= 5) return 'baja'
    return 'insuficiente'
}

function normalizeMeetingOutcomeStatus(meeting: MeetingStatusLike): 'held' | 'not_held' | 'cancelled' | 'scheduled' {
    const meetingStatus = String(meeting?.meeting_status || '').trim().toLowerCase()
    const status = String(meeting?.status || '').trim().toLowerCase()

    if (meetingStatus === 'held' || status === 'completed') return 'held'
    if (meetingStatus === 'not_held') return 'not_held'
    if (meetingStatus === 'cancelled' || status === 'cancelled') return 'cancelled'
    return 'scheduled'
}

export async function getMeetingPostponeCancelForecastForLead(leadId: number): Promise<MeetingPostponeCancelForecast | null> {
    const safeLeadId = Number(leadId)
    if (!Number.isFinite(safeLeadId) || safeLeadId <= 0) return null

    try {
        const { data: leadRow, error: leadError } = await (supabase
            .from('clientes') as any)
            .select('id, empresa_id')
            .eq('id', safeLeadId)
            .maybeSingle()

        if (leadError) throw leadError
        if (!leadRow?.id) return null

        let basedOn: 'company' | 'lead' = 'lead'
        let scopedLeadIds: number[] = [safeLeadId]

        const companyId = String(leadRow.empresa_id || '').trim()
        if (companyId) {
            const { data: companyLeadRows, error: companyLeadError } = await (supabase
                .from('clientes') as any)
                .select('id')
                .eq('empresa_id', companyId)
            if (companyLeadError) throw companyLeadError
            const parsedLeadIds = ((companyLeadRows || []) as Array<{ id: number | string }>)
                .map((row) => Number(row.id))
                .filter((id) => Number.isFinite(id))
            if (parsedLeadIds.length > 0) {
                scopedLeadIds = parsedLeadIds
                basedOn = 'company'
            }
        }

        const { data: meetingRows, error: meetingError } = await (supabase
            .from('meetings') as any)
            .select('status, meeting_status, lead_id')
            .in('lead_id', scopedLeadIds)
        if (meetingError) throw meetingError

        let sampleSize = 0
        let postponedOrCancelledCount = 0
        let heldCount = 0

        ;((meetingRows || []) as MeetingStatusLike[]).forEach((meeting) => {
            const outcome = normalizeMeetingOutcomeStatus(meeting)
            if (outcome === 'scheduled') return
            sampleSize += 1
            if (outcome === 'held') {
                heldCount += 1
                return
            }
            if (outcome === 'not_held' || outcome === 'cancelled') {
                postponedOrCancelledCount += 1
            }
        })

        const probabilityPct = sampleSize > 0
            ? (postponedOrCancelledCount / sampleSize) * 100
            : 0

        return {
            probabilityPct,
            sampleSize,
            postponedOrCancelledCount,
            heldCount,
            confidence: getMeetingRiskConfidenceLabel(sampleSize),
            basedOn
        }
    } catch (error) {
        console.error('[MeetingsService] Error calculating postpone/cancel forecast:', error)
        return null
    }
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
    const captureTimestamp = new Date().toISOString()
    const forecastValueAmount = Number((lead as any).value_forecast_estimated ?? (lead as any).valor_estimado ?? 0)
    const forecastImplementationAmount = Number((lead as any).implementation_forecast_estimated ?? (lead as any).valor_implementacion_estimado ?? 0)
    const forecastCloseDate = (lead as any).close_date_forecast_estimated
        || (lead as any).forecast_close_date
        || null

    // Create snapshot
    const snapshotData: SnapshotInsert = {
        lead_id: leadId,
        seller_id: meeting.seller_id,
        meeting_id: meetingId,
        snapshot_number: snapshotNumber,
        probability: lead.probabilidad || 50,
        forecast_value_amount: forecastValueAmount,
        forecast_implementation_amount: forecastImplementationAmount,
        forecast_close_date: forecastCloseDate,
        snapshot_timestamp: captureTimestamp,
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
            last_snapshot_at: captureTimestamp,
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
            forecast_value_amount: forecastValueAmount,
            forecast_implementation_amount: forecastImplementationAmount,
            forecast_close_date: forecastCloseDate,
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
