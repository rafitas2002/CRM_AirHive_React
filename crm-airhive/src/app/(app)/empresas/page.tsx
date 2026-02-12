'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import CompaniesTable from '@/components/CompaniesTable'
import CompanyModal, { CompanyData } from '@/components/CompanyModal'
import AdminCompanyDetailView from '@/components/AdminCompanyDetailView'
import ConfirmModal from '@/components/ConfirmModal'
import Link from 'next/link'
import Image from 'next/image' // Added Image import

export type CompanyWithProjects = CompanyData & {
    activeProjects: number
    processProjects: number
    lostProjects: number
    antiquityDate: string
    projectAntiquityDate: string | null
}

export default function EmpresasPage() {
    const auth = useAuth()
    const router = useRouter()
    const [companies, setCompanies] = useState<CompanyWithProjects[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedCompany, setSelectedCompany] = useState<CompanyWithProjects | null>(null)
    const [isDetailOpen, setIsDetailOpen] = useState(false)
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
    const [companyToDelete, setCompanyToDelete] = useState<string | null>(null)

    // Modal state for creating/editing from this page
    const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false)
    const [modalCompanyData, setModalCompanyData] = useState<CompanyWithProjects | null>(null)
    const [isEditingMode, setIsEditingMode] = useState(false)

    // Filtering State
    // Filtering State
    const [filterSearch, setFilterSearch] = useState('')
    const [filterIndustry, setFilterIndustry] = useState('All')
    const [filterSize, setFilterSize] = useState('All')
    const [filterLocation, setFilterLocation] = useState('All')
    const [sortBy, setSortBy] = useState('alphabetical') // 'alphabetical', 'antiquity', 'projectAntiquity'

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

    // Filter and Sort Logic
    const filteredCompanies = useMemo(() => {
        let result = companies.filter(company => {
            const matchesSearch = !filterSearch ||
                company.nombre?.toLowerCase().includes(filterSearch.toLowerCase()) ||
                company.ubicacion?.toLowerCase().includes(filterSearch.toLowerCase())

            const matchesIndustry = filterIndustry === 'All' || company.industria === filterIndustry
            const matchesSize = filterSize === 'All' || company.tamano?.toString() === filterSize
            const matchesLocation = filterLocation === 'All' || company.ubicacion?.toLowerCase().includes(filterLocation.toLowerCase())

            return matchesSearch && matchesIndustry && matchesSize && matchesLocation
        })

        // Sorting
        result.sort((a, b) => {
            if (sortBy === 'alphabetical') {
                return a.nombre.localeCompare(b.nombre)
            } else if (sortBy === 'antiquity') {
                return new Date(b.antiquityDate).getTime() - new Date(a.antiquityDate).getTime()
            } else if (sortBy === 'projectAntiquity') {
                const dateA = a.projectAntiquityDate ? new Date(a.projectAntiquityDate).getTime() : 0
                const dateB = b.projectAntiquityDate ? new Date(b.projectAntiquityDate).getTime() : 0
                return dateB - dateA
            }
            return 0
        })

        return result
    }, [companies, filterSearch, filterIndustry, filterSize, filterLocation, sortBy])

    // Get unique data for filter dropdowns
    const uniqueIndustries = useMemo(() => {
        const industries = new Set(companies.map(c => c.industria).filter((i): i is string => !!i))
        return Array.from(industries).sort()
    }, [companies])

    const uniqueLocations = useMemo(() => {
        const locations = new Set(companies.map(c => {
            const city = c.ubicacion?.split(',')[0]?.trim()
            return city
        }).filter((l): l is string => !!l))
        return Array.from(locations).sort()
    }, [companies])

    const fetchCompanies = async () => {
        setLoading(true)

        // Fetch companies
        const { data: companiesData, error: companiesError } = await supabase
            .from('empresas')
            .select('*')
            .order('nombre', { ascending: true })

        if (companiesError) {
            console.error('Error fetching companies:', companiesError)
            setLoading(false)
            return
        }

        // Fetch all leads to associate
        const { data: leadsData, error: leadsError } = await supabase
            .from('clientes')
            .select('empresa_id, etapa, created_at')

        const leads = (leadsData || []) as { empresa_id: string, etapa: string, created_at: string }[] // Fixed leads data typing

        if (leadsError) {
            console.error('Error fetching leads:', leadsError)
        }

        const companies = (companiesData || []) as any[]
        const companiesWithProjects = companies.map(company => {
            const companyLeads = leads.filter(l => l.empresa_id === company.id)

            const activeProjects = companyLeads.filter(l => l.etapa === 'Cerrado Ganado').length
            const processProjects = companyLeads.filter(l =>
                l.etapa !== 'Cerrado Ganado' && l.etapa !== 'Cerrado Perdido'
            ).length
            const lostProjects = companyLeads.filter(l => l.etapa === 'Cerrado Perdido').length

            // Antiquity of first active project
            const activeLeads = companyLeads
                .filter(l => l.etapa === 'Cerrado Ganado')
                .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

            const projectAntiquityDate = activeLeads.length > 0 ? activeLeads[0].created_at : null

            return {
                ...company,
                activeProjects,
                processProjects,
                lostProjects,
                antiquityDate: company.created_at,
                projectAntiquityDate
            }
        })

        setCompanies(companiesWithProjects as CompanyWithProjects[])
        setLoading(false)
    }

    const handleRowClick = (company: CompanyWithProjects) => {
        setSelectedCompany(company)
        setIsDetailOpen(true)
    }

    const handleEditClick = (company: CompanyWithProjects) => {
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

    // Only show blocking spinner if we are loading session AND not logged in
    // OR if we are loading companies AND we don't have any data yet
    if ((auth.loading && !auth.loggedIn) || (loading && companies.length === 0)) {
        return (
            <div className='h-full flex items-center justify-center' style={{ background: 'var(--background)' }}>
                <div className='flex flex-col items-center gap-4'>
                    <div className='w-12 h-12 border-4 border-[#2048FF] border-t-transparent rounded-full animate-spin' />
                    <p className='font-medium' style={{ color: 'var(--text-secondary)' }}>Cargando catálogo de empresas...</p>
                </div>
            </div>
        )
    }

    if (!auth.loggedIn) {
        return null // Will redirect
    }

    return (
        <div className='h-full flex flex-col p-8 overflow-hidden' style={{ background: 'var(--background)' }}>
            <div className='w-full mx-auto flex flex-col h-full gap-8'>
                {/* Header - Fixed */}
                <div className='shrink-0 flex flex-col gap-6 p-4 rounded-3xl' style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                    <div className='flex items-center justify-between'>
                        <div className='flex items-center gap-6'>
                            <Link
                                href='/clientes'
                                className='w-12 h-12 flex items-center justify-center border rounded-2xl transition-all hover:scale-105 active:scale-95'
                                style={{ background: 'var(--background)', borderColor: 'var(--card-border)' }}
                                title='Volver a Leads'
                            >
                                <span className='text-xl' style={{ color: 'var(--text-primary)' }}>←</span>
                            </Link>
                            <div>
                                <h1 className='text-3xl font-black tracking-tight flex items-center gap-3' style={{ color: 'var(--text-primary)' }}>
                                    <span className='opacity-40'>🏢</span> Catálogo de Empresas
                                </h1>
                                <p className='mt-1 font-bold text-xs uppercase tracking-widest opacity-40' style={{ color: 'var(--text-secondary)' }}>
                                    Gestión centralizada de cuentas y contactos corporativos
                                </p>
                            </div>
                        </div>

                        <div className='flex gap-3'>
                            <button
                                onClick={() => setIsEditingMode(!isEditingMode)}
                                className={`px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${isEditingMode
                                    ? 'bg-[#2048FF] text-white shadow-[0_0_20px_rgba(32,72,255,0.3)]'
                                    : 'border hover:bg-white/5'
                                    }`}
                                style={!isEditingMode ? {
                                    background: 'var(--background)',
                                    borderColor: 'var(--card-border)',
                                    color: 'var(--text-primary)'
                                } : {}}
                            >
                                {isEditingMode ? 'Terminar Edición' : 'Editar Catálogo'}
                            </button>
                            <button
                                onClick={fetchCompanies}
                                className='px-5 py-2.5 border rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all hover:bg-white/5'
                                style={{
                                    background: 'var(--background)',
                                    borderColor: 'var(--card-border)',
                                    color: 'var(--text-primary)'
                                }}
                            >
                                Actualizar
                            </button>
                            <button
                                onClick={openCreateModal}
                                className='px-6 py-2.5 bg-[#2048FF] text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:scale-105 active:scale-95 transition-all shadow-[0_10px_20px_rgba(32,72,255,0.2)]'
                            >
                                + Nueva Empresa
                            </button>
                        </div>
                    </div>

                    {/* Filter Bar */}
                    <div className='flex flex-wrap items-center gap-4'>
                        <div className='flex-1 relative'>
                            <span className='absolute left-4 top-1/2 -translate-y-1/2 opacity-30'>🔍</span>
                            <input
                                type="text"
                                placeholder="Buscar por nombre o ubicación..."
                                value={filterSearch}
                                onChange={(e) => setFilterSearch(e.target.value)}
                                className='w-full pl-12 pr-4 py-3 rounded-2xl border focus:outline-none focus:ring-4 focus:ring-[#2048FF]/10 text-xs font-bold transition-all placeholder:opacity-30'
                                style={{
                                    background: 'var(--input-bg)',
                                    borderColor: 'var(--input-border)',
                                    color: 'var(--text-primary)'
                                }}
                            />
                        </div>

                        <div className='flex items-center gap-2'>
                            <label className='text-[10px] font-black uppercase tracking-widest opacity-40' style={{ color: 'var(--text-secondary)' }}>Industria</label>
                            <select
                                value={filterIndustry}
                                onChange={(e) => setFilterIndustry(e.target.value)}
                                className='rounded-2xl border px-5 py-3 text-xs font-black transition-all cursor-pointer hover:border-[#2048FF] outline-none focus:ring-2 focus:ring-[#2048FF]/50'
                                style={{
                                    background: 'var(--background)',
                                    borderColor: 'var(--card-border)',
                                    color: 'var(--text-primary)'
                                }}
                            >
                                <option value="All" style={{ background: 'var(--card-bg)' }}>Todas</option>
                                {uniqueIndustries.map(ind => (
                                    <option key={ind} value={ind!} style={{ background: 'var(--card-bg)' }}>{ind}</option>
                                ))}
                            </select>
                        </div>

                        <div className='flex items-center gap-2'>
                            <label className='text-[10px] font-black uppercase tracking-widest opacity-40' style={{ color: 'var(--text-secondary)' }}>Ubicación</label>
                            <select
                                value={filterLocation}
                                onChange={(e) => setFilterLocation(e.target.value)}
                                className='rounded-2xl border px-5 py-3 text-xs font-black transition-all cursor-pointer hover:border-[#2048FF] outline-none focus:ring-2 focus:ring-[#2048FF]/50'
                                style={{
                                    background: 'var(--background)',
                                    borderColor: 'var(--card-border)',
                                    color: 'var(--text-primary)'
                                }}
                            >
                                <option value="All" style={{ background: 'var(--card-bg)' }}>Todas</option>
                                {uniqueLocations.map(loc => (
                                    <option key={loc} value={loc} style={{ background: 'var(--card-bg)' }}>{loc}</option>
                                ))}
                            </select>
                        </div>

                        <div className='flex items-center gap-2'>
                            <label className='text-[10px] font-black uppercase tracking-widest opacity-40' style={{ color: 'var(--text-secondary)' }}>Ordenar Por</label>
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                                className='rounded-2xl border px-5 py-3 text-xs font-black transition-all cursor-pointer hover:border-[#2048FF] outline-none focus:ring-2 focus:ring-[#2048FF]/50'
                                style={{
                                    background: 'var(--background)',
                                    borderColor: 'var(--card-border)',
                                    color: 'var(--text-primary)'
                                }}
                            >
                                <option value="alphabetical" style={{ background: 'var(--card-bg)' }}>Nombre (A-Z)</option>
                                <option value="antiquity" style={{ background: 'var(--card-bg)' }}>Antigüedad Empresa</option>
                                <option value="projectAntiquity" style={{ background: 'var(--card-bg)' }}>Antigüedad Proyectos</option>
                            </select>
                        </div>

                        <div className='flex items-center gap-2'>
                            <label className='text-[10px] font-black uppercase tracking-widest opacity-40' style={{ color: 'var(--text-secondary)' }}>Tamaño</label>
                            <select
                                value={filterSize}
                                onChange={(e) => setFilterSize(e.target.value)}
                                className='rounded-2xl border px-5 py-3 text-xs font-black transition-all cursor-pointer hover:border-[#2048FF] outline-none focus:ring-2 focus:ring-[#2048FF]/50'
                                style={{
                                    background: 'var(--background)',
                                    borderColor: 'var(--card-border)',
                                    color: 'var(--text-primary)'
                                }}
                            >
                                <option value="All" style={{ background: 'var(--card-bg)' }}>Cualquier Tamaño</option>
                                <option value="1" style={{ background: 'var(--card-bg)' }}>Micro</option>
                                <option value="2" style={{ background: 'var(--card-bg)' }}>Pequeña</option>
                                <option value="3" style={{ background: 'var(--card-bg)' }}>Mediana</option>
                                <option value="4" style={{ background: 'var(--card-bg)' }}>Grande</option>
                                <option value="5" style={{ background: 'var(--card-bg)' }}>Corporativo</option>
                            </select>
                        </div>

                        <div className='ml-auto pl-4 border-l border-white/5 flex flex-col items-end'>
                            <span className='text-xl font-black leading-none' style={{ color: 'var(--text-primary)' }}>{filteredCompanies.length}</span>
                            <span className='text-[8px] font-black uppercase tracking-widest opacity-30 mt-1' style={{ color: 'var(--text-secondary)' }}>Cuentas</span>
                        </div>
                    </div>
                </div>

                {/* Table Section - Scrollable */}
                <div className='flex-1 overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-bottom-4 duration-700 rounded-3xl border border-white/5 shadow-[0_20px_50px_rgba(0,0,0,0.1)]' style={{ background: 'var(--card-bg)' }}>
                    <CompaniesTable
                        companies={filteredCompanies}
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
