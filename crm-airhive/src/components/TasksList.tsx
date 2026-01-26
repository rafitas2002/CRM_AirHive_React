'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

interface Task {
    id: number
    titulo: string
    fecha_vencimiento: string
    estado: string
    prioridad: string
}

interface TasksListProps {
    leadId: number
    onRefresh?: () => void
}

export default function TasksList({ leadId, onRefresh }: TasksListProps) {
    const [tasks, setTasks] = useState<Task[]>([])
    const [loading, setLoading] = useState(true)
    const supabase = createClient()

    const fetchTasks = async () => {
        setLoading(true)
        const { data } = await (supabase
            .from('tareas') as any)
            .select('*')
            .eq('lead_id', leadId)
            .order('fecha_vencimiento', { ascending: true })

        if (data) setTasks(data as any)
        setLoading(false)
    }

    useEffect(() => {
        fetchTasks()
    }, [leadId])

    const toggleStatus = async (task: Task) => {
        const newStatus = task.estado === 'completada' ? 'pendiente' : 'completada'
        const { error } = await (supabase
            .from('tareas') as any)
            .update({ estado: newStatus })
            .eq('id', task.id)

        if (!error) {
            fetchTasks()
            if (onRefresh) onRefresh()
        }
    }

    const deleteTask = async (id: number) => {
        if (!confirm('¿Eliminar esta tarea?')) return
        const { error } = await supabase.from('tareas').delete().eq('id', id)
        if (!error) {
            fetchTasks()
            if (onRefresh) onRefresh()
        }
    }

    if (loading) return <div className='py-4 text-center text-xs text-gray-400 animate-pulse'>Cargando tareas...</div>

    if (tasks.length === 0) return (
        <div className='py-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200'>
            <p className='text-[10px] font-bold text-gray-400 uppercase tracking-widest'>Sin tareas pendientes</p>
        </div>
    )

    return (
        <div className='space-y-3 mt-4'>
            {tasks.map(task => (
                <div key={task.id} className={`p-4 bg-white rounded-xl border-2 transition-all flex items-center justify-between group ${task.estado === 'completada' ? 'border-emerald-50 bg-emerald-50/10' : 'border-gray-50'}`}>
                    <div className='flex items-center gap-3 min-w-0'>
                        <button
                            onClick={() => toggleStatus(task)}
                            className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all flex-shrink-0 ${task.estado === 'completada' ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-200'}`}
                        >
                            {task.estado === 'completada' && '✓'}
                        </button>
                        <div className='min-w-0'>
                            <p className={`text-sm font-bold truncate ${task.estado === 'completada' ? 'line-through text-gray-400' : 'text-[#0A1635]'}`}>{task.titulo}</p>
                            <p className='text-[10px] text-gray-400 font-bold'>📅 {new Date(task.fecha_vencimiento).toLocaleDateString()} · {task.prioridad}</p>
                        </div>
                    </div>
                    <button
                        onClick={() => deleteTask(task.id)}
                        className='p-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all'
                    >
                        🗑️
                    </button>
                </div>
            ))}
        </div>
    )
}
