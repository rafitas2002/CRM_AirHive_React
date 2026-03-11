'use client'

import { useEffect, useState } from 'react'
import { Database } from '@/lib/supabase'
import { createClient } from '@/lib/supabase'
import { toLocalISOString, fromLocalISOString } from '@/lib/dateUtils'
import ConfirmModal from './ConfirmModal'
import UserSelect from './UserSelect'
import { FriendlyDateTimePicker } from './FriendlyDatePickers'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'
import { useTheme } from '@/lib/ThemeContext'
import { Building2, CalendarDays, CheckCircle2, Link2, PencilLine, Phone, Plus, Sparkles, Trash2, Video, X } from 'lucide-react'

type MeetingInsert = Database['public']['Tables']['meetings']['Insert']
type CompanyContactRow = Database['public']['Tables']['company_contacts']['Row']

interface MeetingModalProps {
    isOpen: boolean
    onClose: () => void
    onSave: (data: MeetingInsert) => Promise<void>
    leadId: number
    sellerId: string
    initialData?: any
    mode?: 'create' | 'edit'
    creationMode?: 'schedule' | 'past_record'
    leadContactSeed?: {
        contactName?: string | null
        contactEmail?: string | null
        contactPhone?: string | null
        companyId?: string | null
        companyName?: string | null
        leadName?: string | null
    }
}

type ContactOption = {
    key: string
    id: string | null
    name: string
    email: string | null
    phone: string | null
    source: 'company' | 'lead'
    isPrimary: boolean
}

type ManualParticipant = {
    id: string
    name: string
    email: string
    phone: string
}

type LeadContext = {
    leadName: string
    companyName: string
    companyId: string | null
    leadContactName: string
    leadEmail: string
    leadPhone: string
}

const OTHER_CONTACT_KEY = '__OTHER_CONTACT__'

type MeetingDurationOption = {
    value: number
    label: string
}

const MEETING_DURATION_PRESETS = [
    { value: 30, label: '30 minutos' },
    { value: 45, label: '45 minutos' },
    { value: 60, label: '1 hora' },
    { value: 90, label: '1 hora 30 min' },
    { value: 120, label: '2 horas' },
    { value: 150, label: '2 horas 30 min' },
    { value: 180, label: '3 horas' },
    { value: 240, label: '3+ horas' }
] as MeetingDurationOption[]

function normalizeText(value: string | null | undefined) {
    return String(value || '').trim().toLowerCase()
}

function normalizePhone(value: string | null | undefined) {
    return String(value || '').replace(/\D/g, '')
}

function createTempId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function buildParticipantLabel(name: string, email?: string | null, phone?: string | null) {
    const safeName = String(name || '').trim()
    if (!safeName) return ''

    const safeEmail = String(email || '').trim()
    if (safeEmail) return `${safeName} <${safeEmail}>`

    const safePhone = String(phone || '').trim()
    if (safePhone) return `${safeName} [${safePhone}]`

    return safeName
}

function parseParticipantLabel(label: string) {
    const raw = String(label || '').trim()
    const emailMatch = /<([^<>]+)>/.exec(raw)
    const phoneMatch = /\[([^\]]+)\]/.exec(raw)
    const name = raw
        .replace(/<[^<>]+>/g, '')
        .replace(/\[[^\]]+\]/g, '')
        .trim()

    return {
        name,
        email: emailMatch?.[1]?.trim() || '',
        phone: phoneMatch?.[1]?.trim() || ''
    }
}

function dedupeParticipantLabels(labels: string[]) {
    const seen = new Set<string>()
    const out: string[] = []

    labels.forEach((label) => {
        const normalized = normalizeText(label)
        if (!normalized || seen.has(normalized)) return
        seen.add(normalized)
        out.push(label)
    })

    return out
}

function buildContactOptions(
    companyContacts: CompanyContactRow[],
    companyLeads: Array<{ id: number; nombre?: string | null; contacto: string | null; email: string | null; telefono: string | null }>,
    leadFallback: { contacto?: string | null; email?: string | null; telefono?: string | null } | null
): ContactOption[] {
    const map = new Map<string, ContactOption>()

    const upsertOption = (payload: {
        id?: string | null
        name?: string | null
        email?: string | null
        phone?: string | null
        source: 'company' | 'lead'
        isPrimary?: boolean
    }) => {
        const name = String(payload.name || '').trim()
        if (!name) return

        const email = String(payload.email || '').trim() || null
        const phone = String(payload.phone || '').trim() || null

        const dedupeKey = `${normalizeText(name)}|${normalizeText(email || '')}|${normalizePhone(phone || '')}`
        const existing = map.get(dedupeKey)
        if (existing) {
            if (!existing.id && payload.id) existing.id = payload.id
            if (!existing.email && email) existing.email = email
            if (!existing.phone && phone) existing.phone = phone
            if (payload.isPrimary) existing.isPrimary = true
            if (existing.source !== 'company' && payload.source === 'company') existing.source = 'company'
            if (payload.id && payload.source === 'company') existing.key = `company:${payload.id}`
            map.set(dedupeKey, existing)
            return
        }

        const option: ContactOption = {
            key: payload.id && payload.source === 'company'
                ? `company:${payload.id}`
                : `lead:${dedupeKey}`,
            id: payload.id || null,
            name,
            email,
            phone,
            source: payload.source,
            isPrimary: !!payload.isPrimary
        }

        map.set(dedupeKey, option)
    }

    companyContacts.forEach((contact) => {
        if (!contact.is_active) return
        upsertOption({
            id: contact.id,
            name: contact.full_name,
            email: contact.email,
            phone: contact.phone,
            source: 'company',
            isPrimary: contact.is_primary
        })
    })

    companyLeads.forEach((lead) => {
        upsertOption({
            name: lead.contacto || lead.nombre || null,
            email: lead.email,
            phone: lead.telefono,
            source: 'lead'
        })
    })

    if (leadFallback) {
        upsertOption({
            name: leadFallback.contacto || null,
            email: leadFallback.email || null,
            phone: leadFallback.telefono || null,
            source: 'lead'
        })
    }

    return Array.from(map.values()).sort((a, b) => {
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1
        return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
    })
}

export default function MeetingModal({
    isOpen,
    onClose,
    onSave,
    leadId,
    sellerId,
    initialData,
    mode = 'create',
    creationMode = 'schedule',
    leadContactSeed
}: MeetingModalProps) {
    useBodyScrollLock(isOpen)
    const { theme } = useTheme()
    const [activeCreationMode, setActiveCreationMode] = useState<'schedule' | 'past_record'>(creationMode)

    const [formData, setFormData] = useState({
        title: '',
        start_time: '',
        duration_minutes: 60,
        meeting_type: 'video' as 'presencial' | 'llamada' | 'video',
        notes: '',
        attendees: [] as string[],
        calendar_provider: null as 'google' | 'outlook' | null
    })

    const [isSubmitting, setIsSubmitting] = useState(false)
    const [formAttempted, setFormAttempted] = useState(false)
    const [isGoogleConnected, setIsGoogleConnected] = useState(false)
    const [contactsLoading, setContactsLoading] = useState(false)
    const [meetingSequencePreview, setMeetingSequencePreview] = useState<number | null>(null)

    const [leadContext, setLeadContext] = useState<LeadContext>({
        leadName: '',
        companyName: '',
        companyId: null,
        leadContactName: '',
        leadEmail: '',
        leadPhone: ''
    })

    const [contactOptions, setContactOptions] = useState<ContactOption[]>([])
    const [primaryContactKey, setPrimaryContactKey] = useState('')
    const [selectedExternalKeys, setSelectedExternalKeys] = useState<string[]>([])
    const [manualExternalParticipants, setManualExternalParticipants] = useState<ManualParticipant[]>([])
    const [newExternalParticipant, setNewExternalParticipant] = useState({ name: '', email: '', phone: '' })
    const [newPrimaryContact, setNewPrimaryContact] = useState({ name: '', email: '', phone: '' })

    // Sync Fail Modal State
    const [showSyncFailModal, setShowSyncFailModal] = useState(false)
    const [pendingMeetingData, setPendingMeetingData] = useState<MeetingInsert | null>(null)

    useEffect(() => {
        if (!isOpen) return

        let isActive = true

        const init = async () => {
            const supabase = createClient()
            setContactsLoading(true)
            setFormAttempted(false)
            setActiveCreationMode(creationMode)
            setContactOptions([])
            setPrimaryContactKey('')
            setSelectedExternalKeys([])
            setManualExternalParticipants([])
            setNewExternalParticipant({ name: '', email: '', phone: '' })
            setNewPrimaryContact({ name: '', email: '', phone: '' })
            setMeetingSequencePreview(mode === 'edit' ? Number(initialData?.meeting_sequence_number || 0) || null : null)

            if (initialData) {
                setFormData({
                    title: initialData.title || '',
                    start_time: toLocalISOString(initialData.start_time),
                    duration_minutes: initialData.duration_minutes || 60,
                    meeting_type: initialData.meeting_type || 'video',
                    notes: initialData.notes || '',
                    attendees: initialData.attendees || [],
                    calendar_provider: initialData.calendar_provider || null
                })
            } else {
                setFormData({
                    title: '',
                    start_time: '',
                    duration_minutes: 60,
                    meeting_type: 'video',
                    notes: '',
                    attendees: [],
                    calendar_provider: null
                })
            }

            try {
                try {
                    const { data } = await supabase
                        .from('google_integrations')
                        .select('user_id')
                        .eq('user_id', sellerId)
                        .single()

                    const connected = !!data
                    if (!isActive) return

                    setIsGoogleConnected(connected)
                    if (connected && mode === 'create') {
                        setFormData(prev => ({ ...prev, calendar_provider: 'google' }))
                    }
                } catch (error) {
                    console.error('Error checking calendar status:', error)
                }

                let leadRow: any = null
                try {
                    const { data } = await supabase
                        .from('clientes')
                        .select('id, nombre, empresa, empresa_id, contacto, email, telefono')
                        .eq('id', leadId)
                        .maybeSingle()

                    leadRow = data || null
                } catch (error) {
                    console.error('Error fetching lead context for meeting modal:', error)
                }

                if (!isActive) return

                const mergedLead = {
                    ...leadRow,
                    nombre: String(leadRow?.nombre || leadContactSeed?.leadName || '').trim() || null,
                    empresa: String(leadRow?.empresa || leadContactSeed?.companyName || '').trim() || null,
                    empresa_id: String(leadRow?.empresa_id || leadContactSeed?.companyId || '').trim() || null,
                    contacto: String(leadRow?.contacto || leadContactSeed?.contactName || leadRow?.nombre || leadContactSeed?.leadName || '').trim() || null,
                    email: String(leadRow?.email || leadContactSeed?.contactEmail || '').trim() || null,
                    telefono: String(leadRow?.telefono || leadContactSeed?.contactPhone || '').trim() || null
                }

                const leadContactName = String(mergedLead?.contacto || '').trim()
                const leadEmail = String(mergedLead?.email || '').trim()
                const leadPhone = String(mergedLead?.telefono || '').trim()
                const companyId = mergedLead?.empresa_id ? String(mergedLead.empresa_id) : null
                const companyName = String(mergedLead?.empresa || '').trim()

                setLeadContext({
                    leadName: String(mergedLead?.nombre || '').trim(),
                    companyName: String(mergedLead?.empresa || '').trim(),
                    companyId,
                    leadContactName,
                    leadEmail,
                    leadPhone
                })

                if (mode === 'create') {
                    try {
                        const { count } = await supabase
                            .from('meetings')
                            .select('id', { head: true, count: 'exact' })
                            .eq('lead_id', leadId)

                        if (isActive) setMeetingSequencePreview((count || 0) + 1)
                    } catch (error) {
                        console.error('Error calculating meeting sequence:', error)
                    }
                }

                let options: ContactOption[] = []
                if (companyId) {
                    try {
                        const [companyContactsRes, companyLeadsRes] = await Promise.all([
                            supabase
                                .from('company_contacts')
                                .select('id, empresa_id, full_name, email, phone, job_title, is_primary, is_active, source, created_by, created_at, updated_at')
                                .eq('empresa_id', companyId)
                                .eq('is_active', true)
                                .order('is_primary', { ascending: false })
                                .order('created_at', { ascending: true }),
                            supabase
                                .from('clientes')
                                .select('id, nombre, contacto, email, telefono')
                                .eq('empresa_id', companyId)
                                .order('created_at', { ascending: true })
                        ])

                        options = buildContactOptions(
                            (companyContactsRes.data || []) as CompanyContactRow[],
                            (companyLeadsRes.data || []) as Array<{ id: number; nombre?: string | null; contacto: string | null; email: string | null; telefono: string | null }>,
                            mergedLead
                        )
                    } catch (error) {
                        console.error('Error loading company contacts for meeting modal:', error)
                        options = buildContactOptions([], [], mergedLead)
                    }
                } else if (companyName) {
                    try {
                        const { data: companyLeadsByName } = await supabase
                            .from('clientes')
                            .select('id, nombre, contacto, email, telefono')
                            .eq('empresa', companyName)
                            .order('created_at', { ascending: true })

                        options = buildContactOptions(
                            [],
                            (companyLeadsByName || []) as Array<{ id: number; nombre?: string | null; contacto: string | null; email: string | null; telefono: string | null }>,
                            mergedLead
                        )
                    } catch (error) {
                        console.error('Error loading company contacts by company name for meeting modal:', error)
                        options = buildContactOptions([], [], mergedLead)
                    }
                } else {
                    options = buildContactOptions([], [], mergedLead)
                }

                // Hard guarantee: always expose at least the lead/company contact in selector.
                if (options.length === 0 && leadContactName) {
                    options = buildContactOptions(
                        [],
                        [{
                            id: leadId,
                            nombre: leadContactName,
                            contacto: leadContactName,
                            email: leadEmail || null,
                            telefono: leadPhone || null
                        }],
                        mergedLead
                    )
                }

                if (!isActive) return

                setContactOptions(options)

                let defaultPrimaryKey = ''
                if (leadContactName) {
                    defaultPrimaryKey = options.find((option) => normalizeText(option.name) === normalizeText(leadContactName))?.key || ''
                }
                if (!defaultPrimaryKey) {
                    defaultPrimaryKey = options.find(option => option.isPrimary)?.key || options[0]?.key || ''
                }

                let nextPrimaryKey = defaultPrimaryKey
                let nextSelectedKeys: string[] = []
                let nextManualParticipants: ManualParticipant[] = []
                let nextPrimaryContactDraft = { name: '', email: '', phone: '' }

                if (mode === 'edit' && initialData) {
                    const primaryById = String(initialData.primary_company_contact_id || '').trim()
                    const primaryByName = String(initialData.primary_company_contact_name || '').trim()

                    if (primaryById) {
                        const match = options.find(option => option.id === primaryById)
                        if (match) nextPrimaryKey = match.key
                    }

                    if (!nextPrimaryKey && primaryByName) {
                        const match = options.find(option => normalizeText(option.name) === normalizeText(primaryByName))
                        if (match) nextPrimaryKey = match.key
                    }

                    if (!nextPrimaryKey && primaryByName) {
                        nextPrimaryKey = OTHER_CONTACT_KEY
                        nextPrimaryContactDraft = { name: primaryByName, email: '', phone: '' }
                    }

                    const selectedSet = new Set<string>()
                    const savedParticipants = Array.isArray(initialData.external_participants)
                        ? initialData.external_participants
                        : []

                    savedParticipants.forEach((rawLabel: string) => {
                        const parsed = parseParticipantLabel(rawLabel)
                        const email = normalizeText(parsed.email)
                        const name = normalizeText(parsed.name)
                        const phone = normalizePhone(parsed.phone)

                        const byEmail = email
                            ? options.find(option => normalizeText(option.email) === email)
                            : null
                        const byName = name
                            ? options.find(option => normalizeText(option.name) === name)
                            : null
                        const byPhone = phone
                            ? options.find(option => normalizePhone(option.phone) === phone)
                            : null

                        const matched = byEmail || byName || byPhone || null
                        if (matched) {
                            selectedSet.add(matched.key)
                            return
                        }

                        if (parsed.name) {
                            nextManualParticipants.push({
                                id: createTempId(),
                                name: parsed.name,
                                email: parsed.email,
                                phone: parsed.phone
                            })
                        }
                    })

                    nextSelectedKeys = Array.from(selectedSet)
                }

                setNewPrimaryContact(nextPrimaryContactDraft)
                setPrimaryContactKey(nextPrimaryKey)
                setSelectedExternalKeys(
                    Array.from(new Set(nextSelectedKeys))
                        .filter((key) => key && key !== nextPrimaryKey && key !== OTHER_CONTACT_KEY)
                )
                setManualExternalParticipants(nextManualParticipants)
            } finally {
                if (isActive) setContactsLoading(false)
            }
        }

        void init()

        return () => {
            isActive = false
        }
    }, [isOpen, sellerId, leadId, initialData, mode, creationMode])

    const sequenceNumber = mode === 'edit'
        ? (initialData?.meeting_sequence_number || null)
        : meetingSequencePreview

    const sequenceText = sequenceNumber == null
        ? 'Calculando número de junta...'
        : sequenceNumber === 1
            ? 'Primera junta con este cliente'
            : `Junta #${sequenceNumber} con este cliente`

    const toggleExternalParticipant = (key: string) => {
        setSelectedExternalKeys((prev) => {
            if (key === primaryContactKey || key === OTHER_CONTACT_KEY) {
                return prev.filter((item) => item !== key)
            }
            if (prev.includes(key)) return prev.filter((item) => item !== key)
            return [...prev, key]
        })
    }

    const addManualExternalParticipant = () => {
        const name = newExternalParticipant.name.trim()
        if (!name) {
            alert('Escribe el nombre del participante externo')
            return
        }

        setManualExternalParticipants((prev) => ([
            ...prev,
            {
                id: createTempId(),
                name,
                email: newExternalParticipant.email.trim(),
                phone: newExternalParticipant.phone.trim()
            }
        ]))

        setNewExternalParticipant({ name: '', email: '', phone: '' })
    }

    const removeManualExternalParticipant = (id: string) => {
        setManualExternalParticipants(prev => prev.filter(item => item.id !== id))
    }

    const getSelectedExternalContactLabels = () => {
        return selectedExternalKeys
            .map((key) => contactOptions.find(option => option.key === key))
            .filter(Boolean)
            .map((option) => buildParticipantLabel(option!.name, option!.email, option!.phone))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        setFormAttempted(true)

        if (titleMissing) {
            alert('Escribe el título de la reunión')
            return
        }

        if (startTimeMissing) {
            alert('Selecciona la fecha y hora de la reunión')
            return
        }

        if (scheduleDateInvalid) {
            alert('No se puede agendar una junta en el pasado. Cambia a "Registrar junta pasada" dentro de este popup.')
            return
        }

        if (pastRecordDateInvalid) {
            alert('Para registrar una junta realizada debes elegir una fecha pasada.')
            return
        }

        if (primaryContactMissing) {
            alert('Selecciona la persona principal con la que tomarás la junta')
            return
        }

        if (newPrimaryContactNameMissing) {
            alert('Escribe el nombre del nuevo contacto principal')
            return
        }

        setIsSubmitting(true)

        try {
            const supabase = createClient()
            const { createGoogleEventAction, updateGoogleEventAction } = await import('@/app/actions/google-calendar')

            let resolvedPrimaryContact: {
                id: string | null
                name: string
                email: string | null
                phone: string | null
            } | null = null

            if (!primaryContactKey && mode === 'edit') {
                const existingName = String(initialData?.primary_company_contact_name || '').trim()
                if (existingName) {
                    resolvedPrimaryContact = {
                        id: String(initialData?.primary_company_contact_id || '').trim() || null,
                        name: existingName,
                        email: null,
                        phone: null
                    }
                }
            } else if (primaryContactKey === OTHER_CONTACT_KEY) {
                const name = newPrimaryContact.name.trim()
                const email = newPrimaryContact.email.trim() || null
                const phone = newPrimaryContact.phone.trim() || null

                resolvedPrimaryContact = {
                    id: null,
                    name,
                    email,
                    phone
                }

                if (leadContext.companyId) {
                    const { data: createdContact, error: createContactError } = await (supabase
                        .from('company_contacts') as any)
                        .insert({
                            empresa_id: leadContext.companyId,
                            full_name: name,
                            email,
                            phone,
                            is_primary: contactOptions.length === 0,
                            source: 'manual',
                            created_by: sellerId
                        })
                        .select('id, full_name, email, phone')
                        .single()

                    if (createContactError) {
                        console.error('No se pudo registrar el nuevo contacto en company_contacts:', createContactError)
                    } else {
                        resolvedPrimaryContact = {
                            id: createdContact?.id || null,
                            name: createdContact?.full_name || name,
                            email: createdContact?.email || null,
                            phone: createdContact?.phone || null
                        }
                    }
                }
            } else {
                const selectedPrimary = contactOptions.find(option => option.key === primaryContactKey) || null
                if (!selectedPrimary) {
                    throw new Error('No se encontró el contacto principal seleccionado')
                }

                resolvedPrimaryContact = {
                    id: selectedPrimary.id,
                    name: selectedPrimary.name,
                    email: selectedPrimary.email,
                    phone: selectedPrimary.phone
                }
            }

            const selectedContacts = selectedExternalKeys
                .map((key) => contactOptions.find(option => option.key === key))
                .filter((option): option is ContactOption => !!option)

            const participantLabels = dedupeParticipantLabels([
                ...(resolvedPrimaryContact
                    ? [buildParticipantLabel(resolvedPrimaryContact.name, resolvedPrimaryContact.email, resolvedPrimaryContact.phone)]
                    : []),
                ...selectedContacts.map((option) => buildParticipantLabel(option.name, option.email, option.phone)),
                ...manualExternalParticipants.map((participant) => buildParticipantLabel(participant.name, participant.email, participant.phone))
            ].filter(Boolean))

            const meetingData: MeetingInsert = {
                lead_id: leadId,
                seller_id: sellerId,
                title: formData.title.trim(),
                start_time: fromLocalISOString(formData.start_time).toISOString(),
                duration_minutes: formData.duration_minutes,
                meeting_type: formData.meeting_type,
                notes: formData.notes || null,
                attendees: formData.attendees.length > 0 ? formData.attendees : null,
                primary_company_contact_id: resolvedPrimaryContact?.id || null,
                primary_company_contact_name: resolvedPrimaryContact?.name || null,
                external_participants: participantLabels.length > 0 ? participantLabels : null,
                calendar_provider: formData.calendar_provider,
                status: 'scheduled',
                meeting_status: isPastRecordMode ? 'pending_confirmation' : 'scheduled'
            }

            const leadNameForCalendar = leadContext.leadName || leadContext.companyName || 'Cliente'

            if (mode === 'edit' && initialData?.calendar_event_id && formData.calendar_provider === 'google') {
                const result = await updateGoogleEventAction(
                    initialData.calendar_event_id,
                    meetingData,
                    leadNameForCalendar
                )
                if (!result.success) console.error('Failed to update Google Event', result.error)
            } else if (mode === 'create' && formData.calendar_provider === 'google') {
                const result = await createGoogleEventAction(meetingData, leadNameForCalendar)

                if (result.success && result.eventId) {
                    meetingData.calendar_event_id = result.eventId
                    if (result.hangoutLink) {
                        const meetMarker = `[MEET_LINK]:${result.hangoutLink}`
                        meetingData.notes = meetingData.notes
                            ? `${meetMarker}\n${meetingData.notes}`
                            : meetMarker
                    }
                } else {
                    console.error('Failed to create Google Event', result.error)
                    setPendingMeetingData(meetingData)
                    setShowSyncFailModal(true)
                    setIsSubmitting(false)
                    return
                }
            }

            await onSave(meetingData)
            onClose()
        } catch (error) {
            console.error('Error saving meeting:', error)
            alert(error instanceof Error ? error.message : 'Error al guardar la reunión')
        } finally {
            setIsSubmitting(false)
        }
    }

    if (!isOpen) return null

    const headerTheme = {
        claro: {
            background: 'linear-gradient(135deg, #0A1635 0%, #0f2352 56%, #17306b 100%)',
            border: 'rgba(255,255,255,0.12)'
        },
        gris: {
            background: 'linear-gradient(135deg, #111827 0%, #1F2937 56%, #0F172A 100%)',
            border: 'rgba(255,255,255,0.08)'
        },
        oscuro: {
            background: 'linear-gradient(135deg, #070B14 0%, #0B1220 56%, #111827 100%)',
            border: 'rgba(255,255,255,0.08)'
        }
    }[theme]

    const selectedExternalLabels = getSelectedExternalContactLabels()
    const selectedPrimaryOption = contactOptions.find(option => option.key === primaryContactKey) || null
    const additionalCompanyContactOptions = contactOptions.filter((option) => option.key !== primaryContactKey)
    const isCreateMode = mode === 'create'
    const isPastRecordMode = isCreateMode && activeCreationMode === 'past_record'
    const isScheduleMode = isCreateMode && activeCreationMode === 'schedule'
    const durationOptions = (() => {
        const currentDuration = Number(formData.duration_minutes)
        const options = [...MEETING_DURATION_PRESETS]

        if (
            Number.isFinite(currentDuration)
            && currentDuration > 0
            && !options.some((option) => option.value === currentDuration)
        ) {
            options.push({
                value: currentDuration,
                label: `${currentDuration} minutos (actual)`
            })
            options.sort((a, b) => a.value - b.value)
        }

        return options
    })()

    const titleMissing = !formData.title.trim()
    const startTimeMissing = !formData.start_time
    const primaryContactMissing = isCreateMode && !primaryContactKey
    const newPrimaryContactNameMissing = primaryContactKey === OTHER_CONTACT_KEY && !newPrimaryContact.name.trim()

    const selectedStartDate = formData.start_time ? fromLocalISOString(formData.start_time) : null
    const dateInPast = selectedStartDate ? selectedStartDate.getTime() < Date.now() : false
    const dateInFuture = selectedStartDate ? selectedStartDate.getTime() > Date.now() : false
    const scheduleDateInvalid = isScheduleMode && !!selectedStartDate && dateInPast
    const pastRecordDateInvalid = isPastRecordMode && !!selectedStartDate && dateInFuture
    const dateFieldInvalid = formAttempted && (startTimeMissing || scheduleDateInvalid || pastRecordDateInvalid)
    const nowLocalBoundary = toLocalISOString(new Date())

    const titleFieldInvalid = formAttempted && titleMissing
    const primaryContactFieldInvalid = formAttempted && primaryContactMissing
    const newPrimaryContactFieldInvalid = formAttempted && newPrimaryContactNameMissing

    return (
        <div className='ah-modal-overlay'>
            <div className='ah-modal-panel w-full max-w-4xl transform transition-all'>
                {/* Header */}
                <div className='ah-modal-header' style={{ background: headerTheme.background, borderBottomColor: headerTheme.border }}>
                    <h2 className='ah-modal-title flex items-center gap-3'>
                        <span className='ah-icon-card ah-icon-card-sm'>
                            {mode === 'edit'
                                ? <PencilLine size={18} strokeWidth={2} />
                                : isPastRecordMode
                                    ? <CheckCircle2 size={18} strokeWidth={2} />
                                    : <CalendarDays size={18} strokeWidth={2} />}
                        </span>
                        {mode === 'edit'
                            ? 'Editar Reunión'
                            : isPastRecordMode
                                ? 'Registrar Junta Realizada'
                                : 'Nueva Reunión'}
                    </h2>
                    <button
                        onClick={onClose}
                        className='ah-modal-close text-xl cursor-pointer'
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className='p-6 overflow-y-auto custom-scrollbar space-y-4'>
                    <form id='meeting-form' onSubmit={handleSubmit} noValidate className={`space-y-4 ${formAttempted ? 'ah-form-attempted' : ''}`}>
                        <div className='ah-required-note' role='note'>
                            <span className='ah-required-note-dot' aria-hidden='true' />
                            Campos obligatorios: se marcan en rojo solo si faltan al confirmar
                        </div>

                        {isCreateMode && (
                            <div className='space-y-2'>
                                <p className='text-[10px] font-black uppercase tracking-[0.14em]' style={{ color: 'var(--text-secondary)' }}>
                                    Tipo de registro
                                </p>
                                <div
                                    className='grid grid-cols-1 sm:grid-cols-2 gap-2 p-1 rounded-xl border'
                                    style={{
                                        background: 'var(--background)',
                                        borderColor: 'var(--card-border)'
                                    }}
                                >
                                    <button
                                        type='button'
                                        onClick={() => setActiveCreationMode('schedule')}
                                        className='px-3 py-2 rounded-lg border text-xs font-black uppercase tracking-[0.12em] transition-colors cursor-pointer flex items-center justify-center gap-2'
                                        style={isScheduleMode
                                            ? {
                                                background: 'color-mix(in srgb, #2048FF 12%, var(--card-bg))',
                                                borderColor: 'color-mix(in srgb, #2048FF 32%, var(--card-border))',
                                                color: 'color-mix(in srgb, #2048FF 86%, var(--text-primary))'
                                            }
                                            : {
                                                background: 'var(--card-bg)',
                                                borderColor: 'var(--card-border)',
                                                color: 'var(--text-secondary)'
                                            }}
                                    >
                                        <CalendarDays size={14} />
                                        Agendar futura
                                    </button>
                                    <button
                                        type='button'
                                        onClick={() => setActiveCreationMode('past_record')}
                                        className='px-3 py-2 rounded-lg border text-xs font-black uppercase tracking-[0.12em] transition-colors cursor-pointer flex items-center justify-center gap-2'
                                        style={isPastRecordMode
                                            ? {
                                                background: 'color-mix(in srgb, #10b981 12%, var(--card-bg))',
                                                borderColor: 'color-mix(in srgb, #10b981 32%, var(--card-border))',
                                                color: 'color-mix(in srgb, #10b981 88%, var(--text-primary))'
                                            }
                                            : {
                                                background: 'var(--card-bg)',
                                                borderColor: 'var(--card-border)',
                                                color: 'var(--text-secondary)'
                                            }}
                                    >
                                        <CheckCircle2 size={14} />
                                        Registrar junta pasada
                                    </button>
                                </div>
                                <div
                                    className='rounded-xl border px-3 py-2 text-xs font-semibold'
                                    style={{
                                        background: isPastRecordMode
                                            ? 'color-mix(in srgb, #10b981 8%, var(--card-bg))'
                                            : 'color-mix(in srgb, #2048FF 8%, var(--card-bg))',
                                        borderColor: isPastRecordMode
                                            ? 'color-mix(in srgb, #10b981 26%, var(--card-border))'
                                            : 'color-mix(in srgb, #2048FF 26%, var(--card-border))',
                                        color: 'var(--text-secondary)'
                                    }}
                                >
                                    {isPastRecordMode
                                        ? 'Registro histórico: aquí capturas juntas que ya ocurrieron. Debe elegirse una fecha pasada.'
                                        : 'Agenda de junta: aquí solo se permiten fechas futuras.'}
                                </div>
                            </div>
                        )}

                        {/* Título */}
                        <div className='space-y-1.5'>
                            <label className='block text-sm font-bold ah-required-label' style={{ color: 'var(--text-primary)' }}>
                                Título de la Reunión <span className='text-red-500'>*</span>
                            </label>
                            <input
                                type='text'
                                required
                                value={formData.title}
                                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                aria-invalid={titleFieldInvalid}
                                data-invalid={titleFieldInvalid ? 'true' : undefined}
                                className='ah-required-control w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF]/30 focus:border-[#2048FF] transition-colors'
                                style={{ background: 'var(--background)', borderColor: titleFieldInvalid ? 'color-mix(in srgb, #ef4444 52%, var(--input-border))' : 'var(--card-border)', color: 'var(--text-primary)' }}
                                placeholder='Ej: Presentación de propuesta'
                            />
                        </div>

                        {/* Contador de junta */}
                        <div
                            className='rounded-xl border p-3'
                            style={{
                                background: 'color-mix(in srgb, #2048FF 8%, var(--card-bg))',
                                borderColor: 'color-mix(in srgb, #2048FF 26%, var(--card-border))'
                            }}
                        >
                            <p className='text-[10px] font-black uppercase tracking-[0.18em]' style={{ color: 'color-mix(in srgb, #2048FF 72%, var(--text-secondary))' }}>
                                Contador de Junta
                            </p>
                            <p className='text-sm font-black mt-1' style={{ color: 'var(--text-primary)' }}>
                                {sequenceText}
                            </p>
                            <p className='text-xs mt-1' style={{ color: 'var(--text-secondary)' }}>
                                Este número es informativo y se asigna automáticamente según el historial del cliente.
                            </p>
                        </div>

                        {/* Fecha y Hora + Duración */}
                        <div className='grid grid-cols-1 md:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] gap-4'>
                            <div className='space-y-1.5'>
                                <label className='block text-sm font-bold ah-required-label' style={{ color: 'var(--text-primary)' }}>
                                    Fecha y Hora <span className='text-red-500'>*</span>
                                </label>
                                <FriendlyDateTimePicker
                                    value={formData.start_time}
                                    onChange={(next) => setFormData({ ...formData, start_time: next })}
                                    minuteStep={5}
                                    min={isScheduleMode ? nowLocalBoundary : undefined}
                                    max={isPastRecordMode ? nowLocalBoundary : undefined}
                                    panelClassName='left-0 right-auto w-full min-w-[17rem] max-w-full sm:w-[min(46rem,calc(100vw-5rem))] sm:min-w-[40rem]'
                                    className={`ah-required-control w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF]/30 focus:border-[#2048FF] transition-colors text-left font-medium cursor-pointer ${dateFieldInvalid ? '!border-red-400' : ''}`}
                                />
                                {formAttempted && scheduleDateInvalid && (
                                    <p className='text-[11px] font-semibold mt-1' style={{ color: '#ef4444' }}>
                                        No se puede agendar en pasado. Cambia a “Registrar junta pasada”.
                                    </p>
                                )}
                                {formAttempted && pastRecordDateInvalid && (
                                    <p className='text-[11px] font-semibold mt-1' style={{ color: '#ef4444' }}>
                                        Esta opción es solo para juntas ya realizadas (fecha pasada).
                                    </p>
                                )}
                            </div>

                            <div className='space-y-1.5'>
                                <label className='block text-sm font-bold' style={{ color: 'var(--text-primary)' }}>
                                    Duración (minutos)
                                </label>
                                <select
                                    value={String(formData.duration_minutes)}
                                    onChange={(e) => setFormData({ ...formData, duration_minutes: Number(e.target.value) })}
                                    className='w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF]/30 focus:border-[#2048FF] transition-colors'
                                    style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                >
                                    {durationOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                                <p className='text-[11px] font-semibold' style={{ color: 'var(--text-secondary)' }}>
                                    Opciones rápidas: 30 min, 45 min, 1 h, 1 h 30 min, 2 h, 3 h y 3+ h.
                                </p>
                            </div>
                        </div>

                        {/* Tipo de Reunión */}
                        <div className='space-y-1.5'>
                            <label className='block text-sm font-bold' style={{ color: 'var(--text-primary)' }}>
                                Tipo de Reunión
                            </label>
                            <div className='grid grid-cols-3 gap-3'>
                                {(['presencial', 'llamada', 'video'] as const).map((type) => (
                                    <button
                                        key={type}
                                        type='button'
                                        onClick={() => setFormData({ ...formData, meeting_type: type })}
                                        className={`px-4 py-3 rounded-lg font-bold transition-all border-2 cursor-pointer flex items-center justify-center gap-2 ${formData.meeting_type === type
                                            ? 'bg-[#2048FF] text-white border-[#2048FF] shadow-lg shadow-blue-500/20'
                                            : 'hover:border-[#2048FF]'
                                            }`}
                                        style={formData.meeting_type === type
                                            ? undefined
                                            : { background: 'var(--background)', color: 'var(--text-primary)', borderColor: 'var(--card-border)' }}
                                    >
                                        {type === 'presencial' && <Building2 size={18} />}
                                        {type === 'llamada' && <Phone size={18} />}
                                        {type === 'video' && <Video size={18} />}
                                        <span className='capitalize'>{type}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Contacto principal */}
                        <div className='space-y-1.5'>
                            <label className='block text-sm font-bold ah-required-label' style={{ color: 'var(--text-primary)' }}>
                                Persona principal de la empresa <span className='text-red-500'>*</span>
                            </label>
                            <select
                                required={mode === 'create'}
                                value={primaryContactKey}
                                onChange={(e) => {
                                    const nextKey = e.target.value
                                    setPrimaryContactKey(nextKey)
                                    setSelectedExternalKeys(prev => prev.filter((key) => key !== nextKey))
                                }}
                                aria-invalid={primaryContactFieldInvalid}
                                data-invalid={primaryContactFieldInvalid ? 'true' : undefined}
                                className='ah-required-control w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF]/30 focus:border-[#2048FF] transition-colors'
                                style={{ background: 'var(--background)', borderColor: primaryContactFieldInvalid ? 'color-mix(in srgb, #ef4444 52%, var(--input-border))' : 'var(--card-border)', color: 'var(--text-primary)' }}
                            >
                                <option value=''>Seleccionar contacto...</option>
                                {contactOptions.map((option) => (
                                    <option key={option.key} value={option.key}>
                                        {option.name}
                                        {option.email ? ` · ${option.email}` : ''}
                                        {option.phone ? ` · ${option.phone}` : ''}
                                        {option.isPrimary ? ' · Principal' : ''}
                                    </option>
                                ))}
                                <option value={OTHER_CONTACT_KEY}>Otro/a (registrar nuevo contacto)</option>
                            </select>
                            <p className='text-xs' style={{ color: 'var(--text-secondary)' }}>
                                {contactsLoading
                                    ? 'Cargando contactos vinculados a la empresa...'
                                    : 'Contactos disponibles vinculados a la empresa. Puedes elegir “Otro/a” para registrar uno nuevo.'}
                            </p>
                            <p className='text-[11px] font-semibold' style={{ color: 'var(--text-secondary)' }}>
                                Después de elegir la persona principal, puedes agregar más contactos de la empresa en “Otros participantes de la empresa”.
                            </p>
                            {selectedPrimaryOption && primaryContactKey !== OTHER_CONTACT_KEY && (
                                <div
                                    className='rounded-lg border px-3 py-2 text-xs space-y-1'
                                    style={{
                                        background: 'color-mix(in srgb, #2048FF 7%, var(--card-bg))',
                                        borderColor: 'color-mix(in srgb, #2048FF 22%, var(--card-border))',
                                        color: 'var(--text-primary)'
                                    }}
                                >
                                    <p className='font-black uppercase tracking-[0.1em]' style={{ color: 'color-mix(in srgb, #2048FF 72%, var(--text-secondary))' }}>
                                        Datos del contacto seleccionado
                                    </p>
                                    <p className='font-semibold'>{selectedPrimaryOption.name}</p>
                                    <p style={{ color: 'var(--text-secondary)' }}>
                                        {selectedPrimaryOption.email || 'Sin correo'} · {selectedPrimaryOption.phone || 'Sin teléfono'}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Nuevo contacto principal */}
                        {primaryContactKey === OTHER_CONTACT_KEY && (
                            <div
                                className='rounded-xl border p-3 space-y-2'
                                style={{
                                    background: 'color-mix(in srgb, #f59e0b 8%, var(--card-bg))',
                                    borderColor: 'color-mix(in srgb, #f59e0b 24%, var(--card-border))'
                                }}
                            >
                                <p className='text-xs font-black uppercase tracking-[0.12em]' style={{ color: 'color-mix(in srgb, #d97706 72%, var(--text-primary))' }}>
                                    Registrar nuevo contacto (Otro/a)
                                </p>
                                <div className='grid grid-cols-1 md:grid-cols-3 gap-2'>
                                    <input
                                        type='text'
                                        required
                                        value={newPrimaryContact.name}
                                        onChange={(e) => setNewPrimaryContact(prev => ({ ...prev, name: e.target.value }))}
                                        placeholder='Nombre completo *'
                                        aria-invalid={newPrimaryContactFieldInvalid}
                                        data-invalid={newPrimaryContactFieldInvalid ? 'true' : undefined}
                                        className='ah-required-control px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF]/30 focus:border-[#2048FF] transition-colors'
                                        style={{ background: 'var(--background)', borderColor: newPrimaryContactFieldInvalid ? 'color-mix(in srgb, #ef4444 52%, var(--input-border))' : 'var(--card-border)', color: 'var(--text-primary)' }}
                                    />
                                    <input
                                        type='email'
                                        value={newPrimaryContact.email}
                                        onChange={(e) => setNewPrimaryContact(prev => ({ ...prev, email: e.target.value }))}
                                        placeholder='Correo (opcional)'
                                        className='px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF]/30 focus:border-[#2048FF] transition-colors'
                                        style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                    />
                                    <input
                                        type='text'
                                        value={newPrimaryContact.phone}
                                        onChange={(e) => setNewPrimaryContact(prev => ({ ...prev, phone: e.target.value }))}
                                        placeholder='Teléfono (opcional)'
                                        className='px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF]/30 focus:border-[#2048FF] transition-colors'
                                        style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Participantes internos */}
                        <div className='space-y-1.5'>
                            <UserSelect
                                label='Participantes internos (tu equipo)'
                                value={formData.attendees}
                                onChange={(newAttendees) => setFormData({ ...formData, attendees: newAttendees })}
                                placeholder='Seleccionar compañeros...'
                            />
                        </div>

                        {/* Participantes externos de la empresa */}
                        <div className='space-y-2'>
                            <label className='block text-sm font-bold' style={{ color: 'var(--text-primary)' }}>
                                Otros participantes de la empresa (además de la persona principal)
                            </label>
                            <div
                                className='rounded-xl border p-3 max-h-44 overflow-y-auto custom-scrollbar space-y-2'
                                style={{ background: 'var(--background)', borderColor: 'var(--card-border)' }}
                            >
                                {additionalCompanyContactOptions.length === 0 ? (
                                    <p className='text-xs' style={{ color: 'var(--text-secondary)' }}>
                                        No hay otros contactos disponibles todavía. Usa “Otro/a” o agrega participantes manuales.
                                    </p>
                                ) : (
                                    additionalCompanyContactOptions.map((option) => (
                                        <label
                                            key={option.key}
                                            className='flex items-start gap-2 p-2 rounded-lg border cursor-pointer'
                                            style={{
                                                borderColor: selectedExternalKeys.includes(option.key)
                                                    ? 'color-mix(in srgb, #2048FF 40%, var(--card-border))'
                                                    : 'var(--card-border)',
                                                background: selectedExternalKeys.includes(option.key)
                                                    ? 'color-mix(in srgb, #2048FF 8%, var(--card-bg))'
                                                    : 'var(--card-bg)'
                                            }}
                                        >
                                            <input
                                                type='checkbox'
                                                checked={selectedExternalKeys.includes(option.key)}
                                                onChange={() => toggleExternalParticipant(option.key)}
                                                className='mt-0.5 accent-[#2048FF]'
                                            />
                                            <span className='text-xs font-semibold' style={{ color: 'var(--text-primary)' }}>
                                                {option.name}
                                                {option.email ? ` · ${option.email}` : ''}
                                                {option.phone ? ` · ${option.phone}` : ''}
                                            </span>
                                        </label>
                                    ))
                                )}
                            </div>

                            {selectedExternalLabels.length > 0 && (
                                <div className='flex flex-wrap gap-2'>
                                    {selectedExternalLabels.map((label) => (
                                        <span
                                            key={label}
                                            className='inline-flex items-center px-2 py-1 rounded-full text-[11px] font-bold border'
                                            style={{
                                                background: 'color-mix(in srgb, #3b82f6 10%, var(--card-bg))',
                                                borderColor: 'color-mix(in srgb, #3b82f6 25%, var(--card-border))',
                                                color: 'color-mix(in srgb, #2563eb 75%, var(--text-primary))'
                                            }}
                                        >
                                            {label}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Participante externo manual */}
                        <div className='space-y-2'>
                            <label className='block text-sm font-bold' style={{ color: 'var(--text-primary)' }}>
                                Agregar participante externo adicional
                            </label>
                            <div className='grid grid-cols-1 md:grid-cols-4 gap-2'>
                                <input
                                    type='text'
                                    value={newExternalParticipant.name}
                                    onChange={(e) => setNewExternalParticipant(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder='Nombre *'
                                    className='px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF]/30 focus:border-[#2048FF] transition-colors'
                                    style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                />
                                <input
                                    type='email'
                                    value={newExternalParticipant.email}
                                    onChange={(e) => setNewExternalParticipant(prev => ({ ...prev, email: e.target.value }))}
                                    placeholder='Correo'
                                    className='px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF]/30 focus:border-[#2048FF] transition-colors'
                                    style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                />
                                <input
                                    type='text'
                                    value={newExternalParticipant.phone}
                                    onChange={(e) => setNewExternalParticipant(prev => ({ ...prev, phone: e.target.value }))}
                                    placeholder='Teléfono'
                                    className='px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF]/30 focus:border-[#2048FF] transition-colors'
                                    style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                />
                                <button
                                    type='button'
                                    onClick={addManualExternalParticipant}
                                    className='px-3 py-2 rounded-lg border font-black text-xs uppercase tracking-wider cursor-pointer flex items-center justify-center gap-2'
                                    style={{
                                        background: 'color-mix(in srgb, #2048FF 8%, var(--card-bg))',
                                        borderColor: 'color-mix(in srgb, #2048FF 25%, var(--card-border))',
                                        color: 'var(--text-primary)'
                                    }}
                                >
                                    <Plus size={14} /> Agregar
                                </button>
                            </div>

                            {manualExternalParticipants.length > 0 && (
                                <div className='flex flex-wrap gap-2'>
                                    {manualExternalParticipants.map((participant) => (
                                        <span
                                            key={participant.id}
                                            className='inline-flex items-center gap-2 px-2 py-1 rounded-full text-[11px] font-bold border'
                                            style={{
                                                background: 'color-mix(in srgb, #f59e0b 10%, var(--card-bg))',
                                                borderColor: 'color-mix(in srgb, #f59e0b 28%, var(--card-border))',
                                                color: 'color-mix(in srgb, #b45309 80%, var(--text-primary))'
                                            }}
                                        >
                                            {buildParticipantLabel(participant.name, participant.email, participant.phone)}
                                            <button
                                                type='button'
                                                onClick={() => removeManualExternalParticipant(participant.id)}
                                                className='cursor-pointer'
                                                title='Quitar participante'
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Notas */}
                        <div className='space-y-1.5'>
                            <label className='block text-sm font-bold' style={{ color: 'var(--text-primary)' }}>
                                Notas
                            </label>
                            <textarea
                                rows={3}
                                value={formData.notes}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                className='w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF]/30 focus:border-[#2048FF] resize-none transition-colors'
                                style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                placeholder='Agenda, temas a tratar, etc.'
                            />
                        </div>

                        {/* Integración con Calendario */}
                        <div className='pt-2'>
                            {isGoogleConnected ? (
                                <div className='p-5 rounded-2xl border-2 shadow-sm' style={{ background: 'color-mix(in srgb, #10b981 10%, var(--card-bg))', borderColor: 'color-mix(in srgb, #10b981 32%, var(--card-border))' }}>
                                    <div className='flex items-center justify-between mb-3'>
                                        <div>
                                            <p className='text-sm font-black flex items-center gap-2' style={{ color: 'color-mix(in srgb, #059669 72%, var(--text-primary))' }}>
                                                <CalendarDays size={16} /> Google Calendar
                                            </p>
                                            <p className='text-[10px] font-bold uppercase tracking-wider' style={{ color: 'color-mix(in srgb, #10b981 80%, var(--text-secondary))' }}>Sincronización Automática</p>
                                        </div>
                                        <div className='flex items-center gap-3'>
                                            <span className={`text-[10px] font-black uppercase ${formData.calendar_provider === 'google' ? 'text-emerald-600' : 'text-gray-400'}`}>
                                                {formData.calendar_provider === 'google' ? 'Activado' : 'Desactivado'}
                                            </span>
                                            <label className='relative inline-flex items-center cursor-pointer'>
                                                <input
                                                    type='checkbox'
                                                    className='sr-only peer'
                                                    checked={formData.calendar_provider === 'google'}
                                                    onChange={(e) => setFormData({ ...formData, calendar_provider: e.target.checked ? 'google' : null })}
                                                />
                                                <div className="w-14 h-7 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:start-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                                            </label>
                                        </div>
                                    </div>
                                    <p className='text-xs leading-snug' style={{ color: 'color-mix(in srgb, #059669 75%, var(--text-primary))' }}>
                                        {formData.calendar_provider === 'google'
                                            ? 'Esta reunión se agendará automáticamente en Google Calendar y se enviarán invitaciones a los asistentes con correo.'
                                            : 'Esta reunión se guardará de forma local en el CRM solamente.'}
                                    </p>
                                    {formData.meeting_type === 'video' && formData.calendar_provider === 'google' && (
                                        <div className='mt-3 py-2 px-3 rounded-xl border' style={{ background: 'color-mix(in srgb, #3b82f6 9%, var(--card-bg))', borderColor: 'color-mix(in srgb, #3b82f6 28%, var(--card-border))' }}>
                                            <p className='text-[11px] font-black flex items-center gap-2' style={{ color: 'color-mix(in srgb, #2563eb 72%, var(--text-primary))' }}>
                                                <Sparkles size={14} /> Google Meet incluido
                                            </p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className='p-5 rounded-2xl border-2 border-dashed' style={{ background: 'color-mix(in srgb, #3b82f6 7%, var(--card-bg))', borderColor: 'color-mix(in srgb, #3b82f6 28%, var(--card-border))' }}>
                                    <p className='text-sm font-bold mb-2 flex items-center gap-2' style={{ color: 'color-mix(in srgb, #2563eb 70%, var(--text-primary))' }}><Link2 size={14} /> Integración con Calendario</p>
                                    <p className='text-xs leading-relaxed' style={{ color: 'color-mix(in srgb, #2563eb 72%, var(--text-secondary))' }}>
                                        Para que tus juntas se agreguen a Google Calendar automáticamente, primero conecta tu cuenta en la sección principal del Calendario.
                                    </p>
                                </div>
                            )}
                        </div>
                    </form>
                </div>

                {/* Footer */}
                <div className='px-6 py-4 flex items-center justify-end gap-3 shrink-0 border-t' style={{ background: 'var(--hover-bg)', borderColor: 'var(--card-border)' }}>
                    <button
                        type='button'
                        onClick={onClose}
                        className='px-4 py-2 font-medium transition-colors rounded-lg shadow-sm hover:shadow border cursor-pointer'
                        style={{ color: 'var(--text-secondary)', background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
                    >
                        Cancelar
                    </button>
                    <button
                        type='submit'
                        form='meeting-form'
                        disabled={isSubmitting}
                        className='px-6 py-2 bg-[#2048FF] text-white font-black rounded-lg shadow-md hover:bg-[#1700AC] transition-all disabled:opacity-50 disabled:cursor-not-allowed transform active:scale-95 uppercase text-xs tracking-widest'
                    >
                        {isSubmitting
                            ? 'Guardando...'
                            : mode === 'edit'
                                ? 'Guardar Cambios'
                                : isPastRecordMode
                                    ? 'Registrar Junta'
                                    : 'Agendar Junta'}
                    </button>
                </div>
            </div>

            <ConfirmModal
                isOpen={showSyncFailModal}
                onClose={() => {
                    setShowSyncFailModal(false)
                    setPendingMeetingData(null)
                }}
                onConfirm={async () => {
                    if (pendingMeetingData) {
                        const sanitized = { ...pendingMeetingData, calendar_provider: null }
                        await onSave(sanitized as any)
                        onClose()
                    }
                }}
                title="Google Calendar Error"
                message="No se pudo conectar con Google Calendar. ¿Deseas guardar la reunión solo en el CRM?"
                isDestructive={false}
            />
        </div>
    )
}
