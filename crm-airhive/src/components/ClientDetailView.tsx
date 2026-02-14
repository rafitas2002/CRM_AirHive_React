'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import MeetingModal from './MeetingModal'
import MeetingsList from './MeetingsList'
import TaskModal from './TaskModal'
import TasksList from './TasksList'
import { createMeeting, getNextMeeting, getLeadSnapshots, isProbabilityEditable } from '@/lib/meetingsService'
import { Database } from '@/lib/supabase'

type ClientData = {
    id: number
    empresa: string
    nombre: string
    contacto: string
    etapa: string
    valor_estimado: number
    oportunidad: string
    calificacion: number
    notas: string
    empresa_id?: string
    owner_username?: string
    owner_id?: string
    probabilidad?: number
    fecha_registro?: string
    forecast_logloss?: number | null
    forecast_evaluated_probability?: number | null
    forecast_outcome?: number | null
    forecast_scored_at?: string | null
    probability_locked?: boolean | null
    next_meeting_id?: string | null
    last_snapshot_at?: string | null
    email?: string | null
    telefono?: string | null
}

type Meeting = Database['public']['Tables']['meetings']['Row']
type Snapshot = Database['public']['Tables']['forecast_snapshots']['Row']

type CompanyData = {
    id: string
    nombre: string
    tamano: number
    ubicacion: string
    logo_url: string
    industria: string
    website: string
    descripcion: string
}

interface ClientDetailViewProps {
    client: ClientData | null
    isOpen: boolean
    onClose: () => void
    onEditClient: (client: ClientData) => void
    onEditCompany: (company: CompanyData) => void
    onEmailClick: (email: string, name: string) => void
    userEmail?: string
}

export default function ClientDetailView({
    client,
    isOpen,
    onClose,
    onEditClient,
    onEditCompany,
    onEmailClick,
    userEmail
}: ClientDetailViewProps) {
    const [company, setCompany] = useState<CompanyData | null>(null)
    const [loadingCompany, setLoadingCompany] = useState(false)
    const [supabase] = useState(() => createClient())

    // Meetings & Snapshots State
    const [isMeetingModalOpen, setIsMeetingModalOpen] = useState(false)
    const [nextMeeting, setNextMeeting] = useState<Meeting | null>(null)
    const [snapshots, setSnapshots] = useState<Snapshot[]>([])
    const [currentUser, setCurrentUser] = useState<any>(null)
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false)
    const [taskKey, setTaskKey] = useState(0)

    useEffect(() => {
        if (client?.empresa_id) {
            fetchCompany(client.empresa_id)
        } else {
            setCompany(null)
        }

        if (client) {
            fetchMeetingsData()
            fetchCurrentUser()
        }
    }, [client])

    const fetchCompany = async (id: string) => {
        setLoadingCompany(true)
        const { data, error } = await supabase
            .from('empresas')
            .select('*')
            .eq('id', id)
            .single()

        if (!error && data) {
            setCompany(data)
        }
        setLoadingCompany(false)
    }

    const fetchCurrentUser = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        setCurrentUser(user)
    }

    const fetchMeetingsData = async () => {
        if (!client) return
        try {
            const [nextMtg, snaps] = await Promise.all([
                getNextMeeting(client.id),
                getLeadSnapshots(client.id)
            ])
            setNextMeeting(nextMtg)
            setSnapshots(snaps)
        } catch (error) {
            console.error('Error fetching meetings data:', error)
        }
    }

    const handleCreateMeeting = async (meetingData: any) => {
        try {
            await createMeeting(meetingData)
            await fetchMeetingsData()
        } catch (error) {
            console.error('Error creating meeting:', error)
            throw error
        }
    }

    const handleCreateTask = async (taskData: any) => {
        try {
            const { error } = await supabase.from('tareas').insert({
                ...taskData,
                vendedor_id: currentUser?.id
            })
            if (error) throw error
            setTaskKey(prev => prev + 1)
            setIsTaskModalOpen(false)
        } catch (error: any) {
            alert('Error al crear tarea: ' + error.message)
        }
    }

    if (!isOpen || !client) return null

    return (
        <div className='fixed inset-0 z-40 bg-[var(--background)] flex flex-col animate-in slide-in-from-bottom duration-300'>
            {/* Header */}
            <div className='bg-[#0A1635] px-8 py-5 flex items-center justify-between shadow-xl shrink-0 border-b border-white/5'>
                <div className='flex items-center gap-6'>
                    <button
                        onClick={onClose}
                        className='w-10 h-10 flex items-center justify-center rounded-2xl bg-white/5 text-white/50 hover:bg-white/10 hover:text-white transition-all font-bold group'
                    >
                        <span className='group-hover:-translate-x-0.5 transition-transform'>←</span>
                    </button>
                    <div className='space-y-0.5'>
                        <h1 className='text-2xl font-black text-white tracking-tight leading-none'>
                            {client.nombre}
                        </h1>
                        <p className='text-[10px] font-black text-blue-400 uppercase tracking-[0.2em]'>Ficha Detallada del Lead</p>
                    </div>
                </div>
                <div className='flex gap-4'>
                    <button
                        onClick={() => onEditClient(client)}
                        className='h-11 px-6 bg-[#2048FF] text-white rounded-2xl font-black hover:bg-[#1700AC] transition-all shadow-xl shadow-blue-500/20 flex items-center gap-2 transform active:scale-95 uppercase text-[10px] tracking-widest'
                    >
                        <span>✏️</span> Editar Lead
                    </button>
                    {company && (
                        <button
                            onClick={() => onEditCompany(company)}
                            className='h-11 px-6 bg-white/5 text-white rounded-2xl font-black hover:bg-white/10 transition-all border border-white/10 flex items-center gap-2 uppercase text-[10px] tracking-widest'
                        >
                            <span>🏢</span> Catálogo
                        </button>
                    )}
                </div>
            </div>

            {/* Content Area */}
            <div className='flex-1 overflow-y-auto custom-scrollbar p-8 bg-[var(--background)]'>
                <div className='max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8'>

                    {/* Column 1: Lead Information */}
                    <div className='space-y-8'>
                        <div className='bg-[var(--card-bg)] p-8 rounded-[40px] shadow-2xl shadow-[#0A1635]/5 border border-[var(--card-border)]'>
                            <h2 className='text-xs font-black text-[var(--text-secondary)] mb-8 uppercase tracking-[0.3em] border-b border-[var(--card-border)] pb-4'>
                                👤 Información del Lead
                            </h2>

                            <div className='space-y-8'>
                                <div className='group'>
                                    <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest block mb-2 group-hover:text-blue-500 transition-colors'>Empresa (Lead)</label>
                                    <p className='text-[var(--text-primary)] font-black text-xl tracking-tight'>{client.empresa}</p>
                                </div>

                                <div>
                                    <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest block mb-2'>Contacto Directo</label>
                                    <div className='flex flex-wrap gap-2'>
                                        {client.email && (
                                            <button
                                                onClick={() => {
                                                    onEmailClick(client.email!, client.nombre || client.empresa)
                                                    import('@/app/actions/events').then(({ trackEvent }) => {
                                                        trackEvent({
                                                            eventType: 'call_finished', // Email is a form of contact
                                                            entityType: 'call',
                                                            entityId: client.id.toString(),
                                                            metadata: { type: 'email', to: client.email }
                                                        })
                                                    })
                                                }}
                                                className='px-4 py-2.5 bg-blue-50 text-blue-600 rounded-2xl border border-blue-100 font-black text-[10px] uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all flex items-center gap-2'
                                            >
                                                📧 {client.email}
                                            </button>
                                        )}
                                        {client.telefono && (
                                            <button
                                                onClick={() => {
                                                    const url = `https://wa.me/${client.telefono!.replace(/\D/g, '')}`
                                                    window.open(url, '_blank')
                                                    import('@/app/actions/events').then(({ trackEvent }) => {
                                                        trackEvent({
                                                            eventType: 'call_started',
                                                            entityType: 'call',
                                                            entityId: client.id.toString(),
                                                            metadata: { type: 'whatsapp', to: client.telefono }
                                                        })
                                                        // For WhatsApp we simulate immediate finish or just log the start
                                                        setTimeout(() => {
                                                            trackEvent({
                                                                eventType: 'call_finished',
                                                                entityType: 'call',
                                                                entityId: client.id.toString(),
                                                                metadata: { type: 'whatsapp', outcome: 'connected' }
                                                            })
                                                        }, 2000)
                                                    })
                                                }}
                                                className='px-4 py-2.5 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100 font-black text-[10px] uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all flex items-center gap-2'
                                            >
                                                💬 {client.telefono}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className='grid grid-cols-2 gap-6 pt-4 border-t border-gray-50'>
                                    <div className='space-y-1.5'>
                                        <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest block'>Etapa Actual</label>
                                        <div className='inline-block'>
                                            <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border-2
                                                ${client.etapa === 'Cerrado Ganado' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                                    client.etapa === 'Negociación' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                                        client.etapa === 'Cerrado Perdido' ? 'bg-red-50 text-red-600 border-red-100' :
                                                            'bg-blue-50 text-blue-600 border-blue-100'}`}>
                                                {client.etapa}
                                            </span>
                                        </div>
                                    </div>
                                    <div className='space-y-1.5'>
                                        <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest block'>Calificación</label>
                                        <div className='text-lg font-bold flex gap-0.5'>
                                            {[1, 2, 3, 4, 5].map((star) => (
                                                <span key={star} className={star <= (client.calificacion || 0) ? 'text-amber-400' : 'text-gray-200'}>
                                                    ★
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className='space-y-3 pt-4 border-t border-gray-50'>
                                    <div className='flex justify-between items-end'>
                                        <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest'>Confianza de Cierre</label>
                                        <span className={`text-xl font-black ${(client as any).probabilidad >= 70 ? 'text-emerald-500' : (client as any).probabilidad >= 40 ? 'text-amber-500' : 'text-slate-400'}`}>
                                            {(client as any).probabilidad || 0}%
                                        </span>
                                    </div>
                                    <div className='h-3 bg-gray-100 rounded-full overflow-hidden p-0.5 border border-gray-50 shadow-inner'>
                                        <div
                                            className={`h-full rounded-full transition-all duration-1000 ${(client as any).probabilidad >= 70 ? 'bg-emerald-500' : (client as any).probabilidad >= 40 ? 'bg-amber-500' : 'bg-slate-400'}`}
                                            style={{ width: `${(client as any).probabilidad || 0}%` }}
                                        />
                                    </div>
                                </div>

                                <div className='pt-6 border-t border-[var(--card-border)]'>
                                    <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest block mb-1'>Valor del Negocio</label>
                                    <p className='text-3xl font-black text-[var(--text-primary)] tracking-tight'>
                                        <span className='text-blue-600 mr-1'>$</span>
                                        {client?.valor_estimado?.toLocaleString() || '0'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className='bg-[var(--card-bg)] p-8 rounded-[40px] shadow-2xl shadow-[#0A1635]/5 border border-[var(--card-border)]'>
                            <h2 className='text-xs font-black text-[var(--text-secondary)] mb-6 uppercase tracking-[0.3em] border-b border-[var(--card-border)] pb-4'>
                                🗒️ Notas y Estrategia
                            </h2>
                            <div className='space-y-6'>
                                <div>
                                    <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest block mb-2'>Oportunidad Detectada</label>
                                    <p className='text-xs font-bold text-[var(--text-primary)] leading-relaxed bg-[var(--hover-bg)] p-4 rounded-3xl border border-[var(--card-border)]'>{client.oportunidad || 'Sin descripción de oportunidad.'}</p>
                                </div>
                                <div className='relative'>
                                    <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest block mb-2'>Notas Internas</label>
                                    <div className='p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-3xl border border-yellow-100 dark:border-yellow-800/30'>
                                        <p className='text-[11px] font-bold text-yellow-800 dark:text-yellow-200 italic leading-loose whitespace-pre-wrap'>
                                            {client.notas || 'No se han agregado notas adicionales aún.'}
                                        </p>
                                    </div>
                                    <span className='absolute top-2 right-4 text-xl opacity-20'>✍️</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Column 2: Activities Hub */}
                    <div className='space-y-8'>
                        <div className='bg-[var(--card-bg)] p-8 rounded-[40px] shadow-2xl shadow-[#0A1635]/5 border border-[var(--card-border)] flex flex-col'>
                            <div className='flex justify-between items-center mb-8 border-b border-[var(--card-border)] pb-4'>
                                <h2 className='text-xs font-black text-[var(--text-secondary)] uppercase tracking-[0.3em]'>
                                    📅 Juntas Agendadas
                                </h2>
                                <button
                                    onClick={() => setIsMeetingModalOpen(true)}
                                    className='w-10 h-10 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all transform hover:scale-105 shadow-sm'
                                >
                                    ➕
                                </button>
                            </div>

                            <div className='flex-1 min-h-[300px]'>
                                <MeetingsList
                                    leadId={client.id}
                                    onRefresh={fetchMeetingsData}
                                />
                            </div>
                        </div>

                        <div className='bg-[var(--card-bg)] p-8 rounded-[40px] shadow-2xl shadow-[#0A1635]/5 border border-[var(--card-border)] flex flex-col'>
                            <div className='flex justify-between items-center mb-8 border-b border-[var(--card-border)] pb-4'>
                                <h2 className='text-xs font-black text-[var(--text-secondary)] uppercase tracking-[0.3em]'>
                                    ✅ Tareas Pendientes
                                </h2>
                                <button
                                    onClick={() => setIsTaskModalOpen(true)}
                                    className='w-10 h-10 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center hover:bg-purple-600 hover:text-white transition-all transform hover:scale-105 shadow-sm'
                                >
                                    ➕
                                </button>
                            </div>

                            <div className='flex-1 min-h-[300px]'>
                                <TasksList
                                    key={taskKey}
                                    leadId={client.id}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Column 3: Company & Intelligence */}
                    <div className='space-y-8'>
                        {/* Company Card */}
                        <div className='bg-[var(--card-bg)] p-8 rounded-[40px] shadow-2xl shadow-[#0A1635]/5 border border-[var(--card-border)] overflow-hidden'>
                            <h2 className='text-xs font-black text-[var(--text-secondary)] mb-8 uppercase tracking-[0.3em] border-b border-[var(--card-border)] pb-4'>
                                🏢 Perfil Corporativo
                            </h2>

                            {loadingCompany ? (
                                <div className='py-12 flex flex-col items-center justify-center gap-4'>
                                    <div className='w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin'></div>
                                    <p className='text-[10px] font-black text-[var(--text-secondary)] uppercase animate-pulse'>Sincronizando...</p>
                                </div>
                            ) : company ? (
                                <div className='space-y-8'>
                                    <div className='flex items-center gap-6'>
                                        <div className='w-24 h-24 rounded-3xl border-2 border-[var(--card-border)] shadow-xl overflow-hidden flex items-center justify-center bg-[var(--hover-bg)] shrink-0 transform -rotate-3'>
                                            {company.logo_url ? (
                                                <img src={company.logo_url} alt={company.nombre} className='w-full h-full object-cover' />
                                            ) : (
                                                <span className='text-4xl'>🏢</span>
                                            )}
                                        </div>
                                        <div className='space-y-1'>
                                            <h3 className='text-xl font-black text-[var(--text-primary)] leading-tight tracking-tight'>{company.nombre}</h3>
                                            <p className='text-[10px] font-black text-blue-500 uppercase tracking-widest'>{company.industria}</p>
                                            {company.website && (
                                                <a href={company.website.startsWith('http') ? company.website : `https://${company.website}`} target='_blank' className='text-[10px] font-bold text-gray-400 hover:text-blue-600 transition-colors block'>🔗 {company.website}</a>
                                            )}
                                        </div>
                                    </div>

                                    <div className='grid grid-cols-2 gap-4'>
                                        <div className='bg-[var(--hover-bg)] p-4 rounded-3xl border border-[var(--card-border)] flex flex-col justify-between'>
                                            <label className='text-[9px] font-black text-[var(--text-secondary)] uppercase tracking-[0.2em] mb-3 block'>Score de Tamaño</label>
                                            <div className='flex items-center gap-2'>
                                                <span className='text-3xl font-black text-[#2048FF] leading-none'>{company.tamano}</span>
                                                <div className='flex-1 flex gap-1 h-2'>
                                                    {[1, 2, 3, 4, 5].map(i => (
                                                        <div key={i} className={`flex-1 rounded-full ${i <= company.tamano ? 'bg-[#2048FF]' : 'bg-[var(--background)]'}`} />
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                        <div className='bg-[var(--hover-bg)] p-4 rounded-3xl border border-[var(--card-border)]'>
                                            <label className='text-[9px] font-black text-[var(--text-secondary)] uppercase tracking-[0.2em] mb-3 block'>Ubicación Central</label>
                                            <p className='text-[10px] font-black text-[var(--text-primary)] leading-relaxed break-words'>{company.ubicacion || 'Global / Multinacional'}</p>
                                        </div>
                                    </div>

                                    <div className='bg-[var(--hover-bg)] p-6 rounded-3xl border border-[var(--card-border)] relative group'>
                                        <label className='text-[9px] font-black text-[var(--text-secondary)] uppercase tracking-[0.2em] mb-3 block'>Historia de Empresa</label>
                                        <p className='text-[11px] font-bold text-[var(--text-secondary)] leading-loose max-h-[120px] overflow-y-auto custom-scrollbar pr-2'>
                                            {company.descripcion || 'No hay una biografía corporativa disponible en este momento.'}
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={() => onEditClient(client)}
                                    className='w-full py-12 flex flex-col items-center justify-center gap-4 bg-[var(--hover-bg)] rounded-[40px] border-2 border-dashed border-[var(--card-border)] text-[var(--text-secondary)] hover:bg-blue-50/50 hover:border-blue-100 hover:text-blue-500 transition-all group'
                                >
                                    <div className='w-16 h-16 bg-[var(--card-bg)] rounded-full flex items-center justify-center text-3xl shadow-sm group-hover:scale-110 transition-transform'>🏢</div>
                                    <span className='text-[10px] font-black uppercase tracking-[0.3em]'>Vincular Empresa</span>
                                </button>
                            )}
                        </div>

                        {/* Audit & Intelligence */}
                        {client.forecast_scored_at && (
                            <div className='bg-gradient-to-br from-[#0F2A44] to-[#1700AC] p-8 rounded-[40px] shadow-2xl shadow-blue-900/40 border border-white/10 text-white relative overflow-hidden group'>
                                <div className='absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-white/10 transition-all'></div>
                                <h2 className='text-xs font-black mb-8 border-b border-white/10 pb-4 uppercase tracking-[0.3em]'>
                                    📊 Análisis de IA
                                </h2>
                                <div className='space-y-8'>
                                    <div className='flex justify-between items-center'>
                                        <div>
                                            <label className='text-[10px] font-black text-blue-300 uppercase tracking-widest block mb-1'>Métrica Log Loss</label>
                                            <p className='text-[9px] font-bold text-white/40 uppercase tracking-widest'>{(client.forecast_logloss ?? 1) < 0.2 ? 'Excelente Precisión' : 'Revisión Necesaria'}</p>
                                        </div>
                                        <div className='text-right'>
                                            <span className={`text-4xl font-black tabular-nums ${(client.forecast_logloss ?? 1) < 0.2 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                {client.forecast_logloss?.toFixed(4) || '0.0000'}
                                            </span>
                                        </div>
                                    </div>

                                    <div className='grid grid-cols-2 gap-6'>
                                        <div className='bg-white/5 p-4 rounded-3xl border border-white/5'>
                                            <label className='text-[9px] font-black text-blue-300 uppercase tracking-widest block mb-2'>Prob. IA</label>
                                            <p className='text-2xl font-black'>{client.forecast_evaluated_probability}%</p>
                                        </div>
                                        <div className='bg-white/5 p-4 rounded-3xl border border-white/5'>
                                            <label className='text-[9px] font-black text-blue-300 uppercase tracking-widest block mb-2'>Estado Final</label>
                                            <p className={`text-xs font-black uppercase tracking-widest py-1.5 rounded-lg text-center ${client.forecast_outcome === 1 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                                {client.forecast_outcome === 1 ? 'Ganada' : 'Perdida'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className='pt-6 border-t border-white/5 flex items-center justify-between opacity-50 hover:opacity-100 transition-opacity'>
                                        <span className='text-[9px] font-black uppercase tracking-widest'>Última Auditoría</span>
                                        <span className='text-[9px] font-bold'>{new Date(client.forecast_scored_at).toLocaleDateString()}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Snapshots Columnar */}
                        {snapshots.length > 0 && (
                            <div className='bg-[var(--card-bg)] p-8 rounded-[40px] shadow-2xl shadow-[#0A1635]/5 border border-[var(--card-border)]'>
                                <h2 className='text-xs font-black text-[var(--text-secondary)] mb-6 uppercase tracking-[0.3em] border-b border-[var(--card-border)] pb-4'>
                                    📸 Snapshots
                                </h2>
                                <div className='space-y-4 max-h-[300px] overflow-y-auto custom-scrollbar pr-3'>
                                    {snapshots.map((snapshot) => (
                                        <div key={snapshot.id} className='flex justify-between items-center p-4 bg-[var(--hover-bg)] rounded-3xl border border-[var(--card-border)] group hover:border-blue-100 hover:bg-[var(--card-bg)] transition-all'>
                                            <div className='space-y-1'>
                                                <p className='text-[10px] font-black text-[var(--text-primary)] uppercase tracking-widest group-hover:text-blue-600 transition-colors'>Corte #{snapshot.snapshot_number}</p>
                                                <p className='text-[9px] font-bold text-[var(--text-secondary)] uppercase'>
                                                    {new Date(snapshot.snapshot_timestamp).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                                                </p>
                                            </div>
                                            <div className='h-10 w-10 bg-[var(--card-bg)] rounded-2xl flex items-center justify-center border border-[var(--card-border)] shadow-sm'>
                                                <span className='text-xs font-black text-[var(--text-primary)]'>
                                                    {snapshot.probability}%
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Modals */}
            {currentUser && (
                <MeetingModal
                    isOpen={isMeetingModalOpen}
                    onClose={() => setIsMeetingModalOpen(false)}
                    onSave={handleCreateMeeting}
                    leadId={client.id}
                    sellerId={client.owner_id || currentUser.id}
                />
            )}
            <TaskModal
                isOpen={isTaskModalOpen}
                onClose={() => setIsTaskModalOpen(false)}
                onSave={handleCreateTask}
                leadId={client.id}
                mode='create'
            />
        </div>
    )
}
