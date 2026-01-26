'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import ClientsTable from '@/components/ClientsTable'
import ClientModal from '@/components/ClientModal'
import ConfirmModal from '@/components/ConfirmModal'
import ClientDetailView from '@/components/ClientDetailView'
import EmailComposerModal from '@/components/EmailComposerModal'
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
    oportunidad: lead.oportunidad || '',
    calificacion: lead.calificacion || 3,
    notas: lead.notas || '',
    empresa_id: lead.empresa_id || undefined,
    probabilidad: (lead as any).probabilidad || 0
})

export default function LeadsPage() {
    const [leads, setLeads] = useState<Lead[]>([])
    const [loading, setLoading] = useState(true)
    const [supabase] = useState(() => createClient())
    const router = useRouter()

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
    const [isCalendarConnected, setIsCalendarConnected] = useState(false)

    // Sorting State
    const [sortBy, setSortBy] = useState('fecha_registro-desc')

    useEffect(() => {
        fetchData()
        checkCalendarConnection()
    }, [])

    const fetchData = async () => {
        setLoading(true)
        const { data, error } = await supabase.from('clientes').select('*').order('created_at', { ascending: false })
        if (data) setLeads(data)
        setLoading(false)
    }

    const checkCalendarConnection = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        setCurrentUser(user)

        const { data } = await supabase
            .from('user_calendar_tokens')
            .select('id')
            .eq('user_id', user.id)
            .single()
        setIsCalendarConnected(!!data)
    }

    const handleEmailClick = (email: string, name: string) => {
        if (!isCalendarConnected) {
            if (confirm('Para enviar correos directamente desde el CRM, necesitas conectar tu cuenta de Google en la sección de Calendario. ¿Deseas ir ahora?')) {
                window.location.href = '/calendario'
            }
            return
        }
        setEmailRecipient({ email, name })
        setIsEmailModalOpen(true)
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
            const payload: any = {
                empresa: finalEmpresaName,
                nombre: leadData.nombre,
                email: leadData.email,
                telefono: leadData.telefono,
                etapa: leadData.etapa,
                valor_estimado: leadData.valor_estimado,
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
                // Initial history entry
                await (supabase.from('lead_history') as any).insert([
                    { lead_id: data[0].id, field_name: 'etapa', new_value: leadData.etapa, changed_by: currentUser.id },
                    { lead_id: data[0].id, field_name: 'probabilidad', new_value: String(leadData.probabilidad), changed_by: currentUser.id }
                ])
            }
        } else if (modalMode === 'edit' && currentLead) {
            // Check for changes to log
            const historyEntries: any[] = []
            if (leadData.etapa !== currentLead.etapa) {
                historyEntries.push({ lead_id: currentLead.id, field_name: 'etapa', old_value: currentLead.etapa, new_value: leadData.etapa, changed_by: currentUser.id })
            }
            if (leadData.probabilidad !== currentLead.probabilidad) {
                historyEntries.push({ lead_id: currentLead.id, field_name: 'probabilidad', old_value: String(currentLead.probabilidad), new_value: String(leadData.probabilidad), changed_by: currentUser.id })
            }

            const payload: any = {
                empresa: finalEmpresaName,
                nombre: leadData.nombre,
                email: leadData.email,
                telefono: leadData.telefono,
                etapa: leadData.etapa,
                valor_estimado: leadData.valor_estimado,
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
                const pValue = leadData.probabilidad !== undefined ? leadData.probabilidad : (currentLead.probabilidad || 50)
                const p = pValue / 100

                // Recalculate if it's new closure OR if data changed on an old closure
                const dataChanged = leadData.probabilidad !== currentLead.probabilidad || leadData.etapa !== currentLead.etapa

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
            } else if (historyEntries.length > 0) {
                await (supabase.from('lead_history') as any).insert(historyEntries)
            }
        }

        setIsModalOpen(false)
        await fetchLeads()
    }

    const handleRowClick = (lead: Lead) => {
        setSelectedLead(lead)
        setIsDetailViewOpen(true)
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

    return (
        <div className='h-full flex flex-col p-8 overflow-hidden bg-[#DDE2E5]'>
            <div className='w-full mx-auto flex flex-col h-full gap-8'>
                {/* Header - Fixed */}
                <div className='shrink-0 space-y-4'>
                    <div className='flex items-center justify-between'>
                        <h1 className='text-3xl font-black text-[#0A1635] tracking-tight'>
                            Leads
                        </h1>

                        <div className='flex gap-3'>
                            <button
                                onClick={() => setIsEditingMode(!isEditingMode)}
                                className={`px-5 py-2.5 rounded-xl font-bold transition-all shadow-sm flex items-center gap-2 ${isEditingMode
                                    ? 'bg-[#1700AC] text-white hover:bg-[#0F2A44]'
                                    : 'bg-white border border-gray-200 text-[#0A1635] hover:bg-gray-50'
                                    }`}
                            >
                                <span>{isEditingMode ? '✅' : '✏️'}</span> {isEditingMode ? 'Terminar Edición' : 'Editar'}
                            </button>
                            <button
                                onClick={openCreateModal}
                                className='px-6 py-2.5 bg-[#8B5CF6] text-white rounded-xl font-bold hover:bg-violet-700 transition-all shadow-md flex items-center gap-2 transform active:scale-95 uppercase text-xs tracking-widest'
                            >
                                <span>➕</span> Nuevo Lead
                            </button>
                            <button
                                onClick={fetchLeads}
                                className='px-5 py-2.5 bg-[#2048FF] text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-md flex items-center gap-2 transform active:scale-95 uppercase text-xs tracking-widest'
                            >
                                <span>🔄</span> Refrescar
                            </button>
                        </div>
                    </div>

                    {/* Filter Bar */}
                    <div className='bg-white p-3 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-4'>
                        <div className='flex-1 relative font-medium min-w-[200px]'>
                            <span className='absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm'>🔍</span>
                            <input
                                type="text"
                                placeholder="Buscar leads..."
                                value={filterSearch}
                                onChange={(e) => setFilterSearch(e.target.value)}
                                className='w-full pl-9 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#2048FF] focus:border-[#2048FF] text-xs text-[#0A1635] font-semibold transition-all placeholder:text-gray-400 hover:border-gray-400'
                            />
                        </div>

                        <div className='flex items-center gap-2 border-l border-gray-100 pl-4'>
                            <label className='text-[9px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap'>Etapa</label>
                            <select
                                value={filterStage}
                                onChange={(e) => setFilterStage(e.target.value)}
                                className='bg-gray-50 border border-transparent hover:border-gray-200 rounded-lg px-2 py-1.5 text-xs font-bold text-[#0A1635] focus:outline-none transition-all cursor-pointer'
                            >
                                <option value="All">Todas</option>
                                <option value="Prospección">Prospección</option>
                                <option value="Negociación">Negociación</option>
                                <option value="Cerrado Ganado">Cerrado Ganado</option>
                                <option value="Cerrado Perdido">Cerrado Perdido</option>
                            </select>
                        </div>

                        <div className='flex items-center gap-2 border-l border-gray-100 pl-4'>
                            <label className='text-[9px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap'>Vendedor</label>
                            <select
                                value={filterOwner}
                                onChange={(e) => setFilterOwner(e.target.value)}
                                className='bg-gray-50 border border-transparent hover:border-gray-200 rounded-lg px-2 py-1.5 text-xs font-bold text-[#0A1635] focus:outline-none transition-all cursor-pointer'
                            >
                                <option value="All">Cualquiera</option>
                                {uniqueOwners.map(owner => (
                                    <option key={owner} value={owner!}>{owner}</option>
                                ))}
                            </select>
                        </div>

                        <div className='flex items-center gap-2 border-l border-gray-100 pl-4'>
                            <label className='text-[9px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap'>Orden</label>
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                                className='bg-gray-50 border border-transparent hover:border-gray-200 rounded-lg px-2 py-1.5 text-xs font-bold text-[#0A1635] focus:outline-none transition-all cursor-pointer'
                            >
                                <option value="fecha_registro-desc">Reciente</option>
                                <option value="fecha_registro-asc">Antiguo</option>
                                <option value="valor_estimado-desc">$$$ → $</option>
                                <option value="calificacion-desc">Calif. ★</option>
                                <option value="etapa-asc">Fase</option>
                                <option value="probabilidad-desc">Prob. %</option>
                                <option value="empresa-asc">Empresa</option>
                            </select>
                        </div>

                        <div className='flex items-center gap-4 ml-auto'>
                            {(filterSearch || filterStage !== 'All' || filterOwner !== 'All' || sortBy !== 'fecha_registro-desc') && (
                                <button
                                    onClick={() => {
                                        setFilterSearch('')
                                        setFilterStage('All')
                                        setFilterOwner('All')
                                        setSortBy('fecha_registro-desc')
                                    }}
                                    className='text-[9px] font-black text-red-500 uppercase tracking-tighter hover:text-red-700 transition-colors bg-red-50 px-2 py-1 rounded-md'
                                >
                                    Limpiar
                                </button>
                            )}

                            <div className='text-[9px] font-black text-gray-300 uppercase tracking-widest whitespace-nowrap'>
                                {sortedAndFilteredLeads.length} leads
                            </div>
                        </div>
                    </div>
                </div>

                {/* Table Area - Scrollable */}
                <div className='flex-1 overflow-y-auto custom-scrollbar bg-white rounded-2xl border border-gray-200 shadow-sm'>
                    {loading && leads.length === 0 ? (
                        <div className='w-full h-full flex items-center justify-center'>
                            <span className='text-gray-400 animate-pulse'>Cargando leads...</span>
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
                onClose={() => setIsDetailViewOpen(false)}
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

            <EmailComposerModal
                isOpen={isEmailModalOpen}
                onClose={() => setIsEmailModalOpen(false)}
                recipientEmail={emailRecipient.email}
                recipientName={emailRecipient.name}
            />
        </div>
    )
}
