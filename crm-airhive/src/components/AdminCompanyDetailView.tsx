'use client'

import { useState, useEffect, useMemo, type CSSProperties } from 'react'
import { createClient } from '@/lib/supabase'
import { CompanyData } from './CompanyModal'
import type { Database } from '@/lib/supabase'
import ClientDetailView from './ClientDetailView'
import ClientModal, { type ClientData } from './ClientModal'
import TaskModal from './TaskModal'
import MeetingModal from './MeetingModal'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'
import { createMeeting } from '@/lib/meetingsService'
import { FileText, MapPin, Globe, Users2, ClipboardList, Boxes, CalendarClock, CheckSquare, TrendingUp, ShieldCheck, Plus, FolderPlus, CalendarPlus, ListTodo, StickyNote, X, Pencil } from 'lucide-react'
import { buildIndustryBadgeVisualMap, getIndustryBadgeLevelMedallionVisual, getIndustryBadgeVisualFromMap } from '@/lib/industryBadgeVisuals'
import BadgeInfoTooltip from '@/components/BadgeInfoTooltip'
import BadgeMedallion from '@/components/BadgeMedallion'
import { useTheme } from '@/lib/ThemeContext'
import {
    buildSemanticToneCssVars,
    getCompanyNoteTypeToneLane,
    getLeadStageToneLane,
    getMeetingStatusToneLane,
    getProjectStageToneLane,
    getSemanticTonePalette,
    getTaskStatusToneLane,
    type UiToneLane
} from '@/lib/semanticUiTones'

type Cliente = Database['public']['Tables']['clientes']['Row']
type MeetingRow = Database['public']['Tables']['meetings']['Row']
type TaskRow = Database['public']['Tables']['tareas']['Row']
type CompanyNoteRow = {
    id: string
    empresa_id: string
    note_text: string
    note_type: string | null
    created_by: string | null
    created_at: string | null
    updated_at: string | null
}

type CompanyProjectAssignment360 = {
    id: string
    proyecto_id: string
    assignment_stage: string
    source_lead_id: number | null
    mensualidad_pactada_usd: number | null
    implementacion_pactada_usd: number | null
    notes: string | null
    created_at: string | null
    updated_at: string | null
    projectName: string
    projectMonthlyReal: number | null
    projectImplementationReal: number | null
}

type ProjectCatalogQuickItem = {
    id: string
    nombre: string
    valor_real_mensualidad_usd: number | null
    valor_real_implementacion_usd: number | null
}

type IndustryCatalogVisualRow = {
    id: string
    name: string
}

type QuickProjectFormState = {
    proyecto_id: string
    assignment_stage: 'in_negotiation' | 'prospection_same_close' | 'future_lead_opportunity' | 'implemented_real'
    source_lead_id: string
    mensualidad_pactada_usd: string
    implementacion_pactada_usd: string
    notes: string
}

function isWonStage(stage: unknown) {
    const normalized = String(stage || '').trim().toLowerCase()
    return normalized === 'cerrado ganado' || normalized === 'cerrada ganada'
}

function isLostStage(stage: unknown) {
    const normalized = String(stage || '').trim().toLowerCase()
    return normalized === 'cerrado perdido' || normalized === 'cerrada perdida'
}

function toIsoFromDateOnly(dateOnly: string | null | undefined) {
    if (!dateOnly || typeof dateOnly !== 'string') return null
    const [y, m, d] = dateOnly.split('-').map(Number)
    if (!y || !m || !d) return null
    const localDate = new Date(y, m - 1, d, 12, 0, 0, 0)
    return Number.isNaN(localDate.getTime()) ? null : localDate.toISOString()
}

/**
 * AdminCompanyDetailView - A detailed view of a company including its associated leads.
 */
interface AdminCompanyDetailViewProps {
    isOpen: boolean
    onClose: () => void
    company: CompanyData
    currentUserProfile?: any | null
    onEditCompany?: (company: CompanyData) => void
}

export default function AdminCompanyDetailView({
    isOpen,
    onClose,
    company,
    currentUserProfile,
    onEditCompany
}: AdminCompanyDetailViewProps) {
    useBodyScrollLock(isOpen)
    const { theme } = useTheme()
    const [clients, setClients] = useState<Cliente[]>([])
    const [loadingClients, setLoadingClients] = useState(false)
    const [projectAssignments, setProjectAssignments] = useState<CompanyProjectAssignment360[]>([])
    const [industryCatalogVisualRows, setIndustryCatalogVisualRows] = useState<IndustryCatalogVisualRow[]>([])
    const [leadOwnerProfilesById, setLeadOwnerProfilesById] = useState<Record<string, { fullName?: string | null }>>({})
    const [meetings, setMeetings] = useState<MeetingRow[]>([])
    const [tasks, setTasks] = useState<TaskRow[]>([])
    const [companyNotes, setCompanyNotes] = useState<CompanyNoteRow[]>([])
    const [loadingWorkspaceExtras, setLoadingWorkspaceExtras] = useState(false)
    const [workspaceWarning, setWorkspaceWarning] = useState<string | null>(null)
    const [selectedClient, setSelectedClient] = useState<Cliente | null>(null)
    const [isClientDetailOpen, setIsClientDetailOpen] = useState(false)
    const [isQuickLeadModalOpen, setIsQuickLeadModalOpen] = useState(false)
    const [isQuickProjectModalOpen, setIsQuickProjectModalOpen] = useState(false)
    const [isQuickTaskModalOpen, setIsQuickTaskModalOpen] = useState(false)
    const [isQuickMeetingLeadPickerOpen, setIsQuickMeetingLeadPickerOpen] = useState(false)
    const [isQuickMeetingModalOpen, setIsQuickMeetingModalOpen] = useState(false)
    const [selectedMeetingLeadId, setSelectedMeetingLeadId] = useState<number | null>(null)
    const [isQuickNoteModalOpen, setIsQuickNoteModalOpen] = useState(false)
    const [quickProjectCatalog, setQuickProjectCatalog] = useState<ProjectCatalogQuickItem[]>([])
    const [quickProjectCatalogLoading, setQuickProjectCatalogLoading] = useState(false)
    const [quickProjectSaving, setQuickProjectSaving] = useState(false)
    const [quickNoteSaving, setQuickNoteSaving] = useState(false)
    const [quickNoteText, setQuickNoteText] = useState('')
    const [quickNoteType, setQuickNoteType] = useState<'seguimiento' | 'contexto' | 'riesgo' | 'acuerdo'>('seguimiento')
    const [quickActionError, setQuickActionError] = useState<string | null>(null)
    const [quickProjectForm, setQuickProjectForm] = useState<QuickProjectFormState>({
        proyecto_id: '',
        assignment_stage: 'in_negotiation',
        source_lead_id: '',
        mensualidad_pactada_usd: '',
        implementacion_pactada_usd: '',
        notes: ''
    })
    const supabase = createClient()

    useEffect(() => {
        if (isOpen && company.id) {
            void fetchCompanyWorkspace(company.id)
        }
    }, [isOpen, company.id, currentUserProfile?.id, currentUserProfile?.role])

    const fetchCompanyWorkspace = async (companyId: string) => {
        setLoadingClients(true)
        setLoadingWorkspaceExtras(true)
        setWorkspaceWarning(null)

        let query = supabase
            .from('clientes')
            .select('*')
            .eq('empresa_id', companyId)
            .order('nombre', { ascending: true })

        // 🛡️ SECURITY FILTER
        // If not admin, only see leads owned by current user
        if (currentUserProfile && currentUserProfile.role !== 'admin' && currentUserProfile.role !== 'rh') {
            query = (query as any).eq('owner_id', currentUserProfile.id)
        }

        const { data, error } = await query

        if (error) {
            console.error('Error fetching associated clients:', error)
            setClients([])
            setProjectAssignments([])
            setMeetings([])
            setTasks([])
            setCompanyNotes([])
            setLoadingClients(false)
            setLoadingWorkspaceExtras(false)
            return
        }

        const visibleClients = (data || []) as Cliente[]
        setClients(visibleClients)
        setLoadingClients(false)

        const ownerIds = Array.from(new Set(
            visibleClients.map((client: any) => String(client?.owner_id || '')).filter(Boolean)
        ))
        if (ownerIds.length > 0) {
            const { data: ownerProfiles } = await (supabase.from('profiles') as any)
                .select('id, full_name')
                .in('id', ownerIds)
            const ownerMap: Record<string, { fullName?: string | null }> = {}
            ;((ownerProfiles || []) as any[]).forEach((row) => {
                const id = String(row?.id || '')
                if (!id) return
                ownerMap[id] = { fullName: row?.full_name || null }
            })
            setLeadOwnerProfilesById(ownerMap)
        } else {
            setLeadOwnerProfilesById({})
        }

        const leadIds = visibleClients.map((client) => Number(client.id)).filter((id) => Number.isFinite(id))
        const projectAssignmentsRawResult = await (supabase.from('empresa_proyecto_asignaciones') as any)
            .select('id, proyecto_id, assignment_stage, source_lead_id, mensualidad_pactada_usd, implementacion_pactada_usd, notes, created_at, updated_at')
            .eq('empresa_id', companyId)
            .order('updated_at', { ascending: false })

        if (projectAssignmentsRawResult.error) {
            console.warn('[AdminCompanyDetailView] Could not fetch company project assignments:', projectAssignmentsRawResult.error.message)
            setWorkspaceWarning('Algunas secciones (proyectos/tareas/juntas) no pudieron cargarse completamente.')
        }

        const rawAssignments = (projectAssignmentsRawResult.data || []) as any[]
        const projectIds = Array.from(new Set(rawAssignments.map((row) => String(row?.proyecto_id || '')).filter(Boolean)))

        const [projectsCatalogResult, meetingsResult, tasksResult, notesResult, industryCatalogResult] = await Promise.all([
            projectIds.length > 0
                ? (supabase.from('proyectos_catalogo') as any)
                    .select('id, nombre, valor_real_mensualidad_usd, valor_real_implementacion_usd')
                    .in('id', projectIds)
                : Promise.resolve({ data: [], error: null } as any),
            leadIds.length > 0
                ? (supabase.from('meetings') as any)
                    .select('*')
                    .in('lead_id', leadIds)
                    .order('start_time', { ascending: false })
                    .limit(150)
                : Promise.resolve({ data: [], error: null } as any),
            leadIds.length > 0
                ? (supabase.from('tareas') as any)
                    .select('*')
                    .in('lead_id', leadIds)
                    .order('fecha_vencimiento', { ascending: true })
                    .limit(200)
                : Promise.resolve({ data: [], error: null } as any),
            (supabase.from('empresa_notas') as any)
                .select('id, empresa_id, note_text, note_type, created_by, created_at, updated_at')
                .eq('empresa_id', companyId)
                .order('created_at', { ascending: false })
                .limit(50),
            (supabase.from('industrias') as any)
                .select('id, name')
                .order('name', { ascending: true })
        ])

        if (projectsCatalogResult?.error || meetingsResult?.error || tasksResult?.error || notesResult?.error || industryCatalogResult?.error) {
            const notesMessage = String(notesResult?.error?.message || '').toLowerCase()
            const notesCatalogMissing = notesMessage.includes('empresa_notas') || notesMessage.includes('does not exist') || notesMessage.includes('42p01')
            console.warn('[AdminCompanyDetailView] Partial workspace data load error', {
                projects: projectsCatalogResult?.error?.message,
                meetings: meetingsResult?.error?.message,
                tasks: tasksResult?.error?.message,
                notes: notesResult?.error?.message,
                industries: industryCatalogResult?.error?.message
            })
            setWorkspaceWarning(
                notesCatalogMissing
                    ? 'Algunas secciones (proyectos/tareas/juntas/notas) no pudieron cargarse completamente. Para notas de empresa, ejecuta la migración 062.'
                    : 'Algunas secciones (proyectos/tareas/juntas/notas) no pudieron cargarse completamente.'
            )
        }

        const projectMap = new Map<string, any>(
            ((projectsCatalogResult?.data || []) as any[]).map((project) => [String(project.id), project])
        )

        const normalizedAssignments: CompanyProjectAssignment360[] = rawAssignments.map((row: any) => {
            const projectId = String(row?.proyecto_id || '')
            const project = projectMap.get(projectId)
            return {
                id: String(row?.id || `${projectId}-${row?.assignment_stage || 'stage'}`),
                proyecto_id: projectId,
                assignment_stage: String(row?.assignment_stage || ''),
                source_lead_id: row?.source_lead_id == null ? null : Number(row.source_lead_id),
                mensualidad_pactada_usd: row?.mensualidad_pactada_usd == null ? null : Number(row.mensualidad_pactada_usd),
                implementacion_pactada_usd: row?.implementacion_pactada_usd == null ? null : Number(row.implementacion_pactada_usd),
                notes: row?.notes || null,
                created_at: row?.created_at || null,
                updated_at: row?.updated_at || null,
                projectName: String(project?.nombre || 'Proyecto'),
                projectMonthlyReal: project?.valor_real_mensualidad_usd == null ? null : Number(project.valor_real_mensualidad_usd),
                projectImplementationReal: project?.valor_real_implementacion_usd == null ? null : Number(project.valor_real_implementacion_usd)
            }
        })

        setProjectAssignments(normalizedAssignments)
        setMeetings(((meetingsResult?.data || []) as MeetingRow[]))
        setTasks(((tasksResult?.data || []) as TaskRow[]))
        setIndustryCatalogVisualRows(
            Array.isArray(industryCatalogResult?.data)
                ? (industryCatalogResult.data as any[])
                    .map((row) => ({ id: String(row?.id || ''), name: String(row?.name || '') }))
                    .filter((row) => row.id && row.name)
                : []
        )
        setCompanyNotes(Array.isArray(notesResult?.data) ? ((notesResult.data as any[]).map((row) => ({
            id: String(row.id),
            empresa_id: String(row.empresa_id),
            note_text: String(row.note_text || ''),
            note_type: row.note_type == null ? null : String(row.note_type),
            created_by: row.created_by == null ? null : String(row.created_by),
            created_at: row.created_at == null ? null : String(row.created_at),
            updated_at: row.updated_at == null ? null : String(row.updated_at)
        }))) : [])
        setLoadingWorkspaceExtras(false)
    }

    const resetQuickProjectForm = () => {
        setQuickProjectForm({
            proyecto_id: '',
            assignment_stage: 'in_negotiation',
            source_lead_id: '',
            mensualidad_pactada_usd: '',
            implementacion_pactada_usd: '',
            notes: ''
        })
    }

    const syncCompanyProjectAssignmentsFromLead = async (params: {
        empresaId?: string | null
        leadId?: number | null
        inNegotiationProjectIds?: string[]
        prospectionSameCloseProjectIds?: string[]
        futureLeadOpportunityProjectIds?: string[]
        implementedRealProjectIds?: string[]
        implementedRealProjectValues?: Record<string, { mensualidad_usd: number | null; implementacion_usd: number | null }>
        assignedByUserId?: string | null
    }) => {
        const empresaId = String(params.empresaId || '')
        const leadId = Number(params.leadId || 0)
        if (!empresaId || !leadId) return

        const inNegotiation = Array.from(new Set((params.inNegotiationProjectIds || []).filter(Boolean)))
        const prospectionSameClose = Array.from(new Set((params.prospectionSameCloseProjectIds || []).filter(Boolean)))
        const futureLeadOpportunity = Array.from(new Set((params.futureLeadOpportunityProjectIds || []).filter(Boolean)))
        const implementedReal = Array.from(new Set((params.implementedRealProjectIds || []).filter(Boolean)))
        const implementedRealProjectValues = params.implementedRealProjectValues || {}

        const { error: deleteError } = await (supabase.from('empresa_proyecto_asignaciones') as any)
            .delete()
            .eq('empresa_id', empresaId)
            .eq('source_lead_id', leadId)

        if (deleteError) throw deleteError

        const rows = [
            ...inNegotiation.map((projectId) => ({
                empresa_id: empresaId,
                proyecto_id: projectId,
                assignment_stage: 'in_negotiation',
                source_lead_id: leadId,
                assigned_by: params.assignedByUserId || null
            })),
            ...prospectionSameClose.map((projectId) => ({
                empresa_id: empresaId,
                proyecto_id: projectId,
                assignment_stage: 'prospection_same_close',
                source_lead_id: leadId,
                assigned_by: params.assignedByUserId || null
            })),
            ...futureLeadOpportunity.map((projectId) => ({
                empresa_id: empresaId,
                proyecto_id: projectId,
                assignment_stage: 'future_lead_opportunity',
                source_lead_id: leadId,
                assigned_by: params.assignedByUserId || null
            })),
            ...implementedReal.map((projectId) => ({
                empresa_id: empresaId,
                proyecto_id: projectId,
                assignment_stage: 'implemented_real',
                source_lead_id: leadId,
                assigned_by: params.assignedByUserId || null,
                mensualidad_pactada_usd: implementedRealProjectValues[projectId]?.mensualidad_usd ?? null,
                implementacion_pactada_usd: implementedRealProjectValues[projectId]?.implementacion_usd ?? null
            }))
        ]

        if (rows.length > 0) {
            const { error: upsertError } = await ((supabase.from('empresa_proyecto_asignaciones') as any))
                .upsert(rows, { onConflict: 'empresa_id,proyecto_id,assignment_stage' })
            if (upsertError) throw upsertError
        }

        if (implementedReal.length > 0) {
            const [{ data: companyRow }, { data: companyIndustryRows }] = await Promise.all([
                (supabase.from('empresas') as any).select('industria_id').eq('id', empresaId).maybeSingle(),
                (supabase.from('company_industries') as any).select('industria_id').eq('empresa_id', empresaId)
            ])

            const industryIds = new Set<string>()
            const primaryIndustryId = String((companyRow as any)?.industria_id || '')
            if (primaryIndustryId) industryIds.add(primaryIndustryId)
            for (const row of (companyIndustryRows || [])) {
                const industriaId = String((row as any)?.industria_id || '')
                if (industriaId) industryIds.add(industriaId)
            }

            const relationRows = Array.from(industryIds).flatMap((industriaId) =>
                implementedReal.map((projectId) => ({
                    proyecto_id: projectId,
                    industria_id: industriaId,
                    relation_status: 'implemented_in_industry'
                }))
            )

            if (relationRows.length > 0) {
                const { error: relationSyncError } = await (supabase.from('proyecto_industrias') as any)
                    .upsert(relationRows, { onConflict: 'proyecto_id,industria_id' })
                if (relationSyncError) console.warn('Project->industry implemented sync failed:', relationSyncError)
            }
        }
    }

    const handleQuickLeadSave = async (leadData: ClientData) => {
        setQuickActionError(null)
        const { data: authRes, error: authError } = await supabase.auth.getUser()
        const currentUser = authRes?.user
        if (authError || !currentUser) {
            alert('No se pudo identificar al usuario actual.')
            return
        }

        const finalEmpresaName = company.nombre
        const finalEmpresaId = String(company.id || '')
        try {
            const isWon = isWonStage(leadData.etapa)
            const isLost = isLostStage(leadData.etapa)
            const realClosureValue = isWon ? (leadData.valor_real_cierre ?? leadData.valor_estimado ?? 0) : null
            const realImplementationValue = isWon ? (leadData.valor_implementacion_real_cierre ?? leadData.valor_implementacion_estimado ?? 0) : null
            const safeCreateStage = isWon ? 'Negociación' : leadData.etapa
            const payload: any = {
                empresa: finalEmpresaName,
                empresa_id: finalEmpresaId,
                nombre: leadData.nombre,
                email: leadData.email || null,
                telefono: leadData.telefono || null,
                etapa: safeCreateStage,
                valor_estimado: leadData.valor_estimado ?? 0,
                valor_real_cierre: isWon ? null : realClosureValue,
                valor_implementacion_estimado: leadData.valor_implementacion_estimado ?? 0,
                valor_implementacion_real_cierre: isWon ? null : realImplementationValue,
                forecast_close_date: leadData.forecast_close_date || null,
                oportunidad: leadData.oportunidad || '',
                calificacion: leadData.calificacion ?? 3,
                notas: leadData.notas || '',
                probabilidad: leadData.probabilidad ?? 50,
                owner_id: currentUser.id,
                owner_username: String(currentUserProfile?.username || currentUser.user_metadata?.username || currentUser.email?.split('@')[0] || 'unknown'),
                loss_reason_id: isLost ? (leadData.loss_reason_id || null) : (leadData.loss_reason_id || null),
                loss_subreason_id: isLost ? (leadData.loss_subreason_id || null) : (leadData.loss_subreason_id || null),
                loss_notes: isLost ? ((leadData.loss_notes || '').trim() || null) : ((leadData.loss_notes || '').trim() || null)
            }
            if (isLost || isWon) payload.closed_at_real = toIsoFromDateOnly(leadData.closed_at_real) || null
            if (isLost) {
                payload.loss_recorded_at = leadData.loss_recorded_at || new Date().toISOString()
                payload.loss_recorded_by = leadData.loss_recorded_by || currentUser.id
            }

            const { data: insertedRows, error: insertError } = await (supabase.from('clientes') as any)
                .insert([payload])
                .select()
            if (insertError) throw insertError
            const inserted = Array.isArray(insertedRows) ? insertedRows[0] : null
            if (!inserted?.id) throw new Error('No se pudo confirmar el lead creado')
            const leadId = Number(inserted.id)

            if (isWon) {
                const { error: wonUpdateError } = await (supabase.from('clientes') as any)
                    .update({
                        etapa: 'Cerrado Ganado',
                        valor_estimado: leadData.valor_estimado,
                        valor_real_cierre: realClosureValue,
                        valor_implementacion_estimado: leadData.valor_implementacion_estimado ?? 0,
                        valor_implementacion_real_cierre: realImplementationValue,
                        closed_at_real: toIsoFromDateOnly(leadData.closed_at_real) || new Date().toISOString()
                    })
                    .eq('id', leadId)
                if (wonUpdateError) throw wonUpdateError
                try {
                    await (supabase.rpc as any)('refresh_seller_badges_for_lead', { p_lead_id: leadId })
                } catch (badgeError) {
                    console.warn('Badge recompute after quick lead creation failed:', badgeError)
                }
            }

            await (supabase.from('lead_history') as any).insert([
                { lead_id: leadId, field_name: 'etapa', new_value: leadData.etapa, changed_by: currentUser.id },
                { lead_id: leadId, field_name: 'probabilidad', new_value: String(leadData.probabilidad ?? 50), changed_by: currentUser.id },
                ...(leadData.forecast_close_date ? [{ lead_id: leadId, field_name: 'forecast_close_date', new_value: String(leadData.forecast_close_date), changed_by: currentUser.id }] : [])
            ])

            try {
                await syncCompanyProjectAssignmentsFromLead({
                    empresaId: finalEmpresaId,
                    leadId,
                    inNegotiationProjectIds: leadData.proyectos_pronosticados_ids || [],
                    prospectionSameCloseProjectIds: leadData.proyectos_prospeccion_mismo_cierre_ids || [],
                    futureLeadOpportunityProjectIds: leadData.proyectos_futuro_lead_ids || [],
                    implementedRealProjectIds: leadData.proyectos_implementados_reales_ids || [],
                    implementedRealProjectValues: leadData.proyectos_implementados_reales_valores || {},
                    assignedByUserId: currentUser.id
                })
            } catch (projectSyncError) {
                console.warn('Lead created but project sync failed:', projectSyncError)
            }

            try {
                const { trackEvent } = await import('@/app/actions/events')
                void trackEvent({
                    eventType: 'lead_created',
                    entityType: 'lead',
                    entityId: leadId,
                    metadata: { etapa: leadData.etapa, valor: leadData.valor_estimado ?? 0 }
                })
            } catch (evtError) {
                console.warn('Lead event tracking failed:', evtError)
            }

            setIsQuickLeadModalOpen(false)
            await fetchCompanyWorkspace(finalEmpresaId)
        } catch (error: any) {
            console.error('Quick lead create error:', error)
            alert(`Error al crear lead: ${error?.message || 'No se pudo crear el lead.'}`)
        }
    }

    const loadQuickProjectCatalog = async () => {
        setQuickProjectCatalogLoading(true)
        const { data, error } = await (supabase.from('proyectos_catalogo') as any)
            .select('id, nombre, valor_real_mensualidad_usd, valor_real_implementacion_usd')
            .eq('is_active', true)
            .order('nombre', { ascending: true })
        if (error) {
            console.warn('Quick project catalog load failed:', error)
            setQuickProjectCatalog([])
        } else {
            setQuickProjectCatalog(Array.isArray(data) ? data.map((row: any) => ({
                id: String(row.id),
                nombre: String(row.nombre || 'Proyecto'),
                valor_real_mensualidad_usd: row.valor_real_mensualidad_usd == null ? null : Number(row.valor_real_mensualidad_usd),
                valor_real_implementacion_usd: row.valor_real_implementacion_usd == null ? null : Number(row.valor_real_implementacion_usd)
            })) : [])
        }
        setQuickProjectCatalogLoading(false)
    }

    useEffect(() => {
        if (isQuickProjectModalOpen && quickProjectCatalog.length === 0) {
            void loadQuickProjectCatalog()
        }
    }, [isQuickProjectModalOpen]) // eslint-disable-line react-hooks/exhaustive-deps

    const handleOpenQuickProjectModal = () => {
        setQuickActionError(null)
        resetQuickProjectForm()
        setIsQuickProjectModalOpen(true)
    }

    const handleQuickProjectSelection = (projectId: string) => {
        const selected = quickProjectCatalog.find((row) => row.id === projectId)
        setQuickProjectForm((prev) => ({
            ...prev,
            proyecto_id: projectId,
            mensualidad_pactada_usd: selected?.valor_real_mensualidad_usd != null ? String(Math.round(selected.valor_real_mensualidad_usd)) : '',
            implementacion_pactada_usd: selected?.valor_real_implementacion_usd != null ? String(Math.round(selected.valor_real_implementacion_usd)) : ''
        }))
    }

    const syncImplementedProjectIndustries = async (projectIds: string[]) => {
        if (!projectIds.length || !company.id) return
        const companyId = String(company.id)
        const [{ data: companyRow }, { data: companyIndustryRows }] = await Promise.all([
            (supabase.from('empresas') as any).select('industria_id').eq('id', companyId).maybeSingle(),
            (supabase.from('company_industries') as any).select('industria_id').eq('empresa_id', companyId)
        ])
        const industryIds = new Set<string>()
        const primaryIndustryId = String((companyRow as any)?.industria_id || '')
        if (primaryIndustryId) industryIds.add(primaryIndustryId)
        for (const row of (companyIndustryRows || [])) {
            const industriaId = String((row as any)?.industria_id || '')
            if (industriaId) industryIds.add(industriaId)
        }
        const relationRows = Array.from(industryIds).flatMap((industriaId) =>
            projectIds.map((projectId) => ({
                proyecto_id: projectId,
                industria_id: industriaId,
                relation_status: 'implemented_in_industry'
            }))
        )
        if (relationRows.length > 0) {
            const { error } = await (supabase.from('proyecto_industrias') as any)
                .upsert(relationRows, { onConflict: 'proyecto_id,industria_id' })
            if (error) console.warn('Quick project industry sync failed:', error)
        }
    }

    const handleSaveQuickProjectAssignment = async () => {
        setQuickActionError(null)
        if (!company.id) {
            setQuickActionError('La empresa no tiene id válido.')
            return
        }
        if (!quickProjectForm.proyecto_id) {
            setQuickActionError('Selecciona un proyecto.')
            return
        }
        setQuickProjectSaving(true)
        try {
            const payload: any = {
                empresa_id: String(company.id),
                proyecto_id: quickProjectForm.proyecto_id,
                assignment_stage: quickProjectForm.assignment_stage,
                source_lead_id: quickProjectForm.source_lead_id ? Number(quickProjectForm.source_lead_id) : null,
                assigned_by: currentUserProfile?.id || null,
                notes: quickProjectForm.notes.trim() || null
            }
            if (quickProjectForm.assignment_stage === 'implemented_real') {
                payload.mensualidad_pactada_usd = quickProjectForm.mensualidad_pactada_usd.trim() ? Number(quickProjectForm.mensualidad_pactada_usd.replace(/[^\d]/g, '')) : null
                payload.implementacion_pactada_usd = quickProjectForm.implementacion_pactada_usd.trim() ? Number(quickProjectForm.implementacion_pactada_usd.replace(/[^\d]/g, '')) : null
            } else {
                payload.mensualidad_pactada_usd = null
                payload.implementacion_pactada_usd = null
            }

            const { error } = await (supabase.from('empresa_proyecto_asignaciones') as any)
                .upsert([payload], { onConflict: 'empresa_id,proyecto_id,assignment_stage' })
            if (error) throw error

            if (quickProjectForm.assignment_stage === 'implemented_real') {
                await syncImplementedProjectIndustries([quickProjectForm.proyecto_id])
            }

            setIsQuickProjectModalOpen(false)
            resetQuickProjectForm()
            await fetchCompanyWorkspace(String(company.id))
        } catch (error: any) {
            console.error('Quick project assignment save error:', error)
            setQuickActionError(error?.message || 'No se pudo guardar el proyecto para la empresa.')
        } finally {
            setQuickProjectSaving(false)
        }
    }

    const handleQuickTaskSave = async (taskData: any) => {
        setQuickActionError(null)
        try {
            const { error } = await (supabase.from('tareas') as any).insert({
                ...taskData,
                vendedor_id: currentUserProfile?.id || null
            })
            if (error) throw error
            try {
                const { trackEvent } = await import('@/app/actions/events')
                void trackEvent({
                    eventType: 'task_created',
                    entityType: 'task',
                    metadata: { lead_id: taskData?.lead_id || null, company_id: company.id || null }
                })
            } catch {}
            setIsQuickTaskModalOpen(false)
            if (company.id) await fetchCompanyWorkspace(String(company.id))
        } catch (error: any) {
            console.error('Quick task create error:', error)
            alert('Error al crear tarea: ' + (error?.message || 'Error desconocido'))
        } finally {
        }
    }

    const handleOpenQuickMeeting = () => {
        setQuickActionError(null)
        if (clients.length === 0) {
            alert('Primero crea un lead para esta empresa.')
            return
        }
        if (clients.length === 1) {
            setSelectedMeetingLeadId(Number(clients[0].id))
            setIsQuickMeetingModalOpen(true)
            return
        }
        setIsQuickMeetingLeadPickerOpen(true)
    }

    const handleQuickMeetingSave = async (meetingData: any) => {
        setQuickActionError(null)
        try {
            await createMeeting(meetingData)
            if (company.id) await fetchCompanyWorkspace(String(company.id))
        } catch (error: any) {
            console.error('Quick meeting create error:', error)
            throw error
        }
    }

    const handleQuickNoteSave = async () => {
        if (!company.id) return
        if (!quickNoteText.trim()) {
            setQuickActionError('Escribe una nota antes de guardar.')
            return
        }
        setQuickNoteSaving(true)
        setQuickActionError(null)
        try {
            const { error } = await (supabase.from('empresa_notas') as any).insert({
                empresa_id: String(company.id),
                note_text: quickNoteText.trim(),
                note_type: quickNoteType,
                created_by: currentUserProfile?.id || null
            })
            if (error) throw error
            setQuickNoteText('')
            setQuickNoteType('seguimiento')
            setIsQuickNoteModalOpen(false)
            await fetchCompanyWorkspace(String(company.id))
        } catch (error: any) {
            console.error('Quick note create error:', error)
            setQuickActionError(error?.message || 'No se pudo guardar la nota. Si falta la tabla, ejecuta la migración 062.')
        } finally {
            setQuickNoteSaving(false)
        }
    }

    const handleClientClick = (client: Cliente) => {
        setSelectedClient(client)
        setIsClientDetailOpen(true)
    }

    const leadById = useMemo(() => {
        const map = new Map<number, Cliente>()
        clients.forEach((client) => map.set(Number(client.id), client))
        return map
    }, [clients])

    const formatOwnerDisplayName = (raw?: string | null) => {
        const value = String(raw || '').trim()
        if (!value) return 'Sin asignar'
        if (value.includes('.')) {
            return value
                .split('.')
                .filter(Boolean)
                .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
                .join(' ')
        }
        return value
    }

    const getLeadResponsibleName = (lead?: Cliente | null) => {
        if (!lead) return 'Sin asignar'
        const ownerId = String((lead as any)?.owner_id || '')
        const profileName = ownerId ? leadOwnerProfilesById[ownerId]?.fullName : null
        return profileName || formatOwnerDisplayName(String((lead as any)?.owner_username || ''))
    }

    const selectedMeetingLead = useMemo(
        () => (selectedMeetingLeadId != null ? leadById.get(Number(selectedMeetingLeadId)) || null : null),
        [leadById, selectedMeetingLeadId]
    )

    const quickLeadDraft = useMemo<ClientData>(() => ({
        empresa: company.nombre || '',
        empresa_id: company.id,
        nombre: '',
        etapa: 'Negociación',
        valor_estimado: 0,
        valor_real_cierre: null,
        valor_implementacion_estimado: 0,
        valor_implementacion_real_cierre: null,
        oportunidad: '',
        calificacion: 3,
        notas: '',
        owner_id: currentUserProfile?.id,
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
        loss_recorded_by: null
    }), [company.id, company.nombre, currentUserProfile?.id])

    const companyStats = useMemo(() => {
        const wonLeads = clients.filter((client) => String(client.etapa || '').toLowerCase() === 'cerrado ganado')
        const lostLeads = clients.filter((client) => String(client.etapa || '').toLowerCase() === 'cerrado perdido')
        const prospectionLeads = clients.filter((client) => {
            const s = String(client.etapa || '').toLowerCase()
            return s === 'prospección' || s === 'prospeccion'
        })
        const negotiationLeads = clients.filter((client) => {
            const s = String(client.etapa || '').toLowerCase()
            return s === 'negociación' || s === 'negociacion'
        })
        const implementedProjects = projectAssignments.filter((row) => row.assignment_stage === 'implemented_real')
        const pendingTasks = tasks.filter((task) => String((task as any)?.estado || '').toLowerCase() !== 'completada')
        const completedMeetings = meetings.filter((meeting) => {
            const status = String((meeting as any)?.status || '').toLowerCase()
            const meetingStatus = String((meeting as any)?.meeting_status || '').toLowerCase()
            return status === 'completed' || meetingStatus === 'completed'
        })
        const nextScheduledMeeting = [...meetings]
            .filter((meeting) => {
                const startTime = new Date(String((meeting as any)?.start_time || '')).getTime()
                if (!Number.isFinite(startTime)) return false
                const status = String((meeting as any)?.status || '').toLowerCase()
                return startTime >= Date.now() && (status === '' || status === 'scheduled')
            })
            .sort((a, b) => new Date(String((a as any)?.start_time || 0)).getTime() - new Date(String((b as any)?.start_time || 0)).getTime())[0] || null

        return {
            totalLeads: clients.length,
            wonLeads: wonLeads.length,
            lostLeads: lostLeads.length,
            prospectionLeads: prospectionLeads.length,
            negotiationLeads: negotiationLeads.length,
            totalProjects: projectAssignments.length,
            implementedProjects: implementedProjects.length,
            totalTasks: tasks.length,
            pendingTasks: pendingTasks.length,
            totalMeetings: meetings.length,
            completedMeetings: completedMeetings.length,
            nextScheduledMeeting
        }
    }, [clients, meetings, tasks, projectAssignments])

    const companyBadgeIndustries = useMemo(() => {
        const result: Array<{ id: string; name: string }> = []
        const seenIds = new Set<string>()
        const normalize = (value: string) => value.trim().toLowerCase()
        const catalogById = new Map(industryCatalogVisualRows.map((row) => [String(row.id), row]))
        const catalogByName = new Map(
            industryCatalogVisualRows.map((row) => [normalize(String(row.name || '')), row] as const)
        )
        const pushIndustry = (row?: { id: string; name: string } | null, atStart = false) => {
            if (!row) return
            const id = String(row.id || '').trim()
            const name = String(row.name || '').trim()
            if (!id || !name || seenIds.has(id)) return
            if (atStart) result.unshift({ id, name })
            else result.push({ id, name })
            seenIds.add(id)
        }

        const ids = Array.isArray(company.industria_ids) ? company.industria_ids : []
        const names = Array.isArray(company.industrias) ? company.industrias : []

        ids.forEach((industryId, index) => {
            const id = String(industryId || '').trim()
            const fallbackName = String(names[index] || '').trim()
            const matchedById = id ? catalogById.get(id) : null
            const matchedByName = fallbackName ? catalogByName.get(normalize(fallbackName)) : null
            pushIndustry((matchedById || matchedByName) ? {
                id: String((matchedById || matchedByName)!.id),
                name: String((matchedById || matchedByName)!.name)
            } : null)
        })

        names.forEach((industryName) => {
            const name = String(industryName || '').trim()
            if (!name) return
            const matched = catalogByName.get(normalize(name))
            pushIndustry(matched ? { id: String(matched.id), name: String(matched.name) } : null)
        })

        const primaryName = String(company.industria || '').trim()
        const primaryId = String(company.industria_id || '').trim()
        const primaryMatched =
            (primaryId ? catalogById.get(primaryId) : null) ||
            (primaryName ? catalogByName.get(normalize(primaryName)) : null)
        pushIndustry(primaryMatched ? { id: String(primaryMatched.id), name: String(primaryMatched.name) } : null, true)

        return result
    }, [company.industria, company.industria_id, company.industrias, company.industria_ids, industryCatalogVisualRows])

    const companyBadgeVisualMap = useMemo(() => buildIndustryBadgeVisualMap(
        [
            ...industryCatalogVisualRows,
            ...companyBadgeIndustries
        ].filter((row, index, arr) =>
            row?.id && arr.findIndex((candidate) => candidate.id === row.id) === index
        )
    ), [industryCatalogVisualRows, companyBadgeIndustries])
    const companyPrimaryIndustryDisplay = companyBadgeIndustries[0]?.name || company.industria || 'N/A'

    const recentWonOrLostLeads = [...clients]
        .filter((client) => {
            const s = String(client.etapa || '').toLowerCase()
            return s === 'cerrado ganado' || s === 'cerrado perdido'
        })
        .sort((a, b) => {
            const aTime = new Date(String((a as any)?.closed_at_real || a.created_at || 0)).getTime()
            const bTime = new Date(String((b as any)?.closed_at_real || b.created_at || 0)).getTime()
            return bTime - aTime
        })
        .slice(0, 6)

    const projectsByStage = useMemo(() => {
        const groups: Record<string, CompanyProjectAssignment360[]> = {
            implemented_real: [],
            in_negotiation: [],
            prospection_same_close: [],
            future_lead_opportunity: []
        }
        projectAssignments.forEach((row) => {
            const key = String(row.assignment_stage || '')
            if (!groups[key]) groups[key] = []
            groups[key].push(row)
        })
        return groups
    }, [projectAssignments])

    const formatCurrency = (value?: number | null) => {
        if (value == null || Number.isNaN(Number(value))) return '-'
        return `$${Number(value).toLocaleString('es-MX')}`
    }

    const formatDateTime = (value?: string | null) => {
        if (!value) return '-'
        const dt = new Date(value)
        if (Number.isNaN(dt.getTime())) return '-'
        return dt.toLocaleString('es-MX', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    const formatDateOnly = (value?: string | null) => {
        if (!value) return '-'
        const dt = new Date(value)
        if (Number.isNaN(dt.getTime())) return '-'
        return dt.toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })
    }

    const getProjectStageLabel = (stage?: string | null) => {
        const s = String(stage || '')
        if (s === 'implemented_real') return 'Implementado Real'
        if (s === 'in_negotiation' || s === 'forecasted') return 'En Negociación'
        if (s === 'prospection_same_close') return 'Prospección Mismo Cierre'
        if (s === 'future_lead_opportunity') return 'Futuro Lead'
        return s || 'Sin etapa'
    }

    const toneVars = (lane: UiToneLane): CSSProperties => buildSemanticToneCssVars(getSemanticTonePalette(lane, theme)) as CSSProperties
    const projectStageToneVars = (stage?: string | null) => toneVars(getProjectStageToneLane(stage))
    const leadStageToneVars = (stage?: string | null) => toneVars(getLeadStageToneLane(stage))
    const meetingStatusToneVars = (status?: string | null) => toneVars(getMeetingStatusToneLane(status))
    const taskStatusToneVars = (status?: string | null) => toneVars(getTaskStatusToneLane(status))
    const noteTypeToneVars = (noteType?: string | null) => toneVars(getCompanyNoteTypeToneLane(noteType))

    const toneChipClassName = 'border shadow-sm [background:var(--tone-chip-bg)] [border-color:var(--tone-chip-border)] [color:var(--tone-chip-text)]'
    const toneChipHoverButtonClassName = `${toneChipClassName} transition-all cursor-pointer hover:-translate-y-px hover:[background:var(--tone-chip-hover-bg)] hover:[border-color:var(--tone-chip-hover-border)] hover:[color:var(--tone-chip-hover-text)] hover:[box-shadow:0_10px_22px_-14px_var(--tone-shadow)] active:translate-y-0 active:scale-[0.99]`
    const tonePanelClassName = 'border [background:var(--tone-panel-bg)] [border-color:var(--tone-panel-border)] [color:var(--tone-panel-text)]'
    const tonePanelSoftClassName = 'border [background:var(--tone-panel-soft-bg)] [border-color:var(--tone-panel-soft-border)] [color:var(--tone-panel-soft-text)]'

    if (!isOpen) return null

    return (
        <div className='fixed inset-x-0 bottom-0 top-[70px] z-[130] bg-[var(--background)] flex flex-col animate-in fade-in slide-in-from-bottom duration-300'>
            {/* Header */}
            <div className='bg-[#0A1635] px-8 py-6 flex items-center justify-between shadow-xl shrink-0 border-b border-[var(--card-border)]'>
                <div className='flex items-center gap-4'>
                    {company.logo_url && (
                        <img src={company.logo_url} alt={company.nombre} className='h-10 w-10 object-cover bg-white rounded-lg' />
                    )}
                    <h1 className='text-2xl font-black text-white tracking-tight'>
                        {company.nombre}
                    </h1>
                </div>

                <div className='flex items-center gap-3'>
                    <span
                        className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest ${toneChipClassName}`}
                        style={toneVars('blue')}
                    >
                        Empresa Certificada
                    </span>
                    <button
                        onClick={onClose}
                        className='h-10 px-4 rounded-2xl font-black text-[10px] uppercase tracking-widest border transition-all hover:brightness-110 hover:shadow-lg hover:scale-[1.02] active:scale-95'
                        style={{ background: 'var(--card-bg)', color: 'var(--text-primary)', borderColor: 'var(--card-border)' }}
                        title='Regresar'
                    >
                        Regresar
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className='flex-1 overflow-y-auto bg-[var(--background)] custom-scrollbar'>
                <div className='max-w-7xl mx-auto p-8 grid grid-cols-1 lg:grid-cols-12 gap-8'>

                    {/* Left Panel: Company Metadata */}
                    <div className='lg:col-span-4 space-y-6'>
                        <div className='bg-[var(--card-bg)] rounded-3xl p-8 shadow-sm border border-[var(--card-border)]'>
                            <div className='mb-6 flex items-center justify-between gap-3'>
                                <h2 className='text-xl font-black text-[var(--text-primary)] flex items-center gap-2 tracking-tight'>
                                    <FileText size={20} className='text-[var(--accent-secondary)]' /> Datos Generales
                                </h2>
                                {onEditCompany ? (
                                    <button
                                        type='button'
                                        onClick={() => onEditCompany(company)}
                                        className='h-9 w-9 rounded-xl border bg-[var(--card-bg)] text-[var(--text-primary)] shadow-sm inline-flex items-center justify-center transition-all cursor-pointer hover:-translate-y-px hover:[border-color:var(--tone-chip-hover-border)] hover:[background:var(--tone-chip-hover-bg)] hover:[color:var(--tone-chip-hover-text)] hover:[box-shadow:0_10px_22px_-14px_var(--tone-shadow)]'
                                        style={{ ...toneVars('amber'), borderColor: 'var(--card-border)' }}
                                        aria-label='Editar empresa'
                                        title='Editar empresa'
                                    >
                                        <Pencil size={14} strokeWidth={2.4} />
                                    </button>
                                ) : null}
                            </div>

                            <div className='space-y-6'>
                                <div className='p-4 bg-[var(--hover-bg)] rounded-2xl border border-[var(--card-border)]'>
                                    <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-[0.2em] block mb-1'>Industria</label>
                                    <p className='text-[var(--text-primary)] font-bold text-lg'>{companyPrimaryIndustryDisplay}</p>
                                    {!!companyBadgeIndustries.length && (
                                        <div className='mt-3 flex flex-wrap gap-2'>
                                            {companyBadgeIndustries.map((industry) => (
                                                <span
                                                    key={`chip-${industry.id}`}
                                                    className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${toneChipClassName}`}
                                                    style={toneVars('blue')}
                                                >
                                                    {industry.name}
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    {!!companyBadgeIndustries.length && (
                                        <div className='mt-4 p-3 rounded-xl border bg-[var(--card-bg)] border-[var(--card-border)]'>
                                            <div className='flex flex-wrap gap-2'>
                                                {companyBadgeIndustries.map((industry) => {
                                                    const badgeVisual = getIndustryBadgeVisualFromMap(industry.id, companyBadgeVisualMap, industry.name)
                                                    const IndustryIcon = badgeVisual.icon
                                                    const levelVisual = getIndustryBadgeLevelMedallionVisual(1, badgeVisual)
                                                    return (
                                                        <BadgeInfoTooltip
                                                            key={industry.id}
                                                            title={industry.name}
                                                            subtitle='Industria de empresa'
                                                            rows={[
                                                                { label: 'Empresa', value: company.nombre || 'N/A' },
                                                                { label: 'Badge', value: 'Activo en ficha de empresa' }
                                                            ]}
                                                        >
                                                            <BadgeMedallion
                                                                icon={IndustryIcon}
                                                                centerClassName={badgeVisual.containerClass}
                                                                iconClassName={badgeVisual.iconClass}
                                                                ringStyle={levelVisual.ringStyle}
                                                                coreBorderColorClassName={levelVisual.coreBorderColorClassName}
                                                                coreBorderStyle={levelVisual.coreBorderStyle}
                                                                size='xs'
                                                                iconSize={13}
                                                                strokeWidth={2.3}
                                                            />
                                                        </BadgeInfoTooltip>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className='p-4 bg-[var(--hover-bg)] rounded-2xl border border-[var(--card-border)]'>
                                    <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-[0.2em] block mb-1'>Ubicación</label>
                                    <div className='flex items-center gap-2'>
                                        <MapPin size={20} className='text-red-500 shrink-0' />
                                        <p className='text-[var(--text-primary)] font-bold text-lg'>{company.ubicacion || 'No especificada'}</p>
                                    </div>
                                </div>

                                <div className='p-4 bg-[var(--hover-bg)] rounded-2xl border border-[var(--card-border)]'>
                                    <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-[0.2em] block mb-1'>Website</label>
                                    {company.website ? (
                                        <a
                                            href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                                            target='_blank'
                                            className='text-blue-500 font-bold hover:underline flex items-center gap-2 truncate text-lg'
                                        >
                                            <Globe size={20} className='text-blue-500 shrink-0' />
                                            {company.website}
                                        </a>
                                    ) : (
                                        <p className='text-[var(--text-secondary)]'>No registrado</p>
                                    )}
                                </div>

                                <div className='p-4 bg-[var(--hover-bg)] rounded-2xl border border-[var(--card-border)]'>
                                    <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-[0.2em] block mb-1'>Tamaño de Empresa</label>
                                    <div className='flex items-center gap-3 mt-2'>
                                        <span className='text-3xl font-black text-[var(--text-primary)]'>{company.tamano || 0}</span>
                                        <div className='flex gap-1 flex-1'>
                                            {[1, 2, 3, 4, 5].map(i => (
                                                <div key={i} className={`h-2.5 flex-1 rounded-full ${i <= (company.tamano || 0) ? 'bg-[#2048FF]' : 'bg-[var(--background)]'}`} />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className='bg-[var(--card-bg)] rounded-3xl p-8 shadow-sm border border-[var(--card-border)]'>
                            <h2 className='text-xl font-black text-[var(--text-primary)] mb-4 flex items-center gap-2 tracking-tight'>
                                <ClipboardList size={20} className='text-[var(--accent-secondary)]' /> Descripción
                            </h2>
                            <p className='text-[var(--text-secondary)] leading-relaxed font-medium bg-[var(--hover-bg)] p-6 rounded-2xl border border-[var(--card-border)]'>
                                {company.descripcion || 'Sin descripción detallada.'}
                            </p>
                        </div>
                    </div>

                    {/* Right Panel: Company 360 */}
                    <div className='lg:col-span-8 space-y-6'>
                        <div className='bg-[var(--card-bg)] rounded-3xl p-6 shadow-sm border border-[var(--card-border)]'>
                            <div className='flex items-center justify-between gap-3 flex-wrap'>
                                <div className='flex items-center gap-3'>
                                    <div className='ah-icon-card ah-icon-card-sm'>
                                        <TrendingUp size={20} strokeWidth={2.2} />
                                    </div>
                                    <div>
                                        <h2 className='text-lg font-black text-[var(--text-primary)] tracking-tight'>Vista 360 de Empresa</h2>
                                        <p className='text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]'>
                                            Leads, proyectos, juntas y tareas en una sola vista
                                        </p>
                                    </div>
                                </div>
                                {workspaceWarning && (
                                    <span
                                        className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-[0.14em] ${toneChipClassName}`}
                                        style={toneVars('amber')}
                                    >
                                        Carga parcial
                                    </span>
                                )}
                            </div>

                            <div className='mt-4 flex flex-wrap gap-2'>
                                <button
                                    onClick={() => setIsQuickLeadModalOpen(true)}
                                    className={`h-10 px-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.14em] inline-flex items-center gap-2 ${toneChipHoverButtonClassName}`}
                                    style={toneVars('blue')}
                                >
                                    <Plus size={13} /> Nuevo Lead
                                </button>
                                <button
                                    onClick={handleOpenQuickMeeting}
                                    className={`h-10 px-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.14em] inline-flex items-center gap-2 ${toneChipHoverButtonClassName}`}
                                    style={toneVars('violet')}
                                >
                                    <CalendarPlus size={13} /> Nueva Junta
                                </button>
                                <button
                                    onClick={() => setIsQuickTaskModalOpen(true)}
                                    className={`h-10 px-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.14em] inline-flex items-center gap-2 ${toneChipHoverButtonClassName}`}
                                    style={toneVars('cyan')}
                                >
                                    <ListTodo size={13} /> Nueva Tarea
                                </button>
                                <button
                                    onClick={handleOpenQuickProjectModal}
                                    className={`h-10 px-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.14em] inline-flex items-center gap-2 ${toneChipHoverButtonClassName}`}
                                    style={toneVars('amber')}
                                >
                                    <FolderPlus size={13} /> Agregar Proyecto
                                </button>
                                <button
                                    onClick={() => {
                                        setQuickActionError(null)
                                        setIsQuickNoteModalOpen(true)
                                    }}
                                    className={`h-10 px-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.14em] inline-flex items-center gap-2 ${toneChipHoverButtonClassName}`}
                                    style={toneVars('emerald')}
                                >
                                    <StickyNote size={13} /> Nueva Nota
                                </button>
                            </div>

                            {quickActionError && (
                                <div
                                    className={`mt-3 rounded-2xl px-4 py-3 text-xs font-bold ${tonePanelClassName}`}
                                    style={toneVars('rose')}
                                >
                                    {quickActionError}
                                </div>
                            )}

                            <div className='mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3'>
                                <div className='rounded-2xl border border-[var(--card-border)] bg-[var(--hover-bg)] p-4'>
                                    <p className='text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)] opacity-80'>Leads</p>
                                    <p className='mt-1 text-2xl font-black text-[var(--text-primary)]'>{companyStats.totalLeads}</p>
                                    <p className='text-xs font-bold text-[var(--text-secondary)]'>
                                        {companyStats.prospectionLeads} prospección · {companyStats.negotiationLeads} negociación
                                    </p>
                                </div>
                                <div className='rounded-2xl border border-[var(--card-border)] bg-[var(--hover-bg)] p-4'>
                                    <p className='text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)] opacity-80'>Cierres</p>
                                    <p className='mt-1 text-2xl font-black text-[var(--text-primary)]'>{companyStats.wonLeads}</p>
                                    <p className='text-xs font-bold text-[var(--text-secondary)]'>
                                        {companyStats.lostLeads} perdidos
                                    </p>
                                </div>
                                <div className='rounded-2xl border border-[var(--card-border)] bg-[var(--hover-bg)] p-4'>
                                    <p className='text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)] opacity-80'>Proyectos</p>
                                    <p className='mt-1 text-2xl font-black text-[var(--text-primary)]'>{companyStats.implementedProjects}</p>
                                    <p className='text-xs font-bold text-[var(--text-secondary)]'>
                                        {companyStats.totalProjects} asignaciones totales
                                    </p>
                                </div>
                                <div className='rounded-2xl border border-[var(--card-border)] bg-[var(--hover-bg)] p-4'>
                                    <p className='text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)] opacity-80'>Agenda</p>
                                    <p className='mt-1 text-2xl font-black text-[var(--text-primary)]'>{companyStats.pendingTasks}</p>
                                    <p className='text-xs font-bold text-[var(--text-secondary)]'>
                                        tareas pendientes · {companyStats.completedMeetings} juntas completadas
                                    </p>
                                </div>
                            </div>

                            {companyStats.nextScheduledMeeting && (
                                <div
                                    className={`mt-4 rounded-2xl px-4 py-3 ${tonePanelClassName}`}
                                    style={toneVars('blue')}
                                >
                                    <p className='text-[10px] font-black uppercase tracking-[0.14em] [color:var(--tone-panel-text)]'>Próxima junta asociada</p>
                                    <p className='text-sm font-black text-[var(--text-primary)] mt-1'>
                                        {String((companyStats.nextScheduledMeeting as any)?.title || 'Junta')} · {formatDateTime(String((companyStats.nextScheduledMeeting as any)?.start_time || ''))}
                                    </p>
                                </div>
                            )}

                            {workspaceWarning && (
                                <div
                                    className={`mt-3 rounded-xl px-3 py-2 text-xs font-bold ${tonePanelSoftClassName}`}
                                    style={toneVars('amber')}
                                >
                                    {workspaceWarning}
                                </div>
                            )}
                        </div>

                        <div className='bg-[var(--card-bg)] rounded-3xl shadow-sm border border-[var(--card-border)] flex flex-col'>
                            <div className='p-8 border-b border-[var(--card-border)] flex items-center justify-between'>
                                <h2 className='text-2xl font-black text-[var(--text-primary)] flex items-center gap-3 tracking-tight'>
                                    <Users2 size={24} className='text-[var(--accent-secondary)]' /> Contactos y Leads Asociados
                                    <span className='bg-[var(--hover-bg)] text-[var(--text-primary)] text-xs px-3 py-1 rounded-full font-black border border-[var(--card-border)]'>
                                        {clients.length}
                                    </span>
                                </h2>
                            </div>

                            <div className='p-0'>
                                {loadingClients ? (
                                    <div className='py-20 text-center animate-pulse'>
                                        <p className='text-[var(--text-secondary)] font-bold'>Cargando base de contactos...</p>
                                    </div>
                                ) : clients.length > 0 ? (
                                    <div className='overflow-x-auto'>
                                        <table className='w-full text-left'>
                                            <thead className='bg-[var(--hover-bg)]'>
                                                <tr>
                                                    <th className='px-8 py-4 text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-[0.2em]'>Nombre / Usuario</th>
                                                    <th className='px-8 py-4 text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-[0.2em]'>Contacto</th>
                                                    <th className='px-8 py-4 text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-[0.2em]'>Etapa</th>
                                                    <th className='px-8 py-4 text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-[0.2em] text-right'>Valor</th>
                                                </tr>
                                            </thead>
                                            <tbody className='divide-y divide-[var(--card-border)]'>
                                                {clients.map((client) => (
                                                    <tr
                                                        key={client.id}
                                                        onClick={() => handleClientClick(client)}
                                                        className='hover:bg-blue-50/50 cursor-pointer transition-colors group'
                                                    >
                                                        <td className='px-8 py-5'>
                                                            <div className='flex items-center gap-3'>
                                                                <div className='w-10 h-10 rounded-full bg-gradient-to-tr from-[#2048FF] to-[#8B5CF6] flex items-center justify-center text-white font-black text-sm shadow-md transition-transform group-hover:scale-110'>
                                                                    {client.nombre?.charAt(0) || '?'}
                                                                </div>
                                                                <div>
                                                                    <p className='text-[var(--text-primary)] font-black text-sm'>{client.nombre}</p>
                                                                    <p className='text-[var(--text-secondary)] text-[10px] uppercase font-bold tracking-widest opacity-60'>
                                                                        Responsable · {getLeadResponsibleName(client)}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className='px-8 py-5 text-[var(--text-secondary)] font-medium text-sm'>
                                                            {client.contacto || '-'}
                                                        </td>
                                                        <td className='px-8 py-5'>
                                                            <span
                                                                className={`px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase ${toneChipClassName}`}
                                                                style={leadStageToneVars(client.etapa)}
                                                            >
                                                                {client.etapa}
                                                            </span>
                                                        </td>
                                                        <td className='px-8 py-5 text-right font-black text-[var(--text-primary)] text-sm'>
                                                            ${client.valor_estimado?.toLocaleString() || '0'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div className='py-20 text-center bg-[var(--hover-bg)] rounded-3xl'>
                                        <p className='text-[var(--text-secondary)] font-bold'>No hay leads asociados a esta empresa.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className='grid grid-cols-1 xl:grid-cols-2 gap-6'>
                            <div className='bg-[var(--card-bg)] rounded-3xl shadow-sm border border-[var(--card-border)] overflow-hidden'>
                                <div className='px-6 py-4 border-b border-[var(--card-border)] flex items-center justify-between gap-3'>
                                    <div className='flex items-center gap-2'>
                                        <Boxes size={16} className='text-amber-500 dark:text-amber-300' />
                                        <h3 className='text-sm font-black uppercase tracking-[0.16em] text-[var(--text-primary)]'>
                                            Proyectos por empresa
                                        </h3>
                                    </div>
                                    <span className='text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]'>
                                        {projectAssignments.length} asignaciones
                                    </span>
                                </div>
                                <div className='p-5 space-y-4 max-h-[480px] overflow-y-auto custom-scrollbar'>
                                    <div className='flex flex-wrap gap-2'>
                                        {([
                                            ['implemented_real', projectsByStage.implemented_real?.length || 0],
                                            ['in_negotiation', projectsByStage.in_negotiation?.length || 0],
                                            ['prospection_same_close', projectsByStage.prospection_same_close?.length || 0],
                                            ['future_lead_opportunity', projectsByStage.future_lead_opportunity?.length || 0]
                                        ] as Array<[string, number]>).map(([stage, count]) => (
                                            <span
                                                key={stage}
                                                className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${toneChipClassName}`}
                                                style={projectStageToneVars(stage)}
                                            >
                                                {getProjectStageLabel(stage)} <span className='opacity-80'>{count}</span>
                                            </span>
                                        ))}
                                    </div>

                                    {loadingWorkspaceExtras ? (
                                        <div className='py-10 text-center text-[var(--text-secondary)] animate-pulse font-bold'>Cargando proyectos...</div>
                                    ) : projectAssignments.length === 0 ? (
                                        <div className='py-10 text-center text-[var(--text-secondary)] font-bold'>No hay proyectos asignados a esta empresa.</div>
                                    ) : (
                                        <div className='space-y-3'>
                                            {projectAssignments.map((row) => {
                                                const sourceLead = row.source_lead_id != null ? leadById.get(Number(row.source_lead_id)) : null
                                                return (
                                                    <div key={row.id} className='rounded-2xl border border-[var(--card-border)] bg-[var(--hover-bg)] p-4'>
                                                        <div className='flex items-start justify-between gap-3'>
                                                            <div className='min-w-0'>
                                                                <p className='text-sm font-black text-[var(--text-primary)] truncate'>{row.projectName}</p>
                                                                <p className='text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]'>
                                                                    {sourceLead?.nombre ? `Lead origen: ${sourceLead.nombre}` : (sourceLead?.empresa || 'Sin lead origen')}
                                                                </p>
                                                            </div>
                                                            <span
                                                                className={`shrink-0 rounded-xl px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${toneChipClassName}`}
                                                                style={projectStageToneVars(row.assignment_stage)}
                                                            >
                                                                {getProjectStageLabel(row.assignment_stage)}
                                                            </span>
                                                        </div>

                                                        <div className='mt-3 grid grid-cols-2 gap-3 text-xs'>
                                                            <div className='rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2'>
                                                                <p className='text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]'>Mensualidad</p>
                                                                <p className='font-black text-[var(--text-primary)]'>
                                                                    {formatCurrency(row.mensualidad_pactada_usd ?? row.projectMonthlyReal)}
                                                                </p>
                                                            </div>
                                                            <div className='rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2'>
                                                                <p className='text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]'>Implementación</p>
                                                                <p className='font-black text-[var(--text-primary)]'>
                                                                    {formatCurrency(row.implementacion_pactada_usd ?? row.projectImplementationReal)}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        {row.notes && (
                                                            <p className='mt-3 text-xs font-medium text-[var(--text-secondary)] line-clamp-2'>{row.notes}</p>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className='space-y-6'>
                                <div className='bg-[var(--card-bg)] rounded-3xl shadow-sm border border-[var(--card-border)] overflow-hidden'>
                                    <div className='px-6 py-4 border-b border-[var(--card-border)] flex items-center justify-between gap-3'>
                                        <div className='flex items-center gap-2'>
                                            <CalendarClock size={16} className='text-violet-500 dark:text-violet-300' />
                                            <h3 className='text-sm font-black uppercase tracking-[0.16em] text-[var(--text-primary)]'>
                                                Juntas asociadas
                                            </h3>
                                        </div>
                                        <span className='text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]'>
                                            {meetings.length}
                                        </span>
                                    </div>
                                    <div className='p-4 max-h-[260px] overflow-y-auto custom-scrollbar'>
                                        {loadingWorkspaceExtras ? (
                                            <div className='py-8 text-center text-[var(--text-secondary)] animate-pulse font-bold'>Cargando juntas...</div>
                                        ) : meetings.length === 0 ? (
                                            <div className='py-8 text-center text-[var(--text-secondary)] font-bold'>Sin juntas registradas para esta empresa.</div>
                                        ) : (
                                            <div className='space-y-2'>
                                                {meetings.slice(0, 12).map((meeting) => {
                                                    const linkedLead = leadById.get(Number((meeting as any).lead_id || 0))
                                                    const responsibleName = getLeadResponsibleName(linkedLead)
                                                    const meetingStatus = String((meeting as any)?.status || (meeting as any)?.meeting_status || 'scheduled')
                                                    return (
                                                        <div key={String((meeting as any).id)} className='rounded-xl border border-[var(--card-border)] bg-[var(--hover-bg)] px-3 py-2.5'>
                                                            <div className='flex items-start justify-between gap-2'>
                                                                <div className='min-w-0'>
                                                                    <p className='text-sm font-black text-[var(--text-primary)] truncate'>
                                                                        {String((meeting as any)?.title || 'Junta')}
                                                                    </p>
                                                                    <p className='text-[11px] font-bold text-[var(--text-secondary)] truncate'>
                                                                        {linkedLead?.nombre || linkedLead?.empresa || 'Lead'} · {formatDateTime(String((meeting as any)?.start_time || ''))}
                                                                    </p>
                                                                    <p className='text-[10px] font-black uppercase tracking-[0.12em] text-[var(--text-secondary)]/80 truncate mt-1'>
                                                                        Responsable · {responsibleName}
                                                                    </p>
                                                                </div>
                                                                <span
                                                                    className={`shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] ${toneChipClassName}`}
                                                                    style={meetingStatusToneVars(meetingStatus)}
                                                                >
                                                                    {meetingStatus}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className='bg-[var(--card-bg)] rounded-3xl shadow-sm border border-[var(--card-border)] overflow-hidden'>
                                    <div className='px-6 py-4 border-b border-[var(--card-border)] flex items-center justify-between gap-3'>
                                        <div className='flex items-center gap-2'>
                                            <CheckSquare size={16} className='text-blue-500 dark:text-blue-300' />
                                            <h3 className='text-sm font-black uppercase tracking-[0.16em] text-[var(--text-primary)]'>
                                                Tareas asociadas
                                            </h3>
                                        </div>
                                        <span className='text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]'>
                                            {tasks.length}
                                        </span>
                                    </div>
                                    <div className='p-4 max-h-[260px] overflow-y-auto custom-scrollbar'>
                                        {loadingWorkspaceExtras ? (
                                            <div className='py-8 text-center text-[var(--text-secondary)] animate-pulse font-bold'>Cargando tareas...</div>
                                        ) : tasks.length === 0 ? (
                                            <div className='py-8 text-center text-[var(--text-secondary)] font-bold'>Sin tareas registradas para esta empresa.</div>
                                        ) : (
                                            <div className='space-y-2'>
                                                {tasks.slice(0, 12).map((task) => {
                                                    const linkedLead = leadById.get(Number((task as any).lead_id || 0))
                                                    const responsibleName = getLeadResponsibleName(linkedLead)
                                                    const isCompleted = String((task as any)?.estado || '').toLowerCase() === 'completada'
                                                    return (
                                                        <div key={String((task as any).id)} className='rounded-xl border border-[var(--card-border)] bg-[var(--hover-bg)] px-3 py-2.5'>
                                                            <div className='flex items-start justify-between gap-2'>
                                                                <div className='min-w-0'>
                                                                    <p className={`text-sm font-black truncate ${isCompleted ? 'text-[var(--text-secondary)] line-through' : 'text-[var(--text-primary)]'}`}>
                                                                        {String((task as any)?.titulo || 'Tarea')}
                                                                    </p>
                                                                    <p className='text-[11px] font-bold text-[var(--text-secondary)] truncate'>
                                                                        {linkedLead?.nombre || linkedLead?.empresa || 'Lead'} · vence {formatDateOnly(String((task as any)?.fecha_vencimiento || ''))}
                                                                    </p>
                                                                    <p className='text-[10px] font-black uppercase tracking-[0.12em] text-[var(--text-secondary)]/80 truncate mt-1'>
                                                                        Responsable · {responsibleName}
                                                                    </p>
                                                                </div>
                                                                <span
                                                                    className={`shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] ${toneChipClassName}`}
                                                                    style={taskStatusToneVars(String((task as any)?.estado || 'pendiente'))}
                                                                >
                                                                    {String((task as any)?.estado || 'pendiente')}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className='bg-[var(--card-bg)] rounded-3xl shadow-sm border border-[var(--card-border)] overflow-hidden'>
                            <div className='px-6 py-4 border-b border-[var(--card-border)] flex items-center gap-2'>
                                <ShieldCheck size={16} className='text-cyan-500 dark:text-cyan-300' />
                                <h3 className='text-sm font-black uppercase tracking-[0.16em] text-[var(--text-primary)]'>
                                    Historial de cierres de la empresa
                                </h3>
                            </div>
                            <div className='p-4'>
                                {recentWonOrLostLeads.length === 0 ? (
                                    <div className='py-8 text-center text-[var(--text-secondary)] font-bold'>Aún no hay cierres ganados/perdidos registrados para esta empresa.</div>
                                ) : (
                                    <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                                        {recentWonOrLostLeads.map((lead) => {
                                            const responsibleName = getLeadResponsibleName(lead)
                                            return (
                                            <div key={lead.id} className='rounded-2xl border border-[var(--card-border)] bg-[var(--hover-bg)] p-4'>
                                                <div className='flex items-start justify-between gap-2'>
                                                    <div className='min-w-0'>
                                                        <p className='text-sm font-black text-[var(--text-primary)] truncate'>{lead.nombre || lead.empresa || 'Lead'}</p>
                                                        <p className='text-[11px] font-bold text-[var(--text-secondary)] truncate'>
                                                            {formatDateOnly(String((lead as any)?.closed_at_real || lead.created_at || ''))}
                                                        </p>
                                                        <p className='text-[10px] font-black uppercase tracking-[0.12em] text-[var(--text-secondary)]/80 truncate mt-1'>
                                                            Responsable · {responsibleName}
                                                        </p>
                                                    </div>
                                                    <span
                                                        className={`shrink-0 rounded-xl px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${toneChipClassName}`}
                                                        style={leadStageToneVars(lead.etapa)}
                                                    >
                                                        {lead.etapa || 'N/A'}
                                                    </span>
                                                </div>
                                                <div className='mt-3 grid grid-cols-2 gap-2 text-xs'>
                                                    <div className='rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2'>
                                                        <p className='text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]'>Mensualidad</p>
                                                        <p className='font-black text-[var(--text-primary)]'>{formatCurrency((lead as any)?.valor_real_cierre ?? lead.valor_estimado)}</p>
                                                    </div>
                                                    <div className='rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2'>
                                                        <p className='text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]'>Implementación</p>
                                                        <p className='font-black text-[var(--text-primary)]'>{formatCurrency((lead as any)?.valor_implementacion_real_cierre ?? (lead as any)?.valor_implementacion_estimado ?? 0)}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        )})}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className='bg-[var(--card-bg)] rounded-3xl shadow-sm border border-[var(--card-border)] overflow-hidden'>
                            <div className='px-6 py-4 border-b border-[var(--card-border)] flex items-center justify-between gap-2'>
                                <div className='flex items-center gap-2'>
                                    <StickyNote size={16} className='text-emerald-500 dark:text-emerald-300' />
                                    <h3 className='text-sm font-black uppercase tracking-[0.16em] text-[var(--text-primary)]'>
                                        Notas de empresa
                                    </h3>
                                </div>
                                <span className='text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]'>
                                    {companyNotes.length}
                                </span>
                            </div>
                            <div className='p-4 max-h-[280px] overflow-y-auto custom-scrollbar'>
                                {loadingWorkspaceExtras ? (
                                    <div className='py-8 text-center text-[var(--text-secondary)] animate-pulse font-bold'>Cargando notas...</div>
                                ) : companyNotes.length === 0 ? (
                                    <div className='py-8 text-center text-[var(--text-secondary)] font-bold'>Sin notas registradas para esta empresa.</div>
                                ) : (
                                    <div className='space-y-2'>
                                        {companyNotes.slice(0, 20).map((note) => (
                                            <div key={note.id} className='rounded-xl border border-[var(--card-border)] bg-[var(--hover-bg)] px-3 py-3'>
                                                <div className='flex items-center justify-between gap-2 mb-2'>
                                                    <span
                                                        className={`rounded-lg px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] ${toneChipClassName}`}
                                                        style={noteTypeToneVars(note.note_type)}
                                                    >
                                                        {note.note_type || 'nota'}
                                                    </span>
                                                    <span className='text-[10px] font-bold text-[var(--text-secondary)]'>
                                                        {formatDateTime(note.created_at)}
                                                    </span>
                                                </div>
                                                <p className='text-sm font-medium text-[var(--text-primary)] whitespace-pre-wrap break-words'>{note.note_text}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Nested Client Detail View */}
            {selectedClient && (
                <ClientDetailView
                    isOpen={isClientDetailOpen}
                    onClose={() => setIsClientDetailOpen(false)}
                    client={selectedClient as any}
                    onEditClient={() => { }} // Read-only for now in this view
                    onEditCompany={() => { }}
                    onEmailClick={() => { }} // Added missing prop
                />
            )}

            <ClientModal
                isOpen={isQuickLeadModalOpen}
                onClose={() => setIsQuickLeadModalOpen(false)}
                onSave={handleQuickLeadSave}
                initialData={quickLeadDraft}
                mode='create'
                companies={company.id ? [{ id: String(company.id), nombre: company.nombre, industria: company.industria || null, ubicacion: company.ubicacion || null }] : []}
            />

            <TaskModal
                isOpen={isQuickTaskModalOpen}
                onClose={() => setIsQuickTaskModalOpen(false)}
                onSave={handleQuickTaskSave}
                leadOptions={clients.map((lead) => ({ id: Number(lead.id), empresa: String(lead.empresa || company.nombre || ''), nombre: String(lead.nombre || '') }))}
                mode='create'
            />

            {selectedMeetingLeadId != null && (
                <MeetingModal
                    isOpen={isQuickMeetingModalOpen}
                    onClose={() => {
                        setIsQuickMeetingModalOpen(false)
                        setSelectedMeetingLeadId(null)
                    }}
                    onSave={handleQuickMeetingSave}
                    leadId={selectedMeetingLeadId}
                    sellerId={String(currentUserProfile?.id || '')}
                    mode='create'
                />
            )}

            {isQuickMeetingLeadPickerOpen && (
                <div className='ah-modal-overlay z-[140]'>
                    <div className='ah-modal-panel w-full max-w-xl'>
                        <div className='ah-modal-header'>
                            <div>
                                <h3 className='ah-modal-title text-lg'>Seleccionar Lead para Junta</h3>
                                <p className='ah-modal-subtitle'>Elige un lead de esta empresa</p>
                            </div>
                            <button className='ah-modal-close cursor-pointer' onClick={() => setIsQuickMeetingLeadPickerOpen(false)}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className='p-5 max-h-[420px] overflow-y-auto custom-scrollbar space-y-2'>
                            {clients.map((lead) => (
                                <button
                                    key={lead.id}
                                    onClick={() => {
                                        setSelectedMeetingLeadId(Number(lead.id))
                                        setIsQuickMeetingLeadPickerOpen(false)
                                        setIsQuickMeetingModalOpen(true)
                                    }}
                                    className='w-full text-left rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] hover:border-[#2048FF]/35 hover:bg-[var(--hover-bg)] px-4 py-3 transition-all cursor-pointer'
                                >
                                    <p className='text-sm font-black text-[var(--text-primary)]'>{lead.nombre || lead.empresa || 'Lead'}</p>
                                    <p className='text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)] mt-1'>
                                        {lead.etapa || 'Sin etapa'} · {lead.contacto || 'Sin contacto'}
                                    </p>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {isQuickProjectModalOpen && (
                <div className='ah-modal-overlay z-[140]'>
                    <div className='ah-modal-panel w-full max-w-2xl'>
                        <div className='ah-modal-header'>
                            <div>
                                <h3 className='ah-modal-title text-lg flex items-center gap-2'>
                                    <FolderPlus size={16} /> Agregar Proyecto a Empresa
                                </h3>
                                <p className='ah-modal-subtitle'>{company.nombre}</p>
                            </div>
                            <button
                                className='ah-modal-close cursor-pointer'
                                onClick={() => {
                                    setIsQuickProjectModalOpen(false)
                                    setQuickActionError(null)
                                }}
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className='p-5 space-y-4'>
                            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                                <div className='space-y-1.5'>
                                    <label className='text-xs font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]'>Proyecto</label>
                                    <select
                                        value={quickProjectForm.proyecto_id}
                                        onChange={(e) => handleQuickProjectSelection(e.target.value)}
                                        className='w-full h-11 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 text-sm font-bold text-[var(--text-primary)]'
                                    >
                                        <option value=''>{quickProjectCatalogLoading ? 'Cargando proyectos...' : 'Seleccionar proyecto'}</option>
                                        {quickProjectCatalog.map((project) => (
                                            <option key={project.id} value={project.id}>{project.nombre}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className='space-y-1.5'>
                                    <label className='text-xs font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]'>Etapa</label>
                                    <select
                                        value={quickProjectForm.assignment_stage}
                                        onChange={(e) => setQuickProjectForm((prev) => ({ ...prev, assignment_stage: e.target.value as QuickProjectFormState['assignment_stage'] }))}
                                        className='w-full h-11 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 text-sm font-bold text-[var(--text-primary)]'
                                    >
                                        <option value='in_negotiation'>En negociación</option>
                                        <option value='prospection_same_close'>Prospección mismo cierre</option>
                                        <option value='future_lead_opportunity'>Futuro lead</option>
                                        <option value='implemented_real'>Implementado real</option>
                                    </select>
                                </div>
                                <div className='space-y-1.5 md:col-span-2'>
                                    <label className='text-xs font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]'>Lead origen (opcional)</label>
                                    <select
                                        value={quickProjectForm.source_lead_id}
                                        onChange={(e) => setQuickProjectForm((prev) => ({ ...prev, source_lead_id: e.target.value }))}
                                        className='w-full h-11 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 text-sm font-bold text-[var(--text-primary)]'
                                    >
                                        <option value=''>Sin lead origen</option>
                                        {clients.map((lead) => (
                                            <option key={lead.id} value={String(lead.id)}>{lead.nombre || lead.empresa || `Lead ${lead.id}`}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {quickProjectForm.assignment_stage === 'implemented_real' && (
                                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                                    <div className='space-y-1.5'>
                                        <label className='text-xs font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]'>Mensualidad pactada (USD)</label>
                                        <input
                                            type='text'
                                            inputMode='numeric'
                                            value={quickProjectForm.mensualidad_pactada_usd}
                                            onChange={(e) => setQuickProjectForm((prev) => ({ ...prev, mensualidad_pactada_usd: e.target.value.replace(/[^\d,]/g, '') }))}
                                            className='w-full h-11 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 text-sm font-bold text-[var(--text-primary)]'
                                            placeholder='0'
                                        />
                                    </div>
                                    <div className='space-y-1.5'>
                                        <label className='text-xs font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]'>Implementación pactada (USD)</label>
                                        <input
                                            type='text'
                                            inputMode='numeric'
                                            value={quickProjectForm.implementacion_pactada_usd}
                                            onChange={(e) => setQuickProjectForm((prev) => ({ ...prev, implementacion_pactada_usd: e.target.value.replace(/[^\d,]/g, '') }))}
                                            className='w-full h-11 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 text-sm font-bold text-[var(--text-primary)]'
                                            placeholder='0'
                                        />
                                    </div>
                                </div>
                            )}

                            <div className='space-y-1.5'>
                                <label className='text-xs font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]'>Notas (opcional)</label>
                                <textarea
                                    value={quickProjectForm.notes}
                                    onChange={(e) => setQuickProjectForm((prev) => ({ ...prev, notes: e.target.value }))}
                                    className='w-full min-h-[92px] rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] resize-y'
                                    placeholder='Contexto comercial, alcance, acuerdos...'
                                />
                            </div>

                            {quickActionError && (
                                <div
                                    className={`rounded-xl px-3 py-2 text-xs font-bold ${tonePanelClassName}`}
                                    style={toneVars('rose')}
                                >
                                    {quickActionError}
                                </div>
                            )}
                        </div>
                        <div className='px-5 py-4 border-t border-[var(--card-border)] flex items-center justify-end gap-2'>
                            <button
                                onClick={() => setIsQuickProjectModalOpen(false)}
                                className='h-10 px-4 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--text-primary)] text-[10px] font-black uppercase tracking-[0.14em] cursor-pointer'
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveQuickProjectAssignment}
                                disabled={quickProjectSaving}
                                className={`h-10 px-4 rounded-xl text-[10px] font-black uppercase tracking-[0.14em] disabled:opacity-60 ${toneChipHoverButtonClassName}`}
                                style={toneVars('amber')}
                            >
                                {quickProjectSaving ? 'Guardando...' : 'Guardar Proyecto'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isQuickNoteModalOpen && (
                <div className='ah-modal-overlay z-[140]'>
                    <div className='ah-modal-panel w-full max-w-xl'>
                        <div className='ah-modal-header'>
                            <div>
                                <h3 className='ah-modal-title text-lg flex items-center gap-2'>
                                    <StickyNote size={16} /> Nueva Nota de Empresa
                                </h3>
                                <p className='ah-modal-subtitle'>{company.nombre}</p>
                            </div>
                            <button className='ah-modal-close cursor-pointer' onClick={() => setIsQuickNoteModalOpen(false)}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className='p-5 space-y-4'>
                            <div className='space-y-1.5'>
                                <label className='text-xs font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]'>Tipo</label>
                                <select
                                    value={quickNoteType}
                                    onChange={(e) => setQuickNoteType(e.target.value as any)}
                                    className='w-full h-11 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 text-sm font-bold text-[var(--text-primary)]'
                                >
                                    <option value='seguimiento'>Seguimiento</option>
                                    <option value='contexto'>Contexto</option>
                                    <option value='riesgo'>Riesgo</option>
                                    <option value='acuerdo'>Acuerdo</option>
                                </select>
                            </div>
                            <div className='space-y-1.5'>
                                <label className='text-xs font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]'>Nota</label>
                                <textarea
                                    value={quickNoteText}
                                    onChange={(e) => setQuickNoteText(e.target.value)}
                                    className='w-full min-h-[150px] rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] resize-y'
                                    placeholder='Escribe una nota útil para el seguimiento de la empresa...'
                                />
                            </div>
                            {quickActionError && (
                                <div
                                    className={`rounded-xl px-3 py-2 text-xs font-bold ${tonePanelClassName}`}
                                    style={toneVars('rose')}
                                >
                                    {quickActionError}
                                </div>
                            )}
                        </div>
                        <div className='px-5 py-4 border-t border-[var(--card-border)] flex items-center justify-end gap-2'>
                            <button
                                onClick={() => setIsQuickNoteModalOpen(false)}
                                className='h-10 px-4 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--text-primary)] text-[10px] font-black uppercase tracking-[0.14em] cursor-pointer'
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleQuickNoteSave}
                                disabled={quickNoteSaving}
                                className={`h-10 px-4 rounded-xl text-[10px] font-black uppercase tracking-[0.14em] disabled:opacity-60 ${toneChipHoverButtonClassName}`}
                                style={toneVars('emerald')}
                            >
                                {quickNoteSaving ? 'Guardando...' : 'Guardar Nota'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
