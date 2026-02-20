'use client'

import { FormEvent, useEffect, useMemo, useState, useTransition } from 'react'
import { Check, MessageSquareQuote, Pencil, Plus, ToggleLeft, ToggleRight, X } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'
import { bootstrapLegacyQuotesIfEmpty, createQuote, createQuoteRequest, deleteQuote, getActiveQuotes, getAirHiveUsersForQuotes, getAllQuotesForAdmin, getMyQuoteAuthorPreset, getPendingQuoteRequestsForAdmin, getQuoteAuthorPresetByUserId, getQuoteReactionUsers, reviewQuoteRequest, toggleQuoteActive, updateQuote } from '@/app/actions/quotes'

export type QuoteRow = {
    id: number
    quote_text: string
    quote_author: string
    quote_source: string | null
    quote_author_context: string | null
    contributed_by_name: string
    is_active: boolean
    created_at: string
    updated_at: string
    is_own_quote?: boolean
    quote_year?: number | null
    quote_origin_type?: string | null
    quote_origin_title?: string | null
    quote_origin_reference?: string | null
    quote_notes?: string | null
    contributed_by?: string | null
    likes_count?: number
    dislikes_count?: number
    current_user_reaction?: 'like' | 'dislike' | null
}

type Props = {
    initialQuotes: QuoteRow[]
    initialLoadError?: string
}

type QuoteRequestRow = {
    id: number
    quote_text: string
    quote_author: string
    quote_author_context: string | null
    quote_source: string | null
    contributed_by_name: string
    created_at: string
    requester_name: string
    requester_email: string | null
}

const originTypeOptions = [
    { value: '', label: 'No especificado' },
    { value: 'propia', label: 'Propia' },
    { value: 'libro', label: 'Libro' },
    { value: 'cancion', label: 'Canción' },
    { value: 'articulo', label: 'Artículo' },
    { value: 'pelicula', label: 'Película' },
    { value: 'podcast', label: 'Podcast' },
    { value: 'conferencia', label: 'Conferencia' },
    { value: 'entrevista', label: 'Entrevista' },
    { value: 'documento', label: 'Documento' },
    { value: 'otro', label: 'Otro' }
]

const emptyForm = {
    quoteText: '',
    quoteAuthor: '',
    quoteAuthorUserId: '',
    quoteSource: '',
    quoteAuthorContext: '',
    contributedByName: '',
    contributedByUserId: '',
    isOwnQuote: false,
    quoteYear: '',
    quoteOriginType: '',
    quoteOriginTitle: '',
    quoteOriginReference: '',
    quoteNotes: ''
}

const normalizeName = (value: string | null | undefined) => String(value || '').trim().toLowerCase()

const FALLBACK_QUOTES: QuoteRow[] = [
    { id: -1, quote_text: 'Science is the poetry of reality.', quote_author: 'Richard Dawkins', quote_source: 'The Magic of Reality (2011)', quote_author_context: 'Evolutionary Biologist & Author', contributed_by_name: 'Sistema AirHive', is_active: true, created_at: '', updated_at: '' },
    { id: -2, quote_text: 'We are going to die, and that makes us the lucky ones. Most people are never going to die because they are never going to be born.', quote_author: 'Richard Dawkins', quote_source: 'Unweaving the Rainbow (1998)', quote_author_context: 'Evolutionary Biologist & Author', contributed_by_name: 'Sistema AirHive', is_active: true, created_at: '', updated_at: '' },
    { id: -3, quote_text: 'The feeling of awed wonder that science can give us is one of the highest experiences of which the human psyche is capable.', quote_author: 'Richard Dawkins', quote_source: 'Unweaving the Rainbow (1998)', quote_author_context: 'Evolutionary Biologist & Author', contributed_by_name: 'Sistema AirHive', is_active: true, created_at: '', updated_at: '' },
    { id: -4, quote_text: 'Nature is not cruel, only pitilessly indifferent. This is one of the hardest lessons for humans to learn.', quote_author: 'Richard Dawkins', quote_source: 'River Out of Eden (1995)', quote_author_context: 'Evolutionary Biologist & Author', contributed_by_name: 'Sistema AirHive', is_active: true, created_at: '', updated_at: '' },
    { id: -5, quote_text: 'Cumulative selection is the key to understanding the complexity of life.', quote_author: 'Richard Dawkins', quote_source: 'The Blind Watchmaker (1986)', quote_author_context: 'Evolutionary Biologist & Author', contributed_by_name: 'Sistema AirHive', is_active: true, created_at: '', updated_at: '' },
    { id: -6, quote_text: 'The truth is more magical than any myth or made-up mystery or miracle.', quote_author: 'Richard Dawkins', quote_source: 'The Magic of Reality (2011)', quote_author_context: 'Evolutionary Biologist & Author', contributed_by_name: 'Sistema AirHive', is_active: true, created_at: '', updated_at: '' },
    { id: -7, quote_text: "Isn't it enough to see that a garden is beautiful without having to believe that there are fairies at the bottom of it too?", quote_author: 'Richard Dawkins', quote_source: 'Unweaving the Rainbow (1998)', quote_author_context: 'Evolutionary Biologist & Author', contributed_by_name: 'Sistema AirHive', is_active: true, created_at: '', updated_at: '' },
    { id: -8, quote_text: 'Quien gana la carrera no es necesariamente el más rápido, sino quien cruza la meta primero.', quote_author: 'Jesús Gracia', quote_source: 'Declaración interna en AirHive', quote_author_context: 'Director Comercial de AirHive', contributed_by_name: 'Sistema AirHive', is_active: true, created_at: '', updated_at: '' },
    { id: -9, quote_text: 'A la única persona que le gusta el cambio es a un bebé con un pañal sucio.', quote_author: 'Jesús Gracia', quote_source: 'Declaración interna en AirHive', quote_author_context: 'Director Comercial de AirHive', contributed_by_name: 'Sistema AirHive', is_active: true, created_at: '', updated_at: '' },
    { id: -10, quote_text: 'Si no sacrificas por lo que quieres, lo que quieres se convierte en sacrificio.', quote_author: 'Rafael Sedas', quote_source: 'Declaración interna en Air Hive', quote_author_context: 'Director Operativo y Director Financiero de Air Hive', contributed_by_name: 'Rafael Sedas', is_active: true, created_at: '', updated_at: '' },
    { id: -11, quote_text: 'Si tu y yo nos queremos, no necesitamos a nadie más.', quote_author: 'Enjambre', quote_source: 'Frase atribuida por colaborador', quote_author_context: null, contributed_by_name: 'Rafael Sedas', is_active: true, created_at: '', updated_at: '' }
]

export default function QuoteManagementPanel({ initialQuotes, initialLoadError = '' }: Props) {
    const { profile } = useAuth()
    const isAdmin = profile?.role === 'admin'
    const [quotes, setQuotes] = useState<QuoteRow[]>(initialQuotes)
    const [isPending, startTransition] = useTransition()
    const [isEditMode, setIsEditMode] = useState(false)
    const [notice, setNotice] = useState<string>('')
    const [error, setError] = useState<string>(initialLoadError)
    const [form, setForm] = useState({ ...emptyForm })
    const [filters, setFilters] = useState({
        author: '',
        contributedBy: '',
        sortBy: 'created_at_desc'
    })
    const [editingId, setEditingId] = useState<number | null>(null)
    const [editForm, setEditForm] = useState({ ...emptyForm })
    const [initialEditForm, setInitialEditForm] = useState({ ...emptyForm })
    const [showSavePopup, setShowSavePopup] = useState(false)
    const [airHiveAuthors, setAirHiveAuthors] = useState<Array<{ id: string, full_name: string, author_context: string }>>([])
    const [pendingRequests, setPendingRequests] = useState<QuoteRequestRow[]>([])
    const [reactionModal, setReactionModal] = useState<{
        isOpen: boolean
        quoteId: number | null
        quoteText: string
        reactionType: 'like' | 'dislike'
        users: Array<{ user_id: string, full_name: string, email: string | null, created_at: string }>
        loading: boolean
        error: string
    }>({
        isOpen: false,
        quoteId: null,
        quoteText: '',
        reactionType: 'like',
        users: [],
        loading: false,
        error: ''
    })
    useBodyScrollLock(reactionModal.isOpen)

    const activeCount = useMemo(() => quotes.filter(q => q.is_active).length, [quotes])
    const airHiveAuthorNames = useMemo(() => {
        return new Set(airHiveAuthors.map((user) => normalizeName(user.full_name)).filter(Boolean))
    }, [airHiveAuthors])

    const isQuoteFromAirHiveAuthor = (item: QuoteRow) => {
        if (item.is_own_quote) return true
        return airHiveAuthorNames.has(normalizeName(item.quote_author))
    }

    const getAuthorContextForDisplay = (item: QuoteRow) => {
        const stored = String(item.quote_author_context || '').trim()
        if (stored) return stored
        const matched = airHiveAuthors.find((user) => normalizeName(user.full_name) === normalizeName(item.quote_author))
        return String(matched?.author_context || '').trim()
    }

    const hasEditChanges = useMemo(() => {
        if (editingId === null) return false
        return JSON.stringify(editForm) !== JSON.stringify(initialEditForm)
    }, [editingId, editForm, initialEditForm])

    const filterOptions = useMemo(() => {
        const authors = Array.from(new Set(quotes.map((item) => String(item.quote_author || '').trim()).filter(Boolean)))
            .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))

        const contributors = Array.from(new Set(quotes.map((item) => String(item.contributed_by_name || '').trim()).filter(Boolean)))
            .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))

        return { authors, contributors }
    }, [quotes])

    const filteredQuotes = useMemo(() => {
        const rows = quotes.filter((item) => {
            if (filters.author && String(item.quote_author || '') !== filters.author) return false
            if (filters.contributedBy && String(item.contributed_by_name || '') !== filters.contributedBy) return false
            return true
        })

        const sorted = [...rows].sort((a, b) => {
            if (filters.sortBy === 'quote_author_asc') {
                return String(a.quote_author || '').localeCompare(String(b.quote_author || ''), 'es', { sensitivity: 'base' })
            }
            if (filters.sortBy === 'quote_author_desc') {
                return String(b.quote_author || '').localeCompare(String(a.quote_author || ''), 'es', { sensitivity: 'base' })
            }
            if (filters.sortBy === 'contributed_by_name_asc') {
                return String(a.contributed_by_name || '').localeCompare(String(b.contributed_by_name || ''), 'es', { sensitivity: 'base' })
            }
            if (filters.sortBy === 'contributed_by_name_desc') {
                return String(b.contributed_by_name || '').localeCompare(String(a.contributed_by_name || ''), 'es', { sensitivity: 'base' })
            }
            if (filters.sortBy === 'likes_desc') {
                return Number(b.likes_count || 0) - Number(a.likes_count || 0)
            }
            if (filters.sortBy === 'dislikes_desc') {
                return Number(b.dislikes_count || 0) - Number(a.dislikes_count || 0)
            }
            const dateA = new Date(a.created_at || '').getTime()
            const dateB = new Date(b.created_at || '').getTime()
            if (filters.sortBy === 'created_at_asc') {
                return (Number.isFinite(dateA) ? dateA : 0) - (Number.isFinite(dateB) ? dateB : 0)
            }
            return (Number.isFinite(dateB) ? dateB : 0) - (Number.isFinite(dateA) ? dateA : 0)
        })

        return sorted
    }, [quotes, filters])

    useEffect(() => {
        let cancelled = false
        const loadAuthors = async () => {
            const result = await getAirHiveUsersForQuotes()
            if (!cancelled && result.success) {
                const rawUsers = Array.isArray(result.data) ? result.data : []
                const users = rawUsers.map((raw) => {
                    const u = raw as Record<string, unknown>
                    return {
                        id: String(u.id || ''),
                        full_name: String(u.full_name || ''),
                        author_context: String(u.author_context || '')
                    }
                })
                setAirHiveAuthors(users)
            }
        }
        loadAuthors()
        return () => { cancelled = true }
    }, [])

    useEffect(() => {
        let cancelled = false
        const hydrateQuotes = async () => {
            if (quotes.length === 0 && !cancelled) {
                setQuotes(FALLBACK_QUOTES)
            }

            const currentResult = isAdmin ? await getAllQuotesForAdmin() : await getActiveQuotes()
            if (!cancelled && currentResult.success && (currentResult.data || []).length > 0) {
                setQuotes(currentResult.data as QuoteRow[])
                return
            }

            if (!isAdmin) return

            await bootstrapLegacyQuotesIfEmpty()
            const refreshed = await getAllQuotesForAdmin()
            if (!cancelled && refreshed.success && (refreshed.data || []).length > 0) {
                setQuotes(refreshed.data as QuoteRow[])
            }
        }

        hydrateQuotes()
        return () => { cancelled = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAdmin])

    useEffect(() => {
        if (!isAdmin) {
            setPendingRequests([])
            return
        }
        let cancelled = false
        const loadPending = async () => {
            const result = await getPendingQuoteRequestsForAdmin()
            if (!cancelled && result.success) {
                setPendingRequests((result.data || []) as QuoteRequestRow[])
            }
        }
        loadPending()
        return () => { cancelled = true }
    }, [isAdmin])

    const reload = async () => {
        const result = isAdmin ? await getAllQuotesForAdmin() : await getActiveQuotes()
        if (result.success) setQuotes(result.data as QuoteRow[])
        if (isAdmin) {
            const pending = await getPendingQuoteRequestsForAdmin()
            if (pending.success) setPendingRequests((pending.data || []) as QuoteRequestRow[])
        }
    }

    const applyOwnQuotePresetToCreate = () => {
        startTransition(async () => {
            const result = await getMyQuoteAuthorPreset()
            if (!result.success || !result.data) {
                setError(result.error || 'No se pudo autocompletar el autor')
                return
            }
            const preset = result.data
            setForm(prev => ({
                ...prev,
                isOwnQuote: true,
                quoteAuthor: preset.quoteAuthor || prev.quoteAuthor,
                quoteAuthorContext: preset.quoteAuthorContext || prev.quoteAuthorContext,
                quoteOriginType: prev.quoteOriginType || 'propia'
            }))
        })
    }

    const applyOwnQuotePresetToEdit = () => {
        startTransition(async () => {
            const result = await getMyQuoteAuthorPreset()
            if (!result.success || !result.data) {
                setError(result.error || 'No se pudo autocompletar el autor')
                return
            }
            const preset = result.data
            setEditForm(prev => ({
                ...prev,
                isOwnQuote: true,
                quoteAuthor: preset.quoteAuthor || prev.quoteAuthor,
                quoteAuthorContext: preset.quoteAuthorContext || prev.quoteAuthorContext,
                quoteOriginType: prev.quoteOriginType || 'propia'
            }))
        })
    }

    const onCreate = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        setNotice('')
        setError('')
        startTransition(async () => {
            const result = isAdmin ? await createQuote(form) : await createQuoteRequest(form)
            if (!result.success) {
                setError(result.error || (isAdmin ? 'No se pudo guardar la frase' : 'No se pudo enviar la solicitud'))
                return
            }
            setNotice(isAdmin ? 'La frase se registró correctamente en el CRM.' : 'Tu solicitud fue enviada. Un admin la revisará para aprobarla o rechazarla.')
            setForm({ ...emptyForm })
            await reload()
        })
    }

    const onToggle = (id: number, nextState: boolean) => {
        setNotice('')
        setError('')
        startTransition(async () => {
            const result = await toggleQuoteActive(id, nextState)
            if (!result.success) {
                setError(result.error || 'No se pudo actualizar el estado')
                return
            }
            setNotice(nextState ? 'Frase activada correctamente.' : 'Frase desactivada correctamente.')
            setQuotes(prev => prev.map(item => item.id === id ? { ...item, is_active: nextState } : item))
        })
    }

    const onDelete = (id: number) => {
        setNotice('')
        setError('')
        startTransition(async () => {
            const result = await deleteQuote(id)
            if (!result.success) {
                setError(result.error || 'No se pudo eliminar la frase')
                return
            }
            setNotice('La frase se retiró correctamente del catálogo.')
            setQuotes(prev => prev.filter(item => item.id !== id))
        })
    }

    const startEditing = (item: QuoteRow) => {
        if (!isEditMode) return
        setEditingId(item.id)
        const payload = {
            quoteText: item.quote_text || '',
            quoteAuthor: item.quote_author || '',
            quoteAuthorUserId: '',
            quoteSource: item.quote_source || '',
            quoteAuthorContext: item.quote_author_context || '',
            contributedByName: item.contributed_by_name || '',
            contributedByUserId: item.contributed_by || '',
            isOwnQuote: !!item.is_own_quote,
            quoteYear: item.quote_year?.toString() || '',
            quoteOriginType: item.quote_origin_type || '',
            quoteOriginTitle: item.quote_origin_title || '',
            quoteOriginReference: item.quote_origin_reference || '',
            quoteNotes: item.quote_notes || ''
        }
        setEditForm(payload)
        setInitialEditForm(payload)
    }

    const cancelEditing = () => {
        setEditingId(null)
        setEditForm({ ...emptyForm })
        setInitialEditForm({ ...emptyForm })
    }

    const onUpdate = (id: number) => {
        setNotice('')
        setError('')
        if (!hasEditChanges) return
        startTransition(async () => {
            const result = await updateQuote(id, editForm)
            if (!result.success) {
                setError(result.error || 'No se pudo editar la frase')
                return
            }
            setNotice('La frase se actualizó correctamente.')
            setShowSavePopup(true)
            setTimeout(() => setShowSavePopup(false), 2200)
            cancelEditing()
            await reload()
        })
    }

    const toggleEditMode = () => {
        if (!isAdmin) return
        setIsEditMode(prev => {
            const next = !prev
            if (!next) cancelEditing()
            return next
        })
    }

    const openReactionUsers = (item: QuoteRow, reactionType: 'like' | 'dislike') => {
        if (!isAdmin) return
        setReactionModal({
            isOpen: true,
            quoteId: item.id,
            quoteText: item.quote_text || '',
            reactionType,
            users: [],
            loading: true,
            error: ''
        })
        startTransition(async () => {
            const result = await getQuoteReactionUsers(item.id, reactionType)
            if (!result.success) {
                setReactionModal(prev => ({
                    ...prev,
                    loading: false,
                    error: result.error || 'No se pudo cargar la lista de reacciones'
                }))
                return
            }
            setReactionModal(prev => ({
                ...prev,
                loading: false,
                users: (result.data || []) as Array<{ user_id: string, full_name: string, email: string | null, created_at: string }>
            }))
        })
    }

    const closeReactionModal = () => {
        setReactionModal(prev => ({ ...prev, isOpen: false }))
    }

    const onReviewRequest = (requestId: number, decision: 'approved' | 'rejected') => {
        if (!isAdmin) return
        setNotice('')
        setError('')
        startTransition(async () => {
            const result = await reviewQuoteRequest(requestId, decision)
            if (!result.success) {
                setError(result.error || 'No se pudo procesar la solicitud')
                return
            }
            setNotice(decision === 'approved' ? 'Solicitud aprobada y frase registrada.' : 'Solicitud rechazada correctamente.')
            await reload()
        })
    }

    return (
        <section className='mt-12 space-y-6'>
            <div className='flex items-center gap-4'>
                <div className='ah-icon-card ah-icon-card-sm'>
                    <MessageSquareQuote size={20} strokeWidth={2.2} />
                </div>
                <div>
                    <h2 className='text-2xl font-bold' style={{ color: 'var(--text-primary)' }}>
                        Frases del CRM
                    </h2>
                    <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>
                        {quotes.length} registradas • {activeCount} activas
                    </p>
                </div>
            </div>

            {notice && (
                <div
                    className='rounded-xl border px-4 py-3 text-sm font-semibold'
                    style={{
                        borderColor: 'color-mix(in srgb, #5BC69E 55%, var(--card-border))',
                        background: 'color-mix(in srgb, #5BC69E 14%, var(--card-bg))',
                        color: '#4FAE8A'
                    }}
                >
                    {notice}
                </div>
            )}
            {error && (
                <div
                    className='rounded-xl border px-4 py-3 text-sm font-semibold'
                    style={{
                        borderColor: 'color-mix(in srgb, #E35D6A 55%, var(--card-border))',
                        background: 'color-mix(in srgb, #E35D6A 14%, var(--card-bg))',
                        color: '#E35D6A'
                    }}
                >
                    {error}
                </div>
            )}

            <form
                onSubmit={onCreate}
                className='rounded-2xl border p-5 space-y-4'
                style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}
            >
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                    <label className='inline-flex items-center gap-2 text-sm font-semibold cursor-pointer' style={{ color: 'var(--text-secondary)' }}>
                        <input
                            type='checkbox'
                            checked={form.isOwnQuote}
                            disabled={!!form.quoteAuthorUserId}
                            onChange={(e) => {
                                const checked = e.target.checked
                                if (checked) {
                                    applyOwnQuotePresetToCreate()
                                } else {
                                    setForm(prev => ({ ...prev, isOwnQuote: false }))
                                }
                            }}
                            className='cursor-pointer'
                        />
                        Frase propia (autocompletar autor y puesto AirHive)
                    </label>
                    {form.quoteAuthorUserId && (
                        <p className='text-xs font-medium' style={{ color: 'var(--text-secondary)' }}>
                            Autor vinculado a perfil CRM. Limpia la selección para editar manualmente.
                        </p>
                    )}
                </div>

                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                    <select
                        value={form.quoteAuthorUserId || ''}
                        onChange={(e) => {
                            const userId = e.target.value
                            if (!userId) {
                                setForm(prev => ({
                                    ...prev,
                                    quoteAuthorUserId: '',
                                    isOwnQuote: false
                                }))
                                return
                            }
                            const selected = airHiveAuthors.find(item => item.id === userId)
                            if (!selected) return
                            setForm(prev => ({
                                ...prev,
                                quoteAuthorUserId: selected.id,
                                quoteAuthor: selected.full_name,
                                quoteAuthorContext: selected.author_context || '',
                                isOwnQuote: false
                            }))
                            startTransition(async () => {
                                const preset = await getQuoteAuthorPresetByUserId(userId)
                                if (!preset.success || !preset.data) return
                                setForm(prev => {
                                    if (prev.quoteAuthorUserId !== userId) return prev
                                    return {
                                        ...prev,
                                        quoteAuthor: preset.data?.quoteAuthor || prev.quoteAuthor,
                                        quoteAuthorContext: preset.data?.quoteAuthorContext || ''
                                    }
                                })
                            })
                        }}
                        className='rounded-xl px-4 py-3 border outline-none cursor-pointer'
                        style={{ borderColor: 'var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                    >
                        <option value=''>Seleccionar autor AirHive (opcional)</option>
                        {airHiveAuthors.map((user) => (
                            <option key={user.id} value={user.id}>
                                {user.full_name}{user.author_context ? ` - ${user.author_context}` : ''}
                            </option>
                        ))}
                    </select>
                    <input
                        value={form.quoteAuthor}
                        onChange={(e) => setForm(prev => ({ ...prev, quoteAuthor: e.target.value, quoteAuthorUserId: '' }))}
                        placeholder='Autor de la frase'
                        disabled={!!form.quoteAuthorUserId}
                        className='rounded-xl px-4 py-3 border outline-none'
                        style={{
                            borderColor: 'var(--input-border)',
                            background: !!form.quoteAuthorUserId ? 'color-mix(in srgb, var(--input-bg) 85%, #6c7486 15%)' : 'var(--input-bg)',
                            color: 'var(--text-primary)',
                            opacity: !!form.quoteAuthorUserId ? 0.85 : 1,
                            cursor: !!form.quoteAuthorUserId ? 'not-allowed' : 'text'
                        }}
                    />
                </div>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                    <select
                        value={airHiveAuthors.some((user) => user.id === String(form.contributedByUserId || '')) ? String(form.contributedByUserId || '') : ''}
                        onChange={(e) => {
                            const selected = airHiveAuthors.find((item) => item.id === e.target.value)
                            if (!selected) {
                                setForm(prev => ({ ...prev, contributedByUserId: '' }))
                                return
                            }
                            setForm(prev => ({
                                ...prev,
                                contributedByUserId: selected.id,
                                contributedByName: selected.full_name
                            }))
                        }}
                        className='rounded-xl px-4 py-3 border outline-none cursor-pointer'
                        style={{ borderColor: 'var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                    >
                        <option value=''>Seleccionar usuario CRM (opcional)</option>
                        {airHiveAuthors.map((user) => (
                            <option key={`contrib-${user.id}`} value={user.id}>
                                {user.full_name}{user.author_context ? ` - ${user.author_context}` : ''}
                            </option>
                        ))}
                    </select>
                    <input
                        value={form.contributedByName}
                        onChange={(e) => setForm(prev => ({ ...prev, contributedByName: e.target.value, contributedByUserId: '' }))}
                        placeholder='Aportada por'
                        className='rounded-xl px-4 py-3 border outline-none'
                        style={{ borderColor: 'var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                    />
                </div>

                <textarea
                    value={form.quoteText}
                    onChange={(e) => setForm(prev => ({ ...prev, quoteText: e.target.value }))}
                    placeholder='Escribe aquí la frase'
                    rows={3}
                    className='w-full rounded-xl px-4 py-3 border outline-none resize-y'
                    style={{ borderColor: 'var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                />

                <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                    <input
                        value={form.quoteYear}
                        onChange={(e) => setForm(prev => ({ ...prev, quoteYear: e.target.value }))}
                        placeholder='Año (opcional)'
                        className='rounded-xl px-4 py-3 border outline-none'
                        style={{ borderColor: 'var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                    />
                    <select
                        value={form.quoteOriginType}
                        onChange={(e) => setForm(prev => ({ ...prev, quoteOriginType: e.target.value }))}
                        className='rounded-xl px-4 py-3 border outline-none cursor-pointer'
                        style={{ borderColor: 'var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                    >
                        {originTypeOptions.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                    <input
                        value={form.quoteOriginTitle}
                        onChange={(e) => setForm(prev => ({ ...prev, quoteOriginTitle: e.target.value }))}
                        placeholder='Libro / Canción / Película / Obra (opcional)'
                        className='rounded-xl px-4 py-3 border outline-none'
                        style={{ borderColor: 'var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                    />
                </div>

                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                    <input
                        value={form.quoteOriginReference}
                        onChange={(e) => setForm(prev => ({ ...prev, quoteOriginReference: e.target.value }))}
                        placeholder='Referencia adicional (capítulo, enlace, edición...)'
                        className='rounded-xl px-4 py-3 border outline-none'
                        style={{ borderColor: 'var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                    />
                    <input
                        value={form.quoteSource}
                        onChange={(e) => setForm(prev => ({ ...prev, quoteSource: e.target.value }))}
                        placeholder='Fuente libre (opcional)'
                        className='rounded-xl px-4 py-3 border outline-none'
                        style={{ borderColor: 'var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                    />
                </div>

                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                    <input
                        value={form.quoteAuthorContext}
                        onChange={(e) => setForm(prev => ({ ...prev, quoteAuthorContext: e.target.value, quoteAuthorUserId: '' }))}
                        placeholder='Contexto del autor (puesto, perfil...)'
                        disabled={!!form.quoteAuthorUserId}
                        className='rounded-xl px-4 py-3 border outline-none'
                        style={{
                            borderColor: 'var(--input-border)',
                            background: !!form.quoteAuthorUserId ? 'color-mix(in srgb, var(--input-bg) 85%, #6c7486 15%)' : 'var(--input-bg)',
                            color: 'var(--text-primary)',
                            opacity: !!form.quoteAuthorUserId ? 0.85 : 1,
                            cursor: !!form.quoteAuthorUserId ? 'not-allowed' : 'text'
                        }}
                    />
                    <input
                        value={form.quoteNotes}
                        onChange={(e) => setForm(prev => ({ ...prev, quoteNotes: e.target.value }))}
                        placeholder='Notas adicionales (opcional)'
                        className='rounded-xl px-4 py-3 border outline-none'
                        style={{ borderColor: 'var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                    />
                </div>

                <button
                    type='submit'
                    disabled={isPending}
                    className='inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold border transition-all hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed'
                    style={{ borderColor: '#2048FF', background: '#2048FF', color: '#FFFFFF', cursor: isPending ? 'not-allowed' : 'pointer' }}
                >
                    <Plus size={16} />
                    {isAdmin ? 'Registrar frase' : 'Enviar solicitud'}
                </button>
            </form>

            {isAdmin && (
                <div id='solicitudes-frases' className='rounded-2xl border overflow-hidden' style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
                    <div className='px-4 py-3 border-b' style={{ borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}>
                        <p className='text-xs font-black uppercase tracking-[0.2em]' style={{ color: 'var(--text-secondary)' }}>
                            Solicitudes pendientes de frases
                        </p>
                    </div>
                    {pendingRequests.length === 0 ? (
                        <div className='px-4 py-4 text-sm font-medium' style={{ color: 'var(--text-secondary)' }}>
                            No hay solicitudes pendientes.
                        </div>
                    ) : (
                        <div className='overflow-x-auto'>
                            <table className='w-full min-w-[900px]'>
                                <thead>
                                    <tr style={{ background: 'var(--hover-bg)' }}>
                                        <th className='px-4 py-3 text-left text-xs font-black uppercase tracking-[0.2em]' style={{ color: 'var(--text-secondary)' }}>Frase</th>
                                        <th className='px-4 py-3 text-left text-xs font-black uppercase tracking-[0.2em]' style={{ color: 'var(--text-secondary)' }}>Autor</th>
                                        <th className='px-4 py-3 text-left text-xs font-black uppercase tracking-[0.2em]' style={{ color: 'var(--text-secondary)' }}>Aportador</th>
                                        <th className='px-4 py-3 text-left text-xs font-black uppercase tracking-[0.2em]' style={{ color: 'var(--text-secondary)' }}>Solicitó</th>
                                        <th className='px-4 py-3 text-left text-xs font-black uppercase tracking-[0.2em]' style={{ color: 'var(--text-secondary)' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pendingRequests.map((request) => (
                                        <tr key={`pending-request-${request.id}`} className='border-t' style={{ borderColor: 'var(--card-border)' }}>
                                            <td className='px-4 py-4 align-top'>
                                                <p className='text-sm italic leading-relaxed' style={{ color: 'var(--text-primary)' }}>
                                                    &quot;{request.quote_text}&quot;
                                                </p>
                                            </td>
                                            <td className='px-4 py-4 align-top'>
                                                <p className='text-xs font-bold uppercase tracking-[0.12em]' style={{ color: 'var(--text-primary)' }}>
                                                    {request.quote_author}
                                                </p>
                                                {!!request.quote_author_context && (
                                                    <p className='text-xs mt-1' style={{ color: 'var(--text-secondary)' }}>
                                                        {request.quote_author_context}
                                                    </p>
                                                )}
                                            </td>
                                            <td className='px-4 py-4 align-top'>
                                                <p className='text-sm font-semibold' style={{ color: 'var(--text-primary)' }}>
                                                    {request.contributed_by_name}
                                                </p>
                                            </td>
                                            <td className='px-4 py-4 align-top'>
                                                <p className='text-sm font-semibold' style={{ color: 'var(--text-primary)' }}>
                                                    {request.requester_name}
                                                </p>
                                                <p className='text-xs mt-1' style={{ color: 'var(--text-secondary)' }}>
                                                    {new Date(request.created_at).toLocaleDateString('es-MX')}
                                                </p>
                                            </td>
                                            <td className='px-4 py-4 align-top'>
                                                <div className='flex items-center gap-1.5'>
                                                    <button
                                                        type='button'
                                                        onClick={() => onReviewRequest(request.id, 'approved')}
                                                        disabled={isPending}
                                                        className='p-2 rounded-xl border border-transparent text-emerald-500 hover:bg-emerald-500/10 hover:border-emerald-500/35 hover:text-emerald-400 transition-all disabled:opacity-60 disabled:cursor-not-allowed'
                                                        style={{ cursor: isPending ? 'not-allowed' : 'pointer' }}
                                                        title='Aprobar solicitud'
                                                    >
                                                        <Check size={16} strokeWidth={2.4} />
                                                    </button>
                                                    <button
                                                        type='button'
                                                        onClick={() => onReviewRequest(request.id, 'rejected')}
                                                        disabled={isPending}
                                                        className='p-2 rounded-xl border border-transparent text-rose-500 hover:bg-rose-500/10 hover:border-rose-500/35 hover:text-rose-400 transition-all disabled:opacity-60 disabled:cursor-not-allowed'
                                                        style={{ cursor: isPending ? 'not-allowed' : 'pointer' }}
                                                        title='Rechazar solicitud'
                                                    >
                                                        <X size={16} strokeWidth={2.4} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            <div className='rounded-2xl border overflow-hidden' style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
                <div className='px-4 py-3 border-b flex items-center justify-between gap-3' style={{ borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}>
                    <p className='text-xs font-black uppercase tracking-[0.2em]' style={{ color: 'var(--text-secondary)' }}>
                        Repertorio de frases
                    </p>
                    {isAdmin && (
                        <button
                            type='button'
                            onClick={toggleEditMode}
                            className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] border transition-all cursor-pointer ${
                                isEditMode
                                    ? 'text-rose-500 hover:bg-rose-500/10 hover:border-rose-500/35 hover:text-rose-400'
                                    : 'text-amber-500 hover:bg-amber-500/10 hover:border-amber-500/35 hover:text-amber-400'
                            }`}
                            style={{
                                borderColor: isEditMode ? 'rgba(244, 63, 94, 0.7)' : 'rgba(245, 158, 11, 0.7)',
                                background: 'transparent'
                            }}
                        >
                            <Pencil size={13} />
                            {isEditMode ? 'Salir edición' : 'Editar frases'}
                        </button>
                    )}
                </div>
                <div className='px-4 py-4 border-b' style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
                    <div className='grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-3'>
                        <select
                            value={filters.author}
                            onChange={(e) => setFilters(prev => ({ ...prev, author: e.target.value }))}
                            className='rounded-xl px-3 py-2.5 border outline-none text-sm cursor-pointer'
                            style={{ borderColor: 'var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                        >
                            <option value=''>Autor: Todos</option>
                            {filterOptions.authors.map((author) => (
                                <option key={`author-filter-${author}`} value={author}>{author}</option>
                            ))}
                        </select>
                        <select
                            value={filters.contributedBy}
                            onChange={(e) => setFilters(prev => ({ ...prev, contributedBy: e.target.value }))}
                            className='rounded-xl px-3 py-2.5 border outline-none text-sm cursor-pointer'
                            style={{ borderColor: 'var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                        >
                            <option value=''>Aportador: Todos</option>
                            {filterOptions.contributors.map((contributor) => (
                                <option key={`contrib-filter-${contributor}`} value={contributor}>{contributor}</option>
                            ))}
                        </select>
                        <select
                            value={filters.sortBy}
                            onChange={(e) => setFilters(prev => ({ ...prev, sortBy: e.target.value }))}
                            className='rounded-xl px-3 py-2.5 border outline-none text-sm cursor-pointer'
                            style={{ borderColor: 'var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                        >
                            <option value='created_at_desc'>Fecha: Reciente a antiguo</option>
                            <option value='created_at_asc'>Fecha: Antiguo a reciente</option>
                            <option value='likes_desc'>Likes: Mayor a menor</option>
                            <option value='dislikes_desc'>Dislikes: Mayor a menor</option>
                            <option value='quote_author_asc'>Autor: A-Z</option>
                            <option value='quote_author_desc'>Autor: Z-A</option>
                            <option value='contributed_by_name_asc'>Aportador: A-Z</option>
                            <option value='contributed_by_name_desc'>Aportador: Z-A</option>
                        </select>
                    </div>
                    <div className='mt-3 flex items-center justify-between gap-3'>
                        <p className='text-xs font-semibold' style={{ color: 'var(--text-secondary)' }}>
                            Mostrando {filteredQuotes.length} de {quotes.length} frases
                        </p>
                        <button
                            type='button'
                            onClick={() => setFilters({
                                author: '',
                                contributedBy: '',
                                sortBy: 'created_at_desc'
                            })}
                            className='px-3 py-2 rounded-xl border border-transparent text-slate-500 hover:bg-slate-500/10 hover:border-slate-500/35 hover:text-slate-400 transition-all text-xs font-bold cursor-pointer'
                        >
                            Limpiar filtros
                        </button>
                    </div>
                </div>
                <div className='overflow-x-auto'>
                    <table className='w-full min-w-[980px]'>
                        <thead>
                            <tr style={{ background: 'var(--hover-bg)' }}>
                                <th className='px-4 py-3 text-left text-xs font-black uppercase tracking-[0.2em]' style={{ color: 'var(--text-secondary)' }}>Frase</th>
                                <th className='px-4 py-3 text-left text-xs font-black uppercase tracking-[0.2em]' style={{ color: 'var(--text-secondary)' }}>Autor</th>
                                <th className='px-4 py-3 text-left text-xs font-black uppercase tracking-[0.2em]' style={{ color: 'var(--text-secondary)' }}>Aportada por</th>
                                <th className='px-4 py-3 text-left text-xs font-black uppercase tracking-[0.2em]' style={{ color: 'var(--text-secondary)' }}>Reacciones</th>
                                <th className='px-4 py-3 text-left text-xs font-black uppercase tracking-[0.2em]' style={{ color: 'var(--text-secondary)' }}>Estado</th>
                                {isEditMode && (
                                    <th className='px-4 py-3 text-left text-xs font-black uppercase tracking-[0.2em]' style={{ color: 'var(--text-secondary)' }}>Acciones</th>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredQuotes.map((item) => (
                                <tr key={item.id} className='border-t' style={{ borderColor: 'var(--card-border)' }}>
                                    <td className='px-4 py-4 align-top w-[42%]'>
                                        {editingId === item.id ? (
                                            <textarea
                                                value={editForm.quoteText}
                                                onChange={(e) => setEditForm(prev => ({ ...prev, quoteText: e.target.value }))}
                                                rows={3}
                                                className='w-full rounded-xl px-4 py-3 border outline-none resize-y'
                                                style={{ borderColor: 'var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                                            />
                                        ) : (
                                            <div>
                                                <p
                                                    className='text-sm italic leading-relaxed'
                                                    style={{ color: isQuoteFromAirHiveAuthor(item) ? '#D4A017' : 'var(--text-primary)' }}
                                                >
                                                    &quot;{item.quote_text}&quot;
                                                </p>
                                                <div className='mt-2 flex flex-wrap gap-2'>
                                                    {!!item.quote_origin_type && <span className='text-[10px] font-bold px-2 py-1 rounded-lg border' style={{ borderColor: 'var(--card-border)', color: 'var(--text-secondary)', background: 'var(--hover-bg)' }}>{item.quote_origin_type}</span>}
                                                    {!!item.quote_year && <span className='text-[10px] font-bold px-2 py-1 rounded-lg border' style={{ borderColor: 'var(--card-border)', color: 'var(--text-secondary)', background: 'var(--hover-bg)' }}>{item.quote_year}</span>}
                                                    {!!item.quote_origin_title && <span className='text-[10px] font-bold px-2 py-1 rounded-lg border' style={{ borderColor: 'var(--card-border)', color: 'var(--text-secondary)', background: 'var(--hover-bg)' }}>{item.quote_origin_title}</span>}
                                                </div>
                                            </div>
                                        )}
                                    </td>
                                    <td className='px-4 py-4 align-top'>
                                        {editingId === item.id ? (
                                            <div className='space-y-2'>
                                                <label className='inline-flex items-center gap-2 text-xs font-semibold cursor-pointer' style={{ color: 'var(--text-secondary)' }}>
                                                    <input
                                                        type='checkbox'
                                                        checked={editForm.isOwnQuote}
                                                        onChange={(e) => {
                                                            const checked = e.target.checked
                                                            if (checked) {
                                                                applyOwnQuotePresetToEdit()
                                                            } else {
                                                                setEditForm(prev => ({ ...prev, isOwnQuote: false }))
                                                            }
                                                        }}
                                                        className='cursor-pointer'
                                                    />
                                                    Frase propia
                                                </label>
                                                <input
                                                    value={editForm.quoteAuthor}
                                                    onChange={(e) => setEditForm(prev => ({ ...prev, quoteAuthor: e.target.value }))}
                                                    className='w-full rounded-xl px-4 py-3 border outline-none'
                                                    style={{ borderColor: 'var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                                                />
                                                <input
                                                    value={editForm.quoteAuthorContext}
                                                    onChange={(e) => setEditForm(prev => ({ ...prev, quoteAuthorContext: e.target.value }))}
                                                    placeholder='Contexto del autor'
                                                    className='w-full rounded-xl px-4 py-3 border outline-none'
                                                    style={{ borderColor: 'var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                                                />
                                            </div>
                                        ) : (
                                            <div>
                                                <p className='text-xs font-bold uppercase tracking-[0.12em]' style={{ color: 'var(--text-primary)' }}>{item.quote_author}</p>
                                                {!!getAuthorContextForDisplay(item) && (
                                                    <p className='text-xs mt-1' style={{ color: 'var(--text-secondary)' }}>{getAuthorContextForDisplay(item)}</p>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                    <td className='px-4 py-4 align-top'>
                                        {editingId === item.id ? (
                                            <div className='space-y-2'>
                                                <input
                                                    value={editForm.contributedByName}
                                                    onChange={(e) => setEditForm(prev => ({ ...prev, contributedByName: e.target.value, contributedByUserId: '' }))}
                                                    className='w-full rounded-xl px-4 py-3 border outline-none'
                                                    style={{ borderColor: 'var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                                                />
                                                <select
                                                    value={airHiveAuthors.some((user) => user.id === String(editForm.contributedByUserId || '')) ? String(editForm.contributedByUserId || '') : ''}
                                                    onChange={(e) => {
                                                        const selected = airHiveAuthors.find((author) => author.id === e.target.value)
                                                        if (!selected) {
                                                            setEditForm(prev => ({ ...prev, contributedByUserId: '' }))
                                                            return
                                                        }
                                                        setEditForm(prev => ({
                                                            ...prev,
                                                            contributedByUserId: selected.id,
                                                            contributedByName: selected.full_name
                                                        }))
                                                    }}
                                                    className='w-full rounded-xl px-4 py-3 border outline-none cursor-pointer'
                                                    style={{ borderColor: 'var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                                                >
                                                    <option value=''>Seleccionar usuario CRM (opcional)</option>
                                                    {airHiveAuthors.map((user) => (
                                                        <option key={`edit-contrib-${user.id}`} value={user.id}>
                                                            {user.full_name}{user.author_context ? ` - ${user.author_context}` : ''}
                                                        </option>
                                                    ))}
                                                </select>
                                                <div className='grid grid-cols-1 md:grid-cols-2 gap-2'>
                                                    <input
                                                        value={editForm.quoteYear}
                                                        onChange={(e) => setEditForm(prev => ({ ...prev, quoteYear: e.target.value }))}
                                                        placeholder='Año'
                                                        className='w-full rounded-xl px-4 py-3 border outline-none'
                                                        style={{ borderColor: 'var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                                                    />
                                                    <select
                                                        value={editForm.quoteOriginType}
                                                        onChange={(e) => setEditForm(prev => ({ ...prev, quoteOriginType: e.target.value }))}
                                                        className='w-full rounded-xl px-4 py-3 border outline-none cursor-pointer'
                                                        style={{ borderColor: 'var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                                                    >
                                                        {originTypeOptions.map(option => (
                                                            <option key={option.value} value={option.value}>{option.label}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <input
                                                    value={editForm.quoteOriginTitle}
                                                    onChange={(e) => setEditForm(prev => ({ ...prev, quoteOriginTitle: e.target.value }))}
                                                    placeholder='Obra / Libro / Canción'
                                                    className='w-full rounded-xl px-4 py-3 border outline-none'
                                                    style={{ borderColor: 'var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                                                />
                                                <input
                                                    value={editForm.quoteOriginReference}
                                                    onChange={(e) => setEditForm(prev => ({ ...prev, quoteOriginReference: e.target.value }))}
                                                    placeholder='Referencia'
                                                    className='w-full rounded-xl px-4 py-3 border outline-none'
                                                    style={{ borderColor: 'var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                                                />
                                                <input
                                                    value={editForm.quoteSource}
                                                    onChange={(e) => setEditForm(prev => ({ ...prev, quoteSource: e.target.value }))}
                                                    placeholder='Fuente'
                                                    className='w-full rounded-xl px-4 py-3 border outline-none'
                                                    style={{ borderColor: 'var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                                                />
                                                <input
                                                    value={editForm.quoteNotes}
                                                    onChange={(e) => setEditForm(prev => ({ ...prev, quoteNotes: e.target.value }))}
                                                    placeholder='Notas'
                                                    className='w-full rounded-xl px-4 py-3 border outline-none'
                                                    style={{ borderColor: 'var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                                                />
                                            </div>
                                        ) : (
                                            <div>
                                                <p className='text-sm font-semibold' style={{ color: 'var(--text-primary)' }}>{item.contributed_by_name}</p>
                                                {item.quote_source && (
                                                    <p className='text-xs mt-1' style={{ color: 'var(--text-secondary)' }}>Fuente: {item.quote_source}</p>
                                                )}
                                                {item.quote_origin_reference && (
                                                    <p className='text-xs mt-1' style={{ color: 'var(--text-secondary)' }}>Ref: {item.quote_origin_reference}</p>
                                                )}
                                                {item.quote_notes && (
                                                    <p className='text-xs mt-1' style={{ color: 'var(--text-secondary)' }}>Notas: {item.quote_notes}</p>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                    <td className='px-4 py-4 align-top'>
                                        <div className='flex items-center gap-2'>
                                            <button
                                                type='button'
                                                onClick={() => openReactionUsers(item, 'like')}
                                                disabled={!isAdmin}
                                                className='inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 border text-xs font-bold transition-all duration-200 disabled:opacity-70'
                                                style={{
                                                    borderColor: 'var(--card-border)',
                                                    background: 'transparent',
                                                    color: 'var(--text-secondary)',
                                                    cursor: isAdmin ? 'pointer' : 'default'
                                                }}
                                                onMouseEnter={(e) => {
                                                    if (!isAdmin) return
                                                    const target = e.currentTarget
                                                    target.style.borderColor = '#67F0C0'
                                                    target.style.background = 'color-mix(in srgb, #67F0C0 36%, var(--card-bg))'
                                                    target.style.color = '#67F0C0'
                                                }}
                                                onMouseLeave={(e) => {
                                                    if (!isAdmin) return
                                                    const target = e.currentTarget
                                                    target.style.borderColor = 'var(--card-border)'
                                                    target.style.background = 'transparent'
                                                    target.style.color = 'var(--text-secondary)'
                                                }}
                                            >
                                                👍 {item.likes_count || 0}
                                            </button>
                                            <button
                                                type='button'
                                                onClick={() => openReactionUsers(item, 'dislike')}
                                                disabled={!isAdmin}
                                                className='inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 border text-xs font-bold transition-all duration-200 disabled:opacity-70'
                                                style={{
                                                    borderColor: 'var(--card-border)',
                                                    background: 'transparent',
                                                    color: 'var(--text-secondary)',
                                                    cursor: isAdmin ? 'pointer' : 'default'
                                                }}
                                                onMouseEnter={(e) => {
                                                    if (!isAdmin) return
                                                    const target = e.currentTarget
                                                    target.style.borderColor = '#FF8B8B'
                                                    target.style.background = 'color-mix(in srgb, #FF8B8B 36%, var(--card-bg))'
                                                    target.style.color = '#FF8B8B'
                                                }}
                                                onMouseLeave={(e) => {
                                                    if (!isAdmin) return
                                                    const target = e.currentTarget
                                                    target.style.borderColor = 'var(--card-border)'
                                                    target.style.background = 'transparent'
                                                    target.style.color = 'var(--text-secondary)'
                                                }}
                                            >
                                                👎 {item.dislikes_count || 0}
                                            </button>
                                        </div>
                                    </td>
                                    <td className='px-4 py-4 align-top'>
                                        <span
                                            className='inline-flex items-center rounded-full px-3 py-1 text-xs font-bold border'
                                            style={{
                                                borderColor: item.is_active ? '#5BC69E' : '#F3C979',
                                                color: item.is_active ? '#4FAE8A' : '#B8892C',
                                                background: item.is_active ? 'color-mix(in srgb, #5BC69E 18%, transparent)' : 'color-mix(in srgb, #F3C979 18%, transparent)'
                                            }}
                                        >
                                            {item.is_active ? 'Activa' : 'Inactiva'}
                                        </span>
                                    </td>
                                    {isEditMode && (
                                        <td className='px-4 py-4 align-top'>
                                            <div className='flex items-center gap-1.5'>
                                                {editingId === item.id ? (
                                                    <>
                                                        <button
                                                            type='button'
                                                            onClick={() => onUpdate(item.id)}
                                                            disabled={isPending || !hasEditChanges}
                                                            className='inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold border border-transparent text-emerald-500 hover:bg-emerald-500/10 hover:border-emerald-500/35 hover:text-emerald-400 transition-all disabled:opacity-60 disabled:cursor-not-allowed'
                                                            style={{ cursor: (isPending || !hasEditChanges) ? 'not-allowed' : 'pointer' }}
                                                            title='Guardar cambios'
                                                        >
                                                            <Check size={16} strokeWidth={2.4} />
                                                            Guardar cambios
                                                        </button>
                                                        <button
                                                            type='button'
                                                            onClick={cancelEditing}
                                                            disabled={isPending}
                                                            className='p-2 rounded-xl border border-transparent text-slate-500 hover:bg-slate-500/10 hover:border-slate-500/35 hover:text-slate-400 transition-all disabled:opacity-60 disabled:cursor-not-allowed'
                                                            style={{ cursor: isPending ? 'not-allowed' : 'pointer' }}
                                                            title='Cancelar edición'
                                                        >
                                                            <X size={16} strokeWidth={2.4} />
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button
                                                            type='button'
                                                            onClick={() => startEditing(item)}
                                                            disabled={isPending}
                                                            className='p-2 rounded-xl border border-transparent text-amber-500 hover:bg-amber-500/10 hover:border-amber-500/35 hover:text-amber-400 transition-all disabled:opacity-60 disabled:cursor-not-allowed'
                                                            style={{ cursor: isPending ? 'not-allowed' : 'pointer' }}
                                                            title='Editar frase'
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                                <path d="M12 20h9" />
                                                                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                                                            </svg>
                                                        </button>
                                                        <button
                                                            type='button'
                                                            onClick={() => onToggle(item.id, !item.is_active)}
                                                            disabled={isPending}
                                                            className='p-2 rounded-xl border border-transparent text-slate-500 hover:bg-slate-500/10 hover:border-slate-500/35 hover:text-slate-400 transition-all disabled:opacity-60 disabled:cursor-not-allowed'
                                                            style={{ cursor: isPending ? 'not-allowed' : 'pointer' }}
                                                            title={item.is_active ? 'Desactivar frase' : 'Activar frase'}
                                                        >
                                                            {item.is_active ? <ToggleRight size={18} strokeWidth={2.4} /> : <ToggleLeft size={18} strokeWidth={2.4} />}
                                                        </button>
                                                        <button
                                                            type='button'
                                                            onClick={() => onDelete(item.id)}
                                                            disabled={isPending}
                                                            className='p-2 rounded-xl border border-transparent text-rose-500 hover:bg-rose-500/10 hover:border-rose-500/35 hover:text-rose-400 transition-all disabled:opacity-60 disabled:cursor-not-allowed'
                                                            style={{ cursor: isPending ? 'not-allowed' : 'pointer' }}
                                                            title='Eliminar frase'
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                                <path d="M3 6h18" />
                                                                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                                            </svg>
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {filteredQuotes.length === 0 && (
                    <div className='border-t px-6 py-5 text-sm font-medium' style={{ borderColor: 'var(--card-border)', color: 'var(--text-secondary)' }}>
                        No hay frases que coincidan con los filtros.
                    </div>
                )}
            </div>

            {reactionModal.isOpen && (
                <div
                    className='fixed inset-0 z-[1200] flex items-center justify-center p-4'
                    style={{ background: 'rgba(0, 0, 0, 0.45)' }}
                    onClick={closeReactionModal}
                >
                    <div
                        className='w-full max-w-xl rounded-2xl border shadow-2xl overflow-hidden'
                        style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className='px-5 py-4 border-b flex items-center justify-between gap-3' style={{ borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}>
                            <div>
                                <p className='text-[11px] font-black uppercase tracking-[0.18em]' style={{ color: 'var(--text-secondary)' }}>
                                    {reactionModal.reactionType === 'like' ? 'Likes' : 'Dislikes'}
                                </p>
                                <p className='text-sm mt-1 font-semibold line-clamp-1' style={{ color: 'var(--text-primary)' }}>
                                    &quot;{reactionModal.quoteText}&quot;
                                </p>
                            </div>
                            <button
                                type='button'
                                onClick={closeReactionModal}
                                className='p-2 rounded-lg border transition-all hover:brightness-105 cursor-pointer'
                                style={{ borderColor: 'var(--card-border)', color: 'var(--text-secondary)', background: 'var(--card-bg)' }}
                            >
                                <X size={16} strokeWidth={2.4} />
                            </button>
                        </div>

                        <div className='max-h-[60vh] overflow-y-auto p-4'>
                            {reactionModal.loading && (
                                <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>Cargando reacciones...</p>
                            )}
                            {!reactionModal.loading && reactionModal.error && (
                                <p className='text-sm font-semibold' style={{ color: '#E35D6A' }}>{reactionModal.error}</p>
                            )}
                            {!reactionModal.loading && !reactionModal.error && reactionModal.users.length === 0 && (
                                <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>Aún no hay reacciones de este tipo.</p>
                            )}
                            {!reactionModal.loading && !reactionModal.error && reactionModal.users.length > 0 && (
                                <div className='space-y-2'>
                                    {reactionModal.users.map((user) => (
                                        <div
                                            key={`${reactionModal.reactionType}-${user.user_id}-${user.created_at}`}
                                            className='rounded-xl border px-3 py-2'
                                            style={{ borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}
                                        >
                                            <p className='text-sm font-semibold' style={{ color: 'var(--text-primary)' }}>{user.full_name}</p>
                                            {user.email && (
                                                <p className='text-xs mt-0.5' style={{ color: 'var(--text-secondary)' }}>{user.email}</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {showSavePopup && (
                <div
                    className='fixed bottom-6 right-6 z-[1300] rounded-2xl border px-4 py-3 shadow-2xl'
                    style={{
                        borderColor: 'color-mix(in srgb, #5BC69E 55%, var(--card-border))',
                        background: 'color-mix(in srgb, #5BC69E 18%, var(--card-bg))',
                        color: '#4FAE8A'
                    }}
                >
                    <p className='text-sm font-bold'>Cambios guardados correctamente</p>
                </div>
            )}
        </section>
    )
}
