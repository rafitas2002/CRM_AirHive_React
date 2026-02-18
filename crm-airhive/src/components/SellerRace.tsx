'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Trophy, TrendingUp, Info } from 'lucide-react'
import RaceInfoModal from './RaceInfoModal'
import { rankRaceItems } from '@/lib/raceRanking'

interface SellerRaceData {
    name: string
    value: number
    percentage: number // Progress percentage (e.g., vs goal)
    reliability: number
}

interface SellerRaceProps {
    sellers: SellerRaceData[]
    maxGoal: number
}

export default function SellerRace({ sellers, maxGoal }: SellerRaceProps) {
    const [isINFOOpen, setIsINFOOpen] = useState(false)
    const rankedSellers = rankRaceItems(sellers, (seller) => seller.value)

    return (
        <div className='p-8 rounded-3xl border shadow-sm space-y-8 relative ah-accent-hover-surface' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
            <div className='flex justify-between items-end'>
                <div>
                    <div className='flex items-center gap-3'>
                        <h3 className='text-xl font-black tracking-tight flex items-center gap-2' style={{ color: 'var(--text-primary)' }}>
                            <Trophy className='w-5 h-5 text-amber-500' />
                            Carrera de Cierre
                        </h3>
                        <button
                            onClick={() => setIsINFOOpen(true)}
                            className='w-6 h-6 rounded-full flex items-center justify-center transition-all cursor-pointer'
                            style={{ background: 'var(--hover-bg)', color: 'var(--text-secondary)', border: '1px solid var(--card-border)' }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = 'var(--input-focus)'
                                e.currentTarget.style.color = 'var(--input-focus)'
                                e.currentTarget.style.boxShadow = '0 0 0 3px rgb(var(--input-focus-rgb) / 0.12)'
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = 'var(--card-border)'
                                e.currentTarget.style.color = 'var(--text-secondary)'
                                e.currentTarget.style.boxShadow = 'none'
                            }}
                            title="Ver Detalles y Medallero"
                        >
                            <Info size={14} />
                        </button>
                    </div>
                    <p className='text-xs font-medium mt-1 uppercase tracking-widest' style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>Valor en Negociación vs Meta de Equipo</p>
                </div>
                <div className='text-right'>
                    <p className='text-xs font-black text-[#1700AC] uppercase tracking-tighter'>Meta: ${maxGoal.toLocaleString()}</p>
                </div>
            </div>

            <div className='space-y-6 relative'>
                {/* Visual Track Lines */}
                <div className='absolute inset-0 flex justify-between pointer-events-none opacity-[0.03]'>
                    {[0, 25, 50, 75, 100].map(p => (
                        <div key={p} className='h-full w-px bg-black' />
                    ))}
                </div>

                {rankedSellers.map((runner, index) => {
                    const seller = runner.item
                    const progress = (seller.value / maxGoal) * 100

                    return (
                        <div key={seller.name} className='relative group'>
                            <div className='flex justify-between items-center mb-2'>
                                <div className='flex items-center gap-2'>
                                    <span className={`text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center ${runner.medal === 'gold' ? 'bg-amber-500/20 text-amber-600' : runner.medal === 'silver' ? 'bg-slate-300/20 text-slate-400' : runner.medal === 'bronze' ? 'bg-orange-500/20 text-orange-500' : 'text-[var(--text-secondary)]'}`} style={{ background: runner.medal ? undefined : 'var(--hover-bg)' }}>
                                        {runner.rank}
                                    </span>
                                    <span className='text-sm font-bold' style={{ color: 'var(--text-primary)' }}>{seller.name}</span>
                                </div>
                                <div className='flex items-center gap-3'>
                                    <div className='text-right'>
                                        <p className='text-xs font-black' style={{ color: 'var(--text-primary)' }}>${seller.value.toLocaleString()}</p>
                                        <p className='text-[8px] font-bold uppercase' style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>Conf: {seller.reliability.toFixed(1)}%</p>
                                    </div>
                                </div>
                            </div>

                            <div className='relative h-10 flex items-end'>
                                <div className='h-6 w-full rounded-full overflow-hidden relative border p-1' style={{ background: 'var(--background)', borderColor: 'var(--card-border)' }}>
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${Math.min(100, progress)}%` }}
                                        transition={{ duration: 1.5, delay: index * 0.1, ease: 'easeOut' }}
                                        className={`h-full rounded-full shadow-lg relative ${runner.medal === 'gold' ? 'bg-gradient-to-r from-[#1700AC] to-[#2048FF]' :
                                            runner.medal === 'silver' ? 'bg-gradient-to-r from-[#4F46E5] to-[#6366F1]' :
                                                'bg-gradient-to-r from-gray-400 to-gray-500'
                                            }`}
                                    >
                                        {/* Particle effect at the end of the bar */}
                                        <motion.div
                                            animate={{ opacity: [0.5, 1, 0.5] }}
                                            transition={{ repeat: Infinity, duration: 1 }}
                                            className='absolute right-0 top-0 bottom-0 w-2 bg-white/30 rounded-full'
                                        />
                                    </motion.div>
                                </div>

                                { /* Runner Mascot - Outside the clipped div */}
                                <motion.div
                                    initial={{ left: '0%', scaleX: -1 }}
                                    animate={{
                                        left: `${Math.min(100, progress)}%`,
                                        y: [0, -4, 0], // Bobbing up and down
                                        rotate: [0, -5, 5, 0], // Slight running tilt
                                        scaleX: -1
                                    }}
                                    transition={{
                                        left: { duration: 4.5, delay: index * 0.2, ease: 'easeInOut' },
                                        y: { repeat: Infinity, duration: 1.0, ease: 'easeInOut' },
                                        rotate: { repeat: Infinity, duration: 1.2, ease: 'easeInOut' }
                                    }}
                                    className='absolute -top-1 -ml-4 text-2xl select-none pointer-events-none drop-shadow-md z-10'
                                >
                                    {progress < 12.5 ? '🐌' :
                                        progress < 25.0 ? '🐢' :
                                            progress < 37.5 ? '🚶' :
                                                progress < 50.0 ? '🏃' :
                                                    progress < 62.5 ? '🚴' :
                                                        progress < 75.0 ? '🚗' :
                                                            progress < 87.5 ? '🏍️' : '🏎️'}
                                </motion.div>
                            </div>

                            {/* Hover Details */}
                            <div className='absolute -right-2 top-0 bottom-0 flex items-center transition-all duration-300 transform group-hover:translate-x-2'>
                                {runner.medal === 'gold' && <TrendingUp className='w-4 h-4 text-emerald-500' />}
                            </div>
                        </div>
                    )
                })}
            </div>

            <div className='flex justify-between text-[8px] font-black uppercase tracking-[0.2em] pt-4 border-t' style={{ color: 'var(--text-secondary)', borderColor: 'var(--card-border)', opacity: 0.5 }}>
                <span>Salida</span>
                <span>25%</span>
                <span>50%</span>
                <span>75%</span>
                <span>Meta</span>
            </div>

            <RaceInfoModal isOpen={isINFOOpen} onClose={() => setIsINFOOpen(false)} />
        </div>
    )
}
