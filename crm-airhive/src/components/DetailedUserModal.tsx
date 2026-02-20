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
import RoleBadge from '@/components/RoleBadge'
import { getRoleSilhouetteColor } from '@/lib/roleUtils'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'
import { useTheme } from '@/lib/ThemeContext'
import { buildIndustryBadgeVisualMap, getIndustryBadgeVisualFromMap } from '@/lib/industryBadgeVisuals'

interface DetailedUserModalProps {
    isOpen: boolean
    onClose: () => void
    user: any // The user data fetched
    catalogs: Record<string, any[]>
}

export default function DetailedUserModal({ isOpen, onClose, user, catalogs }: DetailedUserModalProps) {
    useBodyScrollLock(isOpen)
    const { profile: currentUser } = useAuth()
    const { theme } = useTheme()
    const [activeTab, setActiveTab] = useState('profile')
    const [activityData, setActivityData] = useState<any>(null)
    const [loadingActivity, setLoadingActivity] = useState(false)

    const isSelf = currentUser?.id === user?.id
    const isAdmin = currentUser?.role === 'admin'
    const canSeeAll = isSelf || isAdmin

    async function fetchActivity() {
        if (!user?.id) return
        setLoadingActivity(true)
        const res = await getUserActivitySummary(user.id)
        if (res.success) {
            setActivityData(res.data)
        }
        setLoadingActivity(false)
    }

    useEffect(() => {
        if (isOpen && isAdmin && user?.id) {
            fetchActivity()
        }
    }, [isOpen, user?.id, isAdmin])

    const visibleTab = isAdmin ? activeTab : 'profile'
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
            label: String(badge?.label || 'Badge especial'),
            level: Number(badge?.level || 0),
            progress: Number(badge?.progress || 0),
            category: 'Especial'
        })))
    ]

    const getAccumulatedBadgeVisual = (badge: any) => {
        const badgeType = String(badge?.type || '')
        const badgeLabel = String(badge?.label || '').toLowerCase()
        const metallic = 'border-white/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),inset_0_-1px_0_rgba(0,0,0,0.15),0_6px_14px_rgba(15,23,42,0.22)]'
        const isMexicoCity = ['monterrey', 'guadalajara', 'cdmx', 'ciudad de mexico', 'puebla', 'queretaro', 'querétaro', 'tijuana', 'merida', 'mérida']
            .some((city) => badgeLabel.includes(city))

        if (badgeType === 'industry') {
            const industryVisual = getIndustryBadgeVisualFromMap(String(badge?.key || ''), industryVisualMap, String(badge?.label || 'Industria'))
            return {
                icon: industryVisual.icon,
                className: industryVisual.containerClass,
                iconClassName: industryVisual.iconClass
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
            return { icon: Calendar, className: `${metallic} bg-gradient-to-br from-[#2563eb] to-[#1e3a8a]` }
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
                className: badgeLabel.includes('1m')
                    ? `${metallic} bg-gradient-to-br from-[#7c3aed] to-[#5b21b6]`
                    : badgeLabel.includes('500')
                        ? `${metallic} bg-gradient-to-br from-[#0ea5e9] to-[#0369a1]`
                        : `${metallic} bg-gradient-to-br from-[#10b981] to-[#047857]`
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
            return { icon: Medal, className: `${metallic} bg-gradient-to-br from-[#22c55e] to-[#166534]` }
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
                        <div className="relative h-48 shrink-0" style={{ background: headerTheme.background }}>
                            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]" style={{ opacity: headerTheme.overlayOpacity }} />
                            <button
                                onClick={onClose}
                                className="absolute top-6 right-6 p-2 rounded-full transition-all z-10 cursor-pointer"
                                style={{
                                    background: headerTheme.closeBg,
                                    border: `1px solid ${headerTheme.closeBorder}`,
                                    color: headerTheme.closeColor
                                }}
                            >
                                <X size={20} />
                            </button>

                            <div className="absolute -bottom-16 left-12 flex items-end gap-6">
                                <div
                                    className="w-32 h-32 rounded-3xl border-4 overflow-hidden shadow-2xl"
                                    style={{ borderColor: avatarFrameBorder || headerTheme.avatarBorder, background: headerTheme.avatarBackground }}
                                >
                                    {user.avatar_url ? (
                                        <img src={user.avatar_url} alt={user.full_name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center" style={{ background: headerTheme.avatarFallbackBg }}>
                                            <User size={42} strokeWidth={1.9} style={{ color: silhouetteColor }} />
                                        </div>
                                    )}
                                </div>
                                <div className="mb-4">
                                    <h2 className="text-3xl font-black tracking-tight" style={{ color: headerTheme.titleColor }}>{user.full_name}</h2>
                                    <div className="flex items-center gap-3 mt-1">
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
                        <div className="mt-20 px-12 pb-2 border-b flex gap-8" style={{ borderColor: 'var(--card-border)' }}>
                            <button
                                onClick={() => setActiveTab('profile')}
                                className={`pb-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2 ${visibleTab === 'profile' ? 'border-[var(--input-focus)] text-[var(--input-focus)]' : 'border-transparent hover:text-[var(--input-focus)]'}`}
                                style={visibleTab === 'profile' ? undefined : { color: 'var(--text-secondary)' }}
                            >
                                Perfil Profesional
                            </button>
                            {isAdmin && (
                                <>
                                    <button
                                        onClick={() => setActiveTab('performance')}
                                        className={`pb-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2 ${visibleTab === 'performance' ? 'border-[var(--input-focus)] text-[var(--input-focus)]' : 'border-transparent hover:text-[var(--input-focus)]'}`}
                                        style={visibleTab === 'performance' ? undefined : { color: 'var(--text-secondary)' }}
                                    >
                                        Desempeño & Actividad
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('badges')}
                                        className={`pb-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2 ${visibleTab === 'badges' ? 'border-[var(--input-focus)] text-[var(--input-focus)]' : 'border-transparent hover:text-[var(--input-focus)]'}`}
                                        style={visibleTab === 'badges' ? undefined : { color: 'var(--text-secondary)' }}
                                    >
                                        Badges acumuladas
                                    </button>
                                </>
                            )}
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 overflow-y-auto p-12 custom-scrollbar">
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
                                            <InfoItem icon={Calendar} label="Fecha de Ingreso" value={details.start_date ? new Date(details.start_date).toLocaleDateString('es-MX', { dateStyle: 'long' }) : '-'} />
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
                                                <InfoItem icon={Cake} label="Nacimiento" value={details.birth_date ? new Date(details.birth_date).toLocaleDateString('es-MX', { dateStyle: 'long' }) : '-'} />
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
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
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
                                <div className='animate-in fade-in slide-in-from-bottom-4 duration-500'>
                                    <div className="rounded-3xl border p-5" style={{ borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}>
                                        <h3 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] mb-4" style={{ color: 'var(--input-focus)' }}>
                                            <Award size={14} /> Badges acumuladas
                                        </h3>
                                        <div className="max-h-[560px] overflow-y-auto custom-scrollbar pr-1">
                                            {accumulatedBadges.length === 0 ? (
                                                <div className="rounded-2xl border px-4 py-5 text-center text-xs font-bold" style={{ borderColor: 'var(--card-border)', color: 'var(--text-secondary)' }}>
                                                    Sin badges acumuladas
                                                </div>
                                            ) : (
                                                <div className='grid grid-cols-4 sm:grid-cols-5 gap-3'>
                                                    {accumulatedBadges.map((badge) => {
                                                        const visual = getAccumulatedBadgeVisual(badge)
                                                        const BadgeIcon = visual.icon
                                                        const overlayNumber = getBadgeOverlayNumber(badge)
                                                        return (
                                                            <div
                                                                key={badge.id}
                                                                className={`relative overflow-hidden w-14 h-14 rounded-xl border flex items-center justify-center cursor-default ${visual.className}`}
                                                            >
                                                                <span className='absolute top-[2px] left-[12%] w-[76%] h-[1px] bg-white/80 rounded-full pointer-events-none' />
                                                                <BadgeIcon size={21} strokeWidth={2.5} className={String((visual as any)?.iconClassName || 'text-white')} />
                                                                {overlayNumber && (
                                                                    <span className='absolute bottom-[2px] left-1/2 -translate-x-1/2 text-[8px] leading-none font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]'>
                                                                        {overlayNumber}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* System Info (Always at bottom) */}
                            <section className="mt-12 pt-8 border-t flex flex-wrap gap-8 items-center justify-between" style={{ borderColor: 'var(--card-border)' }}>
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
                        <div className="p-8 border-t flex justify-end" style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}>
                            <button
                                onClick={onClose}
                                className="px-8 py-3 bg-[var(--input-focus)] hover:brightness-95 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all active:scale-95 shadow-xl shadow-blue-500/20"
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
