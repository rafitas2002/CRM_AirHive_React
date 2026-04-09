'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getUpcomingMeetings, calculateMeetingUrgency, type MeetingWithUrgency } from '@/lib/confirmationService'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { CalendarDays, Video, Phone, Building2, AlertTriangle, MapPinned } from 'lucide-react'
import { useTheme, type Theme } from '@/lib/ThemeContext'

type UrgencyLevel = NonNullable<MeetingWithUrgency['urgencyLevel']>
type MeetingTimelineFilter = 'upcoming' | 'previous'
const PREVIOUS_MEETINGS_PAGE_SIZE = 18

type UrgencyVisual = {
    label: string
    panelBg: string
    panelBorder: string
    panelText: string
    chipBg: string
    chipBorder: string
    chipText: string
    iconColor: string
}

function getUrgencyVisuals(theme: Theme): Record<UrgencyLevel, UrgencyVisual> {
    const lightMode = theme === 'claro'
    const grayMode = theme === 'gris'

    return {
        in_progress: {
            label: 'En transcurso',
            panelBg: lightMode ? 'rgba(224, 231, 255, 0.78)' : grayMode ? 'rgba(99, 102, 241, 0.22)' : 'rgba(79, 70, 229, 0.24)',
            panelBorder: lightMode ? '#6366f1' : grayMode ? 'rgba(165, 180, 252, 0.62)' : 'rgba(165, 180, 252, 0.68)',
            panelText: lightMode ? '#312e81' : '#e0e7ff',
            chipBg: lightMode ? 'rgba(99, 102, 241, 0.14)' : grayMode ? 'rgba(99, 102, 241, 0.25)' : 'rgba(99, 102, 241, 0.28)',
            chipBorder: lightMode ? '#6366f1' : '#a5b4fc',
            chipText: lightMode ? '#4338ca' : '#e0e7ff',
            iconColor: lightMode ? '#4338ca' : '#c7d2fe'
        },
        overdue: {
            label: 'Vencida',
            panelBg: lightMode ? 'rgba(254, 226, 226, 0.86)' : grayMode ? 'rgba(239, 68, 68, 0.2)' : 'rgba(185, 28, 28, 0.28)',
            panelBorder: lightMode ? '#ef4444' : grayMode ? 'rgba(252, 165, 165, 0.62)' : 'rgba(248, 113, 113, 0.7)',
            panelText: lightMode ? '#7f1d1d' : '#fecaca',
            chipBg: lightMode ? 'rgba(239, 68, 68, 0.12)' : grayMode ? 'rgba(239, 68, 68, 0.24)' : 'rgba(220, 38, 38, 0.3)',
            chipBorder: lightMode ? '#ef4444' : '#fca5a5',
            chipText: lightMode ? '#b91c1c' : '#fecaca',
            iconColor: lightMode ? '#b91c1c' : '#fca5a5'
        },
        urgent: {
            label: 'Urgente',
            panelBg: lightMode ? 'rgba(255, 237, 213, 0.92)' : grayMode ? 'rgba(249, 115, 22, 0.18)' : 'rgba(194, 65, 12, 0.26)',
            panelBorder: lightMode ? '#fb923c' : grayMode ? 'rgba(253, 186, 116, 0.62)' : 'rgba(251, 146, 60, 0.7)',
            panelText: lightMode ? '#9a3412' : '#fed7aa',
            chipBg: lightMode ? 'rgba(249, 115, 22, 0.12)' : grayMode ? 'rgba(249, 115, 22, 0.23)' : 'rgba(249, 115, 22, 0.28)',
            chipBorder: lightMode ? '#fb923c' : '#fdba74',
            chipText: lightMode ? '#c2410c' : '#ffedd5',
            iconColor: lightMode ? '#c2410c' : '#fdba74'
        },
        today: {
            label: 'Hoy',
            panelBg: lightMode ? '#f8f4c8' : grayMode ? 'rgba(217, 119, 6, 0.22)' : 'rgba(146, 64, 14, 0.28)',
            panelBorder: lightMode ? '#eab308' : grayMode ? 'rgba(252, 211, 77, 0.62)' : 'rgba(252, 211, 77, 0.68)',
            panelText: lightMode ? '#92400e' : '#fef3c7',
            chipBg: lightMode ? 'rgba(234, 179, 8, 0.13)' : grayMode ? 'rgba(251, 191, 36, 0.24)' : 'rgba(251, 191, 36, 0.28)',
            chipBorder: lightMode ? '#eab308' : '#fcd34d',
            chipText: lightMode ? '#a16207' : '#fef3c7',
            iconColor: lightMode ? '#1f3cff' : '#c7d2fe'
        },
        soon: {
            label: 'Próxima',
            panelBg: lightMode ? 'rgba(219, 234, 254, 0.82)' : grayMode ? 'rgba(59, 130, 246, 0.17)' : 'rgba(30, 64, 175, 0.26)',
            panelBorder: lightMode ? '#60a5fa' : grayMode ? 'rgba(147, 197, 253, 0.58)' : 'rgba(96, 165, 250, 0.66)',
            panelText: lightMode ? '#1e3a8a' : '#dbeafe',
            chipBg: lightMode ? 'rgba(59, 130, 246, 0.12)' : grayMode ? 'rgba(59, 130, 246, 0.24)' : 'rgba(59, 130, 246, 0.28)',
            chipBorder: lightMode ? '#60a5fa' : '#93c5fd',
            chipText: lightMode ? '#1d4ed8' : '#dbeafe',
            iconColor: lightMode ? '#1d4ed8' : '#93c5fd'
        },
        scheduled: {
            label: 'Programada',
            panelBg: lightMode ? 'rgba(241, 245, 249, 0.9)' : grayMode ? 'rgba(148, 163, 184, 0.16)' : 'rgba(71, 85, 105, 0.24)',
            panelBorder: lightMode ? '#cbd5e1' : grayMode ? 'rgba(203, 213, 225, 0.56)' : 'rgba(148, 163, 184, 0.6)',
            panelText: lightMode ? '#334155' : '#e2e8f0',
            chipBg: lightMode ? 'rgba(148, 163, 184, 0.15)' : grayMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(100, 116, 139, 0.28)',
            chipBorder: lightMode ? '#94a3b8' : '#cbd5e1',
            chipText: lightMode ? '#475569' : '#e2e8f0',
            iconColor: lightMode ? '#475569' : '#cbd5e1'
        }
    }
}

function getShellBackground(theme: Theme): string {
    if (theme === 'claro') return 'linear-gradient(168deg, #ffffff 0%, #f8fafc 100%)'
    if (theme === 'gris') return 'linear-gradient(168deg, #4b5563 0%, #3f4753 100%)'
    return 'linear-gradient(168deg, #1a1a1a 0%, #121212 100%)'
}

function getMeetingTypeLabel(type: string | null | undefined) {
    const normalized = String(type || '').trim().toLowerCase()
    if (normalized === 'video') return 'Video'
    if (normalized === 'llamada') return 'Llamada'
    if (normalized === 'presencial') return 'Presencial'
    if (normalized === 'visita_empresa') return 'Visita empresa'
    return 'Junta'
}

function getMeetingDurationMinutes(meeting: MeetingWithUrgency) {
    const duration = Number(meeting.duration_minutes || 60)
    return Number.isFinite(duration) && duration > 0 ? duration : 60
}

function isMeetingUpcoming(meeting: MeetingWithUrgency, now: Date) {
    const status = String(meeting.status || '').trim().toLowerCase()
    const meetingStatus = String(meeting.meeting_status || '').trim().toLowerCase()

    if (status === 'cancelled' || meetingStatus === 'cancelled') return false
    if (status === 'completed' || meetingStatus === 'held' || meetingStatus === 'not_held') return false

    const startMs = new Date(meeting.start_time).getTime()
    if (!Number.isFinite(startMs)) return false
    const endMs = startMs + getMeetingDurationMinutes(meeting) * 60 * 1000
    return now.getTime() <= endMs
}

function resolvePreviousMeetingStatus(meeting: MeetingWithUrgency, now: Date) {
    const status = String(meeting.status || '').trim().toLowerCase()
    const meetingStatus = String(meeting.meeting_status || '').trim().toLowerCase()
    const startMs = new Date(meeting.start_time).getTime()

    if (meetingStatus === 'not_held') {
        return {
            label: 'No concretada',
            bg: 'rgba(239, 68, 68, 0.14)',
            border: 'rgba(239, 68, 68, 0.46)',
            color: '#b91c1c'
        }
    }

    if (meetingStatus === 'held' || status === 'completed') {
        return {
            label: 'Completada',
            bg: 'rgba(34, 197, 94, 0.14)',
            border: 'rgba(34, 197, 94, 0.46)',
            color: '#166534'
        }
    }

    if (Number.isFinite(startMs) && startMs < now.getTime()) {
        return {
            label: 'Pendiente de confirmación',
            bg: 'rgba(245, 158, 11, 0.16)',
            border: 'rgba(245, 158, 11, 0.46)',
            color: '#9a3412'
        }
    }

    return {
        label: 'Programada',
        bg: 'rgba(100, 116, 139, 0.16)',
        border: 'rgba(100, 116, 139, 0.42)',
        color: '#334155'
    }
}

export default function UpcomingMeetingsWidget() {
    const [meetings, setMeetings] = useState<MeetingWithUrgency[]>([])
    const [loading, setLoading] = useState(true)
    const [supabase] = useState(() => createClient())
    const [currentTime, setCurrentTime] = useState(new Date())
    const [timelineFilter, setTimelineFilter] = useState<MeetingTimelineFilter>('upcoming')
    const [previousPage, setPreviousPage] = useState(1)
    const { theme } = useTheme()

    const urgencyVisuals = getUrgencyVisuals(theme)
    const shellBackground = getShellBackground(theme)
    const urgentWarningColor = theme === 'claro' ? '#b91c1c' : '#fca5a5'

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 10000)
        return () => clearInterval(timer)
    }, [])

    const fetchMeetings = useCallback(async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                setLoading(false)
                return
            }

            const { data: profileRow } = await supabase
                .from('profiles')
                .select('username')
                .eq('id', user.id)
                .maybeSingle()

            const upcomingMeetings = await getUpcomingMeetings(
                user.id,
                120,
                false,
                user.email || undefined,
                String((profileRow as { username?: string | null } | null)?.username || '').trim() || undefined,
                {
                    includeHistorical: true,
                    includeCancelled: false
                }
            )
            setMeetings(upcomingMeetings)
        } catch (error) {
            console.error('Error in fetchMeetings:', error)
            setMeetings([])
        } finally {
            setLoading(false)
        }
    }, [supabase])

    useEffect(() => {
        fetchMeetings()

        // Real-time listener for meeting changes
        const channel = supabase
            .channel('dashboard-meetings')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'meetings'
                },
                () => {
                    console.log('Real-time meeting update in widget')
                    fetchMeetings()
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [fetchMeetings, supabase])

    const { upcomingMeetings, previousMeetings } = useMemo(() => {
        const now = currentTime
        const upcoming = meetings
            .filter((meeting) => isMeetingUpcoming(meeting, now))
            .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

        const previous = meetings
            .filter((meeting) => !isMeetingUpcoming(meeting, now))
            .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())

        return { upcomingMeetings: upcoming, previousMeetings: previous }
    }, [meetings, currentTime])

    const activeUpcomingFilter = timelineFilter === 'upcoming'
    const visibleMeetingCount = activeUpcomingFilter ? upcomingMeetings.length : previousMeetings.length
    const previousMeetingsTotalPages = Math.max(1, Math.ceil(previousMeetings.length / PREVIOUS_MEETINGS_PAGE_SIZE))
    const previousMeetingsPageStart = (previousPage - 1) * PREVIOUS_MEETINGS_PAGE_SIZE
    const visiblePreviousMeetings = useMemo(
        () => previousMeetings.slice(previousMeetingsPageStart, previousMeetingsPageStart + PREVIOUS_MEETINGS_PAGE_SIZE),
        [previousMeetings, previousMeetingsPageStart]
    )

    useEffect(() => {
        setPreviousPage(1)
    }, [timelineFilter, previousMeetings.length])

    useEffect(() => {
        setPreviousPage((currentPage) => Math.min(currentPage, previousMeetingsTotalPages))
    }, [previousMeetingsTotalPages])

    if (loading) {
        return (
            <div
                className='p-6 rounded-3xl border shadow-sm'
                style={{ background: shellBackground, borderColor: 'var(--card-border)' }}
            >
                <h2 className='text-lg font-bold mb-4' style={{ color: 'var(--text-primary)' }}>
                    <span className='inline-flex items-center gap-2'>
                        <CalendarDays size={20} strokeWidth={2.2} className='text-[var(--accent-secondary)]' />
                        Próximas Juntas
                    </span>
                </h2>
                <p className='text-sm animate-pulse' style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>Cargando...</p>
            </div>
        )
    }

    if (meetings.length === 0) {
        return (
            <div
                className='p-6 rounded-3xl border shadow-sm'
                style={{ background: shellBackground, borderColor: 'var(--card-border)' }}
            >
                <h2 className='text-lg font-bold mb-4' style={{ color: 'var(--text-primary)' }}>
                    <span className='inline-flex items-center gap-2'>
                        <CalendarDays size={20} strokeWidth={2.2} className='text-[var(--accent-secondary)]' />
                        Próximas Juntas
                    </span>
                </h2>
                <div className='text-center py-6'>
                    <p className='text-sm mb-2' style={{ color: 'var(--text-secondary)' }}>No tienes juntas próximas</p>
                    <p className='text-xs' style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>Agenda juntas desde la ficha de cada lead</p>
                </div>
            </div>
        )
    }

    return (
        <div
            className='p-6 rounded-3xl border shadow-sm'
            style={{ background: shellBackground, borderColor: 'var(--card-border)' }}
        >
            <div className='flex items-center justify-between mb-4'>
                <h2 className='text-lg font-bold' style={{ color: 'var(--text-primary)' }}>
                    <span className='inline-flex items-center gap-2'>
                        <CalendarDays size={20} strokeWidth={2.2} className='text-[var(--accent-secondary)]' />
                        Juntas
                    </span>
                </h2>
                <Link
                    href='/calendario'
                    className='text-xs font-bold hover:underline'
                    style={{ color: 'var(--accent-secondary)' }}
                >
                    Ver calendario →
                </Link>
            </div>

            <div className='mb-4 inline-flex items-center gap-2 rounded-2xl border p-1.5' style={{ borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}>
                <button
                    type='button'
                    onClick={() => setTimelineFilter('upcoming')}
                    className='px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-[0.12em] transition-colors cursor-pointer'
                    style={activeUpcomingFilter
                        ? { background: 'var(--accent-secondary)', color: '#fff' }
                        : { color: 'var(--text-secondary)' }}
                >
                    Próximas ({upcomingMeetings.length})
                </button>
                <button
                    type='button'
                    onClick={() => setTimelineFilter('previous')}
                    className='px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-[0.12em] transition-colors cursor-pointer'
                    style={!activeUpcomingFilter
                        ? { background: 'var(--accent-secondary)', color: '#fff' }
                        : { color: 'var(--text-secondary)' }}
                >
                    Anteriores ({previousMeetings.length})
                </button>
            </div>

            {activeUpcomingFilter ? (
                upcomingMeetings.length === 0 ? (
                    <div className='text-center py-6 rounded-2xl border' style={{ borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}>
                        <p className='text-sm mb-1' style={{ color: 'var(--text-primary)' }}>Sin juntas próximas</p>
                        <p className='text-xs' style={{ color: 'var(--text-secondary)' }}>Usa calendario para agendar la siguiente reunión</p>
                    </div>
                ) : (
                    <>
                        <div className='space-y-3'>
                            {upcomingMeetings.map((meeting) => {
                                const { level, hoursUntil: liveHoursUntil } = calculateMeetingUrgency(meeting.start_time, meeting.duration_minutes, currentTime)
                                const urgency = urgencyVisuals[(level || 'scheduled') as UrgencyLevel]
                                const startTime = new Date(meeting.start_time)

                                return (
                                    <div
                                        key={meeting.id}
                                        className='p-4 rounded-2xl border-2 transition-all hover:shadow-md'
                                        style={{
                                            background: urgency.panelBg,
                                            borderColor: urgency.panelBorder
                                        }}
                                    >
                                        <div className='flex items-start justify-between gap-3'>
                                            <div className='flex-1 min-w-0'>
                                                <div className='flex items-center gap-2 mb-1'>
                                                    <span
                                                        className='px-3 py-1 rounded-full text-xs font-black border'
                                                        style={{
                                                            background: urgency.chipBg,
                                                            borderColor: urgency.chipBorder,
                                                            color: urgency.chipText
                                                        }}
                                                    >
                                                        {urgency.label}
                                                    </span>
                                                    {meeting.meeting_type === 'video' && <Video size={14} style={{ color: urgency.iconColor }} />}
                                                    {meeting.meeting_type === 'llamada' && <Phone size={14} style={{ color: urgency.iconColor }} />}
                                                    {meeting.meeting_type === 'presencial' && <Building2 size={14} style={{ color: urgency.iconColor }} />}
                                                    {meeting.meeting_type === 'visita_empresa' && <MapPinned size={14} style={{ color: urgency.iconColor }} />}
                                                </div>
                                                <p className='font-bold text-sm truncate' style={{ color: urgency.panelText }}>
                                                    {meeting.title}
                                                </p>
                                                <p className='text-xs truncate' style={{ color: urgency.panelText, opacity: 0.8 }}>
                                                    {meeting.empresa}
                                                </p>
                                                <p className='text-xs mt-1' style={{ color: urgency.panelText, opacity: 0.72 }}>
                                                    {startTime.toLocaleDateString('es-MX', {
                                                        weekday: 'short',
                                                        month: 'short',
                                                        day: 'numeric'
                                                    })}{' '}
                                                    •{' '}
                                                    {startTime.toLocaleTimeString('es-MX', {
                                                        hour: '2-digit',
                                                        minute: '2-digit'
                                                    })}
                                                </p>

                                                {meeting.notes?.includes('[MEET_LINK]:') && (
                                                    <div className='mt-2'>
                                                        {(() => {
                                                            const meetLink = meeting.notes?.match(/\[MEET_LINK\]:(https:\/\/\S+)/)?.[1]
                                                            if (!meetLink) return null
                                                            return (
                                                                <a
                                                                    href={meetLink}
                                                                    target='_blank'
                                                                    rel='noopener noreferrer'
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    className='inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-xl border transition-all hover:brightness-110'
                                                                    style={{
                                                                        background: 'var(--accent-secondary)',
                                                                        borderColor: 'var(--accent-secondary)',
                                                                        color: '#ffffff'
                                                                    }}
                                                                >
                                                                    <Video size={12} /> Unirse
                                                                </a>
                                                            )
                                                        })()}
                                                    </div>
                                                )}
                                            </div>

                                            {liveHoursUntil !== undefined && liveHoursUntil > 0 && (
                                                <div className='text-right'>
                                                    <p className='text-xs font-bold' style={{ color: urgency.chipText }}>
                                                        {liveHoursUntil < 1
                                                            ? `${Math.round(liveHoursUntil * 60)} min`
                                                            : liveHoursUntil < 24
                                                                ? `${Math.round(liveHoursUntil)} hrs`
                                                                : `${Math.round(liveHoursUntil / 24)} días`}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </>
                )
            ) : (
                previousMeetings.length === 0 ? (
                    <div className='text-center py-6 rounded-2xl border' style={{ borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}>
                        <p className='text-sm mb-1' style={{ color: 'var(--text-primary)' }}>Sin juntas anteriores registradas</p>
                        <p className='text-xs' style={{ color: 'var(--text-secondary)' }}>Aquí aparecerá el historial en formato de tabla compacta</p>
                    </div>
                ) : (
                    <div className='rounded-2xl border overflow-hidden' style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
                        <div className='max-h-[320px] overflow-y-auto custom-scrollbar'>
                            <table className='w-full text-[10px]'>
                                <thead className='sticky top-0 z-10' style={{ background: 'color-mix(in srgb, var(--card-bg) 86%, var(--hover-bg))' }}>
                                    <tr className='border-b' style={{ borderColor: 'var(--card-border)' }}>
                                        <th className='px-2 py-1.5 text-left font-black uppercase tracking-[0.14em]' style={{ color: 'var(--text-secondary)' }}>Fecha</th>
                                        <th className='px-2 py-1.5 text-left font-black uppercase tracking-[0.14em]' style={{ color: 'var(--text-secondary)' }}>Junta</th>
                                        <th className='px-2 py-1.5 text-left font-black uppercase tracking-[0.14em]' style={{ color: 'var(--text-secondary)' }}>Tipo</th>
                                        <th className='px-2 py-1.5 text-left font-black uppercase tracking-[0.14em]' style={{ color: 'var(--text-secondary)' }}>Estatus</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visiblePreviousMeetings.map((meeting) => {
                                        const startTime = new Date(meeting.start_time)
                                        const statusMeta = resolvePreviousMeetingStatus(meeting, currentTime)
                                        return (
                                            <tr key={meeting.id} className='border-b last:border-0' style={{ borderColor: 'var(--card-border)' }}>
                                                <td className='px-2 py-1.5 align-middle whitespace-nowrap font-bold' style={{ color: 'var(--text-primary)' }}>
                                                    {startTime.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })} · {startTime.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                                                </td>
                                                <td className='px-2 py-1.5 align-middle min-w-[160px]'>
                                                    <p className='font-bold truncate max-w-[210px]' style={{ color: 'var(--text-primary)' }}>
                                                        {meeting.empresa || 'Empresa'} · {meeting.title}
                                                    </p>
                                                </td>
                                                <td className='px-2 py-1.5 align-middle whitespace-nowrap' style={{ color: 'var(--text-primary)' }}>
                                                    {getMeetingTypeLabel(meeting.meeting_type)}
                                                </td>
                                                <td className='px-2 py-1.5 align-middle'>
                                                    <span
                                                        className='inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-[0.08em] border whitespace-nowrap'
                                                        style={{
                                                            background: statusMeta.bg,
                                                            borderColor: statusMeta.border,
                                                            color: statusMeta.color
                                                        }}
                                                    >
                                                        {statusMeta.label}
                                                    </span>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {previousMeetingsTotalPages > 1 && (
                            <div className='flex items-center justify-between gap-3 px-3 py-2 border-t' style={{ borderColor: 'var(--card-border)', background: 'color-mix(in srgb, var(--card-bg) 90%, var(--hover-bg))' }}>
                                <button
                                    type='button'
                                    onClick={() => setPreviousPage((currentPage) => Math.max(1, currentPage - 1))}
                                    disabled={previousPage <= 1}
                                    className='px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-[0.12em] border transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer'
                                    style={{ borderColor: 'var(--card-border)', color: 'var(--text-secondary)' }}
                                >
                                    Anterior
                                </button>
                                <span className='text-[9px] font-black uppercase tracking-[0.12em]' style={{ color: 'var(--text-secondary)' }}>
                                    Página {previousPage} de {previousMeetingsTotalPages}
                                </span>
                                <button
                                    type='button'
                                    onClick={() => setPreviousPage((currentPage) => Math.min(previousMeetingsTotalPages, currentPage + 1))}
                                    disabled={previousPage >= previousMeetingsTotalPages}
                                    className='px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-[0.12em] border transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer'
                                    style={{ borderColor: 'var(--card-border)', color: 'var(--text-secondary)' }}
                                >
                                    Siguiente
                                </button>
                            </div>
                        )}
                    </div>
                )
            )}

            <div className='mt-4 pt-4 border-t' style={{ borderColor: 'var(--card-border)' }}>
                <div className='flex items-center justify-between text-xs'>
                    <span style={{ color: 'var(--text-secondary)' }}>
                        {activeUpcomingFilter
                            ? `Mostrando ${visibleMeetingCount} juntas próximas`
                            : `Mostrando ${visibleMeetingCount} juntas anteriores`}
                    </span>
                    {activeUpcomingFilter && upcomingMeetings.some((m) => {
                        const { level } = calculateMeetingUrgency(m.start_time, m.duration_minutes, currentTime)
                        return level === 'urgent'
                    }) && (
                        <span className='font-bold animate-pulse' style={{ color: urgentWarningColor }}>
                            <span className='inline-flex items-center gap-1.5'>
                                <AlertTriangle size={13} />
                                Tienes juntas urgentes
                            </span>
                        </span>
                    )}
                </div>
            </div>
        </div>
    )
}
