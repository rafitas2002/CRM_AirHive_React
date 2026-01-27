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
import MeetingConfirmationModal from './MeetingConfirmationModal'
import { Bell, X, Calendar, Clock } from 'lucide-react'

export default function GlobalMeetingHandler() {
    const auth = useAuth()
    const [pendingConfirmations, setPendingConfirmations] = useState<any[]>([])
    const [activeAlerts, setActiveAlerts] = useState<any[]>([])
    const [showConfirmationModal, setShowConfirmationModal] = useState(false)
    const [selectedMeeting, setSelectedMeeting] = useState<any>(null)

    const checkUpdates = useCallback(async () => {
        if (!auth.user || auth.loading) return

        // ADM REQ: Don't show global popups/alerts to admins
        // They can still see meetings in the dashboard but won't be interrupted
        if (auth.profile?.role === 'admin') return

        try {
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

        // Request notification permission if not already granted
        if (Notification.permission === 'default') {
            Notification.requestPermission()
        }

        checkUpdates()
        const interval = setInterval(checkUpdates, 60 * 1000)
        return () => clearInterval(interval)
    }, [auth.user, checkUpdates])

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
