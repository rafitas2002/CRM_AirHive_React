-- CRM AirHive
-- 1) Mueve el modelo de asignaciones de proyectos a nivel LEAD.
-- 2) Agrega rangos de precio por proyecto (mensualidad e implementación).
-- 3) Refuerza el resumen de ventas reales/pronosticadas por proyecto.
-- 4) Asegura que "Cerrado Ganado" valide proyectos implementados reales por lead.
-- Nota de compatibilidad:
-- - Por legado de esquema se conservan sufijos `_usd` en nombres de columna.
-- - Operativamente en CRM estos montos ya se capturan/interpretan en MXN.

CREATE TABLE IF NOT EXISTS lead_proyecto_asignaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id BIGINT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    proyecto_id UUID NOT NULL REFERENCES proyectos_catalogo(id) ON DELETE CASCADE,
    assignment_stage TEXT NOT NULL CHECK (assignment_stage IN (
        'in_negotiation',
        'prospection_same_close',
        'future_lead_opportunity',
        'implemented_real'
    )),
    assigned_by UUID NULL REFERENCES profiles(id) ON DELETE SET NULL,
    mensualidad_pactada_usd NUMERIC(12, 2) NULL CHECK (mensualidad_pactada_usd IS NULL OR mensualidad_pactada_usd >= 0),
    implementacion_pactada_usd NUMERIC(12, 2) NULL CHECK (implementacion_pactada_usd IS NULL OR implementacion_pactada_usd >= 0),
    notes TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT lead_proyecto_asignaciones_unique UNIQUE (lead_id, proyecto_id, assignment_stage)
);

CREATE INDEX IF NOT EXISTS idx_lead_proyecto_asignaciones_lead
    ON lead_proyecto_asignaciones (lead_id);

CREATE INDEX IF NOT EXISTS idx_lead_proyecto_asignaciones_proyecto
    ON lead_proyecto_asignaciones (proyecto_id);

CREATE INDEX IF NOT EXISTS idx_lead_proyecto_asignaciones_stage
    ON lead_proyecto_asignaciones (assignment_stage);

CREATE INDEX IF NOT EXISTS idx_lead_proyecto_asignaciones_assigned_by
    ON lead_proyecto_asignaciones (assigned_by);

CREATE INDEX IF NOT EXISTS idx_lead_proyecto_asignaciones_values
    ON lead_proyecto_asignaciones (mensualidad_pactada_usd, implementacion_pactada_usd);

DO $$
BEGIN
    IF to_regprocedure('set_updated_at_column()') IS NULL THEN
        CREATE OR REPLACE FUNCTION set_updated_at_column()
        RETURNS TRIGGER
        LANGUAGE plpgsql
        AS $fn$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $fn$;
    END IF;
END $$;

DROP TRIGGER IF EXISTS trg_lead_proyecto_asignaciones_set_updated_at ON lead_proyecto_asignaciones;
CREATE TRIGGER trg_lead_proyecto_asignaciones_set_updated_at
BEFORE UPDATE ON lead_proyecto_asignaciones
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_column();

-- Compatibilidad: algunas bases legacy tienen `empresa_proyecto_asignaciones`
-- sin columnas de valores pactados/actor/notas.
DO $$
BEGIN
    IF to_regclass('public.empresa_proyecto_asignaciones') IS NOT NULL THEN
        ALTER TABLE public.empresa_proyecto_asignaciones
            ADD COLUMN IF NOT EXISTS source_lead_id BIGINT NULL,
            ADD COLUMN IF NOT EXISTS assigned_by UUID NULL,
            ADD COLUMN IF NOT EXISTS mensualidad_pactada_usd NUMERIC(12, 2) NULL,
            ADD COLUMN IF NOT EXISTS implementacion_pactada_usd NUMERIC(12, 2) NULL,
            ADD COLUMN IF NOT EXISTS notes TEXT NULL;
    END IF;
END $$;

-- Backfill inicial desde tabla legacy a nivel empresa, solo cuando existe source_lead_id.
INSERT INTO lead_proyecto_asignaciones (
    lead_id,
    proyecto_id,
    assignment_stage,
    assigned_by,
    mensualidad_pactada_usd,
    implementacion_pactada_usd,
    notes
)
SELECT
    epa.source_lead_id AS lead_id,
    epa.proyecto_id,
    epa.assignment_stage,
    epa.assigned_by,
    epa.mensualidad_pactada_usd,
    epa.implementacion_pactada_usd,
    epa.notes
FROM empresa_proyecto_asignaciones epa
WHERE epa.source_lead_id IS NOT NULL
ON CONFLICT (lead_id, proyecto_id, assignment_stage)
DO UPDATE SET
    assigned_by = EXCLUDED.assigned_by,
    mensualidad_pactada_usd = EXCLUDED.mensualidad_pactada_usd,
    implementacion_pactada_usd = EXCLUDED.implementacion_pactada_usd,
    notes = EXCLUDED.notes;

ALTER TABLE IF EXISTS proyectos_catalogo
    ADD COLUMN IF NOT EXISTS valor_real_mensualidad_usd NUMERIC(12, 2) NULL,
    ADD COLUMN IF NOT EXISTS valor_real_implementacion_usd NUMERIC(12, 2) NULL,
    ADD COLUMN IF NOT EXISTS rango_mensualidad_min_usd NUMERIC(12, 2) NULL,
    ADD COLUMN IF NOT EXISTS rango_mensualidad_max_usd NUMERIC(12, 2) NULL,
    ADD COLUMN IF NOT EXISTS rango_implementacion_min_usd NUMERIC(12, 2) NULL,
    ADD COLUMN IF NOT EXISTS rango_implementacion_max_usd NUMERIC(12, 2) NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'proyectos_catalogo_rango_mensualidad_min_usd_check'
    ) THEN
        ALTER TABLE proyectos_catalogo
            ADD CONSTRAINT proyectos_catalogo_rango_mensualidad_min_usd_check
            CHECK (rango_mensualidad_min_usd IS NULL OR rango_mensualidad_min_usd >= 0);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'proyectos_catalogo_rango_mensualidad_max_usd_check'
    ) THEN
        ALTER TABLE proyectos_catalogo
            ADD CONSTRAINT proyectos_catalogo_rango_mensualidad_max_usd_check
            CHECK (rango_mensualidad_max_usd IS NULL OR rango_mensualidad_max_usd >= 0);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'proyectos_catalogo_rango_implementacion_min_usd_check'
    ) THEN
        ALTER TABLE proyectos_catalogo
            ADD CONSTRAINT proyectos_catalogo_rango_implementacion_min_usd_check
            CHECK (rango_implementacion_min_usd IS NULL OR rango_implementacion_min_usd >= 0);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'proyectos_catalogo_rango_implementacion_max_usd_check'
    ) THEN
        ALTER TABLE proyectos_catalogo
            ADD CONSTRAINT proyectos_catalogo_rango_implementacion_max_usd_check
            CHECK (rango_implementacion_max_usd IS NULL OR rango_implementacion_max_usd >= 0);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'proyectos_catalogo_rango_mensualidad_order_check'
    ) THEN
        ALTER TABLE proyectos_catalogo
            ADD CONSTRAINT proyectos_catalogo_rango_mensualidad_order_check
            CHECK (
                rango_mensualidad_min_usd IS NULL
                OR rango_mensualidad_max_usd IS NULL
                OR rango_mensualidad_min_usd <= rango_mensualidad_max_usd
            );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'proyectos_catalogo_rango_implementacion_order_check'
    ) THEN
        ALTER TABLE proyectos_catalogo
            ADD CONSTRAINT proyectos_catalogo_rango_implementacion_order_check
            CHECK (
                rango_implementacion_min_usd IS NULL
                OR rango_implementacion_max_usd IS NULL
                OR rango_implementacion_min_usd <= rango_implementacion_max_usd
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_proyectos_catalogo_rango_mensualidad
    ON proyectos_catalogo (rango_mensualidad_min_usd, rango_mensualidad_max_usd);

CREATE INDEX IF NOT EXISTS idx_proyectos_catalogo_rango_implementacion
    ON proyectos_catalogo (rango_implementacion_min_usd, rango_implementacion_max_usd);

-- Si un proyecto ya tenía precio base, lo usamos como rango inicial min=max.
UPDATE proyectos_catalogo
SET
    rango_mensualidad_min_usd = COALESCE(rango_mensualidad_min_usd, valor_real_mensualidad_usd),
    rango_mensualidad_max_usd = COALESCE(rango_mensualidad_max_usd, valor_real_mensualidad_usd),
    rango_implementacion_min_usd = COALESCE(rango_implementacion_min_usd, valor_real_implementacion_usd),
    rango_implementacion_max_usd = COALESCE(rango_implementacion_max_usd, valor_real_implementacion_usd)
WHERE
    rango_mensualidad_min_usd IS NULL
    OR rango_mensualidad_max_usd IS NULL
    OR rango_implementacion_min_usd IS NULL
    OR rango_implementacion_max_usd IS NULL;

-- Vista unificada de performance de venta real y forecast por proyecto.
-- Mantiene las 4 columnas legacy al inicio para compatibilidad.
CREATE OR REPLACE VIEW proyectos_catalogo_sales_summary AS
WITH lead_rows AS (
    SELECT
        lpa.lead_id,
        lpa.proyecto_id,
        lpa.assignment_stage,
        lpa.mensualidad_pactada_usd,
        lpa.implementacion_pactada_usd
    FROM lead_proyecto_asignaciones lpa
),
legacy_rows AS (
    SELECT
        epa.source_lead_id AS lead_id,
        epa.proyecto_id,
        epa.assignment_stage,
        epa.mensualidad_pactada_usd,
        epa.implementacion_pactada_usd
    FROM empresa_proyecto_asignaciones epa
    WHERE
        epa.source_lead_id IS NOT NULL
        AND NOT EXISTS (
            SELECT 1
            FROM lead_proyecto_asignaciones lpa
            WHERE lpa.lead_id = epa.source_lead_id
              AND lpa.proyecto_id = epa.proyecto_id
              AND lpa.assignment_stage = epa.assignment_stage
        )
),
assignment_rows AS (
    SELECT * FROM lead_rows
    UNION ALL
    SELECT * FROM legacy_rows
)
SELECT
    p.id AS proyecto_id,
    COUNT(*) FILTER (WHERE a.assignment_stage = 'implemented_real')::INTEGER AS implemented_sales_count,
    AVG(a.mensualidad_pactada_usd) FILTER (WHERE a.assignment_stage = 'implemented_real' AND a.mensualidad_pactada_usd IS NOT NULL) AS avg_mensualidad_pactada_usd,
    AVG(a.implementacion_pactada_usd) FILTER (WHERE a.assignment_stage = 'implemented_real' AND a.implementacion_pactada_usd IS NOT NULL) AS avg_implementacion_pactada_usd,
    AVG(
        COALESCE(a.mensualidad_pactada_usd, 0) + COALESCE(a.implementacion_pactada_usd, 0)
    ) FILTER (
        WHERE a.assignment_stage = 'implemented_real'
          AND (a.mensualidad_pactada_usd IS NOT NULL OR a.implementacion_pactada_usd IS NOT NULL)
    ) AS avg_total_pactado_usd,
    COUNT(*) FILTER (
        WHERE a.assignment_stage IN ('in_negotiation', 'prospection_same_close', 'future_lead_opportunity')
    )::INTEGER AS forecast_sales_count,
    AVG(a.mensualidad_pactada_usd) FILTER (
        WHERE a.assignment_stage IN ('in_negotiation', 'prospection_same_close', 'future_lead_opportunity')
          AND a.mensualidad_pactada_usd IS NOT NULL
    ) AS avg_forecast_mensualidad_pactada_usd,
    AVG(a.implementacion_pactada_usd) FILTER (
        WHERE a.assignment_stage IN ('in_negotiation', 'prospection_same_close', 'future_lead_opportunity')
          AND a.implementacion_pactada_usd IS NOT NULL
    ) AS avg_forecast_implementacion_pactada_usd,
    AVG(
        COALESCE(a.mensualidad_pactada_usd, 0) + COALESCE(a.implementacion_pactada_usd, 0)
    ) FILTER (
        WHERE a.assignment_stage IN ('in_negotiation', 'prospection_same_close', 'future_lead_opportunity')
          AND (a.mensualidad_pactada_usd IS NOT NULL OR a.implementacion_pactada_usd IS NOT NULL)
    ) AS avg_forecast_total_pactado_usd
FROM proyectos_catalogo p
LEFT JOIN assignment_rows a
    ON a.proyecto_id = p.id
GROUP BY p.id;

CREATE OR REPLACE FUNCTION enforce_won_lead_requires_real_project()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_projects_json JSONB;
    v_projects_count INTEGER := 0;
    v_has_real_assignment BOOLEAN := FALSE;
BEGIN
    IF NOT is_won_stage(NEW.etapa) THEN
        RETURN NEW;
    END IF;

    -- Soporta esquemas donde el payload incluya esta columna (si existe).
    v_projects_json := to_jsonb(NEW) -> 'proyectos_implementados_reales_ids';
    IF v_projects_json IS NOT NULL AND jsonb_typeof(v_projects_json) = 'array' THEN
        v_projects_count := jsonb_array_length(v_projects_json);
    END IF;

    IF to_regclass('public.lead_proyecto_asignaciones') IS NOT NULL AND NEW.id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1
            FROM lead_proyecto_asignaciones lpa
            WHERE lpa.assignment_stage = 'implemented_real'
              AND lpa.lead_id = NEW.id
        )
        INTO v_has_real_assignment;
    END IF;

    IF NOT v_has_real_assignment AND to_regclass('public.empresa_proyecto_asignaciones') IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1
            FROM empresa_proyecto_asignaciones epa
            WHERE epa.assignment_stage = 'implemented_real'
              AND (
                (NEW.id IS NOT NULL AND epa.source_lead_id = NEW.id)
                OR (NEW.empresa_id IS NOT NULL AND epa.empresa_id = NEW.empresa_id)
              )
        )
        INTO v_has_real_assignment;
    END IF;

    IF v_projects_count <= 0 AND NOT v_has_real_assignment THEN
        RAISE EXCEPTION 'Para guardar Cerrado Ganado debes asignar al menos 1 proyecto implementado real.'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_won_lead_requires_real_project ON clientes;
CREATE TRIGGER trg_enforce_won_lead_requires_real_project
BEFORE INSERT OR UPDATE OF etapa, empresa_id
ON clientes
FOR EACH ROW
EXECUTE FUNCTION enforce_won_lead_requires_real_project();
