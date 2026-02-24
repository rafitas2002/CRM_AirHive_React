'use client'

import { User } from 'lucide-react'

type TableEmployeeAvatarSize = 'sm' | 'md' | 'lg'

interface TableEmployeeAvatarProps {
    name?: string | null
    avatarUrl?: string | null
    size?: TableEmployeeAvatarSize
    className?: string
}

const SIZE_STYLES: Record<TableEmployeeAvatarSize, { wrap: string; text: string; icon: number }> = {
    sm: { wrap: 'w-8 h-8', text: 'text-[10px]', icon: 14 },
    md: { wrap: 'w-10 h-10', text: 'text-sm', icon: 16 },
    lg: { wrap: 'w-12 h-12', text: 'text-base', icon: 18 }
}

function getInitials(name?: string | null) {
    const clean = String(name || '').trim()
    if (!clean) return 'U'
    const parts = clean.split(/\s+/).filter(Boolean)
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
    const first = parts[0]?.charAt(0)?.toUpperCase() || ''
    const last = parts[parts.length - 1]?.charAt(0)?.toUpperCase() || ''
    return `${first}${last}` || 'U'
}

export default function TableEmployeeAvatar({
    name,
    avatarUrl,
    size = 'md',
    className = ''
}: TableEmployeeAvatarProps) {
    const s = SIZE_STYLES[size]

    return (
        <div
            className={`relative ${s.wrap} rounded-full border shrink-0 overflow-hidden flex items-center justify-center shadow-[0_6px_16px_rgba(0,0,0,0.20)] ${className}`.trim()}
            style={{
                borderColor: 'rgba(255,255,255,0.14)',
                background: avatarUrl
                    ? 'var(--hover-bg)'
                    : '#2048FF'
            }}
            aria-hidden='true'
        >
            <span className='absolute inset-0 pointer-events-none bg-[linear-gradient(150deg,rgba(255,255,255,0.16),transparent_48%)]' />
            {avatarUrl ? (
                <img
                    src={avatarUrl}
                    alt={name ? `Foto de ${name}` : 'Foto de perfil'}
                    className='w-full h-full object-cover'
                />
            ) : (
                <span className={`relative z-[1] font-black text-white leading-none ${s.text}`.trim()}>
                    {getInitials(name)}
                </span>
            )}
            {avatarUrl ? (
                <span className='absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/0 transition-colors pointer-events-none'>
                    {/* keeps structure consistent; no visible overlay by default */}
                </span>
            ) : null}
        </div>
    )
}
