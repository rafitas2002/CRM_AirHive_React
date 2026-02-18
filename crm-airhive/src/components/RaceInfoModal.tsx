'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Trophy, Info, History, RefreshCw, Award } from 'lucide-react'
import { getRaceStats, getPastRaces, syncRaceResults } from '@/app/actions/race'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'

interface RaceInfoModalProps {
    isOpen: boolean
    onClose: () => void
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
    const [activeTab, setActiveTab] = useState<'info' | 'medals' | 'history'>('info')
    const [stats, setStats] = useState<any[]>([])
    const [pastRaces, setPastRaces] = useState<Record<string, any[]>>({})
    const [loading, setLoading] = useState(false)
    const [syncing, setSyncing] = useState(false)

    const loadData = async () => {
        setLoading(true)
        const [statsRes, historyRes] = await Promise.all([getRaceStats(), getPastRaces()])

        if (statsRes.success && statsRes.data) {
            // Sort by Gold > Silver > Bronze
            const sorted = statsRes.data.sort((a: any, b: any) =>
                (b.gold - a.gold) || (b.silver - a.silver) || (b.bronze - a.bronze)
            )
            setStats(sorted)
        }
        if (historyRes.success && historyRes.data) {
            /* Sort Past Races by date descending */
            /* The backend already sorts, but we group by date key */
            setPastRaces(historyRes.data)
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

    if (!isOpen) return null

    return (
        <AnimatePresence>
            <div className='ah-modal-overlay'>
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className='ah-modal-panel w-full max-w-4xl relative'
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
                            { id: 'medals', label: 'Medallero Histórico', icon: Award },
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
                    <div className='flex-1 overflow-y-auto p-8' style={{ background: 'var(--card-bg)' }}>
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
                                        <p>No hay medallas registradas aún.</p>
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
                                        {/* Podium Top 3 Highlight could go here, but simple list for now */}
                                        {stats.map((stat, idx) => (
                                            <div key={idx} className='flex items-center p-4 rounded-xl border hover:shadow-md transition-all' style={{ borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}>
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black mr-4 ${idx === 0 ? 'bg-amber-100 text-amber-600' :
                                                    idx === 1 ? 'bg-gray-100 text-gray-600' :
                                                        idx === 2 ? 'bg-orange-100 text-orange-600' : 'bg-gray-50 text-gray-400'
                                                    }`}>
                                                    {idx + 1}
                                                </div>
                                                <div className='flex-1'>
                                                    <h3 className='font-bold text-lg' style={{ color: 'var(--text-primary)' }}>{stat.name}</h3>
                                                </div>
                                                <div className='flex gap-4 items-center'>
                                                    {stat.gold > 0 && (
                                                        <div className='flex flex-col items-center w-12'>
                                                            <div className='text-2xl drop-shadow-sm'>🥇</div>
                                                            <span className='text-xs font-bold text-amber-600 mt-1'>{stat.gold}</span>
                                                        </div>
                                                    )}
                                                    {stat.silver > 0 && (
                                                        <div className='flex flex-col items-center w-12'>
                                                            <div className='text-2xl drop-shadow-sm'>🥈</div>
                                                            <span className='text-xs font-bold text-gray-500 mt-1'>{stat.silver}</span>
                                                        </div>
                                                    )}
                                                    {stat.bronze > 0 && (
                                                        <div className='flex flex-col items-center w-12'>
                                                            <div className='text-2xl drop-shadow-sm'>🥉</div>
                                                            <span className='text-xs font-bold text-orange-600 mt-1'>{stat.bronze}</span>
                                                        </div>
                                                    )}
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
                                <div className='flex justify-end sticky top-0 z-10 py-2' style={{ background: 'var(--card-bg)' }}>
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
                                        {Object.entries(pastRaces)
                                            .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime())
                                            .map(([period, runners]) => {
                                                // Period from DB is YYYY-MM-DD
                                                const [y, m, d] = period.split('-').map(Number)
                                                const displayDate = new Date(y, m - 1, d) // Create local date from parts
                                                const monthName = displayDate.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })

                                                // Find Top 3
                                                const top3 = runners.slice(0, 3)

                                                return (
                                                    <div key={period} className='border rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow' style={{ borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}>
                                                        <div className='px-6 py-3 border-b flex justify-between items-center' style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
                                                            <h4 className='font-black capitalize text-lg tracking-tight' style={{ color: 'var(--text-primary)' }}>{monthName}</h4>
                                                            <span className='text-xs font-bold px-2 py-1 rounded-md border' style={{ color: 'var(--text-secondary)', borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}>
                                                                {runners.length} Participantes
                                                            </span>
                                                        </div>
                                                        <div className='divide-y' style={{ borderColor: 'var(--card-border)' }}>
                                                            {top3.map((runner: any, idx: number) => (
                                                                <div key={idx} className='px-6 py-4 flex items-center justify-between transition-colors' style={{ background: 'transparent' }}>
                                                                    <div className='flex items-center gap-4'>
                                                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-lg shadow-sm border
                                                                        ${idx === 0 ? 'bg-yellow-100 border-yellow-200 text-yellow-700' :
                                                                                idx === 1 ? 'bg-gray-100 border-gray-200 text-gray-700' :
                                                                                    'bg-orange-100 border-orange-200 text-orange-800'}`}>
                                                                            {idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}
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
                                                )
                                            })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    )
}
