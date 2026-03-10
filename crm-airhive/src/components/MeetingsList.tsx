'use client'

import { useEffect, useState } from 'react'
import { Database } from '@/lib/supabase'
import { createClient } from '@/lib/supabase'
import { getLeadMeetings, getLeadSnapshots, cancelMeeting, getMeetingPostponeCancelForecastForLead, type MeetingPostponeCancelForecast } from '@/lib/meetingsService'
import { deleteMeetingAction } from '@/app/actions/meetings'
import ConfirmModal from './ConfirmModal'
import { Building2, CalendarDays, Camera, CheckCircle2, Clock3, Hourglass, Phone, TriangleAlert, Video, Users } from 'lucide-react'

type Meeting = Database['public']['Tables']['meetings']['Row']
type Snapshot = Database['public']['Tables']['forecast_snapshots']['Row']

interface MeetingsListProps {
    leadId: number
    onEditMeeting?: (meeting: Meeting) => void
    onRefresh?: () => void
}

export default function MeetingsList({ leadId, onEditMeeting, onRefresh }: MeetingsListProps) {
    const [supabase] = useState(() => createClient())
    const [meetings, setMeetings] = useState<Meeting[]>([])
    const [snapshots, setSnapshots] = useState<Snapshot[]>([])
    const [sellerProfilesById, setSellerProfilesById] = useState<Record<string, { fullName?: string | null, username?: string | null }>>({})
    const [loading, setLoading] = useState(true)
    const [showSnapshots, setShowSnapshots] = useState(false)
    const [meetingRiskForecast, setMeetingRiskForecast] = useState<MeetingPostponeCancelForecast | null>(null)

    // Modal State
    const [confirmConfig, setConfirmConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => Promise<void>;
        isDestructive?: boolean;
    }>({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: async () => { },
        isDestructive: false
    })

    useEffect(() => {
        fetchData()
    }, [leadId])

    useEffect(() => {
        setShowSnapshots(false)
    }, [leadId])

    const fetchData = async () => {
        setLoading(true)
        try {
            const [meetingsData, snapshotsData, riskForecast] = await Promise.all([
                getLeadMeetings(leadId),
                getLeadSnapshots(leadId),
                getMeetingPostponeCancelForecastForLead(leadId)
            ])
            const meetingsRows = (meetingsData || []) as Meeting[]
            const snapshotRows = (snapshotsData || []) as Snapshot[]
            setMeetings(meetingsRows)
            setSnapshots(snapshotRows)
            setMeetingRiskForecast(riskForecast)

            const sellerIds = Array.from(new Set(
                [...meetingsRows.map((meeting) => String(meeting?.seller_id || '').trim()), ...snapshotRows.map((snapshot) => String(snapshot?.seller_id || '').trim())]
                    .filter(Boolean)
            ))
            if (sellerIds.length > 0) {
                const { data: profiles } = await (supabase.from('profiles') as any)
                    .select('id, full_name, username')
                    .in('id', sellerIds)
                const nextMap: Record<string, { fullName?: string | null, username?: string | null }> = {}
                ;((profiles || []) as any[]).forEach((row) => {
                    const id = String(row?.id || '')
                    if (!id) return
                    nextMap[id] = {
                        fullName: row?.full_name || null,
                        username: row?.username || null
                    }
                })
                setSellerProfilesById(nextMap)
            } else {
                setSellerProfilesById({})
            }
        } catch (error) {
            console.error('Error fetching meetings:', error)
            setMeetingRiskForecast(null)
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async (meetingId: string) => {
        setConfirmConfig({
            isOpen: true,
            title: 'Eliminar Reunión',
            message: '¿Estás seguro de eliminar esta reunión? Esta acción no se puede deshacer.',
            isDestructive: true,
            onConfirm: async () => {
                try {
                    const res = await deleteMeetingAction(meetingId)
                    if (res.success) {
                        await fetchData()
                        onRefresh?.()
                    } else {
                        setConfirmConfig({
                            isOpen: true,
                            title: 'Error',
                            message: res.error || 'Error al eliminar la reunión',
                            isDestructive: false,
                            onConfirm: async () => { }
                        })
                    }
                } catch (error) {
                    console.error('Error deleting meeting:', error)
                    setConfirmConfig({
                        isOpen: true,
                        title: 'Error',
                        message: 'Error al eliminar la reunión',
                        isDestructive: false,
                        onConfirm: async () => { }
                    })
                }
            }
        })
    }

    const handleCancel = async (meetingId: string) => {
        setConfirmConfig({
            isOpen: true,
            title: 'Cancelar Reunión',
            message: '¿Estás seguro de que deseas cancelar esta reunión?',
            isDestructive: false,
            onConfirm: async () => {
                try {
                    await cancelMeeting(meetingId)
                    await fetchData()
                    onRefresh?.()
                } catch (error) {
                    console.error('Error cancelling meeting:', error)
                    alert('Error al cancelar la reunión')
                }
            }
        })
    }

    const getSnapshotForMeeting = (meetingId: string) => {
        return snapshots.find(s => s.meeting_id === meetingId)
    }

    const getMeetingIcon = (type: string) => {
        switch (type) {
            case 'presencial': return <Building2 size={18} />
            case 'llamada': return <Phone size={18} />
            case 'video': return <Video size={18} />
            default: return <CalendarDays size={18} />
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
                return <span className='px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full inline-flex items-center gap-1'><CheckCircle2 size={12} /> Snapshot capturado</span>
            } else {
                return <span className='px-2 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-full inline-flex items-center gap-1'><Hourglass size={12} /> Esperando confirmación</span>
            }
        }

        return <span className='px-2 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full'>Próxima</span>
    }

    const getMeetingSequenceLabel = (meeting: Meeting) => {
        const sequence = meeting.meeting_sequence_number
        if (!sequence) return null
        return sequence === 1 ? 'Primera junta' : `Junta #${sequence}`
    }

    const formatUserDisplay = (raw?: string | null) => {
        const value = String(raw || '').trim()
        if (!value) return 'Sin asignar'
        if (value.includes('.')) {
            return value
                .split('.')
                .filter(Boolean)
                .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
                .join(' ')
        }
        return value
    }

    const getSnapshotOwnerName = (snapshot?: Snapshot | null, meeting?: Meeting | null) => {
        const sellerId = String(snapshot?.seller_id || meeting?.seller_id || '').trim()
        if (!sellerId) return 'Sin asignar'
        const profile = sellerProfilesById[sellerId]
        if (profile?.fullName) return profile.fullName
        if (profile?.username) return formatUserDisplay(profile.username)
        return sellerId
    }

    if (loading) {
        return (
            <div className='flex items-center justify-center py-8'>
                <p className='animate-pulse' style={{ color: 'var(--text-secondary)' }}>Cargando reuniones...</p>
            </div>
        )
    }

    if (meetings.length === 0) {
        return (
            <div className='text-center py-8 rounded-lg border-2 border-dashed' style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}>
                <p className='text-sm' style={{ color: 'var(--text-primary)' }}>No hay reuniones agendadas</p>
                <p className='text-xs mt-1' style={{ color: 'var(--text-secondary)' }}>Crea una reunión para comenzar el seguimiento de pronósticos</p>
            </div>
        )
    }

    return (
        <div className='space-y-3'>
            {snapshots.length > 0 && (
                <div className='flex justify-end'>
                    <button
                        type='button'
                        onClick={() => setShowSnapshots((prev) => !prev)}
                        className='px-3 py-1.5 rounded-xl border border-[var(--card-border)] bg-[var(--background)] text-[10px] font-black uppercase tracking-[0.12em] text-[var(--text-primary)] hover:border-blue-400 hover:text-blue-500 transition-colors cursor-pointer'
                    >
                        {showSnapshots ? 'Ocultar snapshots' : 'Mostrar snapshots'}
                    </button>
                </div>
            )}
            {meetings.filter(m => m.status !== 'cancelled').map((meeting) => {
                const snapshot = getSnapshotForMeeting(meeting.id)
                const startTime = new Date(meeting.start_time)
                const isUpcoming = startTime > new Date()
                const riskProbability = Number(meetingRiskForecast?.probabilityPct || 0)
                const riskTone = riskProbability >= 45
                    ? { border: 'rgba(239,68,68,0.35)', bg: 'rgba(239,68,68,0.12)', text: '#ef4444' }
                    : riskProbability >= 22
                        ? { border: 'rgba(245,158,11,0.35)', bg: 'rgba(245,158,11,0.12)', text: '#d97706' }
                        : { border: 'rgba(32,72,255,0.30)', bg: 'rgba(32,72,255,0.10)', text: '#2048FF' }

                return (
                    <div
                        key={meeting.id}
                        className={`p-4 rounded-lg border-2 transition-all ${isUpcoming && meeting.status === 'scheduled'
                            ? 'border-blue-300/50'
                            : ''
                            }`}
                        style={isUpcoming && meeting.status === 'scheduled'
                            ? { background: 'color-mix(in srgb, #3b82f6 8%, var(--card-bg))' }
                            : { background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
                    >
                        <div className='flex items-start justify-between gap-3'>
                            <div className='flex-1'>
                                <div className='flex items-center gap-2 mb-1'>
                                    <span style={{ color: 'var(--input-focus)' }}>{getMeetingIcon(meeting.meeting_type)}</span>
                                    <h3 className='font-bold' style={{ color: 'var(--text-primary)' }}>{meeting.title}</h3>
                                    {getMeetingSequenceLabel(meeting) && (
                                        <span className='px-2 py-1 text-[10px] font-black uppercase tracking-wider rounded-full border'
                                            style={{
                                                background: 'color-mix(in srgb, #2048FF 8%, var(--card-bg))',
                                                borderColor: 'color-mix(in srgb, #2048FF 24%, var(--card-border))',
                                                color: 'color-mix(in srgb, #2048FF 78%, var(--text-primary))'
                                            }}
                                        >
                                            {getMeetingSequenceLabel(meeting)}
                                        </span>
                                    )}
                                    {getMeetingStatusBadge(meeting)}
                                </div>

                                <div className='space-y-1 text-sm' style={{ color: 'var(--text-secondary)' }}>
                                    <p className='flex items-center gap-2'>
                                        <CalendarDays size={14} className='font-semibold' />
                                        {startTime.toLocaleDateString('es-MX', {
                                            weekday: 'long',
                                            year: 'numeric',
                                            month: 'long',
                                            day: 'numeric'
                                        })}
                                    </p>
                                    <p className='flex items-center gap-2'>
                                        <Clock3 size={14} className='font-semibold' />
                                        {startTime.toLocaleTimeString('es-MX', {
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                        {' '}({meeting.duration_minutes} min)
                                    </p>

                                    {meeting.attendees && meeting.attendees.length > 0 && (
                                        <p className='flex items-center gap-2'>
                                            <Users size={14} className='font-semibold' />
                                            {meeting.attendees.join(', ')}
                                        </p>
                                    )}

                                    {meeting.primary_company_contact_name && (
                                        <p className='flex items-center gap-2'>
                                            <Users size={14} className='font-semibold' />
                                            Contacto principal: {meeting.primary_company_contact_name}
                                        </p>
                                    )}

                                    {meeting.external_participants && meeting.external_participants.length > 0 && (
                                        <p className='flex items-center gap-2'>
                                            <Users size={14} className='font-semibold' />
                                            Externos: {meeting.external_participants.join(', ')}
                                        </p>
                                    )}

                                    {meeting.notes && (
                                        <div className='mt-2'>
                                            <p className='text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1'>Notas de Preparación</p>
                                            <p className='text-xs italic p-2 rounded-lg border' style={{ color: 'var(--text-secondary)', background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}>
                                                {meeting.notes}
                                            </p>
                                        </div>
                                    )}

                                    {meeting.status === 'scheduled' && meetingRiskForecast && (
                                        <div className='mt-2'>
                                            <div
                                                className='inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-widest'
                                                style={{ borderColor: riskTone.border, background: riskTone.bg, color: riskTone.text }}
                                            >
                                                <TriangleAlert size={12} />
                                                Prob. postergar/cancelar: {riskProbability.toFixed(1)}%
                                            </div>
                                            <p className='mt-1 text-[10px] font-bold uppercase tracking-[0.12em]' style={{ color: 'var(--text-secondary)' }}>
                                                Base {meetingRiskForecast.basedOn === 'company' ? 'empresa' : 'lead'} · muestra {meetingRiskForecast.sampleSize} · conf. {meetingRiskForecast.confidence}
                                            </p>
                                        </div>
                                    )}

                                    {meeting.confirmation_notes && (
                                        <div className='mt-3'>
                                            <p className='text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1'>Notas de la Junta</p>
                                            <p className='text-xs text-emerald-900 font-medium bg-emerald-50/50 p-3 rounded-xl border border-emerald-100'>
                                                {meeting.confirmation_notes}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Snapshot Info */}
                                {snapshot && showSnapshots && (
                                    <div className='mt-3 p-3 bg-purple-50 border border-purple-200 rounded-xl'>
                                        <div className='flex justify-between items-center mb-1'>
                                            <p className='text-[10px] font-black text-purple-900 uppercase tracking-widest inline-flex items-center gap-1'>
                                                <Camera size={12} /> Snapshot #{snapshot.snapshot_number}
                                            </p>
                                            <p className='text-[9px] font-bold text-purple-600'>
                                                {new Date(snapshot.snapshot_timestamp).toLocaleString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </div>
                                        <p className='text-sm font-black text-purple-700'>
                                            Probabilidad registrada: {snapshot.probability}%
                                        </p>
                                        <p className='text-xs font-bold text-purple-700/90 mt-1'>
                                            Usuario: {getSnapshotOwnerName(snapshot, meeting)}
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

            <ConfirmModal
                isOpen={confirmConfig.isOpen}
                onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
                onConfirm={confirmConfig.onConfirm}
                title={confirmConfig.title}
                message={confirmConfig.message}
                isDestructive={confirmConfig.isDestructive}
            />
        </div>
    )

}
