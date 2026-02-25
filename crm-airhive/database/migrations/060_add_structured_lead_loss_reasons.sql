-- Razones de pérdida estructuradas para leads en Cerrado Perdido
-- Objetivo:
-- 1) Estandarizar motivo + submotivo al cerrar un lead como perdido
-- 2) Obligar captura en DB (DB-first)
-- 3) Habilitar analytics reales por motivo/submotivo

CREATE TABLE IF NOT EXISTS lead_loss_reasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    description TEXT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lead_loss_subreasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reason_id UUID NOT NULL REFERENCES lead_loss_reasons(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    label TEXT NOT NULL,
    description TEXT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT lead_loss_subreasons_reason_code_unique UNIQUE (reason_id, code)
);

CREATE INDEX IF NOT EXISTS idx_lead_loss_reasons_sort
    ON lead_loss_reasons (is_active, sort_order, label);

CREATE INDEX IF NOT EXISTS idx_lead_loss_subreasons_reason_sort
    ON lead_loss_subreasons (reason_id, is_active, sort_order, label);

ALTER TABLE clientes
    ADD COLUMN IF NOT EXISTS loss_reason_id UUID NULL,
    ADD COLUMN IF NOT EXISTS loss_subreason_id UUID NULL,
    ADD COLUMN IF NOT EXISTS loss_notes TEXT NULL,
    ADD COLUMN IF NOT EXISTS loss_recorded_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS loss_recorded_by UUID NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'clientes_loss_reason_id_fkey'
    ) THEN
        ALTER TABLE clientes
            ADD CONSTRAINT clientes_loss_reason_id_fkey
            FOREIGN KEY (loss_reason_id) REFERENCES lead_loss_reasons(id) ON DELETE SET NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'clientes_loss_subreason_id_fkey'
    ) THEN
        ALTER TABLE clientes
            ADD CONSTRAINT clientes_loss_subreason_id_fkey
            FOREIGN KEY (loss_subreason_id) REFERENCES lead_loss_subreasons(id) ON DELETE SET NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'clientes_loss_recorded_by_fkey'
    ) THEN
        ALTER TABLE clientes
            ADD CONSTRAINT clientes_loss_recorded_by_fkey
            FOREIGN KEY (loss_recorded_by) REFERENCES profiles(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_clientes_loss_reason_id
    ON clientes (loss_reason_id);

CREATE INDEX IF NOT EXISTS idx_clientes_loss_subreason_id
    ON clientes (loss_subreason_id);

CREATE INDEX IF NOT EXISTS idx_clientes_loss_recorded_at
    ON clientes (loss_recorded_at DESC);

CREATE OR REPLACE FUNCTION validate_client_structured_loss_reason()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    normalized_stage TEXT;
    subreason_matches BOOLEAN;
BEGIN
    normalized_stage := lower(trim(coalesce(NEW.etapa, '')));

    IF normalized_stage IN ('cerrado perdido', 'cerrada perdida') THEN
        IF NEW.loss_reason_id IS NULL OR NEW.loss_subreason_id IS NULL THEN
            RAISE EXCEPTION 'Cerrado Perdido requiere motivo y submotivo'
                USING ERRCODE = '23514';
        END IF;

        SELECT EXISTS (
            SELECT 1
            FROM lead_loss_subreasons s
            WHERE s.id = NEW.loss_subreason_id
              AND s.reason_id = NEW.loss_reason_id
        ) INTO subreason_matches;

        IF NOT subreason_matches THEN
            RAISE EXCEPTION 'El submotivo seleccionado no pertenece al motivo indicado'
                USING ERRCODE = '23514';
        END IF;

        IF NEW.loss_recorded_at IS NULL THEN
            NEW.loss_recorded_at := NOW();
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clientes_validate_structured_loss_reason ON clientes;
CREATE TRIGGER trg_clientes_validate_structured_loss_reason
BEFORE INSERT OR UPDATE ON clientes
FOR EACH ROW
EXECUTE FUNCTION validate_client_structured_loss_reason();

-- Seed: motivos
INSERT INTO lead_loss_reasons (code, label, description, sort_order, is_active)
VALUES
    ('precio', 'Precio', 'La oferta no cerró por tema de precio o costo total percibido.', 10, TRUE),
    ('timing', 'Timing', 'La empresa pospuso la decisión por momento/prioridad/ventana interna.', 20, TRUE),
    ('competencia', 'Competencia', 'Se eligió o mantuvo otra solución/proveedor.', 30, TRUE),
    ('no_fit', 'No fit', 'No hubo encaje técnico, operativo o comercial.', 40, TRUE),
    ('presupuesto', 'Presupuesto', 'No existe presupuesto disponible o fue congelado.', 50, TRUE),
    ('sin_decision', 'Sin decisión', 'El prospecto no logró avanzar internamente a una decisión.', 60, TRUE),
    ('no_respuesta', 'No respuesta / Ghosting', 'Se perdió tracción por falta de respuesta.', 70, TRUE),
    ('prioridad_interna', 'Prioridad interna', 'El prospecto cambió prioridades hacia otros proyectos.', 80, TRUE),
    ('otro', 'Otro', 'Razón de pérdida fuera del catálogo principal.', 90, TRUE)
ON CONFLICT (code) DO UPDATE SET
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

WITH reason_ids AS (
    SELECT id, code FROM lead_loss_reasons
)
INSERT INTO lead_loss_subreasons (reason_id, code, label, description, sort_order, is_active)
VALUES
    ((SELECT id FROM reason_ids WHERE code = 'precio'), 'precio_alto', 'Precio fuera de presupuesto', NULL, 10, TRUE),
    ((SELECT id FROM reason_ids WHERE code = 'precio'), 'precio_vs_valor', 'No percibió suficiente valor', NULL, 20, TRUE),
    ((SELECT id FROM reason_ids WHERE code = 'precio'), 'estructura_comercial', 'Estructura de pago no aceptada', NULL, 30, TRUE),

    ((SELECT id FROM reason_ids WHERE code = 'timing'), 'pospuesto_trimestre', 'Pospuesto al siguiente trimestre', NULL, 10, TRUE),
    ((SELECT id FROM reason_ids WHERE code = 'timing'), 'sin_ventana_impl', 'Sin ventana de implementación', NULL, 20, TRUE),
    ((SELECT id FROM reason_ids WHERE code = 'timing'), 'esperar_resultados', 'Decidieron esperar resultados internos', NULL, 30, TRUE),

    ((SELECT id FROM reason_ids WHERE code = 'competencia'), 'ya_tiene_proveedor', 'Ya trabaja con otro proveedor', NULL, 10, TRUE),
    ((SELECT id FROM reason_ids WHERE code = 'competencia'), 'competidor_mas_barato', 'Competidor con mejor precio', NULL, 20, TRUE),
    ((SELECT id FROM reason_ids WHERE code = 'competencia'), 'relacion_previa', 'Relación previa con competidor', NULL, 30, TRUE),

    ((SELECT id FROM reason_ids WHERE code = 'no_fit'), 'alcance_no_fit', 'El alcance no cubre su necesidad', NULL, 10, TRUE),
    ((SELECT id FROM reason_ids WHERE code = 'no_fit'), 'requerimiento_tecnico', 'Requerimiento técnico incompatible', NULL, 20, TRUE),
    ((SELECT id FROM reason_ids WHERE code = 'no_fit'), 'tamano_no_fit', 'No encaja por tamaño/etapa de empresa', NULL, 30, TRUE),

    ((SELECT id FROM reason_ids WHERE code = 'presupuesto'), 'sin_presupuesto', 'No hay presupuesto aprobado', NULL, 10, TRUE),
    ((SELECT id FROM reason_ids WHERE code = 'presupuesto'), 'presupuesto_congelado', 'Presupuesto congelado', NULL, 20, TRUE),
    ((SELECT id FROM reason_ids WHERE code = 'presupuesto'), 'prioridad_presupuestal', 'Reasignaron presupuesto', NULL, 30, TRUE),

    ((SELECT id FROM reason_ids WHERE code = 'sin_decision'), 'decision_maker_no_avanza', 'No avanzó el decision maker', NULL, 10, TRUE),
    ((SELECT id FROM reason_ids WHERE code = 'sin_decision'), 'stakeholders_divididos', 'Stakeholders sin consenso', NULL, 20, TRUE),
    ((SELECT id FROM reason_ids WHERE code = 'sin_decision'), 'proceso_interno_lento', 'Proceso interno demasiado lento', NULL, 30, TRUE),

    ((SELECT id FROM reason_ids WHERE code = 'no_respuesta'), 'ghosting_post_demo', 'Sin respuesta después de presentación/junta', NULL, 10, TRUE),
    ((SELECT id FROM reason_ids WHERE code = 'no_respuesta'), 'ghosting_inicial', 'Sin respuesta en contacto inicial', NULL, 20, TRUE),
    ((SELECT id FROM reason_ids WHERE code = 'no_respuesta'), 'sin_follow_up_cliente', 'El cliente dejó de dar seguimiento', NULL, 30, TRUE),

    ((SELECT id FROM reason_ids WHERE code = 'prioridad_interna'), 'otro_proyecto_prioritario', 'Priorizaron otro proyecto', NULL, 10, TRUE),
    ((SELECT id FROM reason_ids WHERE code = 'prioridad_interna'), 'cambio_direccion', 'Cambio de dirección/estrategia', NULL, 20, TRUE),
    ((SELECT id FROM reason_ids WHERE code = 'prioridad_interna'), 'reestructura_interna', 'Reestructura interna', NULL, 30, TRUE),

    ((SELECT id FROM reason_ids WHERE code = 'otro'), 'otro_especificar', 'Otro (especificar en notas)', NULL, 10, TRUE)
ON CONFLICT (reason_id, code) DO UPDATE SET
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- Vista base para analytics de pérdidas (estructurado)
CREATE OR REPLACE VIEW lead_loss_analytics_view AS
SELECT
    c.id AS lead_id,
    c.owner_id AS seller_id,
    c.owner_username AS seller_username,
    c.empresa_id,
    c.empresa,
    c.nombre,
    c.etapa,
    c.valor_estimado,
    (c.valor_real_cierre)::NUMERIC AS valor_real_cierre,
    c.closed_at_real,
    c.loss_recorded_at,
    c.loss_recorded_by,
    date_trunc('month', COALESCE(c.closed_at_real, c.loss_recorded_at, c.fecha_registro)) AS loss_month,
    r.id AS loss_reason_id,
    r.code AS loss_reason_code,
    r.label AS loss_reason_label,
    s.id AS loss_subreason_id,
    s.code AS loss_subreason_code,
    s.label AS loss_subreason_label,
    c.loss_notes
FROM clientes c
LEFT JOIN lead_loss_reasons r
    ON r.id = c.loss_reason_id
LEFT JOIN lead_loss_subreasons s
    ON s.id = c.loss_subreason_id
WHERE lower(trim(coalesce(c.etapa, ''))) IN ('cerrado perdido', 'cerrada perdida');
