'use client'

import { useState, useEffect, useMemo } from 'react'
import { Search, Briefcase, Filter, Users, User, Building2, Building, MessageSquareQuote, ThumbsUp, Gem, MapPin, Medal, Shield, Trophy, Calendar, Layers, Ruler, Flame, Target, type LucideIcon } from 'lucide-react'
import DetailedUserModal from '@/components/DetailedUserModal'
import RoleBadge from '@/components/RoleBadge'
import BadgeInfoTooltip from '@/components/BadgeInfoTooltip'
import { getCatalogs } from '@/app/actions/catalogs'
import { getRoleMeta, getRoleSilhouetteColor } from '@/lib/roleUtils'
import { useTheme } from '@/lib/ThemeContext'
import BadgeMedallion from '@/components/BadgeMedallion'
import { buildIndustryBadgeVisualMap, getIndustryBadgeVisualFromMap } from '@/lib/industryBadgeVisuals'
import { getSpecialBadgeVisualSpec } from '@/lib/specialBadgeVisuals'
import { formatTenureExactLabel, getTenureBadgeMetrics } from '@/lib/tenureBadgeUtils'

interface UsersClientProps {
    initialUsers: any[]
}

interface AreaColorMeta {
    bg: string
    border: string
    text: string
    bgStrong: string
    borderStrong: string
}

type ShowcaseBadge = {
    source: 'industry' | 'special'
    type: string
    key: string
    label: string
    level: number
    progress: number
    meta?: {
        isGrantableAdminBadge?: boolean
        grantsGivenCount?: number
    }
}

function getSpecialBadgeShowcaseVisual(badge: ShowcaseBadge) {
    const metallic = 'bg-gradient-to-br from-[#475569] to-[#0f172a]'
    const type = String(badge?.type || '')
    const key = String(badge?.key || '')
    const labelLower = String(badge?.label || '').toLowerCase()
    const shared = getSpecialBadgeVisualSpec(type, String(badge?.label || ''), key)
    if (shared) {
        return {
            title: shared.title,
            category: shared.category,
            icon: shared.icon,
            className: shared.centerGradientClass,
            iconClassName: shared.iconClassName,
            ringStyle: shared.ringStyle,
            coreBorderColorClassName: shared.coreBorderColorClassName
        }
    }

    if (type === 'admin_granted') {
        const adminGradient = labelLower.includes('jesus gracia')
            ? 'from-[#a855f7] to-[#6d28d9]'
            : labelLower.includes('rafael sedas')
                ? 'from-[#ef4444] to-[#991b1b]'
                : labelLower.includes('alberto castro')
                    ? 'from-[#3b82f6] to-[#1e3a8a]'
                    : labelLower.includes('eduardo castro')
                        ? 'from-[#22c55e] to-[#166534]'
                        : 'from-[#22c55e] to-[#15803d]'
        const ringStyle: 'royal' = 'royal'
        return { title: 'Distinción Admin', category: 'Distinción directiva', icon: AwardIcon, className: `bg-gradient-to-br ${adminGradient}`, iconClassName: 'text-white', ringStyle }
    }
    if (type === 'company_size') {
        return { title: 'Tamaño Empresa', category: 'Comercial y cobertura', icon: Building2, className: 'bg-gradient-to-br from-[#3b82f6] to-[#1d4ed8]', iconClassName: 'text-white', ringStyle: 'match' as const }
    }
    if (type === 'all_company_sizes') {
        return { title: 'Todos los Tamaños', category: 'Comercial y cobertura', icon: Ruler, className: 'bg-gradient-to-br from-[#f59e0b] to-[#b45309]', iconClassName: 'text-white', ringStyle: 'match' as const }
    }
    if (type === 'multi_industry') {
        return { title: 'Multi-Industria', category: 'Comercial y cobertura', icon: Layers, className: 'bg-gradient-to-br from-[#d946ef] to-[#a21caf]', iconClassName: 'text-white', ringStyle: 'match' as const }
    }
    if (type === 'deal_value_tier') {
        const valueClass = labelLower.includes('10k+')
            ? 'bg-gradient-to-br from-[#7c3aed] to-[#5b21b6]'
            : labelLower.includes('5k-10k')
                ? 'bg-gradient-to-br from-[#0ea5e9] to-[#0369a1]'
                : labelLower.includes('2k-5k')
                    ? 'bg-gradient-to-br from-[#10b981] to-[#047857]'
                    : 'bg-gradient-to-br from-[#f59e0b] to-[#b45309]'
        return { title: 'Mensualidad', category: 'Mensualidad (valor real)', icon: Gem, className: valueClass, iconClassName: 'text-white', ringStyle: 'match' as const }
    }
    if (type === 'location_city') {
        const cityClass = ['monterrey', 'guadalajara', 'cdmx', 'ciudad de mexico', 'puebla', 'queretaro', 'querétaro', 'tijuana', 'merida', 'mérida']
            .some((city) => labelLower.includes(city))
            ? 'bg-gradient-to-br from-[#10b981] to-[#047857]'
            : 'bg-gradient-to-br from-[#f97316] to-[#c2410c]'
        return { title: 'Ubicación Ciudad', category: 'Comercial y cobertura', icon: MapPin, className: cityClass, iconClassName: 'text-white', ringStyle: 'match' as const }
    }
    if (type === 'location_country') {
        const countryClass = labelLower.includes('mex')
            ? 'bg-gradient-to-br from-[#ef4444] to-[#b91c1c]'
            : 'bg-gradient-to-br from-[#06b6d4] to-[#0e7490]'
        return { title: 'Ubicación País', category: 'Comercial y cobertura', icon: MapPin, className: countryClass, iconClassName: 'text-white', ringStyle: 'match' as const }
    }
    if (type === 'closure_milestone') {
        return { title: 'Cierres', category: 'Rendimiento', icon: Building, className: 'bg-gradient-to-br from-[#f97316] to-[#c2410c]', iconClassName: 'text-white', ringStyle: 'match' as const }
    }
    if (type === 'quote_contribution') {
        return { title: 'Aportación de Frases', category: 'Frases', icon: MessageSquareQuote, className: 'bg-gradient-to-br from-[#2563eb] to-[#1d4ed8]', iconClassName: 'text-white', ringStyle: 'match' as const }
    }
    if (type === 'quote_likes_received') {
        return { title: 'Frases con Likes', category: 'Frases', icon: ThumbsUp, className: 'bg-gradient-to-br from-[#0ea5e9] to-[#0369a1]', iconClassName: 'text-white', ringStyle: 'match' as const }
    }
    if (type === 'badge_leader') {
        return { title: 'Líder de Badges', category: 'Badge especial', icon: Medal, className: 'bg-gradient-to-br from-[#f59e0b] to-[#b45309]', iconClassName: 'text-white', ringStyle: 'match' as const }
    }
    if (type === 'reliability_score') {
        return { title: 'Confiabilidad', category: 'Rendimiento', icon: Shield, className: 'bg-gradient-to-br from-[#0ea5e9] to-[#0369a1]', iconClassName: 'text-white', ringStyle: 'match' as const }
    }
    if (type === 'closing_streak') {
        const streakClass = labelLower.includes('pausada')
            ? 'bg-gradient-to-br from-[#6b7280] to-[#374151]'
            : 'bg-gradient-to-br from-[#f97316] to-[#b45309]'
        return { title: 'Racha Imparable', category: 'Rendimiento', icon: Flame, className: streakClass, iconClassName: 'text-white', ringStyle: 'match' as const }
    }

    if (key.includes('value')) {
        return { title: 'Valor de Cierre', category: 'Valor de cierre', icon: Gem, className: 'bg-gradient-to-br from-[#0ea5e9] to-[#0369a1]', iconClassName: 'text-white', ringStyle: 'match' as const }
    }

    return { title: 'Badge especial', category: 'Badge especial', icon: Trophy, className: metallic, iconClassName: 'text-white', ringStyle: 'match' as const }
}

function shouldUseWhiteCoreBorderForShowcaseBadge(type?: string) {
    return type === 'deal_value_tier'
        || type === 'company_size'
        || type === 'all_company_sizes'
        || type === 'multi_industry'
        || type === 'closure_milestone'
        || type === 'seniority_years'
        || type === 'prelead_registered'
        || type === 'lead_registered'
        || type === 'meeting_completed'
        || type === 'reliability_score'
        || type === 'quote_contribution'
        || type === 'quote_likes_received'
}

function getSpecialBadgeOverlayNumber(badge: ShowcaseBadge): string | null {
    const type = String(badge?.type || '')
    if (type === 'company_size') {
        const fromKey = String(badge?.key || '').match(/size_(\d+)/)?.[1]
        if (fromKey) return fromKey
        const fromLabel = String(badge?.label || '').match(/(\d+)/)?.[1]
        return fromLabel || null
    }
    if (type === 'seniority_years' || type === 'tenure_years') {
        const years = Math.max(0, Number(badge?.progress || badge?.level || 0))
        return years > 0 ? String(years) : null
    }
    if (type === 'closing_streak') {
        const streak = Math.max(0, Number(badge?.progress || 0))
        return streak > 0 ? String(streak) : null
    }
    if (type === 'deal_value_tier') {
        const key = String(badge?.key || '')
        if (key === 'value_1k_2k') return '1k'
        if (key === 'value_2k_5k') return '2k'
        if (key === 'value_5k_10k') return '5k'
        if (key === 'value_10k_100k' || key === 'value_10k_plus') return '10k'
        return null
    }
    return null
}

const AwardIcon = Medal

function getUserAreaIds(user: any): string[] {
    const detailAreas = user?.details?.area_ids ?? user?.details?.areas_ids ?? user?.details?.areas
    const normalized = new Set<string>()

    if (Array.isArray(detailAreas)) {
        detailAreas.forEach(area => {
            if (typeof area === 'string' && area.trim()) normalized.add(area.trim())
            if (area && typeof area === 'object' && typeof area.id === 'string' && area.id.trim()) normalized.add(area.id.trim())
        })
    } else if (typeof detailAreas === 'string' && detailAreas.trim()) {
        detailAreas.split(',').map(v => v.trim()).filter(Boolean).forEach(v => normalized.add(v))
    }

    const fallbackAreaId = user?.details?.area_id
    if (typeof fallbackAreaId === 'string' && fallbackAreaId.trim()) normalized.add(fallbackAreaId.trim())

    return Array.from(normalized)
}

function getUserJobPositionIds(user: any): string[] {
    const detailPositions = user?.details?.job_position_ids ?? user?.details?.job_positions
    const normalized = new Set<string>()

    if (Array.isArray(detailPositions)) {
        detailPositions.forEach(position => {
            if (typeof position === 'string' && position.trim()) normalized.add(position.trim())
            if (position && typeof position === 'object' && typeof position.id === 'string' && position.id.trim()) normalized.add(position.id.trim())
        })
    } else if (typeof detailPositions === 'string' && detailPositions.trim()) {
        detailPositions.split(',').map(v => v.trim()).filter(Boolean).forEach(v => normalized.add(v))
    }

    const fallbackPositionId = user?.details?.job_position_id
    if (typeof fallbackPositionId === 'string' && fallbackPositionId.trim()) normalized.add(fallbackPositionId.trim())

    return Array.from(normalized)
}

function hashSeed(seed: string): number {
    let hash = 0
    for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
    return hash
}

function positiveMod(value: number, base: number): number {
    return ((value % base) + base) % base
}

function normalizeAreaName(areaName: string): string {
    return areaName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
}

function getSemanticAreaHue(areaName?: string): number | null {
    if (!areaName) return null
    const normalized = normalizeAreaName(areaName)
    const has = (token: string) => normalized.includes(token)

    if (has('finanza')) return 132
    if (has('recursos humanos') || has('recurso humano') || normalized === 'rh') return 50 // amarillo
    if (has('comercial') || has('ventas') || has('venta')) return 152 // verde-menta
    if (has('marketing')) return 322 // fuchsia
    if (has('legal')) return 6 // rojo
    if (has('tecnolog') || has('desarrollo') || has('developers') || has('developer')) return 212 // azul
    if (has('diseno')) return 276 // morado
    if (has('producto')) return 292 // lila
    if (has('operacion')) return 24 // naranja/melon
    if (has('soporte')) return 188 // cyan
    if (has('administracion')) return 32 // ambar
    if (has('direccion')) return 232 // indigo
    if (has('datos') || has('/ bi') || has('bi')) return 248 // violeta-azulado
    if (has('innovacion')) return 168 // turquesa
    if (has('proyecto')) return 20 // salmon
    if (has('customer success')) return 342 // rosa-salmon
    if (has('otro')) return 30 // taupe warm

    if (has('directores')) return 258 // violeta
    if (has('equipo de marketing')) return 314 // magenta fuerte
    if (has('equipo de ventas')) return 144 // verde brillante
    if (has('equipo de developers')) return 206 // azul acero

    return null
}

function getAreaColorFromSeed(seed: string, theme: 'claro' | 'gris' | 'oscuro', areaName?: string): AreaColorMeta {
    const hash = hashSeed(seed)
    const huePalette = [
        4, 18, 30, 42, 54, 66, 78, 92, 108, 124, 140, 156, 172, 188, 204, 220, 236, 252, 268, 284, 300, 316, 332, 348
    ]
    const semanticHue = getSemanticAreaHue(areaName)
    const semanticOffset = (hash % 2 === 0) ? -6 : 8
    const hue = semanticHue !== null ? positiveMod(semanticHue + semanticOffset, 360) : huePalette[hash % huePalette.length]
    const toneVariant = positiveMod(hash >>> 4, 4)
    const satVariant = positiveMod(hash >>> 7, 3)

    if (theme === 'claro') {
        const lightThemeTones = [
            { bgL: 95, borderL: 64, textL: 24, sat: 78 },
            { bgL: 92, borderL: 58, textL: 22, sat: 84 },
            { bgL: 90, borderL: 54, textL: 20, sat: 88 },
            { bgL: 96, borderL: 68, textL: 28, sat: 72 }
        ]
        const tone = lightThemeTones[toneVariant]
        const sat = tone.sat + satVariant * 4
        return {
            bg: `hsl(${hue} ${sat}% ${tone.bgL}%)`,
            border: `hsl(${hue} ${Math.max(56, sat - 14)}% ${tone.borderL}%)`,
            text: `hsl(${hue} ${Math.max(62, sat - 10)}% ${tone.textL}%)`,
            bgStrong: `hsl(${hue} ${Math.max(70, sat - 6)}% 46%)`,
            borderStrong: `hsl(${hue} ${Math.max(66, sat - 10)}% 40%)`
        }
    }

    if (theme === 'gris') {
        const grayThemeTones = [
            { bgL: 24, borderL: 58, textL: 87, sat: 78, alpha: 0.42 },
            { bgL: 20, borderL: 64, textL: 90, sat: 84, alpha: 0.44 },
            { bgL: 28, borderL: 54, textL: 84, sat: 72, alpha: 0.40 },
            { bgL: 18, borderL: 68, textL: 91, sat: 88, alpha: 0.46 }
        ]
        const tone = grayThemeTones[toneVariant]
        const sat = tone.sat + satVariant * 4
        return {
            bg: `hsl(${hue} ${sat}% ${tone.bgL}% / ${tone.alpha})`,
            border: `hsl(${hue} ${Math.max(66, sat - 8)}% ${tone.borderL}% / 0.82)`,
            text: `hsl(${hue} ${Math.max(82, sat - 2)}% ${tone.textL}%)`,
            bgStrong: `hsl(${hue} ${Math.max(70, sat - 6)}% 44%)`,
            borderStrong: `hsl(${hue} ${Math.max(66, sat - 10)}% 38%)`
        }
    }

    const darkThemeTones = [
        { bgL: 20, borderL: 50, textL: 83, sat: 78, alpha: 0.46 },
        { bgL: 16, borderL: 58, textL: 88, sat: 84, alpha: 0.50 },
        { bgL: 24, borderL: 46, textL: 80, sat: 72, alpha: 0.44 },
        { bgL: 14, borderL: 62, textL: 90, sat: 88, alpha: 0.52 }
    ]
    const tone = darkThemeTones[toneVariant]
    const sat = tone.sat + satVariant * 4
    return {
        bg: `hsl(${hue} 92% 96%)`,
        border: `hsl(${hue} 70% 78%)`,
        text: `hsl(${hue} 75% 32%)`,
        bgStrong: `hsl(${hue} 78% 42%)`,
        borderStrong: `hsl(${hue} 72% 38%)`
    }
}

function getUniqueAreaColor(seedNumber: number): AreaColorMeta {
    const hue = positiveMod(seedNumber * 37, 360)
    return {
        bg: `hsl(${hue} 84% 94%)`,
        border: `hsl(${hue} 72% 62%)`,
        text: `hsl(${hue} 72% 30%)`,
        bgStrong: `hsl(${hue} 74% 46%)`,
        borderStrong: `hsl(${hue} 70% 40%)`
    }
}

function fallbackAreaColor(seed: string): AreaColorMeta {
    const hash = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    return getUniqueAreaColor(hash)
}

function getSemanticAreaColor(name: string, index: number): AreaColorMeta {
    const areaName = name.toLowerCase()
    if (areaName.includes('rh') || areaName.includes('recursos')) {
        return { bg: '#FEF9C3', border: '#FACC15', text: '#854D0E', bgStrong: '#EAB308', borderStrong: '#CA8A04' }
    }
    if (areaName.includes('finanza')) {
        return { bg: '#DCFCE7', border: '#22C55E', text: '#166534', bgStrong: '#16A34A', borderStrong: '#15803D' }
    }
    if (areaName.includes('director')) {
        return { bg: '#F3E8FF', border: '#A855F7', text: '#6B21A8', bgStrong: '#9333EA', borderStrong: '#7E22CE' }
    }
    if (areaName.includes('comercial') || areaName.includes('ventas')) {
        return { bg: '#DBEAFE', border: '#2563EB', text: '#1E3A8A', bgStrong: '#2563EB', borderStrong: '#1D4ED8' }
    }
    if (areaName.includes('marketing')) {
        return { bg: '#FFE4E6', border: '#F43F5E', text: '#9F1239', bgStrong: '#E11D48', borderStrong: '#BE123C' }
    }
    return getUniqueAreaColor(index)
}

export default function UsersClient({ initialUsers }: UsersClientProps) {
    const { theme } = useTheme()
    const [users] = useState(initialUsers)
    const [search, setSearch] = useState('')
    const [selectedArea, setSelectedArea] = useState<string | null>(null)
    const [selectedPosition, setSelectedPosition] = useState<string | null>(null)
    const [hoveredArea, setHoveredArea] = useState<string | null>(null)
    const [selectedUser, setSelectedUser] = useState<any>(null)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [catalogs, setCatalogs] = useState<Record<string, any[]>>({})

    const industryVisualMap = useMemo(() => {
        const industryRows = (catalogs.industras || catalogs.industrias || []) as any[]
        const extras = users.flatMap((user: any) => {
            const featured = Array.isArray(user?.badgeShowcase?.featuredBadges) ? user.badgeShowcase.featuredBadges : []
            return featured
                .filter((badge: ShowcaseBadge) => badge?.source === 'industry' && badge?.key)
                .map((badge: ShowcaseBadge) => ({ id: String(badge.key), name: String(badge.label || 'Industria') }))
        })
        return buildIndustryBadgeVisualMap([
            ...industryRows.map((row: any) => ({ id: String(row?.id || ''), name: String(row?.name || '') })),
            ...extras
        ].filter((row) => row.id))
    }, [catalogs, users])

    useEffect(() => {
        const fetchCats = async () => {
            const res = await getCatalogs()
            if (res.success) setCatalogs(res.data || {})
        }
        fetchCats()
    }, [])

    const filteredUsers = users.filter(user => {
        const searchLower = search.toLowerCase()
        const fullName = (user.full_name || '').toLowerCase()
        const role = (user.role || '').toLowerCase()
        const areaNames = getUserAreaIds(user).map(id => resolve('areas', id)).filter(Boolean)
        const department = areaNames.join(' ').toLowerCase()
        const positionNames = getUserJobPositionIds(user).map(id => resolve('job_positions', id)).filter(Boolean)
        const position = positionNames.join(' ').toLowerCase()

        const matchesSearch = fullName.includes(searchLower) || role.includes(searchLower) || department.includes(searchLower) || position.includes(searchLower)
        const matchesArea = !selectedArea || getUserAreaIds(user).includes(selectedArea)
        const matchesPosition = !selectedPosition || getUserJobPositionIds(user).includes(selectedPosition)

        return matchesSearch && matchesArea && matchesPosition
    })

    function resolve(table: string, id: string) {
        if (!id) return ''
        const list = catalogs[table] || []
        const item = list.find(i => i.id === id)
        return item ? item.name : ''
    }

    const areaColorMap: Record<string, AreaColorMeta> = ((catalogs.areas || []) as { id: string, name: string }[])
        .reduce((acc: Record<string, AreaColorMeta>, area, index) => {
            if (area?.id) acc[area.id] = getSemanticAreaColor(area.name || '', index)
            return acc
        }, {})

    const renderShowcaseBadge = (
        badge: ShowcaseBadge,
        slotKey: string,
        options?: { align?: 'center' | 'start' | 'end'; placement?: 'top' | 'bottom'; tenureStartDate?: string | null }
    ) => {
        if (!badge) return null
        const align = options?.align || 'center'
        const placement = options?.placement || 'top'

        if (badge.source === 'industry') {
            const visual = getIndustryBadgeVisualFromMap(String(badge.key || ''), industryVisualMap, String(badge.label || 'Industria'))
            return (
                <BadgeInfoTooltip
                    key={slotKey}
                    title={String(badge.label || 'Industria')}
                    subtitle='Badge de industria'
                    rows={[
                        { label: 'Niv.', value: String(badge.level || 0) },
                        { label: 'Cier.', value: String(badge.progress || 0) }
                    ]}
                    placement={placement}
                    align={align}
                    density='compact'
                    className='inline-flex cursor-pointer relative z-[2] hover:z-[20] focus-within:z-[20]'
                >
                    <div className='w-11 h-11 flex items-center justify-center shrink-0'>
                        <BadgeMedallion
                            icon={visual.icon}
                            centerClassName={visual.containerClass}
                            iconClassName={visual.iconClass || 'text-white'}
                            ringStyle='match'
                            size='sm'
                            iconSize={12}
                            strokeWidth={2.3}
                        />
                    </div>
                </BadgeInfoTooltip>
            )
        }

        const visual = getSpecialBadgeShowcaseVisual(badge)
        const isSeniorityBadge = String(badge?.type || '') === 'seniority_years' || String(badge?.type || '') === 'tenure_years'
        const tenureMetrics = isSeniorityBadge ? getTenureBadgeMetrics(options?.tenureStartDate || null) : null
        const isGrantableAdminBadge = Boolean(badge?.meta?.isGrantableAdminBadge)
        const grantsGivenCount = Number(badge?.meta?.grantsGivenCount ?? badge?.progress ?? 0)
        return (
            <BadgeInfoTooltip
                key={slotKey}
                title={String(badge.label || visual.title || 'Badge especial')}
                subtitle={isGrantableAdminBadge ? 'Distinción que puede otorgar' : String(visual.category || 'Badge especial')}
                rows={isGrantableAdminBadge
                    ? [{ label: 'Otorg.', value: String(grantsGivenCount) }]
                    : isSeniorityBadge && tenureMetrics
                        ? [
                            { label: 'Años', value: String(tenureMetrics.years) },
                            { label: 'Tiempo', value: formatTenureExactLabel(tenureMetrics) },
                            { label: 'Prog.', value: `${tenureMetrics.progressPctToNextLevel.toFixed(2)}%` },
                            { label: 'Sig.', value: `${tenureMetrics.nextLevelYears} años` }
                        ]
                    : [
                        { label: 'Niv.', value: String(badge.level || 0) },
                        { label: 'Prog.', value: String(badge.progress || 0) }
                    ]}
                placement={placement}
                align={align}
                density='compact'
                className='inline-flex cursor-pointer relative z-[2] hover:z-[20] focus-within:z-[20]'
            >
                <div className='w-11 h-11 flex items-center justify-center shrink-0'>
                    <BadgeMedallion
                        icon={visual.icon as LucideIcon}
                        centerClassName={visual.className}
                        iconClassName={visual.iconClassName}
                        ringStyle={visual.ringStyle}
                        overlayText={isSeniorityBadge ? null : getSpecialBadgeOverlayNumber(badge as any)}
                        footerBubbleText={isSeniorityBadge ? String(tenureMetrics?.years ?? Math.max(0, Number(badge.level || badge.progress || 0))) : null}
                        coreBorderColorClassName={String((visual as any)?.coreBorderColorClassName || '')
                            || (shouldUseWhiteCoreBorderForShowcaseBadge(String(badge?.type || '')) ? 'border-white/90' : '')}
                        size='sm'
                        iconSize={12}
                        strokeWidth={2.3}
                    />
                </div>
            </BadgeInfoTooltip>
        )
    }

    const renderEmptyBadgeSlot = (slotKey: string, tone: 'royal' | 'default' = 'default') => (
        <div
            key={slotKey}
            className='w-11 h-11 rounded-full border flex items-center justify-center shrink-0'
            style={{
                borderColor: tone === 'royal' ? 'rgba(148,163,184,0.35)' : 'rgba(255,255,255,0.10)',
                background: tone === 'royal'
                    ? 'linear-gradient(135deg, rgba(71,85,105,0.22), rgba(30,41,59,0.18))'
                    : 'rgba(255,255,255,0.03)'
            }}
        >
            <div className='w-3 h-3 rounded-full' style={{ background: 'rgba(255,255,255,0.06)' }} />
        </div>
    )

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Header & Search */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-6">
                    <div className="ah-icon-card shrink-0">
                        <Users size={34} strokeWidth={1.9} />
                    </div>
                    <div>
                        <h1 className="text-4xl font-black text-[var(--text-primary)] tracking-tight">
                            Directorio de Equipo
                        </h1>
                        <p className="text-[var(--text-secondary)] mt-2 font-medium">Conoce a todos los integrantes de la organización</p>
                    </div>
                </div>

                <div className="relative max-w-md w-full">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" size={18} />
                    <input
                        type="text"
                        placeholder="Buscar por nombre, puesto o área..."
                        className="ah-search-input rounded-2xl text-sm font-bold"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            {/* Filters */}
            <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-secondary)]">Área:</span>
                    <button
                        onClick={() => setSelectedArea(null)}
                        className={`px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border-2 cursor-pointer ${!selectedArea
                            ? 'bg-[#2048FF] border-[#2048FF] text-white shadow-lg shadow-blue-500/20'
                            : 'bg-[var(--card-bg)] border-[var(--card-border)] text-[var(--text-secondary)] hover:border-[#2048FF]/30'
                            }`}
                    >
                        Todas
                    </button>
                    {(catalogs.areas || []).map(area => (
                        <button
                            key={area.id}
                            onClick={() => setSelectedArea(area.id)}
                            onMouseEnter={() => setHoveredArea(area.id)}
                            onMouseLeave={() => setHoveredArea(null)}
                            className='px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border-2 cursor-pointer'
                            style={{
                                background: selectedArea === area.id
                                    ? (areaColorMap[area.id]?.bgStrong || '#2048FF')
                                    : (hoveredArea === area.id ? (areaColorMap[area.id]?.bg || 'var(--hover-bg)') : 'var(--card-bg)'),
                                borderColor: selectedArea === area.id
                                    ? (areaColorMap[area.id]?.borderStrong || '#2048FF')
                                    : (hoveredArea === area.id ? (areaColorMap[area.id]?.border || 'var(--card-border)') : 'var(--card-border)'),
                                color: selectedArea === area.id
                                    ? '#ffffff'
                                    : (hoveredArea === area.id ? (areaColorMap[area.id]?.text || 'var(--text-primary)') : 'var(--text-secondary)'),
                                boxShadow: selectedArea === area.id ? `0 10px 22px -12px ${areaColorMap[area.id]?.borderStrong || '#2048FF'}` : 'none'
                            }}
                        >
                            {area.name}
                        </button>
                    ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_220px] gap-3">
                    <div className="relative w-full">
                        <Filter className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] opacity-70" size={16} />
                        <select
                            value={selectedPosition || ''}
                            onChange={(e) => setSelectedPosition(e.target.value || null)}
                            className="w-full h-12 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] pl-14 pr-4 appearance-none text-[11px] font-black uppercase tracking-[0.08em] text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[#2048FF]/20 focus:border-[#2048FF]"
                        >
                            <option value="">Puesto: Todos</option>
                            {(catalogs.job_positions || []).map(position => (
                                <option key={position.id} value={position.id}>{position.name}</option>
                            ))}
                        </select>
                    </div>

                    <button
                        onClick={() => {
                            setSelectedArea(null)
                            setSelectedPosition(null)
                        }}
                        className={`h-12 px-6 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border-2 ${!selectedArea
                            && !selectedPosition
                            ? 'bg-[#1700AC] border-[#1700AC] text-white shadow-lg shadow-indigo-500/20'
                            : 'bg-[var(--card-bg)] border-[var(--card-border)] text-[var(--text-secondary)] hover:border-[#2048FF]/30'
                            }`}
                    >
                        Limpiar Filtros
                    </button>
                </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredUsers.map(user => {
                    const roleMeta = getRoleMeta(user.role)
                    const isAdmin = user.role === 'admin'
                    const silhouetteColor = getRoleSilhouetteColor(user.role)
                    const cardHoverClass = isAdmin
                        ? 'hover:border-amber-400 hover:shadow-amber-500/10'
                        : 'hover:border-emerald-400 hover:shadow-emerald-500/10'
                    const avatarHoverClass = isAdmin
                        ? 'group-hover:border-amber-400'
                        : 'group-hover:border-emerald-400'
                    const nameHoverClass = isAdmin
                        ? 'group-hover:text-amber-300'
                        : 'group-hover:text-emerald-300'
                    const areaIds = getUserAreaIds(user)
                    const adminDistinctions = (Array.isArray(user?.badgeShowcase?.adminDistinctions) ? user.badgeShowcase.adminDistinctions : []) as ShowcaseBadge[]
                    const grantableAdminBadge = (user?.badgeShowcase?.grantableAdminBadge || null) as ShowcaseBadge | null
                    const isGrantingAdmin = Boolean(grantableAdminBadge)
                    const rawFeaturedBadges = (Array.isArray(user?.badgeShowcase?.featuredBadges) ? user.badgeShowcase.featuredBadges : []) as ShowcaseBadge[]
                    const seniorityBadge = rawFeaturedBadges.find(
                        (badge) => badge.type === 'seniority_years' || badge.type === 'tenure_years'
                    ) || null
                    const featuredBadges = rawFeaturedBadges.filter(
                        (badge) => badge.type !== 'seniority_years' && badge.type !== 'tenure_years'
                    )
                    const jobPositionNames = getUserJobPositionIds(user).map(id => resolve('job_positions', id)).filter(Boolean)
                    const areaItems = areaIds
                        .map(areaId => {
                            const name = resolve('areas', areaId)
                            return name ? { id: areaId, name } : null
                        })
                        .filter(Boolean) as { id: string, name: string }[]

                    return (
                        <div
                            key={user.id}
                            onClick={() => {
                                setSelectedUser(user)
                                setIsModalOpen(true)
                            }}
                            className={`group bg-[var(--card-bg)] border border-[var(--card-border)] rounded-3xl p-6 transition-all cursor-pointer hover:shadow-2xl relative overflow-visible active:scale-[0.98] ${cardHoverClass}`}
                        >
                            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-blue-500/5 to-purple-500/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />

                            <div className="flex flex-col items-center text-center min-h-[420px]">
                                {!isGrantingAdmin ? (
                                    <div className='w-full mb-5'>
                                        <p className='text-[9px] font-black uppercase tracking-[0.16em] mb-2 opacity-70' style={{ color: 'var(--text-secondary)' }}>
                                            Distinciones directivas
                                        </p>
                                        <div className='w-full rounded-2xl border px-3 py-2 flex items-center justify-center gap-2'
                                            style={{ borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}
                                        >
                                            {Array.from({ length: 4 }).map((_, idx) =>
                                                adminDistinctions[idx]
                                                    ? renderShowcaseBadge(adminDistinctions[idx], `admin-${user.id}-${idx}`, {
                                                        align: idx === 0 ? 'start' : idx === 3 ? 'end' : 'center',
                                                        placement: 'bottom'
                                                    })
                                                    : renderEmptyBadgeSlot(`admin-empty-${user.id}-${idx}`, 'royal')
                                            )}
                                        </div>
                                    </div>
                                ) : null}

                                <div className='relative'>
                                    <div className={`w-20 h-20 rounded-2xl border-2 border-[var(--card-border)] overflow-hidden transition-colors shadow-lg ${avatarHoverClass}`}>
                                        {user.avatar_url ? (
                                            <img src={user.avatar_url} alt={user.full_name} className="w-full h-full object-cover" />
                                        ) : (
                                            <div
                                                className="w-full h-full flex items-center justify-center"
                                                style={{ background: 'var(--hover-bg)' }}
                                            >
                                                <User size={32} strokeWidth={1.9} style={{ color: silhouetteColor }} />
                                            </div>
                                        )}
                                    </div>
                                    {grantableAdminBadge ? (
                                        <div className='absolute -top-3 -right-3 z-[6]'>
                                            {renderShowcaseBadge(grantableAdminBadge, `grantable-admin-${user.id}`, {
                                                align: 'end',
                                                placement: 'bottom'
                                            })}
                                        </div>
                                    ) : null}
                                </div>

                                <div className='mt-4 w-full'>
                                    <div className='flex items-center justify-center gap-2 min-w-0'>
                                        <h3 className={`min-w-0 text-lg font-black text-[var(--text-primary)] transition-colors line-clamp-1 ${nameHoverClass}`}>
                                            {user.full_name}
                                        </h3>
                                        {seniorityBadge && renderShowcaseBadge(seniorityBadge, `seniority-name-${user.id}`, {
                                            align: 'end',
                                            placement: 'bottom',
                                            tenureStartDate: user?.details?.start_date || null
                                        })}
                                    </div>
                                    <p className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-[0.2em] mt-1">
                                        {jobPositionNames.length > 0 ? jobPositionNames.join(' / ') : roleMeta.label}
                                    </p>
                                    <RoleBadge role={user.role} className='mt-2' compact />
                                </div>

                                <div className='mt-auto w-full pt-4'>
                                    <div className='w-full rounded-2xl border px-3 py-3 mb-3'
                                        style={{ borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}
                                    >
                                        <div className='flex items-center justify-between gap-2 mb-2'>
                                            <p className='text-[9px] font-black uppercase tracking-[0.16em] opacity-70' style={{ color: 'var(--text-secondary)' }}>
                                                Badges destacados
                                            </p>
                                            <span className='text-[9px] font-black opacity-60' style={{ color: 'var(--text-secondary)' }}>
                                                5 slots
                                            </span>
                                        </div>
                                        <div className='grid grid-cols-5 gap-2 justify-items-center items-center'>
                                            {Array.from({ length: 5 }).map((_, idx) =>
                                                featuredBadges[idx]
                                                    ? renderShowcaseBadge(featuredBadges[idx], `featured-${user.id}-${idx}`, {
                                                        align: idx === 0 ? 'start' : idx === 4 ? 'end' : 'center',
                                                        placement: 'top'
                                                    })
                                                    : renderEmptyBadgeSlot(`featured-empty-${user.id}-${idx}`)
                                            )}
                                        </div>
                                    </div>

                                <div className="w-full pt-4 border-t border-[var(--card-border)] flex flex-col gap-2">
                                    <p className="text-[9px] font-black uppercase tracking-[0.16em] opacity-70 text-center" style={{ color: 'var(--text-secondary)' }}>
                                        Áreas
                                    </p>
                                    {areaItems.length > 0 ? (
                                        <div className="flex flex-wrap items-center justify-center gap-1.5">
                                            {areaItems.map(area => {
                                                const colorMeta = areaColorMap[area.id] || getAreaColorFromSeed(area.id || area.name, theme, area.name)
                                                return (
                                                    <span
                                                        key={`${user.id}-${area.id}`}
                                                        title={area.name}
                                                        className='px-2.5 py-1 rounded-xl border text-[9px] font-black uppercase tracking-[0.12em] inline-flex items-center gap-1.5'
                                                        style={{ background: colorMeta.bg, borderColor: colorMeta.border, color: colorMeta.text }}
                                                    >
                                                        <Building2 size={11} strokeWidth={1.9} style={{ color: colorMeta.text }} />
                                                        {area.name}
                                                    </span>
                                                )
                                            })}
                                        </div>
                                    ) : (
                                        <span className="px-3 py-1.5 bg-[var(--hover-bg)] rounded-xl text-[10px] font-bold text-[var(--text-secondary)] flex items-center gap-2 justify-center">
                                            <Briefcase size={12} className="text-[#2048FF]" />
                                            Sin Área
                                        </span>
                                    )}
                                    <span className="text-[10px] font-bold text-[var(--text-secondary)] opacity-60">
                                        {user.username || user.email || ''}
                                    </span>
                                </div>
                                </div>
                            </div>
                        </div>
                    )
                })}

                {filteredUsers.length === 0 && (
                    <div className="col-span-full py-20 text-center space-y-4 border-2 border-dashed border-[var(--card-border)] rounded-[40px] opacity-50">
                        <div className="w-16 h-16 bg-[var(--hover-bg)] rounded-full flex items-center justify-center mx-auto text-[var(--text-secondary)]">
                            <Search size={32} />
                        </div>
                        <p className="text-lg font-bold text-[var(--text-secondary)]">No se encontraron usuarios</p>
                    </div>
                )}
            </div>

            {selectedUser && (
                <DetailedUserModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    user={selectedUser}
                    catalogs={catalogs}
                />
            )}
        </div>
    )
}
