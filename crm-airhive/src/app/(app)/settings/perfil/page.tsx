'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

type UserStats = {
    leadsAsignadas: number
    tareasPendientes: number
    proximasJuntas: number
    tasasConversion: number
}

import ProfileView from '@/components/ProfileView'

export default function PerfilPage() {
    const auth = useAuth()
    const [stats, setStats] = useState<UserStats>({
        leadsAsignadas: 0,
        tareasPendientes: 0,
        proximasJuntas: 0,
        tasasConversion: 0
    })
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchUserStats()
    }, [auth.user]) // Add dependency

    const fetchUserStats = async () => {
        if (!auth.user) return

        try {
            const supabase = createClient()

            // Fetch leads count
            const { count: leadsCount } = await supabase
                .from('clientes')
                .select('*', { count: 'exact', head: true })
                .eq('owner_id', auth.user.id)

            // Fetch pending tasks count
            const { count: tasksCount } = await supabase
                .from('tareas')
                .select('*', { count: 'exact', head: true })
                .eq('vendedor_id', auth.user.id)
                .eq('estado', 'pendiente')

            // Fetch upcoming meetings count
            const { count: meetingsCount } = await supabase
                .from('meetings')
                .select('*', { count: 'exact', head: true })
                .eq('seller_id', auth.user.id)
                .eq('status', 'scheduled')
                .gte('start_time', new Date().toISOString())

            // Calculate conversion rate
            const { data: wonLeads } = await supabase
                .from('clientes')
                .select('id')
                .eq('owner_id', auth.user.id)
                .eq('etapa', 'Cerrada Ganada')

            const conversionRate = leadsCount && leadsCount > 0
                ? ((wonLeads?.length || 0) / leadsCount) * 100
                : 0

            setStats({
                leadsAsignadas: leadsCount || 0,
                tareasPendientes: tasksCount || 0,
                proximasJuntas: meetingsCount || 0,
                tasasConversion: Math.round(conversionRate)
            })
        } catch (error) {
            console.error('Error fetching user stats:', error)
        } finally {
            setLoading(false)
        }
    }

    if (!auth.user) return null

    return (
        <div className='p-8 max-w-7xl mx-auto'>
            {/* Rich Profile View */}
            <div className='mb-10'>
                <ProfileView userId={auth.user.id} />
            </div>

            {/* Performance Stats */}
            <div className='mb-6 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100'>
                <h3 className='text-xl font-bold mb-4 text-[#0A1635] flex items-center gap-2'>
                    📊 Estadísticas de Rendimiento
                </h3>
                <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
                    {[
                        { label: 'Leads Asignadas', value: stats.leadsAsignadas, icon: '👥', color: '#2048FF' },
                        { label: 'Tareas Pendientes', value: stats.tareasPendientes, icon: '✅', color: '#f59e0b' },
                        { label: 'Próximas Juntas', value: stats.proximasJuntas, icon: '📅', color: '#8b5cf6' },
                        { label: 'Tasa de Conversión', value: `${stats.tasasConversion}%`, icon: '📊', color: '#10b981' }
                    ].map((stat, index) => (
                        <div
                            key={index}
                            className='p-5 rounded-2xl border border-gray-100 shadow-sm bg-white transition-all hover:-translate-y-1 hover:shadow-md'
                        >
                            <div className='flex items-center gap-4 mb-2'>
                                <div
                                    className='w-12 h-12 rounded-xl flex items-center justify-center text-2xl'
                                    style={{ background: `${stat.color}15`, color: stat.color }}
                                >
                                    {stat.icon}
                                </div>
                                <div className='flex-1'>
                                    <p className='text-xs font-bold text-gray-400 uppercase tracking-widest'>
                                        {stat.label}
                                    </p>
                                    <p className='text-3xl font-black text-[#0A1635]'>
                                        {loading ? '...' : stat.value}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
