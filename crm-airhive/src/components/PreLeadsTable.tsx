'use client'

import React from 'react'
import { Mail, MessageCircle } from 'lucide-react'

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
            <div className='w-full p-12 text-center rounded-[40px] border-2 border-dashed' style={{ background: 'var(--background)', borderColor: 'var(--card-border)' }}>
                <p className='font-bold uppercase text-[10px] tracking-widest' style={{ color: 'var(--text-secondary)' }}>No hay pre-leads registrados</p>
            </div>
        )
    }

    return (
        <div className='ah-table-scroll custom-scrollbar'>
            <table className='ah-table'>
                <thead>
                    <tr>
                        {isEditingMode && <th className='px-2 py-5 whitespace-nowrap w-[40px] text-center'>Edit</th>}
                        <th className='px-8 py-5 whitespace-nowrap w-[15%]'>Vendedor</th>
                        <th className='px-8 py-5 whitespace-nowrap w-[20%]'>Empresa</th>
                        <th className='px-8 py-5 whitespace-nowrap w-[20%]'>Industria</th>
                        <th className='px-8 py-5 whitespace-nowrap w-[12%]'>Contacto</th>
                        <th className='px-8 py-5 whitespace-nowrap w-[13%]'>Email</th>
                        <th className='px-8 py-5 whitespace-nowrap w-[10%]'>Teléfono</th>
                        {isEditingMode && <th className='px-2 py-5 whitespace-nowrap w-[40px] text-center'>Delete</th>}
                    </tr>
                </thead>
                <tbody>
                    {preLeads.map((pl) => (
                        <tr
                            key={pl.id}
                            onClick={() => onRowClick(pl)}
                            className='transition-colors group hover:bg-black/5 cursor-pointer'
                        >
                            {isEditingMode && (
                                <td className='px-2 py-5 text-center'>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onEdit(pl); }}
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
                            <td className='px-8 py-5'>
                                <div className='flex items-center gap-3'>
                                    <div className='w-8 h-8 rounded-full flex items-center justify-center text-white font-black text-[10px] shadow-sm flex-shrink-0' style={{ background: 'var(--accent-primary, #2048FF)' }}>
                                        {pl.vendedor_name?.charAt(0).toUpperCase() || '?'}
                                    </div>
                                    <span className='font-bold text-xs uppercase tracking-tighter whitespace-nowrap' style={{ color: 'var(--text-secondary)' }}>
                                        {pl.vendedor_name || 'Sin asignar'}
                                    </span>
                                </div>
                            </td>
                            <td className='px-8 py-5 max-w-[250px]'>
                                <span className='font-black text-sm group-hover:text-[var(--accent-secondary)] transition-colors whitespace-normal break-words line-clamp-2 leading-tight' style={{ color: 'var(--accent-primary)' }}>
                                    {pl.nombre_empresa}
                                </span>
                            </td>
                            <td className='px-8 py-5 max-w-[250px]'>
                                <span className='text-[10px] font-bold uppercase tracking-widest opacity-60 whitespace-normal break-words line-clamp-2 leading-relaxed' style={{ color: 'var(--text-secondary)' }}>
                                    {pl.giro_empresa || '---'}
                                </span>
                            </td>
                            <td className='px-8 py-5'>
                                <span className='text-xs font-bold whitespace-nowrap' style={{ color: 'var(--text-secondary)' }}>{pl.nombre_contacto || '---'}</span>
                            </td>
                            <td className='px-8 py-5'>
                                <div className='flex flex-col gap-2'>
                                    {pl.correos.length > 0 ? (
                                        pl.correos.slice(0, 1).map((c, i) => (
                                            <div key={i} className='ah-cell-icon-text group/email'>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onEmailClick(c, pl.nombre_contacto || pl.nombre_empresa);
                                                    }}
                                                    className='text-blue-500 hover:text-blue-600 transition-colors flex-shrink-0'
                                                    title='Redactar en CRM'
                                                >
                                                    <Mail className='ah-cell-icon' />
                                                </button>
                                                <span className='text-[10px] font-bold truncate max-w-[120px]' style={{ color: 'var(--text-secondary)' }}>{c}</span>
                                            </div>
                                        ))
                                    ) : (
                                        <span className='text-[10px] italic opacity-30 shadow-none' style={{ color: 'var(--text-secondary)' }}>Sin datos</span>
                                    )}
                                </div>
                            </td>
                            <td className='px-8 py-5'>
                                <div className='flex flex-col gap-2'>
                                    {pl.telefonos.length > 0 ? (
                                        pl.telefonos.slice(0, 1).map((t, i) => (
                                            <div key={i} className='ah-cell-icon-text group/phone whitespace-nowrap'>
                                                <a
                                                    href={`https://wa.me/${t.replace(/\D/g, '')}`}
                                                    target='_blank'
                                                    rel='noopener noreferrer'
                                                    onClick={(e) => e.stopPropagation()}
                                                    className='text-emerald-500 hover:text-emerald-600 transition-colors flex-shrink-0'
                                                >
                                                    <MessageCircle className='ah-cell-icon' />
                                                </a>
                                                <span className='text-[10px] font-black tabular-nums' style={{ color: 'var(--text-secondary)' }}>{t}</span>
                                            </div>
                                        ))
                                    ) : (
                                        <span className='text-[10px] italic opacity-30' style={{ color: 'var(--text-secondary)' }}>---</span>
                                    )}
                                </div>
                            </td>
                            {isEditingMode && (
                                <td className='px-2 py-5 text-center'>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onDelete(pl.id); }}
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
