'use client'

import { useState, useEffect } from 'react'
import { Database } from '@/lib/supabase'

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
    const [formData, setFormData] = useState({
        title: '',
        start_time: '',
        duration_minutes: 60,
        meeting_type: 'video' as 'presencial' | 'llamada' | 'video',
        notes: '',
        attendees: [] as string[],
        calendar_provider: null as 'google' | 'outlook' | null
    })
    const [attendeeInput, setAttendeeInput] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setFormData({
                    title: initialData.title || '',
                    start_time: initialData.start_time ? new Date(initialData.start_time).toISOString().slice(0, 16) : '',
                    duration_minutes: initialData.duration_minutes || 60,
                    meeting_type: initialData.meeting_type || 'video',
                    notes: initialData.notes || '',
                    attendees: initialData.attendees || [],
                    calendar_provider: initialData.calendar_provider || null
                })
            } else {
                // Reset form for new meeting
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
        }
    }, [isOpen, initialData])

    const handleAddAttendee = () => {
        if (attendeeInput.trim() && !formData.attendees.includes(attendeeInput.trim())) {
            setFormData({
                ...formData,
                attendees: [...formData.attendees, attendeeInput.trim()]
            })
            setAttendeeInput('')
        }
    }

    const handleRemoveAttendee = (attendee: string) => {
        setFormData({
            ...formData,
            attendees: formData.attendees.filter(a => a !== attendee)
        })
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSubmitting(true)

        try {
            const meetingData: MeetingInsert = {
                lead_id: leadId,
                seller_id: sellerId,
                title: formData.title,
                start_time: new Date(formData.start_time).toISOString(),
                duration_minutes: formData.duration_minutes,
                meeting_type: formData.meeting_type,
                notes: formData.notes || null,
                attendees: formData.attendees.length > 0 ? formData.attendees : null,
                calendar_provider: formData.calendar_provider,
                status: 'scheduled'
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

    return (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm'>
            <div className='w-full max-w-2xl bg-white rounded-2xl shadow-2xl transform transition-all overflow-hidden flex flex-col max-h-[90vh]'>
                {/* Header */}
                <div className='bg-[#0F2A44] px-6 py-4 flex items-center justify-between shrink-0'>
                    <h2 className='text-xl font-bold text-white'>
                        {mode === 'create' ? '📅 Nueva Reunión' : '✏️ Editar Reunión'}
                    </h2>
                    <button
                        onClick={onClose}
                        className='text-white/70 hover:text-white transition-colors text-2xl'
                    >
                        ✕
                    </button>
                </div>

                {/* Body */}
                <div className='p-6 overflow-y-auto custom-scrollbar space-y-4'>
                    <form id='meeting-form' onSubmit={handleSubmit} className='space-y-4'>
                        {/* Título */}
                        <div className='space-y-1.5'>
                            <label className='block text-sm font-bold text-[#0F2A44]'>
                                Título de la Reunión <span className='text-red-500'>*</span>
                            </label>
                            <input
                                type='text'
                                required
                                value={formData.title}
                                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent text-gray-900 placeholder:text-gray-500'
                                placeholder='Ej: Presentación de propuesta'
                            />
                        </div>

                        {/* Fecha y Hora + Duración */}
                        <div className='grid grid-cols-2 gap-4'>
                            <div className='space-y-1.5'>
                                <label className='block text-sm font-bold text-[#0F2A44]'>
                                    Fecha y Hora <span className='text-red-500'>*</span>
                                </label>
                                <input
                                    type='datetime-local'
                                    required
                                    value={formData.start_time}
                                    onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                                    className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent text-gray-900 placeholder:text-gray-500'
                                />
                            </div>

                            <div className='space-y-1.5'>
                                <label className='block text-sm font-bold text-[#0F2A44]'>
                                    Duración (minutos)
                                </label>
                                <input
                                    type='number'
                                    min='1'
                                    step='1'
                                    value={formData.duration_minutes}
                                    onChange={(e) => setFormData({ ...formData, duration_minutes: Number(e.target.value) })}
                                    className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent text-gray-900 placeholder:text-gray-500'
                                />
                            </div>
                        </div>

                        {/* Tipo de Reunión */}
                        <div className='space-y-1.5'>
                            <label className='block text-sm font-bold text-[#0F2A44]'>
                                Tipo de Reunión
                            </label>
                            <div className='grid grid-cols-3 gap-3'>
                                {(['presencial', 'llamada', 'video'] as const).map((type) => (
                                    <button
                                        key={type}
                                        type='button'
                                        onClick={() => setFormData({ ...formData, meeting_type: type })}
                                        className={`px-4 py-3 rounded-lg font-bold transition-all border-2 ${formData.meeting_type === type
                                            ? 'bg-[#2048FF] text-white border-[#2048FF]'
                                            : 'bg-white text-gray-700 border-gray-300 hover:border-[#2048FF]'
                                            }`}
                                    >
                                        {type === 'presencial' && '🏢 Presencial'}
                                        {type === 'llamada' && '📞 Llamada'}
                                        {type === 'video' && '🎥 Video'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Asistentes */}
                        <div className='space-y-1.5'>
                            <label className='block text-sm font-bold text-[#0F2A44]'>
                                Asistentes (opcional)
                            </label>
                            <div className='flex gap-2'>
                                <input
                                    type='text'
                                    value={attendeeInput}
                                    onChange={(e) => setAttendeeInput(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddAttendee())}
                                    className='flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent text-gray-900 placeholder:text-gray-500'
                                    placeholder='Email o nombre'
                                />
                                <button
                                    type='button'
                                    onClick={handleAddAttendee}
                                    className='px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-bold hover:bg-gray-200 transition-colors'
                                >
                                    + Agregar
                                </button>
                            </div>
                            {formData.attendees.length > 0 && (
                                <div className='flex flex-wrap gap-2 mt-2'>
                                    {formData.attendees.map((attendee) => (
                                        <span
                                            key={attendee}
                                            className='inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-medium'
                                        >
                                            {attendee}
                                            <button
                                                type='button'
                                                onClick={() => handleRemoveAttendee(attendee)}
                                                className='text-blue-500 hover:text-blue-700'
                                            >
                                                ✕
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Notas */}
                        <div className='space-y-1.5'>
                            <label className='block text-sm font-bold text-[#0F2A44]'>
                                Notas
                            </label>
                            <textarea
                                rows={3}
                                value={formData.notes}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent resize-none text-gray-900 placeholder:text-gray-500'
                                placeholder='Agenda, temas a tratar, etc.'
                            />
                        </div>

                        {/* Integración con Calendario (Placeholder) */}
                        <div className='bg-blue-50 p-4 rounded-lg border border-blue-200'>
                            <p className='text-sm font-bold text-blue-900 mb-2'>🗓️ Integración con Calendario</p>
                            <p className='text-xs text-blue-700 mb-3'>
                                Próximamente podrás sincronizar esta reunión con Google Calendar o Outlook.
                            </p>
                            {/* <div className='flex gap-2'>
                                <button
                                    type='button'
                                    onClick={() => setFormData({ ...formData, calendar_provider: 'google' })}
                                    className={`px-3 py-2 rounded-lg text-sm font-bold ${
                                        formData.calendar_provider === 'google'
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-white text-gray-700 border border-gray-300'
                                    }`}
                                >
                                    Google Calendar
                                </button>
                                <button
                                    type='button'
                                    onClick={() => setFormData({ ...formData, calendar_provider: 'outlook' })}
                                    className={`px-3 py-2 rounded-lg text-sm font-bold ${
                                        formData.calendar_provider === 'outlook'
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-white text-gray-700 border border-gray-300'
                                    }`}
                                >
                                    Outlook
                                </button>
                            </div> */}
                        </div>
                    </form>
                </div>

                {/* Footer */}
                <div className='bg-gray-50 px-6 py-4 flex items-center justify-end gap-3 shrink-0 border-t border-gray-200'>
                    <button
                        type='button'
                        onClick={onClose}
                        className='px-4 py-2 text-gray-700 font-medium hover:text-gray-900 transition-colors bg-white border border-gray-300 rounded-lg shadow-sm hover:shadow'
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
        </div>
    )
}
