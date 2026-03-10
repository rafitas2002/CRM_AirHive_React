'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import CompaniesTable from '@/components/CompaniesTable'
import CompanyModal, { CompanyData } from '@/components/CompanyModal'
import AdminCompanyDetailView from '@/components/AdminCompanyDetailView'
import ConfirmModal from '@/components/ConfirmModal'
import Link from 'next/link'
import Image from 'next/image'
import { Search, Table as TableIcon, Pencil, Building2 } from 'lucide-react'
import { getLocationFilterFacet, getLocationFilterFacetFromStructured, normalizeLocationDuplicateKey, normalizeLocationFilterKey, sortMonterreyMunicipalityLabels } from '@/lib/locationUtils'

import RichardDawkinsFooter from '@/components/RichardDawkinsFooter'

export type CompanyWithProjects = CompanyData & {
    activeProjects: number
    processProjects: number
    lostProjects: number
    antiquityDate: string
    projectAntiquityDate: string | null
    lifecycle_stage?: 'pre_lead' | 'lead' | string | null
    source_channel?: string | null
    pre_leads_count?: number | null
    leads_count?: number | null
    ubicacion_group?: string | null
    ubicacion_group_key?: string | null
    ubicacion_municipio?: string | null
    ubicacion_municipio_key?: string | null
    ubicacion_is_monterrey_metro?: boolean | null
}

function parseSupabaseError(error: any, fallback: string) {
    if (!error) return fallback
    if (typeof error === 'string') return error
    if (error?.message) return error.message as string

    const fragments = [error?.code, error?.details, error?.hint].filter(Boolean)
    if (fragments.length > 0) return fragments.join(' | ')

    try {
        const serialized = JSON.stringify(error, Object.getOwnPropertyNames(error))
        if (serialized && serialized !== '{}') return serialized
    } catch {
        // ignore serialization failures and use fallback
    }

    return fallback
}

export default function EmpresasPage() {
    const auth = useAuth()
    const router = useRouter()
    const [companies, setCompanies] = useState<CompanyWithProjects[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedCompany, setSelectedCompany] = useState<CompanyWithProjects | null>(null)
    const [isDetailOpen, setIsDetailOpen] = useState(false)
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
    const [companyToDelete, setCompanyToDelete] = useState<string | null>(null)

    // Modal state for creating/editing from this page
    const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false)
    const [modalCompanyData, setModalCompanyData] = useState<CompanyWithProjects | null>(null)
    const [isEditingMode, setIsEditingMode] = useState(false)

    // Filtering State
    // Filtering State
    const [filterSearch, setFilterSearch] = useState('')
    const [filterIndustry, setFilterIndustry] = useState('All')
    const [filterSize, setFilterSize] = useState('All')
    const [filterLocation, setFilterLocation] = useState('All')
    const [filterMonterreyMunicipality, setFilterMonterreyMunicipality] = useState('All')
    const [filterLifecycle, setFilterLifecycle] = useState<'All' | 'lead' | 'pre_lead'>('All')
    const [sortBy, setSortBy] = useState('alphabetical') // 'alphabetical', 'antiquity', 'projectAntiquity'
    const [preLeadColumns, setPreLeadColumns] = useState<Record<string, boolean>>({
        empresa_id: true,
        industria_id: true,
        tamano: true,
        tamano_fuente: true,
        tamano_confianza: true,
        tamano_senal_principal: true,
        website: true,
        logo_url: true,
        created_by: true,
        updated_by: true,
        is_converted: true
    })

    const supabase = createClient()

    useEffect(() => {
        // Redirect if not logged in
        if (!auth.loading && !auth.loggedIn) {
            router.push('/home')
            return
        }

        if (auth.loggedIn) {
            fetchCompanies()
            void detectPreLeadColumns()
        }
    }, [auth.loading, auth.loggedIn, router])

    const detectPreLeadColumns = async () => {
        const candidates = [
            'empresa_id',
            'industria_id',
            'tamano',
            'tamano_fuente',
            'tamano_confianza',
            'tamano_senal_principal',
            'website',
            'logo_url',
            'created_by',
            'updated_by',
            'is_converted'
        ]
        const result: Record<string, boolean> = {}

        for (const column of candidates) {
            const { error } = await (supabase.from('pre_leads') as any).select(column).limit(1)
            const missing = error && (error.code === '42703' || String(error.message || '').toLowerCase().includes(`'${column}'`))
            result[column] = !missing
        }

        setPreLeadColumns(result)
    }

    const isUnknownColumnError = (error: any) => {
        const msg = String(parseSupabaseError(error, '') || '').toLowerCase()
        return msg.includes('could not find the') && msg.includes('column of')
    }

    const markCompanyAsPreLead = async (companyId: string) => {
        if (!companyId || !auth.user?.id) return
        const now = new Date().toISOString()
        const attempts: Array<Record<string, any>> = [
            {
                lifecycle_stage: 'pre_lead',
                source_channel: 'pre_lead',
                updated_by: auth.user.id,
                first_pre_lead_at: now,
                last_pre_lead_at: now,
                pre_leads_count: 1
            },
            {
                lifecycle_stage: 'pre_lead',
                source_channel: 'pre_lead'
            },
            {
                source_channel: 'pre_lead'
            }
        ]

        for (const payload of attempts) {
            const { error } = await (supabase.from('empresas') as any)
                .update(payload)
                .eq('id', companyId)
            if (!error) return
            if (!isUnknownColumnError(error)) {
                console.warn('No se pudo actualizar metadata de funnel en empresa nueva:', error)
                return
            }
        }
    }

    const ensureCompanyHasSuspect = async (companyId: string, companyData: CompanyData) => {
        if (!companyId || !auth.user?.id) return

        let existingRows: any[] = []
        let existingError: any = null
        const primaryCheck = await (supabase.from('pre_leads') as any)
            .select(preLeadColumns.is_converted ? 'id, is_converted' : 'id')
            .eq('empresa_id', companyId)
            .limit(10)
        existingRows = Array.isArray(primaryCheck?.data) ? primaryCheck.data : []
        existingError = primaryCheck?.error
        if (existingError && isUnknownColumnError(existingError)) {
            const fallbackCheck = await (supabase.from('pre_leads') as any)
                .select('id')
                .eq('empresa_id', companyId)
                .limit(10)
            existingRows = Array.isArray(fallbackCheck?.data) ? fallbackCheck.data : []
            existingError = fallbackCheck?.error
        }
        if (existingError) {
            console.error('Error validating linked suspects for new company:', existingError)
            throw new Error(parseSupabaseError(existingError, 'No se pudo validar suspects vinculados a la empresa.'))
        }

        const existing = Array.isArray(existingRows) ? existingRows : []
        const hasActiveSuspect = existing.some((row: any) => preLeadColumns.is_converted ? !Boolean(row?.is_converted) : true)
        if (hasActiveSuspect) {
            await markCompanyAsPreLead(companyId)
            return
        }

        const normalizeOptionalText = (value: unknown) => {
            const normalized = String(value ?? '').trim()
            return normalized ? normalized : null
        }
        const sellerName = auth.profile?.full_name || auth.username || auth.user.email?.split('@')[0] || null

        const payload: Record<string, any> = {
            nombre_empresa: String(companyData.nombre || '').trim(),
            nombre_contacto: null,
            correos: [],
            telefonos: [],
            ubicacion: normalizeOptionalText(companyData.ubicacion),
            giro_empresa: normalizeOptionalText(companyData.industria) || 'Sin clasificar',
            vendedor_id: auth.user.id,
            vendedor_name: sellerName,
            notas: normalizeOptionalText(companyData.descripcion)
        }

        if (preLeadColumns.empresa_id) payload.empresa_id = companyId
        if (preLeadColumns.industria_id) payload.industria_id = companyData.industria_id || null
        if (preLeadColumns.tamano) payload.tamano = Number(companyData.tamano || 1)
        if (preLeadColumns.tamano_fuente) payload.tamano_fuente = normalizeOptionalText((companyData as any).tamano_fuente)
        if (preLeadColumns.tamano_confianza) payload.tamano_confianza = normalizeOptionalText((companyData as any).tamano_confianza)
        if (preLeadColumns.tamano_senal_principal) payload.tamano_senal_principal = normalizeOptionalText((companyData as any).tamano_senal_principal)
        if (preLeadColumns.website) payload.website = normalizeOptionalText(companyData.website)
        if (preLeadColumns.logo_url) payload.logo_url = normalizeOptionalText(companyData.logo_url)
        if (preLeadColumns.created_by) payload.created_by = auth.user.id
        if (preLeadColumns.updated_by) payload.updated_by = auth.user.id
        if (preLeadColumns.is_converted) payload.is_converted = false

        const { data: createdPreLead, error: createPreLeadError } = await (supabase.from('pre_leads') as any)
            .insert(payload)
            .select('id')
            .single()

        if (createPreLeadError) {
            console.error('Error creating initial suspect from company registration:', createPreLeadError)
            throw new Error(parseSupabaseError(createPreLeadError, 'La empresa se creó, pero no se pudo crear el suspect inicial.'))
        }

        await markCompanyAsPreLead(companyId)

        try {
            const { trackEvent } = await import('@/app/actions/events')
            await trackEvent({
                eventType: 'pre_lead_created',
                entityType: 'pre_lead',
                entityId: createdPreLead?.id,
                metadata: {
                    source: 'company_registration',
                    empresa_id: companyId
                }
            })
        } catch (trackError) {
            console.error('[Empresas] Tracking error (non-blocking):', trackError)
        }
    }

    const companyLocationFacetsById = useMemo(() => {
        const byId = new Map<string, ReturnType<typeof getLocationFilterFacet>>()
        for (const company of companies) {
            byId.set(String(company.id ?? ''), getLocationFilterFacetFromStructured(company))
        }
        return byId
    }, [companies])

    const selectedLocationKey = useMemo(
        () => (filterLocation === 'All' ? '' : normalizeLocationFilterKey(filterLocation)),
        [filterLocation]
    )

    const selectedMonterreyMunicipalityKey = useMemo(
        () => (filterMonterreyMunicipality === 'All' ? '' : normalizeLocationFilterKey(filterMonterreyMunicipality)),
        [filterMonterreyMunicipality]
    )

    // Filter and Sort Logic
    const filteredCompanies = useMemo(() => {
        let result = companies.filter(company => {
            const matchesSearch = !filterSearch ||
                company.nombre?.toLowerCase().includes(filterSearch.toLowerCase()) ||
                company.ubicacion?.toLowerCase().includes(filterSearch.toLowerCase())

            const companyIndustries = company.industrias || (company.industria ? [company.industria] : [])
            const matchesIndustry = filterIndustry === 'All' || companyIndustries.includes(filterIndustry)
            const matchesSize = filterSize === 'All' || company.tamano?.toString() === filterSize
            const locationFacet = companyLocationFacetsById.get(String(company.id ?? '')) || getLocationFilterFacetFromStructured(company)
            const matchesLocationGroup =
                filterLocation === 'All' ||
                (!!locationFacet.groupKey && locationFacet.groupKey === selectedLocationKey)
            const matchesMonterreyMunicipality =
                filterLocation !== 'Monterrey' ||
                filterMonterreyMunicipality === 'All' ||
                (
                    locationFacet.isMonterreyMetro &&
                    !!locationFacet.monterreyMunicipalityKey &&
                    locationFacet.monterreyMunicipalityKey === selectedMonterreyMunicipalityKey
                )
            const lifecycle = (company.lifecycle_stage || '').toLowerCase()
            const sourceChannel = (company.source_channel || '').toLowerCase()
            const preLeadsCount = Number(company.pre_leads_count || 0)
            const leadsCount = Number(company.leads_count || 0)
            const isPreLeadCompany =
                lifecycle === 'pre_lead' ||
                sourceChannel === 'pre_lead' ||
                (preLeadsCount > 0 && leadsCount === 0)
            const matchesLifecycle =
                filterLifecycle === 'All' ||
                (filterLifecycle === 'pre_lead' && isPreLeadCompany) ||
                (filterLifecycle === 'lead' && !isPreLeadCompany)

            return matchesSearch && matchesIndustry && matchesSize && matchesLocationGroup && matchesMonterreyMunicipality && matchesLifecycle
        })

        // Sorting
        result.sort((a, b) => {
            if (sortBy === 'alphabetical') {
                return a.nombre.localeCompare(b.nombre)
            } else if (sortBy === 'antiquity') {
                return new Date(b.antiquityDate).getTime() - new Date(a.antiquityDate).getTime()
            } else if (sortBy === 'projectAntiquity') {
                const dateA = a.projectAntiquityDate ? new Date(a.projectAntiquityDate).getTime() : 0
                const dateB = b.projectAntiquityDate ? new Date(b.projectAntiquityDate).getTime() : 0
                return dateB - dateA
            }
            return 0
        })

        return result
    }, [
        companies,
        companyLocationFacetsById,
        filterSearch,
        filterIndustry,
        filterSize,
        filterLocation,
        filterMonterreyMunicipality,
        selectedLocationKey,
        selectedMonterreyMunicipalityKey,
        filterLifecycle,
        sortBy
    ])

    // Get unique data for filter dropdowns
    const uniqueIndustries = useMemo(() => {
        const industries = new Set(
            companies
                .flatMap(c => c.industrias || (c.industria ? [c.industria] : []))
                .filter((i): i is string => !!i)
        )
        return Array.from(industries).sort()
    }, [companies])

    const uniqueLocations = useMemo(() => {
        const byKey = new Map<string, string>()
        for (const facet of companyLocationFacetsById.values()) {
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
    }, [companyLocationFacetsById])

    const uniqueMonterreyMunicipalities = useMemo(() => {
        const byKey = new Map<string, string>()
        for (const facet of companyLocationFacetsById.values()) {
            if (!facet.isMonterreyMetro || !facet.monterreyMunicipality) continue
            const key = facet.monterreyMunicipalityKey || normalizeLocationDuplicateKey(facet.monterreyMunicipality)
            if (!key) continue
            const prev = byKey.get(key)
            const label = facet.monterreyMunicipality
            if (!prev || label.length < prev.length || (label.length === prev.length && label.localeCompare(prev, 'es') < 0)) {
                byKey.set(key, label)
            }
        }
        return sortMonterreyMunicipalityLabels(Array.from(byKey.values()))
    }, [companyLocationFacetsById])

    const fetchCompanies = async () => {
        setLoading(true)

        // Fetch companies
        const { data: companiesData, error: companiesError } = await supabase
            .from('empresas')
            .select('*')
            .order('nombre', { ascending: true })

        if (companiesError) {
            console.error('Error fetching companies:', companiesError)
            setLoading(false)
            return
        }

        // Fetch all leads to associate
        const [{ data: leadsData, error: leadsError }, companyIndustriesResult] = await Promise.all([
            supabase
                .from('clientes')
                .select('empresa_id, etapa, created_at'),
            supabase
                .from('company_industries')
                .select('empresa_id, industria_id, is_primary, industrias(name)')
        ])

        const leads = (leadsData || []) as { empresa_id: string, etapa: string, created_at: string }[] // Fixed leads data typing
        const companyIndustries = (companyIndustriesResult.data || []) as any[]

        if (leadsError) {
            console.error('Error fetching leads:', leadsError)
        }
        if (companyIndustriesResult.error) {
            console.warn('company_industries is not available yet, using primary industry only:', companyIndustriesResult.error.message)
        }

        const industryMapByCompany: Record<string, { ids: string[], names: string[], primaryId?: string, primaryName?: string }> = {}
        for (const rel of companyIndustries) {
            const companyId = rel.empresa_id as string
            if (!industryMapByCompany[companyId]) {
                industryMapByCompany[companyId] = { ids: [], names: [] }
            }
            if (rel.industria_id) {
                industryMapByCompany[companyId].ids.push(rel.industria_id)
            }
            const name = rel?.industrias?.name
            if (name) {
                industryMapByCompany[companyId].names.push(name)
            }
            if (rel.is_primary) {
                industryMapByCompany[companyId].primaryId = rel.industria_id || undefined
                industryMapByCompany[companyId].primaryName = name || undefined
            }
        }

        const companies = (companiesData || []) as any[]
        const companiesWithProjects = companies.map(company => {
            const companyLeads = leads.filter(l => l.empresa_id === company.id)
            const industriesForCompany = industryMapByCompany[company.id]
            const industryNames = Array.from(new Set(industriesForCompany?.names || []))
            const industryIds = Array.from(new Set(industriesForCompany?.ids || []))
            const primaryIndustryName = industriesForCompany?.primaryName || company.industria || null
            const primaryIndustryId = industriesForCompany?.primaryId || company.industria_id || null

            const activeProjects = companyLeads.filter(l => l.etapa === 'Cerrado Ganado').length
            const processProjects = companyLeads.filter(l =>
                l.etapa !== 'Cerrado Ganado' && l.etapa !== 'Cerrado Perdido'
            ).length
            const lostProjects = companyLeads.filter(l => l.etapa === 'Cerrado Perdido').length

            // Antiquity of first active project
            const activeLeads = companyLeads
                .filter(l => l.etapa === 'Cerrado Ganado')
                .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

            const projectAntiquityDate = activeLeads.length > 0 ? activeLeads[0].created_at : null

            return {
                ...company,
                industria: primaryIndustryName,
                industria_id: primaryIndustryId,
                industria_ids: industryIds.length > 0 ? industryIds : (company.industria_id ? [company.industria_id] : []),
                industrias: industryNames.length > 0 ? industryNames : (company.industria ? [company.industria] : []),
                activeProjects,
                processProjects,
                lostProjects,
                antiquityDate: company.created_at,
                projectAntiquityDate
            }
        })

        setCompanies(companiesWithProjects as CompanyWithProjects[])
        setLoading(false)
    }

    const handleRowClick = (company: CompanyWithProjects) => {
        setSelectedCompany(company)
        setIsDetailOpen(true)
        if (typeof window !== 'undefined') {
            window.history.pushState({ ahOverlay: 'company-detail' }, '')
        }
    }

    const handleCloseDetail = () => {
        if (typeof window !== 'undefined' && window.history.state?.ahOverlay === 'company-detail') {
            window.history.replaceState(null, '')
        }
        setIsDetailOpen(false)
        setSelectedCompany(null)
    }

    const handleEditClick = (company: CompanyWithProjects) => {
        setModalCompanyData(company)
        setIsCompanyModalOpen(true)
    }

    const handleDeleteClick = (id: string) => {
        setCompanyToDelete(id)
        setIsDeleteModalOpen(true)
    }

    const confirmDelete = async () => {
        if (!companyToDelete) return
        const companyId = companyToDelete
        const companyToDeleteData = companies.find((company) => company.id === companyId)

        const { error } = await supabase
            .from('empresas')
            .delete()
            .eq('id', companyId)

        if (error) {
            console.error('Error deleting company:', {
                code: (error as any)?.code,
                message: (error as any)?.message,
                details: (error as any)?.details,
                hint: (error as any)?.hint,
                raw: error
            })
            alert(`Error al eliminar la empresa: ${parseSupabaseError(error, 'Operación bloqueada por dependencias o permisos.')}`)
        } else {
            const { trackEvent } = await import('@/app/actions/events')
            await trackEvent({
                eventType: 'company_deleted',
                entityType: 'company',
                entityId: companyId,
                metadata: {
                    nombre: companyToDeleteData?.nombre || null,
                    industria: companyToDeleteData?.industria || null,
                    ubicacion: companyToDeleteData?.ubicacion || null
                }
            })

            await fetchCompanies()
        }

        setIsDeleteModalOpen(false)
        setCompanyToDelete(null)
    }

    const openCreateModal = () => {
        setModalCompanyData(null)
        setIsCompanyModalOpen(true)
    }

    const syncCompanyIndustries = async (companyId: string, companyData: CompanyData) => {
        const fallbackPrimary = (companyData.industria_ids || [])[0] || ''
        const primaryIndustryId = companyData.industria_id || fallbackPrimary
        const allIndustryIds = Array.from(new Set([
            ...(primaryIndustryId ? [primaryIndustryId] : []),
            ...(companyData.industria_ids || [])
        ])).filter(Boolean)

        const { error: deleteError } = await supabase
            .from('company_industries')
            .delete()
            .eq('empresa_id', companyId)

        if (deleteError) {
            throw deleteError
        }

        if (allIndustryIds.length === 0) {
            return
        }

        const payload = allIndustryIds.map(industryId => ({
            empresa_id: companyId,
            industria_id: industryId,
            is_primary: industryId === primaryIndustryId
        }))

        const { error: insertError } = await supabase
            .from('company_industries')
            .insert(payload as any)

        if (insertError) {
            throw insertError
        }
    }

    const handleSaveCompany = async (companyData: CompanyData) => {
        const isEditing = !!modalCompanyData
        const normalizeOptionalText = (value: unknown) => {
            const normalized = String(value ?? '').trim()
            return normalized ? normalized : null
        }
        const normalizeIndustryIds = (ids: string[] | undefined, fallbackPrimary: string | undefined) =>
            Array.from(new Set([...(ids || []), ...(fallbackPrimary ? [fallbackPrimary] : [])]))
                .filter(Boolean)
                .sort()
        const basePayload: any = {
            nombre: companyData.nombre,
            tamano: companyData.tamano,
            ubicacion: companyData.ubicacion,
            industria: companyData.industria,
            industria_id: companyData.industria_id || null
        }
        const sizeAssessmentPayload: any = {
            tamano_fuente: normalizeOptionalText((companyData as any).tamano_fuente),
            tamano_confianza: normalizeOptionalText((companyData as any).tamano_confianza),
            tamano_senal_principal: normalizeOptionalText((companyData as any).tamano_senal_principal)
        }
        const basePayloadWithSizeAssessment = {
            ...basePayload,
            ...sizeAssessmentPayload
        }
        const profileFieldsPayload: any = {
            logo_url: normalizeOptionalText(companyData.logo_url),
            descripcion: normalizeOptionalText(companyData.descripcion)
        }
        const websiteValue = ((companyData as any)?.website ?? (companyData as any)?.sitio_web ?? '').toString().trim() || null

        const getPayloadCandidates = () => {
            const candidates: any[] = []
            const corePayloadVariants = [
                { ...basePayloadWithSizeAssessment, ...profileFieldsPayload },
                { ...basePayload, ...profileFieldsPayload },
                basePayloadWithSizeAssessment,
                basePayload
            ]
            for (const corePayload of corePayloadVariants) {
                if (websiteValue !== null) {
                    candidates.push({ ...corePayload, website: websiteValue })
                    candidates.push({ ...corePayload, sitio_web: websiteValue })
                }
                candidates.push(corePayload)
            }
            return candidates
        }

        if (isEditing) {
            let updateError: any = null
            for (const candidate of getPayloadCandidates()) {
                const { error } = await (supabase
                    .from('empresas') as any)
                    .update(candidate)
                    .eq('id', modalCompanyData.id)
                if (!error) {
                    updateError = null
                    break
                }
                updateError = error
                if (!isUnknownColumnError(error)) {
                    break
                }
            }

            if (updateError) {
                const parsed = parseSupabaseError(updateError, 'No se pudo actualizar la empresa.')
                console.error('Error updating company:', parsed, updateError)
                alert(`Error al actualizar la empresa: ${parsed}`)
                return
            }

            const prevPrimaryIndustryId = String(modalCompanyData.industria_id || '').trim()
            const nextPrimaryIndustryId = String(companyData.industria_id || '').trim()
            const prevIndustryIds = normalizeIndustryIds(modalCompanyData.industria_ids, prevPrimaryIndustryId)
            const nextIndustryIds = normalizeIndustryIds(companyData.industria_ids, nextPrimaryIndustryId)
            const industriesChanged =
                prevPrimaryIndustryId !== nextPrimaryIndustryId ||
                prevIndustryIds.join('|') !== nextIndustryIds.join('|')

            if (industriesChanged) {
                try {
                    await syncCompanyIndustries(modalCompanyData.id!, companyData)
                } catch (industryError: any) {
                    console.error('Error updating company industries:', industryError)
                    alert('La empresa se actualizó, pero no se pudieron guardar todas las industrias.')
                }
            }

            setSelectedCompany((prev) => (
                prev && prev.id === modalCompanyData.id
                    ? {
                        ...prev,
                        ...companyData,
                        industria: companyData.industria,
                        industria_id: companyData.industria_id || prev.industria_id,
                        industria_ids: companyData.industria_ids || prev.industria_ids,
                        industrias: companyData.industrias || prev.industrias,
                        website: companyData.website
                    } as CompanyWithProjects
                    : prev
            ))
        } else {
            let createdCompany: any = null
            let createError: any = null
            for (const candidate of getPayloadCandidates()) {
                const { data, error } = await (supabase
                    .from('empresas') as any)
                    .insert([{
                        ...candidate,
                        owner_id: auth.profile?.id
                    }])
                    .select('id')
                    .single()
                if (!error) {
                    createdCompany = data
                    createError = null
                    break
                }
                createError = error
                if (!isUnknownColumnError(error)) {
                    break
                }
            }

            if (createError) {
                const parsed = parseSupabaseError(createError, 'No se pudo crear la empresa.')
                console.error('Error creating company:', parsed, createError)
                alert(`Error al crear la empresa: ${parsed}`)
                return
            }

            try {
                if (createdCompany?.id) {
                    await syncCompanyIndustries(createdCompany.id, companyData)
                }
            } catch (industryError: any) {
                console.error('Error saving company industries:', industryError)
                alert('La empresa se creó, pero no se pudieron guardar todas las industrias.')
            }

            try {
                if (createdCompany?.id) {
                    await ensureCompanyHasSuspect(createdCompany.id, companyData)
                }
            } catch (suspectError: any) {
                const parsed = parseSupabaseError(suspectError, 'La empresa se creó, pero no se pudo generar su suspect inicial.')
                console.error('Error creating suspect from company flow:', parsed, suspectError)
                alert(parsed)
            }
        }

        setIsCompanyModalOpen(false)
        await fetchCompanies()
    }

    useEffect(() => {
        const onPopState = () => {
            setIsDetailOpen(false)
            setSelectedCompany(null)
        }
        window.addEventListener('popstate', onPopState)
        return () => window.removeEventListener('popstate', onPopState)
    }, [])

    // Only show blocking spinner if we are loading session AND not logged in
    // OR if we are loading companies AND we don't have any data yet
    if ((auth.loading && !auth.loggedIn) || (loading && companies.length === 0)) {
        return (
            <div className='h-full flex items-center justify-center' style={{ background: 'var(--background)' }}>
                <div className='flex flex-col items-center gap-4'>
                    <div className='w-12 h-12 border-4 border-[#2048FF] border-t-transparent rounded-full animate-spin' />
                    <p className='font-medium' style={{ color: 'var(--text-secondary)' }}>Cargando catálogo de empresas...</p>
                </div>
            </div>
        )
    }

    if (!auth.loggedIn) {
        return null // Will redirect
    }

    return (
        <div className='min-h-full flex flex-col p-8 overflow-y-auto custom-scrollbar' style={{ background: 'transparent' }}>
            <div className='max-w-7xl mx-auto space-y-10 w-full'>
                {/* External Header - Page Level */}
                <div className='flex flex-col md:flex-row md:items-center justify-between gap-6'>
                    <div className='flex items-center gap-8'>
                        <div className='flex items-center gap-6'>
                            <div className='ah-icon-card transition-all hover:scale-105'>
                                <Building2 size={34} strokeWidth={1.9} />
                            </div>
                            <div>
                                <h1 className='text-4xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>
                                    Catálogo de Empresas
                                </h1>
                                <p className='font-medium' style={{ color: 'var(--text-secondary)' }}>
                                    Alta única de empresas: cada registro nuevo crea su suspect inicial para mantener el funnel conectado.
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
                                        <span>Editar Catálogo</span>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-80">
                                            <path d="M12 20h9" />
                                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                                        </svg>
                                    </>
                                )}
                            </div>
                        </button>
                        <button
                            onClick={() => {
                                setModalCompanyData(null)
                                setIsCompanyModalOpen(true)
                            }}
                            className='px-8 py-3 bg-[#2048FF] text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:bg-[#1b3de6] hover:scale-105 active:scale-95 transition-all cursor-pointer'
                        >
                            + Nueva Empresa (Suspect)
                        </button>
                    </div>
                </div>

                {/* Main Table Container */}
                <div className='rounded-[40px] shadow-xl border overflow-hidden flex flex-col mb-6' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                    <div className='px-8 py-6 border-b flex flex-col gap-6' style={{ borderColor: 'var(--card-border)' }}>
                        <div className='flex flex-col md:flex-row md:items-center justify-between gap-4'>
                            <div className='flex items-center gap-4'>
                                <div className='ah-icon-card ah-icon-card-sm'>
                                    <TableIcon size={22} strokeWidth={2} />
                                </div>
                                <div>
                                    <h2 className='text-xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>Tabla Maestra de Empresas</h2>
                                    <p className='text-[10px] font-bold uppercase tracking-[0.2em] opacity-60' style={{ color: 'var(--text-secondary)' }}>Gestión de Inteligencia Corporativa</p>
                                </div>
                            </div>

                            <div className='flex items-center gap-3'>
                                <div className='ah-count-chip'>
                                    <span className='ah-count-chip-number'>{filteredCompanies.length}</span>
                                    <div className='ah-count-chip-meta'>
                                        <span className='ah-count-chip-title'>Registros</span>
                                        <span className='ah-count-chip-subtitle'>Encontrados</span>
                                    </div>
                                </div>
                                <div className='ah-count-chip'>
                                    <span className='ah-count-chip-number'>
                                        {filteredCompanies.filter((c) => {
                                            const lifecycle = (c.lifecycle_stage || '').toLowerCase()
                                            const source = (c.source_channel || '').toLowerCase()
                                            const preCount = Number(c.pre_leads_count || 0)
                                            const leadCount = Number(c.leads_count || 0)
                                            return lifecycle === 'pre_lead' || source === 'pre_lead' || (preCount > 0 && leadCount === 0)
                                        }).length}
                                    </span>
                                    <div className='ah-count-chip-meta'>
                                        <span className='ah-count-chip-title'>Suspects</span>
                                        <span className='ah-count-chip-subtitle'>Empresas</span>
                                    </div>
                                </div>
                                <div className='ah-count-chip'>
                                    <span className='ah-count-chip-number'>
                                        {filteredCompanies.filter((c) => {
                                            const lifecycle = (c.lifecycle_stage || '').toLowerCase()
                                            const source = (c.source_channel || '').toLowerCase()
                                            const preCount = Number(c.pre_leads_count || 0)
                                            const leadCount = Number(c.leads_count || 0)
                                            return !(lifecycle === 'pre_lead' || source === 'pre_lead' || (preCount > 0 && leadCount === 0))
                                        }).length}
                                    </span>
                                    <div className='ah-count-chip-meta'>
                                        <span className='ah-count-chip-title'>Leads</span>
                                        <span className='ah-count-chip-subtitle'>Empresas</span>
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
                                        placeholder='Buscar por nombre, ubicación, etiquetas...'
                                        value={filterSearch}
                                        onChange={(e) => setFilterSearch(e.target.value)}
                                        className='ah-search-input'
                                    />
                                </div>
                                    <select
                                        value={filterIndustry}
                                        onChange={(e) => setFilterIndustry(e.target.value)}
                                        className='ah-select-control'
                                    >
                                        <option value="All">Industria: Todas</option>
                                        {uniqueIndustries.map(ind => (
                                            <option key={ind} value={ind!}>{ind}</option>
                                        ))}
                                    </select>

                                    <select
                                        value={filterLocation}
                                        onChange={(e) => {
                                            const nextLocation = e.target.value
                                            setFilterLocation(nextLocation)
                                            if (nextLocation !== 'Monterrey') {
                                                setFilterMonterreyMunicipality('All')
                                            }
                                        }}
                                        className='ah-select-control'
                                    >
                                        <option value="All">Ubicación: Todas</option>
                                        {uniqueLocations.map(loc => (
                                            <option key={loc} value={loc}>{loc}</option>
                                        ))}
                                    </select>
                                    {filterLocation === 'Monterrey' && (
                                        <select
                                            value={filterMonterreyMunicipality}
                                            onChange={(e) => setFilterMonterreyMunicipality(e.target.value)}
                                            className='ah-select-control'
                                        >
                                            <option value="All">Municipio MTY: Todos</option>
                                            {uniqueMonterreyMunicipalities.map((municipality) => (
                                                <option key={municipality} value={municipality}>{municipality}</option>
                                            ))}
                                        </select>
                                    )}
                                    <select
                                        value={filterLifecycle}
                                        onChange={(e) => setFilterLifecycle(e.target.value as 'All' | 'lead' | 'pre_lead')}
                                        className='ah-select-control'
                                    >
                                        <option value="All">Tipo: Todos</option>
                                        <option value="lead">Tipo: Lead</option>
                                        <option value="pre_lead">Tipo: Suspect</option>
                                    </select>
                                    <select
                                        value={filterSize}
                                        onChange={(e) => setFilterSize(e.target.value)}
                                        className='ah-select-control'
                                    >
                                        <option value="All">Tamaño: Todo</option>
                                        <option value="1">Micro</option>
                                        <option value="2">Pequeña</option>
                                        <option value="3">Mediana</option>
                                        <option value="4">Grande</option>
                                        <option value="5">Corporativo</option>
                                    </select>

                                    <select
                                        value={sortBy}
                                        onChange={(e) => setSortBy(e.target.value)}
                                        className='ah-select-control'
                                    >
                                        <option value="alphabetical">Orden: Nombre</option>
                                        <option value="antiquity">Orden: Antigüedad</option>
                                        <option value="projectAntiquity">Orden: Proyectos</option>
                                    </select>
                            </div>
                        </div>
                    </div>

                    <div className='flex-1 overflow-x-auto custom-scrollbar'>
                        <CompaniesTable
                            companies={filteredCompanies}
                            isEditingMode={isEditingMode}
                            currentUserProfile={auth.profile}
                            onRowClick={handleRowClick}
                            onEdit={handleEditClick}
                            onDelete={handleDeleteClick}
                        />
                    </div>
                </div>
            </div>

            <RichardDawkinsFooter />

            <CompanyModal
                isOpen={isCompanyModalOpen}
                onClose={() => setIsCompanyModalOpen(false)}
                onSave={handleSaveCompany}
                initialData={modalCompanyData}
                companies={companies as any}
                overlayClassName={isDetailOpen ? 'z-[160]' : ''}
                overlayStyle={isDetailOpen ? { zIndex: 160 } : undefined}
            />

            {/* Detail View Modal/Overlay */}
            {selectedCompany && (
                <AdminCompanyDetailView
                    isOpen={isDetailOpen}
                    onClose={handleCloseDetail}
                    company={selectedCompany}
                    currentUserProfile={auth.profile}
                    onEditCompany={(companyData) => {
                        setModalCompanyData(companyData as CompanyWithProjects)
                        setIsCompanyModalOpen(true)
                    }}
                />
            )}

            {/* Delete Confirmation */}
            <ConfirmModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title="Eliminar Empresa"
                message="¿Estás seguro de que deseas eliminar esta empresa? Los leads asociados no se eliminarán, pero ya no estarán vinculados a esta empresa."
                isDestructive={true}
            />
        </div>
    )
}
