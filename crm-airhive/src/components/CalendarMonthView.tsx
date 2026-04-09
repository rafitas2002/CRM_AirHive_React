'use client'

import { useMemo } from 'react'
import type { MeetingWithUrgency } from '@/lib/confirmationService'
import { ChevronLeft, ChevronRight, Clock3, Users2 } from 'lucide-react'
import { meetingIncludesUser } from '@/lib/meetingParticipantUtils'

interface CalendarMonthViewProps {
    meetings: MeetingWithUrgency[]
    monthDate: Date
    onChangeMonth: (nextDate: Date) => void
    onEditMeeting: (meeting: MeetingWithUrgency) => void
    isEditMode: boolean
    currentUserId?: string | null
    currentUserEmail?: string | null
    currentUsername?: string | null
}

function toDateKey(value: Date): string {
    return [
        value.getFullYear(),
        String(value.getMonth() + 1).padStart(2, '0'),
        String(value.getDate()).padStart(2, '0')
    ].join('-')
}

function isSameDate(a: Date, b: Date) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function getParticipantLabels(meeting: MeetingWithUrgency, currentUserId?: string | null, currentUserEmail?: string | null): string[] {
    const labels: string[] = []
    const normalizedUserEmail = String(currentUserEmail || '').trim().toLowerCase()
    const isSellerSelf = Boolean(currentUserId && meeting.seller_id === currentUserId)

    if (meeting.seller_name) {
        labels.push(isSellerSelf ? 'Tú (responsable)' : `${meeting.seller_name} (responsable)`)
    } else if (meeting.seller_id) {
        labels.push(isSellerSelf ? 'Tú (responsable)' : 'Responsable asignado')
    }

    if (meeting.primary_company_contact_name) {
        labels.push(meeting.primary_company_contact_name)
    }

    if (Array.isArray(meeting.external_participants)) {
        for (const entry of meeting.external_participants) {
            const clean = String(entry || '').trim()
            if (!clean) continue
            labels.push(clean)
        }
    }

    if (Array.isArray(meeting.attendees)) {
        for (const attendee of meeting.attendees) {
            const email = String(attendee || '').trim().toLowerCase()
            if (!email) continue
            if (normalizedUserEmail && email === normalizedUserEmail) {
                labels.push('Tú')
                continue
            }
            const localPart = email.split('@')[0]?.replace(/[._-]+/g, ' ') || email
            labels.push(localPart)
        }
    }

    return Array.from(new Set(labels))
}

export default function CalendarMonthView({
    meetings,
    monthDate,
    onChangeMonth,
    onEditMeeting,
    isEditMode,
    currentUserId,
    currentUserEmail,
    currentUsername
}: CalendarMonthViewProps) {
    const monthStart = useMemo(() => new Date(monthDate.getFullYear(), monthDate.getMonth(), 1), [monthDate])
    const monthEnd = useMemo(() => new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0), [monthDate])
    const monthLabel = useMemo(
        () => monthDate.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }),
        [monthDate]
    )

    const days = useMemo(() => {
        // Week starts on Monday.
        const startOffset = (monthStart.getDay() + 6) % 7
        const calendarStart = new Date(monthStart)
        calendarStart.setDate(monthStart.getDate() - startOffset)

        return Array.from({ length: 42 }).map((_, index) => {
            const date = new Date(calendarStart)
            date.setDate(calendarStart.getDate() + index)
            return date
        })
    }, [monthStart])

    const meetingsByDate = useMemo(() => {
        const map = new Map<string, MeetingWithUrgency[]>()
        for (const meeting of meetings) {
            const key = toDateKey(new Date(meeting.start_time))
            const bucket = map.get(key) || []
            bucket.push(meeting)
            map.set(key, bucket)
        }
        for (const bucket of map.values()) {
            bucket.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
        }
        return map
    }, [meetings])

    const weekDays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
    const today = new Date()

    return (
        <div className='rounded-[34px] border shadow-2xl overflow-hidden flex flex-col h-full' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
            <div className='px-5 md:px-7 py-4 border-b flex items-center justify-between gap-4' style={{ borderColor: 'var(--card-border)' }}>
                <div>
                    <h3 className='text-lg md:text-xl font-black capitalize' style={{ color: 'var(--text-primary)' }}>
                        {monthLabel}
                    </h3>
                    <p className='text-xs font-semibold' style={{ color: 'var(--text-secondary)' }}>
                        Azul: participas. Amarillo: no participas.
                    </p>
                </div>
                <div className='flex items-center gap-2'>
                    <button
                        onClick={() => onChangeMonth(new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1))}
                        className='w-10 h-10 rounded-xl border hover:bg-blue-500/10 hover:border-blue-400 transition-colors flex items-center justify-center cursor-pointer'
                        style={{ borderColor: 'var(--card-border)', color: 'var(--text-secondary)' }}
                        aria-label='Mes anterior'
                    >
                        <ChevronLeft size={18} />
                    </button>
                    <button
                        onClick={() => onChangeMonth(new Date())}
                        className='px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border hover:bg-blue-500/10 hover:border-blue-400 transition-colors cursor-pointer'
                        style={{ borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                    >
                        Hoy
                    </button>
                    <button
                        onClick={() => onChangeMonth(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1))}
                        className='w-10 h-10 rounded-xl border hover:bg-blue-500/10 hover:border-blue-400 transition-colors flex items-center justify-center cursor-pointer'
                        style={{ borderColor: 'var(--card-border)', color: 'var(--text-secondary)' }}
                        aria-label='Mes siguiente'
                    >
                        <ChevronRight size={18} />
                    </button>
                </div>
            </div>

            <div className='grid grid-cols-7 border-b' style={{ borderColor: 'var(--card-border)' }}>
                {weekDays.map(day => (
                    <div
                        key={day}
                        className='py-2.5 text-center text-[10px] font-black uppercase tracking-[0.14em]'
                        style={{ color: 'var(--text-secondary)', borderRight: '1px solid var(--card-border)' }}
                    >
                        {day}
                    </div>
                ))}
            </div>

            <div className='grid grid-cols-7 auto-rows-fr min-h-[680px]'>
                {days.map((day) => {
                    const key = toDateKey(day)
                    const dayMeetings = meetingsByDate.get(key) || []
                    const isCurrentMonth = day >= monthStart && day <= monthEnd
                    const isToday = isSameDate(day, today)
                    const overflowCount = Math.max(0, dayMeetings.length - 3)

                    return (
                        <div
                            key={key}
                            className='border-r border-b p-2.5 md:p-3 flex flex-col gap-2 min-h-[120px]'
                            style={{
                                borderColor: 'var(--card-border)',
                                background: isCurrentMonth
                                    ? (isToday ? 'color-mix(in srgb, #DBEAFE 36%, var(--card-bg))' : 'var(--card-bg)')
                                    : 'color-mix(in srgb, var(--background) 88%, var(--card-bg))'
                            }}
                        >
                            <div className='flex items-center justify-between'>
                                <span
                                    className='w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black tabular-nums'
                                    style={{
                                        color: isCurrentMonth ? 'var(--text-primary)' : 'var(--text-secondary)',
                                        background: isToday ? '#2048FF' : 'transparent',
                                        opacity: isCurrentMonth ? 1 : 0.6,
                                        ...(isToday ? { color: '#ffffff' } : null)
                                    }}
                                >
                                    {day.getDate()}
                                </span>
                                {dayMeetings.length > 0 && (
                                    <span className='text-[9px] font-black uppercase tracking-widest text-blue-600'>
                                        {dayMeetings.length} juntas
                                    </span>
                                )}
                            </div>

                            <div className='space-y-1.5'>
                                {dayMeetings.slice(0, 3).map((meeting) => {
                                    const isUserMeeting = meetingIncludesUser(meeting, currentUserId, currentUserEmail, currentUsername)
                                    const participantLabels = getParticipantLabels(meeting, currentUserId, currentUserEmail)
                                    const participantPreview = participantLabels.length > 0
                                        ? participantLabels.join(', ')
                                        : 'Sin participantes registrados'

                                    return (
                                        <button
                                            key={meeting.id}
                                            type='button'
                                            onClick={() => (isEditMode ? onEditMeeting(meeting) : undefined)}
                                            className={`w-full text-left rounded-xl border px-2.5 py-2 transition-colors ${isEditMode ? 'cursor-pointer hover:brightness-95' : 'cursor-default'} ${isUserMeeting ? '' : ''}`}
                                            style={{
                                                borderColor: isUserMeeting ? 'rgba(37,99,235,0.45)' : 'rgba(245,158,11,0.42)',
                                                background: isUserMeeting
                                                    ? 'color-mix(in srgb, #DBEAFE 70%, var(--card-bg))'
                                                    : 'color-mix(in srgb, #FEF3C7 45%, var(--background))'
                                            }}
                                            title={participantPreview}
                                        >
                                            <p className='text-[11px] font-black leading-tight truncate' style={{ color: 'var(--text-primary)' }}>
                                                {meeting.title}
                                            </p>
                                            <div className='mt-1 flex items-center gap-1.5'>
                                                <Clock3 size={11} className={`${isUserMeeting ? 'text-blue-600' : 'text-amber-600'} shrink-0`} />
                                                <p className='text-[10px] font-semibold truncate' style={{ color: 'var(--text-secondary)' }}>
                                                    {new Date(meeting.start_time).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                                </p>
                                            </div>
                                            <div className='mt-1 flex items-center gap-1.5'>
                                                <Users2 size={11} className='text-slate-500 shrink-0' />
                                                <p className='text-[10px] font-semibold truncate' style={{ color: 'var(--text-secondary)' }}>
                                                    {participantPreview}
                                                </p>
                                            </div>
                                        </button>
                                    )
                                })}

                                {overflowCount > 0 && (
                                    <p className='text-[10px] font-black uppercase tracking-widest px-1' style={{ color: 'var(--text-secondary)' }}>
                                        +{overflowCount} más
                                    </p>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
