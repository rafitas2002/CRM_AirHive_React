'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, RotateCcw } from 'lucide-react'

type DateValue = string | null | undefined

interface SharedPickerProps {
    disabled?: boolean
    className?: string
    panelClassName?: string
    min?: string
    max?: string
    yearStart?: number
    yearEnd?: number
}

interface FriendlyDatePickerProps extends SharedPickerProps {
    value: DateValue
    onChange: (value: string | null) => void
    placeholder?: string
    allowClear?: boolean
}

interface FriendlyDateTimePickerProps extends SharedPickerProps {
    value: string
    onChange: (value: string) => void
    placeholder?: string
    required?: boolean
    minuteStep?: number
}

function pad2(n: number) {
    return String(n).padStart(2, '0')
}

function parseDateOnly(value: string | null | undefined): Date | null {
    if (!value) return null
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    if (!m) return null
    const y = Number(m[1])
    const mo = Number(m[2]) - 1
    const d = Number(m[3])
    const dt = new Date(y, mo, d, 12, 0, 0, 0)
    return Number.isNaN(dt.getTime()) ? null : dt
}

function formatDateOnly(date: Date): string {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function parseLocalDateTime(value: string | null | undefined): Date | null {
    if (!value) return null
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
    if (!m) return null
    const dt = new Date(
        Number(m[1]),
        Number(m[2]) - 1,
        Number(m[3]),
        Number(m[4]),
        Number(m[5]),
        0,
        0
    )
    return Number.isNaN(dt.getTime()) ? null : dt
}

function formatLocalDateTime(date: Date): string {
    return `${formatDateOnly(date)}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function clampDateToBounds(date: Date, min?: string, max?: string): Date {
    const minDate = parseDateOnly(min)
    const maxDate = parseDateOnly(max)
    let next = new Date(date)
    if (minDate && next < minDate) next = minDate
    if (maxDate && next > maxDate) next = maxDate
    return next
}

function isDateDisabled(date: Date, min?: string, max?: string) {
    const key = formatDateOnly(date)
    if (min && key < min) return true
    if (max && key > max) return true
    return false
}

function monthLabel(month: number) {
    return new Date(2026, month, 1).toLocaleDateString('es-MX', { month: 'long' })
}

function useOutsideClose(open: boolean, refs: Array<React.RefObject<HTMLElement | null>>, onClose: () => void) {
    useEffect(() => {
        if (!open) return
        const onPointerDown = (event: MouseEvent) => {
            const target = event.target as Node
            const clickedInside = refs.some(ref => ref.current?.contains(target))
            if (!clickedInside) onClose()
        }
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose()
        }
        document.addEventListener('mousedown', onPointerDown)
        document.addEventListener('keydown', onKeyDown)
        return () => {
            document.removeEventListener('mousedown', onPointerDown)
            document.removeEventListener('keydown', onKeyDown)
        }
    }, [open, refs, onClose])
}

function CalendarGrid({
    visibleMonth,
    selectedDate,
    onSelectDate,
    min,
    max
}: {
    visibleMonth: Date
    selectedDate: Date | null
    onSelectDate: (date: Date) => void
    min?: string
    max?: string
}) {
    const today = new Date()
    const todayKey = formatDateOnly(today)
    const selectedKey = selectedDate ? formatDateOnly(selectedDate) : null

    const cells = useMemo(() => {
        const year = visibleMonth.getFullYear()
        const month = visibleMonth.getMonth()
        const first = new Date(year, month, 1)
        const startOffset = (first.getDay() + 6) % 7
        const gridStart = new Date(year, month, 1 - startOffset)
        return Array.from({ length: 42 }).map((_, idx) => {
            const d = new Date(gridStart)
            d.setDate(gridStart.getDate() + idx)
            return d
        })
    }, [visibleMonth])

    return (
        <div className='space-y-2'>
            <div className='grid grid-cols-7 gap-1 text-center text-[10px] font-black uppercase tracking-wider text-[var(--text-secondary)]/70'>
                {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((day, idx) => (
                    <div key={`${day}-${idx}`} className='py-1'>{day}</div>
                ))}
            </div>
            <div className='grid grid-cols-7 gap-1.5'>
                {cells.map((date) => {
                    const inCurrentMonth = date.getMonth() === visibleMonth.getMonth()
                    const dateKey = formatDateOnly(date)
                    const isToday = dateKey === todayKey
                    const isSelected = dateKey === selectedKey
                    const disabled = isDateDisabled(date, min, max)

                    return (
                        <button
                            key={dateKey}
                            type='button'
                            disabled={disabled}
                            onClick={() => onSelectDate(date)}
                            className={[
                                'h-11 rounded-xl text-sm font-black transition-all cursor-pointer border',
                                'focus:outline-none focus:ring-2 focus:ring-[#2048FF]/30',
                                disabled ? 'opacity-35 cursor-not-allowed' : 'hover:scale-[1.02]',
                                isSelected
                                    ? 'bg-[#2048FF] text-white border-[#2048FF] shadow-lg shadow-blue-500/20'
                                    : isToday
                                        ? 'border-blue-400 text-blue-400'
                                        : 'border-transparent',
                                !inCurrentMonth && !isSelected ? 'text-[var(--text-secondary)]/45' : '',
                                inCurrentMonth && !isSelected && !isToday ? 'text-[var(--text-primary)]' : ''
                            ].join(' ')}
                            style={!isSelected && !isToday
                                ? { background: 'color-mix(in srgb, var(--card-bg) 70%, var(--background))' }
                                : undefined}
                        >
                            {date.getDate()}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

function PickerShell({
    open,
    setOpen,
    disabled,
    triggerClassName,
    triggerContent,
    children
}: {
    open: boolean
    setOpen: (v: boolean) => void
    disabled?: boolean
    triggerClassName?: string
    triggerContent: React.ReactNode
    children: React.ReactNode
}) {
    const rootRef = useRef<HTMLDivElement>(null)
    const panelRef = useRef<HTMLDivElement>(null)
    useOutsideClose(open, [rootRef, panelRef], () => setOpen(false))

    return (
        <div ref={rootRef} className='relative'>
            <button
                type='button'
                disabled={disabled}
                onClick={() => !disabled && setOpen(!open)}
                className={triggerClassName || ''}
            >
                {triggerContent}
            </button>
            {open && !disabled && (
                <div
                    ref={panelRef}
                    className='absolute right-0 left-auto z-[200] mt-2 w-[24.5rem] max-w-[calc(100vw-1.25rem)] rounded-2xl border shadow-2xl p-4'
                    style={{
                        background: 'color-mix(in srgb, var(--card-bg) 88%, var(--background))',
                        borderColor: 'var(--card-border)',
                        boxShadow: '0 18px 50px rgba(0,0,0,0.35)'
                    }}
                >
                    {children}
                </div>
            )}
        </div>
    )
}

function DatePanelHeader({
    visibleMonth,
    setVisibleMonth,
    yearStart,
    yearEnd
}: {
    visibleMonth: Date
    setVisibleMonth: (date: Date) => void
    yearStart: number
    yearEnd: number
}) {
    const month = visibleMonth.getMonth()
    const year = visibleMonth.getFullYear()
    const years = useMemo(() => {
        const out: number[] = []
        for (let y = yearEnd; y >= yearStart; y--) out.push(y)
        return out
    }, [yearStart, yearEnd])

    return (
        <div className='flex items-center gap-2 mb-3'>
            <button
                type='button'
                onClick={() => setVisibleMonth(new Date(year, month - 1, 1))}
                className='h-10 w-10 rounded-xl border cursor-pointer flex items-center justify-center hover:border-blue-500 transition-colors'
                style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
            >
                <ChevronLeft size={18} />
            </button>

            <select
                value={month}
                onChange={(e) => setVisibleMonth(new Date(year, Number(e.target.value), 1))}
                className='h-10 flex-1 min-w-0 rounded-xl border px-3 font-bold text-sm cursor-pointer'
                style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
            >
                {Array.from({ length: 12 }).map((_, idx) => (
                    <option key={idx} value={idx}>{monthLabel(idx)}</option>
                ))}
            </select>

            <select
                value={year}
                onChange={(e) => setVisibleMonth(new Date(Number(e.target.value), month, 1))}
                className='h-10 w-28 rounded-xl border px-2 font-bold text-sm cursor-pointer'
                style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
            >
                {years.map(y => (
                    <option key={y} value={y}>{y}</option>
                ))}
            </select>

            <button
                type='button'
                onClick={() => setVisibleMonth(new Date(year, month + 1, 1))}
                className='h-10 w-10 rounded-xl border cursor-pointer flex items-center justify-center hover:border-blue-500 transition-colors'
                style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
            >
                <ChevronRight size={18} />
            </button>
        </div>
    )
}

export function FriendlyDatePicker({
    value,
    onChange,
    disabled,
    className,
    min,
    max,
    yearStart,
    yearEnd,
    placeholder = 'Seleccionar fecha',
    allowClear = true
}: FriendlyDatePickerProps) {
    const selectedDate = parseDateOnly(value ?? null)
    const baseDate = selectedDate || new Date()
    const [open, setOpen] = useState(false)
    const [visibleMonth, setVisibleMonth] = useState(new Date(baseDate.getFullYear(), baseDate.getMonth(), 1))

    useEffect(() => {
        const d = parseDateOnly(value ?? null)
        if (d) setVisibleMonth(new Date(d.getFullYear(), d.getMonth(), 1))
    }, [value])

    const yStart = yearStart ?? 1950
    const yEnd = yearEnd ?? (new Date().getFullYear() + 10)
    const display = selectedDate
        ? selectedDate.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
        : placeholder

    return (
        <PickerShell
            open={open}
            setOpen={setOpen}
            disabled={disabled}
            triggerClassName={className}
            triggerContent={
                <div className='w-full flex items-center justify-between gap-3'>
                    <span className={selectedDate ? '' : 'opacity-60'}>{display}</span>
                    <CalendarDays size={18} className='opacity-70' />
                </div>
            }
        >
            <DatePanelHeader visibleMonth={visibleMonth} setVisibleMonth={setVisibleMonth} yearStart={yStart} yearEnd={yEnd} />

            <CalendarGrid
                visibleMonth={visibleMonth}
                selectedDate={selectedDate}
                min={min}
                max={max}
                onSelectDate={(date) => {
                    const safeDate = clampDateToBounds(date, min, max)
                    onChange(formatDateOnly(safeDate))
                    setOpen(false)
                }}
            />

            <div className='mt-4 flex items-center justify-between gap-2'>
                <button
                    type='button'
                    onClick={() => {
                        const today = clampDateToBounds(new Date(), min, max)
                        setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1))
                        onChange(formatDateOnly(today))
                        setOpen(false)
                    }}
                    className='px-3 py-2 rounded-xl border text-xs font-black uppercase tracking-wider cursor-pointer hover:border-blue-500 transition-colors flex items-center gap-2'
                    style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                >
                    <CalendarDays size={14} />
                    Hoy
                </button>

                <div className='flex items-center gap-2'>
                    {allowClear && (
                        <button
                            type='button'
                            onClick={() => onChange(null)}
                            className='px-3 py-2 rounded-xl border text-xs font-black uppercase tracking-wider cursor-pointer hover:border-amber-500 transition-colors flex items-center gap-2'
                            style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-secondary)' }}
                        >
                            <RotateCcw size={14} />
                            Limpiar
                        </button>
                    )}
                    <button
                        type='button'
                        onClick={() => setOpen(false)}
                        className='px-3 py-2 rounded-xl bg-[#2048FF] text-white text-xs font-black uppercase tracking-wider cursor-pointer'
                    >
                        Listo
                    </button>
                </div>
            </div>
        </PickerShell>
    )
}

export function FriendlyDateTimePicker({
    value,
    onChange,
    disabled,
    className,
    min,
    max,
    yearStart,
    yearEnd,
    minuteStep = 5,
    placeholder = 'Seleccionar fecha y hora'
}: FriendlyDateTimePickerProps) {
    const selectedDateTime = parseLocalDateTime(value)
    const now = new Date()
    const initial = selectedDateTime || now
    const [open, setOpen] = useState(false)
    const [visibleMonth, setVisibleMonth] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1))
    const [draftDate, setDraftDate] = useState<Date | null>(selectedDateTime ? new Date(selectedDateTime) : null)

    useEffect(() => {
        const parsed = parseLocalDateTime(value)
        setDraftDate(parsed ? new Date(parsed) : null)
        if (parsed) setVisibleMonth(new Date(parsed.getFullYear(), parsed.getMonth(), 1))
    }, [value])

    const yStart = yearStart ?? new Date().getFullYear() - 2
    const yEnd = yearEnd ?? new Date().getFullYear() + 5

    const roundedNow = useMemo(() => {
        const d = new Date()
        d.setSeconds(0, 0)
        const step = Math.max(1, minuteStep)
        const nextMinutes = Math.ceil(d.getMinutes() / step) * step
        d.setMinutes(nextMinutes)
        return d
    }, [minuteStep])

    const display = selectedDateTime
        ? selectedDateTime.toLocaleString('es-MX', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
        : placeholder

    const minuteOptions = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => (i * minuteStep) % 60)
    const currentDraft = draftDate ? new Date(draftDate) : new Date(roundedNow)

    const setDraftHour = (hour: number) => {
        const next = draftDate ? new Date(draftDate) : new Date(roundedNow)
        next.setHours(hour)
        setDraftDate(next)
    }

    const setDraftMinute = (minute: number) => {
        const next = draftDate ? new Date(draftDate) : new Date(roundedNow)
        next.setMinutes(minute, 0, 0)
        setDraftDate(next)
    }

    const commitDraft = () => {
        if (!draftDate) return
        onChange(formatLocalDateTime(draftDate))
        setOpen(false)
    }

    return (
        <PickerShell
            open={open}
            setOpen={setOpen}
            disabled={disabled}
            triggerClassName={className}
            triggerContent={
                <div className='w-full flex items-center justify-between gap-3'>
                    <span className={selectedDateTime ? '' : 'opacity-60'}>{display}</span>
                    <div className='flex items-center gap-2 opacity-70'>
                        <CalendarDays size={16} />
                        <Clock3 size={16} />
                    </div>
                </div>
            }
        >
            <DatePanelHeader visibleMonth={visibleMonth} setVisibleMonth={setVisibleMonth} yearStart={yStart} yearEnd={yEnd} />

            <CalendarGrid
                visibleMonth={visibleMonth}
                selectedDate={draftDate}
                min={min ? min.slice(0, 10) : undefined}
                max={max ? max.slice(0, 10) : undefined}
                onSelectDate={(date) => {
                    const next = draftDate ? new Date(draftDate) : new Date(roundedNow)
                    next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate())
                    setDraftDate(next)
                }}
            />

            <div className='mt-4 grid grid-cols-2 gap-3'>
                <div>
                    <label className='block text-[10px] font-black uppercase tracking-wider mb-1 text-[var(--text-secondary)]/70'>Hora</label>
                    <select
                        value={pad2(currentDraft.getHours())}
                        onChange={(e) => setDraftHour(Number(e.target.value))}
                        className='w-full h-11 rounded-xl border px-3 font-bold cursor-pointer'
                        style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                    >
                        {Array.from({ length: 24 }).map((_, h) => (
                            <option key={h} value={pad2(h)}>{pad2(h)}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className='block text-[10px] font-black uppercase tracking-wider mb-1 text-[var(--text-secondary)]/70'>Minutos</label>
                    <select
                        value={pad2(currentDraft.getMinutes() - (currentDraft.getMinutes() % minuteStep))}
                        onChange={(e) => setDraftMinute(Number(e.target.value))}
                        className='w-full h-11 rounded-xl border px-3 font-bold cursor-pointer'
                        style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                    >
                        {minuteOptions.map((m) => (
                            <option key={m} value={pad2(m)}>{pad2(m)}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className='mt-3 flex flex-wrap gap-2'>
                {['09:00', '11:00', '13:00', '16:00', '18:00'].map((time) => (
                    <button
                        key={time}
                        type='button'
                        onClick={() => {
                            const [h, m] = time.split(':').map(Number)
                            const next = draftDate ? new Date(draftDate) : new Date(roundedNow)
                            next.setHours(h, m, 0, 0)
                            setDraftDate(next)
                        }}
                        className='px-2.5 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-wider cursor-pointer hover:border-blue-500 transition-colors'
                        style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                    >
                        {time}
                    </button>
                ))}
            </div>

            <div className='mt-4 flex items-center justify-between gap-2'>
                <button
                    type='button'
                    onClick={() => {
                        setDraftDate(new Date(roundedNow))
                        setVisibleMonth(new Date(roundedNow.getFullYear(), roundedNow.getMonth(), 1))
                    }}
                    className='px-3 py-2 rounded-xl border text-xs font-black uppercase tracking-wider cursor-pointer hover:border-blue-500 transition-colors'
                    style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                >
                    Ahora
                </button>
                <div className='flex items-center gap-2'>
                    <button
                        type='button'
                        onClick={() => setOpen(false)}
                        className='px-3 py-2 rounded-xl border text-xs font-black uppercase tracking-wider cursor-pointer'
                        style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-secondary)' }}
                    >
                        Cerrar
                    </button>
                    <button
                        type='button'
                        onClick={commitDraft}
                        className='px-3 py-2 rounded-xl bg-[#2048FF] text-white text-xs font-black uppercase tracking-wider cursor-pointer'
                    >
                        Confirmar
                    </button>
                </div>
            </div>
        </PickerShell>
    )
}
