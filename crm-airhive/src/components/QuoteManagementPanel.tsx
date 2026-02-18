'use client'

import { FormEvent, useEffect, useMemo, useState, useTransition } from 'react'
import { Check, CheckCircle2, MessageSquareQuote, Pencil, Plus, ToggleLeft, ToggleRight, Trash2, X } from 'lucide-react'
import { bootstrapLegacyQuotesIfEmpty, createQuote, deleteQuote, getAirHiveUsersForQuotes, getAllQuotesForAdmin, getMyQuoteAuthorPreset, toggleQuoteActive, updateQuote } from '@/app/actions/quotes'

type QuoteRow = {
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
}

type Props = {
    initialQuotes: QuoteRow[]
    initialLoadError?: string
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
    quoteSource: '',
    quoteAuthorContext: '',
    contributedByName: '',
    isOwnQuote: false,
    quoteYear: '',
    quoteOriginType: '',
    quoteOriginTitle: '',
    quoteOriginReference: '',
    quoteNotes: ''
}

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
    const [quotes, setQuotes] = useState<QuoteRow[]>(initialQuotes)
    const [isPending, startTransition] = useTransition()
    const [isEditMode, setIsEditMode] = useState(false)
    const [notice, setNotice] = useState<string>('')
    const [error, setError] = useState<string>(initialLoadError)
    const [form, setForm] = useState({ ...emptyForm })
    const [editingId, setEditingId] = useState<number | null>(null)
    const [editForm, setEditForm] = useState({ ...emptyForm })
    const [airHiveAuthors, setAirHiveAuthors] = useState<Array<{ id: string, full_name: string, author_context: string }>>([])

    const activeCount = useMemo(() => quotes.filter(q => q.is_active).length, [quotes])

    useEffect(() => {
        let cancelled = false
        const loadAuthors = async () => {
            const result = await getAirHiveUsersForQuotes()
            if (!cancelled && result.success) {
                const users = (result.data || []).map((u: any) => ({
                    id: String(u.id),
                    full_name: String(u.full_name || ''),
                    author_context: String(u.author_context || '')
                }))
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

            const currentResult = await getAllQuotesForAdmin()
            if (!cancelled && currentResult.success && (currentResult.data || []).length > 0) {
                setQuotes(currentResult.data as QuoteRow[])
                return
            }

            await bootstrapLegacyQuotesIfEmpty()
            const refreshed = await getAllQuotesForAdmin()
            if (!cancelled && refreshed.success && (refreshed.data || []).length > 0) {
                setQuotes(refreshed.data as QuoteRow[])
            }
        }

        hydrateQuotes()
        return () => { cancelled = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])


    const reload = async () => {
        const result = await getAllQuotesForAdmin()
        if (result.success) setQuotes(result.data as QuoteRow[])
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
            const result = await createQuote(form)
            if (!result.success) {
                setError(result.error || 'No se pudo guardar la frase')
                return
            }
            setNotice('La frase se registró correctamente en el CRM.')
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
        setEditForm({
            quoteText: item.quote_text || '',
            quoteAuthor: item.quote_author || '',
            quoteSource: item.quote_source || '',
            quoteAuthorContext: item.quote_author_context || '',
            contributedByName: item.contributed_by_name || '',
            isOwnQuote: !!item.is_own_quote,
            quoteYear: item.quote_year?.toString() || '',
            quoteOriginType: item.quote_origin_type || '',
            quoteOriginTitle: item.quote_origin_title || '',
            quoteOriginReference: item.quote_origin_reference || '',
            quoteNotes: item.quote_notes || ''
        })
    }

    const cancelEditing = () => {
        setEditingId(null)
        setEditForm({ ...emptyForm })
    }

    const onUpdate = (id: number) => {
        setNotice('')
        setError('')
        startTransition(async () => {
            const result = await updateQuote(id, editForm)
            if (!result.success) {
                setError(result.error || 'No se pudo editar la frase')
                return
            }
            setNotice('La frase se actualizó correctamente.')
            cancelEditing()
            await reload()
        })
    }

    const toggleEditMode = () => {
        setIsEditMode(prev => {
            const next = !prev
            if (!next) cancelEditing()
            return next
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
                </div>

                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                    <select
                        value=''
                        onChange={(e) => {
                            const userId = e.target.value
                            const selected = airHiveAuthors.find(item => item.id === userId)
                            if (!selected) return
                            setForm(prev => ({
                                ...prev,
                                quoteAuthor: selected.full_name,
                                quoteAuthorContext: selected.author_context || prev.quoteAuthorContext,
                                isOwnQuote: true,
                                quoteOriginType: prev.quoteOriginType || 'propia'
                            }))
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
                        onChange={(e) => setForm(prev => ({ ...prev, quoteAuthor: e.target.value }))}
                        placeholder='Autor de la frase'
                        className='rounded-xl px-4 py-3 border outline-none'
                        style={{ borderColor: 'var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                    />
                </div>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                    <input
                        value={form.contributedByName}
                        onChange={(e) => setForm(prev => ({ ...prev, contributedByName: e.target.value }))}
                        placeholder='Aportada por'
                        className='rounded-xl px-4 py-3 border outline-none'
                        style={{ borderColor: 'var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                    />
                    <div />
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
                        onChange={(e) => setForm(prev => ({ ...prev, quoteAuthorContext: e.target.value }))}
                        placeholder='Contexto del autor (puesto, perfil...)'
                        className='rounded-xl px-4 py-3 border outline-none'
                        style={{ borderColor: 'var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
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
                    Registrar frase
                </button>
            </form>

            <div className='rounded-2xl border overflow-hidden' style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
                <div className='px-4 py-3 border-b flex items-center justify-between gap-3' style={{ borderColor: 'var(--card-border)', background: 'var(--hover-bg)' }}>
                    <p className='text-xs font-black uppercase tracking-[0.2em]' style={{ color: 'var(--text-secondary)' }}>
                        Repertorio de frases
                    </p>
                    <button
                        type='button'
                        onClick={toggleEditMode}
                        className='inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] border transition-all hover:brightness-105 cursor-pointer'
                        style={{
                            borderColor: isEditMode ? '#2048FF' : 'var(--card-border)',
                            background: isEditMode ? 'color-mix(in srgb, #2048FF 14%, var(--card-bg))' : 'var(--card-bg)',
                            color: isEditMode ? '#2048FF' : 'var(--text-secondary)'
                        }}
                    >
                        <Pencil size={13} />
                        {isEditMode ? 'Salir edición' : 'Editar frases'}
                    </button>
                </div>
                <div className='overflow-x-auto'>
                    <table className='w-full min-w-[980px]'>
                        <thead>
                            <tr style={{ background: 'var(--hover-bg)' }}>
                                <th className='px-4 py-3 text-left text-xs font-black uppercase tracking-[0.2em]' style={{ color: 'var(--text-secondary)' }}>Frase</th>
                                <th className='px-4 py-3 text-left text-xs font-black uppercase tracking-[0.2em]' style={{ color: 'var(--text-secondary)' }}>Autor</th>
                                <th className='px-4 py-3 text-left text-xs font-black uppercase tracking-[0.2em]' style={{ color: 'var(--text-secondary)' }}>Aportada por</th>
                                <th className='px-4 py-3 text-left text-xs font-black uppercase tracking-[0.2em]' style={{ color: 'var(--text-secondary)' }}>Estado</th>
                                {isEditMode && (
                                    <th className='px-4 py-3 text-left text-xs font-black uppercase tracking-[0.2em]' style={{ color: 'var(--text-secondary)' }}>Acciones</th>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {quotes.map((item) => (
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
                                                <p className='text-sm italic leading-relaxed' style={{ color: 'var(--text-primary)' }}>
                                                    "{item.quote_text}"
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
                                                {item.quote_author_context && (
                                                    <p className='text-xs mt-1' style={{ color: 'var(--text-secondary)' }}>{item.quote_author_context}</p>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                    <td className='px-4 py-4 align-top'>
                                        {editingId === item.id ? (
                                            <div className='space-y-2'>
                                                <input
                                                    value={editForm.contributedByName}
                                                    onChange={(e) => setEditForm(prev => ({ ...prev, contributedByName: e.target.value }))}
                                                    className='w-full rounded-xl px-4 py-3 border outline-none'
                                                    style={{ borderColor: 'var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                                                />
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
                                                            disabled={isPending}
                                                            className='p-2 rounded-xl border border-transparent text-emerald-500 hover:bg-emerald-500/10 hover:border-emerald-500/35 hover:text-emerald-400 transition-all disabled:opacity-60 disabled:cursor-not-allowed'
                                                            style={{ cursor: isPending ? 'not-allowed' : 'pointer' }}
                                                            title='Guardar cambios'
                                                        >
                                                            <Check size={16} strokeWidth={2.4} />
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
                                                            <Pencil size={16} strokeWidth={2.4} />
                                                        </button>
                                                        <button
                                                            type='button'
                                                            onClick={() => onToggle(item.id, !item.is_active)}
                                                            disabled={isPending}
                                                            className='p-2 rounded-xl border border-transparent transition-all disabled:opacity-60 disabled:cursor-not-allowed'
                                                            style={{ color: item.is_active ? '#4FAE8A' : '#B8892C', cursor: isPending ? 'not-allowed' : 'pointer' }}
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
                                                            <Trash2 size={16} strokeWidth={2.4} />
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

                {quotes.length === 0 && (
                    <div className='border-t px-6 py-5 text-sm font-medium' style={{ borderColor: 'var(--card-border)', color: 'var(--text-secondary)' }}>
                        No hay frases registradas.
                    </div>
                )}
            </div>
        </section>
    )
}
