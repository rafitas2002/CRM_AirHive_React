'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { getMyBadgeCelebrationFeed } from '@/app/actions/badgeCelebrations'
import { X, Sparkles, Trophy, Award, Shield, Flame, Gem, Calendar, Building2, Flag, Layers, Ruler, MessageSquareQuote, ThumbsUp } from 'lucide-react'
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
}

export default function GlobalBadgeCelebration() {
    const auth = useAuth()
    const [supabase] = useState(() => createClient())
    const [industryCatalog, setIndustryCatalog] = useState<Array<{ id: string, name: string, is_active?: boolean }>>([])
    const [queue, setQueue] = useState<CelebrationEvent[]>([])
    const shownIds = useRef<Set<string>>(new Set())

    const current = queue[0] || null
    const seenStorageKey = auth.user ? `airhive_seen_badge_events_${auth.user.id}` : ''
    const badgeLevelSnapshotKey = auth.user ? `airhive_badge_level_snapshot_${auth.user.id}` : ''

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
        if (typeof window === 'undefined' || !badgeLevelSnapshotKey) return {} as Record<string, number>
        try {
            const raw = localStorage.getItem(badgeLevelSnapshotKey)
            const parsed = raw ? JSON.parse(raw) : {}
            if (!parsed || typeof parsed !== 'object') return {}
            return parsed as Record<string, number>
        } catch {
            return {}
        }
    }

    const persistBadgeLevelSnapshot = (snapshot: Record<string, number>) => {
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
        if (!auth.user) return

        const loadIndustries = async () => {
            const { data } = await supabase
                .from('industrias')
                .select('id, name, is_active')
                .order('name', { ascending: true })

            setIndustryCatalog((data || []) as IndustryRow[])
        }

        loadIndustries()
    }, [auth.user, supabase])

    useEffect(() => {
        if (!auth.user) return
        const currentUserId = auth.user.id
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
                    .select('id, badge_type, badge_label, level, event_type, progress_count')
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
                    .select('industria_id, level, closures_count, industrias(name)')
                    .eq('seller_id', currentUserId)
                    .gt('level', 0)),
                ((supabase as any)
                    .from('seller_special_badges')
                    .select('badge_type, badge_key, badge_label, level, progress_count')
                    .eq('seller_id', currentUserId)
                    .gt('level', 0))
            ])

            const industries = Array.isArray(industryRes?.data) ? industryRes.data : []
            const specials = Array.isArray(specialRes?.data) ? specialRes.data : []
            const previous = readBadgeLevelSnapshot()
            const nextSnapshot: Record<string, number> = {}
            const derivedEvents: CelebrationEvent[] = []

            for (const row of industries) {
                const industriaId = String(row?.industria_id || '')
                if (!industriaId) continue
                const level = Number(row?.level || 0)
                if (level <= 0) continue
                const key = `lvl:industry:${industriaId}`
                const prev = Number(previous[key] || 0)
                nextSnapshot[key] = level
                if (level > prev) {
                    const scopedId = `derived-industry:${industriaId}:L${level}`
                    if (shownIds.current.has(scopedId)) continue
                    shownIds.current.add(scopedId)
                    derivedEvents.push({
                        id: scopedId,
                        sourceType: 'industry',
                        industria_id: industriaId,
                        industryName: String(row?.industrias?.name || 'Industria'),
                        badgeLabel: String(row?.industrias?.name || 'Industria'),
                        level,
                        eventType: prev === 0 ? 'unlocked' : 'upgraded',
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
                const prev = Number(previous[key] || 0)
                nextSnapshot[key] = level
                if (level > prev) {
                    const scopedId = `derived-special:${badgeType}:${badgeKey}:L${level}`
                    if (shownIds.current.has(scopedId)) continue
                    shownIds.current.add(scopedId)
                    derivedEvents.push({
                        id: scopedId,
                        sourceType: 'special',
                        badgeType,
                        badgeLabel: String(row?.badge_label || 'Badge especial'),
                        level,
                        eventType: prev === 0 ? 'unlocked' : 'upgraded',
                        progressCount: Number(row?.progress_count || 0)
                    })
                }
            }

            // First run seeds snapshot only (no retroactive popups).
            const isFirstSnapshot = Object.keys(previous).length === 0
            persistBadgeLevelSnapshot(nextSnapshot)
            if (isFirstSnapshot || derivedEvents.length === 0) return
            setQueue((prev) => [...prev, ...derivedEvents.slice(0, 4)])
        }

        const hydrateFromServerFeed = async () => {
            const response = await getMyBadgeCelebrationFeed()
            if (!response?.success || !response?.data) return false

            const feed = response.data as {
                industryEvents: Array<any>
                specialEvents: Array<any>
                industryLevels: Array<any>
                specialLevels: Array<any>
            }

            const seen = readSeenEventIds()
            const scoped = new Set(seen)
            const hydratedEvents: CelebrationEvent[] = []

            const industryEvents = (Array.isArray(feed.industryEvents) ? feed.industryEvents : [])
                .filter((row) => !!row?.id)
                .sort((a, b) => new Date(String(a?.created_at || 0)).getTime() - new Date(String(b?.created_at || 0)).getTime())
            for (const row of industryEvents) {
                const scopedId = `industry:${String(row.id)}`
                if (shownIds.current.has(scopedId) || scoped.has(scopedId)) continue
                shownIds.current.add(scopedId)
                scoped.add(scopedId)
                hydratedEvents.push({
                    id: scopedId,
                    sourceType: 'industry',
                    industria_id: String(row?.industria_id || ''),
                    industryName: String(row?.industrias?.name || 'Industria'),
                    badgeLabel: String(row?.industrias?.name || 'Industria'),
                    level: Number(row?.level || 1),
                    eventType: (row?.event_type === 'upgraded' ? 'upgraded' : 'unlocked'),
                    progressCount: Number(row?.closures_count || 0)
                })
            }

            const specialEvents = (Array.isArray(feed.specialEvents) ? feed.specialEvents : [])
                .filter((row) => !!row?.id)
                .sort((a, b) => new Date(String(a?.created_at || 0)).getTime() - new Date(String(b?.created_at || 0)).getTime())
            for (const row of specialEvents) {
                const scopedId = `special:${String(row.id)}`
                if (shownIds.current.has(scopedId) || scoped.has(scopedId)) continue
                shownIds.current.add(scopedId)
                scoped.add(scopedId)
                hydratedEvents.push({
                    id: scopedId,
                    sourceType: 'special',
                    badgeType: String(row?.badge_type || 'special'),
                    badgeLabel: String(row?.badge_label || 'Badge especial'),
                    level: Number(row?.level || 1),
                    eventType: (row?.event_type === 'upgraded' ? 'upgraded' : 'unlocked'),
                    progressCount: Number(row?.progress_count || 0)
                })
            }

            if (hydratedEvents.length > 0) {
                setQueue((prev) => [...prev, ...hydratedEvents.slice(0, 4)])
                persistSeenEventIds(scoped)
            }

            // Secondary fallback: derive popup by level delta even if event rows are unavailable.
            const previous = readBadgeLevelSnapshot()
            const nextSnapshot: Record<string, number> = {}
            const derivedEvents: CelebrationEvent[] = []

            const industryLevels = Array.isArray(feed.industryLevels) ? feed.industryLevels : []
            for (const row of industryLevels) {
                const industriaId = String(row?.industria_id || '')
                if (!industriaId) continue
                const level = Number(row?.level || 0)
                if (level <= 0) continue
                const key = `lvl:industry:${industriaId}`
                const prev = Number(previous[key] || 0)
                nextSnapshot[key] = level
                if (level > prev) {
                    const scopedId = `derived-industry:${industriaId}:L${level}`
                    if (shownIds.current.has(scopedId)) continue
                    shownIds.current.add(scopedId)
                    derivedEvents.push({
                        id: scopedId,
                        sourceType: 'industry',
                        industria_id: industriaId,
                        industryName: String(row?.industrias?.name || 'Industria'),
                        badgeLabel: String(row?.industrias?.name || 'Industria'),
                        level,
                        eventType: prev === 0 ? 'unlocked' : 'upgraded',
                        progressCount: Number(row?.closures_count || 0)
                    })
                }
            }

            const specialLevels = Array.isArray(feed.specialLevels) ? feed.specialLevels : []
            for (const row of specialLevels) {
                const badgeType = String(row?.badge_type || '')
                const badgeKey = String(row?.badge_key || '')
                if (!badgeType || !badgeKey) continue
                const level = Number(row?.level || 0)
                if (level <= 0) continue
                const key = `lvl:special:${badgeType}:${badgeKey}`
                const prev = Number(previous[key] || 0)
                nextSnapshot[key] = level
                if (level > prev) {
                    const scopedId = `derived-special:${badgeType}:${badgeKey}:L${level}`
                    if (shownIds.current.has(scopedId)) continue
                    shownIds.current.add(scopedId)
                    derivedEvents.push({
                        id: scopedId,
                        sourceType: 'special',
                        badgeType,
                        badgeLabel: String(row?.badge_label || 'Badge especial'),
                        level,
                        eventType: prev === 0 ? 'unlocked' : 'upgraded',
                        progressCount: Number(row?.progress_count || 0)
                    })
                }
            }

            const isFirstSnapshot = Object.keys(previous).length === 0
            persistBadgeLevelSnapshot(nextSnapshot)
            if (!isFirstSnapshot && derivedEvents.length > 0) {
                setQueue((prev) => [...prev, ...derivedEvents.slice(0, 4)])
            }

            return true
        }

        const hydrateAllRecentEvents = async () => {
            const fromServer = await hydrateFromServerFeed()
            if (fromServer) return
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
                    const industryName = industryCatalog.find((i) => i.id === String(row?.industria_id || ''))?.name || 'Industria'
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
                (payload: { new: { id: string, badge_type?: string, badge_label?: string, level?: number, event_type?: string, progress_count?: number } }) => {
                    const row = payload?.new
                    const eventId = String(row?.id || '')
                    const scopedId = `special:${eventId}`
                    if (!eventId || shownIds.current.has(scopedId)) return
                    shownIds.current.add(scopedId)
                    const seen = readSeenEventIds()
                    seen.add(scopedId)
                    persistSeenEventIds(seen)
                    setQueue((prev) => [
                        ...prev,
                        {
                            id: scopedId,
                            sourceType: 'special',
                            badgeType: String(row?.badge_type || 'special'),
                            badgeLabel: String(row?.badge_label || 'Badge especial'),
                            level: Number(row?.level || 1),
                            eventType: (row?.event_type === 'upgraded' ? 'upgraded' : 'unlocked'),
                            progressCount: Number(row?.progress_count || 0)
                        }
                    ])
                }
            )
            .subscribe()

        // Fallback polling so celebration still appears if realtime is delayed/unavailable.
        const interval = setInterval(() => {
            hydrateAllRecentEvents()
        }, 8000)

        return () => {
            clearInterval(interval)
            supabase.removeChannel(channel)
        }
    }, [auth.user, supabase, industryCatalog])

    const currentEventId = current?.id || 'none'
    const confettiPieces = useMemo(() => {
        const colors = ['#60a5fa', '#22d3ee', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#fb7185']
        return Array.from({ length: 34 }).map((_, index) => {
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

    if (!auth.user || !current) return null

    const industryVisual = current.sourceType === 'industry' && current.industria_id
        ? getIndustryBadgeVisualFromMap(current.industria_id, visualMap, current.industryName)
        : null
    const specialVisual = getSpecialVisual(current.badgeType, current.badgeLabel)
    const Icon = industryVisual?.icon || specialVisual.icon
    const containerClass = industryVisual?.containerClass || specialVisual.containerClass
    const iconClass = industryVisual?.iconClass || specialVisual.iconClass
    const isUnlocked = current.eventType === 'unlocked'

    return (
        <div className='fixed inset-0 z-[10001] pointer-events-none flex items-center justify-center p-4 md:p-8'>
            <div className='absolute inset-0 bg-black/40 backdrop-blur-[2px]' />

            <div className='relative w-[min(94vw,700px)] rounded-[30px] border shadow-2xl overflow-hidden bg-[var(--card-bg)] border-[var(--card-border)] pointer-events-auto animate-in zoom-in-95 fade-in duration-500'>
                <div className='absolute inset-0 pointer-events-none overflow-hidden'>
                    <div className='ah-firework ah-firework-left' />
                    <div className='ah-firework ah-firework-right' />
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
                    <button
                        type='button'
                        onClick={() => setQueue((prev) => prev.slice(1))}
                        className='w-10 h-10 rounded-xl bg-white/15 hover:bg-white/30 text-white inline-flex items-center justify-center transition-colors cursor-pointer'
                        aria-label='Cerrar notificación de badge'
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className='p-6 md:p-8'>
                    <div className='flex items-center gap-5 md:gap-6'>
                        <div className={`relative overflow-hidden w-24 h-24 md:w-28 md:h-28 rounded-2xl border flex items-center justify-center shadow-xl ${containerClass}`}>
                            <span className='absolute top-[3px] left-[12%] w-[76%] h-[1px] bg-white/80 rounded-full pointer-events-none' />
                            <Icon size={42} strokeWidth={2.5} className={iconClass} />
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
                </div>
            </div>

            <style jsx>{`
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
                    width: 180px;
                    height: 180px;
                    border-radius: 999px;
                    opacity: 0.32;
                    pointer-events: none;
                    animation: ahPulse 1.6s ease-out 2 both;
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
                        transform: scale(1.08);
                        opacity: 0.45;
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
