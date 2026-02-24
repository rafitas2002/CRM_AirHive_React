'use client'

import React, { useMemo, useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { isProbabilityEditable, getNextMeeting } from '@/lib/meetingsService'
import { Database } from '@/lib/supabase'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'
import { FriendlyDatePicker } from './FriendlyDatePickers'

type Meeting = Database['public']['Tables']['meetings']['Row']

export type ClientData = {
    id?: number
    empresa: string
    nombre: string
    etapa: string
    valor_estimado: number
    valor_real_cierre?: number | null
    valor_implementacion_estimado?: number | null
    valor_implementacion_real_cierre?: number | null
    oportunidad: string
    calificacion: number
    notas: string
    empresa_id?: string
    owner_id?: string
    probabilidad?: number
    forecast_close_date?: string | null
    closed_at_real?: string | null
    probability_locked?: boolean | null
    next_meeting_id?: string | null
    email?: string
    telefono?: string
}

function formatCurrencyInputNumber(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) return ''
    const safeInt = Math.max(0, Math.round(Number(value) || 0))
    return safeInt.toLocaleString('en-US')
}

function parseCurrencyInputValue(raw: string): number | null {
    const digits = raw.replace(/[^\d]/g, '')
    if (!digits) return null
    const parsed = Number(digits)
    return Number.isFinite(parsed) ? parsed : null
}

function isWonStageLocal(stage: unknown) {
    const normalized = String(stage || '').trim().toLowerCase()
    return normalized === 'cerrado ganado' || normalized === 'cerrada ganada'
}

function isLostStageLocal(stage: unknown) {
    const normalized = String(stage || '').trim().toLowerCase()
    return normalized === 'cerrado perdido' || normalized === 'cerrada perdida'
}

function isClosedStageLocal(stage: unknown) {
    return isWonStageLocal(stage) || isLostStageLocal(stage)
}

function todayDateOnly() {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

interface ClientModalProps {
    isOpen: boolean
    onClose: () => void
    onSave: (data: ClientData) => Promise<void>
    initialData?: ClientData | null
    mode: 'create' | 'edit' | 'convert'
    onNavigateToCompanies?: () => void
    companies?: { id: string, nombre: string, industria?: string | null, ubicacion?: string | null }[]
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
    useBodyScrollLock(isOpen)
    const [formData, setFormData] = useState<ClientData>({
        empresa: '',
        nombre: '',
        etapa: 'Negociación',
        valor_estimado: 0,
        valor_real_cierre: null,
        valor_implementacion_estimado: 0,
        valor_implementacion_real_cierre: null,
        oportunidad: '',
        calificacion: 3,
        notas: '',
        empresa_id: undefined,
        probabilidad: 50,
        forecast_close_date: null,
        closed_at_real: null,
        email: '',
        telefono: ''
    })
    const [phoneError, setPhoneError] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const wasOpen = useRef(false)

    // Probability editability state
    const [isProbEditable, setIsProbEditable] = useState(true)
    const [editabilityReason, setEditabilityReason] = useState('')
    const [nextMeeting, setNextMeeting] = useState<Meeting | null>(null)
    const [currentUser, setCurrentUser] = useState<any>(null)
    const [supabase] = useState(() => createClient())
    const [showCloseLeadPanel, setShowCloseLeadPanel] = useState(false)
    const [pendingCloseOutcome, setPendingCloseOutcome] = useState<'won' | 'lost'>('won')
    const [pendingCloseDate, setPendingCloseDate] = useState<string | null>(todayDateOnly())
    const [pendingCloseRealValue, setPendingCloseRealValue] = useState<number | null>(null)
    const [pendingCloseImplementationRealValue, setPendingCloseImplementationRealValue] = useState<number | null>(null)
    const areRealCloseValueFieldsLockedInForm = true

    useEffect(() => {
        if (isOpen && !wasOpen.current) {
            if (initialData) {
                setFormData({
                    ...initialData,
                    valor_real_cierre: initialData.valor_real_cierre ?? null,
                    valor_implementacion_estimado: (initialData as any).valor_implementacion_estimado ?? 0,
                    valor_implementacion_real_cierre: (initialData as any).valor_implementacion_real_cierre ?? null,
                    forecast_close_date: initialData.forecast_close_date ?? null,
                    closed_at_real: initialData.closed_at_real ?? null,
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
                    etapa: 'Negociación',
                    valor_estimado: 0,
                    valor_real_cierre: null,
                    valor_implementacion_estimado: 0,
                    valor_implementacion_real_cierre: null,
                    oportunidad: '',
                    calificacion: 3,
                    notas: '',
                    empresa_id: undefined,
                    probabilidad: 50,
                    forecast_close_date: null,
                    closed_at_real: null,
                    email: '',
                    telefono: ''
                })
                setPhoneError('')
                setIsProbEditable(true)
                setEditabilityReason('')
            }
            setShowCloseLeadPanel(false)
            setPendingCloseOutcome('won')
            setPendingCloseDate((initialData as any)?.closed_at_real || todayDateOnly())
            setPendingCloseRealValue(initialData?.valor_real_cierre ?? initialData?.valor_estimado ?? null)
            setPendingCloseImplementationRealValue((initialData as any)?.valor_implementacion_real_cierre ?? (initialData as any)?.valor_implementacion_estimado ?? null)
            fetchCurrentUser()
        }
        wasOpen.current = isOpen
    }, [isOpen, initialData, mode])

    useEffect(() => {
        if (formData.etapa === 'Cerrado Ganado' && (formData.valor_real_cierre === null || formData.valor_real_cierre === undefined)) {
            setFormData((prev) => ({ ...prev, valor_real_cierre: prev.valor_estimado || 0 }))
        }
    }, [formData.etapa, formData.valor_estimado, formData.valor_real_cierre])

    useEffect(() => {
        if (formData.etapa === 'Cerrado Ganado' && ((formData as any).valor_implementacion_real_cierre === null || (formData as any).valor_implementacion_real_cierre === undefined)) {
            setFormData((prev) => ({ ...prev, valor_implementacion_real_cierre: (prev as any).valor_implementacion_estimado || 0 }))
        }
    }, [formData.etapa, (formData as any).valor_implementacion_estimado, (formData as any).valor_implementacion_real_cierre])

    useEffect(() => {
        if (showCloseLeadPanel) {
            setPendingCloseDate(formData.closed_at_real || todayDateOnly())
            setPendingCloseRealValue(formData.valor_real_cierre ?? formData.valor_estimado ?? null)
            setPendingCloseImplementationRealValue((formData as any).valor_implementacion_real_cierre ?? (formData as any).valor_implementacion_estimado ?? null)
        }
    }, [showCloseLeadPanel, formData.closed_at_real, formData.valor_real_cierre, formData.valor_estimado, (formData as any).valor_implementacion_real_cierre, (formData as any).valor_implementacion_estimado])

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
        if (!formData.empresa_id && formData.empresa) {
            const exactMatch = companies.find((c) => c.nombre.trim().toLowerCase() === formData.empresa.trim().toLowerCase())
            if (exactMatch) {
                setFormData((prev) => ({ ...prev, empresa_id: exactMatch.id, empresa: exactMatch.nombre }))
            }
        }
    }, [companies, formData.empresa, formData.empresa_id])

    const selectedCompany = useMemo(
        () => companies.find((company) => company.id === formData.empresa_id),
        [companies, formData.empresa_id]
    )
    const hasLeadChanges = useMemo(() => {
        if (mode !== 'edit' || !initialData) return true

        const norm = (v: any) => (v ?? null)
        const asNum = (v: any) => (v === null || v === undefined || v === '' ? null : Number(v))

        return !(
            norm(formData.empresa_id) === norm(initialData.empresa_id) &&
            String(formData.empresa || '') === String(initialData.empresa || '') &&
            String(formData.nombre || '') === String(initialData.nombre || '') &&
            String(formData.email || '') === String(initialData.email || '') &&
            String(formData.telefono || '') === String(initialData.telefono || '') &&
            String(formData.etapa || '') === String(initialData.etapa || '') &&
            asNum(formData.valor_estimado) === asNum(initialData.valor_estimado) &&
            asNum(formData.valor_real_cierre) === asNum(initialData.valor_real_cierre) &&
            asNum((formData as any).valor_implementacion_estimado) === asNum((initialData as any).valor_implementacion_estimado) &&
            asNum((formData as any).valor_implementacion_real_cierre) === asNum((initialData as any).valor_implementacion_real_cierre) &&
            String(formData.oportunidad || '') === String(initialData.oportunidad || '') &&
            asNum(formData.calificacion) === asNum(initialData.calificacion) &&
            String(formData.notas || '') === String(initialData.notas || '') &&
            asNum(formData.probabilidad) === asNum(initialData.probabilidad) &&
            norm(formData.forecast_close_date) === norm(initialData.forecast_close_date) &&
            norm(formData.closed_at_real) === norm((initialData as any).closed_at_real)
        )
    }, [mode, initialData, formData])

    const handleCompanySelect = (companyId: string) => {
        const company = companies.find((c) => c.id === companyId)
        if (!company) {
            setFormData((prev) => ({ ...prev, empresa_id: undefined, empresa: '' }))
            return
        }
        setFormData((prev) => ({
            ...prev,
            empresa: company.nombre,
            empresa_id: company.id
        }))
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

        if (mode === 'edit' && !hasLeadChanges) {
            onClose()
            return
        }

        if (isWonStageLocal(formData.etapa)) {
            if (!formData.closed_at_real) {
                alert('Debes registrar la fecha real de cierre del lead ganado.')
                return
            }
            if ((formData.valor_real_cierre ?? 0) <= 0) {
                alert('Debes registrar la mensualidad real para un lead ganado.')
                return
            }
            if (((formData as any).valor_implementacion_real_cierre ?? 0) <= 0) {
                alert('Debes registrar el valor real de implementación para un lead ganado.')
                return
            }
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

    const currentStageLabel = isWonStageLocal(formData.etapa)
        ? 'Cerrado Ganado'
        : isLostStageLocal(formData.etapa)
            ? 'Cerrado Perdido'
            : 'Negociación'

    const applyCloseLead = () => {
        if (!pendingCloseDate) {
            alert('Selecciona la fecha real del cierre.')
            return
        }
        if (pendingCloseOutcome === 'won' && (pendingCloseRealValue ?? 0) <= 0) {
            alert('Ingresa la mensualidad real para cerrar como ganado.')
            return
        }
        if (pendingCloseOutcome === 'won' && (pendingCloseImplementationRealValue ?? 0) <= 0) {
            alert('Ingresa el valor real de implementación para cerrar como ganado.')
            return
        }

        setFormData(prev => ({
            ...prev,
            etapa: pendingCloseOutcome === 'won' ? 'Cerrado Ganado' : 'Cerrado Perdido',
            closed_at_real: pendingCloseDate,
            valor_real_cierre: pendingCloseOutcome === 'won' ? (pendingCloseRealValue ?? prev.valor_estimado ?? 0) : null,
            valor_implementacion_real_cierre: pendingCloseOutcome === 'won'
                ? (pendingCloseImplementationRealValue ?? (prev as any).valor_implementacion_estimado ?? 0)
                : null
        }))
        setShowCloseLeadPanel(false)
    }

    const reopenLead = () => {
        setFormData(prev => ({
            ...prev,
            etapa: 'Negociación'
        }))
        setShowCloseLeadPanel(false)
    }

    return (
        <div className='ah-modal-overlay transition-all animate-in fade-in duration-300'>
            <div
                className='ah-modal-panel w-full max-w-2xl animate-in zoom-in-95 duration-300'
            >
                {/* Header Style match with Pre-Lead */}
                <div className='ah-modal-header'>
                    <div>
                        <h2 className='ah-modal-title'>
                            {mode === 'create' ? 'Nuevo Lead' : mode === 'convert' ? '🚀 Ascender a Lead' : 'Editar Lead'}
                        </h2>
                        <p className='ah-modal-subtitle'>
                            {mode === 'convert' ? 'Finalizando conversión de prospecto' : 'Información del Prospecto'}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className='ah-modal-close'
                    >
                        ✕
                    </button>
                </div>

                {/* Form Body style match with Pre-Lead */}
                <form onSubmit={handleSubmit} className='flex-1 overflow-y-auto p-8 custom-scrollbar space-y-8'>
                    {/* Sección Empresa */}
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                        <div className='space-y-2'>
                            <label className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>Empresa *</label>
                            <select
                                required
                                value={formData.empresa_id || ''}
                                onChange={(e) => handleCompanySelect(e.target.value)}
                                disabled={mode === 'convert' && !!formData.empresa_id}
                                className='w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 font-bold transition-all cursor-pointer appearance-none'
                                style={{
                                    background: 'var(--background)',
                                    borderColor: 'var(--card-border)',
                                    color: 'var(--text-primary)'
                                }}
                            >
                                <option value='' disabled>Selecciona una empresa existente</option>
                                {companies.map((company) => (
                                    <option key={company.id} value={company.id}>
                                        {company.nombre}
                                    </option>
                                ))}
                            </select>

                            {selectedCompany && (
                                <div className='mt-2 p-3 rounded-xl border text-[10px] font-bold uppercase tracking-wider space-y-1'
                                    style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)', color: 'var(--text-secondary)' }}>
                                    <p>Vinculada a empresa registrada</p>
                                    <p className='normal-case text-xs font-semibold' style={{ color: 'var(--text-primary)' }}>
                                        {selectedCompany.nombre}
                                    </p>
                                    <p className='normal-case text-[11px]'>
                                        Industria: {selectedCompany.industria || 'Sin especificar'} | Ubicación: {selectedCompany.ubicacion || 'Sin especificar'}
                                    </p>
                                </div>
                            )}

                            {companies.length === 0 && (
                                <div className='mt-2 p-3 rounded-xl border text-xs font-bold'
                                    style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)', color: 'var(--text-secondary)' }}>
                                    No hay empresas registradas.
                                    {onNavigateToCompanies && (
                                        <button
                                            type='button'
                                            onClick={onNavigateToCompanies}
                                            className='ml-2 text-blue-500 hover:text-blue-400 underline cursor-pointer'
                                        >
                                            Ir a Empresas
                                        </button>
                                    )}
                                </div>
                            )}
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
                            <div
                                className='w-full px-4 py-3 border rounded-xl font-bold text-xs flex items-center justify-between gap-3'
                                style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                            >
                                <span>{currentStageLabel}</span>
                                {isClosedStageLocal(formData.etapa) && (
                                    <span className={`text-[9px] font-black uppercase tracking-wider ${isWonStageLocal(formData.etapa) ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        Registrado
                                    </span>
                                )}
                            </div>

                            <div className='flex flex-wrap gap-2'>
                                <span className='text-[9px] font-bold uppercase tracking-wider text-[var(--text-secondary)]/60 self-center'>
                                    {!isClosedStageLocal(formData.etapa)
                                        ? 'El cierre se registra desde el botón inferior.'
                                        : 'Puedes editar o reabrir el cierre desde el footer.'}
                                </span>
                            </div>

                            {showCloseLeadPanel && (
                                <div className='mt-3 p-4 rounded-2xl border space-y-4' style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}>
                                    <div className='flex items-center justify-between gap-2'>
                                        <p className='text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]'>Confirmar Cierre</p>
                                        <button
                                            type='button'
                                            onClick={() => setShowCloseLeadPanel(false)}
                                            className='text-[9px] font-black uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer'
                                        >
                                            Cancelar
                                        </button>
                                    </div>

                                    <div className='grid grid-cols-2 gap-2'>
                                        <button
                                            type='button'
                                            onClick={() => setPendingCloseOutcome('won')}
                                            className={`px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all ${pendingCloseOutcome === 'won' ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10' : ''}`}
                                            style={pendingCloseOutcome === 'won'
                                                ? undefined
                                                : { background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                        >
                                            Cerrado Ganado
                                        </button>
                                        <button
                                            type='button'
                                            onClick={() => setPendingCloseOutcome('lost')}
                                            className={`px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all ${pendingCloseOutcome === 'lost' ? 'border-rose-500 text-rose-400 bg-rose-500/10' : ''}`}
                                            style={pendingCloseOutcome === 'lost'
                                                ? undefined
                                                : { background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                        >
                                            Cerrado Perdido
                                        </button>
                                    </div>

                                    <div className='space-y-2'>
                                        <label className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
                                            Fecha Real del Cierre
                                        </label>
                                        <FriendlyDatePicker
                                            value={pendingCloseDate}
                                            onChange={setPendingCloseDate}
                                            yearStart={new Date().getFullYear() - 5}
                                            yearEnd={new Date().getFullYear() + 1}
                                            className='w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 font-bold text-xs transition-all cursor-pointer text-left'
                                        />
                                        <p className='text-[9px] font-bold uppercase tracking-wider text-[var(--text-secondary)]/70'>
                                            Si el cierre se registró tarde en el CRM, aquí puedes corregir la fecha real.
                                        </p>
                                    </div>

                                    {pendingCloseOutcome === 'won' && (
                                        <div className='space-y-2'>
                                            <label className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
                                                Mensualidad Real
                                            </label>
                                            <div className='relative'>
                                                <span className='absolute left-4 top-1/2 -translate-y-1/2 font-black' style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>$</span>
                                                <input
                                                    type='text'
                                                    inputMode='numeric'
                                                    pattern='[0-9,]*'
                                                    value={formatCurrencyInputNumber(pendingCloseRealValue)}
                                                    onChange={(e) => setPendingCloseRealValue(parseCurrencyInputValue(e.target.value))}
                                                    className='w-full pl-8 pr-4 py-3 border rounded-xl focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 font-bold text-xs'
                                                    style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                                    placeholder='0'
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {pendingCloseOutcome === 'won' && (
                                        <div className='space-y-2'>
                                            <label className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
                                                Valor Real de Implementación
                                            </label>
                                            <div className='relative'>
                                                <span className='absolute left-4 top-1/2 -translate-y-1/2 font-black' style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>$</span>
                                                <input
                                                    type='text'
                                                    inputMode='numeric'
                                                    pattern='[0-9,]*'
                                                    value={formatCurrencyInputNumber(pendingCloseImplementationRealValue)}
                                                    onChange={(e) => setPendingCloseImplementationRealValue(parseCurrencyInputValue(e.target.value))}
                                                    className='w-full pl-8 pr-4 py-3 border rounded-xl focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 font-bold text-xs'
                                                    style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                                    placeholder='0'
                                                />
                                            </div>
                                        </div>
                                    )}

                                    <div className='flex justify-end gap-2 pt-1'>
                                        <button
                                            type='button'
                                            onClick={() => setShowCloseLeadPanel(false)}
                                            className='px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-wider cursor-pointer'
                                            style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-secondary)' }}
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            type='button'
                                            onClick={applyCloseLead}
                                            className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer text-white ${pendingCloseOutcome === 'won' ? 'bg-emerald-600' : 'bg-rose-600'}`}
                                        >
                                            Confirmar Cierre
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className='space-y-2'>
                            <label className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                                Mensualidad Estimada
                            </label>
                            <div className='relative'>
                                <span className='absolute left-4 top-1/2 -translate-y-1/2 font-black' style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>$</span>
                                <input
                                    type='text'
                                    inputMode='numeric'
                                    pattern='[0-9,]*'
                                    value={formatCurrencyInputNumber(formData.valor_estimado)}
                                    onChange={(e) => {
                                        const next = parseCurrencyInputValue(e.target.value)
                                        setFormData({ ...formData, valor_estimado: next ?? 0 })
                                    }}
                                    className='w-full pl-8 pr-4 py-3 border rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 font-bold text-xs'
                                    style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                    placeholder='0'
                                />
                            </div>
                            <p className='text-[9px] font-bold uppercase tracking-wider text-[var(--text-secondary)]/70'>
                                Pronóstico de mensualidad para el lead.
                            </p>
                        </div>

                        <div className='space-y-2'>
                            <label className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                                Valor de Implementación (Pronóstico)
                            </label>
                            <div className='relative'>
                                <span className='absolute left-4 top-1/2 -translate-y-1/2 font-black' style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>$</span>
                                <input
                                    type='text'
                                    inputMode='numeric'
                                    pattern='[0-9,]*'
                                    value={formatCurrencyInputNumber((formData as any).valor_implementacion_estimado ?? 0)}
                                    onChange={(e) => {
                                        const next = parseCurrencyInputValue(e.target.value)
                                        setFormData({ ...formData, valor_implementacion_estimado: next ?? 0 })
                                    }}
                                    className='w-full pl-8 pr-4 py-3 border rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 font-bold text-xs'
                                    style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                    placeholder='0'
                                />
                            </div>
                            <p className='text-[9px] font-bold uppercase tracking-wider text-[var(--text-secondary)]/70'>
                                Pronóstico de cuota única de implementación.
                            </p>
                        </div>

                        {isWonStageLocal(formData.etapa) && (
                            <div className='space-y-2'>
                                <label className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                                    Mensualidad Real de Cierre
                                </label>
                                <div className='relative'>
                                    <span className='absolute left-4 top-1/2 -translate-y-1/2 font-black' style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>$</span>
                                    <input
                                        type='text'
                                        inputMode='numeric'
                                        pattern='[0-9,]*'
                                        value={formatCurrencyInputNumber(formData.valor_real_cierre ?? null)}
                                        disabled={areRealCloseValueFieldsLockedInForm}
                                        readOnly={areRealCloseValueFieldsLockedInForm}
                                        onChange={(e) => {
                                            if (areRealCloseValueFieldsLockedInForm) return
                                            const next = parseCurrencyInputValue(e.target.value)
                                            setFormData({ ...formData, valor_real_cierre: next })
                                        }}
                                        className='w-full pl-8 pr-4 py-3 border rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 font-bold text-xs disabled:opacity-70 disabled:cursor-not-allowed'
                                        style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                        placeholder='0'
                                    />
                                </div>
                                {formData.closed_at_real && (
                                    <p className='text-[9px] font-bold uppercase tracking-wider text-[var(--text-secondary)]/70'>
                                        Fecha real registrada: {new Date(`${formData.closed_at_real}T12:00:00`).toLocaleDateString('es-MX')}
                                    </p>
                                )}
                                <p className='text-[9px] font-bold uppercase tracking-wider text-blue-500'>
                                    Se registrará contra el pronóstico de mensualidad para scoring.
                                </p>
                            </div>
                        )}

                        {isWonStageLocal(formData.etapa) && (
                            <div className='space-y-2'>
                                <label className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                                    Valor Real de Implementación
                                </label>
                                <div className='relative'>
                                    <span className='absolute left-4 top-1/2 -translate-y-1/2 font-black' style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>$</span>
                                    <input
                                        type='text'
                                        inputMode='numeric'
                                        pattern='[0-9,]*'
                                        value={formatCurrencyInputNumber((formData as any).valor_implementacion_real_cierre ?? null)}
                                        disabled={areRealCloseValueFieldsLockedInForm}
                                        readOnly={areRealCloseValueFieldsLockedInForm}
                                        onChange={(e) => {
                                            if (areRealCloseValueFieldsLockedInForm) return
                                            const next = parseCurrencyInputValue(e.target.value)
                                            setFormData({ ...formData, valor_implementacion_real_cierre: next })
                                        }}
                                        className='w-full pl-8 pr-4 py-3 border rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 font-bold text-xs disabled:opacity-70 disabled:cursor-not-allowed'
                                        style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                        placeholder='0'
                                    />
                                </div>
                                <p className='text-[9px] font-bold uppercase tracking-wider text-blue-500'>
                                    Se registrará contra el pronóstico de implementación para scoring.
                                </p>
                            </div>
                        )}
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

                            <div className='pt-3 border-t space-y-2' style={{ borderColor: 'var(--card-border)' }}>
                                <div className='flex justify-between items-center'>
                                    <label className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                                        Fecha Pronosticada de Cierre
                                    </label>
                                    <span className='text-[9px] font-black uppercase tracking-[0.12em] text-blue-500'>Forecast</span>
                                </div>
                                <FriendlyDatePicker
                                    value={formData.forecast_close_date || null}
                                    onChange={(next) => setFormData({ ...formData, forecast_close_date: next })}
                                    yearStart={new Date().getFullYear() - 2}
                                    yearEnd={new Date().getFullYear() + 8}
                                    className='w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 font-bold text-xs transition-all cursor-pointer text-left'
                                />
                                <p className='text-[9px] font-bold uppercase tracking-wider text-[var(--text-secondary)]/70'>
                                    Fecha que el vendedor estima para cerrar este lead.
                                </p>
                            </div>
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
                <div className='p-8 border-t flex items-center justify-between gap-4 shrink-0' style={{ background: 'var(--table-header-bg)', borderColor: 'var(--card-border)' }}>
                    <div className='flex items-center gap-3'>
                        {mode === 'edit' && (
                            <>
                                {!isClosedStageLocal(formData.etapa) ? (
                                    <button
                                        type='button'
                                        onClick={() => { setPendingCloseOutcome('won'); setShowCloseLeadPanel(true) }}
                                        className='px-4 py-2.5 rounded-xl border font-black transition-all uppercase text-[10px] tracking-widest cursor-pointer hover:border-emerald-500'
                                        style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                    >
                                        Cerrar Lead
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            type='button'
                                            onClick={() => { setPendingCloseOutcome(isWonStageLocal(formData.etapa) ? 'won' : 'lost'); setShowCloseLeadPanel(true) }}
                                            className='px-4 py-2.5 rounded-xl border font-black transition-all uppercase text-[10px] tracking-widest cursor-pointer hover:border-blue-500'
                                            style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                        >
                                            Editar Cierre
                                        </button>
                                        <button
                                            type='button'
                                            onClick={reopenLead}
                                            className='px-4 py-2.5 rounded-xl border font-black transition-all uppercase text-[10px] tracking-widest cursor-pointer hover:border-amber-500'
                                            style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                        >
                                            Reabrir
                                        </button>
                                    </>
                                )}
                            </>
                        )}
                        <p className='text-[9px] font-black uppercase hidden md:block' style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>* Campos obligatorios</p>
                    </div>

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
                            {isSubmitting
                                ? 'Guardando...'
                                : mode === 'convert'
                                    ? '🚀 Confirmar Ascenso'
                                    : mode === 'create'
                                        ? 'Crear Lead'
                                        : hasLeadChanges ? 'Guardar Cambios' : 'Cerrar'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
