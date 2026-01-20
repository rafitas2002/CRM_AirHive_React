'use client'

import { CompanyData } from './CompanyModal'
import Image from 'next/image'

interface CompaniesTableProps {
    companies: CompanyData[]
    onRowClick?: (company: CompanyData) => void
    onDelete?: (id: string) => void
}

export default function CompaniesTable({ companies, onRowClick, onDelete }: CompaniesTableProps) {
    if (!companies || companies.length === 0) {
        return (
            <div className='w-full p-8 text-center bg-white rounded-2xl border border-gray-200 shadow-sm'>
                <p className='text-gray-500 text-lg'>No hay empresas registradas.</p>
            </div>
        )
    }

    return (
        <div className='w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm'>
            <div className='w-full overflow-x-auto'>
                <table className='w-full table-auto text-left text-sm text-gray-600'>
                    <thead className='bg-[#0A1635] text-white'>
                        <tr>
                            <th className='w-[80px] px-6 py-4 font-semibold text-xs tracking-wide uppercase'>Logo</th>
                            <th className='px-6 py-4 font-semibold text-xs tracking-wide uppercase'>Nombre</th>
                            <th className='px-6 py-4 font-semibold text-xs tracking-wide uppercase'>Industria</th>
                            <th className='px-6 py-4 font-semibold text-xs tracking-wide uppercase'>Ubicación</th>
                            <th className='px-6 py-4 font-semibold text-xs tracking-wide uppercase'>Tamaño</th>
                            <th className='px-6 py-4 font-semibold text-xs tracking-wide uppercase'>Website</th>
                            {onDelete && (
                                <th className='px-6 py-4 font-semibold text-xs tracking-wide uppercase text-center'>Acciones</th>
                            )}
                        </tr>
                    </thead>
                    <tbody className='divide-y divide-gray-100'>
                        {companies.map((company) => (
                            <tr
                                key={company.id}
                                onClick={() => onRowClick?.(company)}
                                className='group hover:bg-blue-50/50 transition-all duration-200 cursor-pointer'
                            >
                                {/* Logo */}
                                <td className='px-6 py-4'>
                                    <div className='w-12 h-12 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center overflow-hidden shadow-sm group-hover:shadow transition-shadow'>
                                        {company.logo_url ? (
                                            <Image
                                                src={company.logo_url}
                                                alt={company.nombre}
                                                width={48}
                                                height={48}
                                                className='object-contain w-full h-full'
                                            />
                                        ) : (
                                            <span className='text-gray-300 text-2xl font-bold'>
                                                {company.nombre.charAt(0)}
                                            </span>
                                        )}
                                    </div>
                                </td>

                                {/* Nombre */}
                                <td className='px-6 py-4 font-bold text-gray-900 text-base'>
                                    {company.nombre}
                                </td>

                                {/* Industria */}
                                <td className='px-6 py-4'>
                                    <span className='px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-100'>
                                        {company.industria || 'N/A'}
                                    </span>
                                </td>

                                {/* Ubicación */}
                                <td className='px-6 py-4 text-gray-600 font-medium'>
                                    <div className='flex items-center gap-1.5'>
                                        <span className='text-gray-400'>📍</span>
                                        {company.ubicacion || 'No especificada'}
                                    </div>
                                </td>

                                {/* Tamaño */}
                                <td className='px-6 py-4'>
                                    <div className='flex gap-1 text-yellow-400 text-xs'>
                                        {renderStars(company.tamano || 0)}
                                    </div>
                                </td>

                                {/* Website */}
                                <td className='px-6 py-4 text-blue-600 font-medium truncate max-w-[200px]'>
                                    {company.website ? (
                                        <a
                                            href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                                            target='_blank'
                                            rel='noopener noreferrer'
                                            className='hover:underline flex items-center gap-1'
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            {company.website.replace(/^https?:\/\//, '')}
                                            <span className='text-[10px]'>↗</span>
                                        </a>
                                    ) : (
                                        <span className='text-gray-400 font-normal'>-</span>
                                    )}
                                </td>

                                {/* Acciones */}
                                {onDelete && (
                                    <td className='px-6 py-4 text-center'>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                onDelete(company.id!)
                                            }}
                                            className='p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors group/btn'
                                            title='Eliminar empresa'
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
        </div>
    )
}

function renderStars(rating: number) {
    const stars = []
    for (let i = 1; i <= 5; i++) {
        stars.push(
            <span key={i} className={i <= rating ? 'opacity-100' : 'opacity-20'}>
                ★
            </span>
        )
    }
    return stars
}
