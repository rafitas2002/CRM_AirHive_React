-- Normaliza etapas legacy "Prospección" en clientes a "Negociación".
-- Objetivo:
-- 1) Desatorar leads que ya no pueden moverse por haber quedado en etapa retirada.
-- 2) Registrar trazabilidad del cambio en lead_history.
-- 3) Evitar que futuros inserts/updates vuelvan a persistir "Prospección".

DO $$
DECLARE
    migrated_count INTEGER := 0;
BEGIN
    CREATE TEMP TABLE tmp_legacy_prospeccion_leads ON COMMIT DROP AS
    SELECT
        c.id,
        c.etapa AS old_stage,
        c.negotiation_started_at AS old_negotiation_started_at,
        c.created_at,
        c.fecha_registro
    FROM clientes c
    WHERE lower(trim(coalesce(c.etapa, ''))) IN ('prospección', 'prospeccion');

    UPDATE clientes c
    SET etapa = 'Negociación'
    FROM tmp_legacy_prospeccion_leads t
    WHERE c.id = t.id;

    GET DIAGNOSTICS migrated_count = ROW_COUNT;

    INSERT INTO lead_history (lead_id, field_name, old_value, new_value, changed_by, created_at)
    SELECT
        t.id,
        'etapa',
        t.old_stage,
        'Negociación',
        NULL,
        NOW()
    FROM tmp_legacy_prospeccion_leads t;

    -- Conserva un inicio de negociación coherente para métricas de aging.
    UPDATE clientes c
    SET negotiation_started_at = COALESCE(
        t.old_negotiation_started_at,
        CASE
            WHEN t.fecha_registro IS NOT NULL THEN t.fecha_registro::timestamptz
            ELSE NULL
        END,
        t.created_at,
        c.negotiation_started_at,
        NOW()
    )
    FROM tmp_legacy_prospeccion_leads t
    WHERE c.id = t.id;

    RAISE NOTICE 'Leads migrados de Prospección a Negociación: %', migrated_count;
END $$;

CREATE OR REPLACE FUNCTION normalize_legacy_prospeccion_stage_on_clientes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    normalized_stage TEXT;
BEGIN
    normalized_stage := lower(trim(coalesce(NEW.etapa, '')));
    IF normalized_stage IN ('prospección', 'prospeccion') THEN
        NEW.etapa := 'Negociación';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clientes_normalize_legacy_prospeccion_stage ON clientes;
CREATE TRIGGER trg_clientes_normalize_legacy_prospeccion_stage
BEFORE INSERT OR UPDATE OF etapa
ON clientes
FOR EACH ROW
EXECUTE FUNCTION normalize_legacy_prospeccion_stage_on_clientes();
