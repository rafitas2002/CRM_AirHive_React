'use server'

import { createAdminClient } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'

export type EventType =
    | 'login' | 'logout' | 'session_start' | 'session_end'
    | 'lead_created' | 'lead_updated' | 'lead_stage_change' | 'lead_assigned' | 'lead_closed'
    | 'meeting_scheduled' | 'meeting_started' | 'meeting_finished' | 'meeting_no_show' | 'meeting_rescheduled'
    | 'call_started' | 'call_finished'
    | 'forecast_registered' | 'forecast_frozen'

export interface TrackEventParams {
    eventType: EventType
    entityType?: 'user' | 'lead' | 'meeting' | 'call' | 'forecast'
    entityId?: string | number
    metadata?: Record<string, any>
    userId?: string
}

/**
 * Centrally records a CRM event for analytics and observability.
 * Designed to be non-intrusive: errors in logging won't stop the main operation.
 */
export async function trackEvent({ eventType, entityType, entityId, metadata = {}, userId }: TrackEventParams) {
    try {
        const adminClient = createAdminClient()

        // If userId is not provided, try to get it from the current session
        let finalUserId = userId
        if (!finalUserId) {
            const cookieStore = await cookies()
            const supabase = createClient(cookieStore)
            const { data: { user } } = await supabase.auth.getUser()
            finalUserId = user?.id
        }

        const { error } = await (adminClient
            .from('crm_events') as any)
            .insert({
                event_type: eventType,
                user_id: finalUserId,
                entity_type: entityType,
                entity_id: entityId?.toString(),
                metadata: {
                    ...metadata,
                    _tracked_at: new Date().toISOString()
                }
            })

        if (error) {
            console.error(`[EventTracking] Error inserting event ${eventType}:`, error)
            return { success: false, error: error.message }
        }

        return { success: true }
    } catch (err: any) {
        // We log the error but don't THROW it to keep tracking non-intrusive
        console.error(`[EventTracking] Exception in trackEvent for ${eventType}:`, err)
        return { success: false, error: err.message }
    }
}
