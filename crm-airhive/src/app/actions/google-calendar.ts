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

        return { success: true, eventId: data.id }
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
