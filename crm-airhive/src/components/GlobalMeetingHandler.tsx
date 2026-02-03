'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useAuth } from '@/lib/auth'
import {
    getPendingConfirmations,
    confirmMeeting,
    getPendingAlerts,
    markAlertAsSent,
    dismissAlert
} from '@/lib/confirmationService'
import { freezeMeetingProbability } from '@/lib/meetingsService'
import { syncGoogleEventsAction } from '@/app/actions/google-calendar'
import MeetingConfirmationModal from './MeetingConfirmationModal'
import { Bell, X, Calendar, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase'

export default function GlobalMeetingHandler() {
    const auth = useAuth()
    const [pendingConfirmations, setPendingConfirmations] = useState<any[]>([])
    const [activeAlerts, setActiveAlerts] = useState<any[]>([])
    const [showConfirmationModal, setShowConfirmationModal] = useState(false)
    const [selectedMeeting, setSelectedMeeting] = useState<any>(null)
    const [supabase] = useState(() => createClient())

    // Ref to track meetings currently being processed to avoid duplicate modals/saves
    const processingMeetings = useRef<Set<string>>(new Set())

    const checkUpdates = useCallback(async () => {
        if (!auth.user || auth.loading) return

        try {
            // 0. Freeze meetings starting NOW
            const nowIso = new Date().toISOString()
            const { data: startingMeetings } = await (createClient()
                .from('meetings') as any)
                .select('id, lead_id')
                .eq('seller_id', auth.user.id)
                .eq('meeting_status', 'scheduled')
                .lte('start_time', nowIso)
                .is('frozen_probability_value', null)

            if (startingMeetings && startingMeetings.length > 0) {
                console.log(`❄️ Freezing ${startingMeetings.length} starting meetings`)
                for (const mtg of startingMeetings) {
                    await freezeMeetingProbability(mtg.id, mtg.lead_id)
                }
            }

            // 1. Check for pending confirmations
            const pending = await getPendingConfirmations(auth.user.id)
            setPendingConfirmations(pending)

            // Cross-tab synchronization logic:
            if (showConfirmationModal && selectedMeeting) {
                const stillPending = pending.some(m => m.id === selectedMeeting.id)
                if (!stillPending) {
                    console.log('🔄 Meeting confirmed elsewhere, closing modal.')
                    setShowConfirmationModal(false)
                    setSelectedMeeting(null)
                    return // No need to open another one immediately
                }
            }

            if (pending.length > 0 && !showConfirmationModal) {
                // Find first meeting that isn't already being processed
                const nextToConfirm = pending.find(m => !processingMeetings.current.has(m.id))

                if (nextToConfirm) {
                    setSelectedMeeting(nextToConfirm)
                    setShowConfirmationModal(true)
                }
            }

            // 2. Check for due alerts
            const alerts = await getPendingAlerts(auth.user.id)
            if (alerts.length > 0) {
                setActiveAlerts((prev: any[]) => {
                    const newAlerts = alerts.filter((a: any) => !prev.some((p: any) => p.id === a.id))

                    newAlerts.forEach((alert: any) => {
                        if (typeof window !== 'undefined' && window.Notification && Notification.permission === 'granted') {
                            const title = alert.meetings?.title || 'Junta Próxima'
                            const timeText = alert.alert_type === '5min' ? '5 minutos' :
                                alert.alert_type === '15min' ? '15 minutos' :
                                    alert.alert_type === '2h' ? '2 horas' : '24 horas'

                            new Notification('Recordatorio de Junta', {
                                body: `${title} - En ${timeText}\nEmpresa: ${alert.meetings?.clientes?.empresa || 'N/A'}`,
                                icon: '/favicon.ico'
                            })
                        }
                    })

                    return [...prev, ...newAlerts]
                })
            }
        } catch (error) {
            console.error('Error checking global meeting updates:', error)
        }
    }, [auth.user, auth.loading, showConfirmationModal, selectedMeeting])

    useEffect(() => {
        if (!auth.user) return

        checkUpdates()
        syncGoogleEventsAction(auth.user.id).then(res => {
            if (res.success && res.updatedCount && res.updatedCount > 0) {
                console.log(`✅ Auto-synced ${res.updatedCount} events from Google`)
            }
        })

        const channel = supabase
            .channel('global-notifications')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'meeting_alerts',
                    filter: `user_id=eq.${auth.user.id}`
                },
                () => checkUpdates()
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'meetings',
                    filter: `seller_id=eq.${auth.user.id}`
                },
                (payload) => {
                    // Trigger update on any change to meetings to ensure UI sync
                    console.log('Real-time meeting change detected')
                    checkUpdates()
                }
            )
            .subscribe()

        if (typeof window !== 'undefined' && Notification.permission === 'default') {
            Notification.requestPermission()
        }

        const interval = setInterval(checkUpdates, 15 * 1000)
        const syncInterval = setInterval(() => {
            if (auth.user) syncGoogleEventsAction(auth.user.id)
        }, 5 * 60 * 1000)

        return () => {
            supabase.removeChannel(channel)
            clearInterval(interval)
            clearInterval(syncInterval)
        }
    }, [auth.user, checkUpdates, supabase])

    const handleConfirmMeeting = async (wasHeld: boolean, notes: string) => {
        if (!selectedMeeting || !auth.user) return

        const meetingId = selectedMeeting.id
        if (processingMeetings.current.has(meetingId)) {
            console.warn('⚠️ Meeting already being processed:', meetingId)
            return
        }

        try {
            processingMeetings.current.add(meetingId)
            console.log('🏁 Starting confirmation for:', meetingId)

            const result = await confirmMeeting(
                meetingId,
                wasHeld,
                notes,
                auth.user.id
            )

            if (result.success) {
                setShowConfirmationModal(false)
                setSelectedMeeting(null)
                // Remove from local list to avoid re-triggering before next checkUpdates
                setPendingConfirmations(prev => prev.filter(p => p.id !== meetingId))
                console.log('✅ Confirmation successful')
            }
        } catch (error: any) {
            console.error('❌ Confirmation failed:', error)
            alert('Error al confirmar la reunión: ' + (error.message || 'Error desconocido'))
            // Keep modal open so notes aren't lost
        } finally {
            processingMeetings.current.delete(meetingId)
        }
    }

    const handleDismissAlert = async (alertId: string) => {
        try {
            await dismissAlert(alertId)
            setActiveAlerts(prev => prev.filter(a => a.id !== alertId))
        } catch (error) {
            console.error('Error dismissing alert:', error)
        }
    }

    if (!auth.user) return null

    return (
        <>
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

            <div className='fixed bottom-6 right-6 z-[60] flex flex-col gap-3 max-w-sm w-full'>
                {activeAlerts.map(alert => (
                    <div
                        key={alert.id}
                        className='bg-white border-l-4 border-[#2048FF] rounded-xl shadow-2xl p-4 flex gap-4 animate-in fade-in slide-in-from-right-8 duration-300'
                    >
                        <div className='bg-blue-50 w-10 h-10 rounded-full flex items-center justify-center shrink-0'>
                            <Bell className='w-5 h-5 text-[#2048FF]' />
                        </div>

                        <div className='flex-1 min-w-0'>
                            <div className='flex items-center justify-between mb-1'>
                                <span className='text-[10px] font-black text-[#2048FF] uppercase tracking-widest'>Recordatorio Junta</span>
                                <button
                                    onClick={() => handleDismissAlert(alert.id)}
                                    className='text-gray-400 hover:text-gray-600'
                                >
                                    <X className='w-4 h-4' />
                                </button>
                            </div>
                            <p className='text-sm font-bold text-[#0F2A44] truncate'>{alert.meetings?.title || 'Junta Próxima'}</p>
                            <div className='flex items-center gap-3 mt-2 text-[10px] text-gray-500 font-medium'>
                                <span className='flex items-center gap-1'>
                                    <Calendar className='w-3 h-3' />
                                    {alert.meetings?.clientes?.empresa}
                                </span>
                                <span className='flex items-center gap-1 text-[#2048FF] font-black'>
                                    <Clock className='w-3 h-3' />
                                    {alert.alert_type === '5min' ? 'En 5 minutos' :
                                        alert.alert_type === '15min' ? 'En 15 minutos' :
                                            alert.alert_type === '2h' ? 'En 2 horas' : 'En 24 horas'}
                                </span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </>
    )
}
