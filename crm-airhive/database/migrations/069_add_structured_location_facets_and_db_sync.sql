-- Capa estructurada de ubicaciones (DB-first)
-- Objetivo:
-- 1) Dejar de depender solo de strings libres en filtros/analytics
-- 2) Guardar facetas estructuradas (grupo + municipio de Monterrey)
-- 3) Sincronizar canónico + catálogo desde DB (trigger) para inserts/updates
--
-- Requiere (recomendado) 066 para funciones de normalización:
-- - normalize_company_location_label(text)
-- - normalize_company_location_duplicate_key(text)
--
-- Opcional: si existe company_locations (068), se vincula/sincroniza automáticamente.

BEGIN;

DO $$
BEGIN
    IF to_regprocedure('public.normalize_company_location_label(text)') IS NULL
       OR to_regprocedure('public.normalize_company_location_duplicate_key(text)') IS NULL THEN
        RAISE EXCEPTION 'Aplica primero la migración 066 antes de 069.';
    END IF;
END $$;

ALTER TABLE empresas
    ADD COLUMN IF NOT EXISTS ubicacion_duplicate_key TEXT,
    ADD COLUMN IF NOT EXISTS ubicacion_group TEXT,
    ADD COLUMN IF NOT EXISTS ubicacion_group_key TEXT,
    ADD COLUMN IF NOT EXISTS ubicacion_municipio TEXT,
    ADD COLUMN IF NOT EXISTS ubicacion_municipio_key TEXT,
    ADD COLUMN IF NOT EXISTS ubicacion_is_monterrey_metro BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS ubicacion_catalog_id UUID NULL;

ALTER TABLE pre_leads
    ADD COLUMN IF NOT EXISTS ubicacion_duplicate_key TEXT,
    ADD COLUMN IF NOT EXISTS ubicacion_group TEXT,
    ADD COLUMN IF NOT EXISTS ubicacion_group_key TEXT,
    ADD COLUMN IF NOT EXISTS ubicacion_municipio TEXT,
    ADD COLUMN IF NOT EXISTS ubicacion_municipio_key TEXT,
    ADD COLUMN IF NOT EXISTS ubicacion_is_monterrey_metro BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS ubicacion_catalog_id UUID NULL;

CREATE OR REPLACE FUNCTION normalize_company_location_monterrey_municipality_label(p_label TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_key TEXT;
BEGIN
    v_key := normalize_company_location_duplicate_key(p_label);
    IF v_key IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN CASE v_key
        WHEN 'monterrey' THEN 'Monterrey'
        WHEN 'san pedro' THEN 'San Pedro Garza García'
        WHEN 'san pedro garza garcia' THEN 'San Pedro Garza García'
        WHEN 'santa catarina' THEN 'Santa Catarina'
        WHEN 'guadalupe' THEN 'Guadalupe'
        WHEN 'san nicolas' THEN 'San Nicolás'
        WHEN 'san nicolas de los garza' THEN 'San Nicolás'
        WHEN 'escobedo' THEN 'Escobedo'
        WHEN 'gral escobedo' THEN 'Escobedo'
        WHEN 'general escobedo' THEN 'Escobedo'
        WHEN 'apodaca' THEN 'Apodaca'
        WHEN 'garcia' THEN 'García'
        WHEN 'juarez' THEN 'Juárez'
        WHEN 'santiago' THEN 'Santiago'
        WHEN 'pesqueria' THEN 'Pesquería'
        WHEN 'el carmen' THEN 'El Carmen'
        WHEN 'allende' THEN 'Allende'
        WHEN 'cadereyta' THEN 'Cadereyta Jiménez'
        WHEN 'cadereyta jimenez' THEN 'Cadereyta Jiménez'
        WHEN 'cienega de flores' THEN 'Ciénega de Flores'
        WHEN 'salinas victoria' THEN 'Salinas Victoria'
        WHEN 'zuazua' THEN 'General Zuazua'
        WHEN 'general zuazua' THEN 'General Zuazua'
        ELSE NULL
    END;
END;
$$;

CREATE OR REPLACE FUNCTION get_company_location_structured_facet(p_location TEXT)
RETURNS TABLE (
    normalized_label TEXT,
    duplicate_key TEXT,
    group_label TEXT,
    group_key TEXT,
    is_monterrey_metro BOOLEAN,
    monterrey_municipio TEXT,
    monterrey_municipio_key TEXT
)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_label TEXT;
    v_key TEXT;
    v_first TEXT;
    v_second TEXT;
    v_municipio TEXT;
BEGIN
    v_label := normalize_company_location_label(p_location);
    IF v_label IS NULL THEN
        normalized_label := NULL;
        duplicate_key := NULL;
        group_label := NULL;
        group_key := NULL;
        is_monterrey_metro := FALSE;
        monterrey_municipio := NULL;
        monterrey_municipio_key := NULL;
        RETURN NEXT;
        RETURN;
    END IF;

    v_key := normalize_company_location_duplicate_key(v_label);
    v_first := NULLIF(BTRIM(SPLIT_PART(v_label, ',', 1)), '');
    v_second := NULLIF(BTRIM(SPLIT_PART(v_label, ',', 2)), '');

    v_municipio := NULL;
    is_monterrey_metro := FALSE;

    IF v_first = 'Monterrey' THEN
        is_monterrey_metro := TRUE;
        v_municipio := COALESCE(
            normalize_company_location_monterrey_municipality_label(v_second),
            'Monterrey'
        );
    ELSE
        v_municipio := normalize_company_location_monterrey_municipality_label(v_first);
        IF v_municipio IS NOT NULL THEN
            is_monterrey_metro := TRUE;
        END IF;
    END IF;

    normalized_label := v_label;
    duplicate_key := v_key;
    group_label := CASE WHEN is_monterrey_metro THEN 'Monterrey' ELSE v_label END;
    group_key := normalize_company_location_duplicate_key(group_label);
    monterrey_municipio := CASE WHEN is_monterrey_metro THEN v_municipio ELSE NULL END;
    monterrey_municipio_key := CASE
        WHEN is_monterrey_metro AND v_municipio IS NOT NULL THEN normalize_company_location_duplicate_key(v_municipio)
        ELSE NULL
    END;

    RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION sync_company_location_structured_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_facet RECORD;
    v_catalog_id UUID;
BEGIN
    SELECT *
    INTO v_facet
    FROM get_company_location_structured_facet(NEW.ubicacion)
    LIMIT 1;

    NEW.ubicacion := v_facet.normalized_label;
    NEW.ubicacion_duplicate_key := v_facet.duplicate_key;
    NEW.ubicacion_group := v_facet.group_label;
    NEW.ubicacion_group_key := v_facet.group_key;
    NEW.ubicacion_municipio := v_facet.monterrey_municipio;
    NEW.ubicacion_municipio_key := v_facet.monterrey_municipio_key;
    NEW.ubicacion_is_monterrey_metro := COALESCE(v_facet.is_monterrey_metro, FALSE);

    NEW.ubicacion_catalog_id := NULL;

    IF v_facet.duplicate_key IS NOT NULL
       AND to_regclass('public.company_locations') IS NOT NULL
       AND to_regclass('public.idx_company_locations_duplicate_key_unique') IS NOT NULL THEN
        BEGIN
            INSERT INTO company_locations (name, duplicate_key, is_active)
            VALUES (v_facet.normalized_label, v_facet.duplicate_key, TRUE)
            ON CONFLICT (duplicate_key) DO UPDATE
            SET name = EXCLUDED.name,
                is_active = TRUE
            RETURNING id INTO v_catalog_id;

            NEW.ubicacion_catalog_id := v_catalog_id;
        EXCEPTION
            WHEN undefined_table OR undefined_column THEN
                -- 068 no aplicada parcial/totalmente; no bloquear writes de empresas/pre_leads
                NEW.ubicacion_catalog_id := NULL;
        END;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_empresas_sync_structured_location_fields ON empresas;
CREATE TRIGGER trg_empresas_sync_structured_location_fields
BEFORE INSERT OR UPDATE OF ubicacion ON empresas
FOR EACH ROW
EXECUTE FUNCTION sync_company_location_structured_fields();

DROP TRIGGER IF EXISTS trg_pre_leads_sync_structured_location_fields ON pre_leads;
CREATE TRIGGER trg_pre_leads_sync_structured_location_fields
BEFORE INSERT OR UPDATE OF ubicacion ON pre_leads
FOR EACH ROW
EXECUTE FUNCTION sync_company_location_structured_fields();

-- Backfill estructurado en empresas
WITH computed AS (
    SELECT
        e.id,
        f.normalized_label,
        f.duplicate_key,
        f.group_label,
        f.group_key,
        f.is_monterrey_metro,
        f.monterrey_municipio,
        f.monterrey_municipio_key
    FROM empresas e
    CROSS JOIN LATERAL get_company_location_structured_facet(e.ubicacion) AS f
)
UPDATE empresas e
SET ubicacion = c.normalized_label,
    ubicacion_duplicate_key = c.duplicate_key,
    ubicacion_group = c.group_label,
    ubicacion_group_key = c.group_key,
    ubicacion_municipio = c.monterrey_municipio,
    ubicacion_municipio_key = c.monterrey_municipio_key,
    ubicacion_is_monterrey_metro = COALESCE(c.is_monterrey_metro, FALSE)
FROM computed c
WHERE e.id = c.id
  AND (
      e.ubicacion IS DISTINCT FROM c.normalized_label
      OR e.ubicacion_duplicate_key IS DISTINCT FROM c.duplicate_key
      OR e.ubicacion_group IS DISTINCT FROM c.group_label
      OR e.ubicacion_group_key IS DISTINCT FROM c.group_key
      OR e.ubicacion_municipio IS DISTINCT FROM c.monterrey_municipio
      OR e.ubicacion_municipio_key IS DISTINCT FROM c.monterrey_municipio_key
      OR e.ubicacion_is_monterrey_metro IS DISTINCT FROM COALESCE(c.is_monterrey_metro, FALSE)
  );

-- Backfill estructurado en pre_leads
WITH computed AS (
    SELECT
        p.id,
        f.normalized_label,
        f.duplicate_key,
        f.group_label,
        f.group_key,
        f.is_monterrey_metro,
        f.monterrey_municipio,
        f.monterrey_municipio_key
    FROM pre_leads p
    CROSS JOIN LATERAL get_company_location_structured_facet(p.ubicacion) AS f
)
UPDATE pre_leads p
SET ubicacion = c.normalized_label,
    ubicacion_duplicate_key = c.duplicate_key,
    ubicacion_group = c.group_label,
    ubicacion_group_key = c.group_key,
    ubicacion_municipio = c.monterrey_municipio,
    ubicacion_municipio_key = c.monterrey_municipio_key,
    ubicacion_is_monterrey_metro = COALESCE(c.is_monterrey_metro, FALSE)
FROM computed c
WHERE p.id = c.id
  AND (
      p.ubicacion IS DISTINCT FROM c.normalized_label
      OR p.ubicacion_duplicate_key IS DISTINCT FROM c.duplicate_key
      OR p.ubicacion_group IS DISTINCT FROM c.group_label
      OR p.ubicacion_group_key IS DISTINCT FROM c.group_key
      OR p.ubicacion_municipio IS DISTINCT FROM c.monterrey_municipio
      OR p.ubicacion_municipio_key IS DISTINCT FROM c.monterrey_municipio_key
      OR p.ubicacion_is_monterrey_metro IS DISTINCT FROM COALESCE(c.is_monterrey_metro, FALSE)
  );

-- Si existe catálogo (068), asegurar catálogo + vinculación por duplicate_key.
DO $$
BEGIN
    IF to_regclass('public.company_locations') IS NOT NULL
       AND to_regclass('public.idx_company_locations_duplicate_key_unique') IS NOT NULL THEN
        INSERT INTO company_locations (name, duplicate_key, is_active)
        SELECT DISTINCT
            x.normalized_label,
            x.duplicate_key,
            TRUE
        FROM (
            SELECT ubicacion AS normalized_label, ubicacion_duplicate_key AS duplicate_key
            FROM empresas
            UNION ALL
            SELECT ubicacion AS normalized_label, ubicacion_duplicate_key AS duplicate_key
            FROM pre_leads
        ) x
        WHERE x.normalized_label IS NOT NULL
          AND BTRIM(x.normalized_label) <> ''
          AND x.duplicate_key IS NOT NULL
          AND BTRIM(x.duplicate_key) <> ''
        ON CONFLICT (duplicate_key) DO UPDATE
        SET name = EXCLUDED.name,
            is_active = TRUE;

        UPDATE empresas e
        SET ubicacion_catalog_id = cl.id
        FROM company_locations cl
        WHERE e.ubicacion_duplicate_key = cl.duplicate_key
          AND e.ubicacion_catalog_id IS DISTINCT FROM cl.id;

        UPDATE pre_leads p
        SET ubicacion_catalog_id = cl.id
        FROM company_locations cl
        WHERE p.ubicacion_duplicate_key = cl.duplicate_key
          AND p.ubicacion_catalog_id IS DISTINCT FROM cl.id;
    END IF;
END $$;

UPDATE empresas
SET ubicacion_is_monterrey_metro = FALSE
WHERE ubicacion_is_monterrey_metro IS NULL;

UPDATE pre_leads
SET ubicacion_is_monterrey_metro = FALSE
WHERE ubicacion_is_monterrey_metro IS NULL;

ALTER TABLE empresas
    ALTER COLUMN ubicacion_is_monterrey_metro SET DEFAULT FALSE;

ALTER TABLE pre_leads
    ALTER COLUMN ubicacion_is_monterrey_metro SET DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_empresas_ubicacion_group_key
    ON empresas (ubicacion_group_key);

CREATE INDEX IF NOT EXISTS idx_empresas_ubicacion_group_municipio_key
    ON empresas (ubicacion_group_key, ubicacion_municipio_key);

CREATE INDEX IF NOT EXISTS idx_empresas_ubicacion_duplicate_key
    ON empresas (ubicacion_duplicate_key);

CREATE INDEX IF NOT EXISTS idx_empresas_ubicacion_catalog_id
    ON empresas (ubicacion_catalog_id);

CREATE INDEX IF NOT EXISTS idx_pre_leads_ubicacion_group_key
    ON pre_leads (ubicacion_group_key);

CREATE INDEX IF NOT EXISTS idx_pre_leads_ubicacion_group_municipio_key
    ON pre_leads (ubicacion_group_key, ubicacion_municipio_key);

CREATE INDEX IF NOT EXISTS idx_pre_leads_ubicacion_duplicate_key
    ON pre_leads (ubicacion_duplicate_key);

CREATE INDEX IF NOT EXISTS idx_pre_leads_ubicacion_catalog_id
    ON pre_leads (ubicacion_catalog_id);

DO $$
BEGIN
    IF to_regclass('public.company_locations') IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'empresas_ubicacion_catalog_id_fkey'
        ) THEN
            ALTER TABLE empresas
                ADD CONSTRAINT empresas_ubicacion_catalog_id_fkey
                FOREIGN KEY (ubicacion_catalog_id)
                REFERENCES company_locations(id)
                ON UPDATE CASCADE
                ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'pre_leads_ubicacion_catalog_id_fkey'
        ) THEN
            ALTER TABLE pre_leads
                ADD CONSTRAINT pre_leads_ubicacion_catalog_id_fkey
                FOREIGN KEY (ubicacion_catalog_id)
                REFERENCES company_locations(id)
                ON UPDATE CASCADE
                ON DELETE SET NULL;
        END IF;
    END IF;
END $$;

COMMIT;
