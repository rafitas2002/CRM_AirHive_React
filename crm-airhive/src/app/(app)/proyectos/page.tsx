'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { FolderClosed, Plus, Save, Wrench, ArrowUpDown, Search } from 'lucide-react'

type Industry = {
    id: string
    name: string
}

type ProjectRow = {
    id: string
    nombre: string
    descripcion: string | null
    valor_real_mensualidad_usd: number | null
    valor_real_implementacion_usd: number | null
    rango_mensualidad_min_usd: number | null
    rango_mensualidad_max_usd: number | null
    rango_implementacion_min_usd: number | null
    rango_implementacion_max_usd: number | null
    tiempo_implementacion_dias: number | null
    costo_interno_mensualidad_usd: number | null
    costo_interno_implementacion_usd: number | null
    is_active: boolean
    created_at: string
    updated_at: string
}

type ProjectIndustryRow = {
    proyecto_id: string
    industria_id: string
    relation_status: 'implemented_in_industry' | 'available_not_implemented'
}

type ProjectForm = {
    id: string | null
    nombre: string
    descripcion: string
    valor_real_mensualidad_usd: string
    valor_real_implementacion_usd: string
    rango_mensualidad_min_usd: string
    rango_mensualidad_max_usd: string
    rango_implementacion_min_usd: string
    rango_implementacion_max_usd: string
    useMonthlyRange: boolean
    useImplementationRange: boolean
    tiempo_implementacion_dias: string
    costo_interno_mensualidad_usd: string
    costo_interno_implementacion_usd: string
    is_active: boolean
    implementedIndustryIds: string[]
    availableIndustryIds: string[]
}

const EMPTY_FORM: ProjectForm = {
    id: null,
    nombre: '',
    descripcion: '',
    valor_real_mensualidad_usd: '',
    valor_real_implementacion_usd: '',
    rango_mensualidad_min_usd: '',
    rango_mensualidad_max_usd: '',
    rango_implementacion_min_usd: '',
    rango_implementacion_max_usd: '',
    useMonthlyRange: false,
    useImplementationRange: false,
    tiempo_implementacion_dias: '',
    costo_interno_mensualidad_usd: '',
    costo_interno_implementacion_usd: '',
    is_active: true,
    implementedIndustryIds: [],
    availableIndustryIds: []
}

type ProjectSalesSummaryRow = {
    proyecto_id: string
    implemented_sales_count: number
    avg_mensualidad_pactada_usd: number | null
    avg_implementacion_pactada_usd: number | null
}

function parseMoneyInput(raw: string): number | null {
    const digits = raw.replace(/[^\d]/g, '')
    if (!digits) return null
    const parsed = Number(digits)
    return Number.isFinite(parsed) ? parsed : null
}

function parseIntegerInput(raw: string): number | null {
    const digits = raw.replace(/[^\d]/g, '')
    if (!digits) return null
    const parsed = Number(digits)
    if (!Number.isFinite(parsed)) return null
    return Math.max(0, Math.round(parsed))
}

function formatMoneyInput(raw: string): string {
    const digits = raw.replace(/[^\d]/g, '')
    if (!digits) return ''
    return Number(digits).toLocaleString('en-US')
}

function formatUsd(value: number | null | undefined) {
    if (value == null || !Number.isFinite(Number(value))) return 'N/D'
    return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
        maximumFractionDigits: 0
    }).format(Number(value))
}

export default function ProyectosPage() {
    const [supabase] = useState(() => createClient())
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [projects, setProjects] = useState<ProjectRow[]>([])
    const [industries, setIndustries] = useState<Industry[]>([])
    const [projectIndustries, setProjectIndustries] = useState<ProjectIndustryRow[]>([])
    const [salesSummary, setSalesSummary] = useState<ProjectSalesSummaryRow[]>([])
    const [searchTerm, setSearchTerm] = useState('')
    const [sortBy, setSortBy] = useState<'alphabetical_asc' | 'alphabetical_desc' | 'price_desc' | 'price_asc' | 'oldest' | 'newest'>('alphabetical_asc')
    const [form, setForm] = useState<ProjectForm>(EMPTY_FORM)

    const industryNameById = useMemo(
        () => new Map(industries.map((i) => [i.id, i.name])),
        [industries]
    )

    const fetchAll = async () => {
        setLoading(true)
        const [projectsRes, industriesRes, relationsRes, summaryRes] = await Promise.all([
            (supabase.from('proyectos_catalogo') as any).select('*').order('created_at', { ascending: false }),
            (supabase.from('industrias') as any).select('id, name').order('name', { ascending: true }),
            (supabase.from('proyecto_industrias') as any).select('proyecto_id, industria_id, relation_status'),
            (supabase.from('proyectos_catalogo_sales_summary') as any).select('*')
        ])

        if (Array.isArray(projectsRes.data)) setProjects(projectsRes.data as ProjectRow[])
        if (Array.isArray(industriesRes.data)) {
            setIndustries((industriesRes.data as any[]).map((r) => ({ id: String(r.id), name: String(r.name || 'Industria') })))
        }
        if (Array.isArray(relationsRes.data)) {
            setProjectIndustries((relationsRes.data as any[]).map((r) => ({
                proyecto_id: String(r.proyecto_id),
                industria_id: String(r.industria_id),
                relation_status: r.relation_status === 'implemented_in_industry' ? 'implemented_in_industry' : 'available_not_implemented'
            })))
        }
        if (Array.isArray(summaryRes?.data)) {
            setSalesSummary((summaryRes.data as any[]).map((r) => ({
                proyecto_id: String(r.proyecto_id),
                implemented_sales_count: Number(r.implemented_sales_count || 0),
                avg_mensualidad_pactada_usd: r.avg_mensualidad_pactada_usd == null ? null : Number(r.avg_mensualidad_pactada_usd),
                avg_implementacion_pactada_usd: r.avg_implementacion_pactada_usd == null ? null : Number(r.avg_implementacion_pactada_usd)
            })))
        }
        setLoading(false)
    }

    useEffect(() => {
        void fetchAll()
    }, [])

    const sortedProjects = useMemo(() => {
        const next = [...projects]
        const getTotalReal = (p: ProjectRow) =>
            Number(p.valor_real_mensualidad_usd || 0) + Number(p.valor_real_implementacion_usd || 0)
        next.sort((a, b) => {
            if (sortBy === 'alphabetical_asc') return a.nombre.localeCompare(b.nombre, 'es')
            if (sortBy === 'alphabetical_desc') return b.nombre.localeCompare(a.nombre, 'es')
            if (sortBy === 'price_desc') return getTotalReal(b) - getTotalReal(a)
            if (sortBy === 'price_asc') return getTotalReal(a) - getTotalReal(b)
            if (sortBy === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        })
        return next
    }, [projects, sortBy])

    const filteredSortedProjects = useMemo(() => {
        const q = searchTerm.trim().toLowerCase()
        if (!q) return sortedProjects
        return sortedProjects.filter((project) =>
            `${project.nombre} ${project.descripcion || ''}`.toLowerCase().includes(q)
        )
    }, [sortedProjects, searchTerm])

    const salesSummaryByProjectId = useMemo(
        () => new Map(salesSummary.map((row) => [row.proyecto_id, row])),
        [salesSummary]
    )

    const projectRelationsByProjectId = useMemo(() => {
        const map = new Map<string, { implemented: string[]; available: string[] }>()
        for (const row of projectIndustries) {
            if (!map.has(row.proyecto_id)) {
                map.set(row.proyecto_id, { implemented: [], available: [] })
            }
            const bucket = map.get(row.proyecto_id)!
            if (row.relation_status === 'implemented_in_industry') bucket.implemented.push(row.industria_id)
            else bucket.available.push(row.industria_id)
        }
        return map
    }, [projectIndustries])

    const resetForm = () => setForm(EMPTY_FORM)

    const startEdit = (project: ProjectRow) => {
        const rel = projectRelationsByProjectId.get(project.id) || { implemented: [], available: [] }
        setForm({
            id: project.id,
            nombre: project.nombre || '',
            descripcion: project.descripcion || '',
            valor_real_mensualidad_usd: project.valor_real_mensualidad_usd == null ? '' : formatMoneyInput(String(Math.round(Number(project.valor_real_mensualidad_usd)))),
            valor_real_implementacion_usd: project.valor_real_implementacion_usd == null ? '' : formatMoneyInput(String(Math.round(Number(project.valor_real_implementacion_usd)))),
            rango_mensualidad_min_usd: project.rango_mensualidad_min_usd == null ? '' : formatMoneyInput(String(Math.round(Number(project.rango_mensualidad_min_usd)))),
            rango_mensualidad_max_usd: project.rango_mensualidad_max_usd == null ? '' : formatMoneyInput(String(Math.round(Number(project.rango_mensualidad_max_usd)))),
            rango_implementacion_min_usd: project.rango_implementacion_min_usd == null ? '' : formatMoneyInput(String(Math.round(Number(project.rango_implementacion_min_usd)))),
            rango_implementacion_max_usd: project.rango_implementacion_max_usd == null ? '' : formatMoneyInput(String(Math.round(Number(project.rango_implementacion_max_usd)))),
            useMonthlyRange: project.rango_mensualidad_min_usd != null || project.rango_mensualidad_max_usd != null,
            useImplementationRange: project.rango_implementacion_min_usd != null || project.rango_implementacion_max_usd != null,
            tiempo_implementacion_dias: project.tiempo_implementacion_dias == null ? '' : String(Math.max(0, Math.round(Number(project.tiempo_implementacion_dias)))),
            costo_interno_mensualidad_usd: project.costo_interno_mensualidad_usd == null ? '' : formatMoneyInput(String(Math.round(Number(project.costo_interno_mensualidad_usd)))),
            costo_interno_implementacion_usd: project.costo_interno_implementacion_usd == null ? '' : formatMoneyInput(String(Math.round(Number(project.costo_interno_implementacion_usd)))),
            is_active: !!project.is_active,
            implementedIndustryIds: [...rel.implemented],
            availableIndustryIds: rel.available.filter((id) => !rel.implemented.includes(id))
        })
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    const toggleIndustry = (industryId: string, mode: 'implemented' | 'available') => {
        setForm((prev) => {
            const implemented = new Set(prev.implementedIndustryIds)
            const available = new Set(prev.availableIndustryIds)

            if (mode === 'implemented') {
                if (implemented.has(industryId)) {
                    implemented.delete(industryId)
                } else {
                    implemented.add(industryId)
                    available.delete(industryId)
                }
            } else {
                if (implemented.has(industryId)) {
                    return prev
                }
                if (available.has(industryId)) {
                    available.delete(industryId)
                } else {
                    available.add(industryId)
                }
            }

            return {
                ...prev,
                implementedIndustryIds: Array.from(implemented),
                availableIndustryIds: Array.from(available)
            }
        })
    }

    const toggleAllAvailableIndustries = () => {
        setForm((prev) => {
            const implemented = new Set(prev.implementedIndustryIds)
            const selectableIndustryIds = industries
                .map((industry) => industry.id)
                .filter((industryId) => !implemented.has(industryId))

            const allSelected = selectableIndustryIds.length > 0
                && selectableIndustryIds.every((industryId) => prev.availableIndustryIds.includes(industryId))

            return {
                ...prev,
                availableIndustryIds: allSelected ? [] : selectableIndustryIds
            }
        })
    }

    const saveProject = async () => {
        if (!form.nombre.trim()) {
            alert('El nombre del proyecto es obligatorio.')
            return
        }
        if (!form.tiempo_implementacion_dias.trim()) {
            alert('El tiempo de implementación (días) es obligatorio.')
            return
        }

        setSaving(true)
        try {
            const { data: authUserData } = await supabase.auth.getUser()
            const userId = authUserData.user?.id || null
            const realMonthly = parseMoneyInput(form.valor_real_mensualidad_usd)
            const realImplementation = parseMoneyInput(form.valor_real_implementacion_usd)
            const monthlyRangeMin = form.useMonthlyRange ? parseMoneyInput(form.rango_mensualidad_min_usd) : null
            const monthlyRangeMax = form.useMonthlyRange ? parseMoneyInput(form.rango_mensualidad_max_usd) : null
            const implementationRangeMin = form.useImplementationRange ? parseMoneyInput(form.rango_implementacion_min_usd) : null
            const implementationRangeMax = form.useImplementationRange ? parseMoneyInput(form.rango_implementacion_max_usd) : null
            const internalMonthlyCost = parseMoneyInput(form.costo_interno_mensualidad_usd)
            const internalImplementationCost = parseMoneyInput(form.costo_interno_implementacion_usd)
            const implementationTimeDays = parseIntegerInput(form.tiempo_implementacion_dias)
            if (realMonthly !== null && (!Number.isFinite(realMonthly) || realMonthly < 0)) {
                alert('La mensualidad real del proyecto no es válida.')
                setSaving(false)
                return
            }
            if (realImplementation !== null && (!Number.isFinite(realImplementation) || realImplementation < 0)) {
                alert('El valor real de implementación del proyecto no es válido.')
                setSaving(false)
                return
            }
            if (form.useMonthlyRange && (monthlyRangeMin === null || monthlyRangeMax === null)) {
                alert('Si activas el rango mensual, debes capturar mínimo y máximo.')
                setSaving(false)
                return
            }
            if (form.useImplementationRange && (implementationRangeMin === null || implementationRangeMax === null)) {
                alert('Si activas el rango de implementación, debes capturar mínimo y máximo.')
                setSaving(false)
                return
            }
            if (monthlyRangeMin !== null && (!Number.isFinite(monthlyRangeMin) || monthlyRangeMin < 0)) {
                alert('El rango mínimo mensual no es válido.')
                setSaving(false)
                return
            }
            if (monthlyRangeMax !== null && (!Number.isFinite(monthlyRangeMax) || monthlyRangeMax < 0)) {
                alert('El rango máximo mensual no es válido.')
                setSaving(false)
                return
            }
            if (implementationRangeMin !== null && (!Number.isFinite(implementationRangeMin) || implementationRangeMin < 0)) {
                alert('El rango mínimo de implementación no es válido.')
                setSaving(false)
                return
            }
            if (implementationRangeMax !== null && (!Number.isFinite(implementationRangeMax) || implementationRangeMax < 0)) {
                alert('El rango máximo de implementación no es válido.')
                setSaving(false)
                return
            }
            if (monthlyRangeMin != null && monthlyRangeMax != null && monthlyRangeMin > monthlyRangeMax) {
                alert('El rango de mensualidad no es válido: mínimo no puede ser mayor al máximo.')
                setSaving(false)
                return
            }
            if (implementationRangeMin != null && implementationRangeMax != null && implementationRangeMin > implementationRangeMax) {
                alert('El rango de implementación no es válido: mínimo no puede ser mayor al máximo.')
                setSaving(false)
                return
            }
            if (internalMonthlyCost !== null && (!Number.isFinite(internalMonthlyCost) || internalMonthlyCost < 0)) {
                alert('El costo interno mensual no es válido.')
                setSaving(false)
                return
            }
            if (internalImplementationCost !== null && (!Number.isFinite(internalImplementationCost) || internalImplementationCost < 0)) {
                alert('El costo interno de implementación no es válido.')
                setSaving(false)
                return
            }
            if (
                implementationTimeDays === null
                || !Number.isFinite(implementationTimeDays)
                || implementationTimeDays <= 0
            ) {
                alert('El tiempo estimado de implementación debe ser mayor a 0 días.')
                setSaving(false)
                return
            }

            const isUnknownColumnError = (error: any) => {
                const message = String(error?.message || '').toLowerCase()
                return message.includes('could not find the') && message.includes('column of')
            }
            const corePayload = {
                nombre: form.nombre.trim(),
                descripcion: form.descripcion.trim() || null,
                valor_real_mensualidad_usd: realMonthly,
                valor_real_implementacion_usd: realImplementation,
                is_active: form.is_active
            }
            const extendedPayload = {
                ...corePayload,
                tiempo_implementacion_dias: implementationTimeDays,
                costo_interno_mensualidad_usd: internalMonthlyCost,
                costo_interno_implementacion_usd: internalImplementationCost
            }
            const extendedPayloadWithRanges = {
                ...extendedPayload,
                rango_mensualidad_min_usd: monthlyRangeMin,
                rango_mensualidad_max_usd: monthlyRangeMax,
                rango_implementacion_min_usd: implementationRangeMin,
                rango_implementacion_max_usd: implementationRangeMax
            }
            const payloadCandidates = [extendedPayloadWithRanges, extendedPayload, corePayload]

            let projectId = form.id
            if (form.id) {
                let updateError: any = null
                for (const candidate of payloadCandidates) {
                    const { error } = await (supabase.from('proyectos_catalogo') as any)
                        .update(candidate)
                        .eq('id', form.id)
                    if (!error) {
                        updateError = null
                        break
                    }
                    updateError = error
                    if (!isUnknownColumnError(error)) break
                }
                if (updateError) throw updateError
            } else {
                let insertError: any = null
                let insertedData: any = null
                for (const candidate of payloadCandidates) {
                    const { data, error } = await (supabase.from('proyectos_catalogo') as any)
                        .insert({
                            ...candidate,
                            created_by: userId
                        })
                        .select('id')
                        .single()
                    if (!error) {
                        insertedData = data
                        insertError = null
                        break
                    }
                    insertError = error
                    if (!isUnknownColumnError(error)) break
                }
                if (insertError) throw insertError
                projectId = String(insertedData.id)
            }

            if (!projectId) throw new Error('No se pudo determinar el ID del proyecto.')

            const availableScopeRows = form.availableIndustryIds
                .filter((id) => !form.implementedIndustryIds.includes(id))
                .map((industria_id) => ({
                    proyecto_id: projectId,
                    industria_id,
                    relation_status: 'available_not_implemented'
                }))

            const { error: deleteScopeError } = await (supabase.from('proyecto_industrias') as any)
                .delete()
                .eq('proyecto_id', projectId)
                .eq('relation_status', 'available_not_implemented')
            if (deleteScopeError) throw deleteScopeError

            if (availableScopeRows.length > 0) {
                const { error: relationError } = await (supabase.from('proyecto_industrias') as any)
                    .upsert(availableScopeRows, { onConflict: 'proyecto_id,industria_id' })
                if (relationError) throw relationError
            }

            await fetchAll()
            resetForm()
        } catch (error: any) {
            console.error('Error saving project:', error)
            alert(`No se pudo guardar el proyecto: ${error?.message || 'Error desconocido'}`)
        } finally {
            setSaving(false)
        }
    }

    const selectableIndustryIds = industries
        .map((industry) => industry.id)
        .filter((industryId) => !form.implementedIndustryIds.includes(industryId))
    const isAllIndustriesSelected = selectableIndustryIds.length > 0
        && selectableIndustryIds.every((industryId) => form.availableIndustryIds.includes(industryId))

    return (
        <div className='h-full flex flex-col p-8 overflow-y-auto' style={{ background: 'transparent' }}>
            <div className='max-w-7xl mx-auto w-full space-y-8'>
                <div className='flex flex-col md:flex-row md:items-center justify-between gap-6'>
                    <div className='flex items-center gap-6'>
                        <div className='ah-icon-card'>
                            <FolderClosed size={34} strokeWidth={1.9} />
                        </div>
                        <div>
                            <h1 className='text-4xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>Proyectos</h1>
                            <p className='font-medium' style={{ color: 'var(--text-secondary)' }}>
                                Catálogo de proyectos replicables por empresa e industria.
                            </p>
                        </div>
                    </div>
                </div>

                <div className='grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-8'>
                    <div className='rounded-[32px] border shadow-sm p-6 space-y-5' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                        <div className='flex items-center justify-between gap-3'>
                            <div>
                                <p className='text-[10px] font-black uppercase tracking-[0.18em]' style={{ color: 'var(--text-secondary)' }}>
                                    {form.id ? 'Editar proyecto' : 'Nuevo proyecto'}
                                </p>
                                <p className='text-sm font-bold mt-1' style={{ color: 'var(--text-primary)' }}>
                                    Registra el proyecto y su cobertura por industria
                                </p>
                            </div>
                            {form.id ? (
                                <button
                                    type='button'
                                    onClick={resetForm}
                                    className='px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-[0.14em] cursor-pointer hover:scale-[1.02] transition-all'
                                    style={{ borderColor: 'var(--card-border)', color: 'var(--text-secondary)', background: 'var(--hover-bg)' }}
                                >
                                    Nuevo
                                </button>
                            ) : null}
                        </div>

                        <div className='space-y-4'>
                            <div>
                                <label className='text-[10px] font-black uppercase tracking-[0.16em]' style={{ color: 'var(--text-secondary)' }}>Nombre</label>
                                <input
                                    value={form.nombre}
                                    onChange={(e) => setForm((prev) => ({ ...prev, nombre: e.target.value }))}
                                    className='mt-1 w-full rounded-xl border px-3 py-2.5 text-sm font-semibold'
                                    style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                    placeholder='Ej. Automatización de cobranza'
                                />
                            </div>
                            <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                                <div>
                                    <label className='min-h-[42px] flex items-end text-[10px] font-black uppercase tracking-[0.16em] leading-tight' style={{ color: 'var(--text-secondary)' }}>
                                        Costo exacto mensual (MXN)
                                    </label>
                                    <input
                                        value={form.valor_real_mensualidad_usd}
                                        onChange={(e) => setForm((prev) => ({ ...prev, valor_real_mensualidad_usd: formatMoneyInput(e.target.value) }))}
                                        inputMode='numeric'
                                        className='mt-1 w-full rounded-xl border px-3 py-2.5 text-sm font-semibold'
                                        style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                        placeholder='2500'
                                    />
                                </div>
                                <div>
                                    <label className='min-h-[42px] flex items-end text-[10px] font-black uppercase tracking-[0.16em] leading-tight' style={{ color: 'var(--text-secondary)' }}>
                                        Costo exacto implementación (MXN)
                                    </label>
                                    <input
                                        value={form.valor_real_implementacion_usd}
                                        onChange={(e) => setForm((prev) => ({ ...prev, valor_real_implementacion_usd: formatMoneyInput(e.target.value) }))}
                                        inputMode='numeric'
                                        className='mt-1 w-full rounded-xl border px-3 py-2.5 text-sm font-semibold'
                                        style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                        placeholder='10000'
                                    />
                                </div>
                            </div>
                            <div className='rounded-2xl border p-3 space-y-3' style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}>
                                <p className='text-[10px] font-black uppercase tracking-[0.16em] text-blue-300'>
                                    Rango opcional por negociación (MXN)
                                </p>
                                <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                                    <div className='rounded-xl border p-3 space-y-2' style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
                                        <label className='flex items-center gap-2 cursor-pointer'>
                                            <input
                                                type='checkbox'
                                                checked={form.useMonthlyRange}
                                                onChange={(e) => setForm((prev) => ({
                                                    ...prev,
                                                    useMonthlyRange: e.target.checked,
                                                    rango_mensualidad_min_usd: e.target.checked ? prev.rango_mensualidad_min_usd : '',
                                                    rango_mensualidad_max_usd: e.target.checked ? prev.rango_mensualidad_max_usd : ''
                                                }))}
                                            />
                                            <span className='text-[10px] font-black uppercase tracking-[0.14em]' style={{ color: 'var(--text-primary)' }}>
                                                Usar rango mensualidad
                                            </span>
                                        </label>
                                        {form.useMonthlyRange ? (
                                            <div className='grid grid-cols-2 gap-2'>
                                                <div>
                                                    <label className='text-[10px] font-black uppercase tracking-[0.12em]' style={{ color: 'var(--text-secondary)' }}>
                                                        Mín mensual
                                                    </label>
                                                    <input
                                                        value={form.rango_mensualidad_min_usd}
                                                        onChange={(e) => setForm((prev) => ({ ...prev, rango_mensualidad_min_usd: formatMoneyInput(e.target.value) }))}
                                                        inputMode='numeric'
                                                        className='mt-1 w-full rounded-xl border px-3 py-2.5 text-sm font-semibold'
                                                        style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                                        placeholder='2000'
                                                    />
                                                </div>
                                                <div>
                                                    <label className='text-[10px] font-black uppercase tracking-[0.12em]' style={{ color: 'var(--text-secondary)' }}>
                                                        Máx mensual
                                                    </label>
                                                    <input
                                                        value={form.rango_mensualidad_max_usd}
                                                        onChange={(e) => setForm((prev) => ({ ...prev, rango_mensualidad_max_usd: formatMoneyInput(e.target.value) }))}
                                                        inputMode='numeric'
                                                        className='mt-1 w-full rounded-xl border px-3 py-2.5 text-sm font-semibold'
                                                        style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                                        placeholder='5000'
                                                    />
                                                </div>
                                            </div>
                                        ) : null}
                                    </div>
                                    <div className='rounded-xl border p-3 space-y-2' style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
                                        <label className='flex items-center gap-2 cursor-pointer'>
                                            <input
                                                type='checkbox'
                                                checked={form.useImplementationRange}
                                                onChange={(e) => setForm((prev) => ({
                                                    ...prev,
                                                    useImplementationRange: e.target.checked,
                                                    rango_implementacion_min_usd: e.target.checked ? prev.rango_implementacion_min_usd : '',
                                                    rango_implementacion_max_usd: e.target.checked ? prev.rango_implementacion_max_usd : ''
                                                }))}
                                            />
                                            <span className='text-[10px] font-black uppercase tracking-[0.14em]' style={{ color: 'var(--text-primary)' }}>
                                                Usar rango implementación
                                            </span>
                                        </label>
                                        {form.useImplementationRange ? (
                                            <div className='grid grid-cols-2 gap-2'>
                                                <div>
                                                    <label className='text-[10px] font-black uppercase tracking-[0.12em]' style={{ color: 'var(--text-secondary)' }}>
                                                        Mín implementación
                                                    </label>
                                                    <input
                                                        value={form.rango_implementacion_min_usd}
                                                        onChange={(e) => setForm((prev) => ({ ...prev, rango_implementacion_min_usd: formatMoneyInput(e.target.value) }))}
                                                        inputMode='numeric'
                                                        className='mt-1 w-full rounded-xl border px-3 py-2.5 text-sm font-semibold'
                                                        style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                                        placeholder='10000'
                                                    />
                                                </div>
                                                <div>
                                                    <label className='text-[10px] font-black uppercase tracking-[0.12em]' style={{ color: 'var(--text-secondary)' }}>
                                                        Máx implementación
                                                    </label>
                                                    <input
                                                        value={form.rango_implementacion_max_usd}
                                                        onChange={(e) => setForm((prev) => ({ ...prev, rango_implementacion_max_usd: formatMoneyInput(e.target.value) }))}
                                                        inputMode='numeric'
                                                        className='mt-1 w-full rounded-xl border px-3 py-2.5 text-sm font-semibold'
                                                        style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                                        placeholder='25000'
                                                    />
                                                </div>
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                            <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
                                <div>
                                    <label className='min-h-[42px] flex items-end text-[10px] font-black uppercase tracking-[0.16em] leading-tight' style={{ color: 'var(--text-secondary)' }}>
                                        Tiempo implementación (días)
                                    </label>
                                    <input
                                        value={form.tiempo_implementacion_dias}
                                        onChange={(e) => setForm((prev) => ({ ...prev, tiempo_implementacion_dias: e.target.value.replace(/[^\d]/g, '') }))}
                                        inputMode='numeric'
                                        className='mt-1 w-full rounded-xl border px-3 py-2.5 text-sm font-semibold'
                                        style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                        placeholder='30'
                                    />
                                </div>
                                <div>
                                    <label className='min-h-[42px] flex items-end text-[10px] font-black uppercase tracking-[0.16em] leading-tight' style={{ color: 'var(--text-secondary)' }}>
                                        Costo interno mensual (MXN)
                                    </label>
                                    <input
                                        value={form.costo_interno_mensualidad_usd}
                                        onChange={(e) => setForm((prev) => ({ ...prev, costo_interno_mensualidad_usd: formatMoneyInput(e.target.value) }))}
                                        inputMode='numeric'
                                        className='mt-1 w-full rounded-xl border px-3 py-2.5 text-sm font-semibold'
                                        style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                        placeholder='1200'
                                    />
                                </div>
                                <div>
                                    <label className='min-h-[42px] flex items-end text-[10px] font-black uppercase tracking-[0.16em] leading-tight' style={{ color: 'var(--text-secondary)' }}>
                                        Costo interno implementación (MXN)
                                    </label>
                                    <input
                                        value={form.costo_interno_implementacion_usd}
                                        onChange={(e) => setForm((prev) => ({ ...prev, costo_interno_implementacion_usd: formatMoneyInput(e.target.value) }))}
                                        inputMode='numeric'
                                        className='mt-1 w-full rounded-xl border px-3 py-2.5 text-sm font-semibold'
                                        style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                        placeholder='5000'
                                    />
                                </div>
                            </div>
                            <p className='text-[10px] font-bold' style={{ color: 'var(--text-secondary)' }}>
                                Los costos internos son editables para que se ajusten conforme avanzan los proyectos.
                            </p>
                            <div>
                                <label className='text-[10px] font-black uppercase tracking-[0.16em]' style={{ color: 'var(--text-secondary)' }}>Descripción</label>
                                <textarea
                                    value={form.descripcion}
                                    onChange={(e) => setForm((prev) => ({ ...prev, descripcion: e.target.value }))}
                                    rows={3}
                                    className='mt-1 w-full rounded-xl border px-3 py-2.5 text-sm font-semibold resize-y'
                                    style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                    placeholder='Descripción corta del proyecto replicable...'
                                />
                            </div>
                            <label className='flex items-center gap-2 cursor-pointer'>
                                <input
                                    type='checkbox'
                                    checked={form.is_active}
                                    onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                                />
                                <span className='text-sm font-bold' style={{ color: 'var(--text-primary)' }}>Proyecto activo</span>
                            </label>
                        </div>

                        <div className='grid grid-cols-1 gap-4'>
                            {form.id ? (
                                <div className='rounded-2xl border p-4' style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}>
                                    <p className='text-[10px] font-black uppercase tracking-[0.16em] text-emerald-400'>Implementado en industrias (automático)</p>
                                    <p className='mt-2 text-[10px] font-bold' style={{ color: 'var(--text-secondary)' }}>
                                        Se registra automáticamente cuando un proyecto queda implementado real en una empresa de esa industria.
                                    </p>
                                    <div className='mt-3 flex flex-wrap gap-1.5'>
                                        {form.implementedIndustryIds.length === 0 ? (
                                            <span className='text-xs font-bold opacity-60' style={{ color: 'var(--text-secondary)' }}>Sin registros aún</span>
                                        ) : form.implementedIndustryIds
                                            .map((id) => industryNameById.get(id))
                                            .filter(Boolean)
                                            .map((name) => (
                                                <span key={`impl-readonly-${name}`} className='px-2 py-1 rounded-lg text-[10px] font-black border bg-emerald-500/10 text-emerald-400 border-emerald-500/20'>
                                                    {name}
                                                </span>
                                            ))}
                                    </div>
                                </div>
                            ) : null}

                            <div className='rounded-2xl border p-4' style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}>
                                <p className='text-[10px] font-black uppercase tracking-[0.16em] text-blue-400'>Industrias de alcance (editable)</p>
                                <p className='mt-2 text-[10px] font-bold' style={{ color: 'var(--text-secondary)' }}>
                                    Marca las industrias donde crees que este proyecto tiene alcance al crearlo. Puedes agregar más después.
                                </p>
                                <label
                                    className='mt-3 mb-1 inline-flex items-center gap-2 text-sm font-black uppercase tracking-[0.12em] cursor-pointer'
                                    style={{ color: 'var(--text-primary)' }}
                                >
                                    <input
                                        type='checkbox'
                                        checked={isAllIndustriesSelected}
                                        disabled={selectableIndustryIds.length === 0}
                                        onChange={toggleAllAvailableIndustries}
                                    />
                                    <span>Todas las industrias</span>
                                </label>
                                <p className='text-[10px] font-bold mb-2' style={{ color: 'var(--text-secondary)' }}>
                                    Selecciona o limpia todas las industrias disponibles con un clic.
                                </p>
                                <div className='mt-3 max-h-48 overflow-y-auto custom-scrollbar space-y-2'>
                                    {industries.map((industry) => (
                                        <label
                                            key={`avail-${industry.id}`}
                                            className={`flex items-center gap-2 text-sm font-semibold ${form.implementedIndustryIds.includes(industry.id) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                            style={{ color: 'var(--text-primary)' }}
                                        >
                                            <input
                                                type='checkbox'
                                                checked={form.availableIndustryIds.includes(industry.id)}
                                                disabled={form.implementedIndustryIds.includes(industry.id)}
                                                onChange={() => toggleIndustry(industry.id, 'available')}
                                            />
                                            <span>{industry.name}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <button
                            type='button'
                            onClick={saveProject}
                            disabled={saving}
                            className='w-full h-11 rounded-2xl bg-[#2048FF] text-white font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:bg-[#1b3de6] hover:scale-[1.01] active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2'
                        >
                            {form.id ? <Save size={14} /> : <Plus size={14} />}
                            {saving ? 'Guardando...' : form.id ? 'Guardar cambios' : 'Crear proyecto'}
                        </button>
                    </div>

                    <div className='rounded-[32px] border shadow-sm overflow-hidden' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                        <div className='px-6 py-4 border-b flex items-center justify-between gap-4' style={{ borderColor: 'var(--card-border)', background: 'var(--table-header-bg)' }}>
                            <div>
                                <p className='text-[10px] font-black uppercase tracking-[0.18em]' style={{ color: 'var(--text-secondary)' }}>Tabla de proyectos</p>
                                <p className='text-sm font-bold mt-1' style={{ color: 'var(--text-primary)' }}>{filteredSortedProjects.length} / {projects.length} proyectos</p>
                            </div>
                            <div className='flex flex-col sm:flex-row items-stretch sm:items-center gap-2'>
                                <div className='relative'>
                                    <Search size={14} className='absolute left-3 top-1/2 -translate-y-1/2 text-[#2048FF]' />
                                    <input
                                        type='text'
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        placeholder='Buscar proyecto...'
                                        className='w-full sm:w-56 rounded-xl border pl-9 pr-3 py-2 text-xs font-bold'
                                        style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                    />
                                </div>
                                <div className='flex items-center gap-2'>
                                    <ArrowUpDown size={14} className='text-[#2048FF]' />
                                    <select
                                        value={sortBy}
                                        onChange={(e) => setSortBy(e.target.value as any)}
                                        className='rounded-xl border px-3 py-2 text-xs font-black uppercase tracking-[0.12em] cursor-pointer'
                                        style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                    >
                                        <option value='alphabetical_asc'>A-Z</option>
                                        <option value='alphabetical_desc'>Z-A</option>
                                        <option value='price_desc'>Precio total desc</option>
                                        <option value='price_asc'>Precio total asc</option>
                                        <option value='newest'>Reciente</option>
                                        <option value='oldest'>Antiguo</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className='overflow-x-auto custom-scrollbar'>
                            <table className='w-full min-w-[1240px]'>
                                <thead>
                                    <tr className='text-left border-b' style={{ borderColor: 'var(--card-border)' }}>
                                        {['Proyecto', 'Base mensualidad', 'Base implementación', 'Promedio REAL vendido', 'Implementado', 'Posible', 'Antigüedad', 'Estado', 'Acciones'].map((h) => (
                                            <th key={h} className='px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em]' style={{ color: 'var(--text-secondary)' }}>
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td colSpan={9} className='px-4 py-10 text-center text-sm font-bold' style={{ color: 'var(--text-secondary)' }}>
                                                Cargando proyectos...
                                            </td>
                                        </tr>
                                    ) : filteredSortedProjects.length === 0 ? (
                                        <tr>
                                            <td colSpan={9} className='px-4 py-10 text-center text-sm font-bold' style={{ color: 'var(--text-secondary)' }}>
                                                No se encontraron proyectos con esa búsqueda.
                                            </td>
                                        </tr>
                                    ) : filteredSortedProjects.map((project) => {
                                        const relations = projectRelationsByProjectId.get(project.id) || { implemented: [], available: [] }
                                        const summary = salesSummaryByProjectId.get(project.id)
                                        const implementedNames = relations.implemented.map((id) => industryNameById.get(id)).filter(Boolean) as string[]
                                        const availableNames = relations.available
                                            .filter((id) => !relations.implemented.includes(id))
                                            .map((id) => industryNameById.get(id))
                                            .filter(Boolean) as string[]

                                        return (
                                            <tr key={project.id} className='border-b align-top' style={{ borderColor: 'var(--card-border)' }}>
                                                <td className='px-4 py-4'>
                                                    <p className='text-sm font-black' style={{ color: 'var(--text-primary)' }}>{project.nombre}</p>
                                                    {project.descripcion && (
                                                        <p className='text-xs mt-1 line-clamp-2' style={{ color: 'var(--text-secondary)' }}>{project.descripcion}</p>
                                                    )}
                                                    <div className='mt-2 space-y-0.5'>
                                                        <p className='text-[10px] font-bold' style={{ color: 'var(--text-secondary)' }}>
                                                            Rango M: {project.rango_mensualidad_min_usd != null || project.rango_mensualidad_max_usd != null
                                                                ? `${formatUsd(project.rango_mensualidad_min_usd)} - ${formatUsd(project.rango_mensualidad_max_usd)}`
                                                                : 'N/D'}
                                                        </p>
                                                        <p className='text-[10px] font-bold' style={{ color: 'var(--text-secondary)' }}>
                                                            Rango I: {project.rango_implementacion_min_usd != null || project.rango_implementacion_max_usd != null
                                                                ? `${formatUsd(project.rango_implementacion_min_usd)} - ${formatUsd(project.rango_implementacion_max_usd)}`
                                                                : 'N/D'}
                                                        </p>
                                                        <p className='text-[10px] font-black uppercase tracking-[0.12em]' style={{ color: 'var(--text-secondary)' }}>
                                                            Tiempo implementación: {project.tiempo_implementacion_dias != null ? `${Math.max(0, Math.round(Number(project.tiempo_implementacion_dias)))} días` : 'N/D'}
                                                        </p>
                                                        <p className='text-[10px] font-bold' style={{ color: 'var(--text-secondary)' }}>
                                                            Costo interno M: {formatUsd(project.costo_interno_mensualidad_usd)}
                                                        </p>
                                                        <p className='text-[10px] font-bold' style={{ color: 'var(--text-secondary)' }}>
                                                            Costo interno I: {formatUsd(project.costo_interno_implementacion_usd)}
                                                        </p>
                                                    </div>
                                                </td>
                                                <td className='px-4 py-4'>
                                                    <p className='text-sm font-black text-[#1700AC]'>{formatUsd(project.valor_real_mensualidad_usd)}</p>
                                                </td>
                                                <td className='px-4 py-4'>
                                                    <p className='text-sm font-black text-[#1700AC]'>{formatUsd(project.valor_real_implementacion_usd)}</p>
                                                </td>
                                                <td className='px-4 py-4'>
                                                    <div className='space-y-1'>
                                                        <p className='text-xs font-black' style={{ color: 'var(--text-primary)' }}>
                                                            M: {formatUsd(summary?.avg_mensualidad_pactada_usd)}
                                                        </p>
                                                        <p className='text-xs font-black' style={{ color: 'var(--text-primary)' }}>
                                                            I: {formatUsd(summary?.avg_implementacion_pactada_usd)}
                                                        </p>
                                                        <p className='text-[10px] font-bold' style={{ color: 'var(--text-secondary)' }}>
                                                            {summary?.implemented_sales_count || 0} ventas reales
                                                        </p>
                                                    </div>
                                                </td>
                                                <td className='px-4 py-4'>
                                                    <div className='flex flex-wrap gap-1.5'>
                                                        {implementedNames.length === 0 ? (
                                                            <span className='text-xs font-bold opacity-60' style={{ color: 'var(--text-secondary)' }}>Sin registros</span>
                                                        ) : implementedNames.map((name) => (
                                                            <span key={`${project.id}-impl-${name}`} className='px-2 py-1 rounded-lg text-[10px] font-black border bg-emerald-500/10 text-emerald-400 border-emerald-500/20'>
                                                                {name}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td className='px-4 py-4'>
                                                    <div className='flex flex-wrap gap-1.5'>
                                                        {availableNames.length === 0 ? (
                                                            <span className='text-xs font-bold opacity-60' style={{ color: 'var(--text-secondary)' }}>Sin registros</span>
                                                        ) : availableNames.map((name) => (
                                                            <span key={`${project.id}-avail-${name}`} className='px-2 py-1 rounded-lg text-[10px] font-black border bg-blue-500/10 text-blue-300 border-blue-500/20'>
                                                                {name}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td className='px-4 py-4'>
                                                    <p className='text-xs font-bold' style={{ color: 'var(--text-primary)' }}>
                                                        {new Date(project.created_at).toLocaleDateString('es-MX')}
                                                    </p>
                                                    <p className='text-[10px]' style={{ color: 'var(--text-secondary)' }}>
                                                        {Math.max(0, Math.floor((Date.now() - new Date(project.created_at).getTime()) / (1000 * 60 * 60 * 24)))} días
                                                    </p>
                                                </td>
                                                <td className='px-4 py-4'>
                                                    <span className={`inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-black border ${project.is_active ? 'bg-emerald-500/10 text-emerald-300 border-emerald-400/20' : 'bg-zinc-500/10 text-zinc-300 border-zinc-400/20'}`}>
                                                        {project.is_active ? 'Activo' : 'Inactivo'}
                                                    </span>
                                                </td>
                                                <td className='px-4 py-4'>
                                                    <button
                                                        type='button'
                                                        onClick={() => startEdit(project)}
                                                        className='p-2 rounded-xl border border-transparent text-amber-500 hover:bg-amber-500/10 hover:border-amber-500/35 hover:text-amber-400 transition-all cursor-pointer'
                                                        title='Editar proyecto'
                                                    >
                                                        <Wrench size={16} />
                                                    </button>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
