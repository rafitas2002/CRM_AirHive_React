'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import ClientsTable from '@/components/ClientsTable'
import { Database } from '@/lib/supabase'

type Cliente = Database['public']['Tables']['clientes']['Row']

export default function ClientesPage() {
    const [clientes, setClientes] = useState<Cliente[]>([])
    const [loading, setLoading] = useState(true)
    const [supabase] = useState(() => createClient())

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

    useEffect(() => {
        fetchClientes()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

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
                            onClick={fetchClientes}
                            className='px-4 py-2 bg-[#2048FF] text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm'
                        >
                            Refrescar
                        </button>
                        <button className='px-4 py-2 bg-[#8B5CF6] text-white rounded-lg font-medium hover:bg-violet-700 transition-colors shadow-sm'>
                            Nuevo cliente
                        </button>
                    </div>
                </div>

                {/* Table */}
                {loading ? (
                    <div className='w-full h-64 flex items-center justify-center bg-white rounded-2xl border border-gray-200'>
                        <span className='text-gray-400 animate-pulse'>Cargando clientes...</span>
                    </div>
                ) : (
                    <ClientsTable clientes={clientes} />
                )}
            </div>
        </div>
    )
}
