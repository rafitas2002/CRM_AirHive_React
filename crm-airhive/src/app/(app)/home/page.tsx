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

type Lead = Database['public']['Tables']['clientes']['Row']
type History = {
    lead_id: number
    field_name: string
    old_value: string | null
    new_value: string | null
    created_at: string
}

function AdminDashboardView() {
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

    if (loading && leads.length === 0) return <div className='h-full flex items-center justify-center bg-[#f8fafc]'><div className='animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600'></div></div>

    const teamGoal = Math.max(...stats.sellers.map(s => s.negotiationPipeline)) * 1.5 || 1000000

    return (
        <div className='h-full flex flex-col p-8 bg-[#F0F2F5] overflow-y-auto'>
            <div className='max-w-7xl mx-auto w-full space-y-8'>
                <div className='flex justify-between items-center'>
                    <div className='space-y-1'>
                        <h1 className='text-3xl font-black text-[#0A1635] tracking-tighter flex items-center gap-3'>
                            <LayoutDashboard className='w-8 h-8 text-[#1700AC]' />
                            Dashboard Ejecutivo
                        </h1>
                        <p className='text-sm text-gray-500 font-medium'>Control maestro del rendimiento comercial y calidad de datos.</p>
                    </div>
                </div>

                <div className='grid grid-cols-1 md:grid-cols-4 gap-6'>
                    <div className='bg-white p-6 rounded-3xl border border-gray-100 shadow-sm'>
                        <label className='text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]'>Pipeline Seleccionado</label>
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
                            <p className='text-[10px] text-white/40 font-medium mt-1 leading-tight'>Ponderado por el score de confiabilidad histórico.</p>
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
                        <label className='text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]'>Objetivo Semanal</label>
                        <div className='mt-2 flex items-center justify-between'>
                            <p className='text-3xl font-black text-[#0A1635]'>{(stats.adjustedForecast / teamGoal * 100).toFixed(0)}%</p>
                            <Target className='w-6 h-6 text-gray-200' />
                        </div>
                        <div className='w-full h-1.5 bg-gray-100 rounded-full mt-3 overflow-hidden'>
                            <div className='h-full bg-[#1700AC]' style={{ width: `${(stats.adjustedForecast / teamGoal * 100)}%` }} />
                        </div>
                    </div>
                </div>

                <div className='grid grid-cols-1 xl:grid-cols-3 gap-8'>
                    <div className='xl:col-span-2 space-y-8'>
                        <SellerRace
                            maxGoal={teamGoal}
                            sellers={stats.sellers.map(s => ({
                                name: s.name,
                                value: s.negotiationPipeline,
                                percentage: (s.negotiationPipeline / teamGoal) * 100,
                                reliability: s.score
                            }))}
                        />

                        <div className='grid grid-cols-1 md:grid-cols-2 gap-8'>
                            <div className='bg-white p-6 rounded-3xl border border-gray-100 shadow-sm'>
                                <div className='flex justify-between items-center mb-6'>
                                    <h3 className='font-black text-[#0A1635] text-sm uppercase tracking-wider'>Top Performance</h3>
                                    <Users className='w-4 h-4 text-gray-300' />
                                </div>
                                <div className='space-y-4'>
                                    {stats.sellers.slice(0, 5).map((s, i) => (
                                        <div key={s.name} className='flex items-center justify-between group'>
                                            <div className='flex items-center gap-3'>
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs ${i === 0 ? 'bg-amber-100 text-amber-600' : 'bg-gray-50 text-gray-400'}`}>
                                                    {i + 1}
                                                </div>
                                                <span className='font-bold text-sm text-[#0A1635]'>{s.name}</span>
                                            </div>
                                            <div className='text-right'>
                                                <p className='text-xs font-black text-[#1700AC]'>${(s.negotiationPipeline * (s.score / 100)).toLocaleString()}</p>
                                                <p className='text-[8px] font-bold text-gray-400 uppercase'>Forecast Adj</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <button className='w-full mt-6 py-3 border border-gray-100 rounded-2xl text-[10px] font-black text-gray-400 uppercase tracking-widest hover:bg-gray-50 transition-colors flex items-center justify-center gap-2'>
                                    Ver Detalle <ChevronRight className='w-3 h-3' />
                                </button>
                            </div>

                            <div className='bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-center items-center text-center space-y-4'>
                                <div className='w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center'>
                                    <Search className='w-8 h-8 text-blue-500' />
                                </div>
                                <div className='space-y-1'>
                                    <h4 className='font-black text-[#0A1635] text-base'>Filtros Rápidos</h4>
                                    <p className='text-[10px] text-gray-400 font-medium px-8'>Próximamente filtros por región y periodo fiscal.</p>
                                </div>
                                <button className='px-6 py-2 bg-gray-50 rounded-xl text-[10px] font-black text-gray-400 uppercase tracking-tight flex items-center gap-2'>
                                    <Filter className='w-3 h-3' /> Configurar
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className='xl:col-span-1'>
                        <PipelineVisualizer data={stats.funnel} />
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
            <div className='h-full flex items-center justify-center bg-[#F0F2F5]'>
                <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600'></div>
            </div>
        )
    }

    return (
        <div className='h-full flex flex-col p-8 bg-[#F0F2F5] overflow-y-auto'>
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
                    <div className='bg-white p-6 rounded-2xl shadow-sm border border-gray-200'>
                        <label className='text-xs font-bold text-gray-500 uppercase tracking-wider'>Leads Activos</label>
                        <p className='text-4xl font-black text-[#0F2A44] mt-2'>{stats.activeLeads}</p>
                        <p className='text-xs text-gray-500 mt-1'>En tu pipeline</p>
                    </div>

                    <div className='bg-white p-6 rounded-2xl shadow-sm border border-gray-200'>
                        <label className='text-xs font-bold text-gray-500 uppercase tracking-wider'>En Negociación</label>
                        <p className='text-4xl font-black text-amber-600 mt-2'>{stats.negotiationLeads}</p>
                        <p className='text-xs text-gray-500 mt-1'>Requieren seguimiento</p>
                    </div>

                    <div className='bg-white p-6 rounded-2xl shadow-sm border border-gray-200'>
                        <label className='text-xs font-bold text-gray-500 uppercase tracking-wider'>Forecast Ponderado</label>
                        <p className='text-4xl font-black text-emerald-600 mt-2'>
                            ${stats.totalValue.toLocaleString('es-MX', { maximumFractionDigits: 0 })}
                        </p>
                        <p className='text-xs text-gray-500 mt-1'>Valor esperado</p>
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
                        <div className='bg-white p-6 rounded-2xl shadow-sm border border-gray-200'>
                            <h2 className='text-lg font-bold text-[#0F2A44] mb-4'>
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
    if (auth.loading && !auth.loggedIn) return <div className='h-full flex items-center justify-center bg-[#f8fafc]'><div className='animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600'></div></div>

    if (isAdmin) {
        return <AdminDashboardView />
    }

    return <SellerHomeView username={auth.username} />
}
