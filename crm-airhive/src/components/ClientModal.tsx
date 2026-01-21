'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { isProbabilityEditable, getNextMeeting } from '@/lib/meetingsService'
import { Database } from '@/lib/supabase'

type Lead = Database['public']['Tables']['clientes']['Row']
type Meeting = Database['public']['Tables']['meetings']['Row']

export type ClientData = {
    id?: number
    empresa: string
    nombre: string
    contacto: string
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
        contacto: '',
        etapa: 'Prospección',
        valor_estimado: 0,
        oportunidad: '',
        calificacion: 3,
        notas: '',
        empresa_id: undefined,
        probabilidad: 50
    })
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
            // Modal is opening, initialize/reset form
            if (initialData) {
                setFormData(initialData)
                // Check probability editability for edit mode
                if (mode === 'edit') {
                    checkProbabilityEditability()
                }
            } else {
                setFormData({
                    empresa: '',
                    nombre: '',
                    contacto: '',
                    etapa: 'Prospección',
                    valor_estimado: 0,
                    oportunidad: '',
                    calificacion: 3,
                    notas: '',
                    empresa_id: undefined,
                    probabilidad: 50
                })
                // New leads are always editable
                setIsProbEditable(true)
                setEditabilityReason('')
            }

            // Fetch current user
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

            // If not editable and no next meeting, fetch it separately
            if (!result.editable && initialData.id) {
                const meeting = await getNextMeeting(initialData.id)
                setNextMeeting(meeting)
            }
        } catch (error) {
            console.error('Error checking probability editability:', error)
            setIsProbEditable(true) // Default to editable on error
        }
    }

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setShowSuggestions(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [wrapperRef])

    const handleEmpresaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value
        // Search only, clear link if changed
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!formData.empresa_id) {
            alert('Debes seleccionar una empresa de la lista.')
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
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity'>
            <div className='w-full max-w-lg bg-white rounded-2xl shadow-2xl transform transition-all overflow-hidden flex flex-col max-h-[90vh]'>
                {/* Header */}
                <div className='bg-[#0F2A44] px-6 py-4 flex items-center justify-between shrink-0'>
                    <h2 className='text-xl font-bold text-white'>
                        {mode === 'create' ? 'Nuevo Lead' : 'Editar Lead'}
                    </h2>
                    <button
                        onClick={onClose}
                        className='text-white/70 hover:text-white transition-colors'
                    >
                        ✕
                    </button>
                </div>

                {/* Body */}
                <div className='p-6 overflow-y-auto custom-scrollbar space-y-4 shadow-inner'>
                    <form id='client-form' onSubmit={handleSubmit} className='space-y-4'>
                        {/* Empresa Autocomplete */}
                        <div className='space-y-1.5' ref={wrapperRef}>
                            <label className='block text-sm font-medium text-[#0F2A44]'>
                                Empresa <span className='text-red-500'>*</span>
                            </label>
                            <div className='flex gap-2'>
                                <div className='relative flex-1'>
                                    <input
                                        type='text'
                                        required
                                        placeholder='Busca una empresa...'
                                        value={formData.empresa}
                                        onChange={handleEmpresaChange}
                                        readOnly={!!formData.empresa_id}
                                        onFocus={() => {
                                            if (formData.empresa && !formData.empresa_id) {
                                                const filtered = companies.filter(c =>
                                                    c.nombre.toLowerCase().includes(formData.empresa.toLowerCase())
                                                )
                                                setFilteredCompanies(filtered)
                                                setShowSuggestions(true)
                                            } else if (!formData.empresa) {
                                                setFilteredCompanies(companies)
                                                setShowSuggestions(true)
                                            }
                                        }}
                                        className={`w-full px-3 py-2 border border-[#BDBBC7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent text-[#000000] placeholder-[#BDBBC7] transition-all ${formData.empresa_id ? 'bg-blue-50/50 cursor-not-allowed border-blue-200' : ''}`}
                                        autoComplete="off"
                                    />
                                    {formData.empresa_id && (
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, empresa_id: undefined, empresa: '' })}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-red-500 hover:text-red-700 font-medium flex items-center gap-1 bg-white px-2 py-1 rounded border border-red-100 shadow-sm transition-all"
                                            title="Cambiar empresa"
                                        >
                                            <span>✕ Cambiar</span>
                                        </button>
                                    )}
                                    {!formData.empresa_id && showSuggestions && filteredCompanies.length > 0 && (
                                        <div className='absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto custom-scrollbar'>
                                            {filteredCompanies.map((company) => (
                                                <div
                                                    key={company.id}
                                                    onClick={() => selectCompany(company)}
                                                    className='px-4 py-2 hover:bg-blue-50 cursor-pointer text-sm text-gray-700 transition-colors border-b border-gray-50 last:border-b-0 flex items-center justify-between group'
                                                >
                                                    <span className='font-medium'>{company.nombre}</span>
                                                    <span className='text-[10px] text-gray-400 group-hover:text-blue-500 uppercase font-bold tracking-tighter'>Seleccionar</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {!formData.empresa_id && showSuggestions && filteredCompanies.length === 0 && formData.empresa && (
                                        <div className='absolute z-10 w-full mt-1 bg-gray-50 border border-gray-200 rounded-lg shadow-lg p-3 text-center'>
                                            <p className='text-xs text-gray-500 mb-2'>No se encontró la empresa "{formData.empresa}"</p>
                                            <button
                                                type='button'
                                                onClick={onNavigateToCompanies}
                                                className='text-xs bg-[#2048FF] text-white px-3 py-1.5 rounded-full font-bold hover:bg-[#1700AC] transition-colors'
                                            >
                                                Crear Nueva Empresa
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <button
                                    type='button'
                                    onClick={onNavigateToCompanies}
                                    className='shrink-0 w-10 h-10 flex items-center justify-center bg-[#F5F6F8] border border-[#BDBBC7] text-[#0A1635] rounded-lg hover:bg-gray-100 transition-all group'
                                    title='Administrar / Crear Empresas'
                                >
                                    <span className='text-xl group-hover:scale-110 transition-transform'>🏢</span>
                                </button>
                            </div>
                            <p className='text-[10px] text-gray-400 italic font-medium'>
                                Debes seleccionar una empresa existente. Si no está en la lista, haz clic en el icono del edificio para crearla.
                            </p>
                        </div>

                        {/* Nombre */}
                        <div className='space-y-1.5'>
                            <label className='block text-sm font-medium text-[#0F2A44]'>
                                Nombre del Prospecto
                            </label>
                            <input
                                type='text'
                                required
                                value={formData.nombre}
                                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                                className='w-full px-3 py-2 border border-[#BDBBC7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent text-[#000000] placeholder-[#BDBBC7] transition-all'
                                placeholder='Nombre completo'
                            />
                        </div>

                        {/* Contacto */}
                        <div className='space-y-1.5'>
                            <label className='block text-sm font-medium text-[#0F2A44]'>
                                Contacto (Email/Cel)
                            </label>
                            <input
                                type='text'
                                value={formData.contacto}
                                onChange={(e) => setFormData({ ...formData, contacto: e.target.value })}
                                className='w-full px-3 py-2 border border-[#BDBBC7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent text-[#000000] placeholder-[#BDBBC7] transition-all'
                                placeholder='ej. correo@empresa.com'
                            />
                        </div>

                        {/* Flex Row for Etapa and Valor */}
                        <div className='grid grid-cols-2 gap-4'>
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
                                        <option value='Cerrado Ganado'>Cerrado Ganado</option>
                                        <option value='Cerrado Perdido'>Cerrado Perdido</option>
                                    </select>
                                    <div className='absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#667085]'>
                                        ▼
                                    </div>
                                </div>
                            </div>

                            <div className='space-y-1.5'>
                                <label className='block text-sm font-medium text-[#0F2A44]'>
                                    Valor Estimado
                                </label>
                                <div className='relative'>
                                    <span className='absolute left-3 top-1/2 -translate-y-1/2 text-gray-400'>$</span>
                                    <input
                                        type='number'
                                        min='0'
                                        value={formData.valor_estimado}
                                        onChange={(e) => setFormData({ ...formData, valor_estimado: Number(e.target.value) })}
                                        className='w-full pl-7 pr-3 py-2 border border-[#BDBBC7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent text-[#000000] placeholder-[#BDBBC7] transition-all'
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Oportunidad */}
                        <div className='space-y-1.5'>
                            <label className='block text-sm font-medium text-[#0F2A44]'>
                                Oportunidad
                            </label>
                            <textarea
                                placeholder='Descripción breve de la oportunidad'
                                rows={2}
                                value={formData.oportunidad}
                                onChange={(e) => setFormData({ ...formData, oportunidad: e.target.value })}
                                className='w-full px-3 py-2 border border-[#BDBBC7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent text-[#000000] placeholder-[#BDBBC7] transition-all resize-none'
                            />
                        </div>

                        {/* Probabilidad, Calificación and Notas */}
                        <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                            <div className='space-y-1.5'>
                                <div className='flex justify-between items-center'>
                                    <label className='block text-sm font-black text-[#0F2A44] uppercase tracking-tighter'>
                                        Probabilidad de Cierre
                                    </label>
                                    <div className='flex items-center gap-2'>
                                        <span className={`font-black text-xs ${formData.probabilidad && formData.probabilidad >= 70 ? 'text-emerald-600' : formData.probabilidad && formData.probabilidad >= 40 ? 'text-amber-600' : 'text-slate-500'}`}>
                                            {formData.probabilidad || 0}%
                                        </span>
                                        {!isProbEditable && (
                                            <span className='text-xs font-bold text-red-500 flex items-center gap-1'>
                                                🔒
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <input
                                    type='range'
                                    min='5'
                                    max='95'
                                    step='5'
                                    value={formData.probabilidad || 50}
                                    onChange={(e) => setFormData({ ...formData, probabilidad: Number(e.target.value) })}
                                    disabled={!isProbEditable}
                                    className={`w-full h-2 bg-[#E0E0E0] rounded-lg appearance-none cursor-pointer accent-[#2048FF] ${!isProbEditable ? 'opacity-50 cursor-not-allowed' : ''}`}
                                />
                                <div className='flex justify-between text-[8px] font-bold text-gray-400 uppercase tracking-widest'>
                                    <span>Baja</span>
                                    <span>Media</span>
                                    <span>Alta</span>
                                </div>

                                {/* Editability Messages */}
                                {!isProbEditable && formData.etapa === 'Negociación' && (
                                    <div className='mt-2 p-3 bg-amber-50 border-2 border-amber-200 rounded-lg'>
                                        <p className='text-xs text-amber-800 font-bold mb-1'>
                                            🔒 {editabilityReason}
                                        </p>
                                        {!nextMeeting && (
                                            <p className='text-xs text-amber-700 mt-2'>
                                                💡 Agenda una reunión para poder actualizar el pronóstico.
                                            </p>
                                        )}
                                        {nextMeeting && (
                                            <p className='text-xs text-amber-700 mt-2'>
                                                📅 Próxima reunión: {new Date(nextMeeting.start_time).toLocaleString('es-MX', {
                                                    month: 'short',
                                                    day: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                })}
                                            </p>
                                        )}
                                    </div>
                                )}

                                {!isProbEditable && formData.etapa !== 'Negociación' && (
                                    <div className='mt-2 p-3 bg-blue-50 border-2 border-blue-200 rounded-lg'>
                                        <p className='text-xs text-blue-800 font-bold'>
                                            ℹ️ La probabilidad solo se puede editar en etapa de Negociación
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className='space-y-1.5'>
                                <div className='flex justify-between items-center'>
                                    <label className='block text-sm font-black text-[#0F2A44] uppercase tracking-tighter'>
                                        Calificación
                                    </label>
                                    <span className='font-black text-[#0F2A44] text-xs'>
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
                            </div>

                            <div className='col-span-1 md:col-span-2 space-y-1.5'>
                                <label className='block text-sm font-black text-[#0F2A44] uppercase tracking-tighter'>
                                    Notas Internas
                                </label>
                                <textarea
                                    rows={2}
                                    placeholder='Detalles adicionales del seguimiento...'
                                    value={formData.notas}
                                    onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
                                    className='w-full px-3 py-2 border border-[#BDBBC7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent text-[#000000] placeholder-[#BDBBC7] transition-all resize-none text-sm shadow-inner italic'
                                />
                            </div>
                        </div>
                    </form>
                </div>

                {/* Footer */}
                <div className='bg-[#F5F6F8] px-6 py-4 flex items-center justify-between shrink-0 border-t border-[#E0E0E0]'>
                    <p className='text-[10px] text-gray-400 font-bold uppercase'>Campos con * son obligatorios</p>
                    <div className='flex gap-3'>
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
                            disabled={isSubmitting || !formData.empresa_id}
                            className='px-6 py-2 bg-[#2048FF] text-white font-black rounded-lg shadow-md hover:bg-[#1700AC] transition-all disabled:opacity-30 disabled:cursor-not-allowed transform active:scale-95 uppercase text-xs tracking-widest'
                        >
                            {isSubmitting ? 'Guardando...' : 'Aceptar'}
                        </button>
                    </div>
                </div>
            </div >
        </div >
    )
}
