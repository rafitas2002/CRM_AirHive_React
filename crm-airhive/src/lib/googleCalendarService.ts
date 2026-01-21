/**
 * Google Workspace Calendar Integration Service
 * 
 * This service handles OAuth authentication and calendar operations
 * for @airhivemx.com Google Workspace accounts.
 * 
 * Setup Instructions:
 * 1. Go to Google Cloud Console (https://console.cloud.google.com)
 * 2. Create a new project or select existing one
 * 3. Enable Google Calendar API
 * 4. Create OAuth 2.0 credentials (Web application)
 * 5. Add authorized redirect URIs (e.g., http://localhost:3000/api/auth/google/callback)
 * 6. Add environment variables to .env.local
 */

import { Database } from './supabase'

type Meeting = Database['public']['Tables']['meetings']['Row']
type MeetingInsert = Database['public']['Tables']['meetings']['Insert']

// Google Calendar API types
interface GoogleCalendarEvent {
    id?: string
    summary: string
    description?: string
    start: {
        dateTime: string
        timeZone: string
    }
    end: {
        dateTime: string
        timeZone: string
    }
    attendees?: Array<{ email: string }>
    conferenceData?: {
        createRequest?: {
            requestId: string
            conferenceSolutionKey: {
                type: 'hangoutsMeet'
            }
        }
    }
}

/**
 * Configuration for Google OAuth
 * Add these to your .env.local:
 * 
 * NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_client_id_here
 * GOOGLE_CLIENT_SECRET=your_client_secret_here
 * GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
 */
const GOOGLE_CONFIG = {
    clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || '',
    scopes: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events'
    ]
}

/**
 * Generate Google OAuth URL for user authorization
 * This should be called when user clicks "Connect Google Calendar"
 */
export function getGoogleAuthUrl(): string {
    const params = new URLSearchParams({
        client_id: GOOGLE_CONFIG.clientId,
        redirect_uri: GOOGLE_CONFIG.redirectUri,
        response_type: 'code',
        scope: GOOGLE_CONFIG.scopes.join(' '),
        access_type: 'offline',
        prompt: 'consent',
        // Restrict to @airhivemx.com domain
        hd: 'airhivemx.com'
    })

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

/**
 * Exchange authorization code for access token
 * This should be called in your API route after OAuth redirect
 */
export async function exchangeCodeForToken(code: string): Promise<{
    access_token: string
    refresh_token: string
    expires_in: number
}> {
    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            code,
            client_id: GOOGLE_CONFIG.clientId,
            client_secret: GOOGLE_CONFIG.clientSecret,
            redirect_uri: GOOGLE_CONFIG.redirectUri,
            grant_type: 'authorization_code'
        })
    })

    if (!response.ok) {
        throw new Error('Failed to exchange code for token')
    }

    return await response.json()
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
    access_token: string
    expires_in: number
}> {
    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            refresh_token: refreshToken,
            client_id: GOOGLE_CONFIG.clientId,
            client_secret: GOOGLE_CONFIG.clientSecret,
            grant_type: 'refresh_token'
        })
    })

    if (!response.ok) {
        throw new Error('Failed to refresh access token')
    }

    return await response.json()
}

/**
 * Create a calendar event in Google Calendar
 */
export async function createGoogleCalendarEvent(
    accessToken: string,
    meeting: MeetingInsert,
    leadName: string
): Promise<string> {
    const endTime = new Date(meeting.start_time)
    endTime.setMinutes(endTime.getMinutes() + meeting.duration_minutes!)

    const event: GoogleCalendarEvent = {
        summary: meeting.title,
        description: `Reunión para lead: ${leadName}\n\n${meeting.notes || ''}`,
        start: {
            dateTime: meeting.start_time,
            timeZone: 'America/Mexico_City'
        },
        end: {
            dateTime: endTime.toISOString(),
            timeZone: 'America/Mexico_City'
        },
        attendees: meeting.attendees?.map(email => ({ email })),
        // Add Google Meet link for video meetings
        ...(meeting.meeting_type === 'video' && {
            conferenceData: {
                createRequest: {
                    requestId: `meet-${Date.now()}`,
                    conferenceSolutionKey: {
                        type: 'hangoutsMeet'
                    }
                }
            }
        })
    }

    const response = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1',
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(event)
        }
    )

    if (!response.ok) {
        const error = await response.json()
        console.error('Google Calendar API error:', error)
        throw new Error('Failed to create calendar event')
    }

    const data = await response.json()
    return data.id // Return Google Calendar event ID
}

/**
 * Update an existing calendar event
 */
export async function updateGoogleCalendarEvent(
    accessToken: string,
    eventId: string,
    meeting: Partial<MeetingInsert>,
    leadName: string
): Promise<void> {
    const updates: Partial<GoogleCalendarEvent> = {}

    if (meeting.title) {
        updates.summary = meeting.title
    }

    if (meeting.notes !== undefined) {
        updates.description = `Reunión para lead: ${leadName}\n\n${meeting.notes || ''}`
    }

    if (meeting.start_time) {
        const endTime = new Date(meeting.start_time)
        endTime.setMinutes(endTime.getMinutes() + (meeting.duration_minutes || 60))

        updates.start = {
            dateTime: meeting.start_time,
            timeZone: 'America/Mexico_City'
        }
        updates.end = {
            dateTime: endTime.toISOString(),
            timeZone: 'America/Mexico_City'
        }
    }

    if (meeting.attendees) {
        updates.attendees = meeting.attendees.map(email => ({ email }))
    }

    const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
        {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updates)
        }
    )

    if (!response.ok) {
        throw new Error('Failed to update calendar event')
    }
}

/**
 * Delete a calendar event
 */
export async function deleteGoogleCalendarEvent(
    accessToken: string,
    eventId: string
): Promise<void> {
    const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
        {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        }
    )

    if (!response.ok) {
        throw new Error('Failed to delete calendar event')
    }
}

/**
 * Helper: Store user's Google tokens in Supabase
 * You'll need to create a table for this:
 * 
 * CREATE TABLE user_calendar_tokens (
 *   user_id UUID PRIMARY KEY REFERENCES auth.users(id),
 *   provider VARCHAR(50) NOT NULL,
 *   access_token TEXT NOT NULL,
 *   refresh_token TEXT NOT NULL,
 *   expires_at TIMESTAMPTZ NOT NULL,
 *   created_at TIMESTAMPTZ DEFAULT NOW(),
 *   updated_at TIMESTAMPTZ DEFAULT NOW()
 * );
 */
export async function storeUserTokens(
    supabase: any,
    userId: string,
    tokens: {
        access_token: string
        refresh_token: string
        expires_in: number
    }
): Promise<void> {
    const expiresAt = new Date()
    expiresAt.setSeconds(expiresAt.getSeconds() + tokens.expires_in)

    await supabase
        .from('user_calendar_tokens')
        .upsert({
            user_id: userId,
            provider: 'google',
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_at: expiresAt.toISOString()
        })
}

/**
 * Helper: Get user's valid access token (refresh if needed)
 */
export async function getUserAccessToken(
    supabase: any,
    userId: string
): Promise<string | null> {
    const { data } = await supabase
        .from('user_calendar_tokens')
        .select('*')
        .eq('user_id', userId)
        .eq('provider', 'google')
        .single()

    if (!data) {
        return null
    }

    // Check if token is expired
    const expiresAt = new Date(data.expires_at)
    const now = new Date()

    if (now >= expiresAt) {
        // Token expired, refresh it
        const newTokens = await refreshAccessToken(data.refresh_token)

        // Update stored tokens
        await storeUserTokens(supabase, userId, {
            ...newTokens,
            refresh_token: data.refresh_token // Keep same refresh token
        })

        return newTokens.access_token
    }

    return data.access_token
}
