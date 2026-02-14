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
import Image from 'next/image'
import { Search, Table as TableIcon, Pencil, RotateCw, Building2 } from 'lucide-react'

import RichardDawkinsFooter from '@/components/RichardDawkinsFooter'

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
        <div className='min-h-full flex flex-col p-8 overflow-y-auto custom-scrollbar' style={{ background: 'transparent' }}>
            <div className='max-w-7xl mx-auto space-y-10 w-full'>
                {/* External Header - Page Level */}
                <div className='flex flex-col md:flex-row md:items-center justify-between gap-6'>
                    <div className='flex items-center gap-6'>
                        <div className='w-16 h-16 rounded-[22px] flex items-center justify-center border shadow-lg overflow-hidden transition-all hover:scale-105' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                            <Building2 size={36} color="var(--input-focus)" strokeWidth={1.5} className="drop-shadow-sm" />
                        </div>
                        <div>
                            <h1 className='text-4xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>
                                Catálogo de Empresas
                            </h1>
                            <p className='font-medium' style={{ color: 'var(--text-secondary)' }}>
                                Gestión centralizada de cuentas y relaciones corporativas.
                            </p>
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
                                            <span>Editar Catálogo</span>
                                            <Pencil size={12} strokeWidth={2.5} className="opacity-80" />
                                        </>
                                    )}
                                </div>
                            </button>
                            <button
                                onClick={fetchCompanies}
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
                            onClick={() => {
                                setModalCompanyData(null)
                                setIsCompanyModalOpen(true)
                            }}
                            className='px-6 py-2.5 bg-[#2048FF] text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:scale-105 active:scale-95 transition-all'
                        >
                            + Nueva Empresa
                        </button>
                    </div>
                </div>

                {/* Main Table Container */}
                <div className='rounded-[40px] shadow-xl border overflow-hidden flex flex-col mb-6' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                    <div className='px-8 py-6 border-b flex flex-col gap-6' style={{ borderColor: 'var(--card-border)' }}>
                        <div className='flex flex-col md:flex-row md:items-center justify-between gap-4'>
                            <div className='flex items-center gap-4'>
                                <div className='w-12 h-12 rounded-[20px] flex items-center justify-center shadow-inner' style={{ background: 'var(--background)', color: 'var(--text-primary)' }}>
                                    <TableIcon size={24} />
                                </div>
                                <div>
                                    <h2 className='text-xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>Tabla Maestra de Empresas</h2>
                                    <p className='text-[10px] font-bold uppercase tracking-[0.2em] opacity-60' style={{ color: 'var(--text-secondary)' }}>Gestión de Inteligencia Corporativa</p>
                                </div>
                            </div>

                            <div className='flex items-center gap-3'>
                                <div className='px-5 py-2 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 rounded-2xl border border-blue-500/20 flex items-center gap-3 shadow-sm'>
                                    <span className='text-2xl font-black tracking-tighter' style={{ color: 'var(--input-focus)' }}>{filteredCompanies.length}</span>
                                    <div className='flex flex-col'>
                                        <span className='text-[9px] font-black uppercase tracking-widest' style={{ color: 'var(--text-primary)' }}>Registros</span>
                                        <span className='text-[8px] font-bold uppercase tracking-wider opacity-50' style={{ color: 'var(--text-secondary)' }}>Encontrados</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className='flex flex-col gap-4'>
                            {/* Row 1: Search Bar (Full Width) */}
                            <div className='relative w-full'>
                                <Search className='absolute left-4 top-1/2 -translate-y-1/2 opacity-40' style={{ color: 'var(--text-primary)' }} size={18} />
                                <input
                                    type='text'
                                    placeholder='Buscar por nombre, ubicación, etiquetas...'
                                    value={filterSearch}
                                    onChange={(e) => setFilterSearch(e.target.value)}
                                    className='w-full pl-12 pr-4 py-3.5 bg-[var(--background)] border border-[var(--card-border)] rounded-2xl text-sm font-bold placeholder:text-gray-500/50 transition-all focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none shadow-sm'
                                    style={{ color: 'var(--text-primary)' }}
                                />
                            </div>

                            {/* Row 2: Filters Grouped */}
                            {/* Row 2: Filters & Sort - Standardized Layout */}
                            <div className='flex flex-col lg:flex-row items-center justify-between gap-4 w-full'>
                                {/* Left: Filter Pill */}
                                <div className='flex items-center gap-2 p-1 bg-[var(--background)] border border-[var(--card-border)] rounded-2xl shadow-sm overflow-x-auto max-w-full'>
                                    <select
                                        value={filterIndustry}
                                        onChange={(e) => setFilterIndustry(e.target.value)}
                                        className='min-w-[120px] bg-transparent border-none px-4 py-2.5 text-xs font-black uppercase tracking-wider text-[var(--text-primary)] focus:ring-0 outline-none cursor-pointer appearance-none'
                                    >
                                        <option value="All">Industria: Todas</option>
                                        {uniqueIndustries.map(ind => (
                                            <option key={ind} value={ind!}>{ind}</option>
                                        ))}
                                    </select>
                                    <div className='w-px h-5 bg-[var(--card-border)] shrink-0' />
                                    <select
                                        value={filterLocation}
                                        onChange={(e) => setFilterLocation(e.target.value)}
                                        className='min-w-[120px] bg-transparent border-none px-4 py-2.5 text-xs font-black uppercase tracking-wider text-[var(--text-primary)] focus:ring-0 outline-none cursor-pointer appearance-none'
                                    >
                                        <option value="All">Ubicación: Todas</option>
                                        {uniqueLocations.map(loc => (
                                            <option key={loc} value={loc}>{loc}</option>
                                        ))}
                                    </select>
                                    <div className='w-px h-5 bg-[var(--card-border)] shrink-0' />
                                    <select
                                        value={filterSize}
                                        onChange={(e) => setFilterSize(e.target.value)}
                                        className='min-w-[120px] bg-transparent border-none px-4 py-2.5 text-xs font-black uppercase tracking-wider text-[var(--text-primary)] focus:ring-0 outline-none cursor-pointer appearance-none'
                                    >
                                        <option value="All">Tamaño: Todo</option>
                                        <option value="1">Micro</option>
                                        <option value="2">Pequeña</option>
                                        <option value="3">Mediana</option>
                                        <option value="4">Grande</option>
                                        <option value="5">Corporativo</option>
                                    </select>
                                </div>

                                {/* Right: Sort & Actions */}
                                <div className='flex items-center gap-2 shrink-0'>
                                    <select
                                        value={sortBy}
                                        onChange={(e) => setSortBy(e.target.value)}
                                        className='min-w-[140px] bg-[#2048FF]/5 border border-[#2048FF]/20 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-[#2048FF] focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none cursor-pointer appearance-none transition-all hover:scale-[1.02] active:scale-95 shadow-sm'
                                    >
                                        <option value="alphabetical">Orden: Nombre</option>
                                        <option value="antiquity">Orden: Antigüedad</option>
                                        <option value="projectAntiquity">Orden: Proyectos</option>
                                    </select>

                                    {(filterSearch || filterIndustry !== 'All' || filterSize !== 'All' || filterLocation !== 'All' || sortBy !== 'alphabetical') && (
                                        <button
                                            onClick={() => {
                                                setFilterSearch('')
                                                setFilterIndustry('All')
                                                setFilterSize('All')
                                                setFilterLocation('All')
                                                setSortBy('alphabetical')
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

                    <div className='flex-1 overflow-x-auto custom-scrollbar'>
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
            </div>

            <RichardDawkinsFooter />

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
