'use client'

import { useState } from 'react'
import { Database } from '@/lib/supabase'

type Meeting = Database['public']['Tables']['meetings']['Row']

interface MeetingConfirmationModalProps {
    meeting: Meeting & { empresa?: string; etapa?: string }
    frozenProbability: number
    onConfirm: (wasHeld: boolean, notes: string) => Promise<void>
    onClose: () => void
}

export default function MeetingConfirmationModal({
    meeting,
    frozenProbability,
    onConfirm,
    onClose
}: MeetingConfirmationModalProps) {
    const [notes, setNotes] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)

    const handleConfirm = async (wasHeld: boolean) => {
        setIsSubmitting(true)
        try {
            await onConfirm(wasHeld, notes)
        } catch (error) {
            console.error('Error confirming meeting:', error)
            alert('Error al confirmar la junta')
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4'>
            <div className='bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl transform transition-all'>
                {/* Header */}
                <div className='text-center mb-6'>
                    <div className='w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4'>
                        <span className='text-3xl'>📅</span>
                    </div>
                    <h2 className='text-2xl font-bold text-[#0F2A44] mb-2'>
                        ¿La junta se llevó a cabo?
                    </h2>
                    <p className='text-sm text-gray-600'>
                        Confirma si la reunión se realizó para registrar el snapshot del pronóstico
                    </p>
                </div>

                {/* Meeting Info */}
                <div className='bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-xl mb-4 border-2 border-blue-200'>
                    <p className='text-sm font-bold text-blue-900 mb-1'>
                        {meeting.title}
                    </p>
                    <p className='text-xs text-blue-700'>
                        <span className='font-bold'>Empresa:</span> {meeting.empresa || 'N/A'}
                    </p>
                    <p className='text-xs text-blue-700'>
                        <span className='font-bold'>Fecha:</span>{' '}
                        {new Date(meeting.start_time).toLocaleString('es-MX', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        })}
                    </p>
                    <div className='mt-3 pt-3 border-t border-blue-200'>
                        <p className='text-xs text-purple-700 font-bold'>
                            🎯 Pronóstico congelado: <span className='text-lg'>{frozenProbability}%</span>
                        </p>
                        <p className='text-xs text-purple-600 mt-1'>
                            Este valor se registrará en el snapshot si la junta se realizó
                        </p>
                    </div>
                </div>

                {/* Notes */}
                <div className='mb-6'>
                    <label className='block text-sm font-bold text-[#0F2A44] mb-2'>
                        Notas de la junta (opcional)
                    </label>
                    <textarea
                        placeholder='¿Cómo fue la junta? ¿Qué se discutió?'
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className='w-full p-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent resize-none text-gray-900 placeholder:text-gray-500'
                        rows={3}
                        disabled={isSubmitting}
                    />
                </div>

                {/* Actions */}
                <div className='flex gap-3'>
                    <button
                        onClick={() => handleConfirm(true)}
                        disabled={isSubmitting}
                        className='flex-1 bg-emerald-600 text-white py-3 px-4 rounded-lg font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md'
                    >
                        <span className='text-xl'>✅</span>
                        <span>Sí, se realizó</span>
                    </button>
                    <button
                        onClick={() => handleConfirm(false)}
                        disabled={isSubmitting}
                        className='flex-1 bg-red-600 text-white py-3 px-4 rounded-lg font-bold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md'
                    >
                        <span className='text-xl'>❌</span>
                        <span>No se realizó</span>
                    </button>
                </div>

                {/* Info Footer */}
                <div className='mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200'>
                    <p className='text-xs text-gray-600 text-center'>
                        <span className='font-bold'>Importante:</span> El snapshot solo se creará si confirmas que la junta se realizó
                    </p>
                </div>
            </div>
        </div>
    )
}
