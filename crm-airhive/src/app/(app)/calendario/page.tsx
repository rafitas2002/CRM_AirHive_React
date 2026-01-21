'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { getUpcomingMeetings, getPendingConfirmations, confirmMeeting, type MeetingWithUrgency } from '@/lib/confirmationService'
import { getStageColor, getUrgencyColor } from '@/lib/confirmationService'
import { useAuth } from '@/lib/auth'
import MeetingConfirmationModal from '@/components/MeetingConfirmationModal'
import MeetingModal from '@/components/MeetingModal'
import { updateMeeting, deleteMeeting } from '@/lib/meetingsService'

export default function CalendarioPage() {
    const auth = useAuth()
    const [meetings, setMeetings] = useState<MeetingWithUrgency[]>([])
    const [pendingConfirmations, setPendingConfirmations] = useState<any[]>([])
    // const [loading, setLoading] = useState(true) // Handled by auth
    // const [currentUser, setCurrentUser] = useState<any>(null) // Handled by auth
    const [showConfirmationModal, setShowConfirmationModal] = useState(false)
    const [showEditModal, setShowEditModal] = useState(false)
    const [selectedMeeting, setSelectedMeeting] = useState<any>(null)
    const [editMeetingData, setEditMeetingData] = useState<any>(null)
    const [viewMode, setViewMode] = useState<'week' | 'list'>('list')
    const [isEditMode, setIsEditMode] = useState(false)

    useEffect(() => {
        if (!auth.loading && auth.user) {
            fetchData()
        }
        // Check for pending confirmations every minute
        const interval = setInterval(checkPendingConfirmations, 60 * 1000)
        return () => clearInterval(interval)
    }, [auth.user, auth.loading, auth.profile])

    const fetchData = async () => {
        // setLoading(true) // Auth handles initial loading
        try {
            if (!auth.user) return

            // Check if admin
            const isAdmin = auth.profile?.role === 'admin'

            // Fetch all meetings
            const allMeetings = await getUpcomingMeetings(auth.user.id, 50, isAdmin)
            setMeetings(allMeetings)

            // Check for pending confirmations
            await checkPendingConfirmations()
        } catch (error) {
            console.error('Error fetching calendar data:', error)
        } finally {
            // setLoading(false)
        }
    }

    const checkPendingConfirmations = async () => {
        const userId = auth.user?.id
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
        if (!selectedMeeting || !auth.user) return

        try {
            await confirmMeeting(selectedMeeting.id, wasHeld, notes, auth.user.id)

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

    const handleDeleteMeeting = async (meeting: any) => {
        if (!confirm('¿Estás seguro de que deseas eliminar esta reunión? Esta acción no se puede deshacer.')) return

        try {
            await deleteMeeting(meeting.id)
            await fetchData() // Refresh
        } catch (error) {
            console.error('Error deleting meeting:', error)
            alert('Error al eliminar la reunión')
        }
    }

    const handleEditMeeting = (meeting: any) => {
        setEditMeetingData(meeting)
        setShowEditModal(true)
    }

    const handleSaveEdit = async (data: any) => {
        if (!editMeetingData) return

        try {
            // Remove helper fields that are not part of the database table if necessary, 
            // but updateMeeting expects partial MeetingUpdate.
            // We need to make sure we don't send 'empresa', 'urgencyLevel', etc.
            const { empresa, etapa, urgencyLevel, hoursUntil, clientes, ...cleanData } = data

            await updateMeeting(editMeetingData.id, cleanData)
            await fetchData()
            setShowEditModal(false)
            setEditMeetingData(null)
        } catch (error) {
            console.error('Error updating meeting:', error)
            alert('Error al guardar cambios')
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

    if (auth.loading) {
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
                        {/* Edit Mode Toggle */}
                        <button
                            onClick={() => setIsEditMode(!isEditMode)}
                            className={`px-4 py-2 rounded-lg font-bold transition-all border-2 ${isEditMode
                                ? 'bg-orange-100 text-orange-700 border-orange-300 shadow-inner'
                                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                                }`}
                            title={isEditMode ? 'Salir del modo edición' : 'Editar reuniones'}
                        >
                            {isEditMode ? '✏️ Modo Edición Activo' : '✏️ Editar'}
                        </button>

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
                                    <h2 className='text-lg font-bold text-[#0F2A44] mb-4'>
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
                                                    className={`bg-white p-5 rounded-xl border-2 ${urgency.border} hover:shadow-lg transition-all ${meeting.urgencyLevel === 'in_progress' ? 'animate-pulse ring-2 ring-indigo-300 ring-offset-2' : ''
                                                        }`}
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

                                                            {meeting.seller_name && (
                                                                <p className='text-xs text-gray-500 font-medium mb-2'>
                                                                    👤 Vendedor: <span className='text-gray-700'>{meeting.seller_name}</span>
                                                                </p>
                                                            )}

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

                                                            {/* Edit/Delete Actions - Only in Edit Mode */}
                                                            {isEditMode && (meeting.meeting_status === 'scheduled' || meeting.meeting_status === 'not_held') && (
                                                                <div className='flex items-center gap-2 mt-2'>
                                                                    <button
                                                                        onClick={() => handleEditMeeting(meeting)}
                                                                        className='p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors'
                                                                        title='Editar reunión'
                                                                    >
                                                                        ✏️
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDeleteMeeting(meeting)}
                                                                        className='p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors'
                                                                        title='Eliminar reunión'
                                                                    >
                                                                        🗑️
                                                                    </button>
                                                                </div>
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

            {/* Edit Modal */}
            {showEditModal && editMeetingData && (
                <MeetingModal
                    isOpen={showEditModal}
                    onClose={() => {
                        setShowEditModal(false)
                        setEditMeetingData(null)
                    }}
                    onSave={handleSaveEdit}
                    leadId={editMeetingData.lead_id}
                    sellerId={editMeetingData.seller_id}
                    initialData={editMeetingData}
                    mode='edit'
                />
            )}
        </div>
    )
}
