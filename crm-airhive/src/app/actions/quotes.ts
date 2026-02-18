'use server'

import { createAdminClient } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

type CreateQuoteInput = {
    quoteText: string
    quoteAuthor: string
    quoteSource?: string | null
    quoteAuthorContext?: string | null
    contributedByName?: string | null
    isOwnQuote?: boolean
    quoteYear?: number | string | null
    quoteOriginType?: string | null
    quoteOriginTitle?: string | null
    quoteOriginReference?: string | null
    quoteNotes?: string | null
}

type UpdateQuoteInput = {
    quoteText: string
    quoteAuthor: string
    quoteSource?: string | null
    quoteAuthorContext?: string | null
    contributedByName?: string | null
    isOwnQuote?: boolean
    quoteYear?: number | string | null
    quoteOriginType?: string | null
    quoteOriginTitle?: string | null
    quoteOriginReference?: string | null
    quoteNotes?: string | null
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

function roleToAirHiveContext(role: string | null | undefined) {
    const normalized = String(role || '').toLowerCase()
    if (normalized === 'admin') return 'Administrador AirHive'
    if (normalized === 'rh') return 'Recursos Humanos AirHive'
    if (normalized === 'seller') return 'Consultor Comercial AirHive'
    return 'Colaborador AirHive'
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

async function resolveAuthorPreset(userId: string, role: string | null, fullName: string | null) {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)
    let dbClient: any = supabase
    try {
        dbClient = createAdminClient()
    } catch {
        dbClient = supabase
    }

    const fallbackContext = roleToAirHiveContext(role)

    const { data: detail, error: detailError } = await (dbClient
        .from('employee_profiles') as any)
        .select('job_position_ids, job_position_id')
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
    if (Array.isArray((detail as any)?.job_position_ids)) {
        for (const id of (detail as any).job_position_ids) {
            if (typeof id === 'string' && id.trim()) positionIds.add(id.trim())
        }
    }
    if (typeof (detail as any)?.job_position_id === 'string' && (detail as any).job_position_id.trim()) {
        positionIds.add((detail as any).job_position_id.trim())
    }

    if (positionIds.size === 0) {
        return {
            success: true,
            data: {
                quoteAuthor: String(fullName || 'Colaborador AirHive'),
                quoteAuthorContext: fallbackContext
            }
        }
    }

    const { data: positions } = await (dbClient
        .from('job_positions') as any)
        .select('id, name')
        .in('id', Array.from(positionIds))

    const names = (positions || [])
        .map((item: any) => String(item?.name || '').trim())
        .filter(Boolean)

    return {
        success: true,
        data: {
            quoteAuthor: String(fullName || 'Colaborador AirHive'),
            quoteAuthorContext: names.length > 0 ? names.join(' / ') : fallbackContext
        }
    }
}

export async function getMyQuoteAuthorPreset() {
    try {
        const current = await assertAdmin()
        const preset = await resolveAuthorPreset(current.userId, current.role, current.fullName)
        if (!preset.success) throw new Error(preset.error || 'No se pudo resolver el autor')
        return { success: true, data: preset.data }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function getAirHiveUsersForQuotes() {
    try {
        await assertAdmin()
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)

        const { data: users, error } = await (supabase
            .from('profiles') as any)
            .select('id, full_name, role')
            .not('full_name', 'is', null)
            .order('full_name', { ascending: true })

        if (error) throw error

        const enriched = await Promise.all((users || []).map(async (user: any) => {
            const preset = await resolveAuthorPreset(user.id, user.role, user.full_name)
            return {
                id: user.id,
                full_name: user.full_name,
                role: user.role,
                author_context: preset.success ? preset.data?.quoteAuthorContext : roleToAirHiveContext(user.role)
            }
        }))

        return { success: true, data: enriched }
    } catch (error: any) {
        return { success: false, error: error.message, data: [] as any[] }
    }
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
        await getCurrentUserAndRole()

        let dbClient: any = supabase
        try {
            dbClient = createAdminClient()
        } catch {
            dbClient = supabase
        }

        const fullSelect = 'id, quote_text, quote_author, quote_source, quote_author_context, contributed_by_name, is_active, created_at, is_own_quote, quote_year, quote_origin_type, quote_origin_title, quote_origin_reference, quote_notes'
        const baseSelect = 'id, quote_text, quote_author, quote_source, quote_author_context, contributed_by_name, is_active, created_at'

        let { data, error } = await (dbClient
            .from('crm_quotes') as any)
            .select(fullSelect)
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

        return { success: true, data: data || [] }
    } catch (error: any) {
        return { success: false, error: error.message, data: [] as any[] }
    }
}

export async function getAllQuotesForAdmin() {
    try {
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)
        await assertAdmin()

        let dbClient: any = supabase
        try {
            dbClient = createAdminClient()
        } catch {
            dbClient = supabase
        }

        const fullSelect = 'id, quote_text, quote_author, quote_source, quote_author_context, contributed_by_name, is_active, created_at, updated_at, is_own_quote, quote_year, quote_origin_type, quote_origin_title, quote_origin_reference, quote_notes'
        const baseSelect = 'id, quote_text, quote_author, quote_source, quote_author_context, contributed_by_name, is_active, created_at, updated_at'

        let { data, error } = await (dbClient
            .from('crm_quotes') as any)
            .select(fullSelect)
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
        return { success: true, data: data || [] }
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
                quoteAuthorContext = quoteAuthorContext || roleToAirHiveContext(current.role)
            }
            quoteOriginType = quoteOriginType || 'propia'
        }

        if (!quoteText) throw new Error('La frase es obligatoria')
        if (!quoteAuthor) throw new Error('El autor de la frase es obligatorio')
        if (!contributedByName) throw new Error('El nombre de quien aporta la frase es obligatorio')

        const fullPayload = {
            quote_text: quoteText,
            quote_author: quoteAuthor,
            quote_source: quoteSource,
            quote_author_context: quoteAuthorContext,
            contributed_by: current.userId,
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
        const quoteAuthorContext = normalizeNullableText(input.quoteAuthorContext)
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

        const fullPayload = {
            quote_text: quoteText,
            quote_author: quoteAuthor,
            quote_source: quoteSource,
            quote_author_context: quoteAuthorContext,
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
