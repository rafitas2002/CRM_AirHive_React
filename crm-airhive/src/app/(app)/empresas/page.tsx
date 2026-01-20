'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import CompaniesTable from '@/components/CompaniesTable'
import CompanyModal, { CompanyData } from '@/components/CompanyModal'
import AdminCompanyDetailView from '@/components/AdminCompanyDetailView'
import ConfirmModal from '@/components/ConfirmModal'
import Link from 'next/link'

export default function EmpresasPage() {
    const auth = useAuth()
    const router = useRouter()
    const [companies, setCompanies] = useState<CompanyData[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedCompany, setSelectedCompany] = useState<CompanyData | null>(null)
    const [isDetailOpen, setIsDetailOpen] = useState(false)
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
    const [companyToDelete, setCompanyToDelete] = useState<string | null>(null)

    // Modal state for creating/editing from this page
    const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false)
    const [modalCompanyData, setModalCompanyData] = useState<CompanyData | null>(null)
    const [isEditingMode, setIsEditingMode] = useState(false)

    const supabase = createClient()

    useEffect(() => {
        // Redirect if not logged in
        if (!auth.loading && !auth.loggedIn) {
            router.push('/home')
            return
        }

        if (auth.loggedIn) {
            fetchCompanies()
        }
    }, [auth.loading, auth.loggedIn, router])

    const fetchCompanies = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('empresas')
            .select('*')
            .order('nombre', { ascending: true })

        if (error) {
            console.error('Error fetching companies:', error)
        } else {
            setCompanies(data || [])
        }
        setLoading(false)
    }

    const handleRowClick = (company: CompanyData) => {
        setSelectedCompany(company)
        setIsDetailOpen(true)
    }

    const handleEditClick = (company: CompanyData) => {
        setModalCompanyData(company)
        setIsCompanyModalOpen(true)
    }

    const handleDeleteClick = (id: string) => {
        setCompanyToDelete(id)
        setIsDeleteModalOpen(true)
    }

    const confirmDelete = async () => {
        if (!companyToDelete) return

        const { error } = await supabase
            .from('empresas')
            .delete()
            .eq('id', companyToDelete)

        if (error) {
            console.error('Error deleting company:', error)
            alert('Error al eliminar la empresa')
        } else {
            await fetchCompanies()
        }

        setIsDeleteModalOpen(false)
        setCompanyToDelete(null)
    }

    const openCreateModal = () => {
        setModalCompanyData(null)
        setIsCompanyModalOpen(true)
    }

    const handleSaveCompany = async (companyData: CompanyData) => {
        const isEditing = !!modalCompanyData

        if (isEditing) {
            const { error } = await (supabase
                .from('empresas') as any)
                .update(companyData)
                .eq('id', modalCompanyData.id)

            if (error) {
                console.error('Error updating company:', error)
                alert('Error al actualizar la empresa')
                return
            }
        } else {
            const { error } = await (supabase
                .from('empresas') as any)
                .insert([{
                    ...companyData,
                    owner_id: auth.profile?.id
                }])

            if (error) {
                console.error('Error creating company:', error)
                alert('Error al crear la empresa')
                return
            }
        }

        setIsCompanyModalOpen(false)
        await fetchCompanies()
    }

    if (auth.loading || loading) {
        return (
            <div className='h-full bg-gray-50 flex items-center justify-center'>
                <div className='flex flex-col items-center gap-4'>
                    <div className='w-12 h-12 border-4 border-[#2048FF] border-t-transparent rounded-full animate-spin' />
                    <p className='text-gray-500 font-medium'>Cargando catálogo de empresas...</p>
                </div>
            </div>
        )
    }

    if (!auth.loggedIn) {
        return null // Will redirect
    }

    return (
        <div className='h-full flex flex-col p-8 overflow-hidden bg-gray-50'>
            <div className='w-full mx-auto flex flex-col h-full gap-8'>
                {/* Header - Fixed */}
                <div className='shrink-0 flex items-center justify-between'>
                    <div className='flex items-center gap-4'>
                        <Link
                            href='/clientes'
                            className='w-10 h-10 flex items-center justify-center bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all shadow-sm'
                            title='Volver a Leads'
                        >
                            <span className='text-xl'>←</span>
                        </Link>
                        <div>
                            <h1 className='text-4xl font-black text-[#0A1635] tracking-tight'>
                                Catálogo de Empresas
                            </h1>
                            <p className='text-gray-500 mt-1 font-medium text-sm'>
                                Administra las empresas existentes o crea nuevas para vincularlas a tus leads.
                            </p>
                        </div>
                    </div>

                    <div className='flex gap-4'>
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
                            onClick={fetchCompanies}
                            className='px-5 py-2.5 bg-white border border-gray-200 text-[#0A1635] rounded-xl font-bold hover:bg-gray-50 transition-all shadow-sm flex items-center gap-2'
                        >
                            <span>🔄</span> Actualizar
                        </button>
                        <button
                            onClick={openCreateModal}
                            className='px-6 py-2.5 bg-[#2048FF] text-white rounded-xl font-bold hover:bg-[#1700AC] transition-all shadow-md flex items-center gap-2 transform active:scale-95 uppercase text-xs tracking-widest'
                        >
                            <span>🏢+</span> Nueva Empresa
                        </button>
                    </div>
                </div>

                {/* Table Section - Scrollable */}
                <div className='flex-1 overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-bottom-4 duration-700 bg-white rounded-2xl border border-gray-200 shadow-sm'>
                    <CompaniesTable
                        companies={companies}
                        isEditingMode={isEditingMode}
                        currentUserProfile={auth.profile}
                        onRowClick={handleRowClick}
                        onEdit={handleEditClick}
                        onDelete={handleDeleteClick}
                    />
                </div>
            </div>

            {/* Company Modal (for creation) */}
            <CompanyModal
                isOpen={isCompanyModalOpen}
                onClose={() => setIsCompanyModalOpen(false)}
                onSave={handleSaveCompany}
                initialData={modalCompanyData}
                companies={companies as any}
            />

            {/* Detail View Modal/Overlay */}
            {selectedCompany && (
                <AdminCompanyDetailView
                    isOpen={isDetailOpen}
                    onClose={() => setIsDetailOpen(false)}
                    company={selectedCompany}
                    currentUserProfile={auth.profile}
                />
            )}

            {/* Delete Confirmation */}
            <ConfirmModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title="Eliminar Empresa"
                message="¿Estás seguro de que deseas eliminar esta empresa? Los leads asociados no se eliminarán, pero ya no estarán vinculados a esta empresa."
                isDestructive={true}
            />
        </div>
    )
}
