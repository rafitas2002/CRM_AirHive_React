export type CommercialMetricId =
    | 'active_companies'
    | 'monthly_won_closures'
    | 'adjusted_forecast_amount'
    | 'monthly_conversion_rate'
    | 'avg_cycle_days_won'
    | 'sellers_at_risk_7d'
    | 'pipeline_missing_estimated_value_count'
    | 'loss_lost_count'
    | 'loss_monthly_value'
    | 'loss_implementation_value'
    | 'loss_total_estimated_value'
    | 'loss_top_reason'
    | 'loss_unclassified_pct'
    | 'loss_avg_cycle_days'
    | 'negotiation_aging_days'
    | 'negotiation_stalled_count'

export type CommercialMetricDefinition = {
    id: CommercialMetricId
    domain: 'executive_dashboard' | 'loss_analytics' | 'pipeline_quality' | 'negotiation_aging'
    label: string
    businessDefinition: string
    formula: string
    dataSources: string[]
    periodRule: string
    includes: string[]
    excludes: string[]
    updateFrequency: string
    owner: 'Dirección Comercial' | 'Administración CRM'
    uiHint?: string
    shortHelp: string
}

type Dict = Record<CommercialMetricId, CommercialMetricDefinition>

export const COMMERCIAL_METRICS_DICTIONARY: Dict = {
    active_companies: {
        id: 'active_companies',
        domain: 'executive_dashboard',
        label: 'Empresas activas',
        businessDefinition: 'Empresas con al menos un proyecto implementado real registrado en el CRM.',
        formula: 'COUNT(DISTINCT empresa_id) con assignment_stage = implemented_real',
        dataSources: ['empresa_proyecto_asignaciones'],
        periodRule: 'Sin periodo (estado actual).',
        includes: ['Empresas con cualquier proyecto en etapa implemented_real'],
        excludes: ['Empresas solo con leads', 'Empresas sin proyectos implementados reales'],
        updateFrequency: 'Al guardar/asignar proyectos y en cargas del dashboard ejecutivo',
        owner: 'Dirección Comercial',
        uiHint: 'Con proyecto implementado real',
        shortHelp: 'Empresa activa = al menos un proyecto implementado real registrado.'
    },
    monthly_won_closures: {
        id: 'monthly_won_closures',
        domain: 'executive_dashboard',
        label: 'Cierres del mes',
        businessDefinition: 'Cantidad de leads cerrados ganados dentro del mes actual usando fecha real de cierre.',
        formula: 'COUNT(leads) con etapa ganado y closed_at_real en mes UTC actual',
        dataSources: ['clientes'],
        periodRule: 'Mes UTC actual por closed_at_real.',
        includes: ['Cerrado Ganado con fecha real de cierre válida'],
        excludes: ['Ganados sin closed_at_real', 'Cerrados perdidos'],
        updateFrequency: 'Tiempo real al recargar datos del home',
        owner: 'Dirección Comercial',
        uiHint: 'Cerrado ganado con fecha real',
        shortHelp: 'Leads en Cerrado Ganado con fecha real de cierre dentro del periodo.'
    },
    adjusted_forecast_amount: {
        id: 'adjusted_forecast_amount',
        domain: 'executive_dashboard',
        label: 'Forecast ajustado',
        businessDefinition: 'Suma estimada de negociación activa ajustada por confiabilidad histórica de probabilidad, valor y fecha.',
        formula: 'SUM(computeAdjustedMonthlyRaceLeadValue(lead, reliability)) sobre leads en Negociación',
        dataSources: ['clientes', 'seller_forecast_reliability_metrics'],
        periodRule: 'Mes actual inferido por helper de forecast ajustado y fecha estimada de cierre.',
        includes: ['Leads en Negociación con valor/probabilidad y ajuste por confiabilidad'],
        excludes: ['Cerrados ganados/perdidos', 'Prospección (en cálculo actual del home admin)'],
        updateFrequency: 'Tiempo real al recalcular dashboard',
        owner: 'Dirección Comercial',
        uiHint: 'Negociación ponderada por confiabilidad',
        shortHelp: 'Estimación mensual en negociación ajustada por precisión histórica del vendedor.'
    },
    monthly_conversion_rate: {
        id: 'monthly_conversion_rate',
        domain: 'executive_dashboard',
        label: 'Tasa de conversión',
        businessDefinition: 'Porcentaje de cierres ganados sobre el total de decisiones de cierre del mes.',
        formula: 'ganados / (ganados + perdidos) * 100',
        dataSources: ['clientes'],
        periodRule: 'Mes UTC actual por closed_at_real.',
        includes: ['Cerrado Ganado y Cerrado Perdido con fecha real en el periodo'],
        excludes: ['Leads abiertos', 'Cierres sin fecha real'],
        updateFrequency: 'Tiempo real al recargar dashboard',
        owner: 'Dirección Comercial',
        uiHint: 'Ganados / cerrados del mes',
        shortHelp: 'Ganados divididos entre decisiones de cierre (ganados + perdidos) del periodo.'
    },
    avg_cycle_days_won: {
        id: 'avg_cycle_days_won',
        domain: 'executive_dashboard',
        label: 'Ciclo promedio',
        businessDefinition: 'Tiempo promedio en días desde registro del lead hasta cierre ganado del periodo.',
        formula: 'AVG(closed_at_real - fecha_registro|created_at) en leads ganados del periodo',
        dataSources: ['clientes'],
        periodRule: 'Se filtra por mes actual usando closed_at_real.',
        includes: ['Ganados con fecha de registro y fecha real de cierre válidas'],
        excludes: ['Perdidos', 'Ganados con fechas inválidas o faltantes'],
        updateFrequency: 'Tiempo real al recargar dashboard',
        owner: 'Dirección Comercial',
        uiHint: 'De alta a cierre ganado (mes)',
        shortHelp: 'Promedio de días de alta a cierre para leads ganados del periodo.'
    },
    sellers_at_risk_7d: {
        id: 'sellers_at_risk_7d',
        domain: 'executive_dashboard',
        label: 'Vendedores en riesgo',
        businessDefinition: 'Vendedores sin actividad operativa registrada dentro de los últimos 7 días.',
        formula: 'COUNT(sellers) con último crm_event operativo < ahora - 7d',
        dataSources: ['crm_events', 'profiles', 'clientes'],
        periodRule: 'Ventana móvil de 7 días.',
        includes: ['Usuarios seller/admin candidatos con eventos operativos monitoreados'],
        excludes: ['Usuarios baneados (si aplica en esquema)', 'Usuarios fuera de rol comercial'],
        updateFrequency: 'Tiempo real al cargar soporte ejecutivo',
        owner: 'Dirección Comercial',
        uiHint: 'Sin actividad operativa en 7 días',
        shortHelp: 'Vendedores con 7+ días sin eventos operativos registrados en CRM.'
    },
    pipeline_missing_estimated_value_count: {
        id: 'pipeline_missing_estimated_value_count',
        domain: 'pipeline_quality',
        label: 'Leads sin valor estimado',
        businessDefinition: 'Cantidad de leads activos que no tienen valor estimado capturado.',
        formula: 'COUNT(leads activos) con valor_estimado nulo o cero (según UI actual)',
        dataSources: ['clientes'],
        periodRule: 'Estado actual del pipeline activo.',
        includes: ['Leads no cerrados en pipeline activo'],
        excludes: ['Cerrados ganados y perdidos'],
        updateFrequency: 'Tiempo real en dashboard/home',
        owner: 'Administración CRM',
        shortHelp: 'Leads activos sin valor estimado; impactan calidad de forecast y análisis.'
    },
    loss_lost_count: {
        id: 'loss_lost_count',
        domain: 'loss_analytics',
        label: 'Cierres perdidos',
        businessDefinition: 'Número de leads cerrados perdidos dentro del filtro/periodo seleccionado.',
        formula: 'COUNT(rows) en lead_loss_analytics_view/enriched_view filtradas',
        dataSources: ['lead_loss_analytics_enriched_view', 'lead_loss_analytics_view'],
        periodRule: 'Por closed_at_real; fallback a loss_recorded_at/fecha_registro/created_at según vista/logic.',
        includes: ['Leads cerrados perdidos con filtro actual'],
        excludes: ['Ganados y leads abiertos'],
        updateFrequency: 'Tiempo real al cambiar filtros en /cierres',
        owner: 'Dirección Comercial',
        shortHelp: 'Conteo de leads perdidos en el periodo y filtros activos.'
    },
    loss_monthly_value: {
        id: 'loss_monthly_value',
        domain: 'loss_analytics',
        label: 'Monto perdido (mensualidad)',
        businessDefinition: 'Suma de la mensualidad estimada de leads cerrados perdidos en el periodo.',
        formula: 'SUM(valor_estimado) sobre pérdidas filtradas',
        dataSources: ['lead_loss_analytics_enriched_view', 'lead_loss_analytics_view'],
        periodRule: 'Mismo periodo/filtros del módulo de pérdidas.',
        includes: ['Valor estimado mensual de leads perdidos'],
        excludes: ['Implementación estimada', 'Leads sin entrar al set de pérdidas'],
        updateFrequency: 'Tiempo real en /cierres',
        owner: 'Dirección Comercial',
        shortHelp: 'Suma de valor mensual estimado perdido en el periodo.'
    },
    loss_implementation_value: {
        id: 'loss_implementation_value',
        domain: 'loss_analytics',
        label: 'Monto perdido (implementación)',
        businessDefinition: 'Suma del valor de implementación estimado de leads cerrados perdidos.',
        formula: 'SUM(valor_implementacion_estimado) sobre pérdidas filtradas',
        dataSources: ['lead_loss_analytics_enriched_view', 'lead_loss_analytics_view'],
        periodRule: 'Mismo periodo/filtros del módulo de pérdidas.',
        includes: ['Implementación estimada de leads perdidos'],
        excludes: ['Mensualidad estimada'],
        updateFrequency: 'Tiempo real en /cierres',
        owner: 'Dirección Comercial',
        shortHelp: 'Suma de implementación estimada perdida en el periodo.'
    },
    loss_total_estimated_value: {
        id: 'loss_total_estimated_value',
        domain: 'loss_analytics',
        label: 'Total estimado perdido',
        businessDefinition: 'Suma del valor mensual estimado perdido más implementación estimada perdida.',
        formula: 'SUM(valor_estimado + valor_implementacion_estimado) sobre pérdidas filtradas',
        dataSources: ['lead_loss_analytics_enriched_view', 'lead_loss_analytics_view'],
        periodRule: 'Mismo periodo/filtros del módulo de pérdidas.',
        includes: ['Mensualidad + implementación estimadas de pérdidas'],
        excludes: [],
        updateFrequency: 'Tiempo real en /cierres y home (bloque de pérdidas)',
        owner: 'Dirección Comercial',
        shortHelp: 'Impacto total estimado perdido: mensualidad + implementación.'
    },
    loss_top_reason: {
        id: 'loss_top_reason',
        domain: 'loss_analytics',
        label: 'Motivo principal',
        businessDefinition: 'Motivo de pérdida con mayor frecuencia en el periodo/filtro.',
        formula: 'TOP 1 por COUNT agrupando por loss_reason',
        dataSources: ['lead_loss_analytics_enriched_view', 'lead_loss_analytics_view'],
        periodRule: 'Mismo periodo/filtros del módulo de pérdidas.',
        includes: ['Motivos clasificados y “Sin clasificar” cuando aplica'],
        excludes: [],
        updateFrequency: 'Tiempo real en /cierres y home',
        owner: 'Dirección Comercial',
        shortHelp: 'Motivo de pérdida más frecuente bajo el filtro actual.'
    },
    loss_unclassified_pct: {
        id: 'loss_unclassified_pct',
        domain: 'loss_analytics',
        label: '% sin clasificar',
        businessDefinition: 'Porcentaje de pérdidas sin motivo o submotivo completos.',
        formula: 'COUNT(pérdidas sin reason o subreason) / COUNT(pérdidas) * 100',
        dataSources: ['lead_loss_analytics_enriched_view', 'lead_loss_analytics_view'],
        periodRule: 'Mismo periodo/filtros del módulo de pérdidas.',
        includes: ['Pérdidas con falta de reason_id o subreason_id'],
        excludes: [],
        updateFrequency: 'Tiempo real en /cierres',
        owner: 'Administración CRM',
        shortHelp: 'Mide calidad de captura de pérdidas estructuradas.'
    },
    loss_avg_cycle_days: {
        id: 'loss_avg_cycle_days',
        domain: 'loss_analytics',
        label: 'Ciclo promedio perdido',
        businessDefinition: 'Promedio de días desde registro del lead hasta fecha de pérdida (o referencia de pérdida).',
        formula: 'AVG(fecha pérdida referencia - fecha_registro|created_at) en pérdidas filtradas',
        dataSources: ['lead_loss_analytics_enriched_view', 'lead_loss_analytics_view'],
        periodRule: 'Mismo periodo/filtros del módulo de pérdidas.',
        includes: ['Pérdidas con fechas válidas de inicio y pérdida'],
        excludes: ['Registros con fechas faltantes/invalidas'],
        updateFrequency: 'Tiempo real en /cierres',
        owner: 'Dirección Comercial',
        shortHelp: 'Promedio de días hasta perder un lead en el periodo.'
    },
    negotiation_aging_days: {
        id: 'negotiation_aging_days',
        domain: 'negotiation_aging',
        label: 'Aging de negociación',
        businessDefinition: 'Días que un lead lleva en etapa Negociación desde su última entrada a esa etapa.',
        formula: 'CURRENT_DATE - negotiation_started_at',
        dataSources: ['lead_negotiation_aging_view', 'clientes', 'lead_history'],
        periodRule: 'Estado actual de leads en Negociación.',
        includes: ['Leads en etapa Negociación'],
        excludes: ['Prospección y cerrados'],
        updateFrequency: 'Tiempo real en /clientes',
        owner: 'Dirección Comercial',
        shortHelp: 'Días desde la última entrada del lead a Negociación.'
    },
    negotiation_stalled_count: {
        id: 'negotiation_stalled_count',
        domain: 'negotiation_aging',
        label: 'Negociaciones atoradas',
        businessDefinition: 'Leads en negociación con aging y falta de actividad/acciones según regla MVP.',
        formula: 'COUNT(leads) donde is_stalled = true en lead_negotiation_aging_view',
        dataSources: ['lead_negotiation_aging_view'],
        periodRule: 'Estado actual (ventana móvil de actividad configurada en vista).',
        includes: ['Aging >= 14d, 7d sin actividad, sin próxima junta y sin tareas pendientes (regla MVP actual)'],
        excludes: ['Negociaciones con próxima acción activa'],
        updateFrequency: 'Tiempo real en /clientes',
        owner: 'Dirección Comercial',
        shortHelp: 'Negociaciones con alta probabilidad de estancamiento según regla operativa.'
    }
}

export function getCommercialMetricDefinition(metricId: CommercialMetricId): CommercialMetricDefinition {
    return COMMERCIAL_METRICS_DICTIONARY[metricId]
}

export function pickCommercialMetricDefinitions(metricIds: CommercialMetricId[]) {
    return metricIds.map((id) => getCommercialMetricDefinition(id))
}

export const COMMERCIAL_METRICS_DICTIONARY_VERSION = '2026-02-25'
