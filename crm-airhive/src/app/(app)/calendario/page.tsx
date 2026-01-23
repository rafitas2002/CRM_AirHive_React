'use client'

import { useEffect, useState } from 'react'
import { getUpcomingMeetings, type MeetingWithUrgency } from '@/lib/confirmationService'
import { getStageColor, getUrgencyColor } from '@/lib/confirmationService'
import { useAuth } from '@/lib/auth'
import MeetingModal from '@/components/MeetingModal'
import { updateMeeting, deleteMeeting } from '@/lib/meetingsService'
import { getGoogleAuthUrl, getUserAccessToken } from '@/lib/googleCalendarService'
import { createClient } from '@/lib/supabase'

export default function CalendarioPage() {
    const auth = useAuth()
    const [meetings, setMeetings] = useState<MeetingWithUrgency[]>([])
    const [showEditModal, setShowEditModal] = useState(false)
    const [editMeetingData, setEditMeetingData] = useState<any>(null)
    const [viewMode, setViewMode] = useState<'week' | 'list'>('list')
    const [isEditMode, setIsEditMode] = useState(false)
    const [currentTime, setCurrentTime] = useState(new Date())
    const [calendarStatus, setCalendarStatus] = useState<{ connected: boolean; email?: string | null }>({ connected: false })
    const [sellers, setSellers] = useState<{ id: string; full_name: string }[]>([])
    const [selectedSellerId, setSelectedSellerId] = useState<string>('all')

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000)
        return () => clearInterval(timer)
    }, [])

    useEffect(() => {
        if (!auth.loading && auth.user) {
            fetchData()
            fetchCalendarStatus()
            if (auth.profile?.role === 'admin') {
                fetchSellers()
            }
        }
    }, [auth.user, auth.loading, auth.profile])

    const fetchCalendarStatus = async () => {
        try {
            if (!auth.user) return
            const supabase = createClient()
            const { data } = await supabase
                .from('user_calendar_tokens')
                .select('email')
                .eq('user_id', auth.user.id)
                .single()

            if (data) {
                setCalendarStatus({ connected: true, email: (data as any).email })
            }
        } catch (error) {
            console.error('Error fetching calendar status:', error)
        }
    }

    const fetchSellers = async () => {
        try {
            const supabase = createClient()
            const { data } = await supabase
                .from('profiles')
                .select('id, full_name')
                .order('full_name')

            if (data) setSellers(data)
        } catch (error) {
            console.error('Error fetching sellers:', error)
        }
    }

    const fetchData = async () => {
        try {
            if (!auth.user) return
            const isAdmin = auth.profile?.role === 'admin'
            // If admin and specific seller selected, we fetch that seller's meetings
            const targetId = (isAdmin && selectedSellerId !== 'all') ? selectedSellerId : auth.user.id
            const showAll = isAdmin && selectedSellerId === 'all'

            const allMeetings = await getUpcomingMeetings(targetId, 50, showAll, auth.user?.email || undefined)
            setMeetings(allMeetings)
        } catch (error) {
            console.error('Error fetching calendar data:', error)
        }
    }

    const handleConnectGoogle = () => {
        const url = getGoogleAuthUrl()
        window.location.href = url
    }

    const handleDeleteMeeting = async (meeting: any) => {
        if (!confirm('¿Estás seguro de que deseas eliminar esta reunión? Esta acción no se puede deshacer.')) return
        try {
            await deleteMeeting(meeting.id)
            await fetchData()
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
            const { empresa, etapa, urgencyLevel, hoursUntil, clientes, seller_name, ...cleanData } = data
            await updateMeeting(editMeetingData.id, cleanData)
            await fetchData()
            setShowEditModal(false)
            setEditMeetingData(null)
        } catch (error) {
            console.error('Error updating meeting:', error)
            alert('Error al guardar cambios')
        }
    }

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

    if (auth.loading && !auth.loggedIn) {
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
                        <div className='flex items-center gap-4'>
                            <h1 className='text-3xl font-black text-[#0F2A44]'>
                                📅 Calendario de Juntas
                            </h1>
                            <div className='bg-[#2048FF]/5 border border-[#2048FF]/10 px-4 py-1.5 rounded-xl flex items-center gap-2.5 shadow-sm'>
                                <span className='text-blue-600 animate-pulse'>●</span>
                                <span className='text-xl font-bold text-[#2048FF] font-mono tabular-nums tracking-tight'>
                                    {currentTime.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                                </span>
                            </div>
                        </div>
                        <p className='text-sm text-gray-600 mt-1'>
                            Gestiona tus reuniones y confirma las que ya pasaron
                        </p>
                    </div>

                    <div className='flex items-center gap-3'>
                        {auth.profile?.role === 'admin' && (
                            <select
                                value={selectedSellerId}
                                onChange={(e) => {
                                    setSelectedSellerId(e.target.value)
                                    // Trigger fetch manually or rely on useEffect dependecy
                                }}
                                className='px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
                            >
                                <option value="all">👥 Todos los vendedores</option>
                                {sellers.map(s => (
                                    <option key={s.id} value={s.id}>👤 {s.full_name}</option>
                                ))}
                            </select>
                        )}

                        {calendarStatus.connected ? (
                            <div className='flex items-center gap-2 bg-green-50 px-3 py-2 rounded-lg border border-green-100'>
                                <span className='text-sm text-green-700 font-bold'>✅ Google Conectado</span>
                                <span className='text-[10px] text-green-600 bg-white px-2 py-0.5 rounded-full border border-green-50'>{calendarStatus.email}</span>
                            </div>
                        ) : (
                            <button
                                onClick={handleConnectGoogle}
                                className='px-4 py-2 bg-white border border-blue-200 text-blue-600 rounded-lg text-sm font-bold hover:bg-blue-50 transition-colors shadow-sm flex items-center gap-2'
                            >
                                <svg className="w-4 h-4" viewBox="0 0 24 24">
                                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                </svg>
                                Conectar Calendar
                            </button>
                        )}

                        <button
                            onClick={() => setIsEditMode(!isEditMode)}
                            className={`px-4 py-2 rounded-lg font-bold transition-all border-2 ${isEditMode
                                ? 'bg-orange-100 text-orange-700 border-orange-300 shadow-inner'
                                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                                }`}
                        >
                            {isEditMode ? '✏️ Modo Edición Activo' : '✏️ Editar'}
                        </button>

                        <div className='flex bg-gray-100 rounded-lg p-1'>
                            <button
                                onClick={() => setViewMode('list')}
                                className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${viewMode === 'list' ? 'bg-white text-[#0F2A44] shadow-sm' : 'text-gray-600'}`}
                            >
                                Lista
                            </button>
                            <button
                                onClick={() => setViewMode('week')}
                                className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${viewMode === 'week' ? 'bg-white text-[#0F2A44] shadow-sm' : 'text-gray-600'}`}
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
                            <h3 className='text-xl font-bold text-gray-900 mb-2'>No tienes juntas programadas</h3>
                            <a href='/clientes' className='inline-block px-6 py-3 bg-[#2048FF] text-white rounded-lg font-bold'>Ir a Leads</a>
                        </div>
                    ) : (
                        <div className='space-y-8'>
                            {Object.entries(groupedMeetings).map(([date, dayMeetings]) => (
                                <div key={date}>
                                    <h2 className='text-lg font-bold text-[#0F2A44] mb-4'>{date}</h2>
                                    <div className='space-y-3'>
                                        {dayMeetings.map((meeting) => {
                                            const urgency = getUrgencyColor(meeting.urgencyLevel || 'scheduled')
                                            const stage = getStageColor(meeting.etapa || '')
                                            const startTime = new Date(meeting.start_time)

                                            return (
                                                <div key={meeting.id} className={`bg-white p-5 rounded-xl border-2 ${urgency.border} hover:shadow-lg transition-all`}>
                                                    <div className='flex items-start gap-4'>
                                                        <div className='text-center min-w-[80px]'>
                                                            <p className='text-2xl font-black text-[#0F2A44]'>
                                                                {startTime.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                                                            </p>
                                                            <p className='text-xs text-gray-500'>{meeting.duration_minutes} min</p>
                                                        </div>

                                                        <div className='flex-1'>
                                                            <div className='flex items-center gap-2 mb-2'>
                                                                <span className={`px-3 py-1 rounded-full text-xs font-black ${urgency.bg} ${urgency.text} border-2 ${urgency.border}`}>{urgency.label}</span>
                                                                <span className={`px-3 py-1 rounded-full text-xs font-black ${stage.bg} ${stage.text} border ${stage.border}`}>{meeting.etapa}</span>
                                                                {meeting.meeting_status === 'pending_confirmation' && (
                                                                    <span className='px-3 py-1 rounded-full text-xs font-black bg-red-100 text-red-700 border-2 border-red-200 animate-pulse'>⚠️ Pendiente confirmar</span>
                                                                )}
                                                            </div>

                                                            <h3 className='text-lg font-bold text-gray-900 mb-1'>{meeting.title}</h3>
                                                            <p className='text-sm text-gray-600 mb-2'>🏢 {meeting.empresa}</p>
                                                            {meeting.seller_name && <p className='text-xs text-gray-500 mb-2'>👤 Vendedor: <span className='text-gray-700'>{meeting.seller_name}</span></p>}
                                                            {meeting.frozen_probability_value !== null && (
                                                                <div className='mt-3 p-3 bg-purple-50 rounded-lg border border-purple-200'>
                                                                    <p className='text-xs text-purple-800 font-bold'>🎯 Pronóstico congelado: {meeting.frozen_probability_value}%</p>
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className='flex flex-col gap-2'>
                                                            {isEditMode && (meeting.meeting_status === 'scheduled' || meeting.meeting_status === 'not_held') && (
                                                                <div className='flex items-center gap-2'>
                                                                    <button onClick={() => handleEditMeeting(meeting)} className='p-2 bg-blue-50 text-blue-600 rounded-lg'>✏️</button>
                                                                    <button onClick={() => handleDeleteMeeting(meeting)} className='p-2 bg-red-50 text-red-600 rounded-lg'>🗑️</button>
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
        </div>
    )
}
