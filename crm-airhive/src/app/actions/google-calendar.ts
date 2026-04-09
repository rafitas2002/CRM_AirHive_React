'use server'

import { getValidAccessToken } from '@/lib/google-utils'

function isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function extractEmailFromParticipantLabel(label: string): string | null {
    const trimmed = String(label || '').trim()
    if (!trimmed) return null

    const angled = /<([^<>@\s]+@[^<>@\s]+\.[^<>@\s]+)>/.exec(trimmed)
    if (angled?.[1] && isValidEmail(angled[1])) return angled[1].trim()
    if (isValidEmail(trimmed)) return trimmed

    return null
}

function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim())
}

function isLikelyUsername(value: string) {
    return /^[a-zA-Z0-9._-]+$/.test(String(value || '').trim())
}

function deriveEmailFromUsername(username: string): string | null {
    const normalized = String(username || '').trim().toLowerCase()
    if (!normalized || !isLikelyUsername(normalized)) return null
    const domain = String(process.env.NEXT_PUBLIC_AUTH_DOMAIN || process.env.AUTH_DOMAIN || 'airhivemx.com').trim().toLowerCase()
    const email = `${normalized}@${domain}`
    return isValidEmail(email) ? email : null
}

async function resolveInternalAttendeeEmails(rawAttendees: string[]): Promise<string[]> {
    const normalized = Array.from(new Set(
        (rawAttendees || [])
            .map((value) => String(value || '').trim())
            .filter(Boolean)
    ))

    if (normalized.length === 0) return []

    const directEmails = normalized
        .map((value) => value.toLowerCase())
        .filter((value) => isValidEmail(value))

    const unresolved = normalized.filter((value) => !isValidEmail(value))
    if (unresolved.length === 0) return Array.from(new Set(directEmails))

    const usernameCandidates = Array.from(new Set(
        unresolved
            .filter((value) => !isUuid(value))
            .map((value) => value.toLowerCase())
            .filter((value) => isLikelyUsername(value))
    ))
    const userIdCandidates = Array.from(new Set(
        unresolved
            .filter((value) => isUuid(value))
            .map((value) => value.toLowerCase())
    ))

    let profileRows: Array<{ id: string; username: string | null }> = []
    let integrationRows: Array<{ user_id: string; email: string }> = []

    try {
        const { createClient } = await import('@/lib/supabase-server')
        const { cookies } = await import('next/headers')
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)

        const [profilesByUsernameResult, profilesByIdResult] = await Promise.all([
            usernameCandidates.length > 0
                ? (supabase
                    .from('profiles') as any)
                    .select('id, username')
                    .in('username', usernameCandidates)
                : Promise.resolve({ data: [], error: null }),
            userIdCandidates.length > 0
                ? (supabase
                    .from('profiles') as any)
                    .select('id, username')
                    .in('id', userIdCandidates)
                : Promise.resolve({ data: [], error: null })
        ])

        const profilesCombined = [
            ...((profilesByUsernameResult?.data || []) as Array<{ id: string; username: string | null }>),
            ...((profilesByIdResult?.data || []) as Array<{ id: string; username: string | null }>)
        ]

        const profileById = new Map<string, { id: string; username: string | null }>()
        for (const row of profilesCombined) {
            const id = String(row?.id || '').trim().toLowerCase()
            if (!id) continue
            profileById.set(id, { id, username: row?.username || null })
        }
        profileRows = Array.from(profileById.values())

        const profileIds = profileRows.map((row) => row.id)
        if (profileIds.length > 0) {
            const { data: integrations } = await supabase
                .from('google_integrations')
                .select('user_id, email')
                .in('user_id', profileIds)

            integrationRows = ((integrations || []) as Array<{ user_id: string; email: string }>)
                .map((row) => ({
                    user_id: String(row?.user_id || '').trim().toLowerCase(),
                    email: String(row?.email || '').trim().toLowerCase()
                }))
                .filter((row) => Boolean(row.user_id) && isValidEmail(row.email))
        }
    } catch (error) {
        console.warn('Could not resolve attendee emails from profiles/google_integrations:', error)
    }

    const profileByUsername = new Map<string, { id: string; username: string | null }>()
    for (const profile of profileRows) {
        const username = String(profile.username || '').trim().toLowerCase()
        if (username) profileByUsername.set(username, profile)
    }
    const integrationByUserId = new Map(
        integrationRows.map((row) => [row.user_id, row.email])
    )

    const resolvedFromIdentifiers = unresolved
        .map((identifier) => {
            const normalizedIdentifier = String(identifier || '').trim().toLowerCase()
            if (!normalizedIdentifier) return null

            if (isUuid(normalizedIdentifier)) {
                const mappedEmail = integrationByUserId.get(normalizedIdentifier)
                if (mappedEmail && isValidEmail(mappedEmail)) return mappedEmail

                const profile = profileRows.find((row) => row.id === normalizedIdentifier)
                const username = String(profile?.username || '').trim().toLowerCase()
                if (isValidEmail(username)) return username
                return deriveEmailFromUsername(username)
            }

            const profile = profileByUsername.get(normalizedIdentifier)
            if (profile) {
                const integrationEmail = integrationByUserId.get(profile.id)
                if (integrationEmail && isValidEmail(integrationEmail)) return integrationEmail
            }

            if (isValidEmail(normalizedIdentifier)) return normalizedIdentifier
            return deriveEmailFromUsername(normalizedIdentifier)
        })
        .filter((value): value is string => typeof value === 'string' && isValidEmail(value))

    return Array.from(new Set([...directEmails, ...resolvedFromIdentifiers]))
}

async function collectInviteEmails(meeting: any): Promise<string[]> {
    const rawInternal = Array.isArray(meeting?.attendees)
        ? meeting.attendees.map((value: any) => String(value || '').trim()).filter(Boolean)
        : []
    const internal = await resolveInternalAttendeeEmails(rawInternal)

    const external = Array.isArray(meeting?.external_participants)
        ? meeting.external_participants
            .map((value: any) => extractEmailFromParticipantLabel(String(value || '')))
            .filter((value: string | null): value is string => !!value)
        : []

    return Array.from(new Set(
        [...internal, ...external.map((value: string) => String(value || '').trim().toLowerCase())]
            .filter((value) => isValidEmail(value))
    ))
}

function buildParticipantsDescription(meeting: any): string {
    const sections: string[] = []
    const primary = String(meeting?.primary_company_contact_name || '').trim()
    const external = Array.isArray(meeting?.external_participants)
        ? meeting.external_participants.map((value: any) => String(value || '').trim()).filter(Boolean)
        : []

    if (primary) sections.push(`Contacto principal: ${primary}`)
    if (external.length > 0) sections.push(`Participantes externos: ${external.join(', ')}`)

    return sections.join('\n')
}

type GoogleCalendarApiEvent = {
    id?: string
    status?: string
    summary?: string
    description?: string
    location?: string
    htmlLink?: string
    hangoutLink?: string
    updated?: string
    start?: { dateTime?: string; date?: string; timeZone?: string }
    end?: { dateTime?: string; date?: string; timeZone?: string }
    attendees?: Array<{
        email?: string
        displayName?: string
        responseStatus?: string
        optional?: boolean
        organizer?: boolean
        self?: boolean
    }>
    organizer?: { email?: string; displayName?: string }
    creator?: { email?: string; displayName?: string }
    conferenceData?: {
        entryPoints?: Array<{
            entryPointType?: string
            uri?: string
        }>
    }
}

function normalizeGoogleEventTime(event: GoogleCalendarApiEvent): {
    startIso: string
    endIso: string
    isAllDay: boolean
} | null {
    const startRaw = event.start?.dateTime || event.start?.date || null
    const endRaw = event.end?.dateTime || event.end?.date || null
    if (!startRaw || !endRaw) return null

    const isAllDay = !event.start?.dateTime
    const startIso = isAllDay
        ? new Date(`${startRaw}T00:00:00`).toISOString()
        : new Date(startRaw).toISOString()
    const endIso = isAllDay
        ? new Date(`${endRaw}T00:00:00`).toISOString()
        : new Date(endRaw).toISOString()

    if (Number.isNaN(new Date(startIso).getTime()) || Number.isNaN(new Date(endIso).getTime())) {
        return null
    }

    return { startIso, endIso, isAllDay }
}

function extractGoogleMeetLink(event: GoogleCalendarApiEvent): string | null {
    if (event.hangoutLink) return event.hangoutLink
    const videoEntry = event.conferenceData?.entryPoints?.find(entry => entry.entryPointType === 'video' && entry.uri)
    return videoEntry?.uri || null
}

function parseGoogleEventAttendees(event: GoogleCalendarApiEvent): string[] {
    const attendees = Array.isArray(event.attendees) ? event.attendees : []
    return Array.from(new Set(
        attendees
            .map(attendee => String(attendee?.email || '').trim().toLowerCase())
            .filter(email => isValidEmail(email))
    ))
}

function inferMeetingTypeFromGoogleEvent(event: GoogleCalendarApiEvent): 'presencial' | 'llamada' | 'video' {
    if (extractGoogleMeetLink(event)) return 'video'
    if (String(event.location || '').trim()) return 'presencial'
    return 'llamada'
}

export async function createGoogleEventAction(meeting: any, leadName: string) {
    try {
        const accessToken = await getValidAccessToken(meeting.seller_id)
        if (!accessToken) throw new Error('No Google connection found')

        const inviteEmails = await collectInviteEmails(meeting)
        const participantsDescription = buildParticipantsDescription(meeting)
        const noteBlock = meeting.notes || ''

        const event = {
            summary: meeting.title,
            description: [
                `Lead: ${leadName}`,
                participantsDescription,
                `Notas: ${noteBlock}`
            ].filter(Boolean).join('\n'),
            start: {
                dateTime: meeting.start_time,
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            },
            end: {
                dateTime: new Date(new Date(meeting.start_time).getTime() + meeting.duration_minutes * 60000).toISOString(),
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            },
            attendees: inviteEmails.length > 0 ? inviteEmails.map((email: string) => ({ email })) : undefined,
            conferenceData: meeting.meeting_type === 'video' ? {
                createRequest: { requestId: Math.random().toString(36).substring(7) },
            } : undefined,
        }

        const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all', {
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

        const inviteEmails = await collectInviteEmails(meeting)
        const participantsDescription = buildParticipantsDescription(meeting)
        const noteBlock = meeting.notes || ''

        const event = {
            summary: meeting.title,
            description: [
                `Lead: ${leadName}`,
                participantsDescription,
                `Notas: ${noteBlock}`
            ].filter(Boolean).join('\n'),
            start: {
                dateTime: meeting.start_time,
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            },
            end: {
                dateTime: new Date(new Date(meeting.start_time).getTime() + meeting.duration_minutes * 60000).toISOString(),
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            },
            attendees: inviteEmails.length > 0 ? inviteEmails.map((email: string) => ({ email })) : undefined,
        }

        const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}?sendUpdates=all`, {
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

        // Pull enough history to capture edits made in Google Calendar UI.
        const updatedMin = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()

        const response = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events?updatedMin=${encodeURIComponent(updatedMin)}&showDeleted=true&singleEvents=true&maxResults=1000`,
            {
                headers: { Authorization: `Bearer ${accessToken}` }
            }
        )

        if (!response.ok) {
            const errData = await response.json()
            throw new Error(errData.error?.message || 'Failed to fetch updated events')
        }

        const data = await response.json() as { items?: GoogleCalendarApiEvent[] }
        const events = data.items || []

        if (events.length === 0) {
            return { success: true, updatedCount: 0, cancelledCount: 0, unlinkedCount: 0 }
        }

        const { createClient } = await import('@/lib/supabase-server')
        const { cookies } = await import('next/headers')
        const { updateLeadNextMeeting } = await import('@/lib/meetingsService')

        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)

        const googleEventIds = Array.from(new Set(
            events
                .map(event => String(event.id || '').trim())
                .filter(Boolean)
        ))

        if (googleEventIds.length === 0) {
            return { success: true, updatedCount: 0, cancelledCount: 0, unlinkedCount: 0 }
        }

        const { data: linkedMeetings } = await (supabase
            .from('meetings') as any)
            .select('id, lead_id, title, start_time, duration_minutes, meeting_status, status, meeting_type, attendees, notes, calendar_event_id')
            .eq('seller_id', userId)
            .in('meeting_status', ['scheduled', 'pending_confirmation', 'cancelled'])
            .in('calendar_event_id', googleEventIds)

        const meetingsByGoogleId = new Map<string, any>()
        for (const meeting of linkedMeetings || []) {
            const eventId = String(meeting?.calendar_event_id || '').trim()
            if (eventId) meetingsByGoogleId.set(eventId, meeting)
        }

        let updatedCount = 0
        let cancelledCount = 0
        let unlinkedCount = 0
        const affectedLeadIds = new Set<number>()

        for (const event of events) {
            const googleId = String(event.id || '').trim()
            if (!googleId) continue

            const meeting = meetingsByGoogleId.get(googleId)
            if (!meeting) {
                unlinkedCount++
                continue
            }

            if (event.status === 'cancelled') {
                if (meeting.status === 'cancelled' && meeting.meeting_status === 'cancelled') continue

                const { error: cancellationError } = await (supabase
                    .from('meetings') as any)
                    .update({
                        status: 'cancelled',
                        meeting_status: 'cancelled',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', meeting.id)

                if (!cancellationError) {
                    cancelledCount++
                    if (Number.isFinite(meeting.lead_id)) affectedLeadIds.add(Number(meeting.lead_id))
                } else {
                    console.error(`❌ Failed to cancel meeting ${meeting.id} from Google sync:`, cancellationError)
                }
                continue
            }

            const normalizedTime = normalizeGoogleEventTime(event)
            if (!normalizedTime || normalizedTime.isAllDay) continue

            const startMs = new Date(normalizedTime.startIso).getTime()
            const endMs = new Date(normalizedTime.endIso).getTime()
            if (endMs <= startMs) continue

            const durationMinutes = Math.max(15, Math.round((endMs - startMs) / 60000))
            const googleTitle = String(event.summary || '').trim() || meeting.title
            const googleAttendees = parseGoogleEventAttendees(event).sort()
            const previousAttendees = Array.isArray(meeting.attendees)
                ? meeting.attendees.map((value: unknown) => String(value || '').trim().toLowerCase()).filter(Boolean)
                    .sort()
                : []
            const meetLink = extractGoogleMeetLink(event)
            const previousMeetLink = String(meeting.notes || '').match(/\[MEET_LINK\]:(https:\/\/\S+)/)?.[1] || null

            const nextStatus = 'scheduled'
            const nextMeetingStatus = 'scheduled'
            const nextMeetingType = inferMeetingTypeFromGoogleEvent(event)
            const nextNotes = meetLink
                ? (() => {
                    const cleanNotes = String(meeting.notes || '')
                        .replace(/\n?\[MEET_LINK\]:https:\/\/\S+/g, '')
                        .trim()
                    return `${cleanNotes}\n[MEET_LINK]:${meetLink}`.trim()
                })()
                : meeting.notes

            const hasChanges =
                meeting.title !== googleTitle ||
                new Date(meeting.start_time).getTime() !== startMs ||
                Number(meeting.duration_minutes || 0) !== durationMinutes ||
                meeting.status !== nextStatus ||
                meeting.meeting_status !== nextMeetingStatus ||
                meeting.meeting_type !== nextMeetingType ||
                JSON.stringify(previousAttendees) !== JSON.stringify(googleAttendees) ||
                previousMeetLink !== meetLink

            if (!hasChanges) continue

            const { error: updateError } = await (supabase
                .from('meetings') as any)
                .update({
                    title: googleTitle,
                    start_time: normalizedTime.startIso,
                    duration_minutes: durationMinutes,
                    status: nextStatus,
                    meeting_status: nextMeetingStatus,
                    meeting_type: nextMeetingType,
                    attendees: googleAttendees,
                    notes: nextNotes,
                    updated_at: new Date().toISOString()
                })
                .eq('id', meeting.id)

            if (!updateError) {
                updatedCount++
                if (Number.isFinite(meeting.lead_id)) affectedLeadIds.add(Number(meeting.lead_id))
            } else {
                console.error(`❌ Failed to update meeting ${meeting.id} from Google sync:`, updateError)
            }
        }

        for (const leadId of Array.from(affectedLeadIds)) {
            await updateLeadNextMeeting(leadId)
        }

        return { success: true, updatedCount, cancelledCount, unlinkedCount }
    } catch (error: any) {
        console.error('Sync Google Events Error:', error)
        return { success: false, error: error.message }
    }
}

export async function listGoogleCalendarEventsAction(
    userId: string,
    options?: {
        daysBack?: number
        daysForward?: number
        maxResults?: number
        includeCancelled?: boolean
    }
) {
    try {
        const accessToken = await getValidAccessToken(userId)
        if (!accessToken) return { success: false, error: 'No Google connection', events: [] }

        const daysBack = Math.max(0, Math.min(60, Number(options?.daysBack ?? 7)))
        const daysForward = Math.max(1, Math.min(365, Number(options?.daysForward ?? 90)))
        const maxResults = Math.max(10, Math.min(2500, Number(options?.maxResults ?? 500)))
        const includeCancelled = Boolean(options?.includeCancelled)

        const now = new Date()
        const timeMin = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000).toISOString()
        const timeMax = new Date(now.getTime() + daysForward * 24 * 60 * 60 * 1000).toISOString()
        const params = new URLSearchParams({
            timeMin,
            timeMax,
            singleEvents: 'true',
            orderBy: 'startTime',
            maxResults: String(maxResults),
            showDeleted: includeCancelled ? 'true' : 'false'
        })

        const response = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
            {
                headers: { Authorization: `Bearer ${accessToken}` }
            }
        )

        if (!response.ok) {
            const errData = await response.json()
            throw new Error(errData.error?.message || 'Failed to fetch Google Calendar events')
        }

        const data = await response.json() as { items?: GoogleCalendarApiEvent[] }
        const googleEvents = data.items || []

        const { createClient } = await import('@/lib/supabase-server')
        const { cookies } = await import('next/headers')
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)

        const googleEventIds = Array.from(new Set(
            googleEvents
                .map(event => String(event.id || '').trim())
                .filter(Boolean)
        ))

        let linkedMap = new Map<string, {
            id: string
            lead_id: number
            title: string
            meeting_status: string
            status: string
        }>()

        if (googleEventIds.length > 0) {
            const { data: linkedMeetings } = await (supabase
                .from('meetings') as any)
                .select('id, lead_id, title, meeting_status, status, calendar_event_id')
                .eq('seller_id', userId)
                .in('calendar_event_id', googleEventIds)

            const mappedLinkedEntries: Array<[string, {
                id: string
                lead_id: number
                title: string
                meeting_status: string
                status: string
            }]> = (linkedMeetings || [])
                .map((meeting: any) => [
                    String(meeting.calendar_event_id || '').trim(),
                    {
                        id: String(meeting.id || ''),
                        lead_id: Number(meeting.lead_id || 0),
                        title: String(meeting.title || ''),
                        meeting_status: String(meeting.meeting_status || ''),
                        status: String(meeting.status || '')
                    }
                ])

            linkedMap = new Map(
                mappedLinkedEntries.filter((entry) => Boolean(entry[0]))
            )
        }

        const normalizedEvents = googleEvents
            .map((event) => {
                const eventId = String(event.id || '').trim()
                if (!eventId) return null

                const normalizedTime = normalizeGoogleEventTime(event)
                if (!normalizedTime) return null

                const meetingLink = extractGoogleMeetLink(event)
                const attendees = Array.isArray(event.attendees)
                    ? event.attendees
                        .map((attendee) => ({
                            email: String(attendee?.email || '').trim(),
                            displayName: attendee?.displayName ? String(attendee.displayName).trim() : null,
                            responseStatus: attendee?.responseStatus ? String(attendee.responseStatus).trim() : null,
                            optional: Boolean(attendee?.optional),
                            organizer: Boolean(attendee?.organizer),
                            self: Boolean(attendee?.self)
                        }))
                        .filter((attendee) => Boolean(attendee.email))
                    : []

                const linkedMeeting = linkedMap.get(eventId) || null

                return {
                    id: eventId,
                    status: String(event.status || 'confirmed'),
                    title: String(event.summary || '').trim() || 'Sin título',
                    description: event.description ? String(event.description).trim() : null,
                    location: event.location ? String(event.location).trim() : null,
                    htmlLink: event.htmlLink ? String(event.htmlLink).trim() : null,
                    meetLink: meetingLink,
                    startTime: normalizedTime.startIso,
                    endTime: normalizedTime.endIso,
                    isAllDay: normalizedTime.isAllDay,
                    updatedAt: event.updated ? String(event.updated).trim() : null,
                    organizer: event.organizer
                        ? {
                            email: event.organizer.email ? String(event.organizer.email).trim() : null,
                            displayName: event.organizer.displayName ? String(event.organizer.displayName).trim() : null
                        }
                        : null,
                    creator: event.creator
                        ? {
                            email: event.creator.email ? String(event.creator.email).trim() : null,
                            displayName: event.creator.displayName ? String(event.creator.displayName).trim() : null
                        }
                        : null,
                    attendees,
                    linkedMeeting: linkedMeeting
                        ? {
                            id: linkedMeeting.id,
                            leadId: linkedMeeting.lead_id,
                            title: linkedMeeting.title,
                            meetingStatus: linkedMeeting.meeting_status,
                            status: linkedMeeting.status
                        }
                        : null
                }
            })
            .filter((event): event is NonNullable<typeof event> => Boolean(event))
            .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())

        return {
            success: true,
            events: normalizedEvents,
            totalCount: normalizedEvents.length,
            linkedCount: normalizedEvents.filter(event => event.linkedMeeting !== null).length
        }
    } catch (error: any) {
        console.error('List Google Events Error:', error)
        return { success: false, error: error.message, events: [] }
    }
}
