'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Trophy, Medal, Info, History, RefreshCw, Award } from 'lucide-react'
import { getRaceStats, getPastRaces, syncRaceResults } from '@/app/actions/race'

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
    const [activeTab, setActiveTab] = useState<'info' | 'medals' | 'history'>('info')
    const [stats, setStats] = useState<any[]>([])
    const [pastRaces, setPastRaces] = useState<Record<string, any[]>>({})
    const [loading, setLoading] = useState(false)
    const [syncing, setSyncing] = useState(false)

    useEffect(() => {
        if (isOpen && activeTab !== 'info') {
            loadData()
        }
    }, [isOpen, activeTab])

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

    const handleSync = async () => {
        setSyncing(true)
        await syncRaceResults()
        await loadData()
        setSyncing(false)
    }

    if (!isOpen) return null

    return (
        <AnimatePresence>
            <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm'>
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className='bg-[var(--card-bg)] rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh] relative border border-[var(--card-border)]'
                >
                    {/* Header */}
                    <div className='px-8 py-6 border-b border-[var(--card-border)] flex justify-between items-center bg-[var(--table-header-bg)] flex-shrink-0'>
                        <div className='flex items-center gap-3'>
                            <div className='w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center'>
                                <Trophy className='w-5 h-5 text-amber-600' />
                            </div>
                            <div>
                                <h2 className='text-xl font-black text-[var(--text-primary)] tracking-tight'>Detalles de la Carrera</h2>
                                <p className='text-xs text-[var(--text-secondary)] font-medium uppercase tracking-wider'>Estadísticas y Leyendas</p>
                            </div>
                        </div>
                        <button onClick={onClose} className='p-2 hover:bg-[var(--hover-bg)] rounded-full transition-colors'>
                            <X className='w-5 h-5 text-[var(--text-secondary)]' />
                        </button>
                    </div>

                    {/* Tabs */}
                    <div className='flex border-b px-8 flex-shrink-0'>
                        {[
                            { id: 'info', label: 'Leyenda Emojis', icon: Info },
                            { id: 'medals', label: 'Medallero Histórico', icon: Award },
                            { id: 'history', label: 'Carreras Pasadas', icon: History }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`flex items-center gap-2 px-6 py-4 text-sm font-bold border-b-2 transition-colors ${activeTab === tab.id
                                    ? 'border-[#2048FF] text-[#2048FF]'
                                    : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                                    }`}
                            >
                                <tab.icon size={16} />
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Content */}
                    <div className='flex-1 overflow-y-auto p-8'>
                        {/* Info Tab */}
                        {activeTab === 'info' && (
                            <div className='grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in duration-300'>
                                {EMOJI_SCALE.map((item, idx) => (
                                    <div key={idx} className='flex items-center gap-4 p-4 rounded-xl border border-[var(--card-border)] bg-[var(--hover-bg)] hover:bg-[var(--card-bg)] hover:shadow-md transition-all'>
                                        <div className='text-4xl filter drop-shadow-sm'>{item.emoji}</div>
                                        <div>
                                            <h4 className='font-bold text-[var(--text-primary)] text-lg'>{item.label}</h4>
                                            <p className='text-xs font-bold text-[#2048FF] uppercase tracking-wider mb-1'>{item.range}</p>
                                            <p className='text-sm text-[var(--text-secondary)]'>{item.desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Medals Tab */}
                        {activeTab === 'medals' && (
                            <div className='animate-in fade-in duration-300'>
                                {loading && stats.length === 0 ? (
                                    <div className='text-center py-10 text-gray-400'>Cargando medallero...</div>
                                ) : stats.length === 0 ? (
                                    <div className='text-center py-10 text-gray-400 flex flex-col items-center gap-4'>
                                        <p>No hay medallas registradas aún.</p>
                                        <button onClick={handleSync} className='bg-blue-100 text-blue-600 px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-200 transition-colors'>
                                            Sincronizar Datos Históricos
                                        </button>
                                    </div>
                                ) : (
                                    <div className='space-y-4'>
                                        {/* Podium Top 3 Highlight could go here, but simple list for now */}
                                        {stats.map((stat, idx) => (
                                            <div key={idx} className='flex items-center p-4 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] hover:shadow-md transition-all'>
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black mr-4 ${idx === 0 ? 'bg-amber-100 text-amber-600' :
                                                    idx === 1 ? 'bg-gray-100 text-gray-600' :
                                                        idx === 2 ? 'bg-orange-100 text-orange-600' : 'bg-[var(--hover-bg)] text-[var(--text-secondary)]'
                                                    }`}>
                                                    {idx + 1}
                                                </div>
                                                <div className='flex-1'>
                                                    <h3 className='font-bold text-[var(--text-primary)] text-lg'>{stat.name}</h3>
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
                                <div className='flex justify-end sticky top-0 bg-[var(--card-bg)] z-10 py-2'>
                                    <button
                                        onClick={handleSync}
                                        disabled={syncing}
                                        className='text-xs font-bold flex items-center gap-2 text-[#2048FF] hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors border border-blue-100'
                                    >
                                        <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
                                        {syncing ? 'Sincronizando...' : 'Actualizar Historial'}
                                    </button>
                                </div>
                                {loading && !syncing ? (
                                    <div className='text-center py-10 text-gray-400'>Cargando historial...</div>
                                ) : Object.keys(pastRaces).length === 0 ? (
                                    <div className='text-center py-10 space-y-4 bg-gray-50 rounded-xl p-8'>
                                        <p className='text-gray-400'>No hay carreras pasadas registradas.</p>
                                        <button onClick={handleSync} className='bg-[#2048FF] text-white px-6 py-2 rounded-lg shadow-lg hover:shadow-xl hover:bg-[#1700AC] transition-all text-sm font-bold'>
                                            Generar Historial desde Ventas
                                        </button>
                                        <p className='text-xs text-gray-400 max-w-sm mx-auto'>
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
                                                    <div key={period} className='border border-[var(--card-border)] rounded-2xl overflow-hidden bg-[var(--card-bg)] shadow-sm hover:shadow-md transition-shadow'>
                                                        <div className='bg-[var(--hover-bg)] px-6 py-3 border-b border-[var(--card-border)] flex justify-between items-center'>
                                                            <h4 className='font-black text-[var(--text-primary)] capitalize text-lg tracking-tight'>{monthName}</h4>
                                                            <span className='text-xs font-bold text-[var(--text-secondary)] bg-[var(--card-bg)] px-2 py-1 rounded-md border border-[var(--card-border)]'>
                                                                {runners.length} Participantes
                                                            </span>
                                                        </div>
                                                        <div className='divide-y divide-[var(--card-border)]'>
                                                            {top3.map((runner: any, idx: number) => (
                                                                <div key={idx} className='px-6 py-4 flex items-center justify-between hover:bg-[var(--hover-bg)] transition-colors'>
                                                                    <div className='flex items-center gap-4'>
                                                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-lg shadow-sm border
                                                                        ${idx === 0 ? 'bg-yellow-100 border-yellow-200 text-yellow-700' :
                                                                                idx === 1 ? 'bg-gray-100 border-gray-200 text-gray-700' :
                                                                                    'bg-orange-100 border-orange-200 text-orange-800'}`}>
                                                                            {idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}
                                                                        </div>
                                                                        <div>
                                                                            <span className='text-sm font-bold text-[var(--text-primary)] block'>{runner.name}</span>
                                                                            <span className='text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-wider'>
                                                                                {idx === 0 ? '1er Lugar' : idx === 1 ? '2do Lugar' : '3er Lugar'}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                    <span className='text-sm font-mono font-bold text-[#2048FF] bg-blue-50 px-3 py-1 rounded-lg'>
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
