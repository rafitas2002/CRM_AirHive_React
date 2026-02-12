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
            <div className="text-center p-8 bg-slate-800/50 rounded-xl border border-slate-700">
                <p className="text-slate-400">No hay historial de carreras todavía.</p>
            </div>
        )
    }

    return (
        <div className="space-y-8">
            {periods.map((period) => {
                const results = races[period]
                const title = results[0]?.title || `Carrera de ${period}`

                return (
                    <div key={period} className="bg-slate-800/40 rounded-2xl border border-slate-700 overflow-hidden">
                        <div className="px-6 py-4 bg-slate-800/60 border-b border-slate-700 flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                <Trophy className="w-5 h-5 text-yellow-500" />
                                {title}
                            </h3>
                            <span className="text-xs text-slate-400 font-mono uppercase tracking-wider">
                                {period}
                            </span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-slate-700/50">
                                        <th className="px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Rango</th>
                                        <th className="px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Vendedor</th>
                                        <th className="px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Ventas Totales</th>
                                        <th className="px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Medalla</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-700/30">
                                    {results.map((res) => (
                                        <tr key={res.user_id} className="hover:bg-slate-700/20 transition-colors">
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
                                            <td className="px-6 py-4 font-medium text-slate-200">
                                                {res.name}
                                            </td>
                                            <td className="px-6 py-4 font-mono text-slate-300">
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
