'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { Bell, Building2, UsersRound, Target, CheckSquare, CalendarDays, BarChart3, LineChart, UserRound, Settings, LogOut, Sparkles, type LucideIcon } from 'lucide-react'

export default function TopBar() {
    const pathname = usePathname()
    const auth = useAuth()
    const userId = auth.user?.id || null
    const [supabase] = useState(() => createClient())

    const isAdmin = auth.profile?.role === 'admin'
    const [quoteNotificationOpen, setQuoteNotificationOpen] = useState(false)
    const [quotePendingCount, setQuotePendingCount] = useState(0)
    const [quoteNotificationItems, setQuoteNotificationItems] = useState<Array<{
        id: number
        quote_author: string
        contributed_by_name: string
        requester_name: string
        created_at: string
    }>>([])
    const [badgeNotificationItems, setBadgeNotificationItems] = useState<Array<{
        id: string
        label: string
        level: number
        event_type: 'unlocked' | 'upgraded'
        created_at: string
        sourceType: 'industry' | 'special'
    }>>([])
    const [badgeUnreadCount, setBadgeUnreadCount] = useState(0)
    const quoteNotificationsRef = useRef<HTMLDivElement | null>(null)
    const lastBadgeListSignatureRef = useRef('')
    const lastQuoteListSignatureRef = useRef('')
    const logoDimensions = { width: 248, height: 36 }
    const dropdownIconClass = 'w-[18px] h-[18px] text-white/80 group-hover/item:text-white transition-colors'
    const badgeSeenStorageKey = userId ? `airhive_seen_badge_notifications_${userId}` : ''

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
                    .order('created_at', { ascending: false })
                    .limit(10) as any),
                (supabase
                    .from('seller_special_badge_events')
                    .select('id, badge_type, badge_key, badge_label, level, event_type, created_at')
                    .eq('seller_id', userId)
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

            const normalizedIndustry = industryRows.map((row: any) => ({
                id: `industry:${String(row?.id || '')}`,
                badgeRef: String(row?.industria_id || ''),
                label: String(row?.industrias?.name || 'Industria'),
                level: Number(row?.level || 1),
                event_type: row?.event_type === 'upgraded' ? 'upgraded' : 'unlocked',
                created_at: String(row?.created_at || ''),
                sourceType: 'industry' as const
            }))

            const normalizedSpecial = specialRows.map((row: any) => ({
                id: `special:${String(row?.id || '')}`,
                badgeRef: `${String(row?.badge_type || '')}:${String(row?.badge_key || '')}`,
                label: String(row?.badge_label || 'Badge especial'),
                level: Number(row?.level || 1),
                event_type: row?.event_type === 'upgraded' ? 'upgraded' : 'unlocked',
                created_at: String(row?.created_at || ''),
                sourceType: 'special' as const
            }))

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
                    pushRealtimeBadgeNotification({
                        id,
                        label: 'Badge de industria',
                        level: Number(row?.level || 1),
                        event_type: row?.event_type === 'upgraded' ? 'upgraded' : 'unlocked',
                        created_at: String(row?.created_at || new Date().toISOString()),
                        sourceType: 'industry'
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
                (payload: { new: { id: string, badge_label?: string, level?: number, event_type?: string, created_at?: string } }) => {
                    const row = payload?.new
                    const id = `special:${String(row?.id || '')}`
                    if (id === 'special:') return
                    pushRealtimeBadgeNotification({
                        id,
                        label: String(row?.badge_label || 'Badge especial'),
                        level: Number(row?.level || 1),
                        event_type: row?.event_type === 'upgraded' ? 'upgraded' : 'unlocked',
                        created_at: String(row?.created_at || new Date().toISOString()),
                        sourceType: 'special'
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
    }, [userId, badgeSeenStorageKey, supabase])

    useEffect(() => {
        const onClickOutside = (event: MouseEvent) => {
            if (!quoteNotificationsRef.current) return
            if (!quoteNotificationsRef.current.contains(event.target as Node)) {
                setQuoteNotificationOpen(false)
            }
        }
        document.addEventListener('mousedown', onClickOutside)
        return () => document.removeEventListener('mousedown', onClickOutside)
    }, [])

    const totalNotificationCount = quotePendingCount + badgeUnreadCount

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

                    {/* Menú Desplegable CUSTOMER */}
                    <div className='relative group h-full flex items-center'>
                        <button
                            className={[
                                'relative text-white font-semibold text-base px-2 py-2 group flex items-center gap-1.5 cursor-pointer',
                                (pathname.includes('/clientes') || pathname.includes('/empresas') || pathname.includes('/pre-leads')) ? 'active-customer' : ''
                            ].join(' ')}
                        >
                            Customer
                            <span
                                className={[
                                    'absolute left-1/2 -translate-x-1/2 bottom-0 h-[3px] rounded bg-[#2048FF]',
                                    'transition-all duration-300 ease-out',
                                    (pathname.includes('/clientes') || pathname.includes('/empresas') || pathname.includes('/pre-leads')) ? 'w-full opacity-100' : 'w-0 opacity-0',
                                    'group-hover:w-full group-hover:opacity-100'
                                ].join(' ')}
                            />
                        </button>

                        {/* Dropdown Content */}
                        <div className='absolute top-[100%] left-0 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-50 min-w-[160px] translate-y-2 group-hover:translate-y-0'>
                            <div className='bg-black border border-white/10 rounded-xl overflow-hidden shadow-2xl p-1.5'>
                                {[
                                    { href: '/empresas', label: 'Empresas', icon: Building2 },
                                    { href: '/clientes', label: 'Leads', icon: UsersRound },
                                    { href: '/pre-leads', label: 'Pre-leads', icon: Target }
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
                                setQuoteNotificationOpen((prev) => {
                                    const next = !prev
                                    if (next) markBadgeNotificationsAsRead()
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
                                    {badgeNotificationItems.length === 0 && !isAdmin && (
                                        <p className='px-4 py-4 text-sm text-white/70'>Sin notificaciones de badges por ahora.</p>
                                    )}

                                    {badgeNotificationItems.length > 0 && (
                                        <>
                                            <div className='px-4 py-2 border-b border-white/10'>
                                                <p className='text-[10px] font-black uppercase tracking-[0.16em] text-amber-300'>
                                                    Badges
                                                </p>
                                            </div>
                                            {badgeNotificationItems.map((item) => (
                                                <div
                                                    key={`badge-notif-${item.id}`}
                                                    className='px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors'
                                                >
                                                    <p className='text-sm font-semibold text-white flex items-center gap-2'>
                                                        <Sparkles size={13} className='text-amber-300' />
                                                        ¡Felicidades! {item.event_type === 'unlocked' ? 'Desbloqueaste' : 'Evolucionaste'} un badge
                                                    </p>
                                                    <p className='text-xs mt-1 text-white/75'>
                                                        {item.label} · Nivel {item.level} · {item.sourceType === 'industry' ? 'Industria' : 'Especial'}
                                                    </p>
                                                    <p className='text-[11px] mt-1 text-blue-300/90'>
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
