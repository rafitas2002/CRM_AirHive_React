export type LeadOriginValue =
    | 'contacto_propio'
    | 'referido'
    | 'inbound_marketing'
    | 'outbound_prospeccion'
    | 'evento_networking'
    | 'alianza_partner'
    | 'base_datos'
    | 'visita_puerta_fria'
    | 'cliente_existente'
    | 'otro'
    | 'sin_definir'

export const LEAD_ORIGIN_OPTIONS: Array<{
    value: LeadOriginValue
    label: string
    description: string
}> = [
    {
        value: 'contacto_propio',
        label: 'Contacto propio del equipo',
        description: 'Relación directa de alguien del equipo con la empresa.'
    },
    {
        value: 'referido',
        label: 'Referido',
        description: 'Llegó por recomendación de cliente, aliado o contacto.'
    },
    {
        value: 'inbound_marketing',
        label: 'Inbound de marketing',
        description: 'La empresa nos contactó por campañas, web o contenido.'
    },
    {
        value: 'outbound_prospeccion',
        label: 'Outbound comercial',
        description: 'Prospección activa por parte del equipo comercial.'
    },
    {
        value: 'evento_networking',
        label: 'Evento / Networking',
        description: 'Originado en ferias, congresos o eventos de networking.'
    },
    {
        value: 'alianza_partner',
        label: 'Partner / Alianza',
        description: 'Canal de aliados estratégicos, distribuidores o partners.'
    },
    {
        value: 'base_datos',
        label: 'Base de datos',
        description: 'Identificado desde listados, bases internas o investigación.'
    },
    {
        value: 'visita_puerta_fria',
        label: 'Visita puerta fría',
        description: 'Captado mediante visita en sitio sin contacto previo.'
    },
    {
        value: 'cliente_existente',
        label: 'Cliente existente',
        description: 'Expansión o nueva oportunidad en cliente actual.'
    },
    {
        value: 'otro',
        label: 'Otro origen',
        description: 'Origen no cubierto por las categorías anteriores.'
    },
    {
        value: 'sin_definir',
        label: 'Sin definir',
        description: 'Aún no hay certeza sobre el origen del lead/suspect.'
    }
]

export function normalizeLeadOriginValue(value: unknown): LeadOriginValue | null {
    const normalized = String(value || '').trim().toLowerCase()
    if (!normalized) return null
    const option = LEAD_ORIGIN_OPTIONS.find((item) => item.value === normalized)
    return option?.value || null
}

export function getLeadOriginLabel(value: unknown): string {
    const normalized = normalizeLeadOriginValue(value)
    if (!normalized) return 'Sin definir'
    return LEAD_ORIGIN_OPTIONS.find((item) => item.value === normalized)?.label || 'Sin definir'
}
