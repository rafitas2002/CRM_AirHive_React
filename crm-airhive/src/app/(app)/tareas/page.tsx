'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import TaskModal from '@/components/TaskModal'
import ConfirmModal from '@/components/ConfirmModal'
import { Plus, CheckSquare, Calendar, Clock, Building2, User, Pencil, Trash2, CheckCircle2, RotateCw, ListTodo, AlertCircle, Search } from 'lucide-react'
import RichardDawkinsFooter from '@/components/RichardDawkinsFooter'

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
    const [isStatusModalOpen, setIsStatusModalOpen] = useState(false)
    const [taskToToggle, setTaskToToggle] = useState<Task | null>(null)
    const [search, setSearch] = useState('')

    const emitTrackingEvent = async (payload: {
        eventType: 'task_created' | 'task_updated' | 'task_deleted' | 'task_status_changed'
        entityType: 'task'
        entityId?: string | number
        metadata?: Record<string, any>
    }) => {
        try {
            const { trackEvent } = await import('@/app/actions/events')
            await trackEvent(payload as any)
        } catch (trackError) {
            console.error('[Tareas] Tracking error (non-blocking):', trackError)
        }
    }

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
        } catch (error: any) {
            console.error('Error fetching tasks:', JSON.stringify(error, null, 2))
            if (error) alert(`Error cargando tareas: ${error.message || 'Error desconocido'}`)
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
                const { data: createdTask, error } = await (supabase.from('tareas') as any).insert({
                    ...data,
                    vendedor_id: auth.user?.id
                }).select('id, lead_id, prioridad').single()
                if (error) throw error
                void emitTrackingEvent({
                    eventType: 'task_created',
                    entityType: 'task',
                    entityId: createdTask?.id,
                    metadata: {
                        lead_id: createdTask?.lead_id,
                        prioridad: createdTask?.prioridad
                    }
                })
            } else {
                const { error } = await (supabase
                    .from('tareas') as any)
                    .update(data)
                    .eq('id', currentTask?.id)
                if (error) throw error
                void emitTrackingEvent({
                    eventType: 'task_updated',
                    entityType: 'task',
                    entityId: currentTask?.id,
                    metadata: {
                        lead_id: data.lead_id || currentTask?.lead_id,
                        estado: data.estado || currentTask?.estado,
                        prioridad: data.prioridad || currentTask?.prioridad
                    }
                })
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
            // Optimistic UI update - remove immediately
            setTasks(prev => prev.filter(t => t.id !== deleteId))
            setIsDeleteModalOpen(false)
            const taskIdToDelete = deleteId
            setDeleteId(null)

            // Delete from database
            const { error } = await supabase.from('tareas').delete().eq('id', taskIdToDelete)
            if (error) {
                // If error, revert by fetching fresh data
                await fetchTasks()
                throw error
            }
            void emitTrackingEvent({
                eventType: 'task_deleted',
                entityType: 'task',
                entityId: taskIdToDelete
            })
        } catch (error: any) {
            alert('Error al eliminar: ' + error.message)
        }
    }

    const handleToggleStatusClick = (task: Task) => {
        setTaskToToggle(task)
        setIsStatusModalOpen(true)
    }

    const confirmToggleStatus = async () => {
        if (!taskToToggle) return
        const newStatus = taskToToggle.estado === 'completada' ? 'pendiente' : 'completada'
        try {
            const { error } = await (supabase
                .from('tareas') as any)
                .update({ estado: newStatus })
                .eq('id', taskToToggle.id)
            if (error) throw error
            void emitTrackingEvent({
                eventType: 'task_status_changed',
                entityType: 'task',
                entityId: taskToToggle.id,
                metadata: {
                    from: taskToToggle.estado,
                    to: newStatus,
                    lead_id: taskToToggle.lead_id
                }
            })
            setIsStatusModalOpen(false)
            setTaskToToggle(null)
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

        const filtered = tasks.filter(task => {
            if (!search) return true
            const query = search.toLowerCase()
            return (
                task.titulo.toLowerCase().includes(query) ||
                task.descripcion?.toLowerCase().includes(query) ||
                task.cliente_nombre?.toLowerCase().includes(query) ||
                task.cliente_empresa?.toLowerCase().includes(query)
            )
        })

        filtered.forEach(task => {
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
    }, [tasks, search])

    return (
        <div className='min-h-full flex flex-col p-8 overflow-y-auto custom-scrollbar' style={{ background: 'transparent' }}>
            <div className='max-w-7xl mx-auto space-y-10 w-full'>
                {/* External Header - Page Level */}
                <div className='flex flex-col md:flex-row md:items-center justify-between gap-6'>
                    <div className='flex items-center gap-8'>
                        <div className='flex items-center gap-6'>
                            <div className='w-16 h-16 rounded-[22px] flex items-center justify-center border shadow-lg overflow-hidden transition-all hover:scale-105 ah-window-title-icon-shell'>
                                <CheckSquare size={36} strokeWidth={1.5} className="ah-window-title-icon" />
                            </div>
                            <div>
                                <h1 className='text-4xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>
                                    Tareas & Seguimiento
                                </h1>
                                <p className='font-medium' style={{ color: 'var(--text-secondary)' }}>
                                    Organiza tus actividades diarias y compromisos comerciales.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className='flex items-center gap-4 p-2 rounded-2xl shadow-sm border' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                        <button
                            onClick={fetchTasks}
                            className='px-5 py-2.5 border-2 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all hover:bg-blue-500/10 hover:border-blue-500 hover:text-blue-500 group'
                            style={{
                                background: 'var(--card-bg)',
                                borderColor: 'var(--card-border)',
                                color: 'var(--text-primary)'
                            }}
                        >
                            <div className='flex items-center gap-2'>
                                <span>Refrescar</span>
                                <RotateCw size={12} strokeWidth={2.5} className='transition-transform group-hover:rotate-180' />
                            </div>
                        </button>
                        <button
                            onClick={() => { setModalMode('create'); setCurrentTask(null); setIsModalOpen(true); }}
                            className='px-8 py-3 bg-[#2048FF] text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2'
                        >
                            <Plus size={16} />
                            Nueva Tarea
                        </button>
                    </div>
                </div>

                {/* Search Bar Standardized */}
                <div className='relative w-full max-w-2xl mx-auto'>
                    <div className='absolute left-5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]'>
                        <Search size={20} />
                    </div>
                    <input
                        type="text"
                        placeholder="Buscar por título, cliente, empresa o descripción..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className='ah-search-input rounded-[22px] text-sm font-bold pl-14 pr-6'
                    />
                </div>

                {/* Dashboard Area */}
                <div className='space-y-12 pb-10'>
                    {Object.entries(groupedTasks).map(([groupName, groupTasks]) => {
                        if (groupTasks.length === 0 && groupName !== 'Hoy') return null

                        return (
                            <div key={groupName} className='space-y-6'>
                                <div className='flex items-center justify-between'>
                                    <div className='flex items-center gap-4'>
                                        <div
                                            className={`px-5 py-2 rounded-[20px] shadow-sm border-2 flex items-center gap-2 ${groupName === 'Hoy' ? 'shadow-lg shadow-blue-500/20' : ''}`}
                                            style={
                                                groupName === 'Atrasadas'
                                                    ? { background: 'rgba(239, 68, 68, 0.12)', borderColor: 'rgba(239, 68, 68, 0.35)', color: 'var(--text-primary)' }
                                                    : groupName === 'Hoy'
                                                        ? { background: 'var(--accent-secondary)', borderColor: 'var(--accent-secondary)', color: '#fff' }
                                                        : groupName === 'Completadas'
                                                            ? { background: 'rgba(16, 185, 129, 0.14)', borderColor: 'rgba(16, 185, 129, 0.35)', color: 'var(--text-primary)' }
                                                            : { background: 'var(--card-bg)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }
                                            }
                                        >
                                            {groupName === 'Atrasadas' && <AlertCircle size={14} />}
                                            {groupName === 'Hoy' && <Clock size={14} />}
                                            {groupName === 'Completadas' && <CheckCircle2 size={14} />}
                                            <h2 className='text-xs font-black uppercase tracking-[0.2em]'>{groupName}</h2>
                                        </div>
                                        <div className='h-px bg-[var(--card-border)] w-24 opacity-30' />
                                        <span className='text-[10px] font-black opacity-30 uppercase tracking-[0.1em]' style={{ color: 'var(--text-primary)' }}>{groupTasks.length} Tareas</span>
                                    </div>
                                </div>

                                {groupTasks.length === 0 ? (
                                    <div className='p-16 border-2 border-dashed rounded-[40px] flex flex-col items-center text-center' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                                        <div className='w-16 h-16 rounded-[22px] flex items-center justify-center mb-4 transition-all hover:scale-110 shadow-inner' style={{ background: 'var(--background)' }}>
                                            <ListTodo size={32} className='opacity-10' />
                                        </div>
                                        <p className='text-sm font-black' style={{ color: 'var(--text-primary)' }}>Panel Limpio</p>
                                        <p className='text-[10px] font-bold uppercase tracking-widest opacity-40' style={{ color: 'var(--text-secondary)' }}>No hay actividades pendientes para hoy</p>
                                    </div>
                                ) : (
                                    <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
                                        {groupTasks.map(task => (
                                            <div
                                                key={task.id}
                                                className={`group p-8 rounded-[40px] border-2 transition-all hover:shadow-[0_20px_50px_rgba(0,0,0,0.1)] relative cursor-pointer ${task.estado === 'completada' ? 'opacity-80' : ''}`}
                                                style={{
                                                    background: groupName === 'Atrasadas' && task.estado !== 'completada'
                                                        ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.10) 0%, rgba(239, 68, 68, 0.04) 28%, var(--card-bg) 100%)'
                                                        : 'var(--card-bg)',
                                                    borderColor: 'var(--card-border)'
                                                }}
                                                onClick={() => { setModalMode('edit'); setCurrentTask(task); setIsModalOpen(true); }}
                                            >
                                                {/* Priority Indicator */}
                                                <div
                                                    className='absolute top-8 right-8 px-3 py-1.2 rounded-xl text-[9px] font-black uppercase tracking-widest border-2 shadow-sm'
                                                    style={
                                                        task.prioridad === 'alta'
                                                            ? { background: 'rgba(239, 68, 68, 0.13)', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.35)' }
                                                            : task.prioridad === 'media'
                                                                ? { background: 'rgba(245, 158, 11, 0.14)', color: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.35)' }
                                                                : { background: 'var(--hover-bg)', color: 'var(--text-secondary)', borderColor: 'var(--card-border)' }
                                                    }
                                                >
                                                    {task.prioridad}
                                                </div>

                                                <div className='flex gap-5 items-start mb-8'>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleToggleStatusClick(task); }}
                                                        className={`w-10 h-10 rounded-[14px] border-2 flex items-center justify-center transition-all flex-shrink-0 shadow-sm ${task.estado === 'completada'
                                                            ? 'bg-emerald-500 border-emerald-500 text-white rotate-[360deg]'
                                                            : 'bg-white border-gray-200 hover:border-blue-500 group-hover:scale-110'}`}
                                                    >
                                                        {task.estado === 'completada' ? <CheckCircle2 size={18} /> : null}
                                                    </button>
                                                    <div className='min-w-0 flex-1 mt-1'>
                                                        <h3 className={`text-xl font-black leading-tight truncate pr-14 transition-all ${task.estado === 'completada' ? 'line-through opacity-40' : ''}`}
                                                            style={{ color: 'var(--text-primary)' }}
                                                        >
                                                            {task.titulo}
                                                        </h3>
                                                        <div className='flex flex-wrap items-center gap-x-3 gap-y-1 mt-2'>
                                                            <div className='flex items-center gap-1.5'>
                                                                <User size={10} style={{ color: 'var(--accent-secondary)' }} />
                                                                <p className='text-[10px] font-black uppercase tracking-wider truncate max-w-[120px]' style={{ color: 'var(--accent-secondary)' }}>
                                                                    {task.cliente_nombre}
                                                                </p>
                                                            </div>
                                                            <div className='w-1 h-1 rounded-full bg-gray-300' />
                                                            <div className='flex items-center gap-1.5'>
                                                                <Building2 size={10} style={{ color: 'var(--text-secondary)' }} />
                                                                <p className='text-[10px] font-bold uppercase tracking-wider truncate max-w-[120px]' style={{ color: 'var(--text-secondary)', opacity: 0.85 }}>
                                                                    {task.cliente_empresa}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                <p className='text-xs font-medium leading-relaxed mb-8 line-clamp-2' style={{ color: 'var(--text-secondary)' }}>
                                                    {task.descripcion || 'Sin descripción adicional para esta tarea.'}
                                                </p>

                                                <div className='flex items-center justify-between pt-6 border-t' style={{ borderColor: 'var(--card-border)' }}>
                                                    <div className='flex items-center gap-3'>
                                                        <div className='w-10 h-10 rounded-2xl flex items-center justify-center shadow-inner' style={{ background: 'var(--background)', color: 'var(--text-secondary)' }}>
                                                            <Calendar size={18} />
                                                        </div>
                                                        <div className='flex flex-col'>
                                                            <span className='text-[11px] font-black' style={{ color: 'var(--text-primary)' }}>
                                                                {new Date(task.fecha_vencimiento).toLocaleDateString([], { day: 'numeric', month: 'short' })}
                                                            </span>
                                                            <span className='text-[9px] font-bold opacity-40 uppercase tracking-wider' style={{ color: 'var(--text-secondary)' }}>
                                                                {new Date(task.fecha_vencimiento).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className='flex gap-2' onClick={(e) => e.stopPropagation()}>
                                                        <button
                                                            onClick={() => { setModalMode('edit'); setCurrentTask(task); setIsModalOpen(true); }}
                                                            className='w-10 h-10 bg-[var(--background)] border border-[var(--card-border)] rounded-2xl flex items-center justify-center transition-all hover:bg-blue-500/10 hover:border-blue-500 hover:text-blue-500 hover:scale-105 shadow-sm'
                                                        >
                                                            <Pencil size={14} />
                                                        </button>
                                                        <button
                                                            onClick={() => { setDeleteId(task.id); setIsDeleteModalOpen(true); }}
                                                            className='w-10 h-10 bg-[var(--background)] border border-[var(--card-border)] rounded-2xl flex items-center justify-center transition-all hover:bg-rose-500/10 hover:border-rose-500 hover:text-rose-500 hover:scale-105 shadow-sm'
                                                        >
                                                            <Trash2 size={14} />
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
                <RichardDawkinsFooter />
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
            <ConfirmModal
                isOpen={isStatusModalOpen}
                onClose={() => setIsStatusModalOpen(false)}
                onConfirm={confirmToggleStatus}
                title={taskToToggle?.estado === 'completada' ? 'Revertir a Pendiente' : 'Marcar como Completada'}
                message={taskToToggle?.estado === 'completada'
                    ? '¿Deseas marcar esta tarea como pendiente nuevamente?'
                    : '¿Deseas marcar esta tarea como completada?'}
                isDestructive={false}
            />
        </div>
    )
}
