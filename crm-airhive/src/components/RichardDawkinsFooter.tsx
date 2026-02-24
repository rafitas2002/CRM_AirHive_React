'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { getActiveQuotes, toggleQuoteReaction } from '@/app/actions/quotes'

type QuoteRow = {
    id: number
    quote_text: string
    quote_author: string
    quote_source: string | null
    quote_author_context: string | null
    contributed_by_name: string
    is_active: boolean
    created_at: string
    likes_count?: number
    dislikes_count?: number
    current_user_reaction?: 'like' | 'dislike' | null
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
        created_at: new Date().toISOString(),
        likes_count: 0,
        dislikes_count: 0,
        current_user_reaction: null
    },
    {
        id: 2,
        quote_text: 'Si tu y yo nos queremos, no necesitamos a nadie más.',
        quote_author: 'Enjambre',
        quote_source: 'Frase atribuida por colaborador',
        quote_author_context: null,
        contributed_by_name: 'Rafael Sedas',
        is_active: true,
        created_at: new Date().toISOString(),
        likes_count: 0,
        dislikes_count: 0,
        current_user_reaction: null
    }
]

function normalizeLooseText(value: unknown) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
}

function isReactionsModuleUnavailableError(message: unknown) {
    const text = normalizeLooseText(message)
    return (
        (text.includes('reaccion') && text.includes('habilitad')) ||
        text.includes('crm_quote_reactions') ||
        text.includes('42p01') ||
        text.includes('relation') && text.includes('crm_quote_reactions') ||
        text.includes('modulo de reacciones')
    )
}

function pickRandomQuoteId(quotes: QuoteRow[], excludeId?: number | null) {
    if (!quotes.length) return null
    if (quotes.length === 1) return quotes[0]?.id ?? null
    const filtered = quotes.filter((q) => q.id !== excludeId)
    const pool = filtered.length > 0 ? filtered : quotes
    const next = pool[Math.floor(Math.random() * pool.length)]
    return next?.id ?? quotes[0]?.id ?? null
}

export default function RichardDawkinsFooter() {
    const [quotes, setQuotes] = useState<QuoteRow[]>(fallbackQuotes)
    const [selectedQuoteId, setSelectedQuoteId] = useState<number | null>(() => pickRandomQuoteId(fallbackQuotes))
    const [reactionError, setReactionError] = useState('')
    const [reactionsUnavailable, setReactionsUnavailable] = useState(false)
    const [isPendingReaction, startReactionTransition] = useTransition()

    useEffect(() => {
        let cancelled = false
        const loadQuotes = async () => {
            const result = await getActiveQuotes()
            if (!cancelled && result.success && (result.data || []).length > 0) {
                const nextQuotes = result.data as QuoteRow[]
                setQuotes(nextQuotes)
                setSelectedQuoteId(() => pickRandomQuoteId(nextQuotes))
            }
        }

        loadQuotes()
        return () => { cancelled = true }
    }, [])

    useEffect(() => {
        if (!quotes.length) return
        const delayMs = 26000 + Math.floor(Math.random() * 18000) // 26-44s, distinto por ventana
        const timer = window.setInterval(() => {
            setSelectedQuoteId((prev) => pickRandomQuoteId(quotes, prev))
        }, delayMs)
        return () => window.clearInterval(timer)
    }, [quotes])

    const randomQuoteData = useMemo(() => {
        if (!quotes.length) return fallbackQuotes[0]
        const selected = selectedQuoteId ? quotes.find((q) => q.id === selectedQuoteId) : null
        return selected || quotes[0] || fallbackQuotes[0]
    }, [quotes, selectedQuoteId])

    const isUserQuote = useMemo(() => {
        const source = normalizeLooseText(randomQuoteData.quote_source)
        const context = normalizeLooseText(randomQuoteData.quote_author_context)
        const contributedBy = normalizeLooseText(randomQuoteData.contributed_by_name)
        const author = normalizeLooseText(randomQuoteData.quote_author)
        return Boolean(randomQuoteData.is_active) && (
            Boolean((randomQuoteData as any).is_own_quote) ||
            source.includes('declaracion interna') ||
            context.includes('air hive') ||
            context.includes('airhive') ||
            (author.length > 0 && contributedBy.length > 0 && author === contributedBy) ||
            (contributedBy.length > 0 && !contributedBy.includes('sistema airhive') && author !== 'richard dawkins')
        )
    }, [randomQuoteData])

    const onReact = (reactionType: 'like' | 'dislike') => {
        setReactionError('')
        if (reactionsUnavailable) return
        if (!Number.isFinite(Number(randomQuoteData.id)) || Number(randomQuoteData.id) <= 0) {
            setReactionError('Reacciones no disponibles en frase de respaldo. Recarga para sincronizar frases reales.')
            return
        }
        startReactionTransition(async () => {
            const result = await toggleQuoteReaction(randomQuoteData.id, reactionType)
            if (!result.success || !result.data) {
                const message = String(result.error || 'No se pudo registrar la reacción')
                if (isReactionsModuleUnavailableError(message)) {
                    setReactionsUnavailable(true)
                    setReactionError('Reacciones temporalmente no disponibles en esta base de datos.')
                } else {
                    setReactionError(message)
                }
                return
            }
            setQuotes((prev) => prev.map((quote) => {
                if (quote.id !== randomQuoteData.id) return quote
                return {
                    ...quote,
                    likes_count: result.data.likes_count || 0,
                    dislikes_count: result.data.dislikes_count || 0,
                    current_user_reaction: result.data.current_user_reaction || null
                }
            }))
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('airhive:quote-reaction-updated', {
                    detail: {
                        quoteId: randomQuoteData.id,
                        likes_count: result.data.likes_count || 0,
                        dislikes_count: result.data.dislikes_count || 0,
                        current_user_reaction: result.data.current_user_reaction || null
                    }
                }))
            }
        })
    }

    return (
        <div className='flex flex-col items-center justify-center gap-6 select-none mt-12 mb-24'>
            <div className='w-32 h-1 bg-gradient-to-r from-transparent via-blue-600 to-transparent rounded-full opacity-30' />
            <div className='max-w-3xl px-8 text-center group'>
                <p
                    className='text-2xl font-medium italic leading-relaxed transition-all duration-700 group-hover:scale-[1.02] tracking-tight'
                    style={{ color: isUserQuote ? '#F3C979' : 'var(--text-secondary)' }}
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
                    <div className='pt-2 flex items-center justify-center gap-2'>
                        <button
                            type='button'
                            onClick={() => onReact('like')}
                            disabled={isPendingReaction || reactionsUnavailable}
                            className='inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 border text-[11px] font-bold transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed'
                            style={{
                                borderColor: randomQuoteData.current_user_reaction === 'like' ? '#5BC69E' : 'var(--card-border)',
                                background: randomQuoteData.current_user_reaction === 'like'
                                    ? 'color-mix(in srgb, #5BC69E 22%, transparent)'
                                    : 'transparent',
                                color: randomQuoteData.current_user_reaction === 'like' ? '#4FAE8A' : 'var(--text-secondary)',
                                cursor: (isPendingReaction || reactionsUnavailable) ? 'not-allowed' : 'pointer'
                            }}
                            onMouseEnter={(e) => {
                                if (isPendingReaction || reactionsUnavailable || randomQuoteData.current_user_reaction === 'like') return
                                const target = e.currentTarget
                                target.style.borderColor = '#67F0C0'
                                target.style.background = 'color-mix(in srgb, #67F0C0 34%, var(--card-bg))'
                                target.style.color = '#67F0C0'
                            }}
                            onMouseLeave={(e) => {
                                if (isPendingReaction || reactionsUnavailable || randomQuoteData.current_user_reaction === 'like') return
                                const target = e.currentTarget
                                target.style.borderColor = 'var(--card-border)'
                                target.style.background = 'transparent'
                                target.style.color = 'var(--text-secondary)'
                            }}
                        >
                            👍 {randomQuoteData.likes_count || 0}
                        </button>
                        <button
                            type='button'
                            onClick={() => onReact('dislike')}
                            disabled={isPendingReaction || reactionsUnavailable}
                            className='inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 border text-[11px] font-bold transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed'
                            style={{
                                borderColor: randomQuoteData.current_user_reaction === 'dislike' ? '#F08B8B' : 'var(--card-border)',
                                background: randomQuoteData.current_user_reaction === 'dislike'
                                    ? 'color-mix(in srgb, #F08B8B 22%, transparent)'
                                    : 'transparent',
                                color: randomQuoteData.current_user_reaction === 'dislike' ? '#CC5F5F' : 'var(--text-secondary)',
                                cursor: (isPendingReaction || reactionsUnavailable) ? 'not-allowed' : 'pointer'
                            }}
                            onMouseEnter={(e) => {
                                if (isPendingReaction || reactionsUnavailable || randomQuoteData.current_user_reaction === 'dislike') return
                                const target = e.currentTarget
                                target.style.borderColor = '#FF8B8B'
                                target.style.background = 'color-mix(in srgb, #FF8B8B 34%, var(--card-bg))'
                                target.style.color = '#FF8B8B'
                            }}
                            onMouseLeave={(e) => {
                                if (isPendingReaction || reactionsUnavailable || randomQuoteData.current_user_reaction === 'dislike') return
                                const target = e.currentTarget
                                target.style.borderColor = 'var(--card-border)'
                                target.style.background = 'transparent'
                                target.style.color = 'var(--text-secondary)'
                            }}
                        >
                            👎 {randomQuoteData.dislikes_count || 0}
                        </button>
                    </div>
                    {reactionError ? (
                        <p
                            className='text-[10px] font-bold mt-2'
                            style={{ color: reactionsUnavailable ? '#F3C979' : '#fb7185' }}
                        >
                            {reactionError}
                        </p>
                    ) : null}
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
