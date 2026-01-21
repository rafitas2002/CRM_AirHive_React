'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { Database } from '@/lib/supabase'

type Lead = Database['public']['Tables']['clientes']['Row']

export default function ForecastDashboard() {
    const [leads, setLeads] = useState<Lead[]>([])
    const [loading, setLoading] = useState(true)
    const [supabase] = useState(() => createClient())

    // Filters
    const [dateRange, setDateRange] = useState('all') // 30, 90, 180, all
    const [filterSeller, setFilterSeller] = useState('All')

    useEffect(() => {
        fetchLeads()
    }, [])

    const fetchLeads = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('clientes')
            .select('*')
            .not('forecast_logloss', 'is', null)

        if (!error && data) {
            setLeads(data)
        }
        setLoading(false)
    }

    const filteredLeads = useMemo(() => {
        let result = leads

        // Date Filter
        if (dateRange !== 'all') {
            const days = parseInt(dateRange)
            const cutoff = new Date()
            cutoff.setDate(cutoff.getDate() - days)
            result = result.filter(l => l.forecast_scored_at && new Date(l.forecast_scored_at) >= cutoff)
        }

        // Seller Filter
        if (filterSeller !== 'All') {
            result = result.filter(l => l.owner_username === filterSeller)
        }

        return result
    }, [leads, dateRange, filterSeller])

    const sellers = useMemo(() => {
        const unique = new Set(leads.map(l => l.owner_username).filter(Boolean))
        return Array.from(unique).sort()
    }, [leads])

    // Metrics Calculation
    const statsPerSeller = useMemo(() => {
        const map: Record<string, {
            name: string,
            leads: Lead[],
            avgLogLoss: number,
            winRate: number,
            avgProb: number,
            score: number
        }> = {}

        // Global Win Rate for baseline
        const closedLeads = leads.filter(l => l.forecast_outcome !== null)
        const globalWinRate = closedLeads.length > 0
            ? closedLeads.filter(l => l.forecast_outcome === 1).length / closedLeads.length
            : 0.3

        const r = Math.max(0.01, Math.min(0.99, globalWinRate))
        const L_base = -(r * Math.log(r) + (1 - r) * Math.log(1 - r))

        filteredLeads.forEach(lead => {
            const seller = lead.owner_username || 'Unknown'
            if (!map[seller]) {
                map[seller] = { name: seller, leads: [], avgLogLoss: 0, winRate: 0, avgProb: 0, score: 0 }
            }
            map[seller].leads.push(lead)
        })

        return Object.values(map).map(s => {
            const n = s.leads.length
            const sumLogLoss = s.leads.reduce((acc, l) => acc + (l.forecast_logloss || 0), 0)
            const sumWins = s.leads.filter(l => l.forecast_outcome === 1).length
            const sumProb = s.leads.reduce((acc, l) => acc + (l.forecast_evaluated_probability || 0), 0)

            const avgLogLoss = sumLogLoss / n
            const reliabilityScore = Math.max(0, 1 - (avgLogLoss / L_base)) * 100

            return {
                ...s,
                avgLogLoss,
                winRate: (sumWins / n) * 100,
                avgProb: sumProb / n,
                score: reliabilityScore
            }
        }).sort((a, b) => b.score - a.score)
    }, [leads, filteredLeads])

    return (
        <div className='h-full flex flex-col p-8 bg-[#DDE2E5] overflow-y-auto'>
            <div className='max-w-7xl mx-auto w-full space-y-8'>
                <div className='flex justify-between items-center'>
                    <h1 className='text-3xl font-black text-[#0A1635] tracking-tight'>
                        Confiabilidad de Vendedores
                    </h1>
                    <div className='flex gap-4'>
                        <select
                            value={dateRange}
                            onChange={(e) => setDateRange(e.target.value)}
                            className='bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm font-bold text-[#0A1635] shadow-sm'
                        >
                            <option value="all">Todo Histórico</option>
                            <option value="30">Últimos 30 días</option>
                            <option value="90">Últimos 90 días</option>
                            <option value="180">Últimos 180 días</option>
                        </select>
                        <select
                            value={filterSeller}
                            onChange={(e) => setFilterSeller(e.target.value)}
                            className='bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm font-bold text-[#0A1635] shadow-sm'
                        >
                            <option value="All">Todos los Vendedores</option>
                            {sellers.map(s => <option key={s} value={s!}>{s}</option>)}
                        </select>
                    </div>
                </div>

                {/* Dashboard Cards */}
                <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
                    <div className='bg-white p-6 rounded-2xl border border-gray-200 shadow-sm'>
                        <label className='text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]'>Muestra Analizada</label>
                        <p className='text-3xl font-black text-[#0A1635] mt-2'>{filteredLeads.length} Leads</p>
                    </div>
                    <div className='bg-white p-6 rounded-2xl border border-gray-200 shadow-sm'>
                        <label className='text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]'>Promedio Log Loss</label>
                        <p className='text-3xl font-black text-[#2048FF] mt-2'>
                            {(filteredLeads.reduce((acc, l) => acc + (l.forecast_logloss || 0), 0) / (filteredLeads.length || 1)).toFixed(4)}
                        </p>
                    </div>
                    <div className='bg-[#1700AC] p-6 rounded-2xl border border-[#1700AC] shadow-lg'>
                        <label className='text-[10px] font-black text-white/50 uppercase tracking-[0.2em]'>Puntuación de Red</label>
                        <p className='text-3xl font-black text-white mt-2'>Accuracy Pro</p>
                    </div>
                </div>

                {/* Main Table */}
                <div className='bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden'>
                    <table className='w-full text-left'>
                        <thead className='bg-gray-50 border-b border-gray-100'>
                            <tr>
                                <th className='px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest'>Vendedor</th>
                                <th className='px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest text-center'>Reliability Score</th>
                                <th className='px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest text-center'>Avg Log Loss</th>
                                <th className='px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest text-center'>Tasa Cierre</th>
                                <th className='px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest text-center'>Prob. Media</th>
                                <th className='px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest text-center'>Nº Leads</th>
                            </tr>
                        </thead>
                        <tbody className='divide-y divide-gray-50'>
                            {statsPerSeller.map((s, idx) => (
                                <tr key={s.name} className='hover:bg-gray-50 transition-colors group'>
                                    <td className='px-6 py-4'>
                                        <div className='flex items-center gap-3'>
                                            <span className='w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs'>
                                                {idx + 1}
                                            </span>
                                            <span className='font-bold text-[#0A1635]'>{s.name}</span>
                                        </div>
                                    </td>
                                    <td className='px-6 py-4 text-center'>
                                        <div className='flex flex-col items-center gap-1'>
                                            <span className={`text-lg font-black ${s.score > 80 ? 'text-emerald-600' : s.score > 50 ? 'text-amber-600' : 'text-red-600'}`}>
                                                {s.score.toFixed(1)}
                                            </span>
                                            <div className='w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden'>
                                                <div
                                                    className={`h-full ${s.score > 80 ? 'bg-emerald-500' : s.score > 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                                                    style={{ width: `${s.score}%` }}
                                                />
                                            </div>
                                        </div>
                                    </td>
                                    <td className='px-6 py-4 text-center font-medium text-gray-600'>{s.avgLogLoss.toFixed(4)}</td>
                                    <td className='px-6 py-4 text-center font-bold text-[#0A1635]'>{s.winRate.toFixed(1)}%</td>
                                    <td className='px-6 py-4 text-center font-bold text-[#2048FF]'>{s.avgProb.toFixed(1)}%</td>
                                    <td className='px-6 py-4 text-center'>
                                        <span className={`px-2 py-1 rounded text-[10px] font-black ${s.leads.length < 20 ? 'bg-amber-50 text-amber-600' : 'bg-gray-100 text-gray-600'}`}>
                                            {s.leads.length} {s.leads.length < 20 && '⚠️'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Warnings */}
                {statsPerSeller.some(s => s.leads.length < 20) && (
                    <div className='bg-amber-50 p-4 rounded-xl border border-amber-100 flex items-start gap-4'>
                        <span className='text-2xl'>⚠️</span>
                        <div>
                            <p className='text-amber-800 font-bold'>Validez Estadística Limitada</p>
                            <p className='text-amber-700/80 text-sm'>Algunos vendedores tienen menos de 20 leads evaluados. Los puntajes pueden variar significativamente con nuevos datos.</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
