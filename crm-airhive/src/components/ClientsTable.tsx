'use client'

import { Database } from '@/lib/supabase'

type Cliente = Database['public']['Tables']['clientes']['Row']

interface ClientsTableProps {
    clientes: Cliente[]
    isEditingMode?: boolean
    onEdit?: (cliente: Cliente) => void
    onDelete?: (id: number) => void
    onRowClick?: (cliente: Cliente) => void
    onEmailClick: (email: string, name: string) => void
    userEmail?: string
}

export default function ClientsTable({ clientes, isEditingMode = false, onEdit, onDelete, onRowClick, onEmailClick, userEmail }: ClientsTableProps) {
    if (!clientes || clientes.length === 0) {
        return (
            <div className='w-full p-8 text-center bg-white/50 backdrop-blur-md rounded-2xl border border-white/40 shadow-sm'>
                <p className='text-gray-500 text-lg'>No hay leads registrados.</p>
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
                            <th className='w-[10%] px-3 py-3 font-semibold text-xs tracking-wide truncate'>Email</th>
                            <th className='w-[10%] px-3 py-3 font-semibold text-xs tracking-wide truncate'>Teléfono</th>
                            <th className='w-[10%] px-3 py-3 font-semibold text-xs tracking-wide truncate'>Etapa</th>
                            <th className='w-[5%] px-3 py-3 font-semibold text-xs tracking-wide truncate text-center font-mono'>%</th>
                            <th className='w-[8%] px-3 py-3 font-semibold text-xs tracking-wide truncate'>Valor</th>
                            <th className='w-[12%] px-3 py-3 font-semibold text-xs tracking-wide truncate'>Oportunidad</th>
                            <th className='w-[8%] px-3 py-3 font-semibold text-xs tracking-wide truncate'>Calif.</th>
                            <th className='w-[12%] px-3 py-3 font-semibold text-xs tracking-wide truncate'>Notas</th>
                            {isEditingMode && (
                                <th className='w-[8%] px-3 py-3 font-semibold text-xs tracking-wide truncate text-center'>Acciones</th>
                            )}
                        </tr>
                    </thead>
                    <tbody className='divide-y divide-gray-100'>
                        {clientes.map((cliente) => (
                            <tr
                                key={cliente.id}
                                onClick={() => onRowClick?.(cliente)}
                                className='group hover:bg-blue-50/50 transition-colors duration-200 cursor-pointer'
                            >
                                {/* Vendedor */}
                                <td className='px-3 py-3 font-medium text-gray-900 truncate' title={cliente.owner_username || ''}>
                                    {cliente.owner_username || '-'}
                                </td>

                                {/* Empresa */}
                                <td className='px-3 py-3 font-medium text-gray-500 truncate' title={cliente.empresa || ''}>
                                    {cliente.empresa || '-'}
                                </td>

                                {/* Nombre */}
                                <td className='px-3 py-3 text-[#2048FF] font-bold truncate' title={cliente.nombre || ''}>
                                    {cliente.nombre || '-'}
                                </td>

                                {/* Email */}
                                <td className='px-3 py-3 text-xs text-gray-500 truncate' title={cliente.email || ''}>
                                    {cliente.email ? (
                                        <div className='flex items-center gap-1.5'>
                                            <span className='truncate'>{cliente.email}</span>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onEmailClick(cliente.email!, cliente.nombre || cliente.empresa || '');
                                                }}
                                                className='text-blue-500 hover:text-blue-600 transition-colors flex-shrink-0'
                                                title='Redactar en CRM'
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                                    <polyline points="22,6 12,13 2,6" />
                                                </svg>
                                            </button>
                                        </div>
                                    ) : '-'}
                                </td>

                                {/* Teléfono */}
                                <td className='px-3 py-3 text-xs text-gray-500 truncate' title={cliente.telefono || ''}>
                                    {cliente.telefono ? (
                                        <div className='flex items-center gap-1.5'>
                                            <span className='font-mono'>{cliente.telefono}</span>
                                            <a
                                                href={`https://wa.me/${cliente.telefono.replace(/\D/g, '')}`}
                                                target='_blank'
                                                rel='noopener noreferrer'
                                                onClick={(e) => e.stopPropagation()}
                                                className='text-emerald-500 hover:text-emerald-600 transition-colors flex-shrink-0'
                                                title='Abrir WhatsApp'
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                                                </svg>
                                            </a>
                                        </div>
                                    ) : '-'}
                                </td>

                                {/* Etapa */}
                                <td className='px-3 py-3'>
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wide truncate max-w-full ${getStageStyles(cliente.etapa)}`}>
                                        {cliente.etapa || 'N/A'}
                                    </span>
                                </td>

                                {/* Probabilidad */}
                                <td className='px-3 py-3 text-center'>
                                    <div className='flex flex-col items-center gap-1'>
                                        <span className={`text-[10px] font-black ${(cliente as any).probabilidad >= 70 ? 'text-emerald-600' : (cliente as any).probabilidad >= 40 ? 'text-amber-600' : 'text-slate-500'}`}>
                                            {(cliente as any).probabilidad || 0}%
                                        </span>
                                        <div className='w-full h-1 bg-gray-100 rounded-full overflow-hidden'>
                                            <div
                                                className={`h-full transition-all duration-500 ${(cliente as any).probabilidad >= 70 ? 'bg-emerald-500' : (cliente as any).probabilidad >= 40 ? 'bg-amber-500' : 'bg-slate-400'}`}
                                                style={{ width: `${(cliente as any).probabilidad || 0}%` }}
                                            />
                                        </div>
                                    </div>
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
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    onEdit?.(cliente)
                                                }}
                                                className='p-1.5 text-blue-600 hover:bg-blue-100 rounded-md transition-colors'
                                                title='Editar'
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    onDelete?.(cliente.id)
                                                }}
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
    // Cerrado Ganado: More vibrant Aqua-Green (Emerald-Cyan mix)
    if (s === 'cerrado ganado') return 'bg-cyan-50 text-[#00A38B] border-cyan-100'
    // Cerrado Perdido: Reddish
    if (s === 'cerrado perdido') return 'bg-red-50 text-red-600 border-red-100'
    // Prospección: Purple
    if (s === 'prospección' || s === 'prospeccion') return 'bg-purple-100 text-purple-700 border-purple-200'
    // Negociación: Warm Orange-Amber
    if (s === 'negociación' || s === 'negociacion') return 'bg-amber-100 text-amber-700 border-amber-200'
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
