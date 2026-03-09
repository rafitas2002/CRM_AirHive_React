'use client'

import { useEffect, useState } from 'react'
import { Database } from '@/lib/supabase'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'
import { getMeetingCancellationReasons } from '@/lib/confirmationService'
import { CalendarDays, Target, CheckCircle2, XCircle, X } from 'lucide-react'

type Meeting = Database['public']['Tables']['meetings']['Row']
type MeetingCancellationReason = Database['public']['Tables']['meeting_cancellation_reasons']['Row']
const OTHER_REASON_VALUE = '__other_reason__'
const FALLBACK_REASON_PREFIX = 'fallback:'

const FALLBACK_REASON_OPTIONS = [
    { code: 'cliente_no_asistio', label: 'El cliente no asistió' },
    { code: 'conflicto_agenda_cliente', label: 'Conflicto de agenda del cliente' },
    { code: 'conflicto_agenda_interno', label: 'Conflicto de agenda interno' },
    { code: 'reagenda_solicitada_cliente', label: 'Reprogramación solicitada por el cliente' },
    { code: 'reagenda_solicitada_interno', label: 'Reprogramación solicitada por nuestro equipo' },
    { code: 'decision_maker_no_disponible', label: 'Persona decisora no disponible' },
    { code: 'problema_tecnico_conexion', label: 'Problemas técnicos o de conectividad' },
    { code: 'falta_informacion_previa', label: 'Información previa insuficiente para realizar la reunión' },
    { code: 'cambio_prioridad_cliente', label: 'Cambio de prioridad del cliente' },
    { code: 'motivo_no_especificado', label: 'Motivo no especificado por la contraparte' }
] as const

interface MeetingConfirmationModalProps {
    meeting: Meeting & { empresa?: string; etapa?: string }
    frozenProbability: number
    onConfirm: (payload: {
        wasHeld: boolean
        notes: string
        notHeldReasonId?: string | null
        notHeldReasonCustom?: string | null
        notHeldResponsibility?: 'propia' | 'ajena' | null
    }) => Promise<void>
    onClose: () => void
}

export default function MeetingConfirmationModal({
    meeting,
    frozenProbability,
    onConfirm,
    onClose
}: MeetingConfirmationModalProps) {
    useBodyScrollLock(true)
    const [result, setResult] = useState<'held' | 'not_held' | null>(null)
    const [notes, setNotes] = useState('')
    const [notHeldResponsibility, setNotHeldResponsibility] = useState<'propia' | 'ajena' | ''>('')
    const [notHeldReasonId, setNotHeldReasonId] = useState('')
    const [customNotHeldReason, setCustomNotHeldReason] = useState('')
    const [reasonOptions, setReasonOptions] = useState<MeetingCancellationReason[]>([])
    const [loadingReasons, setLoadingReasons] = useState(true)
    const [error, setError] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)

    useEffect(() => {
        let active = true

        const loadReasons = async () => {
            setLoadingReasons(true)
            const reasons = await getMeetingCancellationReasons()
            if (!active) return
            setReasonOptions(reasons)
            setLoadingReasons(false)
        }

        void loadReasons()
        return () => { active = false }
    }, [])

    const requiresNotHeldDetails = result === 'not_held'
    const isCustomReason = notHeldReasonId === OTHER_REASON_VALUE
    const showNoCatalogNotice = !loadingReasons && reasonOptions.length === 0
    const selectedFallbackReason = showNoCatalogNotice && notHeldReasonId.startsWith(FALLBACK_REASON_PREFIX)
        ? FALLBACK_REASON_OPTIONS.find((reason) => `${FALLBACK_REASON_PREFIX}${reason.code}` === notHeldReasonId) || null
        : null

    const handleConfirm = async () => {
        if (!result) {
            setError('Selecciona si la junta se llevó a cabo o no.')
            return
        }

        if (requiresNotHeldDetails) {
            if (!notHeldReasonId) {
                setError('Selecciona un motivo de cancelación.')
                return
            }
            if (notHeldResponsibility !== 'propia' && notHeldResponsibility !== 'ajena') {
                setError('Selecciona si la cancelación fue propia o ajena.')
                return
            }
            if (isCustomReason && !customNotHeldReason.trim()) {
                setError('Escribe el nuevo motivo de cancelación.')
                return
            }
        }

        setError('')
        setIsSubmitting(true)
        try {
            const normalizedNotHeldResponsibility: 'propia' | 'ajena' | null =
                result === 'not_held' && (notHeldResponsibility === 'propia' || notHeldResponsibility === 'ajena')
                    ? notHeldResponsibility
                    : null
            const mappedNotHeldReasonId =
                result === 'not_held' && !isCustomReason && !selectedFallbackReason
                    ? notHeldReasonId
                    : null
            const mappedNotHeldReasonCustom =
                result === 'not_held'
                    ? (isCustomReason
                        ? customNotHeldReason.trim()
                        : (selectedFallbackReason?.label || null))
                    : null
            await onConfirm({
                wasHeld: result === 'held',
                notes: notes.trim(),
                notHeldReasonId: mappedNotHeldReasonId,
                notHeldReasonCustom: mappedNotHeldReasonCustom,
                notHeldResponsibility: normalizedNotHeldResponsibility
            })
        } catch (error) {
            console.error('Error confirming meeting:', error)
            alert('Error al confirmar la junta')
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div
            className='ah-modal-overlay'
            style={{
                alignItems: 'center',
                padding: '16px'
            }}
        >
            <div
                className='ah-modal-panel max-w-xl w-full transform transition-all'
                style={{ maxHeight: 'min(900px, calc(100dvh - 32px))' }}
            >
                <div className='ah-modal-header'>
                    <h2 className='ah-modal-title text-lg'>Confirmación de Junta</h2>
                    <button onClick={onClose} className='ah-modal-close' aria-label='Cerrar confirmación'>
                        <X size={20} />
                    </button>
                </div>

                <div
                    className='p-6 flex-1 min-h-0 overflow-y-auto custom-scrollbar'
                    style={{ background: 'color-mix(in srgb, var(--card-bg) 88%, var(--background))' }}
                >
                    {/* Header */}
                    <div className='text-center mb-6'>
                    <div
                        className='w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border'
                        style={{
                            background: 'color-mix(in srgb, var(--input-focus) 14%, var(--card-bg))',
                            borderColor: 'color-mix(in srgb, var(--input-focus) 35%, var(--card-border))'
                        }}
                    >
                        <CalendarDays size={30} style={{ color: 'var(--input-focus)' }} />
                    </div>
                    <h2 className='text-2xl font-black mb-2' style={{ color: 'var(--text-primary)' }}>
                        ¿La junta se llevó a cabo?
                    </h2>
                    <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>
                        Confirma si la reunión se realizó para registrar el snapshot del pronóstico
                    </p>
                    </div>

                    <div className='ah-required-note mb-4' role='note'>
                        <span className='ah-required-note-dot' aria-hidden='true' />
                        Campos obligatorios: marcados con * y resaltados en rojo
                    </div>

                    {/* Meeting Info */}
                    <div
                        className='p-4 rounded-xl mb-4 border'
                        style={{
                            background: 'color-mix(in srgb, var(--hover-bg) 78%, var(--card-bg))',
                            borderColor: 'color-mix(in srgb, var(--input-focus) 28%, var(--card-border))'
                        }}
                    >
                    <p className='text-sm font-black mb-1' style={{ color: 'var(--text-primary)' }}>
                        {meeting.title}
                    </p>
                    <p className='text-xs' style={{ color: 'var(--text-secondary)' }}>
                        <span className='font-black'>Empresa:</span> {meeting.empresa || 'N/A'}
                    </p>
                    <p className='text-xs' style={{ color: 'var(--text-secondary)' }}>
                        <span className='font-black'>Fecha:</span>{' '}
                        {new Date(meeting.start_time).toLocaleString('es-MX', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        })}
                    </p>
                    <div
                        className='mt-3 pt-3 border-t'
                        style={{ borderColor: 'color-mix(in srgb, var(--input-focus) 22%, var(--card-border))' }}
                    >
                        <p className='text-xs font-black inline-flex items-center gap-2' style={{ color: 'var(--text-primary)' }}>
                            <Target size={14} />
                            Pronóstico congelado: <span className='text-lg'>{frozenProbability}%</span>
                        </p>
                        <p className='text-xs mt-1' style={{ color: 'var(--text-secondary)' }}>
                            Este valor se registrará en el snapshot si la junta se realizó
                        </p>
                    </div>
                    </div>

                    {/* Result */}
                    <div className='mb-5'>
                        <label className='block text-sm font-black mb-2 ah-required-label' style={{ color: 'var(--text-primary)' }}>
                            Resultado de la junta <span className='text-rose-600'>*</span>
                        </label>
                        <div className='grid grid-cols-1 sm:grid-cols-2 gap-2'>
                            <button
                                type='button'
                                disabled={isSubmitting}
                                onClick={() => {
                                    setResult('held')
                                    setError('')
                                }}
                                className={`h-11 rounded-xl font-bold text-sm transition-all border-2 cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-2 ${result === 'held'
                                    ? 'bg-emerald-600 border-emerald-600 text-white'
                                    : ''
                                    }`}
                                style={result === 'held'
                                    ? undefined
                                    : {
                                        background: 'var(--card-bg)',
                                        borderColor: 'color-mix(in srgb, #10b981 40%, var(--card-border))',
                                        color: 'color-mix(in srgb, #10b981 72%, var(--text-primary))'
                                    }}
                            >
                                <CheckCircle2 size={16} />
                                Sí, se realizó
                            </button>
                            <button
                                type='button'
                                disabled={isSubmitting}
                                onClick={() => {
                                    setResult('not_held')
                                    setError('')
                                }}
                                className={`h-11 rounded-xl font-bold text-sm transition-all border-2 cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-2 ${result === 'not_held'
                                    ? 'bg-rose-600 border-rose-600 text-white'
                                    : ''
                                    }`}
                                style={result === 'not_held'
                                    ? undefined
                                    : {
                                        background: 'var(--card-bg)',
                                        borderColor: 'color-mix(in srgb, #e11d48 42%, var(--card-border))',
                                        color: 'color-mix(in srgb, #e11d48 72%, var(--text-primary))'
                                    }}
                            >
                                <XCircle size={16} />
                                No se realizó
                            </button>
                        </div>
                    </div>

                    {requiresNotHeldDetails && (
                        <div
                            className='mb-5 p-3 rounded-xl border'
                            style={{
                                background: 'color-mix(in srgb, #ef4444 10%, var(--card-bg))',
                                borderColor: 'color-mix(in srgb, #ef4444 32%, var(--card-border))'
                            }}
                        >
                            <label className='block text-sm font-black mb-2 ah-required-label' style={{ color: 'var(--text-primary)' }}>
                                ¿De quién fue la cancelación? <span className='text-rose-600'>*</span>
                            </label>
                            <select
                                value={notHeldResponsibility}
                                onChange={(e) => {
                                    setNotHeldResponsibility(e.target.value as 'propia' | 'ajena' | '')
                                    setError('')
                                }}
                                className='ah-modal-field ah-modal-select ah-required-control w-full h-11 px-3 rounded-lg border-2 focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent'
                                style={{
                                    background: 'var(--input-bg)',
                                    borderColor: 'var(--input-border)',
                                    color: 'var(--text-primary)'
                                }}
                                disabled={isSubmitting}
                            >
                                <option value=''>Seleccionar responsabilidad...</option>
                                <option value='propia'>Propia (de nuestra empresa)</option>
                                <option value='ajena'>Ajena (de la otra empresa)</option>
                            </select>

                            <label className='block text-sm font-black mt-3 mb-2 ah-required-label' style={{ color: 'var(--text-primary)' }}>
                                Motivo de cancelación <span className='text-rose-600'>*</span>
                            </label>
                            <select
                                value={notHeldReasonId}
                                onChange={(e) => {
                                    setNotHeldReasonId(e.target.value)
                                    setError('')
                                }}
                                className='ah-modal-field ah-modal-select ah-required-control w-full h-11 px-3 rounded-lg border-2 focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent'
                                style={{
                                    background: 'var(--input-bg)',
                                    borderColor: 'var(--input-border)',
                                    color: 'var(--text-primary)'
                                }}
                                disabled={isSubmitting}
                            >
                                <option value=''>
                                    {loadingReasons ? 'Cargando motivos...' : 'Seleccionar motivo...'}
                                </option>
                                {(showNoCatalogNotice
                                    ? FALLBACK_REASON_OPTIONS.map((reason) => ({
                                        value: `${FALLBACK_REASON_PREFIX}${reason.code}`,
                                        label: reason.label
                                    }))
                                    : reasonOptions.map((reason) => ({
                                        value: reason.id,
                                        label: reason.label
                                    }))
                                ).map((reason) => (
                                    <option key={reason.value} value={reason.value}>
                                        {reason.label}
                                    </option>
                                ))}
                                <option value={OTHER_REASON_VALUE}>Otra (agregar nuevo motivo)</option>
                            </select>
                            {showNoCatalogNotice && (
                                <p className='text-[11px] mt-2' style={{ color: 'var(--text-secondary)' }}>
                                    Se muestra un catálogo base con 10 motivos comunes. También puedes usar "Otra" para registrar uno nuevo.
                                </p>
                            )}

                            {isCustomReason && (
                                <>
                                    <label className='block text-sm font-black mt-3 mb-2 ah-required-label' style={{ color: 'var(--text-primary)' }}>
                                        Nuevo motivo <span className='text-rose-600'>*</span>
                                    </label>
                                    <input
                                        type='text'
                                        value={customNotHeldReason}
                                        onChange={(e) => {
                                            setCustomNotHeldReason(e.target.value)
                                            setError('')
                                        }}
                                        placeholder='Escribe el nuevo motivo'
                                        className='ah-modal-field ah-required-control w-full h-11 px-3 rounded-lg border-2 focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent'
                                        style={{
                                            background: 'var(--input-bg)',
                                            borderColor: 'var(--input-border)',
                                            color: 'var(--text-primary)'
                                        }}
                                        disabled={isSubmitting}
                                    />
                                </>
                            )}
                        </div>
                    )}

                    {/* Notes */}
                    <div className='mb-4'>
                        <label className='block text-sm font-black mb-2' style={{ color: 'var(--text-primary)' }}>
                            Notas de la junta (opcional)
                        </label>
                        <textarea
                            placeholder='¿Qué se discutió o qué seguimiento queda pendiente?'
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className='ah-modal-field ah-modal-textarea w-full p-3 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent resize-none'
                            style={{
                                background: 'color-mix(in srgb, var(--input-bg) 92%, var(--card-bg))',
                                borderColor: 'var(--input-border)',
                                color: 'var(--text-primary)'
                            }}
                            rows={3}
                            disabled={isSubmitting}
                        />
                    </div>

                    {error && (
                        <div
                            className='mb-4 rounded-lg border px-3 py-2'
                            style={{
                                borderColor: 'color-mix(in srgb, #ef4444 45%, var(--card-border))',
                                background: 'color-mix(in srgb, #ef4444 13%, var(--card-bg))'
                            }}
                        >
                            <p
                                className='text-xs font-bold'
                                style={{ color: 'color-mix(in srgb, #ef4444 76%, var(--text-primary))' }}
                            >
                                {error}
                            </p>
                        </div>
                    )}

                    {/* Actions */}
                    <div className='flex gap-2'>
                        <button
                            type='button'
                            onClick={onClose}
                            disabled={isSubmitting}
                            className='flex-1 h-11 rounded-xl border font-bold transition-colors cursor-pointer disabled:opacity-50'
                            style={{
                                borderColor: 'var(--card-border)',
                                color: 'var(--text-secondary)',
                                background: 'var(--card-bg)'
                            }}
                        >
                            Cerrar
                        </button>
                        <button
                            type='button'
                            onClick={handleConfirm}
                            disabled={isSubmitting || !result}
                            className='flex-1 h-11 rounded-xl bg-[#2048FF] text-white font-bold hover:bg-[#1636c7] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'
                        >
                            Confirmar
                        </button>
                    </div>

                    {/* Info Footer */}
                    <div
                        className='mt-4 p-3 rounded-lg border'
                        style={{
                            background: 'color-mix(in srgb, var(--hover-bg) 80%, var(--card-bg))',
                            borderColor: 'var(--card-border)'
                        }}
                    >
                    <p className='text-xs text-center' style={{ color: 'var(--text-secondary)' }}>
                        <span className='font-bold'>Importante:</span> El snapshot solo se creará si confirmas que la junta se realizó
                    </p>
                    </div>
                </div>
            </div>
        </div>
    )
}
