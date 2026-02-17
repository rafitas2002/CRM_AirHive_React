'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { CheckCircle2, Circle, Clock, AlertCircle } from 'lucide-react'

interface Task {
    id: number
    titulo: string
    fecha_vencimiento: string
    estado: string
    prioridad: string
    lead_id: number
    clientes: {
        empresa: string
    }
}

export default function MyTasksWidget() {
    const [tasks, setTasks] = useState<Task[]>([])
    const [loading, setLoading] = useState(true)
    const [supabase] = useState(() => createClient())

    useEffect(() => {
        fetchTasks()

        // Real-time listener for tasks changes
        const channel = supabase
            .channel('dashboard-tasks')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'tareas'
                },
                () => {
                    console.log('Real-time task update in widget')
                    fetchTasks()
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [])

    const fetchTasks = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data, error } = await (supabase
                .from('tareas') as any)
                .select('*, clientes(empresa)')
                .eq('vendedor_id', user.id)
                .eq('estado', 'pendiente')
                .order('fecha_vencimiento', { ascending: true })
                .limit(5)

            if (data) setTasks(data as any)
        } catch (error) {
            console.error('Error fetching dashboard tasks:', error)
        } finally {
            setLoading(false)
        }
    }

    const toggleStatus = async (task: Task) => {
        const { error } = await (supabase
            .from('tareas') as any)
            .update({ estado: 'completada' })
            .eq('id', task.id)

        if (!error) {
            fetchTasks()
        }
    }

    if (loading) {
        return (
            <div className='p-6 rounded-2xl shadow-sm border cursor-pointer' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                <h2 className='text-lg font-bold mb-4' style={{ color: 'var(--text-primary)' }}>
                    ✅ Mis Tareas
                </h2>
                <p className='text-sm animate-pulse' style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>Cargando...</p>
            </div>
        )
    }

    return (
        <div className='p-6 rounded-2xl shadow-sm border cursor-pointer' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
            <div className='flex items-center justify-between mb-4'>
                <h2 className='text-lg font-bold' style={{ color: 'var(--text-primary)' }}>
                    ✅ Mis Tareas
                </h2>
                <span className='px-2 py-0.5 bg-purple-500/10 text-purple-600 rounded-full text-[10px] font-black uppercase'>
                    {tasks.length} Pendientes
                </span>
            </div>

            {tasks.length === 0 ? (
                <div className='text-center py-6 rounded-xl border border-dashed' style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}>
                    <p className='text-sm mb-1' style={{ color: 'var(--text-secondary)' }}>¡Todo al día! ✨</p>
                    <p className='text-[10px] font-medium opacity-60' style={{ color: 'var(--text-secondary)' }}>No tienes tareas para hoy</p>
                </div>
            ) : (
                <div className='space-y-3'>
                    {tasks.map((task) => {
                        const isOverdue = new Date(task.fecha_vencimiento) < new Date()
                        return (
                            <div
                                key={task.id}
                                className='p-3 rounded-xl border transition-all group cursor-pointer'
                                style={{ background: 'transparent', borderColor: 'var(--card-border)' }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'var(--hover-bg)'
                                    e.currentTarget.style.borderColor = '#A78BFA' // purple-300
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'transparent'
                                    e.currentTarget.style.borderColor = 'var(--card-border)'
                                }}
                                onClick={() => toggleStatus(task)}
                            >
                                <div className='flex items-start gap-3'>
                                    <div className='mt-0.5 text-gray-400 group-hover:text-purple-500 transition-colors'>
                                        <Circle className='w-5 h-5' />
                                    </div>
                                    <div className='flex-1 min-w-0'>
                                        <p className='text-sm font-bold truncate' style={{ color: 'var(--text-primary)' }}>
                                            {task.titulo}
                                        </p>
                                        <p className='text-[10px] font-medium truncate' style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                                            🏢 {task.clientes?.empresa || 'Empresa desconocida'}
                                        </p>
                                        <div className='flex items-center gap-2 mt-2'>
                                            <span className={`flex items-center gap-1 text-[9px] font-black uppercase tracking-tighter ${isOverdue ? 'text-red-500' : 'text-gray-400'}`}>
                                                {isOverdue ? <AlertCircle className='w-2.5 h-2.5' /> : <Clock className='w-2.5 h-2.5' />}
                                                {new Date(task.fecha_vencimiento).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                                            </span>
                                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${task.prioridad === 'alta' ? 'bg-red-500/10 text-red-500' :
                                                task.prioridad === 'media' ? 'bg-amber-500/10 text-amber-500' :
                                                    'bg-blue-500/10 text-blue-500'
                                                }`}>
                                                {task.prioridad}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
