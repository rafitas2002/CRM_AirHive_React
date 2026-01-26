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
        : { width: 350, height: 114 }

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
                    {/* HOME */}
                    <Link
                        href='/home'
                        className='relative text-white font-semibold text-base px-2 py-2 group whitespace-nowrap'
                    >
                        Home
                        <span
                            className={[
                                'absolute left-1/2 -translate-x-1/2 bottom-0 h-[3px] rounded bg-[#2048FF]',
                                'transition-all duration-300 ease-out',
                                pathname === '/home' ? 'w-full opacity-100' : 'w-0 opacity-0',
                                'group-hover:w-full group-hover:opacity-100'
                            ].join(' ')}
                        />
                    </Link>

                    {/* Menú Desplegable CUSTOMER */}
                    <div className='relative group h-full flex items-center'>
                        <button
                            className={[
                                'relative text-white font-semibold text-base px-2 py-2 group flex items-center gap-1.5',
                                (pathname.includes('/clientes') || pathname.includes('/empresas') || pathname.includes('/pre-leads')) ? 'active-customer' : ''
                            ].join(' ')}
                        >
                            Customer
                            <span
                                className={[
                                    'absolute left-1/2 -translate-x-1/2 bottom-0 h-[3px] rounded bg-[#2048FF]',
                                    'transition-all duration-300 ease-out',
                                    (pathname.includes('/clientes') || pathname.includes('/empresas') || pathname.includes('/pre-leads')) ? 'w-full opacity-100' : 'w-0 opacity-0',
                                    'group-hover:w-full group-hover:opacity-100'
                                ].join(' ')}
                            />
                        </button>

                        {/* Dropdown Content */}
                        <div className='absolute top-[100%] left-0 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-50 min-w-[160px] translate-y-2 group-hover:translate-y-0'>
                            <div className='bg-black border border-white/10 rounded-xl overflow-hidden shadow-2xl p-1.5'>
                                {[
                                    { href: '/empresas', label: 'Empresas', icon: '🏢' },
                                    { href: '/clientes', label: 'Leads', icon: '👤' },
                                    { href: '/pre-leads', label: 'Pre-leads', icon: '🎯' }
                                ].map((item) => {
                                    const isActive = pathname === item.href
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            className='relative flex items-center gap-3 px-4 py-3 text-white font-semibold text-sm hover:bg-white/5 transition-colors group/item rounded-lg overflow-hidden'
                                        >
                                            <span className='text-base'>{item.icon}</span>
                                            {item.label}
                                            <span
                                                className={[
                                                    'absolute left-0 bottom-0 h-[2px] bg-[#2048FF]',
                                                    'transition-all duration-300 ease-out',
                                                    isActive ? 'w-full opacity-100' : 'w-0 opacity-0',
                                                    'group-hover/item:w-full group-hover/item:opacity-100'
                                                ].join(' ')}
                                            />
                                        </Link>
                                    )
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Menú Desplegable AGENDA */}
                    <div className='relative group h-full flex items-center'>
                        <Link
                            href='/calendario'
                            className={[
                                'relative text-white font-semibold text-base px-2 py-2 group flex items-center gap-1.5',
                                (pathname.includes('/tareas') || pathname.includes('/calendario')) ? 'active-agenda' : ''
                            ].join(' ')}
                        >
                            Agenda
                            <span
                                className={[
                                    'absolute left-1/2 -translate-x-1/2 bottom-0 h-[3px] rounded bg-[#2048FF]',
                                    'transition-all duration-300 ease-out',
                                    (pathname.includes('/tareas') || pathname.includes('/calendario')) ? 'w-full opacity-100' : 'w-0 opacity-0',
                                    'group-hover:w-full group-hover:opacity-100'
                                ].join(' ')}
                            />
                        </Link>

                        {/* Dropdown Content */}
                        <div className='absolute top-[100%] left-0 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-50 min-w-[160px] translate-y-2 group-hover:translate-y-0'>
                            <div className='bg-black border border-white/10 rounded-xl overflow-hidden shadow-2xl p-1.5'>
                                {[
                                    { href: '/tareas', label: 'Tareas', icon: '✅' },
                                    { href: '/calendario', label: 'Calendario', icon: '📅' }
                                ].map((item) => {
                                    const isActive = pathname === item.href
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            className='relative flex items-center gap-3 px-4 py-3 text-white font-semibold text-sm hover:bg-white/5 transition-colors group/item rounded-lg overflow-hidden'
                                        >
                                            <span className='text-base'>{item.icon}</span>
                                            {item.label}
                                            <span
                                                className={[
                                                    'absolute left-0 bottom-0 h-[2px] bg-[#2048FF]',
                                                    'transition-all duration-300 ease-out',
                                                    isActive ? 'w-full opacity-100' : 'w-0 opacity-0',
                                                    'group-hover/item:w-full group-hover/item:opacity-100'
                                                ].join(' ')}
                                            />
                                        </Link>
                                    )
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Menú Desplegable INSIGHTS */}
                    <div className='relative group h-full flex items-center'>
                        <Link
                            href='/admin/forecast'
                            className={[
                                'relative text-white font-semibold text-base px-2 py-2 group flex items-center gap-1.5',
                                (pathname.includes('/admin/forecast')) ? 'active-insights' : ''
                            ].join(' ')}
                        >
                            Insights
                            <span
                                className={[
                                    'absolute left-1/2 -translate-x-1/2 bottom-0 h-[3px] rounded bg-[#2048FF]',
                                    'transition-all duration-300 ease-out',
                                    (pathname.includes('/admin/forecast')) ? 'w-full opacity-100' : 'w-0 opacity-0',
                                    'group-hover:w-full group-hover:opacity-100'
                                ].join(' ')}
                            />
                        </Link>

                        {/* Dropdown Content */}
                        <div className='absolute top-[100%] left-0 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-50 min-w-[160px] translate-y-2 group-hover:translate-y-0'>
                            <div className='bg-black border border-white/10 rounded-xl overflow-hidden shadow-2xl p-1.5'>
                                {[
                                    { href: '/admin/forecast', label: 'Pronóstico', icon: '📊' }
                                ].map((item) => {
                                    const isActive = pathname === item.href
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            className='relative flex items-center gap-3 px-4 py-3 text-white font-semibold text-sm hover:bg-white/5 transition-colors group/item rounded-lg overflow-hidden'
                                        >
                                            <span className='text-base'>{item.icon}</span>
                                            {item.label}
                                            <span
                                                className={[
                                                    'absolute left-0 bottom-0 h-[2px] bg-[#2048FF]',
                                                    'transition-all duration-300 ease-out',
                                                    isActive ? 'w-full opacity-100' : 'w-0 opacity-0',
                                                    'group-hover/item:w-full group-hover/item:opacity-100'
                                                ].join(' ')}
                                            />
                                        </Link>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                </nav>

                <div className='flex-1' />

                {/* Chip usuario */}
                <div className='flex items-center gap-6 mr-8'>
                    <div className='h-9 px-4 rounded-full border border-white/20 bg-white/10 text-white text-xs font-bold flex items-center gap-2.5 whitespace-nowrap whitespace-nowrap shrink-0'>
                        <span className='text-sm opacity-90'>👤</span>
                        <span className='truncate max-w-[150px]'>{auth.loading ? 'Cargando...' : auth.username}</span>
                    </div>

                    {/* Settings Gear Icon */}
                    <Link
                        href='/settings'
                        className='relative text-white font-semibold text-xl px-2 py-2 group transition-all hover:scale-110'
                        title='Configuración'
                    >
                        ⚙️
                        <span
                            className='absolute left-1/2 -translate-x-1/2 bottom-0 h-[3px] rounded bg-[#2048FF] transition-all duration-300 ease-out w-0 opacity-0 group-hover:w-full group-hover:opacity-100'
                        />
                    </Link>

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
