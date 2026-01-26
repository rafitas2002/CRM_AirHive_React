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
    }, [])

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

            // Calculate conversion rate (leads cerradas ganadas / total leads)
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

    return (
        <div className='p-8 max-w-5xl'>
            <div className='mb-8'>
                <h1 className='text-3xl font-bold mb-2' style={{ color: 'var(--text-primary)' }}>
                    👤 Perfil de Usuario
                </h1>
                <p className='text-base' style={{ color: 'var(--text-secondary)' }}>
                    Información de tu cuenta y estadísticas de rendimiento
                </p>
            </div>

            {/* User Info Card */}
            <div
                className='p-6 rounded-xl border-2 mb-6'
                style={{
                    background: 'var(--card-bg)',
                    borderColor: 'var(--card-border)'
                }}
            >
                <div className='flex items-center gap-6'>
                    <div className='w-20 h-20 rounded-full bg-gradient-to-br from-[#2048FF] to-[#1e3a8a] flex items-center justify-center text-4xl text-white font-bold shadow-lg'>
                        {auth.profile?.full_name?.charAt(0).toUpperCase() || auth.username?.charAt(0).toUpperCase() || '?'}
                    </div>
                    <div className='flex-1'>
                        <h2 className='text-2xl font-bold mb-1' style={{ color: 'var(--text-primary)' }}>
                            {auth.profile?.full_name || auth.username}
                        </h2>
                        <div className='flex items-center gap-4 text-sm' style={{ color: 'var(--text-secondary)' }}>
                            <span className='flex items-center gap-1'>
                                <span>👤</span>
                                {auth.username}
                            </span>
                            <span className='flex items-center gap-1'>
                                <span>
                                    {auth.profile?.role === 'admin' ? '👑' : '💼'}
                                </span>
                                {auth.profile?.role === 'admin' ? 'Administrador' : 'Vendedor'}
                            </span>
                            <span className='flex items-center gap-1'>
                                <span>📧</span>
                                {auth.user?.email}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Stats Grid */}
            <div className='mb-6'>
                <h3 className='text-xl font-semibold mb-4' style={{ color: 'var(--text-primary)' }}>
                    Estadísticas
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
                            className='p-5 rounded-xl border-2 transition-all hover:scale-105'
                            style={{
                                background: 'var(--card-bg)',
                                borderColor: 'var(--card-border)'
                            }}
                        >
                            <div className='flex items-center gap-3 mb-2'>
                                <div
                                    className='w-10 h-10 rounded-lg flex items-center justify-center text-xl'
                                    style={{ background: `${stat.color}20` }}
                                >
                                    {stat.icon}
                                </div>
                                <div className='flex-1'>
                                    <p className='text-sm font-medium' style={{ color: 'var(--text-secondary)' }}>
                                        {stat.label}
                                    </p>
                                    <p className='text-2xl font-bold' style={{ color: 'var(--text-primary)' }}>
                                        {loading ? '...' : stat.value}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Account Details */}
            <div
                className='p-6 rounded-xl border-2'
                style={{
                    background: 'var(--card-bg)',
                    borderColor: 'var(--card-border)'
                }}
            >
                <h3 className='text-lg font-semibold mb-4' style={{ color: 'var(--text-primary)' }}>
                    Detalles de la cuenta
                </h3>
                <div className='space-y-3'>
                    <div className='flex items-center justify-between py-2 border-b' style={{ borderColor: 'var(--card-border)' }}>
                        <span className='text-sm font-medium' style={{ color: 'var(--text-secondary)' }}>ID de Usuario</span>
                        <span className='text-sm font-mono' style={{ color: 'var(--text-primary)' }}>{auth.user?.id.slice(0, 8)}...</span>
                    </div>
                    <div className='flex items-center justify-between py-2 border-b' style={{ borderColor: 'var(--card-border)' }}>
                        <span className='text-sm font-medium' style={{ color: 'var(--text-secondary)' }}>Fecha de creación</span>
                        <span className='text-sm' style={{ color: 'var(--text-primary)' }}>
                            {auth.user?.created_at ? new Date(auth.user.created_at).toLocaleDateString('es-MX') : 'N/A'}
                        </span>
                    </div>
                    <div className='flex items-center justify-between py-2'>
                        <span className='text-sm font-medium' style={{ color: 'var(--text-secondary)' }}>Última actualización</span>
                        <span className='text-sm' style={{ color: 'var(--text-primary)' }}>
                            {auth.profile?.updated_at ? new Date(auth.profile.updated_at).toLocaleDateString('es-MX') : 'N/A'}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
}
