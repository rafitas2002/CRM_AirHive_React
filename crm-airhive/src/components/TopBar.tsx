'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth'

const links = [
    { href: '/home', label: 'Home' },
    { href: '/clientes', label: 'Leads' },
    { href: '/tareas', label: 'Tareas' },
    { href: '/calendario', label: 'Calendario' }
]

export default function TopBar() {
    const pathname = usePathname()
    const auth = useAuth()

    const isAdmin = auth.profile?.role === 'admin'
    const logoDimensions = isAdmin
        ? { width: 350, height: 114 }
        : { width: 280, height: 94 }

    return (
        <header className='h-[70px] bg-black border-b-2 border-black'>
            <div className='h-full px-3 flex items-center gap-10'>
                <Link href='/home' className='flex items-center hover:opacity-80 transition-opacity'>
                    <Image
                        src='/airhive_logo_azul_sinfondo.svg'
                        alt='Air Hive'
                        width={logoDimensions.width}
                        height={logoDimensions.height}
                        priority
                    />
                </Link>

                <nav className='flex items-center gap-10'>
                    {links.map(l => {
                        const active = pathname === l.href
                        return (
                            <Link
                                key={l.href}
                                href={l.href}
                                className='relative text-white font-semibold text-base px-2 py-2 group'
                            >
                                {l.label}
                                <span
                                    className={[
                                        'absolute left-1/2 -translate-x-1/2 bottom-0 h-[3px] rounded bg-[#2048FF]',
                                        'transition-all duration-300 ease-out',
                                        active ? 'w-full opacity-100' : 'w-0 opacity-0',
                                        'group-hover:w-full group-hover:opacity-100'
                                    ].join(' ')}
                                />
                            </Link>
                        )
                    })}
                    {(auth.profile?.role === 'admin' || auth.profile?.role === 'seller') && (
                        <Link
                            href='/empresas'
                            className={`relative text-white font-semibold text-base px-2 py-2 group`}
                        >
                            Empresas
                            <span
                                className={[
                                    'absolute left-1/2 -translate-x-1/2 bottom-0 h-[3px] rounded bg-[#2048FF]',
                                    'transition-all duration-300 ease-out',
                                    pathname === '/empresas' ? 'w-full opacity-100' : 'w-0 opacity-0',
                                    'group-hover:w-full group-hover:opacity-100'
                                ].join(' ')}
                            />
                        </Link>
                    )}
                    {auth.profile?.role === 'admin' && (
                        <Link
                            href='/admin/forecast'
                            className={`relative text-white font-semibold text-base px-2 py-2 group`}
                        >
                            Pronóstico
                            <span
                                className={[
                                    'absolute left-1/2 -translate-x-1/2 bottom-0 h-[3px] rounded bg-[#2048FF]',
                                    'transition-all duration-300 ease-out',
                                    pathname === '/admin/forecast' ? 'w-full opacity-100' : 'w-0 opacity-0',
                                    'group-hover:w-full group-hover:opacity-100'
                                ].join(' ')}
                            />
                        </Link>
                    )}
                </nav>

                <div className='flex-1' />

                {/* Chip usuario */}
                <div className='flex items-center gap-6 mr-8'>
                    <div className='h-9 px-4 rounded-full border border-white/20 bg-white/10 text-white text-xs font-bold flex items-center gap-2.5 whitespace-nowrap whitespace-nowrap shrink-0'>
                        <span className='text-sm opacity-90'>👤</span>
                        <span className='truncate max-w-[150px]'>{auth.loading ? 'Cargando...' : auth.username}</span>
                    </div>

                    <button
                        type='button'
                        disabled={auth.busy || auth.loading}
                        className={[
                            'relative text-white font-semibold text-base px-2 py-2 group',
                            (auth.busy || auth.loading) ? 'opacity-50 cursor-not-allowed' : ''
                        ].join(' ')}
                        onClick={async () => {
                            await auth.logout()
                        }}
                    >
                        {auth.busy ? 'Saliendo...' : 'Salir'}
                        <span
                            className='absolute left-1/2 -translate-x-1/2 bottom-0 h-[3px] rounded bg-[#2048FF] transition-all duration-300 ease-out w-0 opacity-0 group-hover:w-full group-hover:opacity-100'
                        />
                    </button>
                </div>
            </div>
        </header>
    )
}
