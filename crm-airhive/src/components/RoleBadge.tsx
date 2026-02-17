'use client'

import { User } from 'lucide-react'
import { getRoleMeta, type UserRole } from '@/lib/roleUtils'

interface RoleBadgeProps {
    role?: UserRole
    className?: string
    compact?: boolean
}

export default function RoleBadge({ role, className = '', compact = false }: RoleBadgeProps) {
    const meta = getRoleMeta(role)

    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full border font-black uppercase ${compact ? 'px-2.5 py-1 text-[9px] tracking-[0.15em]' : 'px-3 py-1 text-[10px] tracking-wider'} ${className}`}
            style={{ color: meta.textColor, background: meta.bgColor, borderColor: meta.borderColor }}
        >
            <User size={compact ? 11 : 13} strokeWidth={2} style={{ color: meta.textColor }} />
            {meta.label}
        </span>
    )
}

