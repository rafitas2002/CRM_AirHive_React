'use client'

import React from 'react'

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
    if (!preLead) return null

    return (
        <div
            className={`ah-modal-overlay transition-all duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        >
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-md"
                onClick={onClose}
            />

            {/* Modal */}
            <div
                className={`relative w-full max-w-xl rounded-[40px] shadow-2xl border transition-all duration-500 overflow-hidden flex flex-col ${isOpen ? 'scale-100 translate-y-0' : 'scale-95 translate-y-10'}`}
                style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
            >
                {/* Header Compacto */}
                <div className='p-6 text-white flex items-center justify-between shrink-0' style={{ background: 'var(--table-header-bg)' }}>
                    <div className='flex items-center gap-4'>
                        <div className='w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-2xl border border-white/10 animate-pulse'>
                            🏢
                        </div>
                        <div>
                            <h2 className='text-xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>{preLead.nombre_empresa}</h2>
                            <p className='text-blue-500 text-[10px] font-black uppercase tracking-widest'>Archivo de Pre-Lead</p>
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
                <div className='p-8 space-y-6 overflow-y-auto max-h-[70vh] custom-scrollbar flex-1'>
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
                            <div className='w-10 h-10 rounded-xl shadow-inner flex items-center justify-center text-lg' style={{ background: 'var(--card-bg)' }}>👤</div>
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
                                ✉️ Correos
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
                                📞 Teléfonos
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
                                📝 Notas y Observaciones
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
                            <div className='w-6 h-6 bg-blue-500/10 rounded-full flex items-center justify-center text-[10px] text-blue-500'>👤</div>
                            <span className='text-[10px] font-black' style={{ color: 'var(--text-primary)' }}>Por: {preLead.vendedor_name}</span>
                        </div>
                        <span className='text-[10px] font-bold' style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                            Registrado el {new Date(preLead.created_at).toLocaleDateString()}
                        </span>
                    </div>
                </div>

                {/* Botones de Acción */}
                <div className='p-6 flex flex-col md:flex-row gap-3 shrink-0' style={{ background: 'var(--table-header-bg)' }}>
                    <button
                        onClick={() => onPromote(preLead)}
                        className='flex-1 h-12 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-emerald-500/20 hover:scale-[1.02] active:scale-95 transition-all'
                    >
                        🚀 Ascender a Lead
                    </button>
                    <div className='flex gap-3 flex-1'>
                        <button
                            onClick={() => onEdit(preLead)}
                            className='flex-1 h-12 bg-[#2048FF] text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-blue-500/20 hover:bg-[#1700AC] transition-all transform active:scale-95'
                        >
                            ✏️ Editar
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
