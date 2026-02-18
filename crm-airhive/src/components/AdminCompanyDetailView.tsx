'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { CompanyData } from './CompanyModal'
import type { Database } from '@/lib/supabase'
import ClientDetailView from './ClientDetailView'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'
import { FileText, MapPin, Globe, Users2, ClipboardList } from 'lucide-react'
import { buildIndustryBadgeVisualMap, getIndustryBadgeVisualFromMap } from '@/lib/industryBadgeVisuals'

type Cliente = Database['public']['Tables']['clientes']['Row']

/**
 * AdminCompanyDetailView - A detailed view of a company including its associated leads.
 */
interface AdminCompanyDetailViewProps {
    isOpen: boolean
    onClose: () => void
    company: CompanyData
    currentUserProfile?: any | null
}

export default function AdminCompanyDetailView({
    isOpen,
    onClose,
    company,
    currentUserProfile
}: AdminCompanyDetailViewProps) {
    useBodyScrollLock(isOpen)
    const [clients, setClients] = useState<Cliente[]>([])
    const [loadingClients, setLoadingClients] = useState(false)
    const [selectedClient, setSelectedClient] = useState<Cliente | null>(null)
    const [isClientDetailOpen, setIsClientDetailOpen] = useState(false)
    const supabase = createClient()

    useEffect(() => {
        if (isOpen && company.id) {
            fetchAssociatedClients(company.id)
        }
    }, [isOpen, company.id])

    const fetchAssociatedClients = async (companyId: string) => {
        setLoadingClients(true)

        let query = supabase
            .from('clientes')
            .select('*')
            .eq('empresa_id', companyId)
            .order('nombre', { ascending: true })

        // 🛡️ SECURITY FILTER
        // If not admin, only see leads owned by current user
        if (currentUserProfile && currentUserProfile.role !== 'admin' && currentUserProfile.role !== 'rh') {
            query = (query as any).eq('owner_id', currentUserProfile.id)
        }

        const { data, error } = await query

        if (error) {
            console.error('Error fetching associated clients:', error)
        } else {
            setClients(data || [])
        }
        setLoadingClients(false)
    }

    const handleClientClick = (client: Cliente) => {
        setSelectedClient(client)
        setIsClientDetailOpen(true)
    }

    if (!isOpen) return null

    const companyBadgeIndustries = Array.from(new Set([
        ...(company.industrias || []),
        ...(company.industria ? [company.industria] : [])
    ]))
        .filter(Boolean)
        .map((name, idx) => ({ id: `company-industry-${idx}-${name}`, name }))

    const companyBadgeVisualMap = buildIndustryBadgeVisualMap(companyBadgeIndustries)

    return (
        <div className='fixed inset-x-0 bottom-0 top-[70px] z-[130] bg-[var(--background)] flex flex-col animate-in fade-in slide-in-from-bottom duration-300'>
            {/* Header */}
            <div className='bg-[#0A1635] px-8 py-6 flex items-center justify-between shadow-xl shrink-0 border-b border-[var(--card-border)]'>
                <div className='flex items-center gap-4'>
                    {company.logo_url && (
                        <img src={company.logo_url} alt={company.nombre} className='h-10 w-10 object-cover bg-white rounded-lg' />
                    )}
                    <h1 className='text-2xl font-black text-white tracking-tight'>
                        {company.nombre}
                    </h1>
                </div>

                <div className='flex items-center gap-3'>
                    <span className='px-4 py-1.5 rounded-full bg-blue-500/20 text-blue-100 text-xs font-bold border border-blue-500/30 uppercase tracking-widest'>
                        Empresa Certificada
                    </span>
                    <button
                        onClick={onClose}
                        className='h-10 px-4 rounded-2xl font-black text-[10px] uppercase tracking-widest border transition-all hover:brightness-110 hover:shadow-lg hover:scale-[1.02] active:scale-95'
                        style={{ background: 'var(--card-bg)', color: 'var(--text-primary)', borderColor: 'var(--card-border)' }}
                        title='Regresar'
                    >
                        Regresar
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className='flex-1 overflow-y-auto bg-[var(--background)] custom-scrollbar'>
                <div className='max-w-7xl mx-auto p-8 grid grid-cols-1 lg:grid-cols-12 gap-8'>

                    {/* Left Panel: Company Metadata */}
                    <div className='lg:col-span-4 space-y-6'>
                        <div className='bg-[var(--card-bg)] rounded-3xl p-8 shadow-sm border border-[var(--card-border)]'>
                            <h2 className='text-xl font-black text-[var(--text-primary)] mb-6 flex items-center gap-2 tracking-tight'>
                                <FileText size={20} className='text-[var(--accent-secondary)]' /> Datos Generales
                            </h2>

                            <div className='space-y-6'>
                                <div className='p-4 bg-[var(--hover-bg)] rounded-2xl border border-[var(--card-border)]'>
                                    <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-[0.2em] block mb-1'>Industria</label>
                                    <p className='text-[var(--text-primary)] font-bold text-lg'>{company.industria || 'N/A'}</p>
                                    {!!company.industrias?.length && (
                                        <div className='mt-3 flex flex-wrap gap-2'>
                                            {company.industrias.map((industry) => (
                                                <span
                                                    key={industry}
                                                    className='px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-blue-500/10 text-blue-500 border border-blue-500/20'
                                                >
                                                    {industry}
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    {!!companyBadgeIndustries.length && (
                                        <div className='mt-4 p-3 rounded-xl border bg-[var(--card-bg)] border-[var(--card-border)]'>
                                            <div className='flex flex-wrap gap-2'>
                                                {companyBadgeIndustries.map((industry) => {
                                                    const badgeVisual = getIndustryBadgeVisualFromMap(industry.id, companyBadgeVisualMap, industry.name)
                                                    const IndustryIcon = badgeVisual.icon
                                                    return (
                                                        <span
                                                            key={industry.id}
                                                            className={`w-9 h-9 rounded-lg border flex items-center justify-center shadow-sm ${badgeVisual.containerClass}`}
                                                            title={industry.name}
                                                        >
                                                            <IndustryIcon size={15} className={badgeVisual.iconClass} strokeWidth={2.3} />
                                                        </span>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className='p-4 bg-[var(--hover-bg)] rounded-2xl border border-[var(--card-border)]'>
                                    <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-[0.2em] block mb-1'>Ubicación</label>
                                    <div className='flex items-center gap-2'>
                                        <MapPin size={20} className='text-red-500 shrink-0' />
                                        <p className='text-[var(--text-primary)] font-bold text-lg'>{company.ubicacion || 'No especificada'}</p>
                                    </div>
                                </div>

                                <div className='p-4 bg-[var(--hover-bg)] rounded-2xl border border-[var(--card-border)]'>
                                    <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-[0.2em] block mb-1'>Website</label>
                                    {company.website ? (
                                        <a
                                            href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                                            target='_blank'
                                            className='text-blue-500 font-bold hover:underline flex items-center gap-2 truncate text-lg'
                                        >
                                            <Globe size={20} className='text-blue-500 shrink-0' />
                                            {company.website}
                                        </a>
                                    ) : (
                                        <p className='text-[var(--text-secondary)]'>No registrado</p>
                                    )}
                                </div>

                                <div className='p-4 bg-[var(--hover-bg)] rounded-2xl border border-[var(--card-border)]'>
                                    <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-[0.2em] block mb-1'>Tamaño de Empresa</label>
                                    <div className='flex items-center gap-3 mt-2'>
                                        <span className='text-3xl font-black text-[var(--text-primary)]'>{company.tamano || 0}</span>
                                        <div className='flex gap-1 flex-1'>
                                            {[1, 2, 3, 4, 5].map(i => (
                                                <div key={i} className={`h-2.5 flex-1 rounded-full ${i <= (company.tamano || 0) ? 'bg-[#2048FF]' : 'bg-[var(--background)]'}`} />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className='bg-[var(--card-bg)] rounded-3xl p-8 shadow-sm border border-[var(--card-border)]'>
                            <h2 className='text-xl font-black text-[var(--text-primary)] mb-4 flex items-center gap-2 tracking-tight'>
                                <ClipboardList size={20} className='text-[var(--accent-secondary)]' /> Descripción
                            </h2>
                            <p className='text-[var(--text-secondary)] leading-relaxed font-medium bg-[var(--hover-bg)] p-6 rounded-2xl border border-[var(--card-border)]'>
                                {company.descripcion || 'Sin descripción detallada.'}
                            </p>
                        </div>
                    </div>

                    {/* Right Panel: Associated Entities */}
                    <div className='lg:col-span-8 space-y-6'>
                        <div className='bg-[var(--card-bg)] rounded-3xl shadow-sm border border-[var(--card-border)] flex flex-col'>
                            <div className='p-8 border-b border-[var(--card-border)] flex items-center justify-between'>
                                <h2 className='text-2xl font-black text-[var(--text-primary)] flex items-center gap-3 tracking-tight'>
                                    <Users2 size={24} className='text-[var(--accent-secondary)]' /> Contactos y Leads Asociados
                                    <span className='bg-[var(--hover-bg)] text-[var(--text-primary)] text-xs px-3 py-1 rounded-full font-black border border-[var(--card-border)]'>
                                        {clients.length}
                                    </span>
                                </h2>
                            </div>

                            <div className='p-0'>
                                {loadingClients ? (
                                    <div className='py-20 text-center animate-pulse'>
                                        <p className='text-[var(--text-secondary)] font-bold'>Cargando base de contactos...</p>
                                    </div>
                                ) : clients.length > 0 ? (
                                    <div className='overflow-x-auto'>
                                        <table className='w-full text-left'>
                                            <thead className='bg-[var(--hover-bg)]'>
                                                <tr>
                                                    <th className='px-8 py-4 text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-[0.2em]'>Nombre / Usuario</th>
                                                    <th className='px-8 py-4 text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-[0.2em]'>Contacto</th>
                                                    <th className='px-8 py-4 text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-[0.2em]'>Etapa</th>
                                                    <th className='px-8 py-4 text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-[0.2em] text-right'>Valor</th>
                                                </tr>
                                            </thead>
                                            <tbody className='divide-y divide-[var(--card-border)]'>
                                                {clients.map((client) => (
                                                    <tr
                                                        key={client.id}
                                                        onClick={() => handleClientClick(client)}
                                                        className='hover:bg-blue-50/50 cursor-pointer transition-colors group'
                                                    >
                                                        <td className='px-8 py-5'>
                                                            <div className='flex items-center gap-3'>
                                                                <div className='w-10 h-10 rounded-full bg-gradient-to-tr from-[#2048FF] to-[#8B5CF6] flex items-center justify-center text-white font-black text-sm shadow-md transition-transform group-hover:scale-110'>
                                                                    {client.nombre?.charAt(0) || '?'}
                                                                </div>
                                                                <div>
                                                                    <p className='text-[var(--text-primary)] font-black text-sm'>{client.nombre}</p>
                                                                    <p className='text-[var(--text-secondary)] text-[10px] uppercase font-bold tracking-widest opacity-60'>@{client.owner_username}</p>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className='px-8 py-5 text-[var(--text-secondary)] font-medium text-sm'>
                                                            {client.contacto || '-'}
                                                        </td>
                                                        <td className='px-8 py-5'>
                                                            <span className={`px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase border ${client.etapa === 'Cerrado Ganado' ? 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20' :
                                                                client.etapa === 'Cerrado Perdido' ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' :
                                                                    client.etapa === 'Negociación' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                                                                        'bg-blue-500/10 text-blue-500 border-blue-500/20'
                                                                }`}>
                                                                {client.etapa}
                                                            </span>
                                                        </td>
                                                        <td className='px-8 py-5 text-right font-black text-[var(--text-primary)] text-sm'>
                                                            ${client.valor_estimado?.toLocaleString() || '0'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div className='py-20 text-center bg-[var(--hover-bg)] rounded-3xl'>
                                        <p className='text-[var(--text-secondary)] font-bold'>No hay leads asociados a esta empresa.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Nested Client Detail View */}
            {selectedClient && (
                <ClientDetailView
                    isOpen={isClientDetailOpen}
                    onClose={() => setIsClientDetailOpen(false)}
                    client={selectedClient as any}
                    onEditClient={() => { }} // Read-only for now in this view
                    onEditCompany={() => { }}
                    onEmailClick={() => { }} // Added missing prop
                />
            )}
        </div>
    )
}
