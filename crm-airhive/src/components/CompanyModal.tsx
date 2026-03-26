'use client'

import { CSSProperties, useState, useEffect, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import ImageCropper from './ImageCropper'
import CatalogSelect from './CatalogSelect'
import ConfirmModal from './ConfirmModal'
import { ensureCompanyLocationCatalogItem, getCatalogs } from '@/app/actions/catalogs'
import { previewCompanyAutofillByWebsite } from '@/app/actions/company-enrichment'
import { useAuth } from '@/lib/auth'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'
import { MONTERREY_MUNICIPALITY_OPTIONS, getLocationBaseForSelector, getSavedLocationCatalogLabels, normalizeLocationLabel, resolveLocationAgainstExistingLabels } from '@/lib/locationUtils'
import {
    COMPANY_SIZE_CONFIDENCE_OPTIONS,
    COMPANY_SIZE_SOURCE_OPTIONS,
    getCompanySizeGuide,
    getCompanySizeTierVisuals,
    normalizeCompanySizeConfidenceValue,
    normalizeCompanySizeEvidenceText,
    normalizeCompanySizeSourceValue
} from '@/lib/companySizeUtils'
import { normalizeCompanyTags } from '@/lib/companyTags'
import type { CompanyEnrichmentSuggestion, CompanyScopeValue } from '@/lib/companyEnrichment'

export type CompanyData = {
    id?: string
    nombre: string
    tamano: number // 1-5
    tamano_confianza?: string | null
    tamano_fuente?: string | null
    tamano_senal_principal?: string | null
    ubicacion: string
    logo_url: string
    industria: string
    industria_id?: string
    industria_ids?: string[]
    industrias?: string[]
    tags?: string[]
    website: string
    telefono?: string
    descripcion: string
    alcance_empresa?: CompanyScopeValue | null
    sede_objetivo?: string | null
    sedes_sugeridas?: string[]
}

const isPendingIndustryOptionId = (value?: string | null) => String(value || '').startsWith('pending_industry:')
const sanitizeIndustryOptionIds = (ids: string[] | undefined) =>
    (ids || []).filter((id) => !!id && !isPendingIndustryOptionId(id))
const normalizeWebsiteCandidate = (value: unknown) => {
    const trimmed = String(value || '').trim()
    if (!trimmed) return ''
    if (/^https?:\/\//i.test(trimmed)) return trimmed
    return `https://${trimmed}`
}
const isLikelyWebsiteCandidate = (value: string) => value.includes('.') && value.length >= 6
const normalizeComparisonText = (value: unknown) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

const COMPANY_SCOPE_OPTIONS: Array<{ value: CompanyScopeValue; label: string; description: string }> = [
    { value: 'local', label: 'Local', description: 'Operación principal en Monterrey / área metropolitana.' },
    { value: 'nacional', label: 'Nacional', description: 'Opera en México en múltiples sedes o ciudades.' },
    { value: 'internacional', label: 'Internacional', description: 'Opera en varios países o estructura global.' },
    { value: 'por_definir', label: 'Por definir', description: 'Aún no hay claridad del alcance real.' }
]

const normalizeCompanyScopeValue = (value: unknown): CompanyScopeValue | null => {
    const normalized = String(value || '').trim().toLowerCase()
    if (
        normalized === 'local'
        || normalized === 'nacional'
        || normalized === 'internacional'
        || normalized === 'por_definir'
    ) {
        return normalized as CompanyScopeValue
    }
    return null
}

const normalizeSiteSuggestions = (value: unknown): string[] => {
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

const MEXICO_LOCAL_SITE_MARKERS = [
    'monterrey',
    'nuevo leon',
    'santa catarina',
    'guadalupe',
    'apodaca',
    'san nicolas',
    'escobedo',
    'garcia',
    'pesqueria',
    'santiago',
    'allende',
    'cadereyta',
    'mexico',
    'ciudad de mexico',
    'cdmx',
    'guadalajara',
    'queretaro',
    'puebla',
    'saltillo',
    'ramos arizpe',
    'san luis potosi',
    'mexicali',
    'tijuana',
    'leon',
    'celaya'
].map((value) => normalizeComparisonText(value))

const isLikelyMexicoLocalSite = (value: unknown) => {
    const normalized = normalizeComparisonText(value)
    if (!normalized) return false
    return MEXICO_LOCAL_SITE_MARKERS.some((marker) => marker && normalized.includes(marker))
}

interface CompanyModalProps {
    isOpen: boolean
    onClose: () => void
    onSave: (data: CompanyData) => Promise<void>
    initialData?: CompanyData | null
    mode?: 'create' | 'edit'
    companies?: CompanyData[]
    overlayClassName?: string
    overlayStyle?: CSSProperties
}

export default function CompanyModal({
    isOpen,
    onClose,
    onSave,
    initialData,
    mode = 'create',
    companies = [],
    overlayClassName = '',
    overlayStyle
}: CompanyModalProps) {
    useBodyScrollLock(isOpen)
    const auth = useAuth()
    const isAdmin = auth.profile?.role === 'admin'
    const [formData, setFormData] = useState<CompanyData>({
        nombre: '',
        tamano: 1,
        tamano_confianza: 'media',
        tamano_fuente: 'inferencia_comercial',
        tamano_senal_principal: '',
        ubicacion: '',
        logo_url: '',
        industria: '',
        industria_id: '',
        industria_ids: [],
        industrias: [],
        tags: [],
        website: '',
        telefono: '',
        descripcion: '',
        alcance_empresa: 'por_definir',
        sede_objetivo: '',
        sedes_sugeridas: []
    })
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [uploadingLogo, setUploadingLogo] = useState(false)
    const [supabase] = useState(() => createClient())
    const [catalogs, setCatalogs] = useState<Record<string, any[]>>({})

    // Cropping state
    const [tempImage, setTempImage] = useState<string | null>(null)
    const [isCropping, setIsCropping] = useState(false)

    // Autocomplete state
    const [filteredCompanies, setFilteredCompanies] = useState<CompanyData[]>([])
    const [showSuggestions, setShowSuggestions] = useState(false)
    const [tagDraft, setTagDraft] = useState('')
    const [isAutofillPreviewLoading, setIsAutofillPreviewLoading] = useState(false)
    const [isAutofillConfirmOpen, setIsAutofillConfirmOpen] = useState(false)
    const [autofillSuggestion, setAutofillSuggestion] = useState<CompanyEnrichmentSuggestion | null>(null)
    const [lastWebsiteCheckedForAutofill, setLastWebsiteCheckedForAutofill] = useState('')
    const overlayScrollRef = useRef<HTMLDivElement>(null)
    const modalBodyScrollRef = useRef<HTMLDivElement>(null)
    const wrapperRef = useRef<HTMLDivElement>(null)
    const toInputString = (value: unknown) => (value == null ? '' : String(value))
    const isEditMode = mode === 'edit' || Boolean(initialData?.id)

    const normalizeCompanyForForm = (raw: any): CompanyData => {
        const industriaIds = Array.isArray(raw?.industria_ids)
            ? raw.industria_ids.filter(Boolean)
            : (raw?.industria_id ? [raw.industria_id] : [])
        const industrias = Array.isArray(raw?.industrias)
            ? raw.industrias.filter(Boolean)
            : (raw?.industria ? [raw.industria] : [])

        return {
            id: raw?.id,
            nombre: toInputString(raw?.nombre),
            tamano: Number(raw?.tamano || 1),
            tamano_confianza: toInputString(raw?.tamano_confianza) || 'media',
            tamano_fuente: toInputString(raw?.tamano_fuente) || 'inferencia_comercial',
            tamano_senal_principal: toInputString(raw?.tamano_senal_principal),
            ubicacion: toInputString(raw?.ubicacion),
            logo_url: toInputString(raw?.logo_url),
            industria: toInputString(raw?.industria),
            industria_id: raw?.industria_id || '',
            industria_ids: industriaIds,
            industrias,
            tags: normalizeCompanyTags(raw?.tags),
            website: toInputString(raw?.website ?? raw?.sitio_web),
            telefono: toInputString(raw?.telefono ?? raw?.phone),
            descripcion: toInputString(raw?.descripcion),
            alcance_empresa: normalizeCompanyScopeValue(raw?.alcance_empresa) || 'por_definir',
            sede_objetivo: toInputString(raw?.sede_objetivo),
            sedes_sugeridas: normalizeSiteSuggestions(raw?.sedes_sugeridas)
        }
    }

    useEffect(() => {
        if (isOpen && initialData) {
            setFormData(normalizeCompanyForForm(initialData))
        } else if (isOpen && !initialData) {
            setFormData({
                nombre: '',
                tamano: 1,
                tamano_confianza: 'media',
                tamano_fuente: 'inferencia_comercial',
                tamano_senal_principal: '',
                ubicacion: '',
                logo_url: '',
                industria: '',
                industria_id: '',
                industria_ids: [],
                industrias: [],
                tags: [],
                website: '',
                telefono: '',
                descripcion: '',
                alcance_empresa: 'por_definir',
                sede_objetivo: '',
                sedes_sugeridas: []
            })
        }

        if (isOpen) {
            setTagDraft('')
            setAutofillSuggestion(null)
            setIsAutofillConfirmOpen(false)
            setIsAutofillPreviewLoading(false)
            setLastWebsiteCheckedForAutofill(normalizeWebsiteCandidate(initialData?.website || ''))
            fetchCatalogs()

            window.requestAnimationFrame(() => {
                overlayScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' })
                modalBodyScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' })
            })
        }
    }, [isOpen, initialData, mode])

    const autofillFieldLabels = useMemo(() => {
        if (!autofillSuggestion) return []
        return [
            autofillSuggestion.nombre ? 'nombre' : null,
            autofillSuggestion.industria ? 'industria' : null,
            autofillSuggestion.ubicacion ? 'ubicacion' : null,
            autofillSuggestion.telefono ? 'telefono de empresa' : null,
            autofillSuggestion.alcance_empresa ? 'alcance' : null,
            autofillSuggestion.sede_objetivo_sugerida ? 'sede objetivo' : null,
            (autofillSuggestion.sedes_sugeridas || []).length > 0 ? 'sedes sugeridas' : null,
            autofillSuggestion.tamano ? 'tamano' : null,
            (autofillSuggestion.empleados_estimados_min || autofillSuggestion.empleados_estimados_max) ? 'estimacion de empleados' : null
        ].filter((field): field is string => Boolean(field))
    }, [autofillSuggestion])

    const autofillEmployeeEstimateLabel = useMemo(() => {
        if (!autofillSuggestion) return ''
        const min = Number(autofillSuggestion.empleados_estimados_min || 0)
        const max = Number(autofillSuggestion.empleados_estimados_max || 0)
        const hasMin = Number.isFinite(min) && min > 0
        const hasMax = Number.isFinite(max) && max > 0
        if (!hasMin && !hasMax) return ''

        const formatter = new Intl.NumberFormat('es-MX')
        if (hasMin && hasMax) {
            if (min === max) return formatter.format(min)
            return `${formatter.format(min)} - ${formatter.format(max)}`
        }
        if (hasMin) return `>= ${formatter.format(min)}`
        return `<= ${formatter.format(max)}`
    }, [autofillSuggestion])

    const availableTagSuggestions = useMemo(() => {
        return normalizeCompanyTags(
            companies.flatMap((company) => normalizeCompanyTags(company.tags))
        )
    }, [companies])

    const filteredTagSuggestions = useMemo(() => {
        const selected = new Set((formData.tags || []).map((tag) => tag.toLocaleLowerCase('es-MX')))
        const normalizedDraft = tagDraft.trim().toLocaleLowerCase('es-MX')
        return availableTagSuggestions
            .filter((tag) => {
                const key = tag.toLocaleLowerCase('es-MX')
                if (selected.has(key)) return false
                if (!normalizedDraft) return true
                return key.includes(normalizedDraft)
            })
            .slice(0, 10)
    }, [availableTagSuggestions, formData.tags, tagDraft])

    const visibleSiteSuggestions = useMemo(() => {
        const suggestions = normalizeSiteSuggestions(formData.sedes_sugeridas || [])
        if (suggestions.length === 0) return suggestions
        const normalizedScope = normalizeCompanyScopeValue(formData.alcance_empresa)
        const hasMexicoContext = suggestions.some((site) => isLikelyMexicoLocalSite(site))
            || isLikelyMexicoLocalSite(formData.ubicacion)
            || isLikelyMexicoLocalSite(formData.sede_objetivo)
        if (normalizedScope === 'internacional' && hasMexicoContext) {
            const localSuggestions = suggestions.filter((site) => isLikelyMexicoLocalSite(site))
            if (localSuggestions.length > 0) return localSuggestions
        }
        return suggestions
    }, [formData.sedes_sugeridas, formData.alcance_empresa, formData.ubicacion, formData.sede_objetivo])

    const fetchCatalogs = async () => {
        const res = await getCatalogs()
        if (res.success && res.data) {
            setCatalogs(res.data)
        } else if (res.error) {
            console.error('Error fetching catalogs:', res.error)
            // Only alert if it's specifically about industrias failing
            if (res.error.includes('industrias')) {
                alert('Aviso: No se pudieron cargar las industrias. Verifica que la tabla exista en Supabase.')
            }
        }
    }

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setShowSuggestions(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [wrapperRef])

    const handleNombreChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value
        setFormData({ ...formData, nombre: value })

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

    const selectCompany = (company: CompanyData) => {
        setFormData(normalizeCompanyForForm(company))
        setShowSuggestions(false)
    }

    const addCompanyTag = (value: string) => {
        const draftParts = String(value ?? '').split(/[,\n;]+/g)
        setFormData((prev) => ({
            ...prev,
            tags: normalizeCompanyTags([...(prev.tags || []), ...draftParts])
        }))
        setTagDraft('')
    }

    const removeCompanyTag = (tagToRemove: string) => {
        const target = String(tagToRemove || '').trim().toLocaleLowerCase('es-MX')
        if (!target) return
        setFormData((prev) => ({
            ...prev,
            tags: (prev.tags || []).filter((tag) => tag.toLocaleLowerCase('es-MX') !== target)
        }))
    }

    const toggleIndustrySelection = (industryId: string) => {
        if (isPendingIndustryOptionId(industryId)) return
        const ids = formData.industria_ids || []
        const isSelected = ids.includes(industryId)
        const nextIds = isSelected
            ? ids.filter(id => id !== industryId)
            : [...ids, industryId]

        const selectedIds = nextIds.includes(formData.industria_id || '')
            ? nextIds
            : (formData.industria_id ? [formData.industria_id, ...nextIds] : nextIds)

        const uniqueIds = Array.from(new Set(selectedIds))
        const names = uniqueIds
            .map(id => catalogs.industrias?.find(i => i.id === id)?.name)
            .filter((n): n is string => !!n)

        setFormData(prev => ({
            ...prev,
            industria_ids: uniqueIds,
            industrias: names
        }))
    }

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) {
            return
        }
        const file = e.target.files[0]
        const reader = new FileReader()
        reader.onload = () => {
            setTempImage(reader.result as string)
            setIsCropping(true)
        }
        reader.readAsDataURL(file)
    }

    // Location helpers
    const getLocationBase = (loc: string) => {
        return getLocationBaseForSelector(loc)
    }

    const handleLocationBaseChange = (base: string) => {
        const savedLocationOptions = getSavedLocationCatalogLabels((catalogs.company_locations || []) as any[])
        if (savedLocationOptions.includes(base)) {
            setFormData({ ...formData, ubicacion: base })
            return
        }
        if (base === 'Otra') {
            setFormData({ ...formData, ubicacion: 'Otra' })
        } else if (base === 'Monterrey') {
            setFormData({ ...formData, ubicacion: 'Monterrey, ' })
        } else {
            setFormData({ ...formData, ubicacion: base })
        }
    }

    const handleConfirmCrop = async (croppedBlob: Blob) => {
        setIsCropping(false)
        setUploadingLogo(true)

        const fileName = `${Math.random()}.png`
        const filePath = `${fileName}`

        try {
            const { error: uploadError } = await supabase.storage
                .from('company-logos')
                .upload(filePath, croppedBlob)

            if (uploadError) {
                throw uploadError
            }

            const { data } = supabase.storage.from('company-logos').getPublicUrl(filePath)
            setFormData(prev => ({ ...prev, logo_url: data.publicUrl }))
        } catch (error) {
            console.error('Error uploading logo:', error)
            alert('Error al subir el logo')
        } finally {
            setUploadingLogo(false)
            setTempImage(null)
        }
    }

    const applyAutofillSuggestion = () => {
        if (!autofillSuggestion) return

        setFormData((prev) => {
            const suggestion = autofillSuggestion
            const normalizedSuggestedIndustry = normalizeComparisonText(suggestion.industria)
            const matchedIndustry = normalizedSuggestedIndustry
                ? (catalogs.industrias || []).find((industry) => normalizeComparisonText(industry?.name) === normalizedSuggestedIndustry)
                : null
            const inferredIndustryId = matchedIndustry?.id ? String(matchedIndustry.id) : ''
            const nextPrimaryIndustryId = inferredIndustryId || prev.industria_id || ''
            const nextIndustryIds = Array.from(new Set([
                ...(nextPrimaryIndustryId ? [nextPrimaryIndustryId] : []),
                ...sanitizeIndustryOptionIds(prev.industria_ids)
            ])).filter(Boolean)
            const nextIndustryNames = Array.from(new Set([
                ...(suggestion.industria ? [suggestion.industria] : []),
                ...(matchedIndustry?.name ? [String(matchedIndustry.name)] : []),
                ...(prev.industrias || [])
            ].map((name) => String(name || '').trim()).filter(Boolean)))

            const inferredSize = Number(suggestion.tamano || 0)
            const hasInferredSize = Number.isFinite(inferredSize) && inferredSize >= 1 && inferredSize <= 5
            const normalizedScope = normalizeCompanyScopeValue(suggestion.alcance_empresa)
            const mergedSiteSuggestions = normalizeSiteSuggestions([
                ...(suggestion.sedes_sugeridas || []),
                ...(prev.sedes_sugeridas || [])
            ])
            const suggestedProjectSite = String(suggestion.sede_objetivo_sugerida || '').trim()

            return {
                ...prev,
                nombre: suggestion.nombre || prev.nombre,
                tamano: hasInferredSize ? inferredSize : prev.tamano,
                tamano_confianza: hasInferredSize ? suggestion.tamano_confianza : prev.tamano_confianza,
                tamano_fuente: hasInferredSize ? suggestion.tamano_fuente : prev.tamano_fuente,
                tamano_senal_principal: hasInferredSize
                    ? (suggestion.tamano_senal_principal || prev.tamano_senal_principal)
                    : prev.tamano_senal_principal,
                ubicacion: suggestion.ubicacion || prev.ubicacion,
                telefono: suggestion.telefono || prev.telefono,
                industria: suggestion.industria || prev.industria,
                industria_id: nextPrimaryIndustryId,
                industria_ids: nextIndustryIds,
                industrias: nextIndustryNames,
                alcance_empresa: normalizedScope || prev.alcance_empresa || 'por_definir',
                sede_objetivo: suggestedProjectSite || prev.sede_objetivo || '',
                sedes_sugeridas: mergedSiteSuggestions
            }
        })
        setAutofillSuggestion(null)
        setIsAutofillConfirmOpen(false)
    }

    const handleWebsiteBlurForAutofill = async (force = false) => {
        const normalizedWebsite = normalizeWebsiteCandidate(formData.website)
        if (!normalizedWebsite) return
        if (!isLikelyWebsiteCandidate(normalizedWebsite)) return
        if (!force && normalizedWebsite === lastWebsiteCheckedForAutofill) return
        if (isAutofillPreviewLoading || isSubmitting) return

        const currentSize = Number(formData.tamano || 0)
        const normalizedSizeSource = String(formData.tamano_fuente || 'inferencia_comercial').trim().toLowerCase()
        const normalizedSizeConfidence = String(formData.tamano_confianza || 'media').trim().toLowerCase()
        const hasSizeSignal = String(formData.tamano_senal_principal || '').trim().length > 0
        const hasReliableManualSize =
            hasSizeSignal
            || normalizedSizeSource !== 'inferencia_comercial'
            || normalizedSizeConfidence === 'alta'
        const sizeForAutofill = force
            ? null
            : (!hasReliableManualSize && currentSize === 1)
                ? null
                : currentSize

        setLastWebsiteCheckedForAutofill(normalizedWebsite)
        setFormData((prev) => ({ ...prev, website: normalizedWebsite }))
        setIsAutofillPreviewLoading(true)

        try {
            const result = await previewCompanyAutofillByWebsite({
                website: normalizedWebsite,
                nombre: formData.nombre,
                ubicacion: formData.ubicacion,
                telefono: formData.telefono,
                industria: formData.industria,
                descripcion: formData.descripcion,
                tamano: sizeForAutofill
            })

            if (!result.success) {
                console.warn('No se pudo preparar autollenado desde website:', result.error)
                return
            }

            const suggestion = result.data?.suggestion
            if (!suggestion) return

            const hasSuggestedData = Boolean(
                suggestion.nombre
                || suggestion.industria
                || suggestion.ubicacion
                || suggestion.telefono
                || suggestion.alcance_empresa
                || suggestion.sede_objetivo_sugerida
                || (suggestion.sedes_sugeridas || []).length > 0
                || suggestion.tamano
                || suggestion.empleados_estimados_min
                || suggestion.empleados_estimados_max
            )
            if (!hasSuggestedData) return

            if (result.data?.normalizedWebsite) {
                setFormData((prev) => ({ ...prev, website: result.data.normalizedWebsite }))
            }

            setAutofillSuggestion(suggestion)
            setIsAutofillConfirmOpen(true)
        } catch (error) {
            console.warn('Error preparing website autofill:', error)
        } finally {
            setIsAutofillPreviewLoading(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        const normalizedName = toInputString(formData.nombre).trim()
        const normalizedWebsite = toInputString(formData.website).trim()

        if (!normalizedName) {
            alert('El nombre de la empresa es obligatorio.')
            return
        }
        if (!isEditMode && !normalizedWebsite) {
            alert('Para crear una empresa, primero captura su página web para que el agente complete más datos.')
            return
        }

        setIsSubmitting(true)
        try {
            const selfCompanyId = String(formData.id || initialData?.id || '')
            const catalogLocationLabels = ((catalogs.company_locations || []) as any[])
                .map((row) => String(row?.name || ''))
                .filter(Boolean)
            const localCompanyRows = (companies || []).map((company) => ({
                id: String(company.id || ''),
                ubicacion: company.ubicacion || ''
            }))

            const companyRowsForLocationValidation = localCompanyRows.length > 0
                ? localCompanyRows
                : await (async () => {
                    const { data, error } = await (supabase.from('empresas') as any)
                        .select('id, ubicacion')
                        .not('ubicacion', 'is', null)
                    if (error) {
                        console.warn('No se pudo cargar ubicaciones para validar duplicados:', error)
                        return [] as Array<{ id: string, ubicacion: string }>
                    }
                    return ((data || []) as any[]).map((row) => ({
                        id: String(row?.id || ''),
                        ubicacion: String(row?.ubicacion || '')
                    }))
                })()

            const { data: preLeadRows, error: preLeadRowsError } = await (supabase.from('pre_leads') as any)
                .select('id, ubicacion')
                .not('ubicacion', 'is', null)
            if (preLeadRowsError) {
                console.warn('No se pudo cargar ubicaciones de suspects para validar duplicados:', preLeadRowsError)
            }

            const existingLocationLabels = companyRowsForLocationValidation
                .filter((row) => !(selfCompanyId && row.id === selfCompanyId))
                .map((row) => row.ubicacion)
                .concat(((preLeadRows || []) as any[]).map((row) => String(row?.ubicacion || '')).filter(Boolean))
                .concat(catalogLocationLabels)

            const locationResolution = resolveLocationAgainstExistingLabels(formData.ubicacion, existingLocationLabels)
            if (locationResolution.duplicateVariantOf) {
                alert(
                    `Ubicación duplicada detectada.\n\n` +
                    `Ya existe registrada como: "${locationResolution.duplicateVariantOf}".\n` +
                    `Se guardará usando ese formato para evitar duplicados en filtros.`
                )
            }

            const sanitizedIndustryIds = sanitizeIndustryOptionIds(formData.industria_ids)
            const fallbackPrimary = sanitizedIndustryIds[0] || ''
            const rawPrimaryIndustryId = formData.industria_id || fallbackPrimary
            const primaryIndustryId = isPendingIndustryOptionId(rawPrimaryIndustryId) ? '' : rawPrimaryIndustryId
            const mergedIndustryIds = Array.from(new Set([
                ...(primaryIndustryId ? [primaryIndustryId] : []),
                ...sanitizedIndustryIds
            ])).filter(Boolean)
            const mergedIndustryNames = mergedIndustryIds
                .map(id => catalogs.industrias?.find(i => i.id === id)?.name)
                .filter((n): n is string => !!n)
            const primaryIndustryName = catalogs.industrias?.find(i => i.id === primaryIndustryId)?.name
                || formData.industria
                || 'Sin clasificar'

            await onSave({
                ...formData,
                nombre: normalizedName,
                website: normalizedWebsite,
                telefono: toInputString(formData.telefono).trim(),
                ubicacion: locationResolution.valueToPersist,
                alcance_empresa: normalizeCompanyScopeValue(formData.alcance_empresa) || 'por_definir',
                sede_objetivo: toInputString(formData.sede_objetivo).trim() || null,
                sedes_sugeridas: normalizeSiteSuggestions(formData.sedes_sugeridas),
                tamano_confianza: normalizeCompanySizeConfidenceValue(formData.tamano_confianza),
                tamano_fuente: normalizeCompanySizeSourceValue(formData.tamano_fuente),
                tamano_senal_principal: normalizeCompanySizeEvidenceText(formData.tamano_senal_principal),
                industria_id: primaryIndustryId,
                industria: primaryIndustryName,
                industria_ids: mergedIndustryIds,
                industrias: mergedIndustryNames,
                tags: normalizeCompanyTags(formData.tags)
            })

            if (locationResolution.valueToPersist) {
                const locationCatalogRes = await ensureCompanyLocationCatalogItem(locationResolution.valueToPersist)
                if (!locationCatalogRes.success) {
                    console.warn('No se pudo guardar ubicación en catálogo:', locationCatalogRes.error)
                }
            }
            onClose()
        } catch (error) {
            console.error('Error saving company:', error)
        } finally {
            setIsSubmitting(false)
        }
    }

    if (!isOpen) return null

    const savedLocationOptions = getSavedLocationCatalogLabels((catalogs.company_locations || []) as any[])
    const companySizeTiers = getCompanySizeTierVisuals((catalogs.company_sizes || []) as any[])
    const selectedSizeGuide = getCompanySizeGuide(formData.tamano)
    const normalizedCurrentLocation = normalizeLocationLabel(formData.ubicacion)
    const locationSelectorValue = normalizedCurrentLocation && savedLocationOptions.includes(normalizedCurrentLocation)
        ? normalizedCurrentLocation
        : getLocationBase(formData.ubicacion)

    return (
        <>
            <div ref={overlayScrollRef} className={`ah-modal-overlay transition-opacity ${overlayClassName}`.trim()} style={overlayStyle}>
                <div className='ah-modal-panel w-full max-w-2xl transform transition-all'>
                {/* Header */}
                <div className='ah-modal-header'>
                    <h2 className='ah-modal-title'>
                        Detalles de la Empresa
                    </h2>
                    <button
                        onClick={onClose}
                        className='ah-modal-close'
                    >
                        ✕
                    </button>
                </div>

                {/* Body */}
                <div ref={modalBodyScrollRef} className='p-8 overflow-y-auto custom-scrollbar space-y-6'>
                    <form id='company-form' onSubmit={handleSubmit} className='space-y-6'>
                        <div className='ah-required-note' role='note'>
                            <span className='ah-required-note-dot' aria-hidden='true' />
                            Para el nuevo flujo con agente, empieza por Nombre y Sitio Web.
                        </div>

                        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                            {/* Nombre with Autocomplete */}
                            <div className='space-y-1.5 relative' ref={wrapperRef}>
                                <label className='block text-sm font-medium text-[var(--text-primary)] ah-required-label'>
                                    Nombre de la Empresa <span className='ah-required-asterisk'>*</span>
                                </label>
                                <input
                                    type='text'
                                    required
                                    placeholder='ej. Tesla Inc.'
                                    value={toInputString(formData.nombre)}
                                    onChange={handleNombreChange}
                                    className='w-full px-3 py-2 border border-[var(--input-border)] bg-[var(--input-bg)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent text-[var(--text-primary)] placeholder-[var(--text-secondary)] transition-all'
                                    autoComplete="off"
                                />
                                {showSuggestions && filteredCompanies.length > 0 && (
                                    <div className='absolute z-[70] w-full mt-1 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-lg max-h-48 overflow-y-auto custom-scrollbar'>
                                        {filteredCompanies.map((company) => (
                                            <div
                                                key={company.id}
                                                onClick={() => selectCompany(company)}
                                                className='px-4 py-2 hover:bg-[var(--hover-bg)] cursor-pointer text-sm text-[var(--text-primary)] transition-colors border-b border-[var(--card-border)] last:border-b-0 text-left'
                                            >
                                                <div className='font-medium'>{company.nombre}</div>
                                                <div className='text-xs text-[var(--text-secondary)]'>{company.industria} • {company.ubicacion}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Website */}
                            <div className='space-y-1.5'>
                                <label className={`block text-sm font-medium text-[var(--text-primary)] ${!isEditMode ? 'ah-required-label' : ''}`}>
                                    Sitio Web {!isEditMode && <span className='ah-required-asterisk'>*</span>}
                                </label>
                                <input
                                    type='text'
                                    required={!isEditMode}
                                    placeholder='ej. https://empresa.com'
                                    value={toInputString(formData.website)}
                                    onChange={(e) => {
                                        setFormData({ ...formData, website: e.target.value })
                                        if (isAutofillConfirmOpen) {
                                            setIsAutofillConfirmOpen(false)
                                            setAutofillSuggestion(null)
                                        }
                                    }}
                                    onBlur={() => {
                                        void handleWebsiteBlurForAutofill()
                                    }}
                                    className='w-full px-3 py-2 border border-[var(--input-border)] bg-[var(--input-bg)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent text-[var(--text-primary)] transition-all'
                                />
                                <p className='text-[11px] text-[var(--text-secondary)]'>
                                    Este dato ayuda al agente a completar automáticamente tamaño, ubicación e industria.
                                </p>
                                <div className='flex flex-wrap items-center gap-2'>
                                    <button
                                        type='button'
                                        onClick={() => handleWebsiteBlurForAutofill(true)}
                                        disabled={isAutofillPreviewLoading || isSubmitting || !isLikelyWebsiteCandidate(normalizeWebsiteCandidate(formData.website))}
                                        className='px-3 py-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-700 text-[11px] font-black uppercase tracking-wider hover:bg-blue-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                                    >
                                        Autollenar con Asistente
                                    </button>
                                    {autofillSuggestion && (
                                        <button
                                            type='button'
                                            onClick={applyAutofillSuggestion}
                                            disabled={isAutofillPreviewLoading || isSubmitting}
                                            className='px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 text-[11px] font-black uppercase tracking-wider hover:bg-emerald-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                                        >
                                            Aplicar Ultima Sugerencia
                                        </button>
                                    )}
                                </div>
                                {autofillSuggestion && (
                                    <p className='text-[11px] text-[var(--text-secondary)] leading-relaxed'>
                                        Sugerencia actual:
                                        {autofillSuggestion.ubicacion ? ` Ubicacion ${autofillSuggestion.ubicacion}.` : ''}
                                        {autofillSuggestion.telefono ? ` Telefono ${autofillSuggestion.telefono}.` : ''}
                                        {autofillSuggestion.alcance_empresa ? ` Alcance ${autofillSuggestion.alcance_empresa}.` : ''}
                                        {autofillSuggestion.sede_objetivo_sugerida ? ` Sede sugerida ${autofillSuggestion.sede_objetivo_sugerida}.` : ''}
                                        {autofillSuggestion.industria ? ` Industria ${autofillSuggestion.industria}.` : ''}
                                        {autofillSuggestion.tamano ? ` Tamano ${autofillSuggestion.tamano}.` : ''}
                                        {autofillEmployeeEstimateLabel ? ` Empleados estimados ${autofillEmployeeEstimateLabel}.` : ''}
                                    </p>
                                )}
                                {isAutofillPreviewLoading && (
                                    <p className='text-[11px] font-semibold text-blue-600'>
                                        Analizando sitio web para sugerir datos...
                                    </p>
                                )}
                            </div>

                            {/* Telefono */}
                            <div className='space-y-1.5'>
                                <label className='block text-sm font-medium text-[var(--text-primary)]'>
                                    Teléfono de la Empresa
                                </label>
                                <input
                                    type='tel'
                                    placeholder='ej. +52 81 1234 5678'
                                    value={toInputString(formData.telefono)}
                                    onChange={(e) => setFormData((prev) => ({ ...prev, telefono: e.target.value }))}
                                    className='w-full px-3 py-2 border border-[var(--input-border)] bg-[var(--input-bg)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent text-[var(--text-primary)] transition-all'
                                />
                                <p className='text-[11px] text-[var(--text-secondary)]'>
                                    Opcional. El autollenado intentará detectar un teléfono corporativo desde el sitio web.
                                </p>
                            </div>

                            {/* Logo Upload Section */}
                            <div className='col-span-1 md:col-span-2 flex flex-col items-center justify-center space-y-4 p-6 border-2 border-dashed border-[var(--card-border)] rounded-xl bg-[var(--hover-bg)]'>
                                <div className='relative w-32 h-32 rounded-full overflow-hidden border-4 border-[var(--card-bg)] shadow-lg bg-[var(--input-bg)] flex items-center justify-center group'>
                                    {formData.logo_url ? (
                                        <img
                                            src={formData.logo_url}
                                            alt="Company Logo"
                                            className='w-full h-full object-cover'
                                        />
                                    ) : (
                                        <div className='text-4xl text-gray-300 font-bold'>
                                            🏢
                                        </div>
                                    )}
                                    <div className='absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer'>
                                        <span className='text-white text-xs font-medium'>Cambiar</span>
                                    </div>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleLogoUpload}
                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                        disabled={uploadingLogo}
                                    />
                                </div>
                                <div className='text-center'>
                                    <p className='text-sm font-medium text-[var(--text-primary)]'>Logotipo de la Empresa</p>
                                    <p className='text-xs text-[var(--text-secondary)] mt-1'>
                                        {uploadingLogo ? 'Subiendo...' : 'Click en la imagen para subir (PNG, JPG)'}
                                    </p>
                                </div>
                            </div>

                            {/* Industria */}
                            <CatalogSelect
                                label="Industria"
                                value={formData.industria_id || ''}
                                onChange={(val) => {
                                    const name = catalogs.industrias?.find(i => i.id === val)?.name || formData.industria || ''
                                    setFormData(prev => {
                                        const baseIndustryIds = sanitizeIndustryOptionIds(prev.industria_ids)
                                        const nextIndustryIds = isPendingIndustryOptionId(val)
                                            ? []
                                            : Array.from(new Set([val, ...baseIndustryIds])).filter(Boolean)
                                        const nextNames = nextIndustryIds
                                            .map(id => catalogs.industrias?.find(i => i.id === id)?.name)
                                            .filter((n): n is string => !!n)
                                        return {
                                            ...prev,
                                            industria_id: val,
                                            industria: name,
                                            industria_ids: nextIndustryIds,
                                            industrias: nextNames
                                        }
                                    })
                                }}
                                options={catalogs.industrias || []}
                                tableName="industrias"
                                onNewOption={(opt) => {
                                    setCatalogs(prev => ({
                                        ...prev,
                                        industrias: [...(prev.industrias || []), opt].sort((a, b) => a.name.localeCompare(b.name))
                                    }))
                                    if (isPendingIndustryOptionId(opt.id)) {
                                        setFormData(prev => ({
                                            ...prev,
                                            industria_id: opt.id,
                                            industria: opt.name,
                                            industria_ids: [],
                                            industrias: []
                                        }))
                                    }
                                }}
                                canDeleteOptions={isAdmin}
                                createContext={{
                                    module: 'company_modal',
                                    entityType: 'company',
                                    entityId: formData.id || '',
                                    entityName: formData.nombre || ''
                                }}
                                onDeleteOption={(deletedId) => {
                                    setCatalogs(prev => ({
                                        ...prev,
                                        industrias: (prev.industrias || []).filter(i => i.id !== deletedId)
                                    }))
                                    setFormData(prev => {
                                        const remainingIds = (prev.industria_ids || []).filter(id => id !== deletedId)
                                        const nextPrimary = prev.industria_id === deletedId ? (remainingIds[0] || '') : (prev.industria_id || '')
                                        const nextPrimaryName = catalogs.industrias?.find(i => i.id === nextPrimary)?.name || ''
                                        const remainingNames = remainingIds
                                            .map(id => catalogs.industrias?.find(i => i.id === id)?.name)
                                            .filter((n): n is string => !!n)
                                        return {
                                            ...prev,
                                            industria_id: nextPrimary,
                                            industria: nextPrimaryName,
                                            industria_ids: remainingIds,
                                            industrias: remainingNames
                                        }
                                    })
                                }}
                            />

                            <div className='col-span-1 md:col-span-2 space-y-2'>
                                <label className='block text-[10px] font-black uppercase tracking-wider text-[var(--text-primary)] opacity-60'>
                                    Industrias Secundarias
                                </label>
                                <p className='text-xs text-[var(--text-secondary)]'>
                                    Puedes asignar varias. La industria principal se conserva para reportes.
                                </p>
                                <div className='flex flex-wrap gap-2 p-3 border border-[var(--input-border)] rounded-xl bg-[var(--input-bg)] min-h-[52px]'>
                                    {(catalogs.industrias || []).map((industry) => {
                                        const selected = (formData.industria_ids || []).includes(industry.id) || formData.industria_id === industry.id
                                        const isPrimary = formData.industria_id === industry.id
                                        return (
                                            <button
                                                key={industry.id}
                                                type='button'
                                                onClick={() => toggleIndustrySelection(industry.id)}
                                                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${selected
                                                    ? 'bg-blue-500/15 text-blue-600 border-blue-500/30'
                                                    : 'bg-[var(--card-bg)] text-[var(--text-secondary)] border-[var(--card-border)] hover:border-blue-300'
                                                    }`}
                                            >
                                                {industry.name}{isPrimary ? ' (Principal)' : ''}
                                            </button>
                                        )
                                    })}
                                    {(catalogs.industrias || []).length === 0 && (
                                        <span className='text-xs text-[var(--text-secondary)]'>
                                            No hay industrias disponibles.
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className='col-span-1 md:col-span-2 space-y-2'>
                                <label className='block text-[10px] font-black uppercase tracking-wider text-[var(--text-primary)] opacity-60'>
                                    Etiquetas de seguimiento
                                </label>
                                <p className='text-xs text-[var(--text-secondary)]'>
                                    Crea tags personalizados como: Llamar, Evolucionar Q2, Prioridad.
                                </p>
                                <div className='flex flex-wrap gap-2 p-3 border border-[var(--input-border)] rounded-xl bg-[var(--input-bg)] min-h-[52px]'>
                                    {(formData.tags || []).map((tag) => (
                                        <span
                                            key={tag}
                                            className='inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black border border-blue-500/30 text-blue-600 bg-blue-500/10'
                                        >
                                            #{tag}
                                            <button
                                                type='button'
                                                onClick={() => removeCompanyTag(tag)}
                                                className='text-blue-700/80 hover:text-blue-900 text-xs leading-none cursor-pointer'
                                                aria-label={`Quitar etiqueta ${tag}`}
                                            >
                                                ✕
                                            </button>
                                        </span>
                                    ))}
                                    {(formData.tags || []).length === 0 && (
                                        <span className='text-xs text-[var(--text-secondary)]'>
                                            Sin tags todavía.
                                        </span>
                                    )}
                                </div>
                                <div className='flex flex-col md:flex-row gap-2'>
                                    <input
                                        type='text'
                                        value={tagDraft}
                                        onChange={(e) => setTagDraft(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ',' || e.key === ';') {
                                                e.preventDefault()
                                                addCompanyTag(tagDraft)
                                            }
                                        }}
                                        placeholder='Escribe un tag y presiona Enter'
                                        className='flex-1 px-3 py-2.5 border border-[var(--input-border)] bg-[var(--input-bg)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent text-sm font-bold text-[var(--text-primary)] transition-all'
                                    />
                                    <button
                                        type='button'
                                        onClick={() => addCompanyTag(tagDraft)}
                                        className='px-4 py-2.5 rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-700 text-xs font-black uppercase tracking-widest hover:bg-blue-500/20 transition-colors'
                                    >
                                        Agregar Tag
                                    </button>
                                </div>
                                {filteredTagSuggestions.length > 0 && (
                                    <div className='flex flex-wrap gap-2'>
                                        {filteredTagSuggestions.map((tag) => (
                                            <button
                                                key={tag}
                                                type='button'
                                                onClick={() => addCompanyTag(tag)}
                                                className='px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--text-secondary)] hover:border-blue-400 hover:text-blue-600 transition-colors'
                                            >
                                                + {tag}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Ubicación */}
                            <div className='space-y-4 col-span-1 md:col-span-2 p-6 bg-[var(--hover-bg)] rounded-2xl border border-[var(--card-border)]'>
                                <label className='block text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-primary)] opacity-60'>
                                    Localización de la Empresa
                                </label>
                                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                                    <div className='space-y-1.5'>
                                        <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase'>Ciudad / Estado</label>
                                        <select
                                            value={locationSelectorValue}
                                            onChange={(e) => handleLocationBaseChange(e.target.value)}
                                            className='w-full px-3 py-2.5 border border-[var(--input-border)] bg-[var(--input-bg)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent text-sm font-bold text-[var(--text-primary)] transition-all'
                                        >
                                            <option value="">Seleccionar Ciudad...</option>
                                            <option value="Monterrey">Monterrey</option>
                                            <option value="Guadalajara">Guadalajara</option>
                                            <option value="CDMX">Ciudad de México</option>
                                            <option value="Querétaro">Querétaro</option>
                                            {savedLocationOptions.length > 0 && (
                                                <optgroup label="Ubicaciones guardadas">
                                                    {savedLocationOptions.map((label) => (
                                                        <option key={label} value={label}>
                                                            {label}
                                                        </option>
                                                    ))}
                                                </optgroup>
                                            )}
                                            <option value="Otra">Otra (Manual)...</option>
                                        </select>
                                    </div>

                                    {getLocationBase(formData.ubicacion) === 'Monterrey' && (
                                        <div className='space-y-1.5 animate-in fade-in slide-in-from-left-2 duration-300'>
                                            <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase'>Municipio</label>
                                            <select
                                                value={toInputString(formData.ubicacion).split(', ')[1] || ''}
                                                onChange={(e) => setFormData({ ...formData, ubicacion: `Monterrey, ${e.target.value}` })}
                                                className='w-full px-3 py-2.5 border border-[var(--input-border)] bg-[var(--input-bg)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent text-sm font-bold text-[var(--text-primary)] transition-all'
                                            >
                                                <option value="">Seleccionar Municipio...</option>
                                                {MONTERREY_MUNICIPALITY_OPTIONS.map((municipality) => (
                                                    <option key={municipality.value} value={municipality.value}>
                                                        {municipality.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    {getLocationBase(formData.ubicacion) === 'Otra' && (
                                        <div className='space-y-1.5 animate-in fade-in slide-in-from-left-2 duration-300'>
                                            <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase'>Especifique Ubicación</label>
                                            <input
                                                type='text'
                                                autoFocus
                                                placeholder='ej. Laredo, TX'
                                                value={formData.ubicacion === 'Otra' ? '' : toInputString(formData.ubicacion)}
                                                onChange={(e) => setFormData({ ...formData, ubicacion: e.target.value })}
                                                className='w-full px-3 py-2.5 border border-[var(--input-border)] bg-[var(--input-bg)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent text-sm font-bold text-[var(--text-primary)] transition-all'
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className='space-y-4 col-span-1 md:col-span-2 p-6 bg-[var(--hover-bg)] rounded-2xl border border-[var(--card-border)]'>
                                <label className='block text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-primary)] opacity-60'>
                                    Contexto Operativo del Proyecto
                                </label>
                                <p className='text-xs text-[var(--text-secondary)]'>
                                    Define el alcance de la empresa por separado de la sede puntual donde se ejecutará el proyecto.
                                </p>
                                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                                    <div className='space-y-1.5'>
                                        <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-wider'>
                                            Alcance de la Empresa
                                        </label>
                                        <select
                                            value={normalizeCompanyScopeValue(formData.alcance_empresa) || 'por_definir'}
                                            onChange={(e) => setFormData((prev) => ({ ...prev, alcance_empresa: normalizeCompanyScopeValue(e.target.value) || 'por_definir' }))}
                                            className='w-full px-3 py-2.5 border border-[var(--input-border)] bg-[var(--input-bg)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent text-sm font-bold text-[var(--text-primary)] transition-all'
                                        >
                                            {COMPANY_SCOPE_OPTIONS.map((option) => (
                                                <option key={option.value} value={option.value}>
                                                    {option.label}
                                                </option>
                                            ))}
                                        </select>
                                        <p className='text-[11px] text-[var(--text-secondary)] leading-snug'>
                                            {COMPANY_SCOPE_OPTIONS.find((option) => option.value === (normalizeCompanyScopeValue(formData.alcance_empresa) || 'por_definir'))?.description}
                                        </p>
                                    </div>
                                    <div className='space-y-1.5'>
                                        <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-wider'>
                                            Sede Objetivo del Proyecto
                                        </label>
                                        <input
                                            type='text'
                                            value={toInputString(formData.sede_objetivo)}
                                            onChange={(e) => setFormData((prev) => ({ ...prev, sede_objetivo: e.target.value }))}
                                            placeholder='Ej. Planta Guadalupe (Monterrey)'
                                            className='w-full px-3 py-2.5 border border-[var(--input-border)] bg-[var(--input-bg)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent text-sm font-bold text-[var(--text-primary)] transition-all'
                                        />
                                        <p className='text-[11px] text-[var(--text-secondary)] leading-snug'>
                                            Si aún no está definido, puedes dejarlo vacío y seleccionar una sede sugerida.
                                        </p>
                                    </div>
                                </div>
                                {visibleSiteSuggestions.length > 0 && (
                                    <div className='space-y-2'>
                                        <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-wider'>
                                            Sedes Sugeridas por Autollenado
                                        </label>
                                        <div className='flex flex-wrap gap-2'>
                                            {visibleSiteSuggestions.map((site) => (
                                                <button
                                                    key={site}
                                                    type='button'
                                                    onClick={() => setFormData((prev) => ({ ...prev, sede_objetivo: site }))}
                                                    className='px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border border-emerald-500/30 text-emerald-700 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors'
                                                >
                                                    Usar: {site}
                                                </button>
                                            ))}
                                        </div>
                                        {(normalizeCompanyScopeValue(formData.alcance_empresa) === 'internacional') && (
                                            <p className='text-[11px] text-[var(--text-secondary)] leading-snug'>
                                                Para empresas internacionales se priorizan sedes locales en México para acelerar tu selección.
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Tamaño (Tiered Selection) */}
                            <div className='col-span-1 md:col-span-2 space-y-4 mt-2'>
                                <label className='block text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-primary)] opacity-60'>
                                    Categoría de Tamaño
                                </label>
                                <div className='grid grid-cols-2 md:grid-cols-5 gap-3'>
                                    {companySizeTiers.map((tier) => (
                                        <button
                                            key={tier.id}
                                            type='button'
                                            onClick={() => setFormData({ ...formData, tamano: tier.id })}
                                            className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all duration-300 group
                                                ${formData.tamano === tier.id
                                                    ? 'border-transparent ring-2 ring-offset-2 ring-[var(--card-bg)]'
                                                    : 'border-[var(--card-border)] bg-[var(--hover-bg)] grayscale opacity-40 hover:grayscale-0 hover:opacity-100 dark:border-gray-700'
                                                }
                                            `}
                                            style={{
                                                backgroundColor: formData.tamano === tier.id ? `${tier.color}25` : '',
                                                borderColor: formData.tamano === tier.id ? tier.color : '',
                                                boxShadow: formData.tamano === tier.id ? `0 10px 15px -3px ${tier.color}30` : '',
                                                // @ts-ignore
                                                '--tw-ring-color': tier.color
                                            }}
                                        >
                                            <span
                                                className={`text-xs font-black uppercase tracking-widest transition-colors duration-300
                                                    ${formData.tamano === tier.id ? '' : 'text-[var(--text-secondary)] group-hover:scale-105'}
                                                `}
                                                style={{ color: formData.tamano === tier.id ? tier.color : undefined }}
                                            >
                                                {tier.name}
                                            </span>
                                            <span
                                                className={`text-[10px] font-bold mt-1 transition-opacity duration-300
                                                    ${formData.tamano === tier.id ? 'opacity-100' : 'text-[var(--text-secondary)] opacity-40 group-hover:opacity-100'}
                                                `}
                                                style={{ color: formData.tamano === tier.id ? tier.color : undefined }}
                                            >
                                                Nivel {tier.id}
                                            </span>
                                        </button>
                                    ))}
                                </div>

                                <div className='rounded-2xl border border-[var(--card-border)] bg-[var(--hover-bg)] p-4 space-y-3'>
                                    <div className='flex flex-wrap items-center gap-2'>
                                        <span className='text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-secondary)]'>
                                            Guía anti-subjetividad
                                        </span>
                                        <span className='text-[10px] font-bold px-2 py-1 rounded-full border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--text-primary)]'>
                                            {selectedSizeGuide.title}
                                        </span>
                                    </div>
                                    <p className='text-xs text-[var(--text-secondary)]'>
                                        Clasifica por señales observables (estructura, cobertura, complejidad operativa) y no por intuición.
                                    </p>
                                    <div className='grid grid-cols-1 md:grid-cols-3 gap-2'>
                                        {selectedSizeGuide.signals.map((signal) => (
                                            <div key={signal} className='rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2 text-[11px] font-semibold text-[var(--text-primary)] leading-snug'>
                                                {signal}
                                            </div>
                                        ))}
                                    </div>
                                    <div className='rounded-xl border border-amber-300/40 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-700 dark:text-amber-300'>
                                        {selectedSizeGuide.warning}
                                    </div>
                                </div>

                                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                                    <div className='space-y-1.5'>
                                        <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-wider'>
                                            Fuente del Tamaño
                                        </label>
                                        <select
                                            value={toInputString(formData.tamano_fuente) || 'inferencia_comercial'}
                                            onChange={(e) => setFormData({ ...formData, tamano_fuente: e.target.value })}
                                            className='w-full px-3 py-2.5 border border-[var(--input-border)] bg-[var(--input-bg)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent text-sm font-bold text-[var(--text-primary)] transition-all'
                                        >
                                            {COMPANY_SIZE_SOURCE_OPTIONS.map((option) => (
                                                <option key={option.value} value={option.value}>
                                                    {option.label}
                                                </option>
                                            ))}
                                        </select>
                                        <p className='text-[11px] text-[var(--text-secondary)] leading-snug'>
                                            {COMPANY_SIZE_SOURCE_OPTIONS.find((option) => option.value === (formData.tamano_fuente || 'inferencia_comercial'))?.description}
                                        </p>
                                    </div>

                                    <div className='space-y-2'>
                                        <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-wider'>
                                            Confianza
                                        </label>
                                        <div className='grid grid-cols-3 gap-2'>
                                            {COMPANY_SIZE_CONFIDENCE_OPTIONS.map((option) => {
                                                const selected = (formData.tamano_confianza || 'media') === option.value
                                                return (
                                                    <button
                                                        key={option.value}
                                                        type='button'
                                                        onClick={() => setFormData({ ...formData, tamano_confianza: option.value })}
                                                        className={`px-3 py-2 rounded-xl border text-xs font-black uppercase tracking-wider transition-all ${selected
                                                            ? 'text-white border-transparent shadow-md'
                                                            : 'border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                                                            }`}
                                                        style={selected ? { backgroundColor: option.color } : undefined}
                                                    >
                                                        {option.label}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                        <p className='text-[11px] text-[var(--text-secondary)] leading-snug'>
                                            {COMPANY_SIZE_CONFIDENCE_OPTIONS.find((option) => option.value === (formData.tamano_confianza || 'media'))?.description}
                                        </p>
                                    </div>

                                    <div className='md:col-span-2 space-y-1.5'>
                                        <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-wider'>
                                            Señal principal usada
                                        </label>
                                        <input
                                            type='text'
                                            maxLength={280}
                                            value={toInputString(formData.tamano_senal_principal)}
                                            onChange={(e) => setFormData({ ...formData, tamano_senal_principal: e.target.value })}
                                            placeholder='Ej. 4 sucursales + operación en 3 ciudades + organigrama visible en web'
                                            className='w-full px-3 py-2.5 border border-[var(--input-border)] bg-[var(--input-bg)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent text-sm font-bold text-[var(--text-primary)] placeholder-[var(--text-secondary)] transition-all'
                                        />
                                        <div className='flex items-center justify-between text-[11px] text-[var(--text-secondary)]'>
                                            <span>Documenta la evidencia observable para que otro vendedor clasifique igual.</span>
                                            <span>{(formData.tamano_senal_principal || '').length}/280</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Descripción */}
                            <div className='col-span-1 md:col-span-2 space-y-1.5'>
                                <label className='block text-[10px] font-black uppercase tracking-wider text-[var(--text-primary)] opacity-60'>
                                    Notas Adicionales
                                </label>
                                <textarea
                                    rows={3}
                                    value={toInputString(formData.descripcion)}
                                    onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                                    className='w-full px-4 py-3 border border-[var(--input-border)] bg-[var(--input-bg)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent text-sm font-bold text-[var(--text-primary)] transition-all resize-none'
                                />
                            </div>
                        </div>
                    </form>
                </div>

                {/* Footer */}
                <div className='ah-modal-footer'>
                    <button
                        type='button'
                        onClick={onClose}
                        className='ah-modal-btn ah-modal-btn-secondary'
                    >
                        Cancelar
                    </button>
                    <button
                        type='submit'
                        form='company-form'
                        disabled={isSubmitting || uploadingLogo}
                        className='ah-modal-btn ah-modal-btn-primary'
                    >
                        {isSubmitting ? 'Guardando...' : 'Guardar Empresa'}
                    </button>
                </div>
                </div>
                {isCropping && tempImage && (
                    <ImageCropper
                        imageSrc={tempImage}
                        onCropComplete={handleConfirmCrop}
                        onCancel={() => {
                            setIsCropping(false)
                            setTempImage(null)
                        }}
                    />
                )}
            </div>

            <ConfirmModal
                isOpen={isAutofillConfirmOpen}
                onClose={() => {
                    setIsAutofillConfirmOpen(false)
                }}
                onConfirm={applyAutofillSuggestion}
                title='Autocompletar datos de empresa'
                message={
                    autofillFieldLabels.length > 0
                        ? `Detectamos informacion publica disponible para esta empresa. ¿Deseas autocompletar ${autofillFieldLabels.join(', ')} con el asistente y continuar manualmente con el resto?${autofillEmployeeEstimateLabel ? ` Estimacion de empleados: ${autofillEmployeeEstimateLabel}.` : ''} Podras revisar y editar cualquier campo antes de guardar.`
                        : `Detectamos informacion publica disponible para esta empresa. ¿Deseas autocompletar los datos disponibles con el asistente y continuar manualmente con el resto?${autofillEmployeeEstimateLabel ? ` Estimacion de empleados: ${autofillEmployeeEstimateLabel}.` : ''}`
                }
            />
        </>
    )
}
