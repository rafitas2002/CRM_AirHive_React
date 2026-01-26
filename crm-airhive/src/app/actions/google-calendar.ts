'use server'

import { createClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

// Types needed for actions
import { Database } from '@/lib/supabase'
type MeetingInsert = Database['public']['Tables']['meetings']['Insert']
type UserCalendarToken = Database['public']['Tables']['user_calendar_tokens']['Row']

const GOOGLE_CONFIG = {
    clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI || '' // Fallback, usually overridden
}

// Helper: Refresh Token Logic (Server Side Only)
async function refreshAccessToken(refreshToken: string) {
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

// Action: Exchange Auth Code for Tokens
export async function exchangeCodeForTokenAction(code: string, redirectUri: string) {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)

    // 1. Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
        throw new Error('Unauthorized')
    }

    try {
        // 2. Exchange code with Google
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
            const errorBody = await response.json()
            console.error('Google Graph API Error:', errorBody)
            throw new Error(`Failed to exchange token: ${errorBody.error_description || 'Unknown error'}`)
        }

        const tokens = await response.json()

        // 3. Get User Email
        const infoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { 'Authorization': `Bearer ${tokens.access_token}` }
        })

        let email = null
        if (infoResponse.ok) {
            const info = await infoResponse.json()
            email = info.email
        }

        // 4. Calculate Expiry
        const expiresAt = new Date()
        expiresAt.setSeconds(expiresAt.getSeconds() + tokens.expires_in)

        // 5. Save to Supabase
        const { error: dbError } = await supabase
            .from('user_calendar_tokens')
            .upsert({
                user_id: user.id,
                provider: 'google',
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token, // Important: Google only returns this on first consent!
                expires_at: expiresAt.toISOString(),
                email: email
            } as any)

        if (dbError) throw dbError

        revalidatePath('/settings/cuentas')
        return { success: true }

    } catch (error: any) {
        console.error('exchangeCodeForTokenAction Error:', error)
        return { success: false, error: error.message }
    }
}

// Helper: Get Valid Token (Refresh if needed)
async function getValidAccessToken(supabase: any, userId: string) {
    const response = await supabase
        .from('user_calendar_tokens')
        .select('*')
        .eq('user_id', userId)
        .eq('provider', 'google')
        .single()

    const data = response.data as UserCalendarToken | null

    if (!data) throw new Error('No Google account connected')

    const expiresAt = new Date(data.expires_at)
    const now = new Date()

    // Add 5 min buffer
    if (now.getTime() + 5 * 60000 >= expiresAt.getTime()) {
        console.log('Refreshing Google Token...')
        const newTokens = await refreshAccessToken(data.refresh_token)

        const newExpiresAt = new Date()
        newExpiresAt.setSeconds(newExpiresAt.getSeconds() + newTokens.expires_in)

        await supabase
            .from('user_calendar_tokens')
            .update({
                access_token: newTokens.access_token,
                expires_at: newExpiresAt.toISOString()
            })
            .eq('user_id', userId)
            .eq('provider', 'google')

        return newTokens.access_token
    }

    return data.access_token
}

// Action: Create Google Calendar Event
export async function createGoogleEventAction(meeting: MeetingInsert, leadName: string) {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    try {
        const accessToken = await getValidAccessToken(supabase, user.id)

        const endTime = new Date(meeting.start_time)
        endTime.setMinutes(endTime.getMinutes() + (meeting.duration_minutes || 60))

        const eventBody: any = {
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
        }

        if (meeting.meeting_type === 'video') {
            eventBody.conferenceData = {
                createRequest: {
                    requestId: `meet-${Date.now()}`,
                    conferenceSolutionKey: { type: 'hangoutsMeet' }
                }
            }
        }

        const response = await fetch(
            'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1',
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(eventBody)
            }
        )

        if (!response.ok) {
            const error = await response.json()
            console.error('Google API Error:', error)
            throw new Error('Failed to create event in Google Calendar')
        }

        const data = await response.json()
        return { success: true, eventId: data.id }

    } catch (error: any) {
        console.error('createGoogleEventAction Error:', error)
        return { success: false, error: error.message }
    }
}

// Action: Update Google Calendar Event
export async function updateGoogleEventAction(eventId: string, meeting: Partial<MeetingInsert>, leadName: string) {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    try {
        const accessToken = await getValidAccessToken(supabase, user.id)

        const updates: any = {}
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

        if (!response.ok) throw new Error('Failed to update event in Google Calendar')

        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

// Action: Delete Google Calendar Event
export async function deleteGoogleEventAction(eventId: string) {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    try {
        const accessToken = await getValidAccessToken(supabase, user.id)

        const response = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
            {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${accessToken}` }
            }
        )

        if (!response.ok && response.status !== 404) { // Ignore 404 if already deleted
            throw new Error('Failed to delete event in Google Calendar')
        }

        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

// Action: Check Status (useful for UI to re-verify if needed)
export async function checkGoogleConnectionAction() {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { connected: false }

    const response = await supabase
        .from('user_calendar_tokens')
        .select('email, created_at')
        .eq('user_id', user.id)
        .eq('provider', 'google')
        .single()

    const data = response.data as { email: string | null, created_at: string } | null

    return {
        connected: !!data,
        email: data?.email,
        lastSync: data?.created_at
    }
}
