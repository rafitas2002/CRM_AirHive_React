'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Calendar, Search, Filter, CheckCircle2, User, Building2 } from 'lucide-react'
import RichardDawkinsFooter from '@/components/RichardDawkinsFooter'

interface TaskHistory {
    id: number
    tarea_id: number
    user_id: string
    titulo: string
    empresa: string
    fecha_completado: string
    users?: { full_name: string, avatar_url?: string }
}

export default function CompletedTasksPage() {
    const auth = useAuth()
    const router = useRouter()
    const [supabase] = useState(() => createClient())
    const [history, setHistory] = useState<TaskHistory[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')

    useEffect(() => {
        if (!auth.loading && (!auth.loggedIn || (auth.profile?.role !== 'admin' && auth.profile?.role !== 'rh'))) {
            router.push('/home')
            return
        }
        fetchHistory()
    }, [auth.loading, auth.loggedIn, auth.profile])

    const fetchHistory = async () => {
        setLoading(true)
        try {
            const { data, error } = await (supabase
                .from('historial_tareas') as any)
                .select(`
                    *,
                    users:user_id (full_name, avatar_url)
                `)
                .order('fecha_completado', { ascending: false })
                .limit(100)

            if (error) throw error
            setHistory(data)
        } catch (error) {
            console.error('Error fetching history:', error)
        } finally {
            setLoading(false)
        }
    }

    const filteredHistory = history.filter(item =>
        item.titulo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.users?.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.empresa.toLowerCase().includes(searchTerm.toLowerCase())
    )

    return (
        <div className='min-h-full flex flex-col p-8 overflow-y-auto custom-scrollbar' style={{ background: 'var(--background)' }}>
            <div className='max-w-7xl mx-auto space-y-10 w-full'>
                {/* Header */}
                <div className='flex items-center gap-6'>
                    <button
                        onClick={() => router.back()}
                        className='w-12 h-12 rounded-2xl flex items-center justify-center border transition-all hover:scale-110'
                        style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className='text-4xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>
                            Historial Global de Tareas
                        </h1>
                        <p className='font-medium' style={{ color: 'var(--text-secondary)' }}>
                            Registro de todas las tareas completadas por el equipo.
                        </p>
                    </div>
                </div>

                {/* Filters */}
                <div className='flex gap-4'>
                    <div className='relative flex-1 max-w-md'>
                        <Search className='absolute left-4 top-1/2 -translate-y-1/2' style={{ color: 'var(--text-secondary)' }} size={16} />
                        <input
                            type='text'
                            placeholder='Buscar por usuario, tarea o empresa...'
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className='w-full pl-10 pr-4 py-3 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all'
                            style={{ color: 'var(--text-primary)' }}
                        />
                    </div>
                </div>

                {/* Timeline / List */}
                <div className='space-y-4'>
                    {loading ? (
                        <div className='text-center py-20'>
                            <div className='inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin' />
                        </div>
                    ) : filteredHistory.length === 0 ? (
                        <div className='text-center py-20 opacity-50 font-bold' style={{ color: 'var(--text-secondary)' }}>
                            No se encontraron registros.
                        </div>
                    ) : (
                        filteredHistory.map((item) => (
                            <div
                                key={item.id}
                                className='group p-6 rounded-[32px] border transition-all hover:shadow-lg flex items-center gap-6'
                                style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
                            >
                                <div className='w-14 h-14 rounded-full flex-shrink-0 flex items-center justify-center text-lg font-black text-white shadow-md'
                                    style={{ background: `linear-gradient(135deg, ${stringToColor(item.user_id)} 0%, ${stringToColor(item.user_id + 'dark')} 100%)` }}
                                >
                                    {item.users?.full_name?.charAt(0) || '?'}
                                </div>

                                <div className='flex-1 min-w-0'>
                                    <div className='flex items-center gap-2 mb-1'>
                                        <p className='text-xs font-black uppercase tracking-wider text-blue-500'>
                                            {item.users?.full_name}
                                        </p>
                                        <span className='text-[10px] opacity-40'>•</span>
                                        <p className='text-[10px] font-bold opacity-40 uppercase tracking-wider' style={{ color: 'var(--text-primary)' }}>
                                            {new Date(item.fecha_completado).toLocaleDateString([], { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                    <h3 className='text-lg font-bold truncate leading-tight mb-2' style={{ color: 'var(--text-primary)' }}>
                                        {item.titulo}
                                    </h3>
                                    <div className='flex items-center gap-2'>
                                        <Building2 size={12} className='text-gray-400' />
                                        <p className='text-xs font-bold text-gray-400 uppercase tracking-widest'>
                                            {item.empresa}
                                        </p>
                                    </div>
                                </div>

                                <div className='w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center'>
                                    <CheckCircle2 size={24} />
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <RichardDawkinsFooter />
            </div>
        </div>
    )
}

function stringToColor(str: string) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - c.length) + c;
}
