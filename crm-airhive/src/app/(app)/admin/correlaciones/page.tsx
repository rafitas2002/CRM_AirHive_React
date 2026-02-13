'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { getAdminCorrelationData } from '@/app/actions/admin'
import { getPastRaces, syncRaceResults } from '@/app/actions/race'
import { RaceHistoryTable } from '@/components/RaceHistoryTable'
import {
    Users,
    TrendingUp,
    Calendar,
    Venus,
    Mars,
    Trophy,
    ArrowUpRight,
    ArrowDownRight,
    Search,
    Filter,
    Table as TableIcon,
    RefreshCcw,
    Zap,
    BarChart3,
    Building2,
    Timer,
    CheckCircle,
    MapPin,
    Hash
} from 'lucide-react'
import RichardDawkinsFooter from '@/components/RichardDawkinsFooter'
import { motion, AnimatePresence } from 'framer-motion'

export default function CorrelacionesPage() {
    const auth = useAuth()
    const router = useRouter()
    const [data, setData] = useState<any[]>([])
    const [pastRaces, setPastRaces] = useState<Record<string, any[]>>({})
    const [loading, setLoading] = useState(true)
    const [syncing, setSyncing] = useState(false)
    const [searchTerm, setSearchTerm] = useState('')
    const [sortBy, setSortBy] = useState('totalSales')
    const [genderFilter, setGenderFilter] = useState('all')
    const [ageRange, setAgeRange] = useState('all')
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!auth.loading && !auth.loggedIn) {
            router.push('/home')
            return
        }
        if (auth.profile && auth.profile.role !== 'admin' && auth.profile.role !== 'rh') {
            router.push('/home')
            return
        }

        fetchData()
    }, [auth.loading, auth.loggedIn, auth.profile, router])

    const fetchData = async () => {
        setLoading(true)
        setError(null)
        try {
            const [corrRes, raceRes] = await Promise.all([
                getAdminCorrelationData(),
                getPastRaces()
            ])

            if (corrRes.success && corrRes.data) {
                setData(corrRes.data)
            } else {
                setError(corrRes.error || 'Error al cargar correlaciones')
            }

            if (raceRes.success && raceRes.data) {
                setPastRaces(raceRes.data)
            }
        } catch (err: any) {
            setError(err.message || 'Error inesperado')
        }
        setLoading(false)
    }

    const handleSync = async () => {
        setSyncing(true)
        const res = await syncRaceResults()
        if (res.success) {
            await fetchData()
            alert('¡Sincronización mensual completada!')
        } else {
            alert('Error al sincronizar: ' + res.error)
        }
        setSyncing(false)
    }

    const filteredData = useMemo(() => {
        let result = data.filter(item =>
            item.name.toLowerCase().includes(searchTerm.toLowerCase())
        )

        if (genderFilter !== 'all') {
            result = result.filter(item => item.gender === genderFilter)
        }

        if (ageRange !== 'all') {
            if (ageRange === '30-') result = result.filter(item => item.age && item.age < 30)
            if (ageRange === '30-45') result = result.filter(item => item.age && item.age >= 30 && item.age <= 45)
            if (ageRange === '45+') result = result.filter(item => item.age && item.age > 45)
        }

        result.sort((a, b) => {
            if (sortBy === 'totalSales') return b.totalSales - a.totalSales
            if (sortBy === 'totalMedals') return b.totalMedals - a.totalMedals
            if (sortBy === 'gold') return b.medals.gold - a.medals.gold
            if (sortBy === 'silver') return b.medals.silver - a.medals.silver
            if (sortBy === 'bronze') return b.medals.bronze - a.medals.bronze
            if (sortBy === 'tenure') return b.tenureMonths - a.tenureMonths
            if (sortBy === 'age') return (b.age || 0) - (a.age || 0)
            if (sortBy === 'growth') return b.growth - a.growth
            if (sortBy === 'efficiency') return b.medalRatio - a.medalRatio
            if (sortBy === 'meetings') return a.meetingsPerClose - b.meetingsPerClose // Lower is better
            if (sortBy === 'accuracy') return b.forecastAccuracy - a.forecastAccuracy
            if (sortBy === 'speed') return a.avgResponseTimeHours - b.avgResponseTimeHours // Lower is better
            return 0
        })

        return result
    }, [data, searchTerm, sortBy, genderFilter, ageRange])

    const risingStars = useMemo(() => {
        // Sellers with < 6 months tenure but high medal ratio
        return data
            .filter(d => d.tenureMonths <= 6 && d.medalRatio > 0)
            .sort((a, b) => b.medalRatio - a.medalRatio)
            .slice(0, 3)
    }, [data])

    // Analysis Logic
    const insights = useMemo(() => {
        if (data.length === 0) return []

        const byGender = {
            Male: data.filter(d => d.gender === 'Masculino'),
            Female: data.filter(d => d.gender === 'Femenino'),
            Other: data.filter(d => d.gender !== 'Masculino' && d.gender !== 'Femenino')
        }

        const avgTenureMale = byGender.Male.length ? byGender.Male.reduce((acc, d) => acc + d.tenureMonths, 0) / byGender.Male.length : 0
        const avgTenureFemale = byGender.Female.length ? byGender.Female.reduce((acc, d) => acc + d.tenureMonths, 0) / byGender.Female.length : 0

        const youngSellers = data.filter(d => d.age && d.age < 30)
        const seniorSellers = data.filter(d => d.age && d.age >= 30)

        const avgGrowthYoung = youngSellers.length ? youngSellers.reduce((acc, d) => acc + d.growth, 0) / youngSellers.length : 0
        const avgGrowthSenior = seniorSellers.length ? seniorSellers.reduce((acc, d) => acc + d.growth, 0) / seniorSellers.length : 0

        const topSellers = [...data].sort((a, b) => b.medalScore - a.medalScore)
        const dominantSeller = topSellers[0]
        const totalMedals = data.reduce((acc, d) => acc + d.totalMedals, 0)

        const avgMeetingsPerClose = data.reduce((acc, d) => acc + d.meetingsPerClose, 0) / (data.length || 1)
        const avgForecastAccuracy = data.reduce((acc, d) => acc + d.forecastAccuracy, 0) / (data.length || 1)
        const avgResponseTime = data.reduce((acc, d) => acc + d.avgResponseTimeHours, 0) / (data.length || 1)

        // Industry aggregate
        const indMap: Record<string, number> = {}
        data.forEach(d => { if (d.topIndustry !== 'N/A') indMap[d.topIndustry] = (indMap[d.topIndustry] || 0) + 1 })
        const topOverallIndustry = Object.entries(indMap).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A'

        return [
            {
                title: 'Esfuerzo vs Éxito',
                desc: `El promedio del equipo es de ${avgMeetingsPerClose.toFixed(1)} reuniones por cada cierre ganado.`,
                icon: Zap,
                color: 'amber'
            },
            {
                title: 'Alineación de Expectativa',
                desc: `Precisión promedio del forecast: ${avgForecastAccuracy.toFixed(1)}%. Los cierres coinciden con el optimismo inicial.`,
                icon: BarChart3,
                color: 'indigo'
            },
            {
                title: 'Dominancia por Industria',
                desc: `La industria "${topOverallIndustry}" es donde más sellers están encontrando éxito de cierre.`,
                icon: Building2,
                color: 'rose'
            },
            {
                title: 'Velocidad de Respuesta',
                desc: `Tiempo promedio al primer contacto: ${avgResponseTime.toFixed(1)} horas desde el registro del lead.`,
                icon: Timer,
                color: 'emerald'
            },
            {
                title: 'Dominancia y Consistencia',
                desc: dominantSeller && totalMedals > 0
                    ? `${dominantSeller.name} lidera con ${dominantSeller.medals.gold} oros y una eficiencia de ${dominantSeller.medalRatio.toFixed(2)}.`
                    : 'Aún no hay suficientes datos para determinar dominancia.',
                icon: Trophy,
                color: 'yellow'
            },
            {
                title: 'Impacto Modalidad',
                desc: `Casi el ${(data.reduce((acc, d) => acc + d.physicalCloseRate, 0) / (data.length || 1)).toFixed(1)}% de cierres exitosos tuvieron presencia física.`,
                icon: MapPin,
                color: 'blue'
            }
        ]
    }, [data])

    if (loading || auth.loading) {
        return (
            <div className='h-full flex items-center justify-center' style={{ background: 'transparent' }}>
                <div className='flex flex-col items-center gap-4'>
                    <div className='w-12 h-12 border-4 border-[#2048FF] border-t-transparent rounded-full animate-spin' />
                    <p className='font-bold' style={{ color: 'var(--text-secondary)' }}>Analizando correlaciones maestras...</p>
                </div>
            </div>
        )
    }

    return (
        <div className='h-full flex flex-col overflow-hidden' style={{ background: 'transparent' }}>
            <div className='flex-1 overflow-y-auto p-8 custom-scrollbar'>
                <div className='max-w-7xl mx-auto space-y-10'>

                    {/* Header */}
                    <div className='flex flex-col md:flex-row md:items-center justify-between gap-6'>
                        <div>
                            <h1 className='text-4xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>Data & Correlaciones</h1>
                            <p className='font-medium' style={{ color: 'var(--text-secondary)' }}>Análisis profundo de desempeño vs demografía de vendedores.</p>
                        </div>
                        <div className='flex items-center gap-4 p-2 rounded-2xl shadow-sm border' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                            <div className='px-4 py-2 bg-blue-50/10 text-[#2048FF] rounded-xl font-black text-xs uppercase tracking-widest border border-blue-100/20'>
                                Modo Admin
                            </div>
                            <button
                                onClick={handleSync}
                                disabled={syncing}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-bold text-xs uppercase tracking-wider ${syncing ? 'opacity-50 cursor-not-allowed bg-slate-800' : 'bg-[#2048FF] text-white hover:bg-blue-600 shadow-lg shadow-blue-500/20'}`}
                            >
                                <RefreshCcw size={14} className={syncing ? 'animate-spin' : ''} />
                                {syncing ? 'Sincronizando...' : 'Cerrar Mes / Sincronizar'}
                            </button>
                            <button
                                onClick={fetchData}
                                className='p-2 rounded-xl transition-colors hover:bg-slate-800'
                                style={{ color: 'var(--text-secondary)' }}
                                title='Actualizar Todo'
                            >
                                🔄
                            </button>
                        </div>
                    </div>

                    {/* Error Alert */}
                    <AnimatePresence>
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className='p-6 bg-red-50 border-2 border-red-100 rounded-[32px] flex items-center gap-4 text-red-700'
                            >
                                <div className='w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-red-500 shadow-sm'>
                                    ⚠️
                                </div>
                                <div>
                                    <p className='font-black text-sm uppercase tracking-widest'>Error de Carga</p>
                                    <p className='font-bold text-xs opacity-80'>{error}</p>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Insights Grid */}
                    <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
                        {insights.map((insight, idx) => (
                            <motion.div
                                key={idx}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.1 }}
                                className='p-8 rounded-[32px] border shadow-sm relative overflow-hidden group'
                                style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
                            >
                                <div className={`absolute top-0 right-0 w-32 h-32 opacity-10 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110`} style={{ background: `var(--${insight.color}-500, #2048FF)` }} />
                                <div className='relative z-10 flex items-start gap-6'>
                                    <div className='w-14 h-14 rounded-2xl flex items-center justify-center' style={{ background: 'var(--background)', color: `var(--${insight.color}-500, #2048FF)` }}>
                                        <insight.icon size={28} />
                                    </div>
                                    <div className='space-y-2'>
                                        <h3 className='font-black text-lg' style={{ color: 'var(--text-primary)' }}>{insight.title}</h3>
                                        <p className='font-medium leading-relaxed text-sm opacity-80' style={{ color: 'var(--text-secondary)' }}>{insight.desc}</p>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    {/* Rising Stars Section */}
                    {risingStars.length > 0 && (
                        <div className="bg-gradient-to-r from-blue-600/10 to-purple-600/10 rounded-[32px] p-8 border border-blue-500/20">
                            <div className="flex items-center gap-4 mb-6">
                                <div className="p-3 bg-blue-500 rounded-2xl text-white shadow-lg shadow-blue-500/30">
                                    <ArrowUpRight size={24} />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black text-white">Rising Stars</h2>
                                    <p className="text-sm text-blue-200 font-bold uppercase tracking-wider">Nuevos talentos con mayor eficiencia de medallas</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {risingStars.map((star, idx) => (
                                    <div key={star.userId} className="bg-slate-900/40 rounded-2xl p-6 border border-white/5 backdrop-blur-sm">
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white">
                                                {star.name.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="font-bold text-white">{star.name}</p>
                                                <p className="text-xs text-slate-400">{star.tenureMonths} meses en AirHive</p>
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-end">
                                            <div>
                                                <p className="text-[10px] font-black text-blue-400 uppercase">Eficiencia</p>
                                                <p className="text-xl font-black text-white">{star.medalRatio.toFixed(2)}</p>
                                            </div>
                                            <div className="flex gap-1">
                                                {Array.from({ length: Math.min(3, Math.ceil(star.medalRatio)) }).map((_, i) => (
                                                    <Trophy key={i} size={14} className="text-yellow-500" />
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Master Table Section */}
                    <div className='rounded-[40px] shadow-xl border overflow-hidden flex flex-col' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                        <div className='p-8 border-b flex flex-col md:flex-row md:items-center justify-between gap-6' style={{ borderColor: 'var(--card-border)' }}>
                            <div className='flex items-center gap-4'>
                                <div className='w-12 h-12 rounded-2xl flex items-center justify-center' style={{ background: 'var(--background)', color: 'var(--text-secondary)' }}>
                                    <TableIcon size={24} />
                                </div>
                                <div>
                                    <h2 className='text-xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>Tabla Maestra de Sellers</h2>
                                    <p className='text-[10px] font-bold uppercase tracking-widest' style={{ color: 'var(--text-secondary)' }}>Filtra y correlaciona manualmente</p>
                                </div>
                            </div>

                            <div className='flex flex-wrap items-center gap-4 flex-1 justify-end'>
                                <div className='relative min-w-[200px]'>
                                    <Search className='absolute left-4 top-1/2 -translate-y-1/2' style={{ color: 'var(--text-secondary)' }} size={16} />
                                    <input
                                        type='text'
                                        placeholder='Search...'
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className='w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700 rounded-xl text-sm font-bold placeholder:text-gray-500 transition-all focus:ring-2 focus:ring-blue-500'
                                        style={{ color: 'var(--text-primary)' }}
                                    />
                                </div>

                                <select
                                    value={sortBy}
                                    onChange={(e) => setSortBy(e.target.value)}
                                    className='bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2 text-xs font-bold text-white focus:ring-2 focus:ring-blue-500 outline-none'
                                >
                                    <option value="totalSales">Ordenar por: Ventas</option>
                                    <option value="totalMedals">Ordenar por: Total Medallas</option>
                                    <option value="gold">Ordenar por: Oro</option>
                                    <option value="efficiency">Ordenar por: Eficiencia (Pts/Mes)</option>
                                    <option value="meetings">Ordenar por: Effort (Mtg/Close)</option>
                                    <option value="accuracy">Ordenar por: Forecast Accuracy</option>
                                    <option value="speed">Ordenar por: Response Speed</option>
                                    <option value="tenure">Ordenar por: Antigüedad</option>
                                    <option value="growth">Ordenar por: Crecimiento</option>
                                </select>

                                <select
                                    value={genderFilter}
                                    onChange={(e) => setGenderFilter(e.target.value)}
                                    className='bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2 text-xs font-bold text-white focus:ring-2 focus:ring-blue-500 outline-none'
                                >
                                    <option value="all">Filtro: Todo Género</option>
                                    <option value="Masculino">Masculino</option>
                                    <option value="Femenino">Femenino</option>
                                </select>

                                <select
                                    value={ageRange}
                                    onChange={(e) => setAgeRange(e.target.value)}
                                    className='bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2 text-xs font-bold text-white focus:ring-2 focus:ring-blue-500 outline-none'
                                >
                                    <option value="all">Filtro: Toda Edad</option>
                                    <option value="30-">Menores de 30</option>
                                    <option value="30-45">30 a 45 años</option>
                                    <option value="45+">Mayores de 45</option>
                                </select>
                            </div>
                        </div>

                        <div className='overflow-x-auto'>
                            <table className='w-full text-left border-collapse'>
                                <thead className='uppercase text-[10px] font-black tracking-[0.2em]' style={{ background: 'var(--background)', color: 'var(--text-secondary)' }}>
                                    <tr>
                                        <th className='px-8 py-5'>Vendedor</th>
                                        <th className='px-8 py-5'>Género</th>
                                        <th className='px-8 py-5'>Edad</th>
                                        <th className='px-8 py-5'>Antigüedad</th>
                                        <th className='px-8 py-5'>Ventas Totales</th>
                                        <th className='px-8 py-5'>Crecimiento</th>
                                        <th className='px-8 py-5 text-center'>Medallas</th>
                                        <th className='px-8 py-5 text-center'>Effort (Mtg/C)</th>
                                        <th className='px-8 py-5 text-center'>Accuracy</th>
                                        <th className='px-8 py-5 text-center'>Top Ind.</th>
                                    </tr>
                                </thead>
                                <tbody className='divide-y' style={{ borderColor: 'var(--card-border)' }}>
                                    {filteredData.map((item, idx) => (
                                        <tr key={item.userId} className='transition-colors group hover:bg-black/5'>
                                            <td className='px-8 py-5'>
                                                <div className='flex items-center gap-3'>
                                                    <div className='w-10 h-10 rounded-full bg-gradient-to-tr from-[#2048FF] to-[#8B5CF6] flex items-center justify-center text-white font-black text-sm shadow-md'>
                                                        {item.name.charAt(0)}
                                                    </div>
                                                    <p className='font-black text-sm' style={{ color: 'var(--text-primary)' }}>{item.name}</p>
                                                </div>
                                            </td>
                                            <td className='px-8 py-5'>
                                                <div className='flex items-center gap-2'>
                                                    {item.gender === 'Masculino' ? <Mars className='text-blue-500' size={16} /> : <Venus className='text-pink-500' size={16} />}
                                                    <span className='font-bold text-sm' style={{ color: 'var(--text-secondary)' }}>{item.gender}</span>
                                                </div>
                                            </td>
                                            <td className='px-8 py-5 font-black text-sm' style={{ color: 'var(--text-secondary)' }}>{item.age || '-'} años</td>
                                            <td className='px-8 py-5'>
                                                <div className='flex flex-col'>
                                                    <span className='font-black text-sm' style={{ color: 'var(--text-primary)' }}>{item.tenureMonths} meses</span>
                                                    <span className='text-[10px] font-bold uppercase' style={{ color: 'var(--text-secondary)' }}>En AirHive</span>
                                                </div>
                                            </td>
                                            <td className='px-8 py-5 font-black text-sm' style={{ color: 'var(--text-primary)' }}>
                                                ${item.totalSales.toLocaleString()}
                                            </td>
                                            <td className='px-8 py-5'>
                                                <div className='flex items-center gap-1.5'>
                                                    {item.growth > 0 ? (
                                                        <>
                                                            <ArrowUpRight className='text-emerald-500' size={16} />
                                                            <span className='text-emerald-500 font-black text-sm'>+{item.growth.toFixed(1)}%</span>
                                                        </>
                                                    ) : item.growth < 0 ? (
                                                        <>
                                                            <ArrowDownRight className='text-red-500' size={16} />
                                                            <span className='text-red-500 font-black text-sm'>{item.growth.toFixed(1)}%</span>
                                                        </>
                                                    ) : (
                                                        <span className='font-bold text-sm' style={{ color: 'var(--text-secondary)' }}>0%</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className='px-8 py-5'>
                                                <div className='flex items-center justify-center gap-3'>
                                                    <span title='Oro' className='flex items-center gap-1'><Trophy size={14} className='text-amber-500' /> <span className='text-xs font-black' style={{ color: 'var(--text-primary)' }}>{item.medals.gold}</span></span>
                                                    <span title='Plata' className='flex items-center gap-1'><Trophy size={14} className='text-gray-400' /> <span className='text-xs font-black' style={{ color: 'var(--text-primary)' }}>{item.medals.silver}</span></span>
                                                    <span title='Bronce' className='flex items-center gap-1'><Trophy size={14} className='text-amber-700' /> <span className='text-xs font-black' style={{ color: 'var(--text-primary)' }}>{item.medals.bronze}</span></span>
                                                </div>
                                            </td>
                                            <td className='px-8 py-5 text-center'>
                                                <span className='font-black text-sm' style={{ color: item.meetingsPerClose < 3 ? '#10b981' : 'var(--text-primary)' }}>
                                                    {item.meetingsPerClose.toFixed(1)}
                                                </span>
                                            </td>
                                            <td className='px-8 py-5 text-center'>
                                                <span className='font-black text-sm' style={{ color: item.forecastAccuracy > 80 ? '#10b981' : 'var(--text-primary)' }}>
                                                    {item.forecastAccuracy.toFixed(0)}%
                                                </span>
                                            </td>
                                            <td className='px-8 py-5 text-center'>
                                                <span className='font-bold text-[10px] uppercase truncate max-w-[80px] block' title={item.topIndustry} style={{ color: 'var(--text-secondary)' }}>
                                                    {item.topIndustry}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {filteredData.length === 0 && (
                            <div className='py-20 text-center' style={{ background: 'var(--background)' }}>
                                <p className='font-bold' style={{ color: 'var(--text-secondary)' }}>No se encontraron datos para los filtros seleccionados.</p>
                            </div>
                        )}
                    </div>
                    {/* Past Races History */}
                    <div className='space-y-6'>
                        <div className='flex items-center gap-4'>
                            <div className='w-12 h-12 rounded-2xl flex items-center justify-center bg-yellow-500/10 text-yellow-500'>
                                <Trophy size={24} />
                            </div>
                            <div>
                                <h2 className='text-2xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>Historial de Carreras</h2>
                                <p className='text-xs font-bold uppercase tracking-widest' style={{ color: 'var(--text-secondary)' }}>Resultados finales por mes</p>
                            </div>
                        </div>
                        <RaceHistoryTable races={pastRaces} />
                    </div>
                </div>
                <RichardDawkinsFooter />
            </div>
        </div>
    )
}

