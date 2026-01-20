'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import CompaniesTable from '@/components/CompaniesTable'
import { CompanyData } from '@/components/CompanyModal'
import AdminCompanyDetailView from '@/components/AdminCompanyDetailView'

export default function EmpresasPage() {
    const auth = useAuth()
    const router = useRouter()
    const [companies, setCompanies] = useState<CompanyData[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedCompany, setSelectedCompany] = useState<CompanyData | null>(null)
    const [isDetailOpen, setIsDetailOpen] = useState(false)
    const supabase = createClient()

    useEffect(() => {
        // Redirect if not admin
        if (!auth.loading && (!auth.loggedIn || auth.profile?.role !== 'admin')) {
            router.push('/home')
            return
        }

        if (auth.loggedIn && auth.profile?.role === 'admin') {
            fetchCompanies()
        }
    }, [auth.loading, auth.loggedIn, auth.profile, router])

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

    if (auth.loading || loading) {
        return (
            <div className='min-h-[calc(100vh-70px)] bg-gray-50 flex items-center justify-center'>
                <div className='flex flex-col items-center gap-4'>
                    <div className='w-12 h-12 border-4 border-[#2048FF] border-t-transparent rounded-full animate-spin' />
                    <p className='text-gray-500 font-medium'>Cargando catálogo de empresas...</p>
                </div>
            </div>
        )
    }

    if (!auth.loggedIn || auth.profile?.role !== 'admin') {
        return null // Will redirect
    }

    return (
        <div className='min-h-[calc(100vh-70px)] bg-gray-50 p-4 md:p-8'>
            <div className='max-w-7xl mx-auto space-y-8'>
                {/* Header */}
                <div className='flex items-center justify-between'>
                    <div>
                        <h1 className='text-4xl font-black text-[#0A1635] tracking-tight'>
                            Catálogo de Empresas
                        </h1>
                        <p className='text-gray-500 mt-1 font-medium'>
                            Administra y visualiza todas las empresas registradas en el sistema.
                        </p>
                    </div>

                    <button
                        onClick={fetchCompanies}
                        className='px-5 py-2.5 bg-white border border-gray-200 text-[#0A1635] rounded-xl font-bold hover:bg-gray-50 transition-all shadow-sm flex items-center gap-2'
                    >
                        <span>🔄</span> Actualizar
                    </button>
                </div>

                {/* Table Section */}
                <div className='animate-in fade-in slide-in-from-bottom-4 duration-700'>
                    <CompaniesTable
                        companies={companies}
                        onRowClick={handleRowClick}
                    />
                </div>
            </div>

            {/* Detail View Modal/Overlay */}
            {selectedCompany && (
                <AdminCompanyDetailView
                    isOpen={isDetailOpen}
                    onClose={() => setIsDetailOpen(false)}
                    company={selectedCompany}
                />
            )}
        </div>
    )
}
