import {
    type LucideIcon,
    Building2,
    Landmark,
    Cpu,
    HeartPulse,
    Factory,
    ShoppingBag,
    GraduationCap,
    Plane,
    Truck,
    Home,
    Leaf,
    Radio,
    Utensils,
    Wrench,
    Car,
    Banknote,
    Shield,
    FlaskConical,
    Pill,
    Hotel,
    BriefcaseBusiness,
    Store,
    Boxes,
    Gavel,
    Scale,
    ClipboardCheck,
    Stethoscope,
    Siren,
    HardHat,
    Hammer,
    CircuitBoard,
    Code2,
    Smartphone,
    Wifi,
    Cable,
    SatelliteDish,
    Globe,
    Languages,
    BookOpen,
    University,
    Baby,
    PawPrint,
    Fish,
    Tractor,
    Trees,
    Mountain,
    CloudSun,
    Sun,
    Wind,
    Droplets,
    Flame,
    Battery,
    Plug,
    Workflow,
    Cone,
    Cog,
    Microscope,
    TestTube,
    Beaker,
    Percent,
    ChartBar,
    ChartLine,
    HandCoins,
    Coins,
    Receipt,
    PiggyBank,
    Wallet,
    Sailboat,
    Train,
    Bus,
    Bike,
    Timer,
    Trophy,
    Gem,
    Diamond,
    Sparkles,
    Rocket,
    Medal,
    Headset,
    Megaphone,
    Camera,
    Film,
    Music,
    Gamepad2,
    Handshake,
    Users,
    UserRoundCheck,
    Lock,
    KeyRound,
    FileText,
    FolderOpen,
    ScanSearch,
    SearchCheck
} from 'lucide-react'

export type BadgeVisual = {
    icon: LucideIcon
    containerClass: string
    iconClass: string
}

const METALLIC_CONTAINER =
    'border-white/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),inset_0_-1px_0_rgba(0,0,0,0.15),0_6px_14px_rgba(15,23,42,0.22)]'

const ICON_POOL: LucideIcon[] = [
    Building2, Landmark, Cpu, HeartPulse, Factory, ShoppingBag, GraduationCap, Plane, Truck, Home,
    Leaf, Radio, Utensils, Wrench, Car, Banknote, Shield, FlaskConical, Pill, Hotel,
    BriefcaseBusiness, Store, Boxes, Gavel, Scale, ClipboardCheck, Stethoscope, Siren, HardHat, Hammer,
    CircuitBoard, Code2, Smartphone, Wifi, Cable, SatelliteDish, Globe, Languages, BookOpen, University,
    Baby, PawPrint, Fish, Tractor, Trees, Mountain, CloudSun, Sun, Wind, Droplets,
    Flame, Battery, Plug, Workflow, Cone, Cog, Microscope, TestTube, Beaker, Percent,
    ChartBar, ChartLine, HandCoins, Coins, Receipt, PiggyBank, Wallet, Sailboat, Train, Bus,
    Bike, Timer, Trophy, Gem, Diamond, Sparkles, Rocket, Medal, Headset, Megaphone,
    Camera, Film, Music, Gamepad2, Handshake, Users, UserRoundCheck, Lock, KeyRound, FileText,
    FolderOpen, ScanSearch, SearchCheck
]

const ICON_BG_POOL = [
    'bg-gradient-to-br from-[#3b82f6] to-[#1d4ed8]',
    'bg-gradient-to-br from-[#10b981] to-[#047857]',
    'bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9]',
    'bg-gradient-to-br from-[#f43f5e] to-[#be123c]',
    'bg-gradient-to-br from-[#f59e0b] to-[#b45309]',
    'bg-gradient-to-br from-[#d946ef] to-[#a21caf]',
    'bg-gradient-to-br from-[#0ea5e9] to-[#0369a1]',
    'bg-gradient-to-br from-[#06b6d4] to-[#0e7490]',
    'bg-gradient-to-br from-[#f97316] to-[#c2410c]',
    'bg-gradient-to-br from-[#84cc16] to-[#4d7c0f]',
    'bg-gradient-to-br from-[#ef4444] to-[#b91c1c]',
    'bg-gradient-to-br from-[#14b8a6] to-[#0f766e]',
    'bg-gradient-to-br from-[#ec4899] to-[#9d174d]',
    'bg-gradient-to-br from-[#22c55e] to-[#166534]',
    'bg-gradient-to-br from-[#6366f1] to-[#3730a3]',
    'bg-gradient-to-br from-[#eab308] to-[#a16207]',
    'bg-gradient-to-br from-[#a855f7] to-[#6b21a8]',
    'bg-gradient-to-br from-[#f472b6] to-[#be185d]',
    'bg-gradient-to-br from-[#38bdf8] to-[#075985]',
    'bg-gradient-to-br from-[#2dd4bf] to-[#115e59]',
    'bg-gradient-to-br from-[#fb7185] to-[#9f1239]',
    'bg-gradient-to-br from-[#fb923c] to-[#9a3412]',
    'bg-gradient-to-br from-[#a3e635] to-[#3f6212]',
    'bg-gradient-to-br from-[#818cf8] to-[#312e81]',
    'bg-gradient-to-br from-[#facc15] to-[#854d0e]',
    'bg-gradient-to-br from-[#34d399] to-[#065f46]',
    'bg-gradient-to-br from-[#c084fc] to-[#581c87]',
    'bg-gradient-to-br from-[#fda4af] to-[#881337]',
    'bg-gradient-to-br from-[#67e8f9] to-[#155e75]',
    'bg-gradient-to-br from-[#fdba74] to-[#7c2d12]',
    'bg-gradient-to-br from-[#bef264] to-[#365314]',
    'bg-gradient-to-br from-[#93c5fd] to-[#1e3a8a]',
    'bg-gradient-to-br from-[#5eead4] to-[#134e4a]',
    'bg-gradient-to-br from-[#f9a8d4] to-[#831843]',
    'bg-gradient-to-br from-[#c4b5fd] to-[#4c1d95]',
    'bg-gradient-to-br from-[#fcd34d] to-[#78350f]',
    'bg-gradient-to-br from-[#86efac] to-[#14532d]',
    'bg-gradient-to-br from-[#7dd3fc] to-[#0c4a6e]',
    'bg-gradient-to-br from-[#fca5a5] to-[#7f1d1d]',
    'bg-gradient-to-br from-[#f5d0fe] to-[#701a75]',
    'bg-gradient-to-br from-[#bae6fd] to-[#082f49]',
    'bg-gradient-to-br from-[#ddd6fe] to-[#3730a3]',
    'bg-gradient-to-br from-[#fecaca] to-[#991b1b]',
    'bg-gradient-to-br from-[#fde68a] to-[#92400e]',
    'bg-gradient-to-br from-[#bbf7d0] to-[#166534]',
    'bg-gradient-to-br from-[#99f6e4] to-[#115e59]',
    'bg-gradient-to-br from-[#fecdd3] to-[#9f1239]',
    'bg-gradient-to-br from-[#e9d5ff] to-[#6b21a8]',
    'bg-gradient-to-br from-[#d9f99d] to-[#3f6212]'
]

const GENERIC_FALLBACK_CANDIDATES: LucideIcon[] = [
    Building2, BriefcaseBusiness, Boxes, Users, Shield, Trophy, Rocket, Gem, Globe, SearchCheck, FileText
]

const SEMANTIC_ICON_RULES: Array<{ keywords: string[]; icons: LucideIcon[] }> = [
    { keywords: ['agricultura', 'ganaderia', 'agro'], icons: [Tractor, Leaf, Trees, Sun, Droplets] },
    { keywords: ['alimentos', 'bebidas', 'restaur', 'food'], icons: [Utensils, Receipt, Store, HandCoins, Timer] },
    { keywords: ['automotriz', 'auto', 'vehiculo'], icons: [Car, Cog, Wrench, Battery, Timer] },
    { keywords: ['comercio al por mayor', 'mayoreo', 'wholesale'], icons: [Boxes, WarehouseIcon(), Truck, HandCoins, Wallet] },
    { keywords: ['comercio al por menor', 'retail', 'tienda'], icons: [Store, ShoppingBag, Receipt, Wallet, Megaphone] },
    { keywords: ['construccion', 'inmobiliaria', 'real estate'], icons: [HardHat, Hammer, Home, Building2, Scale] },
    { keywords: ['consultoria', 'servicios profesionales'], icons: [BriefcaseBusiness, Handshake, ClipboardCheck, Users, ScanSearch] },
    { keywords: ['educacion', 'universidad', 'escuela'], icons: [GraduationCap, BookOpen, University, Users, Medal] },
    { keywords: ['energia', 'petroleo', 'oil', 'gas'], icons: [Battery, Flame, Plug, Wind, Sun] },
    { keywords: ['finanzas', 'banca', 'seguros', 'credito'], icons: [Landmark, Banknote, Coins, PiggyBank, Wallet] },
    { keywords: ['gobierno', 'publico'], icons: [Landmark, Scale, Shield, FileText, Gavel] },
    { keywords: ['logistica', 'transporte', 'transportes', 'movilidad'], icons: [Truck, Train, Bus, Sailboat, Workflow] },
    { keywords: ['manufactura', 'industrial', 'fabrica'], icons: [Factory, Cog, Wrench, Workflow, Hammer] },
    { keywords: ['marketing', 'publicidad', 'medios'], icons: [Megaphone, Camera, Film, Radio, ChartLine] },
    { keywords: ['mineria', 'metal'], icons: [Mountain, PickaxeIcon(), Flame, HardHat, Factory] },
    { keywords: ['salud', 'medicina', 'hospital', 'farmaceut'], icons: [HeartPulse, Stethoscope, Pill, Microscope, TestTube] },
    { keywords: ['tecnologia', 'software', 'it', 'digital'], icons: [Cpu, Code2, CircuitBoard, Smartphone, Wifi] },
    { keywords: ['telecom', 'comunicaciones'], icons: [Radio, SatelliteDish, Cable, Wifi, Smartphone] },
    { keywords: ['turismo', 'hospitalidad', 'hotel', 'viajes'], icons: [Plane, Hotel, Sailboat, Camera, Globe] },
    { keywords: ['legal', 'juridico'], icons: [Scale, Gavel, FileText, Shield, KeyRound] },
    { keywords: ['rh', 'recursos humanos', 'talento'], icons: [Users, UserRoundCheck, Handshake, ClipboardCheck, BriefcaseBusiness] },
    { keywords: ['seguridad', 'vigilancia'], icons: [Shield, Lock, KeyRound, Siren, SearchCheck] },
    { keywords: ['biotecnologia', 'laboratorio'], icons: [Microscope, TestTube, Beaker, FlaskConical, HeartPulse] }
]

const FIXED_INDUSTRY_VISUAL_RULES: Array<{ keywords: string[]; icon: LucideIcon; colorClass: string }> = [
    {
        keywords: ['alimentos', 'bebidas', 'restaur', 'food'],
        icon: Utensils,
        colorClass: 'bg-gradient-to-br from-[#f59e0b] to-[#b45309]'
    }
]

function normalizeText(value?: string) {
    return (value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
}

function hashString(value: string) {
    let hash = 0
    for (let i = 0; i < value.length; i += 1) {
        hash = (hash << 5) - hash + value.charCodeAt(i)
        hash |= 0
    }
    return Math.abs(hash)
}

function buildVisual(icon: LucideIcon, colorClass: string): BadgeVisual {
    return {
        icon,
        containerClass: `${METALLIC_CONTAINER} ${colorClass}`,
        iconClass: 'text-white'
    }
}

function WarehouseIcon(): LucideIcon {
    return Building2
}

function PickaxeIcon(): LucideIcon {
    return Wrench
}

function getSemanticCandidates(industryName?: string): LucideIcon[] {
    const normalized = normalizeText(industryName)
    if (!normalized) return GENERIC_FALLBACK_CANDIDATES

    const candidates: LucideIcon[] = []

    for (const rule of SEMANTIC_ICON_RULES) {
        if (rule.keywords.some((k) => normalized.includes(k))) {
            for (const icon of rule.icons) {
                if (!candidates.includes(icon)) candidates.push(icon)
            }
        }
    }

    if (candidates.length === 0) {
        const hash = hashString(normalized)
        const rotated = [...GENERIC_FALLBACK_CANDIDATES]
        for (let i = 0; i < hash % GENERIC_FALLBACK_CANDIDATES.length; i += 1) {
            rotated.push(rotated.shift() as LucideIcon)
        }
        return rotated
    }

    for (const icon of GENERIC_FALLBACK_CANDIDATES) {
        if (!candidates.includes(icon)) candidates.push(icon)
    }
    return candidates
}

function getFixedIndustryVisual(industryName?: string): BadgeVisual | null {
    const normalized = normalizeText(industryName)
    if (!normalized) return null

    for (const rule of FIXED_INDUSTRY_VISUAL_RULES) {
        if (rule.keywords.some((k) => normalized.includes(k))) {
            return buildVisual(rule.icon, rule.colorClass)
        }
    }

    return null
}

export function buildIndustryBadgeVisualMap(
    industries: Array<{ id: string; name?: string }>
): Record<string, BadgeVisual> {
    const result: Record<string, BadgeVisual> = {}
    const usedIcons = new Set<LucideIcon>()
    const usedColorIndexes = new Set<number>()

    const uniqueIndustries = industries
        .filter((i) => !!i?.id)
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'))

    for (const industry of uniqueIndustries) {
        const fixedVisual = getFixedIndustryVisual(industry.name)
        if (fixedVisual) {
            usedIcons.add(fixedVisual.icon)
            result[industry.id] = fixedVisual
            continue
        }

        const semanticCandidates = getSemanticCandidates(industry.name)
        let selectedIcon: LucideIcon | null = null

        for (const candidate of semanticCandidates) {
            if (!usedIcons.has(candidate)) {
                selectedIcon = candidate
                break
            }
        }

        if (!selectedIcon) {
            for (const candidate of ICON_POOL) {
                if (!usedIcons.has(candidate)) {
                    selectedIcon = candidate
                    break
                }
            }
        }

        if (!selectedIcon) {
            selectedIcon = Wrench
        }

        usedIcons.add(selectedIcon)

        const colorSeed = hashString(`color:${industry.id}:${normalizeText(industry.name)}`)
        let colorIdx = colorSeed % ICON_BG_POOL.length
        let scannedColors = 0
        while (usedColorIndexes.has(colorIdx) && scannedColors < ICON_BG_POOL.length) {
            colorIdx = (colorIdx + 1) % ICON_BG_POOL.length
            scannedColors += 1
        }
        usedColorIndexes.add(colorIdx)

        result[industry.id] = buildVisual(selectedIcon, ICON_BG_POOL[colorIdx])
    }

    return result
}

export function getIndustryBadgeVisualFromMap(
    industryId: string | undefined,
    visualMap: Record<string, BadgeVisual>,
    industryName?: string
): BadgeVisual {
    if (industryId && visualMap[industryId]) {
        return visualMap[industryId]
    }

    const fallbackSeed = hashString(normalizeText(industryName) || 'fallback')
    const icon = ICON_POOL[fallbackSeed % ICON_POOL.length]
    const color = ICON_BG_POOL[fallbackSeed % ICON_BG_POOL.length]
    return buildVisual(icon, color)
}
