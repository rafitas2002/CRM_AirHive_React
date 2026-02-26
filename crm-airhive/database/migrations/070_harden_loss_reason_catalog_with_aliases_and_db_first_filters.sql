-- Endurece catálogo de razones de pérdida (DB-first)
-- Objetivo:
-- 1) Añadir aliases canónicos para motivo/submotivo (compatibilidad y normalización)
-- 2) Reforzar validación en clientes (motivo/submotivo activos y parent-child)
-- 3) Backfill opcional desde columnas legacy si existen en algunas bases

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.lead_loss_reasons') IS NULL
       OR to_regclass('public.lead_loss_subreasons') IS NULL THEN
        RAISE EXCEPTION 'Aplica primero la migración 060 (catálogo de razones de pérdida) antes de 070.';
    END IF;
END $$;

CREATE OR REPLACE FUNCTION normalize_lead_loss_catalog_key(p_value TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_key TEXT;
BEGIN
    v_key := NULLIF(BTRIM(COALESCE(p_value, '')), '');
    IF v_key IS NULL THEN
        RETURN NULL;
    END IF;

    v_key := LOWER(TRANSLATE(
        v_key,
        'ÁÀÄÂáàäâÉÈËÊéèëêÍÌÏÎíìïîÓÒÖÔóòöôÚÙÜÛúùüûÑñ',
        'AAAAaaaaEEEEeeeeIIIIiiiiOOOOooooUUUUuuuuNn'
    ));

    v_key := REPLACE(v_key, '_', ' ');
    v_key := REGEXP_REPLACE(v_key, '[^a-z0-9\s]+', ' ', 'g');
    v_key := REGEXP_REPLACE(v_key, '\s+', ' ', 'g');
    v_key := NULLIF(BTRIM(v_key), '');

    RETURN v_key;
END;
$$;

CREATE TABLE IF NOT EXISTS lead_loss_reason_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reason_id UUID NOT NULL REFERENCES lead_loss_reasons(id) ON DELETE CASCADE,
    alias_label TEXT NOT NULL,
    alias_key TEXT NOT NULL,
    alias_type TEXT NOT NULL DEFAULT 'label',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lead_loss_subreason_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reason_id UUID NOT NULL REFERENCES lead_loss_reasons(id) ON DELETE CASCADE,
    subreason_id UUID NOT NULL REFERENCES lead_loss_subreasons(id) ON DELETE CASCADE,
    alias_label TEXT NOT NULL,
    alias_key TEXT NOT NULL,
    alias_type TEXT NOT NULL DEFAULT 'label',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE lead_loss_reason_aliases
    ADD COLUMN IF NOT EXISTS alias_key TEXT,
    ADD COLUMN IF NOT EXISTS alias_type TEXT NOT NULL DEFAULT 'label',
    ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE lead_loss_subreason_aliases
    ADD COLUMN IF NOT EXISTS reason_id UUID,
    ADD COLUMN IF NOT EXISTS alias_key TEXT,
    ADD COLUMN IF NOT EXISTS alias_type TEXT NOT NULL DEFAULT 'label',
    ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE lead_loss_reason_aliases
SET alias_key = normalize_lead_loss_catalog_key(COALESCE(alias_label, alias_key))
WHERE alias_key IS DISTINCT FROM normalize_lead_loss_catalog_key(COALESCE(alias_label, alias_key));

UPDATE lead_loss_subreason_aliases a
SET alias_key = normalize_lead_loss_catalog_key(COALESCE(a.alias_label, a.alias_key)),
    reason_id = COALESCE(a.reason_id, s.reason_id)
FROM lead_loss_subreasons s
WHERE s.id = a.subreason_id
  AND (
      a.alias_key IS DISTINCT FROM normalize_lead_loss_catalog_key(COALESCE(a.alias_label, a.alias_key))
      OR a.reason_id IS DISTINCT FROM s.reason_id
  );

DELETE FROM lead_loss_reason_aliases
WHERE alias_label IS NULL
   OR BTRIM(alias_label) = ''
   OR alias_key IS NULL
   OR BTRIM(alias_key) = '';

DELETE FROM lead_loss_subreason_aliases
WHERE alias_label IS NULL
   OR BTRIM(alias_label) = ''
   OR alias_key IS NULL
   OR BTRIM(alias_key) = ''
   OR subreason_id IS NULL
   OR reason_id IS NULL;

ALTER TABLE lead_loss_reason_aliases
    ALTER COLUMN alias_key SET NOT NULL;

ALTER TABLE lead_loss_subreason_aliases
    ALTER COLUMN alias_key SET NOT NULL;

ALTER TABLE lead_loss_subreason_aliases
    ALTER COLUMN reason_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_loss_reason_aliases_alias_key_unique
    ON lead_loss_reason_aliases (alias_key);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_loss_subreason_aliases_reason_alias_key_unique
    ON lead_loss_subreason_aliases (reason_id, alias_key);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_loss_subreason_aliases_subreason_alias_key_unique
    ON lead_loss_subreason_aliases (subreason_id, alias_key);

CREATE INDEX IF NOT EXISTS idx_lead_loss_reason_aliases_reason_active
    ON lead_loss_reason_aliases (reason_id, is_active, sort_order);

CREATE INDEX IF NOT EXISTS idx_lead_loss_subreason_aliases_subreason_active
    ON lead_loss_subreason_aliases (subreason_id, is_active, sort_order);

CREATE OR REPLACE FUNCTION set_lead_loss_reason_aliases_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := NOW();
    NEW.alias_key := normalize_lead_loss_catalog_key(COALESCE(NEW.alias_label, NEW.alias_key));
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION set_lead_loss_subreason_aliases_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_reason_id UUID;
BEGIN
    SELECT s.reason_id
    INTO v_reason_id
    FROM lead_loss_subreasons s
    WHERE s.id = NEW.subreason_id;

    IF v_reason_id IS NULL THEN
        RAISE EXCEPTION 'Submotivo de pérdida inválido para alias' USING ERRCODE = '23503';
    END IF;

    NEW.reason_id := v_reason_id;
    NEW.updated_at := NOW();
    NEW.alias_key := normalize_lead_loss_catalog_key(COALESCE(NEW.alias_label, NEW.alias_key));
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_loss_reason_aliases_set_fields ON lead_loss_reason_aliases;
CREATE TRIGGER trg_lead_loss_reason_aliases_set_fields
BEFORE INSERT OR UPDATE ON lead_loss_reason_aliases
FOR EACH ROW
EXECUTE FUNCTION set_lead_loss_reason_aliases_fields();

DROP TRIGGER IF EXISTS trg_lead_loss_subreason_aliases_set_fields ON lead_loss_subreason_aliases;
CREATE TRIGGER trg_lead_loss_subreason_aliases_set_fields
BEFORE INSERT OR UPDATE ON lead_loss_subreason_aliases
FOR EACH ROW
EXECUTE FUNCTION set_lead_loss_subreason_aliases_fields();

-- Semillas de aliases base (label + code)
INSERT INTO lead_loss_reason_aliases (reason_id, alias_label, alias_type, sort_order, is_active)
SELECT r.id, r.label, 'label', COALESCE(r.sort_order, 0), COALESCE(r.is_active, TRUE)
FROM lead_loss_reasons r
WHERE r.label IS NOT NULL AND BTRIM(r.label) <> ''
ON CONFLICT (alias_key) DO UPDATE
SET reason_id = EXCLUDED.reason_id,
    alias_label = EXCLUDED.alias_label,
    alias_type = EXCLUDED.alias_type,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

INSERT INTO lead_loss_reason_aliases (reason_id, alias_label, alias_type, sort_order, is_active)
SELECT r.id, r.code, 'code', COALESCE(r.sort_order, 0), COALESCE(r.is_active, TRUE)
FROM lead_loss_reasons r
WHERE r.code IS NOT NULL AND BTRIM(r.code) <> ''
ON CONFLICT (alias_key) DO UPDATE
SET reason_id = EXCLUDED.reason_id,
    alias_label = EXCLUDED.alias_label,
    alias_type = EXCLUDED.alias_type,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

INSERT INTO lead_loss_subreason_aliases (subreason_id, alias_label, alias_type, sort_order, is_active)
SELECT s.id, s.label, 'label', COALESCE(s.sort_order, 0), COALESCE(s.is_active, TRUE)
FROM lead_loss_subreasons s
WHERE s.label IS NOT NULL AND BTRIM(s.label) <> ''
ON CONFLICT (subreason_id, alias_key) DO UPDATE
SET alias_label = EXCLUDED.alias_label,
    alias_type = EXCLUDED.alias_type,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

INSERT INTO lead_loss_subreason_aliases (subreason_id, alias_label, alias_type, sort_order, is_active)
SELECT s.id, s.code, 'code', COALESCE(s.sort_order, 0), COALESCE(s.is_active, TRUE)
FROM lead_loss_subreasons s
WHERE s.code IS NOT NULL AND BTRIM(s.code) <> ''
ON CONFLICT (subreason_id, alias_key) DO UPDATE
SET alias_label = EXCLUDED.alias_label,
    alias_type = EXCLUDED.alias_type,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- Synonyms útiles (motivos)
INSERT INTO lead_loss_reason_aliases (reason_id, alias_label, alias_type, sort_order, is_active)
SELECT r.id, alias_label, 'synonym', 0, TRUE
FROM (
    VALUES
        ('no_respuesta', 'ghosting'),
        ('no_respuesta', 'sin respuesta'),
        ('competencia', 'competidor'),
        ('precio', 'costo'),
        ('presupuesto', 'sin presupuesto'),
        ('prioridad_interna', 'prioridades internas'),
        ('sin_decision', 'sin decision')
) AS v(reason_code, alias_label)
JOIN lead_loss_reasons r ON r.code = v.reason_code
ON CONFLICT (alias_key) DO NOTHING;

CREATE OR REPLACE FUNCTION resolve_lead_loss_reason_id_from_alias(p_input TEXT)
RETURNS UUID
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_key TEXT;
    v_reason_id UUID;
BEGIN
    v_key := normalize_lead_loss_catalog_key(p_input);
    IF v_key IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT a.reason_id
    INTO v_reason_id
    FROM lead_loss_reason_aliases a
    JOIN lead_loss_reasons r
      ON r.id = a.reason_id
    WHERE a.alias_key = v_key
      AND a.is_active = TRUE
      AND r.is_active = TRUE
    ORDER BY a.sort_order, a.alias_label
    LIMIT 1;

    IF v_reason_id IS NOT NULL THEN
        RETURN v_reason_id;
    END IF;

    SELECT r.id
    INTO v_reason_id
    FROM lead_loss_reasons r
    WHERE r.is_active = TRUE
      AND (
          normalize_lead_loss_catalog_key(r.code) = v_key
          OR normalize_lead_loss_catalog_key(r.label) = v_key
      )
    ORDER BY r.sort_order, r.label
    LIMIT 1;

    RETURN v_reason_id;
END;
$$;

CREATE OR REPLACE FUNCTION resolve_lead_loss_subreason_id_from_alias(p_reason_id UUID, p_input TEXT)
RETURNS UUID
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_key TEXT;
    v_subreason_id UUID;
BEGIN
    IF p_reason_id IS NULL THEN
        RETURN NULL;
    END IF;

    v_key := normalize_lead_loss_catalog_key(p_input);
    IF v_key IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT a.subreason_id
    INTO v_subreason_id
    FROM lead_loss_subreason_aliases a
    JOIN lead_loss_subreasons s
      ON s.id = a.subreason_id
    JOIN lead_loss_reasons r
      ON r.id = s.reason_id
    WHERE a.reason_id = p_reason_id
      AND a.alias_key = v_key
      AND a.is_active = TRUE
      AND s.is_active = TRUE
      AND r.is_active = TRUE
    ORDER BY a.sort_order, a.alias_label
    LIMIT 1;

    IF v_subreason_id IS NOT NULL THEN
        RETURN v_subreason_id;
    END IF;

    SELECT s.id
    INTO v_subreason_id
    FROM lead_loss_subreasons s
    JOIN lead_loss_reasons r
      ON r.id = s.reason_id
    WHERE s.reason_id = p_reason_id
      AND s.is_active = TRUE
      AND r.is_active = TRUE
      AND (
          normalize_lead_loss_catalog_key(s.code) = v_key
          OR normalize_lead_loss_catalog_key(s.label) = v_key
      )
    ORDER BY s.sort_order, s.label
    LIMIT 1;

    RETURN v_subreason_id;
END;
$$;

-- Validador reforzado (sustituye al de 060): parent-child + activos
CREATE OR REPLACE FUNCTION validate_client_structured_loss_reason()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    normalized_stage TEXT;
    v_reason_active BOOLEAN;
    v_subreason_active BOOLEAN;
    v_subreason_reason_id UUID;
BEGIN
    normalized_stage := lower(trim(coalesce(NEW.etapa, '')));

    IF normalized_stage IN ('cerrado perdido', 'cerrada perdida') THEN
        IF NEW.loss_reason_id IS NULL OR NEW.loss_subreason_id IS NULL THEN
            RAISE EXCEPTION 'Cerrado Perdido requiere motivo y submotivo'
                USING ERRCODE = '23514';
        END IF;

        SELECT r.is_active
        INTO v_reason_active
        FROM lead_loss_reasons r
        WHERE r.id = NEW.loss_reason_id;

        IF COALESCE(v_reason_active, FALSE) IS NOT TRUE THEN
            RAISE EXCEPTION 'El motivo de pérdida seleccionado no está activo o no existe'
                USING ERRCODE = '23514';
        END IF;

        SELECT s.reason_id, s.is_active
        INTO v_subreason_reason_id, v_subreason_active
        FROM lead_loss_subreasons s
        WHERE s.id = NEW.loss_subreason_id;

        IF COALESCE(v_subreason_active, FALSE) IS NOT TRUE THEN
            RAISE EXCEPTION 'El submotivo seleccionado no está activo o no existe'
                USING ERRCODE = '23514';
        END IF;

        IF v_subreason_reason_id IS DISTINCT FROM NEW.loss_reason_id THEN
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

-- Backfill opcional desde columnas legacy si algunas bases aún las tienen.
DO $$
DECLARE
    v_reason_col TEXT;
    v_subreason_col TEXT;
    v_sql TEXT;
BEGIN
    SELECT column_name
    INTO v_reason_col
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'clientes'
      AND column_name IN (
          'motivo_perdida',
          'razon_perdida',
          'loss_reason',
          'loss_reason_label'
      )
    ORDER BY CASE column_name
        WHEN 'motivo_perdida' THEN 1
        WHEN 'razon_perdida' THEN 2
        WHEN 'loss_reason' THEN 3
        WHEN 'loss_reason_label' THEN 4
        ELSE 99
    END
    LIMIT 1;

    SELECT column_name
    INTO v_subreason_col
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'clientes'
      AND column_name IN (
          'submotivo_perdida',
          'loss_subreason',
          'loss_subreason_label'
      )
    ORDER BY CASE column_name
        WHEN 'submotivo_perdida' THEN 1
        WHEN 'loss_subreason' THEN 2
        WHEN 'loss_subreason_label' THEN 3
        ELSE 99
    END
    LIMIT 1;

    IF v_reason_col IS NULL THEN
        RETURN;
    END IF;

    IF v_subreason_col IS NULL THEN
        v_sql := format($fmt$
            UPDATE clientes c
            SET loss_reason_id = COALESCE(
                    c.loss_reason_id,
                    resolve_lead_loss_reason_id_from_alias(NULLIF(BTRIM(c.%1$I::TEXT), ''))
                ),
                loss_recorded_at = CASE
                    WHEN c.loss_recorded_at IS NOT NULL THEN c.loss_recorded_at
                    WHEN lower(trim(coalesce(c.etapa, ''))) IN ('cerrado perdido', 'cerrada perdida')
                        THEN COALESCE(c.closed_at_real, NOW())
                    ELSE c.loss_recorded_at
                END
            WHERE lower(trim(coalesce(c.etapa, ''))) IN ('cerrado perdido', 'cerrada perdida')
              AND c.loss_reason_id IS NULL
              AND NULLIF(BTRIM(c.%1$I::TEXT), '') IS NOT NULL;
        $fmt$, v_reason_col);
    ELSE
        v_sql := format($fmt$
            UPDATE clientes c
            SET loss_reason_id = COALESCE(
                    c.loss_reason_id,
                    resolve_lead_loss_reason_id_from_alias(NULLIF(BTRIM(c.%1$I::TEXT), ''))
                ),
                loss_subreason_id = COALESCE(
                    c.loss_subreason_id,
                    resolve_lead_loss_subreason_id_from_alias(
                        COALESCE(
                            c.loss_reason_id,
                            resolve_lead_loss_reason_id_from_alias(NULLIF(BTRIM(c.%1$I::TEXT), ''))
                        ),
                        NULLIF(BTRIM(c.%2$I::TEXT), '')
                    )
                ),
                loss_recorded_at = CASE
                    WHEN c.loss_recorded_at IS NOT NULL THEN c.loss_recorded_at
                    WHEN lower(trim(coalesce(c.etapa, ''))) IN ('cerrado perdido', 'cerrada perdida')
                        THEN COALESCE(c.closed_at_real, NOW())
                    ELSE c.loss_recorded_at
                END
            WHERE lower(trim(coalesce(c.etapa, ''))) IN ('cerrado perdido', 'cerrada perdida')
              AND (
                  c.loss_reason_id IS NULL
                  OR c.loss_subreason_id IS NULL
              )
              AND NULLIF(BTRIM(c.%1$I::TEXT), '') IS NOT NULL;
        $fmt$, v_reason_col, v_subreason_col);
    END IF;

    EXECUTE v_sql;
END $$;

COMMIT;
