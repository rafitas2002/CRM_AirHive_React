'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { createCompanyFromPreLead } from '@/lib/companyHelpers'
import PreLeadsTable from '@/components/PreLeadsTable'
import PreLeadModal from '@/components/PreLeadModal'
import PreLeadDetailView from '@/components/PreLeadDetailView'
import ClientModal from '@/components/ClientModal'
import ConfirmModal from '@/components/ConfirmModal'
import { Search, Target, Pencil, RotateCw, Filter, ListFilter, ArrowUpDown, Building2 } from 'lucide-react'
import RichardDawkinsFooter from '@/components/RichardDawkinsFooter'
import { useAuth } from '@/lib/auth'
import { getLocationFilterFacet, getLocationFilterFacetFromStructured, normalizeLocationDuplicateKey, normalizeLocationFilterKey, sortMonterreyMunicipalityLabels } from '@/lib/locationUtils'

export default function PreLeadsPage() {
    const auth = useAuth()
    const router = useRouter()
    const [supabase] = useState(() => createClient())
    const [preLeads, setPreLeads] = useState<any[]>([])
    const [sellerProfilesById, setSellerProfilesById] = useState<Record<string, { fullName?: string | null; avatarUrl?: string | null }>>({})
    const [loading, setLoading] = useState(true)

    // Modals Suspect
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
    const [currentPreLead, setCurrentPreLead] = useState<any>(null)
    const [isEditingMode, setIsEditingMode] = useState(false)
    const [isDetailViewOpen, setIsDetailViewOpen] = useState(false)
    const [selectedPreLead, setSelectedPreLead] = useState<any>(null)
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
    const [deleteId, setDeleteId] = useState<number | null>(null)

    // Modals Conversion (Leads)
    const [isClientModalOpen, setIsClientModalOpen] = useState(false)
    const [clientModalMode, setClientModalMode] = useState<'create' | 'edit' | 'convert'>('create')
    const [clientInitialData, setClientInitialData] = useState<any>(null)
    const [sourcePreLead, setSourcePreLead] = useState<any>(null)
    const [companies, setCompanies] = useState<any[]>([])

    // Filters & Sorting
    const [search, setSearch] = useState('')
    const [vendedorFilter, setVendedorFilter] = useState('All')
    const [industryFilter, setIndustryFilter] = useState('All')
    const [locationFilter, setLocationFilter] = useState('All')
    const [monterreyMunicipalityFilter, setMonterreyMunicipalityFilter] = useState('All')
    const [sortBy, setSortBy] = useState('recent')

    // Email Composer State
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false)
    const [emailRecipient, setEmailRecipient] = useState({ email: '', name: '' })
    const [connectedGoogleEmail, setConnectedGoogleEmail] = useState<string | null>(null)
    const [isCalendarConnected, setIsCalendarConnected] = useState(false)
    const [preLeadColumns, setPreLeadColumns] = useState<Record<string, boolean>>({
        industria_id: true,
        tamano: true,
        tamano_fuente: true,
        tamano_confianza: true,
        tamano_senal_principal: true,
        website: true,
        logo_url: true,
        empresa_id: true,
        created_by: true,
        updated_by: true
    })
    const [leadColumns, setLeadColumns] = useState<Record<string, boolean>>({
        created_by: true
    })

    const emitTrackingEvent = async (payload: {
        eventType: 'pre_lead_created' | 'pre_lead_updated' | 'pre_lead_converted' | 'pre_lead_deleted' | 'lead_created' | 'company_created' | 'company_updated'
        entityType: 'pre_lead' | 'lead' | 'company'
        entityId?: string | number
        metadata?: Record<string, any>
    }) => {
        try {
            const { trackEvent } = await import('@/app/actions/events')
            await trackEvent(payload as any)
        } catch (trackError) {
            console.error('[PreLeads] Tracking error (non-blocking):', trackError)
        }
    }

    const detectPreLeadColumns = async () => {
        const candidates = [
            'industria_id',
            'tamano',
            'tamano_fuente',
            'tamano_confianza',
            'tamano_senal_principal',
            'website',
            'logo_url',
            'empresa_id',
            'created_by',
            'updated_by'
        ]
        const result: Record<string, boolean> = {}

        for (const column of candidates) {
            const { error } = await (supabase.from('pre_leads') as any).select(column).limit(1)
            const missing = error && (error.code === '42703' || String(error.message || '').toLowerCase().includes(`'${column}'`))
            result[column] = !missing
        }

        setPreLeadColumns(result)
    }

    const detectLeadColumns = async () => {
        const { error } = await (supabase.from('clientes') as any).select('created_by').limit(1)
        const missing = error && (error.code === '42703' || String(error.message || '').toLowerCase().includes(`'created_by'`))
        setLeadColumns({ created_by: !missing })
    }

    const promoteCompanyToLeadStage = async (companyId?: string) => {
        if (!companyId || !auth.user?.id) return
        const updatePayload = {
            lifecycle_stage: 'lead',
            source_channel: 'lead',
            updated_by: auth.user.id,
            first_lead_at: new Date().toISOString(),
            last_lead_at: new Date().toISOString()
        }

        // Try rich payload first; silently fallback if columns don't exist yet.
        const richAttempt = await (supabase.from('empresas') as any).update(updatePayload).eq('id', companyId)
        if (!richAttempt.error) return

        // No reassignment fallback: changing owner_id here can incorrectly move company ownership
        // to the admin/editor who is converting or editing records.
        console.warn('[PreLeads] Could not update company lead stage metadata (legacy schema fallback skipped to preserve owner):', richAttempt.error?.message)
    }

    const fetchPreLeads = async () => {
        const isInitial = preLeads.length === 0
        if (isInitial) setLoading(true)
        try {
            const { data, error } = await (supabase
                .from('pre_leads') as any)
                .select('*')
                .order('created_at', { ascending: false })

            if (error) throw error
            const rows = (data || []) as any[]
            setPreLeads(rows)

            const sellerIds = Array.from(new Set(
                rows.map((row) => String(row?.vendedor_id || '')).filter(Boolean)
            ))

            if (sellerIds.length > 0) {
                const { data: profileRows } = await (supabase.from('profiles') as any)
                    .select('id, full_name, avatar_url')
                    .in('id', sellerIds)

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
        } catch (error) {
            console.error('Error fetching suspects:', error)
        } finally {
            if (isInitial) setLoading(false)
        }
    }

    useEffect(() => {
        if (!auth.loading && auth.loggedIn) {
            fetchPreLeads()
            fetchCompanies()
            checkCalendarConnection()
            detectPreLeadColumns()
            detectLeadColumns()
        }
    }, [auth.loading, auth.loggedIn])

    const fetchCompanies = async () => {
        const { data, error } = await supabase.from('empresas').select('id, nombre')
        if (!error && data) setCompanies(data)
    }

    const checkCalendarConnection = async () => {
        if (!auth.user) return
        const { data } = await (supabase
            .from('google_integrations') as any)
            .select('email')
            .eq('user_id', auth.user.id)
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

    const handleSave = async (data: any) => {
        try {
            if (!auth.user?.id) {
                throw new Error('Sesión inválida. Vuelve a iniciar sesión.')
            }

            // Step 1: Create company for each new suspect to keep full funnel traceability.
            let companyResult: { id: string, nombre: string } | null = null
            if (modalMode === 'create') {
                companyResult = await createCompanyFromPreLead(
                    supabase,
                    {
                        nombre_empresa: data.nombre_empresa,
                        telefonos: data.telefonos,
                        correos: data.correos,
                        ubicacion: data.ubicacion,
                        notas: data.notas,
                        industria: data.industria,
                        industria_id: data.industria_id,
                        tamano: data.tamano,
                        tamano_fuente: data.tamano_fuente,
                        tamano_confianza: data.tamano_confianza,
                        tamano_senal_principal: data.tamano_senal_principal,
                        website: data.website,
                        logo_url: data.logo_url
                    },
                    auth.user.id
                )
                if (!companyResult) throw new Error('No se pudo crear la empresa para este suspect')

                void emitTrackingEvent({
                    eventType: 'company_created',
                    entityType: 'company',
                    entityId: companyResult.id,
                    metadata: {
                        source: 'pre_lead',
                        created_by: auth.user.id,
                        created_at: new Date().toISOString(),
                        company_name: companyResult.nombre
                    }
                })
            } else if (currentPreLead?.empresa_id) {
                companyResult = { id: currentPreLead.empresa_id, nombre: currentPreLead.nombre_empresa }
            } else {
                companyResult = await createCompanyFromPreLead(
                    supabase,
                    {
                        nombre_empresa: data.nombre_empresa,
                        telefonos: data.telefonos,
                        correos: data.correos,
                        ubicacion: data.ubicacion,
                        notas: data.notas,
                        industria: data.industria,
                        industria_id: data.industria_id,
                        tamano: data.tamano,
                        tamano_fuente: data.tamano_fuente,
                        tamano_confianza: data.tamano_confianza,
                        tamano_senal_principal: data.tamano_senal_principal,
                        website: data.website,
                        logo_url: data.logo_url
                    },
                    auth.user.id
                )
                if (!companyResult) throw new Error('No se pudo crear la empresa para este suspect')
            }

            // Step 2: Save suspect with empresa_id
            const table = supabase.from('pre_leads') as any
            const shouldPreserveOriginalSeller = modalMode === 'edit' && !!currentPreLead
            const preservedSellerId = shouldPreserveOriginalSeller
                ? (currentPreLead?.vendedor_id || null)
                : (auth.user?.id || null)
            const preservedSellerName = shouldPreserveOriginalSeller
                ? (currentPreLead?.vendedor_name || null)
                : (auth.profile?.full_name || auth.username || null)
            const preLeadData: Record<string, any> = {
                nombre_empresa: data.nombre_empresa,
                nombre_contacto: data.nombre_contacto,
                correos: data.correos,
                telefonos: data.telefonos,
                ubicacion: data.ubicacion,
                notas: data.notas,
                giro_empresa: data.industria || data.giro_empresa || 'Sin clasificar',
                vendedor_id: preservedSellerId,
                vendedor_name: preservedSellerName,
                empresa_id: companyResult.id
            }
            if (preLeadColumns.industria_id) preLeadData.industria_id = data.industria_id || null
            if (preLeadColumns.tamano) preLeadData.tamano = data.tamano || 1
            if (preLeadColumns.tamano_fuente) preLeadData.tamano_fuente = data.tamano_fuente || null
            if (preLeadColumns.tamano_confianza) preLeadData.tamano_confianza = data.tamano_confianza || null
            if (preLeadColumns.tamano_senal_principal) preLeadData.tamano_senal_principal = data.tamano_senal_principal || null
            if (preLeadColumns.website) preLeadData.website = data.website || null
            if (preLeadColumns.logo_url) preLeadData.logo_url = data.logo_url || null
            if (!preLeadColumns.empresa_id) delete preLeadData.empresa_id
            if (preLeadColumns.created_by && modalMode === 'create') preLeadData.created_by = auth.user.id
            if (preLeadColumns.updated_by) preLeadData.updated_by = auth.user.id

            if (modalMode === 'create') {
                const { data: createdPreLead, error } = await table.insert(preLeadData).select('id').single()
                if (error) throw error

                void emitTrackingEvent({
                    eventType: 'pre_lead_created',
                    entityType: 'pre_lead',
                    entityId: createdPreLead?.id,
                    metadata: {
                        industria_id: preLeadData.industria_id || null,
                        tamano: preLeadData.tamano || null,
                        tamano_fuente: preLeadData.tamano_fuente || null,
                        tamano_confianza: preLeadData.tamano_confianza || null,
                        empresa_id: preLeadData.empresa_id || null,
                        created_by: auth.user.id,
                        created_at: new Date().toISOString()
                    }
                })

                alert(`✅ Suspect creado exitosamente.\n🏢 Empresa registrada: "${companyResult.nombre}".`)
            } else {
                const { error } = await table
                    .update(preLeadData)
                    .eq('id', currentPreLead.id)
                if (error) throw error

                void emitTrackingEvent({
                    eventType: 'pre_lead_updated',
                    entityType: 'pre_lead',
                    entityId: currentPreLead.id,
                    metadata: {
                        industria_id: preLeadData.industria_id || null,
                        tamano: preLeadData.tamano || null,
                        tamano_fuente: preLeadData.tamano_fuente || null,
                        tamano_confianza: preLeadData.tamano_confianza || null,
                        empresa_id: preLeadData.empresa_id || null,
                        updated_by: auth.user.id,
                        updated_at: new Date().toISOString()
                    }
                })
                alert('✅ Suspect actualizado exitosamente.')
            }

            setIsModalOpen(false)
            fetchPreLeads()
        } catch (error: any) {
            console.error('Error in handleSave Suspect [Full Object]:', error)
            console.error('Error Message:', error.message)
            console.error('Error Code:', error.code)
            console.error('Error Details:', error.details)
            alert('Error al guardar: ' + (error.message || 'Error desconocido'))
        } finally {
            // Any cleanup or final actions can go here if needed
        }
    }

    const handlePromote = (pl: any) => {
        setIsDetailViewOpen(false)
        setSourcePreLead(pl)

        // Mappear Suspect a Lead structure with empresa_id
        const initialLeadData = {
            empresa: pl.nombre_empresa,
            empresa_id: pl.empresa_id || undefined, // Fallback to undefined if missing
            nombre: pl.nombre_contacto || '',
            email: pl.correos?.[0] || '',
            telefono: pl.telefonos?.[0] || '',
            notas: pl.notas || '',
            etapa: 'Negociación',
            valor_estimado: 0,
            probabilidad: 50,
            calificacion: 3
        }

        setClientInitialData(initialLeadData)
        setClientModalMode('convert')
        setIsClientModalOpen(true)
    }

    const handleSaveClient = async (data: any) => {
        try {
            if (!auth.user?.id) {
                throw new Error('Sesión inválida. Vuelve a iniciar sesión.')
            }
            const normalizedStage = String(data?.etapa || '').trim().toLowerCase()
            const isWon = normalizedStage === 'cerrado ganado' || normalizedStage === 'cerrada ganada'
            if (isWon && (!Array.isArray(data?.proyectos_implementados_reales_ids) || data.proyectos_implementados_reales_ids.length === 0)) {
                throw new Error('Para guardar un cierre ganado debes asignar al menos 1 proyecto implementado real.')
            }

            // 1. Insert lead in 'clientes' with traceability
            const traceability = clientModalMode === 'convert' ? {
                original_pre_lead_id: sourcePreLead.id,
                original_vendedor_id: sourcePreLead.vendedor_id,
                converted_at: new Date().toISOString(),
                converted_by: auth.user?.id
            } : {}

            const leadInsertPayload: Record<string, any> = {
                ...data,
                owner_id: clientModalMode === 'convert' ? (sourcePreLead?.vendedor_id || auth.user?.id) : auth.user?.id,
                owner_username: clientModalMode === 'convert'
                    ? (sourcePreLead?.vendedor_name || auth.profile?.full_name || auth.username)
                    : (auth.profile?.full_name || auth.username),
                ...traceability
            }
            const prospectRoleCatalogId = data?.prospect_role_catalog_id || null
            leadInsertPayload.prospect_role_catalog_id = prospectRoleCatalogId
            leadInsertPayload.prospect_role_custom = prospectRoleCatalogId
                ? null
                : (String(data?.prospect_role_custom || '').trim() || null)
            leadInsertPayload.prospect_role_exact_title = String(data?.prospect_role_exact_title || '').trim() || null
            const prospectAgeExactRaw = data?.prospect_age_exact
            const prospectAgeExact = prospectAgeExactRaw == null || prospectAgeExactRaw === ''
                ? null
                : Math.round(Number(prospectAgeExactRaw))
            leadInsertPayload.prospect_age_exact = Number.isFinite(prospectAgeExact as number) ? prospectAgeExact : null
            leadInsertPayload.prospect_age_range_id = data?.prospect_age_range_id || null
            leadInsertPayload.prospect_decision_role = data?.prospect_decision_role || null
            leadInsertPayload.prospect_preferred_contact_channel = data?.prospect_preferred_contact_channel || null
            leadInsertPayload.prospect_linkedin_url = String(data?.prospect_linkedin_url || '').trim() || null
            leadInsertPayload.prospect_is_family_member = Boolean(data?.prospect_is_family_member)
            if (leadColumns.created_by) leadInsertPayload.created_by = auth.user.id

            const { data: createdLead, error: insertError } = await (supabase.from('clientes') as any).insert(leadInsertPayload).select('id').single()

            if (insertError) throw insertError

            void emitTrackingEvent({
                eventType: 'lead_created',
                entityType: 'lead',
                entityId: createdLead?.id,
                metadata: {
                    source: clientModalMode === 'convert' ? 'pre_lead_conversion' : 'pre_lead_page',
                    etapa: data.etapa,
                    valor_estimado: data.valor_estimado
                }
            })

            // 2. If conversion, mark the suspect as converted
            if (clientModalMode === 'convert' && sourcePreLead?.id) {
                await (supabase
                    .from('pre_leads') as any)
                    .update({
                        is_converted: true,
                        converted_at: new Date().toISOString(),
                        converted_by: auth.user?.id || null
                    })
                    .eq('id', sourcePreLead.id)

                void emitTrackingEvent({
                    eventType: 'pre_lead_converted',
                    entityType: 'pre_lead',
                    entityId: sourcePreLead.id,
                    metadata: {
                        lead_id: createdLead?.id,
                        previous_vendedor_id: sourcePreLead.vendedor_id
                    }
                })

                await promoteCompanyToLeadStage(sourcePreLead.empresa_id)
                void emitTrackingEvent({
                    eventType: 'company_updated',
                    entityType: 'company',
                    entityId: sourcePreLead.empresa_id,
                    metadata: {
                        source: 'lead_conversion',
                        updated_by: auth.user.id,
                        updated_at: new Date().toISOString()
                    }
                })
            }

            setIsClientModalOpen(false)
            fetchPreLeads()
            alert(clientModalMode === 'convert' ? '🚀 ¡Ascenso exitoso! El prospecto ahora es un Lead.' : 'Lead guardado exitosamente.')
        } catch (error: any) {
            alert('Error al guardar lead: ' + error.message)
        }
    }

    const handleDelete = async () => {
        if (!deleteId) return
        try {
            const deletedPreLead = preLeads.find((pl) => pl.id === deleteId)
            const { error } = await (supabase.from('pre_leads') as any).delete().eq('id', deleteId)
            if (error) throw error
            void emitTrackingEvent({
                eventType: 'pre_lead_deleted',
                entityType: 'pre_lead',
                entityId: deleteId,
                metadata: {
                    vendedor_id: deletedPreLead?.vendedor_id,
                    empresa_id: deletedPreLead?.empresa_id
                }
            })
            setIsDeleteModalOpen(false)
            fetchPreLeads()
        } catch (error: any) {
            alert('Error al eliminar: ' + error.message)
        }
    }

    const preLeadLocationFacetsById = useMemo(() => {
        const byId = new Map<string, ReturnType<typeof getLocationFilterFacet>>()
        for (const preLead of preLeads) {
            byId.set(String(preLead?.id ?? ''), getLocationFilterFacetFromStructured(preLead))
        }
        return byId
    }, [preLeads])

    const selectedLocationKey = useMemo(
        () => (locationFilter === 'All' ? '' : normalizeLocationFilterKey(locationFilter)),
        [locationFilter]
    )

    const selectedMonterreyMunicipalityKey = useMemo(
        () => (monterreyMunicipalityFilter === 'All' ? '' : normalizeLocationFilterKey(monterreyMunicipalityFilter)),
        [monterreyMunicipalityFilter]
    )

    const filteredPreLeads = useMemo(() => {
        let result = preLeads.filter(pl => {
            const matchesSearch = !search ||
                pl.nombre_empresa?.toLowerCase().includes(search.toLowerCase()) ||
                pl.nombre_contacto?.toLowerCase().includes(search.toLowerCase()) ||
                pl.correos?.some((c: string) => c.toLowerCase().includes(search.toLowerCase()))

            const matchesVendedor = vendedorFilter === 'All' || pl.vendedor_name === vendedorFilter
            const matchesIndustry = industryFilter === 'All' || pl.giro_empresa === industryFilter
            const locationFacet = preLeadLocationFacetsById.get(String(pl?.id ?? '')) || getLocationFilterFacetFromStructured(pl)
            const matchesLocationGroup =
                locationFilter === 'All' ||
                (!!locationFacet.groupKey && locationFacet.groupKey === selectedLocationKey)
            const matchesMonterreyMunicipality =
                locationFilter !== 'Monterrey' ||
                monterreyMunicipalityFilter === 'All' ||
                (
                    locationFacet.isMonterreyMetro &&
                    !!locationFacet.monterreyMunicipalityKey &&
                    locationFacet.monterreyMunicipalityKey === selectedMonterreyMunicipalityKey
                )

            return matchesSearch && matchesVendedor && matchesIndustry && matchesLocationGroup && matchesMonterreyMunicipality
        })

        if (sortBy === 'recent') {
            result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        } else if (sortBy === 'name') {
            result.sort((a, b) => a.nombre_empresa.localeCompare(b.nombre_empresa))
        }

        return result
    }, [
        preLeads,
        preLeadLocationFacetsById,
        search,
        vendedorFilter,
        industryFilter,
        locationFilter,
        monterreyMunicipalityFilter,
        selectedLocationKey,
        selectedMonterreyMunicipalityKey,
        sortBy
    ])

    const uniqueVendedores = useMemo(() => {
        const vends = new Set(preLeads.map(pl => pl.vendedor_name).filter(v => !!v))
        return Array.from(vends).sort()
    }, [preLeads])

    const uniqueIndustries = useMemo(() => {
        const industries = new Set(preLeads.map(pl => pl.giro_empresa).filter(g => !!g))
        return Array.from(industries).sort()
    }, [preLeads])

    const uniqueLocations = useMemo(() => {
        const byKey = new Map<string, string>()
        for (const facet of preLeadLocationFacetsById.values()) {
            if (!facet.groupLabel) continue
            const key = facet.groupKey || normalizeLocationDuplicateKey(facet.groupLabel)
            if (!key) continue
            const label = facet.groupLabel
            const prev = byKey.get(key)
            if (!prev || label.length < prev.length || (label.length === prev.length && label.localeCompare(prev, 'es') < 0)) {
                byKey.set(key, label)
            }
        }
        return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b, 'es'))
    }, [preLeadLocationFacetsById])

    const uniqueMonterreyMunicipalities = useMemo(() => {
        const byKey = new Map<string, string>()
        for (const facet of preLeadLocationFacetsById.values()) {
            if (!facet.isMonterreyMetro || !facet.monterreyMunicipality) continue
            const key = facet.monterreyMunicipalityKey || normalizeLocationDuplicateKey(facet.monterreyMunicipality)
            if (!key) continue
            const label = facet.monterreyMunicipality
            const prev = byKey.get(key)
            if (!prev || label.length < prev.length || (label.length === prev.length && label.localeCompare(prev, 'es') < 0)) {
                byKey.set(key, label)
            }
        }
        return sortMonterreyMunicipalityLabels(Array.from(byKey.values()))
    }, [preLeadLocationFacetsById])

    if (auth.loading && !auth.loggedIn) {
        return (
            <div className='h-full flex items-center justify-center' style={{ background: 'transparent' }}>
                <div className='flex flex-col items-center gap-4'>
                    <div className='w-12 h-12 border-4 border-[#2048FF] border-t-transparent rounded-full animate-spin' />
                    <p className='font-medium' style={{ color: 'var(--text-secondary)' }}>Cargando prospectos...</p>
                </div>
            </div>
        )
    }

    return (
        <div className='min-h-full flex flex-col p-8 overflow-y-auto custom-scrollbar' style={{ background: 'transparent' }}>
            <div className='max-w-7xl mx-auto space-y-10 w-full'>
                {/* External Header - Page Level */}
                {/* Header Pattern consistent with Empresas */}
                <div className='flex flex-col md:flex-row md:items-center justify-between gap-6'>
                    <div className='flex items-center gap-8'>
                        <div className='flex items-center gap-6'>
                            <div className='ah-icon-card transition-all hover:scale-105'>
                                <Target size={34} strokeWidth={1.9} />
                            </div>
                            <div>
                                <h1 className='text-4xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>
                                    Suspects
                                </h1>
                                <p className='font-medium' style={{ color: 'var(--text-secondary)' }}>
                                    Bandeja de suspects generados desde Empresas para investigación y ascenso a lead.
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
                            onClick={() => router.push('/empresas')}
                            className='px-8 py-3 bg-[#2048FF] text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:bg-[#1b3de6] hover:scale-105 active:scale-95 transition-all cursor-pointer'
                        >
                            <span className='inline-flex items-center gap-2'>
                                <Building2 size={14} strokeWidth={2.4} />
                                Registrar Empresa
                            </span>
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
                                    <h2 className='text-xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>Bandeja de Suspects</h2>
                                    <p className='text-[10px] font-bold uppercase tracking-[0.2em] opacity-60' style={{ color: 'var(--text-secondary)' }}>Investigación y validación sin contacto</p>
                                </div>
                            </div>

                            <div className='flex items-center gap-3'>
                                <div className='ah-count-chip'>
                                    <span className='ah-count-chip-number'>{filteredPreLeads.length}</span>
                                    <div className='ah-count-chip-meta'>
                                        <span className='ah-count-chip-title'>Registros</span>
                                        <span className='ah-count-chip-subtitle'>Sin contacto</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className='ah-table-toolbar'>
                            <div className='ah-table-controls'>
                                <div className='ah-search-control'>
                                    <Search className='ah-search-icon' size={18} />
                                    <input
                                        type='text'
                                        placeholder='Buscar por empresa, contacto, correos...'
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        className='ah-search-input'
                                    />
                                </div>

                                <select
                                    value={vendedorFilter}
                                    onChange={(e) => setVendedorFilter(e.target.value)}
                                    className='ah-select-control'
                                >
                                    <option value="All">Vendedor: Todos</option>
                                    {uniqueVendedores.map(v => (
                                        <option key={v as string} value={v as string}>{v as string}</option>
                                    ))}
                                </select>
                                <select
                                    value={industryFilter}
                                    onChange={(e) => setIndustryFilter(e.target.value)}
                                    className='ah-select-control'
                                >
                                    <option value="All">Industria: Todas</option>
                                    {uniqueIndustries.map(ind => (
                                        <option key={ind as string} value={ind as string}>{ind as string}</option>
                                    ))}
                                </select>
                                <select
                                    value={locationFilter}
                                    onChange={(e) => {
                                        const nextLocation = e.target.value
                                        setLocationFilter(nextLocation)
                                        if (nextLocation !== 'Monterrey') {
                                            setMonterreyMunicipalityFilter('All')
                                        }
                                    }}
                                    className='ah-select-control'
                                >
                                    <option value="All">Ubicación: Todas</option>
                                    {uniqueLocations.map(loc => (
                                        <option key={loc as string} value={loc as string}>{loc as string}</option>
                                    ))}
                                </select>
                                {locationFilter === 'Monterrey' && (
                                    <select
                                        value={monterreyMunicipalityFilter}
                                        onChange={(e) => setMonterreyMunicipalityFilter(e.target.value)}
                                        className='ah-select-control'
                                    >
                                        <option value="All">Municipio MTY: Todos</option>
                                        {uniqueMonterreyMunicipalities.map((municipality) => (
                                            <option key={municipality} value={municipality}>{municipality}</option>
                                        ))}
                                    </select>
                                )}
                                <select
                                    value={sortBy}
                                    onChange={(e) => setSortBy(e.target.value)}
                                    className='ah-select-control ah-select-control-order'
                                >
                                    <option value="recent">Orden: Reciente</option>
                                    <option value="name">Orden: Nombre</option>
                                </select>

                                {(search || vendedorFilter !== 'All' || industryFilter !== 'All' || locationFilter !== 'All' || monterreyMunicipalityFilter !== 'All' || sortBy !== 'recent') && (
                                    <button
                                        onClick={() => {
                                            setSearch('')
                                            setVendedorFilter('All')
                                            setIndustryFilter('All')
                                            setLocationFilter('All')
                                            setMonterreyMunicipalityFilter('All')
                                            setSortBy('recent')
                                        }}
                                        className='ah-reset-filter-btn group'
                                        title='Limpiar Filtros'
                                    >
                                        <RotateCw size={16} className='group-active:rotate-180 transition-transform' />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className='flex-1 overflow-x-auto custom-scrollbar min-h-[400px]'>
                        {loading && preLeads.length === 0 ? (
                            <div className='w-full h-96 flex flex-col items-center justify-center gap-4'>
                                <div className='w-12 h-12 border-4 border-[#2048FF] border-t-transparent rounded-full animate-spin' />
                                <p className='text-sm font-bold text-gray-500 animate-pulse uppercase tracking-widest'>Sincronizando Suspects...</p>
                            </div>
                        ) : (
                            <PreLeadsTable
                                preLeads={filteredPreLeads}
                                sellerProfilesById={sellerProfilesById}
                                isEditingMode={isEditingMode}
                                onEdit={(pl) => { setModalMode('edit'); setCurrentPreLead(pl); setIsModalOpen(true); }}
                                onDelete={(id) => { setDeleteId(id); setIsDeleteModalOpen(true); }}
                                onRowClick={(pl) => { setSelectedPreLead(pl); setIsDetailViewOpen(true); }}
                                onEmailClick={handleEmailClick}
                                userEmail={auth.user?.email || undefined}
                            />
                        )}
                    </div>
                </div>
            </div>

            <RichardDawkinsFooter />


            {/* Modales */}
            <PreLeadModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSave}
                initialData={currentPreLead}
                mode={modalMode}
            />

            <PreLeadDetailView
                preLead={selectedPreLead}
                isOpen={isDetailViewOpen}
                onClose={() => setIsDetailViewOpen(false)}
                onPromote={handlePromote}
                onEdit={(pl) => { setIsDetailViewOpen(false); setModalMode('edit'); setCurrentPreLead(pl); setIsModalOpen(true); }}
                onEmailClick={handleEmailClick}
                userEmail={auth.user?.email || undefined}
            />

            <ClientModal
                isOpen={isClientModalOpen}
                onClose={() => setIsClientModalOpen(false)}
                onSave={handleSaveClient}
                initialData={clientInitialData}
                mode={clientModalMode}
                companies={companies}
            />

            <ConfirmModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleDelete}
                title="Eliminar Suspect"
                message="¿Estás seguro de que deseas eliminar este registro? Esta acción es permanente."
                isDestructive
            />

        </div>
    )
}
