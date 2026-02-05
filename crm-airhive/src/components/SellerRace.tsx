'use client'

import { motion } from 'framer-motion'
import { Trophy, TrendingUp, User } from 'lucide-react'

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
    // Sort by value for the "race" look
    const sortedSellers = [...sellers].sort((a, b) => b.value - a.value)

    return (
        <div className='bg-white p-8 rounded-3xl border border-gray-100 shadow-sm space-y-8'>
            <div className='flex justify-between items-end'>
                <div>
                    <h3 className='text-xl font-black text-[#0A1635] tracking-tight flex items-center gap-2'>
                        <Trophy className='w-5 h-5 text-amber-500' />
                        Carrera de Cierre
                    </h3>
                    <p className='text-xs text-gray-400 font-medium mt-1 uppercase tracking-widest'>Valor en Negociación vs Meta de Equipo</p>
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

                {sortedSellers.map((seller, index) => {
                    const progress = (seller.value / maxGoal) * 100

                    return (
                        <div key={seller.name} className='relative group'>
                            <div className='flex justify-between items-center mb-2'>
                                <div className='flex items-center gap-2'>
                                    <span className={`text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center ${index === 0 ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-400'}`}>
                                        {index + 1}
                                    </span>
                                    <span className='text-sm font-bold text-[#0A1635]'>{seller.name}</span>
                                </div>
                                <div className='flex items-center gap-3'>
                                    <div className='text-right'>
                                        <p className='text-xs font-black text-[#0A1635]'>${seller.value.toLocaleString()}</p>
                                        <p className='text-[8px] text-gray-400 font-bold uppercase'>Conf: {seller.reliability.toFixed(1)}%</p>
                                    </div>
                                </div>
                            </div>

                            <div className='relative h-10 flex items-end'>
                                <div className='h-6 w-full bg-gray-50 rounded-full overflow-hidden relative border border-gray-100 p-1'>
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${Math.min(100, progress)}%` }}
                                        transition={{ duration: 1.5, delay: index * 0.1, ease: 'easeOut' }}
                                        className={`h-full rounded-full shadow-lg relative ${index === 0 ? 'bg-gradient-to-r from-[#1700AC] to-[#2048FF]' :
                                            index === 1 ? 'bg-gradient-to-r from-[#4F46E5] to-[#6366F1]' :
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
                                    {progress < 33 ? '🐢' : progress < 66 ? '🏃‍♂️' : '🏎️'}
                                </motion.div>
                            </div>

                            {/* Hover Details */}
                            <div className='absolute -right-2 top-0 bottom-0 flex items-center transition-all duration-300 transform group-hover:translate-x-2'>
                                {index === 0 && <TrendingUp className='w-4 h-4 text-emerald-500' />}
                            </div>
                        </div>
                    )
                })}
            </div>

            <div className='flex justify-between text-[8px] font-black text-gray-400 uppercase tracking-[0.2em] pt-4 border-t border-gray-50'>
                <span>Salida</span>
                <span>25%</span>
                <span>50%</span>
                <span>75%</span>
                <span>Meta</span>
            </div>
        </div>
    )
}
