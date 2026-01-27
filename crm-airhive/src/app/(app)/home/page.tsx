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

    if (loading && leads.length === 0) return <div className='h-full flex items-center justify-center' style={{ background: 'var(--background)' }}><div className='animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600'></div></div>

    const teamGoal = Math.max(...stats.sellers.map(s => s.negotiationPipeline)) * 1.5 || 1000000

    return (
        <div className='h-full flex flex-col p-8 overflow-y-auto' style={{ background: 'var(--background)' }}>
            <div className='max-w-7xl mx-auto w-full space-y-10'>
                {/* Dynamic Welcome Header */}
                <div className='relative overflow-hidden bg-gradient-to-br from-[#0F2A44] via-[#1700AC] to-[#2048FF] p-10 rounded-[40px] shadow-2xl shadow-blue-900/20 text-white group'>
                    <div className='absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -mr-48 -mt-48 blur-3xl transition-all duration-700 group-hover:scale-110'></div>
                    <div className='absolute bottom-0 left-0 w-64 h-64 bg-blue-400/10 rounded-full -ml-32 -mb-32 blur-2xl'></div>

                    <div className='relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6'>
                        <div className='space-y-2'>
                            <h1 className='text-5xl font-black tracking-tight flex items-center gap-4'>
                                ¡Bienvenido, {username}! 🚀
                            </h1>
                            <p className='text-blue-100/80 text-lg font-medium max-w-lg leading-relaxed'>
                                El pulso de AirHive está bajo tu control. Aquí tienes la visión estratégica del rendimiento actual.
                            </p>
                        </div>
                        <div className='flex gap-3'>
                            <div className='bg-white/10 backdrop-blur-md px-6 py-4 rounded-3xl border border-white/10'>
                                <p className='text-[10px] font-black uppercase tracking-widest text-blue-200 mb-1'>Pipeline Total</p>
                                <p className='text-2xl font-black'>${stats.totalPipeline.toLocaleString()}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* KPI Bar */}
                <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
                    <div className='bg-purple-50 p-8 rounded-[32px] border-2 border-purple-100 shadow-sm transition-all hover:shadow-md group'>
                        <div className='flex items-center justify-between mb-4'>
                            <label className='text-[10px] font-black uppercase tracking-widest text-purple-600'>Forecast Real (Adjusted)</label>
                            <Zap className='w-5 h-5 text-purple-500 group-hover:animate-pulse' />
                        </div>
                        <p className='text-4xl font-black text-purple-900'>
                            ${stats.adjustedForecast.toLocaleString('es-MX', { maximumFractionDigits: 0 })}
                        </p>
                        <p className='text-[10px] text-purple-400 font-bold mt-2 uppercase tracking-tight'>Ponderado por score histórico</p>
                    </div>

                    <div className='bg-amber-50 p-8 rounded-[32px] border-2 border-amber-100 shadow-sm transition-all hover:shadow-md group'>
                        <div className='flex items-center justify-between mb-4'>
                            <label className='text-[10px] font-black uppercase tracking-widest text-amber-600'>Calidad de Datos</label>
                            <AlertCircle className='w-5 h-5 text-amber-500 group-hover:shake' />
                        </div>
                        <p className='text-4xl font-black text-amber-900'>{stats.dataWarnings}</p>
                        <p className='text-[10px] text-amber-400 font-bold mt-2 uppercase tracking-tight'>Leads sin valor estimado</p>
                    </div>

                    <div className='bg-emerald-50 p-8 rounded-[32px] border-2 border-emerald-100 shadow-sm transition-all hover:shadow-md group'>
                        <div className='flex items-center justify-between mb-4'>
                            <label className='text-[10px] font-black uppercase tracking-widest text-emerald-600'>Progreso Semanal</label>
                            <Target className='w-5 h-5 text-emerald-500' />
                        </div>
                        <div className='flex items-end gap-2'>
                            <p className='text-4xl font-black text-emerald-900'>{(stats.adjustedForecast / teamGoal * 100).toFixed(0)}%</p>
                            <p className='text-xs font-bold text-emerald-600 mb-2'>de la meta</p>
                        </div>
                        <div className='w-full h-2 bg-emerald-200/50 rounded-full mt-3 overflow-hidden'>
                            <div className='h-full bg-emerald-500' style={{ width: `${Math.min(100, (stats.adjustedForecast / teamGoal * 100))}%` }} />
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
                        <div className='bg-white p-8 rounded-[40px] border border-gray-100 shadow-xl'>
                            <div className='flex justify-between items-center mb-8 pb-4 border-b border-gray-50'>
                                <h3 className='font-black text-xs uppercase tracking-[0.2em] text-gray-400 flex items-center gap-2'>
                                    🏆 Ranking de Confiabilidad
                                </h3>
                                <Users className='w-4 h-4 text-gray-300' />
                            </div>
                            <div className='grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6'>
                                {stats.sellers.slice(0, 6).map((s, i) => (
                                    <div key={s.name} className='flex items-center justify-between p-4 rounded-2xl hover:bg-blue-50/50 transition-all group'>
                                        <div className='flex items-center gap-4'>
                                            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shadow-sm transition-transform group-hover:scale-110 ${i === 0 ? 'bg-amber-100 text-amber-600 border border-amber-200' :
                                                i === 1 ? 'bg-slate-100 text-slate-500 border border-slate-200' :
                                                    i === 2 ? 'bg-orange-100 text-orange-600 border border-orange-200' :
                                                        'bg-gray-50 text-gray-400 border border-gray-100'
                                                }`}>
                                                {i + 1}
                                            </div>
                                            <div>
                                                <p className='font-black text-[#0A1635] text-sm group-hover:text-[#1700AC] transition-colors'>{s.name}</p>
                                                <div className='flex items-center gap-2'>
                                                    <div className='w-12 h-1 bg-gray-100 rounded-full overflow-hidden'>
                                                        <div className='h-full bg-blue-500' style={{ width: `${s.score}%` }} />
                                                    </div>
                                                    <span className='text-[9px] font-black text-blue-500'>{s.score.toFixed(0)}% Score</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className='text-right'>
                                            <p className='text-xs font-black text-[#0A1635]'>${(s.negotiationPipeline * (s.score / 100)).toLocaleString()}</p>
                                            <p className='text-[8px] font-bold uppercase text-gray-400'>Forecast Adj</p>
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
                        <div className='bg-gradient-to-br from-[#0F2A44] to-[#0A1635] p-8 rounded-[40px] text-white overflow-hidden relative'>
                            <div className='absolute -right-4 -bottom-4 w-24 h-24 bg-white/5 rounded-full'></div>
                            <h4 className='text-xs font-black uppercase tracking-[0.2em] mb-4 text-blue-300'>💡 Tip de Auditoría</h4>
                            <p className='text-sm font-medium leading-relaxed opacity-90'>
                                Hay <strong>{stats.dataWarnings} leads</strong> sin valor estimado. Pedir a los vendedores que actualicen estos montos mejorará la precisión del forecast en un <strong>{(stats.dataWarnings / leads.length * 100).toFixed(0)}%</strong>.
                            </p>
                            <button className='mt-6 w-full py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all'>
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
            <div className='h-full flex items-center justify-center' style={{ background: 'var(--background)' }}>
                <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600'></div>
            </div>
        )
    }

    return (
        <div className='h-full flex flex-col p-8 overflow-y-auto' style={{ background: 'var(--background)' }}>
            <div className='max-w-7xl mx-auto w-full space-y-8'>
                {/* Welcome Header */}
                <div className='bg-gradient-to-r from-[#1700AC] to-[#2048FF] p-8 rounded-3xl shadow-xl text-white'>
                    <h1 className='text-4xl font-black mb-2'>
                        ¡Bienvenido, {username}! 🚀
                    </h1>
                    <p className='text-white/80 text-lg'>
                        Aquí está tu resumen del día
                    </p>
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
                                    className='p-4 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors border-2 border-blue-200'
                                >
                                    <p className='font-bold text-blue-900 mb-1'>Ver Leads</p>
                                    <p className='text-xs text-blue-700'>Gestiona tu pipeline</p>
                                </a>
                                <a
                                    href='/calendario'
                                    className='p-4 bg-purple-50 rounded-xl hover:bg-purple-100 transition-colors border-2 border-purple-200'
                                >
                                    <p className='font-bold text-purple-900 mb-1'>Calendario</p>
                                    <p className='text-xs text-purple-700'>Ver todas las juntas</p>
                                </a>
                                <a
                                    href='/empresas'
                                    className='p-4 bg-emerald-50 rounded-xl hover:bg-emerald-100 transition-colors border-2 border-emerald-200'
                                >
                                    <p className='font-bold text-emerald-900 mb-1'>Empresas</p>
                                    <p className='text-xs text-emerald-700'>Gestionar cuentas</p>
                                </a>
                                <a
                                    href='/admin/forecast'
                                    className='p-4 bg-amber-50 rounded-xl hover:bg-amber-100 transition-colors border-2 border-amber-200'
                                >
                                    <p className='font-bold text-amber-900 mb-1'>Mi Score</p>
                                    <p className='text-xs text-amber-700'>Ver confiabilidad</p>
                                </a>
                            </div>
                        </div>

                        <div className='bg-gradient-to-r from-blue-50 to-purple-50 p-6 rounded-2xl border-2 border-blue-200'>
                            <h3 className='text-lg font-bold text-[#0F2A44] mb-2'>
                                💡 Tip del Día
                            </h3>
                            <p className='text-sm text-gray-700'>
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
    if (auth.loading && !auth.loggedIn) return <div className='h-full flex items-center justify-center' style={{ background: 'var(--background)' }}><div className='animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600'></div></div>

    if (isAdmin) {
        return <AdminDashboardView username={auth.username} />
    }

    return <SellerHomeView username={auth.username} />
}
