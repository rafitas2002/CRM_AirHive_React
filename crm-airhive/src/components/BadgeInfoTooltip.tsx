'use client'

import type { ReactNode } from 'react'

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

    return (
        <span
            className={`ah-badge-tooltip group ${mode === 'inline' ? 'ah-badge-tooltip--inline' : ''} ${align === 'start' ? 'ah-badge-tooltip--start' : ''} ${align === 'end' ? 'ah-badge-tooltip--end' : ''} ${density === 'compact' ? 'ah-badge-tooltip--compact' : ''} ${className}`.trim()}
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
