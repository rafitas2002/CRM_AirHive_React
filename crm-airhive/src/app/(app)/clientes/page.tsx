'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import ClientsTable from '@/components/ClientsTable'
import ClientModal from '@/components/ClientModal'
import ConfirmModal from '@/components/ConfirmModal'
import ClientDetailView from '@/components/ClientDetailView'
import { Search, Users, Pencil, RotateCw, Filter, ListFilter, ArrowUpDown, Plus } from 'lucide-react'
import RichardDawkinsFooter from '@/components/RichardDawkinsFooter'
import { Database } from '@/lib/supabase'

type Lead = Database['public']['Tables']['clientes']['Row']
type LeadInsert = Database['public']['Tables']['clientes']['Insert']
type LeadUpdate = Database['public']['Tables']['clientes']['Update']

// Helper to normalize lead data for the form (handle nulls)
const normalizeLead = (lead: Lead) => ({
    id: lead.id,
    empresa: lead.empresa || '',
    nombre: lead.nombre || '',
    email: lead.email || '',
    telefono: lead.telefono || '',
    etapa: lead.etapa || 'Prospección',
    valor_estimado: lead.valor_estimado || 0,
    valor_real_cierre: (lead as any).valor_real_cierre ?? null,
    oportunidad: lead.oportunidad || '',
    calificacion: lead.calificacion || 3,
    notas: lead.notas || '',
    empresa_id: lead.empresa_id || undefined,
    probabilidad: (lead as any).probabilidad || 0
})

import { useAuth } from '@/lib/auth'

export default function LeadsPage() {
    const [leads, setLeads] = useState<Lead[]>([])
    const [loading, setLoading] = useState(true)
    const [supabase] = useState(() => createClient())
    const router = useRouter()

    // Auth Hook
    const { user, loading: authLoading } = useAuth()

    // Modal & Editing State
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
    const [currentLead, setCurrentLead] = useState<Lead | null>(null)
    const [isEditingMode, setIsEditingMode] = useState(false)
    const [currentUser, setCurrentUser] = useState<any>(null)

    // Delete Confirmation State
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
    const [clientToDelete, setClientToDelete] = useState<number | null>(null)

    // Company Module State
    const [isDetailViewOpen, setIsDetailViewOpen] = useState(false)
    const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
    const [companiesList, setCompaniesList] = useState<{ id: string, nombre: string, industria?: string, ubicacion?: string }[]>([])

    // Filtering State
    const [filterSearch, setFilterSearch] = useState('')
    const [filterStage, setFilterStage] = useState('All')
    const [filterOwner, setFilterOwner] = useState('All')

    // Email Composer State
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false)
    const [emailRecipient, setEmailRecipient] = useState({ email: '', name: '' })
    const [connectedGoogleEmail, setConnectedGoogleEmail] = useState<string | null>(null)
    const [isCalendarConnected, setIsCalendarConnected] = useState(false)

    // Sorting State
    const [sortBy, setSortBy] = useState('fecha_registro-desc')

    useEffect(() => {
        if (!authLoading && user) {
            setCurrentUser(user)
            checkCalendarConnection(user.id)
        }
    }, [user, authLoading])

    const checkCalendarConnection = async (userId: string) => {
        const { data } = await (supabase
            .from('google_integrations') as any)
            .select('email')
            .eq('user_id', userId)
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

    // Memoized initial data to avoid reference changes on every render
    const memoizedInitialLead = useMemo(() => {
        if (!isModalOpen) return null
        return currentLead ? normalizeLead(currentLead) : null
    }, [isModalOpen, currentLead])

    // Sort & Filter Logic
    const sortedAndFilteredLeads = useMemo(() => {
        const result = leads.filter(lead => {
            const matchesSearch = !filterSearch ||
                lead.nombre?.toLowerCase().includes(filterSearch.toLowerCase()) ||
                lead.empresa?.toLowerCase().includes(filterSearch.toLowerCase()) ||
                lead.email?.toLowerCase().includes(filterSearch.toLowerCase()) ||
                lead.telefono?.toLowerCase().includes(filterSearch.toLowerCase())

            const matchesStage = filterStage === 'All' || lead.etapa === filterStage
            const matchesOwner = filterOwner === 'All' || lead.owner_username === filterOwner

            return matchesSearch && matchesStage && matchesOwner
        })

        // Apply Sorting
        const [field, direction] = sortBy.split('-')
        const isAsc = direction === 'asc'

        return result.sort((a, b) => {
            let comparison = 0

            switch (field) {
                case 'empresa':
                    comparison = (a.empresa || '').localeCompare(b.empresa || '')
                    break
                case 'nombre':
                    comparison = (a.nombre || '').localeCompare(b.nombre || '')
                    break
                case 'valor_estimado':
                    comparison = (a.valor_estimado || 0) - (b.valor_estimado || 0)
                    break
                case 'calificacion':
                    comparison = (a.calificacion || 0) - (b.calificacion || 0)
                    break
                case 'probabilidad':
                    comparison = (a.probabilidad || 0) - (b.probabilidad || 0)
                    break
                case 'fecha_registro':
                    comparison = new Date(a.fecha_registro || 0).getTime() - new Date(b.fecha_registro || 0).getTime()
                    break
                case 'owner_username':
                    comparison = (a.owner_username || '').localeCompare(b.owner_username || '')
                    break
                case 'etapa':
                    const etapaOrder: Record<string, number> = {
                        'Negociación': 1,
                        'Prospección': 2,
                        'Cerrado Ganado': 3,
                        'Cerrado Perdido': 4
                    }
                    comparison = (etapaOrder[a.etapa || ''] || 99) - (etapaOrder[b.etapa || ''] || 99)
                    break
            }

            return isAsc ? comparison : -comparison
        })
    }, [leads, filterSearch, filterStage, filterOwner, sortBy])

    // Get unique owners for filter dropdown
    const uniqueOwners = useMemo(() => {
        const owners = new Set(leads.map(l => l.owner_username).filter((o): o is string => !!o))
        return Array.from(owners).sort()
    }, [leads])

    const fetchLeads = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('clientes')
            .select('*')
            .order('created_at', { ascending: false })

        if (error) {
            console.error('Error fetching leads:', error)
        } else {
            setLeads(data || [])
        }
        setLoading(false)
    }

    const fetchCompaniesList = async () => {
        const { data, error } = await supabase
            .from('empresas')
            .select('*')
            .order('nombre', { ascending: true })

        if (!error && data) {
            setCompaniesList(data as any)
        }
    }

    const fetchUser = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        setCurrentUser(user)
    }

    useEffect(() => {
        fetchLeads()
        fetchCompaniesList()
        fetchUser()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleSaveLead = async (leadData: ReturnType<typeof normalizeLead> & { empresa_id?: string }) => {
        if (!currentUser) {
            alert('No se pudo identificar al usuario actual.')
            return
        }

        const finalEmpresaId = leadData.empresa_id || (modalMode === 'edit' ? currentLead?.empresa_id : undefined)
        let finalEmpresaName = leadData.empresa
        if (finalEmpresaId) {
            const officialCompany = companiesList.find(c => c.id === finalEmpresaId)
            if (officialCompany) finalEmpresaName = officialCompany.nombre
        }

        if (modalMode === 'create') {
            const isWonStage = leadData.etapa === 'Cerrado Ganado'
            const realClosureValue = isWonStage
                ? (leadData.valor_real_cierre ?? leadData.valor_estimado ?? 0)
                : null
            const payload: any = {
                empresa: finalEmpresaName,
                nombre: leadData.nombre,
                email: leadData.email,
                telefono: leadData.telefono,
                etapa: leadData.etapa,
                valor_estimado: leadData.valor_estimado,
                valor_real_cierre: realClosureValue,
                oportunidad: leadData.oportunidad,
                calificacion: leadData.calificacion,
                notas: leadData.notas,
                probabilidad: leadData.probabilidad,
                owner_id: currentUser.id,
                owner_username: currentUser.user_metadata?.username || currentUser.email?.split('@')[0] || 'Unknown',
                empresa_id: finalEmpresaId as string
            }

            const { data, error } = await (supabase
                .from('clientes') as any)
                .insert([payload])
                .select()

            if (error) {
                console.error('Error creating lead:', error)
                alert('Error al crear el lead: ' + error.message)
            } else if (data && data[0]) {
                const newId = data[0].id
                // Track Event: lead_created
                const { trackEvent } = await import('@/app/actions/events')
                trackEvent({
                    eventType: 'lead_created',
                    entityType: 'lead',
                    entityId: newId,
                    metadata: { etapa: leadData.etapa, valor: leadData.valor_estimado }
                })

                // Initial history entry
                await (supabase.from('lead_history') as any).insert([
                    { lead_id: newId, field_name: 'etapa', new_value: leadData.etapa, changed_by: currentUser.id },
                    { lead_id: newId, field_name: 'probabilidad', new_value: String(leadData.probabilidad), changed_by: currentUser.id }
                ])
            }
        } else if (modalMode === 'edit' && currentLead) {
            // Check for changes to log
            const historyEntries: any[] = []
            const stageChanged = leadData.etapa !== currentLead.etapa
            const probChanged = leadData.probabilidad !== (currentLead as any).probabilidad

            if (stageChanged) {
                historyEntries.push({ lead_id: currentLead.id, field_name: 'etapa', old_value: currentLead.etapa, new_value: leadData.etapa, changed_by: currentUser.id })
            }
            if (probChanged) {
                historyEntries.push({ lead_id: currentLead.id, field_name: 'probabilidad', old_value: String((currentLead as any).probabilidad), new_value: String(leadData.probabilidad), changed_by: currentUser.id })
            }

            const isWonStage = leadData.etapa === 'Cerrado Ganado'
            const realClosureValue = isWonStage
                ? (leadData.valor_real_cierre ?? leadData.valor_estimado ?? 0)
                : null
            const payload: any = {
                empresa: finalEmpresaName,
                nombre: leadData.nombre,
                email: leadData.email,
                telefono: leadData.telefono,
                etapa: leadData.etapa,
                valor_estimado: leadData.valor_estimado,
                valor_real_cierre: realClosureValue,
                oportunidad: leadData.oportunidad,
                calificacion: leadData.calificacion,
                notas: leadData.notas,
                probabilidad: leadData.probabilidad,
                empresa_id: finalEmpresaId as string
            }

            // SCORING LOGIC
            const isClosedNow = leadData.etapa === 'Cerrado Ganado' || leadData.etapa === 'Cerrado Perdido'
            const wasClosedBefore = currentLead.etapa === 'Cerrado Ganado' || currentLead.etapa === 'Cerrado Perdido'

            if (isClosedNow) {
                const y = leadData.etapa === 'Cerrado Ganado' ? 1 : 0
                const pValue = leadData.probabilidad !== undefined ? leadData.probabilidad : ((currentLead as any).probabilidad || 50)
                const p = pValue / 100

                // Recalculate if it's new closure OR if data changed on an old closure
                const dataChanged = leadData.probabilidad !== (currentLead as any).probabilidad || leadData.etapa !== currentLead.etapa

                if (!wasClosedBefore || dataChanged) {
                    payload.forecast_evaluated_probability = pValue
                    payload.forecast_outcome = y
                    payload.forecast_scored_at = new Date().toISOString()
                    // Clear old logloss to force recalculation via new formula if needed
                    payload.forecast_logloss = null
                }
            }

            const { error } = await (supabase
                .from('clientes') as any)
                .update(payload)
                .eq('id', currentLead.id)

            if (error) {
                alert(`Error al actualizar el lead: ${error.message} ${error.details || ''}`)
            } else {
                const { trackEvent } = await import('@/app/actions/events')
                // Track Event: lead_stage_change
                if (stageChanged) {
                    trackEvent({
                        eventType: 'lead_stage_change',
                        entityType: 'lead',
                        entityId: currentLead.id,
                        metadata: { oldStage: currentLead.etapa, newStage: leadData.etapa }
                    })
                    if (isClosedNow) {
                        trackEvent({
                            eventType: 'lead_closed',
                            entityType: 'lead',
                            entityId: currentLead.id,
                            metadata: { outcome: leadData.etapa, value: realClosureValue ?? leadData.valor_estimado }
                        })
                    }
                } else if (probChanged) {
                    trackEvent({
                        eventType: 'forecast_registered',
                        entityType: 'lead',
                        entityId: currentLead.id,
                        metadata: { probability: leadData.probabilidad, etapa: leadData.etapa }
                    })
                }

                if (historyEntries.length > 0) {
                    await (supabase.from('lead_history') as any).insert(historyEntries)
                }
            }
        }

        setIsModalOpen(false)
        await fetchLeads()
    }


    const handleRowClick = (lead: Lead) => {
        setSelectedLead(lead)
        setIsDetailViewOpen(true)
        if (typeof window !== 'undefined') {
            window.history.pushState({ ahOverlay: 'lead-detail' }, '')
        }
    }

    const handleCloseDetailView = () => {
        if (typeof window !== 'undefined' && window.history.state?.ahOverlay === 'lead-detail') {
            window.history.replaceState(null, '')
        }
        setIsDetailViewOpen(false)
        setSelectedLead(null)
    }

    const handleEditLeadFromDetail = (lead: Lead) => {
        setIsDetailViewOpen(false)
        openEditModal(lead)
    }

    const handleEditCompanyFromDetail = () => {
        setIsDetailViewOpen(false)
        router.push('/empresas')
    }

    const handleDeleteClick = (id: number) => {
        setClientToDelete(id)
        setIsDeleteModalOpen(true)
        // Ensure detail view is closed if we delete
        setIsDetailViewOpen(false)
    }

    const confirmDelete = async () => {
        if (!clientToDelete) return

        const { error } = await (supabase
            .from('clientes') as any)
            .delete()
            .eq('id', clientToDelete)

        if (error) {
            console.error('Error deleting lead:', error)
            alert('Error al eliminar el lead')
        } else {
            // Clear selected lead if it's the one being deleted
            if (selectedLead?.id === clientToDelete) {
                setSelectedLead(null)
                setIsDetailViewOpen(false)
            }
            await fetchLeads()
        }
        setClientToDelete(null)
        setIsDeleteModalOpen(false)
    }

    const openCreateModal = () => {
        setModalMode('create')
        setCurrentLead(null)
        setIsModalOpen(true)
    }

    const openEditModal = (lead: Lead) => {
        setModalMode('edit')
        setCurrentLead(lead)
        setIsModalOpen(true)
    }

    useEffect(() => {
        const onPopState = () => {
            setIsDetailViewOpen(false)
            setSelectedLead(null)
        }
        window.addEventListener('popstate', onPopState)
        return () => window.removeEventListener('popstate', onPopState)
    }, [])

    return (
        <div className='h-full flex flex-col p-8 overflow-y-auto' style={{ background: 'transparent' }}>
            <div className='max-w-7xl mx-auto space-y-10 w-full'>
                {/* External Header - Page Level */}
                {/* Header Pattern consistent with Empresas */}
                <div className='flex flex-col md:flex-row md:items-center justify-between gap-6'>
                    <div className='flex items-center gap-8'>
                        <div className='flex items-center gap-6'>
                            <div className='ah-icon-card transition-all hover:scale-105'>
                                <Users size={34} strokeWidth={1.9} />
                            </div>
                            <div>
                                <h1 className='text-4xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>
                                    Leads & Prospección
                                </h1>
                                <p className='font-medium' style={{ color: 'var(--text-secondary)' }}>
                                    Gestión y seguimiento de oportunidades comerciales.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className='flex items-center gap-4 p-2 rounded-2xl shadow-sm border' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                        <button
                            onClick={() => setIsEditingMode(!isEditingMode)}
                            className={`px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border-2 cursor-pointer ${isEditingMode
                                ? 'bg-rose-600 border-rose-600 text-white shadow-none hover:bg-rose-800 hover:scale-105'
                                : 'bg-transparent hover:bg-blue-500/10 hover:border-blue-500 hover:text-blue-500 hover:scale-105 active:scale-95'
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
                            onClick={openCreateModal}
                            className='px-8 py-3 bg-[#2048FF] text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:bg-[#1b3de6] hover:scale-105 active:scale-95 transition-all cursor-pointer'
                        >
                            + Nuevo Lead
                        </button>
                    </div>
                </div>

                {/* Main Table Container */}
                <div className='rounded-[40px] shadow-xl border overflow-hidden flex flex-col mb-6' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                    <div className='px-8 py-6 border-b flex flex-col gap-6' style={{ borderColor: 'var(--card-border)' }}>
                        <div className='flex flex-col md:flex-row md:items-center justify-between gap-4'>
                            <div className='flex items-center gap-4'>
                                <div className='ah-icon-card ah-icon-card-sm'>
                                    <ListFilter size={22} strokeWidth={2} />
                                </div>
                                <div>
                                    <h2 className='text-xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>Bandeja de leads</h2>
                                    <p className='text-[10px] font-bold uppercase tracking-[0.2em] opacity-60' style={{ color: 'var(--text-secondary)' }}>Pipeline de Ventas y Seguimiento</p>
                                </div>
                            </div>

                            <div className='flex items-center gap-3'>
                                <div className='ah-count-chip'>
                                    <span className='ah-count-chip-number'>{sortedAndFilteredLeads.length}</span>
                                    <div className='ah-count-chip-meta'>
                                        <span className='ah-count-chip-title'>Prospectos</span>
                                        <span className='ah-count-chip-subtitle'>Filtrados</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className='ah-table-toolbar'>
                            <div className='ah-table-controls'>
                                <div className='ah-search-control'>
                                    <Search className='ah-search-icon' size={18} />
                                    <input
                                        type='text'
                                        placeholder='Buscar por nombre, empresa, correo...'
                                        value={filterSearch}
                                        onChange={(e) => setFilterSearch(e.target.value)}
                                        className='ah-search-input'
                                    />
                                </div>
                                <select
                                    value={filterStage}
                                    onChange={(e) => setFilterStage(e.target.value)}
                                    className='ah-select-control'
                                >
                                    <option value="All">Etapa: Todas</option>
                                    <option value="Prospección">Prospección</option>
                                    <option value="Negociación">Negociación</option>
                                    <option value="Cerrado Ganado">Cerrado Ganado</option>
                                    <option value="Cerrado Perdido">Cerrado Perdido</option>
                                </select>

                                <select
                                    value={filterOwner}
                                    onChange={(e) => setFilterOwner(e.target.value)}
                                    className='ah-select-control'
                                >
                                    <option value="All">Vendedor: Todos</option>
                                    {uniqueOwners.map(owner => (
                                        <option key={owner} value={owner!}>{owner}</option>
                                    ))}
                                </select>
                                <select
                                    value={sortBy}
                                    onChange={(e) => setSortBy(e.target.value)}
                                    className='ah-select-control'
                                >
                                    <option value="fecha_registro-desc">Orden: Reciente</option>
                                    <option value="fecha_registro-asc">Orden: Antiguo</option>
                                    <option value="valor_estimado-desc">Orden: $$$</option>
                                    <option value="calificacion-desc">Orden: Estrellas</option>
                                    <option value="probabilidad-desc">Orden: Prob.</option>
                                </select>
                                {(filterSearch || filterStage !== 'All' || filterOwner !== 'All' || sortBy !== 'fecha_registro-desc') && (
                                    <button
                                        onClick={() => {
                                            setFilterSearch('')
                                            setFilterStage('All')
                                            setFilterOwner('All')
                                            setSortBy('fecha_registro-desc')
                                        }}
                                        className='ah-reset-filter-btn'
                                        title='Limpiar Filtros'
                                    >
                                        <RotateCw size={18} />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className='flex-1 overflow-x-auto custom-scrollbar min-h-[400px]'>
                        {loading && leads.length === 0 ? (
                            <div className='w-full h-96 flex flex-col items-center justify-center gap-4'>
                                <div className='w-12 h-12 border-4 border-[#2048FF] border-t-transparent rounded-full animate-spin' />
                                <p className='text-sm font-bold text-gray-500 animate-pulse uppercase tracking-widest'>Sincronizando Leads...</p>
                            </div>
                        ) : (
                            <ClientsTable
                                clientes={sortedAndFilteredLeads}
                                isEditingMode={isEditingMode}
                                onEdit={openEditModal}
                                onDelete={handleDeleteClick}
                                onRowClick={handleRowClick}
                                onEmailClick={handleEmailClick}
                                userEmail={currentUser?.email || undefined}
                            />
                        )}
                    </div>
                </div>
            </div>

            <RichardDawkinsFooter />


            {/* Modal */}
            <ClientModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={(data) => handleSaveLead(data as any)}
                initialData={memoizedInitialLead}
                mode={modalMode}
                onNavigateToCompanies={() => router.push('/empresas')}
                companies={companiesList}
            />


            {/* Detail View */}
            <ClientDetailView
                client={selectedLead as any}
                isOpen={isDetailViewOpen}
                onClose={handleCloseDetailView}
                onEditClient={(lead) => handleEditLeadFromDetail(lead as any)}
                onEditCompany={handleEditCompanyFromDetail}
                onEmailClick={handleEmailClick}
                userEmail={currentUser?.email || undefined}
            />

            {/* Delete Confirmation Modal */}
            <ConfirmModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title="Eliminar Lead"
                message="¿Estás seguro de que deseas eliminar este lead? Esta acción no se puede deshacer."
                isDestructive={true}
            />

        </div >
    )
}
