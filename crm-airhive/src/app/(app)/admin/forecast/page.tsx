'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Database } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import RichardDawkinsFooter from '@/components/RichardDawkinsFooter'
import { TrendingUp, RotateCw, Filter, LayoutDashboard, AlertCircle, Info } from 'lucide-react'

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
        if (auth.profile && auth.profile.role !== 'admin') {
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
        <div className='min-h-full flex flex-col p-8 overflow-y-auto custom-scrollbar' style={{ background: 'transparent' }}>
            <div className='max-w-7xl mx-auto w-full space-y-10'>
                {/* Header Pattern consistent with Empresas */}
                <div className='flex flex-col md:flex-row md:items-center justify-between gap-6'>
                    <div className='flex items-center gap-8'>
                        <div className='flex items-center gap-6'>
                            <div
                                className='w-16 h-16 rounded-[22px] flex items-center justify-center border shadow-lg overflow-hidden shrink-0'
                                style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
                            >
                                <TrendingUp size={34} style={{ color: 'var(--accent-secondary)' }} strokeWidth={1.9} />
                            </div>
                            <div>
                                <h1 className='text-4xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>
                                    Pronóstico & Confiabilidad
                                </h1>
                                <p className='font-medium' style={{ color: 'var(--text-secondary)' }}>
                                    Análisis predictivo basado en comportamiento histórico.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className='flex items-center gap-4 p-2 rounded-2xl shadow-sm border' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                        <div className='flex gap-3'>
                            <select
                                value={dateRange}
                                onChange={(e) => setDateRange(e.target.value)}
                                className='bg-transparent px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border-2 cursor-pointer outline-none'
                                style={{ borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                            >
                                <option value="all">Todo Histórico</option>
                                <option value="30">Últimos 30 días</option>
                                <option value="90">Últimos 90 días</option>
                                <option value="180">Últimos 180 días</option>
                            </select>
                            <select
                                value={filterSeller}
                                onChange={(e) => setFilterSeller(e.target.value)}
                                className='bg-transparent px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border-2 cursor-pointer outline-none'
                                style={{ borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                            >
                                <option value="All">Todos los Vendedores</option>
                                {sellers.map(s => <option key={s} value={s!}>{s}</option>)}
                            </select>
                        </div>
                        <button
                            onClick={fetchLeads}
                            className='px-5 py-2.5 bg-[#2048FF] text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2'
                        >
                            <span>Actualizar</span>
                            <RotateCw size={12} strokeWidth={2.5} />
                        </button>
                    </div>
                </div>

                {/* Metric Cards redesigned */}
                <div className='grid grid-cols-1 md:grid-cols-4 gap-6'>
                    <div className='p-6 rounded-[30px] border shadow-sm transition-all hover:scale-[1.02]' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                        <div className='flex flex-col'>
                            <label className='text-[10px] font-black uppercase tracking-[0.2em] opacity-60' style={{ color: 'var(--text-secondary)' }}>Pipeline Seleccionado</label>
                            <div className='flex items-baseline gap-2 mt-2'>
                                <p className='text-3xl font-black' style={{ color: 'var(--text-primary)' }}>{globalStats.totalLeads}</p>
                                <span className='text-xs font-bold uppercase tracking-widest' style={{ color: 'var(--text-secondary)' }}>Leads</span>
                            </div>
                        </div>
                    </div>
                    <div className='p-6 rounded-[30px] border shadow-sm transition-all hover:scale-[1.02]' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                        <div className='flex flex-col'>
                            <label className='text-[10px] font-black uppercase tracking-[0.2em] opacity-60' style={{ color: 'var(--text-secondary)' }}>Histórico Analizado</label>
                            <div className='flex items-baseline gap-2 mt-2'>
                                <p className='text-3xl font-black' style={{ color: 'var(--text-primary)' }}>{globalStats.historicalCount}</p>
                                <span className='text-xs font-bold uppercase tracking-widest' style={{ color: 'var(--text-secondary)' }}>Cerrados</span>
                            </div>
                        </div>
                    </div>
                    <div className='p-6 rounded-[30px] border shadow-sm transition-all hover:scale-[1.02]' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                        <div className='flex flex-col'>
                            <label className='text-[10px] font-black uppercase tracking-[0.2em] opacity-60' style={{ color: 'var(--text-secondary)' }}>Error Cuadrático (Brier)</label>
                            <p className='text-3xl font-black mt-2 text-[#2048FF] shadow-blue-500/5'>
                                {globalStats.avgLogLoss.toFixed(3)}
                            </p>
                        </div>
                    </div>
                    <div className='bg-[#2048FF] p-6 rounded-[30px] border-none shadow-xl shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-95 group'>
                        <div className='flex flex-col'>
                            <label className='text-[10px] font-black text-white/50 uppercase tracking-[0.2em]'>Forecast Ajustado (Total)</label>
                            <p className='text-3xl font-black text-white mt-1'>
                                ${globalStats.adjustedTotal.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </p>
                            <p className='text-[10px] text-white/60 font-medium mt-1 uppercase tracking-tighter'>Pipeline ponderado por confiabilidad</p>
                        </div>
                    </div>
                </div>

                <div className='px-6 py-4 rounded-2xl border flex items-center justify-between shadow-sm transition-all'
                    style={{ background: 'rgba(32, 72, 255, 0.05)', borderColor: 'rgba(32, 72, 255, 0.1)' }}>
                    <div className='flex items-center gap-4'>
                        <div className='w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center'>
                            <Filter size={18} className='text-[#2048FF]' />
                        </div>
                        <div>
                            <p className='text-xs font-black text-[#2048FF] uppercase tracking-widest'>Filtro Activo: Solo Negociación</p>
                            <p className='text-[10px] font-bold opacity-60' style={{ color: 'var(--text-primary)' }}>
                                El forecast solo incluye {globalStats.negotiationCount} leads en etapa de Negociación.
                            </p>
                        </div>
                    </div>
                    <div className='text-right'>
                        <p className='text-[10px] font-black uppercase tracking-[0.2em]' style={{ color: 'var(--text-secondary)' }}>Total Bruto</p>
                        <p className='text-xl font-black text-[#2048FF]'>${globalStats.pipelineForecast.toLocaleString('es-MX')}</p>
                    </div>
                </div>

                {/* Main Table Container stylized */}
                <div className='rounded-[40px] shadow-2xl border overflow-hidden flex flex-col' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                    <div className='px-8 py-6 border-b flex items-center justify-between' style={{ borderColor: 'var(--card-border)' }}>
                        <div className='flex items-center gap-4'>
                            <div className='w-12 h-12 rounded-[20px] flex items-center justify-center shadow-inner' style={{ background: 'var(--background)', color: 'var(--text-secondary)' }}>
                                <LayoutDashboard size={24} />
                            </div>
                            <div>
                                <h2 className='text-xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>Métricas por Colaborador</h2>
                                <p className='text-[10px] font-bold uppercase tracking-[0.2em] opacity-60' style={{ color: 'var(--text-secondary)' }}>Evaluación de Precisión Predictiva</p>
                            </div>
                        </div>
                    </div>

                    <div className='overflow-x-auto'>
                        <table className='w-full text-left border-collapse'>
                            <thead className='uppercase text-[10px] font-black tracking-[0.2em]' style={{ background: 'var(--table-header-bg)', color: 'var(--text-secondary)' }}>
                                <tr>
                                    <th className='px-8 py-5 whitespace-nowrap'>Vendedor</th>
                                    <th className='px-8 py-5 whitespace-nowrap text-center'>Conf. (Score)</th>
                                    <th className='px-8 py-5 whitespace-nowrap text-center'>Forecast Negoc.</th>
                                    <th className='px-8 py-5 whitespace-nowrap text-center'>Forecast Real (Adj)</th>
                                    <th className='px-8 py-5 whitespace-nowrap text-center'>Tasa Cierre</th>
                                    <th className='px-8 py-5 whitespace-nowrap text-center'>Muestra</th>
                                </tr>
                            </thead>
                            <tbody className='divide-y' style={{ borderColor: 'var(--card-border)' }}>
                                {statsPerSeller.map((s, idx) => (
                                    <tr key={s.name} className='transition-colors group hover:bg-black/5'>
                                        <td className='px-8 py-5'>
                                            <div className='flex items-center gap-3'>
                                                <span className='w-8 h-8 rounded-full bg-gradient-to-tr from-[#2048FF] to-[#8B5CF6] text-white flex items-center justify-center font-black text-[10px] shadow-sm'>
                                                    {s.name.charAt(0).toUpperCase()}
                                                </span>
                                                <span className='font-bold text-sm' style={{ color: 'var(--text-primary)' }}>{s.name}</span>
                                            </div>
                                        </td>
                                        <td className='px-8 py-5 text-center'>
                                            <div className='flex flex-col items-center gap-2'>
                                                <span className={`text-base font-black ${s.score > 70 ? 'text-emerald-500' : s.score > 40 ? 'text-amber-500' : 'text-red-500'}`}>
                                                    {s.score > 0 ? s.score.toFixed(1) : (s.historicalLeads.length > 0 ? 'Sin datos' : 'N/A')}
                                                </span>
                                                <div className='w-20 h-1.5 bg-gray-500/10 rounded-full overflow-hidden'>
                                                    <div
                                                        className={`h-full transition-all duration-700 ${s.score > 70 ? 'bg-emerald-500' : s.score > 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                                                        style={{ width: `${s.score}%`, boxShadow: '0 0 10px currentColor' }}
                                                    />
                                                </div>
                                                <p className='text-[8px] font-black uppercase tracking-[0.1em] opacity-40' style={{ color: 'var(--text-secondary)' }}>
                                                    {s.historicalLeads.length} leads
                                                </p>
                                            </div>
                                        </td>
                                        <td className='px-8 py-5 text-center'>
                                            <p className='font-bold text-sm' style={{ color: 'var(--text-primary)' }}>${s.pipelineExpectedValue.toLocaleString('es-MX', { maximumFractionDigits: 0 })}</p>
                                            <p className='text-[10px] font-bold opacity-40 uppercase tracking-tighter' style={{ color: 'var(--text-secondary)' }}>{s.leads.filter(l => l.etapa === 'Negociación').length} en negoc.</p>
                                        </td>
                                        <td className='px-8 py-5 text-center' style={{ backgroundColor: 'rgba(32, 72, 255, 0.02)' }}>
                                            <p className='font-black text-[#2048FF] text-base'>${s.pipelineAdjustedValue.toLocaleString('es-MX', { maximumFractionDigits: 0 })}</p>
                                            <p className='text-[8px] font-black text-[#2048FF]/60 uppercase tracking-widest'>Ponderado</p>
                                        </td>
                                        <td className='px-8 py-5 text-center font-black text-sm' style={{ color: 'var(--text-primary)' }}>{s.winRate.toFixed(1)}%</td>
                                        <td className='px-8 py-5 text-center'>
                                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${s.historicalLeads.length < 10
                                                ? 'bg-amber-500/10 border-amber-500/20 text-amber-600'
                                                : 'bg-blue-500/10 border-blue-500/20 text-[#2048FF]'
                                                }`}>
                                                {s.historicalLeads.length} {s.historicalLeads.length < 10 && '⚠️'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Redesigned Guidance Section using transparent-bordered themed cards */}
                <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                    <div className='p-6 rounded-[30px] border shadow-sm flex gap-4 transition-all hover:bg-blue-500/5' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                        <div className='w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center shrink-0'>
                            <Info size={24} className='text-[#2048FF]' />
                        </div>
                        <div>
                            <p className='font-black text-sm uppercase tracking-widest leading-none mb-3' style={{ color: 'var(--text-primary)' }}>Interpretación del Forecast</p>
                            <p className='text-xs font-medium leading-relaxed' style={{ color: 'var(--text-secondary)' }}>
                                Se calcula sumando el (Valor Estimado × Probabilidad %) de cada lead abierto. El **Score de Confiabilidad** pondera este valor para ofrecer una visión realista basada en cierres pasados.
                            </p>
                        </div>
                    </div>

                    {statsPerSeller.some(s => s.historicalLeads.length < 10) && (
                        <div className='p-6 rounded-[30px] border shadow-sm flex gap-4 border-amber-500/20 transition-all hover:bg-amber-500/5' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                            <div className='w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center shrink-0'>
                                <AlertCircle size={24} className='text-amber-500' />
                            </div>
                            <div>
                                <p className='font-black text-sm uppercase tracking-widest leading-none mb-3 text-amber-600'>Validez Estadística</p>
                                <p className='text-xs font-medium leading-relaxed text-amber-600/80'>
                                    Algunos vendedores tienen pocos cierres registrados. El Score de Confiabilidad ganará precisión automáticamente a medida que el sistema capture más comportamiento histórico.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
                <RichardDawkinsFooter />
            </div>
        </div>
    )
}
