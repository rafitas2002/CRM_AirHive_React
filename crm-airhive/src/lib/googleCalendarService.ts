/**
 * Google Workspace Calendar Integration Service
 * 
 * This service handles OAuth authentication and calendar operations
 * for @airhivemx.com Google Workspace accounts.
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
 */
const GOOGLE_CONFIG = {
    clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || '',
    scopes: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/gmail.send',
        'openid',
        'email'
    ]
}

/**
 * Generate Google OAuth URL for user authorization
 */
export function getGoogleAuthUrl(): string {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    const redirectUri = process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI ||
        (typeof window !== 'undefined' ? `${window.location.origin}/api/auth/google/callback` : '')

    if (!clientId) {
        console.error('❌ NEXT_PUBLIC_GOOGLE_CLIENT_ID is missing!')
    }

    const params = new URLSearchParams({
        client_id: clientId || '',
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: GOOGLE_CONFIG.scopes.join(' '),
        access_type: 'offline',
        prompt: 'select_account consent'
    })

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(code: string, redirectUriOverride?: string): Promise<{
    access_token: string
    refresh_token: string
    expires_in: number
}> {
    const redirectUri = redirectUriOverride || GOOGLE_CONFIG.redirectUri

    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            code,
            client_id: GOOGLE_CONFIG.clientId,
            client_secret: GOOGLE_CONFIG.clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code'
        })
    })

    if (!response.ok) {
        const error = await response.json()
        console.error('Token exchange failed:', error)
        throw new Error(`Failed to exchange code for token: ${error.error_description || error.error}`)
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
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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
    return data.id
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

    if (meeting.title) updates.summary = meeting.title
    if (meeting.notes !== undefined) updates.description = `Reunión para lead: ${leadName}\n\n${meeting.notes || ''}`
    if (meeting.start_time) {
        const endTime = new Date(meeting.start_time)
        endTime.setMinutes(endTime.getMinutes() + (meeting.duration_minutes || 60))
        updates.start = { dateTime: meeting.start_time, timeZone: 'America/Mexico_City' }
        updates.end = { dateTime: endTime.toISOString(), timeZone: 'America/Mexico_City' }
    }
    if (meeting.attendees) updates.attendees = meeting.attendees.map(email => ({ email }))

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

    if (!response.ok) throw new Error('Failed to update calendar event')
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
            headers: { 'Authorization': `Bearer ${accessToken}` }
        }
    )

    if (!response.ok) throw new Error('Failed to delete calendar event')
}

/**
 * Helper: Store user's Google tokens in Supabase
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

    let email = null
    try {
        const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { 'Authorization': `Bearer ${tokens.access_token}` }
        })
        if (response.ok) {
            const data = await response.json()
            email = data.email
        }
    } catch (e) {
        console.warn('Could not fetch Google user email:', e)
    }

    const { error } = await supabase
        .from('user_calendar_tokens')
        .upsert({
            user_id: userId,
            provider: 'google',
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_at: expiresAt.toISOString(),
            email: email
        })

    if (error) throw error
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

    if (!data) return null

    const expiresAt = new Date(data.expires_at)
    const now = new Date()

    if (now >= expiresAt) {
        const newTokens = await refreshAccessToken(data.refresh_token)
        await storeUserTokens(supabase, userId, {
            ...newTokens,
            refresh_token: data.refresh_token
        })
        return newTokens.access_token
    }

    return data.access_token
}
