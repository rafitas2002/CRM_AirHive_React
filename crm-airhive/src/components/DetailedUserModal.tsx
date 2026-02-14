'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    X,
    User,
    Briefcase,
    Mail,
    MapPin,
    Calendar,
    Activity,
    GraduationCap,
    Clock,
    Shield,
    Globe,
    Cake,
    Building2,
    Users,
    TrendingUp,
    Trophy,
    CheckCircle2,
    ListTodo,
    AlertCircle,
    BarChart3,
    Timer,
    Zap
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { getUserActivitySummary } from '@/app/actions/admin'

interface DetailedUserModalProps {
    isOpen: boolean
    onClose: () => void
    user: any // The user data fetched
    catalogs: Record<string, any[]>
}

export default function DetailedUserModal({ isOpen, onClose, user, catalogs }: DetailedUserModalProps) {
    const { profile: currentUser } = useAuth()
    const [activeTab, setActiveTab] = useState('profile')
    const [activityData, setActivityData] = useState<any>(null)
    const [loadingActivity, setLoadingActivity] = useState(false)

    if (!user) return null

    const isSelf = currentUser?.id === user.id
    const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'rh'
    const canSeeAll = isSelf || isAdmin

    useEffect(() => {
        if (isOpen && isAdmin && user.id) {
            fetchActivity()
        }
    }, [isOpen, user.id, isAdmin])

    const fetchActivity = async () => {
        setLoadingActivity(true)
        const res = await getUserActivitySummary(user.id)
        if (res.success) {
            setActivityData(res.data)
        }
        setLoadingActivity(false)
    }

    // Helper to resolve IDs
    const resolve = (table: string, id: string) => {
        if (!id) return '-'
        const list = catalogs[table] || []
        const item = list.find(i => i.id === id)
        return item ? item.name : '-'
    }

    const calculateAge = (dateString: string) => {
        if (!dateString) return '-'
        const parts = dateString.split('-')
        const birthDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
        const today = new Date()
        let age = today.getFullYear() - birthDate.getFullYear()
        const m = today.getMonth() - birthDate.getMonth()
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--
        return `${age} años`
    }

    const calculateTenure = (dateString: string) => {
        if (!dateString) return '-'
        const parts = dateString.split('-')
        const start = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
        const now = new Date()
        let years = now.getFullYear() - start.getFullYear()
        let months = now.getMonth() - start.getMonth()
        if (months < 0) { years--; months += 12 }
        if (years < 0) return 'Próximamente'
        const partsArr = []
        if (years > 0) partsArr.push(`${years} año${years !== 1 ? 's' : ''}`)
        if (months > 0) partsArr.push(`${months} mes${months !== 1 ? 'es' : ''}`)
        return partsArr.length > 0 ? partsArr.join(' y ') : 'Menos de un mes'
    }

    const details = user.details || {}

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="bg-[#0A0C10] border border-white/10 rounded-[32px] w-full max-w-5xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
                    >
                        {/* Header Section */}
                        <div className="relative h-48 bg-gradient-to-br from-[#2048FF] to-[#1700AC] shrink-0">
                            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20" />
                            <button
                                onClick={onClose}
                                className="absolute top-6 right-6 p-2 bg-black/20 hover:bg-black/40 text-white rounded-full transition-all z-10"
                            >
                                <X size={20} />
                            </button>

                            <div className="absolute -bottom-16 left-12 flex items-end gap-6">
                                <div className="w-32 h-32 rounded-3xl border-4 border-[#0A0C10] bg-[#1C1F26] overflow-hidden shadow-2xl">
                                    {user.avatar_url ? (
                                        <img src={user.avatar_url} alt={user.full_name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-4xl bg-gradient-to-br from-white/10 to-white/5 text-white/40">
                                            {user.full_name?.charAt(0) || '👤'}
                                        </div>
                                    )}
                                </div>
                                <div className="mb-4">
                                    <h2 className="text-3xl font-black text-white tracking-tight">{user.full_name}</h2>
                                    <div className="flex items-center gap-3 mt-1">
                                        <span className="px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-[10px] font-black uppercase tracking-widest text-white/80 border border-white/10">
                                            {user.role === 'admin' ? 'Administrador' : user.role === 'rh' ? 'Recursos Humanos' : 'Vendedor'}
                                        </span>
                                        <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                            Activo
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Tabs Navigation */}
                        <div className="mt-20 px-12 pb-2 border-b border-white/5 flex gap-8">
                            <button
                                onClick={() => setActiveTab('profile')}
                                className={`pb-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2 ${activeTab === 'profile' ? 'text-blue-500 border-blue-500' : 'text-white/40 border-transparent hover:text-white/60'}`}
                            >
                                Perfil Profesional
                            </button>
                            {isAdmin && (
                                <button
                                    onClick={() => setActiveTab('performance')}
                                    className={`pb-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2 ${activeTab === 'performance' ? 'text-blue-500 border-blue-500' : 'text-white/40 border-transparent hover:text-white/60'}`}
                                >
                                    Desempeño & Actividad
                                </button>
                            )}
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 overflow-y-auto p-12 custom-scrollbar">
                            {activeTab === 'profile' ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-12 animate-in fade-in slide-in-from-bottom-4 duration-500">

                                    {/* Info Laboral */}
                                    <section className="space-y-6">
                                        <h3 className="flex items-center gap-3 text-[10px] font-black text-blue-500 uppercase tracking-[0.3em]">
                                            <Briefcase size={14} /> Información Laboral
                                        </h3>
                                        <div className="grid grid-cols-1 gap-4">
                                            <InfoItem icon={Building2} label="Puesto" value={resolve('job_positions', details.job_position_id)} />
                                            <InfoItem icon={Users} label="Área" value={resolve('areas', details.area_id)} />
                                            <InfoItem icon={Shield} label="Seniority" value={resolve('seniority_levels', details.seniority_id)} />
                                            <InfoItem icon={Activity} label="Modalidad" value={resolve('work_modalities', details.work_modality_id)} />
                                            <InfoItem icon={Calendar} label="Fecha de Ingreso" value={details.start_date ? new Date(details.start_date).toLocaleDateString('es-MX', { dateStyle: 'long' }) : '-'} />
                                            <InfoItem icon={Clock} label="Antigüedad" value={calculateTenure(details.start_date)} highlight />
                                        </div>
                                    </section>

                                    {/* Info Personal (Restricted) */}
                                    <section className="space-y-6">
                                        <h3 className="flex items-center gap-3 text-[10px] font-black text-purple-500 uppercase tracking-[0.3em]">
                                            <User size={14} /> Información Personal
                                        </h3>
                                        {canSeeAll ? (
                                            <div className="grid grid-cols-1 gap-4">
                                                <InfoItem icon={Mail} label="Email Corporativo" value={user.username || user.email || '-'} />
                                                <InfoItem icon={Cake} label="Nacimiento" value={details.birth_date ? new Date(details.birth_date).toLocaleDateString('es-MX', { dateStyle: 'long' }) : '-'} />
                                                <InfoItem icon={Activity} label="Edad" value={calculateAge(details.birth_date)} />
                                                <InfoItem icon={GraduationCap} label="Nivel Educativo" value={resolve('education_levels', details.education_level_id)} />
                                                <InfoItem icon={Briefcase} label="Carrera" value={resolve('careers', details.career_id)} />
                                                <InfoItem icon={Globe} label="Ubicación" value={`${resolve('cities', details.city_id)}, ${resolve('countries', details.country_id)}`} />
                                            </div>
                                        ) : (
                                            <div className="p-8 rounded-3xl bg-white/5 border border-white/5 flex flex-col items-center justify-center text-center gap-4">
                                                <Shield size={32} className="text-white/20" />
                                                <p className="text-xs font-bold text-white/40 leading-relaxed">
                                                    La información personal es <span className="text-purple-400">confidencial</span> y solo <br /> es visible para administración.
                                                </p>
                                            </div>
                                        )}
                                    </section>
                                </div>
                            ) : (
                                <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    {/* Metrics Grid */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                        <MetricCard
                                            icon={TrendingUp}
                                            label="Ventas Últ. Carrera"
                                            value={`$${activityData?.metrics?.lastRaceAmount?.toLocaleString() || '0'}`}
                                            color="blue"
                                        />
                                        <MetricCard
                                            icon={Trophy}
                                            label="Medallas Totales"
                                            value={activityData?.metrics?.totalMedals || '0'}
                                            subtext={`G: ${activityData?.metrics?.medals?.gold || 0} S: ${activityData?.metrics?.medals?.silver || 0} B: ${activityData?.metrics?.medals?.bronze || 0}`}
                                            color="yellow"
                                        />
                                        <MetricCard
                                            icon={CheckCircle2}
                                            label="Tareas Completadas"
                                            value={activityData?.metrics?.completedTasksCount || '0'}
                                            color="emerald"
                                        />
                                        <MetricCard
                                            icon={BarChart3}
                                            label="Forecast Accuracy"
                                            value={`${activityData?.metrics?.forecastAccuracy?.toFixed(0) || '0'}%`}
                                            color="indigo"
                                        />
                                        <MetricCard
                                            icon={Zap}
                                            label="Effort (Reun/Cierre)"
                                            value={activityData?.metrics?.meetingsPerClose?.toFixed(1) || '0'}
                                            color="amber"
                                        />
                                        <MetricCard
                                            icon={Timer}
                                            label="Velocidad Respuesta"
                                            value={`${activityData?.metrics?.avgResponseTimeHours?.toFixed(1) || '0'}h`}
                                            color="rose"
                                        />
                                        <MetricCard
                                            icon={MapPin}
                                            label="Impacto Presencial"
                                            value={`${activityData?.metrics?.physicalCloseRate?.toFixed(0) || '0'}%`}
                                            color="blue"
                                        />
                                        <MetricCard
                                            icon={Building2}
                                            label="Dominio Industria"
                                            value={activityData?.metrics?.topIndustry || 'N/A'}
                                            color="purple"
                                        />
                                    </div>

                                    {/* Activity List */}
                                    <section className="space-y-6">
                                        <h3 className="flex items-center gap-3 text-[10px] font-black text-blue-500 uppercase tracking-[0.3em]">
                                            <ListTodo size={14} /> Registro de Actividades
                                        </h3>

                                        <div className="rounded-[32px] border border-white/5 overflow-hidden bg-white/5">
                                            <table className="w-full text-left">
                                                <thead>
                                                    <tr className="bg-white/5 text-[10px] font-black uppercase tracking-widest text-white/40">
                                                        <th className="px-6 py-4">Tipo</th>
                                                        <th className="px-6 py-4">Título</th>
                                                        <th className="px-6 py-4">Estado</th>
                                                        <th className="px-6 py-4">Fecha</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-white/5">
                                                    {loadingActivity ? (
                                                        <tr>
                                                            <td colSpan={4} className="px-6 py-12 text-center">
                                                                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                                                            </td>
                                                        </tr>
                                                    ) : activityData?.activities?.length > 0 ? (
                                                        activityData.activities.map((act: any) => (
                                                            <tr key={act.id} className="hover:bg-white/5 transition-colors group">
                                                                <td className="px-6 py-4">
                                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${act.type === 'meeting' ? 'bg-purple-500/10 text-purple-400' :
                                                                        act.type === 'task' ? 'bg-blue-500/10 text-blue-400' : 'bg-emerald-500/10 text-emerald-400'
                                                                        }`}>
                                                                        {act.type === 'meeting' ? <Users size={14} /> : act.type === 'task' ? <Clock size={14} /> : <CheckCircle2 size={14} />}
                                                                    </div>
                                                                </td>
                                                                <td className="px-6 py-4">
                                                                    <p className="text-sm font-bold text-white/80">{act.title}</p>
                                                                    <p className="text-[10px] text-white/40 truncate max-w-xs">{act.description}</p>
                                                                </td>
                                                                <td className="px-6 py-4">
                                                                    <span className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest ${act.status === 'completada' || act.status === 'held' || act.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500' :
                                                                        act.status === 'pendiente' || act.status === 'scheduled' ? 'bg-blue-500/10 text-blue-500' : 'bg-red-500/10 text-red-500'
                                                                        }`}>
                                                                        {act.status}
                                                                    </span>
                                                                </td>
                                                                <td className="px-6 py-4">
                                                                    <p className="text-xs font-bold text-white/60">{new Date(act.date).toLocaleDateString()}</p>
                                                                </td>
                                                            </tr>
                                                        ))
                                                    ) : (
                                                        <tr>
                                                            <td colSpan={4} className="px-6 py-12 text-center text-white/20 font-bold text-sm">
                                                                No hay actividad registrada
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </section>
                                </div>
                            )}

                            {/* System Info (Always at bottom) */}
                            <section className="mt-12 pt-8 border-t border-white/5 flex flex-wrap gap-8 items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/40">
                                        <Clock size={18} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">Miembro desde</p>
                                        <p className="text-sm font-bold text-white/60">{new Date(user.created_at).toLocaleDateString()}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/40">
                                        <Shield size={18} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">ID de Sistema</p>
                                        <p className="text-xs font-mono text-white/40">{user.id}</p>
                                    </div>
                                </div>
                            </section>
                        </div>

                        {/* Footer / Actions */}
                        <div className="p-8 bg-[#0D0F14] border-t border-white/5 flex justify-end">
                            <button
                                onClick={onClose}
                                className="px-8 py-3 bg-[#2048FF] hover:bg-[#1700AC] text-white rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all active:scale-95 shadow-xl shadow-blue-500/20"
                            >
                                Cerrar Perfil
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    )
}

function MetricCard({ icon: Icon, label, value, subtext, color }: { icon: any, label: string, value: string | number, subtext?: string, color: string }) {
    const colors: Record<string, string> = {
        blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
        yellow: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
        emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
        purple: 'text-purple-400 bg-purple-500/10 border-purple-500/20'
    }

    return (
        <div className={`p-6 rounded-3xl border ${colors[color]} space-y-2`}>
            <div className="flex items-center justify-between">
                <Icon size={18} className="opacity-60" />
                {subtext && <span className="text-[9px] font-black opacity-40 uppercase tracking-widest">{subtext}</span>}
            </div>
            <div>
                <p className="text-[10px] font-black opacity-40 uppercase tracking-widest">{label}</p>
                <p className="text-xl font-black">{value}</p>
            </div>
        </div>
    )
}

function InfoItem({ icon: Icon, label, value, highlight }: { icon: any, label: string, value: string, highlight?: boolean }) {
    return (
        <div className="group flex items-center gap-4 p-4 rounded-2xl hover:bg-white/5 transition-all border border-transparent hover:border-white/5">
            <div className="w-10 h-10 rounded-xl bg-[#1C1F26] flex items-center justify-center text-white/40 group-hover:text-blue-400 transition-colors">
                <Icon size={18} />
            </div>
            <div>
                <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">{label}</p>
                <p className={`text-sm font-bold ${highlight ? 'text-blue-400' : 'text-white/80'}`}>{value || '-'}</p>
            </div>
        </div>
    )
}
