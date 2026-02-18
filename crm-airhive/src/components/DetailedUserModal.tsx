'use client'

import { useState, useEffect } from 'react'
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
    BarChart3,
    Timer,
    Zap
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { getUserActivitySummary } from '@/app/actions/admin'
import RoleBadge from '@/components/RoleBadge'
import { getRoleMeta } from '@/lib/roleUtils'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'

interface DetailedUserModalProps {
    isOpen: boolean
    onClose: () => void
    user: any // The user data fetched
    catalogs: Record<string, any[]>
}

export default function DetailedUserModal({ isOpen, onClose, user, catalogs }: DetailedUserModalProps) {
    useBodyScrollLock(isOpen)
    const { profile: currentUser } = useAuth()
    const [activeTab, setActiveTab] = useState('profile')
    const [activityData, setActivityData] = useState<any>(null)
    const [loadingActivity, setLoadingActivity] = useState(false)

    const isSelf = currentUser?.id === user?.id
    const isAdmin = currentUser?.role === 'admin'
    const canSeeAll = isSelf || isAdmin

    async function fetchActivity() {
        if (!user?.id) return
        setLoadingActivity(true)
        const res = await getUserActivitySummary(user.id)
        if (res.success) {
            setActivityData(res.data)
        }
        setLoadingActivity(false)
    }

    useEffect(() => {
        if (isOpen && isAdmin && user?.id) {
            fetchActivity()
        }
    }, [isOpen, user?.id, isAdmin])

    const visibleTab = isAdmin ? activeTab : 'profile'

    // Helper to resolve IDs
    const resolve = (table: string, id: string) => {
        if (!id) return '-'
        const list = catalogs[table] || []
        const item = list.find(i => i.id === id)
        return item ? item.name : '-'
    }

    const getAreaNames = () => {
        const rawAreas = details?.area_ids ?? details?.areas_ids ?? details?.areas
        const areaIds = new Set<string>()

        if (Array.isArray(rawAreas)) {
            rawAreas.forEach((item: any) => {
                if (typeof item === 'string' && item.trim()) areaIds.add(item.trim())
                if (item && typeof item === 'object' && typeof item.id === 'string' && item.id.trim()) areaIds.add(item.id.trim())
            })
        } else if (typeof rawAreas === 'string' && rawAreas.trim()) {
            rawAreas.split(',').map((v: string) => v.trim()).filter(Boolean).forEach((v: string) => areaIds.add(v))
        }

        if (typeof details?.area_id === 'string' && details.area_id.trim()) areaIds.add(details.area_id.trim())

        const names = Array.from(areaIds).map(id => resolve('areas', id)).filter(v => v && v !== '-')
        return names.length > 0 ? names.join(', ') : '-'
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

    if (!user) return null

    const details = user.details || {}
    const roleMeta = getRoleMeta(user.role)

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="ah-modal-overlay">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="ah-modal-panel w-full max-w-5xl"
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
                                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-white/10 to-white/5">
                                            <User size={42} strokeWidth={1.9} style={{ color: roleMeta.textColor }} />
                                        </div>
                                    )}
                                </div>
                                <div className="mb-4">
                                    <h2 className="text-3xl font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>{user.full_name}</h2>
                                    <div className="flex items-center gap-3 mt-1">
                                        <RoleBadge role={user.role} />
                                        <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                            Activo
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Tabs Navigation */}
                        <div className="mt-20 px-12 pb-2 border-b flex gap-8" style={{ borderColor: 'var(--card-border)' }}>
                            <button
                                onClick={() => setActiveTab('profile')}
                                className={`pb-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2 ${visibleTab === 'profile' ? 'text-blue-500 border-blue-500' : 'border-transparent hover:text-[#2048FF]'}`}
                                style={visibleTab === 'profile' ? undefined : { color: 'var(--text-secondary)' }}
                            >
                                Perfil Profesional
                            </button>
                            {isAdmin && (
                                <button
                                    onClick={() => setActiveTab('performance')}
                                    className={`pb-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2 ${visibleTab === 'performance' ? 'text-blue-500 border-blue-500' : 'border-transparent hover:text-[#2048FF]'}`}
                                    style={visibleTab === 'performance' ? undefined : { color: 'var(--text-secondary)' }}
                                >
                                    Desempeño & Actividad
                                </button>
                            )}
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 overflow-y-auto p-12 custom-scrollbar">
                            {visibleTab === 'profile' ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-12 animate-in fade-in slide-in-from-bottom-4 duration-500">

                                    {/* Info Laboral */}
                                    <section className="space-y-6">
                                        <h3 className="flex items-center gap-3 text-[10px] font-black text-blue-500 uppercase tracking-[0.3em]">
                                            <Briefcase size={14} /> Información Laboral
                                        </h3>
                                        <div className="grid grid-cols-1 gap-4">
                                            <InfoItem icon={Building2} label="Puesto" value={resolve('job_positions', details.job_position_id)} />
                                            <InfoItem icon={Users} label="Área" value={getAreaNames()} />
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
                                            <div className="p-8 rounded-3xl border flex flex-col items-center justify-center text-center gap-4" style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}>
                                                <Shield size={32} style={{ color: 'var(--text-secondary)', opacity: 0.35 }} />
                                                <p className="text-xs font-bold leading-relaxed" style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
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

                                        <div className="rounded-[32px] border overflow-hidden" style={{ borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}>
                                            <table className="w-full text-left">
                                                <thead>
                                                    <tr className="text-[10px] font-black uppercase tracking-widest" style={{ background: 'var(--table-header-bg)', color: 'var(--text-secondary)' }}>
                                                        <th className="px-6 py-4">Tipo</th>
                                                        <th className="px-6 py-4">Título</th>
                                                        <th className="px-6 py-4">Estado</th>
                                                        <th className="px-6 py-4">Fecha</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y" style={{ borderColor: 'var(--card-border)' }}>
                                                    {loadingActivity ? (
                                                        <tr>
                                                            <td colSpan={4} className="px-6 py-12 text-center">
                                                                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                                                            </td>
                                                        </tr>
                                                    ) : activityData?.activities?.length > 0 ? (
                                                        activityData.activities.map((act: any) => (
                                                            <tr key={act.id} className="transition-colors group hover:bg-black/5">
                                                                <td className="px-6 py-4">
                                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${act.type === 'meeting' ? 'bg-purple-500/10 text-purple-400' :
                                                                        act.type === 'task' ? 'bg-blue-500/10 text-blue-400' : 'bg-emerald-500/10 text-emerald-400'
                                                                        }`}>
                                                                        {act.type === 'meeting' ? <Users size={14} /> : act.type === 'task' ? <Clock size={14} /> : <CheckCircle2 size={14} />}
                                                                    </div>
                                                                </td>
                                                                <td className="px-6 py-4">
                                                                    <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{act.title}</p>
                                                                    <p className="text-[10px] truncate max-w-xs" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>{act.description}</p>
                                                                </td>
                                                                <td className="px-6 py-4">
                                                                    <span className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest ${act.status === 'completada' || act.status === 'held' || act.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500' :
                                                                        act.status === 'pendiente' || act.status === 'scheduled' ? 'bg-blue-500/10 text-blue-500' : 'bg-red-500/10 text-red-500'
                                                                        }`}>
                                                                        {act.status}
                                                                    </span>
                                                                </td>
                                                                <td className="px-6 py-4">
                                                                    <p className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>{new Date(act.date).toLocaleDateString()}</p>
                                                                </td>
                                                            </tr>
                                                        ))
                                                    ) : (
                                                        <tr>
                                                            <td colSpan={4} className="px-6 py-12 text-center font-bold text-sm" style={{ color: 'var(--text-secondary)' }}>
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
                            <section className="mt-12 pt-8 border-t flex flex-wrap gap-8 items-center justify-between" style={{ borderColor: 'var(--card-border)' }}>
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--hover-bg)', color: 'var(--text-secondary)' }}>
                                        <Clock size={18} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-secondary)', opacity: 0.75 }}>Miembro desde</p>
                                        <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{new Date(user.created_at).toLocaleDateString()}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--hover-bg)', color: 'var(--text-secondary)' }}>
                                        <Shield size={18} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-secondary)', opacity: 0.75 }}>ID de Sistema</p>
                                        <p className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{user.id}</p>
                                    </div>
                                </div>
                            </section>
                        </div>

                        {/* Footer / Actions */}
                        <div className="p-8 border-t flex justify-end" style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}>
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
        <div className="group flex items-center gap-4 p-4 rounded-2xl transition-all border border-transparent" style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors" style={{ background: 'var(--card-bg)', color: 'var(--text-secondary)' }}>
                <Icon size={18} />
            </div>
            <div>
                <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>{label}</p>
                <p className={`text-sm font-bold ${highlight ? 'text-blue-500' : ''}`} style={highlight ? undefined : { color: 'var(--text-primary)' }}>{value || '-'}</p>
            </div>
        </div>
    )
}
