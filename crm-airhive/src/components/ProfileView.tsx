'use client'

import { useState, useEffect, useMemo, type ReactNode, type ComponentProps } from 'react'
import { createClient } from '@/lib/supabase'
import { Mail, Briefcase, MapPin, Calendar, BookOpen, User, Building, Globe, GraduationCap, Clock, Activity, Award, Sparkles, TrendingUp, Lock, X, Building2, Flag, Layers, Ruler, Trophy, Medal, Shield, Flame, Gem, MessageSquareQuote, ThumbsUp, Users, Target } from 'lucide-react'
import RoleBadge from '@/components/RoleBadge'
import { getRoleMeta, getRoleSilhouetteColor } from '@/lib/roleUtils'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'
import { buildIndustryBadgeVisualMap, getIndustryBadgeVisualFromMap, type BadgeVisual } from '@/lib/industryBadgeVisuals'
import { getSpecialBadgeVisualSpec } from '@/lib/specialBadgeVisuals'
import { useAuth } from '@/lib/auth'
import { grantAdminBadgeToSeller } from '@/app/actions/badges'
import BadgeInfoTooltip from '@/components/BadgeInfoTooltip'
import BadgeMedallion from '@/components/BadgeMedallion'
import { formatTenureExactLabel, getTenureBadgeMetrics } from '@/lib/tenureBadgeUtils'

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

const PROFILE_VIEW_CACHE_TTL_MS = 2 * 60 * 1000
const PROFILE_CATALOG_TABLES = [
    'job_positions',
    'areas',
    'seniority_levels',
    'education_levels',
    'careers',
    'work_modalities',
    'cities',
    'countries',
    'industrias'
] as const

type ProfileViewCachePayload = {
    savedAt: number
    profile: any
    details: any
    badges: any[]
    badgeLevels: { level: number, min_closures: number }[]
    specialBadges: any[]
    sellerStats: {
        totalClosures: number
        reliabilityScore: number
        seniorityYears: number
        totalPreLeads: number
        totalLeads: number
        completedMeetings: number
    }
    isBadgeLeader: boolean
    leaderBadgeCount: number
    allIndustries: { id: string, name: string, is_active?: boolean }[]
    catalogs: Record<string, any[]>
}

function normalizeComparableName(value: unknown) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase()
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

function getDealValueTierRankByKey(key?: string | null) {
    const value = String(key || '')
    if (value === 'value_10k_100k' || value === 'value_10k_plus') return 4
    if (value === 'value_5k_10k') return 3
    if (value === 'value_2k_5k') return 2
    if (value === 'value_1k_2k') return 1
    return 0
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
        seniorityYears: 0,
        totalPreLeads: 0,
        totalLeads: 0,
        completedMeetings: 0
    })
    const [isBadgeLeader, setIsBadgeLeader] = useState(false)
    const [leaderBadgeCount, setLeaderBadgeCount] = useState(0)
    const [allIndustries, setAllIndustries] = useState<{ id: string, name: string, is_active?: boolean }[]>([])
    const [isAllBadgesOpen, setIsAllBadgesOpen] = useState(false)
    const [grantingAdminBadge, setGrantingAdminBadge] = useState(false)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let cancelled = false
        const cacheKey = `airhive_profile_view_cache_${userId}`

        const readCache = () => {
            if (typeof window === 'undefined') return null
            try {
                const raw = localStorage.getItem(cacheKey)
                if (!raw) return null
                const parsed = JSON.parse(raw) as ProfileViewCachePayload
                if (!parsed?.savedAt) return null
                const age = Date.now() - Number(parsed.savedAt)
                if (age > PROFILE_VIEW_CACHE_TTL_MS) return null
                return parsed
            } catch {
                return null
            }
        }

        const writeCache = (payload: Omit<ProfileViewCachePayload, 'savedAt'>) => {
            if (typeof window === 'undefined') return
            try {
                localStorage.setItem(cacheKey, JSON.stringify({
                    ...payload,
                    savedAt: Date.now()
                }))
            } catch {
                // no-op
            }
        }

        const cached = readCache()
        if (cached) {
            setProfile(cached.profile || null)
            setDetails(cached.details || null)
            setBadges(Array.isArray(cached.badges) ? cached.badges : [])
            setBadgeLevels(Array.isArray(cached.badgeLevels) ? cached.badgeLevels : [])
            setSpecialBadges(Array.isArray(cached.specialBadges) ? cached.specialBadges : [])
            setSellerStats(cached.sellerStats || {
                totalClosures: 0,
                reliabilityScore: 0,
                seniorityYears: 0,
                totalPreLeads: 0,
                totalLeads: 0,
                completedMeetings: 0
            })
            setIsBadgeLeader(Boolean(cached.isBadgeLeader))
            setLeaderBadgeCount(Number(cached.leaderBadgeCount || 0))
            setAllIndustries(Array.isArray(cached.allIndustries) ? cached.allIndustries : [])
            setCatalogs(cached.catalogs || {})
            setLoading(false)
            return () => {
                cancelled = true
            }
        }

        const loadData = async () => {
            try {
                const supabase = createClient()
                const loadCatalogsDirect = async () => {
                    const entries = await Promise.all(
                        PROFILE_CATALOG_TABLES.map(async (table) => {
                            const { data } = await (supabase
                                .from(table)
                                .select('id, name')
                                .eq('is_active', true)
                                .order('name') as any)
                            return [table, Array.isArray(data) ? data : []] as const
                        })
                    )
                    return Object.fromEntries(entries) as Record<string, any[]>
                }

                const [
                    { data: p },
                    { data: d },
                    { data: userBadges },
                    { data: levels },
                    { data: userSpecialBadges },
                    { count: closuresCount },
                    { count: totalPreLeadsCount },
                    { count: totalLeadsCount },
                    { count: completedMeetingsCount },
                    { data: reliabilityRows },
                    { data: industriesRaw },
                    directCatalogs
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
                        .from('pre_leads') as any)
                        .select('id', { count: 'exact', head: true })
                        .eq('vendedor_id', userId),
                    (supabase
                        .from('clientes') as any)
                        .select('id', { count: 'exact', head: true })
                        .eq('owner_id', userId),
                    (supabase
                        .from('meetings') as any)
                        .select('id', { count: 'exact', head: true })
                        .eq('seller_id', userId)
                        .or('status.eq.completed,meeting_status.eq.held'),
                    (supabase
                        .from('clientes') as any)
                        .select('forecast_logloss')
                        .eq('owner_id', userId)
                        .not('forecast_logloss', 'is', null),
                    (supabase
                        .from('industrias') as any)
                        .select('id, name, is_active')
                        .order('name', { ascending: true }),
                    loadCatalogsDirect()
                ])

                if (cancelled) return

                const cats = directCatalogs || {}
                const industries = (industriesRaw || []) as any[]
                const profileRow = (p || {}) as any

                setProfile(profileRow)
                setDetails(d || {})
                setBadges(userBadges || [])

                const normalizedFullName = normalizeComparableName(profileRow?.full_name)
                const profileName = String(profileRow?.full_name || '').trim()

                // Optimized quote fetch: avoid full-table scan in settings profile.
                const quoteQueries: Array<Promise<any>> = [
                    (supabase
                        .from('crm_quotes') as any)
                        .select('id, contributed_by, contributed_by_name, quote_author, quote_source')
                        .is('deleted_at', null)
                        .eq('contributed_by', userId)
                ]

                if (profileName) {
                    quoteQueries.push(
                        (supabase
                            .from('crm_quotes') as any)
                            .select('id, contributed_by, contributed_by_name, quote_author, quote_source')
                            .is('deleted_at', null)
                            .eq('contributed_by_name', profileName)
                    )
                    quoteQueries.push(
                        (supabase
                            .from('crm_quotes') as any)
                            .select('id, contributed_by, contributed_by_name, quote_author, quote_source')
                            .is('deleted_at', null)
                            .eq('quote_author', profileName)
                    )
                }

                const quoteResponses = await Promise.all(quoteQueries)
                const quoteMap = new Map<number, any>()
                for (const response of quoteResponses) {
                    for (const row of (response?.data || [])) {
                        const id = Number((row as any)?.id)
                        if (!Number.isFinite(id)) continue
                        quoteMap.set(id, row)
                    }
                }
                const quoteRows = Array.from(quoteMap.values()) as any[]
                const matchedQuoteRows = quoteRows.filter((q: any) => {
                    if (String(q?.contributed_by || '') === String(userId)) return true
                    if (normalizeComparableName(q?.contributed_by_name) === normalizedFullName) return true
                    const authorMatches = normalizeComparableName(q?.quote_author) === normalizedFullName
                    const ownLike = String(q?.quote_source || '').toLowerCase().includes('interna en airhive')
                    return authorMatches && ownLike
                })
            const matchedQuoteIds = matchedQuoteRows
                .map((q: any) => Number(q?.id))
                .filter((id: number) => Number.isFinite(id))
            const quoteContributionProgress = matchedQuoteIds.length

            let quoteLikesProgress = 0
            if (matchedQuoteIds.length > 0) {
                const { data: likesRows } = await (supabase
                    .from('crm_quote_reactions') as any)
                    .select('id')
                    .in('quote_id', matchedQuoteIds)
                    .eq('reaction_type', 'like')
                quoteLikesProgress = (likesRows || []).length
            }

            const getContributionLevel = (progress: number) => {
                if (progress >= 25) return { level: 4, next: null as number | null }
                if (progress >= 10) return { level: 3, next: 25 }
                if (progress >= 5) return { level: 2, next: 10 }
                if (progress >= 1) return { level: 1, next: 5 }
                return { level: 0, next: 1 }
            }
            const getQuoteLikesLevel = (progress: number) => {
                if (progress >= 50) return { level: 3, next: null as number | null }
                if (progress >= 25) return { level: 2, next: 50 }
                if (progress >= 10) return { level: 1, next: 25 }
                return { level: 0, next: 10 }
            }

            const contributionLevelMeta = getContributionLevel(quoteContributionProgress)
            const quoteLikesLevelMeta = getQuoteLikesLevel(quoteLikesProgress)
            const getThresholdLevelMeta = (progress: number, thresholds: number[]) => {
                const clean = thresholds.filter((t) => Number.isFinite(t) && t > 0).sort((a, b) => a - b)
                let level = 0
                let next: number | null = clean[0] ?? null
                clean.forEach((threshold, index) => {
                    if (progress >= threshold) {
                        level = index + 1
                        next = clean[index + 1] ?? null
                    }
                })
                return { level, next }
            }
            const totalPreLeads = Math.max(0, Number(totalPreLeadsCount || 0))
            const totalLeads = Math.max(0, Number(totalLeadsCount || 0))
            const completedMeetings = Math.max(0, Number(completedMeetingsCount || 0))
            const preLeadLevelMeta = getThresholdLevelMeta(totalPreLeads, [1, 25, 100, 300])
            const leadLevelMeta = getThresholdLevelMeta(totalLeads, [1, 5, 15, 50])
            const meetingLevelMeta = getThresholdLevelMeta(completedMeetings, [1, 10, 25, 50])
            const derivedSpecial: any[] = []
            if (contributionLevelMeta.level > 0) {
                derivedSpecial.push({
                    id: 'derived-quote-contribution',
                    badge_type: 'quote_contribution',
                    badge_key: 'quote_contribution',
                    badge_label: 'Aportación de Frases',
                    progress_count: quoteContributionProgress,
                    level: contributionLevelMeta.level,
                    next_level_threshold: contributionLevelMeta.next
                })
            }
            if (quoteLikesLevelMeta.level > 0) {
                derivedSpecial.push({
                    id: 'derived-quote-likes',
                    badge_type: 'quote_likes_received',
                    badge_key: 'quote_likes_received',
                    badge_label: 'Frases con Likes',
                    progress_count: quoteLikesProgress,
                    level: quoteLikesLevelMeta.level,
                    next_level_threshold: quoteLikesLevelMeta.next
                })
            }
            if (preLeadLevelMeta.level > 0) {
                derivedSpecial.push({
                    id: 'derived-prelead-registered',
                    badge_type: 'prelead_registered',
                    badge_key: 'prelead_registered',
                    badge_label: 'Pre-Leads Registrados',
                    progress_count: totalPreLeads,
                    level: preLeadLevelMeta.level,
                    next_level_threshold: preLeadLevelMeta.next
                })
            }
            if (leadLevelMeta.level > 0) {
                derivedSpecial.push({
                    id: 'derived-lead-registered',
                    badge_type: 'lead_registered',
                    badge_key: 'lead_registered',
                    badge_label: 'Leads Registrados',
                    progress_count: totalLeads,
                    level: leadLevelMeta.level,
                    next_level_threshold: leadLevelMeta.next
                })
            }
            if (meetingLevelMeta.level > 0) {
                derivedSpecial.push({
                    id: 'derived-meeting-completed',
                    badge_type: 'meeting_completed',
                    badge_key: 'meeting_completed',
                    badge_label: 'Juntas Completadas',
                    progress_count: completedMeetings,
                    level: meetingLevelMeta.level,
                    next_level_threshold: meetingLevelMeta.next
                })
            }

            const realSpecial = (userSpecialBadges || []).filter((b: any) =>
                b &&
                (b.id || b.badge_type || b.badge_key) &&
                (b.level || 0) > 0 &&
                (b.progress_count || 0) > 0
            )
            const mergedByKey = new Map<string, any>()
            for (const row of [...realSpecial, ...derivedSpecial]) {
                const key = `${row?.badge_type || 'special'}::${row?.badge_key || 'key'}`
                const prev = mergedByKey.get(key)
                if (!prev || Number(row?.level || 0) >= Number(prev?.level || 0)) {
                    mergedByKey.set(key, row)
                }
            }
            setSpecialBadges(Array.from(mergedByKey.values()))
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
                    seniorityYears: years,
                    totalPreLeads,
                    totalLeads,
                    completedMeetings
                })
                // Lightweight leader badge state from precomputed badge (no global table scans).
                const badgeLeader = (userSpecialBadges || []).find((badge: any) => badge?.badge_type === 'badge_leader')
                setIsBadgeLeader(Boolean(badgeLeader && Number(badgeLeader?.level || 0) > 0))
                setLeaderBadgeCount(Number(badgeLeader?.progress_count || 0))

                writeCache({
                    profile: profileRow,
                    details: d || {},
                    badges: userBadges || [],
                    badgeLevels: levels || [],
                    specialBadges: Array.from(mergedByKey.values()),
                    sellerStats: {
                        totalClosures: Math.max(0, Number(closuresCount || 0)),
                        reliabilityScore: Math.round(relScore),
                        seniorityYears: years,
                        totalPreLeads,
                        totalLeads,
                        completedMeetings
                    },
                    isBadgeLeader: Boolean(badgeLeader && Number(badgeLeader?.level || 0) > 0),
                    leaderBadgeCount: Number(badgeLeader?.progress_count || 0),
                    allIndustries: (industries || []) as { id: string, name: string, is_active?: boolean }[],
                    catalogs: cats
                })
            } catch (error) {
                console.error('Error loading profile view:', error)
            } finally {
                if (!cancelled) setLoading(false)
            }
        }
        loadData()
        return () => {
            cancelled = true
        }
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
    const tenureBadgeMetrics = useMemo(
        () => getTenureBadgeMetrics(details?.start_date || null),
        [details?.start_date]
    )

    if (loading) return <div className='p-8 text-center animate-pulse text-[var(--text-secondary)]'>Cargando perfil...</div>
    if (!profile) return <div className='p-8 text-center text-red-500'>Usuario no encontrado</div>

    const roleMeta = getRoleMeta(profile.role)
    const maxConfiguredLevel = badgeLevels.length > 0 ? Math.max(...badgeLevels.map(b => b.level)) : 4
    const totalBadgePoints = badges.reduce((sum, b) => sum + (b.level || 0), 0) + specialBadges.reduce((sum, b) => sum + (Number(b?.level || 0)), 0)
    const badgeByIndustry = new Map<string, any>(badges.map((b) => [b.industria_id, b]))
    const summarySpecialBadges = (() => {
        const list = Array.isArray(specialBadges) ? specialBadges : []
        const bestDealTier = list
            .filter((badge: any) => badge?.badge_type === 'deal_value_tier')
            .sort((a: any, b: any) => getDealValueTierRankByKey(b?.badge_key) - getDealValueTierRankByKey(a?.badge_key))[0] || null

        const withoutDealTier = list.filter((badge: any) => badge?.badge_type !== 'deal_value_tier')
        return bestDealTier ? [...withoutDealTier, bestDealTier] : withoutDealTier
    })()
    const viewedUserIsGrantingAdmin = profile.role === 'admin'
        && BADGE_GRANT_ALLOWED_ADMINS.includes(String(profile.full_name || '').trim())
    const buildSpecialBadgeTooltipRows = (badge: any, unlockedOverride?: boolean, achievedMaxOverride?: boolean, nextThresholdOverride?: number | null) => {
        const type = String(badge?.badge_type || '')
        const progressCount = Number(badge?.progress_count || 0)
        const level = Number(badge?.level || 0)
        const unlocked = typeof unlockedOverride === 'boolean' ? unlockedOverride : level > 0
        const nextThreshold = typeof nextThresholdOverride !== 'undefined'
            ? nextThresholdOverride
            : (badge?.next_level_threshold ?? getSpecialDefaultThreshold(type))
        const achievedMax = typeof achievedMaxOverride === 'boolean' ? achievedMaxOverride : !nextThreshold

        if (type === 'seniority_years' && tenureBadgeMetrics) {
            return [
                { label: 'Años', value: String(tenureBadgeMetrics.years) },
                { label: 'Antigüedad', value: formatTenureExactLabel(tenureBadgeMetrics) },
                { label: 'Progreso', value: `${tenureBadgeMetrics.progressPctToNextLevel.toFixed(2)}%` },
                { label: 'Siguiente', value: `${tenureBadgeMetrics.nextLevelYears} años` }
            ]
        }

        return [
            { label: 'Nivel', value: unlocked ? String(level) : 'Bloqueado' },
            { label: 'Progreso', value: String(progressCount) },
            { label: 'Siguiente', value: achievedMax ? 'Nivel máximo' : String(nextThreshold || 0) }
        ]
    }
    const canGrantAdminBadge = auth.profile?.role === 'admin'
        && auth.user?.id !== userId
        && !viewedUserIsGrantingAdmin
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
                    <div className='grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3'>
                        {badges.map((badge) => {
                            const industryName = badge?.industrias?.name || 'Industria'
                            const badgeVisual = getIndustryBadgeVisualFromMap(badge.industria_id, industryVisualMap, industryName)
                            const IndustryIcon = badgeVisual.icon
                            const closures = Number(badge?.closures_count || 0)
                            const level = Number(badge?.level || 0)
                            const nextLevel = badge?.next_level_threshold
                            const nextText = nextLevel
                                ? `${Math.max(0, Number(nextLevel) - closures)} cierre${Math.max(0, Number(nextLevel) - closures) === 1 ? '' : 's'}`
                                : 'Nivel máximo'

                            return (
                                <div key={`${badge.industria_id}-${badge.level}`} className='rounded-2xl border p-3 bg-[var(--hover-bg)] border-[var(--card-border)] hover:border-blue-400/45 transition-colors'>
                                    <BadgeInfoTooltip
                                        title={industryName}
                                        subtitle='Badge de industria'
                                        rows={[
                                            { label: 'Nivel', value: String(level) },
                                            { label: 'Cierres', value: String(closures) },
                                            { label: 'Siguiente', value: nextText }
                                        ]}
                                        className='w-full'
                                    >
                                        <div className='w-full flex items-center gap-3'>
                                            <BadgeMedallion
                                                icon={IndustryIcon}
                                                centerClassName={badgeVisual.containerClass}
                                                iconClassName={badgeVisual.iconClass}
                                                size='md'
                                                iconSize={18}
                                                strokeWidth={2.7}
                                            />
                                            <div className='min-w-0'>
                                                <p className='text-sm font-black truncate text-[var(--text-primary)]'>{industryName}</p>
                                                <p className='text-[10px] font-black uppercase tracking-[0.14em] text-[var(--accent-secondary)]'>
                                                    Nivel {level} · {closures} cierre{closures === 1 ? '' : 's'}
                                                </p>
                                            </div>
                                        </div>
                                    </BadgeInfoTooltip>
                                </div>
                            )
                        })}
                    </div>
                )}

                {specialBadges.length > 0 && (
                    <div className='rounded-xl border p-4 bg-[var(--hover-bg)] border-[var(--card-border)]'>
                        <p className='text-[10px] font-black uppercase tracking-wider text-[var(--text-secondary)] mb-3'>
                            Badges especiales acumuladas
                        </p>
                        <div className='grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2.5'>
                            {summarySpecialBadges.map((badge: any, index: number) => (
                                (() => {
                                    const safeLabel = typeof badge?.badge_label === 'string' ? badge.badge_label : 'Badge especial'
                                    const typeMeta = getSpecialBadgeTypeMeta(String(badge?.badge_type || 'special'), safeLabel)
                                    const Icon = typeMeta.icon
                                    const badgeOverlayNumber = getSpecialBadgeOverlayNumber(badge)
                                    const isSeniorityBadge = String(badge?.badge_type || '') === 'seniority_years'
                                    const progressCount = Number(badge?.progress_count || 0)
                                    const level = Number(badge?.level || 0)
                                    const nextThreshold = badge?.next_level_threshold
                                    return (
                                        <div
                                            key={`special-summary-${badge?.badge_type || 'badge'}-${badge?.badge_key || index}`}
                                            className='rounded-xl border p-2 bg-[var(--card-bg)] border-[var(--card-border)] hover:border-blue-400/45 transition-colors'
                                        >
                                            <BadgeInfoTooltip
                                                title={safeLabel}
                                                subtitle={typeMeta.title}
                                                rows={buildSpecialBadgeTooltipRows(badge)}
                                                className='w-full'
                                            >
                                                <div className='flex items-center gap-2 w-full'>
                                                    <BadgeMedallion
                                                        icon={Icon}
                                                        centerClassName={typeMeta.containerClass}
                                                        iconClassName={typeMeta.iconClass}
                                                        overlayText={isSeniorityBadge ? null : badgeOverlayNumber}
                                                        footerBubbleText={isSeniorityBadge ? String(tenureBadgeMetrics?.years ?? badgeOverlayNumber ?? '') : null}
                                                        ringStyle={getSpecialBadgeRingStyleByType(String(badge?.badge_type || ''), String(badge?.badge_label || ''), String(badge?.badge_key || ''))}
                                                        coreBorderColorClassName={String((typeMeta as any)?.coreBorderColorClassName || '') || (shouldUseWhiteCoreBorderForSpecialBadgeType(String(badge?.badge_type || '')) ? 'border-white/90' : '')}
                                                        size='sm'
                                                        iconSize={15}
                                                        strokeWidth={2.7}
                                                    />
                                                    <p className='text-[10px] font-black text-[var(--text-primary)] truncate'>
                                                        {safeLabel}
                                                    </p>
                                                </div>
                                            </BadgeInfoTooltip>
                                        </div>
                                    )
                                })()
                            ))}
                        </div>
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
                employeeStartDate={details?.start_date ?? null}
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
    sellerStats,
    employeeStartDate
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
        totalPreLeads: number
        totalLeads: number
        completedMeetings: number
    }
    employeeStartDate?: string | null
}) {
    useBodyScrollLock(isOpen)
    const [modalTab, setModalTab] = useState<'catalog' | 'evolution'>('catalog')
    const [catalogBadgeFilter, setCatalogBadgeFilter] = useState<'all' | 'achieved'>('all')
    const specialBadgeCatalog = useMemo(
        () => buildSpecialBadgeCatalog(specialBadges, {
            isBadgeLeader,
            leaderBadgeCount,
            sellerStats,
            industryBadgeCount: Array.from(badgeByIndustry.values()).filter((b: any) => Number(b?.level || 0) > 0).length
        }),
        [specialBadges, isBadgeLeader, leaderBadgeCount, sellerStats, badgeByIndustry]
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
    const sortedIndustries = useMemo(
        () => [...industries].sort((a, b) => a.name.localeCompare(b.name, 'es')),
        [industries]
    )
    const filteredIndustries = useMemo(
        () => (catalogBadgeFilter === 'achieved'
            ? sortedIndustries.filter((industry) => Number(badgeByIndustry.get(industry.id)?.level || 0) > 0)
            : sortedIndustries),
        [catalogBadgeFilter, sortedIndustries, badgeByIndustry]
    )
    const filteredGroupedSpecialBadges = useMemo(
        () => groupedSpecialBadges
            .map((group) => ({
                ...group,
                items: catalogBadgeFilter === 'achieved'
                    ? group.items.filter((badge) => Number(badge?.level || 0) > 0)
                    : group.items
            }))
            .filter((group) => group.items.length > 0),
        [catalogBadgeFilter, groupedSpecialBadges]
    )
    const specialMultiLevelEvolutionBadges = useMemo(
        () => specialBadgeCatalog.filter((badge) => getSpecialBadgeEvolutionMilestones(badge).length > 1),
        [specialBadgeCatalog]
    )
    const allBadgesTenureMetrics = useMemo(
        () => getTenureBadgeMetrics(employeeStartDate ?? null),
        [employeeStartDate]
    )
    const buildCatalogSpecialBadgeTooltipRows = (
        badge: any,
        unlockedOverride?: boolean,
        achievedMaxOverride?: boolean,
        nextThresholdOverride?: number | null
    ) => {
        const type = String(badge?.badge_type || '')
        const progressCount = Number(badge?.progress_count || 0)
        const level = Number(badge?.level || 0)
        const unlocked = typeof unlockedOverride === 'boolean' ? unlockedOverride : level > 0
        const nextThreshold = typeof nextThresholdOverride === 'number'
            ? nextThresholdOverride
            : (badge?.next_level_threshold ?? getSpecialDefaultThreshold(type) ?? null)
        const achievedMax = typeof achievedMaxOverride === 'boolean' ? achievedMaxOverride : !nextThreshold
        const baseRows = [
            { label: 'Estado', value: unlocked ? `Nivel ${level}` : 'Bloqueado' },
            { label: 'Progreso', value: String(progressCount) },
            { label: 'Siguiente', value: achievedMax ? 'Nivel máximo' : String(nextThreshold ?? '-') }
        ]
        if (type === 'seniority_years' && allBadgesTenureMetrics) {
            return [
                { label: 'Años', value: String(allBadgesTenureMetrics.years) },
                { label: 'Antigüedad', value: formatTenureExactLabel(allBadgesTenureMetrics) },
                { label: 'Progreso', value: `${allBadgesTenureMetrics.progressPctToNextLevel.toFixed(2)}%` },
                { label: 'Siguiente', value: `${allBadgesTenureMetrics.nextLevelYears} años` }
            ]
        }
        return baseRows
    }

    if (!isOpen) return null

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
                    <div className='flex flex-wrap items-center justify-between gap-3'>
                        <div className='flex flex-wrap gap-2 text-[11px]'>
                            {badgeLevels.map((lvl) => (
                                <span key={lvl.level} className='px-2.5 py-1 rounded-full border font-bold bg-[var(--hover-bg)] border-[var(--card-border)] text-[var(--text-secondary)]'>
                                    Nivel {lvl.level}: {lvl.min_closures}
                                </span>
                            ))}
                        </div>
                        <div className='inline-flex p-1 rounded-xl border bg-[var(--hover-bg)] border-[var(--card-border)] gap-1'>
                            <button
                                type='button'
                                onClick={() => setModalTab('catalog')}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-[0.14em] cursor-pointer transition-colors ${modalTab === 'catalog' ? 'bg-blue-500/20 text-blue-200 border border-blue-400/35' : 'text-[var(--text-secondary)] border border-transparent hover:text-[var(--text-primary)]'}`}
                            >
                                Catálogo
                            </button>
                            <button
                                type='button'
                                onClick={() => setModalTab('evolution')}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-[0.14em] cursor-pointer transition-colors ${modalTab === 'evolution' ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/35' : 'text-[var(--text-secondary)] border border-transparent hover:text-[var(--text-primary)]'}`}
                            >
                                Evolución
                            </button>
                        </div>
                    </div>

                    {modalTab === 'catalog' && (
                        <div className='flex flex-wrap items-center gap-2'>
                            <span className='text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]'>
                                Filtros
                            </span>
                            <button
                                type='button'
                                onClick={() => setCatalogBadgeFilter((prev) => prev === 'achieved' ? 'all' : 'achieved')}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-[0.14em] border cursor-pointer transition-colors ${
                                    catalogBadgeFilter === 'achieved'
                                        ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/35'
                                        : 'bg-[var(--hover-bg)] text-[var(--text-secondary)] border-[var(--card-border)] hover:text-[var(--text-primary)]'
                                }`}
                            >
                                Badges conseguidos
                            </button>
                        </div>
                    )}

                    {modalTab === 'catalog' && (
                    <>
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                        {filteredIndustries.map((industry) => {
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
                                <div key={industry.id} className={`group p-4 rounded-xl border transition-colors ${unlocked ? 'bg-[var(--hover-bg)] border-blue-500/30' : 'bg-[var(--card-bg)] border-[var(--card-border)]'}`}>
                                    <div className='flex items-start justify-between gap-2'>
                                        <div className='min-w-0 flex items-center gap-3'>
                                            <BadgeInfoTooltip
                                                title={industry.name}
                                                subtitle='Badge de industria'
                                                rows={[
                                                    { label: 'Nivel', value: unlocked ? String(level) : 'Bloqueado' },
                                                    { label: 'Cierres', value: String(closures) },
                                                    { label: 'Siguiente', value: achievedMax ? 'Nivel máximo' : String(nextThreshold) }
                                                ]}
                                                align='start'
                                                placement='bottom'
                                            >
                                                <HoverRevealBadgeMedallion
                                                    locked={!unlocked}
                                                    icon={IndustryIcon}
                                                    centerClassName={badgeVisual.containerClass}
                                                    iconClassName={`${badgeVisual.iconClass} ${unlocked ? 'opacity-100' : 'opacity-90'}`}
                                                    size='sm'
                                                    iconSize={17}
                                                    strokeWidth={2.7}
                                                />
                                            </BadgeInfoTooltip>
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

                        {filteredGroupedSpecialBadges.length === 0 ? (
                            <div className='p-4 rounded-xl border border-dashed text-sm bg-[var(--hover-bg)] border-[var(--card-border)] text-[var(--text-secondary)]'>
                                {catalogBadgeFilter === 'achieved'
                                    ? 'Aún no hay badges especiales conseguidos.'
                                    : 'Aún no hay badges especiales disponibles.'}
                            </div>
                        ) : (
                            <div className='space-y-4'>
                            {filteredGroupedSpecialBadges.map((group) => (
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
                                const isQuoteContributionBadge = badge.badge_type === 'quote_contribution'
                                const isQuoteLikesBadge = badge.badge_type === 'quote_likes_received'
                                const nextThreshold = (badge.next_level_threshold ?? getSpecialDefaultThreshold(badge.badge_type)) as number | null
                                const achievedMax = !nextThreshold
                                const rawProgress = achievedMax ? 100 : Math.min(100, (progressCount / Math.max(1, nextThreshold || 1)) * 100)
                                const safeKey = badge.id || `${badge.badge_type || 'special'}-${badge.badge_key || 'key'}-${index}`

                                return (
                                    <div key={safeKey} className={`group p-4 rounded-xl border transition-colors ${unlocked ? 'bg-[var(--hover-bg)] border-blue-500/30' : 'bg-[var(--card-bg)] border-[var(--card-border)]'}`}>
                                        <div className='flex items-start justify-between gap-2'>
                                            <div className='min-w-0 flex items-center gap-3'>
                                                <BadgeInfoTooltip
                                                    title={safeLabel}
                                                    subtitle={typeMeta.title}
                                                    rows={buildCatalogSpecialBadgeTooltipRows(badge, unlocked, achievedMax, nextThreshold)}
                                                    align='start'
                                                    placement='bottom'
                                                >
                                                    <HoverRevealBadgeMedallion
                                                        locked={!unlocked}
                                                        icon={Icon}
                                                        centerClassName={typeMeta.containerClass}
                                                        iconClassName={`${typeMeta.iconClass} ${unlocked ? 'opacity-100' : 'opacity-90'}`}
                                                        overlayText={isSeniorityBadge ? null : badgeOverlayNumber}
                                                        footerBubbleText={isSeniorityBadge ? String(allBadgesTenureMetrics?.years ?? badgeOverlayNumber ?? '') : null}
                                                        ringStyle={getSpecialBadgeRingStyleByType(String(badge?.badge_type || ''), String(badge?.badge_label || ''), String(badge?.badge_key || ''))}
                                                        coreBorderColorClassName={String((typeMeta as any)?.coreBorderColorClassName || '') || (shouldUseWhiteCoreBorderForSpecialBadgeType(badge.badge_type) ? 'border-white/90' : '')}
                                                        size='sm'
                                                        iconSize={16}
                                                        strokeWidth={2.7}
                                                    />
                                                </BadgeInfoTooltip>
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
                                                                            : isQuoteContributionBadge
                                                                                ? `${progressCount} frases`
                                                                                : isQuoteLikesBadge
                                                                                    ? `${progressCount} likes`
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
                                                                                : isQuoteContributionBadge
                                                                                    ? `Siguiente nivel en ${Math.max(0, nextThreshold - progressCount)} frase${Math.max(0, nextThreshold - progressCount) === 1 ? '' : 's'}.`
                                                                                    : isQuoteLikesBadge
                                                                                        ? `Siguiente nivel en ${Math.max(0, nextThreshold - progressCount)} like${Math.max(0, nextThreshold - progressCount) === 1 ? '' : 's'}.`
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
                                                                            ? `Desbloquea al cerrar un lead ganado con mensualidad real en el rango ${safeLabel.replace('Mensualidad ', '')}.`
                                                                            : isRacePointsLeaderBadge
                                                                                ? 'Desbloquea al liderar el ranking de puntos del podio.'
                                                                                : isQuoteContributionBadge
                                                                                    ? `Desbloquea al aportar ${nextThreshold} frase${nextThreshold === 1 ? '' : 's'} aceptada${nextThreshold === 1 ? '' : 's'}.`
                                                                                    : isQuoteLikesBadge
                                                                                        ? `Desbloquea al recibir ${nextThreshold} likes en tus frases.`
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
                    </>
                    )}

                    {modalTab === 'evolution' && (
                    <div className='pt-1'>
                        <div className='flex items-center gap-2 mb-2'>
                            <Sparkles size={14} className='text-cyan-400' />
                            <h4 className='text-xs font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]'>
                                Evolución de Niveles
                            </h4>
                        </div>
                        <p className='text-xs mb-4 text-[var(--text-secondary)]'>
                            Vista de progreso y siguientes etapas para badges con evolución (industria y badges especiales seleccionadas).
                        </p>

                        <div className='space-y-4'>
                            <div className='rounded-xl border p-4 bg-[var(--hover-bg)] border-[var(--card-border)]'>
                                <div className='flex items-center gap-2 mb-3'>
                                    <Award size={13} className='text-amber-400' />
                                    <p className='text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]'>
                                        Evolución · Badges por Industria
                                    </p>
                                </div>
                                <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                                    {sortedIndustries.map((industry) => {
                                        const badge = badgeByIndustry.get(industry.id)
                                        const badgeVisual = getIndustryBadgeVisualFromMap(industry.id, industryVisualMap, industry.name)
                                        return (
                                            <IndustryBadgeEvolutionCard
                                                key={`evo-industry-${industry.id}`}
                                                industry={industry}
                                                badge={badge}
                                                badgeLevels={badgeLevels}
                                                badgeVisual={badgeVisual}
                                            />
                                        )
                                    })}
                                </div>
                            </div>

                            {specialMultiLevelEvolutionBadges.length > 0 && (
                                <div className='rounded-xl border p-4 bg-[var(--hover-bg)] border-[var(--card-border)]'>
                                    <div className='flex items-center gap-2 mb-3'>
                                        <Layers size={13} className='text-fuchsia-400' />
                                        <p className='text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]'>
                                            Evolución · Badges Especiales
                                        </p>
                                    </div>
                                    <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                                        {specialMultiLevelEvolutionBadges.map((badge, index) => (
                                            <SpecialBadgeEvolutionCard
                                                key={`evo-special-${badge?.badge_type || 'badge'}-${badge?.badge_key || index}`}
                                                badge={badge}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    )}
                </div>
            </div>
        </div>
    )
}

function HoverRevealBadgeMedallion({
    locked,
    evo = false,
    ...props
}: {
    locked: boolean
    evo?: boolean
} & ComponentProps<typeof BadgeMedallion>) {
    if (!locked) {
        return <BadgeMedallion {...props} />
    }

    const grayHideClass = evo ? 'group-hover/evo:opacity-0' : 'group-hover:opacity-0'
    const colorShowClass = evo ? 'group-hover/evo:opacity-100' : 'group-hover:opacity-100'

    return (
        <span className='inline-grid shrink-0 place-items-center'>
            <BadgeMedallion
                {...props}
                className={`${props.className || ''} [grid-area:1/1] grayscale opacity-90 ${grayHideClass}`.trim()}
            />
            <BadgeMedallion
                {...props}
                className={`${props.className || ''} [grid-area:1/1] opacity-0 pointer-events-none ${colorShowClass}`.trim()}
            />
        </span>
    )
}

function IndustryBadgeEvolutionCard({
    industry,
    badge,
    badgeLevels,
    badgeVisual
}: {
    industry: { id: string, name: string, is_active?: boolean }
    badge: any
    badgeLevels: { level: number, min_closures: number }[]
    badgeVisual: BadgeVisual
}) {
    const IndustryIcon = badgeVisual.icon
    const currentLevel = Number(badge?.level || 0)
    const closures = Number(badge?.closures_count || 0)
    const unlocked = currentLevel > 0
    const milestones = badgeLevels.length > 0 ? badgeLevels : [
        { level: 1, min_closures: 1 },
        { level: 2, min_closures: 3 },
        { level: 3, min_closures: 5 },
        { level: 4, min_closures: 10 }
    ]

    return (
        <div className='group rounded-xl border p-4 bg-[var(--card-bg)] border-[var(--card-border)] hover:border-blue-400/35 transition-colors'>
            <div className='flex items-center justify-between gap-3'>
                <div className='min-w-0 flex items-center gap-3'>
                    <HoverRevealBadgeMedallion
                        locked={!unlocked}
                        icon={IndustryIcon}
                        centerClassName={badgeVisual.containerClass}
                        iconClassName={badgeVisual.iconClass}
                        size='md'
                        iconSize={18}
                        strokeWidth={2.6}
                    />
                    <div className='min-w-0'>
                        <p className='text-sm font-black truncate text-[var(--text-primary)]'>
                            {industry.name}
                        </p>
                        <p className='text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]'>
                            {currentLevel > 0 ? `Nivel ${currentLevel}` : 'Bloqueado'} · {closures} cierres
                        </p>
                    </div>
                </div>
                <span className='px-2 py-1 rounded-lg border text-[10px] font-black bg-blue-500/10 border-blue-400/25 text-blue-300'>
                    Evolución
                </span>
            </div>

            <BadgeLevelEvolutionTrack
                nodes={milestones.map((m) => ({
                    level: m.level,
                    threshold: m.min_closures,
                    caption: `${m.min_closures} cierre${m.min_closures === 1 ? '' : 's'}`
                }))}
                currentLevel={currentLevel}
                currentProgress={closures}
                icon={IndustryIcon}
                centerClassName={badgeVisual.containerClass}
                iconClassName={badgeVisual.iconClass}
            />
        </div>
    )
}

function SpecialBadgeEvolutionCard({ badge }: { badge: any }) {
    const safeLabel = typeof badge?.badge_label === 'string' ? badge.badge_label : 'Badge especial'
    const typeMeta = getSpecialBadgeTypeMeta(String(badge?.badge_type || 'special'), safeLabel)
    const milestones = getSpecialBadgeEvolutionMilestones(badge)
    if (milestones.length <= 1) return null
    const unlocked = Number(badge?.level || 0) > 0
    const isSeniorityBadge = String(badge?.badge_type || '') === 'seniority_years'

    return (
        <div className='group rounded-xl border p-4 bg-[var(--card-bg)] border-[var(--card-border)] hover:border-fuchsia-400/30 transition-colors'>
            <div className='flex items-center justify-between gap-3'>
                <div className='min-w-0 flex items-center gap-3'>
                    <HoverRevealBadgeMedallion
                        locked={!unlocked}
                        icon={typeMeta.icon}
                        centerClassName={typeMeta.containerClass}
                        iconClassName={typeMeta.iconClass}
                        overlayText={isSeniorityBadge ? null : getSpecialBadgeOverlayNumber(badge)}
                        footerBubbleText={isSeniorityBadge ? String(getSpecialBadgeOverlayNumber(badge) ?? '') : null}
                        ringStyle={getSpecialBadgeRingStyleByType(String(badge?.badge_type || ''), String(badge?.badge_label || ''), String(badge?.badge_key || ''))}
                        coreBorderColorClassName={String((typeMeta as any)?.coreBorderColorClassName || '') || (shouldUseWhiteCoreBorderForSpecialBadgeType(String(badge?.badge_type || '')) ? 'border-white/90' : '')}
                        size='md'
                        iconSize={17}
                        strokeWidth={2.6}
                    />
                    <div className='min-w-0'>
                        <p className='text-sm font-black truncate text-[var(--text-primary)]'>{safeLabel}</p>
                        <p className='text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]'>
                            {typeMeta.title} · Nivel {Number(badge?.level || 0)}
                        </p>
                    </div>
                </div>
                <span className='px-2 py-1 rounded-lg border text-[10px] font-black bg-fuchsia-500/10 border-fuchsia-400/25 text-fuchsia-300'>
                    Multi-nivel
                </span>
            </div>

            <BadgeLevelEvolutionTrack
                nodes={milestones}
                currentLevel={Number(badge?.level || 0)}
                currentProgress={Number(badge?.progress_count || 0)}
                icon={typeMeta.icon}
                centerClassName={typeMeta.containerClass}
                iconClassName={typeMeta.iconClass}
                ringStyle='match'
                coreBorderColorClassName={String((typeMeta as any)?.coreBorderColorClassName || '') || (shouldUseWhiteCoreBorderForSpecialBadgeType(String(badge?.badge_type || '')) ? 'border-white/90' : '')}
            />
        </div>
    )
}

function BadgeLevelEvolutionTrack({
    nodes,
    currentLevel,
    currentProgress,
    icon,
    centerClassName,
    iconClassName,
    ringStyle = 'match',
    coreBorderColorClassName
}: {
    nodes: Array<{ level: number, threshold: number, caption: string }>
    currentLevel: number
    currentProgress: number
    icon: any
    centerClassName: string
    iconClassName: string
    ringStyle?: 'match' | 'gold' | 'bronze' | 'silver' | 'royal' | 'royal_dark' | 'royal_dark_vivid' | 'royal_gold' | 'royal_purple'
    coreBorderColorClassName?: string
}) {
    return (
        <div className='mt-4 rounded-xl border p-3 bg-[var(--hover-bg)] border-[var(--card-border)]'>
            <div className='relative'>
                <div className='absolute left-4 right-4 top-5 h-[2px] bg-gradient-to-r from-white/10 via-white/30 to-white/10 pointer-events-none' />
                <div className='grid gap-2' style={{ gridTemplateColumns: `repeat(${nodes.length}, minmax(0, 1fr))` }}>
                    {nodes.map((node, index) => {
                        const achieved = currentLevel >= node.level
                        const current = !achieved && index > 0
                            ? currentLevel >= nodes[index - 1].level
                            : currentLevel === node.level && currentLevel > 0
                        const next = !achieved && (index === 0 || currentLevel >= nodes[index - 1].level)
                        const thresholdText = node.caption
                        const evoStyle = getEvolutionVisualTier(index, achieved, next, current)
                        const isLocked = !achieved
                        const medallionStateClass = achieved
                            ? 'brightness-110 saturate-110'
                            : 'opacity-80 group-hover/evo:opacity-100'
                        const medallionWrapStateClass = achieved
                            ? ''
                            : 'grayscale opacity-85 group-hover/evo:grayscale-0 group-hover/evo:opacity-100'
                        const decorationStateClass = achieved
                            ? ''
                            : 'grayscale group-hover/evo:grayscale-0'
                        const statusLabel = achieved ? 'Desbloqueado' : next ? 'Siguiente' : 'Bloqueado'

                        return (
                            <div key={`${node.level}-${node.threshold}`} className='relative flex flex-col items-center text-center gap-2 group/evo'>
                                <div className={`relative rounded-xl p-2 ${evoStyle.nodeFrameClass}`}>
                                    <span className={`absolute left-2 right-2 top-2 h-px rounded-full ${evoStyle.accentLineClass}`} />
                                    <span className={`absolute left-2 right-2 bottom-2 h-5 rounded-md border ${evoStyle.plaqueClass}`} />
                                    <span className={`absolute left-2 top-2 w-2 h-2 rounded-tl-md border-l border-t ${evoStyle.cornerClass}`} />
                                    <span className={`absolute right-2 top-2 w-2 h-2 rounded-tr-md border-r border-t ${evoStyle.cornerClass}`} />
                                    <span className={`absolute left-2 bottom-2 w-2 h-2 rounded-bl-md border-l border-b ${evoStyle.cornerClass}`} />
                                    <span className={`absolute right-2 bottom-2 w-2 h-2 rounded-br-md border-r border-b ${evoStyle.cornerClass}`} />
                                    <span className={`absolute top-1.5 left-1/2 -translate-x-1/2 px-1.5 py-[2px] rounded-full border text-[7px] font-black uppercase tracking-[0.14em] ${evoStyle.tierChipClass}`}>
                                        {evoStyle.tierLabel}
                                    </span>
                                    <div className={`relative isolate inline-flex items-center justify-center ${evoStyle.mountClass}`}>
                                        {evoStyle.showWings && (
                                            <>
                                                <span className={`absolute z-[1] left-1/2 top-1/2 -translate-y-1/2 -translate-x-[104%] ${evoStyle.wingShapeLeftClass} ${centerClassName} ${decorationStateClass}`} />
                                                <span className={`absolute z-[1] left-1/2 top-1/2 -translate-y-1/2 translate-x-[4%] ${evoStyle.wingShapeRightClass} ${centerClassName} ${decorationStateClass}`} />
                                                {evoStyle.showWingBridges && (
                                                    <>
                                                        <span className={`absolute z-[2] left-1/2 top-1/2 -translate-y-1/2 -translate-x-[68%] ${evoStyle.wingBridgeLeftClass} ${centerClassName} ${decorationStateClass}`} />
                                                        <span className={`absolute z-[2] left-1/2 top-1/2 -translate-y-1/2 translate-x-[18%] ${evoStyle.wingBridgeRightClass} ${centerClassName} ${decorationStateClass}`} />
                                                    </>
                                                )}
                                            </>
                                        )}
                                        {evoStyle.showWingLayer2 && (
                                            <>
                                                <span className={`absolute z-0 left-1/2 top-1/2 -translate-y-[26%] -translate-x-[114%] ${evoStyle.wingLayer2LeftClass} ${centerClassName} ${decorationStateClass}`} />
                                                <span className={`absolute z-0 left-1/2 top-1/2 -translate-y-[26%] translate-x-[14%] ${evoStyle.wingLayer2RightClass} ${centerClassName} ${decorationStateClass}`} />
                                            </>
                                        )}
                                        {evoStyle.showTail && (
                                            <>
                                                <span className={`absolute left-1/2 top-1/2 translate-y-[85%] -translate-x-[75%] ${evoStyle.tailShapeClass} rotate-[12deg] ${centerClassName} ${decorationStateClass}`} />
                                                <span className={`absolute left-1/2 top-1/2 translate-y-[85%] -translate-x-[15%] ${evoStyle.tailShapeClass} rotate-[-12deg] ${centerClassName} ${decorationStateClass}`} />
                                                {evoStyle.showTailCenter && (
                                                    <span className={`absolute left-1/2 top-1/2 translate-y-[92%] -translate-x-1/2 ${evoStyle.tailCenterClass} ${centerClassName} ${decorationStateClass}`} />
                                                )}
                                            </>
                                        )}
                                        {evoStyle.showCrest && (
                                            <>
                                                {evoStyle.showCrestBridge && (
                                                    <span className={`absolute z-[3] left-1/2 top-1/2 -translate-x-1/2 -translate-y-[74%] ${evoStyle.crestBridgeClass} ${centerClassName} ${decorationStateClass}`} />
                                                )}
                                                <span className={`absolute z-[4] left-1/2 top-1/2 -translate-x-1/2 -translate-y-[88%] ${evoStyle.crestShapeClass} ${centerClassName} ${decorationStateClass}`} />
                                                {evoStyle.showCrestProngs && (
                                                    <>
                                                        <span className={`absolute z-[5] left-1/2 top-1/2 -translate-y-[112%] -translate-x-[72%] ${evoStyle.crestProngClass} ${centerClassName} ${decorationStateClass}`} />
                                                        <span className={`absolute z-[5] left-1/2 top-1/2 -translate-y-[120%] -translate-x-1/2 ${evoStyle.crestProngClass} ${centerClassName} ${decorationStateClass}`} />
                                                        <span className={`absolute z-[5] left-1/2 top-1/2 -translate-y-[112%] translate-x-[0%] ${evoStyle.crestProngClass} ${centerClassName} ${decorationStateClass}`} />
                                                    </>
                                                )}
                                            </>
                                        )}
                                        {evoStyle.showSideBadges && (
                                            <>
                                                <span className={`absolute left-1/2 top-1/2 -translate-y-[14%] -translate-x-[185%] ${evoStyle.sideBadgeClass} ${centerClassName} ${decorationStateClass}`} />
                                                <span className={`absolute left-1/2 top-1/2 -translate-y-[14%] translate-x-[85%] ${evoStyle.sideBadgeClass} ${centerClassName} ${decorationStateClass}`} />
                                            </>
                                        )}
                                        {evoStyle.showMountRing && (
                                            <span className={`absolute inset-[8px] rounded-full border ${evoStyle.mountRingClass}`} />
                                        )}
                                        <div className={`relative z-[6] ${evoStyle.haloClass}`}>
                                            <HoverRevealBadgeMedallion
                                                locked={!achieved}
                                                evo
                                                icon={icon}
                                                centerClassName={`${centerClassName} ${achieved ? medallionStateClass : ''}`}
                                                iconClassName={iconClassName}
                                                overlayText={String(node.level)}
                                                ringStyle={evoStyle.ringStyle || ringStyle}
                                                coreBorderColorClassName={coreBorderColorClassName}
                                                className={achieved ? medallionWrapStateClass : ''}
                                                size='sm'
                                                strokeWidth={2.4}
                                            />
                                        </div>
                                    </div>
                                    {isLocked && (
                                        <div className='absolute inset-0 rounded-xl bg-[linear-gradient(180deg,rgba(2,6,23,0.03),rgba(2,6,23,0.14))] pointer-events-none' />
                                    )}
                                    <div className={`absolute inset-x-1 bottom-1 px-1 py-0.5 rounded-md border text-[8px] font-black uppercase tracking-[0.12em] backdrop-blur-sm transition-colors ${evoStyle.statusPillClass}`}>
                                        {statusLabel}
                                    </div>
                                </div>
                                <div>
                                    <p className={`text-[10px] font-black uppercase tracking-[0.12em] ${achieved ? 'text-emerald-300' : next ? 'text-blue-300' : 'text-[var(--text-secondary)]'}`}>
                                        Nivel {node.level}
                                    </p>
                                    <p className='text-[10px] font-semibold text-[var(--text-secondary)]'>
                                        {thresholdText}
                                    </p>
                                    {next && (
                                        <p className='text-[10px] font-black text-blue-300 mt-1'>
                                            Faltan {Math.max(0, node.threshold - currentProgress)}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

function getEvolutionVisualTier(index: number, achieved: boolean, next: boolean, current: boolean) {
    const locked = !achieved && !next
    const frameClass = locked
        ? 'bg-black/10 border border-white/10'
        : current
            ? 'bg-blue-500/12 border border-blue-400/35'
            : achieved
                ? 'bg-emerald-500/10 border border-emerald-400/25'
                : 'bg-blue-500/10 border border-blue-400/25'
    const tierPalettes = [
        {
            tierLabel: 'I',
            accentLineClass: 'bg-gradient-to-r from-blue-300/0 via-blue-300/40 to-blue-300/0',
            plaqueClass: 'border-blue-300/15 bg-blue-500/5',
            cornerClass: 'border-blue-300/25',
            tierChipClass: 'border-blue-300/25 bg-blue-500/10 text-blue-200/90',
            haloClass: '',
            ringStyle: 'match' as const,
            showWings: false,
            showTail: false,
            showCrest: false,
            showWingLayer2: false,
            showTailCenter: false,
            showCrestProngs: false,
            showSideBadges: false,
            showMountRing: false,
            showWingBridges: false,
            showBackplate: false,
            showChassisRing: false,
            showCrestBridge: false
        },
        {
            tierLabel: 'II',
            accentLineClass: 'bg-gradient-to-r from-cyan-300/0 via-cyan-300/45 to-cyan-300/0',
            plaqueClass: 'border-cyan-300/18 bg-cyan-500/5',
            cornerClass: 'border-cyan-300/30',
            tierChipClass: 'border-cyan-300/25 bg-cyan-500/10 text-cyan-200/90',
            haloClass: '',
            ringStyle: 'bronze' as const,
            showWings: false,
            showTail: false,
            showCrest: false,
            showWingLayer2: false,
            showTailCenter: false,
            showCrestProngs: false,
            showSideBadges: false,
            showMountRing: false,
            showWingBridges: false,
            showBackplate: false,
            showChassisRing: false,
            showCrestBridge: false
        },
        {
            tierLabel: 'III',
            accentLineClass: 'bg-gradient-to-r from-violet-300/0 via-violet-300/45 to-violet-300/0',
            plaqueClass: 'border-violet-300/18 bg-violet-500/5',
            cornerClass: 'border-violet-300/30',
            tierChipClass: 'border-violet-300/25 bg-violet-500/10 text-violet-200/90',
            haloClass: '',
            ringStyle: 'silver' as const,
            showWings: false,
            showTail: false,
            showCrest: false,
            showWingLayer2: false,
            showTailCenter: false,
            showCrestProngs: false,
            showSideBadges: false,
            showMountRing: false,
            showWingBridges: false,
            showBackplate: false,
            showChassisRing: false,
            showCrestBridge: false
        },
        {
            tierLabel: 'IV',
            accentLineClass: 'bg-gradient-to-r from-rose-300/0 via-rose-300/45 to-rose-300/0',
            plaqueClass: 'border-rose-300/18 bg-rose-500/5',
            cornerClass: 'border-rose-300/30',
            tierChipClass: 'border-rose-300/25 bg-rose-500/10 text-rose-200/90',
            haloClass: '',
            ringStyle: 'gold' as const,
            showWings: false,
            showTail: false,
            showCrest: false,
            showWingLayer2: false,
            showTailCenter: false,
            showCrestProngs: false,
            showSideBadges: false,
            showMountRing: false,
            showWingBridges: false,
            showBackplate: false,
            showChassisRing: false,
            showCrestBridge: false
        }
    ] as const

    const palette = tierPalettes[Math.min(index, tierPalettes.length - 1)]

    return {
        ...palette,
        nodeFrameClass: frameClass,
        mountClass: 'min-h-[52px] min-w-[60px]',
        chassisRingClass: 'w-[54px] h-[54px] rounded-full border-2 border-white/60 shadow-none',
        backplateClass: index === 2
            ? 'w-[56px] h-[34px] border-2 border-white/60 shadow-none [clip-path:polygon(0_62%,10%_38%,18%_30%,28%_30%,38%_22%,50%_20%,62%_22%,72%_30%,82%_30%,90%_38%,100%_62%,86%_64%,78%_56%,68%_52%,32%_52%,22%_56%,14%_64%)]'
            : 'w-[58px] h-[38px] border-2 border-white/60 shadow-none [clip-path:polygon(0_66%,10%_42%,18%_34%,28%_34%,38%_25%,42%_10%,48%_22%,50%_8%,52%_22%,58%_10%,62%_25%,72%_34%,82%_34%,90%_42%,100%_66%,86%_66%,78%_56%,68%_52%,32%_52%,22%_56%,14%_66%)]',
        mountRingClass: locked
            ? 'border-white/8'
            : next
                ? 'border-blue-300/18'
                : achieved
                    ? 'border-emerald-300/14'
                    : 'border-white/10',
        wingShapeLeftClass: index <= 1
            ? 'w-[12px] h-[9px] rounded-l-[7px] rounded-r-[4px] border-2 border-white/60 shadow-none origin-right -rotate-[4deg]'
            : 'w-[15px] h-[10px] rounded-l-[8px] rounded-r-[4px] border-2 border-white/60 shadow-none origin-right -rotate-[6deg]',
        wingShapeRightClass: index <= 1
            ? 'w-[12px] h-[9px] rounded-r-[7px] rounded-l-[4px] border-2 border-white/60 shadow-none origin-left rotate-[4deg]'
            : 'w-[15px] h-[10px] rounded-r-[8px] rounded-l-[4px] border-2 border-white/60 shadow-none origin-left rotate-[6deg]',
        wingGlossLeftClass: '',
        wingGlossRightClass: '',
        wingBridgeLeftClass: index <= 1
            ? 'w-[6px] h-[8px] rounded-l-[5px] rounded-r-[2px] border-2 border-white/60 shadow-none'
            : 'w-[8px] h-[9px] rounded-l-[6px] rounded-r-[2px] border-2 border-white/60 shadow-none',
        wingBridgeRightClass: index <= 1
            ? 'w-[6px] h-[8px] rounded-r-[5px] rounded-l-[2px] border-2 border-white/60 shadow-none'
            : 'w-[8px] h-[9px] rounded-r-[6px] rounded-l-[2px] border-2 border-white/60 shadow-none',
        wingLayer2LeftClass: 'w-[14px] h-[11px] rounded-l-[9px] rounded-r-[6px] border-2 border-white/55 shadow-none origin-right -rotate-[34deg]',
        wingLayer2RightClass: 'w-[14px] h-[11px] rounded-r-[9px] rounded-l-[6px] border-2 border-white/55 shadow-none origin-left rotate-[34deg]',
        wingLayer2GlossLeftClass: '',
        wingLayer2GlossRightClass: '',
        tailShapeClass: 'w-3 h-4 rounded-b-[10px] rounded-t-sm border border-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] [clip-path:polygon(50%_100%,0_0,100%_0)]',
        tailCenterClass: 'w-[10px] h-[5px] rounded-b-[8px] rounded-t-sm border border-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] [clip-path:polygon(50%_100%,0_0,100%_0)]',
        crestBridgeClass: 'w-[10px] h-[4px] rounded-t-[4px] rounded-b-[1px] border-2 border-white/60 shadow-none',
        crestShapeClass: 'relative w-[16px] h-[7px] rounded-t-[4px] rounded-b-[2px] border-2 border-white/65 shadow-none [clip-path:polygon(0_100%,0_55%,18%_62%,32%_12%,50%_62%,68%_12%,82%_62%,100%_55%,100%_100%)]',
        crestProngClass: 'w-[4px] h-[4px] rounded-t-[3px] rounded-b-[1px] border-2 border-white/55 shadow-none [clip-path:polygon(50%_0,100%_100%,0_100%)]',
        sideBadgeClass: 'w-2.5 h-2.5 rounded-[6px] border border-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.24),0_2px_6px_rgba(0,0,0,0.16)] rotate-45',
        statusPillClass: achieved
            ? 'border-emerald-300/20 bg-emerald-500/10 text-emerald-200/90'
            : next
                ? 'border-blue-300/20 bg-blue-500/10 text-blue-200/90'
                : 'border-white/10 bg-black/25 text-white/65'
    }
}

function getSpecialBadgeEvolutionMilestones(badge: any): Array<{ level: number, threshold: number, caption: string }> {
    const type = String(badge?.badge_type || '')
    const currentLevel = Number(badge?.level || 0)

    if (type === 'quote_contribution') {
        return [
            { level: 1, threshold: 1, caption: '1 frase' },
            { level: 2, threshold: 5, caption: '5 frases' },
            { level: 3, threshold: 10, caption: '10 frases' },
            { level: 4, threshold: 25, caption: '25 frases' }
        ]
    }
    if (type === 'quote_likes_received') {
        return [
            { level: 1, threshold: 10, caption: '10 likes' },
            { level: 2, threshold: 25, caption: '25 likes' },
            { level: 3, threshold: 50, caption: '50 likes' }
        ]
    }
    if (type === 'closure_milestone') {
        return [
            { level: 1, threshold: 10, caption: '10 cierres' },
            { level: 2, threshold: 20, caption: '20 cierres' },
            { level: 3, threshold: 50, caption: '50 cierres' }
        ]
    }
    if (type === 'prelead_registered') {
        return [
            { level: 1, threshold: 1, caption: '1 pre-lead' },
            { level: 2, threshold: 25, caption: '25 pre-leads' },
            { level: 3, threshold: 100, caption: '100 pre-leads' },
            { level: 4, threshold: 300, caption: '300 pre-leads' }
        ]
    }
    if (type === 'lead_registered') {
        return [
            { level: 1, threshold: 1, caption: '1 lead' },
            { level: 2, threshold: 5, caption: '5 leads' },
            { level: 3, threshold: 15, caption: '15 leads' },
            { level: 4, threshold: 50, caption: '50 leads' }
        ]
    }
    if (type === 'meeting_completed') {
        return [
            { level: 1, threshold: 1, caption: '1 junta' },
            { level: 2, threshold: 10, caption: '10 juntas' },
            { level: 3, threshold: 25, caption: '25 juntas' },
            { level: 4, threshold: 50, caption: '50 juntas' }
        ]
    }
    if (type === 'seniority_years') {
        const anchor = Math.max(1, currentLevel || 1)
        return [0, 1, 2, 3].map((offset) => {
            const year = anchor + offset
            return {
                level: year,
                threshold: year,
                caption: `${year} año${year === 1 ? '' : 's'}`
            }
        })
    }
    return []
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
    const shared = getSpecialBadgeVisualSpec(badgeType, safeLabel, null)
    if (shared) {
        return {
            title: shared.title,
            icon: shared.icon,
            containerClass: `${metallicContainer} ${shared.centerGradientClass}`,
            iconClass: shared.iconClassName,
            coreBorderColorClassName: shared.coreBorderColorClassName
        }
    }

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
            containerClass: `${metallicContainer} bg-gradient-to-br from-[#4b5563] to-[#111827]`,
            iconClass: solidIconClass
        }
    }
    if (badgeType === 'prelead_registered') {
        return {
            title: 'Pre-Leads',
            icon: Target,
            containerClass: `${metallicContainer} bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9]`,
            iconClass: solidIconClass
        }
    }
    if (badgeType === 'lead_registered') {
        return {
            title: 'Leads',
            icon: Users,
            containerClass: `${metallicContainer} bg-gradient-to-br from-[#3b82f6] to-[#1d4ed8]`,
            iconClass: solidIconClass
        }
    }
    if (badgeType === 'meeting_completed') {
        return {
            title: 'Juntas',
            icon: Calendar,
            containerClass: `${metallicContainer} bg-gradient-to-br from-[#7c3aed] to-[#4c1d95]`,
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
            title: 'Mensualidad',
            icon: Gem,
            containerClass: labelLower.includes('10k+')
                ? `${metallicContainer} bg-gradient-to-br from-[#7c3aed] to-[#5b21b6]`
                : labelLower.includes('5k-10k')
                    ? `${metallicContainer} bg-gradient-to-br from-[#0ea5e9] to-[#0369a1]`
                    : labelLower.includes('2k-5k')
                        ? `${metallicContainer} bg-gradient-to-br from-[#10b981] to-[#047857]`
                        : `${metallicContainer} bg-gradient-to-br from-[#f59e0b] to-[#b45309]`,
            iconClass: solidIconClass
        }
    }
    if (badgeType === 'quote_contribution') {
        return {
            title: 'Aportación de Frases',
            icon: MessageSquareQuote,
            containerClass: `${metallicContainer} bg-gradient-to-br from-[#2563eb] to-[#1d4ed8]`,
            iconClass: solidIconClass
        }
    }
    if (badgeType === 'quote_likes_received') {
        return {
            title: 'Frases con Likes',
            icon: ThumbsUp,
            containerClass: `${metallicContainer} bg-gradient-to-br from-[#0ea5e9] to-[#0369a1]`,
            iconClass: solidIconClass
        }
    }

    if (badgeType === 'admin_granted') {
        const adminGradient = labelLower.includes('jesus gracia')
            ? 'from-[#a855f7] to-[#6d28d9]'
            : labelLower.includes('rafael sedas')
                ? 'from-[#ef4444] to-[#991b1b]'
                : labelLower.includes('alberto castro')
                    ? 'from-[#3b82f6] to-[#1e3a8a]'
                    : labelLower.includes('eduardo castro')
                        ? 'from-[#22c55e] to-[#166534]'
                        : 'from-[#22c55e] to-[#15803d]'
        return {
            title: 'Distinción Admin',
            icon: Medal,
            containerClass: `${metallicContainer} bg-gradient-to-br ${adminGradient}`,
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
    if (badgeType === 'prelead_registered') return 1
    if (badgeType === 'lead_registered') return 1
    if (badgeType === 'meeting_completed') return 1
    if (badgeType === 'closing_streak') return 5
    if (badgeType === 'deal_value_tier') return 1
    if (badgeType === 'race_first_place') return 1
    if (badgeType === 'race_second_place') return 1
    if (badgeType === 'race_third_place') return 1
    if (badgeType === 'race_all_positions') return 3
    if (badgeType === 'race_total_trophies') return 10
    if (badgeType === 'race_points_leader') return 1
    if (badgeType === 'quote_contribution') return 1
    if (badgeType === 'quote_likes_received') return 10
    if (badgeType === 'admin_granted') return 1
    if (badgeType === 'badge_leader') return 1
    return 1
}

function buildSpecialBadgeCatalog(
    specialBadges: any[],
    options?: {
        isBadgeLeader?: boolean
        leaderBadgeCount?: number
        industryBadgeCount?: number
        sellerStats?: {
            totalClosures?: number
            reliabilityScore?: number
            seniorityYears?: number
            totalPreLeads?: number
            totalLeads?: number
            completedMeetings?: number
        }
    }
) {
    const isBadgeLeader = Boolean(options?.isBadgeLeader)
    const leaderBadgeCount = Number(options?.leaderBadgeCount || 0)
    const industryBadgeCount = Math.max(0, Number(options?.industryBadgeCount || 0))
    const seniorityYears = Math.max(0, Number(options?.sellerStats?.seniorityYears || 0))
    const totalClosures = Math.max(0, Number(options?.sellerStats?.totalClosures || 0))
    const reliabilityScore = Math.max(0, Math.min(100, Number(options?.sellerStats?.reliabilityScore || 0)))
    const closureLevel = totalClosures >= 50 ? 3 : totalClosures >= 20 ? 2 : totalClosures >= 10 ? 1 : 0
    const closureNextThreshold = closureLevel === 0 ? 10 : closureLevel === 1 ? 20 : closureLevel === 2 ? 50 : null
    const reliabilityThreshold = 80
    const unlockedCompanySizeCount = Array.from(
        new Set(
            (specialBadges || [])
                .filter((badge: any) => String(badge?.badge_type || '') === 'company_size' && Number(badge?.level || 0) > 0)
                .map((badge: any) => String(badge?.badge_key || ''))
                .filter(Boolean)
        )
    ).length
    const allCompanySizesProgress = unlockedCompanySizeCount
    const allCompanySizesLevel = allCompanySizesProgress >= 5 ? 1 : 0
    const allCompanySizesNextThreshold = allCompanySizesLevel > 0 ? null : 5
    const multiIndustryProgress = industryBadgeCount
    const multiIndustryLevel = multiIndustryProgress >= 20 ? 4 : multiIndustryProgress >= 15 ? 3 : multiIndustryProgress >= 10 ? 2 : multiIndustryProgress >= 5 ? 1 : 0
    const multiIndustryNextThreshold = multiIndustryLevel === 0 ? 5 : multiIndustryLevel === 1 ? 10 : multiIndustryLevel === 2 ? 15 : multiIndustryLevel === 3 ? 20 : null
    const map = new Map<string, any>()
    const baseCatalog = [
        {
            id: 'virtual-all-sizes',
            badge_type: 'all_company_sizes',
            badge_key: 'all_sizes',
            badge_label: 'Todos los Tamaños',
            progress_count: allCompanySizesProgress,
            level: allCompanySizesLevel,
            next_level_threshold: allCompanySizesNextThreshold
        },
        {
            id: 'virtual-multi-industry',
            badge_type: 'multi_industry',
            badge_key: 'multi_industry',
            badge_label: 'Multi Industria',
            progress_count: multiIndustryProgress,
            level: multiIndustryLevel,
            next_level_threshold: multiIndustryNextThreshold
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
            id: 'virtual-prelead-registered',
            badge_type: 'prelead_registered',
            badge_key: 'prelead_registered',
            badge_label: 'Pre-Leads Registrados',
            progress_count: Math.max(0, Number(options?.sellerStats?.totalPreLeads || 0)),
            level: 0,
            next_level_threshold: 1
        },
        {
            id: 'virtual-lead-registered',
            badge_type: 'lead_registered',
            badge_key: 'lead_registered',
            badge_label: 'Leads Registrados',
            progress_count: Math.max(0, Number(options?.sellerStats?.totalLeads || 0)),
            level: 0,
            next_level_threshold: 1
        },
        {
            id: 'virtual-meeting-completed',
            badge_type: 'meeting_completed',
            badge_key: 'meeting_completed',
            badge_label: 'Juntas Completadas',
            progress_count: Math.max(0, Number(options?.sellerStats?.completedMeetings || 0)),
            level: 0,
            next_level_threshold: 1
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
            id: 'virtual-value-1k-2k',
            badge_type: 'deal_value_tier',
            badge_key: 'value_1k_2k',
            badge_label: 'Mensualidad 1,000-1,999 USD',
            progress_count: 0,
            level: 0,
            next_level_threshold: 1
        },
        {
            id: 'virtual-value-2k-5k',
            badge_type: 'deal_value_tier',
            badge_key: 'value_2k_5k',
            badge_label: 'Mensualidad 2,000-4,999 USD',
            progress_count: 0,
            level: 0,
            next_level_threshold: 1
        },
        {
            id: 'virtual-value-5k-10k',
            badge_type: 'deal_value_tier',
            badge_key: 'value_5k_10k',
            badge_label: 'Mensualidad 5,000-9,999 USD',
            progress_count: 0,
            level: 0,
            next_level_threshold: 1
        },
        {
            id: 'virtual-value-10k-100k',
            badge_type: 'deal_value_tier',
            badge_key: 'value_10k_100k',
            badge_label: 'Mensualidad 10,000-100,000 USD',
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
            id: 'virtual-quote-contribution',
            badge_type: 'quote_contribution',
            badge_key: 'quote_contribution',
            badge_label: 'Aportación de Frases',
            progress_count: 0,
            level: 0,
            next_level_threshold: 1
        },
        {
            id: 'virtual-quote-likes-received',
            badge_type: 'quote_likes_received',
            badge_key: 'quote_likes_received',
            badge_label: 'Frases con Likes',
            progress_count: 0,
            level: 0,
            next_level_threshold: 10
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
            if (type === 'quote_contribution') return 'quote_contribution'
            if (type === 'quote_likes_received') return 'quote_likes_received'
            if (type === 'admin_granted') return badge?.badge_key || 'admin_granted'
            if (type === 'badge_leader') return 'badge_leader'
            return badge?.badge_key || 'key'
        })()
        const key = `${type}::${normalizedKey}`
        const prev = map.get(key)

        if (!prev) {
            map.set(key, { ...badge, badge_key: badge?.badge_key || normalizedKey })
            continue
        }

        const prevLevel = prev?.level || 0
        const nextLevel = badge?.level || 0
        if (nextLevel >= prevLevel) {
            map.set(key, {
                ...prev,
                ...badge,
                badge_key: badge?.badge_key || normalizedKey,
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
    if (type === 'prelead_registered') return 2
    if (type === 'lead_registered') return 3
    if (type === 'meeting_completed') return 4
    if (type === 'closing_streak') return 5
    if (type === 'closure_milestone') return 6
    if (type === 'deal_value_tier') return 7
    if (type === 'reliability_score') return 8
    if (type === 'all_company_sizes') return 9
    if (type === 'company_size') return 10
    if (type === 'location_city') return 11
    if (type === 'location_country') return 12
    if (type === 'multi_industry') return 13
    if (type === 'race_first_place') return 14
    if (type === 'race_second_place') return 15
    if (type === 'race_third_place') return 16
    if (type === 'race_all_positions') return 17
    if (type === 'race_total_trophies') return 18
    if (type === 'race_points_leader') return 19
    if (type === 'quote_contribution') return 20
    if (type === 'quote_likes_received') return 21
    if (type === 'admin_granted') return 22
    if (type === 'badge_leader') return 23
    return 99
}

function getSpecialBadgeCategoryMeta(type?: string) {
    if (type === 'company_size' || type === 'all_company_sizes' || type === 'multi_industry' || type === 'closure_milestone') {
        return { key: 'commercial', title: 'Comercial y Cobertura', order: 1 }
    }
    if (type === 'prelead_registered' || type === 'lead_registered' || type === 'meeting_completed') {
        return { key: 'activity', title: 'Actividad Comercial', order: 2 }
    }
    if (type === 'closing_streak') {
        return { key: 'consistency', title: 'Consistencia', order: 3 }
    }
    if (type === 'deal_value_tier') {
        return { key: 'deal_value', title: 'Mensualidad (Valor Real)', order: 4 }
    }
    if (type === 'location_city' || type === 'location_country') {
        return { key: 'territory', title: 'Territorio', order: 5 }
    }
    if (type === 'seniority_years') {
        return { key: 'trajectory', title: 'Trayectoria', order: 6 }
    }
    if (type === 'reliability_score') {
        return { key: 'performance', title: 'Rendimiento', order: 7 }
    }
    if (type === 'race_first_place' || type === 'race_second_place' || type === 'race_third_place' || type === 'race_all_positions' || type === 'race_total_trophies' || type === 'race_points_leader') {
        return { key: 'competition', title: 'Competencia', order: 8 }
    }
    if (type === 'quote_contribution' || type === 'quote_likes_received') {
        return { key: 'quotes', title: 'Frases', order: 9 }
    }
    if (type === 'admin_granted' || type === 'badge_leader') {
        return { key: 'distinctions', title: 'Distinciones', order: 10 }
    }
    return { key: 'others', title: 'Especiales Adicionales', order: 11 }
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
    if (badge?.badge_type === 'deal_value_tier') {
        const key = String(badge?.badge_key || '')
        if (key === 'value_1k_2k') return '1k'
        if (key === 'value_2k_5k') return '2k'
        if (key === 'value_5k_10k') return '5k'
        if (key === 'value_10k_100k' || key === 'value_10k_plus') return '10k'
        return null
    }
    return null
}

function getSpecialBadgeRingStyleByType(type?: string, label?: string | null, key?: string | null): 'match' | 'gold' | 'bronze' | 'silver' | 'royal' | 'royal_dark' | 'royal_dark_vivid' | 'royal_gold' | 'royal_purple' {
    return getSpecialBadgeVisualSpec(type, label || null, key || null)?.ringStyle || 'match'
}
