'use client'

import {
    Award,
    Building,
    Building2,
    Calendar,
    CalendarDays,
    Flame,
    Gem,
    Layers,
    MapPin,
    Medal,
    MessageSquareQuote,
    Shield,
    ThumbsUp,
    Target,
    Trophy,
    Users,
    Ruler,
    type LucideIcon
} from 'lucide-react'

export type SpecialBadgeRingStyle = 'match' | 'gold' | 'bronze' | 'silver' | 'royal' | 'royal_dark' | 'royal_dark_vivid' | 'royal_gold' | 'royal_purple'

export interface SpecialBadgeVisualSpec {
    title: string
    category: string
    icon: LucideIcon
    centerGradientClass: string
    iconClassName: string
    ringStyle: SpecialBadgeRingStyle
    coreBorderColorClassName?: string
}

export function getSpecialBadgeVisualSpec(badgeType?: string | null, badgeLabel?: string | null, badgeKey?: string | null): SpecialBadgeVisualSpec | null {
    const type = String(badgeType || '')
    const key = String(badgeKey || '')
    const labelLower = String(badgeLabel || '').toLowerCase()

    if (!type) return null

    if (type === 'admin_granted') {
        const adminGradient = labelLower.includes('jesus gracia')
            ? 'bg-[radial-gradient(circle,rgba(243,232,255,0.68)_0_1px,rgba(243,232,255,0)_1.3px),radial-gradient(circle,rgba(255,255,255,0.30)_0_0.85px,rgba(255,255,255,0)_1.15px),linear-gradient(145deg,#ddd6fe_0%,#c084fc_22%,#a855f7_50%,#7e22ce_76%,#5b21b6_100%)] bg-[length:8px_8px,8px_8px,100%_100%] bg-[position:0_0,4px_4px,0_0]'
            : labelLower.includes('rafael sedas')
                ? 'bg-[radial-gradient(circle,rgba(254,242,242,0.68)_0_1px,rgba(254,242,242,0)_1.3px),radial-gradient(circle,rgba(255,255,255,0.32)_0_0.85px,rgba(255,255,255,0)_1.15px),linear-gradient(145deg,#fca5a5_0%,#ef4444_34%,#dc2626_62%,#991b1b_100%)] bg-[length:8px_8px,8px_8px,100%_100%] bg-[position:0_0,4px_4px,0_0]'
                : labelLower.includes('alberto castro')
                    ? 'bg-[radial-gradient(circle,rgba(219,234,254,0.72)_0_1px,rgba(219,234,254,0)_1.3px),radial-gradient(circle,rgba(255,255,255,0.30)_0_0.85px,rgba(255,255,255,0)_1.15px),linear-gradient(145deg,#93c5fd_0%,#3b82f6_38%,#1d4ed8_66%,#1e3a8a_100%)] bg-[length:8px_8px,8px_8px,100%_100%] bg-[position:0_0,4px_4px,0_0]'
                    : labelLower.includes('eduardo castro')
                        ? 'bg-[radial-gradient(circle,rgba(220,252,231,0.70)_0_1px,rgba(220,252,231,0)_1.3px),radial-gradient(circle,rgba(255,255,255,0.28)_0_0.85px,rgba(255,255,255,0)_1.15px),linear-gradient(145deg,#86efac_0%,#22c55e_30%,#16a34a_58%,#166534_100%)] bg-[length:8px_8px,8px_8px,100%_100%] bg-[position:0_0,4px_4px,0_0]'
                        : 'bg-[radial-gradient(circle,rgba(220,252,231,0.70)_0_1px,rgba(220,252,231,0)_1.3px),radial-gradient(circle,rgba(255,255,255,0.28)_0_0.85px,rgba(255,255,255,0)_1.15px),linear-gradient(145deg,#86efac_0%,#22c55e_30%,#16a34a_58%,#15803d_100%)] bg-[length:8px_8px,8px_8px,100%_100%] bg-[position:0_0,4px_4px,0_0]'
        const ringStyle: SpecialBadgeRingStyle = 'royal'
        return {
            title: 'Distinción Admin',
            category: 'Distinciones',
            icon: Medal,
            centerGradientClass: adminGradient,
            iconClassName: 'text-white',
            ringStyle,
            coreBorderColorClassName: '!border-[#facc15]'
        }
    }
    if (type === 'company_size') {
        const centerGradientClass = key === 'size_1'
            ? 'bg-gradient-to-br from-[#bfdbfe] to-[#60a5fa]'
            : key === 'size_2'
                ? 'bg-gradient-to-br from-[#93c5fd] to-[#2563eb]'
                : key === 'size_3'
                    ? 'bg-gradient-to-br from-[#60a5fa] to-[#1d4ed8]'
                    : key === 'size_4'
                        ? 'bg-gradient-to-br from-[#2563eb] to-[#1e3a8a]'
                        : 'bg-gradient-to-br from-[#1d4ed8] to-[#172554]'
        return { title: 'Tamaño Empresa', category: 'Comercial y Cobertura', icon: Building2, centerGradientClass, iconClassName: 'text-white', ringStyle: 'match' }
    }
    if (type === 'all_company_sizes') {
        return {
            title: 'Todos los Tamaños',
            category: 'Comercial y Cobertura',
            icon: Ruler,
            centerGradientClass: 'bg-[repeating-linear-gradient(135deg,rgba(194,65,12,0.72)_0_6px,rgba(194,65,12,0.20)_6px_12px),linear-gradient(135deg,#fef9c3_0%,#fef08a_18%,#fde047_42%,#facc15_62%,#f59e0b_80%,#ea580c_100%)]',
            iconClassName: 'text-white',
            ringStyle: 'match'
        }
    }
    if (type === 'multi_industry') {
        return {
            title: 'Multi-Industria',
            category: 'Comercial y Cobertura',
            icon: Layers,
            centerGradientClass: 'bg-[repeating-linear-gradient(135deg,rgba(186,230,253,0.62)_0_6px,rgba(186,230,253,0.16)_6px_12px),linear-gradient(135deg,#e879f9_0%,#d946ef_22%,#c026d3_55%,#a21caf_100%)]',
            iconClassName: 'text-white',
            ringStyle: 'match'
        }
    }
    if (type === 'deal_value_tier') {
        const centerGradientClass = key === 'value_10k_100k' || key === 'value_10k_plus' || labelLower.includes('10,000-100,000') || labelLower.includes('10k+')
            ? 'bg-gradient-to-br from-[#7c3aed] to-[#5b21b6]'
            : key === 'value_5k_10k' || labelLower.includes('5k-10k')
                ? 'bg-gradient-to-br from-[#0ea5e9] to-[#0369a1]'
                : key === 'value_2k_5k' || labelLower.includes('2k-5k')
                    ? 'bg-gradient-to-br from-[#10b981] to-[#047857]'
                    : 'bg-gradient-to-br from-[#f59e0b] to-[#b45309]'
        return { title: 'Mensualidad', category: 'Mensualidad (Valor Real)', icon: Gem, centerGradientClass, iconClassName: 'text-white', ringStyle: 'match' }
    }
    if (type === 'location_city') {
        const centerGradientClass = ['monterrey', 'guadalajara', 'cdmx', 'ciudad de mexico', 'puebla', 'queretaro', 'querétaro', 'tijuana', 'merida', 'mérida']
            .some((city) => labelLower.includes(city))
            ? 'bg-gradient-to-br from-[#10b981] to-[#047857]'
            : 'bg-gradient-to-br from-[#f97316] to-[#c2410c]'
        return { title: 'Ubicación Ciudad', category: 'Territorio', icon: MapPin, centerGradientClass, iconClassName: 'text-white', ringStyle: 'match' }
    }
    if (type === 'location_country') {
        const centerGradientClass = labelLower.includes('mex')
            ? 'bg-gradient-to-br from-[#ef4444] to-[#b91c1c]'
            : 'bg-gradient-to-br from-[#06b6d4] to-[#0e7490]'
        return { title: 'Ubicación País', category: 'Territorio', icon: MapPin, centerGradientClass, iconClassName: 'text-white', ringStyle: 'match' }
    }
    if (type === 'closure_milestone') {
        return { title: 'Cierres', category: 'Rendimiento', icon: Building, centerGradientClass: 'bg-gradient-to-br from-[#f97316] to-[#c2410c]', iconClassName: 'text-white', ringStyle: 'match' }
    }
    if (type === 'quote_contribution') {
        return { title: 'Aportación de Frases', category: 'Frases', icon: MessageSquareQuote, centerGradientClass: 'bg-gradient-to-br from-[#2563eb] to-[#1d4ed8]', iconClassName: 'text-white', ringStyle: 'match' }
    }
    if (type === 'quote_likes_received') {
        return { title: 'Frases con Likes', category: 'Frases', icon: ThumbsUp, centerGradientClass: 'bg-gradient-to-br from-[#0ea5e9] to-[#0369a1]', iconClassName: 'text-white', ringStyle: 'match' }
    }
    if (type === 'badge_leader') {
        return { title: 'Líder de Badges', category: 'Distinciones', icon: Medal, centerGradientClass: 'bg-gradient-to-br from-[#f59e0b] to-[#b45309]', iconClassName: 'text-white', ringStyle: 'match' }
    }
    if (type === 'reliability_score') {
        return { title: 'Confiabilidad', category: 'Rendimiento', icon: Shield, centerGradientClass: 'bg-gradient-to-br from-[#0ea5e9] to-[#0369a1]', iconClassName: 'text-white', ringStyle: 'match' }
    }
    if (type === 'seniority_years' || type === 'tenure_years') {
        return { title: 'Antigüedad', category: 'Trayectoria', icon: CalendarDays, centerGradientClass: 'bg-gradient-to-br from-[#4b5563] to-[#111827]', iconClassName: 'text-white', ringStyle: 'royal_dark' }
    }
    if (type === 'prelead_registered') {
        return { title: 'Pre-Leads', category: 'Actividad Comercial', icon: Target, centerGradientClass: 'bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9]', iconClassName: 'text-white', ringStyle: 'match' }
    }
    if (type === 'lead_registered') {
        return { title: 'Leads', category: 'Actividad Comercial', icon: Users, centerGradientClass: 'bg-gradient-to-br from-[#3b82f6] to-[#1d4ed8]', iconClassName: 'text-white', ringStyle: 'match' }
    }
    if (type === 'meeting_completed') {
        return { title: 'Juntas', category: 'Actividad Comercial', icon: Calendar, centerGradientClass: 'bg-gradient-to-br from-[#7c3aed] to-[#4c1d95]', iconClassName: 'text-white', ringStyle: 'match' }
    }
    if (type === 'closing_streak') {
        const centerGradientClass = (labelLower.includes('pausada') || labelLower.includes('inactiva'))
            ? 'bg-gradient-to-br from-[#6b7280] to-[#374151]'
            : 'bg-gradient-to-br from-[#f97316] to-[#b45309]'
        return { title: 'Racha Imparable', category: 'Consistencia', icon: Flame, centerGradientClass, iconClassName: 'text-white', ringStyle: 'match' }
    }
    if (type === 'race_first_place') {
        return { title: 'Carrera · 1er Lugar', category: 'Competencia', icon: Trophy, centerGradientClass: 'bg-gradient-to-br from-[#f59e0b] to-[#a16207]', iconClassName: 'text-white', ringStyle: 'match' }
    }
    if (type === 'race_second_place') {
        return { title: 'Carrera · 2do Lugar', category: 'Competencia', icon: Trophy, centerGradientClass: 'bg-gradient-to-br from-[#94a3b8] to-[#475569]', iconClassName: 'text-white', ringStyle: 'match' }
    }
    if (type === 'race_third_place') {
        return { title: 'Carrera · 3er Lugar', category: 'Competencia', icon: Trophy, centerGradientClass: 'bg-gradient-to-br from-[#b45309] to-[#7c2d12]', iconClassName: 'text-white', ringStyle: 'match' }
    }
    if (type === 'race_all_positions') {
        return {
            title: 'Carrera · Podio Completo',
            category: 'Competencia',
            icon: Layers,
            centerGradientClass: 'bg-[repeating-linear-gradient(135deg,rgba(241,245,249,0.52)_0_6px,rgba(241,245,249,0.12)_6px_12px),linear-gradient(135deg,#38bdf8_0%,#0ea5e9_42%,#0369a1_100%)]',
            iconClassName: 'text-white',
            ringStyle: 'match'
        }
    }
    if (type === 'race_total_trophies') {
        return { title: 'Carrera · 10 Trofeos', category: 'Competencia', icon: Trophy, centerGradientClass: 'bg-gradient-to-br from-[#10b981] to-[#047857]', iconClassName: 'text-white', ringStyle: 'match' }
    }
    if (type === 'race_points_leader') {
        const isHistoric = labelLower.includes('hist')
        return {
            title: 'Soberano del Podio',
            category: 'Competencia',
            icon: Award,
            centerGradientClass: isHistoric
                ? 'bg-gradient-to-br from-[#6b7280] to-[#374151]'
                : 'bg-gradient-to-br from-[#f59e0b] to-[#b45309]',
            iconClassName: 'text-white',
            ringStyle: 'match'
        }
    }
    if (key.includes('value')) {
        return { title: 'Mensualidad', category: 'Mensualidad (Valor Real)', icon: Gem, centerGradientClass: 'bg-gradient-to-br from-[#0ea5e9] to-[#0369a1]', iconClassName: 'text-white', ringStyle: 'match' }
    }

    return null
}
