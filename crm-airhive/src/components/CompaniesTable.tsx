'use client'

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Info, X } from 'lucide-react'
import type { CompanyWithProjects } from '@/app/(app)/empresas/page'
import { getLocationFilterFacetFromStructured } from '@/lib/locationUtils'

type LifecycleStage = 'pre_lead' | 'lead' | 'client'

type ProfileLite = {
    id?: string | null
    role?: string | null
} | null | undefined

interface CompaniesTableProps {
    companies: CompanyWithProjects[]
    recentCompanies?: CompanyWithProjects[]
    highlightedCompanyId?: string | null
    isEditingMode?: boolean
    currentUserProfile?: ProfileLite
    onRowClick?: (company: CompanyWithProjects) => void
    onEdit?: (company: CompanyWithProjects) => void
    onDelete?: (id: string) => void
}

type LegendMarker = 'dot' | 'token'

type CodeLegendRow = {
    title: string
    marker: LegendMarker
    items: Array<{
        label: string
        color?: string
        token?: string
    }>
}

type CompanyCode =
    | { kind: 'dot'; color: string; tooltip: string }
    | { kind: 'token'; value: string; tooltip: string }

const SIZE_CODE_LABELS: Record<string, string> = {
    '1': 'Micro',
    '2': 'Pequeña',
    '3': 'Mediana',
    '4': 'Grande',
    '5': 'Corporativo',
    '-': 'Sin dato'
}

const LOCATION_CODE_LABELS: Record<string, string> = {
    L: 'Local (Monterrey)',
    N: 'Nacional (fuera de Monterrey)',
    I: 'Internacional',
    '-': 'Sin dato'
}

const CODE_LEGEND_ROWS: CodeLegendRow[] = [
    {
        title: 'Círculo 1: Tamaño',
        marker: 'token',
        items: [
            { token: '1', label: 'Micro' },
            { token: '2', label: 'Pequeña' },
            { token: '3', label: 'Mediana' },
            { token: '4', label: 'Grande' },
            { token: '5', label: 'Corporativo' },
            { token: '-', label: 'Sin dato' }
        ]
    },
    {
        title: 'Círculo 2: Ubicación',
        marker: 'token',
        items: [
            { token: 'L', label: 'Local (Monterrey)' },
            { token: 'N', label: 'Nacional (fuera de MTY)' },
            { token: 'I', label: 'Internacional' },
            { token: '-', label: 'Sin dato' }
        ]
    },
    {
        title: 'Círculo 3: Leads activos',
        marker: 'dot',
        items: [
            { color: '#10b981', label: '1 a 2' },
            { color: '#f59e0b', label: '3 a 5' },
            { color: '#ef4444', label: '6 o más' },
            { color: '#9ca3af', label: '0' }
        ]
    },
    {
        title: 'Círculo 4: Clientes activos',
        marker: 'dot',
        items: [
            { color: '#06b6d4', label: '1 a 2' },
            { color: '#6366f1', label: '3 a 5' },
            { color: '#7c3aed', label: '6 o más' },
            { color: '#9ca3af', label: '0' }
        ]
    },
    {
        title: 'Círculo 5: Próxima acción',
        marker: 'dot',
        items: [
            { color: '#16a34a', label: 'Tiene acción pendiente' },
            { color: '#9ca3af', label: 'Sin acción pendiente' }
        ]
    }
]

function resolveLifecycle(company: CompanyWithProjects): LifecycleStage {
    if (Number(company.activeProjects || 0) > 0) return 'client'
    const lifecycle = String(company.lifecycle_stage || '').toLowerCase()
    const sourceChannel = String(company.source_channel || '').toLowerCase()
    const preLeadsCount = Number(company.pre_leads_count || 0)
    const leadsCount = Number(company.leads_count || 0)
    if (lifecycle === 'pre_lead' || sourceChannel === 'pre_lead' || (preLeadsCount > 0 && leadsCount === 0)) {
        return 'pre_lead'
    }
    return 'lead'
}

function resolveLocationBand(company: CompanyWithProjects): 'monterrey' | 'mexico' | 'international' | 'unknown' {
    const groupRaw = String(company.ubicacion_group || '').toLowerCase()
    if (groupRaw.includes('intern')) return 'international'
    if (groupRaw.includes('mex')) return 'mexico'

    const facet = getLocationFilterFacetFromStructured(company)
    if (facet.isMonterreyMetro) return 'monterrey'

    const normalized = String(facet.normalizedLabel || company.ubicacion || '').toLowerCase()
    if (!normalized.trim()) return 'unknown'
    const internationalKeywords = [
        'usa',
        'united states',
        'eeuu',
        'canada',
        'colombia',
        'argentina',
        'chile',
        'peru',
        'españa',
        'spain',
        'france',
        'germany',
        'uk',
        'reino unido',
        'brazil',
        'brasil'
    ]
    if (internationalKeywords.some((keyword) => normalized.includes(keyword))) return 'international'
    return 'mexico'
}

function resolveSizeCode(company: CompanyWithProjects): string {
    const sizeLevel = Math.round(Number(company.tamano || 0))
    if (Number.isFinite(sizeLevel) && sizeLevel >= 1 && sizeLevel <= 5) {
        return String(sizeLevel)
    }
    return '-'
}

function resolveLocationCode(company: CompanyWithProjects): string {
    const locationBand = resolveLocationBand(company)
    if (locationBand === 'monterrey') return 'L'
    if (locationBand === 'mexico') return 'N'
    if (locationBand === 'international') return 'I'
    return '-'
}

function buildCompanyCodes(company: CompanyWithProjects): CompanyCode[] {
    const sizeCode = resolveSizeCode(company)
    const locationCode = resolveLocationCode(company)
    const openLeads = Number(company.processProjects || 0)
    const openLeadsColor = openLeads <= 0
        ? '#9ca3af'
        : openLeads <= 2
            ? '#10b981'
            : openLeads <= 5
                ? '#f59e0b'
                : '#ef4444'

    const activeClients = Number(company.activeProjects || 0)
    const activeClientsColor = activeClients <= 0
        ? '#9ca3af'
        : activeClients <= 2
            ? '#06b6d4'
            : activeClients <= 5
                ? '#6366f1'
                : '#7c3aed'

    const hasPendingAction = company.next_action_type === 'task' || company.next_action_type === 'meeting'
    const nextActionColor = hasPendingAction ? '#16a34a' : '#9ca3af'
    const nextActionLabel = hasPendingAction
        ? `Tiene acción pendiente${company.next_action_label ? `: ${company.next_action_label}` : ''}`
        : 'Sin acción pendiente'

    return [
        {
            kind: 'token',
            value: sizeCode,
            tooltip: `Tamaño: ${SIZE_CODE_LABELS[sizeCode] || 'Sin dato'}`
        },
        {
            kind: 'token',
            value: locationCode,
            tooltip: `Ubicación: ${LOCATION_CODE_LABELS[locationCode] || 'Sin dato'}`
        },
        {
            kind: 'dot',
            color: openLeadsColor,
            tooltip: `Leads activos: ${openLeads}`
        },
        {
            kind: 'dot',
            color: activeClientsColor,
            tooltip: `Clientes activos: ${activeClients}`
        },
        {
            kind: 'dot',
            color: nextActionColor,
            tooltip: `Próxima acción: ${nextActionLabel}`
        }
    ]
}

function resolveStageVisual(lifecycle: LifecycleStage) {
    if (lifecycle === 'pre_lead') {
        return {
            label: 'Suspect',
            background: 'rgba(37, 99, 235, 0.12)',
            borderColor: 'rgba(37, 99, 235, 0.28)',
            color: '#2563eb'
        }
    }
    if (lifecycle === 'client') {
        return {
            label: 'Cliente',
            background: 'rgba(14, 116, 144, 0.14)',
            borderColor: 'rgba(14, 116, 144, 0.28)',
            color: '#0e7490'
        }
    }
    return {
        label: 'Lead',
        background: 'rgba(16, 185, 129, 0.12)',
        borderColor: 'rgba(16, 185, 129, 0.28)',
        color: '#047857'
    }
}

function checkPermission(company: CompanyWithProjects, profile: ProfileLite) {
    if (!profile) return false
    if (profile.role === 'admin' || profile.role === 'rh') return true
    return profile.id === company.owner_id
}

function renderCodeTooltip(content: ReactNode, key: string, tooltip: string) {
    return (
        <span key={key} className='group relative inline-flex cursor-help' title={tooltip}>
            {content}
            <span
                role='tooltip'
                className='pointer-events-none absolute left-1/2 top-full z-40 mt-2 w-max max-w-[220px] -translate-x-1/2 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-primary)] shadow-lg opacity-0 translate-y-1 transition-all duration-150 group-hover:opacity-100 group-hover:translate-y-0'
            >
                <span className='pointer-events-none absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-l border-t border-[var(--card-border)] bg-[var(--card-bg)]' />
                <span className='relative block whitespace-normal leading-snug text-center'>
                    {tooltip}
                </span>
            </span>
        </span>
    )
}

function renderCodeDot(color: string, key: string, tooltip: string) {
    return (
        renderCodeTooltip(
            <span
                className='w-5 h-5 rounded-full border border-white/70 shadow-sm'
                style={{ backgroundColor: color }}
            />,
            key,
            tooltip
        )
    )
}

function renderCodeToken(value: string, key: string, tooltip: string) {
    return (
        renderCodeTooltip(
            <span
                className='inline-flex h-[26px] min-w-[26px] items-center justify-center rounded-full border border-[var(--card-border)] bg-[var(--card-bg)] px-2 text-[12px] font-black'
                style={{ color: 'var(--text-primary)' }}
            >
                {value}
            </span>,
            key,
            tooltip
        )
    )
}

const clampTwoLinesStyle: CSSProperties = {
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    whiteSpace: 'normal',
    wordBreak: 'break-word',
    lineHeight: 1.25
}

export default function CompaniesTable({
    companies,
    recentCompanies = [],
    highlightedCompanyId = null,
    isEditingMode = false,
    currentUserProfile,
    onRowClick,
    onEdit,
    onDelete
}: CompaniesTableProps) {
    const [isLegendOpen, setIsLegendOpen] = useState(false)
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
        return () => setMounted(false)
    }, [])

    const recentCompanyIds = useMemo(
        () => new Set(recentCompanies.map((company) => String(company.id || ''))),
        [recentCompanies]
    )

    const rows = useMemo(() => (
        companies.map((company) => ({
            company,
            lifecycle: resolveLifecycle(company)
        }))
    ), [companies])

    if (rows.length === 0) {
        return (
            <div className='w-full p-8 text-center bg-white rounded-2xl border border-gray-200 shadow-sm'>
                <p className='text-gray-500 text-lg'>No hay empresas registradas.</p>
            </div>
        )
    }

    return (
        <>
            <div className='ah-table-scroll custom-scrollbar'>
                <table className='ah-table'>
                    <thead>
                        <tr>
                            {isEditingMode && <th className='px-2 py-5 whitespace-nowrap w-[40px] text-center'>Edit</th>}
                            <th className='px-4 py-5 w-[240px] max-w-[240px]'>Empresa</th>
                            <th className='px-4 py-5 w-[170px] max-w-[170px]'>Industria</th>
                            <th className='px-6 py-5'>Responsable</th>
                            {isEditingMode && <th className='px-2 py-5 whitespace-nowrap w-[40px] text-center'>Delete</th>}
                            <th className='px-4 py-5 whitespace-nowrap text-center'>
                                <button
                                    type='button'
                                    onClick={() => setIsLegendOpen(true)}
                                    className='inline-flex items-center gap-2 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)] transition-all cursor-pointer hover:-translate-y-[1px] hover:border-[var(--input-focus)] hover:text-[var(--text-primary)]'
                                >
                                    Códigos
                                    <Info size={14} />
                                </button>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(({ company, lifecycle }) => {
                            const companyId = String(company.id || company.nombre || '')
                            const stageVisual = resolveStageVisual(lifecycle)
                            const companyCodes = buildCompanyCodes(company)
                            const isHighlighted = Boolean(highlightedCompanyId && companyId === highlightedCompanyId)
                            const isRecent = recentCompanyIds.has(companyId)
                            const responsibleName =
                                String(company.responsible_name || company.registered_by_name || '').trim() || 'Sin responsable'
                            const industryName = Array.isArray(company.industrias) && company.industrias.length > 0
                                ? company.industrias.filter(Boolean).join(', ')
                                : String(company.industria || '').trim() || 'Sin industria'

                            return (
                                <tr
                                    key={companyId}
                                    onClick={() => {
                                        if (!isEditingMode) onRowClick?.(company)
                                    }}
                                    className={`transition-colors ${isEditingMode ? '' : 'hover:bg-black/5 cursor-pointer'}`}
                                    style={isHighlighted
                                        ? {
                                            background: 'rgba(249, 115, 22, 0.14)',
                                            boxShadow: 'inset 0 0 0 1px rgba(249, 115, 22, 0.26)'
                                        }
                                        : undefined}
                                >
                                    {isEditingMode && (
                                        <td className='px-2 py-5 text-center'>
                                            {checkPermission(company, currentUserProfile) ? (
                                                <button
                                                    onClick={(event) => {
                                                        event.stopPropagation()
                                                        onEdit?.(company)
                                                    }}
                                                    className='p-2 rounded-xl border border-transparent text-amber-500 hover:bg-amber-500/10 hover:border-amber-500/35 hover:text-amber-400 transition-all cursor-pointer'
                                                    title='Editar empresa'
                                                >
                                                    <svg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='#f59e0b' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round'>
                                                        <path d='M12 20h9' />
                                                        <path d='M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z' />
                                                    </svg>
                                                </button>
                                            ) : (
                                                <span className='text-gray-300 p-2' title='Sin permisos'>Bloqueado</span>
                                            )}
                                        </td>
                                    )}

                                    <td className='px-4 py-5 w-[240px] max-w-[240px]'>
                                        <div className='flex flex-col gap-2 min-w-0'>
                                            <div className='flex items-start gap-2 min-w-0'>
                                                <p className='font-black text-sm' style={{ color: 'var(--text-primary)', ...clampTwoLinesStyle }}>
                                                    {company.nombre}
                                                </p>
                                                {isRecent && (
                                                    <span
                                                        className='inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border'
                                                        style={{
                                                            background: 'rgba(249, 115, 22, 0.13)',
                                                            borderColor: 'rgba(249, 115, 22, 0.28)',
                                                            color: '#c2410c'
                                                        }}
                                                    >
                                                        Nuevo
                                                    </span>
                                                )}
                                            </div>
                                            <span
                                                className='inline-flex w-fit items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border'
                                                style={{
                                                    background: stageVisual.background,
                                                    borderColor: stageVisual.borderColor,
                                                    color: stageVisual.color
                                                }}
                                            >
                                                {stageVisual.label}
                                            </span>
                                        </div>
                                    </td>

                                    <td className='px-4 py-5 w-[170px] max-w-[170px]'>
                                        <span className='text-xs font-semibold' style={{ color: 'color-mix(in srgb, var(--text-secondary) 88%, #6b7280)', ...clampTwoLinesStyle }}>
                                            {industryName}
                                        </span>
                                    </td>

                                    <td className='px-6 py-5'>
                                        <span className='font-bold text-sm' style={{ color: 'var(--text-primary)', ...clampTwoLinesStyle }}>
                                            {responsibleName}
                                        </span>
                                    </td>

                                    {isEditingMode && (
                                        <td className='px-2 py-5 text-center'>
                                            {checkPermission(company, currentUserProfile) ? (
                                                <button
                                                    onClick={(event) => {
                                                        event.stopPropagation()
                                                        const deleteId = String(company.id || '').trim()
                                                        if (deleteId) onDelete?.(deleteId)
                                                    }}
                                                    className='p-2 rounded-xl border border-transparent text-rose-500 hover:bg-rose-500/10 hover:border-rose-500/35 hover:text-rose-400 transition-all cursor-pointer'
                                                    title='Eliminar empresa'
                                                >
                                                    <svg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round'>
                                                        <path d='M3 6h18' />
                                                        <path d='M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6' />
                                                        <path d='M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2' />
                                                    </svg>
                                                </button>
                                            ) : (
                                                <span className='text-gray-300 p-2' title='Sin permisos'>Bloqueado</span>
                                            )}
                                        </td>
                                    )}

                                    <td className='px-4 py-5'>
                                        <div className='flex items-center justify-center gap-1.5'>
                                            {companyCodes.map((code, index) => (
                                                code.kind === 'token'
                                                    ? renderCodeToken(code.value, `${companyId}-token-${index}`, code.tooltip)
                                                    : renderCodeDot(code.color, `${companyId}-dot-${index}`, code.tooltip)
                                            ))}
                                        </div>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {isLegendOpen && mounted && typeof document !== 'undefined' && createPortal(
                <div
                    className='ah-modal-overlay z-[10070]'
                    style={{ alignItems: 'center', paddingTop: 16, paddingBottom: 16 }}
                    onClick={(event) => {
                        if (event.target === event.currentTarget) setIsLegendOpen(false)
                    }}
                >
                    <div className='ah-modal-panel w-full max-w-2xl'>
                        <div className='ah-modal-header'>
                            <div>
                                <h3 className='ah-modal-title text-lg'>Leyenda de Códigos</h3>
                                <p className='ah-modal-subtitle'>Interpretación de los 5 círculos</p>
                            </div>
                            <button className='ah-modal-close' onClick={() => setIsLegendOpen(false)} aria-label='Cerrar leyenda'>
                                <X size={18} />
                            </button>
                        </div>

                        <div className='ah-modal-body custom-scrollbar space-y-4'>
                            <div className='rounded-xl border border-[var(--card-border)] bg-[var(--hover-bg)] px-4 py-3'>
                                <p className='text-xs font-bold text-[var(--text-secondary)]'>
                                    Orden fijo: Tamaño (1-5), Ubicación (L/N/I), Leads activos, Clientes activos, Próxima acción.
                                </p>
                            </div>

                            {CODE_LEGEND_ROWS.map((row) => (
                                <div key={row.title} className='rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4 space-y-3'>
                                    <p className='text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]'>
                                        {row.title}
                                    </p>
                                    <div className='flex flex-wrap gap-2'>
                                        {row.items.map((item) => (
                                            <div
                                                key={`${row.title}-${item.label}-${item.token || item.color || 'x'}`}
                                                className='inline-flex items-center gap-2 rounded-lg border border-[var(--card-border)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--text-primary)]'
                                            >
                                                {row.marker === 'token'
                                                    ? renderCodeToken(String(item.token || '-'), `${row.title}-${item.token || item.label}`, item.label)
                                                    : renderCodeDot(String(item.color || '#9ca3af'), `${row.title}-${item.color || item.label}`, item.label)}
                                                {item.label}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className='ah-modal-footer'>
                            <button
                                type='button'
                                onClick={() => setIsLegendOpen(false)}
                                className='ah-modal-btn ah-modal-btn-secondary'
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    )
}
