'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { BarChart3, Users, CheckCircle2, CalendarDays, TrendingUp } from 'lucide-react'

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

    const fetchUserStats = useCallback(async () => {
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
                .select('id, etapa')
                .eq('owner_id', auth.user.id)
                .in('etapa', ['Cerrado Ganado', 'Cerrada Ganada'])

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
    }, [auth.user])

    useEffect(() => {
        fetchUserStats()
    }, [fetchUserStats])

    if (!auth.user) return null

    return (
        <div className='p-8 max-w-7xl mx-auto'>
            {/* Rich Profile View */}
            <div className='mb-10'>
                <ProfileView userId={auth.user.id} />
            </div>

            {/* Performance Stats */}
            <div className='mb-6 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100'>
                <div className='flex items-center gap-3 mb-4'>
                    <div className='ah-icon-card ah-icon-card-sm'>
                        <BarChart3 size={18} strokeWidth={2.2} />
                    </div>
                    <h3 className='text-xl font-bold text-[var(--text-primary)]'>
                        Estadísticas de Rendimiento
                    </h3>
                </div>
                <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
                    {[
                        { label: 'Leads Asignadas', value: stats.leadsAsignadas, icon: Users },
                        { label: 'Tareas Pendientes', value: stats.tareasPendientes, icon: CheckCircle2 },
                        { label: 'Próximas Juntas', value: stats.proximasJuntas, icon: CalendarDays },
                        { label: 'Tasa de Conversión', value: `${stats.tasasConversion}%`, icon: TrendingUp }
                    ].map((stat, index) => (
                        <div
                            key={index}
                            className='p-5 rounded-2xl border transition-all hover:-translate-y-1 hover:shadow-lg bg-[var(--card-bg)] border-[var(--card-border)] shadow-[0_10px_30px_rgba(0,0,0,0.18)]'
                        >
                            <div className='flex items-center gap-4 mb-2'>
                                <div className='ah-icon-card ah-icon-card-sm'>
                                    <stat.icon size={22} strokeWidth={2.1} />
                                </div>
                                <div className='flex-1'>
                                    <p className='text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]'>
                                        {stat.label}
                                    </p>
                                    <p className='text-3xl font-black text-[var(--text-primary)]'>
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
