'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { getQuoteLikeNotificationsForCurrentUser } from '@/app/actions/quotes'
import { Bell, Building2, UsersRound, Target, CheckSquare, CalendarDays, BarChart3, LineChart, UserRound, Settings, LogOut, Sparkles, FolderClosed, Sun, Moon, Circle, Check, type LucideIcon } from 'lucide-react'
import BadgeMedallion from '@/components/BadgeMedallion'
import { buildIndustryBadgeVisualMap, getIndustryBadgeLevelMedallionVisual, getIndustryBadgeVisualFromMap } from '@/lib/industryBadgeVisuals'
import { getSpecialBadgeVisualSpec } from '@/lib/specialBadgeVisuals'
import { getNormalizedSpecialBadgeDisplayLabel } from '@/lib/specialBadgeLabels'
import { useTheme, type Theme } from '@/lib/ThemeContext'

const normalizeBadgeCelebrationEventType = (value: unknown): 'unlocked' | 'upgraded' | null => {
    const normalized = String(value || '').trim().toLowerCase()
    if (normalized === 'unlocked' || normalized === 'upgraded') return normalized
    return null
}

export default function TopBar() {
    const pathname = usePathname()
    const auth = useAuth()
    const { theme, setTheme } = useTheme()
    const userId = auth.user?.id || null
    const [supabase] = useState(() => createClient())

    const isAdmin = auth.profile?.role === 'admin'
    const [quoteNotificationOpen, setQuoteNotificationOpen] = useState(false)
    const [themeMenuOpen, setThemeMenuOpen] = useState(false)
    const [quotePendingCount, setQuotePendingCount] = useState(0)
    const [quoteNotificationItems, setQuoteNotificationItems] = useState<Array<{
        id: number
        quote_author: string
        contributed_by_name: string
        requester_name: string
        created_at: string
    }>>([])
    const [quoteLikeNotificationItems, setQuoteLikeNotificationItems] = useState<Array<{
        id: number
        quote_id: number
        liker_user_id: string
        liker_name: string
        created_at: string
        quote_author: string
        quote_text: string
    }>>([])
    const [badgeNotificationItems, setBadgeNotificationItems] = useState<Array<{
        id: string
        label: string
        level: number
        event_type: 'unlocked' | 'upgraded'
        created_at: string
        sourceType: 'industry' | 'special'
        industriaId?: string
        badgeType?: string
        badgeKey?: string
    }>>([])
    const [badgeUnreadCount, setBadgeUnreadCount] = useState(0)
    const [quoteLikeUnreadCount, setQuoteLikeUnreadCount] = useState(0)
    const [industryCatalog, setIndustryCatalog] = useState<Array<{ id: string; name: string }>>([])
    const quoteNotificationsRef = useRef<HTMLDivElement | null>(null)
    const themeMenuRef = useRef<HTMLDivElement | null>(null)
    const lastBadgeListSignatureRef = useRef('')
    const lastQuoteListSignatureRef = useRef('')
    const lastQuoteLikeListSignatureRef = useRef('')
    const logoDimensions = { width: 248, height: 36 }
    const dropdownIconClass = 'w-[18px] h-[18px] text-white/80 group-hover/item:text-white transition-colors'
    const badgeSeenStorageKey = userId ? `airhive_seen_badge_notifications_${userId}` : ''
    const quoteLikeSeenStorageKey = userId ? `airhive_seen_quote_like_notifications_${userId}` : ''
    const badgeIndustryVisualMap = useMemo(() => buildIndustryBadgeVisualMap(industryCatalog), [industryCatalog])
    const industryNameById = useMemo(
        () => new Map(industryCatalog.map((row) => [String(row.id), String(row.name)])),
        [industryCatalog]
    )
    const themeButtonMeta = getTopBarThemeButtonMeta(theme)

    useEffect(() => {
        if (!userId) return
        let cancelled = false

        const loadIndustryCatalog = async () => {
            const { data } = await supabase
                .from('industrias')
                .select('id, name')
                .order('name', { ascending: true })

            if (cancelled) return
            setIndustryCatalog(
                (Array.isArray(data) ? data : [])
                    .map((row: any) => ({ id: String(row?.id || ''), name: String(row?.name || 'Industria') }))
                    .filter((row) => row.id)
            )
        }

        void loadIndustryCatalog()

        return () => {
            cancelled = true
        }
    }, [userId, supabase])

    useEffect(() => {
        if (!isAdmin || !userId) return
        let cancelled = false

        const loadQuoteNotifications = async () => {
            const { count } = await (supabase
                .from('crm_quote_requests') as any)
                .select('id', { head: true, count: 'exact' })
                .eq('status', 'pending')

            const { data: requests, error: requestsError } = await (supabase
                .from('crm_quote_requests') as any)
                .select('id, quote_author, contributed_by_name, requested_by, created_at')
                .eq('status', 'pending')
                .order('created_at', { ascending: false })
                .limit(8)

            if (cancelled || requestsError) return

            const normalizedItems = (Array.isArray(requests) ? requests : []).map((raw) => {
                const item = raw as Record<string, unknown>
                return {
                    id: Number(item.id || 0),
                    quote_author: String(item.quote_author || ''),
                    contributed_by_name: String(item.contributed_by_name || ''),
                    requested_by: String(item.requested_by || ''),
                    requester_name: 'Usuario',
                    created_at: String(item.created_at || '')
                }
            })

            const requesterIds = Array.from(
                new Set(normalizedItems.map((item) => item.requested_by).filter(Boolean))
            )
            let requesterById = new Map<string, string>()

            if (requesterIds.length > 0) {
                const { data: profiles } = await (supabase
                    .from('profiles')
                    .select('id, full_name')
                    .in('id', requesterIds) as any)

                requesterById = new Map(
                    (Array.isArray(profiles) ? profiles : []).map((profile: any) => [
                        String(profile?.id || ''),
                        String(profile?.full_name || 'Usuario')
                    ])
                )
            }

            const itemsWithRequester = normalizedItems.map((item) => ({
                id: item.id,
                quote_author: item.quote_author,
                contributed_by_name: item.contributed_by_name,
                requester_name: requesterById.get(item.requested_by) || 'Usuario',
                created_at: item.created_at
            }))

            const nextPendingCount = Number(count || 0)
            setQuotePendingCount((prev) => (prev === nextPendingCount ? prev : nextPendingCount))

            const signature = itemsWithRequester
                .map((item) => `${item.id}:${item.created_at}`)
                .join('|')
            if (signature !== lastQuoteListSignatureRef.current) {
                lastQuoteListSignatureRef.current = signature
                setQuoteNotificationItems(itemsWithRequester)
            }
        }

        const load = async () => {
            await loadQuoteNotifications()
        }

        load()
        const channel = supabase
            .channel(`topbar-quote-notifications-${userId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'crm_quote_requests'
                },
                () => {
                    void load()
                }
            )
            .subscribe()

        return () => {
            cancelled = true
            supabase.removeChannel(channel)
        }
    }, [isAdmin, userId, supabase])

    useEffect(() => {
        if (!userId) return
        let cancelled = false

        const readSeen = () => {
            if (typeof window === 'undefined' || !quoteLikeSeenStorageKey) return new Set<string>()
            try {
                const raw = localStorage.getItem(quoteLikeSeenStorageKey)
                const parsed = raw ? JSON.parse(raw) : []
                if (!Array.isArray(parsed)) return new Set<string>()
                return new Set(parsed.map((x) => String(x)))
            } catch {
                return new Set<string>()
            }
        }

        const persistSeen = (ids: Set<string>) => {
            if (typeof window === 'undefined' || !quoteLikeSeenStorageKey) return
            try {
                localStorage.setItem(quoteLikeSeenStorageKey, JSON.stringify(Array.from(ids).slice(-200)))
            } catch {
                // noop
            }
        }

        const loadQuoteLikeNotifications = async () => {
            const result = await getQuoteLikeNotificationsForCurrentUser(12)
            if (cancelled || !result?.success) return

            const items = (Array.isArray(result.data) ? result.data : [])
                .map((row: any) => ({
                    id: Number(row?.id || 0),
                    quote_id: Number(row?.quote_id || 0),
                    liker_user_id: String(row?.liker_user_id || ''),
                    liker_name: String(row?.liker_name || 'Usuario'),
                    created_at: String(row?.created_at || ''),
                    quote_author: String(row?.quote_author || ''),
                    quote_text: String(row?.quote_text || '')
                }))
                .filter((item) => item.id > 0 && item.created_at)

            const signature = items.map((item) => `${item.id}:${item.created_at}`).join('|')
            if (signature !== lastQuoteLikeListSignatureRef.current) {
                lastQuoteLikeListSignatureRef.current = signature
                setQuoteLikeNotificationItems(items)
            }

            const seen = readSeen()
            const validIds = new Set(items.map((item) => `qlike:${item.id}`))
            const prunedSeen = new Set(Array.from(seen).filter((id) => validIds.has(id)))
            if (prunedSeen.size !== seen.size) persistSeen(prunedSeen)

            const unread = items.filter((item) => !prunedSeen.has(`qlike:${item.id}`)).length
            setQuoteLikeUnreadCount((prev) => (prev === unread ? prev : unread))
        }

        void loadQuoteLikeNotifications()
        const interval = setInterval(loadQuoteLikeNotifications, 30000)
        const channel = supabase
            .channel(`topbar-quote-likes-${userId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'crm_quote_reactions' },
                () => { void loadQuoteLikeNotifications() }
            )
            .subscribe()

        return () => {
            cancelled = true
            clearInterval(interval)
            supabase.removeChannel(channel)
        }
    }, [userId, quoteLikeSeenStorageKey, supabase])

    useEffect(() => {
        if (!userId) return
        let cancelled = false

        const readSeen = () => {
            if (typeof window === 'undefined' || !badgeSeenStorageKey) return new Set<string>()
            try {
                const raw = localStorage.getItem(badgeSeenStorageKey)
                const parsed = raw ? JSON.parse(raw) : []
                if (!Array.isArray(parsed)) return new Set<string>()
                return new Set(parsed.map((x) => String(x)))
            } catch {
                return new Set<string>()
            }
        }
        const persistSeen = (ids: Set<string>) => {
            if (typeof window === 'undefined' || !badgeSeenStorageKey) return
            try {
                localStorage.setItem(badgeSeenStorageKey, JSON.stringify(Array.from(ids).slice(-200)))
            } catch {
                // noop
            }
        }

        const loadBadgeNotifications = async () => {
            if (!userId) return

            const [industryRes, specialRes, activeIndustryBadgesRes, activeSpecialBadgesRes] = await Promise.all([
                (supabase
                    .from('seller_badge_events')
                    .select('id, industria_id, level, event_type, created_at, industrias(name)')
                    .eq('seller_id', userId)
                    .in('event_type', ['unlocked', 'upgraded'])
                    .order('created_at', { ascending: false })
                    .limit(10) as any),
                (supabase
                    .from('seller_special_badge_events')
                    .select('id, badge_type, badge_key, badge_label, level, event_type, created_at')
                    .eq('seller_id', userId)
                    .in('event_type', ['unlocked', 'upgraded'])
                    .order('created_at', { ascending: false })
                    .limit(10) as any),
                (supabase
                    .from('seller_industry_badges')
                    .select('industria_id')
                    .eq('seller_id', userId)
                    .gt('level', 0)),
                (supabase
                    .from('seller_special_badges')
                    .select('badge_type, badge_key')
                    .eq('seller_id', userId)
                    .gt('level', 0))
            ])

            const industryRows = Array.isArray(industryRes?.data) ? industryRes.data : []
            const specialRows = Array.isArray(specialRes?.data) ? specialRes.data : []

            const activeIndustryKeys = new Set(
                (Array.isArray(activeIndustryBadgesRes?.data) ? activeIndustryBadgesRes.data : [])
                    .map((row: { industria_id?: string | null }) => String(row?.industria_id || ''))
                    .filter(Boolean)
            )
            const activeSpecialKeys = new Set(
                (Array.isArray(activeSpecialBadgesRes?.data) ? activeSpecialBadgesRes.data : [])
                    .map((row: { badge_type?: string | null, badge_key?: string | null }) => `${String(row?.badge_type || '')}:${String(row?.badge_key || '')}`)
                    .filter((x: string) => x !== ':')
            )

            const normalizedIndustry = industryRows
                .map((row: any) => {
                    const eventType = normalizeBadgeCelebrationEventType(row?.event_type)
                    if (!eventType) return null
                    return {
                        id: `industry:${String(row?.id || '')}`,
                        badgeRef: String(row?.industria_id || ''),
                        label: String(row?.industrias?.name || 'Industria'),
                        level: Number(row?.level || 1),
                        event_type: eventType,
                        created_at: String(row?.created_at || ''),
                        sourceType: 'industry' as const,
                        industriaId: String(row?.industria_id || '')
                    }
                })
                .filter((item: any): item is NonNullable<typeof item> => !!item)

            const normalizedSpecial = specialRows
                .map((row: any) => {
                    const eventType = normalizeBadgeCelebrationEventType(row?.event_type)
                    if (!eventType) return null
                    return {
                        id: `special:${String(row?.id || '')}`,
                        badgeRef: `${String(row?.badge_type || '')}:${String(row?.badge_key || '')}`,
                        label: getNormalizedSpecialBadgeDisplayLabel({
                            badgeType: String(row?.badge_type || ''),
                            badgeKey: String(row?.badge_key || ''),
                            badgeLabel: String(row?.badge_label || 'Badge especial')
                        }),
                        level: Number(row?.level || 1),
                        event_type: eventType,
                        created_at: String(row?.created_at || ''),
                        sourceType: 'special' as const,
                        badgeType: String(row?.badge_type || ''),
                        badgeKey: String(row?.badge_key || '')
                    }
                })
                .filter((item: any): item is NonNullable<typeof item> => !!item)

            const merged = [...normalizedIndustry, ...normalizedSpecial]
                .filter((item) => item.id.endsWith(':') === false && item.created_at)
                .filter((item) => {
                    if (item.sourceType === 'industry') return activeIndustryKeys.has(item.badgeRef)
                    return activeSpecialKeys.has(item.badgeRef)
                })
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .slice(0, 20)

            if (cancelled) return
            const signature = merged
                .map((item) => `${item.id}:${item.level}:${item.event_type}:${item.created_at}`)
                .join('|')
            if (signature !== lastBadgeListSignatureRef.current) {
                lastBadgeListSignatureRef.current = signature
                setBadgeNotificationItems(merged)
            }

            const seen = readSeen()
            const mergedIds = new Set(merged.map((item) => item.id))
            const prunedSeen = new Set(Array.from(seen).filter((id) => mergedIds.has(id)))
            if (prunedSeen.size !== seen.size) {
                persistSeen(prunedSeen)
            }

            const unread = merged.filter((item) => !prunedSeen.has(item.id)).length
            setBadgeUnreadCount((prev) => (prev === unread ? prev : unread))
        }

        const pushRealtimeBadgeNotification = (item: {
            id: string
            label: string
            level: number
            event_type: 'unlocked' | 'upgraded'
            created_at: string
            sourceType: 'industry' | 'special'
            industriaId?: string
            badgeType?: string
            badgeKey?: string
        }) => {
            setBadgeNotificationItems((prev) => {
                const deduped = [item, ...prev.filter((x) => x.id !== item.id)]
                return deduped
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                    .slice(0, 20)
            })
            const seen = readSeen()
            if (!seen.has(item.id)) {
                setBadgeUnreadCount((prev) => prev + 1)
            }
        }

        loadBadgeNotifications()
        const interval = setInterval(loadBadgeNotifications, 30000)
        const channel = supabase
            .channel(`topbar-badge-notifications-${userId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'seller_badge_events',
                    filter: `seller_id=eq.${userId}`
                },
                (payload: { new: { id: string, level?: number, event_type?: string, created_at?: string, industria_id?: string } }) => {
                    const row = payload?.new
                    const id = `industry:${String(row?.id || '')}`
                    if (id === 'industry:') return
                    const eventType = normalizeBadgeCelebrationEventType(row?.event_type)
                    if (!eventType) return
                    pushRealtimeBadgeNotification({
                        id,
                        label: industryNameById.get(String(row?.industria_id || '')) || 'Industria',
                        level: Number(row?.level || 1),
                        event_type: eventType,
                        created_at: String(row?.created_at || new Date().toISOString()),
                        sourceType: 'industry',
                        industriaId: String(row?.industria_id || '')
                    })
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'DELETE',
                    schema: 'public',
                    table: 'seller_badge_events',
                    filter: `seller_id=eq.${userId}`
                },
                () => {
                    void loadBadgeNotifications()
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'seller_special_badge_events',
                    filter: `seller_id=eq.${userId}`
                },
                (payload: { new: { id: string, badge_label?: string, badge_type?: string, badge_key?: string, level?: number, event_type?: string, created_at?: string } }) => {
                    const row = payload?.new
                    const id = `special:${String(row?.id || '')}`
                    if (id === 'special:') return
                    const eventType = normalizeBadgeCelebrationEventType(row?.event_type)
                    if (!eventType) return
                    pushRealtimeBadgeNotification({
                        id,
                        label: getNormalizedSpecialBadgeDisplayLabel({
                            badgeType: String(row?.badge_type || ''),
                            badgeKey: String(row?.badge_key || ''),
                            badgeLabel: String(row?.badge_label || 'Badge especial')
                        }),
                        level: Number(row?.level || 1),
                        event_type: eventType,
                        created_at: String(row?.created_at || new Date().toISOString()),
                        sourceType: 'special',
                        badgeType: String(row?.badge_type || ''),
                        badgeKey: String(row?.badge_key || '')
                    })
                }
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'seller_industry_badges',
                    filter: `seller_id=eq.${userId}`
                },
                () => {
                    void loadBadgeNotifications()
                }
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'seller_special_badges',
                    filter: `seller_id=eq.${userId}`
                },
                () => {
                    void loadBadgeNotifications()
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'DELETE',
                    schema: 'public',
                    table: 'seller_special_badge_events',
                    filter: `seller_id=eq.${userId}`
                },
                () => {
                    void loadBadgeNotifications()
                }
            )
            .subscribe()

        return () => {
            cancelled = true
            clearInterval(interval)
            supabase.removeChannel(channel)
        }
    }, [userId, badgeSeenStorageKey, supabase, industryNameById])

    useEffect(() => {
        const onClickOutside = (event: MouseEvent) => {
            const target = event.target as Node
            const insideNotifications = quoteNotificationsRef.current?.contains(target)
            const insideThemeMenu = themeMenuRef.current?.contains(target)
            if (!insideNotifications) setQuoteNotificationOpen(false)
            if (!insideThemeMenu) setThemeMenuOpen(false)
        }
        document.addEventListener('mousedown', onClickOutside)
        return () => document.removeEventListener('mousedown', onClickOutside)
    }, [])

    const totalNotificationCount = quotePendingCount + badgeUnreadCount + quoteLikeUnreadCount

    const markBadgeNotificationsAsRead = () => {
        if (typeof window === 'undefined' || !badgeSeenStorageKey) return
        try {
            const ids = badgeNotificationItems.map((item) => item.id).slice(0, 200)
            localStorage.setItem(badgeSeenStorageKey, JSON.stringify(ids))
            setBadgeUnreadCount(0)
        } catch {
            // noop
        }
    }

    const markQuoteLikeNotificationsAsRead = () => {
        if (typeof window === 'undefined' || !quoteLikeSeenStorageKey) return
        try {
            const ids = quoteLikeNotificationItems.map((item) => `qlike:${item.id}`).slice(0, 200)
            localStorage.setItem(quoteLikeSeenStorageKey, JSON.stringify(ids))
            setQuoteLikeUnreadCount(0)
        } catch {
            // noop
        }
    }

    return (
        <header className='h-[70px] bg-black/80 backdrop-blur-md border-b border-white/5 sticky top-0 z-[100]'>
            <div className='h-full px-3 flex items-center gap-10'>
                <Link
                    href='/home'
                    aria-label='Ir a Home'
                    className='inline-flex items-center justify-start shrink-0 leading-none hover:opacity-80 transition-opacity'
                >
                    <Image
                        src='/airhive_logo_nav.svg'
                        alt='Air Hive'
                        width={logoDimensions.width}
                        height={logoDimensions.height}
                        className='block h-[36px] w-auto'
                        priority
                    />
                </Link>

                <nav className='flex items-center gap-10'>
                    {/* HOME */}
                    <Link
                        href='/home'
                        className='relative text-white font-semibold text-base px-2 py-2 group whitespace-nowrap'
                    >
                        Home
                        <span
                            className={[
                                'absolute left-1/2 -translate-x-1/2 bottom-0 h-[3px] rounded bg-[#2048FF]',
                                'transition-all duration-300 ease-out',
                                pathname === '/home' ? 'w-full opacity-100' : 'w-0 opacity-0',
                                'group-hover:w-full group-hover:opacity-100'
                            ].join(' ')}
                        />
                    </Link>

                    {/* Menú Desplegable CUSTOMER */}
                    <div className='relative group h-full flex items-center'>
                        <button
                            className={[
                                'relative text-white font-semibold text-base px-2 py-2 group flex items-center gap-1.5 cursor-pointer',
                                (pathname.includes('/clientes') || pathname.includes('/empresas') || pathname.includes('/pre-leads') || pathname.includes('/proyectos')) ? 'active-customer' : ''
                            ].join(' ')}
                        >
                            Customer
                            <span
                                className={[
                                    'absolute left-1/2 -translate-x-1/2 bottom-0 h-[3px] rounded bg-[#2048FF]',
                                    'transition-all duration-300 ease-out',
                                    (pathname.includes('/clientes') || pathname.includes('/empresas') || pathname.includes('/pre-leads') || pathname.includes('/proyectos')) ? 'w-full opacity-100' : 'w-0 opacity-0',
                                    'group-hover:w-full group-hover:opacity-100'
                                ].join(' ')}
                            />
                        </button>

                        {/* Dropdown Content */}
                        <div className='absolute top-[100%] left-0 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-50 min-w-[240px] translate-y-2 group-hover:translate-y-0'>
                            <div className='bg-black border border-white/10 rounded-xl overflow-hidden shadow-2xl p-1.5'>
                                {[
                                    { href: '/clientes', label: 'Leads', icon: UsersRound },
                                    { href: '/pre-leads', label: 'Suspects', icon: Target },
                                    { href: '/empresas', label: 'Empresas', icon: Building2 },
                                    { href: '/proyectos', label: 'Proyectos', icon: FolderClosed }
                                ].map((item) => {
                                    const Icon = item.icon as LucideIcon
                                    const isActive = pathname === item.href
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            className='relative flex items-center gap-3 px-4 py-3 text-white font-semibold text-sm hover:bg-white/5 transition-colors group/item rounded-lg overflow-hidden'
                                        >
                                            <Icon className={dropdownIconClass} strokeWidth={2.2} />
                                            {item.label}
                                            <span
                                                className={[
                                                    'absolute left-0 bottom-0 h-[2px] bg-[#2048FF]',
                                                    'transition-all duration-300 ease-out',
                                                    isActive ? 'w-full opacity-100' : 'w-0 opacity-0',
                                                    'group-hover/item:w-full group-hover/item:opacity-100'
                                                ].join(' ')}
                                            />
                                        </Link>
                                    )
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Menú Desplegable AGENDA */}
                    <div className='relative group h-full flex items-center'>
                        <Link
                            href='/calendario'
                            className={[
                                'relative text-white font-semibold text-base px-2 py-2 group flex items-center gap-1.5',
                                (pathname.includes('/tareas') || pathname.includes('/calendario')) ? 'active-agenda' : ''
                            ].join(' ')}
                        >
                            Agenda
                            <span
                                className={[
                                    'absolute left-1/2 -translate-x-1/2 bottom-0 h-[3px] rounded bg-[#2048FF]',
                                    'transition-all duration-300 ease-out',
                                    (pathname.includes('/tareas') || pathname.includes('/calendario')) ? 'w-full opacity-100' : 'w-0 opacity-0',
                                    'group-hover:w-full group-hover:opacity-100'
                                ].join(' ')}
                            />
                        </Link>

                        {/* Dropdown Content */}
                        <div className='absolute top-[100%] left-0 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-50 min-w-[160px] translate-y-2 group-hover:translate-y-0'>
                            <div className='bg-black border border-white/10 rounded-xl overflow-hidden shadow-2xl p-1.5'>
                                {[
                                    { href: '/tareas', label: 'Tareas', icon: CheckSquare },
                                    { href: '/calendario', label: 'Calendario', icon: CalendarDays }
                                ].map((item) => {
                                    const Icon = item.icon as LucideIcon
                                    const isActive = pathname === item.href
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            className='relative flex items-center gap-3 px-4 py-3 text-white font-semibold text-sm hover:bg-white/5 transition-colors group/item rounded-lg overflow-hidden'
                                        >
                                            <Icon className={dropdownIconClass} strokeWidth={2.2} />
                                            {item.label}
                                            <span
                                                className={[
                                                    'absolute left-0 bottom-0 h-[2px] bg-[#2048FF]',
                                                    'transition-all duration-300 ease-out',
                                                    isActive ? 'w-full opacity-100' : 'w-0 opacity-0',
                                                    'group-hover/item:w-full group-hover/item:opacity-100'
                                                ].join(' ')}
                                            />
                                        </Link>
                                    )
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Menú Desplegable INSIGHTS (solo admin) */}
                    {isAdmin && (
                        <div className='relative group h-full flex items-center'>
                            <Link
                                href='/admin/forecast'
                                className={[
                                    'relative text-white font-semibold text-base px-2 py-2 group flex items-center gap-1.5',
                                    (pathname.includes('/admin/forecast') || pathname.includes('/admin/correlaciones') || pathname.includes('/admin/insights')) ? 'active-insights' : ''
                                ].join(' ')}
                            >
                                Insights
                                <span
                                    className={[
                                        'absolute left-1/2 -translate-x-1/2 bottom-0 h-[3px] rounded bg-[#2048FF]',
                                        'transition-all duration-300 ease-out',
                                        (pathname.includes('/admin/forecast') || pathname.includes('/admin/correlaciones') || pathname.includes('/admin/insights')) ? 'w-full opacity-100' : 'w-0 opacity-0',
                                        'group-hover:w-full group-hover:opacity-100'
                                    ].join(' ')}
                                />
                            </Link>

                            {/* Dropdown Content */}
                            <div className='absolute top-[100%] left-0 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-50 min-w-[160px] translate-y-2 group-hover:translate-y-0'>
                                <div className='bg-black border border-white/10 rounded-xl overflow-hidden shadow-2xl p-1.5'>
                                    {[
                                        { href: '/admin/forecast', label: 'Pronóstico', icon: BarChart3 },
                                        { href: '/admin/correlaciones', label: 'Correlaciones', icon: LineChart },
                                        { href: '/admin/insights/correlaciones', label: 'Gráfica Corr.', icon: LineChart },
                                        { href: '/admin/insights/pronostico', label: 'Pronóstico Juntas', icon: BarChart3 }
                                    ].map((item) => {
                                        const Icon = item.icon as LucideIcon
                                        const isActive = pathname === item.href
                                        return (
                                            <Link
                                                key={item.href}
                                                href={item.href}
                                                className='relative flex items-center gap-3 px-4 py-3 text-white font-semibold text-sm hover:bg-white/5 transition-colors group/item rounded-lg overflow-hidden'
                                            >
                                                <Icon className={dropdownIconClass} strokeWidth={2.2} />
                                                {item.label}
                                                <span
                                                    className={[
                                                        'absolute left-0 bottom-0 h-[2px] bg-[#2048FF]',
                                                        'transition-all duration-300 ease-out',
                                                        isActive ? 'w-full opacity-100' : 'w-0 opacity-0',
                                                        'group-hover/item:w-full group-hover/item:opacity-100'
                                                    ].join(' ')}
                                                />
                                            </Link>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* EQUIPO */}
                    <Link
                        href='/usuarios'
                        className='relative text-white font-semibold text-base px-2 py-2 group whitespace-nowrap'
                    >
                        Equipo
                        <span
                            className={[
                                'absolute left-1/2 -translate-x-1/2 bottom-0 h-[3px] rounded bg-[#2048FF]',
                                'transition-all duration-300 ease-out',
                                pathname === '/usuarios' ? 'w-full opacity-100' : 'w-0 opacity-0',
                                'group-hover:w-full group-hover:opacity-100'
                            ].join(' ')}
                        />
                    </Link>
                </nav>

                <div className='flex-1' />

                {/* Chip usuario */}
                <div className='flex items-center gap-6 mr-8'>
                    <div className='h-9 px-4 rounded-full border border-white/20 bg-white/10 text-white text-xs font-bold flex items-center gap-2.5 whitespace-nowrap whitespace-nowrap shrink-0'>
                        <UserRound size={14} className='opacity-90 text-blue-300' strokeWidth={2.2} />
                        <span className='truncate max-w-[150px]'>{auth.loading ? 'Cargando...' : auth.username}</span>
                    </div>

                    <div ref={quoteNotificationsRef} className='relative'>
                        <button
                            type='button'
                            onClick={() => {
                                setThemeMenuOpen(false)
                                setQuoteNotificationOpen((prev) => {
                                    const next = !prev
                                    if (next) {
                                        markBadgeNotificationsAsRead()
                                        markQuoteLikeNotificationsAsRead()
                                    }
                                    return next
                                })
                            }}
                            className='relative text-white px-2 py-2 group transition-all hover:scale-110 cursor-pointer'
                            title='Notificaciones'
                            aria-label='Notificaciones'
                        >
                            <Bell size={22} strokeWidth={2.2} className='text-white/90 group-hover:text-white transition-colors' />
                            {totalNotificationCount > 0 && (
                                <span className='absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-black leading-[18px] text-center'>
                                    {totalNotificationCount > 99 ? '99+' : totalNotificationCount}
                                </span>
                            )}
                            <span
                                className='absolute left-1/2 -translate-x-1/2 bottom-0 h-[3px] rounded bg-[#2048FF] transition-all duration-300 ease-out w-0 opacity-0 group-hover:w-full group-hover:opacity-100'
                            />
                        </button>

                        {quoteNotificationOpen && (
                            <div className='absolute right-0 top-[120%] w-[360px] rounded-2xl border border-white/10 bg-black/95 shadow-2xl z-[120] overflow-hidden'>
                                <div className='px-4 py-3 border-b border-white/10 flex items-center justify-between'>
                                    <p className='text-[11px] font-black uppercase tracking-[0.16em] text-white/70'>
                                        Notificaciones
                                    </p>
                                    <span className='text-[11px] font-black text-blue-300'>
                                        {totalNotificationCount} nuevas
                                    </span>
                                </div>
                                <div className='max-h-[340px] overflow-y-auto'>
                                    {badgeNotificationItems.length === 0 && quoteLikeNotificationItems.length === 0 && !isAdmin && (
                                        <p className='px-4 py-4 text-sm text-white/70'>Sin notificaciones por ahora.</p>
                                    )}

                                    {badgeNotificationItems.length > 0 && (
                                        <>
                                            <div className='px-4 py-2 border-b border-white/10'>
                                                <p className='text-[10px] font-black uppercase tracking-[0.16em] text-amber-300'>
                                                    Badges
                                                </p>
                                            </div>
                                            {badgeNotificationItems.map((item) => {
                                                const displayLabel = item.sourceType === 'industry'
                                                    ? (industryNameById.get(String(item.industriaId || '')) || item.label)
                                                    : item.label
                                                return (
                                                <div
                                                    key={`badge-notif-${item.id}`}
                                                    className='px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors'
                                                >
                                                    <div className='flex items-start gap-3'>
                                                        <TopBarBadgeNotificationMedallion
                                                            item={{ ...item, label: displayLabel }}
                                                            industryVisualMap={badgeIndustryVisualMap}
                                                        />
                                                        <div className='min-w-0 flex-1'>
                                                            <p className='text-sm font-semibold text-white flex items-center gap-2'>
                                                                <Sparkles size={13} className='text-amber-300 shrink-0' />
                                                                <span className='truncate'>
                                                                    ¡Felicidades! {item.event_type === 'unlocked' ? 'Desbloqueaste' : 'Evolucionaste'} un badge
                                                                </span>
                                                            </p>
                                                            <p className='text-xs mt-1 text-white/75 truncate'>
                                                                {displayLabel}
                                                            </p>
                                                            <div className='mt-1 flex items-center gap-2 flex-wrap'>
                                                                <span className='inline-flex items-center rounded-md border border-amber-300/20 bg-amber-400/10 px-2 py-0.5 text-[10px] font-black text-amber-200'>
                                                                    Nivel {item.level}
                                                                </span>
                                                                <span className='inline-flex items-center rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-white/70'>
                                                                    {item.sourceType === 'industry' ? 'Industria' : 'Especial'}
                                                                </span>
                                                            </div>
                                                            <p className='text-[11px] mt-1.5 text-blue-300/90'>
                                                                {new Date(item.created_at).toLocaleString('es-MX')}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                                )
                                            })}
                                        </>
                                    )}

                                    {quoteLikeNotificationItems.length > 0 && (
                                        <>
                                            <div className='px-4 py-2 border-b border-white/10'>
                                                <p className='text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300'>
                                                    Likes en tus frases
                                                </p>
                                            </div>
                                            {quoteLikeNotificationItems.map((item) => (
                                                <div
                                                    key={`quote-like-${item.id}`}
                                                    className='px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors'
                                                >
                                                    <p className='text-sm font-semibold text-white'>
                                                        {item.liker_name} le dio like a tu frase
                                                    </p>
                                                    <p className='text-xs mt-1 text-white/75 truncate'>
                                                        {item.quote_author ? `Autor: ${item.quote_author} • ` : ''}"{item.quote_text}"
                                                    </p>
                                                    <p className='text-[11px] mt-1 text-emerald-300/90'>
                                                        {new Date(item.created_at).toLocaleString('es-MX')}
                                                    </p>
                                                </div>
                                            ))}
                                        </>
                                    )}

                                    {isAdmin && (
                                        <>
                                            <div className='px-4 py-2 border-b border-white/10'>
                                                <p className='text-[10px] font-black uppercase tracking-[0.16em] text-rose-300'>
                                                    Solicitudes de frases
                                                </p>
                                            </div>
                                            {quoteNotificationItems.length === 0 && (
                                                <p className='px-4 py-4 text-sm text-white/70'>Sin solicitudes pendientes.</p>
                                            )}
                                            {quoteNotificationItems.length > 0 && quoteNotificationItems.map((item) => (
                                                <Link
                                                    key={`quote-notif-${item.id}`}
                                                    href='/settings/personalizacion#solicitudes-frases'
                                                    onClick={() => setQuoteNotificationOpen(false)}
                                                    className='block px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors'
                                                >
                                                    <p className='text-sm font-semibold text-white'>
                                                        Autor: {item.quote_author}
                                                    </p>
                                                    <p className='text-xs mt-1 text-white/75'>
                                                        Aportada por {item.contributed_by_name} • Solicita {item.requester_name}
                                                    </p>
                                                    <p className='text-[11px] mt-1 text-blue-300/90'>
                                                        {new Date(item.created_at).toLocaleString('es-MX')}
                                                    </p>
                                                </Link>
                                            ))}
                                        </>
                                    )}
                                </div>
                                {isAdmin && (
                                    <div className='px-4 py-3'>
                                        <Link
                                            href='/settings/personalizacion#solicitudes-frases'
                                            onClick={() => setQuoteNotificationOpen(false)}
                                            className='inline-flex items-center text-xs font-bold text-blue-300 hover:text-blue-200 transition-colors'
                                        >
                                            Ir a revisar solicitudes
                                        </Link>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div ref={themeMenuRef} className='relative'>
                        <button
                            type='button'
                            onClick={() => {
                                setQuoteNotificationOpen(false)
                                setThemeMenuOpen((prev) => !prev)
                            }}
                            className='relative text-white px-2 py-2 group transition-all hover:scale-110 cursor-pointer'
                            title={`Tema actual: ${themeButtonMeta.label}`}
                            aria-label={`Cambiar tema. Tema actual: ${themeButtonMeta.label}`}
                            aria-haspopup='menu'
                            aria-expanded={themeMenuOpen}
                        >
                            <themeButtonMeta.icon size={22} strokeWidth={2.2} className='text-white/90 group-hover:text-white transition-colors' />
                            <span
                                className={[
                                    'absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] rounded-full border',
                                    'inline-flex items-center justify-center text-[8px] font-black leading-none',
                                    theme === 'claro'
                                        ? 'border-amber-300/60 bg-amber-400/20 text-amber-200'
                                        : theme === 'gris'
                                            ? 'border-slate-300/50 bg-slate-300/20 text-slate-100'
                                            : 'border-blue-300/50 bg-blue-400/20 text-blue-200'
                                ].join(' ')}
                                aria-hidden='true'
                            >
                                {themeButtonMeta.short}
                            </span>
                            <span
                                className='absolute left-1/2 -translate-x-1/2 bottom-0 h-[3px] rounded bg-[#2048FF] transition-all duration-300 ease-out w-0 opacity-0 group-hover:w-full group-hover:opacity-100'
                            />
                        </button>

                        {themeMenuOpen && (
                            <div className='absolute right-0 top-[120%] w-[228px] rounded-2xl border border-white/10 bg-black/95 shadow-2xl z-[120] overflow-hidden'>
                                <div className='px-4 py-3 border-b border-white/10 flex items-center justify-between'>
                                    <p className='text-[10px] font-black uppercase tracking-[0.16em] text-white/70'>Tema</p>
                                    <span className='text-[11px] font-black text-blue-300'>{themeButtonMeta.label}</span>
                                </div>
                                <div className='p-1.5'>
                                    {([
                                        { id: 'claro' as Theme, icon: Sun, short: 'C' },
                                        { id: 'gris' as Theme, icon: Circle, short: 'G' },
                                        { id: 'oscuro' as Theme, icon: Moon, short: 'O' }
                                    ]).map((option) => {
                                        const Icon = option.icon
                                        const active = theme === option.id
                                        return (
                                            <button
                                                key={option.id}
                                                type='button'
                                                onClick={() => {
                                                    setTheme(option.id)
                                                    setThemeMenuOpen(false)
                                                }}
                                                className={[
                                                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors cursor-pointer',
                                                    active ? 'bg-white/8 border border-white/15' : 'hover:bg-white/5 border border-transparent'
                                                ].join(' ')}
                                                role='menuitem'
                                                aria-current={active ? 'true' : undefined}
                                            >
                                                <span
                                                    className={[
                                                        'h-8 w-8 rounded-lg border inline-flex items-center justify-center shrink-0',
                                                        option.id === 'claro'
                                                            ? 'border-amber-300/35 bg-amber-400/10'
                                                            : option.id === 'gris'
                                                                ? 'border-slate-300/25 bg-slate-300/10'
                                                                : 'border-blue-300/25 bg-blue-400/10'
                                                    ].join(' ')}
                                                >
                                                    <Icon
                                                        size={16}
                                                        strokeWidth={2.2}
                                                        className={option.id === 'claro' ? 'text-amber-200' : option.id === 'gris' ? 'text-slate-100' : 'text-blue-200'}
                                                    />
                                                </span>
                                                <div className='min-w-0 flex-1'>
                                                    <p className='text-sm font-bold text-white'>{getThemeDisplayLabel(option.id)}</p>
                                                    <p className='text-[11px] text-white/55'>{getTopBarThemeDescription(option.id)}</p>
                                                </div>
                                                {active ? <Check size={15} strokeWidth={2.6} className='text-blue-300 shrink-0' /> : (
                                                    <span className='text-[10px] font-black text-white/45 shrink-0'>{option.short}</span>
                                                )}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Settings Gear Icon */}
                    <Link
                        href='/settings'
                        className='relative text-white px-2 py-2 group transition-all hover:scale-110'
                        title='Configuración'
                        aria-label='Configuración'
                    >
                        <Settings size={24} strokeWidth={2.2} className='text-white/90 group-hover:text-white transition-colors' />
                        <span
                            className='absolute left-1/2 -translate-x-1/2 bottom-0 h-[3px] rounded bg-[#2048FF] transition-all duration-300 ease-out w-0 opacity-0 group-hover:w-full group-hover:opacity-100'
                        />
                    </Link>

                    <button
                        type='button'
                        disabled={auth.busy || auth.loading}
                        className={[
                            'relative text-white font-semibold text-base px-2 py-2 group cursor-pointer',
                            (auth.busy || auth.loading) ? 'opacity-50 cursor-not-allowed' : ''
                        ].join(' ')}
                        onClick={async () => {
                            await auth.logout()
                        }}
                    >
                        <span className='inline-flex items-center gap-2'>
                            <LogOut size={14} strokeWidth={2.4} />
                            {auth.busy ? 'Saliendo...' : 'Salir'}
                        </span>
                        <span
                            className='absolute left-1/2 -translate-x-1/2 bottom-0 h-[3px] rounded bg-[#2048FF] transition-all duration-300 ease-out w-0 opacity-0 group-hover:w-full group-hover:opacity-100'
                        />
                    </button>
                </div>
            </div>
        </header>
    )
}

function getThemeDisplayLabel(theme: Theme): string {
    if (theme === 'claro') return 'Claro'
    if (theme === 'gris') return 'Gris'
    return 'Oscuro'
}

function getTopBarThemeDescription(theme: Theme): string {
    if (theme === 'claro') return 'Fondo claro y texto oscuro'
    if (theme === 'gris') return 'Contraste medio y neutro'
    return 'Fondo oscuro y texto claro'
}

function getTopBarThemeButtonMeta(theme: Theme): { icon: LucideIcon; label: string; short: string } {
    if (theme === 'claro') return { icon: Sun, label: 'Claro', short: 'C' }
    if (theme === 'gris') return { icon: Circle, label: 'Gris', short: 'G' }
    return { icon: Moon, label: 'Oscuro', short: 'O' }
}

function getTopBarSpecialBadgeOverlayNumber(badgeType?: string, badgeKey?: string, badgeLabel?: string) {
    if (badgeType === 'company_size') {
        const fromKey = String(badgeKey || '').match(/size_(\d+)/)?.[1]
        if (fromKey) return fromKey
        const fromLabel = String(badgeLabel || '').match(/(\d+)/)?.[1]
        return fromLabel || null
    }
    if (badgeType === 'deal_value_tier') {
        const key = String(badgeKey || '')
        if (key === 'value_1k_2k') return '1k'
        if (key === 'value_2k_5k') return '2k'
        if (key === 'value_5k_10k') return '5k'
        if (key === 'value_10k_100k' || key === 'value_10k_plus') return '10k'
        return null
    }
    return null
}

function shouldUseWhiteCoreBorderForTopBarSpecialBadgeType(type?: string) {
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

function TopBarBadgeNotificationMedallion({
    item,
    industryVisualMap
}: {
    item: {
        id: string
        label: string
        level: number
        sourceType: 'industry' | 'special'
        industriaId?: string
        badgeType?: string
        badgeKey?: string
    }
    industryVisualMap: ReturnType<typeof buildIndustryBadgeVisualMap>
}) {
    if (item.sourceType === 'industry') {
        const visual = getIndustryBadgeVisualFromMap(item.industriaId, industryVisualMap, item.label)
        const levelVisual = getIndustryBadgeLevelMedallionVisual(item.level, visual)
        return (
            <BadgeMedallion
                icon={visual.icon}
                centerClassName={visual.containerClass}
                iconClassName={visual.iconClass}
                ringStyle={levelVisual.ringStyle}
                coreBorderColorClassName={levelVisual.coreBorderColorClassName}
                coreBorderStyle={levelVisual.coreBorderStyle}
                size='sm'
                iconSize={16}
                strokeWidth={2.4}
                className='mt-0.5'
            />
        )
    }

    const specialSpec = getSpecialBadgeVisualSpec(item.badgeType, item.label, item.badgeKey)
    return (
        <BadgeMedallion
            icon={specialSpec?.icon || Sparkles}
            centerClassName={specialSpec?.centerGradientClass || 'bg-gradient-to-br from-[#d946ef] to-[#a21caf]'}
            matchRingClassName={String(specialSpec?.matchRingClassName || '') || undefined}
            clipCenterFillToCoreInterior={Boolean(specialSpec?.clipCenterFillToCoreInterior)}
            iconClassName={specialSpec?.iconClassName || 'text-white'}
            overlayText={getTopBarSpecialBadgeOverlayNumber(item.badgeType, item.badgeKey, item.label)}
            ringStyle={specialSpec?.ringStyle || 'match'}
            coreBorderColorClassName={String(specialSpec?.coreBorderColorClassName || '') || (shouldUseWhiteCoreBorderForTopBarSpecialBadgeType(item.badgeType) ? '!border-white/90' : '')}
            size='sm'
            iconSize={16}
            strokeWidth={2.4}
            className='mt-0.5'
        />
    )
}
