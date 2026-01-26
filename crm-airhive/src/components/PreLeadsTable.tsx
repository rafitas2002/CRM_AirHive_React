'use client'

import React from 'react'

interface PreLead {
    id: number
    nombre_empresa: string
    correos: string[]
    nombre_contacto: string | null
    telefonos: string[]
    ubicacion: string | null
    giro_empresa: string | null
    vendedor_name: string | null
    notas: string | null
    created_at: string
}

interface PreLeadsTableProps {
    preLeads: PreLead[]
    isEditingMode: boolean
    onEdit: (preLead: PreLead) => void
    onDelete: (id: number) => void
    onRowClick: (preLead: PreLead) => void
}

export default function PreLeadsTable({
    preLeads,
    isEditingMode,
    onEdit,
    onDelete,
    onRowClick
}: PreLeadsTableProps) {
    if (preLeads.length === 0) {
        return (
            <div className='flex flex-col items-center justify-center p-20 text-center bg-white rounded-3xl border border-gray-100 shadow-sm'>
                <div className='w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center text-3xl mb-4'>🔭</div>
                <h3 className='text-xl font-black text-[#0A1635] mb-2'>No se encontraron pre-leads</h3>
                <p className='text-gray-400 font-medium max-w-xs'>Ajusta tus filtros o registra uno nuevo para empezar.</p>
            </div>
        )
    }

    return (
        <div className='w-full overflow-hidden bg-white rounded-3xl shadow-sm border border-gray-100'>
            <table className='w-full border-collapse text-left'>
                <thead>
                    <tr className='bg-gray-50/50 border-b border-gray-100'>
                        <th className='px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest'>Empresa</th>
                        <th className='px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest'>Contacto</th>
                        <th className='px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest'>Correos</th>
                        <th className='px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest'>Teléfonos</th>
                        <th className='px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest'>Ubicación</th>
                        <th className='px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest'>Vendedor</th>
                        <th className='px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest'>Notas</th>
                        {isEditingMode && <th className='px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest w-[100px]'>Acciones</th>}
                    </tr>
                </thead>
                <tbody className='divide-y divide-gray-50'>
                    {preLeads.map((pl) => (
                        <tr
                            key={pl.id}
                            onClick={() => !isEditingMode && onRowClick(pl)}
                            className={`group transition-all hover:bg-blue-50/30 cursor-pointer ${isEditingMode ? 'cursor-default' : ''}`}
                        >
                            <td className='px-6 py-5'>
                                <div className='flex flex-col'>
                                    <span className='text-sm font-black text-[#0A1635] group-hover:text-[#2048FF] transition-colors'>{pl.nombre_empresa}</span>
                                    <span className='text-[10px] font-bold text-gray-400 uppercase tracking-tighter'>{pl.giro_empresa || 'Sin giro'}</span>
                                </div>
                            </td>
                            <td className='px-6 py-5'>
                                <span className='text-xs font-bold text-gray-600'>{pl.nombre_contacto || '---'}</span>
                            </td>
                            <td className='px-6 py-5'>
                                <div className='flex flex-col gap-1'>
                                    {pl.correos.length > 0 ? (
                                        pl.correos.map((c, i) => (
                                            <div key={i} className='flex items-center gap-1.5 bg-gray-100 px-2 py-0.5 rounded-md'>
                                                <span className='text-[10px] font-bold text-gray-500 truncate max-w-[120px]'>{c}</span>
                                                <a
                                                    href={`https://mail.google.com/mail/?view=cm&fs=1&to=${c}`}
                                                    target='_blank'
                                                    rel='noopener noreferrer'
                                                    onClick={(e) => e.stopPropagation()}
                                                    className='text-blue-500 hover:text-blue-600 transition-colors flex-shrink-0'
                                                    title='Redactar en Gmail'
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                                        <polyline points="22,6 12,13 2,6" />
                                                    </svg>
                                                </a>
                                            </div>
                                        ))
                                    ) : (
                                        <span className='text-[10px] text-gray-300 italic'>Sin correo</span>
                                    )}
                                </div>
                            </td>
                            <td className='px-6 py-5'>
                                <div className='flex flex-col gap-1'>
                                    {pl.telefonos.length > 0 ? (
                                        pl.telefonos.map((t, i) => (
                                            <div key={i} className='flex items-center gap-1.5 bg-blue-50 px-2 py-0.5 rounded-md'>
                                                <span className='text-[10px] font-bold text-gray-500 whitespace-nowrap'>{t}</span>
                                                <a
                                                    href={`https://wa.me/${t.replace(/\D/g, '')}`}
                                                    target='_blank'
                                                    rel='noopener noreferrer'
                                                    onClick={(e) => e.stopPropagation()}
                                                    className='text-emerald-500 hover:text-emerald-600 transition-colors flex-shrink-0'
                                                    title='Abrir WhatsApp'
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                                                    </svg>
                                                </a>
                                            </div>
                                        ))
                                    ) : (
                                        <span className='text-[10px] text-gray-300 italic'>Sin teléfono</span>
                                    )}
                                </div>
                            </td>
                            <td className='px-6 py-5'>
                                <span className='text-[10px] font-bold text-gray-500 leading-tight block max-w-[120px]'>{pl.ubicacion || '---'}</span>
                            </td>
                            <td className='px-6 py-5'>
                                <div className='flex items-center gap-2'>
                                    <div className='w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-[10px]'>👤</div>
                                    <span className='text-xs font-black text-[#0A1635]'>{pl.vendedor_name || 'Desconocido'}</span>
                                </div>
                            </td>
                            <td className='px-6 py-5'>
                                <p className='text-[10px] font-bold text-gray-400 line-clamp-2 max-w-[150px] leading-relaxed'>
                                    {pl.notas || <span className='italic font-normal opacity-50'>Sin notas</span>}
                                </p>
                            </td>
                            {isEditingMode && (
                                <td className='px-6 py-5' onClick={(e) => e.stopPropagation()}>
                                    <div className='flex items-center gap-2'>
                                        <button
                                            onClick={() => onEdit(pl)}
                                            className='p-2 bg-gray-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-sm'
                                            title="Editar"
                                        >
                                            ✏️
                                        </button>
                                        <button
                                            onClick={() => onDelete(pl.id)}
                                            className='p-2 bg-gray-50 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all shadow-sm'
                                            title="Eliminar"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                </td>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
