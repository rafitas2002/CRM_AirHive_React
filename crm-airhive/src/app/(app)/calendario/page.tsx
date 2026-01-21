'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { getUpcomingMeetings, getPendingConfirmations, confirmMeeting, type MeetingWithUrgency } from '@/lib/confirmationService'
import { getStageColor, getUrgencyColor } from '@/lib/confirmationService'
import MeetingConfirmationModal from '@/components/MeetingConfirmationModal'

export default function CalendarioPage() {
    const [supabase] = useState(() => createClient())
    const [meetings, setMeetings] = useState<MeetingWithUrgency[]>([])
    const [pendingConfirmations, setPendingConfirmations] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [currentUser, setCurrentUser] = useState<any>(null)
    const [showConfirmationModal, setShowConfirmationModal] = useState(false)
    const [selectedMeeting, setSelectedMeeting] = useState<any>(null)
    const [viewMode, setViewMode] = useState<'week' | 'list'>('list')

    useEffect(() => {
        fetchData()
        // Check for pending confirmations every minute
        const interval = setInterval(checkPendingConfirmations, 60 * 1000)
        return () => clearInterval(interval)
    }, [])

    const fetchData = async () => {
        setLoading(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            setCurrentUser(user)

            // Fetch all meetings
            const allMeetings = await getUpcomingMeetings(user.id, 50)
            setMeetings(allMeetings)

            // Check for pending confirmations
            await checkPendingConfirmations()
        } catch (error) {
            console.error('Error fetching calendar data:', error)
        } finally {
            setLoading(false)
        }
    }

    const checkPendingConfirmations = async () => {
        let userId = currentUser?.id

        if (!userId) {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            userId = user.id
            setCurrentUser(user)
        }

        if (!userId) return

        const pending = await getPendingConfirmations(userId)
        setPendingConfirmations(pending)

        // Auto-show modal if there are pending confirmations
        if (pending.length > 0 && !showConfirmationModal) {
            setSelectedMeeting(pending[0])
            setShowConfirmationModal(true)
        }
    }

    const handleConfirmMeeting = async (wasHeld: boolean, notes: string) => {
        if (!selectedMeeting || !currentUser) return

        try {
            await confirmMeeting(selectedMeeting.id, wasHeld, notes, currentUser.id)

            // Refresh data
            await fetchData()

            // Close modal
            setShowConfirmationModal(false)
            setSelectedMeeting(null)

            // Show next pending if any
            if (pendingConfirmations.length > 1) {
                setTimeout(() => {
                    setSelectedMeeting(pendingConfirmations[1])
                    setShowConfirmationModal(true)
                }, 500)
            }
        } catch (error) {
            console.error('Error confirming meeting:', error)
            alert('Error al confirmar la junta')
        }
    }

    // Group meetings by date
    const groupedMeetings = meetings.reduce((acc, meeting) => {
        const date = new Date(meeting.start_time).toLocaleDateString('es-MX', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        })
        if (!acc[date]) acc[date] = []
        acc[date].push(meeting)
        return acc
    }, {} as Record<string, MeetingWithUrgency[]>)

    if (loading) {
        return (
            <div className='h-full flex items-center justify-center bg-[#F0F2F5]'>
                <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600'></div>
            </div>
        )
    }

    return (
        <div className='h-full flex flex-col bg-[#F0F2F5] overflow-hidden'>
            {/* Header */}
            <div className='bg-white border-b border-gray-200 px-8 py-6 shrink-0'>
                <div className='flex items-center justify-between'>
                    <div>
                        <h1 className='text-3xl font-black text-[#0F2A44]'>
                            📅 Calendario de Juntas
                        </h1>
                        <p className='text-sm text-gray-600 mt-1'>
                            Gestiona tus reuniones y confirma las que ya pasaron
                        </p>
                    </div>

                    <div className='flex items-center gap-3'>
                        {pendingConfirmations.length > 0 && (
                            <button
                                onClick={() => {
                                    setSelectedMeeting(pendingConfirmations[0])
                                    setShowConfirmationModal(true)
                                }}
                                className='px-4 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors shadow-md animate-pulse'
                            >
                                ⚠️ {pendingConfirmations.length} Junta{pendingConfirmations.length > 1 ? 's' : ''} por confirmar
                            </button>
                        )}

                        <div className='flex bg-gray-100 rounded-lg p-1'>
                            <button
                                onClick={() => setViewMode('list')}
                                className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${viewMode === 'list'
                                    ? 'bg-white text-[#0F2A44] shadow-sm'
                                    : 'text-gray-600 hover:text-gray-900'
                                    }`}
                            >
                                Lista
                            </button>
                            <button
                                onClick={() => setViewMode('week')}
                                className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${viewMode === 'week'
                                    ? 'bg-white text-[#0F2A44] shadow-sm'
                                    : 'text-gray-600 hover:text-gray-900'
                                    }`}
                            >
                                Semana
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className='flex-1 overflow-y-auto p-8'>
                <div className='max-w-6xl mx-auto'>
                    {meetings.length === 0 ? (
                        <div className='bg-white rounded-2xl p-12 text-center shadow-sm border border-gray-200'>
                            <div className='w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4'>
                                <span className='text-4xl'>📅</span>
                            </div>
                            <h3 className='text-xl font-bold text-gray-900 mb-2'>
                                No tienes juntas programadas
                            </h3>
                            <p className='text-gray-600 mb-6'>
                                Agenda juntas desde la ficha de cada lead para comenzar
                            </p>
                            <a
                                href='/clientes'
                                className='inline-block px-6 py-3 bg-[#2048FF] text-white rounded-lg font-bold hover:bg-[#1700AC] transition-colors'
                            >
                                Ir a Leads
                            </a>
                        </div>
                    ) : (
                        <div className='space-y-8'>
                            {Object.entries(groupedMeetings).map(([date, dayMeetings]) => (
                                <div key={date}>
                                    <h2 className='text-lg font-bold text-[#0F2A44] mb-4 sticky top-0 bg-[#F0F2F5] py-2 z-10'>
                                        {date}
                                    </h2>
                                    <div className='space-y-3'>
                                        {dayMeetings.map((meeting) => {
                                            const urgency = getUrgencyColor(meeting.urgencyLevel || 'scheduled')
                                            const stage = getStageColor(meeting.etapa || '')
                                            const startTime = new Date(meeting.start_time)
                                            const endTime = new Date(startTime.getTime() + (meeting.duration_minutes || 60) * 60 * 1000)

                                            return (
                                                <div
                                                    key={meeting.id}
                                                    className={`bg-white p-5 rounded-xl border-2 ${urgency.border} hover:shadow-lg transition-all`}
                                                >
                                                    <div className='flex items-start gap-4'>
                                                        {/* Time */}
                                                        <div className='text-center min-w-[80px]'>
                                                            <p className='text-2xl font-black text-[#0F2A44]'>
                                                                {startTime.toLocaleTimeString('es-MX', {
                                                                    hour: '2-digit',
                                                                    minute: '2-digit'
                                                                })}
                                                            </p>
                                                            <p className='text-xs text-gray-500'>
                                                                {meeting.duration_minutes} min
                                                            </p>
                                                        </div>

                                                        {/* Content */}
                                                        <div className='flex-1'>
                                                            <div className='flex items-center gap-2 mb-2'>
                                                                <span className={`px-3 py-1 rounded-full text-xs font-black ${urgency.bg} ${urgency.text} border-2 ${urgency.border}`}>
                                                                    {urgency.label}
                                                                </span>
                                                                <span className={`px-3 py-1 rounded-full text-xs font-black ${stage.bg} ${stage.text} border ${stage.border}`}>
                                                                    {meeting.etapa}
                                                                </span>
                                                                {meeting.meeting_status === 'pending_confirmation' && (
                                                                    <span className='px-3 py-1 rounded-full text-xs font-black bg-red-100 text-red-700 border-2 border-red-200 animate-pulse'>
                                                                        ⚠️ Pendiente confirmar
                                                                    </span>
                                                                )}
                                                                {meeting.meeting_status === 'held' && (
                                                                    <span className='px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-700 border border-emerald-200'>
                                                                        ✅ Realizada
                                                                    </span>
                                                                )}
                                                                {meeting.meeting_status === 'not_held' && (
                                                                    <span className='px-3 py-1 rounded-full text-xs font-black bg-gray-100 text-gray-700 border border-gray-200'>
                                                                        ❌ No realizada
                                                                    </span>
                                                                )}
                                                            </div>

                                                            <h3 className='text-lg font-bold text-gray-900 mb-1'>
                                                                {meeting.title}
                                                            </h3>
                                                            <p className='text-sm text-gray-600 mb-2'>
                                                                🏢 {meeting.empresa}
                                                            </p>

                                                            {meeting.notes && (
                                                                <p className='text-sm text-gray-500 mt-2 italic'>
                                                                    "{meeting.notes}"
                                                                </p>
                                                            )}

                                                            {meeting.frozen_probability_value !== null && (
                                                                <div className='mt-3 p-3 bg-purple-50 rounded-lg border border-purple-200'>
                                                                    <p className='text-xs text-purple-800 font-bold'>
                                                                        🎯 Pronóstico congelado: {meeting.frozen_probability_value}%
                                                                    </p>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Actions */}
                                                        <div className='flex flex-col gap-2'>
                                                            {meeting.meeting_type === 'video' && <span className='text-2xl'>🎥</span>}
                                                            {meeting.meeting_type === 'llamada' && <span className='text-2xl'>📞</span>}
                                                            {meeting.meeting_type === 'presencial' && <span className='text-2xl'>🏢</span>}

                                                            {meeting.meeting_status === 'pending_confirmation' && (
                                                                <button
                                                                    onClick={() => {
                                                                        setSelectedMeeting(meeting)
                                                                        setShowConfirmationModal(true)
                                                                    }}
                                                                    className='px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition-colors'
                                                                >
                                                                    Confirmar
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Confirmation Modal */}
            {showConfirmationModal && selectedMeeting && (
                <MeetingConfirmationModal
                    meeting={selectedMeeting}
                    frozenProbability={selectedMeeting.frozen_probability_value || 50}
                    onConfirm={handleConfirmMeeting}
                    onClose={() => {
                        setShowConfirmationModal(false)
                        setSelectedMeeting(null)
                    }}
                />
            )}
        </div>
    )
}
