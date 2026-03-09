'use client'

import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Trophy, Info, History, RefreshCw } from 'lucide-react'
import { getRaceStats, getPastRaces, syncRaceResults } from '@/app/actions/race'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'

interface RaceInfoModalProps {
    isOpen: boolean
    onClose: () => void
}

type RaceStatsRow = {
    name: string
    gold: number
    silver: number
    bronze: number
    points: number
}

type RaceHistoryRow = {
    id: string
    period: string
    title: string
    user_id: string
    total_sales: number
    rank: number
    medal: 'gold' | 'silver' | 'bronze' | null
    name: string
}

const toPeriodKey = (year: number, monthIndex: number) =>
    `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`

const getCurrentMonthPeriod = () => {
    const now = new Date()
    return toPeriodKey(now.getFullYear(), now.getMonth())
}

const getPreviousMonthPeriod = () => {
    const now = new Date()
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    return toPeriodKey(previousMonth.getFullYear(), previousMonth.getMonth())
}

const EMOJI_SCALE = [
    { label: 'Caracol', emoji: '🐌', range: '0% - 12.5%', desc: 'Apenas arrancando...' },
    { label: 'Tortuga', emoji: '🐢', range: '12.5% - 25%', desc: 'Lento pero seguro' },
    { label: 'Caminante', emoji: '🚶', range: '25% - 37.5%', desc: 'Tomando ritmo' },
    { label: 'Corredor', emoji: '🏃', range: '37.5% - 50%', desc: 'Acelerando el paso' },
    { label: 'Ciclista', emoji: '🚴', range: '50% - 62.5%', desc: '¡Ya se siente la velocidad!' },
    { label: 'Auto', emoji: '🚗', range: '62.5% - 75%', desc: 'En carretera abierta' },
    { label: 'Moto', emoji: '🏍️', range: '75% - 87.5%', desc: 'Rápido y furioso' },
    { label: 'Fórmula 1', emoji: '🏎️', range: '87.5% - 100%+', desc: '¡Velocidad máxima! Meta a la vista' },
]

export default function RaceInfoModal({ isOpen, onClose }: RaceInfoModalProps) {
    useBodyScrollLock(isOpen)
    const [mounted, setMounted] = useState(false)
    const [activeTab, setActiveTab] = useState<'info' | 'medals' | 'history'>('info')
    const [stats, setStats] = useState<RaceStatsRow[]>([])
    const [pastRaces, setPastRaces] = useState<Record<string, RaceHistoryRow[]>>({})
    const [selectedHistoryPeriod, setSelectedHistoryPeriod] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [syncing, setSyncing] = useState(false)

    const currentMonthPeriod = getCurrentMonthPeriod()

    function getPreferredHistoryPeriod(periods: string[]) {
        if (periods.length === 0) return null
        const previousMonth = getPreviousMonthPeriod()
        if (periods.includes(previousMonth)) return previousMonth
        return periods[0]
    }

    const sortedHistoryPeriods = useMemo(() => {
        const allPeriods = Object.keys(pastRaces).sort((a, b) => b.localeCompare(a))
        const previousPeriods = allPeriods.filter((period) => period < currentMonthPeriod)
        return previousPeriods.length > 0 ? previousPeriods : allPeriods
    }, [pastRaces, currentMonthPeriod])

    const activeHistoryPeriod = useMemo(() => {
        if (selectedHistoryPeriod && sortedHistoryPeriods.includes(selectedHistoryPeriod)) {
            return selectedHistoryPeriod
        }
        return getPreferredHistoryPeriod(sortedHistoryPeriods)
    }, [selectedHistoryPeriod, sortedHistoryPeriods])

    useEffect(() => {
        setMounted(true)
    }, [])

    const loadData = async () => {
        setLoading(true)
        const [statsRes, historyRes] = await Promise.all([getRaceStats(), getPastRaces()])

        if (statsRes.success && statsRes.data) {
            setStats(statsRes.data as RaceStatsRow[])
        }
        if (historyRes.success && historyRes.data) {
            /* Sort Past Races by date descending */
            /* The backend already sorts, but we group by date key */
            const nextHistory = historyRes.data as Record<string, RaceHistoryRow[]>
            setPastRaces(nextHistory)
            const periods = Object.keys(nextHistory).sort((a, b) => b.localeCompare(a))
            const previousPeriods = periods.filter((period) => period < currentMonthPeriod)
            const selectablePeriods = previousPeriods.length > 0 ? previousPeriods : periods
            const preferred = getPreferredHistoryPeriod(selectablePeriods)
            setSelectedHistoryPeriod((prev) => (prev && selectablePeriods.includes(prev)) ? prev : preferred)
        }
        setLoading(false)
    }

    useEffect(() => {
        if (isOpen && activeTab !== 'info') {
            loadData()
        }
    }, [isOpen, activeTab])

    const handleSync = async () => {
        setSyncing(true)
        await syncRaceResults()
        await loadData()
        setSyncing(false)
    }

    const renderPeriodLabel = (period: string) => {
        const [year, month] = period.split('-').map(Number)
        if (!year || !month) return period
        return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
    }

    if (!isOpen || !mounted || typeof document === 'undefined') return null

    return createPortal((
        <AnimatePresence>
            <div
                className='ah-modal-overlay z-[10070]'
                style={{ alignItems: 'center', paddingTop: 16, paddingBottom: 16 }}
            >
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 12 }}
                    className='ah-modal-panel w-full max-w-4xl relative min-h-0'
                    style={{ maxHeight: 'min(860px, calc(100dvh - 32px))' }}
                >
                    {/* Header */}
                    <div className='ah-modal-header px-8 py-6'>
                        <div className='flex items-center gap-3'>
                            <div className='w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center'>
                                <Trophy className='w-5 h-5 text-amber-600' />
                            </div>
                            <div>
                                <h2 className='ah-modal-title'>Detalles de la Carrera</h2>
                                <p className='ah-modal-subtitle'>Estadísticas y Leyendas</p>
                            </div>
                        </div>
                        <button onClick={onClose} className='ah-modal-close'>
                            <X className='w-5 h-5 text-white' />
                        </button>
                    </div>

                    {/* Tabs */}
                    <div className='flex border-b px-8 flex-shrink-0' style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
                        {[
                            { id: 'info', label: 'Leyenda Emojis', icon: Info },
                            { id: 'medals', label: 'Medallero Histórico', icon: Trophy },
                            { id: 'history', label: 'Carreras Pasadas', icon: History }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`flex items-center gap-2 px-6 py-4 text-sm font-bold border-b-2 transition-colors ${activeTab === tab.id
                                    ? 'border-[var(--input-focus)]'
                                    : 'border-transparent'
                                    }`}
                                style={{ color: activeTab === tab.id ? 'var(--input-focus)' : 'var(--text-secondary)' }}
                            >
                                <tab.icon size={16} />
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Content */}
                    <div className='flex-1 min-h-0 overflow-y-auto p-8 pb-12' style={{ background: 'var(--card-bg)' }}>
                        {/* Info Tab */}
                        {activeTab === 'info' && (
                            <div className='grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in duration-300'>
                                {EMOJI_SCALE.map((item, idx) => (
                                    <div
                                        key={idx}
                                        className='flex items-center gap-4 p-4 rounded-xl border hover:shadow-md transition-all'
                                        style={{ borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}
                                    >
                                        <div className='text-4xl filter drop-shadow-sm'>{item.emoji}</div>
                                        <div>
                                            <h4 className='font-bold text-lg' style={{ color: 'var(--text-primary)' }}>{item.label}</h4>
                                            <p className='text-xs font-bold uppercase tracking-wider mb-1' style={{ color: 'var(--input-focus)' }}>{item.range}</p>
                                            <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>{item.desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Medals Tab */}
                        {activeTab === 'medals' && (
                            <div className='animate-in fade-in duration-300'>
                                {loading && stats.length === 0 ? (
                                    <div className='text-center py-10' style={{ color: 'var(--text-secondary)' }}>Cargando medallero...</div>
                                ) : stats.length === 0 ? (
                                    <div className='text-center py-10 flex flex-col items-center gap-4' style={{ color: 'var(--text-secondary)' }}>
                                        <p>No hay trofeos registrados aún.</p>
                                        <button
                                            onClick={handleSync}
                                            className='px-4 py-2 rounded-lg text-sm font-bold transition-colors'
                                            style={{ background: 'color-mix(in srgb, var(--input-focus) 14%, var(--card-bg))', color: 'var(--input-focus)' }}
                                        >
                                            Sincronizar Datos Históricos
                                        </button>
                                    </div>
                                ) : (
                                    <div className='space-y-4'>
                                        {stats.map((stat, idx) => (
                                            <div key={`${stat.name}-${idx}`} className='flex items-center gap-3 p-4 rounded-xl border hover:shadow-md transition-all' style={{ borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}>
                                                <div
                                                    className='w-8 h-8 rounded-full flex items-center justify-center font-black border mr-4'
                                                    style={{
                                                        background: idx === 0
                                                            ? 'color-mix(in srgb, #fbbf24 24%, var(--card-bg))'
                                                            : idx === 1
                                                                ? 'color-mix(in srgb, #d1d5db 24%, var(--card-bg))'
                                                                : idx === 2
                                                                    ? 'color-mix(in srgb, #fdba74 24%, var(--card-bg))'
                                                                    : 'var(--card-bg)',
                                                        color: idx === 0 ? '#d97706' : idx === 1 ? '#6b7280' : idx === 2 ? '#b45309' : 'var(--text-secondary)',
                                                        borderColor: idx === 0
                                                            ? 'color-mix(in srgb, #fbbf24 40%, var(--card-border))'
                                                            : idx === 1
                                                                ? 'color-mix(in srgb, #d1d5db 40%, var(--card-border))'
                                                                : idx === 2
                                                                    ? 'color-mix(in srgb, #fdba74 40%, var(--card-border))'
                                                                    : 'var(--card-border)'
                                                    }}
                                                >
                                                    {idx + 1}
                                                </div>
                                                <div className='flex-1'>
                                                    <h3 className='font-bold text-lg' style={{ color: 'var(--text-primary)' }}>{stat.name}</h3>
                                                    <p className='text-[10px] font-bold uppercase tracking-[0.14em]' style={{ color: 'var(--text-secondary)' }}>
                                                        {stat.points} pts
                                                    </p>
                                                </div>
                                                <div className='flex flex-wrap items-center gap-2 justify-end'>
                                                    {([
                                                        { key: 'gold', label: 'Oro', value: stat.gold, color: '#d97706', bg: 'color-mix(in srgb, #fbbf24 24%, var(--card-bg))' },
                                                        { key: 'silver', label: 'Plata', value: stat.silver, color: '#6b7280', bg: 'color-mix(in srgb, #d1d5db 22%, var(--card-bg))' },
                                                        { key: 'bronze', label: 'Bronce', value: stat.bronze, color: '#b45309', bg: 'color-mix(in srgb, #fdba74 24%, var(--card-bg))' }
                                                    ] as const).map((medal) => (
                                                        <div
                                                            key={`${stat.name}-${medal.key}`}
                                                            className='inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border'
                                                            style={{ borderColor: 'var(--card-border)', background: medal.bg, color: medal.color }}
                                                        >
                                                            <Trophy size={13} />
                                                            <span className='text-[10px] font-black uppercase tracking-wider'>{medal.label}</span>
                                                            <span className='text-xs font-black tabular-nums'>{medal.value}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* History Tab */}
                        {activeTab === 'history' && (
                            <div className='animate-in fade-in duration-300 space-y-6'>
                                <div className='flex flex-wrap items-center justify-between gap-3 py-2'>
                                    <div className='min-w-[220px]'>
                                        <label className='text-[10px] font-black uppercase tracking-[0.14em]' style={{ color: 'var(--text-secondary)' }}>
                                            Mes de la carrera
                                        </label>
                                        <select
                                            value={activeHistoryPeriod || ''}
                                            onChange={(event) => setSelectedHistoryPeriod(event.target.value || null)}
                                            disabled={sortedHistoryPeriods.length === 0}
                                            className='mt-1 w-full rounded-lg border px-3 py-2 text-sm font-bold outline-none disabled:cursor-not-allowed disabled:opacity-60'
                                            style={{
                                                background: 'var(--card-bg)',
                                                borderColor: 'var(--card-border)',
                                                color: 'var(--text-primary)'
                                            }}
                                        >
                                            {sortedHistoryPeriods.length === 0 ? (
                                                <option value=''>Sin carreras previas</option>
                                            ) : (
                                                sortedHistoryPeriods.map((period) => (
                                                    <option key={period} value={period}>
                                                        {renderPeriodLabel(period)}
                                                    </option>
                                                ))
                                            )}
                                        </select>
                                    </div>
                                    <button
                                        onClick={handleSync}
                                        disabled={syncing}
                                        className='text-xs font-bold flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors border'
                                        style={{ color: 'var(--input-focus)', borderColor: 'color-mix(in srgb, var(--input-focus) 30%, var(--card-border))', background: 'color-mix(in srgb, var(--input-focus) 8%, var(--card-bg))' }}
                                    >
                                        <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
                                        {syncing ? 'Sincronizando...' : 'Actualizar Historial'}
                                    </button>
                                </div>
                                {loading && !syncing ? (
                                    <div className='text-center py-10' style={{ color: 'var(--text-secondary)' }}>Cargando historial...</div>
                                ) : Object.keys(pastRaces).length === 0 ? (
                                    <div className='text-center py-10 space-y-4 rounded-xl p-8 border' style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}>
                                        <p style={{ color: 'var(--text-secondary)' }}>No hay carreras pasadas registradas.</p>
                                        <button onClick={handleSync} className='bg-[#2048FF] text-white px-6 py-2 rounded-lg shadow-lg hover:shadow-xl hover:bg-[#1700AC] transition-all text-sm font-bold'>
                                            Generar Historial desde Ventas
                                        </button>
                                        <p className='text-xs max-w-sm mx-auto' style={{ color: 'var(--text-secondary)' }}>
                                            Esto analizará todas las ventas cerradas y generará los resultados históricos.
                                        </p>
                                    </div>
                                ) : (
                                    <div className='grid gap-6'>
                                        {!activeHistoryPeriod ? null : (
                                            <div
                                                key={activeHistoryPeriod}
                                                className='border rounded-2xl overflow-hidden shadow-sm'
                                                style={{ borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}
                                            >
                                                <div className='px-6 py-3 border-b flex justify-between items-center' style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
                                                    <h4 className='font-black capitalize text-lg tracking-tight' style={{ color: 'var(--text-primary)' }}>
                                                        {renderPeriodLabel(activeHistoryPeriod)}
                                                    </h4>
                                                    <span className='text-xs font-bold px-2 py-1 rounded-md border' style={{ color: 'var(--text-secondary)', borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}>
                                                        {(pastRaces[activeHistoryPeriod] || []).length} Participantes
                                                    </span>
                                                </div>
                                                <div>
                                                    {(pastRaces[activeHistoryPeriod] || []).slice(0, 3).map((runner: RaceHistoryRow, idx: number) => (
                                                        <div
                                                            key={`${activeHistoryPeriod}-${runner.user_id}-${idx}`}
                                                            className={`px-6 py-4 flex items-center justify-between ${idx > 0 ? 'border-t' : ''}`}
                                                            style={{ background: 'transparent', borderColor: 'var(--card-border)' }}
                                                        >
                                                            <div className='flex items-center gap-4'>
                                                                <div
                                                                    className='w-8 h-8 rounded-full flex items-center justify-center shadow-sm border'
                                                                    style={{
                                                                        background: idx === 0
                                                                            ? 'color-mix(in srgb, #fbbf24 24%, var(--card-bg))'
                                                                            : idx === 1
                                                                                ? 'color-mix(in srgb, #d1d5db 24%, var(--card-bg))'
                                                                                : 'color-mix(in srgb, #fdba74 24%, var(--card-bg))',
                                                                        color: idx === 0 ? '#d97706' : idx === 1 ? '#6b7280' : '#b45309',
                                                                        borderColor: idx === 0
                                                                            ? 'color-mix(in srgb, #fbbf24 40%, var(--card-border))'
                                                                            : idx === 1
                                                                                ? 'color-mix(in srgb, #d1d5db 40%, var(--card-border))'
                                                                                : 'color-mix(in srgb, #fdba74 40%, var(--card-border))'
                                                                    }}
                                                                >
                                                                    <Trophy size={14} />
                                                                </div>
                                                                <div>
                                                                    <span className='text-sm font-bold block' style={{ color: 'var(--text-primary)' }}>{runner.name}</span>
                                                                    <span className='text-[10px] font-bold uppercase tracking-wider' style={{ color: 'var(--text-secondary)' }}>
                                                                        {idx === 0 ? '1er Lugar' : idx === 1 ? '2do Lugar' : '3er Lugar'}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <span className='text-sm font-mono font-bold px-3 py-1 rounded-lg' style={{ color: 'var(--input-focus)', background: 'color-mix(in srgb, var(--input-focus) 10%, var(--card-bg))' }}>
                                                                ${Number(runner.total_sales).toLocaleString('es-MX')}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    ), document.body)
}
