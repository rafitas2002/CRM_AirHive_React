export const OTHER_REASON_VALUE = '__other_reason__'
export const FALLBACK_REASON_PREFIX = 'fallback:'

export type MeetingReasonCatalogCode =
    | 'cliente_no_asistio'
    | 'cliente_no_se_conecto'
    | 'equipo_no_se_conecto'
    | 'conflicto_agenda_cliente'
    | 'conflicto_agenda_interno'
    | 'reagenda_solicitada_cliente'
    | 'reagenda_solicitada_interno'
    | 'decision_maker_no_disponible'
    | 'problema_tecnico_conexion'
    | 'falta_informacion_previa'
    | 'cambio_prioridad_cliente'
    | 'sin_registro_impacto_menor'
    | 'motivo_no_especificado'

export type FallbackMeetingReasonOption = {
    code: MeetingReasonCatalogCode
    label: string
}

export const FALLBACK_MEETING_REASON_OPTIONS: FallbackMeetingReasonOption[] = [
    { code: 'cliente_no_asistio', label: 'Cliente no asistió a la reunión' },
    { code: 'cliente_no_se_conecto', label: 'Cliente no se conectó a la reunión virtual' },
    { code: 'equipo_no_se_conecto', label: 'Nuestro equipo no se conectó a la reunión virtual' },
    { code: 'conflicto_agenda_cliente', label: 'Conflicto de agenda del cliente' },
    { code: 'conflicto_agenda_interno', label: 'Conflicto de agenda de nuestro equipo' },
    { code: 'reagenda_solicitada_cliente', label: 'Reprogramación solicitada por el cliente' },
    { code: 'reagenda_solicitada_interno', label: 'Reprogramación solicitada por nuestro equipo' },
    { code: 'decision_maker_no_disponible', label: 'Persona decisora no disponible' },
    { code: 'problema_tecnico_conexion', label: 'Incidencia técnica o de conectividad' },
    { code: 'falta_informacion_previa', label: 'Información previa insuficiente para la reunión' },
    { code: 'cambio_prioridad_cliente', label: 'Cambio de prioridad del cliente' },
    { code: 'sin_registro_impacto_menor', label: 'No registrar motivo (ajuste menor sin impacto relevante)' },
    { code: 'motivo_no_especificado', label: 'Motivo no especificado por la contraparte' }
]
