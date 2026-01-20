'use client'

import { Database } from '@/lib/supabase'

type Cliente = Database['public']['Tables']['clientes']['Row']

interface ClientsTableProps {
    clientes: Cliente[]
    isEditingMode?: boolean
    onEdit?: (cliente: Cliente) => void
    onDelete?: (id: number) => void
}

export default function ClientsTable({ clientes, isEditingMode = false, onEdit, onDelete }: ClientsTableProps) {
    if (!clientes || clientes.length === 0) {
        return (
            <div className='w-full p-8 text-center bg-white/50 backdrop-blur-md rounded-2xl border border-white/40 shadow-sm'>
                <p className='text-gray-500 text-lg'>No hay clientes registrados.</p>
            </div>
        )
    }

    return (
        <div className='w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm'>
            <div className='w-full'>
                <table className='w-full table-fixed text-left text-sm text-gray-600'>
                    <thead className='bg-[#0A1635] text-white'>
                        <tr>
                            <th className='w-[10%] px-3 py-3 font-semibold text-xs tracking-wide truncate'>Vendedor</th>
                            <th className='w-[12%] px-3 py-3 font-semibold text-xs tracking-wide truncate'>Empresa</th>
                            <th className='w-[12%] px-3 py-3 font-semibold text-xs tracking-wide truncate'>Nombre</th>
                            <th className='w-[12%] px-3 py-3 font-semibold text-xs tracking-wide truncate'>Contacto</th>
                            <th className='w-[10%] px-3 py-3 font-semibold text-xs tracking-wide truncate'>Etapa</th>
                            <th className='w-[8%] px-3 py-3 font-semibold text-xs tracking-wide truncate'>Valor</th>
                            <th className='w-[12%] px-3 py-3 font-semibold text-xs tracking-wide truncate'>Oportunidad</th>
                            <th className='w-[10%] px-3 py-3 font-semibold text-xs tracking-wide truncate'>Calif.</th>
                            <th className='w-[14%] px-3 py-3 font-semibold text-xs tracking-wide truncate'>Notas</th>
                            {isEditingMode && (
                                <th className='w-[8%] px-3 py-3 font-semibold text-xs tracking-wide truncate text-center'>Acciones</th>
                            )}
                        </tr>
                    </thead>
                    <tbody className='divide-y divide-gray-100'>
                        {clientes.map((cliente) => (
                            <tr
                                key={cliente.id}
                                className='group hover:bg-blue-50/50 transition-colors duration-200'
                            >
                                {/* Vendedor */}
                                <td className='px-3 py-3 font-medium text-gray-900 truncate' title={cliente.owner_username || ''}>
                                    {cliente.owner_username || '-'}
                                </td>

                                {/* Empresa */}
                                <td className='px-3 py-3 font-semibold text-gray-800 truncate' title={cliente.empresa || ''}>
                                    {cliente.empresa || '-'}
                                </td>

                                {/* Nombre */}
                                <td className='px-3 py-3 text-[#EA580C] font-medium truncate' title={cliente.nombre || ''}>
                                    {cliente.nombre || '-'}
                                </td>

                                {/* Contacto */}
                                <td className='px-3 py-3 text-xs text-gray-500 truncate' title={cliente.contacto || ''}>
                                    {cliente.contacto || '-'}
                                </td>

                                {/* Etapa */}
                                <td className='px-3 py-3'>
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wide truncate max-w-full ${getStageStyles(cliente.etapa)}`}>
                                        {cliente.etapa || 'N/A'}
                                    </span>
                                </td>

                                {/* Valor */}
                                <td className='px-3 py-3 font-mono text-gray-700 truncate'>
                                    {cliente.valor_estimado ? `$${cliente.valor_estimado.toLocaleString()}` : '$0'}
                                </td>

                                {/* Oportunidad */}
                                <td className='px-3 py-3 truncate text-xs' title={cliente.oportunidad || ''}>
                                    {cliente.oportunidad || '-'}
                                </td>

                                {/* Calif (Estrellas) */}
                                <td className='px-3 py-3'>
                                    <div className='flex gap-0.5 text-yellow-400 text-xs truncate'>
                                        {renderStars(cliente.calificacion || 0)}
                                    </div>
                                </td>

                                {/* Notas */}
                                <td className='px-3 py-3 text-xs text-gray-400 italic truncate' title={cliente.notas || ''}>
                                    {cliente.notas || '-'}
                                </td>

                                {/* Acciones */}
                                {isEditingMode && (
                                    <td className='px-3 py-3 text-center'>
                                        <div className='flex items-center justify-center gap-2'>
                                            <button
                                                onClick={() => onEdit?.(cliente)}
                                                className='p-1.5 text-blue-600 hover:bg-blue-100 rounded-md transition-colors'
                                                title='Editar'
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={() => onDelete?.(cliente.id)}
                                                className='p-1.5 text-red-600 hover:bg-red-100 rounded-md transition-colors'
                                                title='Eliminar'
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M3 6h18" />
                                                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                                </svg>
                                            </button>
                                        </div>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

// Helper para colores de etapa
function getStageStyles(stage: string | null) {
    const s = (stage || '').toLowerCase()
    if (s === 'cerrado') return 'bg-blue-100 text-blue-700 border-blue-200'
    if (s === 'prospección' || s === 'prospeccion') return 'bg-purple-100 text-purple-700 border-purple-200'
    if (s === 'negociación' || s === 'negociacion') return 'bg-orange-100 text-orange-700 border-orange-200'
    if (s === 'ganada') return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    return 'bg-gray-100 text-gray-600 border-gray-200'
}

// Helper for stars
function renderStars(rating: number) {
    // Simple 5 star rendering
    const stars = []
    for (let i = 1; i <= 5; i++) {
        stars.push(
            <span key={i} className={i <= rating ? 'opacity-100' : 'opacity-20'}>
                ★
            </span>
        )
    }
    return stars
}
