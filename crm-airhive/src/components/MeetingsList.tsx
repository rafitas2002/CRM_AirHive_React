'use client'

import { useEffect, useState } from 'react'
import { Database } from '@/lib/supabase'
import { getLeadMeetings, getLeadSnapshots, deleteMeeting, cancelMeeting } from '@/lib/meetingsService'

type Meeting = Database['public']['Tables']['meetings']['Row']
type Snapshot = Database['public']['Tables']['forecast_snapshots']['Row']

interface MeetingsListProps {
    leadId: number
    onEditMeeting?: (meeting: Meeting) => void
    onRefresh?: () => void
}

export default function MeetingsList({ leadId, onEditMeeting, onRefresh }: MeetingsListProps) {
    const [meetings, setMeetings] = useState<Meeting[]>([])
    const [snapshots, setSnapshots] = useState<Snapshot[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchData()
    }, [leadId])

    const fetchData = async () => {
        setLoading(true)
        try {
            const [meetingsData, snapshotsData] = await Promise.all([
                getLeadMeetings(leadId),
                getLeadSnapshots(leadId)
            ])
            setMeetings(meetingsData)
            setSnapshots(snapshotsData)
        } catch (error) {
            console.error('Error fetching meetings:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async (meetingId: string) => {
        if (!confirm('¿Estás seguro de eliminar esta reunión?')) return

        try {
            await deleteMeeting(meetingId)
            await fetchData()
            onRefresh?.()
        } catch (error) {
            console.error('Error deleting meeting:', error)
            alert('Error al eliminar la reunión')
        }
    }

    const handleCancel = async (meetingId: string) => {
        if (!confirm('¿Cancelar esta reunión?')) return

        try {
            await cancelMeeting(meetingId)
            await fetchData()
            onRefresh?.()
        } catch (error) {
            console.error('Error cancelling meeting:', error)
            alert('Error al cancelar la reunión')
        }
    }

    const getSnapshotForMeeting = (meetingId: string) => {
        return snapshots.find(s => s.meeting_id === meetingId)
    }

    const getMeetingIcon = (type: string) => {
        switch (type) {
            case 'presencial': return '🏢'
            case 'llamada': return '📞'
            case 'video': return '🎥'
            default: return '📅'
        }
    }

    const getMeetingStatusBadge = (meeting: Meeting) => {
        const now = new Date()
        const startTime = new Date(meeting.start_time)
        const snapshot = getSnapshotForMeeting(meeting.id)

        if (meeting.status === 'cancelled') {
            return <span className='px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full'>Cancelada</span>
        }

        if (meeting.status === 'completed') {
            return <span className='px-2 py-1 bg-gray-100 text-gray-700 text-xs font-bold rounded-full'>Completada</span>
        }

        if (now >= startTime) {
            if (snapshot) {
                return <span className='px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full'>✅ Snapshot capturado</span>
            } else {
                return <span className='px-2 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-full'>⏳ Procesando...</span>
            }
        }

        return <span className='px-2 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full'>Próxima</span>
    }

    if (loading) {
        return (
            <div className='flex items-center justify-center py-8'>
                <p className='text-gray-400 animate-pulse'>Cargando reuniones...</p>
            </div>
        )
    }

    if (meetings.length === 0) {
        return (
            <div className='text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200'>
                <p className='text-gray-500 text-sm'>No hay reuniones agendadas</p>
                <p className='text-gray-400 text-xs mt-1'>Crea una reunión para comenzar el seguimiento de pronósticos</p>
            </div>
        )
    }

    return (
        <div className='space-y-3'>
            {meetings.map((meeting) => {
                const snapshot = getSnapshotForMeeting(meeting.id)
                const startTime = new Date(meeting.start_time)
                const isUpcoming = startTime > new Date()

                return (
                    <div
                        key={meeting.id}
                        className={`p-4 rounded-lg border-2 transition-all ${isUpcoming && meeting.status === 'scheduled'
                                ? 'bg-blue-50 border-blue-200'
                                : 'bg-white border-gray-200'
                            }`}
                    >
                        <div className='flex items-start justify-between gap-3'>
                            <div className='flex-1'>
                                <div className='flex items-center gap-2 mb-1'>
                                    <span className='text-2xl'>{getMeetingIcon(meeting.meeting_type)}</span>
                                    <h3 className='font-bold text-gray-900'>{meeting.title}</h3>
                                    {getMeetingStatusBadge(meeting)}
                                </div>

                                <div className='space-y-1 text-sm text-gray-600'>
                                    <p className='flex items-center gap-2'>
                                        <span className='font-semibold'>📅</span>
                                        {startTime.toLocaleDateString('es-MX', {
                                            weekday: 'long',
                                            year: 'numeric',
                                            month: 'long',
                                            day: 'numeric'
                                        })}
                                    </p>
                                    <p className='flex items-center gap-2'>
                                        <span className='font-semibold'>🕐</span>
                                        {startTime.toLocaleTimeString('es-MX', {
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                        {' '}({meeting.duration_minutes} min)
                                    </p>

                                    {meeting.attendees && meeting.attendees.length > 0 && (
                                        <p className='flex items-center gap-2'>
                                            <span className='font-semibold'>👥</span>
                                            {meeting.attendees.join(', ')}
                                        </p>
                                    )}

                                    {meeting.notes && (
                                        <p className='text-xs text-gray-500 italic mt-2 bg-gray-50 p-2 rounded'>
                                            {meeting.notes}
                                        </p>
                                    )}
                                </div>

                                {/* Snapshot Info */}
                                {snapshot && (
                                    <div className='mt-3 p-3 bg-purple-50 border border-purple-200 rounded-lg'>
                                        <p className='text-xs font-bold text-purple-900 mb-1'>
                                            📸 Snapshot #{snapshot.snapshot_number}
                                        </p>
                                        <p className='text-sm font-black text-purple-700'>
                                            Probabilidad registrada: {snapshot.probability}%
                                        </p>
                                        <p className='text-xs text-purple-600 mt-1'>
                                            {new Date(snapshot.snapshot_timestamp).toLocaleString('es-MX')}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Actions */}
                            {meeting.status === 'scheduled' && isUpcoming && (
                                <div className='flex flex-col gap-2'>
                                    {onEditMeeting && (
                                        <button
                                            onClick={() => onEditMeeting(meeting)}
                                            className='p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors'
                                            title='Editar'
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                                            </svg>
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleCancel(meeting.id)}
                                        className='p-2 text-amber-600 hover:bg-amber-100 rounded-lg transition-colors'
                                        title='Cancelar'
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="12" cy="12" r="10" />
                                            <line x1="15" y1="9" x2="9" y2="15" />
                                            <line x1="9" y1="9" x2="15" y2="15" />
                                        </svg>
                                    </button>
                                    <button
                                        onClick={() => handleDelete(meeting.id)}
                                        className='p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors'
                                        title='Eliminar'
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M3 6h18" />
                                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                        </svg>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
