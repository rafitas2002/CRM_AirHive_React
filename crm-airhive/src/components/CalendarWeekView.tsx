'use client'

import React, { useMemo } from 'react'
import { MeetingWithUrgency } from '@/lib/confirmationService'

interface CalendarWeekViewProps {
    meetings: MeetingWithUrgency[]
    onEditMeeting: (meeting: any) => void
    isEditMode: boolean
    getUrgencyColor: (level: string) => any
    getStageColor: (stage: string) => any
}

export default function CalendarWeekView({
    meetings,
    onEditMeeting,
    isEditMode,
    getUrgencyColor,
    getStageColor
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
        <div className='bg-[var(--card-bg)] rounded-3xl border border-[var(--card-border)] shadow-xl overflow-hidden flex flex-col flex-1 min-h-0'>
            {/* Week Header */}
            <div className='grid grid-cols-[80px_repeat(7,1fr)] bg-[var(--table-header-bg)] border-b border-[var(--card-border)] shrink-0'>
                <div className='h-12 border-r border-[var(--card-border)]' />
                {weekDays.map((day, i) => {
                    const isToday = day.toDateString() === new Date().toDateString()
                    return (
                        <div key={i} className={`h-12 flex flex-col items-center justify-center border-r border-[var(--card-border)] last:border-r-0 ${isToday ? 'bg-blue-500/10' : ''}`}>
                            <span className={`text-[10px] font-black uppercase tracking-wider ${isToday ? 'text-[#2048FF]' : 'text-[var(--text-secondary)]'}`}>
                                {day.toLocaleDateString('es-MX', { weekday: 'short' })}
                            </span>
                            <span className={`text-base font-black ${isToday ? 'text-[#2048FF]' : 'text-[var(--text-primary)]'}`}>
                                {day.getDate()}
                            </span>
                        </div>
                    )
                })}
            </div>

            {/* Scrollable Grid Area */}
            <div className='flex-1 overflow-y-auto custom-scrollbar relative bg-[var(--background)]'>
                <div className='grid grid-cols-[80px_repeat(7,1fr)] min-h-full'>
                    {/* Hour Labels */}
                    <div className='bg-[var(--hover-bg)]/30 border-r border-[var(--card-border)]'>
                        {hours.map(hour => (
                            <div key={hour} className='h-20 border-b border-[var(--card-border)] flex items-start justify-center pt-2'>
                                <span className='text-[10px] font-black text-[var(--text-secondary)] tabular-nums uppercase'>
                                    {hour > 12 ? `${hour - 12} PM` : hour === 12 ? '12 PM' : `${hour} AM`}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Day Columns */}
                    {weekDays.map((day, dayIdx) => (
                        <div key={dayIdx} className='relative border-r border-[var(--card-border)] last:border-r-0'>
                            {hours.map(hour => {
                                const dayMeetings = getMeetingsForDayAndHour(day, hour)
                                return (
                                    <div key={hour} className='h-20 border-b border-[var(--card-border)] group hover:bg-[var(--hover-bg)] transition-colors'>
                                        {dayMeetings.map(mtg => {
                                            const urgency = getUrgencyColor(mtg.urgencyLevel || 'scheduled')
                                            return (
                                                <div
                                                    key={mtg.id}
                                                    onClick={() => onEditMeeting(mtg)}
                                                    className={`absolute left-1 right-1 p-1.5 rounded-lg border-2 shadow-sm cursor-pointer hover:scale-[1.02] transition-transform z-10 overflow-hidden ${urgency.bg} ${urgency.text} ${urgency.border}`}
                                                    style={{
                                                        top: `${(hours.indexOf(hour) * 80) + (new Date(mtg.start_time).getMinutes() / 60 * 80)}px`,
                                                        height: `${(mtg.duration_minutes / 60) * 80 - 2}px`,
                                                        minHeight: '40px'
                                                    }}
                                                >
                                                    <p className='text-[9px] font-black leading-tight truncate uppercase opacity-80'>
                                                        {new Date(mtg.start_time).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                                                    </p>
                                                    <p className='text-[10px] font-black leading-tight mt-0.5 break-words line-clamp-2'>
                                                        {mtg.title}
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
