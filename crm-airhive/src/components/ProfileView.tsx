'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { getCatalogs } from '@/app/actions/catalogs'
import { Mail, Briefcase, MapPin, Calendar, BookOpen, Award, User, Building, Globe, GraduationCap, Clock, Activity } from 'lucide-react'

interface ProfileViewProps {
    userId: string
    editable?: boolean // Potentially for future
}

export default function ProfileView({ userId }: ProfileViewProps) {
    const [profile, setProfile] = useState<any>(null)
    const [details, setDetails] = useState<any>(null)
    const [catalogs, setCatalogs] = useState<Record<string, any[]>>({})
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const loadData = async () => {
            const supabase = createClient()

            // 1. Fetch Profile & Details
            const { data: p } = await supabase.from('profiles').select('*').eq('id', userId).single()
            const { data: d } = await supabase.from('employee_profiles').select('*').eq('user_id', userId).single()

            // 2. Fetch Catalogs for resolution
            const catsResponse = await getCatalogs()
            const cats = catsResponse.success && catsResponse.data ? catsResponse.data : {}

            setProfile(p)
            setDetails(d || {})
            setCatalogs(cats)
            setLoading(false)
        }
        loadData()
    }, [userId])

    if (loading) return <div className='p-8 text-center text-gray-400 animate-pulse'>Cargando perfil...</div>
    if (!profile) return <div className='p-8 text-center text-red-500'>Usuario no encontrado</div>

    // Helper to resolve ID to Name
    const resolve = (table: string, id: string) => {
        if (!id) return '-'
        const list = catalogs[table] || []
        const item = list.find(i => i.id === id)
        return item ? item.name : '-'
    }

    // Colors & Icons logic
    const roleColor = profile.role === 'admin' ? 'bg-purple-100 text-purple-700' : profile.role === 'rh' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'
    const roleLabel = profile.role === 'admin' ? 'Administrador' : profile.role === 'rh' ? 'Recursos Humanos' : 'Vendedor'

    return (
        <div className='max-w-5xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500'>
            {/* Header Card */}
            <div className='bg-[var(--card-bg)] rounded-2xl shadow-sm border border-[var(--card-border)] p-8 flex items-center gap-8 relative overflow-hidden'>
                <div className='absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2' />

                <div className='relative shrink-0'>
                    <div className='w-32 h-32 rounded-full overflow-hidden border-4 border-white dark:border-gray-800 shadow-xl'>
                        {profile.avatar_url ? (
                            <img
                                src={profile.avatar_url}
                                alt="Profile"
                                className='w-full h-full object-cover'
                            />
                        ) : (
                            <div className='w-full h-full bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900 dark:to-indigo-900 flex items-center justify-center text-4xl'>
                                👤
                            </div>
                        )}
                    </div>
                    <div className='absolute bottom-2 right-2 w-6 h-6 bg-emerald-500 border-4 border-white dark:border-gray-800 rounded-full shadow-lg' title="Activo" />
                </div>

                <div className='relative flex-1'>
                    <div className='flex items-start justify-between'>
                        <div>
                            <h1 className='text-3xl font-black text-[var(--text-primary)] mb-2'>
                                {profile.first_name} {profile.last_name}
                            </h1>
                            <p className='text-[var(--text-secondary)] font-medium text-lg flex items-center gap-2'>
                                📧 {profile.email}
                            </p>
                        </div>
                        <button className='px-4 py-2 bg-[var(--input-bg)] hover:bg-[var(--hover-bg)] text-[var(--text-primary)] rounded-lg font-bold text-sm transition-colors border border-[var(--card-border)] shadow-sm'>
                            ✏️ Editar Perfil
                        </button>
                    </div>

                    <div className='mt-6 flex flex-wrap gap-3'>
                        <span className='px-3 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs font-bold border border-blue-100 dark:border-blue-800'>
                            🏢 {profile.department || 'Sin Departamento'}
                        </span>
                        <span className='px-3 py-1 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-xs font-bold border border-purple-100 dark:border-purple-800'>
                            💼 {profile.position || 'Sin Puesto'}
                        </span>
                        <span className='px-3 py-1 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full text-xs font-bold border border-amber-100 dark:border-amber-800'>
                            📅 Unido: {new Date(profile.created_at).toLocaleDateString()}
                        </span>
                    </div>
                </div>
            </div>

            <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
                {/* Left Column: Identity & Status */}
                <div className='space-y-6'>
                    {/* Status Card */}
                    <div className='bg-[var(--card-bg)] p-6 rounded-2xl shadow-sm border border-[var(--card-border)]'>
                        <h3 className='text-sm font-black text-[var(--text-secondary)] uppercase tracking-widest mb-4'>
                            Estado del Sistema
                        </h3>
                        <div className='flex items-center justify-between p-3 bg-[var(--hover-bg)] rounded-xl border border-[var(--card-border)]'>
                            <div className='flex items-center gap-3'>
                                <div className='w-2 h-2 rounded-full bg-emerald-500 animate-pulse' />
                                <span className='font-bold text-[var(--text-primary)] text-sm'>En Línea</span>
                            </div>
                            <span className='text-xs text-[var(--text-secondary)]'>Ahora</span>
                        </div>
                    </div>

                    {/* Job Details */}
                    <div className='bg-[var(--card-bg)] p-6 rounded-2xl shadow-sm border border-[var(--card-border)]'>
                        <h3 className='text-sm font-black text-[var(--text-secondary)] uppercase tracking-widest mb-4'>
                            Detalles Laborales
                        </h3>
                        <div className='space-y-4'>
                            <div>
                                <label className='text-xs font-bold text-[var(--text-secondary)]'>Departamento</label>
                                <p className='font-bold text-[var(--text-primary)]'>{profile.department || 'No asignado'}</p>
                            </div>
                            <div className='w-full h-px bg-[var(--card-border)]' />
                            <div>
                                <label className='text-xs font-bold text-[var(--text-secondary)]'>Puesto Actual</label>
                                <p className='font-bold text-[var(--text-primary)]'>{profile.position || 'No asignado'}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Middle Column: Personal Info */}
                <div className='space-y-6'>
                    <div className='bg-[var(--card-bg)] p-6 rounded-2xl shadow-sm border border-[var(--card-border)] h-full'>
                        <h3 className='text-sm font-black text-[var(--text-secondary)] uppercase tracking-widest mb-4'>
                            Información Personal
                        </h3>
                        <div className='space-y-6'>
                            <div className='flex items-center gap-4 p-4 rounded-xl hover:bg-[var(--hover-bg)] transition-colors border border-transparent hover:border-[var(--card-border)]'>
                                <div className='w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-xl'>
                                    📧
                                </div>
                                <div>
                                    <label className='text-xs font-bold text-[var(--text-secondary)]'>Correo Electrónico</label>
                                    <p className='font-bold text-[var(--text-primary)] break-all'>{profile.email}</p>
                                </div>
                            </div>

                            <div className='flex items-center gap-4 p-4 rounded-xl hover:bg-[var(--hover-bg)] transition-colors border border-transparent hover:border-[var(--card-border)]'>
                                <div className='w-10 h-10 rounded-full bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center text-xl'>
                                    🆔
                                </div>
                                <div>
                                    <label className='text-xs font-bold text-[var(--text-secondary)]'>ID de Usuario</label>
                                    <p className='font-mono text-xs font-bold text-[var(--text-primary)]'>{profile.id}</p>
                                </div>
                            </div>

                            <div className='flex items-center gap-4 p-4 rounded-xl hover:bg-[var(--hover-bg)] transition-colors border border-transparent hover:border-[var(--card-border)]'>
                                <div className='w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center text-xl'>
                                    🔐
                                </div>
                                <div>
                                    <label className='text-xs font-bold text-[var(--text-secondary)]'>Rol de Acceso</label>
                                    <p className='font-bold text-[var(--text-primary)] uppercase'>{profile.role || 'Usuario'}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column: Contract */}
                <div className='space-y-6'>
                    <div className='bg-[var(--card-bg)] p-6 rounded-2xl shadow-sm border border-[var(--card-border)] h-full relative overflow-hidden'>
                        <div className='absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2' />

                        <h3 className='text-sm font-black text-[var(--text-secondary)] uppercase tracking-widest mb-4'>
                            Contrato y Vinculación
                        </h3>

                        <div className='bg-[var(--hover-bg)] rounded-xl p-6 text-center border border-[var(--card-border)] mb-6'>
                            <div className='text-3xl font-black text-[var(--text-primary)] mb-1'>
                                Active
                            </div>
                            <div className='text-xs font-bold text-emerald-500 uppercase tracking-widest'>
                                Staff Member
                            </div>
                        </div>

                        <div className='space-y-3'>
                            <div className='flex justify-between items-center text-sm'>
                                <span className='text-[var(--text-secondary)]'>Inicio de Contrato</span>
                                <span className='font-bold text-[var(--text-primary)]'>{new Date(profile.created_at).toLocaleDateString()}</span>
                            </div>
                            <div className='flex justify-between items-center text-sm'>
                                <span className='text-[var(--text-secondary)]'>Tipo</span>
                                <span className='font-bold text-[var(--text-primary)]'>Indefinido</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

function InfoRow({ label, value, highlight, icon }: { label: string, value: string, highlight?: boolean, icon?: React.ReactNode }) {
    return (
        <div className='flex items-center justify-between group'>
            <div className='flex items-center gap-2'>
                {icon && <div className='p-1.5 bg-gray-50 rounded-md group-hover:bg-blue-50 transition-colors'>{icon}</div>}
                <span className='text-sm font-medium text-gray-500'>{label}</span>
            </div>
            <span className={`text-sm font-semibold truncate max-w-[150px] ${highlight ? 'text-[#2048FF]' : 'text-[#0A1635]'}`}>
                {value}
            </span>
        </div>
    )
}
