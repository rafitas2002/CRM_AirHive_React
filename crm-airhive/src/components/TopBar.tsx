'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { Building2, UsersRound, Target, CheckSquare, CalendarDays, BarChart3, UserRound, Settings, LogOut, LineChart, Sparkles, type LucideIcon } from 'lucide-react'

export default function TopBar() {
    const pathname = usePathname()
    const auth = useAuth()

    const isAdmin = auth.profile?.role === 'admin'
    const logoDimensions = { width: 248, height: 36 }
    const dropdownIconClass = 'w-[18px] h-[18px] text-white/80 group-hover/item:text-white transition-colors'

    return (
        <header className='h-[70px] bg-black/80 backdrop-blur-md border-b border-white/5 sticky top-0 z-[100]'>
            <div className='h-full px-3 flex items-center gap-10'>
                <Link
                    href='/home'
                    aria-label='Ir a Home'
                    className='inline-flex items-center justify-start shrink-0 leading-none hover:opacity-80 transition-opacity'
                >
                    <Image
                        src='/airhive_logo_nav.svg'
                        alt='Air Hive'
                        width={logoDimensions.width}
                        height={logoDimensions.height}
                        className='block h-[36px] w-auto'
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

                    {/* EQUIPO */}
                    <Link
                        href='/usuarios'
                        className='relative text-white font-semibold text-base px-2 py-2 group whitespace-nowrap'
                    >
                        Equipo
                        <span
                            className={[
                                'absolute left-1/2 -translate-x-1/2 bottom-0 h-[3px] rounded bg-[#2048FF]',
                                'transition-all duration-300 ease-out',
                                pathname === '/usuarios' ? 'w-full opacity-100' : 'w-0 opacity-0',
                                'group-hover:w-full group-hover:opacity-100'
                            ].join(' ')}
                        />
                    </Link>

                    {/* Menú Desplegable CUSTOMER */}
                    <div className='relative group h-full flex items-center'>
                        <button
                            className={[
                                'relative text-white font-semibold text-base px-2 py-2 group flex items-center gap-1.5 cursor-pointer',
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
                                    { href: '/empresas', label: 'Empresas', icon: Building2 },
                                    { href: '/clientes', label: 'Leads', icon: UsersRound },
                                    { href: '/pre-leads', label: 'Pre-leads', icon: Target }
                                ].map((item) => {
                                    const Icon = item.icon as LucideIcon
                                    const isActive = pathname === item.href
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            className='relative flex items-center gap-3 px-4 py-3 text-white font-semibold text-sm hover:bg-white/5 transition-colors group/item rounded-lg overflow-hidden'
                                        >
                                            <Icon className={dropdownIconClass} strokeWidth={2.2} />
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
                                    { href: '/tareas', label: 'Tareas', icon: CheckSquare },
                                    { href: '/calendario', label: 'Calendario', icon: CalendarDays }
                                ].map((item) => {
                                    const Icon = item.icon as LucideIcon
                                    const isActive = pathname === item.href
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            className='relative flex items-center gap-3 px-4 py-3 text-white font-semibold text-sm hover:bg-white/5 transition-colors group/item rounded-lg overflow-hidden'
                                        >
                                            <Icon className={dropdownIconClass} strokeWidth={2.2} />
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

                    {/* Menú Desplegable INSIGHTS (solo admin) */}
                    {isAdmin && (
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
                                        { href: '/admin/forecast', label: 'Pronóstico', icon: BarChart3 }
                                    ].map((item) => {
                                        const Icon = item.icon as LucideIcon
                                        const isActive = pathname === item.href
                                        return (
                                            <Link
                                                key={item.href}
                                                href={item.href}
                                                className='relative flex items-center gap-3 px-4 py-3 text-white font-semibold text-sm hover:bg-white/5 transition-colors group/item rounded-lg overflow-hidden'
                                            >
                                                <Icon className={dropdownIconClass} strokeWidth={2.2} />
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
                    )}

                    {/* Menú CORRELACIONES (solo admin) */}
                    {isAdmin && (
                        <div className='relative group h-full flex items-center'>
                            <Link
                                href='/admin/correlaciones'
                                className='relative text-white font-semibold text-base px-2 py-2 group flex items-center gap-1.5'
                            >
                                Correlaciones
                                <span
                                    className={[
                                        'absolute left-1/2 -translate-x-1/2 bottom-0 h-[3px] rounded bg-[#2048FF]',
                                        'transition-all duration-300 ease-out',
                                        pathname.startsWith('/admin/correlaciones') ? 'w-full opacity-100' : 'w-0 opacity-0',
                                        'group-hover:w-full group-hover:opacity-100'
                                    ].join(' ')}
                                />
                            </Link>

                            <div className='absolute top-[100%] left-0 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-50 min-w-[220px] translate-y-2 group-hover:translate-y-0'>
                                <div className='bg-black border border-white/10 rounded-xl overflow-hidden shadow-2xl p-1.5'>
                                    {[
                                        { href: '/admin/correlaciones', label: 'Resumen', icon: BarChart3 },
                                        { href: '/admin/correlaciones/grafica', label: 'Gráfica', icon: LineChart },
                                        { href: '/admin/correlaciones/pronostico', label: 'Pronóstico', icon: Sparkles }
                                    ].map((item) => {
                                        const Icon = item.icon as LucideIcon
                                        const isActive = pathname === item.href
                                        return (
                                            <Link
                                                key={item.href}
                                                href={item.href}
                                                className='relative flex items-center gap-3 px-4 py-3 text-white font-semibold text-sm hover:bg-white/5 transition-colors group/item rounded-lg overflow-hidden'
                                            >
                                                <Icon className={dropdownIconClass} strokeWidth={2.2} />
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
                    )}
                </nav>

                <div className='flex-1' />

                {/* Chip usuario */}
                <div className='flex items-center gap-6 mr-8'>
                    <div className='h-9 px-4 rounded-full border border-white/20 bg-white/10 text-white text-xs font-bold flex items-center gap-2.5 whitespace-nowrap whitespace-nowrap shrink-0'>
                        <UserRound size={14} className='opacity-90 text-blue-300' strokeWidth={2.2} />
                        <span className='truncate max-w-[150px]'>{auth.loading ? 'Cargando...' : auth.username}</span>
                    </div>

                    {/* Settings Gear Icon */}
                    <Link
                        href='/settings'
                        className='relative text-white px-2 py-2 group transition-all hover:scale-110'
                        title='Configuración'
                        aria-label='Configuración'
                    >
                        <Settings size={24} strokeWidth={2.2} className='text-white/90 group-hover:text-white transition-colors' />
                        <span
                            className='absolute left-1/2 -translate-x-1/2 bottom-0 h-[3px] rounded bg-[#2048FF] transition-all duration-300 ease-out w-0 opacity-0 group-hover:w-full group-hover:opacity-100'
                        />
                    </Link>

                    <button
                        type='button'
                        disabled={auth.busy || auth.loading}
                        className={[
                            'relative text-white font-semibold text-base px-2 py-2 group cursor-pointer',
                            (auth.busy || auth.loading) ? 'opacity-50 cursor-not-allowed' : ''
                        ].join(' ')}
                        onClick={async () => {
                            await auth.logout()
                        }}
                    >
                        <span className='inline-flex items-center gap-2'>
                            <LogOut size={14} strokeWidth={2.4} />
                            {auth.busy ? 'Saliendo...' : 'Salir'}
                        </span>
                        <span
                            className='absolute left-1/2 -translate-x-1/2 bottom-0 h-[3px] rounded bg-[#2048FF] transition-all duration-300 ease-out w-0 opacity-0 group-hover:w-full group-hover:opacity-100'
                        />
                    </button>
                </div>
            </div>
        </header>
    )
}
