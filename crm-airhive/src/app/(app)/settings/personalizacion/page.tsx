'use client'

import { useAuth } from '@/lib/auth'
import { useState } from 'react'
import { Palette } from 'lucide-react'
import QuoteManagementPanel, { type QuoteRow } from '@/components/QuoteManagementPanel'

export default function PersonalizacionPage() {
    const { profile } = useAuth()
    const [quotes, setQuotes] = useState<QuoteRow[]>([])
    const [quotesLoadError, setQuotesLoadError] = useState<string>('')

    return (
        <div className='p-8 max-w-5xl'>
            <div className='mb-8'>
                <div className='flex items-center gap-4 mb-2'>
                    <div className='ah-icon-card ah-icon-card-sm'>
                        <Palette size={22} strokeWidth={2.1} />
                    </div>
                    <h1 className='text-3xl font-bold' style={{ color: 'var(--text-primary)' }}>
                        Personalización
                    </h1>
                </div>
                <p className='text-base' style={{ color: 'var(--text-secondary)' }}>
                    Gestiona frases, solicitudes y contenido de personalización del CRM
                </p>
            </div>

            <div
                className='mb-8 p-4 rounded-lg border'
                style={{
                    background: 'var(--card-bg)',
                    borderColor: 'var(--card-border)'
                }}
            >
                <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>
                    El cambio de modo (claro, gris, oscuro) ahora se hace desde el botón de tema en la barra superior, junto a notificaciones y configuración.
                </p>
            </div>

            {profile && (
                <QuoteManagementPanel initialQuotes={quotes} initialLoadError={quotesLoadError} />
            )}
        </div>
    )
}
