'use client'

import React, { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { isProbabilityEditable, getNextMeeting } from '@/lib/meetingsService'
import { Database } from '@/lib/supabase'

type Meeting = Database['public']['Tables']['meetings']['Row']

export type ClientData = {
    id?: number
    empresa: string
    nombre: string
    etapa: string
    valor_estimado: number
    oportunidad: string
    calificacion: number
    notas: string
    empresa_id?: string
    owner_id?: string
    probabilidad?: number
    probability_locked?: boolean | null
    next_meeting_id?: string | null
    email?: string
    telefono?: string
}

interface ClientModalProps {
    isOpen: boolean
    onClose: () => void
    onSave: (data: ClientData) => Promise<void>
    initialData?: ClientData | null
    mode: 'create' | 'edit'
    onNavigateToCompanies?: () => void
    companies?: { id: string, nombre: string }[]
}

export default function ClientModal({
    isOpen,
    onClose,
    onSave,
    initialData,
    mode,
    onNavigateToCompanies,
    companies = []
}: ClientModalProps) {
    const [formData, setFormData] = useState<ClientData>({
        empresa: '',
        nombre: '',
        etapa: 'Prospección',
        valor_estimado: 0,
        oportunidad: '',
        calificacion: 3,
        notas: '',
        empresa_id: undefined,
        probabilidad: 50,
        email: '',
        telefono: ''
    })
    const [phoneError, setPhoneError] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [filteredCompanies, setFilteredCompanies] = useState<{ id: string, nombre: string }[]>([])
    const [showSuggestions, setShowSuggestions] = useState(false)
    const wrapperRef = useRef<HTMLDivElement>(null)
    const wasOpen = useRef(false)

    // Probability editability state
    const [isProbEditable, setIsProbEditable] = useState(true)
    const [editabilityReason, setEditabilityReason] = useState('')
    const [nextMeeting, setNextMeeting] = useState<Meeting | null>(null)
    const [currentUser, setCurrentUser] = useState<any>(null)
    const [supabase] = useState(() => createClient())

    useEffect(() => {
        if (isOpen && !wasOpen.current) {
            if (initialData) {
                setFormData({
                    ...initialData,
                    email: initialData.email || '',
                    telefono: initialData.telefono || ''
                })
                if (mode === 'edit') {
                    checkProbabilityEditability()
                }
            } else {
                setFormData({
                    empresa: '',
                    nombre: '',
                    etapa: 'Prospección',
                    valor_estimado: 0,
                    oportunidad: '',
                    calificacion: 3,
                    notas: '',
                    empresa_id: undefined,
                    probabilidad: 50,
                    email: '',
                    telefono: ''
                })
                setPhoneError('')
                setIsProbEditable(true)
                setEditabilityReason('')
            }
            fetchCurrentUser()
        }
        wasOpen.current = isOpen
    }, [isOpen, initialData, mode])

    const fetchCurrentUser = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        setCurrentUser(user)
    }

    const checkProbabilityEditability = async () => {
        if (!initialData || !initialData.id) {
            setIsProbEditable(true)
            return
        }

        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const result = await isProbabilityEditable(initialData as any, user.id)
            setIsProbEditable(result.editable)
            setEditabilityReason(result.reason || '')
            setNextMeeting(result.nextMeeting || null)

            if (!result.editable && initialData.id) {
                const meeting = await getNextMeeting(initialData.id)
                setNextMeeting(meeting)
            }
        } catch (error) {
            console.error('Error checking probability editability:', error)
            setIsProbEditable(true)
        }
    }

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setShowSuggestions(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [wrapperRef])

    const handleEmpresaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value
        setFormData({ ...formData, empresa: value, empresa_id: undefined })

        if (value.length > 0) {
            const filtered = companies.filter(c =>
                c.nombre.toLowerCase().includes(value.toLowerCase())
            )
            setFilteredCompanies(filtered)
            setShowSuggestions(true)
        } else {
            setShowSuggestions(false)
        }
    }

    const selectCompany = (company: { id: string, nombre: string }) => {
        setFormData({
            ...formData,
            empresa: company.nombre,
            empresa_id: company.id
        })
        setShowSuggestions(false)
    }

    const validatePhone = (phone: string) => {
        const digits = phone.replace(/\D/g, '')
        if (digits.length !== 10) {
            setPhoneError('El teléfono debe tener exactamente 10 dígitos.')
            return false
        }
        setPhoneError('')
        return true
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!formData.empresa_id) {
            alert('Debes seleccionar una empresa de la lista.')
            return
        }

        if (formData.telefono && !validatePhone(formData.telefono)) {
            setPhoneError('El teléfono debe tener 10 dígitos.')
            return
        }

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
        <div className='fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm'>
            <div className='bg-white rounded-[32px] w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-200'>
                {/* Header Style match with Pre-Lead */}
                <div className='bg-[#0A1635] p-8 shrink-0 flex items-center justify-between'>
                    <div>
                        <h2 className='text-2xl font-black text-white tracking-tight'>
                            {mode === 'create' ? 'Nuevo Lead' : 'Editar Lead'}
                        </h2>
                        <p className='text-blue-300 text-xs font-bold uppercase tracking-widest mt-1'>Información del Prospecto</p>
                    </div>
                    <button
                        onClick={onClose}
                        className='w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/20 transition-all font-bold'
                    >
                        ✕
                    </button>
                </div>

                {/* Form Body style match with Pre-Lead */}
                <form onSubmit={handleSubmit} className='flex-1 overflow-y-auto p-8 custom-scrollbar space-y-8'>
                    {/* Sección Empresa */}
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                        <div className='space-y-2' ref={wrapperRef}>
                            <label className='text-[10px] font-black text-gray-400 uppercase tracking-widest'>Empresa *</label>
                            <div className='relative'>
                                <input
                                    required
                                    type="text"
                                    value={formData.empresa}
                                    onChange={handleEmpresaChange}
                                    readOnly={!!formData.empresa_id}
                                    className={`w-full px-4 py-3 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-bold text-[#0A1635] transition-all ${formData.empresa_id ? 'bg-blue-50/50 cursor-not-allowed' : 'bg-gray-50'}`}
                                    placeholder="Busca una empresa..."
                                    autoComplete="off"
                                />
                                {formData.empresa_id && (
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, empresa_id: undefined, empresa: '' })}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-red-500 font-black uppercase"
                                    >
                                        ✕ Cambiar
                                    </button>
                                )}
                                {!formData.empresa_id && showSuggestions && filteredCompanies.length > 0 && (
                                    <div className='absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto custom-scrollbar p-2'>
                                        {filteredCompanies.map((company) => (
                                            <div
                                                key={company.id}
                                                onClick={() => selectCompany(company)}
                                                className='px-4 py-2 hover:bg-blue-50 cursor-pointer text-xs text-[#0A1635] font-bold rounded-lg transition-colors flex items-center justify-between group'
                                            >
                                                <span>{company.nombre}</span>
                                                <span className='text-[9px] text-gray-400 group-hover:text-blue-600 uppercase tracking-tighter'>Seleccionar</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className='space-y-2'>
                            <label className='text-[10px] font-black text-gray-400 uppercase tracking-widest'>Nombre del Prospecto *</label>
                            <input
                                required
                                type="text"
                                value={formData.nombre}
                                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                                className='w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-bold text-[#0A1635] transition-all'
                                placeholder="Nombre completo"
                            />
                        </div>
                    </div>

                    {/* SECCIÓN CONTACTO SEPARADA (Como en Pre-Leads) */}
                    <div className='space-y-6 pt-4 border-t border-gray-100'>
                        <div className='flex items-center gap-2'>
                            <div className='w-1 h-4 bg-blue-500 rounded-full'></div>
                            <h3 className='text-xs font-black text-[#0A1635] uppercase tracking-widest'>Canales de Comunicación</h3>
                        </div>

                        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                            <div className='space-y-2'>
                                <label className='text-[10px] font-black text-blue-600 uppercase tracking-widest'>Correo Electrónico</label>
                                <div className='relative'>
                                    <input
                                        type='email'
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        className='w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-bold text-xs text-[#0A1635] transition-all'
                                        placeholder='ejemplo@empresa.com'
                                    />
                                    <div className='absolute left-1/2 -bottom-2 w-0 h-0.5 bg-blue-500 transition-all group-focus-within:w-full group-focus-within:left-0'></div>
                                </div>
                            </div>

                            <div className='space-y-2'>
                                <label className='text-[10px] font-black text-blue-600 uppercase tracking-widest'>Teléfono WhatsApp *</label>
                                <div className='relative'>
                                    <input
                                        type='text'
                                        required
                                        value={formData.telefono}
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/\D/g, '').slice(0, 10)
                                            setFormData({ ...formData, telefono: val })
                                            if (val.length === 10) setPhoneError('')
                                        }}
                                        className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 transition-all font-bold text-xs text-[#0A1635] ${phoneError ? 'bg-red-50 border-red-200 focus:ring-red-500/10' : 'bg-gray-50 border-gray-100 focus:ring-blue-500/20'}`}
                                        placeholder='10 dígitos necesarios'
                                    />
                                    {formData.telefono && formData.telefono.length === 10 && (
                                        <span className='absolute right-4 top-1/2 -translate-y-1/2 text-emerald-500 font-bold'>✓</span>
                                    )}
                                </div>
                                {phoneError && <p className='text-[9px] text-red-500 font-black uppercase mt-1'>{phoneError}</p>}
                            </div>
                        </div>
                    </div>

                    {/* SECCIÓN PROCESO */}
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-100'>
                        <div className='space-y-2'>
                            <label className='text-[10px] font-black text-gray-400 uppercase tracking-widest'>Etapa Comercial</label>
                            <select
                                value={formData.etapa}
                                onChange={(e) => setFormData({ ...formData, etapa: e.target.value })}
                                className='w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-bold text-xs text-[#0A1635] transition-all cursor-pointer appearance-none'
                            >
                                <option value='Prospección'>Prospección</option>
                                <option value='Negociación'>Negociación</option>
                                <option value='Cerrado Ganado'>Cerrado Ganado</option>
                                <option value='Cerrado Perdido'>Cerrado Perdido</option>
                            </select>
                        </div>

                        <div className='space-y-2'>
                            <label className='text-[10px] font-black text-gray-400 uppercase tracking-widest'>Valor Estimado</label>
                            <div className='relative'>
                                <span className='absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-black'>$</span>
                                <input
                                    type='number'
                                    min='0'
                                    value={formData.valor_estimado}
                                    onChange={(e) => setFormData({ ...formData, valor_estimado: Number(e.target.value) })}
                                    className='w-full pl-8 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-bold text-xs text-[#0A1635]'
                                />
                            </div>
                        </div>
                    </div>

                    {/* SLIDERS */}
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-8'>
                        <div className='space-y-4'>
                            <div className='flex justify-between items-center'>
                                <label className='text-[10px] font-black text-gray-400 uppercase tracking-widest'>Probabilidad</label>
                                <span className='text-xs font-black text-blue-600'>{formData.probabilidad || 0}%</span>
                            </div>
                            <input
                                type='range'
                                min='5'
                                max='95'
                                step='5'
                                value={formData.probabilidad || 50}
                                onChange={(e) => setFormData({ ...formData, probabilidad: Number(e.target.value) })}
                                disabled={!isProbEditable}
                                className='w-full h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-blue-600'
                            />
                        </div>

                        <div className='space-y-4'>
                            <div className='flex justify-between items-center'>
                                <label className='text-[10px] font-black text-gray-400 uppercase tracking-widest'>Calificación</label>
                                <span className='text-xs font-black text-blue-600'>{formData.calificacion}/5</span>
                            </div>
                            <input
                                type='range'
                                min='1'
                                max='5'
                                step='1'
                                value={formData.calificacion}
                                onChange={(e) => setFormData({ ...formData, calificacion: Number(e.target.value) })}
                                className='w-full h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-blue-600'
                            />
                        </div>
                    </div>

                    {/* NOTAS */}
                    <div className='space-y-2'>
                        <label className='text-[10px] font-black text-gray-400 uppercase tracking-widest'>Notas Internas</label>
                        <textarea
                            rows={3}
                            value={formData.notas}
                            onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
                            className='w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-bold text-xs text-[#0A1635] transition-all resize-none italic'
                            placeholder="Detalles sobre el seguimiento..."
                        />
                    </div>
                </form>

                {/* Footer */}
                <div className='p-8 bg-gray-50 border-t border-gray-100 flex items-center justify-between shrink-0'>
                    <p className='text-[9px] font-black text-gray-400 uppercase'>* Campos obligatorios</p>
                    <div className='flex gap-4'>
                        <button
                            type='button'
                            onClick={onClose}
                            className='px-6 py-2.5 rounded-xl font-black text-gray-500 hover:bg-gray-100 transition-all uppercase text-[10px] tracking-widest'
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitting || !formData.empresa_id}
                            className='px-8 py-2.5 bg-[#2048FF] text-white rounded-xl font-black shadow-xl shadow-blue-500/20 hover:bg-[#1700AC] transition-all transform active:scale-95 uppercase text-[10px] tracking-widest disabled:opacity-30'
                        >
                            {isSubmitting ? 'Guardando...' : mode === 'create' ? 'Crear Lead' : 'Actualizar Lead'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
