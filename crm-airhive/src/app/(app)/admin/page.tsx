'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { Database } from '@/lib/supabase'
import {
    LayoutDashboard,
    TrendingUp,
    Target,
    AlertCircle,
    Users,
    ChevronRight,
    Search,
    Filter,
    Zap
} from 'lucide-react'
import SellerRace from '@/components/SellerRace'
import RaceForecastTable from '@/components/RaceForecastTable'
import PipelineVisualizer from '@/components/PipelineVisualizer'
import RichardDawkinsFooter from '@/components/RichardDawkinsFooter'
import { rankRaceItems } from '@/lib/raceRanking'
import { computeAdjustedMonthlyRaceLeadValue, computeSellerForecastRaceReliability } from '@/lib/forecastRaceAdjustments'

type Lead = Database['public']['Tables']['clientes']['Row']
type ForecastReliabilityMetric = Database['public']['Tables']['seller_forecast_reliability_metrics']['Row']
type History = {
    lead_id: number
    field_name: string
    old_value: string | null
    new_value: string | null
    created_at: string
}

const normalizeStage = (stage: string | null | undefined) => String(stage || '').trim().toLowerCase()
const isWonStage = (stage: string | null | undefined) => normalizeStage(stage).includes('ganad')
const isClosedStage = (stage: string | null | undefined) => normalizeStage(stage).includes('cerrado')
const isNegotiationStage = (stage: string | null | undefined) => normalizeStage(stage).includes('negoci')
const isCurrentUtcMonth = (isoLike: string | null | undefined) => {
    if (!isoLike) return false
    const d = new Date(isoLike)
    if (Number.isNaN(d.getTime())) return false
    const now = new Date()
    return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth()
}
const getRealCloseValue = (lead: Lead) => Number((lead as any).valor_real_cierre ?? lead.valor_estimado ?? 0)
const getRealCloseTimestamp = (lead: Lead) =>
    ((lead as any).closed_at_real as string | null)
    || (lead.forecast_scored_at as string | null)
    || (lead.created_at as string | null)

export default function AdminDashboard() {
    const [leads, setLeads] = useState<Lead[]>([])
    const [history, setHistory] = useState<History[]>([])
    const [reliabilityMetricsBySellerId, setReliabilityMetricsBySellerId] = useState<Record<string, ForecastReliabilityMetric>>({})
    const [loading, setLoading] = useState(true)
    const [supabase] = useState(() => createClient())

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true)
            const [{ data: leadData }, { data: histData }, { data: reliabilityData }] = await Promise.all([
                supabase.from('clientes').select('*'),
                (supabase.from('lead_history') as any).select('*').eq('field_name', 'probabilidad').order('created_at', { ascending: false }),
                (supabase.from('seller_forecast_reliability_metrics') as any).select('*')
            ])

            if (leadData) setLeads(leadData)
            if (histData) setHistory(histData as any)
            if (reliabilityData) {
                const nextMap: Record<string, ForecastReliabilityMetric> = {}
                ;(reliabilityData as ForecastReliabilityMetric[]).forEach((row) => {
                    if (row?.seller_id) nextMap[String(row.seller_id)] = row
                })
                setReliabilityMetricsBySellerId(nextMap)
            }
            setLoading(false)
        }
        fetchData()
    }, [supabase])

    // Metric Calculations (Shared with Forecast)
    const stats = useMemo(() => {
        const map: Record<string, {
            sellerId: string | null,
            name: string,
            historicalLeads: Lead[],
            activeLeads: Lead[],
            score: number,
            negotiationPipeline: number,
            raceRealClosedValue: number,
            raceForecastValue: number,
            raceForecastLeadCount: number,
            raceForecastAdjustedValue: number,
            raceForecastAdjustedReliability: number
        }> = {}

        // Baseline global win rate for L_base calculation (historical comparison)
        const closed = leads.filter(l => isClosedStage(l.etapa))
        const active = leads.filter(l => !isClosedStage(l.etapa))

        leads.forEach(lead => {
            const sellerKey = String(lead.owner_id || lead.owner_username || 'Unknown')
            const sellerName = lead.owner_username || 'Unknown'
            if (!map[sellerKey]) {
                map[sellerKey] = {
                    sellerId: lead.owner_id ? String(lead.owner_id) : null,
                    name: sellerName,
                    historicalLeads: [],
                    activeLeads: [],
                    score: 0,
                    negotiationPipeline: 0,
                    raceRealClosedValue: 0,
                    raceForecastValue: 0,
                    raceForecastLeadCount: 0,
                    raceForecastAdjustedValue: 0,
                    raceForecastAdjustedReliability: 0
                }
            }
            if (isClosedStage(lead.etapa)) map[sellerKey].historicalLeads.push(lead)
            else map[sellerKey].activeLeads.push(lead)
        })

        const sellers = Object.values(map).map(s => {
            // New Strict Reliability Algorithm (Quadratic + N Penalty)
            const scoredLeads = s.historicalLeads.map(l => {
                let p = 0
                let y = l.etapa === 'Cerrado Ganado' ? 1 : 0
                if (l.forecast_evaluated_probability !== null) {
                    p = l.forecast_evaluated_probability / 100
                    y = l.forecast_outcome ?? (l.etapa === 'Cerrado Ganado' ? 1 : 0)
                } else {
                    const h = history.filter(item => item.lead_id === l.id)[0]
                    if (h?.new_value) p = parseInt(h.new_value) / 100
                    else return null
                }
                return Math.pow(y - p, 2)
            }).filter(err => err !== null) as number[]

            const scoredN = scoredLeads.length
            const rawAcc = scoredN > 0 ? 1 - (scoredLeads.reduce((a, b) => a + b, 0) / scoredN) : 0
            const relScore = scoredN > 0 ? (rawAcc * (scoredN / (scoredN + 4))) * 100 : 0

            const negPipeline = s.activeLeads
                .filter(l => isNegotiationStage(l.etapa))
                .reduce((acc, l) => acc + ((l.probabilidad || 0) / 100 * (l.valor_estimado || 0)), 0)

            const negotiationLeads = s.activeLeads.filter((l) => isNegotiationStage(l.etapa))
            const raceForecastValue = negotiationLeads
                .reduce((acc, l) => acc + ((l.probabilidad || 0) / 100 * (l.valor_estimado || 0)), 0)
            const reliabilityMetrics = s.sellerId ? reliabilityMetricsBySellerId[String(s.sellerId)] : null
            const raceForecastAdjustedValue = negotiationLeads
                .reduce((acc, l) => acc + computeAdjustedMonthlyRaceLeadValue(l, reliabilityMetrics), 0)
            const raceForecastAdjustedReliability = computeSellerForecastRaceReliability(reliabilityMetrics)
            const raceRealClosedValue = s.historicalLeads
                .filter((l) => isWonStage(l.etapa) && isCurrentUtcMonth(getRealCloseTimestamp(l)))
                .reduce((acc, l) => acc + getRealCloseValue(l), 0)

            return {
                ...s,
                score: relScore,
                negotiationPipeline: negPipeline,
                raceRealClosedValue,
                raceForecastValue,
                raceForecastLeadCount: negotiationLeads.length,
                raceForecastAdjustedValue,
                raceForecastAdjustedReliability
            }
        }).sort((a, b) => b.raceRealClosedValue - a.raceRealClosedValue)

        const totalPipeline = active.reduce((acc, l) => acc + (l.valor_estimado || 0), 0)
        const adjustedForecast = sellers.reduce((acc, s) => acc + (s.negotiationPipeline * (s.score / 100)), 0)

        // Pipeline Stage Distribution
        const stages = ['Negociación', 'Cerrado Ganado', 'Cerrado Perdido']
        const funnel = stages.map(stage => ({
            stage,
            count: leads.filter(l => l.etapa === stage).length,
            value: leads.filter(l => l.etapa === stage).reduce((acc, l) => acc + (l.valor_estimado || 0), 0),
            color: stage.includes('Ganado') ? '#10B981' : stage.includes('Perdido') ? '#EF4444' : stage === 'Negociación' ? '#3B82F6' : '#94A3B8'
        }))

        return {
            sellers,
            totalPipeline,
            adjustedForecast,
            funnel,
            activeCount: active.length,
            dataWarnings: active.filter(l => !l.valor_estimado).length
        }
    }, [leads, history, reliabilityMetricsBySellerId])

    if (loading) return <div className='h-full flex items-center justify-center' style={{ background: 'transparent' }}><div className='animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600'></div></div>

    const teamGoal = Math.max(...stats.sellers.map(s => s.raceRealClosedValue)) * 1.5 || 1000000
    const rankedSellers = rankRaceItems(stats.sellers, (seller) => seller.raceRealClosedValue)

    return (
        <div className='min-h-full flex flex-col p-8 overflow-y-auto custom-scrollbar' style={{ background: 'transparent' }}>
            <div className='max-w-7xl mx-auto w-full space-y-8'>
                {/* Header */}
                <div className='flex justify-between items-center'>
                    <div className='space-y-1'>
                        <h1 className='text-3xl font-black text-[#0A1635] tracking-tighter flex items-center gap-3'>
                            <LayoutDashboard className='w-8 h-8 text-[#1700AC]' />
                            Dashboard Administrativo
                        </h1>
                        <p className='text-sm text-gray-500 font-medium'>Vista general del rendimiento comercial y pronósticos en tiempo real.</p>
                    </div>
                </div>

                {/* Hero Metrics */}
                <div className='grid grid-cols-1 md:grid-cols-4 gap-6'>
                    <div className='bg-white p-6 rounded-3xl border border-gray-100 shadow-sm'>
                        <label className='text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]'>Pipeline de Negocio</label>
                        <p className='text-3xl font-black text-[#0A1635] mt-2'>
                            ${stats.totalPipeline.toLocaleString('es-MX')}
                        </p>
                        <div className='flex items-center gap-1 mt-2 text-emerald-500'>
                            <TrendingUp className='w-3 h-3' />
                            <span className='text-[10px] font-bold'>{stats.activeCount} Leads Activos</span>
                        </div>
                    </div>

                    <div className='bg-[#1700AC] p-6 rounded-3xl border border-[#1700AC] shadow-xl relative overflow-hidden group'>
                        <div className='relative z-10'>
                            <label className='text-[10px] font-black text-white/50 uppercase tracking-[0.2em]'>Forecast Real (Adm)</label>
                            <p className='text-3xl font-black text-white mt-1'>
                                ${stats.adjustedForecast.toLocaleString('es-MX', { maximumFractionDigits: 0 })}
                            </p>
                            <p className='text-[10px] text-white/40 font-medium mt-1 leading-tight'>Ponderado por el score de confiabilidad histórico de los vendedores.</p>
                        </div>
                        <Zap className='absolute -right-4 -bottom-4 w-24 h-24 text-white/5 opacity-20 transform -rotate-12 transition-transform group-hover:scale-110' />
                    </div>

                    <div className='bg-white p-6 rounded-3xl border border-gray-100 shadow-sm'>
                        <label className='text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]'>Calidad de Datos</label>
                        <p className='text-3xl font-black text-[#0A1635] mt-2'>{stats.dataWarnings}</p>
                        <div className='flex items-center gap-1 mt-2 text-amber-500'>
                            <AlertCircle className='w-3 h-3' />
                            <span className='text-[10px] font-bold'>Leads sin valor estimado</span>
                        </div>
                    </div>

                    <div className='bg-white p-6 rounded-3xl border border-gray-100 shadow-sm'>
                        <label className='text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]'>Objetivo de Equipo</label>
                        <div className='mt-2 flex items-center justify-between'>
                            <p className='text-3xl font-black text-[#0A1635]'>{(stats.adjustedForecast / teamGoal * 100).toFixed(0)}%</p>
                            <Target className='w-6 h-6 text-gray-200' />
                        </div>
                        <div className='w-full h-1.5 bg-gray-100 rounded-full mt-3 overflow-hidden'>
                            <div className='h-full bg-[#1700AC]' style={{ width: `${(stats.adjustedForecast / teamGoal * 100)}%` }} />
                        </div>
                    </div>
                </div>

                {/* Main Content Grid */}
                <div className='grid grid-cols-1 xl:grid-cols-3 gap-8'>
                    <div className='xl:col-span-2 space-y-8'>
                        {/* The Race */}
                        <SellerRace
                            maxGoal={teamGoal}
                            sellers={stats.sellers.map(s => ({
                                name: s.name,
                                value: s.raceRealClosedValue,
                                percentage: (s.raceRealClosedValue / teamGoal) * 100,
                                reliability: s.score
                            }))}
                            forecastRace={{
                                maxGoal: teamGoal,
                                title: 'Carrera de Pronóstico Ajustado',
                                subtitle: 'Pronóstico mensual ajustado con confiabilidad de probabilidad, valor y fecha',
                                sellers: stats.sellers.map((s) => ({
                                    name: s.name,
                                    value: s.raceForecastAdjustedValue,
                                    percentage: (s.raceForecastAdjustedValue / teamGoal) * 100,
                                    reliability: s.raceForecastAdjustedReliability,
                                    rawValueBeforeAdjustment: s.raceForecastValue
                                }))
                            }}
                            subtitle='Cierres reales ganados del mes (fecha real de cierre) vs meta de equipo'
                        />

                        <RaceForecastTable
                            sellers={stats.sellers.map((s) => ({
                                name: s.name,
                                forecastValue: s.raceForecastValue,
                                activeNegotiationLeads: s.raceForecastLeadCount,
                                reliability: s.score
                            }))}
                        />

                        {/* Secondary Grid */}
                        <div className='grid grid-cols-1 md:grid-cols-2 gap-8'>
                            <div className='bg-white p-6 rounded-3xl border border-gray-100 shadow-sm'>
                                <div className='flex justify-between items-center mb-6'>
                                    <h3 className='font-black text-[#0A1635] text-sm uppercase tracking-wider'>Top Vendedores (Real)</h3>
                                    <Users className='w-4 h-4 text-gray-300' />
                                </div>
                                <div className='space-y-4'>
                                    {rankedSellers.slice(0, 5).map((entry) => {
                                        const s = entry.item
                                        return (
                                        <div key={s.name} className='flex items-center justify-between group'>
                                            <div className='flex items-center gap-3'>
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs ${entry.medal === 'gold' ? 'bg-amber-100 text-amber-600' : entry.medal === 'silver' ? 'bg-slate-100 text-slate-500' : entry.medal === 'bronze' ? 'bg-orange-100 text-orange-600' : 'bg-gray-50 text-gray-400'}`}>
                                                    {entry.rank}
                                                </div>
                                                <span className='font-bold text-sm text-[#0A1635]'>{s.name}</span>
                                            </div>
                                            <div className='text-right'>
                                                <p className='text-xs font-black text-[#1700AC]'>${s.raceRealClosedValue.toLocaleString()}</p>
                                                <p className='text-[8px] font-bold text-gray-400 uppercase'>Cerrado real</p>
                                            </div>
                                        </div>
                                        )
                                    })}
                                </div>
                                <button className='w-full mt-6 py-3 border border-gray-100 rounded-2xl text-[10px] font-black text-gray-400 uppercase tracking-widest hover:bg-gray-50 transition-colors flex items-center justify-center gap-2'>
                                    Ver Detalle Completo <ChevronRight className='w-3 h-3' />
                                </button>
                            </div>

                            <div className='bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-center items-center text-center space-y-4'>
                                <div className='w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center'>
                                    <Search className='w-8 h-8 text-blue-500' />
                                </div>
                                <div className='space-y-1'>
                                    <h4 className='font-black text-[#0A1635] text-base'>Filtros de Análisis</h4>
                                    <p className='text-[10px] text-gray-400 font-medium px-8'>Próximamente: Podrás filtrar esta dashboard por fechas específicas y regiones.</p>
                                </div>
                                <button className='px-6 py-2 bg-gray-50 rounded-xl text-[10px] font-black text-gray-400 uppercase tracking-tight flex items-center gap-2'>
                                    <Filter className='w-3 h-3' /> Configurar
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Funnel Visualizer */}
                    <div className='xl:col-span-1'>
                        <PipelineVisualizer data={stats.funnel} />
                    </div>
                </div>
                <RichardDawkinsFooter />
            </div>
        </div>
    )
}
