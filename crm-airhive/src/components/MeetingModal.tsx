'use client'

import { useState, useEffect } from 'react'
import { Database } from '@/lib/supabase'
import { createClient } from '@/lib/supabase'
import { toLocalISOString, fromLocalISOString } from '@/lib/dateUtils'
import ConfirmModal from './ConfirmModal'
import UserSelect from './UserSelect'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'
import { useTheme } from '@/lib/ThemeContext'
import { Building2, CalendarDays, Phone, Sparkles, Video, X, PencilLine, Link2 } from 'lucide-react'

type MeetingInsert = Database['public']['Tables']['meetings']['Insert']

interface MeetingModalProps {
    isOpen: boolean
    onClose: () => void
    onSave: (data: MeetingInsert) => Promise<void>
    leadId: number
    sellerId: string
    initialData?: any
    mode?: 'create' | 'edit'
}

export default function MeetingModal({
    isOpen,
    onClose,
    onSave,
    leadId,
    sellerId,
    initialData,
    mode = 'create'
}: MeetingModalProps) {
    useBodyScrollLock(isOpen)
    const { theme } = useTheme()
    const [formData, setFormData] = useState({
        title: '',
        start_time: '',
        duration_minutes: 60,
        meeting_type: 'video' as 'presencial' | 'llamada' | 'video',
        notes: '',
        attendees: [] as string[],
        calendar_provider: null as 'google' | 'outlook' | null
    })
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isGoogleConnected, setIsGoogleConnected] = useState(false)

    // Sync Fail Modal State
    const [showSyncFailModal, setShowSyncFailModal] = useState(false)
    const [pendingMeetingData, setPendingMeetingData] = useState<MeetingInsert | null>(null)

    useEffect(() => {
        const init = async () => {
            if (!isOpen) return

            // 1. Initial form state from data or defaults
            if (initialData) {
                setFormData({
                    title: initialData.title || '',
                    start_time: toLocalISOString(initialData.start_time),
                    duration_minutes: initialData.duration_minutes || 60,
                    meeting_type: initialData.meeting_type || 'video',
                    notes: initialData.notes || '',
                    attendees: initialData.attendees || [],
                    calendar_provider: initialData.calendar_provider || null
                })
            } else {
                setFormData({
                    title: '',
                    start_time: '',
                    duration_minutes: 60,
                    meeting_type: 'video',
                    notes: '',
                    attendees: [],
                    calendar_provider: null
                })
            }

            // 2. Check calendar status and apply default if create mode
            try {
                const supabase = createClient()
                const { data } = await supabase
                    .from('google_integrations')
                    .select('user_id')
                    .eq('user_id', sellerId)
                    .single()

                const connected = !!data
                setIsGoogleConnected(connected)

                if (connected && mode === 'create') {
                    setFormData(prev => ({ ...prev, calendar_provider: 'google' }))
                }
            } catch (error) {
                console.error('Error checking calendar status:', error)
            }
        }

        init()
    }, [isOpen, sellerId, initialData, mode])



    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSubmitting(true)

        try {
            // Import actions dynamically to avoid bundle issues if not needed
            const { createGoogleEventAction, updateGoogleEventAction } = await import('@/app/actions/google-calendar')

            const meetingData: MeetingInsert = {
                lead_id: leadId,
                seller_id: sellerId,
                title: formData.title,
                start_time: fromLocalISOString(formData.start_time).toISOString(),
                duration_minutes: formData.duration_minutes,
                meeting_type: formData.meeting_type,
                notes: formData.notes || null,
                attendees: formData.attendees.length > 0 ? formData.attendees : null,
                calendar_provider: formData.calendar_provider,
                status: 'scheduled'
            }

            // If editing and has google provider, we might need to sync updates
            if (mode === 'edit' && initialData?.calendar_event_id && formData.calendar_provider === 'google') {
                // Update in Google Calendar via Server Action
                const result = await updateGoogleEventAction(
                    initialData.calendar_event_id,
                    meetingData,
                    'Cliente' // Ideally pass real lead name if available
                )
                if (!result.success) console.error('Failed to update Google Event', result.error)
            }
            // If creating and google provider is selected
            else if (mode === 'create' && formData.calendar_provider === 'google') {
                // We typically need to save the meeting first to get ID, or sync after.
                // But the current flow in MeetingModal calls onSave which saves to DB.
                // We need to intercept or pass the google event ID to onSave.
                // However, onSave usually just inserts into DB. 
                // Let's create the Google Event first to get the ID.

                const result = await createGoogleEventAction(meetingData, 'Cliente') // We need lead name here really

                if (result.success && result.eventId) {
                    meetingData.calendar_event_id = result.eventId
                    // Save Meet link in notes if available
                    if (result.hangoutLink) {
                        const meetMarker = `[MEET_LINK]:${result.hangoutLink}`
                        meetingData.notes = meetingData.notes
                            ? `${meetMarker}\n${meetingData.notes}`
                            : meetMarker
                    }
                } else {
                    console.error('Failed to create Google Event', result.error)
                    setPendingMeetingData(meetingData)
                    setShowSyncFailModal(true)
                    setIsSubmitting(false)
                    return
                }
            }

            await onSave(meetingData)
            onClose()
        } catch (error) {
            console.error('Error saving meeting:', error)
            alert('Error al guardar la reunión')
        } finally {
            setIsSubmitting(false)
        }
    }

    if (!isOpen) return null

    const headerTheme = {
        claro: {
            background: 'linear-gradient(135deg, #0A1635 0%, #0f2352 56%, #17306b 100%)',
            border: 'rgba(255,255,255,0.12)'
        },
        gris: {
            background: 'linear-gradient(135deg, #111827 0%, #1F2937 56%, #0F172A 100%)',
            border: 'rgba(255,255,255,0.08)'
        },
        oscuro: {
            background: 'linear-gradient(135deg, #070B14 0%, #0B1220 56%, #111827 100%)',
            border: 'rgba(255,255,255,0.08)'
        }
    }[theme]

    return (
        <div className='ah-modal-overlay'>
            <div className='ah-modal-panel w-full max-w-2xl transform transition-all'>
                {/* Header */}
                <div className='ah-modal-header' style={{ background: headerTheme.background, borderBottomColor: headerTheme.border }}>
                    <h2 className='ah-modal-title flex items-center gap-3'>
                        <span className='ah-icon-card ah-icon-card-sm'>
                            {mode === 'create' ? <CalendarDays size={18} strokeWidth={2} /> : <PencilLine size={18} strokeWidth={2} />}
                        </span>
                        {mode === 'create' ? 'Nueva Reunión' : 'Editar Reunión'}
                    </h2>
                    <button
                        onClick={onClose}
                        className='ah-modal-close text-xl cursor-pointer'
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className='p-6 overflow-y-auto custom-scrollbar space-y-4'>
                    <form id='meeting-form' onSubmit={handleSubmit} className='space-y-4'>
                        {/* Título */}
                        <div className='space-y-1.5'>
                            <label className='block text-sm font-bold' style={{ color: 'var(--text-primary)' }}>
                                Título de la Reunión <span className='text-red-500'>*</span>
                            </label>
                            <input
                                type='text'
                                required
                                value={formData.title}
                                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                className='w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF]/30 focus:border-[#2048FF] transition-colors'
                                style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                placeholder='Ej: Presentación de propuesta'
                            />
                        </div>

                        {/* Fecha y Hora + Duración */}
                        <div className='grid grid-cols-2 gap-4'>
                            <div className='space-y-1.5'>
                                <label className='block text-sm font-bold' style={{ color: 'var(--text-primary)' }}>
                                    Fecha y Hora <span className='text-red-500'>*</span>
                                </label>
                                <input
                                    type='datetime-local'
                                    required
                                    value={formData.start_time}
                                    onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                                    className='w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF]/30 focus:border-[#2048FF] transition-colors'
                                    style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                />
                            </div>

                            <div className='space-y-1.5'>
                                <label className='block text-sm font-bold' style={{ color: 'var(--text-primary)' }}>
                                    Duración (minutos)
                                </label>
                                <input
                                    type='number'
                                    min='1'
                                    step='1'
                                    value={formData.duration_minutes}
                                    onChange={(e) => setFormData({ ...formData, duration_minutes: Number(e.target.value) })}
                                    className='w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF]/30 focus:border-[#2048FF] transition-colors'
                                    style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                />
                            </div>
                        </div>

                        {/* Tipo de Reunión */}
                        <div className='space-y-1.5'>
                            <label className='block text-sm font-bold' style={{ color: 'var(--text-primary)' }}>
                                Tipo de Reunión
                            </label>
                            <div className='grid grid-cols-3 gap-3'>
                                {(['presencial', 'llamada', 'video'] as const).map((type) => (
                                    <button
                                        key={type}
                                        type='button'
                                        onClick={() => setFormData({ ...formData, meeting_type: type })}
                                        className={`px-4 py-3 rounded-lg font-bold transition-all border-2 cursor-pointer flex items-center justify-center gap-2 ${formData.meeting_type === type
                                            ? 'bg-[#2048FF] text-white border-[#2048FF] shadow-lg shadow-blue-500/20'
                                            : 'hover:border-[#2048FF]'
                                            }`}
                                        style={formData.meeting_type === type
                                            ? undefined
                                            : { background: 'var(--background)', color: 'var(--text-primary)', borderColor: 'var(--card-border)' }}
                                    >
                                        {type === 'presencial' && <Building2 size={18} />}
                                        {type === 'llamada' && <Phone size={18} />}
                                        {type === 'video' && <Video size={18} />}
                                        <span className='capitalize'>{type}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Asistentes */}
                        <div className='space-y-1.5'>
                            <UserSelect
                                label='Asistentes (Usuarios Internos)'
                                value={formData.attendees}
                                onChange={(newAttendees) => setFormData({ ...formData, attendees: newAttendees })}
                                placeholder='Seleccionar compañeros...'
                            />
                        </div>

                        {/* Notas */}
                        <div className='space-y-1.5'>
                            <label className='block text-sm font-bold' style={{ color: 'var(--text-primary)' }}>
                                Notas
                            </label>
                            <textarea
                                rows={3}
                                value={formData.notes}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                className='w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF]/30 focus:border-[#2048FF] resize-none transition-colors'
                                style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                placeholder='Agenda, temas a tratar, etc.'
                            />
                        </div>

                        {/* Integración con Calendario - More prominent */}
                        <div className='pt-2'>
                            {isGoogleConnected ? (
                                <div className='p-5 rounded-2xl border-2 shadow-sm' style={{ background: 'color-mix(in srgb, #10b981 10%, var(--card-bg))', borderColor: 'color-mix(in srgb, #10b981 32%, var(--card-border))' }}>
                                    <div className='flex items-center justify-between mb-3'>
                                        <div>
                                            <p className='text-sm font-black flex items-center gap-2' style={{ color: 'color-mix(in srgb, #059669 72%, var(--text-primary))' }}>
                                                <CalendarDays size={16} /> Google Calendar
                                            </p>
                                            <p className='text-[10px] font-bold uppercase tracking-wider' style={{ color: 'color-mix(in srgb, #10b981 80%, var(--text-secondary))' }}>Sincronización Automática</p>
                                        </div>
                                        <div className='flex items-center gap-3'>
                                            <span className={`text-[10px] font-black uppercase ${formData.calendar_provider === 'google' ? 'text-emerald-600' : 'text-gray-400'}`}>
                                                {formData.calendar_provider === 'google' ? 'Activado' : 'Desactivado'}
                                            </span>
                                            <label className='relative inline-flex items-center cursor-pointer'>
                                                <input
                                                    type='checkbox'
                                                    className='sr-only peer'
                                                    checked={formData.calendar_provider === 'google'}
                                                    onChange={(e) => setFormData({ ...formData, calendar_provider: e.target.checked ? 'google' : null })}
                                                />
                                                <div className="w-14 h-7 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:start-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                                            </label>
                                        </div>
                                    </div>
                                    <p className='text-xs leading-snug' style={{ color: 'color-mix(in srgb, #059669 75%, var(--text-primary))' }}>
                                        {formData.calendar_provider === 'google'
                                            ? 'Esta reunión se agendará automáticamente en Google Calendar y se enviarán invitaciones a los asistentes.'
                                            : 'Esta reunión se guardará de forma local en el CRM solamente.'}
                                    </p>
                                    {formData.meeting_type === 'video' && formData.calendar_provider === 'google' && (
                                        <div className='mt-3 py-2 px-3 rounded-xl border' style={{ background: 'color-mix(in srgb, #3b82f6 9%, var(--card-bg))', borderColor: 'color-mix(in srgb, #3b82f6 28%, var(--card-border))' }}>
                                            <p className='text-[11px] font-black flex items-center gap-2' style={{ color: 'color-mix(in srgb, #2563eb 72%, var(--text-primary))' }}>
                                                <Sparkles size={14} /> Google Meet incluido
                                            </p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className='p-5 rounded-2xl border-2 border-dashed' style={{ background: 'color-mix(in srgb, #3b82f6 7%, var(--card-bg))', borderColor: 'color-mix(in srgb, #3b82f6 28%, var(--card-border))' }}>
                                    <p className='text-sm font-bold mb-2 flex items-center gap-2' style={{ color: 'color-mix(in srgb, #2563eb 70%, var(--text-primary))' }}><Link2 size={14} /> Integración con Calendario</p>
                                    <p className='text-xs leading-relaxed' style={{ color: 'color-mix(in srgb, #2563eb 72%, var(--text-secondary))' }}>
                                        Para que tus juntas se agreguen a Google Calendar automáticamente, primero **conecta tu cuenta** en la sección principal del Calendario.
                                    </p>
                                </div>
                            )}
                        </div>
                    </form>
                </div>

                {/* Footer */}
                <div className='px-6 py-4 flex items-center justify-end gap-3 shrink-0 border-t' style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}>
                    <button
                        type='button'
                        onClick={onClose}
                        className='px-4 py-2 font-medium transition-colors rounded-lg shadow-sm hover:shadow border cursor-pointer'
                        style={{ color: 'var(--text-secondary)', background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
                    >
                        Cancelar
                    </button>
                    <button
                        type='submit'
                        form='meeting-form'
                        disabled={isSubmitting}
                        className='px-6 py-2 bg-[#2048FF] text-white font-black rounded-lg shadow-md hover:bg-[#1700AC] transition-all disabled:opacity-50 disabled:cursor-not-allowed transform active:scale-95 uppercase text-xs tracking-widest'
                    >
                        {isSubmitting ? 'Guardando...' : mode === 'create' ? 'Crear Reunión' : 'Guardar Cambios'}
                    </button>
                </div>
            </div>

            <ConfirmModal
                isOpen={showSyncFailModal}
                onClose={() => {
                    setShowSyncFailModal(false)
                    setPendingMeetingData(null)
                }}
                onConfirm={async () => {
                    if (pendingMeetingData) {
                        const sanitized = { ...pendingMeetingData, calendar_provider: null }
                        await onSave(sanitized as any)
                        onClose()
                    }
                }}
                title="Google Calendar Error"
                message="No se pudo conectar con Google Calendar. ¿Deseas guardar la reunión solo en el CRM?"
                isDestructive={false}
            />
        </div>
    )
}
