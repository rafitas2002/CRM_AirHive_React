type AssignmentStage =
    | 'in_negotiation'
    | 'prospection_same_close'
    | 'future_lead_opportunity'
    | 'implemented_real'

export type ProjectValueMap = Record<string, { mensualidad_usd: number | null; implementacion_usd: number | null }>

type SyncLeadProjectAssignmentsParams = {
    leadId?: number | string | null
    empresaId?: string | null
    inNegotiationProjectIds?: string[]
    prospectionSameCloseProjectIds?: string[]
    futureLeadOpportunityProjectIds?: string[]
    implementedRealProjectIds?: string[]
    forecastProjectValues?: ProjectValueMap
    implementedRealProjectValues?: ProjectValueMap
    assignedByUserId?: string | null
}

type RawAssignmentRow = {
    proyecto_id: string
    assignment_stage: string
    mensualidad_pactada_usd: number | null
    implementacion_pactada_usd: number | null
}

type NormalizedLeadProjectAssignment = {
    projectId: string
    stage: AssignmentStage
    monthlyUsd: number | null
    implementationUsd: number | null
}

type LeadProjectSelection = {
    inNegotiationProjectIds: string[]
    prospectionSameCloseProjectIds: string[]
    futureLeadOpportunityProjectIds: string[]
    implementedRealProjectIds: string[]
    forecastProjectValues: ProjectValueMap
    implementedRealProjectValues: ProjectValueMap
}

const ASSIGNMENT_STAGES: AssignmentStage[] = [
    'in_negotiation',
    'prospection_same_close',
    'future_lead_opportunity',
    'implemented_real'
]

function normalizeStage(value: unknown): AssignmentStage | null {
    const normalized = String(value || '').trim().toLowerCase()
    if (normalized === 'forecasted') return 'in_negotiation'
    if (ASSIGNMENT_STAGES.includes(normalized as AssignmentStage)) return normalized as AssignmentStage
    return null
}

function normalizeProjectIds(ids: unknown): string[] {
    if (!Array.isArray(ids)) return []
    return Array.from(new Set(ids.map((id) => String(id || '').trim()).filter(Boolean)))
}

function sanitizeMoney(value: unknown): number | null {
    if (value == null || value === '') return null
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return null
    return Math.max(0, parsed)
}

function isMissingLeadAssignmentsTableError(error: any) {
    const code = String(error?.code || '')
    const message = String(error?.message || '').toLowerCase()
    return code === '42P01'
        || code === 'PGRST205'
        || message.includes('lead_proyecto_asignaciones')
        || (message.includes('does not exist') && message.includes('lead'))
}

function buildLeadRows(params: SyncLeadProjectAssignmentsParams) {
    const leadId = Number(params.leadId || 0)
    if (!leadId) return [] as any[]

    const inNegotiation = normalizeProjectIds(params.inNegotiationProjectIds)
    const prospectionSameClose = normalizeProjectIds(params.prospectionSameCloseProjectIds)
    const futureLeadOpportunity = normalizeProjectIds(params.futureLeadOpportunityProjectIds)
    const implementedReal = normalizeProjectIds(params.implementedRealProjectIds)
    const forecastValues = params.forecastProjectValues || {}
    const realValues = params.implementedRealProjectValues || {}

    const common = {
        lead_id: leadId,
        assigned_by: params.assignedByUserId || null
    }

    const rows = [
        ...inNegotiation.map((projectId) => ({
            ...common,
            proyecto_id: projectId,
            assignment_stage: 'in_negotiation',
            mensualidad_pactada_usd: sanitizeMoney(forecastValues[projectId]?.mensualidad_usd),
            implementacion_pactada_usd: sanitizeMoney(forecastValues[projectId]?.implementacion_usd)
        })),
        ...prospectionSameClose.map((projectId) => ({
            ...common,
            proyecto_id: projectId,
            assignment_stage: 'prospection_same_close',
            mensualidad_pactada_usd: sanitizeMoney(forecastValues[projectId]?.mensualidad_usd),
            implementacion_pactada_usd: sanitizeMoney(forecastValues[projectId]?.implementacion_usd)
        })),
        ...futureLeadOpportunity.map((projectId) => ({
            ...common,
            proyecto_id: projectId,
            assignment_stage: 'future_lead_opportunity',
            mensualidad_pactada_usd: sanitizeMoney(forecastValues[projectId]?.mensualidad_usd),
            implementacion_pactada_usd: sanitizeMoney(forecastValues[projectId]?.implementacion_usd)
        })),
        ...implementedReal.map((projectId) => ({
            ...common,
            proyecto_id: projectId,
            assignment_stage: 'implemented_real',
            mensualidad_pactada_usd: sanitizeMoney(realValues[projectId]?.mensualidad_usd),
            implementacion_pactada_usd: sanitizeMoney(realValues[projectId]?.implementacion_usd)
        }))
    ]

    return rows
}

async function syncLegacyCompanyRows(supabase: any, params: SyncLeadProjectAssignmentsParams, leadRows: any[]) {
    const empresaId = String(params.empresaId || '').trim()
    const leadId = Number(params.leadId || 0)
    if (!empresaId || !leadId) return

    const { error: deleteError } = await (supabase.from('empresa_proyecto_asignaciones') as any)
        .delete()
        .eq('empresa_id', empresaId)
        .eq('source_lead_id', leadId)

    if (deleteError) throw deleteError

    if (leadRows.length === 0) return

    const legacyRows = leadRows.map((row) => ({
        empresa_id: empresaId,
        proyecto_id: row.proyecto_id,
        assignment_stage: row.assignment_stage,
        source_lead_id: leadId,
        assigned_by: row.assigned_by,
        mensualidad_pactada_usd: row.mensualidad_pactada_usd ?? null,
        implementacion_pactada_usd: row.implementacion_pactada_usd ?? null
    }))

    const { error: upsertError } = await (supabase.from('empresa_proyecto_asignaciones') as any)
        .upsert(legacyRows, { onConflict: 'empresa_id,proyecto_id,assignment_stage' })

    if (upsertError) throw upsertError
}

export async function syncLeadProjectAssignments(supabase: any, params: SyncLeadProjectAssignmentsParams) {
    const leadId = Number(params.leadId || 0)
    if (!leadId) return
    const leadRows = buildLeadRows(params)

    const { error: deleteError } = await (supabase.from('lead_proyecto_asignaciones') as any)
        .delete()
        .eq('lead_id', leadId)

    if (deleteError) {
        if (isMissingLeadAssignmentsTableError(deleteError)) {
            await syncLegacyCompanyRows(supabase, params, leadRows)
            return
        }
        throw deleteError
    }

    if (leadRows.length > 0) {
        const { error: upsertError } = await (supabase.from('lead_proyecto_asignaciones') as any)
            .upsert(leadRows, { onConflict: 'lead_id,proyecto_id,assignment_stage' })
        if (upsertError) throw upsertError
    }

    // Mirror to legacy table while old screens still read from it.
    await syncLegacyCompanyRows(supabase, params, leadRows)
}

export async function fetchLeadProjectAssignments(supabase: any, params: { leadId?: number | string | null, empresaId?: string | null }) {
    const leadId = Number(params.leadId || 0)
    if (!leadId) return [] as NormalizedLeadProjectAssignment[]

    const parseRows = (rows: any[]) => (rows || [])
        .map((row: any) => {
            const projectId = String(row?.proyecto_id || '').trim()
            const stage = normalizeStage(row?.assignment_stage)
            if (!projectId || !stage) return null
            return {
                projectId,
                stage,
                monthlyUsd: row?.mensualidad_pactada_usd == null ? null : Number(row.mensualidad_pactada_usd),
                implementationUsd: row?.implementacion_pactada_usd == null ? null : Number(row.implementacion_pactada_usd)
            } as NormalizedLeadProjectAssignment
        })
        .filter((row: NormalizedLeadProjectAssignment | null): row is NormalizedLeadProjectAssignment => !!row)

    const leadRes = await (supabase.from('lead_proyecto_asignaciones') as any)
        .select('proyecto_id, assignment_stage, mensualidad_pactada_usd, implementacion_pactada_usd')
        .eq('lead_id', leadId)

    if (!leadRes?.error) {
        return parseRows(Array.isArray(leadRes?.data) ? leadRes.data : [])
    }

    if (!isMissingLeadAssignmentsTableError(leadRes.error)) {
        throw leadRes.error
    }

    const empresaId = String(params.empresaId || '').trim()
    if (!empresaId) return []

    const legacyRes = await (supabase.from('empresa_proyecto_asignaciones') as any)
        .select('proyecto_id, assignment_stage, mensualidad_pactada_usd, implementacion_pactada_usd')
        .eq('empresa_id', empresaId)
        .eq('source_lead_id', leadId)

    if (legacyRes?.error) throw legacyRes.error
    return parseRows(Array.isArray(legacyRes?.data) ? legacyRes.data : [])
}

export function mapAssignmentsToLeadProjectSelection(rows: RawAssignmentRow[]): LeadProjectSelection {
    const inNegotiationProjectIds = new Set<string>()
    const prospectionSameCloseProjectIds = new Set<string>()
    const futureLeadOpportunityProjectIds = new Set<string>()
    const implementedRealProjectIds = new Set<string>()
    const forecastProjectValues: ProjectValueMap = {}
    const implementedRealProjectValues: ProjectValueMap = {}

    for (const row of rows || []) {
        const projectId = String(row?.proyecto_id || '').trim()
        const stage = normalizeStage(row?.assignment_stage)
        if (!projectId || !stage) continue

        const monthlyUsd = row?.mensualidad_pactada_usd == null ? null : Number(row.mensualidad_pactada_usd)
        const implementationUsd = row?.implementacion_pactada_usd == null ? null : Number(row.implementacion_pactada_usd)

        if (stage === 'implemented_real') {
            implementedRealProjectIds.add(projectId)
            implementedRealProjectValues[projectId] = {
                mensualidad_usd: monthlyUsd,
                implementacion_usd: implementationUsd
            }
            continue
        }

        if (stage === 'in_negotiation') inNegotiationProjectIds.add(projectId)
        if (stage === 'prospection_same_close') prospectionSameCloseProjectIds.add(projectId)
        if (stage === 'future_lead_opportunity') futureLeadOpportunityProjectIds.add(projectId)

        if (!forecastProjectValues[projectId]) {
            forecastProjectValues[projectId] = {
                mensualidad_usd: monthlyUsd,
                implementacion_usd: implementationUsd
            }
        }
    }

    return {
        inNegotiationProjectIds: Array.from(inNegotiationProjectIds),
        prospectionSameCloseProjectIds: Array.from(prospectionSameCloseProjectIds),
        futureLeadOpportunityProjectIds: Array.from(futureLeadOpportunityProjectIds),
        implementedRealProjectIds: Array.from(implementedRealProjectIds),
        forecastProjectValues,
        implementedRealProjectValues
    }
}
