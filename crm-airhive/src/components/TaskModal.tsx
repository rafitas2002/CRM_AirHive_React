'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

interface TaskModalProps {
    isOpen: boolean
    onClose: () => void
    onSave: (data: any) => void
    initialData?: any
    leadId?: number // Pre-selected lead
    mode: 'create' | 'edit'
}

const toLocalISO = (date: Date) => {
    const tzOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
};

export default function TaskModal({
    isOpen,
    onClose,
    onSave,
    initialData,
    leadId,
    mode
}: TaskModalProps) {
    const [leads, setLeads] = useState<{ id: number, empresa: string, nombre: string }[]>([])
    const [formData, setFormData] = useState({
        lead_id: leadId || 0,
        titulo: '',
        descripcion: '',
        fecha_vencimiento: toLocalISO(new Date()),
        prioridad: 'media' as 'baja' | 'media' | 'alta',
        estado: 'pendiente' as 'pendiente' | 'completada' | 'atrasada' | 'cancelada'
    })

    const supabase = createClient()

    useEffect(() => {
        if (isOpen && !leadId) {
            fetchLeads()
        }
    }, [isOpen, leadId])

    useEffect(() => {
        if (initialData) {
            setFormData({
                lead_id: initialData.lead_id || leadId || 0,
                titulo: initialData.titulo || '',
                descripcion: initialData.descripcion || '',
                fecha_vencimiento: initialData.fecha_vencimiento ? toLocalISO(new Date(initialData.fecha_vencimiento)) : toLocalISO(new Date()),
                prioridad: initialData.prioridad || 'media',
                estado: initialData.estado || 'pendiente'
            })
        } else {
            setFormData({
                lead_id: leadId || 0,
                titulo: '',
                descripcion: '',
                fecha_vencimiento: toLocalISO(new Date()),
                prioridad: 'media',
                estado: 'pendiente'
            })
        }
    }, [initialData, isOpen, leadId])

    const fetchLeads = async () => {
        const { data } = await supabase.from('clientes').select('id, empresa, nombre').order('empresa')
        if (data) setLeads(data as any)
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (formData.lead_id === 0) {
            alert('Por favor selecciona un Lead')
            return
        }
        // Convert local input string to proper UTC ISO before sending
        const finalData = {
            ...formData,
            fecha_vencimiento: new Date(formData.fecha_vencimiento).toISOString()
        }
        onSave(finalData)
    }

    if (!isOpen) return null

    return (
        <div className='fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm'>
            <div className='bg-white rounded-[32px] w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col'>
                {/* Header */}
                <div className='bg-[#0A1635] p-6 shrink-0 flex items-center justify-between text-white'>
                    <div>
                        <h2 className='text-xl font-black tracking-tight'>
                            {mode === 'create' ? 'Nueva Tarea' : 'Editar Tarea'}
                        </h2>
                        <p className='text-blue-300 text-[10px] font-black uppercase tracking-widest mt-0.5'>Follow-up & Actividades</p>
                    </div>
                    <button onClick={onClose} className='w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 transition-all'>✕</button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className='p-8 space-y-6 overflow-y-auto custom-scrollbar'>
                    {/* Lead Selector (only if not pre-selected) */}
                    {!leadId && (
                        <div className='space-y-2'>
                            <label className='text-[10px] font-black text-gray-400 uppercase tracking-widest'>Lead Asociado *</label>
                            <select
                                required
                                value={formData.lead_id}
                                onChange={(e) => setFormData({ ...formData, lead_id: Number(e.target.value) })}
                                className='w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-bold text-[#0A1635] text-sm'
                            >
                                <option value={0}>Selecciona un cliente...</option>
                                {leads.map(l => (
                                    <option key={l.id} value={l.id}>{l.nombre} - {l.empresa}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className='space-y-2'>
                        <label className='text-[10px] font-black text-gray-400 uppercase tracking-widest'>Título de la Actividad *</label>
                        <input
                            required
                            type="text"
                            value={formData.titulo}
                            onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                            className='w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-bold text-[#0A1635] text-sm'
                            placeholder="Ej: Enviar propuesta, Llamada de seguimiento..."
                        />
                    </div>

                    <div className='grid grid-cols-2 gap-4'>
                        <div className='space-y-2'>
                            <label className='text-[10px] font-black text-gray-400 uppercase tracking-widest'>Fecha Límite</label>
                            <input
                                required
                                type="datetime-local"
                                value={formData.fecha_vencimiento}
                                onChange={(e) => setFormData({ ...formData, fecha_vencimiento: e.target.value })}
                                className='w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-bold text-[#0A1635] text-xs'
                            />
                        </div>
                        <div className='space-y-2'>
                            <label className='text-[10px] font-black text-gray-400 uppercase tracking-widest'>Prioridad</label>
                            <select
                                value={formData.prioridad}
                                onChange={(e) => setFormData({ ...formData, prioridad: e.target.value as any })}
                                className='w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-bold text-[#0A1635] text-xs uppercase'
                            >
                                <option value="baja">Baja</option>
                                <option value="media">Media</option>
                                <option value="alta">Alta</option>
                            </select>
                        </div>
                    </div>

                    <div className='space-y-2'>
                        <label className='text-[10px] font-black text-gray-400 uppercase tracking-widest'>Descripción / Notas</label>
                        <textarea
                            value={formData.descripcion}
                            onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                            className='w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-bold text-[#0A1635] text-sm min-h-[100px] resize-none'
                            placeholder="Detalles de la tarea..."
                        />
                    </div>

                    {mode === 'edit' && (
                        <div className='space-y-2 pt-2 border-t border-gray-50'>
                            <label className='text-[10px] font-black text-gray-400 uppercase tracking-widest'>Estado</label>
                            <div className='flex gap-2 overflow-x-auto pb-1 no-scrollbar'>
                                {['pendiente', 'completada', 'cancelada'].map(st => (
                                    <button
                                        key={st}
                                        type="button"
                                        onClick={() => setFormData({ ...formData, estado: st as any })}
                                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all whitespace-nowrap ${formData.estado === st
                                            ? 'bg-[#2048FF] text-white border-[#2048FF] shadow-lg shadow-blue-500/20'
                                            : 'bg-white text-gray-400 border-gray-100 hover:border-gray-200'}`}
                                    >
                                        {st}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </form>

                {/* Footer */}
                <div className='p-8 bg-gray-50 border-t border-gray-100 flex gap-3 shrink-0'>
                    <button onClick={onClose} type="button" className='flex-1 py-3 px-4 bg-white border border-gray-200 text-gray-500 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-gray-100 transition-all'>Cancelar</button>
                    <button onClick={handleSubmit} type="submit" className='flex-[2] py-3 px-4 bg-[#2048FF] text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-blue-500/20 hover:bg-[#1700AC] transition-all transform active:scale-95'>
                        {mode === 'create' ? 'Agendar Tarea' : 'Guardar Cambios'}
                    </button>
                </div>
            </div>
        </div>
    )
}
