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
import LeadForecastUpdateModal, { type LeadForecastDraft } from './LeadForecastUpdateModal'
import { Bell, X, Calendar, Clock, TrendingUp } from 'lucide-react'
import { createClient } from '@/lib/supabase'

export default function GlobalMeetingHandler() {
    const auth = useAuth()
    const userId = auth.user?.id || null
    const [pendingConfirmations, setPendingConfirmations] = useState<any[]>([])
    const [activeAlerts, setActiveAlerts] = useState<any[]>([])
    const [showConfirmationModal, setShowConfirmationModal] = useState(false)
    const [selectedMeeting, setSelectedMeeting] = useState<any>(null)
    const [postConfirmationForecastPrompt, setPostConfirmationForecastPrompt] = useState<{
        leadId: number
        leadLabel: string
        companyLabel: string
    } | null>(null)
    const [openingForecastEditor, setOpeningForecastEditor] = useState(false)
    const [forecastLeadDraft, setForecastLeadDraft] = useState<LeadForecastDraft | null>(null)
    const [showForecastUpdateModal, setShowForecastUpdateModal] = useState(false)
    const [forecastSaving, setForecastSaving] = useState(false)
    const [forecastSaveError, setForecastSaveError] = useState<string | null>(null)
    const [supabase] = useState(() => createClient())

    // Ref to track meetings currently being processed to avoid duplicate modals/saves
    const processingMeetings = useRef<Set<string>>(new Set())
    const pendingSignatureRef = useRef('')
    const showConfirmationModalRef = useRef(false)
    const selectedMeetingIdRef = useRef<string | null>(null)
    const syncInFlightRef = useRef(false)
    const disableGoogleSyncRef = useRef(false)

    const checkUpdates = useCallback(async () => {
        if (!userId || auth.loading) return

        try {
            // 0. Freeze meetings starting NOW
            const nowIso = new Date().toISOString()
            const { data: startingMeetings } = await (createClient()
                .from('meetings') as any)
                .select('id, lead_id')
                .eq('seller_id', userId)
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
            const pending = await getPendingConfirmations(userId)
            const pendingSignature = pending
                .map((m: any) => `${String(m?.id || '')}:${String(m?.updated_at || m?.start_time || '')}`)
                .join('|')
            if (pendingSignature !== pendingSignatureRef.current) {
                pendingSignatureRef.current = pendingSignature
                setPendingConfirmations(pending)
            }

            // Cross-tab synchronization logic:
            if (showConfirmationModalRef.current && selectedMeetingIdRef.current) {
                const stillPending = pending.some(m => m.id === selectedMeetingIdRef.current)
                if (!stillPending) {
                    console.log('🔄 Meeting confirmed elsewhere, closing modal.')
                    setShowConfirmationModal(false)
                    setSelectedMeeting(null)
                    return // No need to open another one immediately
                }
            }

            if (pending.length > 0 && !showConfirmationModalRef.current) {
                // Find first meeting that isn't already being processed
                const nextToConfirm = pending.find(m => !processingMeetings.current.has(m.id))

                if (nextToConfirm) {
                    setSelectedMeeting(nextToConfirm)
                    setShowConfirmationModal(true)
                }
            }

            // 2. Check for due alerts
            const alerts = await getPendingAlerts(userId)
            if (alerts.length > 0) {
                setActiveAlerts((prev: any[]) => {
                    const newAlerts = alerts.filter((a: any) => !prev.some((p: any) => p.id === a.id))
                    if (newAlerts.length === 0) return prev

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
    }, [userId, auth.loading])

    useEffect(() => {
        showConfirmationModalRef.current = showConfirmationModal
    }, [showConfirmationModal])

    useEffect(() => {
        selectedMeetingIdRef.current = selectedMeeting?.id || null
    }, [selectedMeeting])

    useEffect(() => {
        if (!userId) return

        const runGoogleSync = async () => {
            if (syncInFlightRef.current || !userId || disableGoogleSyncRef.current) return
            try {
                syncInFlightRef.current = true
                const res = await syncGoogleEventsAction(userId)
                if (res.success && res.updatedCount && res.updatedCount > 0) {
                    console.log(`✅ Auto-synced ${res.updatedCount} events from Google`)
                }
                if (!res.success) {
                    const errorMessage = String(res.error || '').toLowerCase()
                    const shouldDisable =
                        errorMessage.includes('no google connection') ||
                        errorMessage.includes('invalid_grant') ||
                        errorMessage.includes('invalid_client') ||
                        errorMessage.includes('unauthorized')

                    if (shouldDisable) {
                        disableGoogleSyncRef.current = true
                        console.warn('Google sync-back disabled for this session due to connection/token error.')
                    } else {
                        console.warn('Temporary Google sync issue. Will retry automatically.')
                    }
                }
            } finally {
                syncInFlightRef.current = false
            }
        }

        checkUpdates()
        void runGoogleSync()

        const channel = supabase
            .channel('global-notifications')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'meeting_alerts',
                    filter: `user_id=eq.${userId}`
                },
                () => checkUpdates()
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'meetings',
                    filter: `seller_id=eq.${userId}`
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
            void runGoogleSync()
        }, 60 * 1000)

        return () => {
            supabase.removeChannel(channel)
            clearInterval(interval)
            clearInterval(syncInterval)
        }
    }, [userId, checkUpdates, supabase])

    const handleConfirmMeeting = async (payload: {
        wasHeld: boolean
        notes: string
        notHeldReasonId?: string | null
        notHeldReasonCustom?: string | null
        notHeldResponsibility?: 'propia' | 'ajena' | null
    }) => {
        if (!selectedMeeting || !userId) return
        if (selectedMeeting.seller_id !== userId) return

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
                payload.wasHeld,
                {
                    notes: payload.notes,
                    notHeldReasonId: payload.notHeldReasonId || null,
                    notHeldReasonCustom: payload.notHeldReasonCustom || null,
                    notHeldResponsibility: payload.notHeldResponsibility || null
                },
                userId
            )

            if (result.success) {
                const confirmedLeadId = Number(selectedMeeting.lead_id || 0)
                const companyLabel = String(selectedMeeting?.clientes?.empresa || selectedMeeting?.empresa || 'Empresa')
                const leadLabel = String(selectedMeeting?.clientes?.nombre || selectedMeeting?.title || `Lead ${confirmedLeadId}`)
                setShowConfirmationModal(false)
                setSelectedMeeting(null)
                // Remove from local list to avoid re-triggering before next checkUpdates
                setPendingConfirmations(prev => prev.filter(p => p.id !== meetingId))
                if (payload.wasHeld && Number.isFinite(confirmedLeadId) && confirmedLeadId > 0) {
                    setPostConfirmationForecastPrompt({
                        leadId: confirmedLeadId,
                        leadLabel,
                        companyLabel
                    })
                }
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

    const openForecastEditor = async () => {
        if (!postConfirmationForecastPrompt) return
        setOpeningForecastEditor(true)
        setForecastSaveError(null)
        try {
            const { data: leadData, error: leadError } = await (supabase.from('clientes') as any)
                .select('id, nombre, empresa, probabilidad, valor_estimado, valor_implementacion_estimado, forecast_close_date')
                .eq('id', postConfirmationForecastPrompt.leadId)
                .maybeSingle()

            if (leadError || !leadData) {
                throw new Error(leadError?.message || 'No se pudo cargar el lead para editar pronóstico.')
            }

            setForecastLeadDraft({
                id: Number(leadData.id),
                nombre: String(leadData.nombre || ''),
                empresa: String(leadData.empresa || postConfirmationForecastPrompt.companyLabel || ''),
                probabilidad: Number(leadData.probabilidad || 0),
                valorEstimado: leadData.valor_estimado == null ? null : Number(leadData.valor_estimado),
                valorImplementacionEstimado: leadData.valor_implementacion_estimado == null ? null : Number(leadData.valor_implementacion_estimado),
                forecastCloseDate: leadData.forecast_close_date ? String(leadData.forecast_close_date) : null
            })
            setPostConfirmationForecastPrompt(null)
            setShowForecastUpdateModal(true)
        } catch (error: any) {
            console.error('Error opening forecast editor:', error)
            alert(error?.message || 'No se pudo abrir el popup de pronóstico.')
        } finally {
            setOpeningForecastEditor(false)
        }
    }

    const handleSaveForecastUpdate = async (payload: {
        probabilidad: number
        valorEstimado: number | null
        valorImplementacionEstimado: number | null
        forecastCloseDate: string | null
    }) => {
        if (!forecastLeadDraft || !userId) {
            throw new Error('No hay lead seleccionado para actualizar pronóstico.')
        }

        const leadId = Number(forecastLeadDraft.id)
        const normalizedForecastDate = String(payload.forecastCloseDate || '').trim() || null
        const normalizedMonthlyForecast = payload.valorEstimado == null ? null : Number(payload.valorEstimado)
        const normalizedImplementationForecast = payload.valorImplementacionEstimado == null ? null : Number(payload.valorImplementacionEstimado)
        const normalizedProbability = Math.max(0, Math.min(100, Math.round(Number(payload.probabilidad) || 0)))

        setForecastSaveError(null)
        setForecastSaving(true)
        try {
            const { data: currentLead, error: currentLeadError } = await (supabase.from('clientes') as any)
                .select('probabilidad, valor_estimado, valor_implementacion_estimado, forecast_close_date')
                .eq('id', leadId)
                .maybeSingle()

            if (currentLeadError || !currentLead) {
                throw new Error(currentLeadError?.message || 'No se encontró el lead para guardar el pronóstico.')
            }

            const { error: updateError } = await (supabase.from('clientes') as any)
                .update({
                    probabilidad: normalizedProbability,
                    valor_estimado: normalizedMonthlyForecast,
                    valor_implementacion_estimado: normalizedImplementationForecast,
                    forecast_close_date: normalizedForecastDate
                })
                .eq('id', leadId)

            if (updateError) {
                throw new Error(updateError.message || 'No se pudo actualizar el pronóstico.')
            }

            const historyEntries: any[] = []
            const addHistoryIfChanged = (fieldName: string, oldValue: unknown, newValue: unknown) => {
                const normalizedOld = oldValue == null ? null : String(oldValue)
                const normalizedNew = newValue == null ? null : String(newValue)
                if (normalizedOld === normalizedNew) return
                historyEntries.push({
                    lead_id: leadId,
                    field_name: fieldName,
                    old_value: normalizedOld,
                    new_value: normalizedNew,
                    changed_by: userId
                })
            }

            addHistoryIfChanged('probabilidad', currentLead.probabilidad, normalizedProbability)
            addHistoryIfChanged('valor_estimado', currentLead.valor_estimado, normalizedMonthlyForecast)
            addHistoryIfChanged('valor_implementacion_estimado', currentLead.valor_implementacion_estimado, normalizedImplementationForecast)
            addHistoryIfChanged('forecast_close_date', currentLead.forecast_close_date, normalizedForecastDate)

            if (historyEntries.length > 0) {
                const { error: historyError } = await (supabase.from('lead_history') as any).insert(historyEntries)
                if (historyError) {
                    console.warn('Forecast updated but lead history insert failed:', historyError)
                }
            }

            setShowForecastUpdateModal(false)
            setForecastLeadDraft(null)
            await checkUpdates()
        } catch (error: any) {
            const message = error?.message || 'No se pudo guardar el pronóstico.'
            setForecastSaveError(message)
            throw error
        } finally {
            setForecastSaving(false)
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

    if (!userId) return null

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

            {postConfirmationForecastPrompt && (
                <div className='ah-modal-overlay z-[210]' style={{ alignItems: 'center', padding: '16px' }}>
                    <div className='ah-modal-panel w-full max-w-lg'>
                        <div className='ah-modal-header'>
                            <div>
                                <h2 className='ah-modal-title text-lg inline-flex items-center gap-2'>
                                    <TrendingUp size={18} /> ¿Actualizar pronósticos?
                                </h2>
                                <p className='ah-modal-subtitle'>
                                    {postConfirmationForecastPrompt.leadLabel} · {postConfirmationForecastPrompt.companyLabel}
                                </p>
                            </div>
                            <button
                                onClick={() => setPostConfirmationForecastPrompt(null)}
                                className='ah-modal-close'
                                aria-label='Cerrar popup de actualización de pronóstico'
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className='p-5 space-y-3'>
                            <p className='text-sm font-bold text-[var(--text-primary)]'>
                                La junta quedó confirmada. ¿Quieres abrir ahora el popup para actualizar el pronóstico del lead?
                            </p>
                            <p className='text-xs font-medium text-[var(--text-secondary)]'>
                                Esto te permite ajustar probabilidad, mensualidad, implementación y fecha estimada de cierre.
                            </p>
                        </div>
                        <div className='ah-modal-footer'>
                            <button
                                type='button'
                                onClick={() => setPostConfirmationForecastPrompt(null)}
                                className='ah-modal-btn ah-modal-btn-secondary'
                            >
                                Cerrar
                            </button>
                            <button
                                type='button'
                                onClick={openForecastEditor}
                                disabled={openingForecastEditor}
                                className='ah-modal-btn ah-modal-btn-success'
                            >
                                {openingForecastEditor ? 'Abriendo...' : 'Confirmar y actualizar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <LeadForecastUpdateModal
                isOpen={showForecastUpdateModal}
                lead={forecastLeadDraft}
                onClose={() => {
                    setShowForecastUpdateModal(false)
                    setForecastLeadDraft(null)
                    setForecastSaveError(null)
                }}
                onSave={handleSaveForecastUpdate}
                saving={forecastSaving}
                error={forecastSaveError}
            />

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
