'use client'

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Check, ChevronsUpDown, X } from 'lucide-react'

export type LeadAssigneeOption = {
    id: string
    fullName?: string | null
    username?: string | null
    role?: string | null
}

interface LeadAssigneesSelectProps {
    value: string[]
    onChange: (value: string[]) => void
    users: LeadAssigneeOption[]
    label?: string
    placeholder?: string
    helperText?: string
    disabled?: boolean
}

function uniqueIds(values: string[]) {
    return Array.from(new Set((values || []).map((entry) => String(entry || '').trim()).filter(Boolean)))
}

export default function LeadAssigneesSelect({
    value = [],
    onChange,
    users,
    label = 'Usuarios asignados',
    placeholder = 'Seleccionar usuarios...',
    helperText = 'Los badges de este lead se compartirán con todos los usuarios asignados.',
    disabled = false
}: LeadAssigneesSelectProps) {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState('')
    const wrapperRef = useRef<HTMLDivElement>(null)

    const normalizedValue = useMemo(() => uniqueIds(value), [value])

    useEffect(() => {
        const handleClickOutside = (event: globalThis.MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const filteredUsers = useMemo(() => {
        const term = String(search || '').trim().toLowerCase()
        if (!term) return users
        return users.filter((user) => {
            const fullName = String(user.fullName || '').toLowerCase()
            const username = String(user.username || '').toLowerCase()
            return fullName.includes(term) || username.includes(term)
        })
    }, [users, search])

    const handleSelect = (userId: string) => {
        if (disabled) return
        const next = normalizedValue.includes(userId)
            ? normalizedValue.filter((entry) => entry !== userId)
            : [...normalizedValue, userId]
        onChange(next)
    }

    const removeTag = (userId: string, e: ReactMouseEvent<HTMLButtonElement>) => {
        e.stopPropagation()
        if (disabled) return
        onChange(normalizedValue.filter((entry) => entry !== userId))
    }

    return (
        <div className='space-y-1.5' ref={wrapperRef}>
            {label && (
                <label className='block text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                    {label}
                </label>
            )}

            <div className='relative'>
                <div
                    className={[
                        'min-h-[44px] w-full px-3 py-2 border rounded-xl focus-within:ring-4 focus-within:ring-blue-500/10 focus-within:border-blue-500 cursor-text flex flex-wrap gap-2 items-center transition-colors',
                        disabled ? 'opacity-70 cursor-not-allowed' : ''
                    ].join(' ')}
                    style={{ background: 'var(--background)', borderColor: 'var(--card-border)' }}
                    onClick={() => {
                        if (disabled) return
                        setOpen(true)
                    }}
                >
                    {normalizedValue.length > 0 ? (
                        normalizedValue.map((userId) => {
                            const user = users.find((entry) => entry.id === userId)
                            const displayName = String(user?.fullName || user?.username || userId)
                            return (
                                <span
                                    key={userId}
                                    className='inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold border'
                                    style={{
                                        background: 'color-mix(in srgb, #3b82f6 10%, var(--card-bg))',
                                        borderColor: 'color-mix(in srgb, #3b82f6 26%, var(--card-border))',
                                        color: 'color-mix(in srgb, #2563eb 78%, var(--text-primary))'
                                    }}
                                >
                                    {displayName}
                                    <button
                                        type='button'
                                        onClick={(e) => removeTag(userId, e)}
                                        className='cursor-pointer hover:opacity-80 transition-opacity'
                                        style={{ color: 'inherit' }}
                                        disabled={disabled}
                                    >
                                        <X size={12} />
                                    </button>
                                </span>
                            )
                        })
                    ) : (
                        <span className='text-sm' style={{ color: 'var(--text-secondary)' }}>
                            {placeholder}
                        </span>
                    )}

                    <div className='flex-1 min-w-[60px]' />
                    <ChevronsUpDown className='w-4 h-4 ml-auto' style={{ color: 'var(--text-secondary)' }} />
                </div>

                {open && !disabled && (
                    <div
                        className='absolute z-50 top-full mt-1 w-full rounded-xl border overflow-hidden max-h-72 flex flex-col shadow-xl'
                        style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
                    >
                        <div className='p-2 border-b' style={{ borderColor: 'var(--card-border)' }}>
                            <input
                                autoFocus
                                className='w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#2048FF] transition-colors'
                                style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                placeholder='Buscar usuario...'
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <div className='overflow-y-auto flex-1 p-1'>
                            {filteredUsers.length > 0 ? (
                                filteredUsers.map((user) => {
                                    const userId = String(user.id || '')
                                    const isSelected = normalizedValue.includes(userId)
                                    const displayName = String(user.fullName || user.username || 'Usuario')
                                    const subtitleParts = [user.username ? `@${user.username}` : '', user.role ? String(user.role).toUpperCase() : ''].filter(Boolean)
                                    return (
                                        <button
                                            key={userId}
                                            type='button'
                                            onClick={() => handleSelect(userId)}
                                            className='w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition-colors cursor-pointer'
                                            style={isSelected
                                                ? {
                                                    background: 'color-mix(in srgb, #3b82f6 10%, var(--card-bg))',
                                                    color: 'color-mix(in srgb, #2563eb 78%, var(--text-primary))'
                                                }
                                                : { color: 'var(--text-primary)' }}
                                        >
                                            <div className='flex flex-col'>
                                                <span className='font-bold'>{displayName}</span>
                                                <span className='text-xs opacity-70' style={{ color: 'var(--text-secondary)' }}>
                                                    {subtitleParts.join(' • ')}
                                                </span>
                                            </div>
                                            {isSelected && <Check size={16} />}
                                        </button>
                                    )
                                })
                            ) : (
                                <div className='p-4 text-center text-xs font-semibold' style={{ color: 'var(--text-secondary)' }}>
                                    No se encontraron usuarios
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {helperText ? (
                <p className='text-[10px] font-semibold' style={{ color: 'var(--text-secondary)' }}>
                    {helperText}
                </p>
            ) : null}
        </div>
    )
}
