'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const settingsLinks = [
    { href: '/settings/personalizacion', label: 'Personalización', icon: '🎨' },
    { href: '/settings/cuentas', label: 'Conectar Cuentas', icon: '🔗' },
    { href: '/settings/perfil', label: 'Perfil de Usuario', icon: '👤' }
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()

    return (
        <div className='h-full flex' style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
            {/* Sidebar Navigation */}
            <aside className='w-72 border-r flex flex-col' style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
                <div className='p-6 border-b' style={{ borderColor: 'var(--card-border)' }}>
                    <h1 className='text-2xl font-bold' style={{ color: 'var(--text-primary)' }}>⚙️ Configuración</h1>
                    <p className='text-sm mt-1' style={{ color: 'var(--text-secondary)' }}>Personaliza tu experiencia</p>
                </div>

                <nav className='flex-1 p-4 space-y-2'>
                    {settingsLinks.map((link) => {
                        const isActive = pathname === link.href
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
                                <span className='text-lg'>{link.icon}</span>
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
