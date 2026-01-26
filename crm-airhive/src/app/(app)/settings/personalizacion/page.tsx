'use client'

import { useTheme, Theme } from '@/lib/ThemeContext'

const themes: Array<{ id: Theme; name: string; description: string; preview: { bg: string; text: string } }> = [
    {
        id: 'claro',
        name: 'Claro',
        description: 'Tema claro con fondo blanco y texto oscuro',
        preview: { bg: '#f8f9fa', text: '#1a1a1a' }
    },
    {
        id: 'gris',
        name: 'Gris',
        description: 'Tema gris con contraste medio',
        preview: { bg: '#374151', text: '#f9fafb' }
    },
    {
        id: 'oscuro',
        name: 'Oscuro',
        description: 'Tema oscuro con fondo negro y texto claro',
        preview: { bg: '#0a0a0a', text: '#ededed' }
    }
]

export default function PersonalizacionPage() {
    const { theme, setTheme } = useTheme()

    return (
        <div className='p-8 max-w-5xl'>
            <div className='mb-8'>
                <h1 className='text-3xl font-bold mb-2' style={{ color: 'var(--text-primary)' }}>
                    🎨 Personalización
                </h1>
                <p className='text-base' style={{ color: 'var(--text-secondary)' }}>
                    Personaliza la apariencia de tu CRM según tus preferencias
                </p>
            </div>

            {/* Theme Selector */}
            <div className='mb-8'>
                <h2 className='text-xl font-semibold mb-4' style={{ color: 'var(--text-primary)' }}>
                    Tema de la aplicación
                </h2>
                <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
                    {themes.map((t) => {
                        const isActive = theme === t.id
                        return (
                            <button
                                key={t.id}
                                onClick={() => setTheme(t.id)}
                                className='relative p-6 rounded-xl border-2 transition-all hover:scale-105 group'
                                style={{
                                    borderColor: isActive ? '#2048FF' : 'var(--card-border)',
                                    background: 'var(--card-bg)',
                                    boxShadow: isActive ? '0 0 0 3px rgba(32, 72, 255, 0.1)' : 'none'
                                }}
                            >
                                {/* Preview Box */}
                                <div
                                    className='w-full h-24 rounded-lg mb-4 flex items-center justify-center font-semibold transition-transform group-hover:scale-95'
                                    style={{
                                        background: t.preview.bg,
                                        color: t.preview.text
                                    }}
                                >
                                    <span className='text-sm'>Aa</span>
                                </div>

                                {/* Theme Name */}
                                <h3 className='text-lg font-bold mb-1' style={{ color: 'var(--text-primary)' }}>
                                    {t.name}
                                    {isActive && <span className='ml-2'>✓</span>}
                                </h3>

                                {/* Theme Description */}
                                <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>
                                    {t.description}
                                </p>

                                {/* Active Indicator */}
                                {isActive && (
                                    <div className='absolute top-3 right-3 w-3 h-3 rounded-full bg-[#2048FF] animate-pulse' />
                                )}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Info Card */}
            <div
                className='p-4 rounded-lg border'
                style={{
                    background: 'var(--card-bg)',
                    borderColor: 'var(--card-border)'
                }}
            >
                <p className='text-sm flex items-start gap-2' style={{ color: 'var(--text-secondary)' }}>
                    <span className='text-base'>💡</span>
                    <span>
                        El tema seleccionado se aplicará automáticamente a todas las páginas del CRM y se guardará para tus próximas sesiones.
                    </span>
                </p>
            </div>
        </div>
    )
}
