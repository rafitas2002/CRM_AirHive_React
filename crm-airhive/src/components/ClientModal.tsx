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
    mode: 'create' | 'edit' | 'convert'
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
        // For new leads or conversions, it's always editable
        if (mode === 'create' || mode === 'convert') {
            setIsProbEditable(true)
            return
        }

        if (!initialData?.id) return

        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            // Fetch profile to get role
            const { data: profile } = await (supabase
                .from('profiles') as any)
                .select('role')
                .eq('id', user.id)
                .maybeSingle()

            // CRITICAL: We use formData.etapa instead of initialData.etapa to allow real-time reactivity
            // but we still need the original owner and lock status from initialData
            const currentLeadState = {
                ...initialData,
                etapa: formData.etapa
            }

            const result = await isProbabilityEditable(currentLeadState as any, user.id, profile?.role)
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

    // Trigger check whenever the stage changes
    useEffect(() => {
        if (mode === 'edit' && isOpen) {
            checkProbabilityEditability()
        }
    }, [formData.etapa])

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
        <div className='fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-all animate-in fade-in duration-300'>
            <div
                className='rounded-[32px] w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-300 border'
                style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
            >
                {/* Header Style match with Pre-Lead */}
                <div className='p-8 shrink-0 flex items-center justify-between border-b' style={{ background: 'var(--table-header-bg)', borderColor: 'var(--card-border)' }}>
                    <div>
                        <h2 className='text-2xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>
                            {mode === 'create' ? 'Nuevo Lead' : mode === 'convert' ? '🚀 Ascender a Lead' : 'Editar Lead'}
                        </h2>
                        <p className='text-blue-500 text-xs font-bold uppercase tracking-widest mt-1'>
                            {mode === 'convert' ? 'Finalizando conversión de prospecto' : 'Información del Prospecto'}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className='w-10 h-10 flex items-center justify-center rounded-xl hover:bg-black/5 transition-all font-bold'
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        ✕
                    </button>
                </div>

                {/* Form Body style match with Pre-Lead */}
                <form onSubmit={handleSubmit} className='flex-1 overflow-y-auto p-8 custom-scrollbar space-y-8'>
                    {/* Sección Empresa */}
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                        <div className='space-y-2' ref={wrapperRef}>
                            <label className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>Empresa *</label>
                            <div className='relative'>
                                <input
                                    required
                                    type="text"
                                    value={formData.empresa}
                                    onChange={handleEmpresaChange}
                                    readOnly={!!formData.empresa_id}
                                    className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 font-bold transition-all ${formData.empresa_id ? 'bg-blue-50/10 cursor-not-allowed' : ''}`}
                                    style={{
                                        background: formData.empresa_id ? 'var(--background)' : 'var(--background)',
                                        borderColor: 'var(--card-border)',
                                        color: 'var(--text-primary)'
                                    }}
                                    placeholder="Busca una empresa..."
                                    autoComplete="off"
                                />
                                {formData.empresa_id && mode !== 'convert' && ( // No dejar cambiar si es conversion para asegurar consistencia
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, empresa_id: undefined, empresa: '' })}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-red-500 font-black uppercase hover:scale-110 transition-transform"
                                    >
                                        ✕ Cambiar
                                    </button>
                                )}
                                {!formData.empresa_id && showSuggestions && filteredCompanies.length > 0 && (
                                    <div
                                        className='absolute z-10 w-full mt-1 border rounded-xl shadow-lg max-h-48 overflow-y-auto custom-scrollbar p-2'
                                        style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
                                    >
                                        {filteredCompanies.map((company) => (
                                            <div
                                                key={company.id}
                                                onClick={() => selectCompany(company)}
                                                className='px-4 py-2 hover:bg-blue-500/10 cursor-pointer text-xs font-bold rounded-lg transition-colors flex items-center justify-between group'
                                                style={{ color: 'var(--text-primary)' }}
                                            >
                                                <span>{company.nombre}</span>
                                                <span className='text-[9px] text-blue-500 opacity-0 group-hover:opacity-100 uppercase tracking-tighter transition-all'>Seleccionar</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className='space-y-2'>
                            <label className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>Nombre del Prospecto *</label>
                            <input
                                required
                                type="text"
                                value={formData.nombre}
                                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                                className='w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 font-bold transition-all'
                                style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                placeholder="Nombre completo"
                            />
                        </div>
                    </div>

                    {/* SECCIÓN CONTACTO SEPARADA */}
                    <div className='space-y-6 pt-6 border-t' style={{ borderColor: 'var(--card-border)' }}>
                        <div className='flex items-center gap-2'>
                            <div className='w-1 h-4 bg-blue-500 rounded-full'></div>
                            <h3 className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-primary)' }}>Canales de Comunicación</h3>
                        </div>

                        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                            <div className='space-y-2'>
                                <label className='text-[10px] font-black text-blue-500 uppercase tracking-widest'>Correo Electrónico</label>
                                <input
                                    type='email'
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className='w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 font-bold text-xs transition-all'
                                    style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                    placeholder='ejemplo@empresa.com'
                                />
                            </div>

                            <div className='space-y-2'>
                                <label className='text-[10px] font-black text-blue-500 uppercase tracking-widest'>Teléfono WhatsApp *</label>
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
                                        className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-4 transition-all font-bold text-xs ${phoneError ? 'bg-red-50/10 border-red-500 focus:ring-red-500/10' : 'focus:ring-blue-500/10 focus:border-blue-500'}`}
                                        style={{ background: 'var(--background)', borderColor: phoneError ? '#ef4444' : 'var(--card-border)', color: 'var(--text-primary)' }}
                                        placeholder='10 dígitos necesarios'
                                    />
                                    {formData.telefono && formData.telefono.length === 10 && (
                                        <span className='absolute right-4 top-1/2 -translate-y-1/2 text-emerald-500 font-bold animate-in zoom-in'>✓</span>
                                    )}
                                </div>
                                {phoneError && <p className='text-[9px] text-red-500 font-black uppercase mt-1'>{phoneError}</p>}
                            </div>
                        </div>
                    </div>

                    {/* SECCIÓN PROCESO */}
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t' style={{ borderColor: 'var(--card-border)' }}>
                        <div className='space-y-2'>
                            <label className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>Etapa Comercial</label>
                            <select
                                value={formData.etapa}
                                onChange={(e) => setFormData({ ...formData, etapa: e.target.value })}
                                className='w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 font-bold text-xs transition-all cursor-pointer appearance-none'
                                style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                            >
                                <option value='Prospección'>Prospección</option>
                                <option value='Negociación'>Negociación</option>
                                <option value='Cerrado Ganado'>Cerrado Ganado</option>
                                <option value='Cerrado Perdido'>Cerrado Perdido</option>
                            </select>
                        </div>

                        <div className='space-y-2'>
                            <label className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>Valor Estimado</label>
                            <div className='relative'>
                                <span className='absolute left-4 top-1/2 -translate-y-1/2 font-black' style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>$</span>
                                <input
                                    type='number'
                                    min='0'
                                    value={formData.valor_estimado}
                                    onChange={(e) => setFormData({ ...formData, valor_estimado: Number(e.target.value) })}
                                    className='w-full pl-8 pr-4 py-3 border rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 font-bold text-xs'
                                    style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* SLIDERS */}
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-8'>
                        <div className='space-y-4'>
                            <div className='flex justify-between items-center'>
                                <label className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>Probabilidad</label>
                                <span className='text-xs font-black text-blue-500'>{formData.probabilidad || 0}%</span>
                            </div>
                            <input
                                type='range'
                                min='5'
                                max='95'
                                step='5'
                                value={formData.probabilidad || 50}
                                onChange={(e) => setFormData({ ...formData, probabilidad: Number(e.target.value) })}
                                disabled={!isProbEditable}
                                className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-blue-600 ${!isProbEditable ? 'opacity-30 grayscale cursor-not-allowed' : ''}`}
                                style={{ background: 'var(--card-border)' }}
                            />
                            {!isProbEditable && editabilityReason && (
                                <div className='p-3 rounded-xl border' style={{ background: 'var(--background)', borderColor: 'var(--card-border)' }}>
                                    <p className='text-[9px] font-bold text-amber-600 leading-tight'>
                                        ⚠️ {editabilityReason}
                                    </p>
                                    <button
                                        type='button'
                                        onClick={() => setIsProbEditable(true)}
                                        className='text-[8px] font-black border-b mt-2 hover:text-blue-500 transition-colors uppercase'
                                        style={{ borderColor: 'currentColor', color: 'var(--text-secondary)' }}
                                    >
                                        Forzar Desbloqueo Manual
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className='space-y-4'>
                            <div className='flex justify-between items-center'>
                                <label className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>Calificación</label>
                                <span className='text-xs font-black text-blue-500'>{formData.calificacion}/5</span>
                            </div>
                            <input
                                type='range'
                                min='1'
                                max='5'
                                step='1'
                                value={formData.calificacion}
                                onChange={(e) => setFormData({ ...formData, calificacion: Number(e.target.value) })}
                                className='w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-blue-600'
                                style={{ background: 'var(--card-border)' }}
                            />
                        </div>
                    </div>

                    {/* NOTAS */}
                    <div className='space-y-2'>
                        <label className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>Notas Internas</label>
                        <textarea
                            rows={3}
                            value={formData.notas}
                            onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
                            className='w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 font-bold text-xs transition-all resize-none italic'
                            style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                            placeholder="Detalles sobre el seguimiento..."
                        />
                    </div>
                </form>

                {/* Footer */}
                <div className='p-8 border-t flex items-center justify-between shrink-0' style={{ background: 'var(--table-header-bg)', borderColor: 'var(--card-border)' }}>
                    <p className='text-[9px] font-black uppercase' style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>* Campos obligatorios</p>
                    <div className='flex gap-4'>
                        <button
                            type='button'
                            onClick={onClose}
                            className='px-6 py-2.5 rounded-xl font-black hover:bg-black/5 transition-all uppercase text-[10px] tracking-widest'
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitting || !formData.empresa_id}
                            className={`px-8 py-2.5 text-white rounded-xl font-black shadow-xl transition-all transform active:scale-95 uppercase text-[10px] tracking-widest disabled:opacity-30 ${mode === 'convert' ? 'bg-gradient-to-r from-emerald-600 to-teal-600 shadow-emerald-500/20' : 'bg-[#2048FF] shadow-blue-500/20 hover:bg-[#1700AC]'}`}
                        >
                            {isSubmitting ? 'Guardando...' : mode === 'convert' ? '🚀 Confirmar Ascenso' : mode === 'create' ? 'Crear Lead' : 'Actualizar Lead'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
