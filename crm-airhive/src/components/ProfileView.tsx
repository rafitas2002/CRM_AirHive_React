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
            <div className='bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex items-center gap-8 relative overflow-hidden'>
                <div className='absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-[#2048FF]/10 to-transparent rounded-bl-full -mr-16 -mt-16 pointer-events-none' />

                <div className='w-24 h-24 rounded-2xl bg-gradient-to-br from-[#2048FF] to-[#0A1635] flex items-center justify-center text-5xl font-bold text-white shadow-xl shadow-blue-900/20 z-10'>
                    {profile.full_name?.charAt(0).toUpperCase() || '?'}
                </div>

                <div className='flex-1 z-10'>
                    <h1 className='text-3xl font-black text-[#0A1635] mb-2 tracking-tight'>{profile.full_name}</h1>
                    <div className='flex flex-wrap items-center gap-4 text-sm font-medium'>
                        <span className={`px-3 py-1 rounded-full ${roleColor} flex items-center gap-2`}>
                            {profile.role === 'admin' ? <Award size={14} /> : <Briefcase size={14} />}
                            {roleLabel}
                        </span>
                        <span className='flex items-center gap-1.5 text-gray-500 bg-gray-50 px-3 py-1 rounded-full border border-gray-100'>
                            <Mail size={14} />
                            {profile.username?.includes('@') ? profile.username : `${profile.username}@airhive.mx`}
                            {/* Fallback layout if username isnt email */}
                        </span>
                        <span className='flex items-center gap-1.5 text-gray-500 bg-gray-50 px-3 py-1 rounded-full border border-gray-100'>
                            <Clock size={14} />
                            {details.start_date ? `Ingreso: ${new Date(details.start_date + 'T12:00:00').toLocaleDateString()}` : 'Sin fecha ingreso'}
                        </span>
                    </div>
                </div>
            </div>

            <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
                {/* Left Column: Identity & Status */}
                <div className='space-y-6'>
                    {/* Status Card */}
                    <div className='bg-white p-6 rounded-2xl shadow-sm border border-gray-100'>
                        <h3 className='text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2'>
                            <Activity size={16} /> Estado
                        </h3>
                        <div className={`p-4 rounded-xl flex items-center justify-between ${details.employee_status === 'activo' ? 'bg-emerald-50 border border-emerald-100' : 'bg-gray-50 border border-gray-200'}`}>
                            <span className='text-sm font-bold text-gray-600'>Estado Actual</span>
                            <span className={`px-3 py-1 rounded-lg text-sm font-black uppercase ${details.employee_status === 'activo' ? 'bg-emerald-500 text-white shadow-emerald-200 shadow-lg' : 'bg-gray-400 text-white'}`}>
                                {details.employee_status || 'DESCONOCIDO'}
                            </span>
                        </div>
                    </div>

                    {/* Job Details */}
                    <div className='bg-white p-6 rounded-2xl shadow-sm border border-gray-100'>
                        <h3 className='text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2'>
                            <Briefcase size={16} /> Posición
                        </h3>
                        <div className='space-y-4'>
                            <InfoRow label="Puesto" value={resolve('job_positions', details.job_position_id)} />
                            <InfoRow label="Área" value={resolve('areas', details.area_id)} />
                            <InfoRow label="Seniority" value={resolve('seniority_levels', details.seniority_id)} highlight />
                        </div>
                    </div>
                </div>

                {/* Middle Column: Personal Info */}
                <div className='space-y-6'>
                    <div className='bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-full'>
                        <h3 className='text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2'>
                            <User size={16} /> Información Personal
                        </h3>
                        <div className='space-y-5'>
                            <div className='grid grid-cols-1 gap-4'>
                                <InfoRow label="Género" value={resolve('genders', details.gender_id)} icon={<User size={14} className="text-blue-500" />} />
                                <InfoRow label="Fecha Nacimiento" value={details.birth_date ? new Date(details.birth_date + 'T12:00:00').toLocaleDateString() : '-'} icon={<Calendar size={14} className="text-pink-500" />} />
                                <InfoRow label="Ciudad" value={resolve('cities', details.city_id)} icon={<MapPin size={14} className="text-orange-500" />} />
                                <InfoRow label="País" value={resolve('countries', details.country_id)} icon={<Globe size={14} className="text-green-500" />} />
                            </div>

                            <div className='pt-4 border-t border-gray-50'>
                                <h4 className='text-xs font-bold text-gray-400 mb-3'>EDUCACIÓN</h4>
                                <InfoRow label="Nivel" value={resolve('education_levels', details.education_level_id)} icon={<BookOpen size={14} className="text-violet-500" />} />
                                <div className='mt-2' />
                                <InfoRow label="Universidad" value={resolve('universities', details.university_id)} icon={<Building size={14} className="text-indigo-500" />} />
                                <div className='mt-2' />
                                <InfoRow label="Carrera" value={resolve('careers', details.career_id)} icon={<GraduationCap size={14} className="text-cyan-500" />} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column: Contract */}
                <div className='space-y-6'>
                    <div className='bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-full'>
                        <h3 className='text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2'>
                            <Briefcase size={16} /> Contrato
                        </h3>
                        <div className='space-y-4'>
                            <div className='p-4 bg-gray-50 rounded-xl border border-gray-100'>
                                <span className='text-xs text-gray-400 font-bold block mb-1'>TIPO DE CONTRATO</span>
                                <span className='text-sm font-bold text-[#0A1635]'>{resolve('contract_types', details.contract_type_id)}</span>
                            </div>
                            <div className='p-4 bg-gray-50 rounded-xl border border-gray-100'>
                                <span className='text-xs text-gray-400 font-bold block mb-1'>MODALIDAD</span>
                                <span className='text-sm font-bold text-[#0A1635]'>{resolve('work_modalities', details.work_modality_id)}</span>
                            </div>

                            <div className='pt-2'>
                                <InfoRow label="ID Interno" value={profile.id.slice(0, 8)} />
                                <div className='h-2' />
                                <InfoRow label="Última Act." value={new Date(details.updated_at || profile.created_at).toLocaleDateString()} />
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
