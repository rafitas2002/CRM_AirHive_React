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

    const fetchTasks = async () => {
        setLoading(true)
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

    useEffect(() => {
        fetchTasks()
    }, [])

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
            <div className='bg-white p-6 rounded-2xl shadow-sm border border-gray-200'>
                <h2 className='text-lg font-bold text-[#0F2A44] mb-4'>
                    ✅ Mis Tareas
                </h2>
                <p className='text-gray-400 text-sm animate-pulse'>Cargando...</p>
            </div>
        )
    }

    return (
        <div className='bg-white p-6 rounded-2xl shadow-sm border border-gray-200'>
            <div className='flex items-center justify-between mb-4'>
                <h2 className='text-lg font-bold text-[#0F2A44]'>
                    ✅ Mis Tareas
                </h2>
                <span className='px-2 py-0.5 bg-purple-50 text-purple-600 rounded-full text-[10px] font-black uppercase'>
                    {tasks.length} Pendientes
                </span>
            </div>

            {tasks.length === 0 ? (
                <div className='text-center py-6 bg-gray-50 rounded-xl border border-dashed border-gray-200'>
                    <p className='text-gray-500 text-sm mb-1'>¡Todo al día! ✨</p>
                    <p className='text-gray-400 text-[10px] font-medium'>No tienes tareas para hoy</p>
                </div>
            ) : (
                <div className='space-y-3'>
                    {tasks.map((task) => {
                        const isOverdue = new Date(task.fecha_vencimiento) < new Date()
                        return (
                            <div
                                key={task.id}
                                className='p-3 rounded-xl border border-gray-100 hover:border-purple-200 hover:bg-purple-50/30 transition-all group cursor-pointer'
                                onClick={() => toggleStatus(task)}
                            >
                                <div className='flex items-start gap-3'>
                                    <div className='mt-0.5 text-gray-300 group-hover:text-purple-500 transition-colors'>
                                        <Circle className='w-5 h-5' />
                                    </div>
                                    <div className='flex-1 min-w-0'>
                                        <p className='text-sm font-bold text-[#0A1635] truncate'>
                                            {task.titulo}
                                        </p>
                                        <p className='text-[10px] text-gray-500 font-medium truncate'>
                                            🏢 {task.clientes?.empresa || 'Empresa desconozida'}
                                        </p>
                                        <div className='flex items-center gap-2 mt-2'>
                                            <span className={`flex items-center gap-1 text-[9px] font-black uppercase tracking-tighter ${isOverdue ? 'text-red-500' : 'text-gray-400'}`}>
                                                {isOverdue ? <AlertCircle className='w-2.5 h-2.5' /> : <Clock className='w-2.5 h-2.5' />}
                                                {new Date(task.fecha_vencimiento).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                                            </span>
                                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${task.prioridad === 'alta' ? 'bg-red-50 text-red-500' :
                                                    task.prioridad === 'media' ? 'bg-amber-50 text-amber-500' :
                                                        'bg-blue-50 text-blue-500'
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
