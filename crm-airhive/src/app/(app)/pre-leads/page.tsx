'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import PreLeadsTable from '@/components/PreLeadsTable'
import PreLeadModal from '@/components/PreLeadModal'
import PreLeadDetailView from '@/components/PreLeadDetailView'
import ClientModal from '@/components/ClientModal'
import ConfirmModal from '@/components/ConfirmModal'
import { Search, Target, Pencil, RotateCw, Filter, ListFilter, ArrowUpDown, Plus } from 'lucide-react'
import RichardDawkinsFooter from '@/components/RichardDawkinsFooter'
import { useAuth } from '@/lib/auth'

export default function PreLeadsPage() {
    const auth = useAuth()
    const [supabase] = useState(() => createClient())
    const [preLeads, setPreLeads] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    // Modals Pre-Lead
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
    const [currentPreLead, setCurrentPreLead] = useState<any>(null)
    const [isEditingMode, setIsEditingMode] = useState(false)
    const [isDetailViewOpen, setIsDetailViewOpen] = useState(false)
    const [selectedPreLead, setSelectedPreLead] = useState<any>(null)
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
    const [deleteId, setDeleteId] = useState<number | null>(null)

    // Modals Conversion (Leads)
    const [isClientModalOpen, setIsClientModalOpen] = useState(false)
    const [clientModalMode, setClientModalMode] = useState<'create' | 'edit' | 'convert'>('create')
    const [clientInitialData, setClientInitialData] = useState<any>(null)
    const [sourcePreLead, setSourcePreLead] = useState<any>(null)
    const [companies, setCompanies] = useState<any[]>([])

    // Filters & Sorting
    const [search, setSearch] = useState('')
    const [vendedorFilter, setVendedorFilter] = useState('All')
    const [industryFilter, setIndustryFilter] = useState('All')
    const [locationFilter, setLocationFilter] = useState('All')
    const [sortBy, setSortBy] = useState('recent')

    // Email Composer State
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false)
    const [emailRecipient, setEmailRecipient] = useState({ email: '', name: '' })
    const [connectedGoogleEmail, setConnectedGoogleEmail] = useState<string | null>(null)
    const [isCalendarConnected, setIsCalendarConnected] = useState(false)

    const fetchPreLeads = async () => {
        const isInitial = preLeads.length === 0
        if (isInitial) setLoading(true)
        try {
            const { data, error } = await (supabase
                .from('pre_leads') as any)
                .select('*')
                .order('created_at', { ascending: false })

            if (error) throw error
            setPreLeads(data || [])
        } catch (error) {
            console.error('Error fetching pre-leads:', error)
        } finally {
            if (isInitial) setLoading(false)
        }
    }

    useEffect(() => {
        if (!auth.loading && auth.loggedIn) {
            fetchPreLeads()
            fetchCompanies()
            checkCalendarConnection()
        }
    }, [auth.loading, auth.loggedIn])

    const fetchCompanies = async () => {
        const { data, error } = await supabase.from('empresas').select('id, nombre')
        if (!error && data) setCompanies(data)
    }

    const checkCalendarConnection = async () => {
        if (!auth.user) return
        const { data } = await (supabase
            .from('google_integrations') as any)
            .select('email')
            .eq('user_id', auth.user.id)
            .maybeSingle()

        if (data) {
            setIsCalendarConnected(true)
            setConnectedGoogleEmail(data.email)
        } else {
            setIsCalendarConnected(false)
            setConnectedGoogleEmail(null)
        }
    }

    const handleEmailClick = (email: string, name: string) => {
        // Prepare Gmail URL with authuser to force the correct account
        let gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}`

        if (connectedGoogleEmail) {
            gmailUrl += `&authuser=${encodeURIComponent(connectedGoogleEmail)}`
        }

        window.open(gmailUrl, '_blank')
    }

    const handleSave = async (data: any) => {
        try {
            const table = supabase.from('pre_leads') as any
            if (modalMode === 'create') {
                const { error } = await table.insert({
                    ...data,
                    vendedor_id: auth.user?.id,
                    vendedor_name: auth.profile?.full_name || auth.username
                })
                if (error) throw error
            } else {
                const { error } = await table
                    .update(data)
                    .eq('id', currentPreLead.id)
                if (error) throw error
            }

            setIsModalOpen(false)
            fetchPreLeads()
        } catch (error: any) {
            alert('Error al guardar: ' + error.message)
        }
    }

    const handlePromote = (pl: any) => {
        setIsDetailViewOpen(false)
        setSourcePreLead(pl)

        // Mappear Pre-Lead a Lead structure
        const initialLeadData = {
            empresa: pl.nombre_empresa,
            nombre: pl.nombre_contacto || '',
            email: pl.correos?.[0] || '',
            telefono: pl.telefonos?.[0] || '',
            notas: pl.notas || '',
            etapa: 'Prospección',
            valor_estimado: 0,
            probabilidad: 50,
            calificacion: 3
        }

        setClientInitialData(initialLeadData)
        setClientModalMode('convert')
        setIsClientModalOpen(true)
    }

    const handleSaveClient = async (data: any) => {
        try {
            // 1. Insert lead in 'clientes' with traceability
            const traceability = clientModalMode === 'convert' ? {
                original_pre_lead_id: sourcePreLead.id,
                original_vendedor_id: sourcePreLead.vendedor_id,
                converted_at: new Date().toISOString(),
                converted_by: auth.user?.id
            } : {}

            const { error: insertError } = await (supabase.from('clientes') as any).insert({
                ...data,
                owner_id: auth.user?.id,
                owner_username: auth.profile?.full_name || auth.username,
                ...traceability
            })

            if (insertError) throw insertError

            // 2. If conversion, mark pre-lead as converted
            if (clientModalMode === 'convert') {
                const { error: updateError } = await (supabase.from('pre_leads') as any)
                    .update({ is_converted: true })
                    .eq('id', sourcePreLead.id)

                if (updateError) console.warn('Lead created but Pre-Lead status not updated:', updateError)
            }

            setIsClientModalOpen(false)
            fetchPreLeads()
            alert(clientModalMode === 'convert' ? '🚀 ¡Ascenso exitoso! El prospecto ahora es un Lead.' : 'Lead guardado exitosamente.')
        } catch (error: any) {
            alert('Error al guardar lead: ' + error.message)
        }
    }

    const handleDelete = async () => {
        if (!deleteId) return
        try {
            const { error } = await (supabase.from('pre_leads') as any).delete().eq('id', deleteId)
            if (error) throw error
            setIsDeleteModalOpen(false)
            fetchPreLeads()
        } catch (error: any) {
            alert('Error al eliminar: ' + error.message)
        }
    }

    const filteredPreLeads = useMemo(() => {
        let result = preLeads.filter(pl => {
            const matchesSearch = !search ||
                pl.nombre_empresa?.toLowerCase().includes(search.toLowerCase()) ||
                pl.nombre_contacto?.toLowerCase().includes(search.toLowerCase()) ||
                pl.correos?.some((c: string) => c.toLowerCase().includes(search.toLowerCase()))

            const matchesVendedor = vendedorFilter === 'All' || pl.vendedor_name === vendedorFilter
            const matchesIndustry = industryFilter === 'All' || pl.giro_empresa === industryFilter
            const matchesLocation = locationFilter === 'All' || pl.ubicacion === locationFilter

            return matchesSearch && matchesVendedor && matchesIndustry && matchesLocation
        })

        if (sortBy === 'recent') {
            result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        } else if (sortBy === 'name') {
            result.sort((a, b) => a.nombre_empresa.localeCompare(b.nombre_empresa))
        }

        return result
    }, [preLeads, search, vendedorFilter, industryFilter, locationFilter, sortBy])

    const uniqueVendedores = useMemo(() => {
        const vends = new Set(preLeads.map(pl => pl.vendedor_name).filter(v => !!v))
        return Array.from(vends).sort()
    }, [preLeads])

    const uniqueIndustries = useMemo(() => {
        const industries = new Set(preLeads.map(pl => pl.giro_empresa).filter(g => !!g))
        return Array.from(industries).sort()
    }, [preLeads])

    const uniqueLocations = useMemo(() => {
        const locations = new Set(preLeads.map(pl => pl.ubicacion).filter(l => !!l))
        return Array.from(locations).sort()
    }, [preLeads])

    if (auth.loading && !auth.loggedIn) {
        return (
            <div className='h-full flex items-center justify-center' style={{ background: 'var(--background)' }}>
                <div className='flex flex-col items-center gap-4'>
                    <div className='w-12 h-12 border-4 border-[#2048FF] border-t-transparent rounded-full animate-spin' />
                    <p className='font-medium' style={{ color: 'var(--text-secondary)' }}>Cargando prospectos...</p>
                </div>
            </div>
        )
    }

    return (
        <div className='min-h-full flex flex-col p-8 overflow-y-auto custom-scrollbar' style={{ background: 'var(--background)' }}>
            <div className='max-w-7xl mx-auto space-y-10 w-full'>
                {/* External Header - Page Level */}
                <div className='flex flex-col md:flex-row md:items-center justify-between gap-6'>
                    <div className='flex items-center gap-8'>
                        <div className='flex items-center gap-6'>
                            <div className='w-16 h-16 bg-[#2c313c] rounded-[22px] flex items-center justify-center border border-white/20 shadow-lg overflow-hidden transition-all hover:scale-105'>
                                <Target size={36} color="white" strokeWidth={1.5} className="drop-shadow-sm" />
                            </div>
                            <div>
                                <h1 className='text-4xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>
                                    Archivo de Pre-Leads
                                </h1>
                                <p className='font-medium' style={{ color: 'var(--text-secondary)' }}>
                                    Exploración y calificación inicial de prospectos.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className='flex items-center gap-4 p-2 rounded-2xl shadow-sm border' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                        <div className='flex gap-3'>
                            <button
                                onClick={() => setIsEditingMode(!isEditingMode)}
                                className={`px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border-2 ${isEditingMode
                                    ? 'bg-rose-600 border-rose-600 text-white shadow-none hover:bg-rose-800 hover:scale-105'
                                    : 'bg-transparent hover:opacity-70 hover:scale-105 active:scale-95'
                                    }`}
                                style={!isEditingMode ? {
                                    borderColor: 'var(--card-border)',
                                    color: 'var(--text-primary)'
                                } : {}}
                            >
                                <div className='flex items-center gap-2'>
                                    {isEditingMode ? (
                                        <span>Bloquear Edición</span>
                                    ) : (
                                        <>
                                            <span>Editar Vista</span>
                                            <Pencil size={12} strokeWidth={2.5} className="opacity-80" />
                                        </>
                                    )}
                                </div>
                            </button>
                            <button
                                onClick={fetchPreLeads}
                                className='px-5 py-2.5 border-2 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all hover:bg-blue-500/10 hover:border-blue-500 hover:text-blue-500 group'
                                style={{
                                    background: 'var(--card-bg)',
                                    borderColor: 'var(--card-border)',
                                    color: 'var(--text-primary)'
                                }}
                            >
                                <div className='flex items-center gap-2'>
                                    <span>Actualizar</span>
                                    <RotateCw size={12} strokeWidth={2.5} className='transition-transform group-hover:rotate-180' />
                                </div>
                            </button>
                        </div>
                        <button
                            onClick={() => { setModalMode('create'); setCurrentPreLead(null); setIsModalOpen(true); }}
                            className='px-8 py-3 bg-[#8B5CF6] text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-purple-500/20 hover:scale-105 active:scale-95 transition-all'
                        >
                            + Registrar Pre-Lead
                        </button>
                    </div>
                </div>

                {/* Main Table Container */}
                <div className='rounded-[40px] shadow-xl border overflow-hidden flex flex-col mb-6' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                    <div className='px-8 py-6 border-b flex flex-col gap-6' style={{ borderColor: 'var(--card-border)' }}>
                        <div className='flex flex-col md:flex-row md:items-center justify-between gap-4'>
                            <div className='flex items-center gap-4'>
                                <div className='w-12 h-12 rounded-[20px] flex items-center justify-center shadow-inner' style={{ background: 'var(--background)', color: 'var(--text-secondary)' }}>
                                    <ListFilter size={24} />
                                </div>
                                <div>
                                    <h2 className='text-xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>Archivo Maestro</h2>
                                    <p className='text-[10px] font-bold uppercase tracking-[0.2em] opacity-60' style={{ color: 'var(--text-secondary)' }}>Prospectos en etapa de validación</p>
                                </div>
                            </div>

                            <div className='flex items-center gap-3'>
                                <div className='px-5 py-2 bg-gradient-to-br from-violet-500/10 to-blue-500/10 rounded-2xl border border-violet-500/20 flex items-center gap-3 shadow-sm'>
                                    <span className='text-2xl font-black tracking-tighter text-[#8B5CF6]'>{filteredPreLeads.length}</span>
                                    <div className='flex flex-col'>
                                        <span className='text-[9px] font-black uppercase tracking-widest' style={{ color: 'var(--text-primary)' }}>Registros</span>
                                        <span className='text-[8px] font-bold uppercase tracking-wider opacity-50' style={{ color: 'var(--text-secondary)' }}>Pre-Calificados</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className='flex flex-col gap-4'>
                            {/* Row 1: Search Bar (Full Width) */}
                            <div className='relative w-full'>
                                <Search className='absolute left-5 top-1/2 -translate-y-1/2 opacity-40' style={{ color: 'var(--text-primary)' }} size={20} />
                                <input
                                    type='text'
                                    placeholder='Buscar por empresa, contacto, correos...'
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className='w-full pl-14 pr-6 py-4 bg-[var(--background)] border border-[var(--card-border)] rounded-[22px] text-sm font-bold placeholder:text-gray-500/50 transition-all focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none shadow-inner'
                                    style={{ color: 'var(--text-primary)' }}
                                />
                            </div>

                            {/* Row 2: Filters Grouped */}
                            <div className='flex flex-wrap items-center justify-between gap-4'>
                                <div className='flex flex-wrap items-center gap-3'>
                                    <div className='flex items-center gap-2 p-1.5 bg-[var(--background)] border border-[var(--card-border)] rounded-2xl shadow-sm'>
                                        <select
                                            value={vendedorFilter}
                                            onChange={(e) => setVendedorFilter(e.target.value)}
                                            className='min-w-[160px] bg-transparent border-none px-4 py-1.5 text-[10px] font-black uppercase tracking-wider text-[var(--text-primary)] focus:ring-0 outline-none cursor-pointer appearance-none'
                                        >
                                            <option value="All">Vendedor: Todos</option>
                                            {uniqueVendedores.map(v => (
                                                <option key={v as string} value={v as string}>{v as string}</option>
                                            ))}
                                        </select>
                                        <div className='w-px h-4 bg-[var(--card-border)]' />
                                        <select
                                            value={industryFilter}
                                            onChange={(e) => setIndustryFilter(e.target.value)}
                                            className='min-w-[160px] bg-transparent border-none px-4 py-1.5 text-[10px] font-black uppercase tracking-wider text-[var(--text-primary)] focus:ring-0 outline-none cursor-pointer appearance-none'
                                        >
                                            <option value="All">Industria: Todas</option>
                                            {uniqueIndustries.map(ind => (
                                                <option key={ind as string} value={ind as string}>{ind as string}</option>
                                            ))}
                                        </select>
                                        <div className='w-px h-4 bg-[var(--card-border)]' />
                                        <select
                                            value={locationFilter}
                                            onChange={(e) => setLocationFilter(e.target.value)}
                                            className='min-w-[160px] bg-transparent border-none px-4 py-1.5 text-[10px] font-black uppercase tracking-wider text-[var(--text-primary)] focus:ring-0 outline-none cursor-pointer appearance-none'
                                        >
                                            <option value="All">Ubicación: Todas</option>
                                            {uniqueLocations.map(loc => (
                                                <option key={loc as string} value={loc as string}>{loc as string}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className='flex items-center gap-2'>
                                        <select
                                            value={sortBy}
                                            onChange={(e) => setSortBy(e.target.value)}
                                            className='min-w-[140px] bg-[#2048FF]/5 border border-[#2048FF]/20 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-[#2048FF] focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none cursor-pointer appearance-none transition-all hover:scale-[1.02] active:scale-95 shadow-sm'
                                        >
                                            <option value="recent">Orden: Reciente</option>
                                            <option value="name">Orden: Alfabético</option>
                                        </select>

                                        {(search || vendedorFilter !== 'All' || industryFilter !== 'All' || locationFilter !== 'All' || sortBy !== 'recent') && (
                                            <button
                                                onClick={() => {
                                                    setSearch('')
                                                    setVendedorFilter('All')
                                                    setIndustryFilter('All')
                                                    setLocationFilter('All')
                                                    setSortBy('recent')
                                                }}
                                                className='p-2.5 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-xl hover:bg-rose-500 hover:text-white transition-all shadow-sm group'
                                                title='Limpiar Filtros'
                                            >
                                                <RotateCw size={16} className='group-active:rotate-180 transition-transform' />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className='flex-1 overflow-x-auto custom-scrollbar min-h-[400px]'>
                        {loading && preLeads.length === 0 ? (
                            <div className='w-full h-96 flex flex-col items-center justify-center gap-4'>
                                <div className='w-12 h-12 border-4 border-[#2048FF] border-t-transparent rounded-full animate-spin' />
                                <p className='text-sm font-bold text-gray-500 animate-pulse uppercase tracking-widest'>Sincronizando Pre-Leads...</p>
                            </div>
                        ) : (
                            <PreLeadsTable
                                preLeads={filteredPreLeads}
                                isEditingMode={isEditingMode}
                                onEdit={(pl) => { setModalMode('edit'); setCurrentPreLead(pl); setIsModalOpen(true); }}
                                onDelete={(id) => { setDeleteId(id); setIsDeleteModalOpen(true); }}
                                onRowClick={(pl) => { setSelectedPreLead(pl); setIsDetailViewOpen(true); }}
                                onEmailClick={handleEmailClick}
                                userEmail={auth.user?.email || undefined}
                            />
                        )}
                    </div>
                </div>
            </div>

            <RichardDawkinsFooter />


            {/* Modales */}
            <PreLeadModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSave}
                initialData={currentPreLead}
                mode={modalMode}
            />

            <PreLeadDetailView
                preLead={selectedPreLead}
                isOpen={isDetailViewOpen}
                onClose={() => setIsDetailViewOpen(false)}
                onPromote={handlePromote}
                onEdit={(pl) => { setIsDetailViewOpen(false); setModalMode('edit'); setCurrentPreLead(pl); setIsModalOpen(true); }}
                onEmailClick={handleEmailClick}
                userEmail={auth.user?.email || undefined}
            />

            <ClientModal
                isOpen={isClientModalOpen}
                onClose={() => setIsClientModalOpen(false)}
                onSave={handleSaveClient}
                initialData={clientInitialData}
                mode={clientModalMode}
                companies={companies}
            />

            <ConfirmModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleDelete}
                title="Eliminar Pre-Lead"
                message="¿Estás seguro de que deseas eliminar este registro? Esta acción es permanente."
                isDestructive
            />

        </div>
    )
}
