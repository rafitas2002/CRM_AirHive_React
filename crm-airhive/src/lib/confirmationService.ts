import { createClient } from './supabase'
import { Database } from './supabase'

type Meeting = Database['public']['Tables']['meetings']['Row']
type MeetingAlert = Database['public']['Tables']['meeting_alerts']['Row']
type MeetingConfirmation = Database['public']['Tables']['meeting_confirmations']['Insert']
type MeetingCancellationReason = Database['public']['Tables']['meeting_cancellation_reasons']['Row']
type Snapshot = Database['public']['Tables']['forecast_snapshots']['Row']

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

function isHeldMeetingOutcome(meeting: { status?: string | null; meeting_status?: string | null }): boolean {
    const meetingStatus = String(meeting?.meeting_status || '').trim().toLowerCase()
    const status = String(meeting?.status || '').trim().toLowerCase()

    if (meetingStatus === 'held') return true
    if (meetingStatus === 'not_held' || meetingStatus === 'cancelled') return false
    return status === 'completed'
}

async function promoteCompanyAfterFirstHeldMeeting(leadId: number, userId: string) {
    const safeLeadId = Number(leadId)
    if (!Number.isFinite(safeLeadId) || safeLeadId <= 0) return

    const { data: leadRow, error: leadError } = await (supabase
        .from('clientes') as any)
        .select('id, empresa_id')
        .eq('id', safeLeadId)
        .maybeSingle()

    if (leadError || !leadRow?.id) {
        if (leadError) {
            console.warn('[confirmMeeting] Could not resolve lead/company for lifecycle promotion:', leadError)
        }
        return
    }

    const companyId = String(leadRow.empresa_id || '').trim()
    if (!companyId) return

    const { data: companyLeadRows, error: companyLeadsError } = await (supabase
        .from('clientes') as any)
        .select('id')
        .eq('empresa_id', companyId)

    if (companyLeadsError) {
        console.warn('[confirmMeeting] Could not load company leads for lifecycle promotion:', companyLeadsError)
        return
    }

    const companyLeadIds = ((companyLeadRows || []) as Array<{ id: number | string }>)
        .map((row) => Number(row.id))
        .filter((id) => Number.isFinite(id))

    if (companyLeadIds.length === 0) return

    const { data: companyMeetingRows, error: companyMeetingsError } = await (supabase
        .from('meetings') as any)
        .select('status, meeting_status')
        .in('lead_id', companyLeadIds)

    if (companyMeetingsError) {
        console.warn('[confirmMeeting] Could not load company meetings for lifecycle promotion:', companyMeetingsError)
        return
    }

    const heldMeetingsCount = ((companyMeetingRows || []) as Array<{ status?: string | null; meeting_status?: string | null }>)
        .filter((meeting) => isHeldMeetingOutcome(meeting))
        .length

    if (heldMeetingsCount <= 0) return

    const nowIso = new Date().toISOString()
    const { data: companyMeta } = await (supabase
        .from('empresas') as any)
        .select('first_lead_at, leads_count')
        .eq('id', companyId)
        .maybeSingle()

    const existingFirstLeadAtRaw = String((companyMeta as any)?.first_lead_at || '').trim()
    const existingFirstLeadAt = existingFirstLeadAtRaw || null
    const existingLeadsCount = Number((companyMeta as any)?.leads_count || 0)
    const normalizedLeadsCount = Number.isFinite(existingLeadsCount) ? existingLeadsCount : 0
    const nextLeadsCount = Math.max(normalizedLeadsCount, companyLeadIds.length)

    const companyStageUpdateAttempts: Array<Record<string, any>> = [
        {
            lifecycle_stage: 'lead',
            updated_by: userId,
            first_lead_at: existingFirstLeadAt || nowIso,
            last_lead_at: nowIso,
            leads_count: nextLeadsCount
        },
        {
            lifecycle_stage: 'lead',
            first_lead_at: existingFirstLeadAt || nowIso,
            last_lead_at: nowIso
        },
        {
            lifecycle_stage: 'lead'
        }
    ]

    for (const payload of companyStageUpdateAttempts) {
        const { error } = await (supabase.from('empresas') as any)
            .update(payload)
            .eq('id', companyId)

        if (!error) break
        if (!isUnknownColumnError(error)) {
            console.warn('[confirmMeeting] Failed to promote company lifecycle after held meeting:', error)
            break
        }
    }

    const suspectSyncAttempts: Array<Record<string, any>> = [
        {
            is_converted: true,
            converted_at: nowIso,
            converted_to_lead_id: safeLeadId,
            updated_by: userId
        },
        { is_converted: true }
    ]

    for (const payload of suspectSyncAttempts) {
        const query = (supabase.from('pre_leads') as any)
            .update(payload)
            .eq('empresa_id', companyId)
            .eq('is_converted', false)
        const { error } = await query
        if (!error) break
        if (!isUnknownColumnError(error)) {
            console.warn('[confirmMeeting] Failed syncing suspect conversion after held meeting:', error)
            break
        }
    }
}

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
    payload: {
        notes: string
        notHeldReasonId?: string | null
        notHeldReasonCustom?: string | null
        notHeldResponsibility?: 'propia' | 'ajena' | null
    },
    userId: string
): Promise<{ success: boolean; snapshotCreated: boolean; snapshotId?: string }> {
    try {
        console.log('🚀 Starting confirmMeeting:', { meetingId, wasHeld, userId })
        const toFiniteNumber = (value: any): number | null => {
            if (value === null || value === undefined || value === '') return null
            const parsed = Number(value)
            return Number.isFinite(parsed) ? parsed : null
        }
        const notes = String(payload.notes || '').trim()
        const notHeldReasonId = wasHeld ? null : String(payload.notHeldReasonId || '').trim()
        const notHeldReasonCustom = wasHeld ? null : String(payload.notHeldReasonCustom || '').trim()
        const notHeldResponsibility = wasHeld ? null : payload.notHeldResponsibility || null
        let notHeldReasonLabel: string | null = null
        let notHeldReasonCatalogId: string | null = null

        if (!wasHeld) {
            if (notHeldResponsibility !== 'propia' && notHeldResponsibility !== 'ajena') {
                throw new Error('Debes indicar si la cancelación fue propia o ajena.')
            }

            if (!notHeldReasonId && !notHeldReasonCustom) {
                throw new Error('Debes seleccionar un motivo de cancelación.')
            }

            if (notHeldReasonId) {
                const { data: reasonById, error: reasonByIdError } = await (supabase
                    .from('meeting_cancellation_reasons') as any)
                    .select('id, label')
                    .eq('id', notHeldReasonId)
                    .maybeSingle()

                if (reasonByIdError?.code === '42P01') {
                    throw new Error('Falta ejecutar la migración de motivos de cancelación para confirmar juntas no realizadas.')
                }

                if (reasonByIdError || !reasonById) {
                    throw new Error('El motivo de cancelación seleccionado no existe o ya no está disponible.')
                }

                notHeldReasonCatalogId = reasonById.id
                notHeldReasonLabel = String(reasonById.label || '').trim() || null
            } else if (notHeldReasonCustom) {
                const customLabel = notHeldReasonCustom
                const { data: existingReason, error: existingReasonError } = await (supabase
                    .from('meeting_cancellation_reasons') as any)
                    .select('id, label')
                    .ilike('label', customLabel)
                    .limit(1)
                    .maybeSingle()

                if (existingReasonError?.code === '42P01') {
                    notHeldReasonCatalogId = null
                    notHeldReasonLabel = customLabel
                } else if (existingReason?.id) {
                    notHeldReasonCatalogId = existingReason.id
                    notHeldReasonLabel = String(existingReason.label || customLabel).trim()
                } else {
                    const slug = customLabel
                        .toLowerCase()
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .replace(/[^a-z0-9]+/g, '_')
                        .replace(/^_+|_+$/g, '')
                        .slice(0, 42)
                    const fallbackSlug = slug || 'motivo'
                    const code = `custom_${fallbackSlug}_${Date.now().toString().slice(-6)}`

                    const { data: createdReason, error: createReasonError } = await (supabase
                        .from('meeting_cancellation_reasons') as any)
                        .insert({
                            code,
                            label: customLabel,
                            is_active: true,
                            is_default: false,
                            sort_order: 999,
                            created_by: userId
                        })
                        .select('id, label')
                        .single()

                    if (createReasonError?.code === '42P01') {
                        notHeldReasonCatalogId = null
                        notHeldReasonLabel = customLabel
                    } else if (createReasonError || !createdReason) {
                        throw new Error(`No se pudo registrar el motivo de cancelación: ${createReasonError?.message || 'Error desconocido'}`)
                    } else {
                        notHeldReasonCatalogId = createdReason.id
                        notHeldReasonLabel = String(createdReason.label || customLabel).trim()
                    }
                }
            }

            if (!notHeldReasonLabel) {
                throw new Error('Debes indicar la razón por la que no se realizó la junta.')
            }
        }

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
        let forecastValueAmount: number | null = null
        let forecastImplementationAmount: number | null = null
        let forecastCloseDate: string | null = null

        // Fallback if not frozen (unlikely but possible)
        if (wasHeld && frozenProbability === null) {
            console.log('⚠️ Frozen probability missing, fetching current lead probability as fallback')
            const { data: clientData, error: clientError } = await supabase
                .from('clientes')
                .select('*')
                .eq('id', meeting.lead_id)
                .single()

            if (!clientError && clientData) {
                frozenProbability = (clientData as any).probabilidad
                forecastValueAmount = toFiniteNumber((clientData as any).value_forecast_estimated)
                    ?? toFiniteNumber((clientData as any).valor_estimado)
                    ?? 0
                forecastImplementationAmount = toFiniteNumber((clientData as any).implementation_forecast_estimated)
                    ?? toFiniteNumber((clientData as any).valor_implementacion_estimado)
                    ?? 0
                forecastCloseDate = (clientData as any).close_date_forecast_estimated
                    || (clientData as any).forecast_close_date
                    || null
            } else {
                console.warn('⚠️ Could not fetch client probability for fallback:', clientError)
                frozenProbability = 50 // Default fallback
            }
        }

        if (wasHeld && (forecastValueAmount === null || forecastImplementationAmount === null || forecastCloseDate === null)) {
            const { data: leadForecastData } = await (supabase
                .from('clientes') as any)
                .select('*')
                .eq('id', meeting.lead_id)
                .maybeSingle()

            if (leadForecastData) {
                if (forecastValueAmount === null) {
                    forecastValueAmount = toFiniteNumber((leadForecastData as any).value_forecast_estimated)
                        ?? toFiniteNumber((leadForecastData as any).valor_estimado)
                        ?? 0
                }
                if (forecastImplementationAmount === null) {
                    forecastImplementationAmount = toFiniteNumber((leadForecastData as any).implementation_forecast_estimated)
                        ?? toFiniteNumber((leadForecastData as any).valor_implementacion_estimado)
                        ?? 0
                }
                if (forecastCloseDate === null) {
                    forecastCloseDate = (leadForecastData as any).close_date_forecast_estimated
                        || (leadForecastData as any).forecast_close_date
                        || null
                }
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
                const captureTimestamp = new Date().toISOString()

                const { data: snapshot, error: snapshotError } = await (supabase
                    .from('forecast_snapshots') as any)
                    .insert({
                        lead_id: meeting.lead_id,
                        seller_id: meeting.seller_id,
                        meeting_id: meetingId,
                        snapshot_number: snapshotNumber,
                        probability: frozenProbability,
                        forecast_value_amount: forecastValueAmount,
                        forecast_implementation_amount: forecastImplementationAmount,
                        forecast_close_date: forecastCloseDate,
                        snapshot_timestamp: captureTimestamp,
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
                confirmation_notes: notes,
                not_held_reason: notHeldReasonLabel,
                not_held_reason_id: notHeldReasonCatalogId,
                not_held_responsibility: notHeldResponsibility
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
            not_held_reason: notHeldReasonLabel,
            not_held_reason_id: notHeldReasonCatalogId,
            not_held_responsibility: notHeldResponsibility,
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

        if (wasHeld) {
            try {
                await promoteCompanyAfterFirstHeldMeeting(meeting.lead_id, userId)
            } catch (promotionError) {
                console.warn('[confirmMeeting] Meeting confirmed, but company promotion fallback failed:', promotionError)
            }
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

export async function getMeetingCancellationReasons(): Promise<MeetingCancellationReason[]> {
    try {
        const { data, error } = await (supabase
            .from('meeting_cancellation_reasons') as any)
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true })
            .order('label', { ascending: true })

        if (error) {
            console.error('Error loading meeting cancellation reasons:', error)
            return []
        }

        return (data || []) as MeetingCancellationReason[]
    } catch (error) {
        console.error('Exception loading meeting cancellation reasons:', error)
        return []
    }
}

// ============================================
// Pending Confirmations
// ============================================

export async function getPendingConfirmations(userId: string) {
    try {
        const nowIso = new Date().toISOString()
        const { data: meetings, error: meetingsError } = await (supabase
            .from('meetings') as any)
            .select('*')
            .eq('seller_id', userId)
            .eq('status', 'scheduled')
            .in('meeting_status', ['scheduled', 'pending_confirmation'])
            .lt('start_time', nowIso)
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
            return now >= end
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
        const nowIso = new Date().toISOString()
        const nowMs = new Date(nowIso).getTime()
        const { data, error } = await (supabase
            .from('meeting_alerts') as any)
            .select(`
                *,
                meetings:meeting_id (
                    id,
                    title,
                    start_time,
                    status,
                    meeting_status,
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
            .lte('alert_time', nowIso)
            .order('alert_time', { ascending: true })

        if (error) {
            console.error('Error fetching pending alerts:', error)
            return []
        }

        const rows = Array.isArray(data) ? data : []
        if (rows.length === 0) return []

        const toleranceMs = 90 * 1000
        const staleAlertIds: string[] = []
        const validAlerts = rows.filter((alert: any) => {
            const meeting = alert?.meetings
            if (!meeting?.id || !meeting?.start_time) {
                staleAlertIds.push(String(alert?.id || ''))
                return false
            }

            const meetingStatus = String(meeting?.meeting_status || '').trim().toLowerCase()
            const status = String(meeting?.status || '').trim().toLowerCase()
            const isMeetingStillScheduled = status === 'scheduled'
                && (meetingStatus === 'scheduled' || meetingStatus === 'pending_confirmation' || !meetingStatus)
            if (!isMeetingStillScheduled) {
                staleAlertIds.push(String(alert?.id || ''))
                return false
            }

            const meetingStartMs = new Date(String(meeting.start_time)).getTime()
            const alertTimeMs = new Date(String(alert?.alert_time || '')).getTime()
            if (!Number.isFinite(meetingStartMs) || !Number.isFinite(alertTimeMs)) {
                staleAlertIds.push(String(alert?.id || ''))
                return false
            }

            const alertType = String(alert?.alert_type || '').trim().toLowerCase()
            let expectedAlertMs: number | null = null
            if (alertType === '24h') expectedAlertMs = meetingStartMs - (24 * 60 * 60 * 1000)
            if (alertType === '2h') expectedAlertMs = meetingStartMs - (2 * 60 * 60 * 1000)
            if (alertType === '15min') expectedAlertMs = meetingStartMs - (15 * 60 * 1000)
            if (alertType === '5min') expectedAlertMs = meetingStartMs - (5 * 60 * 1000)

            if (expectedAlertMs !== null) {
                const isMismatched = Math.abs(alertTimeMs - expectedAlertMs) > toleranceMs
                if (isMismatched) {
                    staleAlertIds.push(String(alert?.id || ''))
                    return false
                }
            }

            // Defensive: if meeting moved to future and this alert is now stale-due, ignore it.
            if (meetingStartMs > nowMs && alertType !== 'overdue' && alertTimeMs > meetingStartMs) {
                staleAlertIds.push(String(alert?.id || ''))
                return false
            }

            return true
        })

        const uniqueStaleIds = Array.from(new Set(staleAlertIds.filter(Boolean)))
        if (uniqueStaleIds.length > 0) {
            const { error: staleDismissError } = await (supabase
                .from('meeting_alerts') as any)
                .update({
                    dismissed: true,
                    dismissed_at: nowIso
                })
                .eq('user_id', userId)
                .in('id', uniqueStaleIds)

            if (staleDismissError) {
                console.warn('Could not dismiss stale meeting alerts:', staleDismissError)
            }
        }

        return validAlerts
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

export interface GetUpcomingMeetingsOptions {
    includeHistorical?: boolean
    includeCancelled?: boolean
}

export function calculateMeetingUrgency(startTimeStr: string, durationMinutes: number = 60, now: Date = new Date()): { level: MeetingWithUrgency['urgencyLevel']; hoursUntil: number } {
    const startTime = new Date(startTimeStr)
    const hoursUntil = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60)
    const durationMs = durationMinutes * 60 * 1000
    const endTime = new Date(startTime.getTime() + durationMs)
    const isSameLocalCalendarDay = startTime.getFullYear() === now.getFullYear()
        && startTime.getMonth() === now.getMonth()
        && startTime.getDate() === now.getDate()

    let level: MeetingWithUrgency['urgencyLevel']

    if (now >= startTime && now <= endTime) {
        level = 'in_progress'
    } else if (hoursUntil < 0) {
        level = 'overdue'
    } else if (hoursUntil < 2) {
        level = 'urgent'
    } else if (isSameLocalCalendarDay) {
        level = 'today'
    } else if (hoursUntil < 48) {
        level = 'soon'
    } else {
        level = 'scheduled'
    }

    return { level, hoursUntil }
}

export async function getUpcomingMeetings(
    userId: string,
    limit: number = 10,
    allMeetings: boolean = false,
    userEmail?: string,
    userUsername?: string | null,
    options?: GetUpcomingMeetingsOptions
): Promise<MeetingWithUrgency[]> {
    try {
        const includeHistorical = Boolean(options?.includeHistorical)
        const includeCancelled = Boolean(options?.includeCancelled)

        const applyVisibilityFilters = (query: any) => {
            if (allMeetings) return query
            const normalizedEmail = String(userEmail || '').trim().toLowerCase()
            const normalizedUsername = String(userUsername || '').trim().toLowerCase()
            const normalizedUserId = String(userId || '').trim().toLowerCase()
            const attendeeFilters = [
                normalizedEmail,
                normalizedUsername,
                normalizedUserId
            ]
                .filter(Boolean)
                .map((value) => String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"'))
                .map((value) => `attendees.cs.{"${value}"}`)

            if (attendeeFilters.length > 0) {
                return query.or([`seller_id.eq.${userId}`, ...attendeeFilters].join(','))
            } else {
                return query.eq('seller_id', userId)
            }
        }

        let meetings: any[] = []

        if (includeHistorical) {
            const pageSize = 500
            let offset = 0

            while (meetings.length < limit) {
                const remaining = limit - meetings.length
                const currentPageSize = Math.min(pageSize, remaining)

                let pageQuery = applyVisibilityFilters(supabase.from('meetings').select('*'))
                if (!includeCancelled) {
                    pageQuery = pageQuery
                        .neq('status', 'cancelled')
                        .neq('meeting_status', 'cancelled')
                }

                const { data, error } = await pageQuery
                    .order('start_time', { ascending: false })
                    .range(offset, offset + currentPageSize - 1)

                if (error) return []
                const rows = Array.isArray(data) ? data : []
                if (rows.length === 0) break

                meetings.push(...rows)
                if (rows.length < currentPageSize) break
                offset += currentPageSize
            }
        } else {
            const query = applyVisibilityFilters(supabase.from('meetings').select('*'))
            const { data, error } = await query
                .eq('status', 'scheduled')
                .order('start_time', { ascending: true })
                .limit(limit * 2)

            if (error) return []
            meetings = Array.isArray(data) ? data : []
        }

        const filteredMeetings = meetings
            .filter((meeting: any) => {
                const status = String(meeting?.status || '').trim().toLowerCase()
                const meetingStatus = String(meeting?.meeting_status || '').trim().toLowerCase()

                if (!includeCancelled && (status === 'cancelled' || meetingStatus === 'cancelled')) {
                    return false
                }

                if (includeHistorical) {
                    return status === 'scheduled'
                        || status === 'completed'
                        || meetingStatus === 'scheduled'
                        || meetingStatus === 'pending_confirmation'
                        || meetingStatus === 'held'
                        || meetingStatus === 'not_held'
                }

                return meetingStatus === 'scheduled' || meetingStatus === 'pending_confirmation'
            })
            .slice(0, limit)

        if (filteredMeetings.length === 0) return []

        const leadIds = Array.from(new Set(
            filteredMeetings
                .map((meeting: any) => meeting.lead_id)
                .filter((leadId: any) => leadId !== null && leadId !== undefined)
        ))

        let clientsMap: Record<string, any> = {}
        if (leadIds.length > 0) {
            const { data: clients } = await supabase.from('clientes').select('id, empresa, etapa').in('id', leadIds)
            clientsMap = (clients || []).reduce((acc: any, client: any) => {
                acc[client.id] = client
                return acc
            }, {})
        }

        let sellersMap: Record<string, string> = {}
        const sellerIds = Array.from(new Set(filteredMeetings.map((m: any) => m.seller_id).filter(Boolean)))
        if (sellerIds.length > 0) {
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
