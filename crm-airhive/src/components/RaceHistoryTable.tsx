'use client'

import React from 'react'
import { Trophy, Medal } from 'lucide-react'

interface RaceResult {
    period: string
    title: string
    user_id: string
    name: string
    total_sales: number
    rank: number
    medal: 'gold' | 'silver' | 'bronze' | null
}

interface RaceHistoryTableProps {
    races: Record<string, RaceResult[]>
}

export function RaceHistoryTable({ races }: RaceHistoryTableProps) {
    const periods = Object.keys(races).sort((a, b) => b.localeCompare(a))

    if (periods.length === 0) {
        return (
            <div className="text-center p-8 rounded-xl border border-dashed transition-all" style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}>
                <p className="font-bold uppercase text-[10px] tracking-widest" style={{ color: 'var(--text-secondary)' }}>No hay historial de carreras todavía.</p>
            </div>
        )
    }

    return (
        <div className="space-y-8">
            {periods.map((period) => {
                const results = races[period]
                const title = results[0]?.title || `Carrera de ${period}`

                return (
                    <div key={period} className="rounded-2xl border overflow-hidden transition-all duration-500" style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}>
                            <h3 className="text-lg font-black tracking-tight flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                                <Trophy className="w-5 h-5 text-yellow-500" />
                                {title}
                            </h3>
                            <span className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-auto" style={{ color: 'var(--text-secondary)' }}>
                                {period}
                            </span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b" style={{ background: 'var(--table-header-bg)', borderColor: 'var(--card-border)' }}>
                                        <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Rango</th>
                                        <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Vendedor</th>
                                        <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Ventas Totales</th>
                                        <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Medalla</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y" style={{ borderColor: 'var(--card-border)' }}>
                                    {results.map((res) => (
                                        <tr key={res.user_id} className="hover:bg-[var(--hover-bg)] transition-colors">
                                            <td className="px-6 py-4">
                                                <span className={`
                                                    inline-flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm
                                                    ${res.rank === 1 ? 'bg-yellow-500/20 text-yellow-500' :
                                                        res.rank === 2 ? 'bg-slate-300/20 text-slate-300' :
                                                            res.rank === 3 ? 'bg-amber-700/20 text-amber-700' :
                                                                'text-slate-500'}
                                                `}>
                                                    {res.rank}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 font-bold" style={{ color: 'var(--text-primary)' }}>
                                                {res.name}
                                            </td>
                                            <td className="px-6 py-4 font-black" style={{ color: 'var(--text-primary)' }}>
                                                ${res.total_sales.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-6 py-4">
                                                {res.medal && (
                                                    <div className="flex items-center gap-1">
                                                        <Medal className={`w-5 h-5 ${res.medal === 'gold' ? 'text-yellow-500' :
                                                            res.medal === 'silver' ? 'text-slate-300' :
                                                                'text-amber-700'
                                                            }`} />
                                                        <span className="text-xs capitalize text-slate-400">
                                                            {res.medal === 'gold' ? 'Oro' : res.medal === 'silver' ? 'Plata' : 'Bronce'}
                                                        </span>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
