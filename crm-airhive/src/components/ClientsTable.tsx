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
        <div className='w-full overflow-x-auto custom-scrollbar'>
            <table className='w-full text-left border-collapse'>
                <thead className='uppercase text-[10px] font-black tracking-[0.2em]' style={{ background: 'var(--table-header-bg)', color: 'var(--text-secondary)' }}>
                    <tr>
                        {isEditingMode && <th className='px-2 py-5 whitespace-nowrap w-[40px] text-center'>Edit</th>}
                        <th className='px-8 py-5 whitespace-nowrap'>Vendedor</th>
                        <th className='px-8 py-5 whitespace-nowrap'>Empresa</th>
                        <th className='px-8 py-5 whitespace-nowrap'>Nombre</th>
                        <th className='px-8 py-5 whitespace-nowrap'>Email</th>
                        <th className='px-8 py-5 whitespace-nowrap'>Teléfono</th>
                        <th className='px-8 py-5 whitespace-nowrap'>Etapa</th>
                        <th className='px-8 py-5 whitespace-nowrap text-center'>%</th>
                        <th className='px-8 py-5 whitespace-nowrap'>Valor</th>
                        <th className='px-8 py-5 whitespace-nowrap'>Oportunidad</th>
                        <th className='px-8 py-5 whitespace-nowrap'>Calif.</th>
                        <th className='px-8 py-5 whitespace-nowrap'>Notas</th>
                        {isEditingMode && (
                            <th className='px-2 py-5 whitespace-nowrap w-[40px] text-center'>Delete</th>
                        )}
                    </tr>
                </thead>
                <tbody className='divide-y' style={{ borderColor: 'var(--card-border)' }}>
                    {clientes.map((cliente) => (
                        <tr
                            key={cliente.id}
                            onClick={() => onRowClick?.(cliente)}
                            className='transition-colors group hover:bg-black/5 cursor-pointer'
                        >
                            {isEditingMode && (
                                <td className='px-2 py-5 text-center'>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            onEdit?.(cliente)
                                        }}
                                        className='p-2 hover:bg-yellow-500/10 rounded-xl transition-all'
                                        title='Editar'
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M12 20h9" />
                                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                                        </svg>
                                    </button>
                                </td>
                            )}
                            {/* Vendedor */}
                            <td className='px-8 py-5'>
                                <div className='flex items-center gap-3'>
                                    <div className='w-8 h-8 rounded-full flex items-center justify-center text-white font-black text-[10px] shadow-sm flex-shrink-0' style={{ background: 'var(--accent-primary, #2048FF)' }}>
                                        {cliente.owner_username?.charAt(0).toUpperCase() || '?'}
                                    </div>
                                    <span className='font-bold text-xs uppercase tracking-tighter whitespace-nowrap' style={{ color: 'var(--text-secondary)' }}>
                                        {cliente.owner_username || '-'}
                                    </span>
                                </div>
                            </td>
                            {/* Empresa */}
                            <td className='px-8 py-5'>
                                <p className='font-black text-sm group-hover:text-[var(--accent-secondary)] transition-colors whitespace-nowrap' style={{ color: 'var(--text-primary)' }} title={cliente.empresa || ''}>
                                    {cliente.empresa || '-'}
                                </p>
                            </td>

                            {/* Nombre */}
                            <td className='px-8 py-5'>
                                <p className='font-black text-sm' style={{ color: 'var(--accent-primary)' }} title={cliente.nombre || ''}>
                                    {cliente.nombre || '-'}
                                </p>
                            </td>

                            {/* Email */}
                            <td className='px-8 py-5'>
                                {cliente.email ? (
                                    <div className='flex items-center gap-2'>
                                        <span className='font-bold text-xs truncate max-w-[150px]' style={{ color: 'var(--text-secondary)' }}>{cliente.email}</span>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onEmailClick(cliente.email!, cliente.nombre || cliente.empresa || '');
                                            }}
                                            className='text-blue-500 hover:text-blue-600 transition-colors'
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
                            <td className='px-8 py-5'>
                                {cliente.telefono ? (
                                    <div className='flex items-center gap-2 whitespace-nowrap'>
                                        <span className='font-black text-xs tabular-nums' style={{ color: 'var(--text-secondary)' }}>{cliente.telefono}</span>
                                        <a
                                            href={`https://wa.me/${cliente.telefono.replace(/\D/g, '')}`}
                                            target='_blank'
                                            rel='noopener noreferrer'
                                            onClick={(e) => e.stopPropagation()}
                                            className='text-emerald-500 hover:text-emerald-600 transition-colors'
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
                            <td className='px-8 py-5'>
                                <span className={`px-3 py-1 rounded-full text-[10px] font-black border uppercase tracking-widest whitespace-nowrap ${getStageStyles(cliente.etapa)}`}>
                                    {cliente.etapa || 'N/A'}
                                </span>
                            </td>

                            {/* Probabilidad */}
                            <td className='px-8 py-5'>
                                <div className='flex flex-col items-center gap-1 min-w-[60px]'>
                                    <span className={`text-[10px] font-black ${(cliente as any).probabilidad >= 70 ? 'text-emerald-600' : (cliente as any).probabilidad >= 40 ? 'text-amber-600' : 'text-slate-500'}`}>
                                        {(cliente as any).probabilidad || 0}%
                                    </span>
                                    <div className='w-full h-1.5 bg-gray-100 dark:bg-black/20 rounded-full overflow-hidden'>
                                        <div
                                            className={`h-full transition-all duration-500 ${(cliente as any).probabilidad >= 70 ? 'bg-emerald-500' : (cliente as any).probabilidad >= 40 ? 'bg-amber-500' : 'bg-slate-400'}`}
                                            style={{ width: `${(cliente as any).probabilidad || 0}%` }}
                                        />
                                    </div>
                                </div>
                            </td>

                            {/* Valor */}
                            <td className='px-8 py-5'>
                                <p className='font-black text-sm tabular-nums' style={{ color: 'var(--text-primary)' }}>
                                    {cliente.valor_estimado ? `$${cliente.valor_estimado.toLocaleString()}` : '$0'}
                                </p>
                            </td>

                            {/* Oportunidad */}
                            <td className='px-8 py-5'>
                                <p className='text-xs font-bold leading-relaxed max-w-[200px] line-clamp-2' style={{ color: 'var(--text-secondary)' }} title={cliente.oportunidad || ''}>
                                    {cliente.oportunidad || '-'}
                                </p>
                            </td>

                            {/* Calif (Estrellas) */}
                            <td className='px-8 py-5'>
                                <div className='flex gap-0.5 text-yellow-500 text-xs'>
                                    {renderStars(cliente.calificacion || 0)}
                                </div>
                            </td>

                            {/* Notas */}
                            <td className='px-8 py-5'>
                                <p className='text-[11px] font-medium italic leading-relaxed max-w-[200px] line-clamp-2' style={{ color: 'var(--text-secondary)', opacity: 0.6 }} title={cliente.notas || ''}>
                                    {cliente.notas || '-'}
                                </p>
                            </td>

                            {/* Acciones (Delete) */}
                            {isEditingMode && (
                                <td className='px-2 py-5 text-center'>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            onDelete?.(cliente.id)
                                        }}
                                        className='p-2 text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all'
                                        title='Eliminar'
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M3 6h18" />
                                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                        </svg>
                                    </button>
                                </td>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

// Helper para colores de etapa
function getStageStyles(stage: string | null) {
    const s = (stage || '').toLowerCase()
    // Cerrado Ganado: Vibrant Green
    if (s === 'cerrado ganado') return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
    // Cerrado Perdido: Vibrant Red
    if (s === 'cerrado perdido') return 'bg-rose-500/10 text-rose-600 border-rose-500/20'
    // Prospección: Vibrant Purple
    if (s === 'prospección' || s === 'prospeccion') return 'bg-purple-500/10 text-purple-600 border-purple-500/20'
    // Negociación: Vibrant Orange
    if (s === 'negociación' || s === 'negociacion') return 'bg-amber-500/10 text-amber-600 border-amber-500/20'
    return 'bg-slate-500/10 text-slate-600 border-slate-500/20'
}

// Helper for stars
function renderStars(rating: number) {
    const stars = []
    for (let i = 1; i <= 5; i++) {
        stars.push(
            <span key={i} className={`text-sm ${i <= rating ? 'opacity-100' : 'opacity-20'}`}>
                ★
            </span>
        )
    }
    return stars
}
