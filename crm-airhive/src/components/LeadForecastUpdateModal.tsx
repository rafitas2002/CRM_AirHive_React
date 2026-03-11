'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus, TrendingUp, X } from 'lucide-react'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'
import { FriendlyDatePicker } from '@/components/FriendlyDatePickers'

export type LeadForecastDraft = {
    id: number
    nombre: string
    empresa: string
    probabilidad: number
    valorEstimado: number | null
    valorImplementacionEstimado: number | null
    forecastCloseDate: string | null
}

type LeadForecastUpdatePayload = {
    probabilidad: number
    valorEstimado: number | null
    valorImplementacionEstimado: number | null
    forecastCloseDate: string | null
}

interface LeadForecastUpdateModalProps {
    isOpen: boolean
    lead: LeadForecastDraft | null
    onClose: () => void
    onSave: (payload: LeadForecastUpdatePayload) => Promise<void>
    saving?: boolean
    error?: string | null
}

type ForecastDeltaTrend = 'up' | 'down' | 'flat' | 'na'

function formatCurrencyInput(value: number | null | undefined) {
    if (value == null || Number.isNaN(Number(value))) return ''
    return Math.max(0, Math.round(Number(value))).toLocaleString('en-US')
}

function parseCurrencyInput(raw: string) {
    const digits = raw.replace(/[^\d]/g, '')
    if (!digits) return null
    const parsed = Number(digits)
    return Number.isFinite(parsed) ? parsed : null
}

function parseComparableDate(value: string | null | undefined) {
    const normalized = String(value || '').trim()
    if (!normalized) return Number.NaN
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized)
    if (dateOnly) {
        const parsedDate = new Date(
            Number(dateOnly[1]),
            Number(dateOnly[2]) - 1,
            Number(dateOnly[3]),
            12,
            0,
            0,
            0
        )
        return Number.isFinite(parsedDate.getTime()) ? parsedDate.getTime() : Number.NaN
    }
    const parsed = new Date(normalized).getTime()
    return Number.isFinite(parsed) ? parsed : Number.NaN
}

function formatDateDisplay(value: string | null | undefined) {
    const ts = parseComparableDate(value)
    if (!Number.isFinite(ts)) return 'Sin fecha'
    return new Date(Number(ts)).toLocaleDateString('es-MX', {
        year: 'numeric',
        month: 'short',
        day: '2-digit'
    })
}

export default function LeadForecastUpdateModal({
    isOpen,
    lead,
    onClose,
    onSave,
    saving = false,
    error = null
}: LeadForecastUpdateModalProps) {
    useBodyScrollLock(isOpen)
    const [probabilidad, setProbabilidad] = useState(50)
    const [valorMensualidadInput, setValorMensualidadInput] = useState('')
    const [valorImplementacionInput, setValorImplementacionInput] = useState('')
    const [forecastCloseDate, setForecastCloseDate] = useState<string | null>(null)
    const [localError, setLocalError] = useState('')
    const [baselineProbability, setBaselineProbability] = useState(0)
    const [baselineMonthlyValue, setBaselineMonthlyValue] = useState<number | null>(null)
    const [baselineImplementationValue, setBaselineImplementationValue] = useState<number | null>(null)
    const [baselineCloseDate, setBaselineCloseDate] = useState<string | null>(null)

    useEffect(() => {
        if (!isOpen || !lead) return
        const safeProbability = Math.max(0, Math.min(100, Number(lead.probabilidad) || 0))
        const safeMonthlyValue = lead.valorEstimado == null ? null : Number(lead.valorEstimado)
        const safeImplementationValue = lead.valorImplementacionEstimado == null ? null : Number(lead.valorImplementacionEstimado)
        const safeCloseDate = lead.forecastCloseDate || null

        setBaselineProbability(safeProbability)
        setBaselineMonthlyValue(safeMonthlyValue)
        setBaselineImplementationValue(safeImplementationValue)
        setBaselineCloseDate(safeCloseDate)

        setProbabilidad(safeProbability)
        setValorMensualidadInput(formatCurrencyInput(safeMonthlyValue))
        setValorImplementacionInput(formatCurrencyInput(safeImplementationValue))
        setForecastCloseDate(safeCloseDate)
        setLocalError('')
    }, [isOpen, lead])

    const leadTitle = useMemo(() => {
        if (!lead) return 'Lead'
        return lead.nombre || lead.empresa || `Lead ${lead.id}`
    }, [lead])

    const currentMonthlyValue = useMemo(
        () => parseCurrencyInput(valorMensualidadInput),
        [valorMensualidadInput]
    )

    const currentImplementationValue = useMemo(
        () => parseCurrencyInput(valorImplementacionInput),
        [valorImplementacionInput]
    )

    const getDeltaTrend = (delta: number | null | undefined): ForecastDeltaTrend => {
        if (delta == null || !Number.isFinite(delta)) return 'na'
        if (Math.abs(delta) < 0.00001) return 'flat'
        return delta > 0 ? 'up' : 'down'
    }

    const getDeltaColor = (trend: ForecastDeltaTrend, mode: 'value' | 'closeDate' = 'value') => {
        if (trend === 'na' || trend === 'flat') return 'var(--text-secondary)'
        if (mode === 'closeDate') {
            return trend === 'down'
                ? 'color-mix(in srgb, #10b981 72%, var(--text-primary))'
                : 'color-mix(in srgb, #f97316 72%, var(--text-primary))'
        }
        return trend === 'up'
            ? 'color-mix(in srgb, #2563eb 72%, var(--text-primary))'
            : 'color-mix(in srgb, #f97316 72%, var(--text-primary))'
    }

    const renderDeltaIcon = (trend: ForecastDeltaTrend) => {
        if (trend === 'up') return <ArrowUpRight size={12} strokeWidth={2.5} />
        if (trend === 'down') return <ArrowDownRight size={12} strokeWidth={2.5} />
        return <Minus size={12} strokeWidth={2.5} />
    }

    const calculatePctDelta = (current: number | null, previous: number | null) => {
        if (current == null || previous == null) return null
        if (Math.abs(previous) < 0.00001) {
            return Math.abs(current) < 0.00001 ? 0 : null
        }
        return ((current - previous) / Math.abs(previous)) * 100
    }

    const formatSignedPercent = (value: number | null | undefined) => {
        if (value == null || !Number.isFinite(value)) return 'N/D'
        const rounded = Number(value.toFixed(1))
        const sign = rounded > 0 ? '+' : ''
        return `${sign}${rounded.toFixed(1)}%`
    }

    const formatSignedPointsWithPercent = (points: number | null | undefined, pct: number | null | undefined) => {
        if (points == null || !Number.isFinite(points)) return 'Sin referencia'
        const rounded = Math.round(points)
        const sign = rounded > 0 ? '+' : ''
        const pctText = formatSignedPercent(pct)
        if (pctText === 'N/D') return `${sign}${rounded} pts`
        return `${sign}${rounded} pts (${pctText})`
    }

    const formatSignedCurrencyWithPercent = (amount: number | null | undefined, pct: number | null | undefined) => {
        if (amount == null || !Number.isFinite(amount)) return 'Sin referencia'
        const absAmount = `$${Math.abs(amount).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        const amountSign = amount > 0 ? '+' : amount < 0 ? '-' : ''
        const pctText = formatSignedPercent(pct)
        if (pctText === 'N/D') return `${amountSign}${absAmount}`
        return `${amountSign}${absAmount} (${pctText})`
    }

    const formatCurrencyDisplay = (value: number | null | undefined) => {
        if (value == null || !Number.isFinite(value)) return 'Sin dato'
        return `$${Number(value).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }

    const closeDateChange = useMemo(() => {
        const currentCloseDateTs = parseComparableDate(forecastCloseDate)
        const baselineCloseDateTs = parseComparableDate(baselineCloseDate)

        if (!forecastCloseDate && !baselineCloseDate) {
            return { trend: 'flat' as ForecastDeltaTrend, text: 'Sin cambio' }
        }
        if (!baselineCloseDate && forecastCloseDate) {
            return { trend: 'up' as ForecastDeltaTrend, text: 'Fecha definida' }
        }
        if (baselineCloseDate && !forecastCloseDate) {
            return { trend: 'down' as ForecastDeltaTrend, text: 'Fecha removida' }
        }
        if (!Number.isFinite(currentCloseDateTs) || !Number.isFinite(baselineCloseDateTs)) {
            return { trend: 'na' as ForecastDeltaTrend, text: 'Cambio detectado' }
        }

        const deltaDays = Math.round((Number(currentCloseDateTs) - Number(baselineCloseDateTs)) / (1000 * 60 * 60 * 24))
        if (deltaDays === 0) return { trend: 'flat' as ForecastDeltaTrend, text: 'Sin cambio' }
        if (deltaDays > 0) return { trend: 'up' as ForecastDeltaTrend, text: `+${deltaDays} días (más tarde)` }
        return { trend: 'down' as ForecastDeltaTrend, text: `-${Math.abs(deltaDays)} días (más temprano)` }
    }, [baselineCloseDate, forecastCloseDate])

    const probabilityDelta = probabilidad - baselineProbability
    const monthlyDelta = (currentMonthlyValue ?? 0) - (baselineMonthlyValue ?? 0)
    const implementationDelta = (currentImplementationValue ?? 0) - (baselineImplementationValue ?? 0)
    const probabilityDeltaPct = calculatePctDelta(probabilidad, baselineProbability)
    const monthlyDeltaPct = calculatePctDelta(currentMonthlyValue, baselineMonthlyValue)
    const implementationDeltaPct = calculatePctDelta(currentImplementationValue, baselineImplementationValue)

    const handleSave = async () => {
        if (!lead) return
        const safeProbability = Math.max(0, Math.min(100, Math.round(Number(probabilidad) || 0)))
        setLocalError('')
        try {
            await onSave({
                probabilidad: safeProbability,
                valorEstimado: parseCurrencyInput(valorMensualidadInput),
                valorImplementacionEstimado: parseCurrencyInput(valorImplementacionInput),
                forecastCloseDate: forecastCloseDate || null
            })
        } catch {
            setLocalError('No se pudo guardar el pronóstico.')
        }
    }

    if (!isOpen || !lead) return null

    return (
        <div className='ah-modal-overlay z-[220]' style={{ alignItems: 'center', padding: '16px' }}>
            <div className='ah-modal-panel w-full max-w-2xl' style={{ maxHeight: 'min(920px, calc(100dvh - 32px))' }}>
                <div className='ah-modal-header'>
                    <div>
                        <h2 className='ah-modal-title text-lg inline-flex items-center gap-2'>
                            <TrendingUp size={18} /> Actualizar Pronóstico
                        </h2>
                        <p className='ah-modal-subtitle'>{leadTitle} · {lead.empresa || 'Empresa'}</p>
                    </div>
                    <button className='ah-modal-close' onClick={onClose} aria-label='Cerrar actualización de pronóstico'>
                        <X size={20} />
                    </button>
                </div>

                <div className='p-5 space-y-4 overflow-y-auto custom-scrollbar'>
                    <div className='rounded-xl border p-3' style={{
                        background: 'color-mix(in srgb, var(--hover-bg) 80%, var(--card-bg))',
                        borderColor: 'color-mix(in srgb, var(--card-border) 88%, #2048FF)'
                    }}>
                        <p className='text-[10px] font-black uppercase tracking-[0.14em]' style={{ color: 'var(--text-secondary)' }}>
                            Comparativo en vivo vs pronóstico anterior
                        </p>
                        <div className='mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs'>
                            {[
                                {
                                    key: 'probabilidad',
                                    label: 'Probabilidad',
                                    valueText: `${probabilidad}%`,
                                    deltaText: formatSignedPointsWithPercent(probabilityDelta, probabilityDeltaPct),
                                    trend: getDeltaTrend(probabilityDelta),
                                    mode: 'value' as const
                                },
                                {
                                    key: 'mensualidad',
                                    label: 'Mensualidad',
                                    valueText: formatCurrencyDisplay(currentMonthlyValue),
                                    deltaText: formatSignedCurrencyWithPercent(monthlyDelta, monthlyDeltaPct),
                                    trend: getDeltaTrend(monthlyDelta),
                                    mode: 'value' as const
                                },
                                {
                                    key: 'implementacion',
                                    label: 'Implementación',
                                    valueText: formatCurrencyDisplay(currentImplementationValue),
                                    deltaText: formatSignedCurrencyWithPercent(implementationDelta, implementationDeltaPct),
                                    trend: getDeltaTrend(implementationDelta),
                                    mode: 'value' as const
                                },
                                {
                                    key: 'fecha_cierre',
                                    label: 'Fecha cierre forecast',
                                    valueText: formatDateDisplay(forecastCloseDate),
                                    deltaText: closeDateChange.text,
                                    trend: closeDateChange.trend,
                                    mode: 'closeDate' as const
                                }
                            ].map((item) => (
                                <div key={item.key} className='rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2'>
                                    <p className='text-[9px] font-black uppercase tracking-[0.12em] text-[var(--text-secondary)]'>{item.label}</p>
                                    <p className='mt-1 font-black text-[var(--text-primary)]'>{item.valueText}</p>
                                    <p className='mt-1 text-[10px] font-black inline-flex items-center gap-1.5' style={{ color: getDeltaColor(item.trend, item.mode) }}>
                                        {renderDeltaIcon(item.trend)}
                                        <span>{item.deltaText}</span>
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className='rounded-xl border p-3' style={{
                        background: 'color-mix(in srgb, var(--hover-bg) 80%, var(--card-bg))',
                        borderColor: 'color-mix(in srgb, var(--input-focus) 18%, var(--card-border))'
                    }}>
                        <p className='text-[10px] font-black uppercase tracking-[0.14em]' style={{ color: 'var(--text-secondary)' }}>
                            Probabilidad actualizable
                        </p>
                        <div className='mt-2 flex items-center gap-3'>
                            <input
                                type='range'
                                min={0}
                                max={100}
                                step={1}
                                value={probabilidad}
                                onChange={(e) => setProbabilidad(Number(e.target.value))}
                                className='w-full cursor-pointer'
                                disabled={saving}
                            />
                            <span className='text-sm font-black tabular-nums min-w-[52px] text-right' style={{ color: 'var(--text-primary)' }}>
                                {probabilidad}%
                            </span>
                        </div>
                    </div>

                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                        <div className='space-y-1.5'>
                            <label className='text-xs font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]'>
                                Mensualidad pronosticada (MXN)
                            </label>
                            <input
                                type='text'
                                inputMode='numeric'
                                value={valorMensualidadInput}
                                onChange={(e) => setValorMensualidadInput(formatCurrencyInput(parseCurrencyInput(e.target.value)))}
                                className='w-full h-11 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 text-sm font-bold text-[var(--text-primary)]'
                                placeholder='0'
                                disabled={saving}
                            />
                        </div>
                        <div className='space-y-1.5'>
                            <label className='text-xs font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]'>
                                Implementación pronosticada (MXN)
                            </label>
                            <input
                                type='text'
                                inputMode='numeric'
                                value={valorImplementacionInput}
                                onChange={(e) => setValorImplementacionInput(formatCurrencyInput(parseCurrencyInput(e.target.value)))}
                                className='w-full h-11 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 text-sm font-bold text-[var(--text-primary)]'
                                placeholder='0'
                                disabled={saving}
                            />
                        </div>
                    </div>

                    <div className='space-y-1.5'>
                        <label className='text-xs font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]'>
                            Fecha pronosticada de cierre
                        </label>
                        <FriendlyDatePicker
                            value={forecastCloseDate}
                            onChange={setForecastCloseDate}
                            placeholder='Seleccionar fecha'
                            allowClear
                            disabled={saving}
                            className='w-full'
                        />
                    </div>

                    {(error || localError) && (
                        <div
                            className='rounded-lg border px-3 py-2 text-xs font-bold'
                            style={{
                                borderColor: 'color-mix(in srgb, #ef4444 42%, var(--card-border))',
                                background: 'color-mix(in srgb, #ef4444 10%, var(--card-bg))',
                                color: 'color-mix(in srgb, #ef4444 76%, var(--text-primary))'
                            }}
                        >
                            {error || localError}
                        </div>
                    )}
                </div>

                <div className='px-5 py-4 border-t border-[var(--card-border)] flex items-center justify-end gap-2'>
                    <button
                        type='button'
                        onClick={onClose}
                        disabled={saving}
                        className='h-10 px-4 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--text-primary)] text-[10px] font-black uppercase tracking-[0.14em] disabled:opacity-60 cursor-pointer'
                    >
                        Cerrar
                    </button>
                    <button
                        type='button'
                        onClick={handleSave}
                        disabled={saving}
                        className='h-10 px-4 rounded-xl text-[10px] font-black uppercase tracking-[0.14em] text-white disabled:opacity-60 cursor-pointer'
                        style={{
                            background: 'color-mix(in srgb, #16a34a 90%, var(--card-bg))'
                        }}
                    >
                        {saving ? 'Guardando...' : 'Guardar Pronóstico'}
                    </button>
                </div>
            </div>
        </div>
    )
}
