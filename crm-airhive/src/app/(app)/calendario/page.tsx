'use client'

import { useEffect, useState } from 'react'
import { getUpcomingMeetings, type MeetingWithUrgency, calculateMeetingUrgency } from '@/lib/confirmationService'
import { getStageColor, getUrgencyColor } from '@/lib/confirmationService'
import { useAuth } from '@/lib/auth'
import MeetingModal from '@/components/MeetingModal'
import ConfirmModal from '@/components/ConfirmModal'
import { updateMeeting } from '@/lib/meetingsService'
import { deleteMeetingAction } from '@/app/actions/meetings'
import { getGoogleAuthUrl, getGoogleConnectionStatus } from '@/app/actions/google-integration'
import { createClient } from '@/lib/supabase'

import CalendarWeekView from '@/components/CalendarWeekView'
import { Calendar as CalendarIcon, Clock, Users, ShieldCheck, ListFilter, RotateCw, LayoutGrid, CalendarDays, Plus, UserCircle2, Building2, Video, Trash2, Pencil, AlertCircle } from 'lucide-react'
import RichardDawkinsFooter from '@/components/RichardDawkinsFooter'

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

    // Confirmation Modal State
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false)
    const [meetingToDelete, setMeetingToDelete] = useState<any>(null)

    // Alert Modal State (for errors)
    const [isAlertModalOpen, setIsAlertModalOpen] = useState(false)
    const [alertConfig, setAlertConfig] = useState({ title: '', message: '' })

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000)
        return () => clearInterval(timer)
    }, [])

    useEffect(() => {
        if (!auth.loading && auth.user) {
            fetchData()
            fetchCalendarStatus()
            if (auth.profile?.role === 'admin' || auth.profile?.role === 'rh') {
                fetchSellers()
            }
        }
    }, [auth.user, auth.loading, auth.profile])

    useEffect(() => {
        if (selectedSellerId) fetchData()
    }, [selectedSellerId])

    const fetchCalendarStatus = async () => {
        try {
            const status = await getGoogleConnectionStatus()
            if (status) {
                setCalendarStatus({ connected: true, email: status.email })
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
            const isAdminOrRH = auth.profile?.role === 'admin' || auth.profile?.role === 'rh'
            const targetId = (isAdminOrRH && selectedSellerId !== 'all') ? selectedSellerId : auth.user.id
            const showAll = isAdminOrRH && selectedSellerId === 'all'

            const allMeetings = await getUpcomingMeetings(targetId, 50, showAll, auth.user?.email || undefined)
            setMeetings(allMeetings)
        } catch (error) {
            console.error('Error fetching calendar data:', error)
        }
    }

    const handleConnectGoogle = async () => {
        const url = await getGoogleAuthUrl()
        window.location.href = url
    }

    const handleDeleteMeeting = async (meeting: any) => {
        setMeetingToDelete(meeting)
        setIsConfirmModalOpen(true)
    }

    const confirmDeleteMeeting = async () => {
        if (!meetingToDelete) return
        try {
            const res = await deleteMeetingAction(meetingToDelete.id)
            if (res.success) {
                await fetchData()
            } else {
                setAlertConfig({
                    title: 'Error al eliminar',
                    message: res.error || 'No se pudo eliminar la reunión. Inténtalo de nuevo.'
                })
                setIsAlertModalOpen(true)
            }
            setMeetingToDelete(null)
        } catch (error) {
            console.error('Error deleting meeting:', error)
            setAlertConfig({
                title: 'Error Inesperado',
                message: 'Ocurrió un error al procesar la solicitud.'
            })
            setIsAlertModalOpen(true)
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
            <div className='h-full flex items-center justify-center' style={{ background: 'var(--background)' }}>
                <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600'></div>
            </div>
        )
    }

    return (
        <div className='min-h-full flex flex-col p-8 overflow-y-auto custom-scrollbar' style={{ background: 'transparent' }}>
            <div className='max-w-7xl mx-auto space-y-10 w-full'>
                {/* External Header - Page Level */}
                <div className='flex flex-col md:flex-row md:items-center justify-between gap-6'>
                    <div className='flex items-center gap-8'>
                        <div className='flex items-center gap-6'>
                            <div className='w-16 h-16 rounded-[22px] flex items-center justify-center border shadow-lg overflow-hidden transition-all hover:scale-105' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                                <CalendarDays size={36} color="var(--input-focus)" strokeWidth={1.5} className="drop-shadow-sm" />
                            </div>
                            <div>
                                <h1 className='text-4xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>
                                    Calendario Comercial
                                </h1>
                                <p className='font-medium' style={{ color: 'var(--text-secondary)' }}>
                                    Gestión de juntas, forecast y compromisos de ventas.
                                </p>
                            </div>
                        </div>

                        <div className='hidden xl:flex items-center gap-3 bg-blue-500/10 px-4 py-2 rounded-2xl border border-blue-500/20'>
                            <Clock size={16} className='text-blue-600' />
                            <span className='text-sm font-black text-blue-600 tabular-nums'>
                                {currentTime.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                            </span>
                        </div>
                    </div>

                    <div className='flex items-center gap-4 p-2 rounded-[24px] shadow-sm border' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                        {(auth.profile?.role === 'admin' || auth.profile?.role === 'rh') && (
                            <div className='flex items-center gap-3 px-4 border-r' style={{ borderColor: 'var(--card-border)' }}>
                                <Users size={16} style={{ color: 'var(--text-secondary)' }} />
                                <select
                                    value={selectedSellerId}
                                    onChange={(e) => setSelectedSellerId(e.target.value)}
                                    className='bg-transparent text-sm font-black focus:outline-none cursor-pointer'
                                    style={{ color: 'var(--text-primary)' }}
                                >
                                    <option value="all">Todos los vendedores</option>
                                    {sellers.map(s => (
                                        <option key={s.id} value={s.id}>{s.full_name || s.username || 'Sin nombre'}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className='flex bg-[var(--background)] rounded-2xl p-1 border border-[var(--card-border)]'>
                            <button
                                onClick={() => setViewMode('list')}
                                className={`px-5 py-2 rounded-xl text-[10px] font-black transition-all uppercase tracking-widest ${viewMode === 'list' ? 'bg-[#2048FF] text-white shadow-lg shadow-blue-500/20' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                Lista
                            </button>
                            <button
                                onClick={() => setViewMode('week')}
                                className={`px-5 py-2 rounded-xl text-[10px] font-black transition-all uppercase tracking-widest ${viewMode === 'week' ? 'bg-[#2048FF] text-white shadow-lg shadow-blue-500/20' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                Semana
                            </button>
                        </div>

                        <button
                            onClick={() => setIsEditMode(!isEditMode)}
                            className={`px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border-2 flex items-center gap-2 ${isEditMode
                                ? 'bg-rose-500 border-rose-600 text-white shadow-lg shadow-rose-500/20'
                                : 'border-[var(--card-border)] text-[var(--text-primary)] hover:border-blue-500 hover:text-blue-500'
                                }`}
                        >
                            {isEditMode ? <ShieldCheck size={14} /> : <Pencil size={14} />}
                            {isEditMode ? 'Finalizar' : 'Editar'}
                        </button>
                    </div>
                </div>

                {/* Content Area */}
                <div className='flex-1 overflow-hidden p-8 flex flex-col min-h-0'>
                    <div className='max-w-7xl mx-auto w-full flex-1 flex flex-col min-h-0'>
                        {meetings.length === 0 ? (
                            <div className='flex-1 flex flex-col items-center justify-center rounded-[40px] shadow-2xl shadow-blue-500/5 p-12 text-center border' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                                <div className='w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center text-4xl mb-6'>📅</div>
                                <h3 className='text-3xl font-black mb-3' style={{ color: 'var(--text-primary)' }}>No hay juntas programadas</h3>
                                <p className='mb-8 font-medium max-w-sm' style={{ color: 'var(--text-secondary)' }}>Empieza agendando una reunión con uno de tus leads para verla aquí.</p>
                                <a href='/clientes' className='px-8 py-3 bg-[#2048FF] text-white rounded-2xl font-black shadow-xl shadow-blue-500/20 hover:bg-[#1700AC] transition-all transform hover:-translate-y-1'>
                                    Ir a Leads
                                </a>
                            </div>
                        ) : (
                            <div className='flex-1 animate-in fade-in slide-in-from-bottom-4 duration-700 overflow-y-auto custom-scrollbar pr-2 min-h-0'>
                                {viewMode === 'list' ? (
                                    <div className='space-y-10 pb-10'>
                                        {Object.entries(groupedMeetings).map(([date, dayMeetings]) => (
                                            <div key={date} className='space-y-6'>
                                                <div className='flex items-center gap-4'>
                                                    <div className='px-6 py-2.5 bg-[#0A1635] rounded-[20px] shadow-xl'>
                                                        <h2 className='text-[10px] font-black text-white uppercase tracking-[0.2em]'>{date}</h2>
                                                    </div>
                                                    <div className='h-px flex-1 bg-[var(--card-border)] opacity-30 shadow-sm' />
                                                    <span className='text-[10px] font-black opacity-30 uppercase tracking-widest' style={{ color: 'var(--text-primary)' }}>{dayMeetings.length} Juntas</span>
                                                </div>

                                                <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8'>
                                                    {dayMeetings.map((meeting) => {
                                                        const { level: currentUrgencyLevel } = calculateMeetingUrgency(meeting.start_time, meeting.duration_minutes, currentTime)
                                                        const urgency = getUrgencyColor(currentUrgencyLevel || 'scheduled')
                                                        const stage = getStageColor(meeting.etapa || '')
                                                        const startTime = new Date(meeting.start_time)

                                                        return (
                                                            <div
                                                                key={meeting.id}
                                                                className={`group relative p-8 rounded-[40px] border-2 transition-all hover:shadow-[0_20px_50px_rgba(0,0,0,0.1)] cursor-pointer overflow-hidden`}
                                                                style={{
                                                                    background: 'var(--card-bg)',
                                                                    borderColor: 'var(--card-border)'
                                                                }}
                                                                onClick={() => isEditMode ? handleEditMeeting(meeting) : null}
                                                            >
                                                                {/* Status Ribbon */}
                                                                <div className={`absolute top-0 right-10 px-4 py-1 rounded-b-2xl text-[8px] font-black uppercase tracking-widest text-white shadow-sm ${urgency.bg.replace('bg-', 'bg-').replace('-50', '-500')}`}
                                                                    style={{ background: urgency.label === 'FINALIZADA' ? '#10b981' : urgency.label === 'EN CURSO' ? '#2048FF' : undefined }}
                                                                >
                                                                    {urgency.label}
                                                                </div>

                                                                <div className='flex items-start justify-between mb-8'>
                                                                    <div className='w-20 h-20 rounded-[28px] flex flex-col items-center justify-center shadow-inner group-hover:scale-105 transition-all' style={{ background: 'var(--background)' }}>
                                                                        <p className='text-2xl font-black tabular-nums leading-none' style={{ color: 'var(--text-primary)' }}>
                                                                            {startTime.getHours().toString().padStart(2, '0')}
                                                                        </p>
                                                                        <p className='text-[10px] font-black opacity-40 uppercase tracking-tighter mt-1' style={{ color: 'var(--text-secondary)' }}>
                                                                            :{startTime.getMinutes().toString().padStart(2, '0')}
                                                                        </p>
                                                                    </div>

                                                                    <div className='flex flex-col gap-2 items-end mt-2'>
                                                                        <span className={`px-3 py-1.5 rounded-xl text-[9px] font-black border-2 uppercase tracking-wider ${stage.bg} ${stage.text} ${stage.border}`}>
                                                                            {meeting.etapa}
                                                                        </span>
                                                                        <div className='flex items-center gap-1.5 px-3 py-1 bg-gray-50 rounded-lg border border-gray-100'>
                                                                            <Clock size={10} className='text-gray-400' />
                                                                            <span className='text-[9px] font-bold text-gray-500 uppercase'>{meeting.duration_minutes}m</span>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                <div className='space-y-4 mb-8'>
                                                                    <h3 className='text-xl font-black leading-tight group-hover:text-[#2048FF] transition-colors' style={{ color: 'var(--text-primary)' }}>
                                                                        {meeting.title}
                                                                    </h3>
                                                                    <div className='space-y-2'>
                                                                        <div className='flex items-center gap-3'>
                                                                            <div className='w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-xs'>🏢</div>
                                                                            <p className='text-xs font-black uppercase tracking-tight truncate' style={{ color: 'var(--text-secondary)' }}>{meeting.empresa}</p>
                                                                        </div>
                                                                        {meeting.seller_name && (
                                                                            <div className='flex items-center gap-3'>
                                                                                <div className='w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center text-[10px]'>👤</div>
                                                                                <p className='text-[10px] font-bold opacity-60 uppercase tracking-widest truncate' style={{ color: 'var(--text-secondary)' }}>{meeting.seller_name}</p>
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    {meeting.notes?.includes('[MEET_LINK]:') && (
                                                                        <a
                                                                            href={meeting.notes?.match(/\[MEET_LINK\]:(https:\/\/\S+)/)?.[1] || '#'}
                                                                            target='_blank'
                                                                            rel='noopener noreferrer'
                                                                            onClick={(e) => e.stopPropagation()}
                                                                            className='flex items-center justify-center gap-3 w-full py-3.5 bg-[#2048FF] text-white text-[10px] font-black uppercase tracking-[0.15em] rounded-[20px] hover:bg-[#1700AC] transition-all shadow-xl shadow-blue-500/20 active:scale-95 group/meet'
                                                                        >
                                                                            <Video size={14} className='transition-transform group-hover/meet:scale-125' />
                                                                            Unirse a Videollamada
                                                                        </a>
                                                                    )}
                                                                </div>

                                                                {meeting.frozen_probability_value !== null && (
                                                                    <div className='p-4 bg-gradient-to-br from-purple-500/10 to-indigo-500/10 rounded-3xl border border-purple-500/20 flex items-center justify-between mb-4'>
                                                                        <div className='flex flex-col'>
                                                                            <span className='text-[8px] font-black text-purple-600 uppercase tracking-[0.2em]'>Forecast</span>
                                                                            <span className='text-[10px] font-black text-purple-900 uppercase'>Congelado</span>
                                                                        </div>
                                                                        <span className='text-2xl font-black text-purple-600 tracking-tighter'>
                                                                            {meeting.frozen_probability_value}%
                                                                        </span>
                                                                    </div>
                                                                )}

                                                                {meeting.meeting_status === 'pending_confirmation' && (
                                                                    <div className='p-4 bg-rose-50 rounded-3xl border-2 border-rose-100 flex items-center gap-4 animate-pulse'>
                                                                        <AlertCircle size={20} className='text-rose-500' />
                                                                        <p className='text-[9px] font-black text-rose-700 uppercase leading-tight tracking-wider'>Requiere Confirmación Urgente</p>
                                                                    </div>
                                                                )}

                                                                {/* Actions Overlay */}
                                                                {isEditMode && (meeting.meeting_status === 'scheduled' || meeting.meeting_status === 'not_held') && (
                                                                    <div className='absolute inset-0 bg-white/70 backdrop-blur-md flex items-center justify-center gap-4 opacity-0 group-hover:opacity-100 transition-all z-10'>
                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); handleEditMeeting(meeting); }}
                                                                            className='w-14 h-14 bg-white text-blue-600 rounded-[22px] shadow-2xl border border-blue-100 hover:bg-blue-600 hover:text-white transition-all transform hover:scale-110 flex items-center justify-center'
                                                                        >
                                                                            <Pencil size={24} strokeWidth={2.5} />
                                                                        </button>
                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); handleDeleteMeeting(meeting); }}
                                                                            className='w-14 h-14 bg-white text-rose-600 rounded-[22px] shadow-2xl border border-rose-100 hover:bg-rose-600 hover:text-white transition-all transform hover:scale-110 flex items-center justify-center'
                                                                        >
                                                                            <Trash2 size={24} strokeWidth={2.5} />
                                                                        </button>
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
                                    <div className='rounded-[40px] border shadow-2xl overflow-hidden flex-1 flex flex-col' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                                        <CalendarWeekView
                                            meetings={meetings}
                                            onEditMeeting={handleEditMeeting}
                                            isEditMode={isEditMode}
                                            getUrgencyColor={getUrgencyColor}
                                            getStageColor={getStageColor}
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    <RichardDawkinsFooter />
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

            <ConfirmModal
                isOpen={isConfirmModalOpen}
                onClose={() => setIsConfirmModalOpen(false)}
                onConfirm={confirmDeleteMeeting}
                title="Eliminar Reunión"
                message="¿Estás seguro de que deseas eliminar esta reunión? Esta acción no se puede deshacer."
                isDestructive={true}
            />
            <ConfirmModal
                isOpen={isAlertModalOpen}
                onClose={() => setIsAlertModalOpen(false)}
                onConfirm={() => setIsAlertModalOpen(false)}
                title={alertConfig.title}
                message={alertConfig.message}
                isDestructive={false}
            />
        </div>
    )
}
