'use client'

import { CompanyData } from './CompanyModal'
import { CompanyWithProjects } from '../app/(app)/empresas/page'
import Image from 'next/image'

interface CompaniesTableProps {
    companies: CompanyWithProjects[]
    isEditingMode?: boolean
    currentUserProfile?: any | null
    onRowClick?: (company: CompanyWithProjects) => void
    onEdit?: (company: CompanyWithProjects) => void
    onDelete?: (id: string) => void
}

export default function CompaniesTable({
    companies,
    isEditingMode = false,
    currentUserProfile,
    onRowClick,
    onEdit,
    onDelete
}: CompaniesTableProps) {
    if (!companies || companies.length === 0) {
        return (
            <div className='w-full p-8 text-center bg-white rounded-2xl border border-gray-200 shadow-sm'>
                <p className='text-gray-500 text-lg'>No hay empresas registradas.</p>
            </div>
        )
    }

    return (
        <div className='overflow-x-auto'>
            <table className='w-full text-left border-collapse'>
                <thead className='uppercase text-[10px] font-black tracking-[0.2em]' style={{ background: 'var(--background)', color: 'var(--text-secondary)' }}>
                    <tr>
                        <th className='px-8 py-5'>Logo</th>
                        <th className='px-8 py-5'>Nombre</th>
                        <th className='px-8 py-5'>Industria</th>
                        <th className='px-8 py-5'>Ubicación</th>
                        <th className='px-8 py-5'>Proyectos Activos</th>
                        <th className='px-8 py-5'>En Proceso</th>
                        <th className='px-8 py-5'>Perdidos</th>
                        <th className='px-8 py-5'>Tamaño</th>
                        <th className='px-8 py-5'>Website</th>
                        {isEditingMode && (
                            <th className='px-8 py-5 text-center'>Acciones</th>
                        )}
                    </tr>
                </thead>
                <tbody className='divide-y' style={{ borderColor: 'var(--card-border)' }}>
                    {companies.map((company) => (
                        <tr
                            key={company.id}
                            onClick={() => !isEditingMode && onRowClick?.(company)}
                            className={`transition-colors group ${isEditingMode ? '' : 'hover:bg-black/5 cursor-pointer'}`}
                        >
                            {/* Logo */}
                            <td className='px-8 py-5 text-center'>
                                <div className='flex items-center gap-4'>
                                    {isEditingMode && checkPermission(company, currentUserProfile) && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                onEdit?.(company)
                                            }}
                                            className='p-2 hover:bg-yellow-500/10 rounded-xl transition-all'
                                            title='Editar empresa'
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M12 20h9" />
                                                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                                            </svg>
                                        </button>
                                    )}
                                    <div className='w-10 h-10 rounded-full bg-gradient-to-tr from-[#2048FF] to-[#8B5CF6] flex items-center justify-center overflow-hidden shadow-md'>
                                        {company.logo_url ? (
                                            <Image
                                                src={company.logo_url}
                                                alt={company.nombre}
                                                width={40}
                                                height={40}
                                                className='object-cover'
                                            />
                                        ) : (
                                            <span className='text-white font-black text-sm'>
                                                {company.nombre.charAt(0).toUpperCase()}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </td>

                            {/* Nombre */}
                            <td className='px-8 py-5'>
                                <p className='font-black text-sm' style={{ color: 'var(--text-primary)' }}>
                                    {company.nombre}
                                </p>
                            </td>

                            {/* Industria */}
                            <td className='px-8 py-5'>
                                <span className='font-bold text-sm' style={{ color: 'var(--text-secondary)' }}>
                                    {company.industria || 'N/A'}
                                </span>
                            </td>

                            {/* Ubicación */}
                            <td className='px-8 py-5'>
                                <div className='flex items-center gap-2'>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="20" viewBox="0 0 16 24">
                                        <defs>
                                            <mask id="pinMask">
                                                <rect width="16" height="24" fill="white" />
                                                <circle cx="8" cy="7" r="2.5" fill="black" />
                                            </mask>
                                        </defs>
                                        <path d="M8 2C5.2 2 3 4.2 3 7c0 4.5 5 13 5 13s5-8.5 5-13c0-2.8-2.2-5-5-5z" fill="#ef4444" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" mask="url(#pinMask)" />
                                    </svg>
                                    <span className='font-bold text-sm' style={{ color: 'var(--text-secondary)' }}>
                                        {company.ubicacion || 'No especificada'}
                                    </span>
                                </div>
                            </td>

                            {/* Proyectos Activos */}
                            <td className='px-8 py-5'>
                                <div className='flex items-center gap-2 whitespace-nowrap'>
                                    <span className='w-7 h-7 flex items-center justify-center rounded-full text-[13px] font-black border'
                                        style={{
                                            background: company.activeProjects > 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                                            borderColor: company.activeProjects > 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                                            color: company.activeProjects > 0 ? '#10b981' : 'rgba(255, 255, 255, 0.4)'
                                        }}>
                                        {company.activeProjects}
                                    </span>
                                    <span className='text-[10px] font-black tracking-widest uppercase' style={{ color: 'var(--text-secondary)' }}>
                                        {company.activeProjects === 1 ? 'Activo' : 'Activos'}
                                    </span>
                                </div>
                            </td>

                            {/* Proyectos en Proceso */}
                            <td className='px-8 py-5'>
                                <div className='flex items-center gap-2 whitespace-nowrap'>
                                    <span className='w-7 h-7 flex items-center justify-center rounded-full text-[13px] font-black border'
                                        style={{
                                            background: company.processProjects > 0 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                                            borderColor: company.processProjects > 0 ? 'rgba(245, 158, 11, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                                            color: company.processProjects > 0 ? '#f59e0b' : 'rgba(255, 255, 255, 0.4)'
                                        }}>
                                        {company.processProjects}
                                    </span>
                                    <span className='text-[10px] font-black tracking-widest uppercase' style={{ color: 'var(--text-secondary)' }}>
                                        En proceso
                                    </span>
                                </div>
                            </td>

                            {/* Proyectos Perdidos */}
                            <td className='px-8 py-5'>
                                <div className='flex items-center gap-2 whitespace-nowrap'>
                                    <span className='w-7 h-7 flex items-center justify-center rounded-full text-[13px] font-black border'
                                        style={{
                                            background: company.lostProjects > 0 ? 'rgba(244, 63, 94, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                                            borderColor: company.lostProjects > 0 ? 'rgba(244, 63, 94, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                                            color: company.lostProjects > 0 ? '#f43f5e' : 'rgba(255, 255, 255, 0.4)'
                                        }}>
                                        {company.lostProjects}
                                    </span>
                                    <span className='text-[10px] font-black tracking-widest uppercase' style={{ color: 'var(--text-secondary)' }}>
                                        {company.lostProjects === 1 ? 'Perdido' : 'Perdidos'}
                                    </span>
                                </div>
                            </td>

                            {/* Tamaño */}
                            <td className='px-8 py-5'>
                                {renderSizeBadge(company.tamano || 0)}
                            </td>

                            {/* Website */}
                            <td className='px-8 py-5'>
                                {company.website ? (
                                    <a
                                        href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                                        target='_blank'
                                        rel='noopener noreferrer'
                                        className='inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold text-xs transition-all shadow-sm'
                                        style={{
                                            backgroundColor: 'rgba(32, 72, 255, 0.25)',
                                            color: '#a3b8ff'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor = 'rgba(32, 72, 255, 0.65)'
                                            e.currentTarget.style.color = '#ffffff'
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = 'rgba(32, 72, 255, 0.25)'
                                            e.currentTarget.style.color = '#a3b8ff'
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {company.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                            <polyline points="15 3 21 3 21 9" />
                                            <line x1="10" y1="14" x2="21" y2="3" />
                                        </svg>
                                    </a>
                                ) : (
                                    <span className='font-bold text-sm' style={{ color: 'var(--text-secondary)', opacity: 0.3 }}>-</span>
                                )}
                            </td>

                            {/* Acciones */}
                            {isEditingMode && (
                                <td className='px-8 py-5 text-center'>
                                    <div className='flex items-center justify-center gap-3'>
                                        {checkPermission(company, currentUserProfile) ? (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    onDelete?.(company.id!)
                                                }}
                                                className='p-2.5 text-rose-500 hover:bg-rose-50 rounded-xl transition-all'
                                                title='Eliminar empresa'
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M3 6h18" />
                                                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                                </svg>
                                            </button>
                                        ) : (
                                            <span className='text-gray-300 p-2' title='Sin permisos para modificar'>🔒</span>
                                        )}
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

function checkPermission(company: CompanyWithProjects, profile: any) {
    if (!profile) return false
    if (profile.role === 'admin' || profile.role === 'rh') return true

    // Check if the current profile (id) matches the company owner_id
    // Note: Database uses owner_id for companies
    return profile.id === (company as any).owner_id
}

function renderSizeBadge(level: number) {
    const tiers = [
        { name: 'Micro', textColor: '#a7f3d0', bgColor: 'rgba(16, 185, 129, 0.25)' },      // Light emerald text, darker transparent emerald bg
        { name: 'Pequeña', textColor: '#bfdbfe', bgColor: 'rgba(59, 130, 246, 0.25)' },    // Light blue text, darker transparent blue bg
        { name: 'Mediana', textColor: '#c7d2fe', bgColor: 'rgba(99, 102, 241, 0.25)' },    // Light indigo text, darker transparent indigo bg
        { name: 'Grande', textColor: '#fde68a', bgColor: 'rgba(245, 158, 11, 0.25)' },     // Light amber text, darker transparent amber bg
        { name: 'Corporativo', textColor: '#ddd6fe', bgColor: 'rgba(139, 92, 246, 0.25)' } // Light purple text, darker transparent purple bg
    ]

    const tier = tiers[level - 1] || tiers[0]

    return (
        <span
            className='px-2.5 py-1 rounded-full text-xs font-bold capitalize tracking-normal transition-all duration-300 shadow-sm border border-white/5'
            style={{
                backgroundColor: tier.bgColor,
                color: tier.textColor,
            }}
        >
            {tier.name}
        </span>
    )
}
