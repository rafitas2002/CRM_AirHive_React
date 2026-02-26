'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    X,
    User,
    Briefcase,
    Mail,
    MapPin,
    Calendar,
    Activity,
    GraduationCap,
    Clock,
    Shield,
    Globe,
    Cake,
    Building2,
    Users,
    Award,
    TrendingUp,
    Trophy,
    CheckCircle2,
    ListTodo,
    BarChart3,
    Timer,
    Zap,
    MessageSquareQuote,
    ThumbsUp,
    Flame,
    Gem,
    Ruler,
    Layers,
    MapPinned,
    Medal,
    Flag,
    Building
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { getUserActivitySummary } from '@/app/actions/admin'
import { getUserPublicBadgesSummary, grantAdminBadgeToSeller } from '@/app/actions/badges'
import RoleBadge from '@/components/RoleBadge'
import { getRoleSilhouetteColor } from '@/lib/roleUtils'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'
import { useTheme } from '@/lib/ThemeContext'
import { buildIndustryBadgeVisualMap, getIndustryBadgeVisualFromMap } from '@/lib/industryBadgeVisuals'
import { getSpecialBadgeVisualSpec } from '@/lib/specialBadgeVisuals'
import { formatTenureExactLabel, getTenureBadgeMetrics } from '@/lib/tenureBadgeUtils'
import { formatLocalDateOnly } from '@/lib/dateUtils'
import BadgeInfoTooltip from '@/components/BadgeInfoTooltip'
import BadgeMedallion from '@/components/BadgeMedallion'
import { getIndustryBadgeLevelMedallionVisual } from '@/lib/industryBadgeVisuals'

const BADGE_GRANT_ALLOWED_ADMINS = new Set([
    'Jesus Gracia',
    'Rafael Sedas',
    'Eduardo Castro',
    'Alberto Castro'
])

interface DetailedUserModalProps {
    isOpen: boolean
    onClose: () => void
    user: any // The user data fetched
    catalogs: Record<string, any[]>
}

function shouldUseWhiteCoreBorderForSpecialBadgeType(type?: string) {
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

function getDealValueTierCatalogLabel(badgeKey?: string | null, badgeLabel?: string | null) {
    const key = String(badgeKey || '')
    if (key === 'value_1k_2k') return 'Mensualidad 1k'
    if (key === 'value_2k_5k') return 'Mensualidad 2k'
    if (key === 'value_5k_10k') return 'Mensualidad 5k'
    if (key === 'value_10k_100k' || key === 'value_10k_plus') return 'Mensualidad 10k'

    const label = String(badgeLabel || '').toLowerCase()
    if (label.includes('10,000-100,000') || label.includes('10k')) return 'Mensualidad 10k'
    if (label.includes('5,000-9,999') || label.includes('5k')) return 'Mensualidad 5k'
    if (label.includes('2,000-4,999') || label.includes('2k')) return 'Mensualidad 2k'
    if (label.includes('1,000-1,999') || label.includes('1k')) return 'Mensualidad 1k'
    return String(badgeLabel || 'Mensualidad')
}

export default function DetailedUserModal({ isOpen, onClose, user, catalogs }: DetailedUserModalProps) {
    useBodyScrollLock(isOpen)
    const { profile: currentUser } = useAuth()
    const { theme } = useTheme()
    const [activeTab, setActiveTab] = useState('profile')
    const [activityData, setActivityData] = useState<any>(null)
    const [loadingActivity, setLoadingActivity] = useState(false)
    const [loadingBadges, setLoadingBadges] = useState(false)
    const [grantingAdminBadge, setGrantingAdminBadge] = useState(false)
    const [grantAdminBadgeNotice, setGrantAdminBadgeNotice] = useState<string>('')
    const [grantAdminBadgeError, setGrantAdminBadgeError] = useState<string>('')

    const isSelf = currentUser?.id === user?.id
    const isAdmin = currentUser?.role === 'admin'
    const canSeeAll = isSelf || isAdmin
    const viewerName = String(currentUser?.full_name || '').trim()
    const viewedUserIsGrantingAdmin = String(user?.role || '') === 'admin'
        && BADGE_GRANT_ALLOWED_ADMINS.has(String(user?.full_name || '').trim())
    const canGrantAdminBadge = isAdmin
        && !isSelf
        && !viewedUserIsGrantingAdmin
        && BADGE_GRANT_ALLOWED_ADMINS.has(viewerName)

    async function fetchActivity() {
        if (!user?.id) return
        setLoadingActivity(true)
        const res = await getUserActivitySummary(user.id)
        if (res.success) {
            setActivityData(res.data)
        }
        setLoadingActivity(false)
    }

    async function fetchBadgesOnly() {
        if (!user?.id) return
        setLoadingBadges(true)
        const res = await getUserPublicBadgesSummary(user.id)
        if (res.success) {
            setActivityData((prev: any) => ({
                ...(prev || {}),
                badges: res.data?.badges || { industry: [], special: [] }
            }))
        }
        setLoadingBadges(false)
    }

    async function handleGrantAdminBadgeFromModal() {
        if (!canGrantAdminBadge || grantingAdminBadge || !user?.id) return
        const confirmed = window.confirm('¿Deseas otorgar tu Distinción Administrativa a este usuario? Recuerda: solo puedes otorgar un badge al mes.')
        if (!confirmed) return

        setGrantAdminBadgeNotice('')
        setGrantAdminBadgeError('')
        setGrantingAdminBadge(true)
        const res = await grantAdminBadgeToSeller(String(user.id))
        setGrantingAdminBadge(false)

        if (!res.success) {
            setGrantAdminBadgeError(String(res.error || 'No se pudo otorgar el badge.'))
            return
        }

        setGrantAdminBadgeNotice(String(res.message || 'Badge otorgado correctamente.'))
        if (isAdmin) {
            await fetchActivity()
        } else {
            await fetchBadgesOnly()
        }
    }

    useEffect(() => {
        if (isOpen && isAdmin && user?.id) {
            fetchActivity()
        }
    }, [isOpen, user?.id, isAdmin])

    useEffect(() => {
        if (!isOpen || !user?.id) return
        if (isAdmin) return
        if (activeTab !== 'badges') return
        if (activityData?.badges) return
        void fetchBadgesOnly()
    }, [isOpen, user?.id, isAdmin, activeTab, activityData?.badges])

    const visibleTab = isAdmin ? activeTab : (activeTab === 'badges' ? 'badges' : 'profile')
    const industryCatalog = Array.isArray(catalogs?.industrias) ? catalogs.industrias : []
    const industryExtras = ((activityData?.badges?.industry || []).map((badge: any) => ({
        id: String(badge?.key || ''),
        name: String(badge?.label || 'Industria')
    }))).filter((row: any) => row.id)
    const industryVisualMap = buildIndustryBadgeVisualMap(
        [...industryCatalog.map((row: any) => ({
            id: String(row?.id || ''),
            name: String(row?.name || '')
        })), ...industryExtras].filter((row: any) => row.id)
    )
    const accumulatedBadges = [
        ...((activityData?.badges?.industry || []).map((badge: any) => ({
            id: `industry-${badge?.label || 'badge'}`,
            type: String(badge?.type || 'industry'),
            key: String(badge?.key || ''),
            label: String(badge?.label || 'Industria'),
            level: Number(badge?.level || 0),
            progress: Number(badge?.progress || 0),
            category: 'Industria'
        }))),
        ...((activityData?.badges?.special || []).map((badge: any) => ({
            id: `special-${badge?.key || badge?.label || 'badge'}`,
            type: String(badge?.type || 'special'),
            key: String(badge?.key || ''),
            label: String(badge?.type || '') === 'deal_value_tier'
                ? getDealValueTierCatalogLabel(String(badge?.key || ''), String(badge?.label || ''))
                : String(badge?.label || 'Badge especial'),
            level: Number(badge?.level || 0),
            progress: Number(badge?.progress || 0),
            category: 'Especial'
        })))
    ]
    const industryAccumulatedBadges = accumulatedBadges.filter((badge) => badge.category === 'Industria')
    const specialAccumulatedBadges = accumulatedBadges.filter((badge) => badge.category === 'Especial')

    const getAccumulatedBadgeVisual = (badge: any) => {
        const badgeType = String(badge?.type || '')
        const badgeLabel = String(badge?.label || '').toLowerCase()
        const metallic = 'border-white/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),inset_0_-1px_0_rgba(0,0,0,0.15),0_6px_14px_rgba(15,23,42,0.22)]'
        const isMexicoCity = ['monterrey', 'guadalajara', 'cdmx', 'ciudad de mexico', 'puebla', 'queretaro', 'querétaro', 'tijuana', 'merida', 'mérida']
            .some((city) => badgeLabel.includes(city))

        if (badgeType === 'industry') {
            const industryVisual = getIndustryBadgeVisualFromMap(String(badge?.key || ''), industryVisualMap, String(badge?.label || 'Industria'))
            const levelVisual = getIndustryBadgeLevelMedallionVisual(Number(badge?.level || 1), industryVisual)
            return {
                icon: industryVisual.icon,
                className: industryVisual.containerClass,
                iconClassName: industryVisual.iconClass,
                coreBorderColorClassName: levelVisual.coreBorderColorClassName,
                coreBorderStyle: levelVisual.coreBorderStyle,
                ringStyle: levelVisual.ringStyle
            }
        }
        const shared = getSpecialBadgeVisualSpec(badgeType, String(badge?.label || ''), String(badge?.key || ''))
        if (shared) {
            return {
                icon: shared.icon,
                className: `${metallic} ${shared.centerGradientClass}`,
                matchRingClassName: shared.matchRingClassName ? `${metallic} ${shared.matchRingClassName}` : undefined,
                iconClassName: shared.iconClassName,
                ringStyle: shared.ringStyle,
                coreBorderColorClassName: shared.coreBorderColorClassName,
                clipCenterFillToCoreInterior: shared.clipCenterFillToCoreInterior
            }
        }
        if (badgeType === 'company_size') {
            return { icon: Building2, className: `${metallic} bg-gradient-to-br from-[#3b82f6] to-[#1d4ed8]` }
        }
        if (badgeType === 'location_city') {
            return {
                icon: MapPin,
                className: isMexicoCity
                    ? `${metallic} bg-gradient-to-br from-[#10b981] to-[#047857]`
                    : `${metallic} bg-gradient-to-br from-[#f97316] to-[#c2410c]`
            }
        }
        if (badgeType === 'location_country') {
            return {
                icon: Flag,
                className: badgeLabel.includes('mex')
                    ? `${metallic} bg-gradient-to-br from-[#ef4444] to-[#b91c1c]`
                    : `${metallic} bg-gradient-to-br from-[#06b6d4] to-[#0e7490]`
            }
        }
        if (badgeType === 'race_first_place') {
            return { icon: Trophy, className: `${metallic} bg-gradient-to-br from-[#f59e0b] to-[#a16207]` }
        }
        if (badgeType === 'race_second_place') {
            return { icon: Trophy, className: `${metallic} bg-gradient-to-br from-[#94a3b8] to-[#475569]` }
        }
        if (badgeType === 'race_third_place') {
            return { icon: Trophy, className: `${metallic} bg-gradient-to-br from-[#b45309] to-[#7c2d12]` }
        }
        if (badgeType === 'race_all_positions') {
            return { icon: Layers, className: `${metallic} bg-gradient-to-br from-[#0ea5e9] to-[#0369a1]` }
        }
        if (badgeType === 'race_total_trophies') {
            return { icon: Trophy, className: `${metallic} bg-gradient-to-br from-[#10b981] to-[#047857]` }
        }
        if (badgeType === 'race_points_leader') {
            const isHistoric = badgeLabel.includes('hist')
            return {
                icon: Award,
                className: isHistoric
                    ? `${metallic} bg-gradient-to-br from-[#6b7280] to-[#374151]`
                    : `${metallic} bg-gradient-to-br from-[#f59e0b] to-[#b45309]`
            }
        }
        if (badgeType === 'seniority_years') {
            return { icon: Calendar, className: `${metallic} bg-gradient-to-br from-[#4b5563] to-[#111827]` }
        }
        if (badgeType === 'prelead_registered') {
            return { icon: Briefcase, className: `${metallic} bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9]` }
        }
        if (badgeType === 'lead_registered') {
            return { icon: Users, className: `${metallic} bg-gradient-to-br from-[#3b82f6] to-[#1d4ed8]` }
        }
        if (badgeType === 'meeting_completed') {
            return { icon: Calendar, className: `${metallic} bg-gradient-to-br from-[#7c3aed] to-[#4c1d95]` }
        }
        if (badgeType === 'closure_milestone') {
            return { icon: Building, className: `${metallic} bg-gradient-to-br from-[#f97316] to-[#c2410c]` }
        }
        if (badgeType === 'quote_contribution') {
            return { icon: MessageSquareQuote, className: `${metallic} bg-gradient-to-br from-[#2563eb] to-[#1d4ed8]` }
        }
        if (badgeType === 'quote_likes_received') {
            return { icon: ThumbsUp, className: `${metallic} bg-gradient-to-br from-[#0ea5e9] to-[#0369a1]` }
        }
        if (badgeType === 'closing_streak') {
            return { icon: Flame, className: `${metallic} bg-gradient-to-br from-[#f97316] to-[#b45309]` }
        }
        if (badgeType === 'deal_value_tier') {
            return {
                icon: Gem,
                className: badgeLabel.includes('10k+')
                    ? `${metallic} bg-gradient-to-br from-[#7c3aed] to-[#5b21b6]`
                    : badgeLabel.includes('5k-10k')
                        ? `${metallic} bg-gradient-to-br from-[#0ea5e9] to-[#0369a1]`
                        : badgeLabel.includes('2k-5k')
                            ? `${metallic} bg-gradient-to-br from-[#10b981] to-[#047857]`
                            : `${metallic} bg-gradient-to-br from-[#f59e0b] to-[#b45309]`
            }
        }
        if (badgeType === 'reliability_score') {
            return { icon: Shield, className: `${metallic} bg-gradient-to-br from-[#0ea5e9] to-[#0369a1]` }
        }
        if (badgeType === 'all_company_sizes') {
            return { icon: Ruler, className: `${metallic} bg-gradient-to-br from-[#f59e0b] to-[#b45309]` }
        }
        if (badgeType === 'multi_industry') {
            return { icon: Layers, className: `${metallic} bg-gradient-to-br from-[#d946ef] to-[#a21caf]` }
        }
        if (badgeType === 'location_city' || badgeType === 'location_country') {
            return { icon: MapPinned, className: `${metallic} bg-gradient-to-br from-[#f97316] to-[#c2410c]` }
        }
        if (badgeType === 'admin_granted') {
            const labelLower = badgeLabel.toLowerCase()
            const adminGradient = labelLower.includes('jesus gracia')
                ? 'from-[#a855f7] to-[#6d28d9]'
                : labelLower.includes('rafael sedas')
                    ? 'from-[#ef4444] to-[#991b1b]'
                    : labelLower.includes('alberto castro')
                        ? 'from-[#3b82f6] to-[#1e3a8a]'
                        : labelLower.includes('eduardo castro')
                            ? 'from-[#22c55e] to-[#166534]'
                            : 'from-[#22c55e] to-[#15803d]'
            return { icon: Medal, className: `${metallic} bg-gradient-to-br ${adminGradient}` }
        }
        return { icon: Award, className: `${metallic} bg-gradient-to-br from-[#6b7280] to-[#374151]` }
    }

    const getBadgeOverlayNumber = (badge: any): string | null => {
        if (String(badge?.type || '') === 'company_size') {
            const fromKey = String(badge?.key || '').match(/size_(\d+)/)?.[1]
            if (fromKey) return fromKey
            const fromLabel = String(badge?.label || '').match(/(\d+)/)?.[1]
            return fromLabel || null
        }
        if (String(badge?.type || '') === 'deal_value_tier') {
            const key = String(badge?.key || '')
            if (key === 'value_1k_2k') return '1k'
            if (key === 'value_2k_5k') return '2k'
            if (key === 'value_5k_10k') return '5k'
            if (key === 'value_10k_100k' || key === 'value_10k_plus') return '10k'
            return null
        }
        return null
    }

    // Helper to resolve IDs
    const resolve = (table: string, id: string) => {
        if (!id) return '-'
        const list = catalogs[table] || []
        const item = list.find(i => i.id === id)
        return item ? item.name : '-'
    }

    const getAreaNames = () => {
        const rawAreas = details?.area_ids ?? details?.areas_ids ?? details?.areas
        const areaIds = new Set<string>()

        if (Array.isArray(rawAreas)) {
            rawAreas.forEach((item: any) => {
                if (typeof item === 'string' && item.trim()) areaIds.add(item.trim())
                if (item && typeof item === 'object' && typeof item.id === 'string' && item.id.trim()) areaIds.add(item.id.trim())
            })
        } else if (typeof rawAreas === 'string' && rawAreas.trim()) {
            rawAreas.split(',').map((v: string) => v.trim()).filter(Boolean).forEach((v: string) => areaIds.add(v))
        }

        if (typeof details?.area_id === 'string' && details.area_id.trim()) areaIds.add(details.area_id.trim())

        const names = Array.from(areaIds).map(id => resolve('areas', id)).filter(v => v && v !== '-')
        return names.length > 0 ? names.join(', ') : '-'
    }

    const getJobPositionNames = () => {
        const rawPositions = details?.job_position_ids ?? details?.job_positions
        const jobPositionIds = new Set<string>()

        if (Array.isArray(rawPositions)) {
            rawPositions.forEach((item: any) => {
                if (typeof item === 'string' && item.trim()) jobPositionIds.add(item.trim())
                if (item && typeof item === 'object' && typeof item.id === 'string' && item.id.trim()) jobPositionIds.add(item.id.trim())
            })
        } else if (typeof rawPositions === 'string' && rawPositions.trim()) {
            rawPositions.split(',').map((v: string) => v.trim()).filter(Boolean).forEach((v: string) => jobPositionIds.add(v))
        }

        if (typeof details?.job_position_id === 'string' && details.job_position_id.trim()) jobPositionIds.add(details.job_position_id.trim())

        const names = Array.from(jobPositionIds).map(id => resolve('job_positions', id)).filter(v => v && v !== '-')
        return names.length > 0 ? names.join(', ') : '-'
    }

    const calculateAge = (dateString: string) => {
        if (!dateString) return '-'
        const parts = dateString.split('-')
        const birthDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
        const today = new Date()
        let age = today.getFullYear() - birthDate.getFullYear()
        const m = today.getMonth() - birthDate.getMonth()
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--
        return `${age} años`
    }

    const calculateTenure = (dateString: string) => {
        if (!dateString) return '-'
        const parts = dateString.split('-')
        const start = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
        const now = new Date()
        let years = now.getFullYear() - start.getFullYear()
        let months = now.getMonth() - start.getMonth()
        if (months < 0) { years--; months += 12 }
        if (years < 0) return 'Próximamente'
        const partsArr = []
        if (years > 0) partsArr.push(`${years} año${years !== 1 ? 's' : ''}`)
        if (months > 0) partsArr.push(`${months} mes${months !== 1 ? 'es' : ''}`)
        return partsArr.length > 0 ? partsArr.join(' y ') : 'Menos de un mes'
    }

    if (!user) return null

    const details = user.details || {}
    const silhouetteColor = getRoleSilhouetteColor(user.role)
    const headerTheme = {
        claro: {
            background: 'linear-gradient(135deg, #eef4ff 0%, #dbeafe 45%, #c7d2fe 100%)',
            overlayOpacity: 0.08,
            titleColor: 'var(--text-primary)',
            closeBg: 'rgba(15, 23, 42, 0.08)',
            closeBorder: 'rgba(15, 23, 42, 0.14)',
            closeColor: '#0f172a',
            avatarBorder: 'var(--card-border)',
            avatarBackground: 'var(--hover-bg)',
            avatarFallbackBg: 'linear-gradient(135deg, rgba(148,163,184,0.12), rgba(148,163,184,0.04))'
        },
        gris: {
            background: 'linear-gradient(135deg, #111827 0%, #1f2937 55%, #0f172a 100%)',
            overlayOpacity: 0.12,
            titleColor: '#F9FAFB',
            closeBg: 'rgba(255,255,255,0.10)',
            closeBorder: 'rgba(255,255,255,0.18)',
            closeColor: '#F9FAFB',
            avatarBorder: 'var(--card-border)',
            avatarBackground: 'var(--hover-bg)',
            avatarFallbackBg: 'linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04))'
        },
        oscuro: {
            background: 'linear-gradient(135deg, #05070D 0%, #0B1220 50%, #111827 100%)',
            overlayOpacity: 0.08,
            titleColor: '#FFFFFF',
            closeBg: 'rgba(255,255,255,0.08)',
            closeBorder: 'rgba(255,255,255,0.14)',
            closeColor: '#FFFFFF',
            avatarBorder: 'var(--card-border)',
            avatarBackground: 'var(--hover-bg)',
            avatarFallbackBg: 'linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.04))'
        }
    }[theme]
    const avatarFrameBorder = `color-mix(in srgb, ${silhouetteColor} 70%, var(--card-border))`

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="ah-modal-overlay">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="ah-modal-panel w-full max-w-5xl"
                    >
                        {/* Header Section */}
                        <div className="relative h-36 md:h-40 shrink-0" style={{ background: headerTheme.background }}>
                            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]" style={{ opacity: headerTheme.overlayOpacity }} />
                            <button
                                onClick={onClose}
                                className="absolute top-4 right-4 md:top-5 md:right-5 p-2 rounded-full transition-all z-10 cursor-pointer"
                                style={{
                                    background: headerTheme.closeBg,
                                    border: `1px solid ${headerTheme.closeBorder}`,
                                    color: headerTheme.closeColor
                                }}
                            >
                                <X size={20} />
                            </button>

                            <div className="absolute -bottom-10 md:-bottom-12 left-5 md:left-8 flex items-end gap-4 md:gap-5">
                                <div
                                    className="w-20 h-20 md:w-24 md:h-24 rounded-2xl md:rounded-3xl border-[3px] md:border-4 overflow-hidden shadow-2xl"
                                    style={{ borderColor: avatarFrameBorder || headerTheme.avatarBorder, background: headerTheme.avatarBackground }}
                                >
                                    {user.avatar_url ? (
                                        <img src={user.avatar_url} alt={user.full_name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center" style={{ background: headerTheme.avatarFallbackBg }}>
                                            <User size={30} strokeWidth={1.9} style={{ color: silhouetteColor }} />
                                        </div>
                                    )}
                                </div>
                                <div className="mb-1 md:mb-2">
                                    <h2 className="text-2xl md:text-3xl font-black tracking-tight leading-tight" style={{ color: headerTheme.titleColor }}>{user.full_name}</h2>
                                    <div className="flex flex-wrap items-center gap-2.5 mt-1">
                                        <RoleBadge role={user.role} />
                                        <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                            Activo
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Tabs Navigation */}
                        <div className="mt-14 md:mt-16 px-5 md:px-8 pb-1 border-b flex flex-wrap gap-x-6 gap-y-1" style={{ borderColor: 'var(--card-border)' }}>
                            <button
                                onClick={() => setActiveTab('profile')}
                                className={`pb-3 text-[10px] font-black uppercase tracking-[0.18em] transition-all border-b-2 cursor-pointer ${visibleTab === 'profile' ? 'border-[var(--input-focus)] text-[var(--input-focus)]' : 'border-transparent hover:text-[var(--input-focus)]'}`}
                                style={visibleTab === 'profile' ? undefined : { color: 'var(--text-secondary)' }}
                            >
                                Perfil Profesional
                            </button>
                            {isAdmin && (
                                <button
                                    onClick={() => setActiveTab('performance')}
                                    className={`pb-3 text-[10px] font-black uppercase tracking-[0.18em] transition-all border-b-2 cursor-pointer ${visibleTab === 'performance' ? 'border-[var(--input-focus)] text-[var(--input-focus)]' : 'border-transparent hover:text-[var(--input-focus)]'}`}
                                    style={visibleTab === 'performance' ? undefined : { color: 'var(--text-secondary)' }}
                                >
                                    Desempeño & Actividad
                                </button>
                            )}
                            <button
                                onClick={() => setActiveTab('badges')}
                                className={`pb-3 text-[10px] font-black uppercase tracking-[0.18em] transition-all border-b-2 cursor-pointer ${visibleTab === 'badges' ? 'border-[var(--input-focus)] text-[var(--input-focus)]' : 'border-transparent hover:text-[var(--input-focus)]'}`}
                                style={visibleTab === 'badges' ? undefined : { color: 'var(--text-secondary)' }}
                            >
                                Badges acumuladas
                            </button>
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 overflow-y-auto p-5 md:p-8 custom-scrollbar">
                            {visibleTab === 'profile' ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-12 animate-in fade-in slide-in-from-bottom-4 duration-500">

                                    {/* Info Laboral */}
                                    <section className="space-y-6">
                                        <h3 className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.3em] text-[var(--input-focus)]">
                                            <Briefcase size={14} /> Información Laboral
                                        </h3>
                                        <div className="grid grid-cols-1 gap-4">
                                            <InfoItem icon={Building2} label="Puesto" value={getJobPositionNames()} />
                                            <InfoItem icon={Users} label="Área" value={getAreaNames()} />
                                            <InfoItem icon={Shield} label="Seniority" value={resolve('seniority_levels', details.seniority_id)} />
                                            <InfoItem icon={Activity} label="Modalidad" value={resolve('work_modalities', details.work_modality_id)} />
                                            <InfoItem icon={Calendar} label="Fecha de Ingreso" value={formatLocalDateOnly(details.start_date, 'es-MX', { dateStyle: 'long' })} />
                                            <InfoItem icon={Clock} label="Antigüedad" value={calculateTenure(details.start_date)} highlight />
                                        </div>
                                    </section>

                                    {/* Info Personal (Restricted) */}
                                    <section className="space-y-6">
                                        <h3 className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.3em] text-[var(--input-focus)]">
                                            <User size={14} /> Información Personal
                                        </h3>
                                        {canSeeAll ? (
                                            <div className="grid grid-cols-1 gap-4">
                                                <InfoItem icon={Mail} label="Email Corporativo" value={user.username || user.email || '-'} />
                                                <InfoItem icon={Cake} label="Nacimiento" value={formatLocalDateOnly(details.birth_date, 'es-MX', { dateStyle: 'long' })} />
                                                <InfoItem icon={Activity} label="Edad" value={calculateAge(details.birth_date)} />
                                                <InfoItem icon={GraduationCap} label="Nivel Educativo" value={resolve('education_levels', details.education_level_id)} />
                                                <InfoItem icon={Briefcase} label="Carrera" value={resolve('careers', details.career_id)} />
                                                <InfoItem icon={Globe} label="Ubicación" value={`${resolve('cities', details.city_id)}, ${resolve('countries', details.country_id)}`} />
                                            </div>
                                        ) : (
                                            <div className="p-8 rounded-3xl border flex flex-col items-center justify-center text-center gap-4" style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}>
                                                <Shield size={32} style={{ color: 'var(--text-secondary)', opacity: 0.35 }} />
                                                <p className="text-xs font-bold leading-relaxed" style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
                                                    La información personal es <span style={{ color: 'var(--input-focus)' }}>confidencial</span> y solo <br /> es visible para administración.
                                                </p>
                                            </div>
                                        )}
                                    </section>
                                </div>
                            ) : visibleTab === 'performance' ? (
                                <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                        {/* Metrics Grid */}
                                        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-6">
                                            <MetricCard
                                                icon={TrendingUp}
                                                label="Ventas Últ. Carrera"
                                                value={`$${activityData?.metrics?.lastRaceAmount?.toLocaleString() || '0'}`}
                                                color="blue"
                                            />
                                            <MetricCard
                                                icon={Trophy}
                                                label="Medallas Totales"
                                                value={activityData?.metrics?.totalMedals || '0'}
                                                subtext={`G: ${activityData?.metrics?.medals?.gold || 0} S: ${activityData?.metrics?.medals?.silver || 0} B: ${activityData?.metrics?.medals?.bronze || 0}`}
                                                color="yellow"
                                            />
                                            <MetricCard
                                                icon={CheckCircle2}
                                                label="Tareas Completadas"
                                                value={activityData?.metrics?.completedTasksCount || '0'}
                                                color="emerald"
                                            />
                                            <MetricCard
                                                icon={BarChart3}
                                                label="Forecast Accuracy"
                                                value={`${activityData?.metrics?.forecastAccuracy?.toFixed(0) || '0'}%`}
                                                color="indigo"
                                            />
                                            <MetricCard
                                                icon={BarChart3}
                                                label="Confiab. Valor"
                                                value={`${activityData?.metrics?.valueForecastAccuracy?.toFixed(0) || '0'}%`}
                                                subtext={`${activityData?.metrics?.valueForecastAccuracySamples || 0} cierres`}
                                                color="blue"
                                            />
                                            <MetricCard
                                                icon={Calendar}
                                                label="Confiab. Fecha"
                                                value={`${activityData?.metrics?.closeDateForecastAccuracy?.toFixed(0) || '0'}%`}
                                                subtext={`${activityData?.metrics?.closeDateForecastAccuracySamples || 0} cierres`}
                                                color="purple"
                                            />
                                            <MetricCard
                                                icon={Zap}
                                                label="Effort (Reun/Cierre)"
                                                value={activityData?.metrics?.meetingsPerClose?.toFixed(1) || '0'}
                                                color="amber"
                                            />
                                            <MetricCard
                                                icon={Timer}
                                                label="Velocidad Respuesta"
                                                value={`${activityData?.metrics?.avgResponseTimeHours?.toFixed(1) || '0'}h`}
                                                color="rose"
                                            />
                                            <MetricCard
                                                icon={MapPin}
                                                label="Impacto Presencial"
                                                value={`${activityData?.metrics?.physicalCloseRate?.toFixed(0) || '0'}%`}
                                                color="blue"
                                            />
                                            <MetricCard
                                                icon={Building2}
                                                label="Dominio Industria"
                                                value={activityData?.metrics?.topIndustry || 'N/A'}
                                                color="purple"
                                            />
                                        </div>

                                        {/* Activity List */}
                                        <section className="space-y-6">
                                            <h3 className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.3em] text-[var(--input-focus)]">
                                                <ListTodo size={14} /> Registro de Actividades
                                            </h3>

                                            <div className="rounded-[32px] border overflow-hidden" style={{ borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}>
                                                <table className="w-full text-left">
                                                    <thead>
                                                        <tr className="text-[10px] font-black uppercase tracking-widest" style={{ background: 'var(--table-header-bg)', color: 'var(--text-secondary)' }}>
                                                            <th className="px-6 py-4">Tipo</th>
                                                            <th className="px-6 py-4">Título</th>
                                                            <th className="px-6 py-4">Estado</th>
                                                            <th className="px-6 py-4">Fecha</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y" style={{ borderColor: 'var(--card-border)' }}>
                                                        {loadingActivity ? (
                                                            <tr>
                                                                <td colSpan={4} className="px-6 py-12 text-center">
                                                                    <div className="w-6 h-6 border-2 border-[var(--input-focus)] border-t-transparent rounded-full animate-spin mx-auto" />
                                                                </td>
                                                            </tr>
                                                        ) : activityData?.activities?.length > 0 ? (
                                                            activityData.activities.map((act: any) => (
                                                                <tr key={act.id} className="transition-colors group hover:bg-[var(--hover-bg)]">
                                                                    <td className="px-6 py-4">
                                                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${act.type === 'meeting' ? 'bg-purple-500/10 text-purple-400' :
                                                                            act.type === 'task' ? 'bg-blue-500/10 text-blue-400' : 'bg-emerald-500/10 text-emerald-400'
                                                                            }`}>
                                                                            {act.type === 'meeting' ? <Users size={14} /> : act.type === 'task' ? <Clock size={14} /> : <CheckCircle2 size={14} />}
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-6 py-4">
                                                                        <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{act.title}</p>
                                                                        <p className="text-[10px] truncate max-w-xs" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>{act.description}</p>
                                                                    </td>
                                                                    <td className="px-6 py-4">
                                                                        <span className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest ${act.status === 'completada' || act.status === 'held' || act.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500' :
                                                                            act.status === 'pendiente' || act.status === 'scheduled' ? 'bg-blue-500/10 text-blue-500' : 'bg-red-500/10 text-red-500'
                                                                            }`}>
                                                                            {act.status}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-6 py-4">
                                                                        <p className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>{new Date(act.date).toLocaleDateString()}</p>
                                                                    </td>
                                                                </tr>
                                                            ))
                                                        ) : (
                                                            <tr>
                                                                <td colSpan={4} className="px-6 py-12 text-center font-bold text-sm" style={{ color: 'var(--text-secondary)' }}>
                                                                    No hay actividad registrada
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </section>
                                </div>
                            ) : (
                                <div className='animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-4'>
                                    <div className="rounded-3xl border p-5 md:p-6" style={{ borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}>
                                        <div className='flex flex-wrap items-start justify-between gap-3 mb-2'>
                                            <div>
                                                <h3 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: 'var(--input-focus)' }}>
                                                    <Award size={14} /> Badges acumuladas
                                                </h3>
                                                <p className="text-sm font-semibold mt-2" style={{ color: 'var(--text-secondary)', opacity: 0.9 }}>
                                                    Vista unificada de badges de industria y especiales. Hover para ver detalle completo.
                                                </p>
                                            </div>
                                            {canGrantAdminBadge && (
                                                <button
                                                    type='button'
                                                    onClick={handleGrantAdminBadgeFromModal}
                                                    disabled={grantingAdminBadge}
                                                    className='px-4 py-2 rounded-xl border text-xs font-black uppercase tracking-wider transition-colors cursor-pointer bg-emerald-500/15 border-emerald-400/35 text-emerald-200 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed'
                                                >
                                                    {grantingAdminBadge ? 'Otorgando...' : 'Otorgar Distinción'}
                                                </button>
                                            )}
                                        </div>
                                        {grantAdminBadgeNotice && (
                                            <div className='mb-4 rounded-xl border px-3 py-2 text-xs font-bold' style={{ borderColor: 'rgba(16,185,129,0.35)', background: 'rgba(16,185,129,0.10)', color: '#86efac' }}>
                                                {grantAdminBadgeNotice}
                                            </div>
                                        )}
                                        {grantAdminBadgeError && (
                                            <div className='mb-4 rounded-xl border px-3 py-2 text-xs font-bold' style={{ borderColor: 'rgba(244,63,94,0.35)', background: 'rgba(244,63,94,0.08)', color: '#fda4af' }}>
                                                {grantAdminBadgeError}
                                            </div>
                                        )}
                                        <div className="space-y-5">
                                            {loadingBadges && !isAdmin && !activityData?.badges ? (
                                                <div className="rounded-2xl border px-4 py-5 text-center text-xs font-bold" style={{ borderColor: 'var(--card-border)', color: 'var(--text-secondary)' }}>
                                                    Cargando badges...
                                                </div>
                                            ) : accumulatedBadges.length === 0 ? (
                                                <div className="rounded-2xl border px-4 py-5 text-center text-xs font-bold" style={{ borderColor: 'var(--card-border)', color: 'var(--text-secondary)' }}>
                                                    Sin badges acumuladas
                                                </div>
                                            ) : (
                                                <>
                                                    {industryAccumulatedBadges.length > 0 && (
                                                        <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
                                                            <div className="text-[10px] font-black uppercase tracking-[0.16em] mb-3" style={{ color: 'var(--text-secondary)' }}>
                                                                Badges por industria
                                                            </div>
                                                            <div className='grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3'>
                                                                {industryAccumulatedBadges.map((badge) => (
                                                                    <AccumulatedBadgeCard
                                                                        key={badge.id}
                                                                        badge={badge}
                                                                        visual={getAccumulatedBadgeVisual(badge)}
                                                                        overlayNumber={getBadgeOverlayNumber(badge)}
                                                                        tenureStartDate={user?.details?.start_date || user?.details?.startDate || null}
                                                                    />
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {specialAccumulatedBadges.length > 0 && (
                                                        <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
                                                            <div className="text-[10px] font-black uppercase tracking-[0.16em] mb-3" style={{ color: 'var(--text-secondary)' }}>
                                                                Badges especiales
                                                            </div>
                                                            <div className='grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3'>
                                                                {specialAccumulatedBadges.map((badge) => (
                                                                    <AccumulatedBadgeCard
                                                                        key={badge.id}
                                                                        badge={badge}
                                                                        visual={getAccumulatedBadgeVisual(badge)}
                                                                        overlayNumber={getBadgeOverlayNumber(badge)}
                                                                        tenureStartDate={user?.details?.start_date || user?.details?.startDate || null}
                                                                    />
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* System Info (Always at bottom) */}
                            <section className="mt-8 pt-6 border-t flex flex-wrap gap-6 items-center justify-between" style={{ borderColor: 'var(--card-border)' }}>
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--hover-bg)', color: 'var(--text-secondary)' }}>
                                        <Clock size={18} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-secondary)', opacity: 0.75 }}>Miembro desde</p>
                                        <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{new Date(user.created_at).toLocaleDateString()}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--hover-bg)', color: 'var(--text-secondary)' }}>
                                        <Shield size={18} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-secondary)', opacity: 0.75 }}>ID de Sistema</p>
                                        <p className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{user.id}</p>
                                    </div>
                                </div>
                            </section>
                        </div>

                        {/* Footer / Actions */}
                        <div className="p-5 md:p-6 border-t flex justify-end" style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}>
                            <button
                                onClick={onClose}
                                className="px-6 py-3 bg-[var(--input-focus)] hover:brightness-95 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all active:scale-95 shadow-xl shadow-blue-500/20 cursor-pointer"
                            >
                                Cerrar Perfil
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    )
}

function MetricCard({ icon: Icon, label, value, subtext, color }: { icon: any, label: string, value: string | number, subtext?: string, color: string }) {
    const colors: Record<string, { text: string, bg: string, border: string }> = {
        blue: { text: '#60a5fa', bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.28)' },
        yellow: { text: '#facc15', bg: 'rgba(234,179,8,0.12)', border: 'rgba(234,179,8,0.28)' },
        emerald: { text: '#34d399', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.28)' },
        purple: { text: '#c084fc', bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.28)' },
        indigo: { text: '#818cf8', bg: 'rgba(99,102,241,0.12)', border: 'rgba(99,102,241,0.28)' },
        amber: { text: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.28)' },
        rose: { text: '#fb7185', bg: 'rgba(244,63,94,0.12)', border: 'rgba(244,63,94,0.28)' }
    }
    const palette = colors[color] || colors.blue

    return (
        <div className='p-6 rounded-3xl border space-y-2' style={{ color: palette.text, background: palette.bg, borderColor: palette.border }}>
            <div className="flex items-center justify-between">
                <Icon size={18} className="opacity-60" />
                {subtext && <span className="text-[9px] font-black opacity-40 uppercase tracking-widest">{subtext}</span>}
            </div>
            <div>
                <p className="text-[10px] font-black opacity-40 uppercase tracking-widest">{label}</p>
                <p className="text-xl font-black">{value}</p>
            </div>
        </div>
    )
}

function AccumulatedBadgeCard({
    badge,
    visual,
    overlayNumber,
    tenureStartDate
}: {
    badge: any
    visual: any
    overlayNumber: string | null
    tenureStartDate?: string | null
}) {
    const BadgeIcon = visual.icon
    const label = String(badge?.label || 'Badge')
    const category = String(badge?.category || 'Especial')
    const level = Number(badge?.level || 0)
    const progress = Number(badge?.progress || 0)
    const isSeniorityBadge = String(badge?.type || '') === 'seniority_years' || String(badge?.type || '') === 'tenure_years'
    const tenureMetrics = isSeniorityBadge ? getTenureBadgeMetrics(tenureStartDate || null) : null

    return (
        <BadgeInfoTooltip
            title={label}
            subtitle={category}
            rows={isSeniorityBadge && tenureMetrics
                ? [
                    { label: 'Años', value: String(tenureMetrics.years) },
                    { label: 'Antigüedad', value: formatTenureExactLabel(tenureMetrics) },
                    { label: 'Progreso', value: `${tenureMetrics.progressPctToNextLevel.toFixed(2)}%` },
                    { label: 'Siguiente', value: `${tenureMetrics.nextLevelYears} años` }
                ]
                : [
                    { label: 'Nivel', value: String(level) },
                    { label: 'Progreso', value: String(progress) },
                    { label: 'Tipo', value: String(badge?.type || 'special') }
                ]}
            className='block w-full cursor-pointer relative z-[2] hover:z-[40] focus-within:z-[40]'
        >
            <div
                className='w-full min-h-[84px] rounded-2xl border p-3 transition-colors hover:border-blue-400/45'
                style={{ borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}
            >
                <div className='h-full flex items-center gap-3'>
                    <BadgeMedallion
                        icon={BadgeIcon}
                        centerClassName={visual.className}
                        matchRingClassName={String((visual as any)?.matchRingClassName || '') || undefined}
                        clipCenterFillToCoreInterior={Boolean((visual as any)?.clipCenterFillToCoreInterior)}
                        iconClassName={String((visual as any)?.iconClassName || 'text-white')}
                        overlayText={isSeniorityBadge ? null : overlayNumber}
                        footerBubbleText={isSeniorityBadge ? String(tenureMetrics?.years ?? overlayNumber ?? '') : null}
                        ringStyle={String((visual as any)?.ringStyle || 'match') as any}
                        coreBorderColorClassName={String((visual as any)?.coreBorderColorClassName || '')
                            || (shouldUseWhiteCoreBorderForSpecialBadgeType(String(badge?.type || '')) ? '!border-white/90' : '')}
                        size='md'
                        iconSize={18}
                        strokeWidth={2.5}
                    />
                    <div className='min-w-0'>
                        <p className='text-sm font-black truncate' style={{ color: 'var(--text-primary)' }}>
                            {label}
                        </p>
                        <p className='text-[10px] font-black uppercase tracking-[0.14em]' style={{ color: 'var(--input-focus)' }}>
                            Nivel {level} · {category}
                        </p>
                    </div>
                </div>
            </div>
        </BadgeInfoTooltip>
    )
}

function InfoItem({ icon: Icon, label, value, highlight }: { icon: any, label: string, value: string, highlight?: boolean }) {
    return (
        <div className="group flex items-center gap-4 p-4 rounded-2xl transition-all border border-transparent" style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors" style={{ background: 'var(--card-bg)', color: 'var(--text-secondary)' }}>
                <Icon size={18} />
            </div>
            <div>
                <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>{label}</p>
                <p className='text-sm font-bold' style={{ color: highlight ? 'var(--input-focus)' : 'var(--text-primary)' }}>{value || '-'}</p>
            </div>
        </div>
    )
}
