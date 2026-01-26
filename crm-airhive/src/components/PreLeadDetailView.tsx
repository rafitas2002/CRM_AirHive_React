'use client'

import React from 'react'

interface PreLeadDetailViewProps {
    preLead: any
    isOpen: boolean
    onClose: () => void
    onEdit: (pl: any) => void
}

export default function PreLeadDetailView({
    preLead,
    isOpen,
    onClose,
    onEdit
}: PreLeadDetailViewProps) {
    if (!preLead) return null

    return (
        <div
            className={`fixed inset-0 z-[100] flex items-center justify-center p-4 transition-all duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        >
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-[#0A1635]/80 backdrop-blur-md"
                onClick={onClose}
            />

            {/* Modal */}
            <div className={`relative bg-white w-full max-w-xl rounded-[40px] shadow-2xl transition-all duration-500 overflow-hidden flex flex-col ${isOpen ? 'scale-100 translate-y-0' : 'scale-95 translate-y-10'}`}>
                {/* Header Compacto */}
                <div className='bg-[#0A1635] p-6 text-white flex items-center justify-between shrink-0'>
                    <div className='flex items-center gap-4'>
                        <div className='w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-2xl border border-white/10'>
                            🏢
                        </div>
                        <div>
                            <h2 className='text-xl font-black tracking-tight'>{preLead.nombre_empresa}</h2>
                            <p className='text-blue-300 text-[10px] font-black uppercase tracking-widest'>Ficha de Pre-Lead</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className='w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/20 transition-all font-bold'
                    >
                        ✕
                    </button>
                </div>

                {/* Content Compacto */}
                <div className='p-8 space-y-6 overflow-y-auto max-h-[70vh] custom-scrollbar flex-1'>
                    {/* Grid Principal */}
                    <div className='grid grid-cols-2 gap-4'>
                        <div className='p-4 bg-gray-50 rounded-2xl border border-gray-100'>
                            <span className='text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1'>Giro</span>
                            <p className='text-sm font-black text-[#0A1635] truncate'>{preLead.giro_empresa || '---'}</p>
                        </div>
                        <div className='p-4 bg-gray-50 rounded-2xl border border-gray-100'>
                            <span className='text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1'>Ubicación</span>
                            <p className='text-sm font-bold text-gray-600 truncate'>{preLead.ubicacion || '---'}</p>
                        </div>
                    </div>

                    {/* Contact Person Card */}
                    <div className='p-5 bg-blue-50/50 rounded-2xl border border-blue-100 flex items-center justify-between'>
                        <div className='flex items-center gap-3'>
                            <div className='w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center text-lg'>👤</div>
                            <div>
                                <span className='text-[9px] font-black text-blue-600 uppercase tracking-widest block'>Contacto Principal</span>
                                <p className='text-base font-black text-[#0A1635]'>{preLead.nombre_contacto || 'No registrado'}</p>
                            </div>
                        </div>
                    </div>

                    {/* Canales de Comunicación */}
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                        {/* Correos */}
                        <div className='space-y-3'>
                            <span className='text-[9px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2'>
                                ✉️ Correos
                            </span>
                            <div className='flex flex-col gap-2'>
                                {preLead.correos?.length > 0 ? (
                                    preLead.correos.map((c: string, i: number) => (
                                        <a key={i} href={`mailto:${c}`} className='bg-white border border-gray-100 p-2.5 rounded-xl text-xs font-bold text-blue-600 hover:border-blue-300 hover:shadow-sm transition-all truncate'>
                                            {c}
                                        </a>
                                    ))
                                ) : (
                                    <span className='text-xs text-gray-300 italic'>Sin correos</span>
                                )}
                            </div>
                        </div>

                        {/* Teléfonos */}
                        <div className='space-y-3'>
                            <span className='text-[9px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2'>
                                📞 Teléfonos
                            </span>
                            <div className='flex flex-col gap-2'>
                                {preLead.telefonos?.length > 0 ? (
                                    preLead.telefonos.map((t: string, i: number) => (
                                        <a key={i} href={`tel:${t}`} className='bg-white border border-gray-100 p-2.5 rounded-xl text-xs font-bold text-emerald-600 hover:border-emerald-300 hover:shadow-sm transition-all'>
                                            {t}
                                        </a>
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
                            <span className='text-[9px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2'>
                                📝 Notas y Observaciones
                            </span>
                            <div className='p-5 bg-yellow-50/50 rounded-2xl border border-yellow-100/50'>
                                <p className='text-xs font-bold text-gray-700 leading-relaxed whitespace-pre-wrap'>
                                    {preLead.notas}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Footer Info */}
                    <div className='pt-6 border-t border-gray-100 flex items-center justify-between shrink-0'>
                        <div className='flex items-center gap-2'>
                            <div className='w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-[10px]'>👤</div>
                            <span className='text-[10px] font-black text-[#0A1635]'>Por: {preLead.vendedor_name}</span>
                        </div>
                        <span className='text-[10px] font-bold text-gray-400'>
                            Registrado el {new Date(preLead.created_at).toLocaleDateString()}
                        </span>
                    </div>
                </div>

                {/* Botones de Acción */}
                <div className='p-6 bg-gray-50 flex gap-3 shrink-0'>
                    <button
                        onClick={() => onEdit(preLead)}
                        className='flex-1 h-12 bg-[#2048FF] text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-blue-500/20 hover:bg-[#1700AC] transition-all transform active:scale-95'
                    >
                        ✏️ Editar Pre-Lead
                    </button>
                    <button
                        onClick={onClose}
                        className='px-6 h-12 bg-white border border-gray-200 text-gray-400 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-gray-100 transition-all'
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    )
}
