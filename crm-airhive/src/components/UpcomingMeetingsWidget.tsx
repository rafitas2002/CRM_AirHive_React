'use client'

import { useEffect, useState } from 'react'
import { getUpcomingMeetings, getUrgencyColor, type MeetingWithUrgency } from '@/lib/confirmationService'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

export default function UpcomingMeetingsWidget() {
    const [meetings, setMeetings] = useState<MeetingWithUrgency[]>([])
    const [loading, setLoading] = useState(true)
    const [supabase] = useState(() => createClient())

    useEffect(() => {
        fetchMeetings()
    }, [])

    const fetchMeetings = async () => {
        setLoading(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                console.log('No user found')
                setLoading(false)
                return
            }

            console.log('Fetching meetings for user:', user.id)
            const upcomingMeetings = await getUpcomingMeetings(user.id, 5)
            console.log('Got meetings:', upcomingMeetings.length)
            setMeetings(upcomingMeetings)
        } catch (error) {
            console.error('Error in fetchMeetings:', error)
            setMeetings([]) // Set empty array on error
        } finally {
            setLoading(false)
        }
    }

    if (loading) {
        return (
            <div className='bg-white p-6 rounded-2xl shadow-sm border border-gray-200'>
                <h2 className='text-lg font-bold text-[#0F2A44] mb-4'>
                    📅 Próximas Juntas
                </h2>
                <p className='text-gray-400 text-sm animate-pulse'>Cargando...</p>
            </div>
        )
    }

    if (meetings.length === 0) {
        return (
            <div className='bg-white p-6 rounded-2xl shadow-sm border border-gray-200'>
                <h2 className='text-lg font-bold text-[#0F2A44] mb-4'>
                    📅 Próximas Juntas
                </h2>
                <div className='text-center py-6'>
                    <p className='text-gray-500 text-sm mb-2'>No tienes juntas próximas</p>
                    <p className='text-gray-400 text-xs'>Agenda juntas desde la ficha de cada lead</p>
                </div>
            </div>
        )
    }

    return (
        <div className='bg-white p-6 rounded-2xl shadow-sm border border-gray-200'>
            <div className='flex items-center justify-between mb-4'>
                <h2 className='text-lg font-bold text-[#0F2A44]'>
                    📅 Próximas Juntas
                </h2>
                <Link
                    href='/calendario'
                    className='text-xs font-bold text-[#2048FF] hover:underline'
                >
                    Ver calendario →
                </Link>
            </div>

            <div className='space-y-3'>
                {meetings.map((meeting) => {
                    const urgency = getUrgencyColor(meeting.urgencyLevel || 'scheduled')
                    const startTime = new Date(meeting.start_time)

                    return (
                        <div
                            key={meeting.id}
                            className={`p-3 rounded-lg border-2 ${urgency.border} ${urgency.bg} hover:shadow-md transition-all cursor-pointer`}
                        >
                            <div className='flex items-start justify-between gap-3'>
                                <div className='flex-1 min-w-0'>
                                    <div className='flex items-center gap-2 mb-1'>
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-black ${urgency.bg} ${urgency.text} border ${urgency.border}`}>
                                            {urgency.label}
                                        </span>
                                        {meeting.meeting_type === 'video' && <span>🎥</span>}
                                        {meeting.meeting_type === 'llamada' && <span>📞</span>}
                                        {meeting.meeting_type === 'presencial' && <span>🏢</span>}
                                    </div>
                                    <p className='font-bold text-sm text-gray-900 truncate'>
                                        {meeting.title}
                                    </p>
                                    <p className='text-xs text-gray-600 truncate'>
                                        {meeting.empresa}
                                    </p>
                                    <p className='text-xs text-gray-500 mt-1'>
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
                                </div>

                                {/* Time until */}
                                {meeting.hoursUntil !== undefined && meeting.hoursUntil > 0 && (
                                    <div className='text-right'>
                                        <p className={`text-xs font-bold ${urgency.text}`}>
                                            {meeting.hoursUntil < 1
                                                ? `${Math.round(meeting.hoursUntil * 60)} min`
                                                : meeting.hoursUntil < 24
                                                    ? `${Math.round(meeting.hoursUntil)} hrs`
                                                    : `${Math.round(meeting.hoursUntil / 24)} días`}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Summary */}
            <div className='mt-4 pt-4 border-t border-gray-200'>
                <div className='flex items-center justify-between text-xs'>
                    <span className='text-gray-600'>
                        Mostrando {meetings.length} próximas juntas
                    </span>
                    {meetings.some(m => m.urgencyLevel === 'urgent' || m.urgencyLevel === 'overdue') && (
                        <span className='text-red-600 font-bold animate-pulse'>
                            ⚠️ Tienes juntas urgentes
                        </span>
                    )}
                </div>
            </div>
        </div>
    )
}
