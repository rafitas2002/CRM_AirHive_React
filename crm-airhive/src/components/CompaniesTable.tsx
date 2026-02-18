'use client'

import { CompanyData } from './CompanyModal'
import { CompanyWithProjects } from '../app/(app)/empresas/page'
import Image from 'next/image'
import { Globe, MapPin } from 'lucide-react'

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
        <div className='ah-table-scroll custom-scrollbar'>
            <table className='ah-table'>
                <thead>
                    <tr>
                        {isEditingMode && <th className='px-2 py-5 whitespace-nowrap w-[40px] text-center'>Edit</th>}
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
                            <th className='px-2 py-5 whitespace-nowrap w-[40px] text-center'>Delete</th>
                        )}
                    </tr>
                </thead>
                <tbody>
                    {companies.map((company) => (
                        <tr
                            key={company.id}
                            onClick={() => !isEditingMode && onRowClick?.(company)}
                            className={`transition-colors group ${isEditingMode ? '' : 'hover:bg-black/5 cursor-pointer'}`}
                        >
                            {isEditingMode && (
                                <td className='px-2 py-5 text-center'>
                                    {checkPermission(company, currentUserProfile) ? (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                onEdit?.(company)
                                            }}
                                            className='p-2 rounded-xl border border-transparent text-amber-500 hover:bg-amber-500/10 hover:border-amber-500/35 hover:text-amber-400 transition-all cursor-pointer'
                                            title='Editar empresa'
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M12 20h9" />
                                                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                                            </svg>
                                        </button>
                                    ) : (
                                        <span className='text-gray-300 p-2' title='Sin permisos'>🔒</span>
                                    )}
                                </td>
                            )}

                            {/* Logo */}
                            <td className='px-8 py-5 text-center'>
                                <div className='flex items-center gap-4 justify-center'>
                                    <div className='w-10 h-10 rounded-full flex items-center justify-center overflow-hidden shadow-md' style={{ background: 'var(--accent-primary, #2048FF)' }}>
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
                                <div className='flex flex-col gap-1'>
                                    <span className='font-bold text-sm' style={{ color: 'var(--text-secondary)' }}>
                                        {company.industria || 'N/A'}
                                    </span>
                                    {!!company.industrias?.length && (
                                        <span className='text-[10px] font-black uppercase tracking-wider text-blue-500'>
                                            {company.industrias.length > 1
                                                ? `+${company.industrias.length - 1} industrias`
                                                : 'Industria única'}
                                        </span>
                                    )}
                                </div>
                            </td>

                            {/* Ubicación */}
                            <td className='px-8 py-5'>
                                <div className='ah-cell-icon-text'>
                                    <MapPin className='ah-cell-icon text-rose-500' />
                                    <span className='font-bold text-sm' style={{ color: 'var(--text-secondary)' }}>
                                        {company.ubicacion || 'No especificada'}
                                    </span>
                                </div>
                            </td>

                            {/* Proyectos Activos */}
                            <td className='px-8 py-5'>
                                <div className='flex items-center gap-2 whitespace-nowrap'>
                                    <span className='w-7 h-7 flex items-center justify-center rounded-full text-[13px] font-black border transition-all duration-300'
                                        style={{
                                            background: company.activeProjects > 0 ? 'rgba(16, 185, 129, 0.25)' : 'var(--hover-bg)',
                                            borderColor: company.activeProjects > 0 ? 'rgba(16, 185, 129, 0.4)' : 'var(--card-border)',
                                            color: company.activeProjects > 0 ? 'var(--tier-1-text)' : 'var(--project-count-empty)'
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
                                    <span className='w-7 h-7 flex items-center justify-center rounded-full text-[13px] font-black border transition-all duration-300'
                                        style={{
                                            background: company.processProjects > 0 ? 'rgba(245, 158, 11, 0.25)' : 'var(--hover-bg)',
                                            borderColor: company.processProjects > 0 ? 'rgba(245, 158, 11, 0.4)' : 'var(--card-border)',
                                            color: company.processProjects > 0 ? 'var(--tier-4-text)' : 'var(--project-count-empty)'
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
                                    <span className='w-7 h-7 flex items-center justify-center rounded-full text-[13px] font-black border transition-all duration-300'
                                        style={{
                                            background: company.lostProjects > 0 ? 'rgba(244, 63, 94, 0.25)' : 'var(--hover-bg)',
                                            borderColor: company.lostProjects > 0 ? 'rgba(244, 63, 94, 0.4)' : 'var(--card-border)',
                                            color: company.lostProjects > 0 ? '#991b1b' : 'var(--project-count-empty)'
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
                                            backgroundColor: 'var(--website-badge-bg)',
                                            color: 'var(--website-badge-text)'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor = 'var(--accent-primary)'
                                            e.currentTarget.style.color = '#ffffff'
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = 'var(--website-badge-bg)'
                                            e.currentTarget.style.color = 'var(--website-badge-text)'
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <Globe className='ah-cell-icon' />
                                        {company.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                                    </a>
                                ) : (
                                    <span className='font-bold text-sm' style={{ color: 'var(--text-secondary)', opacity: 0.3 }}>-</span>
                                )}
                            </td>

                            {/* Acciones (Delete) */}
                            {isEditingMode && (
                                <td className='px-2 py-5 text-center'>
                                    {checkPermission(company, currentUserProfile) ? (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                onDelete?.(company.id!)
                                            }}
                                            className='p-2 rounded-xl border border-transparent text-rose-500 hover:bg-rose-500/10 hover:border-rose-500/35 hover:text-rose-400 transition-all cursor-pointer'
                                            title='Eliminar empresa'
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M3 6h18" />
                                                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                            </svg>
                                        </button>
                                    ) : (
                                        <span className='text-gray-300 p-2' title='Sin permisos'>🔒</span>
                                    )}
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
        { name: 'Micro', textColor: 'var(--tier-1-text)', bgColor: 'var(--tier-1-bg)' },
        { name: 'Pequeña', textColor: 'var(--tier-2-text)', bgColor: 'var(--tier-2-bg)' },
        { name: 'Mediana', textColor: 'var(--tier-3-text)', bgColor: 'var(--tier-3-bg)' },
        { name: 'Grande', textColor: 'var(--tier-4-text)', bgColor: 'var(--tier-4-bg)' },
        { name: 'Corporativo', textColor: 'var(--tier-5-text)', bgColor: 'var(--tier-5-bg)' }
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
