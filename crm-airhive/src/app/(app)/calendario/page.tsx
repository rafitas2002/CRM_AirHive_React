'use client'

import { useEffect, useState, useCallback, useMemo, useRef, type CSSProperties } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getUpcomingMeetings, type MeetingWithUrgency, calculateMeetingUrgency } from '@/lib/confirmationService'
import { getStageColor, getUrgencyColor } from '@/lib/confirmationService'
import { useAuth } from '@/lib/auth'
import MeetingModal, { type MeetingModalSaveContext } from '@/components/MeetingModal'
import ConfirmModal from '@/components/ConfirmModal'
import { createMeeting, updateMeeting } from '@/lib/meetingsService'
import { deleteMeetingAction } from '@/app/actions/meetings'
import { getGoogleAuthUrlWithState, getGoogleConnectionStatus } from '@/app/actions/google-integration'
import { listGoogleCalendarEventsAction, syncGoogleEventsAction } from '@/app/actions/google-calendar'
import { createClient } from '@/lib/supabase'
import { meetingIncludesUser } from '@/lib/meetingParticipantUtils'

import CalendarWeekView from '@/components/CalendarWeekView'
import CalendarMonthView from '@/components/CalendarMonthView'
import { Clock, Users, ShieldCheck, CalendarDays, UserCircle2, Building2, Video, Trash2, Pencil, AlertCircle, RefreshCw, Link2, MapPin, UserRound, CalendarClock, CheckCircle2, CircleDashed, XCircle, X, Search } from 'lucide-react'
import RichardDawkinsFooter from '@/components/RichardDawkinsFooter'

type GoogleCalendarEvent = {
    id: string
    status: string
    title: string
    description: string | null
    location: string | null
    htmlLink: string | null
    meetLink: string | null
    startTime: string
    endTime: string
    isAllDay: boolean
    updatedAt: string | null
    organizer: {
        email: string | null
        displayName: string | null
    } | null
    creator: {
        email: string | null
        displayName: string | null
    } | null
    attendees: Array<{
        email: string
        displayName: string | null
        responseStatus: string | null
        optional: boolean
        organizer: boolean
        self: boolean
    }>
    linkedMeeting: {
        id: string
        leadId: number
        title: string
        meetingStatus: string
        status: string
    } | null
}

type CalendarLeadOption = {
    id: number
    nombre: string
    empresa: string
    empresa_id: string | null
    owner_id: string | null
    contacto: string | null
    email: string | null
    telefono: string | null
    etapa: string | null
}

type CalendarTimelineMode = 'history_and_upcoming' | 'upcoming_only' | 'past_only'
const PAST_MEETINGS_TABLE_PAGE_SIZE = 36

function isClosedLeadStage(stage: unknown) {
    const normalized = String(stage || '').trim().toLowerCase()
    return normalized === 'cerrado ganado'
        || normalized === 'cerrada ganada'
        || normalized === 'cerrado perdido'
        || normalized === 'cerrada perdida'
}

function getLocalDateKey(dateValue: string) {
    const date = new Date(dateValue)
    return [
        String(date.getFullYear()).padStart(4, '0'),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
    ].join('-')
}

function isPastMeeting(meeting: MeetingWithUrgency, now: Date) {
    const status = String(meeting.status || '').trim().toLowerCase()
    const meetingStatus = String(meeting.meeting_status || '').trim().toLowerCase()

    if (status === 'cancelled' || meetingStatus === 'cancelled') return false
    if (status === 'completed' || meetingStatus === 'held' || meetingStatus === 'not_held') return true

    const startMs = new Date(meeting.start_time).getTime()
    if (!Number.isFinite(startMs)) return false
    return startMs < now.getTime()
}

function getHistoricalMeetingStatusMeta(meeting: MeetingWithUrgency, now: Date) {
    const status = String(meeting.status || '').trim().toLowerCase()
    const meetingStatus = String(meeting.meeting_status || '').trim().toLowerCase()
    const startMs = new Date(meeting.start_time).getTime()

    if (meetingStatus === 'held' || status === 'completed') {
        return {
            label: 'Completada',
            style: {
                background: 'color-mix(in srgb, #22c55e 16%, var(--card-bg))',
                borderColor: 'color-mix(in srgb, #22c55e 44%, var(--card-border))',
                color: 'color-mix(in srgb, var(--text-primary) 80%, #166534)'
            } as CSSProperties
        }
    }

    if (meetingStatus === 'not_held') {
        return {
            label: 'No concretada',
            style: {
                background: 'color-mix(in srgb, #ef4444 16%, var(--card-bg))',
                borderColor: 'color-mix(in srgb, #ef4444 44%, var(--card-border))',
                color: 'color-mix(in srgb, var(--text-primary) 80%, #b91c1c)'
            } as CSSProperties
        }
    }

    if (
        meetingStatus === 'pending_confirmation'
        || meetingStatus === 'scheduled'
        || (Number.isFinite(startMs) && startMs < now.getTime())
    ) {
        return {
            label: 'Pendiente de confirmación',
            style: {
                background: 'color-mix(in srgb, #f59e0b 16%, var(--card-bg))',
                borderColor: 'color-mix(in srgb, #f59e0b 44%, var(--card-border))',
                color: 'color-mix(in srgb, var(--text-primary) 80%, #b45309)'
            } as CSSProperties
        }
    }

    return {
        label: 'Programada',
        style: {
            background: 'color-mix(in srgb, #64748b 14%, var(--card-bg))',
            borderColor: 'color-mix(in srgb, #64748b 38%, var(--card-border))',
            color: 'var(--text-secondary)'
        } as CSSProperties
    }
}

export default function CalendarioPage() {
    const auth = useAuth()
    const router = useRouter()
    const searchParams = useSearchParams()
    const autoCreateMeetingHandledRef = useRef<string | null>(null)
    const [meetings, setMeetings] = useState<MeetingWithUrgency[]>([])
    const [googleEvents, setGoogleEvents] = useState<GoogleCalendarEvent[]>([])
    const [showEditModal, setShowEditModal] = useState(false)
    const [editMeetingData, setEditMeetingData] = useState<any>(null)
    const [viewMode, setViewMode] = useState<'month' | 'week' | 'list'>('list')
    const [calendarMonthDate, setCalendarMonthDate] = useState(() => new Date())
    const [isEditMode, setIsEditMode] = useState(false)
    const [currentTime, setCurrentTime] = useState(new Date())
    const [calendarStatus, setCalendarStatus] = useState<{ connected: boolean; email?: string | null }>({ connected: false })
    const [googleEventsLoading, setGoogleEventsLoading] = useState(false)
    const [googleSyncLoading, setGoogleSyncLoading] = useState(false)
    const [googleSyncSummary, setGoogleSyncSummary] = useState<string | null>(null)
    const [googleLastRefresh, setGoogleLastRefresh] = useState<Date | null>(null)
    const [sellers, setSellers] = useState<{ id: string; full_name: string | null; username: string | null }[]>([])
    const [selectedSellerId, setSelectedSellerId] = useState<string>('all')
    const [adminVisibilityMode, setAdminVisibilityMode] = useState<'included' | 'all_registered'>('all_registered')
    const [timelineMode, setTimelineMode] = useState<CalendarTimelineMode>('upcoming_only')
    const [pastMeetingsTablePage, setPastMeetingsTablePage] = useState(1)
    const [meetingSearch, setMeetingSearch] = useState('')
    const [isCreateMeetingLeadPickerOpen, setIsCreateMeetingLeadPickerOpen] = useState(false)
    const [createMeetingLeadLoading, setCreateMeetingLeadLoading] = useState(false)
    const [createMeetingLeadOptions, setCreateMeetingLeadOptions] = useState<CalendarLeadOption[]>([])
    const [selectedCreateMeetingLeadId, setSelectedCreateMeetingLeadId] = useState<number | null>(null)
    const [isCreateMeetingModalOpen, setIsCreateMeetingModalOpen] = useState(false)

    // Confirmation Modal State
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false)
    const [meetingToDelete, setMeetingToDelete] = useState<any>(null)

    // Alert Modal State (for errors)
    const [isAlertModalOpen, setIsAlertModalOpen] = useState(false)
    const [alertConfig, setAlertConfig] = useState({ title: '', message: '' })
    const isAdmin = auth.profile?.role === 'admin'
    const selectedCreateMeetingLead = useMemo(
        () => createMeetingLeadOptions.find((lead) => lead.id === selectedCreateMeetingLeadId) || null,
        [createMeetingLeadOptions, selectedCreateMeetingLeadId]
    )

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000)
        return () => clearInterval(timer)
    }, [])

    const fetchCalendarStatus = useCallback(async () => {
        try {
            const status = await getGoogleConnectionStatus()
            if (status?.connected) {
                setCalendarStatus({ connected: true, email: status.email })
            } else {
                setCalendarStatus({ connected: false, email: null })
            }
        } catch (error) {
            console.error('Error fetching calendar status:', error)
            setCalendarStatus({ connected: false, email: null })
        }
    }, [])

    const fetchSellers = useCallback(async () => {
        try {
            const supabase = createClient()
            const { data } = await supabase
                .from('profiles')
                .select('id, full_name, username')
                .order('full_name')

            if (data) setSellers(data)
        } catch (error) {
            console.error('Error fetching sellers:', error)
        }
    }, [])

    const loadCreateMeetingLeadOptions = useCallback(async () => {
        if (!auth.user?.id) return [] as CalendarLeadOption[]
        setCreateMeetingLeadLoading(true)
        try {
            const supabase = createClient()
            const selectAttempts = [
                'id, nombre, empresa, empresa_id, owner_id, contacto, email, telefono, etapa',
                'id, nombre, empresa, empresa_id, owner_id:vendedor_id, contacto, email, telefono, etapa',
                'id, nombre, empresa, empresa_id, contacto, email, telefono, etapa'
            ]

            let rows: any[] = []
            let lastError: any = null

            for (const selectAttempt of selectAttempts) {
                const response = await (supabase.from('clientes') as any)
                    .select(selectAttempt)
                    .order('updated_at', { ascending: false })
                    .limit(400)

                if (!response?.error) {
                    rows = Array.isArray(response?.data) ? response.data : []
                    lastError = null
                    break
                }
                lastError = response.error
            }

            if (lastError) {
                console.error('Error fetching lead options for quick meeting creation:', lastError)
                setAlertConfig({
                    title: 'Error al cargar leads',
                    message: 'No se pudieron cargar leads para agendar la junta.'
                })
                setIsAlertModalOpen(true)
                return [] as CalendarLeadOption[]
            }

            const normalized = rows
                .map((row: any) => ({
                    id: Number(row?.id || 0),
                    nombre: String(row?.nombre || '').trim() || 'Lead',
                    empresa: String(row?.empresa || '').trim() || 'Empresa',
                    empresa_id: row?.empresa_id ? String(row.empresa_id) : null,
                    owner_id: row?.owner_id ? String(row.owner_id) : null,
                    contacto: row?.contacto ? String(row.contacto).trim() : null,
                    email: row?.email ? String(row.email).trim() : null,
                    telefono: row?.telefono ? String(row.telefono).trim() : null,
                    etapa: row?.etapa ? String(row.etapa).trim() : null
                }))
                .filter((lead) => lead.id > 0)
                .filter((lead) => !isClosedLeadStage(lead.etapa))
                .sort((a, b) => {
                    const byCompany = a.empresa.localeCompare(b.empresa, 'es', { sensitivity: 'base' })
                    if (byCompany !== 0) return byCompany
                    return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
                })

            setCreateMeetingLeadOptions(normalized)
            return normalized
        } finally {
            setCreateMeetingLeadLoading(false)
        }
    }, [auth.user?.id])

    const openQuickCreateMeetingFlow = useCallback(async () => {
        const options = await loadCreateMeetingLeadOptions()
        if (options.length === 0) {
            setCreateMeetingLeadOptions([])
        }
        setIsCreateMeetingLeadPickerOpen(true)
    }, [loadCreateMeetingLeadOptions])

    const fetchData = useCallback(async () => {
        try {
            if (!auth.user) return
            const showAllRegistered = isAdmin && adminVisibilityMode === 'all_registered'
            const includeHistorical = timelineMode !== 'upcoming_only'
            const queryLimit = includeHistorical ? 5000 : (showAllRegistered ? 500 : 200)

            const fetchedMeetings = await getUpcomingMeetings(
                auth.user.id,
                queryLimit,
                showAllRegistered,
                auth.user?.email || undefined,
                auth.profile?.username || undefined,
                {
                    includeHistorical,
                    includeCancelled: false
                }
            )

            const meetingsBySeller = (showAllRegistered && selectedSellerId !== 'all')
                ? fetchedMeetings.filter((meeting) => String(meeting.seller_id || '') === selectedSellerId)
                : fetchedMeetings

            const sortedMeetings = [...meetingsBySeller].sort((a, b) => (
                timelineMode === 'upcoming_only'
                    ? new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
                    : new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
            ))

            setMeetings(sortedMeetings)
        } catch (error) {
            console.error('Error fetching calendar data:', error)
        }
    }, [auth.user, auth.profile?.username, adminVisibilityMode, isAdmin, selectedSellerId, timelineMode])

    const fetchGoogleEvents = useCallback(async () => {
        if (!auth.user?.id) return
        setGoogleEventsLoading(true)

        try {
            const includeHistorical = timelineMode !== 'upcoming_only'
            const result = await listGoogleCalendarEventsAction(auth.user.id, {
                daysBack: includeHistorical ? 365 : 7,
                daysForward: timelineMode === 'past_only' ? 7 : (includeHistorical ? 180 : 120),
                maxResults: includeHistorical ? 1200 : 500,
                includeCancelled: false
            })

            if (result.success) {
                setGoogleEvents((result.events || []) as GoogleCalendarEvent[])
                setGoogleLastRefresh(new Date())
            } else if (String(result.error || '').toLowerCase().includes('no google connection')) {
                setGoogleEvents([])
                setCalendarStatus({ connected: false, email: null })
            }
        } catch (error) {
            console.error('Error fetching Google events:', error)
        } finally {
            setGoogleEventsLoading(false)
        }
    }, [auth.user?.id, timelineMode])

    const syncGoogleAndRefresh = useCallback(async (silent: boolean = false) => {
        if (!auth.user?.id || !calendarStatus.connected) return
        if (!silent) setGoogleSyncLoading(true)

        try {
            const syncResult = await syncGoogleEventsAction(auth.user.id)
            if (!syncResult.success) {
                const errorMessage = String(syncResult.error || 'Error de sincronización con Google Calendar')
                setGoogleSyncSummary(errorMessage)
                if (errorMessage.toLowerCase().includes('no google connection')) {
                    setCalendarStatus({ connected: false, email: null })
                    setGoogleEvents([])
                }
                return
            }

            const updatedCount = Number(syncResult.updatedCount || 0)
            const cancelledCount = Number(syncResult.cancelledCount || 0)
            const unlinkedCount = Number(syncResult.unlinkedCount || 0)
            const summaryParts: string[] = []
            if (updatedCount > 0) summaryParts.push(`${updatedCount} juntas actualizadas`)
            if (cancelledCount > 0) summaryParts.push(`${cancelledCount} juntas canceladas`)
            if (unlinkedCount > 0) summaryParts.push(`${unlinkedCount} eventos nuevos detectados en Google`)
            setGoogleSyncSummary(summaryParts.length > 0 ? summaryParts.join(' · ') : 'Sin cambios recientes en Google Calendar')

            await Promise.all([fetchData(), fetchGoogleEvents()])
        } catch (error) {
            console.error('Error syncing Google Calendar:', error)
            setGoogleSyncSummary('No se pudo completar la sincronización con Google Calendar.')
        } finally {
            if (!silent) setGoogleSyncLoading(false)
        }
    }, [auth.user?.id, calendarStatus.connected, fetchData, fetchGoogleEvents])

    useEffect(() => {
        if (!auth.loading && auth.user) {
            fetchData()
            fetchCalendarStatus()
            if (isAdmin) {
                fetchSellers()
            }
        }
    }, [auth.user, auth.loading, isAdmin, fetchData, fetchCalendarStatus, fetchSellers])

    useEffect(() => {
        if (selectedSellerId) fetchData()
    }, [selectedSellerId, fetchData])

    useEffect(() => {
        if (!isAdmin && adminVisibilityMode !== 'included') {
            setAdminVisibilityMode('included')
        }
    }, [adminVisibilityMode, isAdmin])

    useEffect(() => {
        if (!auth.user?.id || !calendarStatus.connected) {
            setGoogleEvents([])
            return
        }

        void syncGoogleAndRefresh(true)
    }, [auth.user?.id, calendarStatus.connected, syncGoogleAndRefresh])

    useEffect(() => {
        if (!auth.user?.id || !calendarStatus.connected) return

        const interval = setInterval(() => {
            void syncGoogleAndRefresh(true)
        }, 60 * 1000)

        return () => clearInterval(interval)
    }, [auth.user?.id, calendarStatus.connected, syncGoogleAndRefresh])

    useEffect(() => {
        const createMeetingParamRaw = String(
            searchParams.get('createMeeting')
            || searchParams.get('newMeeting')
            || ''
        ).trim().toLowerCase()

        if (!createMeetingParamRaw) {
            autoCreateMeetingHandledRef.current = null
            return
        }
        if (autoCreateMeetingHandledRef.current === createMeetingParamRaw) return

        const shouldOpenCreateMeetingFlow = ['1', 'true', 'yes', 'open'].includes(createMeetingParamRaw)
        if (!shouldOpenCreateMeetingFlow) return
        if (auth.loading || !auth.user?.id) return

        autoCreateMeetingHandledRef.current = createMeetingParamRaw
        setIsCreateMeetingModalOpen(false)
        setSelectedCreateMeetingLeadId(null)
        void openQuickCreateMeetingFlow()

        const nextParams = new URLSearchParams(searchParams.toString())
        nextParams.delete('createMeeting')
        nextParams.delete('newMeeting')
        const query = nextParams.toString()
        router.replace(query ? `/calendario?${query}` : '/calendario')
    }, [searchParams, auth.loading, auth.user?.id, openQuickCreateMeetingFlow, router])

    const handleConnectGoogle = async () => {
        const url = await getGoogleAuthUrlWithState(auth.user?.id || null)
        window.location.href = url
    }

    const handleManualGoogleSync = async () => {
        await syncGoogleAndRefresh(false)
    }

    const handleDeleteMeeting = async (meeting: any) => {
        setMeetingToDelete(meeting)
        setIsConfirmModalOpen(true)
    }

    const confirmDeleteMeeting = async () => {
        if (!meetingToDelete) return
        try {
            const res = await deleteMeetingAction(meetingToDelete.id)
            if (res.success) {
                await fetchData()
            } else {
                setAlertConfig({
                    title: 'Error al eliminar',
                    message: res.error || 'No se pudo eliminar la reunión. Inténtalo de nuevo.'
                })
                setIsAlertModalOpen(true)
            }
            setMeetingToDelete(null)
        } catch (error) {
            console.error('Error deleting meeting:', error)
            setAlertConfig({
                title: 'Error Inesperado',
                message: 'Ocurrió un error al procesar la solicitud.'
            })
            setIsAlertModalOpen(true)
        }
    }

    const handleEditMeeting = (meeting: any) => {
        setEditMeetingData(meeting)
        setShowEditModal(true)
    }

    const handleSaveEdit = async (data: any, context?: MeetingModalSaveContext) => {
        if (!editMeetingData) return
        try {
            const { empresa, etapa, urgencyLevel, hoursUntil, clientes, seller_name, ...cleanData } = data
            await updateMeeting(editMeetingData.id, cleanData, context?.rescheduleReason)
            await fetchData()
            setShowEditModal(false)
            setEditMeetingData(null)
        } catch (error) {
            console.error('Error updating meeting:', error)
            alert('Error al guardar cambios')
        }
    }

    const handleCreateMeetingSave = async (data: any, _context?: MeetingModalSaveContext) => {
        try {
            await createMeeting(data)
            await fetchData()
            setIsCreateMeetingModalOpen(false)
            setSelectedCreateMeetingLeadId(null)
            setGoogleSyncSummary('Junta registrada correctamente.')
        } catch (error: any) {
            console.error('Error creating meeting from quick flow:', error)
            setAlertConfig({
                title: 'Error al crear junta',
                message: String(error?.message || 'No se pudo registrar la junta. Inténtalo de nuevo.')
            })
            setIsAlertModalOpen(true)
        }
    }

    const normalizedMeetingSearch = meetingSearch.trim().toLowerCase()

    const filteredMeetings = useMemo(() => {
        const timelineScopedMeetings = meetings.filter((meeting) => {
            const isPast = isPastMeeting(meeting, currentTime)
            if (timelineMode === 'past_only') return isPast
            if (timelineMode === 'upcoming_only') return !isPast
            return true
        })

        if (!normalizedMeetingSearch) return timelineScopedMeetings

        return timelineScopedMeetings.filter((meeting) => {
            const searchableValues = [
                meeting.title,
                meeting.empresa,
                meeting.seller_name,
                meeting.primary_company_contact_name,
                meeting.notes,
                meeting.meeting_type
            ]
                .map((value) => String(value || '').trim().toLowerCase())
                .filter(Boolean)

            if (Array.isArray(meeting.external_participants)) {
                for (const participant of meeting.external_participants) {
                    searchableValues.push(String(participant || '').trim().toLowerCase())
                }
            }
            if (Array.isArray(meeting.attendees)) {
                for (const attendee of meeting.attendees) {
                    searchableValues.push(String(attendee || '').trim().toLowerCase())
                }
            }

            return searchableValues.some((value) => value.includes(normalizedMeetingSearch))
        })
    }, [meetings, normalizedMeetingSearch, currentTime, timelineMode])

    const isPastOnlyMode = timelineMode === 'past_only'
    const pastMeetingsTotalPages = useMemo(
        () => (
            isPastOnlyMode
                ? Math.max(1, Math.ceil(filteredMeetings.length / PAST_MEETINGS_TABLE_PAGE_SIZE))
                : 1
        ),
        [isPastOnlyMode, filteredMeetings.length]
    )
    const paginatedPastMeetings = useMemo(() => {
        if (!isPastOnlyMode) return filteredMeetings
        const start = (pastMeetingsTablePage - 1) * PAST_MEETINGS_TABLE_PAGE_SIZE
        return filteredMeetings.slice(start, start + PAST_MEETINGS_TABLE_PAGE_SIZE)
    }, [isPastOnlyMode, filteredMeetings, pastMeetingsTablePage])

    useEffect(() => {
        setPastMeetingsTablePage(1)
    }, [timelineMode, meetingSearch, selectedSellerId, adminVisibilityMode])

    useEffect(() => {
        setPastMeetingsTablePage((currentPage) => Math.min(currentPage, pastMeetingsTotalPages))
    }, [pastMeetingsTotalPages])

    useEffect(() => {
        if (timelineMode === 'past_only' && viewMode !== 'list') {
            setViewMode('list')
        }
    }, [timelineMode, viewMode])

    const meetingSearchHints = useMemo(() => {
        const options = new Set<string>()
        for (const meeting of meetings) {
            const companyName = String(meeting.empresa || '').trim()
            if (companyName) options.add(companyName)
        }
        return Array.from(options).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
    }, [meetings])

    const filteredGoogleEvents = useMemo(() => {
        if (!normalizedMeetingSearch) return googleEvents

        return googleEvents.filter((event) => {
            const searchableValues = [
                event.title,
                event.description,
                event.location,
                event.organizer?.displayName,
                event.organizer?.email,
                event.creator?.displayName,
                event.creator?.email,
                event.linkedMeeting?.title
            ]
                .map((value) => String(value || '').trim().toLowerCase())
                .filter(Boolean)

            if (Array.isArray(event.attendees)) {
                for (const attendee of event.attendees) {
                    searchableValues.push(String(attendee?.displayName || '').trim().toLowerCase())
                    searchableValues.push(String(attendee?.email || '').trim().toLowerCase())
                }
            }

            return searchableValues.some((value) => value.includes(normalizedMeetingSearch))
        })
    }, [googleEvents, normalizedMeetingSearch])

    const groupedMeetings = useMemo(() => {
        const grouped = filteredMeetings.reduce((acc, meeting) => {
            const dateKey = getLocalDateKey(meeting.start_time)
            if (!acc[dateKey]) {
                acc[dateKey] = {
                    label: new Date(meeting.start_time).toLocaleDateString('es-MX', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    }),
                    meetings: [] as MeetingWithUrgency[]
                }
            }
            acc[dateKey].meetings.push(meeting)
            return acc
        }, {} as Record<string, { label: string; meetings: MeetingWithUrgency[] }>)

        return Object.entries(grouped)
            .map(([dateKey, bucket]) => ({
                dateKey,
                label: bucket.label,
                dayMeetings: [...bucket.meetings].sort(
                    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
                )
            }))
            .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
    }, [filteredMeetings])

    const getParticipationStyle = (isIncluded: boolean): CSSProperties => (
        isIncluded
            ? {
                borderColor: 'color-mix(in srgb, #2048FF 52%, var(--card-border))',
                background: 'color-mix(in srgb, #2048FF 6%, var(--card-bg))'
            }
            : {
                borderColor: 'color-mix(in srgb, #f59e0b 56%, var(--card-border))',
                background: 'color-mix(in srgb, #f59e0b 6%, var(--card-bg))'
            }
    )

    const getParticipationBadgeStyle = (isIncluded: boolean): CSSProperties => (
        isIncluded
            ? {
                background: 'color-mix(in srgb, #2048FF 18%, var(--card-bg))',
                color: 'color-mix(in srgb, var(--text-primary) 76%, #2048FF)',
                borderColor: 'color-mix(in srgb, #2048FF 46%, var(--card-border))'
            }
            : {
                background: 'color-mix(in srgb, #f59e0b 20%, var(--card-bg))',
                color: 'color-mix(in srgb, var(--text-primary) 78%, #b45309)',
                borderColor: 'color-mix(in srgb, #f59e0b 48%, var(--card-border))'
            }
    )

    const getUrgencyRibbonStyle = (level: MeetingWithUrgency['urgencyLevel']): CSSProperties => {
        switch (level) {
            case 'overdue':
                return {
                    background: 'color-mix(in srgb, #ef4444 24%, var(--card-bg))',
                    color: 'color-mix(in srgb, var(--text-primary) 82%, #ef4444)',
                    borderColor: 'color-mix(in srgb, #ef4444 45%, var(--card-border))'
                }
            case 'urgent':
                return {
                    background: 'color-mix(in srgb, #f59e0b 28%, var(--card-bg))',
                    color: 'color-mix(in srgb, var(--text-primary) 80%, #b45309)',
                    borderColor: 'color-mix(in srgb, #f59e0b 46%, var(--card-border))'
                }
            case 'today':
                return {
                    background: 'color-mix(in srgb, #eab308 22%, var(--card-bg))',
                    color: 'color-mix(in srgb, var(--text-primary) 80%, #854d0e)',
                    borderColor: 'color-mix(in srgb, #eab308 40%, var(--card-border))'
                }
            case 'soon':
                return {
                    background: 'color-mix(in srgb, #3b82f6 15%, var(--card-bg))',
                    color: 'color-mix(in srgb, var(--text-primary) 82%, #1d4ed8)',
                    borderColor: 'color-mix(in srgb, #3b82f6 38%, var(--card-border))'
                }
            case 'in_progress':
                return {
                    background: 'color-mix(in srgb, #2048FF 22%, var(--card-bg))',
                    color: 'var(--text-primary)',
                    borderColor: 'color-mix(in srgb, #2048FF 44%, var(--card-border))'
                }
            default:
                return {
                    background: 'color-mix(in srgb, var(--hover-bg) 80%, var(--card-bg))',
                    color: 'var(--text-secondary)',
                    borderColor: 'var(--card-border)'
                }
        }
    }

    const getGoogleStatusBadge = (status: string) => {
        const normalized = String(status || '').toLowerCase()
        if (normalized === 'cancelled') {
            return {
                icon: XCircle,
                label: 'Cancelado',
                className: 'text-rose-600 bg-rose-500/10 border border-rose-500/20'
            }
        }
        if (normalized === 'tentative') {
            return {
                icon: CircleDashed,
                label: 'Tentativo',
                className: 'text-amber-700 bg-amber-500/10 border border-amber-500/25'
            }
        }
        return {
            icon: CheckCircle2,
            label: 'Confirmado',
            className: 'text-emerald-700 bg-emerald-500/10 border border-emerald-500/25'
        }
    }

    const formatGoogleEventWindow = (event: GoogleCalendarEvent) => {
        const startDate = new Date(event.startTime)
        const endDate = new Date(event.endTime)

        if (event.isAllDay) {
            return `${startDate.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })} · Todo el día`
        }

        const sameDay = startDate.toDateString() === endDate.toDateString()
        if (sameDay) {
            return `${startDate.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })} · ${startDate.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true })} - ${endDate.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true })}`
        }

        return `${startDate.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })} ${startDate.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true })} - ${endDate.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })} ${endDate.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true })}`
    }

    if (auth.loading && !auth.loggedIn) {
        return (
            <div className='h-full flex items-center justify-center' style={{ background: 'var(--background)' }}>
                <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600'></div>
            </div>
        )
    }

    return (
        <div className='min-h-full flex flex-col p-8 overflow-y-auto custom-scrollbar' style={{ background: 'transparent' }}>
            <div className='max-w-7xl mx-auto space-y-10 w-full'>
                {/* External Header - Page Level */}
                <div className='flex flex-col md:flex-row md:items-center justify-between gap-6'>
                    <div className='flex items-center gap-8'>
                        <div className='flex items-center gap-6'>
                            <div className='ah-icon-card transition-all hover:scale-105'>
                                <CalendarDays size={34} strokeWidth={1.9} />
                            </div>
                            <div>
                                <h1 className='text-4xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>
                                    Calendario Comercial
                                </h1>
                                <p className='font-medium' style={{ color: 'var(--text-secondary)' }}>
                                    Gestión de juntas, forecast y compromisos de ventas.
                                </p>
                            </div>
                        </div>

                        <div className='hidden xl:flex items-center gap-3 bg-blue-500/10 px-4 py-2 rounded-2xl border border-blue-500/20'>
                            <Clock size={16} className='text-blue-600' />
                            <span className='text-sm font-black text-blue-600 tabular-nums'>
                                {currentTime.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                            </span>
                        </div>
                    </div>

                    <div className='w-full p-3 rounded-[24px] shadow-sm border' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                        <div className='grid grid-cols-1 xl:grid-cols-12 gap-3 items-stretch'>
                            {isAdmin && (
                                <div className='xl:col-span-4 flex items-center gap-1 p-1 rounded-2xl border min-h-[52px]' style={{ borderColor: 'var(--card-border)', background: 'var(--background)' }}>
                                    <button
                                        onClick={() => setAdminVisibilityMode('included')}
                                        className={`flex-1 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer ${adminVisibilityMode === 'included'
                                            ? 'bg-[#2048FF] text-white'
                                            : 'text-[var(--text-secondary)] hover:text-[#2048FF] hover:bg-blue-500/10'
                                            }`}
                                    >
                                        Incluidos
                                    </button>
                                    <button
                                        onClick={() => setAdminVisibilityMode('all_registered')}
                                        className={`flex-1 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer ${adminVisibilityMode === 'all_registered'
                                            ? 'bg-[#2048FF] text-white'
                                            : 'text-[var(--text-secondary)] hover:text-[#2048FF] hover:bg-blue-500/10'
                                            }`}
                                    >
                                        Todos registrados
                                    </button>
                                </div>
                            )}

                            <div className={`${isAdmin ? 'xl:col-span-5' : 'xl:col-span-8'} flex items-center gap-1 p-1 rounded-2xl border min-h-[52px]`} style={{ borderColor: 'var(--card-border)', background: 'var(--background)' }}>
                                <button
                                    onClick={() => setTimelineMode('history_and_upcoming')}
                                    className={`flex-1 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer ${timelineMode === 'history_and_upcoming'
                                        ? 'bg-[#2048FF] text-white'
                                        : 'text-[var(--text-secondary)] hover:text-[#2048FF] hover:bg-blue-500/10'
                                        }`}
                                >
                                    Historial + Próximas
                                </button>
                                <button
                                    onClick={() => setTimelineMode('upcoming_only')}
                                    className={`flex-1 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer ${timelineMode === 'upcoming_only'
                                        ? 'bg-[#2048FF] text-white'
                                        : 'text-[var(--text-secondary)] hover:text-[#2048FF] hover:bg-blue-500/10'
                                        }`}
                                >
                                    Solo Próximas
                                </button>
                                <button
                                    onClick={() => setTimelineMode('past_only')}
                                    className={`flex-1 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer ${timelineMode === 'past_only'
                                        ? 'bg-[#2048FF] text-white'
                                        : 'text-[var(--text-secondary)] hover:text-[#2048FF] hover:bg-blue-500/10'
                                        }`}
                                >
                                    Solo Pasadas
                                </button>
                            </div>

                            {isAdmin && (
                                <div className='xl:col-span-3 flex items-center gap-3 px-4 rounded-2xl border min-h-[52px]' style={{ borderColor: 'var(--card-border)', background: 'var(--background)' }}>
                                    <Users size={16} style={{ color: 'var(--text-secondary)' }} />
                                    <select
                                        value={selectedSellerId}
                                        onChange={(e) => setSelectedSellerId(e.target.value)}
                                        disabled={adminVisibilityMode !== 'all_registered'}
                                        className={`bg-transparent text-sm font-black focus:outline-none w-full transition-colors ${adminVisibilityMode === 'all_registered'
                                            ? 'cursor-pointer hover:text-[#2048FF]'
                                            : 'cursor-not-allowed opacity-60'
                                            }`}
                                        style={{ color: 'var(--text-primary)' }}
                                    >
                                        <option value="all">Todos los responsables</option>
                                        {sellers.map(s => (
                                            <option key={s.id} value={s.id}>{s.full_name || s.username || 'Sin nombre'}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className={`${isAdmin ? 'xl:col-span-6' : 'xl:col-span-7'} flex items-center gap-2 px-3 py-2 rounded-2xl border min-h-[52px]`} style={{ borderColor: 'var(--card-border)', background: 'var(--background)' }}>
                                <Search size={14} style={{ color: 'var(--text-secondary)' }} />
                                <input
                                    type='text'
                                    value={meetingSearch}
                                    onChange={(event) => setMeetingSearch(event.target.value)}
                                    placeholder='Buscar por empresa o junta'
                                    list='calendar-meeting-search-hints'
                                    className='bg-transparent text-xs font-semibold focus:outline-none w-full'
                                    style={{ color: 'var(--text-primary)' }}
                                />
                                {meetingSearch.trim() && (
                                    <button
                                        type='button'
                                        onClick={() => setMeetingSearch('')}
                                        className='h-6 w-6 rounded-lg border border-[var(--card-border)] hover:border-blue-400 hover:bg-blue-500/10 flex items-center justify-center transition-colors cursor-pointer'
                                        aria-label='Limpiar búsqueda'
                                    >
                                        <X size={12} style={{ color: 'var(--text-secondary)' }} />
                                    </button>
                                )}
                                <datalist id='calendar-meeting-search-hints'>
                                    {meetingSearchHints.map((value) => (
                                        <option key={value} value={value} />
                                    ))}
                                </datalist>
                            </div>

                            <div className={`${isAdmin ? 'xl:col-span-6' : 'xl:col-span-5'} flex items-center justify-between gap-3 pl-1 pr-3 py-1.5 rounded-2xl border min-h-[52px] border-blue-500/20 bg-blue-500/5`}>
                                <div className='flex items-center gap-3 min-w-0'>
                                    <div className='w-8 h-8 rounded-xl bg-white/80 flex items-center justify-center'>
                                        <CalendarClock size={16} className='text-blue-600' />
                                    </div>
                                    <div className='leading-tight min-w-0'>
                                        <p className='text-[9px] font-black uppercase tracking-[0.14em] text-blue-700'>Google Calendar</p>
                                        <p className='text-[10px] font-semibold truncate max-w-[220px]' style={{ color: 'var(--text-secondary)' }}>
                                            {calendarStatus.connected
                                                ? (calendarStatus.email || 'Conectado')
                                                : 'No conectado'}
                                        </p>
                                    </div>
                                </div>
                                {calendarStatus.connected ? (
                                    <button
                                        onClick={handleManualGoogleSync}
                                        disabled={googleSyncLoading}
                                        className='min-w-[126px] px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-[#2048FF] text-white hover:bg-[#1700AC] transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer'
                                    >
                                        <RefreshCw size={12} className={googleSyncLoading ? 'animate-spin' : ''} />
                                        {googleSyncLoading ? 'Sincronizando' : 'Sync'}
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleConnectGoogle}
                                        className='min-w-[126px] px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-blue-500/30 text-blue-700 hover:bg-blue-500/10 transition-colors flex items-center justify-center gap-2 cursor-pointer'
                                    >
                                        <Link2 size={12} />
                                        Conectar
                                    </button>
                                )}
                            </div>

                            <div className='xl:col-span-4 flex bg-[var(--background)] rounded-2xl p-1 border border-[var(--card-border)] min-h-[52px]'>
                                <button
                                    onClick={() => setViewMode('list')}
                                    className={`flex-1 px-5 py-2 rounded-xl text-[10px] font-black transition-colors uppercase tracking-widest cursor-pointer ${viewMode === 'list' ? 'bg-[#2048FF] text-white shadow-lg shadow-blue-500/20' : 'text-gray-400 hover:text-blue-500 hover:bg-blue-500/10'}`}
                                >
                                    Lista
                                </button>
                                <button
                                    onClick={() => setViewMode('week')}
                                    disabled={isPastOnlyMode}
                                    className={`flex-1 px-5 py-2 rounded-xl text-[10px] font-black transition-colors uppercase tracking-widest ${isPastOnlyMode ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'} ${viewMode === 'week' ? 'bg-[#2048FF] text-white shadow-lg shadow-blue-500/20' : 'text-gray-400 hover:text-blue-500 hover:bg-blue-500/10'}`}
                                >
                                    Semana
                                </button>
                                <button
                                    onClick={() => setViewMode('month')}
                                    disabled={isPastOnlyMode}
                                    className={`flex-1 px-5 py-2 rounded-xl text-[10px] font-black transition-colors uppercase tracking-widest ${isPastOnlyMode ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'} ${viewMode === 'month' ? 'bg-[#2048FF] text-white shadow-lg shadow-blue-500/20' : 'text-gray-400 hover:text-blue-500 hover:bg-blue-500/10'}`}
                                >
                                    Mes
                                </button>
                            </div>

                            <button
                                onClick={() => { void openQuickCreateMeetingFlow() }}
                                className='xl:col-span-4 h-[52px] px-5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-colors border-2 border-blue-500 bg-[#2048FF] text-white shadow-lg shadow-blue-500/20 hover:bg-[#1700AC] hover:border-[#1700AC] flex items-center justify-center gap-2 cursor-pointer'
                            >
                                <CalendarDays size={14} />
                                Nueva Junta
                            </button>

                            <button
                                onClick={() => setIsEditMode(!isEditMode)}
                                className={`xl:col-span-4 h-[52px] px-5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-colors border-2 flex items-center justify-center gap-2 cursor-pointer ${isEditMode
                                    ? 'bg-rose-500 border-rose-600 text-white shadow-lg shadow-rose-500/20'
                                    : 'border-[var(--card-border)] text-[var(--text-primary)] hover:border-blue-500 hover:text-blue-500 hover:bg-blue-500/10'
                                    }`}
                            >
                                {isEditMode ? <ShieldCheck size={14} /> : <Pencil size={14} />}
                                {isEditMode ? 'Finalizar' : 'Editar'}
                            </button>
                        </div>
                    </div>
                </div>

                <div className='flex flex-wrap items-center gap-3 px-4 py-3 rounded-2xl border' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                    <span className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)' }}>
                        Código de color
                    </span>
                    <span className='inline-flex items-center gap-2 px-3 py-1 rounded-xl border text-[10px] font-black uppercase tracking-wider' style={{ borderColor: 'color-mix(in srgb, #2048FF 42%, var(--card-border))', background: 'color-mix(in srgb, #2048FF 11%, var(--card-bg))', color: 'color-mix(in srgb, var(--text-primary) 78%, #2048FF)' }}>
                        <span className='w-2 h-2 rounded-full bg-[#2048FF]' />
                        Incluido en la junta
                    </span>
                    <span className='inline-flex items-center gap-2 px-3 py-1 rounded-xl border text-[10px] font-black uppercase tracking-wider' style={{ borderColor: 'color-mix(in srgb, #f59e0b 46%, var(--card-border))', background: 'color-mix(in srgb, #f59e0b 12%, var(--card-bg))', color: 'color-mix(in srgb, var(--text-primary) 80%, #b45309)' }}>
                        <span className='w-2 h-2 rounded-full bg-amber-500' />
                        No incluido
                    </span>
                    {isAdmin && adminVisibilityMode === 'all_registered' && (
                        <span className='text-[10px] font-semibold' style={{ color: 'var(--text-secondary)' }}>
                            Vista admin activa: mostrando eventos registrados de todos los usuarios.
                        </span>
                    )}
                    <span className='text-[10px] font-semibold' style={{ color: 'var(--text-secondary)' }}>
                        {`Mostrando ${filteredMeetings.length} de ${meetings.length} juntas (${timelineMode === 'past_only' ? 'solo pasadas' : timelineMode === 'upcoming_only' ? 'solo próximas' : 'historial + próximas'}).`}
                    </span>
                </div>

                {(googleSyncSummary || googleLastRefresh) && (
                    <div className='rounded-2xl border px-5 py-3 flex items-center justify-between gap-3' style={{ background: 'color-mix(in srgb, var(--card-bg) 88%, #dbeafe)', borderColor: 'color-mix(in srgb, var(--card-border) 78%, #bfdbfe)' }}>
                        <p className='text-xs font-semibold' style={{ color: 'var(--text-secondary)' }}>
                            {googleSyncSummary || 'Google Calendar actualizado'}
                        </p>
                        {googleLastRefresh && (
                            <span className='text-[10px] font-black uppercase tracking-widest text-blue-600'>
                                Actualizado {googleLastRefresh.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true })}
                            </span>
                        )}
                    </div>
                )}

                {/* Content Area */}
                <div className='flex-1 overflow-hidden p-8 flex flex-col min-h-0'>
                    <div className='max-w-7xl mx-auto w-full flex-1 flex flex-col min-h-0'>
                        {filteredMeetings.length === 0 && viewMode !== 'month' ? (
                            <div className='flex-1 flex flex-col items-center justify-center rounded-[40px] shadow-2xl shadow-blue-500/5 p-12 text-center border' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                                <div className='ah-icon-card ah-icon-card-lg mb-6'>
                                    <CalendarDays size={42} strokeWidth={2} />
                                </div>
                                <h3 className='text-3xl font-black mb-3' style={{ color: 'var(--text-primary)' }}>
                                    {meetingSearch.trim()
                                        ? 'Sin resultados para tu búsqueda'
                                        : timelineMode === 'past_only'
                                            ? 'No hay juntas pasadas registradas'
                                            : timelineMode === 'upcoming_only'
                                                ? 'No hay juntas próximas registradas'
                                                : 'No hay juntas registradas'}
                                </h3>
                                <p className='mb-8 font-medium max-w-sm' style={{ color: 'var(--text-secondary)' }}>
                                    {meetingSearch.trim()
                                        ? 'Prueba con otro nombre de empresa o quita el filtro para ver más juntas.'
                                        : (
                                            isAdmin && adminVisibilityMode === 'all_registered'
                                                ? 'No hay eventos registrados para el filtro actual de responsables.'
                                                : timelineMode === 'past_only'
                                                    ? 'Cuando se registren juntas pasadas o completes juntas actuales, aparecerán aquí.'
                                                    : 'Empieza agendando una reunión con uno de tus leads para verla aquí.'
                                        )}
                                </p>
                                {meetingSearch.trim() ? (
                                    <button
                                        type='button'
                                        onClick={() => setMeetingSearch('')}
                                        className='px-8 py-3 bg-[#2048FF] text-white rounded-2xl font-black shadow-xl shadow-blue-500/20 hover:bg-[#1700AC] transition-all transform hover:-translate-y-1 cursor-pointer'
                                    >
                                        Limpiar búsqueda
                                    </button>
                                ) : (
                                    <a href='/empresas?view=leads' className='px-8 py-3 bg-[#2048FF] text-white rounded-2xl font-black shadow-xl shadow-blue-500/20 hover:bg-[#1700AC] transition-all transform hover:-translate-y-1'>
                                        Ir a Leads
                                    </a>
                                )}
                            </div>
                        ) : (
                            <div className='flex-1 animate-in fade-in slide-in-from-bottom-4 duration-700 overflow-y-auto custom-scrollbar pr-2 min-h-0'>
                                {viewMode === 'month' ? (
                                    <CalendarMonthView
                                        meetings={filteredMeetings}
                                        monthDate={calendarMonthDate}
                                        onChangeMonth={setCalendarMonthDate}
                                        onEditMeeting={handleEditMeeting}
                                        isEditMode={isEditMode}
                                        currentUserId={auth.user?.id || null}
                                        currentUserEmail={auth.user?.email || null}
                                        currentUsername={auth.profile?.username || null}
                                    />
                                ) : viewMode === 'list' ? (
                                    isPastOnlyMode ? (
                                        <div className='rounded-[34px] border shadow-xl overflow-hidden flex flex-col min-h-[380px]' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                                            <div className='max-h-[560px] overflow-y-auto custom-scrollbar'>
                                                <table className='w-full text-[11px]'>
                                                    <thead className='sticky top-0 z-10' style={{ background: 'color-mix(in srgb, var(--card-bg) 88%, var(--hover-bg))' }}>
                                                        <tr className='border-b' style={{ borderColor: 'var(--card-border)' }}>
                                                            <th className='px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.14em]' style={{ color: 'var(--text-secondary)' }}>Fecha</th>
                                                            <th className='px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.14em]' style={{ color: 'var(--text-secondary)' }}>Empresa</th>
                                                            <th className='px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.14em]' style={{ color: 'var(--text-secondary)' }}>Junta</th>
                                                            <th className='px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.14em]' style={{ color: 'var(--text-secondary)' }}>Tipo</th>
                                                            <th className='px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.14em]' style={{ color: 'var(--text-secondary)' }}>Responsable</th>
                                                            <th className='px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.14em]' style={{ color: 'var(--text-secondary)' }}>Estatus</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {paginatedPastMeetings.map((meeting) => {
                                                            const startTime = new Date(meeting.start_time)
                                                            const historicalStatusMeta = getHistoricalMeetingStatusMeta(meeting, currentTime)
                                                            return (
                                                                <tr key={meeting.id} className='border-b last:border-0' style={{ borderColor: 'var(--card-border)' }}>
                                                                    <td className='px-3 py-2 align-middle whitespace-nowrap'>
                                                                        <p className='text-[11px] font-black tabular-nums leading-none' style={{ color: 'var(--text-primary)' }}>
                                                                            {startTime.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' })}
                                                                        </p>
                                                                        <p className='text-[10px] mt-0.5' style={{ color: 'var(--text-secondary)' }}>
                                                                            {startTime.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                                                        </p>
                                                                    </td>
                                                                    <td className='px-3 py-2 align-middle max-w-[180px]'>
                                                                        <p className='truncate text-[11px] font-bold' style={{ color: 'var(--text-primary)' }}>
                                                                            {meeting.empresa || 'Sin empresa'}
                                                                        </p>
                                                                    </td>
                                                                    <td className='px-3 py-2 align-middle max-w-[260px]'>
                                                                        <p className='truncate text-[11px] font-bold' style={{ color: 'var(--text-primary)' }}>
                                                                            {meeting.title}
                                                                        </p>
                                                                    </td>
                                                                    <td className='px-3 py-2 align-middle whitespace-nowrap text-[11px] font-semibold' style={{ color: 'var(--text-secondary)' }}>
                                                                        {String(meeting.meeting_type || 'junta').replace(/_/g, ' ')}
                                                                    </td>
                                                                    <td className='px-3 py-2 align-middle max-w-[180px]'>
                                                                        <p className='truncate text-[11px] font-semibold' style={{ color: 'var(--text-secondary)' }}>
                                                                            {meeting.seller_name || 'Sin responsable'}
                                                                        </p>
                                                                    </td>
                                                                    <td className='px-3 py-2 align-middle'>
                                                                        <span
                                                                            className='inline-flex items-center px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-[0.08em] border whitespace-nowrap'
                                                                            style={historicalStatusMeta.style}
                                                                        >
                                                                            {historicalStatusMeta.label}
                                                                        </span>
                                                                    </td>
                                                                </tr>
                                                            )
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>

                                            {pastMeetingsTotalPages > 1 && (
                                                <div className='flex items-center justify-between gap-3 px-4 py-3 border-t' style={{ borderColor: 'var(--card-border)', background: 'color-mix(in srgb, var(--card-bg) 90%, var(--hover-bg))' }}>
                                                    <button
                                                        type='button'
                                                        onClick={() => setPastMeetingsTablePage((currentPage) => Math.max(1, currentPage - 1))}
                                                        disabled={pastMeetingsTablePage <= 1}
                                                        className='px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-[0.12em] border transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer'
                                                        style={{ borderColor: 'var(--card-border)', color: 'var(--text-secondary)' }}
                                                    >
                                                        Anterior
                                                    </button>
                                                    <span className='text-[10px] font-black uppercase tracking-[0.12em]' style={{ color: 'var(--text-secondary)' }}>
                                                        Página {pastMeetingsTablePage} de {pastMeetingsTotalPages}
                                                    </span>
                                                    <button
                                                        type='button'
                                                        onClick={() => setPastMeetingsTablePage((currentPage) => Math.min(pastMeetingsTotalPages, currentPage + 1))}
                                                        disabled={pastMeetingsTablePage >= pastMeetingsTotalPages}
                                                        className='px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-[0.12em] border transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer'
                                                        style={{ borderColor: 'var(--card-border)', color: 'var(--text-secondary)' }}
                                                    >
                                                        Siguiente
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className='space-y-10 pb-10'>
                                            {groupedMeetings.map(({ dateKey, label, dayMeetings }) => (
                                                <div key={dateKey} className='space-y-6'>
                                                    <div className='flex items-center gap-4'>
                                                        <div className='px-6 py-2.5 bg-[#0A1635] rounded-[20px] shadow-xl'>
                                                            <h2 className='text-[10px] font-black text-white uppercase tracking-[0.2em]'>{label}</h2>
                                                        </div>
                                                        <div className='h-px flex-1 bg-[var(--card-border)] opacity-30 shadow-sm' />
                                                        <span className='text-[10px] font-black opacity-30 uppercase tracking-widest' style={{ color: 'var(--text-primary)' }}>{dayMeetings.length} Juntas</span>
                                                    </div>

                                                    <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8'>
                                                        {dayMeetings.map((meeting) => {
                                                            const { level: currentUrgencyLevel } = calculateMeetingUrgency(meeting.start_time, meeting.duration_minutes, currentTime)
                                                            const urgency = getUrgencyColor(currentUrgencyLevel || 'scheduled')
                                                            const stage = getStageColor(meeting.etapa || '')
                                                            const startTime = new Date(meeting.start_time)
                                                            const isHistoricalMeeting = isPastMeeting(meeting, currentTime)
                                                            const historicalStatusMeta = getHistoricalMeetingStatusMeta(meeting, currentTime)
                                                            const urgencyRibbonStyle = isHistoricalMeeting
                                                                ? historicalStatusMeta.style
                                                                : getUrgencyRibbonStyle(currentUrgencyLevel || 'scheduled')
                                                            const urgencyRibbonLabel = isHistoricalMeeting
                                                                ? historicalStatusMeta.label
                                                                : urgency.label
                                                            const isUserMeeting = meetingIncludesUser(
                                                                meeting,
                                                                auth.user?.id || null,
                                                                auth.user?.email || null,
                                                                auth.profile?.username || null
                                                            )
                                                            const participationCardStyle = getParticipationStyle(isUserMeeting)
                                                            const participationBadgeStyle = getParticipationBadgeStyle(isUserMeeting)

                                                            return (
                                                                <div
                                                                    key={meeting.id}
                                                                    className={`group relative p-8 rounded-[40px] border-2 transition-all hover:shadow-[0_20px_50px_rgba(0,0,0,0.1)] overflow-hidden ${isEditMode ? 'cursor-pointer' : 'cursor-default'}`}
                                                                    style={{
                                                                        ...participationCardStyle
                                                                    }}
                                                                    onClick={() => isEditMode ? handleEditMeeting(meeting) : null}
                                                                >
                                                                    <div
                                                                        className='absolute top-0 left-10 px-4 py-1 rounded-b-2xl text-[8px] font-black uppercase tracking-widest shadow-sm border'
                                                                        style={participationBadgeStyle}
                                                                    >
                                                                        {isUserMeeting ? 'Incluido' : 'No incluido'}
                                                                    </div>

                                                                    <div className='absolute top-0 right-10 px-4 py-1 rounded-b-2xl text-[8px] font-black uppercase tracking-widest shadow-sm border'
                                                                        style={urgencyRibbonStyle}
                                                                    >
                                                                        {urgencyRibbonLabel}
                                                                    </div>

                                                                    <div className='flex items-start justify-between mb-8'>
                                                                        <div
                                                                            className='w-[110px] h-20 rounded-[24px] flex flex-col items-center justify-center shadow-inner group-hover:scale-105 transition-all'
                                                                            style={{ background: 'var(--background)' }}
                                                                        >
                                                                            <div className='flex items-end gap-0.5 leading-none'>
                                                                                <span className='text-[30px] font-black tabular-nums tracking-tight' style={{ color: 'var(--text-primary)' }}>
                                                                                    {startTime.getHours().toString().padStart(2, '0')}
                                                                                </span>
                                                                                <span className='text-[22px] font-black tabular-nums leading-none pb-[1px]' style={{ color: 'var(--text-primary)' }}>
                                                                                    :{startTime.getMinutes().toString().padStart(2, '0')}
                                                                                </span>
                                                                            </div>
                                                                            <p className='text-[9px] font-black uppercase tracking-[0.14em] mt-1' style={{ color: 'var(--text-secondary)' }}>
                                                                                Hora
                                                                            </p>
                                                                        </div>

                                                                        <div className='flex flex-col gap-2 items-end mt-2'>
                                                                            <span className={`px-3 py-1.5 rounded-xl text-[9px] font-black border-2 uppercase tracking-wider ${stage.bg} ${stage.text} ${stage.border}`}>
                                                                                {meeting.etapa}
                                                                            </span>
                                                                            <div className='flex items-center gap-1.5 px-3 py-1 bg-gray-50 rounded-lg border border-gray-100'>
                                                                                <Clock size={10} className='text-gray-400' />
                                                                                <span className='text-[9px] font-bold text-gray-500 uppercase'>{meeting.duration_minutes}m</span>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <div className='space-y-4 mb-8'>
                                                                        <h3 className='text-xl font-black leading-tight group-hover:text-[#2048FF] transition-colors' style={{ color: 'var(--text-primary)' }}>
                                                                            {meeting.title}
                                                                        </h3>
                                                                        <div className='space-y-2'>
                                                                            <div className='flex items-center gap-3'>
                                                                                <div className='w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center'>
                                                                                    <Building2 size={12} strokeWidth={2.2} className='text-[#2048FF]' />
                                                                                </div>
                                                                                <p className='text-xs font-black uppercase tracking-tight truncate' style={{ color: 'var(--text-secondary)' }}>{meeting.empresa}</p>
                                                                            </div>
                                                                            {meeting.seller_name && (
                                                                                <div className='flex items-center gap-3'>
                                                                                    <div className='w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center'>
                                                                                        <UserCircle2 size={12} strokeWidth={2.2} className='text-emerald-600' />
                                                                                    </div>
                                                                                    <p className='text-[10px] font-bold opacity-60 uppercase tracking-widest truncate' style={{ color: 'var(--text-secondary)' }}>{meeting.seller_name}</p>
                                                                                </div>
                                                                            )}
                                                                        </div>

                                                                        {meeting.notes?.includes('[MEET_LINK]:') && (
                                                                            <a
                                                                                href={meeting.notes?.match(/\[MEET_LINK\]:(https:\/\/\S+)/)?.[1] || '#'}
                                                                                target='_blank'
                                                                                rel='noopener noreferrer'
                                                                                onClick={(e) => e.stopPropagation()}
                                                                                className='flex items-center justify-center gap-3 w-full py-3.5 bg-[#2048FF] text-white text-[10px] font-black uppercase tracking-[0.15em] rounded-[20px] hover:bg-[#1700AC] transition-all shadow-xl shadow-blue-500/20 active:scale-95 group/meet'
                                                                            >
                                                                                <Video size={14} className='transition-transform group-hover/meet:scale-125' />
                                                                                Unirse a Videollamada
                                                                            </a>
                                                                        )}
                                                                    </div>

                                                                    {meeting.frozen_probability_value !== null && (
                                                                        <div className='p-4 bg-gradient-to-br from-purple-500/10 to-indigo-500/10 rounded-3xl border border-purple-500/20 flex items-center justify-between mb-4'>
                                                                            <div className='flex flex-col'>
                                                                                <span className='text-[8px] font-black text-purple-600 uppercase tracking-[0.2em]'>Forecast</span>
                                                                                <span className='text-[10px] font-black text-purple-900 uppercase'>Congelado</span>
                                                                            </div>
                                                                            <span className='text-2xl font-black text-purple-600 tracking-tighter'>
                                                                                {meeting.frozen_probability_value}%
                                                                            </span>
                                                                        </div>
                                                                    )}

                                                                    {meeting.meeting_status === 'pending_confirmation' && (
                                                                        <div className='p-4 bg-rose-50 rounded-3xl border-2 border-rose-100 flex items-center gap-4 animate-pulse'>
                                                                            <AlertCircle size={20} className='text-rose-500' />
                                                                            <p className='text-[9px] font-black text-rose-700 uppercase leading-tight tracking-wider'>Requiere Confirmación Urgente</p>
                                                                        </div>
                                                                    )}

                                                                    {isEditMode && (meeting.meeting_status === 'scheduled' || meeting.meeting_status === 'not_held') && (
                                                                        <div className='absolute inset-0 bg-white/70 backdrop-blur-md flex items-center justify-center gap-4 opacity-0 group-hover:opacity-100 transition-all z-10'>
                                                                            <button
                                                                                onClick={(e) => { e.stopPropagation(); handleEditMeeting(meeting); }}
                                                                                className='w-14 h-14 bg-white text-blue-600 rounded-[22px] shadow-2xl border border-blue-100 hover:bg-blue-600 hover:text-white transition-all transform hover:scale-110 flex items-center justify-center'
                                                                            >
                                                                                <Pencil size={24} strokeWidth={2.5} />
                                                                            </button>
                                                                            <button
                                                                                onClick={(e) => { e.stopPropagation(); handleDeleteMeeting(meeting); }}
                                                                                className='w-14 h-14 bg-white text-rose-600 rounded-[22px] shadow-2xl border border-rose-100 hover:bg-rose-600 hover:text-white transition-all transform hover:scale-110 flex items-center justify-center'
                                                                            >
                                                                                <Trash2 size={24} strokeWidth={2.5} />
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )
                                ) : (
                                    <div className='rounded-[40px] border shadow-2xl overflow-hidden flex-1 flex flex-col' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                                        <CalendarWeekView
                                            meetings={filteredMeetings}
                                            onEditMeeting={handleEditMeeting}
                                            isEditMode={isEditMode}
                                            getUrgencyColor={getUrgencyColor}
                                            currentUserId={auth.user?.id || null}
                                            currentUserEmail={auth.user?.email || null}
                                            currentUsername={auth.profile?.username || null}
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {calendarStatus.connected && (
                            <div className='mt-8 rounded-[34px] border shadow-xl p-6 md:p-8 space-y-5' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                                <div className='flex flex-wrap items-center justify-between gap-4'>
                                    <div className='flex items-center gap-3'>
                                        <div className='w-11 h-11 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center'>
                                            <CalendarClock size={20} className='text-blue-600' />
                                        </div>
                                        <div>
                                            <h3 className='text-xl font-black' style={{ color: 'var(--text-primary)' }}>
                                                Eventos de Google Calendar
                                            </h3>
                                            <p className='text-xs font-medium' style={{ color: 'var(--text-secondary)' }}>
                                                Se muestran también los eventos creados directamente en Google.
                                            </p>
                                        </div>
                                    </div>
                                    <div className='text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-xl border border-blue-500/20 text-blue-600 bg-blue-500/10'>
                                        {filteredGoogleEvents.length} eventos
                                    </div>
                                </div>

                                {googleEventsLoading ? (
                                    <div className='py-10 flex flex-col items-center justify-center gap-3 text-sm font-semibold' style={{ color: 'var(--text-secondary)' }}>
                                        <RefreshCw size={18} className='animate-spin text-blue-500' />
                                        Cargando eventos desde Google Calendar...
                                    </div>
                                ) : filteredGoogleEvents.length === 0 ? (
                                    <div className='rounded-2xl border border-dashed py-10 text-center text-sm font-semibold' style={{ color: 'var(--text-secondary)', borderColor: 'var(--card-border)' }}>
                                        {meetingSearch.trim()
                                            ? 'No hay eventos de Google Calendar para esa búsqueda.'
                                            : 'No hay eventos en el rango visible de Google Calendar.'}
                                    </div>
                                ) : (
                                    <div className='max-h-[420px] overflow-y-auto custom-scrollbar pr-1 space-y-3'>
                                        {filteredGoogleEvents.map((event) => {
                                            const statusBadge = getGoogleStatusBadge(event.status)
                                            const StatusIcon = statusBadge.icon
                                            const linked = Boolean(event.linkedMeeting)
                                            const normalizedSessionEmail = String(auth.user?.email || '').trim().toLowerCase()
                                            const includesSessionUser = Boolean(normalizedSessionEmail) && (
                                                String(event.organizer?.email || '').trim().toLowerCase() === normalizedSessionEmail
                                                || String(event.creator?.email || '').trim().toLowerCase() === normalizedSessionEmail
                                                || event.attendees.some((attendee) => attendee.self || String(attendee.email || '').trim().toLowerCase() === normalizedSessionEmail)
                                            )

                                            return (
                                                <article
                                                    key={event.id}
                                                    className='rounded-2xl border p-4 md:p-5 space-y-3'
                                                    style={{
                                                        borderColor: includesSessionUser
                                                            ? 'color-mix(in srgb, #2048FF 48%, var(--card-border))'
                                                            : 'color-mix(in srgb, #f59e0b 52%, var(--card-border))',
                                                        background: includesSessionUser
                                                            ? 'color-mix(in srgb, #DBEAFE 22%, var(--background))'
                                                            : 'color-mix(in srgb, #FEF3C7 20%, var(--background))'
                                                    }}
                                                >
                                                    <div className='flex flex-wrap items-start justify-between gap-3'>
                                                        <div className='space-y-1.5 min-w-0'>
                                                            <h4 className='text-base font-black leading-tight truncate' style={{ color: 'var(--text-primary)' }}>
                                                                {event.title}
                                                            </h4>
                                                            <p className='text-xs font-semibold' style={{ color: 'var(--text-secondary)' }}>
                                                                {formatGoogleEventWindow(event)}
                                                            </p>
                                                        </div>
                                                        <div className='flex items-center flex-wrap gap-2'>
                                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${statusBadge.className}`}>
                                                                <StatusIcon size={12} />
                                                                {statusBadge.label}
                                                            </span>
                                                            <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${linked
                                                                ? 'text-blue-700 border-blue-500/25 bg-blue-500/10'
                                                                : 'text-slate-600 border-slate-500/20 bg-slate-500/10'
                                                                }`}>
                                                                {linked ? 'Vinculado CRM' : 'Solo Google'}
                                                            </span>
                                                            <span
                                                                className='inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border'
                                                                style={includesSessionUser
                                                                    ? {
                                                                        color: 'color-mix(in srgb, var(--text-primary) 78%, #2048FF)',
                                                                        borderColor: 'color-mix(in srgb, #2048FF 46%, var(--card-border))',
                                                                        background: 'color-mix(in srgb, #2048FF 11%, var(--card-bg))'
                                                                    }
                                                                    : {
                                                                        color: 'color-mix(in srgb, var(--text-primary) 80%, #b45309)',
                                                                        borderColor: 'color-mix(in srgb, #f59e0b 48%, var(--card-border))',
                                                                        background: 'color-mix(in srgb, #f59e0b 14%, var(--card-bg))'
                                                                    }}
                                                            >
                                                                {includesSessionUser ? 'Incluido' : 'No incluido'}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className='flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] font-semibold' style={{ color: 'var(--text-secondary)' }}>
                                                        {event.location && (
                                                            <span className='inline-flex items-center gap-1.5'>
                                                                <MapPin size={12} />
                                                                {event.location}
                                                            </span>
                                                        )}
                                                        {(event.organizer?.email || event.organizer?.displayName) && (
                                                            <span className='inline-flex items-center gap-1.5'>
                                                                <UserRound size={12} />
                                                                {event.organizer?.displayName || event.organizer?.email}
                                                            </span>
                                                        )}
                                                        <span>Asistentes: {event.attendees.length}</span>
                                                        {event.updatedAt && (
                                                            <span>
                                                                Actualizado: {new Date(event.updatedAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })} {new Date(event.updatedAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {event.description && (
                                                        <p className='text-xs leading-relaxed line-clamp-2' style={{ color: 'var(--text-secondary)' }}>
                                                            {event.description}
                                                        </p>
                                                    )}

                                                    <div className='flex flex-wrap items-center gap-2 pt-1'>
                                                        {event.htmlLink && (
                                                            <a
                                                                href={event.htmlLink}
                                                                target='_blank'
                                                                rel='noopener noreferrer'
                                                                className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-[#2048FF] text-white hover:bg-[#1700AC] transition-colors'
                                                            >
                                                                <Link2 size={12} />
                                                                Abrir en Google
                                                            </a>
                                                        )}
                                                        {event.meetLink && (
                                                            <a
                                                                href={event.meetLink}
                                                                target='_blank'
                                                                rel='noopener noreferrer'
                                                                className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border border-emerald-500/30 text-emerald-700 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors'
                                                            >
                                                                <Video size={12} />
                                                                Meet
                                                            </a>
                                                        )}
                                                    </div>
                                                </article>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    <RichardDawkinsFooter />
                </div>
            </div>

            {isCreateMeetingLeadPickerOpen && (
                <div className='ah-modal-overlay z-[130]'>
                    <div className='ah-modal-panel w-full max-w-xl'>
                        <div className='ah-modal-header'>
                            <div>
                                <h3 className='ah-modal-title text-lg'>Seleccionar Lead para Junta</h3>
                                <p className='ah-modal-subtitle'>Elige un lead activo para abrir el formulario de junta</p>
                            </div>
                            <button
                                className='ah-modal-close cursor-pointer'
                                onClick={() => setIsCreateMeetingLeadPickerOpen(false)}
                                aria-label='Cerrar selector de lead'
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className='p-5 max-h-[420px] overflow-y-auto custom-scrollbar space-y-2'>
                            {createMeetingLeadLoading ? (
                                <div className='py-8 text-center text-sm font-bold' style={{ color: 'var(--text-secondary)' }}>
                                    Cargando leads...
                                </div>
                            ) : createMeetingLeadOptions.length === 0 ? (
                                <div className='rounded-2xl border border-[var(--card-border)] bg-[var(--hover-bg)] p-5 text-center space-y-3'>
                                    <p className='text-sm font-bold' style={{ color: 'var(--text-primary)' }}>
                                        No hay leads activos disponibles.
                                    </p>
                                    <p className='text-xs font-semibold' style={{ color: 'var(--text-secondary)' }}>
                                        Crea un lead primero para poder agendar una junta.
                                    </p>
                                    <button
                                        type='button'
                                        onClick={() => {
                                            setIsCreateMeetingLeadPickerOpen(false)
                                            router.push('/empresas?view=leads&createCompany=1')
                                        }}
                                        className='px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-[#2048FF] text-white hover:bg-[#1700AC] transition-colors cursor-pointer'
                                    >
                                        Ir a crear lead
                                    </button>
                                </div>
                            ) : (
                                createMeetingLeadOptions.map((lead) => (
                                    <button
                                        key={lead.id}
                                        type='button'
                                        onClick={() => {
                                            setSelectedCreateMeetingLeadId(lead.id)
                                            setIsCreateMeetingLeadPickerOpen(false)
                                            setIsCreateMeetingModalOpen(true)
                                        }}
                                        className='w-full text-left rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] hover:border-[#2048FF]/35 hover:bg-[var(--hover-bg)] px-4 py-3 transition-all cursor-pointer'
                                    >
                                        <p className='text-sm font-black' style={{ color: 'var(--text-primary)' }}>
                                            {lead.nombre}
                                        </p>
                                        <p className='text-[10px] font-black uppercase tracking-[0.14em] mt-1' style={{ color: 'var(--text-secondary)' }}>
                                            {lead.empresa} · {lead.contacto || 'Sin contacto'}
                                        </p>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {selectedCreateMeetingLeadId != null && auth.user && (
                <MeetingModal
                    isOpen={isCreateMeetingModalOpen}
                    onClose={() => {
                        setIsCreateMeetingModalOpen(false)
                        setSelectedCreateMeetingLeadId(null)
                    }}
                    onSave={handleCreateMeetingSave}
                    leadId={selectedCreateMeetingLeadId}
                    sellerId={String(auth.user.id)}
                    mode='create'
                    creationMode='schedule'
                    leadContactSeed={{
                        contactName: selectedCreateMeetingLead?.contacto || selectedCreateMeetingLead?.nombre || null,
                        contactEmail: selectedCreateMeetingLead?.email || null,
                        contactPhone: selectedCreateMeetingLead?.telefono || null,
                        companyId: selectedCreateMeetingLead?.empresa_id || null,
                        companyName: selectedCreateMeetingLead?.empresa || null,
                        leadName: selectedCreateMeetingLead?.nombre || null
                    }}
                />
            )}

            {showEditModal && editMeetingData && (
                <MeetingModal
                    isOpen={showEditModal}
                    onClose={() => { setShowEditModal(false); setEditMeetingData(null); }}
                    onSave={handleSaveEdit}
                    leadId={editMeetingData.lead_id}
                    sellerId={editMeetingData.seller_id}
                    initialData={editMeetingData}
                    mode='edit'
                />
            )}

            <ConfirmModal
                isOpen={isConfirmModalOpen}
                onClose={() => setIsConfirmModalOpen(false)}
                onConfirm={confirmDeleteMeeting}
                title="Eliminar Reunión"
                message="¿Estás seguro de que deseas eliminar esta reunión? Esta acción no se puede deshacer."
                isDestructive={true}
            />
            <ConfirmModal
                isOpen={isAlertModalOpen}
                onClose={() => setIsAlertModalOpen(false)}
                onConfirm={() => setIsAlertModalOpen(false)}
                title={alertConfig.title}
                message={alertConfig.message}
                isDestructive={false}
            />
        </div>
    )
}
