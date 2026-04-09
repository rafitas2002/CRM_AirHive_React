'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import CompaniesTable from '@/components/CompaniesTable'
import CompanyModal, { CompanyData } from '@/components/CompanyModal'
import AdminCompanyDetailView from '@/components/AdminCompanyDetailView'
import ConfirmModal from '@/components/ConfirmModal'
import { Search, Table as TableIcon, Building2, Plus, ChevronDown } from 'lucide-react'
import { getLocationFilterFacet, getLocationFilterFacetFromStructured, normalizeLocationDuplicateKey, normalizeLocationFilterKey, sortMonterreyMunicipalityLabels } from '@/lib/locationUtils'
import { companyHasTag, normalizeCompanyTags } from '@/lib/companyTags'
import { normalizeCompanySizeConfidenceValue, normalizeCompanySizeSourceValue } from '@/lib/companySizeUtils'
import { normalizeLeadOriginValue } from '@/lib/leadOrigin'

import RichardDawkinsFooter from '@/components/RichardDawkinsFooter'

export type CompanyWithProjects = CompanyData & {
    activeProjects: number
    processProjects: number
    lostProjects: number
    held_meetings_count?: number | null
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
    owner_id?: string | null
    created_by?: string | null
    created_at?: string | null
    registered_by_id?: string | null
    registered_by_name?: string | null
    responsible_name?: string | null
    next_action_type?: 'task' | 'meeting' | 'none'
    next_action_label?: string | null
    next_action_at?: string | null
    last_contact_at?: string | null
    enrichment_status?: 'not_requested' | 'queued' | 'processing' | 'ready' | 'applied' | 'rejected' | 'failed' | string | null
    enrichment_payload?: any
    enrichment_last_run_at?: string | null
    enrichment_last_error?: string | null
    enriched_at?: string | null
    lead_origin?: string | null
}

type CompanyUnifiedView = 'all' | 'suspects' | 'leads' | 'clients'

function resolveCompanyUnifiedStage(company: CompanyWithProjects): 'suspect' | 'lead' | 'client' {
    if (Number(company.activeProjects || 0) > 0) return 'client'

    const heldMeetingsCount = Number(company.held_meetings_count || 0)
    if (heldMeetingsCount > 0) return 'lead'

    const lifecycle = (company.lifecycle_stage || '').toLowerCase()
    if (lifecycle === 'lead') return 'lead'

    return 'suspect'
}

function normalizeCompanyViewParam(value: string | null): CompanyUnifiedView {
    const normalized = String(value || '').trim().toLowerCase()
    if (normalized === 'suspects' || normalized === 'leads' || normalized === 'clients') return normalized
    return 'all'
}

const RECENT_COMPANY_WINDOW_MS = 24 * 60 * 60 * 1000
const NEW_COMPANY_HIGHLIGHT_WINDOW_MS = 5 * 60 * 1000

function parseCompanyCreatedAtMs(company: { created_at?: string | null }) {
    const raw = String(company?.created_at || '').trim()
    if (!raw) return Number.NaN
    const createdAtMs = new Date(raw).getTime()
    return Number.isFinite(createdAtMs) ? createdAtMs : Number.NaN
}

function parseDateMs(value?: string | null): number {
    const raw = String(value || '').trim()
    if (!raw) return Number.NaN
    const ms = new Date(raw).getTime()
    return Number.isFinite(ms) ? ms : Number.NaN
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

function normalizeCompanyScopeValue(value: unknown): 'local' | 'nacional' | 'internacional' | 'por_definir' | null {
    const normalized = String(value || '').trim().toLowerCase()
    if (
        normalized === 'local'
        || normalized === 'nacional'
        || normalized === 'internacional'
        || normalized === 'por_definir'
    ) {
        return normalized
    }
    return null
}

function normalizeSiteSuggestions(value: unknown): string[] {
    const list = Array.isArray(value) ? value : []
    const seen = new Set<string>()
    const result: string[] = []
    for (const item of list) {
        const normalized = String(item || '').trim()
        if (!normalized) continue
        const key = normalized.toLocaleLowerCase('es-MX')
        if (seen.has(key)) continue
        seen.add(key)
        result.push(normalized)
        if (result.length >= 12) break
    }
    return result
}

function isClosedLeadStage(stage: unknown) {
    const normalized = String(stage || '').trim().toLowerCase()
    return normalized === 'cerrado ganado'
        || normalized === 'cerrada ganada'
        || normalized === 'cerrado perdido'
        || normalized === 'cerrada perdida'
}

function normalizeEmailInput(value: unknown) {
    const normalized = String(value || '').trim().toLowerCase()
    if (!normalized) return null
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalized)) return null
    return normalized
}

function normalizePhoneInput(value: unknown) {
    const normalized = String(value || '').trim()
    return normalized || null
}

export default function EmpresasPage() {
    const auth = useAuth()
    const router = useRouter()
    const searchParams = useSearchParams()
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
    const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false)
    const createMenuRef = useRef<HTMLDivElement | null>(null)

    // Filtering State
    // Filtering State
    const [filterSearch, setFilterSearch] = useState('')
    const [filterIndustry, setFilterIndustry] = useState('All')
    const [filterSize, setFilterSize] = useState('All')
    const [filterLocation, setFilterLocation] = useState('All')
    const [filterMonterreyMunicipality, setFilterMonterreyMunicipality] = useState('All')
    const [companyView, setCompanyView] = useState<CompanyUnifiedView>('all')
    const [filterRecent, setFilterRecent] = useState<'all' | 'recent_24h'>('all')
    const [filterTag, setFilterTag] = useState('All')
    const [filterResponsible, setFilterResponsible] = useState('All')
    const [sortBy, setSortBy] = useState('alphabetical') // 'alphabetical', 'antiquity', 'projectAntiquity'
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
    const [currentTimestamp, setCurrentTimestamp] = useState(() => Date.now())
    const autoCreateCompanyHandledRef = useRef<string | null>(null)
    const [preLeadColumns, setPreLeadColumns] = useState<Record<string, boolean>>({
        empresa_id: true,
        industria_id: true,
        tamano: true,
        tamano_fuente: true,
        tamano_confianza: true,
        tamano_senal_principal: true,
        website: true,
        logo_url: true,
        lead_origin: true,
        created_by: true,
        updated_by: true,
        is_converted: true
    })

    const supabase = createClient()

    useEffect(() => {
        const intervalId = window.setInterval(() => setCurrentTimestamp(Date.now()), 30_000)
        return () => window.clearInterval(intervalId)
    }, [])

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

    useEffect(() => {
        const nextView = normalizeCompanyViewParam(searchParams.get('view'))
        setCompanyView((prev) => (prev === nextView ? prev : nextView))
    }, [searchParams])

    useEffect(() => {
        const isLegacyLeadCreateFlow = Boolean(searchParams.get('createLead') || searchParams.get('newLead'))
        const createCompanyParamRaw = String(
            searchParams.get('createCompany')
            || searchParams.get('newCompany')
            || searchParams.get('createLead')
            || searchParams.get('newLead')
            || ''
        ).trim().toLowerCase()

        if (!createCompanyParamRaw) {
            autoCreateCompanyHandledRef.current = null
            return
        }
        if (autoCreateCompanyHandledRef.current === createCompanyParamRaw) return

        const shouldOpenCreateCompanyModal = ['1', 'true', 'yes', 'open'].includes(createCompanyParamRaw)
        if (!shouldOpenCreateCompanyModal) return
        if (loading) return

        autoCreateCompanyHandledRef.current = createCompanyParamRaw
        setIsDetailOpen(false)
        setSelectedCompany(null)
        setModalCompanyData(null)
        setIsCompanyModalOpen(true)

        const nextParams = new URLSearchParams(searchParams.toString())
        nextParams.delete('createCompany')
        nextParams.delete('newCompany')
        nextParams.delete('createLead')
        nextParams.delete('newLead')
        if (isLegacyLeadCreateFlow && !nextParams.get('view')) {
            nextParams.set('view', 'leads')
        }
        const query = nextParams.toString()
        router.replace(query ? `/empresas?${query}` : '/empresas')
    }, [searchParams, loading, router])

    useEffect(() => {
        const onClickOutside = (event: MouseEvent) => {
            const target = event.target as Node
            if (!createMenuRef.current?.contains(target)) {
                setIsCreateMenuOpen(false)
            }
        }
        document.addEventListener('mousedown', onClickOutside)
        return () => document.removeEventListener('mousedown', onClickOutside)
    }, [])

    const handleCompanyViewChange = (nextView: CompanyUnifiedView) => {
        setCompanyView(nextView)
        const params = new URLSearchParams(searchParams.toString())
        if (nextView === 'all') params.delete('view')
        else params.set('view', nextView)
        const query = params.toString()
        router.replace(query ? `/empresas?${query}` : '/empresas')
    }

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
            'lead_origin',
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
        if (!error) return false
        const code = String(error?.code || error?.error?.code || '').trim()
        const msg = String(parseSupabaseError(error, '') || '').toLowerCase()
        return code === '42703'
            || (
                msg.includes('column')
                && (
                    msg.includes('does not exist')
                    || msg.includes('could not find')
                    || msg.includes('unknown')
                    || msg.includes('schema cache')
                )
            )
    }

    const isMissingTableError = (error: any) => {
        if (!error) return false
        const code = String(error?.code || error?.error?.code || '').trim()
        const msg = String(parseSupabaseError(error, '') || '').toLowerCase()
        return code === '42P01'
            || code === 'PGRST205'
            || (msg.includes('relation') && msg.includes('does not exist'))
            || (msg.includes('table') && msg.includes('does not exist'))
    }

    const isForeignKeyViolationError = (error: any) => {
        const code = String(error?.code || error?.error?.code || '').trim()
        const msg = String(parseSupabaseError(error, '') || '').toLowerCase()
        return code === '23503'
            || (msg.includes('foreign key') && msg.includes('constraint'))
    }

    const isPermissionDeniedError = (error: any) => {
        const code = String(error?.code || error?.error?.code || '').trim()
        const msg = String(parseSupabaseError(error, '') || '').toLowerCase()
        return code === '42501'
            || msg.includes('permission denied')
            || msg.includes('row-level security')
            || msg.includes('rls')
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
        const primaryContactName = normalizeOptionalText((companyData as any).contacto_principal_nombre)
        const primaryContactEmail = normalizeEmailInput((companyData as any).contacto_principal_email)
        const primaryContactPhone = normalizePhoneInput((companyData as any).contacto_principal_telefono)
        const sellerName = auth.profile?.full_name || auth.username || auth.user.email?.split('@')[0] || null

        const payload: Record<string, any> = {
            nombre_empresa: String(companyData.nombre || '').trim(),
            nombre_contacto: primaryContactName,
            correos: primaryContactEmail ? [primaryContactEmail] : [],
            telefonos: primaryContactPhone ? [primaryContactPhone] : [],
            ubicacion: normalizeOptionalText(companyData.ubicacion),
            giro_empresa: normalizeOptionalText(companyData.industria) || 'Sin clasificar',
            vendedor_id: auth.user.id,
            vendedor_name: sellerName,
            notas: normalizeOptionalText(companyData.descripcion)
        }

        if (preLeadColumns.empresa_id) payload.empresa_id = companyId
        if (preLeadColumns.industria_id) payload.industria_id = companyData.industria_id || null
        if (preLeadColumns.tamano) payload.tamano = Number(companyData.tamano || 1)
        if (preLeadColumns.tamano_fuente) payload.tamano_fuente = normalizeCompanySizeSourceValue((companyData as any).tamano_fuente)
        if (preLeadColumns.tamano_confianza) payload.tamano_confianza = normalizeCompanySizeConfidenceValue((companyData as any).tamano_confianza)
        if (preLeadColumns.tamano_senal_principal) payload.tamano_senal_principal = normalizeOptionalText((companyData as any).tamano_senal_principal)
        if (preLeadColumns.website) payload.website = normalizeOptionalText(companyData.website)
        if (preLeadColumns.logo_url) payload.logo_url = normalizeOptionalText(companyData.logo_url)
        if (preLeadColumns.lead_origin) payload.lead_origin = normalizeLeadOriginValue((companyData as any).lead_origin) || 'sin_definir'
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
            const normalizedSearch = filterSearch.trim().toLocaleLowerCase('es-MX')
            const companyTags = normalizeCompanyTags(company.tags)
            const responsibleName = String(company.responsible_name || company.registered_by_name || '').trim() || 'Sin responsable'
            const matchesSearch = !normalizedSearch ||
                company.nombre?.toLocaleLowerCase('es-MX').includes(normalizedSearch) ||
                company.ubicacion?.toLocaleLowerCase('es-MX').includes(normalizedSearch) ||
                responsibleName.toLocaleLowerCase('es-MX').includes(normalizedSearch) ||
                companyTags.some((tag) => tag.toLocaleLowerCase('es-MX').includes(normalizedSearch))

            const companyIndustries = company.industrias || (company.industria ? [company.industria] : [])
            const matchesIndustry = filterIndustry === 'All' || companyIndustries.includes(filterIndustry)
            const matchesSize = filterSize === 'All' || company.tamano?.toString() === filterSize
            const matchesTag = filterTag === 'All' || companyHasTag(companyTags, filterTag)
            const matchesResponsible = filterResponsible === 'All' || responsibleName === filterResponsible
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
            const unifiedStage = resolveCompanyUnifiedStage(company)
            const matchesCompanyView =
                companyView === 'all' ||
                (companyView === 'suspects' && unifiedStage === 'suspect') ||
                (companyView === 'leads' && unifiedStage === 'lead') ||
                (companyView === 'clients' && unifiedStage === 'client')
            const companyCreatedAtMs = parseCompanyCreatedAtMs(company)
            const isRecentByCreationDate =
                Number.isFinite(companyCreatedAtMs) &&
                (currentTimestamp - Number(companyCreatedAtMs) <= RECENT_COMPANY_WINDOW_MS)
            const matchesRecentFilter =
                filterRecent === 'all' ||
                (filterRecent === 'recent_24h' && isRecentByCreationDate)

            return matchesSearch
                && matchesIndustry
                && matchesSize
                && matchesTag
                && matchesResponsible
                && matchesLocationGroup
                && matchesMonterreyMunicipality
                && matchesCompanyView
                && matchesRecentFilter
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
        filterTag,
        filterResponsible,
        filterLocation,
        filterMonterreyMunicipality,
        selectedLocationKey,
        selectedMonterreyMunicipalityKey,
        companyView,
        filterRecent,
        currentTimestamp,
        sortBy
    ])

    const recentCompanies = useMemo(() => {
        return [...filteredCompanies]
            .filter((company) => {
                const createdAtMs = parseCompanyCreatedAtMs(company)
                return Number.isFinite(createdAtMs) && (currentTimestamp - Number(createdAtMs) <= RECENT_COMPANY_WINDOW_MS)
            })
            .sort((a, b) => Number(parseCompanyCreatedAtMs(b)) - Number(parseCompanyCreatedAtMs(a)))
    }, [filteredCompanies, currentTimestamp])

    const highlightedCompanyId = useMemo(() => {
        const mostRecent = recentCompanies[0]
        if (!mostRecent) return null
        const createdAtMs = parseCompanyCreatedAtMs(mostRecent)
        if (!Number.isFinite(createdAtMs)) return null
        if (currentTimestamp - Number(createdAtMs) > NEW_COMPANY_HIGHLIGHT_WINDOW_MS) return null
        const companyId = String(mostRecent.id || '').trim()
        return companyId || null
    }, [recentCompanies, currentTimestamp])

    const filteredStageCounts = useMemo(() => {
        const counts = { suspects: 0, leads: 0, clients: 0 }
        for (const company of filteredCompanies) {
            const stage = resolveCompanyUnifiedStage(company)
            if (stage === 'suspect') counts.suspects += 1
            else if (stage === 'client') counts.clients += 1
            else counts.leads += 1
        }
        return counts
    }, [filteredCompanies])

    const missingRequiredActionCount = useMemo(() => {
        return filteredCompanies.reduce((count, company) => {
            const stage = resolveCompanyUnifiedStage(company)
            const processProjects = Number(company.processProjects || 0)
            const hasPendingAction = company.next_action_type === 'task' || company.next_action_type === 'meeting'
            const requiresNextAction = stage !== 'client' || processProjects > 0
            return requiresNextAction && !hasPendingAction ? count + 1 : count
        }, 0)
    }, [filteredCompanies])

    // Get unique data for filter dropdowns
    const uniqueIndustries = useMemo(() => {
        const industries = new Set(
            companies
                .flatMap(c => c.industrias || (c.industria ? [c.industria] : []))
                .filter((i): i is string => !!i)
        )
        return Array.from(industries).sort()
    }, [companies])

    const uniqueTags = useMemo(() => {
        const tags = new Set(
            companies
                .flatMap((company) => normalizeCompanyTags(company.tags))
                .filter(Boolean)
        )
        return Array.from(tags).sort((a, b) => a.localeCompare(b, 'es'))
    }, [companies])

    const uniqueResponsibles = useMemo(() => {
        const responsibles = new Set(
            companies
                .map((company) => String(company.responsible_name || company.registered_by_name || '').trim() || 'Sin responsable')
                .filter(Boolean)
        )
        return Array.from(responsibles).sort((a, b) => a.localeCompare(b, 'es'))
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

        // Fetch all leads to associate.
        // Some environments have different owner fields in `clientes` (owner_* vs vendedor_*),
        // so we try progressively simpler selects before failing.
        const companyIndustriesPromise = supabase
            .from('company_industries')
            .select('empresa_id, industria_id, is_primary, industrias(name)')

        const leadSelectAttempts = [
            'id, empresa_id, etapa, created_at, updated_at, owner_id, owner_username',
            'id, empresa_id, etapa, created_at, updated_at, owner_id:vendedor_id, owner_username:vendedor_name',
            'id, empresa_id, etapa, created_at, owner_id:vendedor_id, owner_username:vendedor_name',
            'id, empresa_id, etapa, created_at'
        ]

        let leadsError: any = null
        let leadsDataRaw: any[] = []
        for (const selectAttempt of leadSelectAttempts) {
            const { data, error } = await (supabase.from('clientes') as any).select(selectAttempt)
            if (error) {
                leadsError = error
                continue
            }
            leadsDataRaw = Array.isArray(data) ? data : []
            leadsError = null
            break
        }

        const companyIndustriesResult = await companyIndustriesPromise

        type LeadLite = {
            id: number
            empresa_id: string | null
            etapa: string | null
            created_at: string
            updated_at: string | null
            owner_id: string | null
            owner_username: string | null
        }
        type TaskLite = {
            lead_id: number
            titulo: string | null
            fecha_vencimiento: string
            estado: 'pendiente' | 'completada' | 'atrasada' | 'cancelada'
            prioridad: 'baja' | 'media' | 'alta'
            updated_at: string
        }
        type MeetingLite = {
            lead_id: number
            title: string | null
            start_time: string
            status: string | null
            meeting_status: string | null
            confirmation_timestamp: string | null
            updated_at: string
        }

        const leads = (leadsDataRaw || [])
            .map((leadRow: any): LeadLite | null => {
                const id = Number(leadRow?.id)
                if (!Number.isFinite(id)) return null
                const createdAt = String(leadRow?.created_at || '').trim()
                const updatedAt = String(leadRow?.updated_at || '').trim()
                return {
                    id,
                    empresa_id: leadRow?.empresa_id ? String(leadRow.empresa_id) : null,
                    etapa: leadRow?.etapa ? String(leadRow.etapa) : null,
                    created_at: createdAt || updatedAt || new Date(0).toISOString(),
                    updated_at: updatedAt || null,
                    owner_id: leadRow?.owner_id ? String(leadRow.owner_id) : null,
                    owner_username: leadRow?.owner_username ? String(leadRow.owner_username) : null
                }
            })
            .filter((lead): lead is LeadLite => Boolean(lead))
        const companyIndustries = (companyIndustriesResult.data || []) as any[]

        if (leadsError) {
            console.error('Error fetching leads:', parseSupabaseError(leadsError, 'No se pudieron cargar leads de clientes.'))
        }
        if (companyIndustriesResult.error) {
            console.warn('company_industries is not available yet, using primary industry only:', companyIndustriesResult.error.message)
        }

        const leadIds = Array.from(new Set(
            leads
                .map((lead) => Number(lead.id))
                .filter((leadId) => Number.isFinite(leadId))
        ))

        let tasks: TaskLite[] = []
        let meetings: MeetingLite[] = []
        if (leadIds.length > 0) {
            const [{ data: tasksData, error: tasksError }, { data: meetingsData, error: meetingsError }] = await Promise.all([
                (supabase.from('tareas') as any)
                    .select('lead_id, titulo, fecha_vencimiento, estado, prioridad, updated_at')
                    .in('lead_id', leadIds),
                (supabase.from('meetings') as any)
                    .select('lead_id, title, start_time, status, meeting_status, confirmation_timestamp, updated_at')
                    .in('lead_id', leadIds)
            ])

            tasks = (tasksData || []) as TaskLite[]
            meetings = (meetingsData || []) as MeetingLite[]

            if (tasksError) {
                console.warn('Could not load task context for companies table:', tasksError.message)
            }
            if (meetingsError) {
                console.warn('Could not load meeting context for companies table:', meetingsError.message)
            }
        }

        const tasksByLeadId = new Map<number, TaskLite[]>()
        for (const task of tasks) {
            const leadId = Number(task.lead_id)
            if (!Number.isFinite(leadId)) continue
            const bucket = tasksByLeadId.get(leadId) || []
            bucket.push(task)
            tasksByLeadId.set(leadId, bucket)
        }

        const meetingsByLeadId = new Map<number, MeetingLite[]>()
        for (const meeting of meetings) {
            const leadId = Number(meeting.lead_id)
            if (!Number.isFinite(leadId)) continue
            const bucket = meetingsByLeadId.get(leadId) || []
            bucket.push(meeting)
            meetingsByLeadId.set(leadId, bucket)
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
        const registrantIds = Array.from(new Set(
            [
                ...companies.flatMap((company) => [
                    String(company?.created_by || '').trim(),
                    String(company?.owner_id || '').trim()
                ].filter(Boolean)),
                ...leads.map((lead) => String(lead.owner_id || '').trim()).filter(Boolean)
            ]
        ))
        const registrantNameById = new Map<string, string>()
        if (registrantIds.length > 0) {
            const { data: registrantProfiles, error: registrantProfilesError } = await (supabase.from('profiles') as any)
                .select('id, full_name, username')
                .in('id', registrantIds)

            if (registrantProfilesError) {
                console.warn('Could not load company registrant profiles:', registrantProfilesError.message)
            } else {
                ;((registrantProfiles || []) as any[]).forEach((profileRow) => {
                    const id = String(profileRow?.id || '').trim()
                    if (!id) return
                    const displayName = String(profileRow?.full_name || '').trim() || String(profileRow?.username || '').trim()
                    if (displayName) registrantNameById.set(id, displayName)
                })
            }
        }
        const nowMs = Date.now()
        const companiesWithProjects = companies.map(company => {
            const companyLeads = leads.filter((lead) => String(lead.empresa_id || '') === String(company.id || ''))
            const industriesForCompany = industryMapByCompany[company.id]
            const industryNames = Array.from(new Set(industriesForCompany?.names || []))
            const industryIds = Array.from(new Set(industriesForCompany?.ids || []))
            const primaryIndustryName = industriesForCompany?.primaryName || company.industria || null
            const primaryIndustryId = industriesForCompany?.primaryId || company.industria_id || null
            const registeredByIdRaw = String(company.created_by || company.owner_id || '').trim()
            const registeredById = registeredByIdRaw || null
            const fallbackOwnerUsername = String(company.owner_username || '').trim() || null
            const registeredByName = (
                (registeredById ? registrantNameById.get(registeredById) : null)
                || fallbackOwnerUsername
                || null
            )
            const companyLeadIds = Array.from(new Set(
                companyLeads
                    .map((lead) => Number(lead.id))
                    .filter((leadId) => Number.isFinite(leadId))
            ))
            const companyTasks = companyLeadIds.flatMap((leadId) => tasksByLeadId.get(leadId) || [])
            const companyMeetings = companyLeadIds.flatMap((leadId) => meetingsByLeadId.get(leadId) || [])

            const latestAssignedLead = [...companyLeads]
                .filter((lead) => String(lead.owner_id || '').trim() || String(lead.owner_username || '').trim())
                .sort((a, b) => {
                    const bMs = parseDateMs(b.updated_at || b.created_at)
                    const aMs = parseDateMs(a.updated_at || a.created_at)
                    return bMs - aMs
                })[0]
            const responsibleOwnerId = String(latestAssignedLead?.owner_id || '').trim()
            const responsibleName = (
                (responsibleOwnerId ? registrantNameById.get(responsibleOwnerId) : null)
                || String(latestAssignedLead?.owner_username || '').trim()
                || registeredByName
                || null
            )

            const pendingTasks = [...companyTasks]
                .filter((task) => task.estado === 'pendiente' || task.estado === 'atrasada')
                .sort((a, b) => parseDateMs(a.fecha_vencimiento) - parseDateMs(b.fecha_vencimiento))
            const nextTask = pendingTasks[0] || null

            const upcomingMeetings = [...companyMeetings]
                .filter((meeting) => {
                    const startMs = parseDateMs(meeting.start_time)
                    if (!Number.isFinite(startMs)) return false
                    if (startMs < nowMs) return false
                    const status = String(meeting.status || '').toLowerCase()
                    const meetingStatus = String(meeting.meeting_status || '').toLowerCase()
                    return status !== 'cancelled' && (meetingStatus === 'scheduled' || meetingStatus === 'pending_confirmation' || !meetingStatus)
                })
                .sort((a, b) => parseDateMs(a.start_time) - parseDateMs(b.start_time))
            const nextMeeting = upcomingMeetings[0] || null

            const nextTaskMs = parseDateMs(nextTask?.fecha_vencimiento || null)
            const nextMeetingMs = parseDateMs(nextMeeting?.start_time || null)
            let nextActionType: 'task' | 'meeting' | 'none' = 'none'
            let nextActionLabel: string | null = null
            let nextActionAt: string | null = null
            if (nextTask && (!Number.isFinite(nextMeetingMs) || nextTaskMs <= nextMeetingMs)) {
                nextActionType = 'task'
                nextActionLabel = `Tarea: ${String(nextTask.titulo || '').trim() || 'Seguimiento'}`
                nextActionAt = nextTask.fecha_vencimiento
            } else if (nextMeeting) {
                nextActionType = 'meeting'
                nextActionLabel = `Junta: ${String(nextMeeting.title || '').trim() || 'Seguimiento'}`
                nextActionAt = nextMeeting.start_time
            }

            const latestTaskContactMs = [...companyTasks]
                .filter((task) => task.estado === 'completada')
                .reduce((max, task) => {
                    const timestamp = parseDateMs(task.updated_at || task.fecha_vencimiento)
                    return Number.isFinite(timestamp) ? Math.max(max, timestamp) : max
                }, Number.NEGATIVE_INFINITY)

            const latestMeetingContactMs = [...companyMeetings]
                .filter((meeting) => {
                    const status = String(meeting.status || '').toLowerCase()
                    const meetingStatus = String(meeting.meeting_status || '').toLowerCase()
                    return status === 'completed'
                        || status === 'cancelled'
                        || meetingStatus === 'held'
                        || meetingStatus === 'not_held'
                        || meetingStatus === 'cancelled'
                })
                .reduce((max, meeting) => {
                    const timestamp =
                        parseDateMs(meeting.confirmation_timestamp)
                        || parseDateMs(meeting.updated_at)
                        || parseDateMs(meeting.start_time)
                    return Number.isFinite(timestamp) ? Math.max(max, timestamp) : max
                }, Number.NEGATIVE_INFINITY)

            const latestContactMs = Math.max(latestTaskContactMs, latestMeetingContactMs)
            const lastContactAt = Number.isFinite(latestContactMs)
                ? new Date(latestContactMs).toISOString()
                : null

            const activeProjects = companyLeads.filter(l => l.etapa === 'Cerrado Ganado').length
            const processProjects = companyLeads.filter(l =>
                l.etapa !== 'Cerrado Ganado' && l.etapa !== 'Cerrado Perdido'
            ).length
            const lostProjects = companyLeads.filter(l => l.etapa === 'Cerrado Perdido').length
            const heldMeetingsCount = companyMeetings.filter((meeting) => {
                const meetingStatus = String(meeting.meeting_status || '').toLowerCase()
                const status = String(meeting.status || '').toLowerCase()
                if (meetingStatus === 'held') return true
                if (meetingStatus === 'not_held' || meetingStatus === 'cancelled') return false
                return status === 'completed'
            }).length

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
                tags: normalizeCompanyTags(company.tags),
                activeProjects,
                processProjects,
                lostProjects,
                held_meetings_count: heldMeetingsCount,
                antiquityDate: company.created_at,
                projectAntiquityDate,
                registered_by_id: registeredById,
                registered_by_name: registeredByName,
                responsible_name: responsibleName,
                next_action_type: nextActionType,
                next_action_label: nextActionLabel,
                next_action_at: nextActionAt,
                last_contact_at: lastContactAt
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

    const handleQuickUpdateCompanyTags = async (companyId: string, tags: string[]) => {
        const normalizedCompanyId = String(companyId || '').trim()
        if (!normalizedCompanyId) return

        const normalizedTags = normalizeCompanyTags(tags)
        const { error } = await (supabase.from('empresas') as any)
            .update({ tags: normalizedTags })
            .eq('id', normalizedCompanyId)

        if (error) {
            const parsed = parseSupabaseError(error, 'No se pudieron actualizar los tags.')
            console.error('Error updating company tags:', parsed, error)
            alert(`Error al actualizar tags: ${parsed}`)
            throw error
        }

        setCompanies((prev) => prev.map((company) => (
            String(company.id || '').trim() === normalizedCompanyId
                ? { ...company, tags: normalizedTags }
                : company
        )))

        setSelectedCompany((prev) => (
            prev && String(prev.id || '').trim() === normalizedCompanyId
                ? { ...prev, tags: normalizedTags }
                : prev
        ))
    }

    const confirmDelete = async () => {
        if (!companyToDelete) return
        const companyId = companyToDelete
        const companyToDeleteData = companies.find((company) => company.id === companyId)
        try {
            const linkedLeadsRes = await (supabase.from('clientes') as any)
                .select('id, etapa')
                .eq('empresa_id', companyId)
            const linkedLeadsError = linkedLeadsRes?.error
            const linkedLeads = Array.isArray(linkedLeadsRes?.data) ? linkedLeadsRes.data : []
            if (linkedLeadsError && !isUnknownColumnError(linkedLeadsError) && !isMissingTableError(linkedLeadsError)) {
                throw linkedLeadsError
            }

            const unlinkLeadsRes = await (supabase.from('clientes') as any)
                .update({ empresa_id: null })
                .eq('empresa_id', companyId)

            if (unlinkLeadsRes?.error) {
                const notClosedLeads = linkedLeads.filter((lead: any) => !isClosedLeadStage(lead?.etapa))
                if (notClosedLeads.length > 0) {
                    alert(`No se puede eliminar esta empresa porque tiene ${notClosedLeads.length} lead(s) activos. Cierra o elimina esos leads primero.`)
                    return
                }

                const deleteClosedLeadsRes = await (supabase.from('clientes') as any)
                    .delete()
                    .eq('empresa_id', companyId)
                if (deleteClosedLeadsRes?.error && !isUnknownColumnError(deleteClosedLeadsRes.error)) {
                    throw deleteClosedLeadsRes.error
                }
            }

            const preLeadDetachRes = await (supabase.from('pre_leads') as any)
                .update({ empresa_id: null })
                .eq('empresa_id', companyId)
            if (preLeadDetachRes?.error && !isUnknownColumnError(preLeadDetachRes.error) && !isMissingTableError(preLeadDetachRes.error)) {
                console.warn('No se pudo desvincular pre_leads de la empresa a eliminar:', preLeadDetachRes.error)
            }

            let deleteResult = await (supabase.from('empresas') as any)
                .delete()
                .eq('id', companyId)

            if (deleteResult?.error && isForeignKeyViolationError(deleteResult.error)) {
                const cleanupTables = [
                    'company_contacts',
                    'company_industries',
                    'company_notes',
                    'empresa_proyecto_asignaciones',
                    'seller_badges',
                    'company_enrichment_jobs'
                ]

                for (const table of cleanupTables) {
                    const cleanupRes = await (supabase.from(table) as any)
                        .delete()
                        .eq('empresa_id', companyId)
                    if (cleanupRes?.error && !isMissingTableError(cleanupRes.error) && !isUnknownColumnError(cleanupRes.error)) {
                        console.warn(`No se pudo limpiar dependencias en ${table}:`, cleanupRes.error)
                    }
                }

                deleteResult = await (supabase.from('empresas') as any)
                    .delete()
                    .eq('id', companyId)
            }

            if (deleteResult?.error) {
                const parsed = parseSupabaseError(deleteResult.error, 'Operación bloqueada por dependencias o permisos.')
                console.error('Error deleting company:', {
                    code: (deleteResult.error as any)?.code,
                    message: (deleteResult.error as any)?.message,
                    details: (deleteResult.error as any)?.details,
                    hint: (deleteResult.error as any)?.hint,
                    parsed,
                    raw: deleteResult.error
                })

                if (isPermissionDeniedError(deleteResult.error)) {
                    alert('No tienes permisos para eliminar empresas en esta base (RLS).')
                    return
                }

                alert(`Error al eliminar la empresa: ${parsed}`)
                return
            }

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
        } catch (error: any) {
            console.error('Unexpected error deleting company:', error)
            alert(`Error al eliminar la empresa: ${parseSupabaseError(error, 'No se pudo completar la eliminación.')}`)
        } finally {
            setIsDeleteModalOpen(false)
            setCompanyToDelete(null)
        }
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

    const syncPrimaryCompanyContact = async (companyId: string, companyData: CompanyData) => {
        const safeCompanyId = String(companyId || '').trim()
        if (!safeCompanyId) return

        const contactNameRaw = String((companyData as any).contacto_principal_nombre || '').trim()
        const contactEmail = normalizeEmailInput((companyData as any).contacto_principal_email)
        const contactPhone = normalizePhoneInput((companyData as any).contacto_principal_telefono)

        if (!contactNameRaw && !contactEmail && !contactPhone) return

        const contactName = contactNameRaw || 'Contacto principal'

        const { data: activeRows, error: activeRowsError } = await (supabase.from('company_contacts') as any)
            .select('id, full_name, email, phone, is_primary')
            .eq('empresa_id', safeCompanyId)
            .eq('is_active', true)
            .order('is_primary', { ascending: false })
            .order('updated_at', { ascending: false })

        if (activeRowsError) {
            console.warn('No se pudo consultar company_contacts para sincronizar contacto principal:', activeRowsError)
            return
        }

        const activeList = Array.isArray(activeRows) ? activeRows : []
        const currentPrimary = activeList.find((row: any) => Boolean(row?.is_primary)) || activeList[0] || null

        if (currentPrimary?.id) {
            const updatePayload: Record<string, any> = {
                full_name: contactName,
                email: contactEmail,
                phone: contactPhone,
                is_primary: true,
                is_active: true
            }
            const { error: updateError } = await (supabase.from('company_contacts') as any)
                .update(updatePayload)
                .eq('id', String(currentPrimary.id))
                .eq('empresa_id', safeCompanyId)

            if (updateError) {
                console.warn('No se pudo actualizar contacto principal de empresa:', updateError)
                return
            }

            const { error: demoteError } = await (supabase.from('company_contacts') as any)
                .update({ is_primary: false })
                .eq('empresa_id', safeCompanyId)
                .eq('is_active', true)
                .neq('id', String(currentPrimary.id))
            if (demoteError) {
                console.warn('No se pudo normalizar contactos primarios de empresa:', demoteError)
            }
            return
        }

        const { data: insertedRow, error: insertError } = await (supabase.from('company_contacts') as any)
            .insert({
                empresa_id: safeCompanyId,
                full_name: contactName,
                email: contactEmail,
                phone: contactPhone,
                is_primary: true,
                is_active: true,
                source: 'manual',
                created_by: auth.user?.id || null
            })
            .select('id')
            .single()

        if (insertError) {
            console.warn('No se pudo crear contacto principal de empresa:', insertError)
            return
        }

        const insertedId = String(insertedRow?.id || '').trim()
        if (!insertedId) return

        const { error: demoteError } = await (supabase.from('company_contacts') as any)
            .update({ is_primary: false })
            .eq('empresa_id', safeCompanyId)
            .eq('is_active', true)
            .neq('id', insertedId)
        if (demoteError) {
            console.warn('No se pudo normalizar contactos primarios de empresa tras inserción:', demoteError)
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
        const operationalContextPayload: any = {
            alcance_empresa: normalizeCompanyScopeValue((companyData as any).alcance_empresa) || 'por_definir',
            sede_objetivo: normalizeOptionalText((companyData as any).sede_objetivo)
        }
        const sizeAssessmentPayload: any = {
            tamano_fuente: normalizeCompanySizeSourceValue((companyData as any).tamano_fuente),
            tamano_confianza: normalizeCompanySizeConfidenceValue((companyData as any).tamano_confianza),
            tamano_senal_principal: normalizeOptionalText((companyData as any).tamano_senal_principal)
        }
        const leadOriginPayload: any = {
            lead_origin: normalizeLeadOriginValue((companyData as any).lead_origin) || 'sin_definir'
        }
        const basePayloadWithSizeAssessment = {
            ...basePayload,
            ...sizeAssessmentPayload
        }
        const normalizedTags = normalizeCompanyTags(companyData.tags)
        const profileFieldsPayloadWithoutTags: any = {
            logo_url: normalizeOptionalText(companyData.logo_url),
            descripcion: normalizeOptionalText(companyData.descripcion)
        }
        const profileFieldsPayloadWithTags: any = {
            ...profileFieldsPayloadWithoutTags,
            tags: normalizedTags
        }
        const profileFieldsPayloadWithTagsAndSites: any = {
            ...profileFieldsPayloadWithTags,
            sedes_sugeridas: normalizeSiteSuggestions((companyData as any).sedes_sugeridas)
        }
        const websiteValue = ((companyData as any)?.website ?? (companyData as any)?.sitio_web ?? '').toString().trim() || null
        const companyPhoneValue = normalizeOptionalText((companyData as any)?.telefono)
        const companyEmailValue = normalizeEmailInput((companyData as any)?.email_empresa ?? (companyData as any)?.email)

        const getPayloadCandidates = () => {
            const candidates: any[] = []
            const corePayloadVariants = [
                { ...basePayloadWithSizeAssessment, ...operationalContextPayload, ...profileFieldsPayloadWithTagsAndSites },
                { ...basePayload, ...operationalContextPayload, ...profileFieldsPayloadWithTagsAndSites },
                { ...basePayloadWithSizeAssessment, ...operationalContextPayload, ...profileFieldsPayloadWithTags },
                { ...basePayload, ...operationalContextPayload, ...profileFieldsPayloadWithTags },
                { ...basePayloadWithSizeAssessment, ...profileFieldsPayloadWithTagsAndSites },
                { ...basePayload, ...profileFieldsPayloadWithTagsAndSites },
                { ...basePayloadWithSizeAssessment, ...profileFieldsPayloadWithTags },
                { ...basePayload, ...profileFieldsPayloadWithTags },
                { ...basePayloadWithSizeAssessment, ...operationalContextPayload, ...profileFieldsPayloadWithoutTags },
                { ...basePayload, ...operationalContextPayload, ...profileFieldsPayloadWithoutTags },
                { ...basePayloadWithSizeAssessment, ...profileFieldsPayloadWithoutTags },
                { ...basePayload, ...profileFieldsPayloadWithoutTags },
                { ...basePayloadWithSizeAssessment, ...operationalContextPayload },
                { ...basePayload, ...operationalContextPayload },
                basePayloadWithSizeAssessment,
                basePayload
            ]
            for (const corePayload of corePayloadVariants) {
                const corePayloadVariantsWithLeadOrigin = [
                    { ...corePayload, ...leadOriginPayload },
                    corePayload
                ]

                for (const corePayloadWithLeadOrigin of corePayloadVariantsWithLeadOrigin) {
                    const corePayloadVariantsWithPhone = [
                        { ...corePayloadWithLeadOrigin, telefono: companyPhoneValue },
                        corePayloadWithLeadOrigin
                    ]

                    for (const payloadVariantWithPhone of corePayloadVariantsWithPhone) {
                        const payloadVariantsWithEmail = companyEmailValue
                            ? [
                                { ...payloadVariantWithPhone, email: companyEmailValue },
                                payloadVariantWithPhone
                            ]
                            : [payloadVariantWithPhone]

                        for (const payloadVariant of payloadVariantsWithEmail) {
                            if (websiteValue !== null) {
                                candidates.push({ ...payloadVariant, website: websiteValue })
                                candidates.push({ ...payloadVariant, sitio_web: websiteValue })
                            }
                            candidates.push(payloadVariant)
                        }
                    }
                }
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

            try {
                await syncPrimaryCompanyContact(modalCompanyData.id!, companyData)
            } catch (contactError: any) {
                console.error('Error syncing primary company contact:', contactError)
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
                        tags: normalizeCompanyTags(companyData.tags || prev.tags),
                        website: companyData.website,
                        telefono: companyData.telefono,
                        email_empresa: (companyData as any).email_empresa || (companyData as any).email || null,
                        contacto_principal_nombre: (companyData as any).contacto_principal_nombre || null,
                        contacto_principal_email: (companyData as any).contacto_principal_email || null,
                        contacto_principal_telefono: (companyData as any).contacto_principal_telefono || null,
                        lead_origin: normalizeLeadOriginValue((companyData as any).lead_origin) || prev.lead_origin || 'sin_definir',
                        alcance_empresa: normalizeCompanyScopeValue((companyData as any).alcance_empresa) || prev.alcance_empresa || 'por_definir',
                        sede_objetivo: ((companyData as any).sede_objetivo ?? prev.sede_objetivo ?? null),
                        sedes_sugeridas: normalizeSiteSuggestions((companyData as any).sedes_sugeridas || prev.sedes_sugeridas || [])
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
                    await syncPrimaryCompanyContact(createdCompany.id, companyData)
                }
            } catch (contactError: any) {
                console.error('Error syncing primary company contact on create:', contactError)
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
                                    Empresas
                                </h1>
                                <p className='font-medium' style={{ color: 'var(--text-secondary)' }}>
                                    Vista unificada: suspects, leads y clientes en una sola mesa de trabajo.
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
                        <div ref={createMenuRef} className='relative'>
                            <button
                                type='button'
                                onClick={() => setIsCreateMenuOpen((prev) => !prev)}
                                className='inline-flex items-center gap-2 px-7 py-3 bg-[#2048FF] text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:bg-[#1b3de6] hover:scale-105 active:scale-95 transition-all cursor-pointer'
                                aria-haspopup='menu'
                                aria-expanded={isCreateMenuOpen}
                                aria-label='Crear nuevo registro'
                            >
                                <Plus size={14} strokeWidth={2.4} />
                                Nuevo
                                <ChevronDown
                                    size={14}
                                    strokeWidth={2.4}
                                    className={`transition-transform duration-200 ${isCreateMenuOpen ? 'rotate-180' : ''}`}
                                />
                            </button>

                            {isCreateMenuOpen && (
                                <div className='absolute right-0 top-[120%] min-w-[290px] rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-2xl z-[120] overflow-hidden p-1.5'>
                                    <button
                                        type='button'
                                        onClick={() => {
                                            setIsCreateMenuOpen(false)
                                            setModalCompanyData(null)
                                            setIsCompanyModalOpen(true)
                                        }}
                                        className='w-full text-left px-4 py-3 rounded-xl border border-transparent hover:border-[var(--card-border)] hover:bg-[var(--hover-bg)] transition-colors cursor-pointer'
                                    >
                                        <p className='text-sm font-black' style={{ color: 'var(--text-primary)' }}>Nueva Empresa (Suspect)</p>
                                        <p className='text-[11px] font-semibold' style={{ color: 'var(--text-secondary)' }}>Registrar empresa nueva en la mesa unificada</p>
                                    </button>

                                    <button
                                        type='button'
                                        onClick={() => {
                                            setIsCreateMenuOpen(false)
                                            router.push('/empresas?view=leads&createCompany=1')
                                        }}
                                        className='w-full text-left px-4 py-3 rounded-xl border border-transparent hover:border-[var(--card-border)] hover:bg-[var(--hover-bg)] transition-colors cursor-pointer'
                                    >
                                        <p className='text-sm font-black' style={{ color: 'var(--text-primary)' }}>Nuevo Lead</p>
                                        <p className='text-[11px] font-semibold' style={{ color: 'var(--text-secondary)' }}>Abrir captura de lead en la vista de leads</p>
                                    </button>
                                </div>
                            )}
                        </div>
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
                                    <h2 className='text-xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>Mesa Unificada de Empresas</h2>
                                    <p className='text-[10px] font-bold uppercase tracking-[0.2em] opacity-60' style={{ color: 'var(--text-secondary)' }}>Un solo flujo comercial</p>
                                </div>
                            </div>

                            <div className='flex items-center gap-3'>
                                <div className='ah-count-chip'>
                                    <span className='ah-count-chip-number'>{filteredCompanies.length}</span>
                                    <div className='ah-count-chip-meta'>
                                        <span className='ah-count-chip-title'>Empresas</span>
                                        <span className='ah-count-chip-subtitle'>Filtradas</span>
                                    </div>
                                </div>
                                <div className='ah-count-chip'>
                                    <span className='ah-count-chip-number'>{filteredStageCounts.suspects}</span>
                                    <div className='ah-count-chip-meta'>
                                        <span className='ah-count-chip-title'>Suspects</span>
                                        <span className='ah-count-chip-subtitle'>Empresas</span>
                                    </div>
                                </div>
                                <div className='ah-count-chip'>
                                    <span className='ah-count-chip-number'>{filteredStageCounts.leads}</span>
                                    <div className='ah-count-chip-meta'>
                                        <span className='ah-count-chip-title'>Leads</span>
                                        <span className='ah-count-chip-subtitle'>Empresas</span>
                                    </div>
                                </div>
                                <div className='ah-count-chip'>
                                    <span className='ah-count-chip-number'>{filteredStageCounts.clients}</span>
                                    <div className='ah-count-chip-meta'>
                                        <span className='ah-count-chip-title'>Clientes</span>
                                        <span className='ah-count-chip-subtitle'>Empresas</span>
                                    </div>
                                </div>
                                <div className='ah-count-chip'>
                                    <span className='ah-count-chip-number'>{recentCompanies.length}</span>
                                    <div className='ah-count-chip-meta'>
                                        <span className='ah-count-chip-title'>Recientes</span>
                                        <span className='ah-count-chip-subtitle'>Últimas 24h</span>
                                    </div>
                                </div>
                                <div
                                    className='ah-count-chip'
                                    style={{
                                        background: missingRequiredActionCount > 0
                                            ? 'color-mix(in srgb, #dc2626 10%, var(--card-bg))'
                                            : undefined,
                                        borderColor: missingRequiredActionCount > 0
                                            ? 'color-mix(in srgb, #dc2626 30%, var(--card-border))'
                                            : undefined
                                    }}
                                >
                                    <span
                                        className='ah-count-chip-number'
                                        style={{
                                            color: missingRequiredActionCount > 0
                                                ? 'color-mix(in srgb, #b91c1c 84%, var(--text-primary))'
                                                : undefined
                                        }}
                                    >
                                        {missingRequiredActionCount}
                                    </span>
                                    <div className='ah-count-chip-meta'>
                                        <span className='ah-count-chip-title'>Acción Pendiente</span>
                                        <span className='ah-count-chip-subtitle'>Obligatoria</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className='ah-table-toolbar'>
                            <div className='flex flex-col gap-3 w-full'>
                                {missingRequiredActionCount > 0 && (
                                    <div
                                        className='rounded-xl border px-3 py-2'
                                        style={{
                                            background: 'color-mix(in srgb, #dc2626 8%, var(--card-bg))',
                                            borderColor: 'color-mix(in srgb, #dc2626 26%, var(--card-border))'
                                        }}
                                    >
                                        <p
                                            className='text-[11px] font-bold'
                                            style={{ color: 'color-mix(in srgb, #991b1b 82%, var(--text-primary))' }}
                                        >
                                            Hay {missingRequiredActionCount} empresa(s) con acción obligatoria pendiente. Registra junta o tarea para mantener continuidad comercial.
                                        </p>
                                    </div>
                                )}

                                <div className='flex flex-wrap items-center justify-between gap-3'>
                                    <div className='inline-flex flex-wrap items-center gap-2 p-1 rounded-xl border border-[var(--card-border)] bg-[var(--hover-bg)]'>
                                        {([
                                            { key: 'all', label: 'Todas' },
                                            { key: 'suspects', label: 'Suspects' },
                                            { key: 'leads', label: 'Leads' },
                                            { key: 'clients', label: 'Clientes' }
                                        ] as const).map((option) => {
                                            const selected = companyView === option.key
                                            return (
                                                <button
                                                    key={option.key}
                                                    type='button'
                                                    onClick={() => handleCompanyViewChange(option.key)}
                                                    className='px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-[0.16em] transition-all cursor-pointer'
                                                    style={selected
                                                        ? {
                                                            background: 'color-mix(in srgb, #2048FF 16%, var(--card-bg))',
                                                            borderColor: 'color-mix(in srgb, #2048FF 42%, var(--card-border))',
                                                            color: 'color-mix(in srgb, #2048FF 88%, var(--text-primary))'
                                                        }
                                                        : {
                                                            background: 'var(--card-bg)',
                                                            borderColor: 'var(--card-border)',
                                                            color: 'var(--text-secondary)'
                                                        }}
                                                >
                                                    {option.label}
                                                </button>
                                            )
                                        })}
                                    </div>

                                    <button
                                        type='button'
                                        onClick={() => setShowAdvancedFilters((prev) => !prev)}
                                        className='px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-[0.16em] transition-all cursor-pointer'
                                        style={{
                                            background: showAdvancedFilters
                                                ? 'color-mix(in srgb, #2563eb 14%, var(--card-bg))'
                                                : 'var(--card-bg)',
                                            borderColor: showAdvancedFilters
                                                ? 'color-mix(in srgb, #2563eb 36%, var(--card-border))'
                                                : 'var(--card-border)',
                                            color: showAdvancedFilters
                                                ? 'color-mix(in srgb, #1d4ed8 86%, var(--text-primary))'
                                                : 'var(--text-secondary)'
                                        }}
                                    >
                                        {showAdvancedFilters ? 'Ocultar filtros avanzados' : 'Mostrar filtros avanzados'}
                                    </button>
                                </div>

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
                                </div>

                                {showAdvancedFilters && (
                                    <div className='ah-table-controls'>
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
                                            value={filterTag}
                                            onChange={(e) => setFilterTag(e.target.value)}
                                            className='ah-select-control'
                                        >
                                            <option value="All">Tags: Todas</option>
                                            {uniqueTags.map((tag) => (
                                                <option key={tag} value={tag}>{tag}</option>
                                            ))}
                                        </select>
                                        <select
                                            value={filterResponsible}
                                            onChange={(e) => setFilterResponsible(e.target.value)}
                                            className='ah-select-control'
                                        >
                                            <option value="All">Responsable: Todos</option>
                                            {uniqueResponsibles.map((responsible) => (
                                                <option key={responsible} value={responsible}>{responsible}</option>
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
                                            value={filterRecent}
                                            onChange={(e) => setFilterRecent(e.target.value as 'all' | 'recent_24h')}
                                            className='ah-select-control'
                                        >
                                            <option value="all">Recientes: Todas</option>
                                            <option value="recent_24h">Recientes: Últimas 24h</option>
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
                                )}
                            </div>
                        </div>
                    </div>

                    <div className='flex-1 overflow-x-auto custom-scrollbar'>
                        <CompaniesTable
                            companies={filteredCompanies}
                            recentCompanies={recentCompanies}
                            highlightedCompanyId={highlightedCompanyId}
                            isEditingMode={isEditingMode}
                            currentUserProfile={auth.profile}
                            onRowClick={handleRowClick}
                            onEdit={handleEditClick}
                            onDelete={handleDeleteClick}
                            onQuickUpdateTags={handleQuickUpdateCompanyTags}
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
                message="¿Estás seguro de que deseas eliminar esta empresa? Los leads/suspects vinculados se intentarán conservar desvinculados; en bases legacy, podrían eliminarse si todos están cerrados para completar la operación."
                isDestructive={true}
            />
        </div>
    )
}
