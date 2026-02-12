'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { getAdminCorrelationData } from '@/app/actions/admin'
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
    Table as TableIcon
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export default function CorrelacionesPage() {
    const auth = useAuth()
    const router = useRouter()
    const [data, setData] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
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
        const res = await getAdminCorrelationData()
        if (res.success && res.data) {
            setData(res.data)
        } else {
            setError(res.error || 'Error desconocido al cargar datos')
        }
        setLoading(false)
    }

    const filteredData = useMemo(() => {
        return data.filter(item =>
            item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.gender.toLowerCase().includes(searchTerm.toLowerCase())
        )
    }, [data, searchTerm])

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

        return [
            {
                title: 'Correlación Género vs Antigüedad',
                desc: `Los vendedores hombres promedian ${avgTenureMale.toFixed(1)} meses, mientras que las mujeres promedian ${avgTenureFemale.toFixed(1)} meses.`,
                icon: Users,
                color: 'blue'
            },
            {
                title: 'Aprendizaje: Vendedores Jóvenes',
                desc: `Sellers <30 años crecen a un ritmo del ${avgGrowthYoung.toFixed(1)}% mensual vs ${avgGrowthSenior.toFixed(1)}% en mayores de 30.`,
                icon: TrendingUp,
                color: 'emerald'
            }
        ]
    }, [data])

    if (loading || auth.loading) {
        return (
            <div className='h-full flex items-center justify-center' style={{ background: 'var(--background)' }}>
                <div className='flex flex-col items-center gap-4'>
                    <div className='w-12 h-12 border-4 border-[#2048FF] border-t-transparent rounded-full animate-spin' />
                    <p className='font-bold' style={{ color: 'var(--text-secondary)' }}>Analizando correlaciones maestras...</p>
                </div>
            </div>
        )
    }

    return (
        <div className='h-full flex flex-col overflow-hidden' style={{ background: 'var(--background)' }}>
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
                                onClick={fetchData}
                                className='p-2 rounded-xl transition-colors'
                                style={{ color: 'var(--text-secondary)' }}
                                title='Actualizar Datos'
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
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                        {insights.map((insight, idx) => (
                            <motion.div
                                key={idx}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.1 }}
                                className='p-8 rounded-[32px] border shadow-sm relative overflow-hidden group'
                                style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
                            >
                                <div className={`absolute top-0 right-0 w-32 h-32 opacity-10 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110`} style={{ background: insight.color === 'blue' ? '#2048FF' : '#10b981' }} />
                                <div className='relative z-10 flex items-start gap-6'>
                                    <div className='w-14 h-14 rounded-2xl flex items-center justify-center' style={{ background: 'var(--background)', color: insight.color === 'blue' ? '#2048FF' : '#10b981' }}>
                                        <insight.icon size={28} />
                                    </div>
                                    <div className='space-y-2'>
                                        <h3 className='font-black text-lg' style={{ color: 'var(--text-primary)' }}>{insight.title}</h3>
                                        <p className='font-medium leading-relaxed' style={{ color: 'var(--text-secondary)' }}>{insight.desc}</p>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>

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
                            <div className='relative min-w-[300px]'>
                                <Search className='absolute left-4 top-1/2 -translate-y-1/2' style={{ color: 'var(--text-secondary)' }} size={18} />
                                <input
                                    type='text'
                                    placeholder='Buscar por nombre o género...'
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className='w-full pl-12 pr-4 py-3 border-none rounded-2xl focus:ring-2 focus:ring-[#2048FF] text-sm font-bold placeholder:text-gray-400 transition-all shadow-inner'
                                    style={{ background: 'var(--background)', color: 'var(--text-primary)' }}
                                />
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
                </div>
            </div>
        </div>
    )
}

