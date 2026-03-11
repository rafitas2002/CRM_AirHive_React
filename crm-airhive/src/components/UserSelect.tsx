'use client'

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { getEmployeesList } from '@/app/actions/employees'

interface UserSelectProps {
    value: string[]
    onChange: (value: string[]) => void
    label?: string
    placeholder?: string
}

export default function UserSelect({
    value = [],
    onChange,
    label = 'Usuarios',
    placeholder = 'Seleccionar usuarios...'
}: UserSelectProps) {
    const [open, setOpen] = useState(false)
    const [users, setUsers] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const wrapperRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const fetchUsers = async () => {
            const result = await getEmployeesList()
            if (result.success && result.data) {
                setUsers(result.data)
            }
            setLoading(false)
        }
        void fetchUsers()
    }, [])

    useEffect(() => {
        const handleClickOutside = (event: globalThis.MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const filteredUsers = users.filter((user) =>
        (user.full_name?.toLowerCase() || '').includes(search.toLowerCase())
        || (user.username?.toLowerCase() || '').includes(search.toLowerCase())
    )

    const handleSelect = (userKey: string) => {
        if (value.includes(userKey)) {
            onChange(value.filter((entry) => entry !== userKey))
            return
        }
        onChange([...value, userKey])
    }

    const removeTag = (userKey: string, e: ReactMouseEvent<HTMLButtonElement>) => {
        e.stopPropagation()
        onChange(value.filter((entry) => entry !== userKey))
    }

    return (
        <div className='space-y-1.5' ref={wrapperRef}>
            {label && (
                <label className='block text-sm font-bold' style={{ color: 'var(--text-primary)' }}>
                    {label}
                </label>
            )}

            <div className='relative'>
                <div
                    className='min-h-[42px] w-full px-3 py-2 border rounded-lg focus-within:ring-2 focus-within:ring-[#2048FF]/30 focus-within:border-[#2048FF] cursor-text flex flex-wrap gap-2 items-center transition-colors'
                    style={{ background: 'var(--background)', borderColor: 'var(--card-border)' }}
                    onClick={() => setOpen(true)}
                >
                    {value.length > 0 ? (
                        value.map((userKey) => {
                            const user = users.find((entry) => entry.username === userKey || entry.email === userKey)
                            const displayName = user?.full_name || userKey
                            return (
                                <span
                                    key={userKey}
                                    className='inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold border'
                                    style={{
                                        background: 'color-mix(in srgb, #3b82f6 10%, var(--card-bg))',
                                        borderColor: 'color-mix(in srgb, #3b82f6 26%, var(--card-border))',
                                        color: 'color-mix(in srgb, #2563eb 78%, var(--text-primary))'
                                    }}
                                >
                                    {displayName}
                                    <button
                                        onClick={(e) => removeTag(userKey, e)}
                                        className='cursor-pointer hover:opacity-80 transition-opacity'
                                        style={{ color: 'inherit' }}
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

                {open && (
                    <div
                        className='absolute z-50 top-full mt-1 w-full rounded-xl border overflow-hidden max-h-60 flex flex-col shadow-xl'
                        style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
                    >
                        <div className='p-2 border-b' style={{ borderColor: 'var(--card-border)' }}>
                            <input
                                autoFocus
                                className='w-full px-3 py-1.5 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#2048FF] transition-colors'
                                style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                placeholder='Buscar...'
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <div className='overflow-y-auto flex-1 p-1'>
                            {loading ? (
                                <div className='p-4 text-center text-xs font-semibold' style={{ color: 'var(--text-secondary)' }}>
                                    Cargando...
                                </div>
                            ) : filteredUsers.length > 0 ? (
                                filteredUsers.map((user) => {
                                    const userKey = user.username
                                    const isSelected = value.includes(userKey)
                                    return (
                                        <button
                                            key={user.id}
                                            type='button'
                                            onClick={() => handleSelect(userKey)}
                                            className='w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition-colors cursor-pointer'
                                            style={isSelected
                                                ? {
                                                    background: 'color-mix(in srgb, #3b82f6 10%, var(--card-bg))',
                                                    color: 'color-mix(in srgb, #2563eb 78%, var(--text-primary))'
                                                }
                                                : { color: 'var(--text-primary)' }}
                                        >
                                            <div className='flex flex-col'>
                                                <span className='font-bold'>{user.full_name}</span>
                                                <span className='text-xs opacity-70' style={{ color: 'var(--text-secondary)' }}>
                                                    {user.username}
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

            <p className='text-xs text-right' style={{ color: 'var(--text-secondary)' }}>
                Selecciona los usuarios internos para la reunión
            </p>
        </div>
    )
}
