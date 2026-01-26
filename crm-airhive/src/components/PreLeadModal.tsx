'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

interface PreLeadModalProps {
    isOpen: boolean
    onClose: () => void
    onSave: (data: any) => void
    initialData: any
    mode: 'create' | 'edit'
}

export default function PreLeadModal({
    isOpen,
    onClose,
    onSave,
    initialData,
    mode
}: PreLeadModalProps) {
    const [formData, setFormData] = useState({
        nombre_empresa: '',
        nombre_contacto: '',
        correos: [''],
        telefonos: [''],
        ubicacion: '',
        giro_empresa: '',
        notas: ''
    })

    useEffect(() => {
        if (initialData) {
            setFormData({
                nombre_empresa: initialData.nombre_empresa || '',
                nombre_contacto: initialData.nombre_contacto || '',
                correos: initialData.correos?.length > 0 ? [...initialData.correos] : [''],
                telefonos: initialData.telefonos?.length > 0 ? [...initialData.telefonos] : [''],
                ubicacion: initialData.ubicacion || '',
                giro_empresa: initialData.giro_empresa || '',
                notas: initialData.notas || ''
            })
        } else {
            setFormData({
                nombre_empresa: '',
                nombre_contacto: '',
                correos: [''],
                telefonos: [''],
                ubicacion: '',
                giro_empresa: '',
                notas: ''
            })
        }
    }, [initialData, isOpen])

    const handleAddField = (field: 'correos' | 'telefonos') => {
        setFormData(prev => ({
            ...prev,
            [field]: [...prev[field], '']
        }))
    }

    const handleRemoveField = (field: 'correos' | 'telefonos', index: number) => {
        if (formData[field].length === 1) return
        setFormData(prev => ({
            ...prev,
            [field]: prev[field].filter((_, i) => i !== index)
        }))
    }

    const handleFieldChange = (field: 'correos' | 'telefonos', index: number, value: string) => {
        const newArr = [...formData[field]]
        newArr[index] = value
        setFormData(prev => ({ ...prev, [field]: newArr }))
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        // Clean empty values
        const cleaned = {
            ...formData,
            correos: formData.correos.filter(c => c.trim() !== ''),
            telefonos: formData.telefonos.filter(t => t.trim() !== '')
        }
        onSave(cleaned)
    }

    if (!isOpen) return null

    return (
        <div className='fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm'>
            <div className='bg-white rounded-[32px] w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-200'>
                {/* Header */}
                <div className='bg-[#0A1635] p-8 shrink-0 flex items-center justify-between'>
                    <div>
                        <h2 className='text-2xl font-black text-white tracking-tight'>
                            {mode === 'create' ? 'Nuevo Pre-Lead' : 'Editar Pre-Lead'}
                        </h2>
                        <p className='text-blue-300 text-xs font-bold uppercase tracking-widest mt-1'>Registro de prospecto inicial</p>
                    </div>
                    <button
                        onClick={onClose}
                        className='w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/20 transition-all'
                    >
                        ✕
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className='flex-1 overflow-y-auto p-8 custom-scrollbar'>
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                        <div className='space-y-2'>
                            <label className='text-[10px] font-black text-gray-400 uppercase tracking-widest'>Empresa *</label>
                            <input
                                required
                                type="text"
                                value={formData.nombre_empresa}
                                onChange={(e) => setFormData({ ...formData, nombre_empresa: e.target.value })}
                                className='w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-bold text-[#0A1635] transition-all'
                                placeholder="Nombre de la compañía"
                            />
                        </div>

                        <div className='space-y-2'>
                            <label className='text-[10px] font-black text-gray-400 uppercase tracking-widest'>Giro de la Empresa</label>
                            <input
                                type="text"
                                value={formData.giro_empresa}
                                onChange={(e) => setFormData({ ...formData, giro_empresa: e.target.value })}
                                className='w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-bold text-[#0A1635] transition-all'
                                placeholder="Ej: Tecnología, Retail..."
                            />
                        </div>

                        <div className='space-y-2'>
                            <label className='text-[10px] font-black text-gray-400 uppercase tracking-widest'>Persona de Contacto</label>
                            <input
                                type="text"
                                value={formData.nombre_contacto}
                                onChange={(e) => setFormData({ ...formData, nombre_contacto: e.target.value })}
                                className='w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-bold text-[#0A1635] transition-all'
                                placeholder="Nombre completo"
                            />
                        </div>

                        <div className='space-y-2'>
                            <label className='text-[10px] font-black text-gray-400 uppercase tracking-widest'>Ubicación</label>
                            <input
                                type="text"
                                value={formData.ubicacion}
                                onChange={(e) => setFormData({ ...formData, ubicacion: e.target.value })}
                                className='w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-bold text-[#0A1635] transition-all'
                                placeholder="Ciudad, Estado, etc."
                            />
                        </div>

                        <div className='space-y-4 md:col-span-2 mt-4'>
                            <div className='flex items-center justify-between border-b border-gray-100 pb-2'>
                                <label className='text-[10px] font-black text-[#2048FF] uppercase tracking-widest'>Correos Electrónicos</label>
                                <button
                                    type="button"
                                    onClick={() => handleAddField('correos')}
                                    className='text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-md hover:bg-blue-100'
                                >
                                    + Añadir
                                </button>
                            </div>
                            <div className='space-y-3'>
                                {formData.correos.map((correo, index) => (
                                    <div key={index} className='flex gap-2 animate-in slide-in-from-left-2 duration-200'>
                                        <input
                                            type="email"
                                            value={correo}
                                            onChange={(e) => handleFieldChange('correos', index, e.target.value)}
                                            className='flex-1 px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-bold text-xs text-[#0A1635]'
                                            placeholder="correo@ejemplo.com"
                                        />
                                        {formData.correos.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveField('correos', index)}
                                                className='p-2 text-red-400 hover:text-red-600'
                                            >
                                                🗑️
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className='space-y-4 md:col-span-2 mt-4'>
                            <div className='flex items-center justify-between border-b border-gray-100 pb-2'>
                                <label className='text-[10px] font-black text-[#2048FF] uppercase tracking-widest'>Teléfonos</label>
                                <button
                                    type="button"
                                    onClick={() => handleAddField('telefonos')}
                                    className='text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-md hover:bg-blue-100'
                                >
                                    + Añadir
                                </button>
                            </div>
                            <div className='space-y-3'>
                                {formData.telefonos.map((tel, index) => (
                                    <div key={index} className='flex gap-2 animate-in slide-in-from-left-2 duration-200'>
                                        <input
                                            type="text"
                                            value={tel}
                                            onChange={(e) => handleFieldChange('telefonos', index, e.target.value)}
                                            className='flex-1 px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-bold text-xs text-[#0A1635]'
                                            placeholder="+52 000 000 0000"
                                        />
                                        {formData.telefonos.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveField('telefonos', index)}
                                                className='p-2 text-red-400 hover:text-red-600'
                                            >
                                                🗑️
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className='space-y-2 md:col-span-2 mt-4'>
                            <label className='text-[10px] font-black text-gray-400 uppercase tracking-widest'>Notas / Observaciones</label>
                            <textarea
                                rows={4}
                                value={formData.notas}
                                onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
                                className='w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-bold text-xs text-[#0A1635] transition-all resize-none'
                                placeholder="Cualquier detalle adicional relevante..."
                            />
                        </div>
                    </div>
                </form>

                {/* Footer */}
                <div className='p-8 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-4 shrink-0'>
                    <button
                        type='button'
                        onClick={onClose}
                        className='px-6 py-2.5 rounded-xl font-black text-gray-500 hover:bg-gray-100 transition-all uppercase text-[10px] tracking-widest'
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSubmit}
                        className='px-8 py-2.5 bg-[#2048FF] text-white rounded-xl font-black shadow-xl shadow-blue-500/20 hover:bg-[#1700AC] transition-all transform active:scale-95 uppercase text-[10px] tracking-widest'
                    >
                        {mode === 'create' ? 'Guardar Pre-Lead' : 'Actualizar Cambios'}
                    </button>
                </div>
            </div>
        </div>
    )
}
