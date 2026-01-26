'use client'

import React from 'react'

export interface PreLead {
    id: number
    nombre_empresa: string
    nombre_contacto: string | null
    correos: string[]
    telefonos: string[]
    ubicacion: string | null
    giro_empresa: string | null
    vendedor_name: string | null
    created_at: string
}

interface PreLeadsTableProps {
    preLeads: PreLead[]
    isEditingMode: boolean
    onEdit: (preLead: PreLead) => void
    onDelete: (id: number) => void
    onRowClick: (preLead: PreLead) => void
    onEmailClick: (email: string, name: string) => void
    userEmail?: string
}

export default function PreLeadsTable({
    preLeads,
    isEditingMode,
    onEdit,
    onDelete,
    onRowClick,
    onEmailClick,
    userEmail
}: PreLeadsTableProps) {
    if (preLeads.length === 0) {
        return (
            <div className='w-full p-12 text-center bg-gray-50 rounded-[32px] border-2 border-dashed border-gray-200'>
                <p className='text-gray-400 font-bold uppercase text-[10px] tracking-widest'>No hay pre-leads registrados</p>
            </div>
        )
    }

    return (
        <table className='w-full text-left'>
            <thead>
                <tr className='border-b border-gray-100'>
                    <th className='px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest'>Empresa</th>
                    <th className='px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest'>Contacto</th>
                    <th className='px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest'>Correos</th>
                    <th className='px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest'>Teléfonos</th>
                    <th className='px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest'>Vendedor</th>
                    {isEditingMode && <th className='px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right'>Acciones</th>}
                </tr>
            </thead>
            <tbody className='divide-y divide-gray-50'>
                {preLeads.map((pl) => (
                    <tr
                        key={pl.id}
                        onClick={() => onRowClick(pl)}
                        className='group hover:bg-gray-50/80 transition-all cursor-pointer'
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
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onEmailClick(c, pl.nombre_contacto || pl.nombre_empresa);
                                                }}
                                                className='text-blue-500 hover:text-blue-600 transition-colors flex-shrink-0'
                                                title='Redactar en CRM'
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                                    <polyline points="22,6 12,13 2,6" />
                                                </svg>
                                            </button>
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
                            <span className='text-[10px] font-black text-gray-400 uppercase tabular-nums'>{pl.vendedor_name || 'Sin asignar'}</span>
                        </td>
                        {isEditingMode && (
                            <td className='px-6 py-5 text-right'>
                                <div className='flex items-center justify-end gap-2'>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onEdit(pl); }}
                                        className='w-8 h-8 flex items-center justify-center rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all'
                                    >
                                        ✏️
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onDelete(pl.id); }}
                                        className='w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-all'
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
    )
}
