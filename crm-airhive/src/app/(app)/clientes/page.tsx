'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import ClientsTable from '@/components/ClientsTable'
import ClientModal from '@/components/ClientModal'
import ConfirmModal from '@/components/ConfirmModal'
import CompanyModal, { CompanyData } from '@/components/CompanyModal'
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
    empresa_id: lead.empresa_id || undefined
})

const normalizeCompany = (company: CompanyData) => ({
    nombre: company.nombre || '',
    tamano: company.tamano || 1,
    ubicacion: company.ubicacion || '',
    logo_url: company.logo_url || '',
    industria: company.industria || '',
    website: company.website || '',
    descripcion: company.descripcion || ''
})

export default function LeadsPage() {
    const [leads, setLeads] = useState<Lead[]>([])
    const [loading, setLoading] = useState(true)
    const [supabase] = useState(() => createClient())

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
    const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false)
    const [currentCompany, setCurrentCompany] = useState<CompanyData | null>(null)
    const [isDetailViewOpen, setIsDetailViewOpen] = useState(false)
    const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
    const [linkedCompanyId, setLinkedCompanyId] = useState<string | null>(null)
    const [newlySavedCompany, setNewlySavedCompany] = useState<{ id: string, nombre: string } | null>(null)
    const [companiesList, setCompaniesList] = useState<{ id: string, nombre: string, industria?: string, ubicacion?: string }[]>([])

    // Memoized initial data to avoid reference changes on every render
    const memoizedInitialLead = useMemo(() => {
        if (!isModalOpen) return null
        return currentLead ? normalizeLead(currentLead) : null
    }, [isModalOpen, currentLead])

    const memoizedInitialCompany = useMemo(() => {
        if (!isCompanyModalOpen) return null
        return currentCompany ? normalizeCompany(currentCompany) : null
    }, [isCompanyModalOpen, currentCompany])

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
        // 2. linkedCompanyId (newly created company session)
        // 3. currentLead?.empresa_id (existing link if any)
        const finalEmpresaId = leadData.empresa_id || linkedCompanyId || (modalMode === 'edit' ? currentLead?.empresa_id : undefined)

        let finalEmpresaName = leadData.empresa
        if (finalEmpresaId) {
            // Find the official name from our lists
            const officialCompany = companiesList.find(c => c.id === finalEmpresaId) ||
                (newlySavedCompany?.id === finalEmpresaId ? newlySavedCompany : null)

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
        setLinkedCompanyId(null) // Reset linked company after save
        setNewlySavedCompany(null)
        await fetchLeads()
    }

    const handleSaveCompany = async (companyData: CompanyData) => {
        if (!currentUser) return

        let savedCompanyId = companyData.id

        // Case 1: Company already exists in catalog (selected via autocomplete)
        // If we have an ID but currentCompany is null, it's a selection from catalog.
        if (companyData.id && !currentCompany) {
            console.log('Company selected from catalog, linking ID:', companyData.id)
            setLinkedCompanyId(companyData.id)
            setNewlySavedCompany({ id: companyData.id, nombre: companyData.nombre })
            setIsCompanyModalOpen(false)
            return
        }

        // Case 2: Update existing company
        if (currentCompany) {
            const { error } = await (supabase
                .from('empresas') as any)
                .update(companyData)
                .eq('id', currentCompany.id)

            if (error) {
                console.error('Error updating company', error)
                alert('Error al actualizar empresa')
                return
            }
            savedCompanyId = currentCompany.id
        }
        // Case 3: Create new company
        else {
            const { data, error } = await (supabase
                .from('empresas') as any)
                .insert([{
                    ...companyData,
                    owner_id: currentUser.id
                }])
                .select()
                .single()

            if (error) {
                console.error('Error creating company', error)
                alert('Error al crear empresa')
                return
            }
            savedCompanyId = data.id
        }

        if (savedCompanyId) {
            setLinkedCompanyId(savedCompanyId)
            setNewlySavedCompany({ id: savedCompanyId, nombre: companyData.nombre })
        }

        setIsCompanyModalOpen(false)
        await fetchLeads() // Refresh to show potential changes if linked
        await fetchCompaniesList() // Refresh autocomplete list
    }

    const handleOpenAdvanced = (companyId?: string) => {
        // Use the passed ID (from modal state), or fall back to linked/current
        const targetId = companyId || linkedCompanyId || currentLead?.empresa_id

        if (targetId) {
            fetchCompanyForModal(targetId)
        } else {
            setCurrentCompany(null)
            setIsCompanyModalOpen(true)
        }
    }

    const fetchCompanyForModal = async (id: string) => {
        const { data, error } = await supabase
            .from('empresas')
            .select('*')
            .eq('id', id)
            .single()

        if (!error && data) {
            setCurrentCompany(data)
            setIsCompanyModalOpen(true)
        }
    }

    const handleRowClick = (lead: Lead) => {
        setSelectedLead(lead)
        setIsDetailViewOpen(true)
    }

    const handleEditLeadFromDetail = (lead: Lead) => {
        setIsDetailViewOpen(false)
        openEditModal(lead)
    }

    const handleEditCompanyFromDetail = (company: CompanyData) => {
        setIsDetailViewOpen(false)
        setCurrentCompany(company)
        setIsCompanyModalOpen(true)
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
        setLinkedCompanyId(null)
        setNewlySavedCompany(null)
        setIsModalOpen(true)
    }

    const openEditModal = (lead: Lead) => {
        setModalMode('edit')
        setCurrentLead(lead)
        setLinkedCompanyId(null)
        setNewlySavedCompany(null)
        setIsModalOpen(true)
    }

    return (
        <div className='min-h-[calc(100vh-70px)] bg-gray-50 p-4'>
            <div className='w-full mx-auto space-y-6'>
                {/* Header */}
                <div className='flex items-center justify-between'>
                    <h1 className='text-3xl font-bold text-[#0A1635]'>
                        Leads
                    </h1>

                    <div className='flex gap-3'>
                        <button
                            onClick={() => setIsEditingMode(!isEditingMode)}
                            className={`px-4 py-2 text-white rounded-lg font-medium transition-colors shadow-sm ${isEditingMode
                                ? 'bg-[#1700AC] hover:bg-[#0F2A44]'
                                : 'bg-[#0A1635] hover:bg-[#0F2A44]'
                                }`}
                        >
                            {isEditingMode ? 'Terminar Edición' : 'Editar'}
                        </button>
                        <button
                            onClick={openCreateModal}
                            className='px-4 py-2 bg-[#8B5CF6] text-white rounded-lg font-medium hover:bg-violet-700 transition-colors shadow-sm'
                        >
                            Nuevo Lead
                        </button>
                        <button
                            onClick={fetchLeads}
                            className='px-4 py-2 bg-[#2048FF] text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm'
                        >
                            Refrescar
                        </button>
                    </div>
                </div>

                {/* Table */}
                {loading ? (
                    <div className='w-full h-64 flex items-center justify-center bg-white rounded-2xl border border-gray-200'>
                        <span className='text-gray-400 animate-pulse'>Cargando leads...</span>
                    </div>
                ) : (
                    <ClientsTable
                        clientes={leads}
                        isEditingMode={isEditingMode}
                        onEdit={openEditModal}
                        onDelete={handleDeleteClick}
                        onRowClick={handleRowClick}
                    />
                )}
            </div>

            {/* Modal */}
            <ClientModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={(data) => handleSaveLead(data as any)}
                initialData={memoizedInitialLead}
                mode={modalMode}
                onOpenAdvanced={handleOpenAdvanced}
                companies={companiesList}
                newlySavedCompany={newlySavedCompany}
            />

            {/* Company Modal */}
            <CompanyModal
                isOpen={isCompanyModalOpen}
                onClose={() => setIsCompanyModalOpen(false)}
                onSave={handleSaveCompany}
                initialData={memoizedInitialCompany}
                companies={companiesList as any}
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
