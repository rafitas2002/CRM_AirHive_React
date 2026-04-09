'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, Clock3, X } from 'lucide-react'
import { Database } from '@/lib/supabase'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'
import { getMeetingCancellationReasons } from '@/lib/confirmationService'
import {
    FALLBACK_MEETING_REASON_OPTIONS,
    FALLBACK_REASON_PREFIX,
    OTHER_REASON_VALUE
} from '@/lib/meetingReasonCatalog'

type MeetingCancellationReason = Database['public']['Tables']['meeting_cancellation_reasons']['Row']

export type MeetingRescheduleReasonPayload = {
    reasonId?: string | null
    reasonCustom?: string | null
    responsibility?: 'propia' | 'ajena' | null
    notes?: string | null
}

interface MeetingRescheduleReasonModalProps {
    isOpen: boolean
    meetingTitle?: string | null
    oldStartTime?: string | null
    newStartTime?: string | null
    isSubmitting?: boolean
    onClose: () => void
    onConfirm: (payload: MeetingRescheduleReasonPayload) => Promise<void>
}

function formatDateTimeLabel(value: string | null | undefined) {
    const raw = String(value || '').trim()
    if (!raw) return 'Sin registro'
    const parsed = new Date(raw)
    if (Number.isNaN(parsed.getTime())) return 'Sin registro'
    return parsed.toLocaleString('es-MX', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    })
}

export default function MeetingRescheduleReasonModal({
    isOpen,
    meetingTitle,
    oldStartTime,
    newStartTime,
    isSubmitting = false,
    onClose,
    onConfirm
}: MeetingRescheduleReasonModalProps) {
    useBodyScrollLock(isOpen)

    const [responsibility, setResponsibility] = useState<'propia' | 'ajena' | ''>('')
    const [reasonId, setReasonId] = useState('')
    const [customReason, setCustomReason] = useState('')
    const [notes, setNotes] = useState('')
    const [reasonOptions, setReasonOptions] = useState<MeetingCancellationReason[]>([])
    const [loadingReasons, setLoadingReasons] = useState(false)
    const [formAttempted, setFormAttempted] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        if (!isOpen) return

        setResponsibility('')
        setReasonId('')
        setCustomReason('')
        setNotes('')
        setFormAttempted(false)
        setError('')

        let active = true
        const loadReasons = async () => {
            setLoadingReasons(true)
            const rows = await getMeetingCancellationReasons()
            if (!active) return
            setReasonOptions(rows)
            setLoadingReasons(false)
        }

        void loadReasons()
        return () => { active = false }
    }, [isOpen])

    if (!isOpen) return null

    const isCustomReason = reasonId === OTHER_REASON_VALUE
    const showNoCatalogNotice = !loadingReasons && reasonOptions.length === 0
    const selectedFallbackReason = reasonId.startsWith(FALLBACK_REASON_PREFIX)
        ? FALLBACK_MEETING_REASON_OPTIONS.find((option) => `${FALLBACK_REASON_PREFIX}${option.code}` === reasonId) || null
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

    const responsibilityInvalid = formAttempted && responsibility !== 'propia' && responsibility !== 'ajena'
    const reasonInvalid = formAttempted && !reasonId
    const customReasonInvalid = formAttempted && isCustomReason && !customReason.trim()

    const handleConfirm = async () => {
        setFormAttempted(true)

        if (responsibility !== 'propia' && responsibility !== 'ajena') {
            setError('Selecciona si el cambio fue propio o ajeno.')
            return
        }

        if (!reasonId) {
            setError('Selecciona un motivo del cambio de junta.')
            return
        }

        if (isCustomReason && !customReason.trim()) {
            setError('Describe el motivo del cambio de junta.')
            return
        }

        setError('')
        const mappedReasonId = !isCustomReason && !selectedFallbackReason ? reasonId : null
        const mappedReasonCustom = isCustomReason
            ? customReason.trim()
            : (selectedFallbackReason?.label || null)

        await onConfirm({
            reasonId: mappedReasonId,
            reasonCustom: mappedReasonCustom,
            responsibility,
            notes: notes.trim() || null
        })
    }

    return (
        <div
            className='ah-modal-overlay z-[220]'
            style={{ alignItems: 'center', padding: '16px' }}
        >
            <div className='ah-modal-panel w-full max-w-xl'>
                <div className='ah-modal-header'>
                    <h2 className='ah-modal-title text-lg'>Motivo de Reprogramación</h2>
                    <button
                        type='button'
                        onClick={onClose}
                        className='ah-modal-close'
                        disabled={isSubmitting}
                        aria-label='Cerrar popup de reagenda'
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className={`p-6 space-y-4 overflow-y-auto custom-scrollbar ${formAttempted ? 'ah-form-attempted' : ''}`}>
                    <div
                        className='rounded-xl border p-4 space-y-2'
                        style={{
                            background: 'color-mix(in srgb, #2048FF 9%, var(--card-bg))',
                            borderColor: 'color-mix(in srgb, #2048FF 26%, var(--card-border))'
                        }}
                    >
                        <p className='text-sm font-black inline-flex items-center gap-2' style={{ color: 'var(--text-primary)' }}>
                            <CalendarDays size={16} />
                            {String(meetingTitle || '').trim() || 'Junta reprogramada'}
                        </p>
                        <div className='grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-semibold'>
                            <p style={{ color: 'var(--text-secondary)' }}>
                                <span className='font-black' style={{ color: 'var(--text-primary)' }}>Horario original:</span>{' '}
                                {formatDateTimeLabel(oldStartTime)}
                            </p>
                            <p style={{ color: 'var(--text-secondary)' }}>
                                <span className='font-black' style={{ color: 'var(--text-primary)' }}>Nuevo horario:</span>{' '}
                                {formatDateTimeLabel(newStartTime)}
                            </p>
                        </div>
                    </div>

                    <div className='space-y-2'>
                        <label className='block text-sm font-bold ah-required-label' style={{ color: 'var(--text-primary)' }}>
                            ¿El cambio fue propio o ajeno? <span className='text-red-500'>*</span>
                        </label>
                        <div className='grid grid-cols-1 sm:grid-cols-2 gap-2'>
                            <button
                                type='button'
                                disabled={isSubmitting}
                                onClick={() => {
                                    setResponsibility('propia')
                                    setError('')
                                }}
                                className='h-11 rounded-xl border text-sm font-black cursor-pointer transition-colors'
                                style={responsibility === 'propia'
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
                                    setResponsibility('ajena')
                                    setError('')
                                }}
                                className='h-11 rounded-xl border text-sm font-black cursor-pointer transition-colors'
                                style={responsibility === 'ajena'
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
                    </div>

                    <div className='space-y-1.5'>
                        <label className='block text-sm font-bold ah-required-label' style={{ color: 'var(--text-primary)' }}>
                            Motivo del cambio de junta <span className='text-red-500'>*</span>
                        </label>
                        <select
                            value={reasonId}
                            onChange={(event) => {
                                setReasonId(event.target.value)
                                setError('')
                            }}
                            disabled={isSubmitting || loadingReasons}
                            className='ah-required-control w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF]/30 focus:border-[#2048FF] transition-colors'
                            style={{
                                background: 'var(--background)',
                                borderColor: reasonInvalid
                                    ? 'color-mix(in srgb, #ef4444 52%, var(--input-border))'
                                    : 'var(--card-border)',
                                color: 'var(--text-primary)'
                            }}
                        >
                            <option value=''>Selecciona un motivo...</option>
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
                    </div>

                    {isCustomReason && (
                        <div className='space-y-1.5'>
                            <label className='block text-sm font-bold ah-required-label' style={{ color: 'var(--text-primary)' }}>
                                Describe el motivo <span className='text-red-500'>*</span>
                            </label>
                            <textarea
                                rows={2}
                                value={customReason}
                                onChange={(event) => {
                                    setCustomReason(event.target.value)
                                    setError('')
                                }}
                                className='ah-required-control w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF]/30 focus:border-[#2048FF] resize-none transition-colors'
                                style={{
                                    background: 'var(--background)',
                                    borderColor: customReasonInvalid
                                        ? 'color-mix(in srgb, #ef4444 52%, var(--input-border))'
                                        : 'var(--card-border)',
                                    color: 'var(--text-primary)'
                                }}
                            placeholder='Ej: Cliente movió junta por comité interno de último minuto'
                        />
                    </div>
                )}

                    <div className='space-y-1.5'>
                        <label className='block text-sm font-bold' style={{ color: 'var(--text-primary)' }}>
                            Notas para análisis
                        </label>
                        <textarea
                            rows={3}
                            value={notes}
                            onChange={(event) => setNotes(event.target.value)}
                            className='w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF]/30 focus:border-[#2048FF] resize-none transition-colors'
                            style={{
                                background: 'var(--background)',
                                borderColor: 'var(--card-border)',
                                color: 'var(--text-primary)'
                            }}
                            placeholder='Contexto breve para análisis comercial (opcional)'
                        />
                        <p className='text-[11px] font-semibold inline-flex items-center gap-1.5' style={{ color: 'var(--text-secondary)' }}>
                            <Clock3 size={12} />
                            Este registro alimenta métricas de reagenda y causas raíz.
                        </p>
                    </div>

                    {error && (
                        <p className='text-xs font-semibold rounded-lg px-3 py-2 border' style={{
                            color: '#b91c1c',
                            borderColor: 'color-mix(in srgb, #ef4444 32%, var(--card-border))',
                            background: 'color-mix(in srgb, #ef4444 8%, var(--card-bg))'
                        }}>
                            {error}
                        </p>
                    )}
                </div>

                <div className='ah-modal-footer'>
                    <button
                        type='button'
                        onClick={onClose}
                        className='ah-modal-btn ah-modal-btn-secondary'
                        disabled={isSubmitting}
                    >
                        Cancelar
                    </button>
                    <button
                        type='button'
                        onClick={() => { void handleConfirm() }}
                        className='ah-modal-btn ah-modal-btn-primary'
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? 'Guardando...' : 'Guardar motivo y continuar'}
                    </button>
                </div>
            </div>
        </div>
    )
}
