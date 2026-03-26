'use client'

import { useEffect, useState, useCallback, type CSSProperties } from 'react'
import { getUpcomingMeetings, type MeetingWithUrgency, calculateMeetingUrgency } from '@/lib/confirmationService'
import { getStageColor, getUrgencyColor } from '@/lib/confirmationService'
import { useAuth } from '@/lib/auth'
import MeetingModal from '@/components/MeetingModal'
import ConfirmModal from '@/components/ConfirmModal'
import { updateMeeting } from '@/lib/meetingsService'
import { deleteMeetingAction } from '@/app/actions/meetings'
import { getGoogleAuthUrlWithState, getGoogleConnectionStatus } from '@/app/actions/google-integration'
import { listGoogleCalendarEventsAction, syncGoogleEventsAction } from '@/app/actions/google-calendar'
import { createClient } from '@/lib/supabase'

import CalendarWeekView from '@/components/CalendarWeekView'
import CalendarMonthView from '@/components/CalendarMonthView'
import { Clock, Users, ShieldCheck, CalendarDays, UserCircle2, Building2, Video, Trash2, Pencil, AlertCircle, RefreshCw, Link2, MapPin, UserRound, CalendarClock, CheckCircle2, CircleDashed, XCircle } from 'lucide-react'
import RichardDawkinsFooter from '@/components/RichardDawkinsFooter'

type GoogleCalendarEvent = {
    id: string
    status: string
    title: string
    description: string | null
    location: string | null
    htmlLink: string | null
    meetLink: string | null
    startTime: string
    endTime: string
    isAllDay: boolean
    updatedAt: string | null
    organizer: {
        email: string | null
        displayName: string | null
    } | null
    creator: {
        email: string | null
        displayName: string | null
    } | null
    attendees: Array<{
        email: string
        displayName: string | null
        responseStatus: string | null
        optional: boolean
        organizer: boolean
        self: boolean
    }>
    linkedMeeting: {
        id: string
        leadId: number
        title: string
        meetingStatus: string
        status: string
    } | null
}

export default function CalendarioPage() {
    const auth = useAuth()
    const [meetings, setMeetings] = useState<MeetingWithUrgency[]>([])
    const [googleEvents, setGoogleEvents] = useState<GoogleCalendarEvent[]>([])
    const [showEditModal, setShowEditModal] = useState(false)
    const [editMeetingData, setEditMeetingData] = useState<any>(null)
    const [viewMode, setViewMode] = useState<'month' | 'week' | 'list'>('list')
    const [calendarMonthDate, setCalendarMonthDate] = useState(() => new Date())
    const [isEditMode, setIsEditMode] = useState(false)
    const [currentTime, setCurrentTime] = useState(new Date())
    const [calendarStatus, setCalendarStatus] = useState<{ connected: boolean; email?: string | null }>({ connected: false })
    const [googleEventsLoading, setGoogleEventsLoading] = useState(false)
    const [googleSyncLoading, setGoogleSyncLoading] = useState(false)
    const [googleSyncSummary, setGoogleSyncSummary] = useState<string | null>(null)
    const [googleLastRefresh, setGoogleLastRefresh] = useState<Date | null>(null)
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

    const fetchCalendarStatus = useCallback(async () => {
        try {
            const status = await getGoogleConnectionStatus()
            if (status?.connected) {
                setCalendarStatus({ connected: true, email: status.email })
            } else {
                setCalendarStatus({ connected: false, email: null })
            }
        } catch (error) {
            console.error('Error fetching calendar status:', error)
            setCalendarStatus({ connected: false, email: null })
        }
    }, [])

    const fetchSellers = useCallback(async () => {
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
    }, [])

    const fetchData = useCallback(async () => {
        try {
            if (!auth.user) return
            const isAdminOrRH = auth.profile?.role === 'admin' || auth.profile?.role === 'rh'
            const targetId = (isAdminOrRH && selectedSellerId !== 'all') ? selectedSellerId : auth.user.id
            const showAll = isAdminOrRH && selectedSellerId === 'all'

            const allMeetings = await getUpcomingMeetings(
                targetId,
                200,
                showAll,
                auth.user?.email || undefined,
                auth.profile?.username || undefined
            )
            setMeetings(allMeetings)
        } catch (error) {
            console.error('Error fetching calendar data:', error)
        }
    }, [auth.user, auth.profile?.role, auth.profile?.username, selectedSellerId])

    const fetchGoogleEvents = useCallback(async () => {
        if (!auth.user?.id) return
        setGoogleEventsLoading(true)

        try {
            const result = await listGoogleCalendarEventsAction(auth.user.id, {
                daysBack: 7,
                daysForward: 120,
                maxResults: 500,
                includeCancelled: false
            })

            if (result.success) {
                setGoogleEvents((result.events || []) as GoogleCalendarEvent[])
                setGoogleLastRefresh(new Date())
            } else if (String(result.error || '').toLowerCase().includes('no google connection')) {
                setGoogleEvents([])
                setCalendarStatus({ connected: false, email: null })
            }
        } catch (error) {
            console.error('Error fetching Google events:', error)
        } finally {
            setGoogleEventsLoading(false)
        }
    }, [auth.user?.id])

    const syncGoogleAndRefresh = useCallback(async (silent: boolean = false) => {
        if (!auth.user?.id || !calendarStatus.connected) return
        if (!silent) setGoogleSyncLoading(true)

        try {
            const syncResult = await syncGoogleEventsAction(auth.user.id)
            if (!syncResult.success) {
                const errorMessage = String(syncResult.error || 'Error de sincronización con Google Calendar')
                setGoogleSyncSummary(errorMessage)
                if (errorMessage.toLowerCase().includes('no google connection')) {
                    setCalendarStatus({ connected: false, email: null })
                    setGoogleEvents([])
                }
                return
            }

            const updatedCount = Number(syncResult.updatedCount || 0)
            const cancelledCount = Number(syncResult.cancelledCount || 0)
            const unlinkedCount = Number(syncResult.unlinkedCount || 0)
            const summaryParts: string[] = []
            if (updatedCount > 0) summaryParts.push(`${updatedCount} juntas actualizadas`)
            if (cancelledCount > 0) summaryParts.push(`${cancelledCount} juntas canceladas`)
            if (unlinkedCount > 0) summaryParts.push(`${unlinkedCount} eventos nuevos detectados en Google`)
            setGoogleSyncSummary(summaryParts.length > 0 ? summaryParts.join(' · ') : 'Sin cambios recientes en Google Calendar')

            await Promise.all([fetchData(), fetchGoogleEvents()])
        } catch (error) {
            console.error('Error syncing Google Calendar:', error)
            setGoogleSyncSummary('No se pudo completar la sincronización con Google Calendar.')
        } finally {
            if (!silent) setGoogleSyncLoading(false)
        }
    }, [auth.user?.id, calendarStatus.connected, fetchData, fetchGoogleEvents])

    useEffect(() => {
        if (!auth.loading && auth.user) {
            fetchData()
            fetchCalendarStatus()
            if (auth.profile?.role === 'admin' || auth.profile?.role === 'rh') {
                fetchSellers()
            }
        }
    }, [auth.user, auth.loading, auth.profile, fetchData, fetchCalendarStatus, fetchSellers])

    useEffect(() => {
        if (selectedSellerId) fetchData()
    }, [selectedSellerId, fetchData])

    useEffect(() => {
        if (!auth.user?.id || !calendarStatus.connected) {
            setGoogleEvents([])
            return
        }

        void syncGoogleAndRefresh(true)
    }, [auth.user?.id, calendarStatus.connected, syncGoogleAndRefresh])

    useEffect(() => {
        if (!auth.user?.id || !calendarStatus.connected) return

        const interval = setInterval(() => {
            void syncGoogleAndRefresh(true)
        }, 60 * 1000)

        return () => clearInterval(interval)
    }, [auth.user?.id, calendarStatus.connected, syncGoogleAndRefresh])

    const handleConnectGoogle = async () => {
        const url = await getGoogleAuthUrlWithState(auth.user?.id || null)
        window.location.href = url
    }

    const handleManualGoogleSync = async () => {
        await syncGoogleAndRefresh(false)
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

    const getUrgencyRibbonStyle = (level: MeetingWithUrgency['urgencyLevel']): CSSProperties => {
        switch (level) {
            case 'overdue':
                return {
                    background: 'color-mix(in srgb, #ef4444 24%, var(--card-bg))',
                    color: 'color-mix(in srgb, var(--text-primary) 82%, #ef4444)',
                    borderColor: 'color-mix(in srgb, #ef4444 45%, var(--card-border))'
                }
            case 'urgent':
                return {
                    background: 'color-mix(in srgb, #f59e0b 28%, var(--card-bg))',
                    color: 'color-mix(in srgb, var(--text-primary) 80%, #b45309)',
                    borderColor: 'color-mix(in srgb, #f59e0b 46%, var(--card-border))'
                }
            case 'today':
                return {
                    background: 'color-mix(in srgb, #eab308 22%, var(--card-bg))',
                    color: 'color-mix(in srgb, var(--text-primary) 80%, #854d0e)',
                    borderColor: 'color-mix(in srgb, #eab308 40%, var(--card-border))'
                }
            case 'soon':
                return {
                    background: 'color-mix(in srgb, #3b82f6 15%, var(--card-bg))',
                    color: 'color-mix(in srgb, var(--text-primary) 82%, #1d4ed8)',
                    borderColor: 'color-mix(in srgb, #3b82f6 38%, var(--card-border))'
                }
            case 'in_progress':
                return {
                    background: 'color-mix(in srgb, #2048FF 22%, var(--card-bg))',
                    color: 'var(--text-primary)',
                    borderColor: 'color-mix(in srgb, #2048FF 44%, var(--card-border))'
                }
            default:
                return {
                    background: 'color-mix(in srgb, var(--hover-bg) 80%, var(--card-bg))',
                    color: 'var(--text-secondary)',
                    borderColor: 'var(--card-border)'
                }
        }
    }

    const getGoogleStatusBadge = (status: string) => {
        const normalized = String(status || '').toLowerCase()
        if (normalized === 'cancelled') {
            return {
                icon: XCircle,
                label: 'Cancelado',
                className: 'text-rose-600 bg-rose-500/10 border border-rose-500/20'
            }
        }
        if (normalized === 'tentative') {
            return {
                icon: CircleDashed,
                label: 'Tentativo',
                className: 'text-amber-700 bg-amber-500/10 border border-amber-500/25'
            }
        }
        return {
            icon: CheckCircle2,
            label: 'Confirmado',
            className: 'text-emerald-700 bg-emerald-500/10 border border-emerald-500/25'
        }
    }

    const formatGoogleEventWindow = (event: GoogleCalendarEvent) => {
        const startDate = new Date(event.startTime)
        const endDate = new Date(event.endTime)

        if (event.isAllDay) {
            return `${startDate.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })} · Todo el día`
        }

        const sameDay = startDate.toDateString() === endDate.toDateString()
        if (sameDay) {
            return `${startDate.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })} · ${startDate.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true })} - ${endDate.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true })}`
        }

        return `${startDate.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })} ${startDate.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true })} - ${endDate.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })} ${endDate.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true })}`
    }

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
                            <div className='ah-icon-card transition-all hover:scale-105'>
                                <CalendarDays size={34} strokeWidth={1.9} />
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

                    <div className='flex items-center justify-end flex-wrap gap-4 p-2 rounded-[24px] shadow-sm border' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                        {(auth.profile?.role === 'admin' || auth.profile?.role === 'rh') && (
                            <div className='flex items-center gap-3 px-4 border-r' style={{ borderColor: 'var(--card-border)' }}>
                                <Users size={16} style={{ color: 'var(--text-secondary)' }} />
                                <select
                                    value={selectedSellerId}
                                    onChange={(e) => setSelectedSellerId(e.target.value)}
                                    className='bg-transparent text-sm font-black focus:outline-none cursor-pointer transition-colors hover:text-[#2048FF]'
                                    style={{ color: 'var(--text-primary)' }}
                                >
                                    <option value="all">Todos los vendedores</option>
                                    {sellers.map(s => (
                                        <option key={s.id} value={s.id}>{s.full_name || s.username || 'Sin nombre'}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className='flex items-center gap-3 pl-1 pr-3 py-1.5 rounded-2xl border border-blue-500/20 bg-blue-500/5'>
                            <div className='w-8 h-8 rounded-xl bg-white/80 flex items-center justify-center'>
                                <CalendarClock size={16} className='text-blue-600' />
                            </div>
                            <div className='leading-tight'>
                                <p className='text-[9px] font-black uppercase tracking-[0.14em] text-blue-700'>Google Calendar</p>
                                <p className='text-[10px] font-semibold truncate max-w-[180px]' style={{ color: 'var(--text-secondary)' }}>
                                    {calendarStatus.connected
                                        ? (calendarStatus.email || 'Conectado')
                                        : 'No conectado'}
                                </p>
                            </div>
                            {calendarStatus.connected ? (
                                <button
                                    onClick={handleManualGoogleSync}
                                    disabled={googleSyncLoading}
                                    className='px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-[#2048FF] text-white hover:bg-[#1700AC] transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer'
                                >
                                    <RefreshCw size={12} className={googleSyncLoading ? 'animate-spin' : ''} />
                                    {googleSyncLoading ? 'Sincronizando' : 'Sync'}
                                </button>
                            ) : (
                                <button
                                    onClick={handleConnectGoogle}
                                    className='px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-blue-500/30 text-blue-700 hover:bg-blue-500/10 transition-colors flex items-center gap-2 cursor-pointer'
                                >
                                    <Link2 size={12} />
                                    Conectar
                                </button>
                            )}
                        </div>

                        <div className='flex bg-[var(--background)] rounded-2xl p-1 border border-[var(--card-border)]'>
                            <button
                                onClick={() => setViewMode('list')}
                                className={`px-5 py-2 rounded-xl text-[10px] font-black transition-all uppercase tracking-widest cursor-pointer ${viewMode === 'list' ? 'bg-[#2048FF] text-white shadow-lg shadow-blue-500/20' : 'text-gray-400 hover:text-blue-500 hover:bg-blue-500/10'}`}
                            >
                                Lista
                            </button>
                            <button
                                onClick={() => setViewMode('week')}
                                className={`px-5 py-2 rounded-xl text-[10px] font-black transition-all uppercase tracking-widest cursor-pointer ${viewMode === 'week' ? 'bg-[#2048FF] text-white shadow-lg shadow-blue-500/20' : 'text-gray-400 hover:text-blue-500 hover:bg-blue-500/10'}`}
                            >
                                Semana
                            </button>
                            <button
                                onClick={() => setViewMode('month')}
                                className={`px-5 py-2 rounded-xl text-[10px] font-black transition-all uppercase tracking-widest cursor-pointer ${viewMode === 'month' ? 'bg-[#2048FF] text-white shadow-lg shadow-blue-500/20' : 'text-gray-400 hover:text-blue-500 hover:bg-blue-500/10'}`}
                            >
                                Mes
                            </button>
                        </div>

                        <button
                            onClick={() => setIsEditMode(!isEditMode)}
                            className={`px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border-2 flex items-center gap-2 cursor-pointer ${isEditMode
                                ? 'bg-rose-500 border-rose-600 text-white shadow-lg shadow-rose-500/20'
                                : 'border-[var(--card-border)] text-[var(--text-primary)] hover:border-blue-500 hover:text-blue-500 hover:bg-blue-500/10'
                                }`}
                        >
                            {isEditMode ? <ShieldCheck size={14} /> : <Pencil size={14} />}
                            {isEditMode ? 'Finalizar' : 'Editar'}
                        </button>
                    </div>
                </div>

                {(googleSyncSummary || googleLastRefresh) && (
                    <div className='rounded-2xl border px-5 py-3 flex items-center justify-between gap-3' style={{ background: 'color-mix(in srgb, var(--card-bg) 88%, #dbeafe)', borderColor: 'color-mix(in srgb, var(--card-border) 78%, #bfdbfe)' }}>
                        <p className='text-xs font-semibold' style={{ color: 'var(--text-secondary)' }}>
                            {googleSyncSummary || 'Google Calendar actualizado'}
                        </p>
                        {googleLastRefresh && (
                            <span className='text-[10px] font-black uppercase tracking-widest text-blue-600'>
                                Actualizado {googleLastRefresh.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true })}
                            </span>
                        )}
                    </div>
                )}

                {/* Content Area */}
                <div className='flex-1 overflow-hidden p-8 flex flex-col min-h-0'>
                    <div className='max-w-7xl mx-auto w-full flex-1 flex flex-col min-h-0'>
                        {meetings.length === 0 && viewMode !== 'month' ? (
                            <div className='flex-1 flex flex-col items-center justify-center rounded-[40px] shadow-2xl shadow-blue-500/5 p-12 text-center border' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                                <div className='ah-icon-card ah-icon-card-lg mb-6'>
                                    <CalendarDays size={42} strokeWidth={2} />
                                </div>
                                <h3 className='text-3xl font-black mb-3' style={{ color: 'var(--text-primary)' }}>No hay juntas programadas</h3>
                                <p className='mb-8 font-medium max-w-sm' style={{ color: 'var(--text-secondary)' }}>Empieza agendando una reunión con uno de tus leads para verla aquí.</p>
                                <a href='/clientes' className='px-8 py-3 bg-[#2048FF] text-white rounded-2xl font-black shadow-xl shadow-blue-500/20 hover:bg-[#1700AC] transition-all transform hover:-translate-y-1'>
                                    Ir a Leads
                                </a>
                            </div>
                        ) : (
                            <div className='flex-1 animate-in fade-in slide-in-from-bottom-4 duration-700 overflow-y-auto custom-scrollbar pr-2 min-h-0'>
                                {viewMode === 'month' ? (
                                    <CalendarMonthView
                                        meetings={meetings}
                                        monthDate={calendarMonthDate}
                                        onChangeMonth={setCalendarMonthDate}
                                        onEditMeeting={handleEditMeeting}
                                        isEditMode={isEditMode}
                                        currentUserId={auth.user?.id || null}
                                        currentUserEmail={auth.user?.email || null}
                                        currentUsername={auth.profile?.username || null}
                                    />
                                ) : viewMode === 'list' ? (
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
                                                        const urgencyRibbonStyle = getUrgencyRibbonStyle(currentUrgencyLevel || 'scheduled')

                                                        return (
                                                            <div
                                                                key={meeting.id}
                                                                className={`group relative p-8 rounded-[40px] border-2 transition-all hover:shadow-[0_20px_50px_rgba(0,0,0,0.1)] overflow-hidden ${isEditMode ? 'cursor-pointer' : 'cursor-default'}`}
                                                                style={{
                                                                    background: 'var(--card-bg)',
                                                                    borderColor: 'var(--card-border)'
                                                                }}
                                                                onClick={() => isEditMode ? handleEditMeeting(meeting) : null}
                                                            >
                                                                {/* Status Ribbon */}
                                                                <div className='absolute top-0 right-10 px-4 py-1 rounded-b-2xl text-[8px] font-black uppercase tracking-widest shadow-sm border'
                                                                    style={urgencyRibbonStyle}
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
                                                                            <div className='w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center'>
                                                                                <Building2 size={12} strokeWidth={2.2} className='text-[#2048FF]' />
                                                                            </div>
                                                                            <p className='text-xs font-black uppercase tracking-tight truncate' style={{ color: 'var(--text-secondary)' }}>{meeting.empresa}</p>
                                                                        </div>
                                                                        {meeting.seller_name && (
                                                                            <div className='flex items-center gap-3'>
                                                                                <div className='w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center'>
                                                                                    <UserCircle2 size={12} strokeWidth={2.2} className='text-emerald-600' />
                                                                                </div>
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

                        {calendarStatus.connected && (
                            <div className='mt-8 rounded-[34px] border shadow-xl p-6 md:p-8 space-y-5' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                                <div className='flex flex-wrap items-center justify-between gap-4'>
                                    <div className='flex items-center gap-3'>
                                        <div className='w-11 h-11 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center'>
                                            <CalendarClock size={20} className='text-blue-600' />
                                        </div>
                                        <div>
                                            <h3 className='text-xl font-black' style={{ color: 'var(--text-primary)' }}>
                                                Eventos de Google Calendar
                                            </h3>
                                            <p className='text-xs font-medium' style={{ color: 'var(--text-secondary)' }}>
                                                Se muestran también los eventos creados directamente en Google.
                                            </p>
                                        </div>
                                    </div>
                                    <div className='text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-xl border border-blue-500/20 text-blue-600 bg-blue-500/10'>
                                        {googleEvents.length} eventos
                                    </div>
                                </div>

                                {googleEventsLoading ? (
                                    <div className='py-10 flex flex-col items-center justify-center gap-3 text-sm font-semibold' style={{ color: 'var(--text-secondary)' }}>
                                        <RefreshCw size={18} className='animate-spin text-blue-500' />
                                        Cargando eventos desde Google Calendar...
                                    </div>
                                ) : googleEvents.length === 0 ? (
                                    <div className='rounded-2xl border border-dashed py-10 text-center text-sm font-semibold' style={{ color: 'var(--text-secondary)', borderColor: 'var(--card-border)' }}>
                                        No hay eventos en el rango visible de Google Calendar.
                                    </div>
                                ) : (
                                    <div className='max-h-[420px] overflow-y-auto custom-scrollbar pr-1 space-y-3'>
                                        {googleEvents.map((event) => {
                                            const statusBadge = getGoogleStatusBadge(event.status)
                                            const StatusIcon = statusBadge.icon
                                            const linked = Boolean(event.linkedMeeting)

                                            return (
                                                <article
                                                    key={event.id}
                                                    className='rounded-2xl border p-4 md:p-5 space-y-3'
                                                    style={{ borderColor: 'var(--card-border)', background: 'var(--background)' }}
                                                >
                                                    <div className='flex flex-wrap items-start justify-between gap-3'>
                                                        <div className='space-y-1.5 min-w-0'>
                                                            <h4 className='text-base font-black leading-tight truncate' style={{ color: 'var(--text-primary)' }}>
                                                                {event.title}
                                                            </h4>
                                                            <p className='text-xs font-semibold' style={{ color: 'var(--text-secondary)' }}>
                                                                {formatGoogleEventWindow(event)}
                                                            </p>
                                                        </div>
                                                        <div className='flex items-center flex-wrap gap-2'>
                                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${statusBadge.className}`}>
                                                                <StatusIcon size={12} />
                                                                {statusBadge.label}
                                                            </span>
                                                            <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${linked
                                                                ? 'text-blue-700 border-blue-500/25 bg-blue-500/10'
                                                                : 'text-slate-600 border-slate-500/20 bg-slate-500/10'
                                                                }`}>
                                                                {linked ? 'Vinculado CRM' : 'Solo Google'}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className='flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] font-semibold' style={{ color: 'var(--text-secondary)' }}>
                                                        {event.location && (
                                                            <span className='inline-flex items-center gap-1.5'>
                                                                <MapPin size={12} />
                                                                {event.location}
                                                            </span>
                                                        )}
                                                        {(event.organizer?.email || event.organizer?.displayName) && (
                                                            <span className='inline-flex items-center gap-1.5'>
                                                                <UserRound size={12} />
                                                                {event.organizer?.displayName || event.organizer?.email}
                                                            </span>
                                                        )}
                                                        <span>Asistentes: {event.attendees.length}</span>
                                                        {event.updatedAt && (
                                                            <span>
                                                                Actualizado: {new Date(event.updatedAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })} {new Date(event.updatedAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {event.description && (
                                                        <p className='text-xs leading-relaxed line-clamp-2' style={{ color: 'var(--text-secondary)' }}>
                                                            {event.description}
                                                        </p>
                                                    )}

                                                    <div className='flex flex-wrap items-center gap-2 pt-1'>
                                                        {event.htmlLink && (
                                                            <a
                                                                href={event.htmlLink}
                                                                target='_blank'
                                                                rel='noopener noreferrer'
                                                                className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-[#2048FF] text-white hover:bg-[#1700AC] transition-colors'
                                                            >
                                                                <Link2 size={12} />
                                                                Abrir en Google
                                                            </a>
                                                        )}
                                                        {event.meetLink && (
                                                            <a
                                                                href={event.meetLink}
                                                                target='_blank'
                                                                rel='noopener noreferrer'
                                                                className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border border-emerald-500/30 text-emerald-700 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors'
                                                            >
                                                                <Video size={12} />
                                                                Meet
                                                            </a>
                                                        )}
                                                    </div>
                                                </article>
                                            )
                                        })}
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
