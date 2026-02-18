'use client'

import { useState, useEffect, useMemo, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase'
import { getCatalogs, getIndustriesForBadges } from '@/app/actions/catalogs'
import { Mail, Briefcase, MapPin, Calendar, BookOpen, User, Building, Globe, GraduationCap, Clock, Activity, Award, Sparkles, TrendingUp, Lock, X, Building2, Flag, Layers, Ruler, Trophy, Medal, Shield, Flame, Gem } from 'lucide-react'
import RoleBadge from '@/components/RoleBadge'
import { getRoleMeta, getRoleSilhouetteColor } from '@/lib/roleUtils'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'
import { buildIndustryBadgeVisualMap, getIndustryBadgeVisualFromMap, type BadgeVisual } from '@/lib/industryBadgeVisuals'
import { useAuth } from '@/lib/auth'
import { grantAdminBadgeToSeller } from '@/app/actions/badges'

const BADGE_GRANT_ALLOWED_ADMINS = [
    'Jesus Gracia',
    'Rafael Sedas',
    'Eduardo Castro',
    'Alberto Castro'
]

interface ProfileViewProps {
    userId: string
    editable?: boolean // Potentially for future
}

export default function ProfileView({ userId }: ProfileViewProps) {
    const auth = useAuth()
    const [profile, setProfile] = useState<any>(null)
    const [details, setDetails] = useState<any>(null)
    const [catalogs, setCatalogs] = useState<Record<string, any[]>>({})
    const [badges, setBadges] = useState<any[]>([])
    const [badgeLevels, setBadgeLevels] = useState<{ level: number, min_closures: number }[]>([])
    const [specialBadges, setSpecialBadges] = useState<any[]>([])
    const [sellerStats, setSellerStats] = useState({
        totalClosures: 0,
        reliabilityScore: 0,
        seniorityYears: 0
    })
    const [isBadgeLeader, setIsBadgeLeader] = useState(false)
    const [leaderBadgeCount, setLeaderBadgeCount] = useState(0)
    const [allIndustries, setAllIndustries] = useState<{ id: string, name: string, is_active?: boolean }[]>([])
    const [isAllBadgesOpen, setIsAllBadgesOpen] = useState(false)
    const [grantingAdminBadge, setGrantingAdminBadge] = useState(false)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const loadData = async () => {
            const supabase = createClient()

            const [
                { data: p },
                { data: d },
                { data: userBadges },
                { data: levels },
                { data: userSpecialBadges },
                { count: closuresCount },
                { data: reliabilityRows },
                industriesResponse,
                catsResponse
            ] = await Promise.all([
                supabase.from('profiles').select('*').eq('id', userId).single(),
                (supabase.from('employee_profiles') as any).select('*').eq('user_id', userId).single(),
                supabase
                    .from('seller_industry_badges')
                    .select('industria_id, closures_count, level, next_level_threshold, unlocked_at, updated_at, industrias(name)')
                    .eq('seller_id', userId)
                    .gt('level', 0)
                    .order('closures_count', { ascending: false }),
                supabase
                    .from('badge_level_config')
                    .select('level, min_closures')
                    .order('level', { ascending: true }),
                (supabase
                    .from('seller_special_badges') as any)
                    .select('id, badge_type, badge_key, badge_label, progress_count, level, next_level_threshold, unlocked_at, updated_at')
                    .eq('seller_id', userId)
                    .gt('level', 0)
                    .order('badge_type', { ascending: true })
                    .order('progress_count', { ascending: false }),
                (supabase
                    .from('seller_badge_closures') as any)
                    .select('lead_id', { count: 'exact', head: true })
                    .eq('seller_id', userId),
                (supabase
                    .from('clientes') as any)
                    .select('forecast_logloss')
                    .eq('owner_id', userId)
                    .not('forecast_logloss', 'is', null),
                getIndustriesForBadges(),
                getCatalogs()
            ])

            const cats = catsResponse.success && catsResponse.data ? catsResponse.data : {}
            const industries = industriesResponse.success && industriesResponse.data ? industriesResponse.data : []

            setProfile(p)
            setDetails(d || {})
            setBadges(userBadges || [])
            setSpecialBadges(
                (userSpecialBadges || []).filter((b: any) =>
                    b &&
                    (b.id || b.badge_type || b.badge_key) &&
                    (b.level || 0) > 0 &&
                    (b.progress_count || 0) > 0
                )
            )
            setBadgeLevels(levels || [])
            setAllIndustries((industries || []) as { id: string, name: string, is_active?: boolean }[])
            setCatalogs(cats)
            const startDateRaw = d?.start_date
            const startDate = startDateRaw ? new Date(`${startDateRaw}T12:00:00`) : null
            const now = new Date()
            const years = startDate
                ? Math.max(
                    0,
                    now.getFullYear() - startDate.getFullYear()
                    - ((now.getMonth() < startDate.getMonth()
                        || (now.getMonth() === startDate.getMonth() && now.getDate() < startDate.getDate())) ? 1 : 0)
                )
                : 0
            const relRows = (reliabilityRows || [])
                .map((r: any) => Number(r?.forecast_logloss))
                .filter((v: number) => Number.isFinite(v))
            const relN = relRows.length
            const avgLogloss = relN > 0 ? (relRows.reduce((a: number, b: number) => a + b, 0) / relN) : 1
            const rawAcc = Math.max(0, 1 - avgLogloss)
            const relScore = relN > 0 ? Math.max(0, Math.min(100, (rawAcc * (relN / (relN + 4))) * 100)) : 0
            setSellerStats({
                totalClosures: Math.max(0, Number(closuresCount || 0)),
                reliabilityScore: Math.round(relScore),
                seniorityYears: years
            })

            // Badge leadership: compare unlocked badge counts across all sellers.
            const [
                { data: allIndustryBadges },
                { data: allSpecialBadges }
            ] = await Promise.all([
                (supabase
                    .from('seller_industry_badges') as any)
                    .select('seller_id')
                    .gt('level', 0),
                (supabase
                    .from('seller_special_badges') as any)
                    .select('seller_id')
                    .gt('level', 0)
                    .gt('progress_count', 0)
            ])

            const countMap = new Map<string, number>()
            for (const row of (allIndustryBadges || [])) {
                const sellerId = row?.seller_id
                if (!sellerId) continue
                countMap.set(sellerId, (countMap.get(sellerId) || 0) + 1)
            }
            for (const row of (allSpecialBadges || [])) {
                const sellerId = row?.seller_id
                if (!sellerId) continue
                countMap.set(sellerId, (countMap.get(sellerId) || 0) + 1)
            }

            const maxCount = Math.max(0, ...Array.from(countMap.values()))
            const currentCount = countMap.get(userId) || 0
            setLeaderBadgeCount(maxCount)
            setIsBadgeLeader(maxCount > 0 && currentCount === maxCount)
            setLoading(false)
        }
        loadData()
    }, [userId])

    // Helper to resolve ID to Name
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

    const industryVisualMap = useMemo(() => {
        const extrasFromBadges = badges
            .filter((b) => b?.industria_id)
            .map((b) => ({
                id: b.industria_id as string,
                name: b?.industrias?.name as string | undefined
            }))
        return buildIndustryBadgeVisualMap([...allIndustries, ...extrasFromBadges])
    }, [allIndustries, badges])

    if (loading) return <div className='p-8 text-center animate-pulse text-[var(--text-secondary)]'>Cargando perfil...</div>
    if (!profile) return <div className='p-8 text-center text-red-500'>Usuario no encontrado</div>

    const roleMeta = getRoleMeta(profile.role)
    const maxConfiguredLevel = badgeLevels.length > 0 ? Math.max(...badgeLevels.map(b => b.level)) : 4
    const totalBadgePoints = badges.reduce((sum, b) => sum + (b.level || 0), 0)
    const badgeByIndustry = new Map<string, any>(badges.map((b) => [b.industria_id, b]))
    const canGrantAdminBadge = auth.profile?.role === 'admin'
        && auth.user?.id !== userId
        && BADGE_GRANT_ALLOWED_ADMINS.includes(String(auth.profile?.full_name || '').trim())

    const handleGrantAdminBadge = async () => {
        if (!canGrantAdminBadge || grantingAdminBadge) return
        const confirmed = window.confirm('¿Deseas otorgar la Distinción Administrativa a este usuario? Recuerda: solo puedes otorgar un badge al mes.')
        if (!confirmed) return

        setGrantingAdminBadge(true)
        const res = await grantAdminBadgeToSeller(userId)
        setGrantingAdminBadge(false)

        if (!res.success) {
            alert(res.error || 'No se pudo otorgar el badge.')
            return
        }

        alert(res.message || 'Badge otorgado.')
        window.location.reload()
    }

    return (
        <div className='max-w-5xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500'>

            {/* Header Card */}
            <div className='rounded-2xl border p-8 flex items-center gap-8 relative overflow-hidden bg-[var(--card-bg)] border-[var(--card-border)] shadow-[0_10px_30px_rgba(0,0,0,0.18)]'>
                <div className='absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-[#2048FF]/10 to-transparent rounded-bl-full -mr-16 -mt-16 pointer-events-none' />

                <div
                    className='w-24 h-24 rounded-2xl border-2 flex items-center justify-center shadow-xl z-10'
                    style={{
                        borderColor: `color-mix(in srgb, ${getRoleSilhouetteColor(profile.role)} 70%, var(--card-border))`,
                        background: 'var(--hover-bg)'
                    }}
                >
                    <User size={42} strokeWidth={1.9} style={{ color: getRoleSilhouetteColor(profile.role) }} />
                </div>

                <div className='flex-1 z-10'>
                    <h1 className='text-3xl font-black mb-2 tracking-tight text-[var(--text-primary)]'>{profile.full_name}</h1>
                    <div className='flex flex-wrap items-center gap-4 text-sm font-medium'>
                        <RoleBadge role={profile.role} />
                        <span className='flex items-center gap-1.5 px-3 py-1 rounded-full border text-[var(--text-secondary)] bg-[var(--hover-bg)] border-[var(--card-border)]'>
                            <Mail size={14} />
                            {profile.username?.includes('@') ? profile.username : `${profile.username}@airhive.mx`}
                            {/* Fallback layout if username isnt email */}
                        </span>
                        <span className='flex items-center gap-1.5 px-3 py-1 rounded-full border text-[var(--text-secondary)] bg-[var(--hover-bg)] border-[var(--card-border)]'>
                            <Clock size={14} />
                            {details.start_date ? `Ingreso: ${new Date(details.start_date + 'T12:00:00').toLocaleDateString()}` : 'Sin fecha ingreso'}
                        </span>
                        {isBadgeLeader && (
                            <span className='flex items-center gap-1.5 px-3 py-1 rounded-full border bg-amber-500/15 border-amber-400/35 text-amber-200'>
                                <Medal size={14} />
                                Líder en badges ({leaderBadgeCount})
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <div className='p-6 rounded-2xl border space-y-5 bg-[var(--card-bg)] border-[var(--card-border)] shadow-[0_10px_30px_rgba(0,0,0,0.18)]'>
                <div className='flex items-start justify-between gap-4'>
                    <div>
                        <h3 className='text-sm font-black uppercase tracking-[0.18em] flex items-center gap-2 text-[var(--text-secondary)]'>
                            <Award size={16} className='text-amber-500' />
                            Badges por Industria
                        </h3>
                        <p className='text-xs mt-2 text-[var(--text-secondary)]'>
                            Desbloqueas un badge al primer cierre en una industria y sube de nivel con más cierres.
                        </p>
                    </div>
                    <div className='flex items-center gap-2'>
                        {canGrantAdminBadge && (
                            <button
                                type='button'
                                onClick={handleGrantAdminBadge}
                                disabled={grantingAdminBadge}
                                className='px-4 py-2 rounded-xl border text-xs font-black uppercase tracking-wider transition-colors bg-emerald-500/15 border-emerald-400/35 text-emerald-200 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed'
                            >
                                {grantingAdminBadge ? 'Otorgando...' : 'Otorgar Badge Admin'}
                            </button>
                        )}
                        <button
                            type='button'
                            onClick={() => setIsAllBadgesOpen(true)}
                            className='px-4 py-2 rounded-xl border text-xs font-black uppercase tracking-wider transition-colors cursor-pointer bg-[var(--hover-bg)] border-[var(--card-border)] text-[var(--accent-secondary)] hover:bg-blue-500/20 hover:border-blue-400/45 hover:text-blue-200'
                        >
                            Ver todos los badges
                        </button>
                        <div className='px-4 py-2 rounded-xl border text-right border-amber-400/30 bg-amber-500/15'>
                            <p className='text-[10px] font-black text-amber-700 uppercase tracking-wider'>Puntos Badge</p>
                            <p className='text-xl font-black text-amber-600'>{totalBadgePoints}</p>
                        </div>
                    </div>
                </div>

                {badges.length === 0 ? (
                    <div className='p-5 rounded-xl border border-dashed text-sm bg-[var(--hover-bg)] border-[var(--card-border)] text-[var(--text-secondary)]'>
                        Aún no hay badges desbloqueados. Cierra una empresa para ganar el primero.
                    </div>
                ) : (
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                        {badges.map((badge) => {
                            const industryName = badge?.industrias?.name || 'Industria'
                            const badgeVisual = getIndustryBadgeVisualFromMap(badge.industria_id, industryVisualMap, industryName)
                            const IndustryIcon = badgeVisual.icon
                            const closures = badge.closures_count || 0
                            const level = badge.level || 0
                            const nextThreshold = badge.next_level_threshold as number | null
                            const currentLevelMin = badgeLevels.find(b => b.level === level)?.min_closures || 1
                            const denom = nextThreshold ? Math.max(1, nextThreshold - currentLevelMin) : 1
                            const rawProgress = nextThreshold ? ((closures - currentLevelMin) / denom) * 100 : 100
                            const progress = Math.max(0, Math.min(100, rawProgress))
                            const achievedMax = level >= maxConfiguredLevel || !nextThreshold

                            return (
                                <div key={`${badge.industria_id}-${badge.level}`} className='p-4 rounded-xl border bg-[var(--hover-bg)] border-[var(--card-border)]'>
                                    <div className='flex items-start justify-between gap-2'>
                                        <div className='flex items-center gap-3 min-w-0'>
                                            <div className={`relative overflow-hidden w-10 h-10 rounded-xl border flex items-center justify-center ${badgeVisual.containerClass}`}>
                                                <span className='absolute top-[2px] left-[12%] w-[76%] h-[1px] bg-white/80 rounded-full pointer-events-none' />
                                                <IndustryIcon size={18} strokeWidth={2.7} className={badgeVisual.iconClass} />
                                            </div>
                                            <div className='min-w-0'>
                                                <p className='text-sm font-black truncate text-[var(--text-primary)]'>{industryName}</p>
                                                <p className='text-[10px] font-bold uppercase tracking-widest text-[var(--accent-secondary)]'>
                                                    Nivel {level}
                                                </p>
                                            </div>
                                        </div>
                                        <span className='text-xs font-black px-2 py-1 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100'>
                                            {closures} cierres
                                        </span>
                                    </div>

                                    <div className='mt-4'>
                                        <div className='flex items-center justify-between text-[10px] font-bold uppercase tracking-wider mb-1 text-[var(--text-secondary)]'>
                                            <span className='flex items-center gap-1'><TrendingUp size={12} /> Progreso</span>
                                            <span>{achievedMax ? 'Nivel máximo' : `Meta: ${nextThreshold}`}</span>
                                        </div>
                                        <div className='h-2.5 rounded-full border overflow-hidden bg-[var(--card-bg)] border-[var(--card-border)]'>
                                            <div
                                                className='h-full bg-gradient-to-r from-blue-500 to-indigo-500'
                                                style={{ width: `${progress}%` }}
                                            />
                                        </div>
                                        <p className='mt-2 text-[11px] font-medium text-[var(--text-secondary)]'>
                                            {achievedMax
                                                ? 'Badge completamente evolucionado.'
                                                : `Te faltan ${Math.max(0, (nextThreshold || 0) - closures)} cierres para nivel ${level + 1}.`}
                                        </p>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}

                <div className='flex items-center gap-2 text-[11px] text-[var(--text-secondary)]'>
                    <Sparkles size={13} className='text-amber-500' />
                    Los umbrales de evolución son configurables por administración.
                </div>
            </div>

            <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
                {/* Left Column: Identity & Status */}
                <div className='space-y-6'>
                    {/* Status Card */}
                    <div className='p-6 rounded-2xl border bg-[var(--card-bg)] border-[var(--card-border)] shadow-[0_8px_24px_rgba(0,0,0,0.16)]'>
                        <h3 className='text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2 text-[var(--text-secondary)]'>
                            <Activity size={16} /> Estado
                        </h3>
                        <div className={`p-4 rounded-xl flex items-center justify-between ${details.employee_status === 'activo' ? 'bg-emerald-500/20 border border-emerald-400/35' : 'bg-[var(--hover-bg)] border border-[var(--card-border)]'}`}>
                            <span className='text-sm font-bold text-[var(--text-secondary)]'>Estado Actual</span>
                            <span className={`px-3 py-1 rounded-lg text-sm font-black uppercase ${details.employee_status === 'activo' ? 'bg-emerald-500 text-white shadow-emerald-200 shadow-lg' : 'bg-gray-400 text-white'}`}>
                                {details.employee_status || 'DESCONOCIDO'}
                            </span>
                        </div>
                    </div>

                    {/* Job Details */}
                    <div className='p-6 rounded-2xl border bg-[var(--card-bg)] border-[var(--card-border)] shadow-[0_8px_24px_rgba(0,0,0,0.16)]'>
                        <h3 className='text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2 text-[var(--text-secondary)]'>
                            <Briefcase size={16} /> Posición
                        </h3>
                        <div className='space-y-4'>
                            <InfoRow label="Puesto" value={getJobPositionNames()} />
                            <InfoRow label="Área" value={getAreaNames()} />
                            <InfoRow label="Seniority" value={resolve('seniority_levels', details.seniority_id)} highlight />
                        </div>
                    </div>
                </div>

                {/* Middle Column: Personal Info */}
                <div className='space-y-6'>
                    <div className='p-6 rounded-2xl border h-full bg-[var(--card-bg)] border-[var(--card-border)] shadow-[0_8px_24px_rgba(0,0,0,0.16)]'>
                        <h3 className='text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2 text-[var(--text-secondary)]'>
                            <User size={16} /> Información Personal
                        </h3>
                        <div className='space-y-5'>
                            <div className='grid grid-cols-1 gap-4'>
                                <InfoRow label="Género" value={resolve('genders', details.gender_id)} icon={<User size={14} className="text-blue-500" />} />
                                <InfoRow label="Fecha Nacimiento" value={details.birth_date ? new Date(details.birth_date + 'T12:00:00').toLocaleDateString() : '-'} icon={<Calendar size={14} className="text-pink-500" />} />
                                <InfoRow label="Ciudad" value={resolve('cities', details.city_id)} icon={<MapPin size={14} className="text-orange-500" />} />
                                <InfoRow label="País" value={resolve('countries', details.country_id)} icon={<Globe size={14} className="text-green-500" />} />
                            </div>

                            <div className='pt-4 border-t border-[var(--card-border)]'>
                                <h4 className='text-xs font-bold mb-3 text-[var(--text-secondary)]'>EDUCACIÓN</h4>
                                <InfoRow label="Nivel" value={resolve('education_levels', details.education_level_id)} icon={<BookOpen size={14} className="text-violet-500" />} />
                                <div className='mt-2' />
                                <InfoRow label="Universidad" value={resolve('universities', details.university_id)} icon={<Building size={14} className="text-indigo-500" />} />
                                <div className='mt-2' />
                                <InfoRow label="Carrera" value={resolve('careers', details.career_id)} icon={<GraduationCap size={14} className="text-cyan-500" />} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column: Contract */}
                <div className='space-y-6'>
                    <div className='p-6 rounded-2xl border h-full bg-[var(--card-bg)] border-[var(--card-border)] shadow-[0_8px_24px_rgba(0,0,0,0.16)]'>
                        <h3 className='text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2 text-[var(--text-secondary)]'>
                            <Briefcase size={16} /> Contrato
                        </h3>
                        <div className='space-y-4'>
                            <div className='p-4 rounded-xl border bg-[var(--hover-bg)] border-[var(--card-border)]'>
                                <span className='text-xs font-bold block mb-1 text-[var(--text-secondary)]'>TIPO DE CONTRATO</span>
                                <span className='text-sm font-bold text-[var(--text-primary)]'>{resolve('contract_types', details.contract_type_id)}</span>
                            </div>
                            <div className='p-4 rounded-xl border bg-[var(--hover-bg)] border-[var(--card-border)]'>
                                <span className='text-xs font-bold block mb-1 text-[var(--text-secondary)]'>MODALIDAD</span>
                                <span className='text-sm font-bold text-[var(--text-primary)]'>{resolve('work_modalities', details.work_modality_id)}</span>
                            </div>

                            <div className='pt-2'>
                                <InfoRow label="ID Interno" value={profile.id.slice(0, 8)} />
                                <div className='h-2' />
                                <InfoRow label="Última Act." value={new Date(details.updated_at || profile.created_at).toLocaleDateString()} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <AllBadgesModal
                isOpen={isAllBadgesOpen}
                onClose={() => setIsAllBadgesOpen(false)}
                industries={allIndustries}
                badgeByIndustry={badgeByIndustry}
                industryVisualMap={industryVisualMap}
                badgeLevels={badgeLevels}
                maxConfiguredLevel={maxConfiguredLevel}
                specialBadges={specialBadges}
                isBadgeLeader={isBadgeLeader}
                leaderBadgeCount={leaderBadgeCount}
                sellerStats={sellerStats}
            />
        </div>
    )
}

function AllBadgesModal({
    isOpen,
    onClose,
    industries,
    badgeByIndustry,
    industryVisualMap,
    badgeLevels,
    maxConfiguredLevel,
    specialBadges,
    isBadgeLeader,
    leaderBadgeCount,
    sellerStats
}: {
    isOpen: boolean
    onClose: () => void
    industries: { id: string, name: string, is_active?: boolean }[]
    badgeByIndustry: Map<string, any>
    industryVisualMap: Record<string, BadgeVisual>
    badgeLevels: { level: number, min_closures: number }[]
    maxConfiguredLevel: number
    specialBadges: any[]
    isBadgeLeader: boolean
    leaderBadgeCount: number
    sellerStats: {
        totalClosures: number
        reliabilityScore: number
        seniorityYears: number
    }
}) {
    useBodyScrollLock(isOpen)
    const specialBadgeCatalog = useMemo(
        () => buildSpecialBadgeCatalog(specialBadges, { isBadgeLeader, leaderBadgeCount, sellerStats }),
        [specialBadges, isBadgeLeader, leaderBadgeCount, sellerStats]
    )
    const groupedSpecialBadges = useMemo(() => {
        const grouped = new Map<string, { key: string, title: string, order: number, items: any[] }>()

        for (const badge of specialBadgeCatalog) {
            const category = getSpecialBadgeCategoryMeta(badge?.badge_type)
            if (!grouped.has(category.key)) {
                grouped.set(category.key, { ...category, items: [] })
            }
            grouped.get(category.key)!.items.push(badge)
        }

        return Array.from(grouped.values())
            .sort((a, b) => a.order - b.order)
            .map((group) => ({
                ...group,
                items: [...group.items].sort((a, b) => {
                    const ao = getSpecialBadgeOrder(a?.badge_type)
                    const bo = getSpecialBadgeOrder(b?.badge_type)
                    if (ao !== bo) return ao - bo
                    return String(a?.badge_label || '').localeCompare(String(b?.badge_label || ''), 'es')
                })
            }))
    }, [specialBadgeCatalog])

    if (!isOpen) return null

    const sortedIndustries = [...industries].sort((a, b) => a.name.localeCompare(b.name, 'es'))

    return (
        <div className='ah-modal-overlay'>
            <div className='ah-modal-panel w-full max-w-4xl'>
                <div className='ah-modal-header'>
                    <div>
                        <h3 className='ah-modal-title'>Todos los Badges</h3>
                        <p className='ah-modal-subtitle'>Catálogo completo por industria</p>
                    </div>
                    <button onClick={onClose} className='ah-modal-close'>
                        <X size={18} className='text-white' />
                    </button>
                </div>

                <div className='p-6 overflow-y-auto custom-scrollbar space-y-4 bg-[var(--card-bg)]'>
                    <div className='flex flex-wrap gap-2 text-[11px]'>
                        {badgeLevels.map((lvl) => (
                            <span key={lvl.level} className='px-2.5 py-1 rounded-full border font-bold bg-[var(--hover-bg)] border-[var(--card-border)] text-[var(--text-secondary)]'>
                                Nivel {lvl.level}: {lvl.min_closures}
                            </span>
                        ))}
                    </div>

                    <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                        {sortedIndustries.map((industry) => {
                            const badge = badgeByIndustry.get(industry.id)
                            const badgeVisual = getIndustryBadgeVisualFromMap(industry.id, industryVisualMap, industry.name)
                            const IndustryIcon = badgeVisual.icon
                            const closures = badge?.closures_count || 0
                            const level = badge?.level || 0
                            const nextThreshold = (badge?.next_level_threshold ?? badgeLevels.find((x) => x.level === 1)?.min_closures ?? 1) as number
                            const currentLevelMin = badgeLevels.find((x) => x.level === level)?.min_closures || 0
                            const denom = Math.max(1, nextThreshold - currentLevelMin)
                            const rawProgress = level > 0 ? ((closures - currentLevelMin) / denom) * 100 : (closures / nextThreshold) * 100
                            const progress = Math.max(0, Math.min(100, level >= maxConfiguredLevel ? 100 : rawProgress))
                            const unlocked = level > 0
                            const achievedMax = level >= maxConfiguredLevel

                            return (
                                <div key={industry.id} className={`p-4 rounded-xl border transition-colors ${unlocked ? 'bg-[var(--hover-bg)] border-blue-500/30' : 'bg-[var(--card-bg)] border-[var(--card-border)]'}`}>
                                    <div className='flex items-start justify-between gap-2'>
                                        <div className='min-w-0 flex items-center gap-3'>
                                            <div className={`relative overflow-hidden w-10 h-10 rounded-xl border flex items-center justify-center ${badgeVisual.containerClass}`}>
                                                <span className='absolute top-[2px] left-[12%] w-[76%] h-[1px] bg-white/80 rounded-full pointer-events-none' />
                                                <IndustryIcon
                                                    size={18}
                                                    strokeWidth={2.7}
                                                    className={`${badgeVisual.iconClass} ${unlocked ? 'opacity-100' : 'opacity-90'}`}
                                                />
                                            </div>
                                            <div className='min-w-0'>
                                                <p className='text-sm font-black truncate text-[var(--text-primary)]'>
                                                    {industry.name}
                                                    {industry.is_active === false ? ' (Inactiva)' : ''}
                                                </p>
                                                <p className={`text-[10px] font-black uppercase tracking-widest ${unlocked ? 'text-[var(--accent-secondary)]' : 'text-[var(--text-secondary)]'}`}>
                                                    {unlocked ? `Nivel ${level}` : 'Bloqueado'}
                                                </p>
                                            </div>
                                        </div>
                                        <span className={`text-[10px] font-black px-2 py-1 rounded-lg border ${unlocked ? 'bg-emerald-500/20 border-emerald-400/35 text-emerald-300' : 'bg-[var(--hover-bg)] border-[var(--card-border)] text-[var(--text-secondary)]'}`}>
                                            {unlocked ? `${closures} cierres` : <span className='inline-flex items-center gap-1'><Lock size={11} /> 0 cierres</span>}
                                        </span>
                                    </div>

                                    <div className='mt-3'>
                                        <div className='h-2 rounded-full border overflow-hidden bg-[var(--card-bg)] border-[var(--card-border)]'>
                                            <div
                                                className={`h-full ${unlocked ? 'bg-gradient-to-r from-blue-500 to-indigo-500' : 'bg-gray-300'}`}
                                                style={{ width: `${progress}%` }}
                                            />
                                        </div>
                                        <p className='mt-2 text-[11px] font-medium text-[var(--text-secondary)]'>
                                            {achievedMax
                                                ? 'Nivel máximo alcanzado.'
                                                : unlocked
                                                    ? `Siguiente nivel en ${Math.max(0, nextThreshold - closures)} cierres.`
                                                    : `Desbloquea con ${nextThreshold} cierre${nextThreshold > 1 ? 's' : ''}.`}
                                        </p>
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    <div className='pt-2 mt-2 border-t border-[var(--card-border)]'>
                        <div className='flex items-center gap-2 mb-3'>
                            <Layers size={14} className='text-fuchsia-400' />
                            <h4 className='text-xs font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]'>
                                Badges Especiales
                            </h4>
                        </div>

                        {specialBadgeCatalog.length === 0 ? (
                            <div className='p-4 rounded-xl border border-dashed text-sm bg-[var(--hover-bg)] border-[var(--card-border)] text-[var(--text-secondary)]'>
                                Aún no hay badges especiales desbloqueados.
                            </div>
                        ) : (
                            <div className='space-y-4'>
                            {groupedSpecialBadges.map((group) => (
                                <div key={group.key} className='space-y-2'>
                                    <div className='text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]'>
                                        {group.title}
                                    </div>
                                    <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                            {group.items.map((badge, index) => {
                                const safeLabel = typeof badge.badge_label === 'string' ? badge.badge_label : 'Badge Especial'
                                const typeMeta = getSpecialBadgeTypeMeta(badge.badge_type, safeLabel)
                                const Icon = typeMeta.icon
                                const badgeOverlayNumber = getSpecialBadgeOverlayNumber(badge)
                                const progressCount = badge.progress_count || 0
                                const level = badge.level || 0
                                const unlocked = level > 0
                                const isAdminGranted = badge.badge_type === 'admin_granted'
                                const isReliabilityBadge = badge.badge_type === 'reliability_score'
                                const isClosureBadge = badge.badge_type === 'closure_milestone'
                                const isSeniorityBadge = badge.badge_type === 'seniority_years'
                                const isStreakBadge = badge.badge_type === 'closing_streak'
                                const isStreakPaused = isStreakBadge && String(safeLabel).toLowerCase().includes('pausada')
                                const isDealValueBadge = badge.badge_type === 'deal_value_tier'
                                const isRacePointsLeaderBadge = badge.badge_type === 'race_points_leader'
                                const nextThreshold = (badge.next_level_threshold ?? getSpecialDefaultThreshold(badge.badge_type)) as number | null
                                const achievedMax = !nextThreshold
                                const rawProgress = achievedMax ? 100 : Math.min(100, (progressCount / Math.max(1, nextThreshold || 1)) * 100)
                                const safeKey = badge.id || `${badge.badge_type || 'special'}-${badge.badge_key || 'key'}-${index}`

                                return (
                                    <div key={safeKey} className={`p-4 rounded-xl border transition-colors ${unlocked ? 'bg-[var(--hover-bg)] border-blue-500/30' : 'bg-[var(--card-bg)] border-[var(--card-border)]'}`}>
                                        <div className='flex items-start justify-between gap-2'>
                                            <div className='min-w-0 flex items-center gap-3'>
                                                <div className={`relative overflow-hidden w-10 h-10 rounded-xl border flex items-center justify-center ${typeMeta.containerClass} ${isAdminGranted ? '!border-4 !border-[#FFD700] ring-2 ring-[#FFD700]/70 shadow-[0_0_0_1px_rgba(255,215,0,0.75)]' : ''}`}>
                                                    <span className='absolute top-[2px] left-[12%] w-[76%] h-[1px] bg-white/80 rounded-full pointer-events-none' />
                                                    <Icon
                                                        size={17}
                                                        strokeWidth={2.7}
                                                        className={`${typeMeta.iconClass} ${unlocked ? 'opacity-100' : 'opacity-90'}`}
                                                    />
                                                    {badgeOverlayNumber && (
                                                        <span className='absolute bottom-[2px] left-1/2 -translate-x-1/2 text-[8px] leading-none font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]'>
                                                            {badgeOverlayNumber}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className='min-w-0'>
                                                    <div className='flex items-center gap-2'>
                                                        <p className='text-sm font-black truncate text-[var(--text-primary)]'>
                                                            {safeLabel}
                                                        </p>
                                                        {isStreakBadge && (
                                                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md border uppercase tracking-widest ${isStreakPaused ? 'text-zinc-300 border-zinc-500/50 bg-zinc-700/20' : 'text-orange-200 border-orange-400/60 bg-orange-500/20'}`}>
                                                                {isStreakPaused ? 'Pausada' : 'Activa'}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className={`text-[10px] font-black uppercase tracking-widest ${unlocked ? 'text-[var(--accent-secondary)]' : 'text-[var(--text-secondary)]'}`}>
                                                        {unlocked ? `Nivel ${level}` : 'Bloqueado'}
                                                    </p>
                                                </div>
                                            </div>
                                            <span className={`text-[10px] font-black px-2 py-1 rounded-lg border ${unlocked ? 'bg-emerald-500/20 border-emerald-400/35 text-emerald-300' : 'bg-[var(--hover-bg)] border-[var(--card-border)] text-[var(--text-secondary)]'}`}>
                                                {unlocked
                                                    ? isReliabilityBadge
                                                        ? `${progressCount}% score`
                                                        : isClosureBadge
                                                            ? `${progressCount} cierres`
                                                            : isSeniorityBadge
                                                                ? `${progressCount} años`
                                                            : isStreakBadge
                                                                    ? `${progressCount} meses`
                                                                    : isDealValueBadge
                                                                        ? `${progressCount} cierres`
                                                                        : isRacePointsLeaderBadge
                                                                            ? `${progressCount} pts`
                                                                : `${progressCount} progreso`
                                                    : <span className='inline-flex items-center gap-1'><Lock size={11} /> 0 progreso</span>}
                                            </span>
                                        </div>

                                        <div className='mt-3'>
                                            <div className='h-2 rounded-full border overflow-hidden bg-[var(--card-bg)] border-[var(--card-border)]'>
                                                <div
                                                    className={`h-full ${unlocked ? 'bg-gradient-to-r from-blue-500 to-indigo-500' : 'bg-gray-300'}`}
                                                    style={{ width: `${rawProgress}%` }}
                                                />
                                            </div>
                                            <p className='mt-2 text-[11px] font-medium text-[var(--text-secondary)]'>
                                                {achievedMax
                                                    ? 'Nivel máximo alcanzado.'
                                                    : unlocked
                                                        ? isReliabilityBadge
                                                            ? `Siguiente nivel en ${Math.max(0, nextThreshold - progressCount)} puntos de score.`
                                                            : isClosureBadge
                                                                ? `Siguiente nivel en ${Math.max(0, nextThreshold - progressCount)} cierres.`
                                                                : isSeniorityBadge
                                                                    ? `Siguiente nivel en ${Math.max(0, nextThreshold - progressCount)} año${Math.max(0, nextThreshold - progressCount) === 1 ? '' : 's'}.`
                                                                    : isStreakBadge
                                                                        ? `Siguiente nivel en ${Math.max(0, nextThreshold - progressCount)} mes${Math.max(0, nextThreshold - progressCount) === 1 ? '' : 'es'} consecutivo${Math.max(0, nextThreshold - progressCount) === 1 ? '' : 's'}.`
                                                                        : isDealValueBadge
                                                                            ? 'Nivel máximo alcanzado.'
                                                                            : isRacePointsLeaderBadge
                                                                                ? 'Mantén la mayor cantidad de puntos para conservarlo activo.'
                                                                    : `Siguiente nivel en ${Math.max(0, nextThreshold - progressCount)}.`
                                                        : isReliabilityBadge
                                                            ? `Desbloquea con ${nextThreshold}% de score de confiabilidad.`
                                                            : isClosureBadge
                                                                ? `Desbloquea con ${nextThreshold} cierres.`
                                                                : isSeniorityBadge
                                                                    ? `Desbloquea al cumplir ${nextThreshold} año${nextThreshold === 1 ? '' : 's'}.`
                                                                    : isStreakBadge
                                                                        ? `Desbloquea con ${nextThreshold} meses consecutivos con cierres.`
                                                                        : isDealValueBadge
                                                                            ? `Desbloquea al cerrar un lead de ${safeLabel.replace('Valor ', '$')}.`
                                                                            : isRacePointsLeaderBadge
                                                                                ? 'Desbloquea al liderar el ranking de puntos del podio.'
                                                                    : `Desbloquea con ${nextThreshold} progreso.`}
                                            </p>
                                        </div>
                                    </div>
                                )
                                })}
                                    </div>
                                </div>
                            ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

function InfoRow({ label, value, highlight, icon }: { label: string, value: string, highlight?: boolean, icon?: ReactNode }) {
    return (
        <div className='flex items-center justify-between group'>
            <div className='flex items-center gap-2'>
                {icon && <div className='p-1.5 rounded-md transition-colors bg-[var(--hover-bg)] group-hover:brightness-110'>{icon}</div>}
                <span className='text-sm font-medium text-[var(--text-secondary)]'>{label}</span>
            </div>
            <span className={`text-sm font-semibold truncate max-w-[150px] ${highlight ? 'text-[var(--accent-secondary)]' : 'text-[var(--text-primary)]'}`}>
                {value}
            </span>
        </div>
    )
}

function getSpecialBadgeTypeMeta(badgeType: string, label?: string | null) {
    const safeLabel = typeof label === 'string' ? label : ''
    const labelLower = safeLabel.toLowerCase()
    const isMexicoCity = ['monterrey', 'guadalajara', 'cdmx', 'ciudad de mexico', 'puebla', 'queretaro', 'querétaro', 'tijuana', 'merida', 'mérida']
        .some((city) => labelLower.includes(city))
    const metallicContainer = 'border-white/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),inset_0_-1px_0_rgba(0,0,0,0.15),0_6px_14px_rgba(15,23,42,0.22)]'
    const solidIconClass = 'text-white'

    if (badgeType === 'company_size') {
        return {
            title: 'Tamaño Empresa',
            icon: Building2,
            containerClass: `${metallicContainer} bg-gradient-to-br from-[#3b82f6] to-[#1d4ed8]`,
            iconClass: solidIconClass
        }
    }

    if (badgeType === 'location_city') {
        return {
            title: 'Ubicación Ciudad',
            icon: MapPin,
            containerClass: isMexicoCity
                ? `${metallicContainer} bg-gradient-to-br from-[#10b981] to-[#047857]`
                : `${metallicContainer} bg-gradient-to-br from-[#f97316] to-[#c2410c]`,
            iconClass: solidIconClass
        }
    }

    if (badgeType === 'location_country') {
        return {
            title: 'Ubicación País',
            icon: Flag,
            containerClass: labelLower.includes('mex')
                ? `${metallicContainer} bg-gradient-to-br from-[#ef4444] to-[#b91c1c]`
                : `${metallicContainer} bg-gradient-to-br from-[#06b6d4] to-[#0e7490]`,
            iconClass: solidIconClass
        }
    }

    if (badgeType === 'all_company_sizes') {
        return {
            title: 'Todos los Tamaños',
            icon: Ruler,
            containerClass: `${metallicContainer} bg-gradient-to-br from-[#f59e0b] to-[#b45309]`,
            iconClass: solidIconClass
        }
    }

    if (badgeType === 'race_first_place') {
        return {
            title: 'Carrera · 1er Lugar',
            icon: Trophy,
            containerClass: `${metallicContainer} bg-gradient-to-br from-[#f59e0b] to-[#a16207]`,
            iconClass: solidIconClass
        }
    }

    if (badgeType === 'race_second_place') {
        return {
            title: 'Carrera · 2do Lugar',
            icon: Trophy,
            containerClass: `${metallicContainer} bg-gradient-to-br from-[#94a3b8] to-[#475569]`,
            iconClass: solidIconClass
        }
    }

    if (badgeType === 'race_third_place') {
        return {
            title: 'Carrera · 3er Lugar',
            icon: Trophy,
            containerClass: `${metallicContainer} bg-gradient-to-br from-[#b45309] to-[#7c2d12]`,
            iconClass: solidIconClass
        }
    }

    if (badgeType === 'race_all_positions') {
        return {
            title: 'Carrera · Podio Completo',
            icon: Layers,
            containerClass: `${metallicContainer} bg-gradient-to-br from-[#0ea5e9] to-[#0369a1]`,
            iconClass: solidIconClass
        }
    }

    if (badgeType === 'race_total_trophies') {
        return {
            title: 'Carrera · 10 Trofeos',
            icon: Trophy,
            containerClass: `${metallicContainer} bg-gradient-to-br from-[#10b981] to-[#047857]`,
            iconClass: solidIconClass
        }
    }

    if (badgeType === 'race_points_leader') {
        const isHistoric = labelLower.includes('hist')
        return {
            title: 'Soberano del Podio',
            icon: Award,
            containerClass: isHistoric
                ? `${metallicContainer} bg-gradient-to-br from-[#6b7280] to-[#374151]`
                : `${metallicContainer} bg-gradient-to-br from-[#f59e0b] to-[#b45309]`,
            iconClass: solidIconClass
        }
    }

    if (badgeType === 'seniority_years') {
        return {
            title: 'Antigüedad',
            icon: Calendar,
            containerClass: `${metallicContainer} bg-gradient-to-br from-[#2563eb] to-[#1e3a8a]`,
            iconClass: solidIconClass
        }
    }

    if (badgeType === 'closure_milestone') {
        return {
            title: 'Cierres',
            icon: Building,
            containerClass: `${metallicContainer} bg-gradient-to-br from-[#f97316] to-[#c2410c]`,
            iconClass: solidIconClass
        }
    }

    if (badgeType === 'reliability_score') {
        return {
            title: 'Confiabilidad',
            icon: Shield,
            containerClass: `${metallicContainer} bg-gradient-to-br from-[#0ea5e9] to-[#0369a1]`,
            iconClass: solidIconClass
        }
    }

    if (badgeType === 'closing_streak') {
        const isPaused = labelLower.includes('pausada')
        return {
            title: 'Racha Imparable',
            icon: Flame,
            containerClass: isPaused
                ? `${metallicContainer} bg-gradient-to-br from-[#6b7280] to-[#374151]`
                : `${metallicContainer} bg-gradient-to-br from-[#f97316] to-[#b45309]`,
            iconClass: solidIconClass
        }
    }

    if (badgeType === 'deal_value_tier') {
        return {
            title: 'Valor de Cierre',
            icon: Gem,
            containerClass: labelLower.includes('1m')
                ? `${metallicContainer} bg-gradient-to-br from-[#7c3aed] to-[#5b21b6]`
                : labelLower.includes('500')
                    ? `${metallicContainer} bg-gradient-to-br from-[#0ea5e9] to-[#0369a1]`
                    : `${metallicContainer} bg-gradient-to-br from-[#10b981] to-[#047857]`,
            iconClass: solidIconClass
        }
    }

    if (badgeType === 'admin_granted') {
        const adminGradient = labelLower.includes('jesus gracia')
            ? 'from-[#a855f7] to-[#6d28d9]' // morado
            : labelLower.includes('rafael sedas')
                ? 'from-[#ef4444] to-[#991b1b]' // rojo
                : labelLower.includes('alberto castro')
                    ? 'from-[#3b82f6] to-[#1e3a8a]' // azul
                    : labelLower.includes('eduardo castro')
                        ? 'from-[#22c55e] to-[#166534]' // verde
                        : 'from-[#22c55e] to-[#15803d]'
        return {
            title: 'Distinción Admin',
            icon: Medal,
            containerClass: `${metallicContainer} border-[#fbbf24] bg-gradient-to-br ${adminGradient} shadow-[inset_0_1px_0_rgba(255,255,255,0.35),inset_0_-1px_0_rgba(0,0,0,0.15),0_6px_14px_rgba(15,23,42,0.22),0_0_0_1px_rgba(251,191,36,0.55)]`,
            iconClass: solidIconClass
        }
    }

    if (badgeType === 'badge_leader') {
        return {
            title: 'Líder de Badges',
            icon: Medal,
            containerClass: `${metallicContainer} bg-gradient-to-br from-[#f59e0b] to-[#b45309]`,
            iconClass: solidIconClass
        }
    }

    return {
        title: 'Multi-Industria',
        icon: Layers,
        containerClass: `${metallicContainer} bg-gradient-to-br from-[#d946ef] to-[#a21caf]`,
        iconClass: solidIconClass
    }
}

function getSpecialDefaultThreshold(badgeType?: string) {
    if (badgeType === 'multi_industry') return 5
    if (badgeType === 'all_company_sizes') return 5
    if (badgeType === 'seniority_years') return 1
    if (badgeType === 'closure_milestone') return 10
    if (badgeType === 'reliability_score') return 80
    if (badgeType === 'closing_streak') return 5
    if (badgeType === 'deal_value_tier') return 1
    if (badgeType === 'race_first_place') return 1
    if (badgeType === 'race_second_place') return 1
    if (badgeType === 'race_third_place') return 1
    if (badgeType === 'race_all_positions') return 3
    if (badgeType === 'race_total_trophies') return 10
    if (badgeType === 'race_points_leader') return 1
    if (badgeType === 'admin_granted') return 1
    if (badgeType === 'badge_leader') return 1
    return 1
}

function buildSpecialBadgeCatalog(
    specialBadges: any[],
    options?: {
        isBadgeLeader?: boolean
        leaderBadgeCount?: number
        sellerStats?: {
            totalClosures?: number
            reliabilityScore?: number
            seniorityYears?: number
        }
    }
) {
    const isBadgeLeader = Boolean(options?.isBadgeLeader)
    const leaderBadgeCount = Number(options?.leaderBadgeCount || 0)
    const seniorityYears = Math.max(0, Number(options?.sellerStats?.seniorityYears || 0))
    const totalClosures = Math.max(0, Number(options?.sellerStats?.totalClosures || 0))
    const reliabilityScore = Math.max(0, Math.min(100, Number(options?.sellerStats?.reliabilityScore || 0)))
    const closureLevel = totalClosures >= 50 ? 3 : totalClosures >= 20 ? 2 : totalClosures >= 10 ? 1 : 0
    const closureNextThreshold = closureLevel === 0 ? 10 : closureLevel === 1 ? 20 : closureLevel === 2 ? 50 : null
    const reliabilityThreshold = 80
    const map = new Map<string, any>()
    const baseCatalog = [
        {
            id: 'virtual-all-sizes',
            badge_type: 'all_company_sizes',
            badge_key: 'all_sizes',
            badge_label: 'Todos los Tamaños',
            progress_count: 0,
            level: 0,
            next_level_threshold: 5
        },
        {
            id: 'virtual-multi-industry',
            badge_type: 'multi_industry',
            badge_key: 'multi_industry',
            badge_label: 'Multi Industria',
            progress_count: 0,
            level: 0,
            next_level_threshold: 5
        },
        {
            id: 'virtual-seniority-years',
            badge_type: 'seniority_years',
            badge_key: 'seniority_years',
            badge_label: 'Antigüedad',
            progress_count: seniorityYears,
            level: seniorityYears >= 1 ? seniorityYears : 0,
            next_level_threshold: seniorityYears + 1
        },
        {
            id: 'virtual-closure-milestone',
            badge_type: 'closure_milestone',
            badge_key: 'closure_milestone',
            badge_label: 'Cierre de Empresas',
            progress_count: totalClosures,
            level: closureLevel,
            next_level_threshold: closureNextThreshold
        },
        {
            id: 'virtual-reliability-score',
            badge_type: 'reliability_score',
            badge_key: 'reliability_score',
            badge_label: 'Confiabilidad',
            progress_count: reliabilityScore,
            level: reliabilityScore >= reliabilityThreshold ? 1 : 0,
            next_level_threshold: reliabilityScore >= reliabilityThreshold ? null : reliabilityThreshold
        },
        {
            id: 'virtual-closing-streak',
            badge_type: 'closing_streak',
            badge_key: 'closing_streak',
            badge_label: 'Racha Imparable · Pausada',
            progress_count: 0,
            level: 0,
            next_level_threshold: 5
        },
        {
            id: 'virtual-value-100k',
            badge_type: 'deal_value_tier',
            badge_key: 'value_100k',
            badge_label: 'Valor 100K',
            progress_count: 0,
            level: 0,
            next_level_threshold: 1
        },
        {
            id: 'virtual-value-500k',
            badge_type: 'deal_value_tier',
            badge_key: 'value_500k',
            badge_label: 'Valor 500K',
            progress_count: 0,
            level: 0,
            next_level_threshold: 1
        },
        {
            id: 'virtual-value-1m',
            badge_type: 'deal_value_tier',
            badge_key: 'value_1m',
            badge_label: 'Valor 1M',
            progress_count: 0,
            level: 0,
            next_level_threshold: 1
        },
        {
            id: 'virtual-size-1',
            badge_type: 'company_size',
            badge_key: 'size_1',
            badge_label: 'Tamaño de Empresa 1',
            progress_count: 0,
            level: 0,
            next_level_threshold: 1
        },
        {
            id: 'virtual-size-2',
            badge_type: 'company_size',
            badge_key: 'size_2',
            badge_label: 'Tamaño de Empresa 2',
            progress_count: 0,
            level: 0,
            next_level_threshold: 1
        },
        {
            id: 'virtual-size-3',
            badge_type: 'company_size',
            badge_key: 'size_3',
            badge_label: 'Tamaño de Empresa 3',
            progress_count: 0,
            level: 0,
            next_level_threshold: 1
        },
        {
            id: 'virtual-size-4',
            badge_type: 'company_size',
            badge_key: 'size_4',
            badge_label: 'Tamaño de Empresa 4',
            progress_count: 0,
            level: 0,
            next_level_threshold: 1
        },
        {
            id: 'virtual-size-5',
            badge_type: 'company_size',
            badge_key: 'size_5',
            badge_label: 'Tamaño de Empresa 5',
            progress_count: 0,
            level: 0,
            next_level_threshold: 1
        },
        {
            id: 'virtual-location-city',
            badge_type: 'location_city',
            badge_key: 'city_generic',
            badge_label: 'Ubicación Ciudad',
            progress_count: 0,
            level: 0,
            next_level_threshold: 1
        },
        {
            id: 'virtual-location-country',
            badge_type: 'location_country',
            badge_key: 'country_generic',
            badge_label: 'Ubicación País',
            progress_count: 0,
            level: 0,
            next_level_threshold: 1
        },
        {
            id: 'virtual-race-first',
            badge_type: 'race_first_place',
            badge_key: 'race_first',
            badge_label: 'Primer Lugar',
            progress_count: 0,
            level: 0,
            next_level_threshold: 1
        },
        {
            id: 'virtual-race-second',
            badge_type: 'race_second_place',
            badge_key: 'race_second',
            badge_label: 'Segundo Lugar',
            progress_count: 0,
            level: 0,
            next_level_threshold: 1
        },
        {
            id: 'virtual-race-third',
            badge_type: 'race_third_place',
            badge_key: 'race_third',
            badge_label: 'Tercer Lugar',
            progress_count: 0,
            level: 0,
            next_level_threshold: 1
        },
        {
            id: 'virtual-race-podio',
            badge_type: 'race_all_positions',
            badge_key: 'race_podio',
            badge_label: 'Podio Completo',
            progress_count: 0,
            level: 0,
            next_level_threshold: 3
        },
        {
            id: 'virtual-race-10',
            badge_type: 'race_total_trophies',
            badge_key: 'race_10_trophies',
            badge_label: '10 Trofeos',
            progress_count: 0,
            level: 0,
            next_level_threshold: 10
        },
        {
            id: 'virtual-race-points-leader',
            badge_type: 'race_points_leader',
            badge_key: 'race_points_leader',
            badge_label: 'Soberano del Podio · Histórico',
            progress_count: 0,
            level: 0,
            next_level_threshold: 1
        },
        {
            id: 'virtual-admin-granted',
            badge_type: 'admin_granted',
            badge_key: 'admin_jesus_gracia',
            badge_label: 'Distinción de Jesus Gracia',
            progress_count: 0,
            level: 0,
            next_level_threshold: 1
        },
        {
            id: 'virtual-admin-rafael',
            badge_type: 'admin_granted',
            badge_key: 'admin_rafael_sedas',
            badge_label: 'Distinción de Rafael Sedas',
            progress_count: 0,
            level: 0,
            next_level_threshold: 1
        },
        {
            id: 'virtual-admin-eduardo',
            badge_type: 'admin_granted',
            badge_key: 'admin_eduardo_castro',
            badge_label: 'Distinción de Eduardo Castro',
            progress_count: 0,
            level: 0,
            next_level_threshold: 1
        },
        {
            id: 'virtual-admin-alberto',
            badge_type: 'admin_granted',
            badge_key: 'admin_alberto_castro',
            badge_label: 'Distinción de Alberto Castro',
            progress_count: 0,
            level: 0,
            next_level_threshold: 1
        },
        {
            id: 'virtual-badge-leader',
            badge_type: 'badge_leader',
            badge_key: 'badge_leader',
            badge_label: 'Líder de Badges',
            progress_count: isBadgeLeader ? Math.max(1, leaderBadgeCount) : 0,
            level: isBadgeLeader ? 1 : 0,
            next_level_threshold: 1
        }
    ]

    for (const item of baseCatalog) {
        map.set(`${item.badge_type}::${item.badge_key}`, item)
    }

    for (const badge of (specialBadges || []).filter(Boolean)) {
        const type = badge?.badge_type || 'special'
        // Normalize known singleton categories so repeated rows collapse into one card.
        const normalizedKey = (() => {
            if (type === 'multi_industry') return 'multi_industry'
            if (type === 'all_company_sizes') return 'all_sizes'
            if (type === 'seniority_years') return 'seniority_years'
            if (type === 'closure_milestone') return 'closure_milestone'
            if (type === 'reliability_score') return 'reliability_score'
            if (type === 'closing_streak') return 'closing_streak'
            if (type === 'deal_value_tier') return badge?.badge_key || 'deal_value_tier'
            if (type === 'race_first_place') return 'race_first'
            if (type === 'race_second_place') return 'race_second'
            if (type === 'race_third_place') return 'race_third'
            if (type === 'race_all_positions') return 'race_podio'
            if (type === 'race_total_trophies') return 'race_10_trophies'
            if (type === 'race_points_leader') return 'race_points_leader'
            if (type === 'admin_granted') return badge?.badge_key || 'admin_granted'
            if (type === 'badge_leader') return 'badge_leader'
            return badge?.badge_key || 'key'
        })()
        const key = `${type}::${normalizedKey}`
        const prev = map.get(key)

        if (!prev) {
            map.set(key, { ...badge, badge_key: normalizedKey })
            continue
        }

        const prevLevel = prev?.level || 0
        const nextLevel = badge?.level || 0
        if (nextLevel >= prevLevel) {
            map.set(key, {
                ...prev,
                ...badge,
                badge_key: normalizedKey,
                progress_count: Math.max(prev?.progress_count || 0, badge?.progress_count || 0),
                level: Math.max(prevLevel, nextLevel),
                next_level_threshold: (prev?.next_level_threshold ?? badge?.next_level_threshold)
            })
        }
    }

    return Array.from(map.values()).sort((a, b) => {
        const ao = getSpecialBadgeOrder(a?.badge_type)
        const bo = getSpecialBadgeOrder(b?.badge_type)
        if (ao !== bo) return ao - bo

        if (a?.badge_type === 'company_size' && b?.badge_type === 'company_size') {
            const an = Number(String(a?.badge_key || '').replace('size_', '')) || 0
            const bn = Number(String(b?.badge_key || '').replace('size_', '')) || 0
            return an - bn
        }

        return String(a?.badge_label || '').localeCompare(String(b?.badge_label || ''), 'es')
    })
}

function getSpecialBadgeOrder(type?: string) {
    if (type === 'seniority_years') return 1
    if (type === 'closing_streak') return 2
    if (type === 'closure_milestone') return 3
    if (type === 'deal_value_tier') return 4
    if (type === 'reliability_score') return 5
    if (type === 'all_company_sizes') return 6
    if (type === 'company_size') return 7
    if (type === 'location_city') return 8
    if (type === 'location_country') return 9
    if (type === 'multi_industry') return 10
    if (type === 'race_first_place') return 11
    if (type === 'race_second_place') return 12
    if (type === 'race_third_place') return 13
    if (type === 'race_all_positions') return 14
    if (type === 'race_total_trophies') return 15
    if (type === 'race_points_leader') return 16
    if (type === 'admin_granted') return 17
    if (type === 'badge_leader') return 18
    return 99
}

function getSpecialBadgeCategoryMeta(type?: string) {
    if (type === 'company_size' || type === 'all_company_sizes' || type === 'multi_industry' || type === 'closure_milestone') {
        return { key: 'commercial', title: 'Comercial y Cobertura', order: 1 }
    }
    if (type === 'closing_streak') {
        return { key: 'consistency', title: 'Consistencia', order: 2 }
    }
    if (type === 'deal_value_tier') {
        return { key: 'deal_value', title: 'Valor de Cierre', order: 3 }
    }
    if (type === 'location_city' || type === 'location_country') {
        return { key: 'territory', title: 'Territorio', order: 4 }
    }
    if (type === 'seniority_years') {
        return { key: 'trajectory', title: 'Trayectoria', order: 5 }
    }
    if (type === 'reliability_score') {
        return { key: 'performance', title: 'Rendimiento', order: 6 }
    }
    if (type === 'race_first_place' || type === 'race_second_place' || type === 'race_third_place' || type === 'race_all_positions' || type === 'race_total_trophies' || type === 'race_points_leader') {
        return { key: 'competition', title: 'Competencia', order: 7 }
    }
    if (type === 'admin_granted' || type === 'badge_leader') {
        return { key: 'distinctions', title: 'Distinciones', order: 8 }
    }
    return { key: 'others', title: 'Otros', order: 99 }
}

function getSpecialBadgeOverlayNumber(badge: any): string | null {
    if (badge?.badge_type === 'company_size') {
        const fromKey = String(badge?.badge_key || '').match(/size_(\d+)/)?.[1]
        if (fromKey) return fromKey
        const fromLabel = String(badge?.badge_label || '').match(/(\d+)/)?.[1]
        return fromLabel || null
    }
    if (badge?.badge_type === 'seniority_years') {
        const years = Number(badge?.progress_count || badge?.level || 0)
        if (years <= 0) return null
        return String(years)
    }
    if (badge?.badge_type === 'closing_streak') {
        const streak = Number(badge?.progress_count || 0)
        if (streak <= 0) return null
        return String(streak)
    }
    return null
}
