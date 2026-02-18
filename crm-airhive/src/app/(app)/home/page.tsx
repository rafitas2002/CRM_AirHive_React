'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { Database } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import {
    LayoutDashboard,
    TrendingUp,
    Target,
    AlertCircle,
    Users,
    Trophy,
    ChevronRight,
    Search,
    Filter,
    Zap
} from 'lucide-react'
import SellerRace from '@/components/SellerRace'
import PipelineVisualizer from '@/components/PipelineVisualizer'
import UpcomingMeetingsWidget from '@/components/UpcomingMeetingsWidget'
import MyTasksWidget from '@/components/MyTasksWidget'

type Lead = Database['public']['Tables']['clientes']['Row']
type History = {
    lead_id: number
    field_name: string
    old_value: string | null
    new_value: string | null
    created_at: string
}

function AdminDashboardView({ username }: { username: string }) {
    const [leads, setLeads] = useState<Lead[]>([])
    const [history, setHistory] = useState<History[]>([])
    const [loading, setLoading] = useState(true)
    const [supabase] = useState(() => createClient())

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true)
            const { data: leadData } = await supabase.from('clientes').select('*')
            const { data: histData } = await (supabase.from('lead_history') as any).select('*').eq('field_name', 'probabilidad').order('created_at', { ascending: false })

            if (leadData) setLeads(leadData)
            if (histData) setHistory(histData as any)
            setLoading(false)
        }
        fetchData()
    }, [supabase])

    const stats = useMemo(() => {
        const map: Record<string, {
            name: string,
            historicalLeads: Lead[],
            activeLeads: Lead[],
            score: number,
            negotiationPipeline: number
        }> = {}

        const closed = leads.filter(l => l.etapa?.toLowerCase().includes('cerrado'))
        const active = leads.filter(l => !l.etapa?.toLowerCase().includes('cerrado'))

        leads.forEach(lead => {
            const seller = lead.owner_username || 'Unknown'
            if (!map[seller]) map[seller] = { name: seller, historicalLeads: [], activeLeads: [], score: 0, negotiationPipeline: 0 }
            if (lead.etapa?.toLowerCase().includes('cerrado')) map[seller].historicalLeads.push(lead)
            else map[seller].activeLeads.push(lead)
        })

        const sellers = Object.values(map).map(s => {
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
                .filter(l => l.etapa === 'Negociación')
                .reduce((acc, l) => acc + ((l.probabilidad || 0) / 100 * (l.valor_estimado || 0)), 0)

            return { ...s, score: relScore, negotiationPipeline: negPipeline }
        }).sort((a, b) => b.negotiationPipeline - a.negotiationPipeline)

        const totalPipeline = active.reduce((acc, l) => acc + (l.valor_estimado || 0), 0)
        const adjustedForecast = sellers.reduce((acc, s) => acc + (s.negotiationPipeline * (s.score / 100)), 0)

        const stages = ['Prospección', 'Negociación', 'Cerrado Ganado', 'Cerrado Perdido']
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
    }, [leads, history])

    if (loading && leads.length === 0) return <div className='h-full flex items-center justify-center' style={{ background: 'transparent' }}><div className='animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600'></div></div>

    const teamGoal = Math.max(...stats.sellers.map(s => s.negotiationPipeline)) * 1.5 || 1000000
    const goalProgress = Math.min(100, (stats.adjustedForecast / teamGoal) * 100)
    const auditImpact = leads.length > 0 ? (stats.dataWarnings / leads.length * 100) : 0

    return (
        <div className='h-full flex flex-col p-8 overflow-y-auto' style={{ background: 'transparent' }}>
            <div className='max-w-7xl mx-auto w-full space-y-10'>
                {/* Welcome Header - Unified CRM Design */}
                <div className='relative overflow-hidden p-8 md:p-10 rounded-[40px] border shadow-xl' style={{ background: 'var(--home-hero-bg)', borderColor: 'var(--home-hero-border)' }}>
                    <div className='absolute -top-24 -right-16 w-80 h-80 rounded-full blur-3xl opacity-30 pointer-events-none' style={{ background: 'var(--home-hero-glow)' }} />
                    <div className='absolute -bottom-24 -left-20 w-72 h-72 rounded-full blur-3xl opacity-15 pointer-events-none' style={{ background: 'var(--home-hero-glow)' }} />
                    <div className='absolute inset-0 pointer-events-none opacity-55' style={{ background: 'linear-gradient(125deg, transparent 0%, rgba(255,255,255,0.1) 38%, transparent 75%)' }} />

                    <div className='relative z-10 grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-8 items-center'>
                        <div className='space-y-5'>
                            <div className='inline-flex items-center gap-2.5 px-4 py-2 rounded-2xl border shadow-sm' style={{ background: 'var(--home-hero-chip-bg)', borderColor: 'var(--home-hero-chip-border)' }}>
                                <LayoutDashboard size={14} style={{ color: 'var(--home-hero-chip-text)' }} />
                                <span className='text-[10px] font-black uppercase tracking-[0.2em]' style={{ color: 'var(--home-hero-chip-text)' }}>
                                    Panel de Control AirHive
                                </span>
                            </div>

                            <div className='space-y-3'>
                                <h1 className='text-4xl md:text-6xl font-black tracking-tight leading-none' style={{ color: 'var(--home-hero-text)' }}>
                                    Bienvenido, {username}
                                </h1>
                                <p className='text-base md:text-2xl font-semibold max-w-3xl leading-relaxed' style={{ color: 'var(--home-hero-muted)' }}>
                                    Vista ejecutiva de operación comercial con enfoque en pipeline, calidad de datos y ritmo de cierre.
                                </p>
                            </div>

                            <div className='flex flex-wrap items-center gap-3 pt-1'>
                                <div className='px-4 py-2 rounded-xl border backdrop-blur-sm' style={{ background: 'var(--home-hero-chip-bg)', borderColor: 'var(--home-hero-chip-border)' }}>
                                    <p className='text-[9px] font-black uppercase tracking-[0.2em]' style={{ color: 'var(--home-hero-muted)' }}>Leads Activos</p>
                                    <p className='text-xl font-black tabular-nums' style={{ color: 'var(--home-hero-text)' }}>{stats.activeCount}</p>
                                </div>
                                <div className='px-4 py-2 rounded-xl border backdrop-blur-sm' style={{ background: 'var(--home-hero-chip-bg)', borderColor: 'var(--home-hero-chip-border)' }}>
                                    <p className='text-[9px] font-black uppercase tracking-[0.2em]' style={{ color: 'var(--home-hero-muted)' }}>Sin Valor</p>
                                    <p className='text-xl font-black tabular-nums' style={{ color: 'var(--home-hero-text)' }}>{stats.dataWarnings}</p>
                                </div>
                            </div>
                        </div>

                        <div className='relative w-full xl:w-[380px] rounded-[30px] border p-5 md:p-6 shadow-lg overflow-hidden' style={{ background: 'var(--home-hero-panel-bg)', borderColor: 'var(--home-hero-panel-border)' }}>
                            <div className='absolute inset-x-0 top-0 h-px opacity-60' style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)' }} />
                            <div className='flex items-center justify-between mb-4'>
                                <p className='text-[10px] font-black uppercase tracking-[0.2em]' style={{ color: 'var(--home-hero-muted)' }}>
                                    Pipeline Estratégico
                                </p>
                                <TrendingUp size={17} style={{ color: 'var(--home-hero-text)' }} />
                            </div>
                            <p className='text-4xl md:text-5xl font-black tracking-tight tabular-nums mb-5' style={{ color: 'var(--home-hero-text)' }}>
                                ${stats.totalPipeline.toLocaleString('es-MX')}
                            </p>

                            <div className='space-y-2'>
                                <div className='flex items-center justify-between'>
                                    <span className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--home-hero-muted)' }}>
                                        Avance del forecast
                                    </span>
                                    <span className='text-sm font-black tabular-nums' style={{ color: 'var(--home-hero-text)' }}>
                                        {goalProgress.toFixed(0)}%
                                    </span>
                                </div>
                                <div className='h-2.5 rounded-full overflow-hidden' style={{ background: 'rgba(15, 23, 42, 0.65)' }}>
                                    <div
                                        className='h-full rounded-full transition-all duration-700'
                                        style={{ width: `${goalProgress}%`, background: 'linear-gradient(90deg, #60a5fa 0%, #22d3ee 100%)' }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* KPI Bar */}
                <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
                    <div className='p-8 rounded-[32px] border-2 shadow-sm transition-all hover:shadow-md group' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                        <div className='flex items-center justify-between mb-4'>
                            <label className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)' }}>Forecast Real (Adjusted)</label>
                            <Zap className='w-5 h-5 text-purple-500 group-hover:animate-pulse' />
                        </div>
                        <p className='text-4xl font-black' style={{ color: 'var(--text-primary)' }}>
                            ${stats.adjustedForecast.toLocaleString('es-MX', { maximumFractionDigits: 0 })}
                        </p>
                        <p className='text-[10px] font-bold mt-2 uppercase tracking-tight' style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>Ponderado por score histórico</p>
                    </div>

                    <div className='p-8 rounded-[32px] border-2 shadow-sm transition-all hover:shadow-md group' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                        <div className='flex items-center justify-between mb-4'>
                            <label className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)' }}>Calidad de Datos</label>
                            <AlertCircle className='w-5 h-5 text-amber-500 group-hover:shake' />
                        </div>
                        <p className='text-4xl font-black' style={{ color: 'var(--text-primary)' }}>{stats.dataWarnings}</p>
                        <p className='text-[10px] font-bold mt-2 uppercase tracking-tight' style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>Leads sin valor estimado</p>
                    </div>

                    <div className='p-8 rounded-[32px] border-2 shadow-sm transition-all hover:shadow-md group' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                        <div className='flex items-center justify-between mb-4'>
                            <label className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)' }}>Progreso Semanal</label>
                            <Target className='w-5 h-5 text-emerald-500' />
                        </div>
                        <div className='flex items-end gap-2'>
                            <p className='text-4xl font-black' style={{ color: 'var(--text-primary)' }}>{goalProgress.toFixed(0)}%</p>
                            <p className='text-xs font-bold text-emerald-600 mb-2'>de la meta</p>
                        </div>
                        <div className='w-full h-2 rounded-full mt-3 overflow-hidden' style={{ background: 'var(--hover-bg)' }}>
                            <div className='h-full bg-emerald-500' style={{ width: `${goalProgress}%` }} />
                        </div>
                    </div>
                </div>

                {/* Main Content Sections */}
                <div className='grid grid-cols-1 xl:grid-cols-3 gap-8'>
                    {/* Left & Middle: Sales Performance */}
                    <div className='xl:col-span-2 space-y-8'>
                        {/* Personal Agenda - New for Admins */}
                        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                            <UpcomingMeetingsWidget />
                            <MyTasksWidget />
                        </div>

                        <SellerRace
                            maxGoal={teamGoal}
                            sellers={stats.sellers.map(s => ({
                                name: s.name,
                                value: s.negotiationPipeline,
                                percentage: (s.negotiationPipeline / teamGoal) * 100,
                                reliability: s.score
                            }))}
                        />

                        {/* Top Performance Table Redesigned */}
                        <div className='rounded-[40px] border shadow-xl overflow-hidden' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                            <div className='flex justify-between items-center px-8 py-5 border-b' style={{ background: 'var(--table-header-bg)', borderColor: 'var(--card-border)' }}>
                                <h3 className='font-black text-[10px] uppercase tracking-[0.2em] flex items-center gap-2' style={{ color: 'var(--text-secondary)' }}>
                                    <Trophy size={14} strokeWidth={2.2} className='text-amber-500' />
                                    Ranking de Confiabilidad
                                </h3>
                                <Users className='w-4 h-4' style={{ color: 'var(--text-secondary)', opacity: 0.5 }} />
                            </div>
                            <div className='p-4 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4'>
                                {stats.sellers.slice(0, 6).map((s, i) => (
                                    <div key={s.name} className='flex items-center justify-between p-4 rounded-2xl transition-all group' style={{ background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.background = 'var(--hover-bg)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                                        <div className='flex items-center gap-4'>
                                            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shadow-sm transition-transform group-hover:scale-110 ${i === 0 ? 'bg-amber-500/20 text-amber-600 border border-amber-500/30' :
                                                i === 1 ? 'bg-slate-500/20 text-slate-500 border border-slate-500/30' :
                                                    i === 2 ? 'bg-orange-500/20 text-orange-600 border border-orange-500/30' :
                                                        'bg-gray-500/10 text-gray-500 border border-gray-500/20'
                                                }`}>
                                                {i + 1}
                                            </div>
                                            <div>
                                                <p className='font-black text-sm group-hover:text-[#1700AC] transition-colors' style={{ color: 'var(--text-primary)' }}>{s.name}</p>
                                                <div className='flex items-center gap-2'>
                                                    <div className='w-12 h-1 rounded-full overflow-hidden' style={{ background: 'var(--hover-bg)' }}>
                                                        <div className='h-full bg-blue-500' style={{ width: `${s.score}%` }} />
                                                    </div>
                                                    <span className='text-[9px] font-black text-blue-500'>{s.score.toFixed(0)}% Score</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className='text-right'>
                                            <p className='text-xs font-black' style={{ color: 'var(--text-primary)' }}>${(s.negotiationPipeline * (s.score / 100)).toLocaleString()}</p>
                                            <p className='text-[8px] font-bold uppercase' style={{ color: 'var(--text-secondary)' }}>Forecast Adj</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right: Insights & Pipeline */}
                    <div className='xl:col-span-1 space-y-8'>
                        <PipelineVisualizer data={stats.funnel} />

                        {/* Audit Recommendation Card */}
                        <div className='p-8 rounded-[40px] overflow-hidden relative border shadow-sm' style={{ background: 'var(--home-audit-bg)', borderColor: 'var(--home-audit-border)' }}>
                            <div className='absolute -right-4 -bottom-4 w-24 h-24 rounded-full opacity-20' style={{ background: 'var(--home-audit-title)' }}></div>
                            <h4 className='text-xs font-black uppercase tracking-[0.2em] mb-4 flex items-center gap-2' style={{ color: 'var(--home-audit-title)' }}>
                                <AlertCircle size={14} />
                                Tip de Auditoría
                            </h4>
                            <p className='text-sm font-medium leading-relaxed' style={{ color: 'var(--home-audit-text)' }}>
                                Hay <strong>{stats.dataWarnings} leads</strong> sin valor estimado. Pedir a los vendedores que actualicen estos montos mejorará la precisión del forecast en un <strong>{auditImpact.toFixed(0)}%</strong>.
                            </p>
                            <button
                                className='mt-6 w-full py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:brightness-110'
                                style={{
                                    background: 'var(--home-audit-button-bg)',
                                    border: '1px solid var(--home-audit-button-border)',
                                    color: 'var(--home-audit-button-text)'
                                }}
                            >
                                Notificar a Equipo
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

function SellerHomeView({ username }: { username: string }) {
    const [supabase] = useState(() => createClient())
    const [stats, setStats] = useState({ activeLeads: 0, negotiationLeads: 0, totalValue: 0 })
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchStats = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data: leads } = await (supabase
                .from('clientes') as any)
                .select('*')
                .eq('owner_id', user.id)

            if (leads) {
                const active = leads.filter((l: any) => !l.etapa?.toLowerCase().includes('cerrado'))
                const negotiation = leads.filter((l: any) => l.etapa === 'Negociación')
                const totalValue = negotiation.reduce((acc: number, l: any) => acc + ((l.probabilidad || 0) / 100 * (l.valor_estimado || 0)), 0)

                setStats({
                    activeLeads: active.length,
                    negotiationLeads: negotiation.length,
                    totalValue
                })
            }
            setLoading(false)
        }
        fetchStats()
    }, [supabase])

    if (loading) {
        return (
            <div className='h-full flex items-center justify-center' style={{ background: 'transparent' }}>
                <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600'></div>
            </div>
        )
    }

    return (
        <div className='h-full flex flex-col p-8 overflow-y-auto' style={{ background: 'transparent' }}>
            <div className='max-w-7xl mx-auto w-full space-y-8'>
                {/* Welcome Header */}
                <div className='relative overflow-hidden p-8 rounded-[34px] border shadow-xl' style={{ background: 'var(--home-hero-bg)', borderColor: 'var(--home-hero-border)' }}>
                    <div className='absolute -top-20 -right-12 w-64 h-64 rounded-full blur-3xl opacity-30 pointer-events-none' style={{ background: 'var(--home-hero-glow)' }} />
                    <div className='absolute inset-0 pointer-events-none opacity-40' style={{ background: 'linear-gradient(120deg, transparent 0%, rgba(32,72,255,0.08) 45%, transparent 80%)' }} />

                    <div className='relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6'>
                        <div className='space-y-3'>
                            <div className='inline-flex items-center gap-2.5 px-3.5 py-2 rounded-2xl border' style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}>
                                <LayoutDashboard size={14} style={{ color: 'var(--accent-secondary)' }} />
                                <span className='text-[10px] font-black uppercase tracking-[0.2em]' style={{ color: 'var(--text-secondary)' }}>
                                    Resumen de operación
                                </span>
                            </div>

                            <h1 className='text-4xl font-black tracking-tight leading-none' style={{ color: 'var(--text-primary)' }}>
                                Bienvenido, {username}
                            </h1>
                            <p className='text-lg font-semibold' style={{ color: 'var(--text-secondary)' }}>
                                Aquí tienes tu estado comercial del día.
                            </p>
                        </div>

                        <div className='grid grid-cols-2 gap-3 min-w-[300px]'>
                            <div className='rounded-2xl border px-4 py-3' style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}>
                                <p className='text-[9px] font-black uppercase tracking-[0.2em]' style={{ color: 'var(--text-secondary)' }}>Activos</p>
                                <p className='text-2xl font-black tabular-nums' style={{ color: 'var(--text-primary)' }}>{stats.activeLeads}</p>
                            </div>
                            <div className='rounded-2xl border px-4 py-3' style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}>
                                <p className='text-[9px] font-black uppercase tracking-[0.2em]' style={{ color: 'var(--text-secondary)' }}>Negociación</p>
                                <p className='text-2xl font-black tabular-nums' style={{ color: 'var(--accent-secondary)' }}>{stats.negotiationLeads}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Stats Cards */}
                <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
                    <div className='p-6 rounded-2xl shadow-sm border' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                        <label className='text-xs font-bold uppercase tracking-wider' style={{ color: 'var(--text-secondary)' }}>Leads Activos</label>
                        <p className='text-4xl font-black mt-2' style={{ color: 'var(--text-primary)' }}>{stats.activeLeads}</p>
                        <p className='text-xs mt-1' style={{ color: 'var(--text-secondary)' }}>En tu pipeline</p>
                    </div>

                    <div className='p-6 rounded-2xl shadow-sm border' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                        <label className='text-xs font-bold uppercase tracking-wider' style={{ color: 'var(--text-secondary)' }}>En Negociación</label>
                        <p className='text-4xl font-black text-amber-600 mt-2'>{stats.negotiationLeads}</p>
                        <p className='text-xs mt-1' style={{ color: 'var(--text-secondary)' }}>Requieren seguimiento</p>
                    </div>

                    <div className='p-6 rounded-2xl shadow-sm border' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                        <label className='text-xs font-bold uppercase tracking-wider' style={{ color: 'var(--text-secondary)' }}>Forecast Ponderado</label>
                        <p className='text-4xl font-black text-emerald-600 mt-2'>
                            ${stats.totalValue.toLocaleString('es-MX', { maximumFractionDigits: 0 })}
                        </p>
                        <p className='text-xs mt-1' style={{ color: 'var(--text-secondary)' }}>Valor esperado</p>
                    </div>
                </div>

                {/* Main Content Grid */}
                <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
                    {/* Left Column - Upcoming Meetings */}
                    <div className='lg:col-span-1'>
                        <UpcomingMeetingsWidget />
                    </div>

                    {/* Right Column - Quick Actions */}
                    <div className='lg:col-span-2 space-y-6'>
                        <div className='p-6 rounded-2xl shadow-sm border' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                            <h2 className='text-lg font-bold mb-4' style={{ color: 'var(--text-primary)' }}>
                                🎯 Acciones Rápidas
                            </h2>
                            <div className='grid grid-cols-2 gap-4'>
                                <a
                                    href='/clientes'
                                    className='p-4 rounded-xl transition-all border-2 hover:scale-105'
                                    style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}
                                >
                                    <p className='font-bold mb-1 text-blue-600'>📊 Ver Leads</p>
                                    <p className='text-xs' style={{ color: 'var(--text-secondary)' }}>Gestiona tu pipeline</p>
                                </a>
                                <a
                                    href='/calendario'
                                    className='p-4 rounded-xl transition-all border-2 hover:scale-105'
                                    style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}
                                >
                                    <p className='font-bold mb-1 text-purple-600'>📅 Calendario</p>
                                    <p className='text-xs' style={{ color: 'var(--text-secondary)' }}>Ver todas las juntas</p>
                                </a>
                                <a
                                    href='/empresas'
                                    className='p-4 rounded-xl transition-all border-2 hover:scale-105'
                                    style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}
                                >
                                    <p className='font-bold mb-1 text-emerald-600'>🏢 Empresas</p>
                                    <p className='text-xs' style={{ color: 'var(--text-secondary)' }}>Gestionar cuentas</p>
                                </a>
                                <a
                                    href='/tareas'
                                    className='p-4 rounded-xl transition-all border-2 hover:scale-105'
                                    style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}
                                >
                                    <p className='font-bold mb-1 text-amber-600'>✅ Tareas</p>
                                    <p className='text-xs' style={{ color: 'var(--text-secondary)' }}>Seguimiento diario</p>
                                </a>
                            </div>
                        </div>

                        <div className='p-6 rounded-2xl border-2' style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}>
                            <h3 className='text-lg font-bold mb-2' style={{ color: 'var(--text-primary)' }}>
                                💡 Tip del Día
                            </h3>
                            <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>
                                Recuerda actualizar la probabilidad de cierre de tus leads en <strong>Negociación</strong> antes de cada junta.
                                El sistema congelará automáticamente el pronóstico al inicio de la reunión.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default function HomePage() {
    const auth = useAuth()
    const isAdmin = auth.profile?.role === 'admin'

    // Only block if we are loading AND don't have a session
    if (auth.loading && !auth.loggedIn) return <div className='h-full flex items-center justify-center' style={{ background: 'transparent' }}><div className='animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600'></div></div>

    if (isAdmin) {
        return <AdminDashboardView username={auth.username} />
    }

    return <SellerHomeView username={auth.username} />
}
