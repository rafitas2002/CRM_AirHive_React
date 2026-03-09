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
    valor_estimado: number | null
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
    loss_reason_id?: string | null
    loss_subreason_id?: string | null
    loss_notes?: string | null
    loss_recorded_at?: string | null
    loss_recorded_by?: string | null
    prospect_role_catalog_id?: string | null
    prospect_role_custom?: string | null
    prospect_role_exact_title?: string | null
    prospect_age_exact?: number | null
    prospect_age_range_id?: string | null
    prospect_decision_role?: 'decision_maker' | 'influencer' | 'evaluator' | 'user' | 'gatekeeper' | 'unknown' | null
    prospect_preferred_contact_channel?: 'whatsapp' | 'llamada' | 'email' | 'video' | 'presencial' | 'sin_preferencia' | null
    prospect_linkedin_url?: string | null
    prospect_is_family_member?: boolean | null
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

type LossReasonCatalogItem = {
    id: string
    code: string
    label: string
    description?: string | null
    sort_order?: number | null
    is_active?: boolean
}

type LossSubreasonCatalogItem = {
    id: string
    reason_id: string
    code: string
    label: string
    sort_order?: number | null
    is_active?: boolean
}

type ProspectRoleCatalogItem = {
    id: string
    code: string
    label: string
    description?: string | null
    sort_order?: number | null
    is_active?: boolean
}

type AgeRangeCatalogItem = {
    id: string
    code: string
    label: string
    min_age?: number | null
    max_age?: number | null
    sort_order?: number | null
    is_active?: boolean
}

const PROSPECT_DECISION_ROLE_OPTIONS: Array<{ value: NonNullable<ClientData['prospect_decision_role']>; label: string }> = [
    { value: 'decision_maker', label: 'Tomador/a de decisión' },
    { value: 'influencer', label: 'Influenciador/a' },
    { value: 'evaluator', label: 'Evaluador/a técnico/comercial' },
    { value: 'user', label: 'Usuario/a final' },
    { value: 'gatekeeper', label: 'Filtro / Compras' },
    { value: 'unknown', label: 'Rol en decisión no especificado' }
]

const PREFERRED_CONTACT_CHANNEL_OPTIONS: Array<{ value: NonNullable<ClientData['prospect_preferred_contact_channel']>; label: string }> = [
    { value: 'whatsapp', label: 'WhatsApp' },
    { value: 'llamada', label: 'Llamada' },
    { value: 'email', label: 'Email' },
    { value: 'video', label: 'Video' },
    { value: 'presencial', label: 'Presencial' },
    { value: 'sin_preferencia', label: 'Sin preferencia declarada' }
]

function findAgeRangeIdForAge(age: number | null | undefined, ranges: AgeRangeCatalogItem[]): string | null {
    if (age == null || !Number.isFinite(age)) return null
    for (const range of ranges) {
        const minAge = range.min_age == null ? null : Number(range.min_age)
        const maxAge = range.max_age == null ? null : Number(range.max_age)
        if (minAge == null) continue
        if (age >= minAge && (maxAge == null || age <= maxAge)) {
            return range.id
        }
    }
    return null
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
        telefono: '',
        loss_reason_id: null,
        loss_subreason_id: null,
        loss_notes: '',
        loss_recorded_at: null,
        loss_recorded_by: null,
        prospect_role_catalog_id: null,
        prospect_role_custom: '',
        prospect_role_exact_title: '',
        prospect_age_exact: null,
        prospect_age_range_id: null,
        prospect_decision_role: null,
        prospect_preferred_contact_channel: null,
        prospect_linkedin_url: '',
        prospect_is_family_member: false
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
    const [lossReasonsCatalog, setLossReasonsCatalog] = useState<LossReasonCatalogItem[]>([])
    const [lossSubreasonsCatalog, setLossSubreasonsCatalog] = useState<LossSubreasonCatalogItem[]>([])
    const [lossCatalogLoading, setLossCatalogLoading] = useState(false)
    const [lossCatalogError, setLossCatalogError] = useState<string | null>(null)
    const [prospectRolesCatalog, setProspectRolesCatalog] = useState<ProspectRoleCatalogItem[]>([])
    const [prospectRolesCatalogLoading, setProspectRolesCatalogLoading] = useState(false)
    const [prospectRolesCatalogError, setProspectRolesCatalogError] = useState<string | null>(null)
    const [ageRangesCatalog, setAgeRangesCatalog] = useState<AgeRangeCatalogItem[]>([])
    const [ageRangesCatalogLoading, setAgeRangesCatalogLoading] = useState(false)
    const [ageRangesCatalogError, setAgeRangesCatalogError] = useState<string | null>(null)
    const [selectedProspectRoleOption, setSelectedProspectRoleOption] = useState<string>('')
    const areRealCloseValueFieldsLockedInForm = true
    const lastLoadedProjectsCompanyRef = useRef<string | null>(null)
    const lastManualEstimatedValueRef = useRef<number | null>(null)
    const lastManualImplementationEstimatedValueRef = useRef<number | null>(null)

    useEffect(() => {
        if (isOpen && !wasOpen.current) {
            if (initialData) {
                setFormData({
                    ...initialData,
                    valor_real_cierre: initialData.valor_real_cierre ?? null,
                    valor_implementacion_estimado: (initialData as any).valor_implementacion_estimado ?? null,
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
                    telefono: initialData.telefono || '',
                    loss_reason_id: (initialData as any).loss_reason_id ?? null,
                    loss_subreason_id: (initialData as any).loss_subreason_id ?? null,
                    loss_notes: (initialData as any).loss_notes ?? '',
                    loss_recorded_at: (initialData as any).loss_recorded_at ?? null,
                    loss_recorded_by: (initialData as any).loss_recorded_by ?? null,
                    prospect_role_catalog_id: (initialData as any).prospect_role_catalog_id ?? null,
                    prospect_role_custom: (initialData as any).prospect_role_custom ?? '',
                    prospect_role_exact_title: (initialData as any).prospect_role_exact_title
                        ?? ((initialData as any).prospect_role_catalog_id ? '' : ((initialData as any).prospect_role_custom ?? '')),
                    prospect_age_exact: (initialData as any).prospect_age_exact ?? null,
                    prospect_age_range_id: (initialData as any).prospect_age_range_id ?? null,
                    prospect_decision_role: (initialData as any).prospect_decision_role ?? null,
                    prospect_preferred_contact_channel: (initialData as any).prospect_preferred_contact_channel ?? null,
                    prospect_linkedin_url: (initialData as any).prospect_linkedin_url ?? '',
                    prospect_is_family_member: (initialData as any).prospect_is_family_member ?? false
                })
                if ((initialData as any).prospect_role_catalog_id) {
                    setSelectedProspectRoleOption(String((initialData as any).prospect_role_catalog_id))
                } else {
                    setSelectedProspectRoleOption('')
                }
                if (mode === 'edit') {
                    checkProbabilityEditability()
                }
            } else {
                lastManualEstimatedValueRef.current = null
                lastManualImplementationEstimatedValueRef.current = null
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
                    telefono: '',
                    loss_reason_id: null,
                    loss_subreason_id: null,
                    loss_notes: '',
                    loss_recorded_at: null,
                    loss_recorded_by: null,
                    prospect_role_catalog_id: null,
                    prospect_role_custom: '',
                    prospect_role_exact_title: '',
                    prospect_age_exact: null,
                    prospect_age_range_id: null,
                    prospect_decision_role: null,
                    prospect_preferred_contact_channel: null,
                    prospect_linkedin_url: '',
                    prospect_is_family_member: false
                })
                setSelectedProspectRoleOption('')
                setPhoneError('')
                setIsProbEditable(true)
                setEditabilityReason('')
            }
            setShowCloseLeadPanel(false)
            setPendingCloseOutcome('won')
            setPendingCloseDate((initialData as any)?.closed_at_real || todayDateOnly())
            setPendingCloseRealValue(initialData?.valor_real_cierre ?? null)
            setPendingCloseImplementationRealValue((initialData as any)?.valor_implementacion_real_cierre ?? null)
            fetchCurrentUser()
        }
        wasOpen.current = isOpen
    }, [isOpen, initialData, mode])

    useEffect(() => {
        if (formData.valor_estimado != null && formData.valor_estimado > 0) {
            lastManualEstimatedValueRef.current = formData.valor_estimado
        }
    }, [formData.valor_estimado])

    useEffect(() => {
        const value = (formData as any).valor_implementacion_estimado
        if (value != null && Number(value) > 0) {
            lastManualImplementationEstimatedValueRef.current = Number(value)
        }
    }, [(formData as any).valor_implementacion_estimado])

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
        if (!isOpen) return
        let cancelled = false

        const loadLossCatalogs = async () => {
            setLossCatalogLoading(true)
            setLossCatalogError(null)

            const [reasonsRes, subreasonsRes] = await Promise.all([
                (supabase.from('lead_loss_reasons') as any)
                    .select('id, code, label, description, sort_order, is_active')
                    .eq('is_active', true)
                    .order('sort_order', { ascending: true })
                    .order('label', { ascending: true }),
                (supabase.from('lead_loss_subreasons') as any)
                    .select('id, reason_id, code, label, sort_order, is_active')
                    .eq('is_active', true)
                    .order('sort_order', { ascending: true })
                    .order('label', { ascending: true })
            ])

            const reasonsError = (reasonsRes as any).error
            const subreasonsError = (subreasonsRes as any).error
            if (reasonsError || subreasonsError) {
                const rawMessage = String(reasonsError?.message || subreasonsError?.message || 'No se pudo cargar catálogo de razones de pérdida.')
                const normalized = rawMessage.toLowerCase()
                const isMissingCatalog = normalized.includes('lead_loss_reasons') || normalized.includes('lead_loss_subreasons') || normalized.includes('does not exist') || normalized.includes('42p01')
                if (!cancelled) {
                    setLossReasonsCatalog([])
                    setLossSubreasonsCatalog([])
                    setLossCatalogError(
                        isMissingCatalog
                            ? 'El catálogo de razones de pérdida aún no está disponible en esta base de datos. Ejecuta la migración 060.'
                            : rawMessage
                    )
                    setLossCatalogLoading(false)
                }
                return
            }

            if (!cancelled) {
                setLossReasonsCatalog(Array.isArray((reasonsRes as any).data) ? (reasonsRes as any).data.map((row: any) => ({
                    id: String(row.id),
                    code: String(row.code || ''),
                    label: String(row.label || 'Motivo'),
                    description: row.description == null ? null : String(row.description),
                    sort_order: row.sort_order == null ? null : Number(row.sort_order),
                    is_active: !!row.is_active
                })) : [])
                setLossSubreasonsCatalog(Array.isArray((subreasonsRes as any).data) ? (subreasonsRes as any).data.map((row: any) => ({
                    id: String(row.id),
                    reason_id: String(row.reason_id),
                    code: String(row.code || ''),
                    label: String(row.label || 'Submotivo'),
                    sort_order: row.sort_order == null ? null : Number(row.sort_order),
                    is_active: !!row.is_active
                })) : [])
                setLossCatalogLoading(false)
            }
        }

        void loadLossCatalogs()
        return () => {
            cancelled = true
        }
    }, [isOpen, supabase])

    useEffect(() => {
        if (!isOpen) return
        let cancelled = false

        const loadProspectRolesCatalog = async () => {
            setProspectRolesCatalogLoading(true)
            setProspectRolesCatalogError(null)

            const { data, error } = await (supabase.from('lead_prospect_roles_catalog') as any)
                .select('id, code, label, description, sort_order, is_active')
                .eq('is_active', true)
                .order('sort_order', { ascending: true })
                .order('label', { ascending: true })

            if (error) {
                const rawMessage = String(error?.message || 'No se pudo cargar el catálogo de puestos del prospecto.')
                const normalized = rawMessage.toLowerCase()
                const isMissingCatalog = normalized.includes('lead_prospect_roles_catalog') || normalized.includes('does not exist') || normalized.includes('42p01')
                if (!cancelled) {
                    setProspectRolesCatalog([])
                    setProspectRolesCatalogError(
                        isMissingCatalog
                            ? 'El catálogo de puestos del prospecto aún no está disponible en esta base de datos. Ejecuta la migración 085.'
                            : rawMessage
                    )
                    setProspectRolesCatalogLoading(false)
                }
                return
            }

            if (!cancelled) {
                setProspectRolesCatalog(Array.isArray(data) ? data.map((row: any) => ({
                    id: String(row.id),
                    code: String(row.code || ''),
                    label: String(row.label || 'Puesto'),
                    description: row.description == null ? null : String(row.description),
                    sort_order: row.sort_order == null ? null : Number(row.sort_order),
                    is_active: !!row.is_active
                })) : [])
                setProspectRolesCatalogLoading(false)
            }
        }

        void loadProspectRolesCatalog()
        return () => {
            cancelled = true
        }
    }, [isOpen, supabase])

    useEffect(() => {
        if (!isOpen) return
        let cancelled = false

        const loadAgeRangesCatalog = async () => {
            setAgeRangesCatalogLoading(true)
            setAgeRangesCatalogError(null)

            const { data, error } = await (supabase.from('lead_age_ranges_catalog') as any)
                .select('id, code, label, min_age, max_age, sort_order, is_active')
                .eq('is_active', true)
                .order('sort_order', { ascending: true })
                .order('label', { ascending: true })

            if (error) {
                const rawMessage = String(error?.message || 'No se pudo cargar el catálogo de rangos de edad.')
                const normalized = rawMessage.toLowerCase()
                const isMissingCatalog = normalized.includes('lead_age_ranges_catalog') || normalized.includes('does not exist') || normalized.includes('42p01')
                if (!cancelled) {
                    setAgeRangesCatalog([])
                    setAgeRangesCatalogError(
                        isMissingCatalog
                            ? 'El catálogo de rangos de edad aún no está disponible. Ejecuta la migración 086.'
                            : rawMessage
                    )
                    setAgeRangesCatalogLoading(false)
                }
                return
            }

            if (!cancelled) {
                setAgeRangesCatalog(Array.isArray(data) ? data.map((row: any) => ({
                    id: String(row.id),
                    code: String(row.code || ''),
                    label: String(row.label || 'Rango'),
                    min_age: row.min_age == null ? null : Number(row.min_age),
                    max_age: row.max_age == null ? null : Number(row.max_age),
                    sort_order: row.sort_order == null ? null : Number(row.sort_order),
                    is_active: !!row.is_active
                })) : [])
                setAgeRangesCatalogLoading(false)
            }
        }

        void loadAgeRangesCatalog()
        return () => {
            cancelled = true
        }
    }, [isOpen, supabase])

    useEffect(() => {
        if (showCloseLeadPanel) {
            setPendingCloseDate(formData.closed_at_real || todayDateOnly())
            setPendingCloseRealValue(formData.valor_real_cierre ?? null)
            setPendingCloseImplementationRealValue((formData as any).valor_implementacion_real_cierre ?? null)
        }
    }, [showCloseLeadPanel, formData.closed_at_real, formData.valor_real_cierre, (formData as any).valor_implementacion_real_cierre])

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
    const sortedProspectRolesCatalog = useMemo(
        () => [...prospectRolesCatalog].sort((a, b) => {
            const leftOrder = a.sort_order == null ? Number.MAX_SAFE_INTEGER : Number(a.sort_order)
            const rightOrder = b.sort_order == null ? Number.MAX_SAFE_INTEGER : Number(b.sort_order)
            if (leftOrder !== rightOrder) return leftOrder - rightOrder
            return a.label.localeCompare(b.label, 'es')
        }),
        [prospectRolesCatalog]
    )
    const sortedAgeRangesCatalog = useMemo(
        () => [...ageRangesCatalog].sort((a, b) => {
            const leftOrder = a.sort_order == null ? Number.MAX_SAFE_INTEGER : Number(a.sort_order)
            const rightOrder = b.sort_order == null ? Number.MAX_SAFE_INTEGER : Number(b.sort_order)
            if (leftOrder !== rightOrder) return leftOrder - rightOrder
            return a.label.localeCompare(b.label, 'es')
        }),
        [ageRangesCatalog]
    )
    const filteredLossSubreasons = useMemo(() => {
        const reasonId = (formData as any).loss_reason_id || null
        if (!reasonId) return []
        return lossSubreasonsCatalog.filter((item) => item.reason_id === reasonId)
    }, [lossSubreasonsCatalog, (formData as any).loss_reason_id])
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
            norm((formData as any).prospect_role_catalog_id) === norm((initialData as any).prospect_role_catalog_id) &&
            String((formData as any).prospect_role_custom || '') === String((initialData as any).prospect_role_custom || '') &&
            String((formData as any).prospect_role_exact_title || '') === String((initialData as any).prospect_role_exact_title || '') &&
            asNum((formData as any).prospect_age_exact) === asNum((initialData as any).prospect_age_exact) &&
            norm((formData as any).prospect_age_range_id) === norm((initialData as any).prospect_age_range_id) &&
            norm((formData as any).prospect_decision_role) === norm((initialData as any).prospect_decision_role) &&
            norm((formData as any).prospect_preferred_contact_channel) === norm((initialData as any).prospect_preferred_contact_channel) &&
            String((formData as any).prospect_linkedin_url || '') === String((initialData as any).prospect_linkedin_url || '') &&
            Boolean((formData as any).prospect_is_family_member) === Boolean((initialData as any).prospect_is_family_member) &&
            String(formData.etapa || '') === String(initialData.etapa || '') &&
            asNum(formData.valor_estimado) === asNum(initialData.valor_estimado) &&
            asNum(formData.valor_real_cierre) === asNum(initialData.valor_real_cierre) &&
            asNum((formData as any).valor_implementacion_estimado) === asNum((initialData as any).valor_implementacion_estimado) &&
            asNum((formData as any).valor_implementacion_real_cierre) === asNum((initialData as any).valor_implementacion_real_cierre) &&
            String(formData.oportunidad || '') === String(initialData.oportunidad || '') &&
            asNum(formData.calificacion) === asNum(initialData.calificacion) &&
            String(formData.notas || '') === String(initialData.notas || '') &&
            norm((formData as any).loss_reason_id) === norm((initialData as any).loss_reason_id) &&
            norm((formData as any).loss_subreason_id) === norm((initialData as any).loss_subreason_id) &&
            String(((formData as any).loss_notes || '')) === String((((initialData as any).loss_notes) || '')) &&
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

    const handleProspectRoleSelect = (nextValue: string) => {
        setSelectedProspectRoleOption(nextValue)
        if (!nextValue) {
            setFormData((prev) => ({
                ...prev,
                prospect_role_catalog_id: null
            }))
            return
        }
        setFormData((prev) => ({
            ...prev,
            prospect_role_catalog_id: nextValue
        }))
    }

    const handleProspectAgeExactChange = (rawValue: string) => {
        const trimmed = String(rawValue || '').trim()
        if (!trimmed) {
            setFormData((prev) => ({
                ...prev,
                prospect_age_exact: null
            }))
            return
        }
        const parsed = Number(trimmed)
        if (!Number.isFinite(parsed)) return
        const normalizedAge = Math.max(0, Math.round(parsed))
        const inferredRangeId = findAgeRangeIdForAge(normalizedAge, sortedAgeRangesCatalog)
        setFormData((prev) => ({
            ...prev,
            prospect_age_exact: normalizedAge,
            prospect_age_range_id: inferredRangeId || prev.prospect_age_range_id || null
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

        if (prospectRolesCatalogError && selectedProspectRoleOption) {
            alert('No se pudo validar el catálogo de puestos. Ejecuta la migración 085 o limpia el área seleccionada.')
            return
        }
        if (ageRangesCatalogError && (formData as any).prospect_age_range_id) {
            alert('No se pudo validar el catálogo de rangos de edad. Ejecuta la migración 086 o limpia el rango de edad.')
            return
        }

        const normalizedProspectAgeExactRaw = (formData as any).prospect_age_exact
        const normalizedProspectAgeExact = normalizedProspectAgeExactRaw == null || normalizedProspectAgeExactRaw === ''
            ? null
            : Math.round(Number(normalizedProspectAgeExactRaw))

        if (normalizedProspectAgeExact != null && (!Number.isFinite(normalizedProspectAgeExact) || normalizedProspectAgeExact < 16 || normalizedProspectAgeExact > 100)) {
            alert('La edad del prospecto debe estar entre 16 y 100 años.')
            return
        }

        const inferredAgeRangeId = findAgeRangeIdForAge(normalizedProspectAgeExact, sortedAgeRangesCatalog)
        const normalizedProspectAgeRangeId = inferredAgeRangeId || ((formData as any).prospect_age_range_id || null)
        const normalizedProspectRoleCatalogId = ((formData as any).prospect_role_catalog_id || null)
        const normalizedProspectDecisionRole = ((formData as any).prospect_decision_role || null)
        const normalizedPreferredContactChannel = ((formData as any).prospect_preferred_contact_channel || null)
        const normalizedLinkedin = String((formData as any).prospect_linkedin_url || '').trim() || null
        const normalizedExactRoleTitle = String((formData as any).prospect_role_exact_title || '').trim() || null
        const normalizedLegacyProspectRoleCustom = normalizedProspectRoleCatalogId ? null : normalizedExactRoleTitle

        const normalizedFormData: ClientData = {
            ...formData,
            prospect_role_catalog_id: normalizedProspectRoleCatalogId,
            prospect_role_custom: normalizedLegacyProspectRoleCustom,
            prospect_role_exact_title: normalizedExactRoleTitle,
            prospect_age_exact: normalizedProspectAgeExact,
            prospect_age_range_id: normalizedProspectAgeRangeId,
            prospect_decision_role: normalizedProspectDecisionRole,
            prospect_preferred_contact_channel: normalizedPreferredContactChannel,
            prospect_linkedin_url: normalizedLinkedin,
            prospect_is_family_member: Boolean((formData as any).prospect_is_family_member)
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

        if (isLostStageLocal(formData.etapa)) {
            if (lossCatalogError) {
                alert('No se puede registrar Cerrado Perdido sin catálogo de razones/submotivos. Ejecuta la migración 060 en Supabase.')
                return
            }
            if (!(formData as any).loss_reason_id || !(formData as any).loss_subreason_id) {
                alert('Para cerrar como perdido debes seleccionar un motivo y un submotivo.')
                return
            }
        }

        setIsSubmitting(true)
        try {
            await onSave(normalizedFormData)
            onClose()
        } catch (error) {
            console.error('Error saving client:', error)
        } finally {
            setIsSubmitting(false)
        }
    }

    if (!isOpen) return null

    const estimatedValueUnavailable = formData.valor_estimado == null
    const implementationEstimatedValueUnavailable = (formData as any).valor_implementacion_estimado == null

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
            valor_real_cierre: pendingCloseOutcome === 'won' ? (pendingCloseRealValue ?? null) : null,
            valor_implementacion_real_cierre: pendingCloseOutcome === 'won'
                ? (pendingCloseImplementationRealValue ?? null)
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
                <form id='client-form' onSubmit={handleSubmit} className='flex-1 overflow-y-auto p-8 custom-scrollbar space-y-8'>
                    <div className='ah-required-note' role='note'>
                        <span className='ah-required-note-dot' aria-hidden='true' />
                        Campos obligatorios: se marcan en rojo solo si faltan al confirmar
                    </div>

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

                        <div className='space-y-4'>
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

                            <div className='space-y-3'>
                                <label className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                                    Área del Puesto (Opcional)
                                </label>
                                <select
                                    value={selectedProspectRoleOption}
                                    onChange={(e) => handleProspectRoleSelect(e.target.value)}
                                    className='w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 font-bold transition-all cursor-pointer appearance-none'
                                    style={{
                                        background: 'var(--background)',
                                        borderColor: 'var(--card-border)',
                                        color: 'var(--text-primary)'
                                    }}
                                >
                                    <option value=''>Seleccionar área...</option>
                                    {sortedProspectRolesCatalog.map((role) => (
                                        <option key={role.id} value={role.id}>
                                            {role.label}
                                        </option>
                                    ))}
                                </select>

                                <div className='space-y-2'>
                                    <label className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                                        Nombre Exacto del Puesto (Opcional)
                                    </label>
                                    <input
                                        type='text'
                                        value={(formData as any).prospect_role_exact_title || ''}
                                        onChange={(e) => setFormData({ ...formData, prospect_role_exact_title: e.target.value })}
                                        className='w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 font-bold transition-all'
                                        style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                        placeholder='Ej. Gerente Regional de Operaciones'
                                    />
                                </div>

                                {prospectRolesCatalogLoading && (
                                    <p className='text-[11px] font-bold' style={{ color: 'var(--text-secondary)' }}>
                                        Cargando catálogo de puestos...
                                    </p>
                                )}

                                {prospectRolesCatalogError && (
                                    <p className='text-[11px] font-bold' style={{ color: '#f59e0b' }}>
                                        {prospectRolesCatalogError}
                                    </p>
                                )}

                                {!prospectRolesCatalogError && (
                                    <p className='text-[10px] font-semibold' style={{ color: 'var(--text-secondary)' }}>
                                        Registra el área para estandarizar correlaciones y, si aplica, el nombre exacto del puesto para enriquecer la data.
                                    </p>
                                )}

                                <label className='inline-flex items-center gap-2 text-[11px] font-bold cursor-pointer select-none' style={{ color: 'var(--text-secondary)' }}>
                                    <input
                                        type='checkbox'
                                        checked={Boolean((formData as any).prospect_is_family_member)}
                                        onChange={(e) => setFormData({ ...formData, prospect_is_family_member: e.target.checked })}
                                        className='h-4 w-4 rounded border border-[var(--card-border)] accent-blue-600 cursor-pointer'
                                    />
                                    Es familiar de la empresa (hijo/a, nieto/a u otro vínculo familiar)
                                </label>

                                <div className='grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1'>
                                    <div className='space-y-2'>
                                        <label className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                                            Edad Exacta (Opcional)
                                        </label>
                                        <input
                                            type='number'
                                            min={16}
                                            max={100}
                                            value={(formData as any).prospect_age_exact ?? ''}
                                            onChange={(e) => handleProspectAgeExactChange(e.target.value)}
                                            className='w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 font-bold transition-all'
                                            style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                            placeholder='Ej. 37'
                                        />
                                    </div>

                                    <div className='space-y-2'>
                                        <label className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                                            Rango de Edad (Opcional)
                                        </label>
                                        <select
                                            value={(formData as any).prospect_age_range_id || ''}
                                            onChange={(e) => setFormData({ ...formData, prospect_age_range_id: e.target.value || null })}
                                            className='w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 font-bold transition-all cursor-pointer appearance-none'
                                            style={{
                                                background: 'var(--background)',
                                                borderColor: 'var(--card-border)',
                                                color: 'var(--text-primary)'
                                            }}
                                        >
                                            <option value=''>Seleccionar rango...</option>
                                            {sortedAgeRangesCatalog.map((range) => (
                                                <option key={range.id} value={range.id}>
                                                    {range.label}
                                                </option>
                                            ))}
                                        </select>
                                        {ageRangesCatalogLoading && (
                                            <p className='text-[10px] font-semibold' style={{ color: 'var(--text-secondary)' }}>
                                                Cargando rangos...
                                            </p>
                                        )}
                                        {ageRangesCatalogError && (
                                            <p className='text-[10px] font-semibold' style={{ color: '#f59e0b' }}>
                                                {ageRangesCatalogError}
                                            </p>
                                        )}
                                    </div>

                                    <div className='space-y-2 sm:col-span-2'>
                                        <label className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                                            Rol en la Decisión de Compra (Opcional)
                                        </label>
                                        <select
                                            value={(formData as any).prospect_decision_role || ''}
                                            onChange={(e) => setFormData({ ...formData, prospect_decision_role: (e.target.value || null) as any })}
                                            className='w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 font-bold transition-all cursor-pointer appearance-none'
                                            style={{
                                                background: 'var(--background)',
                                                borderColor: 'var(--card-border)',
                                                color: 'var(--text-primary)'
                                            }}
                                        >
                                            <option value=''>Seleccionar rol de decisión...</option>
                                            {PROSPECT_DECISION_ROLE_OPTIONS.map((option) => (
                                                <option key={option.value} value={option.value}>
                                                    {option.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className='space-y-2 sm:col-span-2'>
                                        <label className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                                            Canal de Contacto Preferido (Opcional)
                                        </label>
                                        <select
                                            value={(formData as any).prospect_preferred_contact_channel || ''}
                                            onChange={(e) => setFormData({ ...formData, prospect_preferred_contact_channel: (e.target.value || null) as any })}
                                            className='w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 font-bold transition-all cursor-pointer appearance-none'
                                            style={{
                                                background: 'var(--background)',
                                                borderColor: 'var(--card-border)',
                                                color: 'var(--text-primary)'
                                            }}
                                        >
                                            <option value=''>Seleccionar canal...</option>
                                            {PREFERRED_CONTACT_CHANNEL_OPTIONS.map((option) => (
                                                <option key={option.value} value={option.value}>
                                                    {option.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className='space-y-2 sm:col-span-2'>
                                        <label className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                                            LinkedIn del Prospecto (Opcional)
                                        </label>
                                        <input
                                            type='text'
                                            value={(formData as any).prospect_linkedin_url || ''}
                                            onChange={(e) => setFormData({ ...formData, prospect_linkedin_url: e.target.value })}
                                            className='w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 font-bold transition-all'
                                            style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                            placeholder='https://www.linkedin.com/in/...'
                                        />
                                    </div>
                                </div>
                            </div>
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
                                <label className='text-[10px] font-black text-blue-500 uppercase tracking-widest'>Teléfono WhatsApp</label>
                                <div className='relative'>
                                    <input
                                        type='text'
                                        value={formData.telefono}
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/\D/g, '').slice(0, 10)
                                            setFormData({ ...formData, telefono: val })
                                            if (val.length === 10) setPhoneError('')
                                        }}
                                        className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-4 transition-all font-bold text-xs ${phoneError ? 'bg-red-50/10 border-red-500 focus:ring-red-500/10' : 'focus:ring-blue-500/10 focus:border-blue-500'}`}
                                        style={{ background: 'var(--background)', borderColor: phoneError ? '#ef4444' : 'var(--card-border)', color: 'var(--text-primary)' }}
                                        placeholder='Opcional · 10 dígitos'
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

                            {isLostStageLocal(formData.etapa) && (
                                <div className='mt-3 p-4 rounded-2xl border space-y-4' style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}>
                                    <div className='flex items-center justify-between gap-2'>
                                        <p className='text-[10px] font-black uppercase tracking-widest text-rose-300'>Razón de Pérdida</p>
                                        {lossCatalogLoading && (
                                            <span className='text-[9px] font-black uppercase tracking-wider text-[var(--text-secondary)]/70'>Cargando...</span>
                                        )}
                                    </div>

                                    {lossCatalogError && (
                                        <div className='rounded-xl border px-3 py-2 text-[10px] font-bold'
                                            style={{
                                                background: 'color-mix(in srgb, #f59e0b 10%, var(--background))',
                                                borderColor: 'color-mix(in srgb, #f59e0b 28%, var(--card-border))',
                                                color: 'color-mix(in srgb, #f59e0b 82%, white)'
                                            }}>
                                            {lossCatalogError}
                                        </div>
                                    )}

                                    <div className='space-y-2'>
                                        <label className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
                                            Motivo *
                                        </label>
                                        <select
                                            value={(formData as any).loss_reason_id || ''}
                                            onChange={(e) => setFormData((prev) => ({
                                                ...prev,
                                                loss_reason_id: e.target.value || null,
                                                loss_subreason_id: null
                                            }))}
                                            disabled={!!lossCatalogError || lossCatalogLoading}
                                            className='w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-4 focus:ring-rose-500/10 focus:border-rose-500 font-bold transition-all cursor-pointer appearance-none'
                                            style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                        >
                                            <option value=''>Selecciona un motivo</option>
                                            {lossReasonsCatalog.map((reason) => (
                                                <option key={reason.id} value={reason.id}>
                                                    {reason.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className='space-y-2'>
                                        <label className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
                                            Submotivo *
                                        </label>
                                        <select
                                            value={(formData as any).loss_subreason_id || ''}
                                            onChange={(e) => setFormData((prev) => ({ ...prev, loss_subreason_id: e.target.value || null }))}
                                            disabled={!!lossCatalogError || lossCatalogLoading || !(formData as any).loss_reason_id}
                                            className='w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-4 focus:ring-rose-500/10 focus:border-rose-500 font-bold transition-all cursor-pointer appearance-none disabled:opacity-60'
                                            style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                        >
                                            <option value=''>
                                                {(formData as any).loss_reason_id ? 'Selecciona un submotivo' : 'Selecciona primero un motivo'}
                                            </option>
                                            {filteredLossSubreasons.map((subreason) => (
                                                <option key={subreason.id} value={subreason.id}>
                                                    {subreason.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className='space-y-2'>
                                        <label className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
                                            Nota de pérdida (opcional)
                                        </label>
                                        <textarea
                                            rows={3}
                                            value={(formData as any).loss_notes || ''}
                                            onChange={(e) => setFormData((prev) => ({ ...prev, loss_notes: e.target.value }))}
                                            className='w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-4 focus:ring-rose-500/10 focus:border-rose-500 font-bold text-xs transition-all resize-y'
                                            style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                            placeholder='Ej. Decidieron pausar por presupuesto del trimestre / proveedor actual / timing interno...'
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className='space-y-2'>
                            <label className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                                Mensualidad Estimada
                            </label>
                            <label className='inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-wider cursor-pointer select-none' style={{ color: 'var(--text-secondary)' }}>
                                <input
                                    type='checkbox'
                                    checked={estimatedValueUnavailable}
                                    onChange={(e) => {
                                        const checked = e.target.checked
                                        setFormData((prev) => {
                                            if (checked) {
                                                if (prev.valor_estimado != null && prev.valor_estimado > 0) {
                                                    lastManualEstimatedValueRef.current = prev.valor_estimado
                                                }
                                                return { ...prev, valor_estimado: null }
                                            }
                                            return { ...prev, valor_estimado: lastManualEstimatedValueRef.current ?? 0 }
                                        })
                                    }}
                                    className='h-3.5 w-3.5 rounded border border-[var(--card-border)] accent-blue-600 cursor-pointer'
                                />
                                No disponible (sin comprometer forecast)
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
                                        if (next != null) {
                                            lastManualEstimatedValueRef.current = next
                                        }
                                        setFormData({ ...formData, valor_estimado: next })
                                    }}
                                    disabled={estimatedValueUnavailable}
                                    className='w-full pl-8 pr-4 py-3 border rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 font-bold text-xs disabled:opacity-60 disabled:cursor-not-allowed'
                                    style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                    placeholder={estimatedValueUnavailable ? 'No disponible' : '0'}
                                />
                            </div>
                            <p className='text-[9px] font-bold uppercase tracking-wider text-[var(--text-secondary)]/70'>
                                {estimatedValueUnavailable
                                    ? 'Sin pronóstico de mensualidad. No contará para confiabilidad de valor hasta capturarlo.'
                                    : 'Pronóstico de mensualidad para el lead.'}
                            </p>
                        </div>

                        <div className='space-y-2'>
                            <label className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                                Valor de Implementación (Pronóstico)
                            </label>
                            <label className='inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-wider cursor-pointer select-none' style={{ color: 'var(--text-secondary)' }}>
                                <input
                                    type='checkbox'
                                    checked={implementationEstimatedValueUnavailable}
                                    onChange={(e) => {
                                        const checked = e.target.checked
                                        setFormData((prev) => {
                                            const currentValue = (prev as any).valor_implementacion_estimado
                                            if (checked) {
                                                if (currentValue != null && Number(currentValue) > 0) {
                                                    lastManualImplementationEstimatedValueRef.current = Number(currentValue)
                                                }
                                                return { ...prev, valor_implementacion_estimado: null }
                                            }
                                            return {
                                                ...prev,
                                                valor_implementacion_estimado: lastManualImplementationEstimatedValueRef.current ?? 0
                                            }
                                        })
                                    }}
                                    className='h-3.5 w-3.5 rounded border border-[var(--card-border)] accent-blue-600 cursor-pointer'
                                />
                                No disponible (sin comprometer forecast)
                            </label>
                            <div className='relative'>
                                <span className='absolute left-4 top-1/2 -translate-y-1/2 font-black' style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>$</span>
                                <input
                                    type='text'
                                    inputMode='numeric'
                                    pattern='[0-9,]*'
                                    value={formatCurrencyInputNumber((formData as any).valor_implementacion_estimado ?? null)}
                                    onChange={(e) => {
                                        const next = parseCurrencyInputValue(e.target.value)
                                        if (next != null) {
                                            lastManualImplementationEstimatedValueRef.current = next
                                        }
                                        setFormData({ ...formData, valor_implementacion_estimado: next })
                                    }}
                                    disabled={implementationEstimatedValueUnavailable}
                                    className='w-full pl-8 pr-4 py-3 border rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 font-bold text-xs disabled:opacity-60 disabled:cursor-not-allowed'
                                    style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                    placeholder={implementationEstimatedValueUnavailable ? 'No disponible' : '0'}
                                />
                            </div>
                            <p className='text-[9px] font-bold uppercase tracking-wider text-[var(--text-secondary)]/70'>
                                {implementationEstimatedValueUnavailable
                                    ? 'Sin pronóstico de implementación. No contará para confiabilidad de implementación hasta capturarlo.'
                                    : 'Pronóstico de cuota única de implementación.'}
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
                        <p className='text-[10px] font-black uppercase tracking-wider' style={{ color: 'var(--text-secondary)' }}>* Campos obligatorios</p>
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
                            type='submit'
                            form='client-form'
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
