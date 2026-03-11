'use client'

import { useAuth } from '@/lib/auth'
import { useState } from 'react'
import { MessageSquareQuote } from 'lucide-react'
import QuoteManagementPanel, { type QuoteRow } from '@/components/QuoteManagementPanel'

export default function FrasesPage() {
    const { profile } = useAuth()
    const [quotes] = useState<QuoteRow[]>([])
    const [quotesLoadError] = useState<string>('')

    return (
        <div className='p-8 max-w-5xl'>
            <div className='mb-8'>
                <div className='flex items-center gap-4 mb-2'>
                    <div className='ah-icon-card ah-icon-card-sm'>
                        <MessageSquareQuote size={22} strokeWidth={2.1} />
                    </div>
                    <h1 className='text-3xl font-bold' style={{ color: 'var(--text-primary)' }}>
                        Frases
                    </h1>
                </div>
                <p className='text-base' style={{ color: 'var(--text-secondary)' }}>
                    Gestiona repertorio y solicitudes de frases del CRM.
                </p>
            </div>

            {profile && (
                <QuoteManagementPanel initialQuotes={quotes} initialLoadError={quotesLoadError} />
            )}
        </div>
    )
}
