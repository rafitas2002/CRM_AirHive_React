'use client'

import { useEffect, useState } from 'react'
import { Database } from '@/lib/supabase'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'
import { getMeetingCancellationReasons } from '@/lib/confirmationService'
import { CalendarDays, Target, CheckCircle2, XCircle, X } from 'lucide-react'
import {
    FALLBACK_MEETING_REASON_OPTIONS,
    FALLBACK_REASON_PREFIX,
    OTHER_REASON_VALUE
} from '@/lib/meetingReasonCatalog'

type Meeting = Database['public']['Tables']['meetings']['Row']
type MeetingCancellationReason = Database['public']['Tables']['meeting_cancellation_reasons']['Row']

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
    const [formAttempted, setFormAttempted] = useState(false)

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
    const selectedFallbackReason = notHeldReasonId.startsWith(FALLBACK_REASON_PREFIX)
        ? FALLBACK_MEETING_REASON_OPTIONS.find((reason) => `${FALLBACK_REASON_PREFIX}${reason.code}` === notHeldReasonId) || null
        : null
    const normalizedReasonOptions = (() => {
        if (showNoCatalogNotice) {
            return FALLBACK_MEETING_REASON_OPTIONS.map((reason) => ({
                value: `${FALLBACK_REASON_PREFIX}${reason.code}`,
                label: reason.label
            }))
        }

        const fromDatabase = reasonOptions.map((reason) => ({
            value: reason.id,
            label: reason.label
        }))
        const availableCodes = new Set(
            reasonOptions
                .map((reason) => String(reason.code || '').trim().toLowerCase())
                .filter(Boolean)
        )
        const fallbackMissingInDb = FALLBACK_MEETING_REASON_OPTIONS
            .filter((reason) => !availableCodes.has(String(reason.code).toLowerCase()))
            .map((reason) => ({
                value: `${FALLBACK_REASON_PREFIX}${reason.code}`,
                label: `${reason.label} (temporal)`
            }))

        return [...fromDatabase, ...fallbackMissingInDb]
    })()
    const resultInvalid = formAttempted && !result
    const responsibilityInvalid = formAttempted && requiresNotHeldDetails && notHeldResponsibility !== 'propia' && notHeldResponsibility !== 'ajena'
    const reasonInvalid = formAttempted && requiresNotHeldDetails && !notHeldReasonId
    const customReasonInvalid = formAttempted && requiresNotHeldDetails && isCustomReason && !customNotHeldReason.trim()
    const requiredErrorColor = 'color-mix(in srgb, #ef4444 82%, var(--text-primary))'

    const handleConfirm = async () => {
        setFormAttempted(true)

        if (!result) {
            setError('Selecciona si la junta se llevó a cabo o no.')
            return
        }

        if (requiresNotHeldDetails) {
            if (!notHeldReasonId) {
                setError('Selecciona un motivo del cambio de junta.')
                return
            }
            if (notHeldResponsibility !== 'propia' && notHeldResponsibility !== 'ajena') {
                setError('Selecciona si el cambio fue propio o ajeno.')
                return
            }
            if (isCustomReason && !customNotHeldReason.trim()) {
                setError('Describe el motivo del cambio de junta.')
                return
            }
        }

        setFormAttempted(false)
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

                <form
                    onSubmit={(event) => {
                        event.preventDefault()
                        void handleConfirm()
                    }}
                    className={`p-6 flex-1 min-h-0 overflow-y-auto custom-scrollbar ${formAttempted ? 'ah-form-attempted' : ''}`}
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
                        Campos obligatorios: se marcan en rojo solo si faltan al confirmar
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
                        <label className='block text-sm font-black mb-2 ah-required-label' style={{ color: resultInvalid ? requiredErrorColor : 'var(--text-primary)' }}>
                            Resultado de la junta <span className='text-rose-600'>*</span>
                        </label>
                        <div
                            className='grid grid-cols-1 sm:grid-cols-2 gap-2 p-1 rounded-xl'
                            style={resultInvalid
                                ? {
                                    border: '1px solid color-mix(in srgb, #ef4444 46%, var(--card-border))',
                                    background: 'color-mix(in srgb, #ef4444 8%, transparent)'
                                }
                                : undefined}
                        >
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
                            className='mb-5 p-4 rounded-xl border space-y-3'
                            style={{
                                background: 'color-mix(in srgb, #ef4444 10%, var(--card-bg))',
                                borderColor: 'color-mix(in srgb, #ef4444 32%, var(--card-border))'
                            }}
                        >
                            <label className='block text-sm font-black ah-required-label' style={{ color: responsibilityInvalid ? requiredErrorColor : 'var(--text-primary)' }}>
                                ¿El cambio fue propio o ajeno? <span className='text-rose-600'>*</span>
                            </label>
                            <div className='grid grid-cols-1 sm:grid-cols-2 gap-2'>
                                <button
                                    type='button'
                                    disabled={isSubmitting}
                                    onClick={() => {
                                        setNotHeldResponsibility('propia')
                                        setError('')
                                    }}
                                    className='h-11 rounded-xl border text-sm font-black cursor-pointer transition-colors disabled:opacity-50'
                                    style={notHeldResponsibility === 'propia'
                                        ? {
                                            background: 'color-mix(in srgb, #f59e0b 18%, var(--card-bg))',
                                            borderColor: 'color-mix(in srgb, #f59e0b 46%, var(--card-border))',
                                            color: 'var(--text-primary)'
                                        }
                                        : {
                                            background: 'var(--background)',
                                            borderColor: responsibilityInvalid
                                                ? 'color-mix(in srgb, #ef4444 52%, var(--card-border))'
                                                : 'var(--card-border)',
                                            color: 'var(--text-secondary)'
                                        }}
                                >
                                    Propio (equipo AirHive)
                                </button>
                                <button
                                    type='button'
                                    disabled={isSubmitting}
                                    onClick={() => {
                                        setNotHeldResponsibility('ajena')
                                        setError('')
                                    }}
                                    className='h-11 rounded-xl border text-sm font-black cursor-pointer transition-colors disabled:opacity-50'
                                    style={notHeldResponsibility === 'ajena'
                                        ? {
                                            background: 'color-mix(in srgb, #3b82f6 15%, var(--card-bg))',
                                            borderColor: 'color-mix(in srgb, #3b82f6 44%, var(--card-border))',
                                            color: 'var(--text-primary)'
                                        }
                                        : {
                                            background: 'var(--background)',
                                            borderColor: responsibilityInvalid
                                                ? 'color-mix(in srgb, #ef4444 52%, var(--card-border))'
                                                : 'var(--card-border)',
                                            color: 'var(--text-secondary)'
                                        }}
                                >
                                    Ajeno (cliente / externo)
                                </button>
                            </div>

                            <label className='block text-sm font-black ah-required-label' style={{ color: reasonInvalid ? requiredErrorColor : 'var(--text-primary)' }}>
                                Motivo del cambio de junta <span className='text-rose-600'>*</span>
                            </label>
                            <select
                                value={notHeldReasonId}
                                onChange={(e) => {
                                    setNotHeldReasonId(e.target.value)
                                    setError('')
                                }}
                                className='ah-required-control w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF]/30 focus:border-[#2048FF] transition-colors'
                                aria-invalid={reasonInvalid ? 'true' : undefined}
                                data-invalid={reasonInvalid ? 'true' : undefined}
                                style={{
                                    background: 'var(--background)',
                                    borderColor: reasonInvalid
                                        ? 'color-mix(in srgb, #ef4444 52%, var(--input-border))'
                                        : 'var(--card-border)',
                                    color: 'var(--text-primary)'
                                }}
                                disabled={isSubmitting || loadingReasons}
                            >
                                <option value=''>{loadingReasons ? 'Cargando motivos...' : 'Selecciona un motivo...'}</option>
                                {normalizedReasonOptions.map((reason) => (
                                    <option key={reason.value} value={reason.value}>
                                        {reason.label}
                                    </option>
                                ))}
                                <option value={OTHER_REASON_VALUE}>Otro (especificar)</option>
                            </select>
                            {showNoCatalogNotice && (
                                <p className='text-[11px] font-semibold' style={{ color: 'var(--text-secondary)' }}>
                                    Se está usando un catálogo temporal estandarizado mientras se sincroniza la base.
                                </p>
                            )}

                            {isCustomReason && (
                                <div className='space-y-1.5'>
                                    <label className='block text-sm font-black ah-required-label' style={{ color: customReasonInvalid ? requiredErrorColor : 'var(--text-primary)' }}>
                                        Describe el motivo <span className='text-rose-600'>*</span>
                                    </label>
                                    <textarea
                                        value={customNotHeldReason}
                                        onChange={(e) => {
                                            setCustomNotHeldReason(e.target.value)
                                            setError('')
                                        }}
                                        placeholder='Escribe el motivo de forma breve y profesional'
                                        className='ah-required-control w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF]/30 focus:border-[#2048FF] resize-none transition-colors'
                                        aria-invalid={customReasonInvalid ? 'true' : undefined}
                                        data-invalid={customReasonInvalid ? 'true' : undefined}
                                        style={{
                                            background: 'var(--background)',
                                            borderColor: customReasonInvalid
                                                ? 'color-mix(in srgb, #ef4444 52%, var(--input-border))'
                                                : 'var(--card-border)',
                                            color: 'var(--text-primary)'
                                        }}
                                        rows={2}
                                        disabled={isSubmitting}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Notes */}
                    <div className='mb-4'>
                        <label className='block text-sm font-black mb-2' style={{ color: 'var(--text-primary)' }}>
                            Notas para análisis
                        </label>
                        <textarea
                            placeholder='Contexto breve para análisis comercial (opcional)'
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
                            className='ah-modal-btn ah-modal-btn-secondary flex-1'
                        >
                            Cerrar
                        </button>
                        <button
                            type='submit'
                            disabled={isSubmitting}
                            className='ah-modal-btn ah-modal-btn-primary flex-1'
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
                    <p className='text-[11px] text-center mt-1' style={{ color: 'var(--text-secondary)' }}>
                        Después de confirmar una junta realizada podrás abrir el popup para actualizar pronósticos.
                    </p>
                    </div>
                </form>
            </div>
        </div>
    )
}
