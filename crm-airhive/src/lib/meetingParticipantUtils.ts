import type { MeetingWithUrgency } from '@/lib/confirmationService'

function normalizeValue(value: string | null | undefined): string {
    return String(value || '').trim().toLowerCase()
}

export function extractEmailFromLabel(label: string): string | null {
    const trimmed = String(label || '').trim()
    if (!trimmed) return null

    const angled = /<([^<>@\s]+@[^<>@\s]+\.[^<>@\s]+)>/.exec(trimmed)
    if (angled?.[1]) return normalizeValue(angled[1])
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return normalizeValue(trimmed)

    return null
}

export function meetingIncludesUser(
    meeting: MeetingWithUrgency,
    userId?: string | null,
    userEmail?: string | null,
    userUsername?: string | null
): boolean {
    const normalizedUserId = normalizeValue(userId)
    const normalizedUserEmail = normalizeValue(userEmail)
    const normalizedUsername = normalizeValue(userUsername)

    if (normalizedUserId && normalizeValue(String(meeting.seller_id || '')) === normalizedUserId) {
        return true
    }

    const attendeeValues = Array.isArray(meeting.attendees)
        ? meeting.attendees
            .map((value) => normalizeValue(String(value || '')))
            .filter(Boolean)
        : []

    const externalEmails = Array.isArray(meeting.external_participants)
        ? meeting.external_participants
            .map((value) => extractEmailFromLabel(String(value || '')))
            .filter((value): value is string => Boolean(value))
        : []

    if (normalizedUserEmail && (attendeeValues.includes(normalizedUserEmail) || externalEmails.includes(normalizedUserEmail))) {
        return true
    }

    if (normalizedUsername && attendeeValues.includes(normalizedUsername)) {
        return true
    }

    if (normalizedUserId && attendeeValues.includes(normalizedUserId)) {
        return true
    }

    return false
}
