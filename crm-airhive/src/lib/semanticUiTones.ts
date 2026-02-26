import type { Theme } from '@/lib/ThemeContext'

export type UiToneLane =
    | 'emerald'
    | 'amber'
    | 'fuchsia'
    | 'blue'
    | 'violet'
    | 'cyan'
    | 'rose'
    | 'orange'
    | 'slate'

export type SemanticTonePalette = {
    chipBg: string
    chipBorder: string
    chipText: string
    chipHoverBg: string
    chipHoverBorder: string
    chipHoverText: string
    panelBg: string
    panelBorder: string
    panelText: string
    panelSoftBg: string
    panelSoftBorder: string
    panelSoftText: string
    shadowColor: string
}

const LIGHT_PALETTES: Record<UiToneLane, SemanticTonePalette> = {
    emerald: {
        chipBg: '#ecfdf5',
        chipBorder: '#34d399',
        chipText: '#065f46',
        chipHoverBg: '#d1fae5',
        chipHoverBorder: '#10b981',
        chipHoverText: '#065f46',
        panelBg: '#f0fdf4',
        panelBorder: '#86efac',
        panelText: '#166534',
        panelSoftBg: '#f7fef9',
        panelSoftBorder: '#bbf7d0',
        panelSoftText: '#166534',
        shadowColor: 'rgba(16,185,129,0.18)'
    },
    amber: {
        chipBg: '#fffbeb',
        chipBorder: '#fbbf24',
        chipText: '#92400e',
        chipHoverBg: '#fef3c7',
        chipHoverBorder: '#f59e0b',
        chipHoverText: '#78350f',
        panelBg: '#fff7e6',
        panelBorder: '#fcd34d',
        panelText: '#92400e',
        panelSoftBg: '#fffaf0',
        panelSoftBorder: '#fde68a',
        panelSoftText: '#92400e',
        shadowColor: 'rgba(245,158,11,0.18)'
    },
    fuchsia: {
        chipBg: '#fdf4ff',
        chipBorder: '#e879f9',
        chipText: '#86198f',
        chipHoverBg: '#fae8ff',
        chipHoverBorder: '#d946ef',
        chipHoverText: '#701a75',
        panelBg: '#fdf2ff',
        panelBorder: '#f0abfc',
        panelText: '#86198f',
        panelSoftBg: '#fef7ff',
        panelSoftBorder: '#f5d0fe',
        panelSoftText: '#86198f',
        shadowColor: 'rgba(217,70,239,0.18)'
    },
    blue: {
        chipBg: '#eff6ff',
        chipBorder: '#60a5fa',
        chipText: '#1d4ed8',
        chipHoverBg: '#dbeafe',
        chipHoverBorder: '#3b82f6',
        chipHoverText: '#1e40af',
        panelBg: '#eff6ff',
        panelBorder: '#93c5fd',
        panelText: '#1d4ed8',
        panelSoftBg: '#f5f9ff',
        panelSoftBorder: '#bfdbfe',
        panelSoftText: '#1e40af',
        shadowColor: 'rgba(59,130,246,0.18)'
    },
    violet: {
        chipBg: '#f5f3ff',
        chipBorder: '#a78bfa',
        chipText: '#5b21b6',
        chipHoverBg: '#ede9fe',
        chipHoverBorder: '#8b5cf6',
        chipHoverText: '#4c1d95',
        panelBg: '#f5f3ff',
        panelBorder: '#c4b5fd',
        panelText: '#5b21b6',
        panelSoftBg: '#faf7ff',
        panelSoftBorder: '#ddd6fe',
        panelSoftText: '#5b21b6',
        shadowColor: 'rgba(139,92,246,0.18)'
    },
    cyan: {
        chipBg: '#ecfeff',
        chipBorder: '#67e8f9',
        chipText: '#155e75',
        chipHoverBg: '#cffafe',
        chipHoverBorder: '#22d3ee',
        chipHoverText: '#0f766e',
        panelBg: '#ecfeff',
        panelBorder: '#a5f3fc',
        panelText: '#155e75',
        panelSoftBg: '#f3fdff',
        panelSoftBorder: '#cffafe',
        panelSoftText: '#155e75',
        shadowColor: 'rgba(6,182,212,0.18)'
    },
    rose: {
        chipBg: '#fff1f2',
        chipBorder: '#fda4af',
        chipText: '#be123c',
        chipHoverBg: '#ffe4e6',
        chipHoverBorder: '#fb7185',
        chipHoverText: '#9f1239',
        panelBg: '#fff1f2',
        panelBorder: '#fecdd3',
        panelText: '#be123c',
        panelSoftBg: '#fff7f8',
        panelSoftBorder: '#ffe4e6',
        panelSoftText: '#be123c',
        shadowColor: 'rgba(244,63,94,0.18)'
    },
    orange: {
        chipBg: '#fff7ed',
        chipBorder: '#fdba74',
        chipText: '#9a3412',
        chipHoverBg: '#ffedd5',
        chipHoverBorder: '#fb923c',
        chipHoverText: '#9a3412',
        panelBg: '#fff7ed',
        panelBorder: '#fed7aa',
        panelText: '#9a3412',
        panelSoftBg: '#fffaf4',
        panelSoftBorder: '#ffedd5',
        panelSoftText: '#9a3412',
        shadowColor: 'rgba(251,146,60,0.18)'
    },
    slate: {
        chipBg: '#f8fafc',
        chipBorder: '#cbd5e1',
        chipText: '#475569',
        chipHoverBg: '#f1f5f9',
        chipHoverBorder: '#94a3b8',
        chipHoverText: '#334155',
        panelBg: '#f8fafc',
        panelBorder: '#e2e8f0',
        panelText: '#475569',
        panelSoftBg: '#fbfdff',
        panelSoftBorder: '#e2e8f0',
        panelSoftText: '#64748b',
        shadowColor: 'rgba(100,116,139,0.14)'
    }
}

const DARK_PALETTES: Record<UiToneLane, SemanticTonePalette> = {
    emerald: {
        chipBg: 'rgba(16,185,129,0.12)',
        chipBorder: 'rgba(52,211,153,0.32)',
        chipText: '#a7f3d0',
        chipHoverBg: 'rgba(16,185,129,0.18)',
        chipHoverBorder: 'rgba(52,211,153,0.52)',
        chipHoverText: '#d1fae5',
        panelBg: 'rgba(16,185,129,0.10)',
        panelBorder: 'rgba(52,211,153,0.24)',
        panelText: '#bbf7d0',
        panelSoftBg: 'rgba(16,185,129,0.07)',
        panelSoftBorder: 'rgba(52,211,153,0.16)',
        panelSoftText: '#a7f3d0',
        shadowColor: 'rgba(16,185,129,0.22)'
    },
    amber: {
        chipBg: 'rgba(245,158,11,0.12)',
        chipBorder: 'rgba(251,191,36,0.34)',
        chipText: '#fde68a',
        chipHoverBg: 'rgba(245,158,11,0.18)',
        chipHoverBorder: 'rgba(251,191,36,0.54)',
        chipHoverText: '#fef3c7',
        panelBg: 'rgba(245,158,11,0.10)',
        panelBorder: 'rgba(251,191,36,0.24)',
        panelText: '#fde68a',
        panelSoftBg: 'rgba(245,158,11,0.07)',
        panelSoftBorder: 'rgba(251,191,36,0.16)',
        panelSoftText: '#fde68a',
        shadowColor: 'rgba(245,158,11,0.22)'
    },
    fuchsia: {
        chipBg: 'rgba(217,70,239,0.12)',
        chipBorder: 'rgba(232,121,249,0.34)',
        chipText: '#f5d0fe',
        chipHoverBg: 'rgba(217,70,239,0.18)',
        chipHoverBorder: 'rgba(232,121,249,0.54)',
        chipHoverText: '#fae8ff',
        panelBg: 'rgba(217,70,239,0.10)',
        panelBorder: 'rgba(232,121,249,0.24)',
        panelText: '#f5d0fe',
        panelSoftBg: 'rgba(217,70,239,0.07)',
        panelSoftBorder: 'rgba(232,121,249,0.16)',
        panelSoftText: '#f5d0fe',
        shadowColor: 'rgba(217,70,239,0.22)'
    },
    blue: {
        chipBg: 'rgba(59,130,246,0.12)',
        chipBorder: 'rgba(96,165,250,0.34)',
        chipText: '#bfdbfe',
        chipHoverBg: 'rgba(59,130,246,0.18)',
        chipHoverBorder: 'rgba(96,165,250,0.54)',
        chipHoverText: '#dbeafe',
        panelBg: 'rgba(59,130,246,0.10)',
        panelBorder: 'rgba(96,165,250,0.24)',
        panelText: '#bfdbfe',
        panelSoftBg: 'rgba(59,130,246,0.07)',
        panelSoftBorder: 'rgba(96,165,250,0.16)',
        panelSoftText: '#bfdbfe',
        shadowColor: 'rgba(59,130,246,0.22)'
    },
    violet: {
        chipBg: 'rgba(139,92,246,0.12)',
        chipBorder: 'rgba(167,139,250,0.34)',
        chipText: '#ddd6fe',
        chipHoverBg: 'rgba(139,92,246,0.18)',
        chipHoverBorder: 'rgba(167,139,250,0.54)',
        chipHoverText: '#ede9fe',
        panelBg: 'rgba(139,92,246,0.10)',
        panelBorder: 'rgba(167,139,250,0.24)',
        panelText: '#ddd6fe',
        panelSoftBg: 'rgba(139,92,246,0.07)',
        panelSoftBorder: 'rgba(167,139,250,0.16)',
        panelSoftText: '#ddd6fe',
        shadowColor: 'rgba(139,92,246,0.22)'
    },
    cyan: {
        chipBg: 'rgba(6,182,212,0.12)',
        chipBorder: 'rgba(34,211,238,0.34)',
        chipText: '#a5f3fc',
        chipHoverBg: 'rgba(6,182,212,0.18)',
        chipHoverBorder: 'rgba(34,211,238,0.54)',
        chipHoverText: '#cffafe',
        panelBg: 'rgba(6,182,212,0.10)',
        panelBorder: 'rgba(34,211,238,0.24)',
        panelText: '#a5f3fc',
        panelSoftBg: 'rgba(6,182,212,0.07)',
        panelSoftBorder: 'rgba(34,211,238,0.16)',
        panelSoftText: '#a5f3fc',
        shadowColor: 'rgba(6,182,212,0.22)'
    },
    rose: {
        chipBg: 'rgba(244,63,94,0.12)',
        chipBorder: 'rgba(251,113,133,0.34)',
        chipText: '#fecdd3',
        chipHoverBg: 'rgba(244,63,94,0.18)',
        chipHoverBorder: 'rgba(251,113,133,0.54)',
        chipHoverText: '#ffe4e6',
        panelBg: 'rgba(244,63,94,0.10)',
        panelBorder: 'rgba(251,113,133,0.24)',
        panelText: '#fecdd3',
        panelSoftBg: 'rgba(244,63,94,0.07)',
        panelSoftBorder: 'rgba(251,113,133,0.16)',
        panelSoftText: '#fecdd3',
        shadowColor: 'rgba(244,63,94,0.22)'
    },
    orange: {
        chipBg: 'rgba(249,115,22,0.12)',
        chipBorder: 'rgba(251,146,60,0.34)',
        chipText: '#fed7aa',
        chipHoverBg: 'rgba(249,115,22,0.18)',
        chipHoverBorder: 'rgba(251,146,60,0.54)',
        chipHoverText: '#ffedd5',
        panelBg: 'rgba(249,115,22,0.10)',
        panelBorder: 'rgba(251,146,60,0.24)',
        panelText: '#fed7aa',
        panelSoftBg: 'rgba(249,115,22,0.07)',
        panelSoftBorder: 'rgba(251,146,60,0.16)',
        panelSoftText: '#fed7aa',
        shadowColor: 'rgba(249,115,22,0.22)'
    },
    slate: {
        chipBg: 'rgba(148,163,184,0.12)',
        chipBorder: 'rgba(148,163,184,0.26)',
        chipText: '#cbd5e1',
        chipHoverBg: 'rgba(148,163,184,0.18)',
        chipHoverBorder: 'rgba(148,163,184,0.42)',
        chipHoverText: '#e2e8f0',
        panelBg: 'rgba(148,163,184,0.08)',
        panelBorder: 'rgba(148,163,184,0.14)',
        panelText: '#cbd5e1',
        panelSoftBg: 'rgba(148,163,184,0.05)',
        panelSoftBorder: 'rgba(148,163,184,0.10)',
        panelSoftText: '#cbd5e1',
        shadowColor: 'rgba(148,163,184,0.18)'
    }
}

export function getSemanticTonePalette(lane: UiToneLane, theme: Theme): SemanticTonePalette {
    if (theme === 'claro') return LIGHT_PALETTES[lane]
    if (theme === 'gris') {
        const darkLike = DARK_PALETTES[lane]
        return {
            ...darkLike,
            chipBg: darkLike.chipBg.replace(/0\.12\)/, '0.14)').replace(/0\.10\)/, '0.12)'),
            chipBorder: darkLike.chipBorder.replace(/0\.34\)/, '0.38)').replace(/0\.26\)/, '0.30)'),
            panelBg: darkLike.panelBg.replace(/0\.10\)/, '0.11)').replace(/0\.08\)/, '0.09)'),
            panelBorder: darkLike.panelBorder.replace(/0\.24\)/, '0.28)').replace(/0\.14\)/, '0.18)'),
            panelSoftBg: darkLike.panelSoftBg.replace(/0\.07\)/, '0.08)').replace(/0\.05\)/, '0.06)'),
            panelSoftBorder: darkLike.panelSoftBorder.replace(/0\.16\)/, '0.18)').replace(/0\.10\)/, '0.12)')
        }
    }
    return DARK_PALETTES[lane]
}

export function buildSemanticToneCssVars(palette: SemanticTonePalette): Record<string, string> {
    return {
        '--tone-chip-bg': palette.chipBg,
        '--tone-chip-border': palette.chipBorder,
        '--tone-chip-text': palette.chipText,
        '--tone-chip-hover-bg': palette.chipHoverBg,
        '--tone-chip-hover-border': palette.chipHoverBorder,
        '--tone-chip-hover-text': palette.chipHoverText,
        '--tone-panel-bg': palette.panelBg,
        '--tone-panel-border': palette.panelBorder,
        '--tone-panel-text': palette.panelText,
        '--tone-panel-soft-bg': palette.panelSoftBg,
        '--tone-panel-soft-border': palette.panelSoftBorder,
        '--tone-panel-soft-text': palette.panelSoftText,
        '--tone-shadow': palette.shadowColor
    }
}

function normalizeAreaName(areaName: string): string {
    return String(areaName || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
}

export function getAreaToneLane(areaName: string, index = 0): UiToneLane {
    const normalized = normalizeAreaName(areaName)

    if (
        normalized.includes('comercial')
        || normalized.includes('ventas')
        || normalized.includes('venta')
        || normalized.includes('customer success')
    ) {
        return 'emerald'
    }

    if (
        normalized.includes('finanza')
        || normalized.includes('administracion')
        || normalized.includes('operacion')
        || normalized === 'rh'
        || normalized.includes('recursos humanos')
    ) {
        return 'amber'
    }

    if (
        normalized.includes('marketing')
        || normalized.includes('diseno')
        || normalized.includes('direccion')
        || normalized.includes('producto')
        || normalized.includes('directores')
    ) {
        return 'fuchsia'
    }

    if (
        normalized.includes('tecnolog')
        || normalized.includes('desarrollo')
        || normalized.includes('developer')
        || normalized.includes('developers')
        || normalized.includes('datos')
        || normalized.includes('bi')
        || normalized.includes('soporte')
    ) {
        return 'blue'
    }

    const lanes: UiToneLane[] = ['emerald', 'amber', 'fuchsia', 'blue']
    return lanes[Math.abs(index) % lanes.length]
}

export function getAreaTonePalette(areaName: string, index: number, theme: Theme): SemanticTonePalette {
    return getSemanticTonePalette(getAreaToneLane(areaName, index), theme)
}

export function getProjectStageToneLane(stage?: string | null): UiToneLane {
    const s = String(stage || '')
    if (s === 'implemented_real') return 'emerald'
    if (s === 'in_negotiation' || s === 'forecasted') return 'amber'
    if (s === 'prospection_same_close') return 'fuchsia'
    if (s === 'future_lead_opportunity') return 'blue'
    return 'slate'
}

export function getLeadStageToneLane(stage?: string | null): UiToneLane {
    const s = String(stage || '').trim().toLowerCase()
    if (s === 'cerrado ganado' || s === 'cerrada ganada') return 'emerald'
    if (s === 'cerrado perdido' || s === 'cerrada perdida') return 'rose'
    if (s === 'negociación' || s === 'negociacion') return 'amber'
    if (s === 'prospección' || s === 'prospeccion') return 'fuchsia'
    if (!s) return 'slate'
    return 'blue'
}

export function getMeetingStatusToneLane(status?: string | null): UiToneLane {
    const s = String(status || '').trim().toLowerCase()
    if (s === 'completed' || s === 'finished' || s === 'confirmed') return 'emerald'
    if (s === 'cancelled' || s === 'canceled' || s === 'no_show') return 'rose'
    if (s === 'pending_confirmation') return 'amber'
    if (!s) return 'slate'
    return 'blue'
}

export function getTaskStatusToneLane(status?: string | null): UiToneLane {
    const s = String(status || '').trim().toLowerCase()
    if (s === 'completada' || s === 'completed') return 'emerald'
    if (s === 'atrasada' || s === 'overdue') return 'rose'
    if (s === 'pendiente' || s === 'pending') return 'amber'
    return 'blue'
}

export function getCompanyNoteTypeToneLane(type?: string | null): UiToneLane {
    const t = String(type || '').trim().toLowerCase()
    if (t === 'riesgo') return 'rose'
    if (t === 'acuerdo') return 'emerald'
    if (t === 'seguimiento') return 'blue'
    if (t === 'contexto') return 'violet'
    return 'slate'
}

