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
    proyectos_pronosticados_ids?: string[]
    proyectos_prospeccion_mismo_cierre_ids?: string[]
    proyectos_futuro_lead_ids?: string[]
    proyectos_implementados_reales_ids?: string[]
    proyectos_implementados_reales_valores?: Record<string, { mensualidad_usd: number | null; implementacion_usd: number | null }>
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

type ProjectCatalogItem = {
    id: string
    nombre: string
    valor_real_mensualidad_usd?: number | null
    valor_real_implementacion_usd?: number | null
    is_active?: boolean
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
        proyectos_pronosticados_ids: [],
        proyectos_prospeccion_mismo_cierre_ids: [],
        proyectos_futuro_lead_ids: [],
        proyectos_implementados_reales_ids: [],
        proyectos_implementados_reales_valores: {},
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
    const [projectsCatalog, setProjectsCatalog] = useState<ProjectCatalogItem[]>([])
    const [projectsLoading, setProjectsLoading] = useState(false)
    const areRealCloseValueFieldsLockedInForm = true
    const lastLoadedProjectsCompanyRef = useRef<string | null>(null)

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
                    proyectos_pronosticados_ids: Array.isArray((initialData as any).proyectos_pronosticados_ids) ? (initialData as any).proyectos_pronosticados_ids : [],
                    proyectos_prospeccion_mismo_cierre_ids: Array.isArray((initialData as any).proyectos_prospeccion_mismo_cierre_ids) ? (initialData as any).proyectos_prospeccion_mismo_cierre_ids : [],
                    proyectos_futuro_lead_ids: Array.isArray((initialData as any).proyectos_futuro_lead_ids) ? (initialData as any).proyectos_futuro_lead_ids : [],
                    proyectos_implementados_reales_ids: Array.isArray((initialData as any).proyectos_implementados_reales_ids) ? (initialData as any).proyectos_implementados_reales_ids : [],
                    proyectos_implementados_reales_valores: (initialData as any).proyectos_implementados_reales_valores && typeof (initialData as any).proyectos_implementados_reales_valores === 'object'
                        ? (initialData as any).proyectos_implementados_reales_valores
                        : {},
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
                    proyectos_pronosticados_ids: [],
                    proyectos_prospeccion_mismo_cierre_ids: [],
                    proyectos_futuro_lead_ids: [],
                    proyectos_implementados_reales_ids: [],
                    proyectos_implementados_reales_valores: {},
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
        if (!isOpen) return
        let cancelled = false

        const loadProjectsCatalog = async () => {
            setProjectsLoading(true)
            const { data } = await (supabase.from('proyectos_catalogo') as any)
                .select('id, nombre, valor_real_mensualidad_usd, valor_real_implementacion_usd, is_active')
                .eq('is_active', true)
                .order('nombre', { ascending: true })
            if (!cancelled && Array.isArray(data)) {
                setProjectsCatalog((data as any[]).map((row) => ({
                    id: String(row.id),
                    nombre: String(row.nombre || 'Proyecto'),
                    valor_real_mensualidad_usd: row.valor_real_mensualidad_usd == null ? null : Number(row.valor_real_mensualidad_usd),
                    valor_real_implementacion_usd: row.valor_real_implementacion_usd == null ? null : Number(row.valor_real_implementacion_usd),
                    is_active: !!row.is_active
                })))
            }
            if (!cancelled) setProjectsLoading(false)
        }

        void loadProjectsCatalog()
        return () => {
            cancelled = true
        }
    }, [isOpen, supabase])

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

    useEffect(() => {
        if (!isOpen) return
        const companyId = formData.empresa_id || ''
        if (!companyId) {
            lastLoadedProjectsCompanyRef.current = null
            setFormData((prev) => ({
                ...prev,
                proyectos_pronosticados_ids: [],
                proyectos_prospeccion_mismo_cierre_ids: [],
                proyectos_futuro_lead_ids: [],
                proyectos_implementados_reales_ids: [],
                proyectos_implementados_reales_valores: {}
            }))
            return
        }
        if (lastLoadedProjectsCompanyRef.current === companyId) return
        let cancelled = false

        const loadCompanyProjectAssignments = async () => {
            const { data } = await (supabase.from('empresa_proyecto_asignaciones') as any)
                .select('proyecto_id, assignment_stage, mensualidad_pactada_usd, implementacion_pactada_usd')
                .eq('empresa_id', companyId)

            if (cancelled) return
            const rows = Array.isArray(data) ? data : []
            const inNegotiation = rows
                .filter((r: any) => ['forecasted', 'in_negotiation'].includes(String(r.assignment_stage)))
                .map((r: any) => String(r.proyecto_id))
            const prospectionSameClose = rows
                .filter((r: any) => String(r.assignment_stage) === 'prospection_same_close')
                .map((r: any) => String(r.proyecto_id))
            const futureLead = rows
                .filter((r: any) => String(r.assignment_stage) === 'future_lead_opportunity')
                .map((r: any) => String(r.proyecto_id))
            const implemented = rows
                .filter((r: any) => String(r.assignment_stage) === 'implemented_real')
                .map((r: any) => String(r.proyecto_id))
            const implementedValues = rows
                .filter((r: any) => String(r.assignment_stage) === 'implemented_real')
                .reduce((acc: Record<string, { mensualidad_usd: number | null; implementacion_usd: number | null }>, r: any) => {
                    const projectId = String(r.proyecto_id || '')
                    if (!projectId) return acc
                    acc[projectId] = {
                        mensualidad_usd: r.mensualidad_pactada_usd == null ? null : Number(r.mensualidad_pactada_usd),
                        implementacion_usd: r.implementacion_pactada_usd == null ? null : Number(r.implementacion_pactada_usd)
                    }
                    return acc
                }, {})

            lastLoadedProjectsCompanyRef.current = companyId
            setFormData((prev) => ({
                ...prev,
                proyectos_pronosticados_ids: Array.from(new Set(inNegotiation)),
                proyectos_prospeccion_mismo_cierre_ids: Array.from(new Set(prospectionSameClose)),
                proyectos_futuro_lead_ids: Array.from(new Set(futureLead)),
                proyectos_implementados_reales_ids: Array.from(new Set(implemented)),
                proyectos_implementados_reales_valores: implementedValues
            }))
        }

        void loadCompanyProjectAssignments()
        return () => {
            cancelled = true
        }
    }, [formData.empresa_id, isOpen, supabase])

    const selectedCompany = useMemo(
        () => companies.find((company) => company.id === formData.empresa_id),
        [companies, formData.empresa_id]
    )
    const sortedProjectCatalog = useMemo(
        () => [...projectsCatalog].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
        [projectsCatalog]
    )
    const hasLeadChanges = useMemo(() => {
        if (mode !== 'edit' || !initialData) return true

        const norm = (v: any) => (v ?? null)
        const asNum = (v: any) => (v === null || v === undefined || v === '' ? null : Number(v))
        const asSortedStringArray = (v: any) => Array.isArray(v) ? [...v].map(String).sort() : []
        const sameArray = (a: any, b: any) => {
            const left = asSortedStringArray(a)
            const right = asSortedStringArray(b)
            return left.length === right.length && left.every((x, i) => x === right[i])
        }
        const normalizeProjectValuesMap = (v: any) => {
            const result: Record<string, { mensualidad_usd: number | null; implementacion_usd: number | null }> = {}
            if (!v || typeof v !== 'object') return result
            for (const [key, raw] of Object.entries(v as Record<string, any>)) {
                result[String(key)] = {
                    mensualidad_usd: raw && raw.mensualidad_usd != null ? Number(raw.mensualidad_usd) : null,
                    implementacion_usd: raw && raw.implementacion_usd != null ? Number(raw.implementacion_usd) : null
                }
            }
            return result
        }
        const sameProjectValuesMap = (a: any, b: any) => {
            const left = normalizeProjectValuesMap(a)
            const right = normalizeProjectValuesMap(b)
            const leftKeys = Object.keys(left).sort()
            const rightKeys = Object.keys(right).sort()
            if (leftKeys.length !== rightKeys.length) return false
            for (let i = 0; i < leftKeys.length; i += 1) {
                if (leftKeys[i] !== rightKeys[i]) return false
                const lk = leftKeys[i]
                if ((left[lk]?.mensualidad_usd ?? null) !== (right[lk]?.mensualidad_usd ?? null)) return false
                if ((left[lk]?.implementacion_usd ?? null) !== (right[lk]?.implementacion_usd ?? null)) return false
            }
            return true
        }

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
            norm(formData.closed_at_real) === norm((initialData as any).closed_at_real) &&
            sameArray((formData as any).proyectos_pronosticados_ids, (initialData as any).proyectos_pronosticados_ids) &&
            sameArray((formData as any).proyectos_prospeccion_mismo_cierre_ids, (initialData as any).proyectos_prospeccion_mismo_cierre_ids) &&
            sameArray((formData as any).proyectos_futuro_lead_ids, (initialData as any).proyectos_futuro_lead_ids) &&
            sameArray((formData as any).proyectos_implementados_reales_ids, (initialData as any).proyectos_implementados_reales_ids) &&
            sameProjectValuesMap((formData as any).proyectos_implementados_reales_valores, (initialData as any).proyectos_implementados_reales_valores)
        )
    }, [mode, initialData, formData])

    const handleCompanySelect = (companyId: string) => {
        lastLoadedProjectsCompanyRef.current = null
        const company = companies.find((c) => c.id === companyId)
        if (!company) {
            setFormData((prev) => ({
                ...prev,
                empresa_id: undefined,
                empresa: '',
                proyectos_pronosticados_ids: [],
                proyectos_prospeccion_mismo_cierre_ids: [],
                proyectos_futuro_lead_ids: [],
                proyectos_implementados_reales_ids: [],
                proyectos_implementados_reales_valores: {}
            }))
            return
        }
        setFormData((prev) => ({
            ...prev,
            empresa: company.nombre,
            empresa_id: company.id
        }))
    }

    const toggleProjectSelection = (projectId: string, stage: 'in_negotiation' | 'prospection_same_close' | 'future_lead_opportunity' | 'implemented_real') => {
        setFormData((prev) => {
            const inNegotiation = new Set<string>((prev.proyectos_pronosticados_ids || []).map(String))
            const prospectionSameClose = new Set<string>((((prev as any).proyectos_prospeccion_mismo_cierre_ids) || []).map(String))
            const futureLead = new Set<string>((((prev as any).proyectos_futuro_lead_ids) || []).map(String))
            const implemented = new Set<string>((prev.proyectos_implementados_reales_ids || []).map(String))
            const implementedValues = { ...((prev as any).proyectos_implementados_reales_valores || {}) } as Record<string, { mensualidad_usd: number | null; implementacion_usd: number | null }>

            if (stage !== 'implemented_real') {
                // These three buckets are mutually exclusive for planning semantics.
                const wasSelected =
                    (stage === 'in_negotiation' && inNegotiation.has(projectId)) ||
                    (stage === 'prospection_same_close' && prospectionSameClose.has(projectId)) ||
                    (stage === 'future_lead_opportunity' && futureLead.has(projectId))
                inNegotiation.delete(projectId)
                prospectionSameClose.delete(projectId)
                futureLead.delete(projectId)
                if (!wasSelected) {
                    if (stage === 'in_negotiation') inNegotiation.add(projectId)
                    if (stage === 'prospection_same_close') prospectionSameClose.add(projectId)
                    if (stage === 'future_lead_opportunity') futureLead.add(projectId)
                }
            } else {
                if (implemented.has(projectId)) {
                    implemented.delete(projectId)
                    delete implementedValues[projectId]
                } else {
                    implemented.add(projectId)
                    const projectCatalogItem = projectsCatalog.find((p) => p.id === projectId)
                    implementedValues[projectId] = implementedValues[projectId] || {
                        mensualidad_usd: projectCatalogItem?.valor_real_mensualidad_usd ?? null,
                        implementacion_usd: projectCatalogItem?.valor_real_implementacion_usd ?? null
                    }
                }
            }

            return {
                ...prev,
                proyectos_pronosticados_ids: Array.from(inNegotiation),
                proyectos_prospeccion_mismo_cierre_ids: Array.from(prospectionSameClose),
                proyectos_futuro_lead_ids: Array.from(futureLead),
                proyectos_implementados_reales_ids: Array.from(implemented),
                proyectos_implementados_reales_valores: implementedValues
            }
        })
    }

    const setImplementedProjectValue = (projectId: string, field: 'mensualidad_usd' | 'implementacion_usd', rawValue: string) => {
        const parsed = parseCurrencyInputValue(rawValue)
        setFormData((prev) => ({
            ...prev,
            proyectos_implementados_reales_valores: {
                ...((prev as any).proyectos_implementados_reales_valores || {}),
                [projectId]: {
                    ...(((prev as any).proyectos_implementados_reales_valores || {})[projectId] || { mensualidad_usd: null, implementacion_usd: null }),
                    [field]: parsed
                }
            }
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

                    {selectedCompany && (
                        <div className='space-y-6 pt-6 border-t' style={{ borderColor: 'var(--card-border)' }}>
                            <div className='flex items-center gap-2'>
                                <div className='w-1 h-4 bg-violet-500 rounded-full'></div>
                                <h3 className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-primary)' }}>
                                    Proyectos de la Empresa (Opcional)
                                </h3>
                            </div>
                            <p className='text-xs font-semibold' style={{ color: 'var(--text-secondary)' }}>
                                Organiza proyectos por etapa comercial: negociación actual, prospección dentro del mismo cierre, oportunidades para un futuro lead y proyectos implementados reales.
                            </p>

                            <div className='grid grid-cols-1 xl:grid-cols-2 gap-6'>
                                <div className='rounded-2xl border p-4 space-y-3' style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}>
                                    <div className='flex items-center justify-between gap-2'>
                                        <p className='text-[10px] font-black uppercase tracking-[0.16em] text-blue-400'>En negociación (este lead)</p>
                                        <span className='text-[10px] font-black text-blue-300'>{(formData.proyectos_pronosticados_ids || []).length}</span>
                                    </div>
                                    <p className='text-[10px] font-bold' style={{ color: 'var(--text-secondary)' }}>
                                        Proyectos ya discutidos en el cierre actual.
                                    </p>
                                    <div className='max-h-44 overflow-y-auto custom-scrollbar space-y-2 pr-1'>
                                        {projectsLoading ? (
                                            <p className='text-xs font-bold' style={{ color: 'var(--text-secondary)' }}>Cargando proyectos...</p>
                                        ) : sortedProjectCatalog.length === 0 ? (
                                            <p className='text-xs font-bold' style={{ color: 'var(--text-secondary)' }}>No hay proyectos activos registrados.</p>
                                        ) : sortedProjectCatalog.map((project) => (
                                            <label key={`forecast-${project.id}`} className='flex items-start gap-2 cursor-pointer'>
                                                <input
                                                    type='checkbox'
                                                    checked={(formData.proyectos_pronosticados_ids || []).includes(project.id)}
                                                    onChange={() => toggleProjectSelection(project.id, 'in_negotiation')}
                                                    className='mt-0.5'
                                                />
                                                <span className='min-w-0'>
                                                    <span className='block text-xs font-black' style={{ color: 'var(--text-primary)' }}>{project.nombre}</span>
                                                    <span className='block text-[10px] font-bold' style={{ color: 'var(--text-secondary)' }}>
                                                        M real: {project.valor_real_mensualidad_usd != null ? `$${Math.round(project.valor_real_mensualidad_usd).toLocaleString('es-MX')}` : 'N/D'}
                                                    </span>
                                                    <span className='block text-[10px] font-bold' style={{ color: 'var(--text-secondary)' }}>
                                                        I real: {project.valor_real_implementacion_usd != null ? `$${Math.round(project.valor_real_implementacion_usd).toLocaleString('es-MX')}` : 'N/D'}
                                                    </span>
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div className='rounded-2xl border p-4 space-y-3' style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}>
                                    <div className='flex items-center justify-between gap-2'>
                                        <p className='text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300'>Prospección mismo cierre</p>
                                        <span className='text-[10px] font-black text-cyan-200'>{((formData as any).proyectos_prospeccion_mismo_cierre_ids || []).length}</span>
                                    </div>
                                    <p className='text-[10px] font-bold' style={{ color: 'var(--text-secondary)' }}>
                                        El vendedor cree que podrían entrar en el mismo cierre, pero aún están en exploración.
                                    </p>
                                    <div className='max-h-44 overflow-y-auto custom-scrollbar space-y-2 pr-1'>
                                        {projectsLoading ? (
                                            <p className='text-xs font-bold' style={{ color: 'var(--text-secondary)' }}>Cargando proyectos...</p>
                                        ) : sortedProjectCatalog.length === 0 ? (
                                            <p className='text-xs font-bold' style={{ color: 'var(--text-secondary)' }}>No hay proyectos activos registrados.</p>
                                        ) : sortedProjectCatalog.map((project) => (
                                            <label key={`prospect-same-close-${project.id}`} className='flex items-start gap-2 cursor-pointer'>
                                                <input
                                                    type='checkbox'
                                                    checked={((formData as any).proyectos_prospeccion_mismo_cierre_ids || []).includes(project.id)}
                                                    onChange={() => toggleProjectSelection(project.id, 'prospection_same_close')}
                                                    className='mt-0.5'
                                                />
                                                <span className='min-w-0'>
                                                    <span className='block text-xs font-black' style={{ color: 'var(--text-primary)' }}>{project.nombre}</span>
                                                    <span className='block text-[10px] font-bold' style={{ color: 'var(--text-secondary)' }}>
                                                        M real: {project.valor_real_mensualidad_usd != null ? `$${Math.round(project.valor_real_mensualidad_usd).toLocaleString('es-MX')}` : 'N/D'}
                                                    </span>
                                                    <span className='block text-[10px] font-bold' style={{ color: 'var(--text-secondary)' }}>
                                                        I real: {project.valor_real_implementacion_usd != null ? `$${Math.round(project.valor_real_implementacion_usd).toLocaleString('es-MX')}` : 'N/D'}
                                                    </span>
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div className='rounded-2xl border p-4 space-y-3' style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}>
                                    <div className='flex items-center justify-between gap-2'>
                                        <p className='text-[10px] font-black uppercase tracking-[0.16em] text-violet-300'>Futuro lead (misma empresa)</p>
                                        <span className='text-[10px] font-black text-violet-200'>{((formData as any).proyectos_futuro_lead_ids || []).length}</span>
                                    </div>
                                    <p className='text-[10px] font-bold' style={{ color: 'var(--text-secondary)' }}>
                                        Proyectos viables para después del primer cierre, en una oportunidad futura con la misma empresa.
                                    </p>
                                    <div className='max-h-44 overflow-y-auto custom-scrollbar space-y-2 pr-1'>
                                        {projectsLoading ? (
                                            <p className='text-xs font-bold' style={{ color: 'var(--text-secondary)' }}>Cargando proyectos...</p>
                                        ) : sortedProjectCatalog.length === 0 ? (
                                            <p className='text-xs font-bold' style={{ color: 'var(--text-secondary)' }}>No hay proyectos activos registrados.</p>
                                        ) : sortedProjectCatalog.map((project) => (
                                            <label key={`future-lead-${project.id}`} className='flex items-start gap-2 cursor-pointer'>
                                                <input
                                                    type='checkbox'
                                                    checked={((formData as any).proyectos_futuro_lead_ids || []).includes(project.id)}
                                                    onChange={() => toggleProjectSelection(project.id, 'future_lead_opportunity')}
                                                    className='mt-0.5'
                                                />
                                                <span className='min-w-0'>
                                                    <span className='block text-xs font-black' style={{ color: 'var(--text-primary)' }}>{project.nombre}</span>
                                                    <span className='block text-[10px] font-bold' style={{ color: 'var(--text-secondary)' }}>
                                                        M real: {project.valor_real_mensualidad_usd != null ? `$${Math.round(project.valor_real_mensualidad_usd).toLocaleString('es-MX')}` : 'N/D'}
                                                    </span>
                                                    <span className='block text-[10px] font-bold' style={{ color: 'var(--text-secondary)' }}>
                                                        I real: {project.valor_real_implementacion_usd != null ? `$${Math.round(project.valor_real_implementacion_usd).toLocaleString('es-MX')}` : 'N/D'}
                                                    </span>
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div className='rounded-2xl border p-4 space-y-3' style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}>
                                    <div className='flex items-center justify-between gap-2'>
                                        <p className='text-[10px] font-black uppercase tracking-[0.16em] text-emerald-400'>Proyecto implementado real</p>
                                        <span className='text-[10px] font-black text-emerald-300'>{(formData.proyectos_implementados_reales_ids || []).length}</span>
                                    </div>
                                    {!isWonStageLocal(formData.etapa) && (
                                        <p className='text-[10px] font-bold rounded-lg border px-2 py-1'
                                            style={{ color: 'var(--text-secondary)', borderColor: 'var(--card-border)', background: 'var(--background)' }}>
                                            Recomendado usar esta lista cuando el lead esté en “Cerrado Ganado”.
                                        </p>
                                    )}
                                    <div className='max-h-44 overflow-y-auto custom-scrollbar space-y-2 pr-1'>
                                        {projectsLoading ? (
                                            <p className='text-xs font-bold' style={{ color: 'var(--text-secondary)' }}>Cargando proyectos...</p>
                                        ) : sortedProjectCatalog.length === 0 ? (
                                            <p className='text-xs font-bold' style={{ color: 'var(--text-secondary)' }}>No hay proyectos activos registrados.</p>
                                        ) : sortedProjectCatalog.map((project) => (
                                            <div key={`real-${project.id}`} className='rounded-xl border p-2.5' style={{ borderColor: 'var(--card-border)', background: 'var(--background)' }}>
                                                <label className='flex items-start gap-2 cursor-pointer'>
                                                    <input
                                                        type='checkbox'
                                                        checked={(formData.proyectos_implementados_reales_ids || []).includes(project.id)}
                                                        onChange={() => toggleProjectSelection(project.id, 'implemented_real')}
                                                        className='mt-0.5'
                                                    />
                                                    <span className='min-w-0'>
                                                        <span className='block text-xs font-black' style={{ color: 'var(--text-primary)' }}>{project.nombre}</span>
                                                        <span className='block text-[10px] font-bold' style={{ color: 'var(--text-secondary)' }}>
                                                            Real catálogo M: {project.valor_real_mensualidad_usd != null ? `$${Math.round(project.valor_real_mensualidad_usd).toLocaleString('es-MX')}` : 'N/D'}
                                                        </span>
                                                        <span className='block text-[10px] font-bold' style={{ color: 'var(--text-secondary)' }}>
                                                            Real catálogo I: {project.valor_real_implementacion_usd != null ? `$${Math.round(project.valor_real_implementacion_usd).toLocaleString('es-MX')}` : 'N/D'}
                                                        </span>
                                                    </span>
                                                </label>
                                                {(formData.proyectos_implementados_reales_ids || []).includes(project.id) && (
                                                    <div className='mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2'>
                                                        <div>
                                                            <label className='text-[9px] font-black uppercase tracking-[0.12em] text-emerald-300'>Mensualidad pactada</label>
                                                            <input
                                                                type='text'
                                                                inputMode='numeric'
                                                                value={formatCurrencyInputNumber(((formData as any).proyectos_implementados_reales_valores || {})[project.id]?.mensualidad_usd ?? null)}
                                                                onChange={(e) => setImplementedProjectValue(project.id, 'mensualidad_usd', e.target.value)}
                                                                className='mt-1 w-full px-2.5 py-2 rounded-lg border text-xs font-bold'
                                                                style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                                                placeholder='0'
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className='text-[9px] font-black uppercase tracking-[0.12em] text-emerald-300'>Implementación pactada</label>
                                                            <input
                                                                type='text'
                                                                inputMode='numeric'
                                                                value={formatCurrencyInputNumber(((formData as any).proyectos_implementados_reales_valores || {})[project.id]?.implementacion_usd ?? null)}
                                                                onChange={(e) => setImplementedProjectValue(project.id, 'implementacion_usd', e.target.value)}
                                                                className='mt-1 w-full px-2.5 py-2 rounded-lg border text-xs font-bold'
                                                                style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                                                placeholder='0'
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

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
