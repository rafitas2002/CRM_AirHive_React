'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { Settings, MessageSquareQuote, Link2, UserRound, Users, ShieldCheck } from 'lucide-react'

const settingsLinks = [
    { href: '/settings/perfil', label: 'Perfil de Usuario', icon: UserRound },
    { href: '/settings/frases', label: 'Frases', icon: MessageSquareQuote },
    { href: '/settings/cuentas', label: 'Conectar Cuentas', icon: Link2 }
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const { profile, user } = useAuth()

    const normalizeSignature = (value: unknown) => String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase()

    // Check if user is Admin/RH or designated approver (Jesus)
    const isAdminOrRH = profile?.role === 'admin' || profile?.role === 'rh'
    const isDesignatedApprover = normalizeSignature(profile?.username) === 'jesus.gracia'
        || normalizeSignature(profile?.full_name) === 'jesus gracia'
        || normalizeSignature(String(user?.email || '').split('@')[0]) === 'jesus.gracia'

    const displayedLinks = [
        ...settingsLinks,
        ...(isAdminOrRH
            ? [
                { href: '/settings/equipo', label: 'Equipo', icon: Users },
                { href: '/settings/aprobaciones', label: 'Aprobaciones', icon: ShieldCheck }
            ]
            : isDesignatedApprover
                ? [{ href: '/settings/aprobaciones', label: 'Aprobaciones', icon: ShieldCheck }]
            : [])
    ]

    return (
        <div className='h-full flex' style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
            {/* Sidebar Navigation */}
            <aside className='w-72 border-r flex flex-col' style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
                <div className='p-6 border-b' style={{ borderColor: 'var(--card-border)' }}>
                    <div className='flex items-center gap-3'>
                        <div className='ah-icon-card ah-icon-card-sm'>
                            <Settings size={20} strokeWidth={2.2} />
                        </div>
                        <h1 className='text-2xl font-bold' style={{ color: 'var(--text-primary)' }}>
                            Configuración
                        </h1>
                    </div>
                    <p className='text-sm mt-1' style={{ color: 'var(--text-secondary)' }}>Gestiona tu perfil, frases y aprobaciones</p>
                </div>

                <nav className='flex-1 p-4 space-y-2'>
                    {displayedLinks.map((link) => {
                        const isActive = pathname === link.href
                        const Icon = link.icon
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                className='flex items-center gap-3 px-4 py-3 rounded-lg font-semibold text-sm transition-all relative overflow-hidden group'
                                style={{
                                    background: isActive ? 'var(--hover-bg)' : 'transparent',
                                    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)'
                                }}
                            >
                                <span
                                    className='ah-icon-card ah-icon-card-sm shrink-0'
                                    style={{ width: '2rem', height: '2rem', borderRadius: '0.75rem' }}
                                >
                                    <Icon size={14} strokeWidth={2.2} />
                                </span>
                                {link.label}
                                {isActive && (
                                    <span
                                        className='absolute left-0 top-0 bottom-0 w-1 rounded-r'
                                        style={{ background: '#2048FF' }}
                                    />
                                )}
                                {!isActive && (
                                    <span
                                        className='absolute left-0 top-0 bottom-0 w-0 group-hover:w-1 rounded-r transition-all'
                                        style={{ background: '#2048FF' }}
                                    />
                                )}
                            </Link>
                        )
                    })}
                </nav>
            </aside>

            {/* Main Content */}
            <main className='flex-1 overflow-auto'>
                {children}
            </main>
        </div>
    )
}
