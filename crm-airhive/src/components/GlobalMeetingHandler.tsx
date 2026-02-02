'use client'

import { useEffect, useState, useCallback } from 'react'
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

    const checkUpdates = useCallback(async () => {
        if (!auth.user || auth.loading) return

        // ADM REQ: Don't show global popups/alerts to admins unless they are the seller
        // The underlying services (getPendingConfirmations, etc) already filter by seller_id
        // which naturally allows an admin-seller to see their own alerts.
        // We'll proceed without the global admin block.

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

            if (pending.length > 0 && !showConfirmationModal) {
                setSelectedMeeting(pending[0])
                setShowConfirmationModal(true)
            }

            // 2. Check for due alerts
            const alerts = await getPendingAlerts(auth.user.id)
            if (alerts.length > 0) {
                // Filter out alerts already in activeAlerts state to avoid duplicates
                setActiveAlerts((prev: any[]) => {
                    const newAlerts = alerts.filter((a: any) => !prev.some((p: any) => p.id === a.id))

                    // Trigger browser notification for each new alert
                    newAlerts.forEach((alert: any) => {
                        if (Notification.permission === 'granted') {
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
    }, [auth.user, auth.loading, showConfirmationModal])

    useEffect(() => {
        if (!auth.user) return

        // 1. Initial Check
        checkUpdates()
        // Immediate sync-back on load
        syncGoogleEventsAction(auth.user.id).then(res => {
            if (res.success && res.updatedCount && res.updatedCount > 0) {
                console.log(`✅ Auto-synced ${res.updatedCount} events from Google`)
                // If meetings changed, we might want to refresh UI data, 
                // but since this is a global handler, usually pages have their own loaders.
                // However, checkUpdates already handles frozen probabilities etc.
            }
        })

        // 2. Real-time Subscription
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
                () => {
                    console.log('Real-time alert change detected')
                    checkUpdates()
                }
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
                    const newStatus = payload.new.meeting_status
                    console.log('Real-time meeting status update:', newStatus)
                    if (newStatus === 'pending_confirmation') {
                        checkUpdates()
                    }
                }
            )
            .subscribe()

        // Request notification permission
        if (Notification.permission === 'default') {
            Notification.requestPermission()
        }

        // Hyper-reactive check: Every 15 seconds to catch meetings ending in real-time
        const interval = setInterval(checkUpdates, 15 * 1000)

        // Sync-back check: Every 5 minutes (to avoid Google API rate limits/unnecessary load)
        const syncInterval = setInterval(() => {
            if (auth.user) {
                syncGoogleEventsAction(auth.user.id)
            }
        }, 5 * 60 * 1000)

        return () => {
            supabase.removeChannel(channel)
            clearInterval(interval)
            clearInterval(syncInterval)
        }
    }, [auth.user, checkUpdates, supabase])

    const handleConfirmMeeting = async (wasHeld: boolean, notes: string) => {
        if (!selectedMeeting || !auth.user) return

        try {
            await confirmMeeting(selectedMeeting.id, wasHeld, notes, auth.user.id)

            // Remove from local list
            const remaining = pendingConfirmations.filter(p => p.id !== selectedMeeting.id)
            setPendingConfirmations(remaining)

            if (remaining.length > 0) {
                setSelectedMeeting(remaining[0])
            } else {
                setShowConfirmationModal(false)
                setSelectedMeeting(null)
            }
        } catch (error) {
            console.error('Error confirming meeting globally:', error)
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

            {/* Global Alerts (Toasts) */}
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
                                <span className='text-[10px] font-black text-[#2048FF] uppercase tracking-widest'>
                                    Recordatorio Junta
                                </span>
                                <button
                                    onClick={() => handleDismissAlert(alert.id)}
                                    className='text-gray-400 hover:text-gray-600'
                                >
                                    <X className='w-4 h-4' />
                                </button>
                            </div>
                            <p className='text-sm font-bold text-[#0F2A44] truncate'>
                                {alert.meetings?.title || 'Junta Próxima'}
                            </p>
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
