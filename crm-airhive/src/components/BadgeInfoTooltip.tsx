'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type BadgeInfoRow = {
    label: string
    value: string
}

interface BadgeInfoTooltipProps {
    title: string
    subtitle?: string
    rows?: BadgeInfoRow[]
    children: ReactNode
    className?: string
    mode?: 'floating' | 'inline'
    align?: 'center' | 'start' | 'end'
    placement?: 'top' | 'bottom'
    density?: 'default' | 'compact'
}

export default function BadgeInfoTooltip({
    title,
    subtitle,
    rows = [],
    children,
    className = '',
    mode = 'floating',
    align = 'center',
    placement = 'top',
    density = 'default'
}: BadgeInfoTooltipProps) {
    const sanitizedRows = rows.filter((row) => row && String(row.value || '').trim().length > 0)
    const triggerRef = useRef<HTMLSpanElement | null>(null)
    const portalBubbleRef = useRef<HTMLSpanElement | null>(null)
    const [isOpen, setIsOpen] = useState(false)
    const [portalPos, setPortalPos] = useState<{ left: number; top: number; side: 'top' | 'bottom'; arrowLeft: number } | null>(null)

    const recomputePortalPosition = useCallback(() => {
        if (mode !== 'floating') return
        if (!isOpen) return
        const triggerEl = triggerRef.current
        const bubbleEl = portalBubbleRef.current
        if (!triggerEl || !bubbleEl) return

        const triggerRect = triggerEl.getBoundingClientRect()
        const bubbleRect = bubbleEl.getBoundingClientRect()
        const viewportW = window.innerWidth
        const viewportH = window.innerHeight
        const gap = 10
        const padding = 8

        const preferredTop = placement !== 'bottom'
        const canFitTop = triggerRect.top >= bubbleRect.height + gap + padding
        const canFitBottom = (viewportH - triggerRect.bottom) >= bubbleRect.height + gap + padding
        const side: 'top' | 'bottom' = preferredTop
            ? (canFitTop || !canFitBottom ? 'top' : 'bottom')
            : (canFitBottom || !canFitTop ? 'bottom' : 'top')

        let left = 0
        if (align === 'start') {
            left = triggerRect.left
        } else if (align === 'end') {
            left = triggerRect.right - bubbleRect.width
        } else {
            left = triggerRect.left + (triggerRect.width / 2) - (bubbleRect.width / 2)
        }
        left = Math.max(padding, Math.min(left, viewportW - bubbleRect.width - padding))

        let top = side === 'top'
            ? triggerRect.top - bubbleRect.height - gap
            : triggerRect.bottom + gap
        top = Math.max(padding, Math.min(top, viewportH - bubbleRect.height - padding))

        const arrowLeft = Math.max(12, Math.min(triggerRect.left + triggerRect.width / 2 - left, bubbleRect.width - 12))
        setPortalPos({ left, top, side, arrowLeft })
    }, [align, isOpen, mode, placement])

    useLayoutEffect(() => {
        recomputePortalPosition()
    }, [recomputePortalPosition, title, subtitle, sanitizedRows.length])

    useEffect(() => {
        if (mode !== 'floating' || !isOpen) return
        const onViewportChange = () => recomputePortalPosition()
        window.addEventListener('resize', onViewportChange)
        window.addEventListener('scroll', onViewportChange, true)
        return () => {
            window.removeEventListener('resize', onViewportChange)
            window.removeEventListener('scroll', onViewportChange, true)
        }
    }, [isOpen, mode, recomputePortalPosition])

    if (mode === 'inline') {
        return (
            <span
                className={`ah-badge-tooltip group ah-badge-tooltip--inline ${align === 'start' ? 'ah-badge-tooltip--start' : ''} ${align === 'end' ? 'ah-badge-tooltip--end' : ''} ${density === 'compact' ? 'ah-badge-tooltip--compact' : ''} ${className}`.trim()}
                data-placement={placement}
            >
                {children}
                <span className='ah-badge-tooltip-bubble' role='tooltip' aria-hidden='true'>
                    <span className='ah-badge-tooltip-title'>{title}</span>
                    {subtitle ? <span className='ah-badge-tooltip-subtitle'>{subtitle}</span> : null}
                    {sanitizedRows.length > 0 ? (
                        <span className='ah-badge-tooltip-rows'>
                            {sanitizedRows.map((row) => (
                                <span key={`${row.label}-${row.value}`} className='ah-badge-tooltip-row'>
                                    <span className='ah-badge-tooltip-label'>{row.label}</span>
                                    <span className='ah-badge-tooltip-value'>{row.value}</span>
                                </span>
                            ))}
                        </span>
                    ) : null}
                </span>
            </span>
        )
    }

    return (
        <span
            ref={triggerRef}
            className={`ah-badge-tooltip group ${align === 'start' ? 'ah-badge-tooltip--start' : ''} ${align === 'end' ? 'ah-badge-tooltip--end' : ''} ${density === 'compact' ? 'ah-badge-tooltip--compact' : ''} ${className}`.trim()}
            data-placement={placement}
            onMouseEnter={() => setIsOpen(true)}
            onMouseLeave={() => setIsOpen(false)}
            onFocusCapture={() => setIsOpen(true)}
            onBlurCapture={(event) => {
                const nextTarget = event.relatedTarget as Node | null
                if (!event.currentTarget.contains(nextTarget)) setIsOpen(false)
            }}
        >
            {children}
            {typeof document !== 'undefined' && isOpen ? createPortal(
                <span
                    className={`ah-badge-tooltip ah-badge-tooltip--portal-host ${align === 'start' ? 'ah-badge-tooltip--start' : ''} ${align === 'end' ? 'ah-badge-tooltip--end' : ''} ${density === 'compact' ? 'ah-badge-tooltip--compact' : ''}`.trim()}
                    data-placement={portalPos?.side === 'bottom' ? 'bottom' : 'top'}
                    aria-hidden='true'
                >
                    <span
                        ref={portalBubbleRef}
                        className='ah-badge-tooltip-bubble ah-badge-tooltip-bubble--portal'
                        data-side={portalPos?.side === 'bottom' ? 'bottom' : 'top'}
                        role='tooltip'
                        style={{
                            left: portalPos ? `${portalPos.left}px` : '-9999px',
                            top: portalPos ? `${portalPos.top}px` : '-9999px',
                            ['--ah-tooltip-arrow-left' as any]: portalPos ? `${portalPos.arrowLeft}px` : '50%'
                        }}
                    >
                        <span className='ah-badge-tooltip-title'>{title}</span>
                        {subtitle ? <span className='ah-badge-tooltip-subtitle'>{subtitle}</span> : null}
                        {sanitizedRows.length > 0 ? (
                            <span className='ah-badge-tooltip-rows'>
                                {sanitizedRows.map((row) => (
                                    <span key={`${row.label}-${row.value}`} className='ah-badge-tooltip-row'>
                                        <span className='ah-badge-tooltip-label'>{row.label}</span>
                                        <span className='ah-badge-tooltip-value'>{row.value}</span>
                                    </span>
                                ))}
                            </span>
                        ) : null}
                    </span>
                </span>,
                document.body
            ) : null}
        </span>
    )
}
