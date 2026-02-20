'use server'

import { createAdminClient } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

type CreateQuoteInput = {
    quoteText: string
    quoteAuthor: string
    quoteAuthorUserId?: string | null
    quoteSource?: string | null
    quoteAuthorContext?: string | null
    contributedByName?: string | null
    contributedByUserId?: string | null
    isOwnQuote?: boolean
    quoteYear?: number | string | null
    quoteOriginType?: string | null
    quoteOriginTitle?: string | null
    quoteOriginReference?: string | null
    quoteNotes?: string | null
}

type QuoteReactionType = 'like' | 'dislike'
type QuoteRequestReviewDecision = 'approved' | 'rejected'

type UpdateQuoteInput = {
    quoteText: string
    quoteAuthor: string
    quoteSource?: string | null
    quoteAuthorContext?: string | null
    contributedByName?: string | null
    contributedByUserId?: string | null
    isOwnQuote?: boolean
    quoteYear?: number | string | null
    quoteOriginType?: string | null
    quoteOriginTitle?: string | null
    quoteOriginReference?: string | null
    quoteNotes?: string | null
}

type QuoteReactionStats = {
    likes_count: number
    dislikes_count: number
    current_user_reaction: QuoteReactionType | null
}

function normalizeComparableName(value: unknown) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase()
}

function normalizeNullableText(value: unknown) {
    const text = String(value ?? '').trim()
    return text || null
}

function normalizeNullableYear(value: unknown) {
    if (value === null || value === undefined || value === '') return null
    const year = Number(value)
    if (!Number.isFinite(year)) return null
    const normalized = Math.trunc(year)
    if (normalized < 1200 || normalized > 2200) return null
    return normalized
}

function isMissingColumnError(error: any, columnName: string) {
    const code = String(error?.code || '')
    const message = String(error?.message || '').toLowerCase()
    return code === '42703' || (message.includes('column') && message.includes(columnName.toLowerCase()))
}

const METADATA_COLUMNS = [
    'is_own_quote',
    'quote_year',
    'quote_origin_type',
    'quote_origin_title',
    'quote_origin_reference',
    'quote_notes'
] as const

function hasMissingMetadataColumnError(error: any) {
    return METADATA_COLUMNS.some((column) => isMissingColumnError(error, column))
}

function stripMetadataFields<T extends Record<string, any>>(payload: T): T {
    const next = { ...payload }
    METADATA_COLUMNS.forEach((column) => {
        delete (next as any)[column]
    })
    return next
}

function isMissingTableError(error: any, tableName: string) {
    const code = String(error?.code || '').toLowerCase()
    const message = String(error?.message || '').toLowerCase()
    return code === '42p01' || message.includes(tableName.toLowerCase())
}

function emptyReactionStatsMap(quoteIds: number[]): Record<number, QuoteReactionStats> {
    return quoteIds.reduce<Record<number, QuoteReactionStats>>((acc, quoteId) => {
        acc[quoteId] = { likes_count: 0, dislikes_count: 0, current_user_reaction: null }
        return acc
    }, {})
}

async function buildReactionStatsByQuote(
    dbClient: any,
    quoteIds: number[],
    currentUserId: string
) {
    const uniqueIds = Array.from(new Set(quoteIds.filter((id) => Number.isFinite(id))))
    const stats = emptyReactionStatsMap(uniqueIds)
    if (uniqueIds.length === 0) return stats

    const { data, error } = await (dbClient
        .from('crm_quote_reactions') as any)
        .select('quote_id, user_id, reaction_type')
        .in('quote_id', uniqueIds)

    if (error) {
        if (isMissingTableError(error, 'crm_quote_reactions')) return stats
        throw error
    }

    for (const row of (data || [])) {
        const quoteId = Number((row as any).quote_id)
        const reactionType = String((row as any).reaction_type || '') as QuoteReactionType
        const userId = String((row as any).user_id || '')
        if (!stats[quoteId]) continue

        if (reactionType === 'like') stats[quoteId].likes_count += 1
        if (reactionType === 'dislike') stats[quoteId].dislikes_count += 1
        if (userId === currentUserId && (reactionType === 'like' || reactionType === 'dislike')) {
            stats[quoteId].current_user_reaction = reactionType
        }
    }

    return stats
}

const LEGACY_QUOTES_SEED: Array<{
    quote_text: string
    quote_author: string
    quote_source: string | null
    quote_author_context: string | null
    contributed_by_name: string
    is_active: boolean
}> = [
        { quote_text: 'Science is the poetry of reality.', quote_author: 'Richard Dawkins', quote_source: 'The Magic of Reality (2011)', quote_author_context: 'Evolutionary Biologist & Author', contributed_by_name: 'Sistema AirHive (Migración histórica)', is_active: true },
        { quote_text: 'We are going to die, and that makes us the lucky ones. Most people are never going to die because they are never going to be born.', quote_author: 'Richard Dawkins', quote_source: 'Unweaving the Rainbow (1998)', quote_author_context: 'Evolutionary Biologist & Author', contributed_by_name: 'Sistema AirHive (Migración histórica)', is_active: true },
        { quote_text: 'The feeling of awed wonder that science can give us is one of the highest experiences of which the human psyche is capable.', quote_author: 'Richard Dawkins', quote_source: 'Unweaving the Rainbow (1998)', quote_author_context: 'Evolutionary Biologist & Author', contributed_by_name: 'Sistema AirHive (Migración histórica)', is_active: true },
        { quote_text: 'Nature is not cruel, only pitilessly indifferent. This is one of the hardest lessons for humans to learn.', quote_author: 'Richard Dawkins', quote_source: 'River Out of Eden (1995)', quote_author_context: 'Evolutionary Biologist & Author', contributed_by_name: 'Sistema AirHive (Migración histórica)', is_active: true },
        { quote_text: 'Cumulative selection is the key to understanding the complexity of life.', quote_author: 'Richard Dawkins', quote_source: 'The Blind Watchmaker (1986)', quote_author_context: 'Evolutionary Biologist & Author', contributed_by_name: 'Sistema AirHive (Migración histórica)', is_active: true },
        { quote_text: 'The truth is more magical than any myth or made-up mystery or miracle.', quote_author: 'Richard Dawkins', quote_source: 'The Magic of Reality (2011)', quote_author_context: 'Evolutionary Biologist & Author', contributed_by_name: 'Sistema AirHive (Migración histórica)', is_active: true },
        { quote_text: 'Faith is the great cop-out, the great excuse to evade the need to think and evaluate evidence.', quote_author: 'Richard Dawkins', quote_source: 'The God Delusion (2006)', quote_author_context: 'Evolutionary Biologist & Author', contributed_by_name: 'Sistema AirHive (Migración histórica)', is_active: true },
        { quote_text: "Isn't it enough to see that a garden is beautiful without having to believe that there are fairies at the bottom of it too?", quote_author: 'Richard Dawkins', quote_source: 'Unweaving the Rainbow (1998)', quote_author_context: 'Evolutionary Biologist & Author', contributed_by_name: 'Sistema AirHive (Migración histórica)', is_active: true },
        { quote_text: 'Quien gana la carrera no es necesariamente el más rápido, sino quien cruza la meta primero.', quote_author: 'Jesús Gracia', quote_source: 'Declaración interna en AirHive', quote_author_context: 'Director Comercial de AirHive', contributed_by_name: 'Sistema AirHive (Migración histórica)', is_active: true },
        { quote_text: 'A la única persona que le gusta el cambio es a un bebé con un pañal sucio.', quote_author: 'Jesús Gracia', quote_source: 'Declaración interna en AirHive', quote_author_context: 'Director Comercial de AirHive', contributed_by_name: 'Sistema AirHive (Migración histórica)', is_active: true },
        { quote_text: 'Si no sacrificas por lo que quieres, lo que quieres se convierte en sacrificio.', quote_author: 'Rafael Sedas', quote_source: 'Declaración interna en Air Hive', quote_author_context: 'Director Operativo y Director Financiero de Air Hive', contributed_by_name: 'Rafael Sedas', is_active: true },
        { quote_text: 'Si tu y yo nos queremos, no necesitamos a nadie más.', quote_author: 'Enjambre', quote_source: 'Frase atribuida por colaborador', quote_author_context: null, contributed_by_name: 'Rafael Sedas', is_active: true }
    ]

async function getCurrentUserAndRole() {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) throw new Error('No autenticado')

    const { data: profile, error } = await supabase
        .from('profiles')
        .select('id, role, full_name')
        .eq('id', user.id)
        .single()

    if (error || !profile) throw new Error('No se pudo validar el perfil del usuario')

    return {
        userId: user.id,
        role: (profile as any).role,
        fullName: (profile as any).full_name
    }
}

async function assertAdmin() {
    const current = await getCurrentUserAndRole()
    if (current.role !== 'admin') throw new Error('No tienes permisos para gestionar frases')
    return current
}

async function resolveAuthorPreset(
    userId: string,
    role: string | null,
    fullName: string | null,
    dbClientOverride?: any
) {
    let dbClient: any = dbClientOverride
    if (!dbClient) {
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)
        dbClient = supabase
        try {
            dbClient = createAdminClient()
        } catch {
            dbClient = supabase
        }
    }

    const { data: detail, error: detailError } = await (dbClient
        .from('employee_profiles') as any)
        .select('job_position_ids, job_position_id, job_positions')
        .eq('user_id', userId)
        .maybeSingle()

    if (detailError) {
        const code = String(detailError?.code || '').toLowerCase()
        if (code !== '42p01' && code !== '42703') {
            return {
                success: false,
                error: detailError.message || 'No se pudo cargar el puesto del autor'
            }
        }
    }

    const positionIds = new Set<string>()
    const positionNames = new Set<string>()
    const rawPositions = (detail as any)?.job_position_ids ?? (detail as any)?.job_positions
    if (Array.isArray(rawPositions)) {
        for (const item of rawPositions) {
            if (typeof item === 'string' && item.trim()) positionIds.add(item.trim())
            if (item && typeof item === 'object') {
                if (typeof item.id === 'string' && item.id.trim()) positionIds.add(item.id.trim())
                if (typeof item.name === 'string' && item.name.trim()) positionNames.add(item.name.trim())
                if (typeof item.label === 'string' && item.label.trim()) positionNames.add(item.label.trim())
            }
        }
    } else if (typeof rawPositions === 'string' && rawPositions.trim()) {
        rawPositions.split(',').map((v: string) => v.trim()).filter(Boolean).forEach((v: string) => {
            if (/^[a-f0-9-]{8,}$/i.test(v)) positionIds.add(v)
            else positionNames.add(v)
        })
    }
    if (typeof (detail as any)?.job_position_id === 'string' && (detail as any).job_position_id.trim()) {
        positionIds.add((detail as any).job_position_id.trim())
    }
    if (typeof (detail as any)?.job_position === 'string' && (detail as any).job_position.trim()) {
        positionNames.add((detail as any).job_position.trim())
    }

    if (positionIds.size === 0 && positionNames.size === 0) {
        return {
            success: true,
            data: {
                quoteAuthor: String(fullName || 'Colaborador AirHive'),
                quoteAuthorContext: ''
            }
        }
    }

    const { data: positions } = await (dbClient
        .from('job_positions') as any)
        .select('id, name')
        .in('id', Array.from(positionIds))

    const namesFromCatalog = (positions || [])
        .map((item: any) => String(item?.name || '').trim())
        .filter(Boolean)
    const names = Array.from(new Set([...Array.from(positionNames), ...namesFromCatalog]))

    return {
        success: true,
        data: {
            quoteAuthor: String(fullName || 'Colaborador AirHive'),
            quoteAuthorContext: names.length > 0 ? names.join(' / ') : ''
        }
    }
}

export async function getMyQuoteAuthorPreset() {
    try {
        const current = await getCurrentUserAndRole()
        const preset = await resolveAuthorPreset(current.userId, current.role, current.fullName)
        if (!preset.success) throw new Error(preset.error || 'No se pudo resolver el autor')
        return { success: true, data: preset.data }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function getQuoteAuthorPresetByUserId(userId: string) {
    try {
        await getCurrentUserAndRole()
        const normalizedUserId = String(userId || '').trim()
        if (!normalizedUserId) throw new Error('Usuario inválido')

        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)
        let dbClient: any = supabase
        try {
            dbClient = createAdminClient()
        } catch {
            dbClient = supabase
        }

        const { data: user, error } = await (dbClient
            .from('profiles') as any)
            .select('id, full_name, role')
            .eq('id', normalizedUserId)
            .maybeSingle()

        if (error) throw error
        if (!user) throw new Error('No se encontró el usuario')

        const preset = await resolveAuthorPreset(user.id, user.role, user.full_name, dbClient)
        if (!preset.success || !preset.data) throw new Error(preset.error || 'No se pudo obtener el puesto del autor')

        let quoteAuthorContext = String(preset.data.quoteAuthorContext || '').trim()
        if (!quoteAuthorContext && user.full_name) {
            const { data: quoteCandidates } = await (dbClient
                .from('crm_quotes') as any)
                .select('quote_author, quote_author_context')
                .not('quote_author_context', 'is', null)
                .order('created_at', { ascending: false })
                .limit(300)

            const wanted = normalizeComparableName(user.full_name)
            const matched = (quoteCandidates || []).find((row: any) => {
                return normalizeComparableName((row as any)?.quote_author) === wanted
            })
            quoteAuthorContext = String((matched as any)?.quote_author_context || '').trim()
        }

        return {
            success: true,
            data: {
                quoteAuthor: String(user.full_name || preset.data.quoteAuthor || ''),
                quoteAuthorContext
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function getAirHiveUsersForQuotes() {
    try {
        await getCurrentUserAndRole()
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)
        let dbClient: any = supabase
        try {
            dbClient = createAdminClient()
        } catch {
            dbClient = supabase
        }

        const { data: users, error } = await (dbClient
            .from('profiles') as any)
            .select('id, full_name, role')
            .not('full_name', 'is', null)
            .order('full_name', { ascending: true })

        if (error) throw error

        const enriched = await Promise.all((users || []).map(async (user: any) => {
            const preset = await resolveAuthorPreset(user.id, user.role, user.full_name, dbClient)
            let authorContext = preset.success ? String(preset.data?.quoteAuthorContext || '') : ''

            if (!authorContext && user.full_name) {
                const { data: quoteCandidates } = await (dbClient
                    .from('crm_quotes') as any)
                    .select('quote_author, quote_author_context')
                    .not('quote_author_context', 'is', null)
                    .order('created_at', { ascending: false })
                    .limit(300)

                const wanted = normalizeComparableName(user.full_name)
                const matched = (quoteCandidates || []).find((row: any) => {
                    return normalizeComparableName((row as any)?.quote_author) === wanted
                })
                authorContext = String((matched as any)?.quote_author_context || '').trim()
            }

            return {
                id: user.id,
                full_name: user.full_name,
                role: user.role,
                author_context: authorContext
            }
        }))

        return { success: true, data: enriched }
    } catch (error: any) {
        return { success: false, error: error.message, data: [] as any[] }
    }
}

async function hydrateAuthorContextFromProfileIfMissing(
    dbClient: any,
    quoteAuthor: string,
    currentContext: string | null
) {
    const normalizedContext = String(currentContext || '').trim()
    if (normalizedContext) return normalizedContext

    const normalizedAuthor = normalizeComparableName(quoteAuthor)
    if (!normalizedAuthor) return null

    const { data: users, error } = await (dbClient
        .from('profiles') as any)
        .select('id, full_name, role')
        .not('full_name', 'is', null)
        .order('created_at', { ascending: false })
        .limit(500)

    if (error) return null

    const matched = (users || []).find((user: any) => {
        return normalizeComparableName((user as any)?.full_name) === normalizedAuthor
    })

    if (!matched) return null

    const preset = await resolveAuthorPreset(
        String((matched as any).id || ''),
        (matched as any).role || null,
        (matched as any).full_name || null,
        dbClient
    )

    if (!preset.success || !preset.data) return null
    const context = String(preset.data.quoteAuthorContext || '').trim()
    return context || null
}

export async function bootstrapLegacyQuotesIfEmpty() {
    try {
        const current = await assertAdmin()
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)
        let dbClient: any = supabase
        try {
            dbClient = createAdminClient()
        } catch {
            dbClient = supabase
        }

        const { data: existingRows, error: existingError } = await (dbClient
            .from('crm_quotes') as any)
            .select('id, quote_text, quote_author')
            .is('deleted_at', null)

        if (existingError) throw existingError
        if ((existingRows || []).length > 0) return { success: true, inserted: 0 }

        const signatures = new Set<string>((existingRows || []).map((row: any) => `${row.quote_author}|||${row.quote_text}`))
        const payload = LEGACY_QUOTES_SEED
            .filter((item) => !signatures.has(`${item.quote_author}|||${item.quote_text}`))
            .map((item) => ({
                ...item,
                created_by: current.userId,
                updated_by: current.userId
            }))

        if (payload.length > 0) {
            const { error: insertError } = await (dbClient
                .from('crm_quotes') as any)
                .insert(payload)
            if (insertError) throw insertError
        }

        revalidatePath('/settings/personalizacion')
        return { success: true, inserted: payload.length }
    } catch (error: any) {
        return { success: false, error: error.message, inserted: 0 }
    }
}

export async function getActiveQuotes() {
    try {
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)
        const current = await getCurrentUserAndRole()

        let dbClient: any = supabase
        try {
            dbClient = createAdminClient()
        } catch {
            dbClient = supabase
        }

        const fullSelect = 'id, quote_text, quote_author, quote_source, quote_author_context, contributed_by_name, is_active, created_at, is_own_quote, quote_year, quote_origin_type, quote_origin_title, quote_origin_reference, quote_notes'
        const baseSelect = 'id, quote_text, quote_author, quote_source, quote_author_context, contributed_by, contributed_by_name, is_active, created_at'

        const selectForQuery = `${fullSelect}, contributed_by`

        let { data, error } = await (dbClient
            .from('crm_quotes') as any)
            .select(selectForQuery)
            .is('deleted_at', null)
            .eq('is_active', true)
            .order('created_at', { ascending: false })

        if (error && hasMissingMetadataColumnError(error)) {
            const retry = await (dbClient
                .from('crm_quotes') as any)
                .select(baseSelect)
                .is('deleted_at', null)
                .eq('is_active', true)
                .order('created_at', { ascending: false })
            data = retry.data
            error = retry.error
        }

        if (error) {
            const missingTable = String(error?.code || '').toLowerCase() === '42p01'
            if (missingTable) return { success: true, data: [] as any[] }
            throw error
        }

        const rows = (data || []) as any[]
        const quoteIds = rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id))
        const reactionStats = await buildReactionStatsByQuote(dbClient, quoteIds, current.userId)
        const hydratedRows = rows.map((row) => ({
            ...row,
            likes_count: reactionStats[Number(row.id)]?.likes_count || 0,
            dislikes_count: reactionStats[Number(row.id)]?.dislikes_count || 0,
            current_user_reaction: reactionStats[Number(row.id)]?.current_user_reaction || null
        }))

        return { success: true, data: hydratedRows }
    } catch (error: any) {
        return { success: false, error: error.message, data: [] as any[] }
    }
}

export async function getAllQuotesForAdmin() {
    try {
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)
        const current = await assertAdmin()

        let dbClient: any = supabase
        try {
            dbClient = createAdminClient()
        } catch {
            dbClient = supabase
        }

        const fullSelect = 'id, quote_text, quote_author, quote_source, quote_author_context, contributed_by_name, is_active, created_at, updated_at, is_own_quote, quote_year, quote_origin_type, quote_origin_title, quote_origin_reference, quote_notes'
        const baseSelect = 'id, quote_text, quote_author, quote_source, quote_author_context, contributed_by, contributed_by_name, is_active, created_at, updated_at'

        const selectForQuery = `${fullSelect}, contributed_by`

        let { data, error } = await (dbClient
            .from('crm_quotes') as any)
            .select(selectForQuery)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })

        if (error && hasMissingMetadataColumnError(error)) {
            const retry = await (dbClient
                .from('crm_quotes') as any)
                .select(baseSelect)
                .is('deleted_at', null)
                .order('created_at', { ascending: false })
            data = retry.data
            error = retry.error
        }

        if (error) throw error

        const rows = (data || []) as any[]
        const quoteIds = rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id))
        const reactionStats = await buildReactionStatsByQuote(dbClient, quoteIds, current.userId)
        const hydratedRows = rows.map((row) => ({
            ...row,
            likes_count: reactionStats[Number(row.id)]?.likes_count || 0,
            dislikes_count: reactionStats[Number(row.id)]?.dislikes_count || 0,
            current_user_reaction: reactionStats[Number(row.id)]?.current_user_reaction || null
        }))

        return { success: true, data: hydratedRows }
    } catch (error: any) {
        return { success: false, error: error.message, data: [] as any[] }
    }
}

export async function toggleQuoteReaction(quoteId: number, reactionType: QuoteReactionType) {
    try {
        const current = await getCurrentUserAndRole()
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)
        let dbClient: any = supabase
        try {
            dbClient = createAdminClient()
        } catch {
            dbClient = supabase
        }

        if (!Number.isFinite(Number(quoteId))) {
            throw new Error('Frase inválida')
        }
        if (reactionType !== 'like' && reactionType !== 'dislike') {
            throw new Error('Tipo de reacción inválido')
        }

        const { data: existing, error: existingError } = await (dbClient
            .from('crm_quote_reactions') as any)
            .select('id, reaction_type')
            .eq('quote_id', quoteId)
            .eq('user_id', current.userId)
            .maybeSingle()

        if (existingError) {
            if (isMissingTableError(existingError, 'crm_quote_reactions')) {
                throw new Error('El módulo de reacciones no está habilitado aún')
            }
            throw existingError
        }

        const currentReaction = String((existing as any)?.reaction_type || '')
        if (currentReaction === reactionType) {
            const { error: deleteError } = await (dbClient
                .from('crm_quote_reactions') as any)
                .delete()
                .eq('quote_id', quoteId)
                .eq('user_id', current.userId)
            if (deleteError) throw deleteError
        } else if ((existing as any)?.id) {
            const { error: updateError } = await (dbClient
                .from('crm_quote_reactions') as any)
                .update({ reaction_type: reactionType })
                .eq('id', (existing as any).id)
            if (updateError) throw updateError
        } else {
            const { error: insertError } = await (dbClient
                .from('crm_quote_reactions') as any)
                .insert({
                    quote_id: quoteId,
                    user_id: current.userId,
                    reaction_type: reactionType
                })
            if (insertError) throw insertError
        }

        const reactionStats = await buildReactionStatsByQuote(dbClient, [quoteId], current.userId)
        return {
            success: true,
            data: reactionStats[quoteId] || { likes_count: 0, dislikes_count: 0, current_user_reaction: null }
        }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function getQuoteReactionUsers(quoteId: number, reactionType: QuoteReactionType) {
    try {
        await assertAdmin()
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)
        let dbClient: any = supabase
        try {
            dbClient = createAdminClient()
        } catch {
            dbClient = supabase
        }

        if (!Number.isFinite(Number(quoteId))) {
            throw new Error('Frase inválida')
        }
        if (reactionType !== 'like' && reactionType !== 'dislike') {
            throw new Error('Tipo de reacción inválido')
        }

        const { data: reactions, error: reactionsError } = await (dbClient
            .from('crm_quote_reactions') as any)
            .select('user_id, reaction_type, created_at')
            .eq('quote_id', quoteId)
            .eq('reaction_type', reactionType)
            .order('created_at', { ascending: false })

        if (reactionsError) {
            if (isMissingTableError(reactionsError, 'crm_quote_reactions')) {
                return { success: true, data: [] as any[] }
            }
            throw reactionsError
        }

        const userIds = Array.from(new Set((reactions || [])
            .map((item: any) => String(item.user_id || ''))
            .filter(Boolean)))

        if (userIds.length === 0) return { success: true, data: [] as any[] }

        const { data: profiles, error: profilesError } = await (dbClient
            .from('profiles') as any)
            .select('id, full_name, email')
            .in('id', userIds)

        if (profilesError) throw profilesError

        const byUser = new Map<string, { full_name: string | null, email: string | null }>()
        for (const profile of (profiles || [])) {
            byUser.set(String((profile as any).id), {
                full_name: (profile as any).full_name || null,
                email: (profile as any).email || null
            })
        }

        const details = (reactions || []).map((reaction: any) => {
            const userId = String(reaction.user_id || '')
            const profile = byUser.get(userId)
            return {
                user_id: userId,
                full_name: profile?.full_name || 'Usuario sin nombre',
                email: profile?.email || null,
                created_at: reaction.created_at
            }
        })

        return { success: true, data: details }
    } catch (error: any) {
        return { success: false, error: error.message, data: [] as any[] }
    }
}

export async function createQuote(input: CreateQuoteInput) {
    try {
        const current = await assertAdmin()
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)
        let dbClient: any = supabase
        try {
            dbClient = createAdminClient()
        } catch {
            dbClient = supabase
        }

        const isOwnQuote = !!input.isOwnQuote
        const quoteText = String(input.quoteText || '').trim()
        let quoteAuthor = String(input.quoteAuthor || '').trim()
        let quoteAuthorContext = normalizeNullableText(input.quoteAuthorContext)
        const quoteSource = normalizeNullableText(input.quoteSource)
        const contributedByUserId = String(input.contributedByUserId || '').trim() || null
        const contributedByName = String(input.contributedByName || current.fullName || 'Equipo Air Hive').trim()
        const quoteYear = normalizeNullableYear(input.quoteYear)
        let quoteOriginType = normalizeNullableText(input.quoteOriginType)
        const quoteOriginTitle = normalizeNullableText(input.quoteOriginTitle)
        const quoteOriginReference = normalizeNullableText(input.quoteOriginReference)
        const quoteNotes = normalizeNullableText(input.quoteNotes)

        if (isOwnQuote) {
            const preset = await resolveAuthorPreset(current.userId, current.role, current.fullName)
            if (preset.success && preset.data) {
                quoteAuthor = preset.data.quoteAuthor
                quoteAuthorContext = preset.data.quoteAuthorContext
            } else {
                quoteAuthor = String(current.fullName || quoteAuthor || 'Colaborador AirHive')
                quoteAuthorContext = quoteAuthorContext || null
            }
            quoteOriginType = quoteOriginType || 'propia'
        }

        quoteAuthorContext = await hydrateAuthorContextFromProfileIfMissing(dbClient, quoteAuthor, quoteAuthorContext)

        if (!quoteText) throw new Error('La frase es obligatoria')
        if (!quoteAuthor) throw new Error('El autor de la frase es obligatorio')
        if (!contributedByName) throw new Error('El nombre de quien aporta la frase es obligatorio')

        const fullPayload = {
            quote_text: quoteText,
            quote_author: quoteAuthor,
            quote_source: quoteSource,
            quote_author_context: quoteAuthorContext,
            contributed_by: contributedByUserId,
            contributed_by_name: contributedByName,
            is_own_quote: isOwnQuote,
            quote_year: quoteYear,
            quote_origin_type: quoteOriginType,
            quote_origin_title: quoteOriginTitle,
            quote_origin_reference: quoteOriginReference,
            quote_notes: quoteNotes,
            is_active: true,
            created_by: current.userId,
            updated_by: current.userId
        }

        let { error } = await (dbClient
            .from('crm_quotes') as any)
            .insert(fullPayload)

        if (error && hasMissingMetadataColumnError(error)) {
            const fallbackPayload = stripMetadataFields(fullPayload)
            const fallbackInsert = await (dbClient
                .from('crm_quotes') as any)
                .insert(fallbackPayload)
            error = fallbackInsert.error
        }

        if (error) throw error

        revalidatePath('/settings/personalizacion')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function createQuoteRequest(input: CreateQuoteInput) {
    try {
        const current = await getCurrentUserAndRole()
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)
        let dbClient: any = supabase
        try {
            dbClient = createAdminClient()
        } catch {
            dbClient = supabase
        }

        const isOwnQuote = !!input.isOwnQuote
        const quoteText = String(input.quoteText || '').trim()
        let quoteAuthor = String(input.quoteAuthor || '').trim()
        let quoteAuthorContext = normalizeNullableText(input.quoteAuthorContext)
        const quoteSource = normalizeNullableText(input.quoteSource)
        const quoteAuthorUserId = String(input.quoteAuthorUserId || '').trim() || null
        const contributedByUserId = String(input.contributedByUserId || '').trim() || current.userId
        const contributedByName = String(input.contributedByName || current.fullName || 'Equipo AirHive').trim()
        const quoteYear = normalizeNullableYear(input.quoteYear)
        let quoteOriginType = normalizeNullableText(input.quoteOriginType)
        const quoteOriginTitle = normalizeNullableText(input.quoteOriginTitle)
        const quoteOriginReference = normalizeNullableText(input.quoteOriginReference)
        const quoteNotes = normalizeNullableText(input.quoteNotes)

        if (isOwnQuote) {
            const preset = await resolveAuthorPreset(current.userId, current.role, current.fullName)
            if (preset.success && preset.data) {
                quoteAuthor = preset.data.quoteAuthor
                quoteAuthorContext = preset.data.quoteAuthorContext
            }
            quoteOriginType = quoteOriginType || 'propia'
        }

        quoteAuthorContext = await hydrateAuthorContextFromProfileIfMissing(dbClient, quoteAuthor, quoteAuthorContext)

        if (!quoteText) throw new Error('La frase es obligatoria')
        if (!quoteAuthor) throw new Error('El autor de la frase es obligatorio')
        if (!contributedByName) throw new Error('El nombre de quien aporta la frase es obligatorio')

        const payload = {
            quote_text: quoteText,
            quote_author: quoteAuthor,
            quote_author_user_id: quoteAuthorUserId,
            quote_source: quoteSource,
            quote_author_context: quoteAuthorContext,
            contributed_by: contributedByUserId,
            contributed_by_name: contributedByName,
            is_own_quote: isOwnQuote,
            quote_year: quoteYear,
            quote_origin_type: quoteOriginType,
            quote_origin_title: quoteOriginTitle,
            quote_origin_reference: quoteOriginReference,
            quote_notes: quoteNotes,
            status: 'pending',
            requested_by: current.userId
        }

        const { error } = await (dbClient
            .from('crm_quote_requests') as any)
            .insert(payload)

        if (error) throw error

        revalidatePath('/settings/personalizacion')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function getPendingQuoteRequestsForAdmin() {
    try {
        await assertAdmin()
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)
        let dbClient: any = supabase
        try {
            dbClient = createAdminClient()
        } catch {
            dbClient = supabase
        }

        const { data, error } = await (dbClient
            .from('crm_quote_requests') as any)
            .select('id, quote_text, quote_author, quote_author_context, quote_source, contributed_by_name, requested_by, created_at, quote_year, quote_origin_type, quote_origin_title, quote_origin_reference, quote_notes, is_own_quote')
            .eq('status', 'pending')
            .order('created_at', { ascending: false })

        if (error) throw error

        const requests = (data || []) as any[]
        const requesterIds = Array.from(new Set(requests.map((item) => String(item.requested_by || '')).filter(Boolean)))

        const requesterById = new Map<string, { full_name: string, email: string | null }>()
        if (requesterIds.length > 0) {
            const { data: profiles, error: profilesError } = await (dbClient
                .from('profiles') as any)
                .select('id, full_name, email')
                .in('id', requesterIds)
            if (profilesError) throw profilesError
            for (const profile of (profiles || [])) {
                requesterById.set(String((profile as any).id), {
                    full_name: String((profile as any).full_name || 'Usuario'),
                    email: (profile as any).email || null
                })
            }
        }

        const hydrated = requests.map((item) => {
            const requesterId = String(item.requested_by || '')
            return {
                ...item,
                requester_name: requesterById.get(requesterId)?.full_name || 'Usuario',
                requester_email: requesterById.get(requesterId)?.email || null
            }
        })

        return { success: true, data: hydrated }
    } catch (error: any) {
        return { success: false, error: error.message, data: [] as any[] }
    }
}

export async function reviewQuoteRequest(requestId: number, decision: QuoteRequestReviewDecision) {
    try {
        const current = await assertAdmin()
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)
        let dbClient: any = supabase
        try {
            dbClient = createAdminClient()
        } catch {
            dbClient = supabase
        }

        if (!Number.isFinite(Number(requestId))) throw new Error('Solicitud inválida')
        if (decision !== 'approved' && decision !== 'rejected') throw new Error('Decisión inválida')

        const { data: requestRow, error: requestError } = await (dbClient
            .from('crm_quote_requests') as any)
            .select('*')
            .eq('id', requestId)
            .maybeSingle()

        if (requestError) throw requestError
        if (!requestRow) throw new Error('No se encontró la solicitud')
        if (String((requestRow as any).status || '') !== 'pending') {
            throw new Error('La solicitud ya fue procesada')
        }

        if (decision === 'approved') {
            const contributedByUserId = (requestRow as any).contributed_by || (requestRow as any).requested_by || null
            const fullPayload = {
                quote_text: String((requestRow as any).quote_text || '').trim(),
                quote_author: String((requestRow as any).quote_author || '').trim(),
                quote_source: normalizeNullableText((requestRow as any).quote_source),
                quote_author_context: normalizeNullableText((requestRow as any).quote_author_context),
                contributed_by: contributedByUserId,
                contributed_by_name: String((requestRow as any).contributed_by_name || '').trim(),
                is_own_quote: !!(requestRow as any).is_own_quote,
                quote_year: normalizeNullableYear((requestRow as any).quote_year),
                quote_origin_type: normalizeNullableText((requestRow as any).quote_origin_type),
                quote_origin_title: normalizeNullableText((requestRow as any).quote_origin_title),
                quote_origin_reference: normalizeNullableText((requestRow as any).quote_origin_reference),
                quote_notes: normalizeNullableText((requestRow as any).quote_notes),
                is_active: true,
                created_by: current.userId,
                updated_by: current.userId
            }

            let { error: quoteInsertError } = await (dbClient
                .from('crm_quotes') as any)
                .insert(fullPayload)

            if (quoteInsertError && hasMissingMetadataColumnError(quoteInsertError)) {
                const fallbackPayload = stripMetadataFields(fullPayload)
                const fallbackInsert = await (dbClient
                    .from('crm_quotes') as any)
                    .insert(fallbackPayload)
                quoteInsertError = fallbackInsert.error
            }

            if (quoteInsertError) throw quoteInsertError
        }

        const { error: updateError } = await (dbClient
            .from('crm_quote_requests') as any)
            .update({
                status: decision,
                reviewed_at: new Date().toISOString(),
                reviewed_by: current.userId
            })
            .eq('id', requestId)
            .eq('status', 'pending')

        if (updateError) throw updateError

        revalidatePath('/settings/personalizacion')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function getQuoteRequestNotifications() {
    try {
        const current = await getCurrentUserAndRole()
        if (current.role !== 'admin') return { success: true, data: { pendingCount: 0, items: [] as any[] } }

        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)
        let dbClient: any = supabase
        try {
            dbClient = createAdminClient()
        } catch {
            dbClient = supabase
        }

        const { count, error: countError } = await (dbClient
            .from('crm_quote_requests') as any)
            .select('id', { head: true, count: 'exact' })
            .eq('status', 'pending')

        if (countError) throw countError

        const { data, error } = await (dbClient
            .from('crm_quote_requests') as any)
            .select('id, quote_author, contributed_by_name, requested_by, created_at')
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(8)

        if (error) throw error

        const items = (data || []) as any[]
        const requesterIds = Array.from(new Set(items.map((item) => String(item.requested_by || '')).filter(Boolean)))
        const requesterById = new Map<string, string>()
        if (requesterIds.length > 0) {
            const { data: profiles, error: profilesError } = await (dbClient
                .from('profiles') as any)
                .select('id, full_name')
                .in('id', requesterIds)
            if (profilesError) throw profilesError
            for (const profile of (profiles || [])) {
                requesterById.set(String((profile as any).id), String((profile as any).full_name || 'Usuario'))
            }
        }

        return {
            success: true,
            data: {
                pendingCount: count || 0,
                items: items.map((item) => ({
                    id: item.id,
                    quote_author: item.quote_author,
                    contributed_by_name: item.contributed_by_name,
                    created_at: item.created_at,
                    requester_name: requesterById.get(String(item.requested_by || '')) || 'Usuario'
                }))
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message, data: { pendingCount: 0, items: [] as any[] } }
    }
}

export async function toggleQuoteActive(id: number, isActive: boolean) {
    try {
        const current = await assertAdmin()
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)
        let dbClient: any = supabase
        try {
            dbClient = createAdminClient()
        } catch {
            dbClient = supabase
        }

        const { error } = await (dbClient
            .from('crm_quotes') as any)
            .update({
                is_active: isActive,
                updated_by: current.userId
            })
            .eq('id', id)
            .is('deleted_at', null)

        if (error) throw error

        revalidatePath('/settings/personalizacion')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function updateQuote(id: number, input: UpdateQuoteInput) {
    try {
        const current = await assertAdmin()
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)
        let dbClient: any = supabase
        try {
            dbClient = createAdminClient()
        } catch {
            dbClient = supabase
        }

        const quoteText = String(input.quoteText || '').trim()
        const quoteAuthor = String(input.quoteAuthor || '').trim()
        const quoteSource = normalizeNullableText(input.quoteSource)
        let quoteAuthorContext = normalizeNullableText(input.quoteAuthorContext)
        const contributedByUserId = String(input.contributedByUserId || '').trim() || null
        const contributedByName = String(input.contributedByName || '').trim()
        const isOwnQuote = !!input.isOwnQuote
        const quoteYear = normalizeNullableYear(input.quoteYear)
        const quoteOriginType = normalizeNullableText(input.quoteOriginType)
        const quoteOriginTitle = normalizeNullableText(input.quoteOriginTitle)
        const quoteOriginReference = normalizeNullableText(input.quoteOriginReference)
        const quoteNotes = normalizeNullableText(input.quoteNotes)

        if (!quoteText) throw new Error('La frase es obligatoria')
        if (!quoteAuthor) throw new Error('El autor de la frase es obligatorio')
        if (!contributedByName) throw new Error('El nombre de quien aporta la frase es obligatorio')

        quoteAuthorContext = await hydrateAuthorContextFromProfileIfMissing(dbClient, quoteAuthor, quoteAuthorContext)

        const fullPayload = {
            quote_text: quoteText,
            quote_author: quoteAuthor,
            quote_source: quoteSource,
            quote_author_context: quoteAuthorContext,
            contributed_by: contributedByUserId,
            contributed_by_name: contributedByName,
            is_own_quote: isOwnQuote,
            quote_year: quoteYear,
            quote_origin_type: quoteOriginType,
            quote_origin_title: quoteOriginTitle,
            quote_origin_reference: quoteOriginReference,
            quote_notes: quoteNotes,
            updated_by: current.userId
        }

        let { error } = await (dbClient
            .from('crm_quotes') as any)
            .update(fullPayload)
            .eq('id', id)
            .is('deleted_at', null)

        if (error && hasMissingMetadataColumnError(error)) {
            const fallbackPayload = stripMetadataFields(fullPayload)
            const fallbackUpdate = await (dbClient
                .from('crm_quotes') as any)
                .update(fallbackPayload)
                .eq('id', id)
                .is('deleted_at', null)
            error = fallbackUpdate.error
        }

        if (error) throw error

        revalidatePath('/settings/personalizacion')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function deleteQuote(id: number) {
    try {
        const current = await assertAdmin()
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)
        let dbClient: any = supabase
        try {
            dbClient = createAdminClient()
        } catch {
            dbClient = supabase
        }

        const { error } = await (dbClient
            .from('crm_quotes') as any)
            .update({
                deleted_at: new Date().toISOString(),
                deleted_by: current.userId,
                updated_by: current.userId,
                is_active: false
            })
            .eq('id', id)
            .is('deleted_at', null)

        if (error) throw error

        revalidatePath('/settings/personalizacion')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}
