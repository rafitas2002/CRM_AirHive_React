'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
    Brain,
    CheckCircle2,
    Clock3,
    Eye,
    Infinity as InfinityIcon,
    Lightbulb,
    ListChecks,
    Pause,
    Play,
    RefreshCw,
    Timer,
    Trophy,
    XCircle
} from 'lucide-react'
import {
    AttemptTone,
    GameChallenge,
    ValidationResponse,
    hasConsonantsInOrder,
    normalizeCandidateWord
} from '@/lib/consonantWordGame'

const ROUND_SECONDS = 300
const INFINITE_STORAGE_KEY = 'airhive_consonant_game_infinite_v2'
const REQUEST_TIMEOUT_MS = 30000

type GameMode = 'timed' | 'infinite'
type FeedbackState = { tone: AttemptTone; message: string } | null

type InfiniteSavePayload = {
    consonants: string
    foundWords: string[]
    attemptCount: number
    finalized: boolean
}

type CatalogPayload = {
    words: string[]
    commonWords: string[]
}

const formatSeconds = (value: number) => {
    const safeValue = Math.max(0, value)
    const minutes = Math.floor(safeValue / 60).toString().padStart(2, '0')
    const seconds = (safeValue % 60).toString().padStart(2, '0')
    return `${minutes}:${seconds}`
}

const getFeedbackClasses = (tone: AttemptTone) => {
    if (tone === 'success') return 'border-emerald-300/50 bg-emerald-500/10 text-emerald-100'
    if (tone === 'error') return 'border-rose-300/50 bg-rose-500/12 text-rose-100'
    return 'border-sky-300/50 bg-sky-500/10 text-sky-100'
}

const sortWords = (words: string[]) => [...words].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))

const fetchJsonWithTimeout = async ({
    url,
    init,
    timeoutMessage,
    timeoutMs = REQUEST_TIMEOUT_MS
}: {
    url: string
    init: RequestInit
    timeoutMessage: string
    timeoutMs?: number
}) => {
    const controller = new AbortController()
    const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs)

    try {
        const response = await fetch(url, { ...init, signal: controller.signal })
        const contentType = String(response.headers.get('content-type') || '').toLowerCase()
        let payload: unknown = null

        if (contentType.includes('application/json')) {
            payload = await response.json().catch(() => null)
        } else {
            const rawText = await response.text().catch(() => '')
            if (!response.ok) {
                throw new Error(`Respuesta inesperada del servidor (${response.status}).`)
            }
            if (rawText.includes('/login') || rawText.toLowerCase().includes('<html')) {
                throw new Error('La sesion parece expirada o invalida. Recarga la pagina e inicia sesion de nuevo.')
            }
            throw new Error('La respuesta del servidor no fue JSON valido.')
        }

        return { response, payload }
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            throw new Error(timeoutMessage)
        }
        throw error
    } finally {
        globalThis.clearTimeout(timeoutId)
    }
}

const fetchChallenge = async ({
    exclude,
    consonants
}: {
    exclude?: string
    consonants?: string
} = {}): Promise<GameChallenge> => {
    const params = new URLSearchParams({ action: 'challenge' })
    if (exclude) params.set('exclude', exclude)
    if (consonants) params.set('consonants', consonants)
    const { response, payload } = await fetchJsonWithTimeout({
        url: `/api/games/consonants?${params.toString()}`,
        init: { method: 'GET', cache: 'no-store' },
        timeoutMessage: 'El servidor tardo demasiado en cargar el reto. Intenta de nuevo.'
    })
    if (!response.ok || !payload?.ok || !payload?.challenge) {
        throw new Error(payload?.message || 'No se pudo cargar el reto.')
    }
    return payload.challenge as GameChallenge
}

const fetchCatalog = async (consonants: string): Promise<CatalogPayload> => {
    const params = new URLSearchParams({ action: 'catalog', consonants })
    const { response, payload } = await fetchJsonWithTimeout({
        url: `/api/games/consonants?${params.toString()}`,
        init: { method: 'GET', cache: 'no-store' },
        timeoutMessage: 'El servidor tardo demasiado en cargar el catalogo.'
    })
    if (!response.ok || !payload?.ok || !Array.isArray(payload?.words)) {
        throw new Error(payload?.message || 'No se pudo cargar el catalogo.')
    }
    return {
        words: payload.words as string[],
        commonWords: Array.isArray(payload?.commonWords) ? payload.commonWords as string[] : []
    }
}

const validateWord = async ({
    consonants,
    word
}: {
    consonants: string
    word: string
}): Promise<ValidationResponse> => {
    const { response, payload } = await fetchJsonWithTimeout({
        url: '/api/games/consonants',
        init: {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ consonants, word })
        },
        timeoutMessage: 'La validacion tardo demasiado. Intenta nuevamente.'
    })
    if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || 'No se pudo validar la palabra.')
    }
    return {
        tone: payload.tone as AttemptTone,
        message: String(payload.message || ''),
        normalizedWord: payload.normalizedWord ? String(payload.normalizedWord) : null
    }
}

const sanitizeInfiniteFoundWords = (foundWords: string[], consonants: string) => Array.from(
    new Set(
        foundWords
            .map((entry) => normalizeCandidateWord(entry))
            .filter((entry) => entry && hasConsonantsInOrder(entry, consonants))
    )
)

export default function ConsonantWordGameWindow() {
    const [mode, setMode] = useState<GameMode>('timed')

    const [timedChallenge, setTimedChallenge] = useState<GameChallenge | null>(null)
    const [timedLoading, setTimedLoading] = useState(true)
    const [timedAttempt, setTimedAttempt] = useState('')
    const [timedFoundWords, setTimedFoundWords] = useState<string[]>([])
    const [timedFeedback, setTimedFeedback] = useState<FeedbackState>(null)
    const [timedAttemptCount, setTimedAttemptCount] = useState(0)
    const [timedTimeLeft, setTimedTimeLeft] = useState(ROUND_SECONDS)
    const [timedPaused, setTimedPaused] = useState(false)
    const [timedSurrendered, setTimedSurrendered] = useState(false)
    const [timedRoundKey, setTimedRoundKey] = useState(1)
    const [timedShowCatalog, setTimedShowCatalog] = useState(false)
    const [timedCatalogWords, setTimedCatalogWords] = useState<string[]>([])
    const [timedCatalogCommonWords, setTimedCatalogCommonWords] = useState<string[]>([])
    const [timedCatalogLoading, setTimedCatalogLoading] = useState(false)
    const [timedSubmitting, setTimedSubmitting] = useState(false)

    const [infiniteChallenge, setInfiniteChallenge] = useState<GameChallenge | null>(null)
    const [infiniteLoading, setInfiniteLoading] = useState(true)
    const [infiniteAttempt, setInfiniteAttempt] = useState('')
    const [infiniteFoundWords, setInfiniteFoundWords] = useState<string[]>([])
    const [infiniteFeedback, setInfiniteFeedback] = useState<FeedbackState>(null)
    const [infiniteAttemptCount, setInfiniteAttemptCount] = useState(0)
    const [infiniteFinalized, setInfiniteFinalized] = useState(false)
    const [infiniteCatalogWords, setInfiniteCatalogWords] = useState<string[]>([])
    const [infiniteCatalogCommonWords, setInfiniteCatalogCommonWords] = useState<string[]>([])
    const [infiniteCatalogLoading, setInfiniteCatalogLoading] = useState(false)
    const [infiniteSubmitting, setInfiniteSubmitting] = useState(false)
    const [infiniteHydrated, setInfiniteHydrated] = useState(false)

    const timedFoundSet = useMemo(() => new Set(timedFoundWords), [timedFoundWords])
    const timedCompleted = timedChallenge ? timedFoundWords.length >= timedChallenge.wordCount : false
    const timedExpired = timedTimeLeft <= 0
    const timedFinished = !!timedChallenge && (timedCompleted || timedExpired || timedSurrendered)
    const timedAccuracy = timedAttemptCount > 0 ? Math.round((timedFoundWords.length / timedAttemptCount) * 100) : 0
    const timedScore = useMemo(() => {
        const speedBonus = timedFinished ? 0 : timedTimeLeft
        return timedFoundWords.length * 10 + speedBonus
    }, [timedFoundWords.length, timedFinished, timedTimeLeft])

    const infiniteFoundSet = useMemo(() => new Set(infiniteFoundWords), [infiniteFoundWords])
    const infiniteCompleted = infiniteChallenge ? infiniteFoundWords.length >= infiniteChallenge.wordCount : false
    const infiniteFinished = infiniteFinalized || infiniteCompleted
    const infiniteAccuracy = infiniteAttemptCount > 0 ? Math.round((infiniteFoundWords.length / infiniteAttemptCount) * 100) : 0
    const infiniteScore = infiniteFoundWords.length * 10

    useEffect(() => {
        let cancelled = false

        const loadInitialState = async () => {
            try {
                setTimedLoading(true)
                const timed = await fetchChallenge()
                if (!cancelled) {
                    setTimedChallenge(timed)
                    setTimedTimeLeft(ROUND_SECONDS)
                }
            } catch (error) {
                if (!cancelled) {
                    setTimedFeedback({
                        tone: 'error',
                        message: error instanceof Error ? error.message : 'No se pudo cargar el modo tiempo.'
                    })
                }
            } finally {
                if (!cancelled) setTimedLoading(false)
            }

            try {
                setInfiniteLoading(true)
                let saved: InfiniteSavePayload | null = null
                if (typeof window !== 'undefined') {
                    try {
                        const raw = localStorage.getItem(INFINITE_STORAGE_KEY)
                        if (raw) saved = JSON.parse(raw) as InfiniteSavePayload
                    } catch {
                        saved = null
                    }
                }

                const preferredConsonants = saved?.consonants ? String(saved.consonants) : ''
                const challenge = preferredConsonants
                    ? await fetchChallenge({ consonants: preferredConsonants }).catch(() => fetchChallenge())
                    : await fetchChallenge()

                if (cancelled) return

                const foundWords = saved
                    ? sanitizeInfiniteFoundWords(Array.isArray(saved.foundWords) ? saved.foundWords : [], challenge.consonants)
                    : []

                setInfiniteChallenge(challenge)
                setInfiniteFoundWords(sortWords(foundWords))
                setInfiniteAttemptCount(saved ? Math.max(0, Number(saved.attemptCount || 0)) : 0)
                setInfiniteFinalized(saved ? Boolean(saved.finalized) : false)
                setInfiniteHydrated(true)
            } catch (error) {
                if (!cancelled) {
                    setInfiniteFeedback({
                        tone: 'error',
                        message: error instanceof Error ? error.message : 'No se pudo cargar el modo infinito.'
                    })
                    setInfiniteHydrated(true)
                }
            } finally {
                if (!cancelled) setInfiniteLoading(false)
            }
        }

        void loadInitialState()

        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        if (mode !== 'timed') return
        if (!timedChallenge || timedFinished || timedPaused) return
        const timerId = window.setInterval(() => {
            setTimedTimeLeft((current) => {
                if (current <= 1) return 0
                return current - 1
            })
        }, 1000)
        return () => window.clearInterval(timerId)
    }, [mode, timedChallenge, timedFinished, timedPaused, timedRoundKey])

    useEffect(() => {
        if (!infiniteHydrated || !infiniteChallenge || typeof window === 'undefined') return
        const payload: InfiniteSavePayload = {
            consonants: infiniteChallenge.consonants,
            foundWords: infiniteFoundWords,
            attemptCount: infiniteAttemptCount,
            finalized: infiniteFinalized
        }
        try {
            localStorage.setItem(INFINITE_STORAGE_KEY, JSON.stringify(payload))
        } catch {
            // noop
        }
    }, [infiniteHydrated, infiniteChallenge, infiniteFoundWords, infiniteAttemptCount, infiniteFinalized])

    const retryTimedChallengeLoad = async () => {
        try {
            setTimedLoading(true)
            setTimedFeedback(null)
            const challenge = await fetchChallenge()
            setTimedChallenge(challenge)
            setTimedAttempt('')
            setTimedFoundWords([])
            setTimedAttemptCount(0)
            setTimedTimeLeft(ROUND_SECONDS)
            setTimedPaused(false)
            setTimedSurrendered(false)
            setTimedRoundKey((prev) => prev + 1)
            setTimedShowCatalog(false)
            setTimedCatalogWords([])
            setTimedCatalogCommonWords([])
        } catch (error) {
            setTimedFeedback({
                tone: 'error',
                message: error instanceof Error ? error.message : 'No se pudo cargar el modo tiempo.'
            })
        } finally {
            setTimedLoading(false)
        }
    }

    const retryInfiniteChallengeLoad = async () => {
        try {
            setInfiniteLoading(true)
            setInfiniteFeedback(null)
            const challenge = await fetchChallenge()
            setInfiniteChallenge(challenge)
            setInfiniteAttempt('')
            setInfiniteFoundWords([])
            setInfiniteAttemptCount(0)
            setInfiniteFinalized(false)
            setInfiniteCatalogWords([])
            setInfiniteCatalogCommonWords([])
        } catch (error) {
            setInfiniteFeedback({
                tone: 'error',
                message: error instanceof Error ? error.message : 'No se pudo cargar el modo infinito.'
            })
        } finally {
            setInfiniteLoading(false)
        }
    }

    const startTimedRound = async () => {
        if (!timedChallenge) return
        try {
            setTimedLoading(true)
            const next = await fetchChallenge({ exclude: timedChallenge.consonants })
            setTimedChallenge(next)
            setTimedAttempt('')
            setTimedFoundWords([])
            setTimedFeedback(null)
            setTimedAttemptCount(0)
            setTimedTimeLeft(ROUND_SECONDS)
            setTimedPaused(false)
            setTimedSurrendered(false)
            setTimedRoundKey((prev) => prev + 1)
            setTimedShowCatalog(false)
            setTimedCatalogWords([])
            setTimedCatalogCommonWords([])
        } catch (error) {
            setTimedFeedback({
                tone: 'error',
                message: error instanceof Error ? error.message : 'No se pudo iniciar una nueva ronda.'
            })
        } finally {
            setTimedLoading(false)
        }
    }

    const switchInfiniteConsonants = async () => {
        if (!infiniteChallenge) return
        try {
            setInfiniteLoading(true)
            const next = await fetchChallenge({ exclude: infiniteChallenge.consonants })
            setInfiniteChallenge(next)
            setInfiniteAttempt('')
            setInfiniteFoundWords([])
            setInfiniteFeedback(null)
            setInfiniteAttemptCount(0)
            setInfiniteFinalized(false)
            setInfiniteCatalogWords([])
            setInfiniteCatalogCommonWords([])
        } catch (error) {
            setInfiniteFeedback({
                tone: 'error',
                message: error instanceof Error ? error.message : 'No se pudieron cambiar las consonantes.'
            })
        } finally {
            setInfiniteLoading(false)
        }
    }

    const resumeInfiniteSession = () => {
        if (infiniteCompleted) return
        setInfiniteFinalized(false)
        setInfiniteFeedback(null)
    }

    const resetInfiniteSession = async () => {
        if (!infiniteChallenge) return
        try {
            setInfiniteLoading(true)
            const next = await fetchChallenge({ exclude: infiniteChallenge.consonants })
            setInfiniteChallenge(next)
            setInfiniteAttempt('')
            setInfiniteFoundWords([])
            setInfiniteFeedback(null)
            setInfiniteAttemptCount(0)
            setInfiniteFinalized(false)
            setInfiniteCatalogWords([])
            setInfiniteCatalogCommonWords([])
            if (typeof window !== 'undefined') {
                try {
                    localStorage.removeItem(INFINITE_STORAGE_KEY)
                } catch {
                    // noop
                }
            }
        } catch (error) {
            setInfiniteFeedback({
                tone: 'error',
                message: error instanceof Error ? error.message : 'No se pudo reiniciar la sesion.'
            })
        } finally {
            setInfiniteLoading(false)
        }
    }

    const submitTimedAttempt = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (!timedChallenge || timedFinished || timedPaused || timedSubmitting) return

        setTimedSubmitting(true)
        setTimedAttemptCount((prev) => prev + 1)
        try {
            const result = await validateWord({
                consonants: timedChallenge.consonants,
                word: timedAttempt
            })
            if (result.tone === 'success' && result.normalizedWord && timedFoundSet.has(result.normalizedWord)) {
                setTimedFeedback({
                    tone: 'info',
                    message: 'Esa palabra ya estaba registrada en esta ronda.'
                })
                return
            }
            setTimedFeedback({ tone: result.tone, message: result.message })
            if (result.tone === 'success' && result.normalizedWord) {
                setTimedFoundWords((current) => sortWords([...current, result.normalizedWord as string]))
                setTimedAttempt('')
            }
        } catch (error) {
            setTimedFeedback({
                tone: 'error',
                message: error instanceof Error ? error.message : 'No se pudo validar la palabra.'
            })
        } finally {
            setTimedSubmitting(false)
        }
    }

    const ensureTimedCatalogLoaded = async () => {
        if (!timedChallenge || timedCatalogLoading || timedCatalogWords.length > 0) return
        try {
            setTimedCatalogLoading(true)
            const catalog = await fetchCatalog(timedChallenge.consonants)
            setTimedCatalogWords(catalog.words)
            setTimedCatalogCommonWords(catalog.commonWords)
        } catch (error) {
            setTimedFeedback({
                tone: 'error',
                message: error instanceof Error ? error.message : 'No se pudo cargar el catalogo de la ronda.'
            })
        } finally {
            setTimedCatalogLoading(false)
        }
    }

    const toggleTimedPause = () => {
        if (!timedChallenge || timedFinished) return
        setTimedPaused((current) => !current)
        setTimedFeedback(null)
    }

    const surrenderTimedRound = async () => {
        if (!timedChallenge || timedFinished) return
        setTimedPaused(false)
        setTimedSurrendered(true)
        setTimedShowCatalog(true)
        setTimedFeedback({
            tone: 'info',
            message: 'Ronda rendida. Puedes revisar el catalogo completo.'
        })
        await ensureTimedCatalogLoaded()
    }

    const submitInfiniteAttempt = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (!infiniteChallenge || infiniteFinished || infiniteSubmitting) return

        setInfiniteSubmitting(true)
        setInfiniteAttemptCount((prev) => prev + 1)
        try {
            const result = await validateWord({
                consonants: infiniteChallenge.consonants,
                word: infiniteAttempt
            })
            if (result.tone === 'success' && result.normalizedWord && infiniteFoundSet.has(result.normalizedWord)) {
                setInfiniteFeedback({
                    tone: 'info',
                    message: 'Esa palabra ya estaba registrada en esta sesion.'
                })
                return
            }
            setInfiniteFeedback({ tone: result.tone, message: result.message })
            if (result.tone === 'success' && result.normalizedWord) {
                setInfiniteFoundWords((current) => sortWords([...current, result.normalizedWord as string]))
                setInfiniteAttempt('')
            }
        } catch (error) {
            setInfiniteFeedback({
                tone: 'error',
                message: error instanceof Error ? error.message : 'No se pudo validar la palabra.'
            })
        } finally {
            setInfiniteSubmitting(false)
        }
    }

    const toggleTimedCatalog = async () => {
        if (!timedChallenge) return
        if (timedShowCatalog) {
            setTimedShowCatalog(false)
            return
        }
        setTimedShowCatalog(true)
        await ensureTimedCatalogLoaded()
    }

    const finalizeInfinite = async () => {
        if (!infiniteChallenge) return
        setInfiniteFinalized(true)
        if (infiniteCatalogWords.length > 0) return
        try {
            setInfiniteCatalogLoading(true)
            const catalog = await fetchCatalog(infiniteChallenge.consonants)
            setInfiniteCatalogWords(catalog.words)
            setInfiniteCatalogCommonWords(catalog.commonWords)
        } catch (error) {
            setInfiniteFeedback({
                tone: 'error',
                message: error instanceof Error ? error.message : 'No se pudo cargar el catalogo de la sesion.'
            })
        } finally {
            setInfiniteCatalogLoading(false)
        }
    }

    const renderConsonantCards = (consonants: string) => (
        <div className='grid md:grid-cols-3 gap-4'>
            {consonants.split('').map((letter, index) => (
                <div
                    key={`${consonants}-${letter}-${index}`}
                    className='rounded-3xl border px-6 py-5 text-center shadow-sm'
                    style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}
                >
                    <p className='text-[10px] uppercase tracking-[0.18em] font-black mb-1' style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
                        Consonante {index + 1}
                    </p>
                    <p className='text-5xl font-black leading-none text-[#2048FF]'>{letter}</p>
                </div>
            ))}
        </div>
    )

    const renderFoundWords = ({
        foundWords,
        challenge
    }: {
        foundWords: string[]
        challenge: GameChallenge
    }) => (
        <div className='rounded-3xl border p-5 space-y-4' style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}>
            <div className='flex items-center justify-between gap-2'>
                <h2 className='text-sm font-black uppercase tracking-[0.14em]' style={{ color: 'var(--text-secondary)' }}>
                    Palabras registradas
                </h2>
                <span className='text-xs font-black rounded-xl px-2 py-1 border' style={{ borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}>
                    {foundWords.length} / {challenge.wordCount} posibles
                </span>
            </div>
            {foundWords.length > 0 ? (
                <div className='flex flex-wrap gap-2 max-h-[260px] overflow-auto custom-scrollbar pr-1'>
                    {foundWords.map((word) => (
                        <span
                            key={`found-${challenge.consonants}-${word}`}
                            className='inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold border'
                            style={{ borderColor: 'rgba(16,185,129,0.4)', background: 'rgba(16,185,129,0.15)', color: 'var(--text-primary)' }}
                        >
                            <CheckCircle2 size={13} className='text-emerald-400' />
                            {word}
                        </span>
                    ))}
                </div>
            ) : (
                <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>
                    Aun no hay aciertos. Puedes escribir cualquier palabra real con esas consonantes en orden.
                </p>
            )}
        </div>
    )

    const renderRules = (consonants: string, accuracy: number, foundCount: number, attemptCount: number) => (
        <aside className='rounded-3xl border p-5 space-y-3' style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}>
            <h2 className='text-sm font-black uppercase tracking-[0.14em]' style={{ color: 'var(--text-secondary)' }}>
                Reglas
            </h2>
            <div className='space-y-2 text-sm' style={{ color: 'var(--text-primary)' }}>
                <p>1. Debe mantener el orden de consonantes ({consonants}).</p>
                <p>2. Se valida contra diccionario real del juego (sin limite de respuestas preseleccionadas).</p>
                <p>3. Puedes usar sustantivos, nombres y lugares si estan reconocidos por diccionario.</p>
                <p>4. Si escribes una conjugacion verbal reconocida, se registra automaticamente su infinitivo (excepto formas terminadas en &quot;emos&quot;).</p>
                <p>5. Si escribes un plural reconocido, se registra automaticamente en singular.</p>
                <p>6. Variantes derivadas pueden registrarse como una palabra base para contar solo una vez.</p>
                <p>7. Variantes en masculino/femenino se registran como una sola palabra base.</p>
            </div>
            <div className='pt-2 border-t' style={{ borderColor: 'var(--card-border)' }}>
                <p className='text-xs font-bold uppercase tracking-[0.14em] mb-1' style={{ color: 'var(--text-secondary)' }}>
                    Precision
                </p>
                <p className='text-2xl font-black text-[#2048FF]'>{accuracy}%</p>
                <p className='text-xs mt-1' style={{ color: 'var(--text-secondary)' }}>
                    {foundCount} aciertos en {attemptCount} intentos
                </p>
            </div>
        </aside>
    )

    const renderCatalog = ({
        consonants,
        words,
        commonWords,
        loading,
        foundWords
    }: {
        consonants: string
        words: string[]
        commonWords: string[]
        loading: boolean
        foundWords: string[]
    }) => {
        const foundWordsSet = new Set(foundWords.map((word) => normalizeCandidateWord(word)))

        const renderCatalogWord = (word: string, keyPrefix: string) => {
            const normalizedWord = normalizeCandidateWord(word)
            const isFound = foundWordsSet.has(normalizedWord)
            return (
                <span
                    key={`${keyPrefix}-${consonants}-${word}`}
                    className='inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold border'
                    style={isFound
                        ? {
                            borderColor: 'rgba(16,185,129,0.45)',
                            color: '#16a34a',
                            background: 'rgba(16,185,129,0.14)'
                        }
                        : {
                            borderColor: 'var(--card-border)',
                            color: 'var(--text-primary)',
                            background: 'var(--card-bg)'
                        }}
                >
                    {isFound && <CheckCircle2 size={12} className='text-emerald-500' />}
                    {word}
                </span>
            )
        }

        return (
        <div className='rounded-2xl border px-5 py-4 space-y-3' style={{ borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}>
            <div className='flex items-center gap-2'>
                <ListChecks size={16} className='text-cyan-400' />
                <p className='font-black text-sm uppercase tracking-[0.14em]' style={{ color: 'var(--text-primary)' }}>
                    Catalogo completo permitido para {consonants}
                </p>
            </div>
            <p className='text-[11px] font-semibold' style={{ color: 'var(--text-secondary)' }}>
                Las palabras que ya registraste correctamente aparecen en verde.
            </p>
            {loading ? (
                <p className='text-sm font-semibold' style={{ color: 'var(--text-secondary)' }}>
                    Cargando catalogo...
                </p>
            ) : (
                <div className='space-y-4'>
                    <div className='rounded-xl border px-3 py-3' style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
                        <div className='flex items-center justify-between gap-3 mb-2'>
                            <p className='text-xs font-black uppercase tracking-[0.12em]' style={{ color: 'var(--text-primary)' }}>
                                Palabras comunes
                            </p>
                            <span className='text-[11px] font-semibold' style={{ color: 'var(--text-secondary)' }}>
                                {commonWords.length} de {words.length}
                            </span>
                        </div>
                        {commonWords.length > 0 ? (
                            <div className='max-h-[200px] overflow-auto custom-scrollbar pr-1'>
                                <div className='flex flex-wrap gap-2'>
                                    {commonWords.map((word) => renderCatalogWord(word, 'catalog-common'))}
                                </div>
                            </div>
                        ) : (
                            <p className='text-xs font-semibold' style={{ color: 'var(--text-secondary)' }}>
                                No se detectaron palabras comunes para estas consonantes.
                            </p>
                        )}
                    </div>

                    <div className='rounded-xl border px-3 py-3' style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
                        <div className='flex items-center justify-between gap-3 mb-2'>
                            <p className='text-xs font-black uppercase tracking-[0.12em]' style={{ color: 'var(--text-primary)' }}>
                                Catalogo completo
                            </p>
                            <span className='text-[11px] font-semibold' style={{ color: 'var(--text-secondary)' }}>
                                {words.length} palabras
                            </span>
                        </div>
                        <div className='max-h-[320px] overflow-auto custom-scrollbar pr-1'>
                            <div className='flex flex-wrap gap-2'>
                                {words.map((word) => renderCatalogWord(word, 'catalog-all'))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
    }

    const timedChallengeReady = !!timedChallenge
    const infiniteChallengeReady = !!infiniteChallenge

    return (
        <section className='min-h-full w-full px-6 py-8'>
            <div className='max-w-6xl mx-auto space-y-6'>
                <header className='rounded-[30px] border shadow-sm overflow-hidden' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                    <div className='px-7 py-6 border-b flex flex-col xl:flex-row xl:items-center xl:justify-between gap-5' style={{ borderColor: 'var(--card-border)' }}>
                        <div className='flex items-start gap-4'>
                            <div className='ah-icon-card ah-icon-card-sm mt-1'>
                                <Brain size={20} strokeWidth={2} />
                            </div>
                            <div>
                                <h1 className='text-3xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>
                                    Consonantes en Orden
                                </h1>
                                <p className='font-medium mt-1' style={{ color: 'var(--text-secondary)' }}>
                                    Valida palabras reales del diccionario, no listas cerradas.
                                </p>
                            </div>
                        </div>

                        <div className='flex flex-wrap items-center gap-3'>
                            <button
                                type='button'
                                onClick={() => setMode('timed')}
                                className={`px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-[0.12em] border cursor-pointer transition-colors inline-flex items-center gap-2 ${
                                    mode === 'timed' ? 'bg-[#2048FF] text-white border-[#2048FF]' : 'text-[var(--text-primary)]'
                                }`}
                                style={mode === 'timed' ? undefined : { background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}
                            >
                                <Timer size={14} />
                                Modo Tiempo
                            </button>

                            <button
                                type='button'
                                onClick={() => setMode('infinite')}
                                className={`px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-[0.12em] border cursor-pointer transition-colors inline-flex items-center gap-2 ${
                                    mode === 'infinite' ? 'bg-[#2048FF] text-white border-[#2048FF]' : 'text-[var(--text-primary)]'
                                }`}
                                style={mode === 'infinite' ? undefined : { background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}
                            >
                                <InfinityIcon size={14} />
                                Modo Infinito
                            </button>
                        </div>
                    </div>

                    {mode === 'timed' && (
                        <div className='px-7 py-6 space-y-6'>
                            {timedLoading ? (
                                <div className='rounded-2xl border px-4 py-3 text-sm font-semibold' style={{ borderColor: 'var(--card-border)', color: 'var(--text-secondary)', background: 'var(--hover-bg)' }}>
                                    Cargando reto...
                                </div>
                            ) : !timedChallengeReady ? (
                                <div className='rounded-2xl border px-4 py-4 space-y-3' style={{ borderColor: 'rgba(244,63,94,0.45)', color: 'var(--text-primary)', background: 'rgba(244,63,94,0.08)' }}>
                                    <p className='text-sm font-semibold'>
                                        {timedFeedback?.message || 'No se pudo cargar el reto de modo tiempo.'}
                                    </p>
                                    <button
                                        type='button'
                                        onClick={() => void retryTimedChallengeLoad()}
                                        className='rounded-2xl px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-white bg-[#2048FF] hover:bg-[#1736c9] transition-colors cursor-pointer'
                                    >
                                        Reintentar carga
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className='flex flex-wrap items-center gap-3'>
                                        <div className='px-4 py-2 rounded-2xl border flex items-center gap-2 text-sm font-bold' style={{ borderColor: 'var(--card-border)', color: 'var(--text-primary)', background: 'var(--hover-bg)' }}>
                                            <Clock3 size={15} className='text-orange-400' />
                                            Tiempo: {formatSeconds(timedTimeLeft)}
                                        </div>
                                        {timedPaused && !timedFinished && (
                                            <div className='px-4 py-2 rounded-2xl border text-sm font-bold inline-flex items-center gap-2' style={{ borderColor: 'rgba(245,158,11,0.5)', color: 'var(--text-primary)', background: 'rgba(245,158,11,0.12)' }}>
                                                <Pause size={14} className='text-amber-400' />
                                                Pausado
                                            </div>
                                        )}
                                        <div className='px-4 py-2 rounded-2xl border text-sm font-bold inline-flex items-center gap-2' style={{ borderColor: 'var(--card-border)', color: 'var(--text-primary)', background: 'var(--hover-bg)' }}>
                                            <Trophy size={14} className='text-yellow-400' />
                                            Puntos: {timedScore}
                                        </div>
                                        <button
                                            type='button'
                                            onClick={() => void startTimedRound()}
                                            className='px-4 py-2 rounded-2xl text-sm font-black uppercase tracking-wider text-white bg-[#2048FF] hover:bg-[#1736c9] transition-colors inline-flex items-center gap-2 cursor-pointer'
                                        >
                                            <RefreshCw size={14} />
                                            Nueva ronda
                                        </button>
                                        <button
                                            type='button'
                                            onClick={toggleTimedPause}
                                            disabled={timedFinished}
                                            className='px-4 py-2 rounded-2xl text-sm font-black uppercase tracking-wider border inline-flex items-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed'
                                            style={{ borderColor: 'var(--card-border)', color: 'var(--text-primary)', background: 'var(--card-bg)' }}
                                        >
                                            {timedPaused ? <Play size={14} /> : <Pause size={14} />}
                                            {timedPaused ? 'Reanudar' : 'Pausar'}
                                        </button>
                                        <button
                                            type='button'
                                            onClick={() => void surrenderTimedRound()}
                                            disabled={timedFinished}
                                            className='px-4 py-2 rounded-2xl text-sm font-black uppercase tracking-wider border inline-flex items-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed'
                                            style={{ borderColor: 'rgba(244,63,94,0.45)', color: 'var(--text-primary)', background: 'rgba(244,63,94,0.1)' }}
                                        >
                                            <Eye size={14} />
                                            Rendirse y ver catalogo
                                        </button>
                                    </div>

                                    {renderConsonantCards(timedChallenge.consonants)}

                                    <div className='rounded-2xl border px-4 py-4' style={{ borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}>
                                        <p className='text-xs font-black uppercase tracking-[0.12em]' style={{ color: 'var(--text-secondary)' }}>
                                            Palabras reconocidas para este reto
                                        </p>
                                        <p className='text-sm font-semibold mt-1' style={{ color: 'var(--text-primary)' }}>
                                            {timedChallenge.wordCount} palabras validas detectadas para {timedChallenge.consonants}.
                                        </p>
                                    </div>

                                    <form onSubmit={(event) => void submitTimedAttempt(event)} className='flex flex-col md:flex-row gap-3'>
                                        <input
                                            value={timedAttempt}
                                            onChange={(event) => setTimedAttempt(event.target.value)}
                                            placeholder='Escribe una palabra real'
                                            className='flex-1 rounded-2xl border px-4 py-3 text-base font-semibold outline-none focus:ring-2 focus:ring-blue-500/60'
                                            style={{ borderColor: 'var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                                            disabled={timedFinished || timedPaused || timedSubmitting}
                                            autoComplete='off'
                                        />
                                        <button
                                            type='submit'
                                            className='rounded-2xl px-6 py-3 text-sm font-black uppercase tracking-[0.12em] text-white bg-[#2048FF] hover:bg-[#1736c9] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer transition-colors'
                                            disabled={timedFinished || timedPaused || timedSubmitting}
                                        >
                                            {timedSubmitting ? 'Validando...' : 'Validar'}
                                        </button>
                                    </form>

                                    {timedFeedback && (
                                        <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${getFeedbackClasses(timedFeedback.tone)}`}>
                                            {timedFeedback.message}
                                        </div>
                                    )}

                                    <div className='grid lg:grid-cols-[1.35fr_1fr] gap-4'>
                                        {renderFoundWords({ foundWords: timedFoundWords, challenge: timedChallenge })}
                                        {renderRules(timedChallenge.consonants, timedAccuracy, timedFoundWords.length, timedAttemptCount)}
                                    </div>

                                    {timedFinished && (
                                        <div className='rounded-2xl border px-5 py-4 space-y-3' style={{ borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}>
                                            <div className='flex items-center gap-2'>
                                                {timedCompleted ? (
                                                    <CheckCircle2 size={18} className='text-emerald-500' />
                                                ) : timedSurrendered ? (
                                                    <Eye size={18} className='text-amber-500' />
                                                ) : (
                                                    <XCircle size={18} className='text-rose-500' />
                                                )}
                                                <p className='font-black text-sm uppercase tracking-[0.14em]' style={{ color: 'var(--text-primary)' }}>
                                                    {timedCompleted ? 'Ronda completada' : timedSurrendered ? 'Ronda rendida' : 'Tiempo terminado'}
                                                </p>
                                            </div>
                                            <div className='flex items-start gap-2 text-sm' style={{ color: 'var(--text-primary)' }}>
                                                <Lightbulb size={16} className='text-amber-500 mt-0.5' />
                                                <p>
                                                    Puedes revisar todo el catalogo permitido para estas consonantes.
                                                </p>
                                            </div>

                                            <button
                                                type='button'
                                                onClick={() => void toggleTimedCatalog()}
                                                className='rounded-2xl px-4 py-2 text-xs font-black uppercase tracking-[0.12em] inline-flex items-center gap-2 border'
                                                style={{ borderColor: 'var(--card-border)', color: 'var(--text-primary)', background: 'var(--card-bg)' }}
                                            >
                                                <Eye size={14} />
                                                {timedShowCatalog ? 'Ocultar catalogo' : 'Ver catalogo completo'}
                                            </button>
                                        </div>
                                    )}

                                    {timedShowCatalog && renderCatalog({
                                        consonants: timedChallenge.consonants,
                                        words: timedCatalogWords,
                                        commonWords: timedCatalogCommonWords,
                                        loading: timedCatalogLoading,
                                        foundWords: timedFoundWords
                                    })}
                                </>
                            )}
                        </div>
                    )}

                    {mode === 'infinite' && (
                        <div className='px-7 py-6 space-y-6'>
                            {infiniteLoading ? (
                                <div className='rounded-2xl border px-4 py-3 text-sm font-semibold' style={{ borderColor: 'var(--card-border)', color: 'var(--text-secondary)', background: 'var(--hover-bg)' }}>
                                    Cargando sesion infinita...
                                </div>
                            ) : !infiniteChallengeReady ? (
                                <div className='rounded-2xl border px-4 py-4 space-y-3' style={{ borderColor: 'rgba(244,63,94,0.45)', color: 'var(--text-primary)', background: 'rgba(244,63,94,0.08)' }}>
                                    <p className='text-sm font-semibold'>
                                        {infiniteFeedback?.message || 'No se pudo cargar el modo infinito.'}
                                    </p>
                                    <button
                                        type='button'
                                        onClick={() => void retryInfiniteChallengeLoad()}
                                        className='rounded-2xl px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-white bg-[#2048FF] hover:bg-[#1736c9] transition-colors cursor-pointer'
                                    >
                                        Reintentar carga
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className='flex flex-wrap items-center gap-3'>
                                        <div className='px-4 py-2 rounded-2xl border text-sm font-bold inline-flex items-center gap-2' style={{ borderColor: 'var(--card-border)', color: 'var(--text-primary)', background: 'var(--hover-bg)' }}>
                                            <InfinityIcon size={15} className='text-cyan-400' />
                                            Sesion persistente activa
                                        </div>
                                        <div className='px-4 py-2 rounded-2xl border text-sm font-bold inline-flex items-center gap-2' style={{ borderColor: 'var(--card-border)', color: 'var(--text-primary)', background: 'var(--hover-bg)' }}>
                                            <Trophy size={14} className='text-yellow-400' />
                                            Puntos: {infiniteScore}
                                        </div>
                                        <button
                                            type='button'
                                            onClick={() => void switchInfiniteConsonants()}
                                            className='px-4 py-2 rounded-2xl text-sm font-black uppercase tracking-wider text-white bg-[#2048FF] hover:bg-[#1736c9] transition-colors inline-flex items-center gap-2 cursor-pointer'
                                        >
                                            <RefreshCw size={14} />
                                            Cambiar consonantes
                                        </button>
                                        <button
                                            type='button'
                                            onClick={() => void resetInfiniteSession()}
                                            className='px-4 py-2 rounded-2xl text-sm font-black uppercase tracking-wider border inline-flex items-center gap-2 cursor-pointer'
                                            style={{ borderColor: 'var(--card-border)', color: 'var(--text-primary)', background: 'var(--card-bg)' }}
                                        >
                                            Reiniciar sesion
                                        </button>
                                        {!infiniteFinished && (
                                            <button
                                                type='button'
                                                onClick={() => void finalizeInfinite()}
                                                className='px-4 py-2 rounded-2xl text-sm font-black uppercase tracking-wider border inline-flex items-center gap-2 cursor-pointer'
                                                style={{ borderColor: 'var(--card-border)', color: 'var(--text-primary)', background: 'var(--card-bg)' }}
                                            >
                                                <Eye size={14} />
                                                Rendirse y ver catalogo
                                            </button>
                                        )}
                                        {infiniteFinalized && !infiniteCompleted && (
                                            <button
                                                type='button'
                                                onClick={resumeInfiniteSession}
                                                className='px-4 py-2 rounded-2xl text-sm font-black uppercase tracking-wider border inline-flex items-center gap-2 cursor-pointer'
                                                style={{ borderColor: 'var(--card-border)', color: 'var(--text-primary)', background: 'var(--card-bg)' }}
                                            >
                                                Reanudar sesion
                                            </button>
                                        )}
                                    </div>

                                    {renderConsonantCards(infiniteChallenge.consonants)}

                                    <div className='rounded-2xl border px-4 py-4' style={{ borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}>
                                        <p className='text-xs font-black uppercase tracking-[0.12em]' style={{ color: 'var(--text-secondary)' }}>
                                            Estado de sesion
                                        </p>
                                        <p className='text-sm font-semibold mt-1' style={{ color: 'var(--text-primary)' }}>
                                            {infiniteChallenge.wordCount} palabras validas detectadas para {infiniteChallenge.consonants}.
                                        </p>
                                        <p className='text-xs mt-2 font-semibold' style={{ color: 'var(--text-secondary)' }}>
                                            Puedes salir del juego y volver despues sin perder progreso.
                                        </p>
                                    </div>

                                    <form onSubmit={(event) => void submitInfiniteAttempt(event)} className='flex flex-col md:flex-row gap-3'>
                                        <input
                                            value={infiniteAttempt}
                                            onChange={(event) => setInfiniteAttempt(event.target.value)}
                                            placeholder='Escribe una palabra real'
                                            className='flex-1 rounded-2xl border px-4 py-3 text-base font-semibold outline-none focus:ring-2 focus:ring-blue-500/60'
                                            style={{ borderColor: 'var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                                            disabled={infiniteFinished || infiniteSubmitting}
                                            autoComplete='off'
                                        />
                                        <button
                                            type='submit'
                                            className='rounded-2xl px-6 py-3 text-sm font-black uppercase tracking-[0.12em] text-white bg-[#2048FF] hover:bg-[#1736c9] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer transition-colors'
                                            disabled={infiniteFinished || infiniteSubmitting}
                                        >
                                            {infiniteSubmitting ? 'Validando...' : 'Validar'}
                                        </button>
                                    </form>

                                    {infiniteFeedback && (
                                        <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${getFeedbackClasses(infiniteFeedback.tone)}`}>
                                            {infiniteFeedback.message}
                                        </div>
                                    )}

                                    <div className='grid lg:grid-cols-[1.35fr_1fr] gap-4'>
                                        {renderFoundWords({ foundWords: infiniteFoundWords, challenge: infiniteChallenge })}
                                        {renderRules(infiniteChallenge.consonants, infiniteAccuracy, infiniteFoundWords.length, infiniteAttemptCount)}
                                    </div>

                                    {infiniteFinished && (
                                        <div className='rounded-2xl border px-5 py-4 space-y-3' style={{ borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}>
                                            <div className='flex items-center gap-2'>
                                                <CheckCircle2 size={18} className='text-emerald-500' />
                                                <p className='font-black text-sm uppercase tracking-[0.14em]' style={{ color: 'var(--text-primary)' }}>
                                                    Sesion finalizada
                                                </p>
                                            </div>
                                            <div className='flex items-start gap-2 text-sm' style={{ color: 'var(--text-primary)' }}>
                                                <Lightbulb size={16} className='text-amber-500 mt-0.5' />
                                                <p>
                                                    Aqui puedes revisar todas las palabras validas para estas consonantes.
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {infiniteFinished && renderCatalog({
                                        consonants: infiniteChallenge.consonants,
                                        words: infiniteCatalogWords,
                                        commonWords: infiniteCatalogCommonWords,
                                        loading: infiniteCatalogLoading,
                                        foundWords: infiniteFoundWords
                                    })}

                                    {infiniteHydrated && (
                                        <p className='text-[11px] font-semibold uppercase tracking-[0.11em]' style={{ color: 'var(--text-secondary)' }}>
                                            Progreso infinito guardado automaticamente en este navegador.
                                        </p>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </header>
            </div>
        </section>
    )
}
