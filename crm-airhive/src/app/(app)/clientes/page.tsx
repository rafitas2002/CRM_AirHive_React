'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import ClientsTable from '@/components/ClientsTable'
import ClientModal from '@/components/ClientModal'
import ConfirmModal from '@/components/ConfirmModal'
import { Database } from '@/lib/supabase'

type Cliente = Database['public']['Tables']['clientes']['Row']
type ClienteInsert = Database['public']['Tables']['clientes']['Insert']
type ClienteUpdate = Database['public']['Tables']['clientes']['Update']

// Helper to normalize client data for the form (handle nulls)
const normalizeClient = (client: Cliente) => ({
    empresa: client.empresa || '',
    nombre: client.nombre || '',
    contacto: client.contacto || '',
    etapa: client.etapa || 'Prospección',
    valor_estimado: client.valor_estimado || 0,
    oportunidad: client.oportunidad || '',
    calificacion: client.calificacion || 3,
    notas: client.notas || ''
})

export default function ClientesPage() {
    const [clientes, setClientes] = useState<Cliente[]>([])
    const [loading, setLoading] = useState(true)
    const [supabase] = useState(() => createClient())

    // Modal & Editing State
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
    const [currentClient, setCurrentClient] = useState<Cliente | null>(null)
    const [isEditingMode, setIsEditingMode] = useState(false)
    const [currentUser, setCurrentUser] = useState<any>(null)

    // Delete Confirmation State
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
    const [clientToDelete, setClientToDelete] = useState<number | null>(null)

    const fetchClientes = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('clientes')
            .select('*')
            .order('created_at', { ascending: false })

        if (error) {
            console.error('Error fetching clientes:', error)
        } else {
            setClientes(data || [])
        }
        setLoading(false)
    }

    const fetchUser = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        setCurrentUser(user)
    }

    useEffect(() => {
        fetchClientes()
        fetchUser()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleSaveClient = async (clientData: ReturnType<typeof normalizeClient>) => {
        if (!currentUser) {
            alert('No se pudo identificar al usuario actual.')
            return
        }

        if (modalMode === 'create') {
            const payload: ClienteInsert = {
                ...clientData,
                owner_id: currentUser.id,
                owner_username: currentUser.user_metadata?.username || currentUser.email?.split('@')[0] || 'Unknown'
            }

            // Cast to any to avoid generic type inference issues with library
            const { error } = await supabase
                .from('clientes')
                .insert([payload as any])

            if (error) {
                console.error('Error creating client:', error)
                alert('Error al crear el cliente: ' + error.message)
            }
        } else if (modalMode === 'edit' && currentClient) {
            const payload: ClienteUpdate = {
                ...clientData
            }

            const { error } = await supabase
                .from('clientes')
                .update(payload as any)
                .eq('id', currentClient.id)

            if (error) {
                console.error('Error updating client:', error)
                alert('Error al actualizar el cliente')
            }
        }

        await fetchClientes()
    }

    const handleDeleteClick = (id: number) => {
        setClientToDelete(id)
        setIsDeleteModalOpen(true)
    }

    const confirmDelete = async () => {
        if (!clientToDelete) return

        const { error } = await supabase
            .from('clientes')
            .delete()
            .eq('id', clientToDelete)

        if (error) {
            console.error('Error deleting client:', error)
            alert('Error al eliminar el cliente')
        } else {
            await fetchClientes()
        }
        setClientToDelete(null)
    }

    const openCreateModal = () => {
        setModalMode('create')
        setCurrentClient(null)
        setIsModalOpen(true)
    }

    const openEditModal = (client: Cliente) => {
        setModalMode('edit')
        setCurrentClient(client)
        setIsModalOpen(true)
    }

    return (
        <div className='min-h-[calc(100vh-70px)] bg-gray-50 p-4'>
            <div className='w-full mx-auto space-y-6'>
                {/* Header */}
                <div className='flex items-center justify-between'>
                    <h1 className='text-3xl font-bold text-[#0A1635]'>
                        Clientes
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
                            Nuevo cliente
                        </button>
                        <button
                            onClick={fetchClientes}
                            className='px-4 py-2 bg-[#2048FF] text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm'
                        >
                            Refrescar
                        </button>
                    </div>
                </div>

                {/* Table */}
                {loading ? (
                    <div className='w-full h-64 flex items-center justify-center bg-white rounded-2xl border border-gray-200'>
                        <span className='text-gray-400 animate-pulse'>Cargando clientes...</span>
                    </div>
                ) : (
                    <ClientsTable
                        clientes={clientes}
                        isEditingMode={isEditingMode}
                        onEdit={openEditModal}
                        onDelete={handleDeleteClick}
                    />
                )}
            </div>

            {/* Modal */}
            <ClientModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSaveClient}
                initialData={currentClient ? normalizeClient(currentClient) : null}
                mode={modalMode}
            />

            {/* Delete Confirmation Modal */}
            <ConfirmModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title="Eliminar cliente"
                message="¿Estás seguro de que deseas eliminar este cliente? Esta acción no se puede deshacer."
                isDestructive={true}
            />
        </div>
    )
}
