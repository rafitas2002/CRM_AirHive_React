'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import PreLeadsTable from '@/components/PreLeadsTable'
import PreLeadModal from '@/components/PreLeadModal'
import PreLeadDetailView from '@/components/PreLeadDetailView'
import ConfirmModal from '@/components/ConfirmModal'
import { useAuth } from '@/lib/auth'

export default function PreLeadsPage() {
    const auth = useAuth()
    const [supabase] = useState(() => createClient())
    const [preLeads, setPreLeads] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    // UI States
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
    const [currentPreLead, setCurrentPreLead] = useState<any>(null)
    const [isEditingMode, setIsEditingMode] = useState(false)
    const [isDetailViewOpen, setIsDetailViewOpen] = useState(false)
    const [selectedPreLead, setSelectedPreLead] = useState<any>(null)
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
    const [deleteId, setDeleteId] = useState<number | null>(null)

    // Filters & Sorting
    const [search, setSearch] = useState('')
    const [vendedorFilter, setVendedorFilter] = useState('All')
    const [sortBy, setSortBy] = useState('recent')

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
        }
    }, [auth.loading, auth.loggedIn])

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

            return matchesSearch && matchesVendedor
        })

        if (sortBy === 'recent') {
            result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        } else if (sortBy === 'name') {
            result.sort((a, b) => a.nombre_empresa.localeCompare(b.nombre_empresa))
        }

        return result
    }, [preLeads, search, vendedorFilter, sortBy])

    const uniqueVendedores = useMemo(() => {
        const vends = new Set(preLeads.map(pl => pl.vendedor_name).filter(v => !!v))
        return Array.from(vends).sort()
    }, [preLeads])

    if (auth.loading && !auth.loggedIn) {
        return (
            <div className='h-screen w-full flex items-center justify-center bg-[#DDE2E5]'>
                <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600'></div>
            </div>
        )
    }

    return (
        <div className='h-full flex flex-col p-8 overflow-hidden bg-[#DDE2E5]'>
            <div className='w-full max-w-7xl mx-auto flex flex-col h-full gap-8'>
                {/* Header */}
                <div className='shrink-0 space-y-4'>
                    <div className='flex items-center justify-between'>
                        <div className='space-y-1'>
                            <h1 className='text-4xl font-black text-[#0A1635] tracking-tight'>
                                Pre-Leads
                            </h1>
                            <p className='text-[10px] font-black text-[#2048FF] uppercase tracking-[0.2em]'>Archivo de prospectos iniciales</p>
                        </div>

                        <div className='flex gap-3'>
                            <button
                                onClick={() => setIsEditingMode(!isEditingMode)}
                                className={`h-11 px-6 rounded-2xl font-black transition-all shadow-sm flex items-center gap-2 border-2 ${isEditingMode
                                    ? 'bg-[#1700AC] text-white border-[#1700AC]'
                                    : 'bg-white text-[#0A1635] border-transparent hover:border-gray-200'
                                    }`}
                            >
                                <span>{isEditingMode ? '🔒' : '✏️'}</span> {isEditingMode ? 'Finalizar' : 'Editar'}
                            </button>
                            <button
                                onClick={() => { setModalMode('create'); setCurrentPreLead(null); setIsModalOpen(true); }}
                                className='h-11 px-8 bg-[#8B5CF6] text-white rounded-2xl font-black hover:bg-violet-700 transition-all shadow-xl shadow-purple-500/20 flex items-center gap-2 transform active:scale-95 uppercase text-[10px] tracking-widest'
                            >
                                <span>➕</span> Registrar
                            </button>
                        </div>
                    </div>

                    {/* Filter Bar */}
                    <div className='bg-white/70 backdrop-blur-md p-3 rounded-3xl border border-white shadow-xl shadow-[#0A1635]/5 flex items-center gap-4'>
                        <div className='flex-1 relative min-w-[250px]'>
                            <span className='absolute left-4 top-1/2 -translate-y-1/2 text-gray-400'>🔍</span>
                            <input
                                type="text"
                                placeholder="Buscar por empresa, contacto o correo..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className='w-full pl-10 pr-4 py-2.5 bg-gray-50/50 border border-gray-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-xs font-bold text-[#0A1635] transition-all placeholder:text-gray-400'
                            />
                        </div>

                        <div className='h-8 w-px bg-gray-200/50' />

                        <div className='flex items-center gap-3'>
                            <label className='text-[10px] font-black text-gray-400 uppercase tracking-widest'>Vendedor</label>
                            <select
                                value={vendedorFilter}
                                onChange={(e) => setVendedorFilter(e.target.value)}
                                className='bg-gray-50/50 border border-gray-100 rounded-xl px-4 py-2 text-xs font-black text-[#0A1635] focus:outline-none cursor-pointer hover:bg-gray-100'
                            >
                                <option value="All">Cualquiera</option>
                                {uniqueVendedores.map(v => (
                                    <option key={v as string} value={v as string}>{v as string}</option>
                                ))}
                            </select>
                        </div>

                        <div className='flex items-center gap-3'>
                            <label className='text-[10px] font-black text-gray-400 uppercase tracking-widest'>Orden</label>
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                                className='bg-gray-50/50 border border-gray-100 rounded-xl px-4 py-2 text-xs font-black text-[#0A1635] focus:outline-none cursor-pointer hover:bg-gray-100'
                            >
                                <option value="recent">Recientes</option>
                                <option value="name">Alfabético</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Table Area */}
                <div className='flex-1 overflow-hidden flex flex-col min-h-0 bg-white rounded-[40px] shadow-2xl shadow-blue-500/5 border border-white p-4 animate-in fade-in slide-in-from-bottom-4 duration-700'>
                    <div className='flex-1 overflow-y-auto custom-scrollbar pr-2 min-h-0'>
                        {loading ? (
                            <div className='h-full flex items-center justify-center'>
                                <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600'></div>
                            </div>
                        ) : (
                            <PreLeadsTable
                                preLeads={filteredPreLeads}
                                isEditingMode={isEditingMode}
                                onEdit={(pl) => { setModalMode('edit'); setCurrentPreLead(pl); setIsModalOpen(true); }}
                                onDelete={(id) => { setDeleteId(id); setIsDeleteModalOpen(true); }}
                                onRowClick={(pl) => { setSelectedPreLead(pl); setIsDetailViewOpen(true); }}
                            />
                        )}
                    </div>
                </div>
            </div>

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
                onEdit={(pl) => { setIsDetailViewOpen(false); setModalMode('edit'); setCurrentPreLead(pl); setIsModalOpen(true); }}
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
