'use client'

import { useEffect, useState } from 'react'
import { getUpcomingMeetings, type MeetingWithUrgency } from '@/lib/confirmationService'
import { getStageColor, getUrgencyColor } from '@/lib/confirmationService'
import { useAuth } from '@/lib/auth'
import MeetingModal from '@/components/MeetingModal'
import { updateMeeting, deleteMeeting } from '@/lib/meetingsService'
import { getGoogleAuthUrl, getUserAccessToken } from '@/lib/googleCalendarService'
import { createClient } from '@/lib/supabase'

import CalendarWeekView from '@/components/CalendarWeekView'

export default function CalendarioPage() {
    const auth = useAuth()
    const [meetings, setMeetings] = useState<MeetingWithUrgency[]>([])
    const [showEditModal, setShowEditModal] = useState(false)
    const [editMeetingData, setEditMeetingData] = useState<any>(null)
    const [viewMode, setViewMode] = useState<'week' | 'list'>('list')
    const [isEditMode, setIsEditMode] = useState(false)
    const [currentTime, setCurrentTime] = useState(new Date())
    const [calendarStatus, setCalendarStatus] = useState<{ connected: boolean; email?: string | null }>({ connected: false })
    const [sellers, setSellers] = useState<{ id: string; full_name: string | null; username: string | null }[]>([])
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

    useEffect(() => {
        if (selectedSellerId) fetchData()
    }, [selectedSellerId])

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
                .select('id, full_name, username')
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
        <div className='h-full flex flex-col bg-[#F8FAFB] overflow-hidden'>
            {/* Minimal Background Header */}
            <div className='bg-white px-8 py-4 shrink-0 shadow-sm z-20 flex flex-col gap-4'>
                <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-6'>
                        <div className='space-y-0.5'>
                            <h1 className='text-2xl font-black text-[#0A1635] tracking-tight'>
                                Calendario
                            </h1>
                            <p className='text-[11px] font-bold text-gray-400 uppercase tracking-widest'>
                                Gestión de Juntas y Forecast
                            </p>
                        </div>

                        <div className='h-8 w-px bg-gray-100' />

                        <div className='flex items-center gap-3'>
                            <div className='bg-blue-50 px-3 py-1.5 rounded-xl flex items-center gap-2 border border-blue-100/50'>
                                <span className='text-xs font-black text-blue-600 tabular-nums'>
                                    {currentTime.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                                </span>
                            </div>

                            {calendarStatus.connected ? (
                                <div className='group relative'>
                                    <div className='flex items-center gap-1.5 bg-emerald-50 px-2.5 py-1.5 rounded-xl border border-emerald-100 cursor-help transition-all hover:bg-emerald-100'>
                                        <span className='text-[10px]'>🟢</span>
                                        <span className='text-[10px] font-black text-emerald-700 uppercase'>Google</span>
                                    </div>
                                    <div className='absolute top-full right-0 mt-2 bg-[#0F2A44] text-white text-[10px] p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-xl'>
                                        Sincronizado con: {calendarStatus.email}
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={handleConnectGoogle}
                                    className='px-3 py-1.5 bg-white border border-blue-200 text-blue-600 rounded-xl text-[10px] font-black hover:bg-blue-600 hover:text-white transition-all shadow-sm flex items-center gap-1.5 uppercase'
                                >
                                    <span>🔗</span> Conectar
                                </button>
                            )}
                        </div>
                    </div>

                    <div className='flex items-center gap-4'>
                        {/* Selector de Vendedores con MEJOR CONTRASTE */}
                        {auth.profile?.role === 'admin' && (
                            <div className='flex items-center gap-2'>
                                <label className='text-[9px] font-black text-gray-500 uppercase tracking-widest'>Filtro:</label>
                                <select
                                    value={selectedSellerId}
                                    onChange={(e) => setSelectedSellerId(e.target.value)}
                                    className='px-3 py-1.5 bg-white border-2 border-gray-100 rounded-xl text-sm font-black text-[#0A1635] shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer'
                                >
                                    <option value="all" className='text-[#0A1635]'>👥 Todos los vendedores</option>
                                    {sellers.map(s => (
                                        <option key={s.id} value={s.id} className='text-[#0A1635]'>👤 {s.full_name || s.username || 'Sin nombre'}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className='h-8 w-px bg-gray-100' />

                        <div className='flex items-center gap-2'>
                            <button
                                onClick={() => setIsEditMode(!isEditMode)}
                                className={`h-9 px-4 rounded-xl text-xs font-black transition-all border-2 flex items-center gap-2 shadow-sm transform active:scale-95 ${isEditMode
                                    ? 'bg-orange-500 text-white border-orange-600'
                                    : 'bg-white text-gray-700 border-gray-100 hover:border-gray-200'
                                    }`}
                            >
                                <span>{isEditMode ? '🔒' : '✏️'}</span> {isEditMode ? 'Finalizar' : 'Editar'}
                            </button>

                            <div className='flex bg-gray-50 rounded-xl p-0.5 border border-gray-100'>
                                <button
                                    onClick={() => setViewMode('list')}
                                    className={`px-4 py-1.5 rounded-[10px] text-[10px] font-black transition-all uppercase tracking-widest ${viewMode === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                >
                                    Lista
                                </button>
                                <button
                                    onClick={() => setViewMode('week')}
                                    className={`px-4 py-1.5 rounded-[10px] text-[10px] font-black transition-all uppercase tracking-widest ${viewMode === 'week' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                >
                                    Semana
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className='flex-1 overflow-hidden p-8 flex flex-col min-h-0'>
                <div className='max-w-7xl mx-auto w-full flex-1 flex flex-col min-h-0'>
                    {meetings.length === 0 ? (
                        <div className='flex-1 flex flex-col items-center justify-center bg-white rounded-[40px] shadow-2xl shadow-blue-500/5 p-12 text-center border border-gray-50'>
                            <div className='w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center text-4xl mb-6'>📅</div>
                            <h3 className='text-3xl font-black text-[#0A1635] mb-3'>No hay juntas programadas</h3>
                            <p className='text-gray-400 mb-8 font-medium max-w-sm'>Empieza agendando una reunión con uno de tus leads para verla aquí.</p>
                            <a href='/clientes' className='px-8 py-3 bg-[#2048FF] text-white rounded-2xl font-black shadow-xl shadow-blue-500/20 hover:bg-[#1700AC] transition-all transform hover:-translate-y-1'>
                                Ir a Leads
                            </a>
                        </div>
                    ) : (
                        <div className='flex-1 animate-in fade-in slide-in-from-bottom-4 duration-700 overflow-y-auto custom-scrollbar pr-2 min-h-0'>
                            {viewMode === 'list' ? (
                                <div className='space-y-10 pb-10'>
                                    {Object.entries(groupedMeetings).map(([date, dayMeetings]) => (
                                        <div key={date} className='space-y-4'>
                                            <div className='inline-block px-5 py-2 bg-[#0A1635] rounded-2xl shadow-lg'>
                                                <h2 className='text-xs font-black text-white uppercase tracking-[0.2em]'>{date}</h2>
                                            </div>
                                            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
                                                {dayMeetings.map((meeting) => {
                                                    const urgency = getUrgencyColor(meeting.urgencyLevel || 'scheduled')
                                                    const stage = getStageColor(meeting.etapa || '')
                                                    const startTime = new Date(meeting.start_time)

                                                    return (
                                                        <div key={meeting.id} className={`group relative bg-white p-6 rounded-[32px] border-2 ${urgency.border} hover:shadow-2xl hover:shadow-blue-500/10 transition-all cursor-pointer transform hover:-translate-y-1`}>
                                                            <div className='flex items-start justify-between mb-6'>
                                                                <div className='bg-gray-50 px-4 py-2 rounded-2xl border border-gray-100'>
                                                                    <p className='text-2xl font-black text-[#0A1635] tabular-nums leading-none'>
                                                                        {startTime.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                                                                    </p>
                                                                    <p className='text-[10px] font-black text-gray-400 uppercase mt-1'>{meeting.duration_minutes} min</p>
                                                                </div>

                                                                <div className='flex flex-col gap-1.5 items-end'>
                                                                    <span className={`px-3 py-1 rounded-xl text-[9px] font-black border-2 uppercase tracking-tight ${urgency.bg} ${urgency.text} ${urgency.border}`}>{urgency.label}</span>
                                                                    <span className={`px-3 py-1 rounded-xl text-[9px] font-black border uppercase tracking-tight ${stage.bg} ${stage.text} ${stage.border}`}>{meeting.etapa}</span>
                                                                </div>
                                                            </div>

                                                            <div className='space-y-3 mb-6'>
                                                                <h3 className='text-lg font-black text-[#0A1635] leading-tight group-hover:text-blue-600 transition-colors'>{meeting.title}</h3>
                                                                <div className='flex flex-col gap-1'>
                                                                    <p className='text-xs font-bold text-gray-600 flex items-center gap-2'>
                                                                        <span className='w-5 h-5 bg-blue-50 rounded-lg flex items-center justify-center'>🏢</span>
                                                                        {meeting.empresa}
                                                                    </p>
                                                                    {meeting.seller_name && (
                                                                        <p className='text-[10px] font-bold text-gray-400 flex items-center gap-2'>
                                                                            <span className='w-5 h-5 bg-gray-50 rounded-lg flex items-center justify-center'>👤</span>
                                                                            {meeting.seller_name}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {meeting.frozen_probability_value !== null && (
                                                                <div className='p-3 bg-purple-50 rounded-2xl border border-purple-100 flex items-center justify-between'>
                                                                    <span className='text-[10px] font-black text-purple-700 uppercase'>Forecast Congelado</span>
                                                                    <span className='text-lg font-black text-purple-900'>{meeting.frozen_probability_value}%</span>
                                                                </div>
                                                            )}

                                                            {meeting.meeting_status === 'pending_confirmation' && (
                                                                <div className='mt-3 p-3 bg-red-50 rounded-2xl border-2 border-red-100 flex items-center gap-3 animate-pulse'>
                                                                    <span className='text-lg'>⚠️</span>
                                                                    <p className='text-[10px] font-black text-red-700 uppercase leading-tight'>Pendiente confirmar reunión</p>
                                                                </div>
                                                            )}

                                                            {/* Actions Overlay */}
                                                            {isEditMode && (meeting.meeting_status === 'scheduled' || meeting.meeting_status === 'not_held') && (
                                                                <div className='absolute inset-0 bg-white/60 backdrop-blur-[2px] rounded-[32px] flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100 transition-all'>
                                                                    <button onClick={() => handleEditMeeting(meeting)} className='w-12 h-12 bg-white text-blue-600 rounded-2xl shadow-xl border border-gray-100 hover:bg-blue-600 hover:text-white transition-all transform hover:scale-110 flex items-center justify-center text-xl'>✏️</button>
                                                                    <button onClick={() => handleDeleteMeeting(meeting)} className='w-12 h-12 bg-white text-red-600 rounded-2xl shadow-xl border border-gray-100 hover:bg-red-600 hover:text-white transition-all transform hover:scale-110 flex items-center justify-center text-xl'>🗑️</button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <CalendarWeekView
                                    meetings={meetings}
                                    onEditMeeting={handleEditMeeting}
                                    isEditMode={isEditMode}
                                    getUrgencyColor={getUrgencyColor}
                                    getStageColor={getStageColor}
                                />
                            )}
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
