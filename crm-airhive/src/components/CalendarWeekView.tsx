'use client'

import React, { useMemo } from 'react'
import type { MeetingWithUrgency } from '@/lib/confirmationService'
import { meetingIncludesUser } from '@/lib/meetingParticipantUtils'

interface CalendarWeekViewProps {
    meetings: MeetingWithUrgency[]
    onEditMeeting: (meeting: MeetingWithUrgency) => void
    isEditMode: boolean
    getUrgencyColor: (level: string) => { bg: string; border: string; text: string; label: string }
    currentUserId?: string | null
    currentUserEmail?: string | null
    currentUsername?: string | null
}

export default function CalendarWeekView({
    meetings,
    onEditMeeting,
    isEditMode,
    getUrgencyColor,
    currentUserId,
    currentUserEmail,
    currentUsername
}: CalendarWeekViewProps) {
    // Calculate current week days (Sun-Sat)
    const weekDays = useMemo(() => {
        const now = new Date()
        const startOfWeek = new Date(now)
        startOfWeek.setDate(now.getDate() - now.getDay())
        startOfWeek.setHours(0, 0, 0, 0)

        return Array.from({ length: 7 }).map((_, i) => {
            const date = new Date(startOfWeek)
            date.setDate(startOfWeek.getDate() + i)
            return date
        })
    }, [])

    const hours = Array.from({ length: 15 }).map((_, i) => i + 7) // 7 AM to 10 PM

    const getMeetingsForDayAndHour = (day: Date, hour: number) => {
        return meetings.filter(m => {
            const mtgDate = new Date(m.start_time)
            return mtgDate.toDateString() === day.toDateString() && mtgDate.getHours() === hour
        })
    }

    return (
        <div className='bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden flex flex-col flex-1 min-h-0'>
            {/* Week Header */}
            <div className='grid grid-cols-[80px_repeat(7,1fr)] bg-gray-50 border-b border-gray-100 shrink-0'>
                <div className='h-12 border-r border-gray-100' />
                {weekDays.map((day, i) => {
                    const isToday = day.toDateString() === new Date().toDateString()
                    return (
                        <div key={i} className={`h-12 flex flex-col items-center justify-center border-r border-gray-100 last:border-r-0 ${isToday ? 'bg-blue-50/50' : ''}`}>
                            <span className={`text-[10px] font-black uppercase tracking-wider ${isToday ? 'text-[#2048FF]' : 'text-gray-400'}`}>
                                {day.toLocaleDateString('es-MX', { weekday: 'short' })}
                            </span>
                            <span className={`text-base font-black ${isToday ? 'text-[#2048FF]' : 'text-[#0F2A44]'}`}>
                                {day.getDate()}
                            </span>
                        </div>
                    )
                })}
            </div>

            {/* Scrollable Grid Area */}
            <div className='flex-1 overflow-y-auto custom-scrollbar relative'>
                <div className='grid grid-cols-[80px_repeat(7,1fr)] min-h-full'>
                    {/* Hour Labels */}
                    <div className='bg-gray-50/30 border-r border-gray-100'>
                        {hours.map(hour => (
                            <div key={hour} className='h-20 border-b border-gray-100 flex items-start justify-center pt-2'>
                                <span className='text-[10px] font-black text-gray-400 tabular-nums uppercase'>
                                    {hour > 12 ? `${hour - 12} PM` : hour === 12 ? '12 PM' : `${hour} AM`}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Day Columns */}
                    {weekDays.map((day, dayIdx) => (
                        <div key={dayIdx} className='relative border-r border-gray-100 last:border-r-0'>
                            {hours.map(hour => {
                                const dayMeetings = getMeetingsForDayAndHour(day, hour)
                                return (
                                    <div key={hour} className='h-20 border-b border-gray-100 group hover:bg-gray-50/50 transition-colors'>
                                        {dayMeetings.map(mtg => {
                                            const urgency = getUrgencyColor(mtg.urgencyLevel || 'scheduled')
                                            const isUserMeeting = meetingIncludesUser(mtg, currentUserId, currentUserEmail, currentUsername)
                                            return (
                                                <div
                                                    key={mtg.id}
                                                    onClick={() => (isEditMode ? onEditMeeting(mtg) : undefined)}
                                                    className={`absolute left-1 right-1 p-1.5 rounded-lg border-2 shadow-sm transition-transform z-10 overflow-hidden ${isEditMode ? 'cursor-pointer hover:scale-[1.02]' : 'cursor-default'} ${urgency.bg} ${urgency.text} ${urgency.border}`}
                                                    style={{
                                                        top: `${(hours.indexOf(hour) * 80) + (new Date(mtg.start_time).getMinutes() / 60 * 80)}px`,
                                                        height: `${(mtg.duration_minutes / 60) * 80 - 2}px`,
                                                        minHeight: '40px',
                                                        boxShadow: isUserMeeting ? 'inset 4px 0 0 #2048FF' : 'inset 4px 0 0 #f59e0b',
                                                        borderColor: isUserMeeting ? 'rgba(37,99,235,0.65)' : 'rgba(245,158,11,0.62)'
                                                    }}
                                                    title={isUserMeeting ? 'Incluido en esta junta' : 'No incluido en esta junta'}
                                                >
                                                    <p className='text-[9px] font-black leading-tight truncate uppercase opacity-80'>
                                                        {new Date(mtg.start_time).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                                                    </p>
                                                    <p className='text-[10px] font-black leading-tight mt-0.5 break-words line-clamp-2'>
                                                        {mtg.title}
                                                    </p>
                                                    <p className='text-[8px] font-black uppercase tracking-wider mt-1 opacity-80'>
                                                        {isUserMeeting ? 'Incluido' : 'No incluido'}
                                                    </p>

                                                    {mtg.notes?.includes('[MEET_LINK]:') && (
                                                        <div className='absolute bottom-1 right-1'>
                                                            {(() => {
                                                                const meetLink = mtg.notes?.match(/\[MEET_LINK\]:(https:\/\/\S+)/)?.[1];
                                                                if (!meetLink) return null;
                                                                return (
                                                                    <a
                                                                        href={meetLink}
                                                                        target='_blank'
                                                                        rel='noopener noreferrer'
                                                                        onClick={(e) => e.stopPropagation()}
                                                                        className='w-5 h-5 bg-white/20 hover:bg-white/40 rounded flex items-center justify-center text-[10px] transition-colors'
                                                                        title="Unirse a Google Meet"
                                                                    >
                                                                        🎥
                                                                    </a>
                                                                );
                                                            })()}
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                )
                            })}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
