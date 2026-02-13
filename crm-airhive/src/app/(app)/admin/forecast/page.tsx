'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Database } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import RichardDawkinsFooter from '@/components/RichardDawkinsFooter'

type Lead = Database['public']['Tables']['clientes']['Row']
type History = {
    lead_id: number
    field_name: string
    old_value: string | null
    new_value: string | null
    created_at: string
}

export default function ForecastDashboard() {
    const auth = useAuth()
    const router = useRouter()
    const [leads, setLeads] = useState<Lead[]>([])
    const [history, setHistory] = useState<History[]>([])
    const [loading, setLoading] = useState(true)
    const [supabase] = useState(() => createClient())

    // Filters
    const [dateRange, setDateRange] = useState('all') // 30, 90, 180, all
    const [filterSeller, setFilterSeller] = useState('All')

    useEffect(() => {
        if (!auth.loading && !auth.loggedIn) {
            router.push('/home')
            return
        }
        if (auth.profile && auth.profile.role !== 'admin' && auth.profile.role !== 'rh') {
            router.push('/home')
            return
        }
        fetchLeads()
    }, [auth.loading, auth.loggedIn, auth.profile])

    const fetchLeads = async () => {
        setLoading(true)
        // Fetch ALL leads to have a complete view of the pipeline
        const { data, error } = await supabase
            .from('clientes')
            .select('*')

        if (!error && data) {
            setLeads(data)
        }

        // Fetch history to recover probabilities for old leads
        const { data: histData } = await (supabase
            .from('lead_history') as any)
            .select('*')
            .eq('field_name', 'probabilidad')
            .order('created_at', { ascending: false })

        if (histData) setHistory(histData as any)

        setLoading(false)
    }

    const filteredLeads = useMemo(() => {
        let result = leads

        // Date Filter (only applies to scored leads or all for general view?)
        // Let's keep it applying to scored leads for the "Historical" part
        if (dateRange !== 'all') {
            const days = parseInt(dateRange)
            const cutoff = new Date()
            cutoff.setDate(cutoff.getDate() - days)
            result = result.filter(l => {
                if (l.forecast_scored_at) return new Date(l.forecast_scored_at) >= cutoff
                return true // Keep open leads always? Or filter them too? Let's keep open leads.
            })
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
            historicalLeads: Lead[],
            activeLeads: Lead[],
            avgLogLoss: number,
            winRate: number,
            avgProb: number,
            score: number,
            pipelineExpectedValue: number,
            pipelineAdjustedValue: number
        }> = {}

        // Global Win Rate for baseline (only from closed leads)
        const allClosedLeads = leads.filter(l => l.etapa?.toLowerCase().includes('cerrado'))
        const globalWinRate = allClosedLeads.length > 0
            ? allClosedLeads.filter(l => l.etapa === 'Cerrado Ganado').length / allClosedLeads.length
            : 0.3

        const r = Math.max(0.01, Math.min(0.99, globalWinRate))
        const L_base = -(r * Math.log(r) + (1 - r) * Math.log(1 - r))

        filteredLeads.forEach(lead => {
            const seller = lead.owner_username || 'Unknown'
            if (!map[seller]) {
                map[seller] = {
                    name: seller,
                    leads: [],
                    historicalLeads: [],
                    activeLeads: [],
                    avgLogLoss: 0,
                    winRate: 0,
                    avgProb: 0,
                    score: 0,
                    pipelineExpectedValue: 0,
                    pipelineAdjustedValue: 0
                }
            }
            map[seller].leads.push(lead)

            // Check if lead is closed based on Stage (etapa)
            const isClosed = lead.etapa?.toLowerCase().includes('cerrado')
            if (isClosed) {
                map[seller].historicalLeads.push(lead)
            } else {
                map[seller].activeLeads.push(lead)
            }
        })

        return Object.values(map).map(s => {
            const histN = s.historicalLeads.length

            // Win Rate based on etapa
            const sumWins = s.historicalLeads.filter(l => l.etapa === 'Cerrado Ganado').length
            const winRate = histN > 0 ? (sumWins / histN) * 100 : 0

            // Reliability Score - Linear Accuracy (1 - Mean Absolute Error)
            // Accuracy = (1 - |Outcome - PredictedProb|) * 100
            const scoredLeads = s.historicalLeads.map(l => {
                let p = 0
                let y = l.etapa === 'Cerrado Ganado' ? 1 : 0

                // Use the probability the seller committed to
                if (l.forecast_evaluated_probability !== null) {
                    p = l.forecast_evaluated_probability / 100
                    y = l.forecast_outcome ?? (l.etapa === 'Cerrado Ganado' ? 1 : 0)
                } else {
                    // Try to RECOVER from history for older leads
                    const leadHist = history.filter(h => h.lead_id === l.id)
                    const recoveredProbStr = leadHist[0]?.new_value
                    if (recoveredProbStr) {
                        p = parseInt(recoveredProbStr) / 100
                    } else {
                        // If no commitment was ever made, we can't score reliability
                        return null
                    }
                }

                const error = Math.abs(y - p)
                return { ...l, lead_error: error, forecast_evaluated_probability: p * 100 } // Store p*100 for avgProb
            }).filter((l): l is (Lead & { lead_error: number, forecast_evaluated_probability: number }) => l !== null)

            const scoredN = scoredLeads.length
            // Brier-style accuracy (1 - error^2)
            const sumAccuracy = scoredLeads.reduce((acc, l) => acc + (1 - Math.pow(l.lead_error, 2)), 0)
            const rawAccuracy = scoredN > 0 ? (sumAccuracy / scoredN) : 0

            // Credibility Factor: Penalty for low sample size
            // K=4 means you need 4 leads to get 50% of your potential score
            const K = 4
            const credibilityFactor = scoredN / (scoredN + K)
            const reliabilityScore = scoredN > 0 ? (rawAccuracy * credibilityFactor) * 100 : 0

            // Pipeline Forecast (Only Negotiation leads)
            const negotiationLeads = s.activeLeads.filter(l => l.etapa === 'Negociación')
            const pipelineEV = negotiationLeads.reduce((acc, l) => {
                const prob = (l.probabilidad || 0) / 100
                const val = l.valor_estimado || 0
                return acc + (prob * val)
            }, 0)

            // Adjusted Forecast (Weight by reliability)
            const pipelineAdj = pipelineEV * (reliabilityScore / 100)

            return {
                ...s,
                avgLogLoss: scoredN > 0 ? (1 - rawAccuracy) : 0, // Now Mean Quadratic Error
                winRate,
                avgProb: scoredN > 0 ? (scoredLeads.reduce((acc, l) => acc + (l.forecast_evaluated_probability || 0), 0) / scoredN) : 0,
                score: reliabilityScore,
                pipelineExpectedValue: pipelineEV,
                pipelineAdjustedValue: pipelineAdj
            }
        }).sort((a, b) => b.score - a.score)
    }, [leads, filteredLeads, history])

    // Global Stats for the top cards
    const globalStats = useMemo(() => {
        const historical = filteredLeads.filter(l => l.etapa?.toLowerCase().includes('cerrado'))
        const active = filteredLeads.filter(l => !l.etapa?.toLowerCase().includes('cerrado'))

        // Global Brier Accuracy
        const scoredSellers = statsPerSeller.filter(s => s.historicalLeads.length > 0)
        const avgRawAcc = scoredSellers.length > 0
            ? scoredSellers.reduce((acc, s) => acc + (s.score / (s.historicalLeads.length / (s.historicalLeads.length + 4)) / 100), 0) / scoredSellers.length
            : 0

        // Actually, let's just use the mean error from sellers directly
        const globalMeanError = scoredSellers.length > 0
            ? scoredSellers.reduce((acc, s) => acc + s.avgLogLoss, 0) / scoredSellers.length
            : 0

        const pipelineForecast = active.filter(l => l.etapa === 'Negociación').reduce((acc, l) => {
            return acc + ((l.probabilidad || 0) / 100 * (l.valor_estimado || 0))
        }, 0)

        // Global adjusted sum
        const adjustedTotal = statsPerSeller.reduce((acc, s) => acc + s.pipelineAdjustedValue, 0)

        return {
            totalLeads: filteredLeads.length,
            historicalCount: historical.length,
            activeCount: active.length,
            negotiationCount: active.filter(l => l.etapa === 'Negociación').length,
            avgLogLoss: globalMeanError,
            pipelineForecast,
            adjustedTotal
        }
    }, [filteredLeads, statsPerSeller])
    burial:
    return (
        <div className='min-h-full flex flex-col p-8 overflow-y-auto custom-scrollbar' style={{ background: 'var(--background)' }}>
            <div className='max-w-7xl mx-auto w-full space-y-8'>
                <div className='flex justify-between items-center'>
                    <h1 className='text-3xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>
                        Pronóstico & Confiabilidad
                    </h1>
                    <div className='flex gap-4 items-center'>
                        <select
                            value={dateRange}
                            onChange={(e) => setDateRange(e.target.value)}
                            className='border rounded-xl px-4 py-2 text-sm font-bold shadow-sm'
                            style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                        >
                            <option value="all">Todo Histórico</option>
                            <option value="30">Últimos 30 días</option>
                            <option value="90">Últimos 90 días</option>
                            <option value="180">Últimos 180 días</option>
                        </select>
                        <select
                            value={filterSeller}
                            onChange={(e) => setFilterSeller(e.target.value)}
                            className='border rounded-xl px-4 py-2 text-sm font-bold shadow-sm'
                            style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                        >
                            <option value="All">Todos los Vendedores</option>
                            {sellers.map(s => <option key={s} value={s!}>{s}</option>)}
                        </select>
                    </div>
                </div>

                {/* Dashboard Cards */}
                <div className='grid grid-cols-1 md:grid-cols-4 gap-6'>
                    <div className='p-6 rounded-2xl border shadow-sm' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                        <label className='text-[10px] font-black uppercase tracking-[0.2em]' style={{ color: 'var(--text-secondary)' }}>Pipeline Seleccionado</label>
                        <p className='text-3xl font-black mt-2' style={{ color: 'var(--text-primary)' }}>{globalStats.totalLeads} <span className='text-sm font-normal' style={{ color: 'var(--text-secondary)' }}>Leads</span></p>
                    </div>
                    <div className='p-6 rounded-2xl border shadow-sm' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                        <label className='text-[10px] font-black uppercase tracking-[0.2em]' style={{ color: 'var(--text-secondary)' }}>Histórico Analizado</label>
                        <p className='text-3xl font-black mt-2' style={{ color: 'var(--text-primary)' }}>{globalStats.historicalCount} <span className='text-sm font-normal' style={{ color: 'var(--text-secondary)' }}>Cerrados</span></p>
                    </div>
                    <div className='p-6 rounded-2xl border shadow-sm' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                        <label className='text-[10px] font-black uppercase tracking-[0.2em]' style={{ color: 'var(--text-secondary)' }}>Error Cuadrático (Brier)</label>
                        <p className='text-3xl font-black text-[#2048FF] mt-2'>
                            {globalStats.avgLogLoss.toFixed(3)}
                        </p>
                    </div>
                    <div className='bg-[#1700AC] p-6 rounded-2xl border border-[#1700AC] shadow-lg'>
                        <label className='text-[10px] font-black text-white/50 uppercase tracking-[0.2em]'>Forecast Ajustado (Total)</label>
                        <p className='text-3xl font-black text-white mt-1'>
                            ${globalStats.adjustedTotal.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </p>
                        <p className='text-[10px] text-white/60 font-medium mt-1'>Pipeline real ponderado por confiabilidad</p>
                    </div>
                </div>

                <div className='bg-blue-900/10 p-4 rounded-xl border border-blue-900/20 flex items-center justify-between'>
                    <div>
                        <p className='text-xs font-bold text-blue-900 uppercase tracking-widest'>Filtro Activo: Solo Negociación</p>
                        <p className='text-[10px] text-blue-900/60'>
                            El forecast solo incluye {globalStats.negotiationCount} leads en etapa de Negociación.
                        </p>
                    </div>
                    <div className='text-right'>
                        <p className='text-xs font-bold text-blue-900'>Total Bruto: ${globalStats.pipelineForecast.toLocaleString('es-MX')}</p>
                    </div>
                </div>

                {/* Main Table */}
                <div className='rounded-[40px] border shadow-2xl overflow-hidden' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                    <table className='w-full text-left'>
                        <thead className='bg-gray-50 border-b border-gray-100'>
                            <tr>
                                <th className='px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest'>Vendedor</th>
                                <th className='px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest text-center'>Conf. (Score)</th>
                                <th className='px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest text-center'>Forecast Negoc.</th>
                                <th className='px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest text-center bg-blue-50/50'>Forecast Real (Adj)</th>
                                <th className='px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest text-center'>Tasa Cierre</th>
                                <th className='px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest text-center'>Muestra</th>
                            </tr>
                        </thead>
                        <tbody className='divide-y divide-gray-50'>
                            {statsPerSeller.map((s, idx) => (
                                <tr key={s.name} className='transition-colors group' style={{ borderBottom: '1px solid var(--card-border)' }}>
                                    <td className='px-6 py-4'>
                                        <div className='flex items-center gap-3'>
                                            <span className='w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs'>
                                                {idx + 1}
                                            </span>
                                            <span className='font-bold' style={{ color: 'var(--text-primary)' }}>{s.name}</span>
                                        </div>
                                    </td>
                                    <td className='px-6 py-4 text-center'>
                                        <div className='flex flex-col items-center gap-1'>
                                            <span className={`text-lg font-black ${s.score > 70 ? 'text-emerald-600' : s.score > 40 ? 'text-amber-600' : 'text-red-600'}`}>
                                                {s.score > 0 ? s.score.toFixed(1) : (s.historicalLeads.length > 0 ? 'Sin datos' : 'N/A')}
                                            </span>
                                            <div className='w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1'>
                                                <div
                                                    className={`h-full transition-all duration-500 ${s.score > 70 ? 'bg-emerald-500' : s.score > 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                                                    style={{ width: `${s.score}%` }}
                                                />
                                            </div>
                                            <p className='text-[9px] font-bold text-gray-400 mt-1 uppercase tracking-tighter'>
                                                Basado en {s.historicalLeads.length} leads
                                            </p>
                                        </div>
                                    </td>
                                    <td className='px-6 py-4 text-center'>
                                        <p className='font-bold text-gray-400'>${s.pipelineExpectedValue.toLocaleString('es-MX', { maximumFractionDigits: 0 })}</p>
                                        <p className='text-[10px] text-gray-400'>{s.leads.filter(l => l.etapa === 'Negociación').length} en negoc.</p>
                                    </td>
                                    <td className='px-6 py-4 text-center bg-blue-50/20'>
                                        <p className='font-black text-[#1700AC] text-lg'>${s.pipelineAdjustedValue.toLocaleString('es-MX', { maximumFractionDigits: 0 })}</p>
                                        <p className='text-[10px] text-blue-600/60 uppercase font-black tracking-tighter'>Ponderado</p>
                                    </td>
                                    <td className='px-6 py-4 text-center font-bold' style={{ color: 'var(--text-primary)' }}>{s.winRate.toFixed(1)}%</td>
                                    <td className='px-6 py-4 text-center'>
                                        <span className={`px-3 py-1.5 rounded-lg text-sm font-black ${s.historicalLeads.length < 10 ? 'bg-amber-50 text-amber-600' : 'bg-gray-100 text-gray-600'}`}>
                                            {s.historicalLeads.length} {s.historicalLeads.length < 10 && '⚠️'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Guidance */}
                <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                    <div className='bg-blue-50 p-6 rounded-2xl border border-blue-100'>
                        <p className='text-blue-800 font-bold mb-2'>¿Cómo leer el Forecast del Pipeline?</p>
                        <p className='text-blue-700/80 text-sm leading-relaxed'>
                            Es el valor que esperamos cerrar pronto. Se calcula sumando el (Valor Estimado × Probabilidad %) de cada lead abierto.
                            Combínalo con el **Score de Confiabilidad** para saber qué tan realistas son las promesas de cada vendedor.
                        </p>
                    </div>
                    {statsPerSeller.some(s => s.historicalLeads.length < 10) && (
                        <div className='bg-amber-50 p-6 rounded-2xl border border-amber-100'>
                            <p className='text-amber-800 font-bold mb-2'>Validez Estadística Limitada</p>
                            <p className='text-amber-700/80 text-sm leading-relaxed'>
                                Algunos vendedores tienen pocos cierres registrados. El Score de Confiabilidad será más preciso a medida que cierren más leads y comparemos sus predicciones con la realidad.
                            </p>
                        </div>
                    )}
                </div>
                <RichardDawkinsFooter />
            </div>
        </div>
    )
}
