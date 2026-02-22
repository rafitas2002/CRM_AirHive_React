'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { Sparkles, Trophy, Award, Shield, Flame, Gem, Calendar, Building2, Flag, Layers, Ruler, MessageSquareQuote, ThumbsUp } from 'lucide-react'
import { buildIndustryBadgeVisualMap, getIndustryBadgeVisualFromMap } from '@/lib/industryBadgeVisuals'

type SpecialBadgeEventRow = {
    id: string
    badge_type: string
    badge_key: string | null
    badge_label: string | null
    level: number
    event_type: 'unlocked' | 'upgraded' | string
    progress_count: number | null
    created_at?: string | null
}

type IndustryRow = {
    id: string
    name: string
    is_active?: boolean
}

type CelebrationEvent = {
    id: string // prefixed to avoid collisions between tables
    sourceType: 'industry' | 'special'
    industria_id?: string
    industryName?: string
    badgeType?: string
    badgeLabel: string
    level: number
    eventType: 'unlocked' | 'upgraded'
    progressCount: number
    badgeKey?: string
}

export default function GlobalBadgeCelebration() {
    const auth = useAuth()
    const userId = auth.user?.id || null
    const [supabase] = useState(() => createClient())
    const [industryCatalog, setIndustryCatalog] = useState<Array<{ id: string, name: string, is_active?: boolean }>>([])
    const [queue, setQueue] = useState<CelebrationEvent[]>([])
    const [isExiting, setIsExiting] = useState(false)
    const shownIds = useRef<Set<string>>(new Set())
    const recentLiveSpecialByBadge = useRef<Map<string, number>>(new Map())
    const industryCatalogRef = useRef<Array<{ id: string, name: string, is_active?: boolean }>>([])

    const current = queue[0] || null
    const seenStorageKey = userId ? `airhive_seen_badge_events_${userId}` : ''
    const badgeLevelSnapshotKey = userId ? `airhive_badge_level_snapshot_${userId}` : ''

    const readSeenEventIds = () => {
        if (typeof window === 'undefined' || !seenStorageKey) return new Set<string>()
        try {
            const raw = localStorage.getItem(seenStorageKey)
            const parsed = raw ? JSON.parse(raw) : []
            if (!Array.isArray(parsed)) return new Set<string>()
            return new Set(parsed.map((x) => String(x)))
        } catch {
            return new Set<string>()
        }
    }

    const persistSeenEventIds = (ids: Set<string>) => {
        if (typeof window === 'undefined' || !seenStorageKey) return
        try {
            localStorage.setItem(seenStorageKey, JSON.stringify(Array.from(ids).slice(-200)))
        } catch {
            // no-op for storage failures
        }
    }

    const readBadgeLevelSnapshot = () => {
        if (typeof window === 'undefined' || !badgeLevelSnapshotKey) return {} as Record<string, { level: number, unlockedAt: string }>
        try {
            const raw = localStorage.getItem(badgeLevelSnapshotKey)
            const parsed = raw ? JSON.parse(raw) : {}
            if (!parsed || typeof parsed !== 'object') return {}
            return parsed as Record<string, { level: number, unlockedAt: string }>
        } catch {
            return {}
        }
    }

    const persistBadgeLevelSnapshot = (snapshot: Record<string, { level: number, unlockedAt: string }>) => {
        if (typeof window === 'undefined' || !badgeLevelSnapshotKey) return
        try {
            localStorage.setItem(badgeLevelSnapshotKey, JSON.stringify(snapshot))
        } catch {
            // no-op
        }
    }

    const visualMap = useMemo(() => {
        const extras = (current?.sourceType === 'industry' && current.industria_id && current.industryName)
            ? [{ id: current.industria_id, name: current.industryName }]
            : []
        return buildIndustryBadgeVisualMap([...industryCatalog, ...extras])
    }, [industryCatalog, current])

    useEffect(() => {
        industryCatalogRef.current = industryCatalog
    }, [industryCatalog])

    useEffect(() => {
        if (!userId) return

        const loadIndustries = async () => {
            const { data } = await supabase
                .from('industrias')
                .select('id, name, is_active')
                .order('name', { ascending: true })

            setIndustryCatalog((data || []) as IndustryRow[])
        }

        loadIndustries()
    }, [userId, supabase])

    useEffect(() => {
        if (!userId) return
        const currentUserId = userId
        const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

        const enqueueIndustryEvent = async (eventId: string) => {
            const scopedId = `industry:${eventId}`
            if (!eventId || shownIds.current.has(scopedId)) return

            let data: any = null
            let error: any = null
            for (let attempt = 0; attempt < 5; attempt++) {
                const res = await (supabase
                    .from('seller_badge_events')
                    .select('id, industria_id, level, event_type, closures_count, industrias(name)')
                    .eq('id', eventId)
                    .maybeSingle() as any)
                data = res?.data
                error = res?.error
                if (!error && data?.id && data?.industria_id && data?.level) break
                await wait(220)
            }

            if (error || !data?.id || !data?.industria_id || !data?.level) return

            shownIds.current.add(scopedId)
            const seen = readSeenEventIds()
            seen.add(scopedId)
            persistSeenEventIds(seen)

            const industryName = (data as { industrias?: { name?: string } | null })?.industrias?.name || 'Industria'
            const safeEventType = (data.event_type === 'upgraded' ? 'upgraded' : 'unlocked') as 'upgraded' | 'unlocked'

            setQueue((prev) => [
                ...prev,
                {
                    id: scopedId,
                    sourceType: 'industry',
                    industria_id: data.industria_id,
                    industryName,
                    badgeLabel: industryName,
                    level: data.level,
                    eventType: safeEventType,
                    progressCount: data.closures_count || 0
                }
            ])
        }

        const enqueueSpecialEvent = async (eventId: string) => {
            const scopedId = `special:${eventId}`
            if (!eventId || shownIds.current.has(scopedId)) return

            let data: any = null
            let error: any = null
            for (let attempt = 0; attempt < 5; attempt++) {
                const res = await ((supabase as any)
                    .from('seller_special_badge_events')
                    .select('id, badge_type, badge_key, badge_label, level, event_type, progress_count')
                    .eq('id', eventId)
                    .maybeSingle())
                data = res?.data
                error = res?.error
                if (!error && data?.id && data?.badge_type && data?.level) break
                await wait(220)
            }

            if (error || !data?.id || !data?.badge_type || !data?.level) return

            shownIds.current.add(scopedId)
            const seen = readSeenEventIds()
            seen.add(scopedId)
            persistSeenEventIds(seen)

            const safeEventType = (data.event_type === 'upgraded' ? 'upgraded' : 'unlocked') as 'upgraded' | 'unlocked'
            const specialData = data as SpecialBadgeEventRow

            setQueue((prev) => [
                ...prev,
                {
                    id: scopedId,
                    sourceType: 'special',
                    badgeType: specialData.badge_type,
                    badgeKey: specialData.badge_key || undefined,
                    badgeLabel: specialData.badge_label || 'Badge especial',
                    level: specialData.level,
                    eventType: safeEventType,
                    progressCount: specialData.progress_count || 0
                }
            ])
        }

        const hydrateRecentSpecialEvents = async () => {
            const seen = readSeenEventIds()
            const { data, error } = await ((supabase as any)
                .from('seller_special_badge_events')
                .select('id, badge_type, badge_key, badge_label, level, event_type, progress_count, created_at')
                .eq('seller_id', currentUserId)
                .order('created_at', { ascending: false })
                .limit(8))

            if (error || !Array.isArray(data)) return

            const fresh = (data as SpecialBadgeEventRow[])
                .filter((row) => !!row?.id && !seen.has(`special:${String(row.id)}`))
                .sort((a, b) => new Date(String(a.created_at || 0)).getTime() - new Date(String(b.created_at || 0)).getTime())

            if (fresh.length === 0) return

            const scoped = new Set(seen)
            const hydrated: CelebrationEvent[] = []
            for (const row of fresh) {
                const scopedId = `special:${row.id}`
                if (shownIds.current.has(scopedId)) continue
                shownIds.current.add(scopedId)
                scoped.add(scopedId)
                hydrated.push({
                    id: scopedId,
                    sourceType: 'special',
                    badgeType: row.badge_type,
                    badgeKey: row.badge_key || undefined,
                    badgeLabel: row.badge_label || 'Badge especial',
                    level: row.level,
                    eventType: (row.event_type === 'upgraded' ? 'upgraded' : 'unlocked'),
                    progressCount: row.progress_count || 0
                })
            }

            if (hydrated.length > 0) {
                setQueue((prev) => [...prev, ...hydrated.slice(0, 4)])
                persistSeenEventIds(scoped)
            }
        }

        const hydrateRecentIndustryEvents = async () => {
            const seen = readSeenEventIds()
            const { data, error } = await ((supabase as any)
                .from('seller_badge_events')
                .select('id, industria_id, level, event_type, closures_count, created_at, industrias(name)')
                .eq('seller_id', currentUserId)
                .order('created_at', { ascending: false })
                .limit(8))

            if (error || !Array.isArray(data)) return

            const fresh = (data as Array<any>)
                .filter((row) => !!row?.id && !seen.has(`industry:${String(row.id)}`))
                .sort((a, b) => new Date(String(a.created_at || 0)).getTime() - new Date(String(b.created_at || 0)).getTime())

            if (fresh.length === 0) return

            const scoped = new Set(seen)
            const hydrated: CelebrationEvent[] = []
            for (const row of fresh) {
                const scopedId = `industry:${row.id}`
                if (shownIds.current.has(scopedId)) continue
                shownIds.current.add(scopedId)
                scoped.add(scopedId)
                hydrated.push({
                    id: scopedId,
                    sourceType: 'industry',
                    industria_id: String(row.industria_id || ''),
                    industryName: String(row?.industrias?.name || 'Industria'),
                    badgeLabel: String(row?.industrias?.name || 'Industria'),
                    level: Number(row.level || 0),
                    eventType: (row.event_type === 'upgraded' ? 'upgraded' : 'unlocked'),
                    progressCount: Number(row.closures_count || 0)
                })
            }

            if (hydrated.length > 0) {
                setQueue((prev) => [...prev, ...hydrated.slice(0, 4)])
                persistSeenEventIds(scoped)
            }
        }

        const hydrateBadgeLevelDeltaFallback = async () => {
            const [industryRes, specialRes] = await Promise.all([
                ((supabase as any)
                    .from('seller_industry_badges')
                    .select('industria_id, level, closures_count, unlocked_at, industrias(name)')
                    .eq('seller_id', currentUserId)
                    .gt('level', 0)),
                ((supabase as any)
                    .from('seller_special_badges')
                    .select('badge_type, badge_key, badge_label, level, progress_count, unlocked_at')
                    .eq('seller_id', currentUserId)
                    .gt('level', 0))
            ])

            const industries = Array.isArray(industryRes?.data) ? industryRes.data : []
            const specials = Array.isArray(specialRes?.data) ? specialRes.data : []
            const previous = readBadgeLevelSnapshot()
            const isFirstSnapshot = Object.keys(previous).length === 0
            const nowMs = Date.now()
            const nextSnapshot: Record<string, { level: number, unlockedAt: string }> = {}
            const derivedEvents: CelebrationEvent[] = []

            for (const row of industries) {
                const industriaId = String(row?.industria_id || '')
                if (!industriaId) continue
                const level = Number(row?.level || 0)
                if (level <= 0) continue
                const key = `lvl:industry:${industriaId}`
                const unlockedAt = String(row?.unlocked_at || '')
                const unlockedAtMs = unlockedAt ? new Date(unlockedAt).getTime() : 0
                const prevLevel = Number(previous[key]?.level || 0)
                const prevUnlockedAt = String(previous[key]?.unlockedAt || '')
                nextSnapshot[key] = { level, unlockedAt }
                const levelIncreased = level > prevLevel
                const unlockedAtChanged = level > 0 && unlockedAt && prevUnlockedAt && unlockedAt !== prevUnlockedAt
                const recentUnlockOnFirstSnapshot = isFirstSnapshot && level > 0 && unlockedAtMs > 0 && (nowMs - unlockedAtMs) <= 120000
                if (levelIncreased || unlockedAtChanged || recentUnlockOnFirstSnapshot) {
                    const scopedId = `derived-industry:${industriaId}:L${level}`
                    derivedEvents.push({
                        id: scopedId,
                        sourceType: 'industry',
                        industria_id: industriaId,
                        industryName: String(row?.industrias?.name || 'Industria'),
                        badgeLabel: String(row?.industrias?.name || 'Industria'),
                        level,
                        eventType: prevLevel === 0 ? 'unlocked' : 'upgraded',
                        progressCount: Number(row?.closures_count || 0)
                    })
                }
            }

            for (const row of specials) {
                const badgeType = String(row?.badge_type || '')
                const badgeKey = String(row?.badge_key || '')
                if (!badgeType || !badgeKey) continue
                const level = Number(row?.level || 0)
                if (level <= 0) continue
                const key = `lvl:special:${badgeType}:${badgeKey}`
                const unlockedAt = String(row?.unlocked_at || '')
                const unlockedAtMs = unlockedAt ? new Date(unlockedAt).getTime() : 0
                const prevLevel = Number(previous[key]?.level || 0)
                const prevUnlockedAt = String(previous[key]?.unlockedAt || '')
                nextSnapshot[key] = { level, unlockedAt }
                const levelIncreased = level > prevLevel
                const unlockedAtChanged = level > 0 && unlockedAt && prevUnlockedAt && unlockedAt !== prevUnlockedAt
                const recentUnlockOnFirstSnapshot = isFirstSnapshot && level > 0 && unlockedAtMs > 0 && (nowMs - unlockedAtMs) <= 120000
                if (levelIncreased || unlockedAtChanged || recentUnlockOnFirstSnapshot) {
                    const scopedId = `derived-special:${badgeType}:${badgeKey}:L${level}`
                    derivedEvents.push({
                        id: scopedId,
                        sourceType: 'special',
                        badgeType,
                        badgeKey,
                        badgeLabel: String(row?.badge_label || 'Badge especial'),
                        level,
                        eventType: prevLevel === 0 ? 'unlocked' : 'upgraded',
                        progressCount: Number(row?.progress_count || 0)
                    })
                }
            }

            persistBadgeLevelSnapshot(nextSnapshot)
            if (derivedEvents.length === 0) return
            setQueue((prev) => [...prev, ...derivedEvents.slice(0, 4)])
        }

        const hydrateAllRecentEvents = async () => {
            await hydrateRecentIndustryEvents()
            await hydrateRecentSpecialEvents()
            await hydrateBadgeLevelDeltaFallback()
        }

        hydrateAllRecentEvents()

        const channel = supabase
            .channel(`badge-celebration-${currentUserId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'seller_badge_events',
                    filter: `seller_id=eq.${currentUserId}`
                },
                (payload: { new: { id: string, industria_id?: string, level?: number, event_type?: string, closures_count?: number } }) => {
                    const row = payload?.new
                    const eventId = String(row?.id || '')
                    const scopedId = `industry:${eventId}`
                    if (!eventId || shownIds.current.has(scopedId)) return
                    shownIds.current.add(scopedId)
                    const seen = readSeenEventIds()
                    seen.add(scopedId)
                    persistSeenEventIds(seen)
                    const industryName = industryCatalogRef.current.find((i) => i.id === String(row?.industria_id || ''))?.name || 'Industria'
                    setQueue((prev) => [
                        ...prev,
                        {
                            id: scopedId,
                            sourceType: 'industry',
                            industria_id: String(row?.industria_id || ''),
                            industryName,
                            badgeLabel: industryName,
                            level: Number(row?.level || 1),
                            eventType: (row?.event_type === 'upgraded' ? 'upgraded' : 'unlocked'),
                            progressCount: Number(row?.closures_count || 0)
                        }
                    ])
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'seller_special_badge_events',
                    filter: `seller_id=eq.${currentUserId}`
                },
                (payload: { new: { id: string, badge_type?: string, badge_key?: string, badge_label?: string, level?: number, event_type?: string, progress_count?: number } }) => {
                    const row = payload?.new
                    const eventId = String(row?.id || '')
                    const scopedId = `special:${eventId}`
                    if (!eventId || shownIds.current.has(scopedId)) return

                    const badgeType = String(row?.badge_type || 'special')
                    const badgeKey = String(row?.badge_key || '')
                    const level = Number(row?.level || 1)
                    const liveSig = `${badgeType}:${badgeKey}:L${level}`
                    const liveSeenAt = recentLiveSpecialByBadge.current.get(liveSig) || 0
                    if (Date.now() - liveSeenAt < 4000) return

                    shownIds.current.add(scopedId)
                    const seen = readSeenEventIds()
                    seen.add(scopedId)
                    persistSeenEventIds(seen)
                    setQueue((prev) => [
                        ...prev,
                        {
                            id: scopedId,
                            sourceType: 'special',
                            badgeType,
                            badgeKey,
                            badgeLabel: String(row?.badge_label || 'Badge especial'),
                            level,
                            eventType: (row?.event_type === 'upgraded' ? 'upgraded' : 'unlocked'),
                            progressCount: Number(row?.progress_count || 0)
                        }
                    ])
                }
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'seller_industry_badges',
                    filter: `seller_id=eq.${currentUserId}`
                },
                () => {
                    void hydrateBadgeLevelDeltaFallback()
                }
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'seller_special_badges',
                    filter: `seller_id=eq.${currentUserId}`
                },
                (payload: { eventType?: string, new?: any, old?: any }) => {
                    const eventType = String(payload?.eventType || '').toUpperCase()
                    const nextRow = payload?.new || {}
                    const prevRow = payload?.old || {}

                    const nextLevel = Number(nextRow?.level || 0)
                    const prevLevel = Number(prevRow?.level || 0)
                    const badgeType = String(nextRow?.badge_type || prevRow?.badge_type || '')
                    const badgeKey = String(nextRow?.badge_key || prevRow?.badge_key || '')

                    if (badgeType && badgeKey && ((eventType === 'INSERT' && nextLevel > 0) || (eventType === 'UPDATE' && nextLevel > prevLevel && nextLevel > 0))) {
                        const scopedId = `special-live:${badgeType}:${badgeKey}:L${nextLevel}:U${String(nextRow?.updated_at || Date.now())}`
                        if (!shownIds.current.has(scopedId)) {
                            shownIds.current.add(scopedId)
                            recentLiveSpecialByBadge.current.set(`${badgeType}:${badgeKey}:L${nextLevel}`, Date.now())
                            setQueue((prev) => [
                                ...prev,
                                {
                                    id: scopedId,
                                    sourceType: 'special',
                                    badgeType,
                                    badgeKey,
                                    badgeLabel: String(nextRow?.badge_label || prevRow?.badge_label || 'Badge especial'),
                                    level: nextLevel,
                                    eventType: prevLevel > 0 ? 'upgraded' : 'unlocked',
                                    progressCount: Number(nextRow?.progress_count || 0)
                                }
                            ])
                        }
                    }
                    void hydrateBadgeLevelDeltaFallback()
                }
            )
            .subscribe()

        // Poll recent events too (not only level deltas) so popup still appears
        // when realtime delivery is delayed/missed but DB events exist.
        const interval = setInterval(() => {
            if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
            void hydrateRecentIndustryEvents()
            void hydrateRecentSpecialEvents()
            void hydrateBadgeLevelDeltaFallback()
        }, 15000)

        return () => {
            clearInterval(interval)
            supabase.removeChannel(channel)
        }
    }, [userId, supabase])

    const currentEventId = current?.id || 'none'
    const confettiPieces = useMemo(() => {
        const colors = ['#60a5fa', '#22d3ee', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#fb7185']
        return Array.from({ length: 72 }).map((_, index) => {
            const seed = (index + 3) * 37
            return {
                id: `${currentEventId}-${index}`,
                left: `${(seed * 17) % 100}%`,
                delay: `${(seed % 11) * 0.12}s`,
                duration: `${3.1 + ((seed % 7) * 0.35)}s`,
                size: `${6 + (seed % 7)}px`,
                color: colors[seed % colors.length],
                drift: `${-28 + (seed % 56)}px`,
                rotate: `${40 + (seed % 220)}deg`
            }
        })
    }, [currentEventId])

    if (!userId || !current) return null

    const industryVisual = current.sourceType === 'industry' && current.industria_id
        ? getIndustryBadgeVisualFromMap(current.industria_id, visualMap, current.industryName)
        : null
    const specialVisual = getSpecialVisual(current.badgeType, current.badgeLabel)
    const Icon = industryVisual?.icon || specialVisual.icon
    const containerClass = industryVisual?.containerClass || specialVisual.containerClass
    const iconClass = industryVisual?.iconClass || specialVisual.iconClass
    const isUnlocked = current.eventType === 'unlocked'
    const specialBadgeOverlay = getSpecialBadgeOverlayNumber(current.badgeType, current.badgeKey, current.badgeLabel)
    const closeCta = isUnlocked ? 'Recibir Reconocimiento' : 'Seguir Sumando'
    const closeAndContinue = () => {
        if (isExiting) return
        setIsExiting(true)
        window.setTimeout(() => {
            setQueue((prev) => prev.slice(1))
            setIsExiting(false)
        }, 380)
    }

    return (
        <div className='fixed inset-0 z-[10001] pointer-events-none flex items-center justify-center p-4 md:p-8'>
            <div className={`absolute inset-0 bg-black/40 backdrop-blur-[2px] ${isExiting ? 'ah-badge-overlay-exit' : 'ah-badge-overlay-enter'}`} />

            <div className={`relative w-[min(94vw,700px)] rounded-[30px] border shadow-2xl overflow-hidden bg-[var(--card-bg)] border-[var(--card-border)] pointer-events-auto ${isExiting ? 'ah-badge-popup-exit' : 'ah-badge-popup-enter'}`}>
                <div className='absolute inset-0 pointer-events-none overflow-hidden'>
                    <div className='ah-firework ah-firework-left' />
                    <div className='ah-firework ah-firework-right' />
                    <div className='ah-firework ah-firework-top' />
                    <div className='ah-firework ah-firework-bottom' />
                    <div className='ah-firework ah-firework-mid' />
                    {confettiPieces.map((piece) => (
                        <span
                            key={piece.id}
                            className='ah-confetti'
                            style={{
                                left: piece.left,
                                width: piece.size,
                                height: `calc(${piece.size} * 0.5)`,
                                background: piece.color,
                                animationDelay: piece.delay,
                                animationDuration: piece.duration,
                                ['--drift' as any]: piece.drift,
                                ['--spin' as any]: piece.rotate
                            }}
                        />
                    ))}
                </div>

                <div className='px-6 md:px-8 py-6 border-b flex items-start justify-between gap-4 bg-gradient-to-r from-[#2048FF] via-[#2e5bff] to-[#0f2a7a] border-white/10'>
                    <div>
                        <p className='text-[11px] font-black uppercase tracking-[0.2em] text-blue-100/90'>Badge desbloqueado</p>
                        <h4 className='text-white font-black text-2xl md:text-[32px] leading-tight mt-1'>
                            {isUnlocked ? 'Felicidades, lograste un nuevo badge' : 'Excelente, tu badge subió de nivel'}
                        </h4>
                        <p className='text-blue-100/90 mt-2 text-sm md:text-base font-semibold'>
                            Gran trabajo. Sigue así para mantener el momentum.
                        </p>
                    </div>
                </div>

                <div className='p-6 md:p-8'>
                    <div className='flex items-center gap-5 md:gap-6'>
                        <div className={`relative overflow-hidden w-24 h-24 md:w-28 md:h-28 rounded-2xl border flex items-center justify-center shadow-xl ${containerClass}`}>
                            <span className='absolute top-[3px] left-[12%] w-[76%] h-[1px] bg-white/80 rounded-full pointer-events-none' />
                            <Icon size={42} strokeWidth={2.5} className={iconClass} />
                            {specialBadgeOverlay && (
                                <span className='absolute bottom-[7px] left-1/2 -translate-x-1/2 text-[12px] leading-none font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]'>
                                    {specialBadgeOverlay}
                                </span>
                            )}
                        </div>
                        <div className='min-w-0'>
                            <p className='text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-secondary)]'>
                                {current.sourceType === 'industry' ? 'Industria' : 'Badge especial'}
                            </p>
                            <p className='text-xl md:text-2xl font-black leading-tight text-[var(--text-primary)] truncate'>
                                {current.sourceType === 'industry' ? current.industryName : current.badgeLabel}
                            </p>
                            <div className='mt-3 flex items-center gap-2.5 flex-wrap'>
                                <span className='inline-flex items-center gap-1.5 text-[12px] font-black px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-400/30'>
                                    <Trophy size={13} />
                                    Nivel {current.level}
                                </span>
                                <span className='inline-flex items-center gap-1.5 text-[12px] font-bold px-3 py-1.5 rounded-lg bg-[var(--hover-bg)] text-[var(--text-secondary)] border border-[var(--card-border)]'>
                                    {current.progressCount} {current.sourceType === 'industry' ? 'cierres' : 'progreso'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className='mt-5 flex items-center gap-2 text-sm md:text-[15px] font-semibold text-[var(--text-secondary)]'>
                        <Sparkles size={16} className='text-amber-400' />
                        Cada badge suma a tu reputación comercial dentro de AirHive.
                    </div>

                    <div className='mt-6 flex justify-end'>
                        <button
                            type='button'
                            onClick={closeAndContinue}
                            className='inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm md:text-base font-black tracking-wide transition-all cursor-pointer border border-emerald-300/40 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-[0_12px_28px_rgba(16,185,129,0.35)] hover:brightness-110 hover:-translate-y-0.5'
                        >
                            {closeCta}
                        </button>
                    </div>
                </div>
            </div>

            <style jsx>{`
                .ah-badge-popup-enter {
                    animation: ahBadgePopupIn 540ms cubic-bezier(0.22, 1, 0.36, 1) both;
                }

                .ah-badge-popup-exit {
                    animation: ahBadgePopupOut 380ms cubic-bezier(0.4, 0, 1, 1) both;
                }

                .ah-badge-overlay-enter {
                    animation: ahBadgeOverlayIn 320ms ease-out both;
                }

                .ah-badge-overlay-exit {
                    animation: ahBadgeOverlayOut 280ms ease-in both;
                }

                .ah-confetti {
                    position: absolute;
                    top: -14px;
                    border-radius: 999px;
                    opacity: 0;
                    filter: saturate(1.2);
                    animation-name: ahConfettiFall;
                    animation-timing-function: ease-in;
                    animation-iteration-count: 1;
                    animation-fill-mode: both;
                }

                .ah-firework {
                    position: absolute;
                    width: 220px;
                    height: 220px;
                    border-radius: 999px;
                    opacity: 0.4;
                    pointer-events: none;
                    animation: ahPulse 1.9s ease-out 3 both;
                }

                .ah-firework-left {
                    left: -30px;
                    top: -20px;
                    background: radial-gradient(circle, rgba(34,211,238,0.55) 0%, rgba(34,211,238,0.14) 36%, transparent 70%);
                }

                .ah-firework-right {
                    right: -40px;
                    top: 18px;
                    background: radial-gradient(circle, rgba(251,191,36,0.6) 0%, rgba(251,191,36,0.15) 36%, transparent 72%);
                    animation-delay: 0.35s;
                }

                .ah-firework-top {
                    left: 42%;
                    top: -72px;
                    background: radial-gradient(circle, rgba(59,130,246,0.58) 0%, rgba(34,211,238,0.16) 42%, transparent 72%);
                    animation-delay: 0.18s;
                }

                .ah-firework-bottom {
                    right: 24%;
                    bottom: -80px;
                    background: radial-gradient(circle, rgba(244,114,182,0.58) 0%, rgba(244,114,182,0.12) 42%, transparent 72%);
                    animation-delay: 0.52s;
                }

                .ah-firework-mid {
                    left: -80px;
                    bottom: 8%;
                    background: radial-gradient(circle, rgba(250,204,21,0.58) 0%, rgba(250,204,21,0.14) 42%, transparent 72%);
                    animation-delay: 0.72s;
                }

                @keyframes ahBadgePopupIn {
                    0% {
                        opacity: 0;
                        transform: translateY(26px) scale(0.94);
                        filter: blur(2px);
                    }
                    100% {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                        filter: blur(0);
                    }
                }

                @keyframes ahBadgePopupOut {
                    0% {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                        filter: blur(0);
                    }
                    100% {
                        opacity: 0;
                        transform: translateY(22px) scale(0.97);
                        filter: blur(1px);
                    }
                }

                @keyframes ahBadgeOverlayIn {
                    0% { opacity: 0; }
                    100% { opacity: 1; }
                }

                @keyframes ahBadgeOverlayOut {
                    0% { opacity: 1; }
                    100% { opacity: 0; }
                }

                @keyframes ahConfettiFall {
                    0% {
                        transform: translate3d(0, -8px, 0) rotate(0deg);
                        opacity: 0;
                    }
                    8% {
                        opacity: 1;
                    }
                    100% {
                        transform: translate3d(var(--drift), 420px, 0) rotate(var(--spin));
                        opacity: 0;
                    }
                }

                @keyframes ahPulse {
                    0%, 100% {
                        transform: scale(0.82);
                        opacity: 0.2;
                    }
                    50% {
                        transform: scale(1.14);
                        opacity: 0.58;
                    }
                }
            `}</style>
        </div>
    )
}

function getSpecialVisual(badgeType?: string, badgeLabel?: string) {
    const label = String(badgeLabel || '').toLowerCase()
    const metallic = 'border-white/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),inset_0_-1px_0_rgba(0,0,0,0.15),0_6px_14px_rgba(15,23,42,0.22)]'
    const iconClass = 'text-white'

    if (badgeType === 'closing_streak') {
        const paused = label.includes('pausad')
        return {
            icon: Flame,
            containerClass: paused
                ? `${metallic} bg-gradient-to-br from-[#6b7280] to-[#374151]`
                : `${metallic} bg-gradient-to-br from-[#f97316] to-[#b45309]`,
            iconClass
        }
    }
    if (badgeType === 'deal_value_tier') {
        return {
            icon: Gem,
            containerClass: label.includes('1m')
                ? `${metallic} bg-gradient-to-br from-[#7c3aed] to-[#5b21b6]`
                : label.includes('500')
                    ? `${metallic} bg-gradient-to-br from-[#0ea5e9] to-[#0369a1]`
                    : `${metallic} bg-gradient-to-br from-[#10b981] to-[#047857]`,
            iconClass
        }
    }
    if (badgeType === 'race_points_leader') {
        return {
            icon: Award,
            containerClass: label.includes('hist')
                ? `${metallic} bg-gradient-to-br from-[#6b7280] to-[#374151]`
                : `${metallic} bg-gradient-to-br from-[#f59e0b] to-[#b45309]`,
            iconClass
        }
    }
    if (badgeType === 'quote_contribution') {
        return {
            icon: MessageSquareQuote,
            containerClass: `${metallic} bg-gradient-to-br from-[#2563eb] to-[#1d4ed8]`,
            iconClass
        }
    }
    if (badgeType === 'quote_likes_received') {
        return {
            icon: ThumbsUp,
            containerClass: `${metallic} bg-gradient-to-br from-[#0ea5e9] to-[#0369a1]`,
            iconClass
        }
    }
    if (badgeType === 'reliability_score') {
        return { icon: Shield, containerClass: `${metallic} bg-gradient-to-br from-[#0ea5e9] to-[#0369a1]`, iconClass }
    }
    if (badgeType === 'seniority_years') {
        return { icon: Calendar, containerClass: `${metallic} bg-gradient-to-br from-[#2563eb] to-[#1e3a8a]`, iconClass }
    }
    if (badgeType === 'closure_milestone') {
        return { icon: Building2, containerClass: `${metallic} bg-gradient-to-br from-[#f97316] to-[#c2410c]`, iconClass }
    }
    if (badgeType === 'company_size') {
        return { icon: Building2, containerClass: `${metallic} bg-gradient-to-br from-[#3b82f6] to-[#1d4ed8]`, iconClass }
    }
    if (badgeType === 'location_city') {
        return { icon: Flag, containerClass: `${metallic} bg-gradient-to-br from-[#f97316] to-[#c2410c]`, iconClass }
    }
    if (badgeType === 'all_company_sizes') {
        return { icon: Ruler, containerClass: `${metallic} bg-gradient-to-br from-[#f59e0b] to-[#b45309]`, iconClass }
    }
    return {
        icon: Layers,
        containerClass: `${metallic} bg-gradient-to-br from-[#d946ef] to-[#a21caf]`,
        iconClass
    }
}

function getSpecialBadgeOverlayNumber(badgeType?: string, badgeKey?: string, badgeLabel?: string) {
    if (badgeType !== 'company_size') return null
    const fromKey = String(badgeKey || '').match(/size_(\d+)/)?.[1]
    if (fromKey) return fromKey
    const fromLabel = String(badgeLabel || '').match(/(\d+)/)?.[1]
    return fromLabel || null
}
