'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import {
    Phone,
    Video,
    Users,
    Mail,
    Plus,
    Pencil,
    X,
    Check,
    ChevronDown,
    Calendar,
    Pin
} from 'lucide-react'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'

interface TaskModalProps {
    isOpen: boolean
    onClose: () => void
    onSave: (data: any) => void
    initialData?: any
    leadId?: number
    leadOptions?: { id: number, empresa: string, nombre: string }[]
    mode: 'create' | 'edit'
}

const toLocalISO = (date: Date) => {
    const tzOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
};

const activityTypes = [
    { id: 'Llamada', label: 'Llamada', icon: Phone, color: 'text-blue-400' },
    { id: 'Videollamada', label: 'Videollamada', icon: Video, color: 'text-purple-400' },
    { id: 'Reunión Presencial', label: 'Reunión Presencial', icon: Users, color: 'text-amber-400' },
    { id: 'Correo', label: 'Correo / Mensaje', icon: Mail, color: 'text-emerald-400' },
    { id: 'Otro', label: 'Otro', icon: Pin, color: 'text-rose-400' },
]

export default function TaskModal({
    isOpen,
    onClose,
    onSave,
    initialData,
    leadId,
    leadOptions,
    mode
}: TaskModalProps) {
    useBodyScrollLock(isOpen)
    const [leads, setLeads] = useState<{ id: number, empresa: string, nombre: string }[]>([])
    const [users, setUsers] = useState<{ id: string, full_name: string }[]>([])
    const [formData, setFormData] = useState({
        lead_id: leadId || 0,
        asignado_a: '',
        titulo: '',
        tipo_actividad: 'Llamada',
        descripcion: '',
        fecha_vencimiento: toLocalISO(new Date()),
        prioridad: 'media' as 'baja' | 'media' | 'alta',
        estado: 'pendiente' as 'pendiente' | 'completada' | 'atrasada' | 'cancelada'
    })

    const [isDropdownOpen, setIsDropdownOpen] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)

    // Modification Tracking State
    const [changeReason, setChangeReason] = useState('')
    const [changeOrigin, setChangeOrigin] = useState<'Cliente' | 'Interno' | 'Corrección' | 'Otro' | null>(null)
    const [showChangeForm, setShowChangeForm] = useState(false)
    const [changesDetected, setChangesDetected] = useState<string[]>([])
    const [isModificationMode, setIsModificationMode] = useState(false)

    const supabase = createClient()

    useEffect(() => {
        if (isOpen) {
            if (!leadId) {
                if (Array.isArray(leadOptions) && leadOptions.length > 0) {
                    setLeads(leadOptions)
                } else {
                    fetchLeads()
                }
            }
            fetchUsers()
        }
    }, [isOpen, leadId, leadOptions])

    useEffect(() => {
        if (initialData) {
            setFormData({
                lead_id: initialData.lead_id || leadId || 0,
                asignado_a: initialData.asignado_a || '',
                titulo: initialData.titulo || '',
                tipo_actividad: initialData.tipo_actividad || 'Llamada',
                descripcion: initialData.descripcion || '',
                fecha_vencimiento: initialData.fecha_vencimiento ? toLocalISO(new Date(initialData.fecha_vencimiento)) : toLocalISO(new Date()),
                prioridad: initialData.prioridad || 'media',
                estado: initialData.estado || 'pendiente'
            })
            setIsModificationMode(false)
        } else {
            setFormData({
                lead_id: leadId || 0,
                asignado_a: '',
                titulo: '',
                tipo_actividad: 'Llamada',
                descripcion: '',
                fecha_vencimiento: toLocalISO(new Date()),
                prioridad: 'media',
                estado: 'pendiente'
            })
            setIsModificationMode(true)
        }
        setShowChangeForm(false)
        setChangeReason('')
        setChangeOrigin(null)
        setChangesDetected([])
    }, [initialData, isOpen, leadId])

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const fetchLeads = async () => {
        const { data } = await supabase.from('clientes').select('id, empresa, nombre').order('empresa')
        if (data) setLeads(data as any)
    }

    const fetchUsers = async () => {
        const { data } = await supabase.from('profiles').select('id, full_name').order('full_name')
        if (data) setUsers(data as any)
    }

    useEffect(() => {
        if (mode !== 'edit' || !initialData) return

        const detected = []
        const initialDate = initialData.fecha_vencimiento ? new Date(initialData.fecha_vencimiento).toISOString().slice(0, 16) : ''
        const newDate = new Date(formData.fecha_vencimiento).toISOString().slice(0, 16)

        if (initialDate !== newDate) detected.push('Fecha')
        if (initialData.tipo_actividad !== formData.tipo_actividad) detected.push('Tipo de Actividad')

        setChangesDetected(detected)
        setShowChangeForm(isModificationMode && detected.length > 0)
    }, [formData.fecha_vencimiento, formData.tipo_actividad, initialData, mode, isModificationMode])


    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (formData.lead_id === 0) {
            alert('Por favor selecciona un Lead')
            return
        }

        if (mode === 'edit' && showChangeForm && !changeReason.trim()) {
            alert('Por favor indica el motivo del cambio.')
            return
        }

        if (mode === 'edit' && showChangeForm && !changeOrigin) {
            alert('Por favor indica quién solicitó el cambio.')
            return
        }

        const finalData = {
            ...formData,
            titulo: formData.tipo_actividad,
            fecha_vencimiento: new Date(formData.fecha_vencimiento).toISOString()
        }

        if (mode === 'edit' && changesDetected.length > 0) {
            const { data: { user } } = await supabase.auth.getUser()

            const { error: logError } = await (supabase
                .from('historial_modificaciones_tareas') as any)
                .insert({
                    tarea_id: initialData.id,
                    user_id: user?.id || null,
                    campo_modificado: changesDetected.join(', '),
                    valor_anterior: String(changesDetected.includes('Fecha') ? initialData.fecha_vencimiento : initialData.tipo_actividad),
                    valor_nuevo: String(changesDetected.includes('Fecha') ? finalData.fecha_vencimiento : finalData.tipo_actividad),
                    motivo: changeReason,
                    origen_cambio: changeOrigin || 'Otro'
                })
            if (logError) console.error('Error log modification:', logError)
        }

        onSave(finalData)
    }

    if (!isOpen) return null

    const currentActivity = activityTypes.find(a => a.id === formData.tipo_actividad) || activityTypes[0]

    return (
        <div className='ah-modal-overlay'>
            <div className='ah-modal-panel w-full max-w-lg animate-in zoom-in-95 duration-200'>
                {/* Header */}
                <div className='ah-modal-header'>
                    <div>
                        <h2 className='ah-modal-title'>
                            {mode === 'create' ? 'Nueva Tarea' : (isModificationMode ? 'Editar Tarea' : 'Detalles de Tarea')}
                        </h2>
                        <p className='ah-modal-subtitle'>Follow-up & Actividades</p>
                    </div>
                    <div className='flex items-center gap-2'>
                        {mode === 'edit' && !isModificationMode && (
                            <button
                                onClick={() => setIsModificationMode(true)}
                                className='w-8 h-8 flex items-center justify-center rounded-lg bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white transition-all'
                                title="Modificar Tarea"
                            >
                                <Pencil size={16} />
                            </button>
                        )}
                        <button onClick={onClose} className='ah-modal-close'>
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Form */}
                <form id='task-form' onSubmit={handleSubmit} className='p-8 space-y-6 overflow-y-auto custom-scrollbar flex-1 min-h-0'>
                    <div className='ah-required-note' role='note'>
                        <span className='ah-required-note-dot' aria-hidden='true' />
                        Campos obligatorios: se marcan en rojo solo si faltan al confirmar
                    </div>

                    {!leadId && (
                        <div className='space-y-2'>
                            <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest ah-required-label'>Lead Asociado <span className='ah-required-asterisk'>*</span></label>
                            <select
                                required
                                disabled={mode === 'edit' && !isModificationMode}
                                value={formData.lead_id || ''}
                                onChange={(e) => setFormData({ ...formData, lead_id: Number(e.target.value) })}
                                className={`w-full px-4 py-3 border border-[var(--input-border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2048FF]/20 focus:border-[#2048FF] font-bold text-[var(--text-primary)] text-sm
                                    ${mode === 'edit' && !isModificationMode ? 'bg-[var(--hover-bg)] opacity-70 cursor-not-allowed hidden-arrow' : 'bg-[var(--input-bg)]'}`}
                            >
                                <option value=''>Selecciona un cliente...</option>
                                {leads.map(l => (
                                    <option key={l.id} value={l.id}>{l.nombre} - {l.empresa}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className='space-y-2'>
                        <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest ah-required-label'>Tipo de Actividad <span className='ah-required-asterisk'>*</span></label>
                        <div className="relative" ref={dropdownRef}>
                            <button
                                type="button"
                                disabled={mode === 'edit' && !isModificationMode}
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                className={`ah-required-control w-full flex items-center justify-between px-4 py-3 border border-[var(--input-border)] rounded-xl transition-all font-bold text-sm
                                    ${mode === 'edit' && !isModificationMode
                                        ? 'bg-[var(--hover-bg)] opacity-70 cursor-not-allowed'
                                        : 'bg-[var(--input-bg)] hover:border-[#2048FF] focus:ring-2 focus:ring-[#2048FF]/20'}`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-[#0A1635] flex items-center justify-center">
                                        <currentActivity.icon size={16} className={currentActivity.color} />
                                    </div>
                                    <span className="text-[var(--text-primary)]">{currentActivity.label}</span>
                                </div>
                                <ChevronDown size={16} className={`text-[var(--text-secondary)] transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {isDropdownOpen && (
                                <div className="absolute z-50 w-full mt-2 bg-[#1C1F26] border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                    {activityTypes.map((type) => (
                                        <button
                                            key={type.id}
                                            type="button"
                                            onClick={() => {
                                                setFormData({ ...formData, tipo_actividad: type.id })
                                                setIsDropdownOpen(false)
                                            }}
                                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors group"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-[#0A1635] flex items-center justify-center transition-transform group-hover:scale-110">
                                                    <type.icon size={16} className={type.color} />
                                                </div>
                                                <span className="text-white text-sm font-bold">{type.label}</span>
                                            </div>
                                            {formData.tipo_actividad === type.id && (
                                                <Check size={16} className="text-[#2048FF]" />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {showChangeForm && (
                        <div className='p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-4 animate-in fade-in slide-in-from-top-2'>
                            <div className='flex items-center justify-between text-amber-600'>
                                <span className='text-xs font-black uppercase tracking-widest'>⚠️ Registro de Cambios</span>
                            </div>

                            <div className='space-y-2'>
                                <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest ah-required-label'>¿Por qué se realizó este cambio? <span className='ah-required-asterisk'>*</span></label>
                                <textarea
                                    required
                                    value={changeReason}
                                    onChange={(e) => setChangeReason(e.target.value)}
                                    className='w-full px-3 py-2 bg-[var(--card-bg)] border border-[var(--input-border)] rounded-lg text-xs font-bold'
                                    placeholder="Ej: El cliente solicitó reagendar..."
                                />
                            </div>

                            <div className='space-y-2'>
                                <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest'>¿Quién solicitó el cambio?</label>
                                <div className='flex flex-wrap gap-2'>
                                    {['Cliente', 'Interno', 'Corrección', 'Otro'].map(origin => (
                                        <button
                                            key={origin}
                                            type="button"
                                            onClick={() => setChangeOrigin(origin as any)}
                                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all ${changeOrigin === origin
                                                ? 'bg-amber-500 text-white border-amber-500'
                                                : 'bg-transparent text-[var(--text-secondary)] border-[var(--input-border)] hover:border-amber-500'
                                                }`}
                                        >
                                            {origin === 'Corrección' ? 'Error/Corrección' : origin}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className='grid grid-cols-2 gap-4'>
                        <div className='space-y-2'>
                            <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest ah-required-label'>Fecha Límite <span className='ah-required-asterisk'>*</span></label>
                            <input
                                required
                                disabled={mode === 'edit' && !isModificationMode}
                                type="datetime-local"
                                value={formData.fecha_vencimiento}
                                onChange={(e) => setFormData({ ...formData, fecha_vencimiento: e.target.value })}
                                className={`w-full px-4 py-3 border border-[var(--input-border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2048FF]/20 focus:border-[#2048FF] font-bold text-[var(--text-primary)] text-xs
                                    ${mode === 'edit' && !isModificationMode ? 'bg-[var(--hover-bg)] opacity-70 cursor-not-allowed' : 'bg-[var(--input-bg)]'}`}
                            />
                        </div>
                        <div className='space-y-2'>
                            <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest'>Prioridad</label>
                            <select
                                disabled={mode === 'edit' && !isModificationMode}
                                value={formData.prioridad}
                                onChange={(e) => setFormData({ ...formData, prioridad: e.target.value as any })}
                                className={`w-full px-4 py-3 border border-[var(--input-border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2048FF]/20 focus:border-[#2048FF] font-bold text-[var(--text-primary)] text-xs uppercase
                                    ${mode === 'edit' && !isModificationMode ? 'bg-[var(--hover-bg)] opacity-70 cursor-not-allowed hidden-arrow' : 'bg-[var(--input-bg)]'}`}
                            >
                                <option value="baja">Baja</option>
                                <option value="media">Media</option>
                                <option value="alta">Alta</option>
                            </select>
                        </div>
                    </div>

                    <div className='space-y-2'>
                        <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest'>Asignar a (Opcional)</label>
                        <select
                            disabled={mode === 'edit' && !isModificationMode}
                            value={formData.asignado_a}
                            onChange={(e) => setFormData({ ...formData, asignado_a: e.target.value })}
                            className={`w-full px-4 py-3 border border-[var(--input-border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2048FF]/20 focus:border-[#2048FF] font-bold text-[var(--text-primary)] text-sm
                                ${mode === 'edit' && !isModificationMode ? 'bg-[var(--hover-bg)] opacity-70 cursor-not-allowed hidden-arrow' : 'bg-[var(--input-bg)]'}`}
                        >
                            <option value="">Selecciona un usuario...</option>
                            {users.map(u => (
                                <option key={u.id} value={u.id}>{u.full_name}</option>
                            ))}
                        </select>
                    </div>

                    <div className='space-y-2'>
                        <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest'>Descripción / Notas</label>
                        <textarea
                            disabled={mode === 'edit' && !isModificationMode}
                            value={formData.descripcion}
                            onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                            className={`w-full px-4 py-3 border border-[var(--input-border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2048FF]/20 focus:border-[#2048FF] font-bold text-[var(--text-primary)] text-sm min-h-[100px] resize-none placeholder-[var(--text-secondary)]
                                ${mode === 'edit' && !isModificationMode ? 'bg-[var(--hover-bg)] opacity-70 cursor-not-allowed' : 'bg-[var(--input-bg)]'}`}
                            placeholder="Detalles de la tarea..."
                        />
                    </div>

                    {mode === 'edit' && (
                        <div className='space-y-2 pt-2 border-t border-[var(--card-border)]'>
                            <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest'>Estado</label>
                            <div className='flex gap-2 overflow-x-auto pb-1 no-scrollbar'>
                                {['pendiente', 'completada', 'cancelada'].map(st => (
                                    <button
                                        key={st}
                                        type="button"
                                        disabled={mode === 'edit' && !isModificationMode}
                                        onClick={() => setFormData({ ...formData, estado: st as any })}
                                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all whitespace-nowrap 
                                            ${formData.estado === st
                                                ? 'bg-[#2048FF] text-white border-[#2048FF] shadow-lg shadow-blue-500/20'
                                                : 'bg-[var(--input-bg)] text-[var(--text-secondary)] border-[var(--input-border)] hover:border-[#2048FF] hover:text-[var(--text-primary)]'}
                                            ${mode === 'edit' && !isModificationMode ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        {st}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </form>

                {/* Footer */}
                <div className='ah-modal-footer'>
                    {!isModificationMode && mode === 'edit' ? (
                        <button
                            onClick={onClose}
                            type="button"
                            className='ah-modal-btn ah-modal-btn-primary w-full'
                        >
                            Listo / Salir
                        </button>
                    ) : (
                        <>
                            <button
                                onClick={() => {
                                    if (mode === 'create') onClose()
                                    else {
                                        setFormData({
                                            lead_id: initialData.lead_id || leadId || 0,
                                            asignado_a: initialData.asignado_a || '',
                                            titulo: initialData.titulo || '',
                                            tipo_actividad: initialData.tipo_actividad || 'Llamada',
                                            descripcion: initialData.descripcion || '',
                                            fecha_vencimiento: initialData.fecha_vencimiento ? toLocalISO(new Date(initialData.fecha_vencimiento)) : toLocalISO(new Date()),
                                            prioridad: initialData.prioridad || 'media',
                                            estado: initialData.estado || 'pendiente'
                                        })
                                        setIsModificationMode(false)
                                        setShowChangeForm(false)
                                        setChangeOrigin(null)
                                        setChangeReason('')
                                    }
                                }}
                                type="button"
                                className='ah-modal-btn ah-modal-btn-secondary flex-1'
                            >
                                {mode === 'create' ? 'Cancelar' : 'Cancelar Edición'}
                            </button>
                            <button
                                type="submit"
                                form='task-form'
                                className='ah-modal-btn ah-modal-btn-primary flex-[2]'
                            >
                                {mode === 'create' ? 'Agendar Tarea' : 'Guardar Cambios'}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
