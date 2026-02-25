'use client'

import type { CSSProperties } from 'react'
import type { LucideIcon } from 'lucide-react'

type BadgeMedallionSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

// Experimental visual toggle: isolated outer ring with visible gap (Pokemon GO-like).
// Revert quickly by changing this to false.
const BADGE_ISOLATED_RING_EXPERIMENT = true

interface BadgeMedallionProps {
    icon: LucideIcon
    centerClassName: string
    iconClassName?: string
    overlayText?: string | null
    footerBubbleText?: string | null
    size?: BadgeMedallionSize
    className?: string
    iconSize?: number
    strokeWidth?: number
    normalizeIconMetrics?: boolean
    ringStyle?: 'match' | 'gold' | 'bronze' | 'silver' | 'royal' | 'royal_dark' | 'royal_dark_vivid' | 'royal_gold' | 'royal_purple'
    coreBorderColorClassName?: string
    coreBorderStyle?: CSSProperties
    cornerTagText?: string | null
    cornerTagClassName?: string
    cornerTagVariant?: 'label' | 'dot'
    cornerTagPlacement?: 'top-right' | 'bottom'
}

const SIZE_MAP: Record<BadgeMedallionSize, {
    wrap: string
    ring2Inset: string
    ring3Inset: string
    coreInset: string
    coreInsetIsolated: string
    gapInset: string
    defaultIconSize: number
    overlayTextClass: string
    overlayBottom: string
    iconLiftWithNumber: string
    footerBubbleTextClass: string
    footerBubbleBottom: string
    coreBorderWidthIsolatedClass: string
    coreBorderWidthDefaultClass: string
}> = {
    xs: {
        wrap: 'w-10 h-10',
        ring2Inset: 'inset-0',
        ring3Inset: 'inset-[2px]',
        coreInset: 'inset-[7px]',
        coreInsetIsolated: 'inset-[7px]',
        gapInset: 'inset-[4px]',
        defaultIconSize: 13,
        overlayTextClass: 'text-[8px]',
        overlayBottom: 'bottom-[1px]',
        iconLiftWithNumber: '-translate-y-[2px]'
        ,footerBubbleTextClass: 'text-[7px] px-1 min-w-[14px] h-[12px]',
        footerBubbleBottom: '-bottom-[2px]',
        coreBorderWidthIsolatedClass: 'border-[2px]',
        coreBorderWidthDefaultClass: 'border'
    },
    sm: {
        wrap: 'w-12 h-12',
        ring2Inset: 'inset-0',
        ring3Inset: 'inset-[2px]',
        coreInset: 'inset-[8px]',
        coreInsetIsolated: 'inset-[8px]',
        gapInset: 'inset-[5px]',
        defaultIconSize: 14,
        overlayTextClass: 'text-[9px]',
        overlayBottom: 'bottom-[1px]',
        iconLiftWithNumber: '-translate-y-[4px]'
        ,footerBubbleTextClass: 'text-[7px] px-1 min-w-[14px] h-[12px]',
        footerBubbleBottom: '-bottom-[2px]',
        coreBorderWidthIsolatedClass: 'border-[2px]',
        coreBorderWidthDefaultClass: 'border'
    },
    md: {
        wrap: 'w-14 h-14',
        ring2Inset: 'inset-0',
        ring3Inset: 'inset-[2px]',
        coreInset: 'inset-[10px]',
        coreInsetIsolated: 'inset-[9px]',
        gapInset: 'inset-[6px]',
        defaultIconSize: 18,
        overlayTextClass: 'text-[10px]',
        overlayBottom: 'bottom-[2px]',
        iconLiftWithNumber: '-translate-y-[4px]'
        ,footerBubbleTextClass: 'text-[8px] px-1.5 min-w-[16px] h-[14px]',
        footerBubbleBottom: '-bottom-[2px]',
        coreBorderWidthIsolatedClass: 'border-[3px]',
        coreBorderWidthDefaultClass: 'border'
    },
    lg: {
        wrap: 'w-16 h-16',
        ring2Inset: 'inset-[1px]',
        ring3Inset: 'inset-[3px]',
        coreInset: 'inset-[12px]',
        coreInsetIsolated: 'inset-[11px]',
        gapInset: 'inset-[7px]',
        defaultIconSize: 20,
        overlayTextClass: 'text-[10px]',
        overlayBottom: 'bottom-[2px]',
        iconLiftWithNumber: '-translate-y-[4px]'
        ,footerBubbleTextClass: 'text-[8px] px-1.5 min-w-[16px] h-[14px]',
        footerBubbleBottom: '-bottom-[2px]',
        coreBorderWidthIsolatedClass: 'border-[3px]',
        coreBorderWidthDefaultClass: 'border'
    },
    xl: {
        wrap: 'w-28 h-28 md:w-32 md:h-32',
        ring2Inset: 'inset-[2px] md:inset-[3px]',
        ring3Inset: 'inset-[5px] md:inset-[6px]',
        coreInset: 'inset-[16px] md:inset-[18px]',
        coreInsetIsolated: 'inset-[15px] md:inset-[17px]',
        gapInset: 'inset-[8px] md:inset-[10px]',
        defaultIconSize: 42,
        overlayTextClass: 'text-[14px]',
        overlayBottom: 'bottom-[6px]',
        iconLiftWithNumber: '-translate-y-[6px]'
        ,footerBubbleTextClass: 'text-[11px] px-2 min-w-[24px] h-[18px]',
        footerBubbleBottom: '-bottom-[2px]',
        coreBorderWidthIsolatedClass: 'border-[4px] md:border-[5px]',
        coreBorderWidthDefaultClass: 'border md:border-[2px]'
    }
}

export default function BadgeMedallion({
    icon: Icon,
    centerClassName,
    iconClassName = 'text-white',
    overlayText,
    footerBubbleText,
    size = 'md',
    className = '',
    iconSize,
    strokeWidth = 2.5,
    normalizeIconMetrics = true,
    ringStyle = 'match',
    coreBorderColorClassName = '',
    coreBorderStyle,
    cornerTagText = null,
    cornerTagClassName = '',
    cornerTagVariant = 'label',
    cornerTagPlacement = 'top-right'
}: BadgeMedallionProps) {
    const s = SIZE_MAP[size]
    const normalizedStrokeWidthBySize: Record<BadgeMedallionSize, number> = {
        xs: 2.25,
        sm: 2.35,
        md: 2.5,
        lg: 2.55,
        xl: 2.6
    }
    const effectiveIconSize = normalizeIconMetrics ? s.defaultIconSize : (iconSize || s.defaultIconSize)
    const effectiveStrokeWidth = normalizeIconMetrics ? normalizedStrokeWidthBySize[size] : strokeWidth
    const showIsolatedRing = BADGE_ISOLATED_RING_EXPERIMENT
    const activeCoreInset = showIsolatedRing ? s.coreInsetIsolated : s.coreInset
    const coreBorderClass = showIsolatedRing ? s.coreBorderWidthIsolatedClass : s.coreBorderWidthDefaultClass
    const defaultCoreBorderToneClass = 'border-white/40 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]'
    const ringToneMap = {
        gold: {
            outer: 'bg-gradient-to-br from-[#fff8cf] via-[#facc15] to-[#b45309] shadow-[0_10px_24px_rgba(245,158,11,0.25),0_4px_10px_rgba(0,0,0,0.28)]',
            mid: 'bg-gradient-to-br from-[#fffdf1] via-[#fde68a] to-[#d97706] shadow-[inset_0_1px_0_rgba(255,255,255,0.85),inset_0_-2px_4px_rgba(146,64,14,0.35)]',
            gloss: 'bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.8),rgba(255,255,255,0.15)_35%,rgba(180,83,9,0.22)_80%)]'
        },
        bronze: {
            outer: 'bg-gradient-to-br from-[#e9b790] via-[#9a552a] to-[#4a2713] shadow-[0_10px_24px_rgba(154,85,42,0.24),0_4px_10px_rgba(0,0,0,0.30)]',
            mid: 'bg-gradient-to-br from-[#f4d2b8] via-[#b86a37] to-[#61331a] shadow-[inset_0_1px_0_rgba(255,255,255,0.70),inset_0_-2px_4px_rgba(74,39,19,0.35)]',
            gloss: 'bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.72),rgba(255,255,255,0.12)_34%,rgba(97,51,26,0.26)_82%)]'
        },
        silver: {
            outer: 'bg-gradient-to-br from-[#fbfdff] via-[#c7d0de] to-[#667085] shadow-[0_10px_24px_rgba(148,163,184,0.22),0_4px_10px_rgba(0,0,0,0.28)]',
            mid: 'bg-gradient-to-br from-[#ffffff] via-[#e2e8f0] to-[#94a3b8] shadow-[inset_0_1px_0_rgba(255,255,255,0.85),inset_0_-2px_4px_rgba(71,85,105,0.22)]',
            gloss: 'bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.85),rgba(255,255,255,0.15)_35%,rgba(71,85,105,0.18)_80%)]'
        },
        royal: {
            outer: 'bg-[radial-gradient(circle_at_78%_18%,rgba(109,40,217,0.92),rgba(109,40,217,0)_34%),radial-gradient(circle_at_60%_78%,rgba(124,58,237,0.72),rgba(124,58,237,0)_36%),radial-gradient(circle_at_22%_72%,rgba(30,64,175,0.84),rgba(30,64,175,0)_34%),radial-gradient(circle_at_76%_76%,rgba(2,132,199,0.66),rgba(2,132,199,0)_34%),radial-gradient(circle_at_50%_18%,rgba(234,179,8,0.56),rgba(234,179,8,0)_28%),radial-gradient(circle_at_16%_34%,rgba(34,197,94,0.50),rgba(34,197,94,0)_26%),conic-gradient(from_220deg,#f7fbff_0deg,#d5deee_26deg,#b4d5ff_58deg,#60a5fa_94deg,#1d4ed8_126deg,#6d28d9_164deg,#a855f7_202deg,#c4b5fd_236deg,#84cc16_272deg,#facc15_304deg,#38bdf8_334deg,#f4f8ff_360deg)] shadow-[0_12px_26px_rgba(76,29,149,0.40),0_4px_10px_rgba(0,0,0,0.32)]',
            mid: 'bg-[radial-gradient(circle_at_76%_28%,rgba(109,40,217,0.66),rgba(109,40,217,0)_30%),radial-gradient(circle_at_24%_70%,rgba(30,64,175,0.58),rgba(30,64,175,0)_28%),radial-gradient(circle_at_62%_74%,rgba(124,58,237,0.50),rgba(124,58,237,0)_28%),radial-gradient(circle_at_56%_20%,rgba(250,204,21,0.40),rgba(250,204,21,0)_24%),radial-gradient(circle_at_20%_40%,rgba(74,222,128,0.34),rgba(74,222,128,0)_22%),conic-gradient(from_208deg,#ffffff_0deg,#ebf2ff_30deg,#cbe1ff_70deg,#7dc2ff_104deg,#3b82f6_132deg,#7c3aed_172deg,#c084fc_208deg,#d8b4fe_238deg,#a3e635_274deg,#fde047_304deg,#67e8f9_336deg,#ffffff_360deg)] shadow-[inset_0_1px_0_rgba(255,255,255,0.98),inset_0_-2px_4px_rgba(76,29,149,0.28)]',
            gloss: 'bg-[radial-gradient(circle_at_28%_16%,rgba(255,255,255,1),rgba(255,255,255,0.34)_24%,rgba(59,130,246,0.44)_38%,rgba(109,40,217,0.64)_56%,rgba(168,85,247,0.36)_66%,rgba(250,204,21,0.28)_78%,rgba(132,204,22,0.24)_86%,rgba(76,29,149,0.26)_100%)]'
        },
        royal_dark: {
            outer: 'bg-[radial-gradient(circle_at_78%_18%,rgba(109,40,217,0.44),rgba(109,40,217,0)_34%),radial-gradient(circle_at_22%_72%,rgba(30,64,175,0.41),rgba(30,64,175,0)_34%),radial-gradient(circle_at_76%_76%,rgba(2,132,199,0.31),rgba(2,132,199,0)_34%),radial-gradient(circle_at_50%_18%,rgba(234,179,8,0.22),rgba(234,179,8,0)_28%),radial-gradient(circle_at_16%_34%,rgba(34,197,94,0.20),rgba(34,197,94,0)_26%),conic-gradient(from_220deg,#4b5563_0deg,#374151_34deg,#4b5563_78deg,#4f6f9c_112deg,#27457f_144deg,#523081_184deg,#6c46a8_220deg,#5b4790_252deg,#6f8c34_288deg,#a58c2a_316deg,#3f7e8f_340deg,#4b5563_360deg)] shadow-[0_12px_26px_rgba(17,24,39,0.55),0_4px_10px_rgba(0,0,0,0.38)]',
            mid: 'bg-[radial-gradient(circle_at_76%_28%,rgba(109,40,217,0.26),rgba(109,40,217,0)_30%),radial-gradient(circle_at_24%_70%,rgba(30,64,175,0.24),rgba(30,64,175,0)_28%),radial-gradient(circle_at_56%_20%,rgba(250,204,21,0.15),rgba(250,204,21,0)_24%),radial-gradient(circle_at_20%_40%,rgba(74,222,128,0.12),rgba(74,222,128,0)_22%),conic-gradient(from_208deg,#6b7280_0deg,#4b5563_34deg,#374151_78deg,#5674a0_118deg,#345b9a_150deg,#62439c_190deg,#9574c7_224deg,#7862aa_252deg,#73923b_290deg,#b29a38_318deg,#5f98a1_340deg,#6b7280_360deg)] shadow-[inset_0_1px_0_rgba(255,255,255,0.55),inset_0_-2px_4px_rgba(17,24,39,0.45)]',
            gloss: 'bg-[radial-gradient(circle_at_28%_16%,rgba(255,255,255,0.78),rgba(255,255,255,0.14)_24%,rgba(59,130,246,0.15)_38%,rgba(109,40,217,0.21)_56%,rgba(168,85,247,0.12)_66%,rgba(250,204,21,0.09)_78%,rgba(132,204,22,0.08)_86%,rgba(17,24,39,0.30)_100%)]'
        },
        royal_dark_vivid: {
            outer: 'bg-[radial-gradient(circle_at_78%_18%,rgba(124,58,237,0.98),rgba(124,58,237,0)_34%),radial-gradient(circle_at_22%_72%,rgba(29,78,216,0.92),rgba(29,78,216,0)_34%),radial-gradient(circle_at_76%_76%,rgba(14,165,233,0.80),rgba(14,165,233,0)_34%),radial-gradient(circle_at_50%_18%,rgba(250,204,21,0.56),rgba(250,204,21,0)_28%),radial-gradient(circle_at_16%_34%,rgba(34,197,94,0.46),rgba(34,197,94,0)_26%),conic-gradient(from_220deg,#495567_0deg,#1a2230_34deg,#303b4d_78deg,#5a79ad_112deg,#2360c0_144deg,#4b2c8f_184deg,#8b4dff_220deg,#b794ff_252deg,#6a8d33_288deg,#bf9f2e_316deg,#2f95b6_340deg,#495567_360deg)] shadow-[0_12px_26px_rgba(17,24,39,0.66),0_4px_10px_rgba(0,0,0,0.46)]',
            mid: 'bg-[radial-gradient(circle_at_76%_28%,rgba(124,58,237,0.66),rgba(124,58,237,0)_30%),radial-gradient(circle_at_24%_70%,rgba(29,78,216,0.58),rgba(29,78,216,0)_28%),radial-gradient(circle_at_56%_20%,rgba(250,204,21,0.30),rgba(250,204,21,0)_24%),radial-gradient(circle_at_20%_40%,rgba(74,222,128,0.20),rgba(74,222,128,0)_22%),conic-gradient(from_208deg,#8b99ad_0deg,#596678_34deg,#2a3342_78deg,#6383b8_118deg,#3470cc_150deg,#6941af_190deg,#a06ef6_224deg,#957fce_252deg,#7ca446_290deg,#c5a64a_318deg,#5aa5bd_340deg,#8b99ad_360deg)] shadow-[inset_0_1px_0_rgba(255,255,255,0.66),inset_0_-2px_4px_rgba(17,24,39,0.48)]',
            gloss: 'bg-[radial-gradient(circle_at_28%_16%,rgba(255,255,255,0.92),rgba(255,255,255,0.18)_24%,rgba(59,130,246,0.30)_38%,rgba(109,40,217,0.42)_56%,rgba(168,85,247,0.22)_66%,rgba(250,204,21,0.16)_78%,rgba(132,204,22,0.14)_86%,rgba(17,24,39,0.24)_100%)]'
        },
        royal_gold: {
            outer: 'bg-[radial-gradient(circle_at_78%_18%,rgba(109,40,217,0.56),rgba(109,40,217,0)_34%),radial-gradient(circle_at_22%_72%,rgba(30,64,175,0.48),rgba(30,64,175,0)_34%),radial-gradient(circle_at_76%_76%,rgba(2,132,199,0.36),rgba(2,132,199,0)_34%),radial-gradient(circle_at_50%_18%,rgba(234,179,8,0.44),rgba(234,179,8,0)_28%),radial-gradient(circle_at_16%_34%,rgba(34,197,94,0.24),rgba(34,197,94,0)_26%),conic-gradient(from_220deg,#fff1bf_0deg,#eecf78_34deg,#c99322_78deg,#d2a642_112deg,#8a6a1a_144deg,#5b3ea5_184deg,#8f63da_220deg,#8d76c5_252deg,#9ca744_288deg,#ddb539_316deg,#79adbc_340deg,#fff1bf_360deg)] shadow-[0_12px_26px_rgba(146,101,14,0.42),0_4px_10px_rgba(0,0,0,0.34)]',
            mid: 'bg-[radial-gradient(circle_at_76%_28%,rgba(109,40,217,0.28),rgba(109,40,217,0)_30%),radial-gradient(circle_at_24%_70%,rgba(30,64,175,0.22),rgba(30,64,175,0)_28%),radial-gradient(circle_at_56%_20%,rgba(250,204,21,0.22),rgba(250,204,21,0)_24%),radial-gradient(circle_at_20%_40%,rgba(74,222,128,0.10),rgba(74,222,128,0)_22%),conic-gradient(from_208deg,#fff4cf_0deg,#f0d690_34deg,#cc9f3a_78deg,#b28528_118deg,#6f561b_150deg,#704fbd_190deg,#a27ce8_224deg,#907bbf_252deg,#8f9f45_290deg,#d9b146_318deg,#7aabb7_340deg,#fff4cf_360deg)] shadow-[inset_0_1px_0_rgba(255,255,255,0.72),inset_0_-2px_4px_rgba(113,78,17,0.36)]',
            gloss: 'bg-[radial-gradient(circle_at_28%_16%,rgba(255,255,255,0.9),rgba(255,255,255,0.18)_24%,rgba(250,204,21,0.18)_38%,rgba(59,130,246,0.14)_56%,rgba(109,40,217,0.16)_66%,rgba(17,24,39,0.18)_100%)]'
        },
        royal_purple: {
            outer: 'bg-[radial-gradient(circle_at_78%_18%,rgba(109,40,217,0.72),rgba(109,40,217,0)_34%),radial-gradient(circle_at_22%_72%,rgba(30,64,175,0.40),rgba(30,64,175,0)_34%),radial-gradient(circle_at_76%_76%,rgba(2,132,199,0.28),rgba(2,132,199,0)_34%),radial-gradient(circle_at_50%_18%,rgba(234,179,8,0.20),rgba(234,179,8,0)_28%),radial-gradient(circle_at_16%_34%,rgba(34,197,94,0.14),rgba(34,197,94,0)_26%),conic-gradient(from_220deg,#ddd1ff_0deg,#a88fe8_34deg,#7b58c9_78deg,#5a35a4_112deg,#3b236e_144deg,#5224a8_184deg,#8c4dff_220deg,#b889ff_252deg,#5f5cc7_288deg,#7e66d5_316deg,#6da7ca_340deg,#ddd1ff_360deg)] shadow-[0_12px_26px_rgba(76,29,149,0.48),0_4px_10px_rgba(0,0,0,0.34)]',
            mid: 'bg-[radial-gradient(circle_at_76%_28%,rgba(109,40,217,0.34),rgba(109,40,217,0)_30%),radial-gradient(circle_at_24%_70%,rgba(30,64,175,0.18),rgba(30,64,175,0)_28%),radial-gradient(circle_at_56%_20%,rgba(250,204,21,0.10),rgba(250,204,21,0)_24%),conic-gradient(from_208deg,#ede7ff_0deg,#c7b7f7_34deg,#9e84e6_78deg,#6f4bc2_118deg,#482e8c_150deg,#5f2bc4_190deg,#9d6cff_224deg,#b996ff_252deg,#7774db_290deg,#8b77e0_318deg,#7db5d0_340deg,#ede7ff_360deg)] shadow-[inset_0_1px_0_rgba(255,255,255,0.75),inset_0_-2px_4px_rgba(49,21,94,0.34)]',
            gloss: 'bg-[radial-gradient(circle_at_28%_16%,rgba(255,255,255,0.88),rgba(255,255,255,0.16)_24%,rgba(168,85,247,0.16)_38%,rgba(59,130,246,0.10)_56%,rgba(17,24,39,0.20)_100%)]'
        }
    } as const
    const ringTone = ringStyle !== 'match' ? ringToneMap[ringStyle] : null
    const outerRingClass = ringTone
        ? ringTone.outer
        : `${centerClassName} shadow-[0_10px_24px_rgba(15,23,42,0.22),0_4px_10px_rgba(0,0,0,0.24)]`
    const midRingClass = ringTone
        ? ringTone.mid
        : `${centerClassName} shadow-[inset_0_1px_0_rgba(255,255,255,0.65),inset_0_-2px_4px_rgba(0,0,0,0.22)]`
    const innerRingGlossClass = ringTone
        ? ringTone.gloss
        : `${centerClassName} bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.75),rgba(255,255,255,0.14)_35%,rgba(15,23,42,0.15)_80%)]`
    const bottomNumberText = footerBubbleText || overlayText
    const hasBottomNumber = Boolean(bottomNumberText)

    return (
        <span
            className={`relative inline-flex ${s.wrap} rounded-full shrink-0 ${className}`.trim()}
            style={{
                transform: 'translateZ(0)',
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
                contain: 'paint'
            }}
        >
            <span className={`absolute inset-0 rounded-full ${outerRingClass}`} />
            <span className={`absolute ${s.ring2Inset} rounded-full ${midRingClass}`} />
            <span className={`absolute ${s.ring3Inset} rounded-full border border-white/55 ${innerRingGlossClass} shadow-[inset_0_1px_0_rgba(255,255,255,0.7),inset_0_-1px_0_rgba(0,0,0,0.14)]`} />
            {showIsolatedRing ? (
                <span
                    className={`absolute ${s.gapInset} rounded-full border border-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]`}
                    style={{
                        background: 'color-mix(in srgb, var(--card-bg) 70%, transparent)'
                    }}
                />
            ) : null}

            <span
                className={`absolute ${activeCoreInset} rounded-full overflow-hidden ${coreBorderClass} ${defaultCoreBorderToneClass} flex items-center justify-center ${centerClassName} ${coreBorderColorClassName}`.trim()}
                style={coreBorderStyle}
            >
                <span className='absolute inset-0 opacity-30 bg-[linear-gradient(140deg,rgba(255,255,255,0.65),transparent_42%,transparent_60%,rgba(255,255,255,0.22))]' />
                <Icon
                    size={effectiveIconSize}
                    strokeWidth={effectiveStrokeWidth}
                    className={`relative z-[1] ${hasBottomNumber ? s.iconLiftWithNumber : ''} ${iconClassName}`.trim()}
                />
                {hasBottomNumber ? (
                    <>
                        <span
                            className={`absolute ${s.overlayBottom} left-1/2 -translate-x-1/2 ${s.overlayTextClass} ${footerBubbleText ? 'scale-[1.14]' : 'scale-[1.05]'} origin-center leading-none font-black text-white z-[2] tabular-nums tracking-tight`}
                            style={{
                                textRendering: 'geometricPrecision',
                                textShadow: '0 1px 1px rgba(0,0,0,0.35)'
                            }}
                        >
                            {bottomNumberText}
                        </span>
                    </>
                ) : null}
            </span>
            {(cornerTagText || (cornerTagVariant === 'dot' && cornerTagClassName.trim())) ? (
                cornerTagVariant === 'dot' ? (
                    <span
                        aria-hidden='true'
                        className={`absolute ${cornerTagPlacement === 'bottom' ? '-bottom-0.5 left-1/2 -translate-x-1/2' : '-top-0.5 -right-0.5'} z-[4] rounded-full border w-3.5 h-1.5 shadow-[0_4px_10px_rgba(0,0,0,0.25)] ${cornerTagClassName}`.trim()}
                    />
                ) : (
                    <span
                        className={`absolute ${cornerTagPlacement === 'bottom' ? '-bottom-1 left-1/2 -translate-x-1/2' : '-top-1 -right-1'} z-[4] rounded-full border px-1.5 py-[1px] text-[7px] leading-none font-black uppercase tracking-[0.08em] shadow-[0_4px_10px_rgba(0,0,0,0.25)] ${cornerTagClassName}`.trim()}
                    >
                        {cornerTagText}
                    </span>
                )
            ) : null}
        </span>
    )
}
