'use client'

import { useEffect, useMemo, useState } from 'react'
import { getActiveQuotes } from '@/app/actions/quotes'

type QuoteRow = {
    id: number
    quote_text: string
    quote_author: string
    quote_source: string | null
    quote_author_context: string | null
    contributed_by_name: string
    is_active: boolean
    created_at: string
}

const fallbackQuotes: QuoteRow[] = [
    {
        id: 1,
        quote_text: 'Si no sacrificas por lo que quieres, lo que quieres se convierte en sacrificio.',
        quote_author: 'Rafael Sedas',
        quote_source: 'Declaración interna en Air Hive',
        quote_author_context: 'Director Operativo y Director Financiero de Air Hive',
        contributed_by_name: 'Rafael Sedas',
        is_active: true,
        created_at: new Date().toISOString()
    },
    {
        id: 2,
        quote_text: 'Si tu y yo nos queremos, no necesitamos a nadie más.',
        quote_author: 'Enjambre',
        quote_source: 'Frase atribuida por colaborador',
        quote_author_context: null,
        contributed_by_name: 'Rafael Sedas',
        is_active: true,
        created_at: new Date().toISOString()
    }
]

export default function RichardDawkinsFooter() {
    const [quotes, setQuotes] = useState<QuoteRow[]>(fallbackQuotes)

    useEffect(() => {
        let cancelled = false
        const loadQuotes = async () => {
            const result = await getActiveQuotes()
            if (!cancelled && result.success && (result.data || []).length > 0) {
                setQuotes(result.data as QuoteRow[])
            }
        }

        loadQuotes()
        return () => { cancelled = true }
    }, [])

    const randomQuoteData = useMemo(() => {
        if (!quotes.length) return fallbackQuotes[0]
        return quotes[Math.floor(Math.random() * quotes.length)]
    }, [quotes])

    return (
        <div className='flex flex-col items-center justify-center gap-6 select-none mt-12 mb-24'>
            <div className='w-32 h-1 bg-gradient-to-r from-transparent via-blue-600 to-transparent rounded-full opacity-30' />
            <div className='max-w-3xl px-8 text-center group'>
                <p
                    className='text-2xl font-medium italic leading-relaxed transition-all duration-700 group-hover:scale-[1.02] tracking-tight'
                    style={{ color: 'var(--text-secondary)' }}
                >
                    "{randomQuoteData.quote_text}"
                </p>
                <div className='mt-8 flex flex-col items-center gap-2'>
                    <p className='text-[10px] font-black uppercase tracking-[0.5em] text-[#2048FF]'>
                        {randomQuoteData.quote_author}
                    </p>
                    {randomQuoteData.quote_author_context && (
                        <p className='text-[8px] font-bold uppercase tracking-[0.3em] opacity-45' style={{ color: 'var(--text-primary)' }}>
                            {randomQuoteData.quote_author_context}
                        </p>
                    )}
                    <p className='text-[10px] font-bold tracking-wide opacity-80' style={{ color: 'var(--text-secondary)' }}>
                        Aportada por: {randomQuoteData.contributed_by_name}
                    </p>
                    {randomQuoteData.quote_source && (
                        <p className='text-[10px] font-bold tracking-wide opacity-70' style={{ color: 'var(--text-secondary)' }}>
                            Fuente: {randomQuoteData.quote_source}
                        </p>
                    )}
                </div>
            </div>
            <div className='flex gap-4'>
                <div className='w-2 h-2 rounded-full bg-blue-500/10 animate-pulse' />
                <div className='w-2 h-2 rounded-full bg-blue-500/30 animate-pulse delay-75' />
                <div className='w-2 h-2 rounded-full bg-blue-500/10 animate-pulse delay-150' />
            </div>
        </div>
    )
}
