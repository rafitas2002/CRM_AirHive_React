'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import ClientsTable from '@/components/ClientsTable'
import ClientModal from '@/components/ClientModal'
import ConfirmModal from '@/components/ConfirmModal'
import ClientDetailView from '@/components/ClientDetailView'
import { Search, Users, Pencil, RotateCw, ListFilter, Clock3, TriangleAlert } from 'lucide-react'
import RichardDawkinsFooter from '@/components/RichardDawkinsFooter'
import { Database } from '@/lib/supabase'

type Lead = Database['public']['Tables']['clientes']['Row']
type LeadInsert = Database['public']['Tables']['clientes']['Insert']
type LeadUpdate = Database['public']['Tables']['clientes']['Update']

type NegotiationAgingRow = {
    lead_id: number
    seller_id: string | null
    seller_username: string | null
    seller_full_name: string | null
    empresa_id: string | null
    empresa: string | null
    nombre: string | null
    valor_estimado: number
    probabilidad: number | null
    forecast_close_date: string | null
    negotiation_started_at: string | null
    aging_days: number
    pending_tasks_count: number
    overdue_tasks_count: number
    has_open_tasks: boolean
    next_meeting_at: string | null
    has_future_meeting: boolean
    last_activity_at: string | null
    days_since_last_activity: number | null
    is_stalled: boolean
    industria: string | null
    tamano_empresa: number | null
}

// Helper to normalize lead data for the form (handle nulls)
const normalizeLead = (lead: Lead) => ({
    id: lead.id,
    empresa: lead.empresa || '',
    nombre: lead.nombre || '',
    email: lead.email || '',
    telefono: lead.telefono || '',
    etapa: lead.etapa || 'Negociación',
    valor_estimado: lead.valor_estimado || 0,
    valor_real_cierre: (lead as any).valor_real_cierre ?? null,
    valor_implementacion_estimado: (lead as any).valor_implementacion_estimado ?? 0,
    valor_implementacion_real_cierre: (lead as any).valor_implementacion_real_cierre ?? null,
    oportunidad: lead.oportunidad || '',
    calificacion: lead.calificacion || 3,
    notas: lead.notas || '',
    empresa_id: lead.empresa_id || undefined,
    probabilidad: (lead as any).probabilidad || 0,
    forecast_close_date: (lead as any).forecast_close_date || null,
    closed_at_real: ((lead as any).closed_at_real ? String((lead as any).closed_at_real).slice(0, 10) : null),
    loss_reason_id: (lead as any).loss_reason_id ?? null,
    loss_subreason_id: (lead as any).loss_subreason_id ?? null,
    loss_notes: (lead as any).loss_notes ?? '',
    loss_recorded_at: (lead as any).loss_recorded_at ?? null,
    loss_recorded_by: (lead as any).loss_recorded_by ?? null
})

import { useAuth } from '@/lib/auth'

function parseSupabaseError(error: any, fallback: string) {
    if (!error) return fallback
    if (typeof error === 'string') return error
    if (error?.message) return error.message as string

    const fragments = [error?.code, error?.details, error?.hint].filter(Boolean)
    if (fragments.length > 0) {
        return fragments.join(' | ')
    }

    try {
        const serialized = JSON.stringify(error, Object.getOwnPropertyNames(error))
        if (serialized && serialized !== '{}') return serialized
    } catch {
        // ignore serialization failures and use fallback
    }

    return fallback
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
    if (!dateOnly) return null
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly)
    if (!m) return null
    const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0)
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString()
}

export default function LeadsPage() {
    const [leads, setLeads] = useState<Lead[]>([])
    const [sellerProfilesById, setSellerProfilesById] = useState<Record<string, { fullName?: string | null; avatarUrl?: string | null }>>({})
    const [loading, setLoading] = useState(true)
    const [supabase] = useState(() => createClient())
    const router = useRouter()

    // Auth Hook
    const { user, loading: authLoading } = useAuth()

    // Modal & Editing State
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
    const [currentLead, setCurrentLead] = useState<Lead | null>(null)
    const [isEditingMode, setIsEditingMode] = useState(false)
    const [currentUser, setCurrentUser] = useState<any>(null)

    // Delete Confirmation State
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
    const [clientToDelete, setClientToDelete] = useState<number | null>(null)

    // Company Module State
    const [isDetailViewOpen, setIsDetailViewOpen] = useState(false)
    const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
    const [companiesList, setCompaniesList] = useState<{ id: string, nombre: string, industria?: string, ubicacion?: string }[]>([])

    // Filtering State
    const [filterSearch, setFilterSearch] = useState('')
    const [filterOwner, setFilterOwner] = useState('All')
    const [pipelineScope, setPipelineScope] = useState<'active' | 'prospection' | 'negotiation' | 'all'>('active')

    // Email Composer State
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false)
    const [emailRecipient, setEmailRecipient] = useState({ email: '', name: '' })
    const [connectedGoogleEmail, setConnectedGoogleEmail] = useState<string | null>(null)
    const [isCalendarConnected, setIsCalendarConnected] = useState(false)

    // Sorting State
    const [sortBy, setSortBy] = useState('fecha_registro-desc')
    const [agingRows, setAgingRows] = useState<NegotiationAgingRow[]>([])
    const [agingLoading, setAgingLoading] = useState(false)
    const [agingError, setAgingError] = useState<string | null>(null)
    const [agingOnlyStalled, setAgingOnlyStalled] = useState(false)
    const [agingMinDays, setAgingMinDays] = useState('0')

    useEffect(() => {
        if (!authLoading && user) {
            setCurrentUser(user)
            checkCalendarConnection(user.id)
        }
    }, [user, authLoading])

    const checkCalendarConnection = async (userId: string) => {
        const { data } = await (supabase
            .from('google_integrations') as any)
            .select('email')
            .eq('user_id', userId)
            .maybeSingle()

        if (data) {
            setIsCalendarConnected(true)
            setConnectedGoogleEmail(data.email)
        } else {
            setIsCalendarConnected(false)
            setConnectedGoogleEmail(null)
        }
    }

    const handleEmailClick = (email: string, name: string) => {
        // Prepare Gmail URL with authuser to force the correct account
        let gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}`

        if (connectedGoogleEmail) {
            gmailUrl += `&authuser=${encodeURIComponent(connectedGoogleEmail)}`
        }

        window.open(gmailUrl, '_blank')
    }

    // Memoized initial data to avoid reference changes on every render
    const memoizedInitialLead = useMemo(() => {
        if (!isModalOpen) return null
        return currentLead ? normalizeLead(currentLead) : null
    }, [isModalOpen, currentLead])

    // Sort & Filter Logic
    const sortedAndFilteredLeads = useMemo(() => {
        const result = leads.filter(lead => {
            const matchesSearch = !filterSearch ||
                lead.nombre?.toLowerCase().includes(filterSearch.toLowerCase()) ||
                lead.empresa?.toLowerCase().includes(filterSearch.toLowerCase()) ||
                lead.email?.toLowerCase().includes(filterSearch.toLowerCase()) ||
                lead.telefono?.toLowerCase().includes(filterSearch.toLowerCase())

            const matchesOwner = filterOwner === 'All' || lead.owner_username === filterOwner

            const stageNormalized = String(lead.etapa || '').trim().toLowerCase()
            const isClosedStage = isWonStage(lead.etapa) || isLostStage(lead.etapa)
            const isProspectionStage = stageNormalized === 'prospección' || stageNormalized === 'prospeccion'
            const isNegotiationStage = stageNormalized === 'negociación' || stageNormalized === 'negociacion'

            const matchesScope = pipelineScope === 'all'
                ? true
                : pipelineScope === 'active'
                    ? !isClosedStage
                    : pipelineScope === 'prospection'
                        ? isProspectionStage
                        : isNegotiationStage

            return matchesSearch && matchesOwner && matchesScope
        })

        // Apply Sorting
        const [field, direction] = sortBy.split('-')
        const isAsc = direction === 'asc'

        return result.sort((a, b) => {
            let comparison = 0

            switch (field) {
                case 'empresa':
                    comparison = (a.empresa || '').localeCompare(b.empresa || '')
                    break
                case 'nombre':
                    comparison = (a.nombre || '').localeCompare(b.nombre || '')
                    break
                case 'valor_estimado':
                    comparison = (a.valor_estimado || 0) - (b.valor_estimado || 0)
                    break
                case 'calificacion':
                    comparison = (a.calificacion || 0) - (b.calificacion || 0)
                    break
                case 'probabilidad':
                    comparison = (a.probabilidad || 0) - (b.probabilidad || 0)
                    break
                case 'fecha_registro':
                    comparison = new Date(a.fecha_registro || 0).getTime() - new Date(b.fecha_registro || 0).getTime()
                    break
                case 'owner_username':
                    comparison = (a.owner_username || '').localeCompare(b.owner_username || '')
                    break
                case 'etapa':
                    const etapaOrder: Record<string, number> = {
                        'Negociación': 1,
                        'Cerrado Ganado': 2,
                        'Cerrado Perdido': 3
                    }
                    comparison = (etapaOrder[a.etapa || ''] || 99) - (etapaOrder[b.etapa || ''] || 99)
                    break
            }

            return isAsc ? comparison : -comparison
        })
    }, [leads, filterSearch, filterOwner, sortBy, pipelineScope])

    // Get unique owners for filter dropdown
    const uniqueOwners = useMemo(() => {
        const owners = new Set(leads.map(l => l.owner_username).filter((o): o is string => !!o))
        return Array.from(owners).sort()
    }, [leads])

    const pipelineScopeLabel = useMemo(() => {
        if (pipelineScope === 'active') return 'Activas'
        if (pipelineScope === 'prospection') return 'Prospección'
        if (pipelineScope === 'negotiation') return 'Negociación'
        return 'Todas'
    }, [pipelineScope])

    const filteredAgingRows = useMemo(() => {
        const minDays = Math.max(0, Number(agingMinDays || 0))
        return agingRows
            .filter((row) => {
                const matchesSearch = !filterSearch
                    || String(row.empresa || '').toLowerCase().includes(filterSearch.toLowerCase())
                    || String(row.nombre || '').toLowerCase().includes(filterSearch.toLowerCase())
                    || String(row.seller_full_name || row.seller_username || '').toLowerCase().includes(filterSearch.toLowerCase())
                const matchesOwner = filterOwner === 'All' || String(row.seller_username || '') === filterOwner
                const matchesStalled = !agingOnlyStalled || !!row.is_stalled
                const matchesMinDays = Number(row.aging_days || 0) >= minDays
                return matchesSearch && matchesOwner && matchesStalled && matchesMinDays
            })
            .sort((a, b) => {
                if (a.is_stalled !== b.is_stalled) return a.is_stalled ? -1 : 1
                if ((b.aging_days || 0) !== (a.aging_days || 0)) return (b.aging_days || 0) - (a.aging_days || 0)
                return String(a.empresa || '').localeCompare(String(b.empresa || ''), 'es')
            })
    }, [agingRows, filterSearch, filterOwner, agingOnlyStalled, agingMinDays])

    const stalledAgingCount = useMemo(
        () => filteredAgingRows.filter((row) => row.is_stalled).length,
        [filteredAgingRows]
    )

    const fetchLeads = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('clientes')
            .select('*')
            .order('created_at', { ascending: false })

        if (error) {
            console.error('Error fetching leads:', error)
        } else {
            const rows = (data || []) as Lead[]
            setLeads(rows)

            const ownerIds = Array.from(new Set(
                rows.map((row: any) => String(row?.owner_id || '')).filter(Boolean)
            ))

            if (ownerIds.length > 0) {
                const { data: profileRows } = await (supabase.from('profiles') as any)
                    .select('id, full_name, avatar_url')
                    .in('id', ownerIds)

                const nextMap: Record<string, { fullName?: string | null; avatarUrl?: string | null }> = {}
                ;((profileRows || []) as any[]).forEach((row) => {
                    const id = String(row?.id || '')
                    if (!id) return
                    nextMap[id] = {
                        fullName: row?.full_name || null,
                        avatarUrl: row?.avatar_url || null
                    }
                })
                setSellerProfilesById(nextMap)
            } else {
                setSellerProfilesById({})
            }
        }
        setLoading(false)
    }

    const fetchNegotiationAging = async () => {
        setAgingLoading(true)
        setAgingError(null)
        const { data, error } = await (supabase.from('lead_negotiation_aging_view') as any)
            .select('*')
            .order('is_stalled', { ascending: false })
            .order('aging_days', { ascending: false })
            .limit(300)

        if (error) {
            console.warn('Error fetching negotiation aging view:', error)
            const msg = String(error?.message || '').toLowerCase()
            const missingView = msg.includes('lead_negotiation_aging_view') || msg.includes('42p01') || msg.includes('does not exist')
            setAgingError(missingView
                ? 'Aging de negociaciones no disponible en esta base. Ejecuta la migración 064.'
                : (error.message || 'No se pudo cargar el aging de negociaciones.'))
            setAgingRows([])
            setAgingLoading(false)
            return
        }

        const rows = ((data || []) as any[]).map((row) => ({
            lead_id: Number(row?.lead_id || 0),
            seller_id: row?.seller_id ? String(row.seller_id) : null,
            seller_username: row?.seller_username ? String(row.seller_username) : null,
            seller_full_name: row?.seller_full_name ? String(row.seller_full_name) : null,
            empresa_id: row?.empresa_id ? String(row.empresa_id) : null,
            empresa: row?.empresa ? String(row.empresa) : null,
            nombre: row?.nombre ? String(row.nombre) : null,
            valor_estimado: row?.valor_estimado == null ? 0 : Number(row.valor_estimado),
            probabilidad: row?.probabilidad == null ? null : Number(row.probabilidad),
            forecast_close_date: row?.forecast_close_date ? String(row.forecast_close_date) : null,
            negotiation_started_at: row?.negotiation_started_at ? String(row.negotiation_started_at) : null,
            aging_days: row?.aging_days == null ? 0 : Number(row.aging_days),
            pending_tasks_count: row?.pending_tasks_count == null ? 0 : Number(row.pending_tasks_count),
            overdue_tasks_count: row?.overdue_tasks_count == null ? 0 : Number(row.overdue_tasks_count),
            has_open_tasks: !!row?.has_open_tasks,
            next_meeting_at: row?.next_meeting_at ? String(row.next_meeting_at) : null,
            has_future_meeting: !!row?.has_future_meeting,
            last_activity_at: row?.last_activity_at ? String(row.last_activity_at) : null,
            days_since_last_activity: row?.days_since_last_activity == null ? null : Number(row.days_since_last_activity),
            is_stalled: !!row?.is_stalled,
            industria: row?.industria ? String(row.industria) : null,
            tamano_empresa: row?.tamano_empresa == null ? null : Number(row.tamano_empresa)
        })) as NegotiationAgingRow[]

        setAgingRows(rows.filter((row) => Number.isFinite(row.lead_id)))
        setAgingLoading(false)
    }

    const refreshLeadsAndAging = async () => {
        await Promise.all([fetchLeads(), fetchNegotiationAging()])
    }

    const fetchCompaniesList = async () => {
        const { data, error } = await supabase
            .from('empresas')
            .select('*')
            .order('nombre', { ascending: true })

        if (!error && data) {
            setCompaniesList(data as any)
        }
    }

    const fetchUser = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        setCurrentUser(user)
    }

    useEffect(() => {
        refreshLeadsAndAging()
        fetchCompaniesList()
        fetchUser()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

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

        if (deleteError) {
            throw deleteError
        }

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

        if (rows.length === 0) return

        const { error: upsertError } = await ((supabase.from('empresa_proyecto_asignaciones') as any))
            .upsert(rows, { onConflict: 'empresa_id,proyecto_id,assignment_stage' })

        if (upsertError) {
            throw upsertError
        }

        // Auto-register implemented industries for the project based on the company's industries
        // once the project is marked as implemented_real.
        if (implementedReal.length > 0) {
            const [{ data: companyRow }, { data: companyIndustryRows }] = await Promise.all([
                (supabase.from('empresas') as any)
                    .select('industria_id')
                    .eq('id', empresaId)
                    .maybeSingle(),
                (supabase.from('company_industries') as any)
                    .select('industria_id')
                    .eq('empresa_id', empresaId)
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
                if (relationSyncError) {
                    console.warn('Project->industry implemented sync failed:', relationSyncError)
                }
            }
        }
    }

    const handleSaveLead = async (leadData: ReturnType<typeof normalizeLead> & { empresa_id?: string }) => {
        if (!currentUser) {
            alert('No se pudo identificar al usuario actual.')
            return
        }

        const finalEmpresaId = leadData.empresa_id || (modalMode === 'edit' ? currentLead?.empresa_id : undefined)
        let finalEmpresaName = leadData.empresa
        if (finalEmpresaId) {
            const officialCompany = companiesList.find(c => c.id === finalEmpresaId)
            if (officialCompany) finalEmpresaName = officialCompany.nombre
        }

        if (modalMode === 'create') {
            const isWon = isWonStage(leadData.etapa)
            const isLost = isLostStage(leadData.etapa)
            const realClosureValue = isWon
                ? (leadData.valor_real_cierre ?? leadData.valor_estimado ?? 0)
                : null
            const realImplementationValue = isWon
                ? ((leadData as any).valor_implementacion_real_cierre ?? (leadData as any).valor_implementacion_estimado ?? 0)
                : null
            const safeCreateStage = isWon ? 'Negociación' : leadData.etapa
            const payload: any = {
                empresa: finalEmpresaName,
                nombre: leadData.nombre,
                email: leadData.email,
                telefono: leadData.telefono,
                etapa: safeCreateStage,
                valor_estimado: leadData.valor_estimado,
                valor_real_cierre: isWon ? null : realClosureValue,
                valor_implementacion_estimado: (leadData as any).valor_implementacion_estimado ?? 0,
                valor_implementacion_real_cierre: isWon ? null : realImplementationValue,
                forecast_close_date: leadData.forecast_close_date || null,
                oportunidad: leadData.oportunidad,
                calificacion: leadData.calificacion,
                notas: leadData.notas,
                probabilidad: leadData.probabilidad,
                owner_id: currentUser.id,
                owner_username: currentUser.user_metadata?.username || currentUser.email?.split('@')[0] || 'Unknown',
                empresa_id: finalEmpresaId as string,
                loss_reason_id: isLost ? ((leadData as any).loss_reason_id || null) : ((leadData as any).loss_reason_id || null),
                loss_subreason_id: isLost ? ((leadData as any).loss_subreason_id || null) : ((leadData as any).loss_subreason_id || null),
                loss_notes: isLost ? ((leadData as any).loss_notes || null) : ((leadData as any).loss_notes || null)
            }
            if (isLostStage(leadData.etapa) || isWon) {
                payload.closed_at_real = toIsoFromDateOnly((leadData as any).closed_at_real) || null
            }
            if (isLost) {
                payload.loss_recorded_at = (leadData as any).loss_recorded_at || new Date().toISOString()
                payload.loss_recorded_by = (leadData as any).loss_recorded_by || currentUser.id
            }

            const { data, error } = await (supabase
                .from('clientes') as any)
                .insert([payload])
                .select()

            if (error) {
                console.error('Error creating lead:', error)
                alert('Error al crear el lead: ' + parseSupabaseError(error, 'No se pudo crear el lead.'))
            } else if (data && data[0]) {
                const newId = data[0].id

                if (isWon) {
                    const wonUpdatePayload: any = {
                        etapa: 'Cerrado Ganado',
                        valor_estimado: leadData.valor_estimado,
                        valor_real_cierre: realClosureValue,
                        valor_implementacion_estimado: (leadData as any).valor_implementacion_estimado ?? 0,
                        valor_implementacion_real_cierre: realImplementationValue,
                        closed_at_real: toIsoFromDateOnly((leadData as any).closed_at_real) || new Date().toISOString()
                    }

                    const { error: wonUpdateError } = await (supabase
                        .from('clientes') as any)
                        .update(wonUpdatePayload)
                        .eq('id', newId)

                    if (wonUpdateError) {
                        console.error('Error promoting created lead to Cerrado Ganado:', wonUpdateError)
                        await (supabase.from('clientes') as any).delete().eq('id', newId)
                        alert('Error al crear el lead cerrado: ' + parseSupabaseError(wonUpdateError, 'No se pudo finalizar el cierre en creación.'))
                        return
                    }

                    // Force immediate badge recompute (industry + special badges like company_size).
                    try {
                        await (supabase.rpc as any)('refresh_seller_badges_for_lead', { p_lead_id: newId })
                    } catch (badgeError) {
                        console.warn('Lead created as won but badge recompute failed:', badgeError)
                    }
                }

                // Track Event: lead_created
                const { trackEvent } = await import('@/app/actions/events')
                trackEvent({
                    eventType: 'lead_created',
                    entityType: 'lead',
                    entityId: newId,
                    metadata: { etapa: leadData.etapa, valor: leadData.valor_estimado }
                })

                // Initial history entry
                await (supabase.from('lead_history') as any).insert([
                    { lead_id: newId, field_name: 'etapa', new_value: leadData.etapa, changed_by: currentUser.id },
                    { lead_id: newId, field_name: 'probabilidad', new_value: String(leadData.probabilidad), changed_by: currentUser.id },
                    ...(leadData.forecast_close_date ? [{ lead_id: newId, field_name: 'forecast_close_date', new_value: String(leadData.forecast_close_date), changed_by: currentUser.id }] : [])
                ])

                try {
                    await syncCompanyProjectAssignmentsFromLead({
                        empresaId: finalEmpresaId as string,
                        leadId: newId,
                        inNegotiationProjectIds: (leadData as any).proyectos_pronosticados_ids || [],
                        prospectionSameCloseProjectIds: (leadData as any).proyectos_prospeccion_mismo_cierre_ids || [],
                        futureLeadOpportunityProjectIds: (leadData as any).proyectos_futuro_lead_ids || [],
                        implementedRealProjectIds: (leadData as any).proyectos_implementados_reales_ids || [],
                        implementedRealProjectValues: (leadData as any).proyectos_implementados_reales_valores || {},
                        assignedByUserId: currentUser.id
                    })
                } catch (projectSyncError) {
                    console.warn('Lead created but project assignments sync failed:', projectSyncError)
                }
            }
        } else if (modalMode === 'edit' && currentLead) {
            // Check for changes to log
            const historyEntries: any[] = []
            const stageChanged = leadData.etapa !== currentLead.etapa
            const probChanged = leadData.probabilidad !== (currentLead as any).probabilidad
            const forecastCloseDateChanged = (leadData.forecast_close_date || null) !== ((currentLead as any).forecast_close_date || null)

            if (stageChanged) {
                historyEntries.push({ lead_id: currentLead.id, field_name: 'etapa', old_value: currentLead.etapa, new_value: leadData.etapa, changed_by: currentUser.id })
            }
            if (probChanged) {
                historyEntries.push({ lead_id: currentLead.id, field_name: 'probabilidad', old_value: String((currentLead as any).probabilidad), new_value: String(leadData.probabilidad), changed_by: currentUser.id })
            }
            if (forecastCloseDateChanged) {
                historyEntries.push({
                    lead_id: currentLead.id,
                    field_name: 'forecast_close_date',
                    old_value: (currentLead as any).forecast_close_date ? String((currentLead as any).forecast_close_date) : null,
                    new_value: leadData.forecast_close_date ? String(leadData.forecast_close_date) : null,
                    changed_by: currentUser.id
                })
            }

            const isWon = isWonStage(leadData.etapa)
            const isLost = isLostStage(leadData.etapa)
            const realClosureValue = isWon
                ? (leadData.valor_real_cierre ?? leadData.valor_estimado ?? 0)
                : null
            const realImplementationValue = isWon
                ? ((leadData as any).valor_implementacion_real_cierre ?? (leadData as any).valor_implementacion_estimado ?? 0)
                : null
            const payload: any = {
                empresa: finalEmpresaName,
                nombre: leadData.nombre,
                email: leadData.email,
                telefono: leadData.telefono,
                etapa: leadData.etapa,
                valor_estimado: leadData.valor_estimado,
                valor_real_cierre: realClosureValue,
                valor_implementacion_estimado: (leadData as any).valor_implementacion_estimado ?? 0,
                valor_implementacion_real_cierre: realImplementationValue,
                forecast_close_date: leadData.forecast_close_date || null,
                oportunidad: leadData.oportunidad,
                calificacion: leadData.calificacion,
                notas: leadData.notas,
                probabilidad: leadData.probabilidad,
                empresa_id: finalEmpresaId as string,
                // Preserve original owner on edits; editor and owner are different concepts.
                owner_id: currentLead.owner_id || null,
                owner_username: currentLead.owner_username || null,
                loss_reason_id: (leadData as any).loss_reason_id || null,
                loss_subreason_id: (leadData as any).loss_subreason_id || null,
                loss_notes: ((leadData as any).loss_notes || '').trim() || null
            }

            if (isWon) {
                payload.closed_at_real = toIsoFromDateOnly((leadData as any).closed_at_real) ||
                    (isWonStage(currentLead.etapa)
                        ? ((currentLead as any).closed_at_real || null)
                        : new Date().toISOString())
            } else {
                payload.closed_at_real = isLostStage(leadData.etapa)
                    ? (toIsoFromDateOnly((leadData as any).closed_at_real) || null)
                    : null
            }

            if (isLost) {
                payload.loss_recorded_at = (leadData as any).loss_recorded_at
                    || ((currentLead as any).loss_recorded_at ?? null)
                    || new Date().toISOString()
                payload.loss_recorded_by = (leadData as any).loss_recorded_by
                    || ((currentLead as any).loss_recorded_by ?? null)
                    || currentUser.id
            }

            // SCORING LOGIC
            const isClosedNow = isWonStage(leadData.etapa) || isLostStage(leadData.etapa)
            const wasClosedBefore = isWonStage(currentLead.etapa) || isLostStage(currentLead.etapa)

            if (isClosedNow) {
                const y = isWonStage(leadData.etapa) ? 1 : 0
                const pValue = leadData.probabilidad !== undefined ? leadData.probabilidad : ((currentLead as any).probabilidad || 50)
                const p = pValue / 100

                // Recalculate if it's new closure OR if data changed on an old closure
                const dataChanged = leadData.probabilidad !== (currentLead as any).probabilidad || leadData.etapa !== currentLead.etapa

                if (!wasClosedBefore || dataChanged) {
                    payload.forecast_evaluated_probability = pValue
                    payload.forecast_outcome = y
                    payload.forecast_scored_at = new Date().toISOString()
                    // Clear old logloss to force recalculation via new formula if needed
                    payload.forecast_logloss = null
                }
            }

            const { error } = await (supabase
                .from('clientes') as any)
                .update(payload)
                .eq('id', currentLead.id)

            if (error) {
                alert(`Error al actualizar el lead: ${error.message} ${error.details || ''}`)
            } else {
                const wasWonBefore = isWonStage(currentLead.etapa)
                const isWonNow = isWonStage(leadData.etapa)
                const ownerId = String(currentLead.owner_id || currentUser.id || '')

                // Keep size/special badges fully synced to lead outcome changes.
                if (isWonNow) {
                    try {
                        await (supabase.rpc as any)('refresh_seller_badges_for_lead', { p_lead_id: currentLead.id })
                    } catch (badgeError) {
                        console.warn('Won lead updated but badge recompute failed:', badgeError)
                    }
                } else if (wasWonBefore && ownerId) {
                    try {
                        await (supabase.rpc as any)('recompute_seller_special_badges', {
                            p_seller_id: ownerId,
                            p_source_lead_id: currentLead.id
                        })
                    } catch (badgeError) {
                        console.warn('Lead moved out of won stage but special badge recompute failed:', badgeError)
                    }
                }

                const { trackEvent } = await import('@/app/actions/events')
                // Track Event: lead_stage_change
                if (stageChanged) {
                    trackEvent({
                        eventType: 'lead_stage_change',
                        entityType: 'lead',
                        entityId: currentLead.id,
                        metadata: { oldStage: currentLead.etapa, newStage: leadData.etapa }
                    })
                    if (isClosedNow) {
                        trackEvent({
                            eventType: 'lead_closed',
                            entityType: 'lead',
                            entityId: currentLead.id,
                            metadata: { outcome: leadData.etapa, value: realClosureValue ?? leadData.valor_estimado }
                        })
                    }
                } else if (probChanged) {
                    trackEvent({
                        eventType: 'forecast_registered',
                        entityType: 'lead',
                        entityId: currentLead.id,
                        metadata: { probability: leadData.probabilidad, etapa: leadData.etapa }
                    })
                }

                if (historyEntries.length > 0) {
                    await (supabase.from('lead_history') as any).insert(historyEntries)
                }

                try {
                    await syncCompanyProjectAssignmentsFromLead({
                        empresaId: finalEmpresaId as string,
                        leadId: currentLead.id,
                        inNegotiationProjectIds: (leadData as any).proyectos_pronosticados_ids || [],
                        prospectionSameCloseProjectIds: (leadData as any).proyectos_prospeccion_mismo_cierre_ids || [],
                        futureLeadOpportunityProjectIds: (leadData as any).proyectos_futuro_lead_ids || [],
                        implementedRealProjectIds: (leadData as any).proyectos_implementados_reales_ids || [],
                        implementedRealProjectValues: (leadData as any).proyectos_implementados_reales_valores || {},
                        assignedByUserId: currentUser.id
                    })
                } catch (projectSyncError) {
                    console.warn('Lead updated but project assignments sync failed:', projectSyncError)
                }
            }
        }

        setIsModalOpen(false)
        await refreshLeadsAndAging()
    }


    const handleRowClick = (lead: Lead) => {
        setSelectedLead(lead)
        setIsDetailViewOpen(true)
        if (typeof window !== 'undefined') {
            window.history.pushState({ ahOverlay: 'lead-detail' }, '')
        }
    }

    const handleCloseDetailView = () => {
        if (typeof window !== 'undefined' && window.history.state?.ahOverlay === 'lead-detail') {
            window.history.replaceState(null, '')
        }
        setIsDetailViewOpen(false)
        setSelectedLead(null)
    }

    const handleEditLeadFromDetail = (lead: Lead) => {
        setIsDetailViewOpen(false)
        openEditModal(lead)
    }

    const handleEditCompanyFromDetail = () => {
        setIsDetailViewOpen(false)
        router.push('/empresas')
    }

    const handleDeleteClick = (id: number) => {
        setClientToDelete(id)
        setIsDeleteModalOpen(true)
        // Ensure detail view is closed if we delete
        setIsDetailViewOpen(false)
    }

    const confirmDelete = async () => {
        if (!clientToDelete) return
        const leadId = clientToDelete
        const leadToDelete = leads.find((lead) => lead.id === leadId)
        const shouldRecomputeBadges = isWonStage(leadToDelete?.etapa) && !!leadToDelete?.owner_id
        const ownerId = String(leadToDelete?.owner_id || '')
        const companyId = String(leadToDelete?.empresa_id || '')

        const { error } = await (supabase
            .from('clientes') as any)
            .delete()
            .eq('id', leadId)

        if (error) {
            console.error('Error deleting lead:', {
                code: (error as any)?.code,
                message: (error as any)?.message,
                details: (error as any)?.details,
                hint: (error as any)?.hint,
                raw: error
            })
            alert(`Error al eliminar el lead: ${parseSupabaseError(error, 'Operación bloqueada por dependencias o permisos.')}`)
        } else {
            if (shouldRecomputeBadges && ownerId) {
                try {
                    const industryIds = new Set<string>()

                    if (companyId) {
                        const [{ data: companyRow }, { data: companyIndustryRows }] = await Promise.all([
                            (supabase
                                .from('empresas') as any)
                                .select('industria_id')
                                .eq('id', companyId)
                                .maybeSingle(),
                            (supabase
                                .from('company_industries') as any)
                                .select('industria_id')
                                .eq('empresa_id', companyId)
                        ])

                        const primaryIndustryId = String((companyRow as any)?.industria_id || '')
                        if (primaryIndustryId) industryIds.add(primaryIndustryId)
                        for (const row of (companyIndustryRows || [])) {
                            const industriaId = String((row as any)?.industria_id || '')
                            if (industriaId) industryIds.add(industriaId)
                        }
                    }

                    await Promise.all([
                        ...Array.from(industryIds).map(async (industriaId) => {
                            await (supabase.rpc as any)('recompute_seller_industry_badge', {
                                p_seller_id: ownerId,
                                p_industria_id: industriaId,
                                p_source_lead_id: leadId
                            })
                        }),
                        (supabase.rpc as any)('recompute_seller_special_badges', {
                            p_seller_id: ownerId,
                            p_source_lead_id: leadId
                        })
                    ])
                } catch (badgeRecomputeError) {
                    console.warn('Lead deleted but badge recomputation failed:', badgeRecomputeError)
                }
            }

            const { trackEvent } = await import('@/app/actions/events')
            await trackEvent({
                eventType: 'lead_deleted',
                entityType: 'lead',
                entityId: leadId,
                metadata: {
                    empresa: leadToDelete?.empresa || null,
                    etapa: leadToDelete?.etapa || null,
                    owner_id: leadToDelete?.owner_id || null
                }
            })

            // Clear selected lead if it's the one being deleted
            if (selectedLead?.id === leadId) {
                setSelectedLead(null)
                setIsDetailViewOpen(false)
            }
            await refreshLeadsAndAging()
        }
        setClientToDelete(null)
        setIsDeleteModalOpen(false)
    }

    const openCreateModal = () => {
        setModalMode('create')
        setCurrentLead(null)
        setIsModalOpen(true)
    }

    const openEditModal = (lead: Lead) => {
        setModalMode('edit')
        setCurrentLead(lead)
        setIsModalOpen(true)
    }

    const handleAgingRowClick = async (row: NegotiationAgingRow) => {
        const existing = leads.find((lead) => Number(lead.id) === Number(row.lead_id))
        if (existing) {
            handleRowClick(existing)
            return
        }
        const { data, error } = await (supabase.from('clientes') as any)
            .select('*')
            .eq('id', row.lead_id)
            .maybeSingle()
        if (error || !data) return
        handleRowClick(data as Lead)
    }

    useEffect(() => {
        const onPopState = () => {
            setIsDetailViewOpen(false)
            setSelectedLead(null)
        }
        window.addEventListener('popstate', onPopState)
        return () => window.removeEventListener('popstate', onPopState)
    }, [])

    return (
        <div className='h-full flex flex-col p-8 overflow-y-auto' style={{ background: 'transparent' }}>
            <div className='max-w-7xl mx-auto space-y-10 w-full'>
                {/* External Header - Page Level */}
                {/* Header Pattern consistent with Empresas */}
                <div className='flex flex-col md:flex-row md:items-center justify-between gap-6'>
                    <div className='flex items-center gap-8'>
                        <div className='flex items-center gap-6'>
                            <div className='ah-icon-card transition-all hover:scale-105'>
                                <Users size={34} strokeWidth={1.9} />
                            </div>
                            <div>
                                <h1 className='text-4xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>
                                    Negociaciones activas
                                </h1>
                                <p className='font-medium' style={{ color: 'var(--text-secondary)' }}>
                                    Pipeline operativo comercial: prospección y negociación. Los cierres se consultan en Empresas Cerradas.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className='flex items-center gap-4 p-2 rounded-2xl shadow-sm border' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                        <button
                            onClick={() => setIsEditingMode(!isEditingMode)}
                            className={`px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border-2 cursor-pointer ${isEditingMode
                                ? 'bg-rose-600 border-rose-600 text-white shadow-none hover:bg-rose-800 hover:scale-105'
                                : 'bg-transparent hover:bg-blue-500/10 hover:border-blue-500 hover:text-blue-500 hover:scale-105 active:scale-95'
                                }`}
                            style={!isEditingMode ? {
                                borderColor: 'var(--card-border)',
                                color: 'var(--text-primary)'
                            } : {}}
                        >
                            <div className='flex items-center gap-2'>
                                {isEditingMode ? (
                                    <span>Terminar Edición</span>
                                ) : (
                                    <>
                                        <span>Editar Vista</span>
                                        <Pencil size={12} strokeWidth={2.5} className="opacity-80" />
                                    </>
                                )}
                            </div>
                        </button>
                        <button
                            onClick={openCreateModal}
                            className='px-8 py-3 bg-[#2048FF] text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:bg-[#1b3de6] hover:scale-105 active:scale-95 transition-all cursor-pointer'
                        >
                            + Nuevo Lead
                        </button>
                    </div>
                </div>

                {/* Main Table Container */}
                <div className='rounded-[40px] shadow-xl border overflow-hidden flex flex-col mb-6' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                    <div className='px-8 py-6 border-b flex flex-col gap-6' style={{ borderColor: 'var(--card-border)' }}>
                        <div className='flex flex-col md:flex-row md:items-center justify-between gap-4'>
                            <div className='flex items-center gap-4'>
                                <div className='ah-icon-card ah-icon-card-sm'>
                                    <ListFilter size={22} strokeWidth={2} />
                                </div>
                                <div>
                                    <h2 className='text-xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>Pipeline activo</h2>
                                    <p className='text-[10px] font-bold uppercase tracking-[0.2em] opacity-60' style={{ color: 'var(--text-secondary)' }}>Prospección + Negociación (con vista segmentada)</p>
                                </div>
                            </div>

                            <div className='flex items-center gap-3'>
                                <div className='ah-count-chip'>
                                    <span className='ah-count-chip-number'>{sortedAndFilteredLeads.length}</span>
                                    <div className='ah-count-chip-meta'>
                                        <span className='ah-count-chip-title'>{pipelineScopeLabel}</span>
                                        <span className='ah-count-chip-subtitle'>Filtrados</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className='flex flex-wrap items-center gap-2'>
                            {[
                                { key: 'active', label: 'Activas' },
                                { key: 'prospection', label: 'Prospección' },
                                { key: 'negotiation', label: 'Negociación' },
                                { key: 'all', label: 'Todas' }
                            ].map((scope) => {
                                const active = pipelineScope === scope.key
                                return (
                                    <button
                                        key={scope.key}
                                        type='button'
                                        onClick={() => setPipelineScope(scope.key as typeof pipelineScope)}
                                        className={[
                                            'px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-[0.15em] transition-all cursor-pointer',
                                            active
                                                ? 'bg-blue-500/12 border-blue-400/35 text-blue-200'
                                                : 'bg-white/5 border-white/10 text-white/65 hover:bg-white/10 hover:border-white/20 hover:text-white/85'
                                        ].join(' ')}
                                    >
                                        {scope.label}
                                    </button>
                                )
                            })}
                            <button
                                type='button'
                                onClick={() => router.push('/cierres')}
                                className='ml-auto px-3 py-1.5 rounded-xl border border-emerald-400/25 bg-emerald-500/10 text-emerald-200 text-[10px] font-black uppercase tracking-[0.15em] hover:bg-emerald-500/15 hover:border-emerald-300/35 transition-all cursor-pointer'
                            >
                                Ver Empresas Cerradas
                            </button>
                        </div>

                        <div className='ah-table-toolbar'>
                            <div className='ah-table-controls'>
                                <div className='ah-search-control'>
                                    <Search className='ah-search-icon' size={18} />
                                    <input
                                        type='text'
                                        placeholder='Buscar por nombre, empresa, correo...'
                                        value={filterSearch}
                                        onChange={(e) => setFilterSearch(e.target.value)}
                                        className='ah-search-input'
                                    />
                                </div>
                                <select
                                    value={filterOwner}
                                    onChange={(e) => setFilterOwner(e.target.value)}
                                    className='ah-select-control'
                                >
                                    <option value="All">Vendedor: Todos</option>
                                    {uniqueOwners.map(owner => (
                                        <option key={owner} value={owner!}>{owner}</option>
                                    ))}
                                </select>
                                <select
                                    value={sortBy}
                                    onChange={(e) => setSortBy(e.target.value)}
                                    className='ah-select-control'
                                >
                                    <option value="fecha_registro-desc">Orden: Reciente</option>
                                    <option value="fecha_registro-asc">Orden: Antiguo</option>
                                    <option value="valor_estimado-desc">Orden: $$$</option>
                                    <option value="calificacion-desc">Orden: Estrellas</option>
                                    <option value="probabilidad-desc">Orden: Prob.</option>
                                </select>
                                {(filterSearch || filterOwner !== 'All' || sortBy !== 'fecha_registro-desc' || pipelineScope !== 'active') && (
                                    <button
                                        onClick={() => {
                                            setFilterSearch('')
                                            setFilterOwner('All')
                                            setSortBy('fecha_registro-desc')
                                            setPipelineScope('active')
                                        }}
                                        className='ah-reset-filter-btn'
                                        title='Limpiar Filtros'
                                    >
                                        <RotateCw size={18} />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className='flex-1 overflow-x-auto custom-scrollbar min-h-[400px]'>
                        {loading && leads.length === 0 ? (
                            <div className='w-full h-96 flex flex-col items-center justify-center gap-4'>
                                <div className='w-12 h-12 border-4 border-[#2048FF] border-t-transparent rounded-full animate-spin' />
                                <p className='text-sm font-bold text-gray-500 animate-pulse uppercase tracking-widest'>Sincronizando Leads...</p>
                            </div>
                        ) : (
                            <ClientsTable
                                clientes={sortedAndFilteredLeads}
                                sellerProfilesById={sellerProfilesById}
                                isEditingMode={isEditingMode}
                                onEdit={openEditModal}
                                onDelete={handleDeleteClick}
                                onRowClick={handleRowClick}
                                onEmailClick={handleEmailClick}
                                userEmail={currentUser?.email || undefined}
                            />
                        )}
                    </div>
                </div>

                <div className='rounded-[32px] shadow-xl border overflow-hidden flex flex-col' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                    <div className='px-8 py-6 border-b flex flex-col gap-5' style={{ borderColor: 'var(--card-border)' }}>
                        <div className='flex flex-col md:flex-row md:items-center justify-between gap-4'>
                            <div className='flex items-center gap-4'>
                                <div className='ah-icon-card ah-icon-card-sm'>
                                    <Clock3 size={22} strokeWidth={2} />
                                </div>
                                <div>
                                    <h2 className='text-xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>Aging de Negociaciones</h2>
                                    <p className='text-[10px] font-bold uppercase tracking-[0.2em] opacity-60' style={{ color: 'var(--text-secondary)' }}>
                                        Días en negociación y leads atorados (regla: 14+ días, 7+ sin actividad, sin junta futura, sin tareas pendientes)
                                    </p>
                                </div>
                            </div>
                            <div className='flex items-center gap-3'>
                                <div className='ah-count-chip'>
                                    <span className='ah-count-chip-number'>{filteredAgingRows.length}</span>
                                    <div className='ah-count-chip-meta'>
                                        <span className='ah-count-chip-title'>Negociaciones</span>
                                        <span className='ah-count-chip-subtitle'>en aging</span>
                                    </div>
                                </div>
                                <div className='ah-count-chip' style={{ borderColor: 'rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.06)' }}>
                                    <span className='ah-count-chip-number' style={{ color: '#fca5a5' }}>{stalledAgingCount}</span>
                                    <div className='ah-count-chip-meta'>
                                        <span className='ah-count-chip-title'>Atorados</span>
                                        <span className='ah-count-chip-subtitle'>detectados</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className='flex flex-wrap items-center gap-2'>
                            <button
                                type='button'
                                onClick={() => setAgingOnlyStalled((v) => !v)}
                                className={[
                                    'px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-[0.15em] transition-all cursor-pointer',
                                    agingOnlyStalled
                                        ? 'bg-rose-500/12 border-rose-400/35 text-rose-200'
                                        : 'bg-white/5 border-white/10 text-white/65 hover:bg-white/10 hover:border-white/20 hover:text-white/85'
                                ].join(' ')}
                            >
                                Solo atorados
                            </button>
                            {['0', '7', '14', '30'].map((days) => {
                                const active = agingMinDays === days
                                return (
                                    <button
                                        key={days}
                                        type='button'
                                        onClick={() => setAgingMinDays(days)}
                                        className={[
                                            'px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-[0.15em] transition-all cursor-pointer',
                                            active
                                                ? 'bg-blue-500/12 border-blue-400/35 text-blue-200'
                                                : 'bg-white/5 border-white/10 text-white/65 hover:bg-white/10 hover:border-white/20 hover:text-white/85'
                                        ].join(' ')}
                                    >
                                        {days === '0' ? 'Todos los días' : `${days}+ días`}
                                    </button>
                                )
                            })}
                            <button
                                type='button'
                                onClick={fetchNegotiationAging}
                                className='ml-auto px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 text-white/75 text-[10px] font-black uppercase tracking-[0.15em] hover:bg-white/10 hover:border-white/20 transition-all cursor-pointer'
                            >
                                Actualizar Aging
                            </button>
                        </div>

                        {agingError && (
                            <div className='rounded-2xl border px-4 py-3 text-sm flex items-center gap-3' style={{ borderColor: 'rgba(245,158,11,0.25)', background: 'rgba(245,158,11,0.06)', color: 'var(--text-primary)' }}>
                                <TriangleAlert size={16} className='text-amber-300 shrink-0' />
                                <span>{agingError}</span>
                            </div>
                        )}
                    </div>

                    <div className='overflow-x-auto custom-scrollbar'>
                        {agingLoading && agingRows.length === 0 ? (
                            <div className='w-full py-14 flex flex-col items-center justify-center gap-3'>
                                <div className='w-8 h-8 border-4 border-[#2048FF] border-t-transparent rounded-full animate-spin' />
                                <p className='text-xs font-bold uppercase tracking-widest text-white/50'>Calculando aging...</p>
                            </div>
                        ) : filteredAgingRows.length === 0 ? (
                            <div className='w-full py-14 text-center text-sm font-semibold' style={{ color: 'var(--text-secondary)' }}>
                                No hay negociaciones que cumplan los filtros de aging.
                            </div>
                        ) : (
                            <table className='min-w-full'>
                                <thead>
                                    <tr className='border-b' style={{ borderColor: 'var(--card-border)' }}>
                                        {['Vendedor', 'Empresa', 'Lead', 'Aging', 'Última actividad', 'Próx. junta', 'Tareas', 'Valor', 'Estado'].map((label) => (
                                            <th key={label} className='px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.18em]' style={{ color: 'var(--text-secondary)' }}>
                                                {label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredAgingRows.map((row) => {
                                        const lead = leads.find((item) => Number(item.id) === Number(row.lead_id))
                                        const sellerDisplay = row.seller_full_name || row.seller_username || 'Sin asignar'
                                        const agingDays = Number(row.aging_days || 0)
                                        const agingChip = agingDays >= 14
                                            ? 'bg-rose-500/12 border-rose-400/30 text-rose-200'
                                            : agingDays >= 7
                                                ? 'bg-amber-500/12 border-amber-400/30 text-amber-200'
                                                : 'bg-white/5 border-white/10 text-white/80'
                                        const statusChip = row.is_stalled
                                            ? 'bg-rose-500/12 border-rose-400/35 text-rose-200'
                                            : row.has_future_meeting
                                                ? 'bg-emerald-500/12 border-emerald-400/35 text-emerald-200'
                                                : row.has_open_tasks
                                                    ? 'bg-blue-500/12 border-blue-400/35 text-blue-200'
                                                    : 'bg-white/5 border-white/10 text-white/70'
                                        const statusText = row.is_stalled
                                            ? 'Atorado'
                                            : row.has_future_meeting
                                                ? 'Con junta'
                                                : row.has_open_tasks
                                                    ? 'Con tarea'
                                                    : 'Sin siguiente acción'
                                        return (
                                            <tr
                                                key={`aging-${row.lead_id}`}
                                                onClick={() => handleAgingRowClick(row)}
                                                className='border-b transition-colors cursor-pointer hover:bg-white/5'
                                                style={{ borderColor: 'var(--card-border)' }}
                                                title={lead ? 'Abrir detalle del lead' : 'Abrir detalle'}
                                            >
                                                <td className='px-4 py-3 align-top'>
                                                    <div className='text-sm font-bold' style={{ color: 'var(--text-primary)' }}>{sellerDisplay}</div>
                                                    {row.industria && (
                                                        <div className='text-[11px] mt-0.5' style={{ color: 'var(--text-secondary)' }}>{row.industria}</div>
                                                    )}
                                                </td>
                                                <td className='px-4 py-3 align-top text-sm font-bold' style={{ color: 'var(--text-primary)' }}>{row.empresa || '-'}</td>
                                                <td className='px-4 py-3 align-top'>
                                                    <div className='text-sm font-bold' style={{ color: 'var(--text-primary)' }}>{row.nombre || '-'}</div>
                                                    <div className='text-[11px]' style={{ color: 'var(--text-secondary)' }}>
                                                        Prob. {row.probabilidad == null ? '—' : `${row.probabilidad}%`}
                                                    </div>
                                                </td>
                                                <td className='px-4 py-3 align-top'>
                                                    <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-xl border text-xs font-black ${agingChip}`}>
                                                        {agingDays} días
                                                    </div>
                                                    {row.negotiation_started_at && (
                                                        <div className='text-[11px] mt-1' style={{ color: 'var(--text-secondary)' }}>
                                                            Desde {new Date(row.negotiation_started_at).toLocaleDateString('es-MX')}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className='px-4 py-3 align-top text-[12px]' style={{ color: 'var(--text-primary)' }}>
                                                    {row.last_activity_at
                                                        ? (
                                                            <div>
                                                                <div>{new Date(row.last_activity_at).toLocaleDateString('es-MX')}</div>
                                                                <div className='text-[11px]' style={{ color: 'var(--text-secondary)' }}>
                                                                    {row.days_since_last_activity == null ? '—' : `${row.days_since_last_activity} días`}
                                                                </div>
                                                            </div>
                                                        )
                                                        : '—'}
                                                </td>
                                                <td className='px-4 py-3 align-top text-[12px]' style={{ color: 'var(--text-primary)' }}>
                                                    {row.next_meeting_at
                                                        ? (
                                                            <div>
                                                                <div>{new Date(row.next_meeting_at).toLocaleDateString('es-MX')}</div>
                                                                <div className='text-[11px]' style={{ color: 'var(--text-secondary)' }}>
                                                                    {new Date(row.next_meeting_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                                                                </div>
                                                            </div>
                                                        )
                                                        : '—'}
                                                </td>
                                                <td className='px-4 py-3 align-top'>
                                                    <div className='text-sm font-bold' style={{ color: 'var(--text-primary)' }}>
                                                        {row.pending_tasks_count}
                                                    </div>
                                                    <div className='text-[11px]' style={{ color: row.overdue_tasks_count > 0 ? '#fca5a5' : 'var(--text-secondary)' }}>
                                                        {row.overdue_tasks_count > 0 ? `${row.overdue_tasks_count} atrasada(s)` : 'sin atraso'}
                                                    </div>
                                                </td>
                                                <td className='px-4 py-3 align-top text-sm font-black' style={{ color: '#dbeafe' }}>
                                                    {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(row.valor_estimado || 0))}
                                                </td>
                                                <td className='px-4 py-3 align-top'>
                                                    <span className={`inline-flex items-center px-2.5 py-1 rounded-xl border text-[10px] font-black uppercase tracking-[0.14em] ${statusChip}`}>
                                                        {statusText}
                                                    </span>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>

            <RichardDawkinsFooter />


            {/* Modal */}
            <ClientModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={(data) => handleSaveLead(data as any)}
                initialData={memoizedInitialLead}
                mode={modalMode}
                onNavigateToCompanies={() => router.push('/empresas')}
                companies={companiesList}
            />


            {/* Detail View */}
            <ClientDetailView
                client={selectedLead as any}
                isOpen={isDetailViewOpen}
                onClose={handleCloseDetailView}
                onEditClient={(lead) => handleEditLeadFromDetail(lead as any)}
                onEditCompany={handleEditCompanyFromDetail}
                onEmailClick={handleEmailClick}
                userEmail={currentUser?.email || undefined}
            />

            {/* Delete Confirmation Modal */}
            <ConfirmModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title="Eliminar Lead"
                message="¿Estás seguro de que deseas eliminar este lead? Esta acción no se puede deshacer."
                isDestructive={true}
            />

        </div >
    )
}
