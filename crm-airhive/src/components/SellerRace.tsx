'use client'

import { useMemo, useState } from 'react'
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
    const orderedSellers = rankedSellers.map((entry) => entry.item)

    const sellerPositions = useMemo(() => {
        const positions = new Map<string, number>()
        const positiveValues = orderedSellers
            .map((s) => s.value)
            .filter((value) => value > 0)

        const uniquePositiveValues = Array.from(new Set(positiveValues)).sort((a: number, b: number) => b - a)
        const positiveRankByValue = new Map<number, number>()
        uniquePositiveValues.forEach((value, idx) => {
            // Competition ranking for positives (1,2,2,4...)
            const rank = positiveValues.filter((v: number) => v > value).length + 1
            positiveRankByValue.set(value, rank || idx + 1)
        })

        orderedSellers.forEach((seller) => {
            if (seller.value <= 0) {
                // Business rule: users with $0 start at position 4.
                positions.set(seller.name, 4)
            } else {
                positions.set(seller.name, positiveRankByValue.get(seller.value) ?? 1)
            }
        })

        return positions
    }, [orderedSellers])

    return (
        <div className='p-8 rounded-3xl border shadow-sm space-y-8 relative' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
            <div className='flex justify-between items-end'>
                <div>
                    <div className='flex items-center gap-3'>
                        <h3 className='text-xl font-black tracking-tight flex items-center gap-2' style={{ color: 'var(--text-primary)' }}>
                            <Trophy className='w-5 h-5 text-amber-500' />
                            Carrera de Cierre
                        </h3>
                        <button
                            onClick={() => setIsINFOOpen(true)}
                            className='w-7 h-7 rounded-full border border-[var(--card-border)] bg-[var(--hover-bg)] text-[var(--text-secondary)] hover:text-[#2048FF] hover:border-[#2048FF] hover:bg-blue-500/10 transition-all flex items-center justify-center shadow-sm cursor-pointer hover:scale-105'
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
                    const position = sellerPositions.get(seller.name) ?? 4

                    return (
                        <div key={seller.name} className='relative group'>
                            <div className='flex justify-between items-center mb-2'>
                                <div className='flex items-center gap-2'>
                                    <span className={`text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center ${position === 1 ? 'bg-amber-500/20 text-amber-600' : 'text-[var(--text-secondary)]'}`} style={{ background: position === 1 ? undefined : 'var(--hover-bg)' }}>
                                        {position}
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
                                        className={`h-full rounded-full shadow-lg relative ${position === 1 ? 'bg-gradient-to-r from-[#1700AC] to-[#2048FF]' :
                                            position === 2 ? 'bg-gradient-to-r from-[#4F46E5] to-[#6366F1]' :
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
                                {position === 1 && <TrendingUp className='w-4 h-4 text-emerald-500' />}
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
