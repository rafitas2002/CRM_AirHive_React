'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { X, Sparkles, Trophy, Award, Shield, Flame, Gem, Calendar, Building2, Flag, Layers, Ruler } from 'lucide-react'
import { buildIndustryBadgeVisualMap, getIndustryBadgeVisualFromMap } from '@/lib/industryBadgeVisuals'

type SpecialBadgeEventRow = {
    badge_type: string
    badge_label: string | null
    level: number
    event_type: 'unlocked' | 'upgraded' | string
    progress_count: number | null
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

        const enqueueIndustryEvent = async (eventId: string) => {
            const scopedId = `industry:${eventId}`
            if (!eventId || shownIds.current.has(scopedId)) return

            const { data, error } = await (supabase
                .from('seller_badge_events')
                .select('id, industria_id, level, event_type, closures_count, industrias(name)')
                .eq('id', eventId)
                .maybeSingle() as any)

            if (error || !data?.id || !data?.industria_id || !data?.level) return

            shownIds.current.add(scopedId)

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

            const { data, error } = await ((supabase as any)
                .from('seller_special_badge_events')
                .select('id, badge_type, badge_label, level, event_type, progress_count')
                .eq('id', eventId)
                .maybeSingle())

            if (error || !data?.id || !data?.badge_type || !data?.level) return

            shownIds.current.add(scopedId)

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

        const channel = supabase
            .channel(`badge-celebration-${auth.user.id}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'seller_badge_events',
                    filter: `seller_id=eq.${auth.user.id}`
                },
                (payload: { new: { id: string } }) => {
                    if (payload?.new?.id) enqueueIndustryEvent(payload.new.id)
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'seller_special_badge_events',
                    filter: `seller_id=eq.${auth.user.id}`
                },
                (payload: { new: { id: string } }) => {
                    if (payload?.new?.id) enqueueSpecialEvent(payload.new.id)
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [auth.user, supabase])

    useEffect(() => {
        if (!current) return

        const timer = setTimeout(() => {
            setQueue((prev) => prev.slice(1))
        }, 6200)

        return () => clearTimeout(timer)
    }, [current])

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
        <div className='fixed top-[86px] right-6 z-[170] w-[min(92vw,420px)] animate-in slide-in-from-right-8 fade-in duration-500'>
            <div className='rounded-3xl border shadow-2xl overflow-hidden bg-[var(--card-bg)] border-[var(--card-border)]'>
                <div className='px-5 py-4 border-b flex items-start justify-between gap-4 bg-gradient-to-r from-[#2048FF] to-[#0f2a7a] border-white/10'>
                    <div>
                        <p className='text-[10px] font-black uppercase tracking-[0.18em] text-blue-100/90'>Badge de vendedor</p>
                        <h4 className='text-white font-black text-xl leading-tight mt-1'>
                            {isUnlocked ? 'Felicidades, desbloqueaste un nuevo badge' : 'Excelente, tu badge evolucionó'}
                        </h4>
                    </div>
                    <button
                        type='button'
                        onClick={() => setQueue((prev) => prev.slice(1))}
                        className='w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 text-white inline-flex items-center justify-center transition-colors'
                        aria-label='Cerrar notificación de badge'
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className='p-5'>
                    <div className='flex items-center gap-4'>
                        <div className={`relative overflow-hidden w-20 h-20 rounded-2xl border flex items-center justify-center shadow-xl ${containerClass}`}>
                            <span className='absolute top-[3px] left-[12%] w-[76%] h-[1px] bg-white/80 rounded-full pointer-events-none' />
                            <Icon size={34} strokeWidth={2.4} className={iconClass} />
                        </div>

                        <div className='min-w-0'>
                            <p className='text-[11px] font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]'>
                                {current.sourceType === 'industry' ? 'Industria' : 'Badge especial'}
                            </p>
                            <p className='text-lg font-black leading-tight text-[var(--text-primary)] truncate'>
                                {current.sourceType === 'industry' ? current.industryName : current.badgeLabel}
                            </p>
                            <div className='mt-2 flex items-center gap-2'>
                                <span className='inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-400/30'>
                                    <Trophy size={12} />
                                    Nivel {current.level}
                                </span>
                                <span className='inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-[var(--hover-bg)] text-[var(--text-secondary)] border border-[var(--card-border)]'>
                                    {current.progressCount} {current.sourceType === 'industry' ? 'cierres' : 'progreso'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className='mt-4 flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]'>
                        <Sparkles size={14} className='text-amber-400' />
                        Sigue cerrando para subir al siguiente nivel.
                    </div>
                </div>
            </div>
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
