export type CompanySizeTierVisual = {
    id: number
    code: string
    name: string
    color: string
}

export type CompanySizeConfidenceValue = 'alta' | 'media' | 'baja'
export type CompanySizeSourceValue =
    | 'cliente_confirmado'
    | 'linkedin'
    | 'sitio_web'
    | 'inferencia_comercial'
    | 'otro'

export type CompanySizeConfidenceOption = {
    value: CompanySizeConfidenceValue
    label: string
    description: string
    color: string
}

export type CompanySizeSourceOption = {
    value: CompanySizeSourceValue
    label: string
    description: string
}

export type CompanySizeGuide = {
    title: string
    signals: string[]
    warning: string
}

const DEFAULT_COMPANY_SIZE_TIERS: CompanySizeTierVisual[] = [
    { id: 1, code: 'size_1', name: 'Micro', color: '#10b981' },
    { id: 2, code: 'size_2', name: 'Pequeña', color: '#3b82f6' },
    { id: 3, code: 'size_3', name: 'Mediana', color: '#6366f1' },
    { id: 4, code: 'size_4', name: 'Grande', color: '#f59e0b' },
    { id: 5, code: 'size_5', name: 'Corporativo', color: '#8b5cf6' }
]

export const COMPANY_SIZE_CONFIDENCE_OPTIONS: CompanySizeConfidenceOption[] = [
    {
        value: 'alta',
        label: 'Alta',
        description: 'Confirmado por el cliente o con evidencia directa confiable.',
        color: '#10b981'
    },
    {
        value: 'media',
        label: 'Media',
        description: 'Inferido con señales claras (web, estructura, operación visible).',
        color: '#3b82f6'
    },
    {
        value: 'baja',
        label: 'Baja',
        description: 'Estimación inicial con poca evidencia. Requiere validación posterior.',
        color: '#f59e0b'
    }
]

export const COMPANY_SIZE_SOURCE_OPTIONS: CompanySizeSourceOption[] = [
    {
        value: 'cliente_confirmado',
        label: 'Cliente confirmó',
        description: 'El prospecto confirmó el tamaño o la señal usada.'
    },
    {
        value: 'linkedin',
        label: 'LinkedIn',
        description: 'Estimación basada en perfil, equipo o estructura visible.'
    },
    {
        value: 'sitio_web',
        label: 'Sitio web',
        description: 'Estimación con base en sucursales, cobertura o estructura pública.'
    },
    {
        value: 'inferencia_comercial',
        label: 'Inferencia comercial',
        description: 'Criterio del vendedor usando señales observables.'
    },
    {
        value: 'otro',
        label: 'Otro',
        description: 'Otra fuente documentada en la señal principal.'
    }
]

const COMPANY_SIZE_SOURCE_ALLOWED_VALUES = new Set<CompanySizeSourceValue>(
    COMPANY_SIZE_SOURCE_OPTIONS.map((option) => option.value)
)

const COMPANY_SIZE_CONFIDENCE_ALLOWED_VALUES = new Set<CompanySizeConfidenceValue>(
    COMPANY_SIZE_CONFIDENCE_OPTIONS.map((option) => option.value)
)

const COMPANY_SIZE_GUIDES: Record<number, CompanySizeGuide> = {
    1: {
        title: 'Micro',
        signals: [
            'Operación local muy acotada (una sede o atención directa).',
            'Pocas personas visibles en contacto/operación.',
            'Procesos poco formalizados o muy dependientes del dueño.'
        ],
        warning: 'No usar "micro" solo porque la marca se ve pequeña; valida operación real.'
    },
    2: {
        title: 'Pequeña',
        signals: [
            'Operación local con un equipo ya identificable por áreas básicas.',
            'Puede tener una o pocas sucursales/puntos de atención.',
            'Decisión todavía cercana al dueño o dirección directa.'
        ],
        warning: 'No clasificar como pequeña si ya opera en varias ciudades con estructura formal.'
    },
    3: {
        title: 'Mediana',
        signals: [
            'Estructura funcional clara (ventas, operaciones, administración, etc.).',
            'Presencia multi-sede o mayor volumen operativo visible.',
            'Roles intermedios/gerenciales participan en decisiones.'
        ],
        warning: 'Evita usar "mediana" como categoría default cuando no sabes; registra baja confianza.'
    },
    4: {
        title: 'Grande',
        signals: [
            'Operación regional/nacional con varias sedes o unidades.',
            'Estructura gerencial consolidada y procesos más formales.',
            'Equipos especializados o múltiples responsables por área.'
        ],
        warning: 'Si existe estructura corporativa/matriz con varias unidades, evalúa "corporativo".'
    },
    5: {
        title: 'Corporativo',
        signals: [
            'Grupo empresarial, matriz o múltiples empresas/unidades bajo una marca.',
            'Estructura corporativa (direcciones, compras, TI, RH, etc.).',
            'Cobertura amplia y gobierno operativo más complejo.'
        ],
        warning: 'No usar "corporativo" solo por prestigio de marca; debe haber complejidad estructural.'
    }
}

type CompanySizeCatalogRow = {
    size_value?: number | null
    code?: string | null
    name?: string | null
}

export function getCompanySizeTierVisuals(
    catalogRows?: Array<CompanySizeCatalogRow | null | undefined> | null
): CompanySizeTierVisual[] {
    const byId = new Map<number, CompanySizeTierVisual>(
        DEFAULT_COMPANY_SIZE_TIERS.map((tier) => [tier.id, { ...tier }])
    )

    for (const row of catalogRows || []) {
        const id = Number((row as CompanySizeCatalogRow | null | undefined)?.size_value)
        if (!Number.isInteger(id) || id < 1 || id > 5) continue
        const current = byId.get(id)
        if (!current) continue

        const code = String((row as CompanySizeCatalogRow | null | undefined)?.code || '').trim()
        const name = String((row as CompanySizeCatalogRow | null | undefined)?.name || '').trim()

        byId.set(id, {
            ...current,
            code: code || current.code,
            name: name || current.name
        })
    }

    return Array.from(byId.values()).sort((a, b) => a.id - b.id)
}

export function getCompanySizeGuide(sizeValue?: number | null): CompanySizeGuide {
    const normalized = Number(sizeValue)
    return COMPANY_SIZE_GUIDES[normalized] || COMPANY_SIZE_GUIDES[3]
}

export function normalizeCompanySizeEvidenceText(value: unknown): string | null {
    const normalized = String(value ?? '').trim()
    return normalized ? normalized : null
}

export function normalizeCompanySizeSourceValue(value: unknown): CompanySizeSourceValue | null {
    const normalized = String(value ?? '').trim().toLowerCase()
    if (!normalized) return null

    if (COMPANY_SIZE_SOURCE_ALLOWED_VALUES.has(normalized as CompanySizeSourceValue)) {
        return normalized as CompanySizeSourceValue
    }

    // Legacy aliases from enrichment/autofill pipelines.
    if (
        normalized === 'agente_enriquecimiento'
        || normalized === 'enrichment_agent'
        || normalized === 'ai'
        || normalized === 'autofill'
    ) {
        return 'sitio_web'
    }

    return 'inferencia_comercial'
}

export function normalizeCompanySizeConfidenceValue(value: unknown): CompanySizeConfidenceValue | null {
    const normalized = String(value ?? '').trim().toLowerCase()
    if (!normalized) return null

    if (COMPANY_SIZE_CONFIDENCE_ALLOWED_VALUES.has(normalized as CompanySizeConfidenceValue)) {
        return normalized as CompanySizeConfidenceValue
    }

    if (normalized === 'high') return 'alta'
    if (normalized === 'medium') return 'media'
    if (normalized === 'low') return 'baja'

    return 'media'
}
