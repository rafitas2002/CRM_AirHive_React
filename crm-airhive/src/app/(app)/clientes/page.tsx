'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import ClientsTable from '@/components/ClientsTable'
import ClientModal from '@/components/ClientModal'
import ConfirmModal from '@/components/ConfirmModal'
import ClientDetailView from '@/components/ClientDetailView'
import { Database } from '@/lib/supabase'

type Lead = Database['public']['Tables']['clientes']['Row']
type LeadInsert = Database['public']['Tables']['clientes']['Insert']
type LeadUpdate = Database['public']['Tables']['clientes']['Update']

// Helper to normalize lead data for the form (handle nulls)
const normalizeLead = (lead: Lead) => ({
    empresa: lead.empresa || '',
    nombre: lead.nombre || '',
    contacto: lead.contacto || '',
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

    // Memoized initial data to avoid reference changes on every render
    const memoizedInitialLead = useMemo(() => {
        if (!isModalOpen) return null
        return currentLead ? normalizeLead(currentLead) : null
    }, [isModalOpen, currentLead])

    // Filter Logic
    const filteredLeads = useMemo(() => {
        return leads.filter(lead => {
            const matchesSearch = !filterSearch ||
                lead.nombre?.toLowerCase().includes(filterSearch.toLowerCase()) ||
                lead.empresa?.toLowerCase().includes(filterSearch.toLowerCase()) ||
                lead.contacto?.toLowerCase().includes(filterSearch.toLowerCase())

            const matchesStage = filterStage === 'All' || lead.etapa === filterStage
            const matchesOwner = filterOwner === 'All' || lead.owner_username === filterOwner

            return matchesSearch && matchesStage && matchesOwner
        })
    }, [leads, filterSearch, filterStage, filterOwner])

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

        // Priority:
        // 1. empresa_id directly from the form (autocomplete selection)
        // 2. currentLead?.empresa_id (existing link if any)
        const finalEmpresaId = leadData.empresa_id || (modalMode === 'edit' ? currentLead?.empresa_id : undefined)

        let finalEmpresaName = leadData.empresa
        if (finalEmpresaId) {
            // Find the official name from our lists
            const officialCompany = companiesList.find(c => c.id === finalEmpresaId)

            if (officialCompany) {
                finalEmpresaName = officialCompany.nombre
            }
        }

        if (modalMode === 'create') {
            const payload: LeadInsert = {
                ...leadData,
                empresa: finalEmpresaName,
                owner_id: currentUser.id,
                owner_username: currentUser.user_metadata?.username || currentUser.email?.split('@')[0] || 'Unknown',
                empresa_id: finalEmpresaId as string
            }

            // Cast to any to avoid generic type inference issues with library
            const { error } = await (supabase
                .from('clientes') as any)
                .insert([payload])

            if (error) {
                console.error('Error creating lead:', error)
                alert('Error al crear el lead: ' + error.message)
            }
        } else if (modalMode === 'edit' && currentLead) {
            const payload: LeadUpdate = {
                ...leadData,
                empresa: finalEmpresaName,
                empresa_id: finalEmpresaId as string
            }

            const { error } = await (supabase
                .from('clientes') as any)
                .update(payload)
                .eq('id', currentLead.id)

            if (error) {
                console.error('Error updating lead:', error)
                alert('Error al actualizar el lead')
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
        <div className='h-full flex flex-col p-8 overflow-hidden bg-[#E9ECEF]'>
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
                    <div className='bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-wrap items-center gap-6'>
                        <div className='flex-1 min-w-[300px] relative font-medium'>
                            <span className='absolute left-4 top-1/2 -translate-y-1/2 text-gray-500'>🔍</span>
                            <input
                                type="text"
                                placeholder="Buscar por nombre, empresa o contacto..."
                                value={filterSearch}
                                onChange={(e) => setFilterSearch(e.target.value)}
                                className='w-full pl-12 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2048FF]/30 focus:border-[#2048FF] text-sm text-[#0A1635] font-semibold transition-all placeholder:text-gray-400 hover:border-gray-400'
                            />
                        </div>

                        <div className='flex items-center gap-3'>
                            <label className='text-[10px] font-black text-gray-500 uppercase tracking-widest'>Etapa:</label>
                            <select
                                value={filterStage}
                                onChange={(e) => setFilterStage(e.target.value)}
                                className='bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-bold text-[#0A1635] focus:outline-none focus:ring-2 focus:ring-[#2048FF]/30 focus:border-[#2048FF] transition-all cursor-pointer hover:border-gray-400'
                            >
                                <option value="All">Todas</option>
                                <option value="Prospección">Prospección</option>
                                <option value="Negociación">Negociación</option>
                                <option value="Cerrado">Cerrado</option>
                                <option value="Ganada">Ganada</option>
                            </select>
                        </div>

                        <div className='flex items-center gap-3'>
                            <label className='text-[10px] font-black text-gray-500 uppercase tracking-widest'>Vendedor:</label>
                            <select
                                value={filterOwner}
                                onChange={(e) => setFilterOwner(e.target.value)}
                                className='bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-bold text-[#0A1635] focus:outline-none focus:ring-2 focus:ring-[#2048FF]/30 focus:border-[#2048FF] transition-all cursor-pointer hover:border-gray-400'
                            >
                                <option value="All">Cualquiera</option>
                                {uniqueOwners.map(owner => (
                                    <option key={owner} value={owner!}>{owner}</option>
                                ))}
                            </select>
                        </div>

                        {(filterSearch || filterStage !== 'All' || filterOwner !== 'All') && (
                            <button
                                onClick={() => {
                                    setFilterSearch('')
                                    setFilterStage('All')
                                    setFilterOwner('All')
                                }}
                                className='text-[10px] font-black text-red-500 uppercase tracking-tighter hover:text-red-700 transition-colors'
                            >
                                Limpiar Filtros
                            </button>
                        )}

                        <div className='ml-auto text-[10px] font-black text-gray-300 uppercase tracking-[0.2em]'>
                            Mostrando {filteredLeads.length} de {leads.length}
                        </div>
                    </div>
                </div>

                {/* Table Area - Scrollable */}
                <div className='flex-1 overflow-y-auto custom-scrollbar bg-white rounded-2xl border border-gray-200 shadow-sm'>
                    {loading ? (
                        <div className='w-full h-full flex items-center justify-center'>
                            <span className='text-gray-400 animate-pulse'>Cargando leads...</span>
                        </div>
                    ) : (
                        <ClientsTable
                            clientes={filteredLeads}
                            isEditingMode={isEditingMode}
                            onEdit={openEditModal}
                            onDelete={handleDeleteClick}
                            onRowClick={handleRowClick}
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
        </div>
    )
}
