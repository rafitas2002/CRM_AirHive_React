'use server'

import { getValidAccessToken } from '@/lib/google-utils'

export async function createGoogleEventAction(meeting: any, leadName: string) {
    try {
        const accessToken = await getValidAccessToken(meeting.seller_id)
        if (!accessToken) throw new Error('No Google connection found')

        const event = {
            summary: meeting.title,
            description: `Lead: ${leadName}\nNotas: ${meeting.notes || ''}`,
            start: {
                dateTime: meeting.start_time,
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            },
            end: {
                dateTime: new Date(new Date(meeting.start_time).getTime() + meeting.duration_minutes * 60000).toISOString(),
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            },
            attendees: meeting.attendees?.map((email: string) => ({ email })),
            conferenceData: meeting.meeting_type === 'video' ? {
                createRequest: { requestId: Math.random().toString(36).substring(7) },
            } : undefined,
        }

        const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(event),
        })

        const data = await response.json()
        if (!response.ok) {
            console.error('Google API Error:', data)
            throw new Error(data.error?.message || 'Error creating Google event')
        }

        return {
            success: true,
            eventId: data.id,
            hangoutLink: data.hangoutLink
        }
    } catch (error: any) {
        console.error('Create Google Event Error:', error)
        return { success: false, error: error.message }
    }
}

export async function updateGoogleEventAction(eventId: string, meeting: any, leadName: string) {
    try {
        const accessToken = await getValidAccessToken(meeting.seller_id)
        if (!accessToken) throw new Error('No Google connection found')

        const event = {
            summary: meeting.title,
            description: `Lead: ${leadName}\nNotas: ${meeting.notes || ''}`,
            start: {
                dateTime: meeting.start_time,
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            },
            end: {
                dateTime: new Date(new Date(meeting.start_time).getTime() + meeting.duration_minutes * 60000).toISOString(),
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            },
            attendees: meeting.attendees?.map((email: string) => ({ email })),
        }

        const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(event),
        })

        const data = await response.json()
        if (!response.ok) {
            console.error('Google API Error:', data)
            throw new Error(data.error?.message || 'Error updating Google event')
        }

        return { success: true }
    } catch (error: any) {
        console.error('Update Google Event Error:', error)
        return { success: false, error: error.message }
    }
}

export async function deleteGoogleEventAction(eventId: string, sellerId: string) {
    try {
        const accessToken = await getValidAccessToken(sellerId)
        if (!accessToken) throw new Error('No Google connection found')

        const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        })

        if (!response.ok && response.status !== 404) {
            const data = await response.json()
            throw new Error(data.error?.message || 'Error deleting Google event')
        }

        return { success: true }
    } catch (error: any) {
        console.error('Delete Google Event Error:', error)
        return { success: false, error: error.message }
    }
}

/**
 * Syncs recent changes from Google Calendar back to the CRM.
 * Useful for catching edits made directly on the Google Calendar UI.
 */
export async function syncGoogleEventsAction(userId: string) {
    try {
        const accessToken = await getValidAccessToken(userId)
        if (!accessToken) return { success: false, error: 'No Google connection' }

        // Fetch events updated in the last 24 hours to be safe
        const updatedMin = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

        const response = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events?updatedMin=${encodeURIComponent(updatedMin)}&showDeleted=false&singleEvents=true`,
            {
                headers: { Authorization: `Bearer ${accessToken}` }
            }
        )

        if (!response.ok) {
            const errData = await response.json()
            throw new Error(errData.error?.message || 'Failed to fetch updated events')
        }

        const data = await response.json()
        const events = data.items || []

        if (events.length === 0) {
            return { success: true, updatedCount: 0 }
        }

        // We need to update the DB, so we'll need a supabase client
        // Since this is a server action, imported from @/lib/supabase-server
        const { createClient } = await import('@/lib/supabase-server')
        const { cookies } = await import('next/headers')
        const { updateLeadNextMeeting } = await import('@/lib/meetingsService')

        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)

        let updatedCount = 0

        for (const event of events) {
            const googleId = event.id
            const googleTitle = event.summary
            const googleStart = event.start?.dateTime || event.start?.date
            const googleEnd = event.end?.dateTime || event.end?.date

            if (!googleStart || !googleEnd) continue

            // Calculate duration in minutes
            const startType = new Date(googleStart).getTime()
            const endType = new Date(googleEnd).getTime()
            const durationMinutes = Math.round((endType - startType) / 60000)

            // Find matching meeting in CRM
            const { data: meeting, error: fetchError } = await (supabase
                .from('meetings') as any)
                .select('id, title, start_time, duration_minutes, lead_id')
                .eq('calendar_event_id', googleId)
                .single()

            if (fetchError || !meeting) continue

            // Check if there are changes
            const hasChanges =
                meeting.title !== googleTitle ||
                new Date(meeting.start_time).getTime() !== startType ||
                meeting.duration_minutes !== durationMinutes

            if (hasChanges) {
                console.log(`📝 Syncing changes for meeting: ${meeting.id} (${googleTitle})`)

                const { error: updateError } = await (supabase
                    .from('meetings') as any)
                    .update({
                        title: googleTitle,
                        start_time: new Date(startType).toISOString(),
                        duration_minutes: durationMinutes,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', meeting.id)

                if (!updateError) {
                    updatedCount++
                    // Also update the lead's next meeting link just in case
                    await updateLeadNextMeeting(meeting.lead_id)
                } else {
                    console.error(`❌ Failed to update meeting ${meeting.id}:`, updateError)
                }
            }
        }

        return { success: true, updatedCount }
    } catch (error: any) {
        console.error('Sync Google Events Error:', error)
        return { success: false, error: error.message }
    }
}
