'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import TaskModal from '@/components/TaskModal'
import ConfirmModal from '@/components/ConfirmModal'

interface Task {
    id: number
    lead_id: number
    titulo: string
    descripcion: string | null
    fecha_vencimiento: string
    estado: 'pendiente' | 'completada' | 'atrasada' | 'cancelada'
    prioridad: 'baja' | 'media' | 'alta'
    vendedor_id: string
    cliente_empresa?: string
    cliente_nombre?: string
}

export default function TareasPage() {
    const auth = useAuth()
    const [supabase] = useState(() => createClient())
    const [tasks, setTasks] = useState<Task[]>([])
    const [loading, setLoading] = useState(true)

    // Modals
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
    const [currentTask, setCurrentTask] = useState<Task | null>(null)
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
    const [deleteId, setDeleteId] = useState<number | null>(null)

    const fetchTasks = async () => {
        const isInitial = tasks.length === 0
        if (isInitial) setLoading(true)
        try {
            const { data, error } = await (supabase
                .from('tareas') as any)
                .select(`
                *,
                clientes:lead_id (empresa, nombre)
            `)
                .order('fecha_vencimiento', { ascending: true })

            if (error) throw error

            const transformed = (data || []).map((t: any) => ({
                ...t,
                cliente_empresa: t.clientes?.empresa,
                cliente_nombre: t.clientes?.nombre
            }))

            setTasks(transformed)
        } catch (error) {
            console.error('Error fetching tasks:', error)
        } finally {
            if (isInitial) setLoading(false)
        }
    }

    useEffect(() => {
        if (!auth.loading && auth.loggedIn) {
            fetchTasks()
        }
    }, [auth.loading, auth.loggedIn])

    const handleSave = async (data: any) => {
        try {
            if (modalMode === 'create') {
                const { error } = await supabase.from('tareas').insert({
                    ...data,
                    vendedor_id: auth.user?.id
                })
                if (error) throw error
            } else {
                const { error } = await (supabase
                    .from('tareas') as any)
                    .update(data)
                    .eq('id', currentTask?.id)
                if (error) throw error
            }
            setIsModalOpen(false)
            fetchTasks()
        } catch (error: any) {
            alert('Error al guardar: ' + error.message)
        }
    }

    const handleDelete = async () => {
        if (!deleteId) return
        try {
            const { error } = await supabase.from('tareas').delete().eq('id', deleteId)
            if (error) throw error
            setIsDeleteModalOpen(false)
            fetchTasks()
        } catch (error: any) {
            alert('Error al eliminar: ' + error.message)
        }
    }

    const toggleStatus = async (task: Task) => {
        const newStatus = task.estado === 'completada' ? 'pendiente' : 'completada'
        try {
            const { error } = await (supabase
                .from('tareas') as any)
                .update({ estado: newStatus })
                .eq('id', task.id)
            if (error) throw error
            fetchTasks()
        } catch (error: any) {
            alert('Error al actualizar estado: ' + error.message)
        }
    }

    // Temporal Grouping Logic
    const groupedTasks = useMemo(() => {
        const now = new Date()
        const groups: Record<string, Task[]> = {
            'Atrasadas': [],
            'Hoy': [],
            'Próximamente': [],
            'Completadas': []
        }

        tasks.forEach(task => {
            if (task.estado === 'completada' || task.estado === 'cancelada') {
                groups['Completadas'].push(task)
                return
            }

            const dueDate = new Date(task.fecha_vencimiento)
            const isToday = dueDate.toDateString() === now.toDateString()
            const isPast = dueDate < now && !isToday

            if (isPast) groups['Atrasadas'].push(task)
            else if (isToday) groups['Hoy'].push(task)
            else groups['Próximamente'].push(task)
        })

        return groups
    }, [tasks])

    if (auth.loading && !auth.loggedIn) {
        return (
            <div className='h-screen w-full flex items-center justify-center' style={{ background: 'var(--background)' }}>
                <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600'></div>
            </div>
        )
    }

    return (
        <div className='h-full flex flex-col p-8 overflow-hidden' style={{ background: 'var(--background)' }}>
            <div className='w-full max-w-7xl mx-auto flex flex-col h-full gap-8'>
                {/* Header */}
                <div className='shrink-0 flex items-center justify-between'>
                    <div className='space-y-1'>
                        <h1 className='text-4xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>Tareas</h1>
                        <p className='text-[10px] font-black text-[#2048FF] uppercase tracking-[0.2em]'>Seguimiento y Actividades de Leads</p>
                    </div>
                    <button
                        onClick={() => { setModalMode('create'); setCurrentTask(null); setIsModalOpen(true); }}
                        className='h-12 px-8 bg-[#2048FF] text-white rounded-2xl font-black shadow-xl shadow-blue-500/20 hover:bg-[#1700AC] transition-all transform active:scale-95 uppercase text-[10px] tracking-widest flex items-center gap-2'
                    >
                        <span>➕</span> Nueva Tarea
                    </button>
                </div>

                {/* Task Dashboard Layout */}
                <div className='flex-1 overflow-y-auto custom-scrollbar space-y-12 pb-10'>
                    {Object.entries(groupedTasks).map(([groupName, groupTasks]) => {
                        if (groupTasks.length === 0 && groupName !== 'Hoy') return null

                        return (
                            <div key={groupName} className='space-y-6'>
                                <div className='flex items-center gap-4'>
                                    <div className={`px-5 py-2 rounded-2xl shadow-sm border-2 ${groupName === 'Atrasadas' ? 'bg-red-50 border-red-100 text-red-600' :
                                        groupName === 'Hoy' ? 'bg-blue-600 border-blue-600 text-white shadow-blue-500/20' :
                                            groupName === 'Completadas' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' :
                                                'border'}`}
                                        style={groupName !== 'Atrasadas' && groupName !== 'Hoy' && groupName !== 'Completadas' ? {
                                            background: 'var(--card-bg)', borderColor: 'var(--card-border)', color: 'var(--text-primary)'
                                        } : {}}
                                    >
                                        <h2 className='text-xs font-black uppercase tracking-[0.2em]'>{groupName}</h2>
                                    </div>
                                    <div className='flex-1 h-px bg-gray-200/50' />
                                    <span className='text-[10px] font-black text-gray-400 uppercase tracking-widest'>{groupTasks.length} Tareas</span>
                                </div>

                                {groupTasks.length === 0 ? (
                                    <div className='p-12 bg-white/40 border-2 border-dashed border-gray-200 rounded-[40px] flex flex-col items-center text-center opacity-60'>
                                        <span className='text-3xl mb-2'>✨</span>
                                        <p className='text-xs font-bold text-gray-500'>Todo al día por aquí</p>
                                    </div>
                                ) : (
                                    <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
                                        {groupTasks.map(task => (
                                            <div
                                                key={task.id}
                                                className={`group p-6 rounded-[32px] border-2 transition-all hover:shadow-2xl hover:shadow-[#0A1635]/10 relative ${task.estado === 'completada' ? 'border-emerald-100 opacity-80' :
                                                    groupName === 'Atrasadas' ? 'border-red-100' : 'border'}`}
                                                style={{ background: 'var(--card-bg)', borderColor: (groupName !== 'Atrasadas' && task.estado !== 'completada') ? 'var(--card-border)' : undefined }}
                                            >
                                                {/* Priority Badge */}
                                                <div className={`absolute top-6 right-6 px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border ${task.prioridad === 'alta' ? 'bg-red-50 text-red-600 border-red-100' :
                                                    task.prioridad === 'media' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                                                        'bg-gray-50 text-gray-400 border-gray-100'
                                                    }`}>
                                                    {task.prioridad}
                                                </div>

                                                <div className='flex gap-4 items-start mb-6'>
                                                    <button
                                                        onClick={() => toggleStatus(task)}
                                                        className={`w-8 h-8 rounded-xl border-2 flex items-center justify-center transition-all flex-shrink-0 ${task.estado === 'completada'
                                                            ? 'bg-emerald-500 border-emerald-500 text-white'
                                                            : 'border-gray-200 hover:border-blue-500'}`}
                                                    >
                                                        {task.estado === 'completada' ? '✓' : ''}
                                                    </button>
                                                    <div className='min-w-0'>
                                                        <h3 className={`text-lg font-black leading-tight truncate pr-12 transition-all ${task.estado === 'completada' ? 'line-through text-gray-400' : ''}`}
                                                            style={task.estado !== 'completada' ? { color: 'var(--text-primary)' } : {}}
                                                        >
                                                            {task.titulo}
                                                        </h3>
                                                        <div className='flex flex-wrap items-center gap-x-2 gap-y-1 mt-1'>
                                                            <p className='text-[10px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1'>
                                                                <span>👤</span> {task.cliente_nombre}
                                                            </p>
                                                            <span className='text-[8px] text-gray-300'>●</span>
                                                            <p className='text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1'>
                                                                <span>🏢</span> {task.cliente_empresa}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>

                                                <p className='text-xs font-bold text-gray-500 line-clamp-2 mb-6 min-h-[32px]'>{task.descripcion || 'Sin descripción adicional'}</p>

                                                <div className='flex items-center justify-between pt-5 border-t border-gray-50'>
                                                    <div className='flex items-center gap-2'>
                                                        <div className='w-7 h-7 bg-gray-50 rounded-lg flex items-center justify-center text-xs'>📅</div>
                                                        <div className='flex flex-col'>
                                                            <span className='text-[10px] font-black text-[#0A1635]'>
                                                                {new Date(task.fecha_vencimiento).toLocaleDateString()}
                                                            </span>
                                                            <span className='text-[9px] font-bold text-gray-400 uppercase'>
                                                                {new Date(task.fecha_vencimiento).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className='flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity'>
                                                        <button
                                                            onClick={() => { setModalMode('edit'); setCurrentTask(task); setIsModalOpen(true); }}
                                                            className='p-2 bg-gray-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-sm text-xs'
                                                        >
                                                            ✏️
                                                        </button>
                                                        <button
                                                            onClick={() => { setDeleteId(task.id); setIsDeleteModalOpen(true); }}
                                                            className='p-2 bg-gray-50 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all shadow-sm text-xs'
                                                        >
                                                            🗑️
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Modals */}
            <TaskModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSave}
                initialData={currentTask}
                mode={modalMode}
            />

            <ConfirmModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleDelete}
                title="Eliminar Tarea"
                message="¿Estás seguro de que deseas eliminar esta tarea? Esta acción no se puede deshacer."
                isDestructive
            />
        </div>
    )
}
