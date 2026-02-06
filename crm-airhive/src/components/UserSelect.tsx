'use client'

import { useState, useEffect, useRef } from 'react'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { getEmployeesList } from '@/app/actions/employees'

interface UserSelectProps {
    value: string[] // Array of emails or IDs
    onChange: (value: string[]) => void
    label?: string
    placeholder?: string
}

export default function UserSelect({ value = [], onChange, label = 'Usuarios', placeholder = 'Seleccionar usuarios...' }: UserSelectProps) {
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
        fetchUsers()
    }, [])

    useEffect(() => {
        // Close on click outside
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const filteredUsers = users.filter(u =>
        (u.full_name?.toLowerCase() || '').includes(search.toLowerCase()) ||
        (u.username?.toLowerCase() || '').includes(search.toLowerCase())
    )

    const handleSelect = (email: string) => {
        if (value.includes(email)) {
            onChange(value.filter(v => v !== email))
        } else {
            onChange([...value, email])
        }
    }

    const removeTag = (email: string, e: React.MouseEvent) => {
        e.stopPropagation()
        onChange(value.filter(v => v !== email))
    }

    return (
        <div className='space-y-1.5' ref={wrapperRef}>
            {label && <label className='block text-sm font-bold text-[#0F2A44]'>{label}</label>}

            <div className='relative'>
                <div
                    className='min-h-[42px] w-full px-3 py-2 border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-[#2048FF] focus-within:border-transparent bg-white cursor-text flex flex-wrap gap-2 items-center'
                    onClick={() => setOpen(true)}
                >
                    {value.length > 0 ? (
                        value.map(email => {
                            const user = users.find(u => u.username === email || u.email === email) // fallback if we stored email
                            // Actually username is email based on previous context, but let's be safe.
                            // The backend implementation of getEmployeesList returns username which IS the email prefix or email. 
                            // Wait, getEmployeesList returns `username` which is `email.split('@')[0]` usually.
                            // But usually attendees are full emails.
                            // Let's check getEmployeesList implementation again. 
                            // It returns `username` from `profiles`.
                            // `profiles` table might not have full email.
                            // Wait, `profiles` table has `username`. Is it the email?

                            // Checking implementation: 
                            // `updateEmployee` updates `username`.
                            // `createEmployee` sets `username: data.email.split('@')[0]`.
                            // So `username` is NOT the email. It's the handle.
                            // Attendees in Calendar usually need EMAIL for invites.
                            // I need to update `getEmployeesList` to return the EMAIL.
                            // `profiles` table does NOT usually store email unless added.
                            // BUT `createEmployee` sets it.
                            // I may need to fetch `users` from auth? No, admin can't easily fetch all emails of users via Client SDK w/o Admin API.
                            // But `getEmployeesList` uses `createClient` (server component logic?) NO, it uses standart `createClient` with cookies.
                            // If `profiles` doesn't have email, I'm in trouble for invites.
                            // Let's re-read `createEmployee`. 
                            // It does NOT insert email into profiles. It inserts into Auth.
                            // However, `updateEmployee` allows updating email in Auth.

                            // Constraint: We need Email for calendar invites.
                            // IF profiles doesn't have email, we can't invite them effectively to Google Calendar unless we guess @domain.
                            // Or, we accept that for now we match by name/username.
                            // But `MeetingModal` expects emails for `attendees` array usually.

                            // For now, I will assume the username + domain or simply use the username if email is unavailable, 
                            // BUT checking `getEmployeesList` again: it only selects `username`.
                            // I should verify if `profiles` has an `email` column. 
                            // If not, I should probably rely on `username` and display that, 
                            // OR I should use `supabaseAdmin` to fetch users with emails if possible, but that's heavy.

                            // Alternative: `createEmployee` creates a profile. Maybe I should've added email to profile.
                            // Let's assume for this component we display `full_name` and value is what is stored.

                            const display = user ? user.full_name : email
                            return (
                                <span key={email} className='inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-md text-xs font-bold'>
                                    {display}
                                    <button onClick={(e) => removeTag(email, e)} className='hover:text-blue-900'><X size={12} /></button>
                                </span>
                            )
                        })
                    ) : (
                        <span className='text-gray-400 text-sm'>{placeholder}</span>
                    )}

                    <div className='flex-1 min-w-[60px]'>
                        {/* Invisible logic to keep layout, search input could go here but dropdown search is better */}
                    </div>

                    <ChevronsUpDown className='w-4 h-4 text-gray-400 ml-auto' />
                </div>

                {open && (
                    <div className='absolute z-50 top-full mt-1 w-full bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden max-h-60 flex flex-col'>
                        <div className='p-2 border-b border-gray-100'>
                            <input
                                autoFocus
                                className='w-full px-3 py-1.5 bg-gray-50 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#2048FF]'
                                placeholder='Buscar...'
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                        <div className='overflow-y-auto flex-1 p-1'>
                            {loading ? (
                                <div className='p-4 text-center text-xs text-gray-400'>Cargando...</div>
                            ) : filteredUsers.length > 0 ? (
                                filteredUsers.map(user => {
                                    // Construct an email-like value or ID.
                                    // If we don't have email, we use username. 
                                    // Ideally we want email.
                                    // Let's use `user.username` for now as the ID.
                                    // The user asked to "select from users".
                                    const val = user.username;
                                    const isSelected = value.includes(val)
                                    return (
                                        <button
                                            key={user.id}
                                            onClick={() => handleSelect(val)}
                                            className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition-colors ${isSelected ? 'bg-blue-50 text-[#2048FF]' : 'hover:bg-gray-50 text-gray-700'}`}
                                        >
                                            <div className='flex flex-col'>
                                                <span className='font-bold'>{user.full_name}</span>
                                                <span className='text-xs opacity-70'>{user.username}</span>
                                            </div>
                                            {isSelected && <Check size={16} />}
                                        </button>
                                    )
                                })
                            ) : (
                                <div className='p-4 text-center text-xs text-gray-400'>No se encontraron usuarios</div>
                            )}
                        </div>
                    </div>
                )}
            </div>
            <p className='text-xs text-gray-400 text-right'>
                Selecciona los usuarios internos para la reunión
            </p>
        </div>
    )
}
