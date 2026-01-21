'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

type ClientData = {
    id: number
    empresa: string
    nombre: string
    contacto: string
    etapa: string
    valor_estimado: number
    oportunidad: string
    calificacion: number
    notas: string
    empresa_id?: string
    owner_username?: string
    probabilidad?: number
    fecha_registro?: string
    forecast_logloss?: number | null
    forecast_evaluated_probability?: number | null
    forecast_outcome?: number | null
    forecast_scored_at?: string | null
}

type CompanyData = {
    id: string
    nombre: string
    tamano: number
    ubicacion: string
    logo_url: string
    industria: string
    website: string
    descripcion: string
}

interface ClientDetailViewProps {
    client: ClientData | null
    isOpen: boolean
    onClose: () => void
    onEditClient: (client: ClientData) => void
    onEditCompany: (company: CompanyData) => void
}

export default function ClientDetailView({
    client,
    isOpen,
    onClose,
    onEditClient,
    onEditCompany
}: ClientDetailViewProps) {
    const [company, setCompany] = useState<CompanyData | null>(null)
    const [loadingCompany, setLoadingCompany] = useState(false)
    const [supabase] = useState(() => createClient())

    useEffect(() => {
        console.log('ClientDetailView client:', client) // DEBUG
        if (client?.empresa_id) {
            console.log('Fetching company with ID:', client.empresa_id) // DEBUG
            fetchCompany(client.empresa_id)
        } else {
            console.log('No empresa_id found on client') // DEBUG
            setCompany(null)
        }
    }, [client])

    const fetchCompany = async (id: string) => {
        setLoadingCompany(true)
        const { data, error } = await supabase
            .from('empresas')
            .select('*')
            .eq('id', id)
            .single()

        if (error) {
            console.error('Error fetching company:', error)
        } else {
            setCompany(data)
        }
        setLoadingCompany(false)
    }

    if (!isOpen || !client) return null

    return (
        <div className='fixed inset-0 z-40 bg-[#DDE2E5] flex flex-col animate-in slide-in-from-bottom duration-300'>
            {/* Header */}
            <div className='bg-[#0F2A44] px-8 py-4 flex items-center justify-between shadow-md shrink-0'>
                <div className='flex items-center gap-4'>
                    <button
                        onClick={onClose}
                        className='text-white/70 hover:text-white transition-colors flex items-center gap-2'
                    >
                        ← Volver
                    </button>
                    <h1 className='text-2xl font-bold text-white border-l border-white/20 pl-4'>
                        {client.nombre}
                    </h1>
                </div>
                <div className='flex gap-3'>
                    <button
                        onClick={() => onEditClient(client)}
                        className='px-4 py-2 bg-[#1700AC] text-white rounded-lg hover:bg-[#2048FF] transition-colors shadow-sm font-medium'
                    >
                        Editar Lead
                    </button>
                    {company && (
                        <button
                            onClick={() => onEditCompany(company)}
                            className='px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors shadow-sm font-medium border border-white/20'
                        >
                            🏢 Ver en Catálogo
                        </button>
                    )}
                </div>
            </div>

            {/* Content Grid */}
            <div className='flex-1 overflow-y-auto custom-scrollbar p-8 bg-gray-50'>
                <div className='max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8'>

                    {/* Left Column: Client Details */}
                    <div className='lg:col-span-1 space-y-6'>
                        <div className='bg-white p-6 rounded-2xl shadow-sm border border-gray-200'>
                            <h2 className='text-lg font-bold text-[#0F2A44] mb-4 border-b pb-2'>
                                Información del Lead
                            </h2>

                            <div className='space-y-4'>
                                <div>
                                    <label className='text-xs font-semibold text-gray-500 uppercase tracking-wider'>Empresa (Lead)</label>
                                    <p className='text-[#0A1635] font-medium text-lg'>{client.empresa}</p>
                                </div>
                                <div>
                                    <label className='text-xs font-semibold text-gray-500 uppercase tracking-wider'>Contacto</label>
                                    <p className='text-[#0A1635]'>{client.contacto}</p>
                                </div>
                                <div className='grid grid-cols-2 gap-4'>
                                    <div>
                                        <label className='text-xs font-semibold text-gray-500 uppercase tracking-wider'>Etapa</label>
                                        <span className={`inline-block px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest mt-1 border
                                            ${client.etapa === 'Cerrado Ganado' ? 'bg-cyan-50 text-[#00A38B] border-cyan-100' :
                                                client.etapa === 'Negociación' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                                                    client.etapa === 'Cerrado Perdido' ? 'bg-red-100 text-red-700 border-red-200' :
                                                        'bg-blue-100 text-blue-700 border-blue-200'}`}>
                                            {client.etapa}
                                        </span>
                                    </div>
                                    <div>
                                        <label className='text-xs font-semibold text-gray-500 uppercase tracking-wider'>Calificación</label>
                                        <div className='flex text-yellow-400 mt-1'>
                                            {'★'.repeat(Math.max(0, Math.min(5, client?.calificacion || 0)))}{'☆'.repeat(Math.max(0, 5 - (client?.calificacion || 0)))}
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <label className='text-xs font-semibold text-gray-500 uppercase tracking-wider'>Probabilidad de Cierre</label>
                                    <div className='flex items-center gap-3 mt-1'>
                                        <div className='flex-1 h-2 bg-gray-100 rounded-full overflow-hidden border border-gray-100 shadow-inner'>
                                            <div
                                                className={`h-full transition-all duration-700 ${(client as any).probabilidad >= 70 ? 'bg-emerald-500' : (client as any).probabilidad >= 40 ? 'bg-amber-500' : 'bg-slate-400'}`}
                                                style={{ width: `${(client as any).probabilidad || 0}%` }}
                                            />
                                        </div>
                                        <span className={`text-sm font-black ${(client as any).probabilidad >= 70 ? 'text-emerald-600' : (client as any).probabilidad >= 40 ? 'text-amber-600' : 'text-slate-500'}`}>
                                            {(client as any).probabilidad || 0}%
                                        </span>
                                    </div>
                                </div>
                                <div>
                                    <label className='text-xs font-semibold text-gray-500 uppercase tracking-wider'>Valor Estimado</label>
                                    <p className='text-[#0A1635] font-bold text-xl'>
                                        ${client?.valor_estimado?.toLocaleString() || '0'}
                                    </p>
                                </div>
                                <div className='grid grid-cols-2 gap-4'>
                                    <div>
                                        <label className='text-xs font-semibold text-gray-500 uppercase tracking-wider'>Vendedor</label>
                                        <p className='text-[#0A1635] font-medium flex items-center gap-1 mt-1'>
                                            👤 {client.owner_username || 'Sistema'}
                                        </p>
                                    </div>
                                    <div>
                                        <label className='text-xs font-semibold text-gray-500 uppercase tracking-wider'>Fecha Registro</label>
                                        <p className='text-[#0A1635] font-medium mt-1'>
                                            📅 {client.fecha_registro ? new Date(client.fecha_registro).toLocaleDateString() : 'N/A'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Forecast Scoring Section (Admin / Closed Only) */}
                        {client.forecast_scored_at && (
                            <div className='bg-blue-50 p-6 rounded-2xl shadow-sm border border-blue-100'>
                                <h2 className='text-lg font-bold text-[#1700AC] mb-4 border-b border-blue-100 pb-2'>
                                    Auditoría de Pronóstico
                                </h2>
                                <div className='space-y-4'>
                                    <div className='flex justify-between items-center'>
                                        <label className='text-[10px] font-black text-blue-600 uppercase tracking-widest'>Log Loss</label>
                                        <span className={`text-lg font-black ${(client.forecast_logloss ?? 1) < 0.2 ? 'text-emerald-600' : 'text-amber-600'}`}>
                                            {client.forecast_logloss?.toFixed(4) || '0.0000'}
                                        </span>
                                    </div>
                                    <div className='grid grid-cols-2 gap-4'>
                                        <div>
                                            <label className='text-[10px] font-black text-blue-600 uppercase tracking-widest'>Prob. Evaluada</label>
                                            <p className='text-blue-900 font-bold'>{client.forecast_evaluated_probability}%</p>
                                        </div>
                                        <div>
                                            <label className='text-[10px] font-black text-blue-600 uppercase tracking-widest'>Resultado</label>
                                            <p className={`font-bold ${client.forecast_outcome === 1 ? 'text-emerald-700' : 'text-red-700'}`}>
                                                {client.forecast_outcome === 1 ? 'GANADA' : 'PERDIDA'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className='text-[10px] text-blue-400 font-medium italic text-right'>
                                        Evaluado el {new Date(client.forecast_scored_at).toLocaleString()}
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className='bg-white p-6 rounded-2xl shadow-sm border border-gray-200'>
                            <h2 className='text-lg font-bold text-[#0F2A44] mb-4 border-b pb-2'>
                                Notas y Oportunidad
                            </h2>
                            <div className='space-y-4'>
                                <div>
                                    <label className='text-xs font-semibold text-gray-500 uppercase tracking-wider'>Oportunidad</label>
                                    <p className='text-gray-700 mt-1 whitespace-pre-wrap'>{client.oportunidad || 'Sin descripción'}</p>
                                </div>
                                <div>
                                    <label className='text-xs font-semibold text-gray-500 uppercase tracking-wider'>Notas</label>
                                    <p className='text-gray-600 italic mt-1 bg-gray-50 p-3 rounded-lg border border-gray-100'>
                                        {client.notas || 'Sin notas adicionales'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Company Details */}
                    <div className='lg:col-span-2 space-y-6'>
                        <div className='bg-white p-6 rounded-2xl shadow-sm border border-gray-200 h-full'>
                            <h2 className='text-lg font-bold text-[#0F2A44] mb-6 border-b pb-2 flex justify-between items-center'>
                                <span>Información de la Empresa</span>
                                {!company && !loadingCompany && (
                                    <span className='text-xs font-normal text-gray-500 italic'>No hay empresa vinculada</span>
                                )}
                            </h2>

                            {loadingCompany ? (
                                <div className='h-64 flex items-center justify-center text-gray-400 animate-pulse'>
                                    Cargando detalles de la empresa...
                                </div>
                            ) : company ? (
                                <div className='grid grid-cols-1 md:grid-cols-3 gap-8'>
                                    {/* Logo & Basic Info */}
                                    <div className='col-span-1 flex flex-col items-center text-center space-y-4 border-r border-gray-100 pr-4'>
                                        <div className='w-40 h-40 rounded-full border-4 border-[#F5F6F8] shadow-lg overflow-hidden flex items-center justify-center bg-white'>
                                            {company.logo_url ? (
                                                <img src={company.logo_url} alt={company.nombre} className='w-full h-full object-cover' />
                                            ) : (
                                                <span className='text-6xl'>🏢</span>
                                            )}
                                        </div>
                                        <div>
                                            <h3 className='text-2xl font-bold text-[#0F2A44]'>{company.nombre}</h3>
                                            <p className='text-gray-500 text-sm mt-1'>{company.industria}</p>
                                        </div>
                                        {(company.website && company.website.includes('.') && !company.website.includes(' ')) ? (
                                            <a
                                                href={company.website.match(/^https?:\/\//) ? company.website : `https://${company.website}`}
                                                target='_blank'
                                                rel='noopener noreferrer'
                                                className='text-[#2048FF] hover:underline text-sm flex items-center gap-1 break-all justify-center'
                                            >
                                                🔗 <span className='truncate'>{company.website}</span>
                                            </a>
                                        ) : (
                                            <span className='text-gray-600 text-sm flex items-center gap-1 break-all justify-center'>
                                                {company.website && '🔗'} <span className='truncate'>{company.website || 'Sin sitio web'}</span>
                                            </span>
                                        )}
                                    </div>

                                    {/* Detailed Info */}
                                    <div className='col-span-2 space-y-6 pl-4'>
                                        <div className='grid grid-cols-2 gap-6'>
                                            <div className='bg-gray-50 p-4 rounded-xl'>
                                                <label className='text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2'>Tamaño</label>
                                                <div className='flex items-end gap-2'>
                                                    <span className='text-3xl font-bold text-[#1700AC]'>{company.tamano}</span>
                                                    <span className='text-sm text-gray-500 mb-1'>/ 5</span>
                                                </div>
                                                <div className='flex gap-1 mt-2'>
                                                    {[1, 2, 3, 4, 5].map(i => (
                                                        <div key={i} className={`h-2 flex-1 rounded-full ${i <= company.tamano ? 'bg-[#1700AC]' : 'bg-gray-200'}`} />
                                                    ))}
                                                </div>
                                            </div>
                                            <div className='bg-gray-50 p-4 rounded-xl'>
                                                <label className='text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2'>Ubicación</label>
                                                <p className='text-lg font-medium text-[#0F2A44]'>{company.ubicacion || 'No especificada'}</p>
                                                <p className='text-xs text-gray-400 mt-1'>Sede Principal</p>
                                            </div>
                                        </div>

                                        <div>
                                            <label className='text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2'>Descripción</label>
                                            <p className='text-gray-700 leading-relaxed bg-white p-4 rounded-xl border border-gray-100'>
                                                {company.descripcion || 'Sin descripción disponible.'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className='flex flex-col items-center justify-center py-20 text-center bg-gray-50 rounded-xl border-2 border-dashed border-gray-200'>
                                    <div className='text-4xl mb-4'>🏢</div>
                                    <h3 className='text-lg font-medium text-gray-900'>No hay información de empresa</h3>
                                    <p className='text-gray-500 max-w-sm mt-2'>
                                        Este lead no tiene una empresa vinculada. Puedes agregar detalles en la configuración avanzada.
                                    </p>
                                    <button
                                        onClick={() => onEditClient(client)}
                                        className='mt-6 px-4 py-2 text-[#2048FF] bg-blue-50 hover:bg-blue-100 rounded-lg font-medium transition-colors'
                                    >
                                        Vincular Empresa
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    )
}
