'use client'

import { useState, useEffect } from 'react'

type ClientData = {
    empresa: string
    nombre: string
    contacto: string
    etapa: string
    valor_estimado: number
    oportunidad: string
    calificacion: number
    notas: string
}

interface ClientModalProps {
    isOpen: boolean
    onClose: () => void
    onSave: (data: ClientData) => Promise<void>
    initialData?: ClientData | null
    mode: 'create' | 'edit'
}

export default function ClientModal({
    isOpen,
    onClose,
    onSave,
    initialData,
    mode
}: ClientModalProps) {
    const [formData, setFormData] = useState<ClientData>({
        empresa: '',
        nombre: '',
        contacto: '',
        etapa: 'Prospección',
        valor_estimado: 0,
        oportunidad: '',
        calificacion: 3,
        notas: ''
    })
    const [isSubmitting, setIsSubmitting] = useState(false)

    useEffect(() => {
        if (isOpen && initialData) {
            setFormData(initialData)
        } else if (isOpen && !initialData) {
            // Reset form for create mode
            setFormData({
                empresa: '',
                nombre: '',
                contacto: '',
                etapa: 'Prospección',
                valor_estimado: 0,
                oportunidad: '',
                calificacion: 3,
                notas: ''
            })
        }
    }, [isOpen, initialData])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSubmitting(true)
        try {
            await onSave(formData)
            onClose()
        } catch (error) {
            console.error('Error saving client:', error)
        } finally {
            setIsSubmitting(false)
        }
    }

    if (!isOpen) return null

    return (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity'>
            <div className='w-full max-w-lg bg-white rounded-2xl shadow-2xl transform transition-all overflow-hidden flex flex-col max-h-[90vh]'>
                {/* Header */}
                <div className='bg-[#0F2A44] px-6 py-4 flex items-center justify-between shrink-0'>
                    <h2 className='text-xl font-bold text-white'>
                        {mode === 'create' ? 'Nuevo cliente' : 'Editar cliente'}
                    </h2>
                    <button
                        onClick={onClose}
                        className='text-white/70 hover:text-white transition-colors'
                    >
                        ✕
                    </button>
                </div>

                {/* Body */}
                <div className='p-6 overflow-y-auto custom-scrollbar space-y-4'>
                    <form id='client-form' onSubmit={handleSubmit} className='space-y-4'>
                        {/* Empresa */}
                        <div className='space-y-1.5'>
                            <label className='block text-sm font-medium text-[#0F2A44]'>
                                Empresa
                            </label>
                            <input
                                type='text'
                                required
                                placeholder='ej. Rayados'
                                value={formData.empresa}
                                onChange={(e) => setFormData({ ...formData, empresa: e.target.value })}
                                className='w-full px-3 py-2 border border-[#BDBBC7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent text-[#000000] placeholder-[#BDBBC7] transition-all'
                            />
                        </div>

                        {/* Nombre */}
                        <div className='space-y-1.5'>
                            <label className='block text-sm font-medium text-[#0F2A44]'>
                                Nombre
                            </label>
                            <input
                                type='text'
                                required
                                value={formData.nombre}
                                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                                className='w-full px-3 py-2 border border-[#BDBBC7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent text-[#000000] placeholder-[#BDBBC7] transition-all'
                            />
                        </div>

                        {/* Contacto */}
                        <div className='space-y-1.5'>
                            <label className='block text-sm font-medium text-[#0F2A44]'>
                                Contacto
                            </label>
                            <input
                                type='text'
                                value={formData.contacto}
                                onChange={(e) => setFormData({ ...formData, contacto: e.target.value })}
                                className='w-full px-3 py-2 border border-[#BDBBC7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent text-[#000000] placeholder-[#BDBBC7] transition-all'
                            />
                        </div>

                        {/* Prospección (Etapa) */}
                        <div className='space-y-1.5'>
                            <label className='block text-sm font-medium text-[#0F2A44]'>
                                Etapa
                            </label>
                            <div className='relative'>
                                <select
                                    value={formData.etapa}
                                    onChange={(e) => setFormData({ ...formData, etapa: e.target.value })}
                                    className='w-full px-3 py-2 appearance-none border border-[#BDBBC7] bg-[#F5F6F8] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF] text-[#000000] transition-all cursor-pointer'
                                >
                                    <option value='Prospección'>Prospección</option>
                                    <option value='Negociación'>Negociación</option>
                                    <option value='Cerrado'>Cerrado</option>
                                </select>
                                <div className='absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#667085]'>
                                    ▼
                                </div>
                            </div>
                        </div>

                        {/* Valor Estimado */}
                        <div className='space-y-1.5'>
                            <label className='block text-sm font-medium text-[#0F2A44]'>
                                Valor Estimado
                            </label>
                            <input
                                type='number'
                                min='0'
                                value={formData.valor_estimado}
                                onChange={(e) => setFormData({ ...formData, valor_estimado: Number(e.target.value) })}
                                className='w-full px-3 py-2 border border-[#BDBBC7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent text-[#000000] placeholder-[#BDBBC7] transition-all'
                            />
                        </div>

                        {/* Oportunidad */}
                        <div className='space-y-1.5'>
                            <label className='block text-sm font-medium text-[#0F2A44]'>
                                Oportunidad
                            </label>
                            <textarea
                                placeholder='Descripción breve de la oportunidad'
                                rows={3}
                                value={formData.oportunidad}
                                onChange={(e) => setFormData({ ...formData, oportunidad: e.target.value })}
                                className='w-full px-3 py-2 border border-[#BDBBC7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent text-[#000000] placeholder-[#BDBBC7] transition-all resize-none'
                            />
                        </div>

                        {/* Calificación (Slider) */}
                        <div className='space-y-1.5'>
                            <div className='flex justify-between items-center'>
                                <label className='block text-sm font-medium text-[#0F2A44]'>
                                    Calificación
                                </label>
                                <span className='font-bold text-[#0F2A44] text-sm'>
                                    {formData.calificacion}/5
                                </span>
                            </div>
                            <input
                                type='range'
                                min='1'
                                max='5'
                                step='1'
                                value={formData.calificacion}
                                onChange={(e) => setFormData({ ...formData, calificacion: Number(e.target.value) })}
                                className='w-full h-2 bg-[#E0E0E0] rounded-lg appearance-none cursor-pointer accent-[#2048FF]'
                            />
                            <div className='flex justify-between text-xs text-[#667085] px-1'>
                                <span>1</span>
                                <span>2</span>
                                <span>3</span>
                                <span>4</span>
                                <span>5</span>
                            </div>
                        </div>

                        {/* Notas */}
                        <div className='space-y-1.5'>
                            <label className='block text-sm font-medium text-[#0F2A44]'>
                                Notas
                            </label>
                            <textarea
                                rows={3}
                                value={formData.notas}
                                onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
                                className='w-full px-3 py-2 border border-[#BDBBC7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent text-[#000000] placeholder-[#BDBBC7] transition-all resize-none'
                            />
                        </div>
                    </form>
                </div>

                {/* Footer */}
                <div className='bg-[#F5F6F8] px-6 py-4 flex items-center justify-end gap-3 shrink-0 border-t border-[#E0E0E0]'>
                    <button
                        type='button'
                        onClick={onClose}
                        className='px-4 py-2 text-[#667085] font-medium hover:text-[#0F2A44] transition-colors bg-white border border-[#BDBBC7] rounded-lg shadow-sm hover:shadow hover:border-[#667085]'
                    >
                        Cancelar
                    </button>
                    <button
                        type='submit'
                        form='client-form'
                        disabled={isSubmitting}
                        className='px-6 py-2 bg-[#2048FF] text-white font-medium rounded-lg shadow-md hover:bg-[#1700AC] transition-all disabled:opacity-50 disabled:cursor-not-allowed transform active:scale-95'
                    >
                        {isSubmitting ? 'Guardando...' : 'Aceptar'}
                    </button>
                </div>
            </div>
        </div>
    )
}
