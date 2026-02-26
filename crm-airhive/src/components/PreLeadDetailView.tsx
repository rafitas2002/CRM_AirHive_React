'use client'

import React from 'react'
import { Building2, FileText, Mail, Pencil, Phone, Rocket, UserRound } from 'lucide-react'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'

interface PreLeadDetailViewProps {
    preLead: any
    isOpen: boolean
    onClose: () => void
    onEdit: (pl: any) => void
    onPromote: (pl: any) => void
    onEmailClick: (email: string, name: string) => void
    userEmail?: string
}

export default function PreLeadDetailView({
    preLead,
    isOpen,
    onClose,
    onEdit,
    onPromote,
    onEmailClick,
    userEmail
}: PreLeadDetailViewProps) {
    useBodyScrollLock(isOpen)
    if (!preLead) return null

    return (
        <div
            className={`ah-modal-overlay transition-all duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            onClick={onClose}
        >
            {/* Modal */}
            <div
                className={`ah-modal-panel relative w-full max-w-2xl transition-all duration-300 ${isOpen ? 'scale-100 translate-y-0 opacity-100' : 'scale-95 translate-y-4 opacity-0'}`}
                onClick={(event) => event.stopPropagation()}
            >
                {/* Header Compacto */}
                <div className='ah-modal-header px-6 py-5'>
                    <div className='flex items-center gap-4'>
                        <div
                            className='w-12 h-12 rounded-2xl flex items-center justify-center border shadow-sm'
                            style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}
                        >
                            <Building2 size={24} strokeWidth={2.2} style={{ color: 'var(--accent-secondary)' }} />
                        </div>
                        <div>
                            <h2 className='ah-modal-title text-xl tracking-tight'>{preLead.nombre_empresa}</h2>
                            <p className='ah-modal-subtitle'>Archivo de Pre-Lead</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className='h-10 px-4 rounded-2xl font-black text-[10px] uppercase tracking-widest border transition-all hover:brightness-110 hover:shadow-lg hover:scale-[1.02] active:scale-95'
                        style={{ background: 'var(--card-bg)', color: 'var(--text-primary)', borderColor: 'var(--card-border)' }}
                        title='Regresar'
                    >
                        Regresar
                    </button>
                </div>

                {/* Content Compacto */}
                <div className='p-8 space-y-6 overflow-y-auto custom-scrollbar flex-1'>
                    {/* Grid Principal */}
                    <div className='grid grid-cols-2 gap-4'>
                        <div className='p-4 rounded-2xl border' style={{ background: 'var(--background)', borderColor: 'var(--card-border)' }}>
                            <span className='text-[9px] font-black uppercase tracking-widest block mb-1' style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>Giro</span>
                            <p className='text-sm font-black truncate' style={{ color: 'var(--text-primary)' }}>{preLead.giro_empresa || '---'}</p>
                        </div>
                        <div className='p-4 rounded-2xl border' style={{ background: 'var(--background)', borderColor: 'var(--card-border)' }}>
                            <span className='text-[9px] font-black uppercase tracking-widest block mb-1' style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>Ubicación</span>
                            <p className='text-sm font-bold truncate' style={{ color: 'var(--text-secondary)' }}>{preLead.ubicacion || '---'}</p>
                        </div>
                    </div>

                    {/* Contact Person Card */}
                    <div className='p-5 rounded-2xl border flex items-center justify-between' style={{ background: 'var(--background)', borderColor: 'var(--card-border)' }}>
                        <div className='flex items-center gap-3'>
                            <div className='w-10 h-10 rounded-xl shadow-inner flex items-center justify-center' style={{ background: 'var(--card-bg)' }}>
                                <UserRound size={18} strokeWidth={2.2} style={{ color: 'var(--text-secondary)' }} />
                            </div>
                            <div>
                                <span className='text-[9px] font-black text-blue-600 uppercase tracking-widest block'>Contacto Principal</span>
                                <p className='text-base font-black' style={{ color: 'var(--text-primary)' }}>{preLead.nombre_contacto || 'No registrado'}</p>
                            </div>
                        </div>
                    </div>

                    {/* Canales de Comunicación */}
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                        {/* Correos */}
                        <div className='space-y-3'>
                            <span className='text-[9px] font-black uppercase tracking-widest flex items-center gap-2' style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                                <Mail size={12} strokeWidth={2.2} />
                                Correos
                            </span>
                            <div className='flex flex-col gap-2'>
                                {preLead.correos?.length > 0 ? (
                                    preLead.correos.map((c: string, i: number) => (
                                        <div key={i} className='flex items-center gap-2'>
                                            <a href={`mailto:${c}`} className='flex-1 border p-2.5 rounded-xl text-xs font-bold hover:border-blue-300 hover:shadow-sm transition-all truncate' style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}>
                                                {c}
                                            </a>
                                            <button
                                                onClick={() => onEmailClick(c, preLead.nombre_contacto || preLead.nombre_empresa)}
                                                className='w-10 h-10 bg-blue-500 text-white rounded-xl flex items-center justify-center hover:bg-blue-600 transition-all shadow-lg shadow-blue-500/20'
                                                title='Redactar en CRM'
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                                    <polyline points="22,6 12,13 2,6" />
                                                </svg>
                                            </button>
                                        </div>
                                    ))
                                ) : (
                                    <span className='text-xs text-gray-300 italic'>Sin correos</span>
                                )}
                            </div>
                        </div>

                        {/* Teléfonos */}
                        <div className='space-y-3'>
                            <span className='text-[9px] font-black uppercase tracking-widest flex items-center gap-2' style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                                <Phone size={12} strokeWidth={2.2} />
                                Teléfonos
                            </span>
                            <div className='flex flex-col gap-2'>
                                {preLead.telefonos?.length > 0 ? (
                                    preLead.telefonos.map((t: string, i: number) => (
                                        <div key={i} className='flex items-center gap-2'>
                                            <a href={`tel:${t}`} className='flex-1 border p-2.5 rounded-xl text-xs font-bold hover:shadow-sm transition-all' style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}>
                                                {t}
                                            </a>
                                            <a
                                                href={`https://wa.me/${t.replace(/\D/g, '')}`}
                                                target='_blank'
                                                rel='noopener noreferrer'
                                                className='w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20'
                                                title='WhatsApp'
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                                                </svg>
                                            </a>
                                        </div>
                                    ))
                                ) : (
                                    <span className='text-xs text-gray-300 italic'>Sin teléfonos</span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Notas */}
                    {preLead.notas && (
                        <div className='space-y-3 pt-2 text-start'>
                            <span className='text-[9px] font-black uppercase tracking-widest flex items-center gap-2' style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                                <FileText size={12} strokeWidth={2.2} />
                                Notas y Observaciones
                            </span>
                            <div className='p-5 rounded-2xl border border-dashed' style={{ background: 'var(--background)', borderColor: 'var(--card-border)' }}>
                                <p className='text-xs font-bold leading-relaxed whitespace-pre-wrap' style={{ color: 'var(--text-primary)' }}>
                                    {preLead.notas}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Footer Info */}
                    <div className='pt-6 border-t flex items-center justify-between shrink-0' style={{ borderColor: 'var(--card-border)' }}>
                        <div className='flex items-center gap-2'>
                            <div className='w-6 h-6 bg-blue-500/10 rounded-full flex items-center justify-center text-blue-500'>
                                <UserRound size={11} strokeWidth={2.4} />
                            </div>
                            <span className='text-[10px] font-black' style={{ color: 'var(--text-primary)' }}>Por: {preLead.vendedor_name}</span>
                        </div>
                        <span className='text-[10px] font-bold' style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                            Registrado el {new Date(preLead.created_at).toLocaleDateString()}
                        </span>
                    </div>
                </div>

                {/* Botones de Acción */}
                <div className='p-6 flex flex-col md:flex-row gap-3 shrink-0 border-t bg-[var(--hover-bg)]' style={{ borderColor: 'var(--card-border)' }}>
                    <button
                        onClick={() => onPromote(preLead)}
                        className='flex-1 h-12 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-emerald-500/20 hover:scale-[1.02] active:scale-95 transition-all'
                    >
                        <span className='inline-flex items-center justify-center gap-2'>
                            <Rocket size={13} strokeWidth={2.5} />
                            Ascender a Lead
                        </span>
                    </button>
                    <div className='flex gap-3 flex-1'>
                        <button
                            onClick={() => onEdit(preLead)}
                            className='flex-1 h-12 bg-[#2048FF] text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-blue-500/20 hover:bg-[#1700AC] transition-all transform active:scale-95'
                        >
                            <span className='inline-flex items-center justify-center gap-2'>
                                <Pencil size={13} strokeWidth={2.5} />
                                Editar
                            </span>
                        </button>
                        <button
                            onClick={onClose}
                            className='px-6 h-12 border rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-black/5 transition-all'
                            style={{ borderColor: 'var(--card-border)', color: 'var(--text-secondary)' }}
                        >
                            Cerrar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
