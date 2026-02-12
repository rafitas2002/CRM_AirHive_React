'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { X, Trophy, Medal, Star, Target } from 'lucide-react'

interface RaceInfoModalProps {
    isOpen: boolean
    onClose: () => void
}

export default function RaceInfoModal({ isOpen, onClose }: RaceInfoModalProps) {
    if (!isOpen) return null

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-[#0A1635]/60 backdrop-blur-sm"
                />

                {/* Modal Content */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    className="relative w-full max-w-lg bg-white rounded-[40px] shadow-2xl border border-gray-100 overflow-hidden"
                >
                    {/* Header */}
                    <div className="bg-gradient-to-r from-[#0F2A44] to-[#1700AC] px-8 py-6 flex items-center justify-between text-white">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center">
                                <Trophy className="text-amber-400" size={20} />
                            </div>
                            <div>
                                <h2 className="text-xl font-black tracking-tight leading-tight">Detalles de la Carrera</h2>
                                <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest">Reglas y Medallero</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-white/10 rounded-full transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="p-8 space-y-6">
                        {/* Rules Section */}
                        <div className="space-y-4">
                            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                <Target size={14} /> ¿Cómo funciona?
                            </h3>
                            <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                                <p className="text-sm text-blue-900 font-medium leading-relaxed">
                                    La carrera mide el **valor ponderado** de los leads en etapa de **Negociación**.
                                    A medida que avanzas, tu avatar evoluciona para reflejar tu velocidad de cierre.
                                </p>
                            </div>
                        </div>

                        {/* Medallero Placeholder */}
                        <div className="space-y-4">
                            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                🏅 Medallero de Temporada
                            </h3>
                            <div className="space-y-3">
                                {[
                                    { rank: 'Oro', label: 'Mayor Valor Cerrado', icon: '🥇' },
                                    { rank: 'Plata', label: 'Mejor Confiabilidad', icon: '🥈' },
                                    { rank: 'Bronce', label: 'Más Leads en Pipeline', icon: '🥉' }
                                ].map((item) => (
                                    <div key={item.rank} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                                        <div className="flex items-center gap-3">
                                            <span className="text-xl">{item.icon}</span>
                                            <span className="text-sm font-bold text-[#0A1635]">{item.rank}</span>
                                        </div>
                                        <span className="text-[10px] font-black text-gray-400 uppercase">{item.label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="px-8 py-6 bg-gray-50 border-t border-gray-100 flex justify-end">
                        <button
                            onClick={onClose}
                            className="px-6 py-2.5 bg-[#0A1635] text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-[#1700AC] transition-all shadow-lg shadow-blue-900/10"
                        >
                            Entendido
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    )
}
