-- Catálogo persistente de ubicaciones para empresas/pre-leads.
-- Objetivo:
-- 1) Guardar nuevas ubicaciones en una tabla de catálogo reutilizable
-- 2) Evitar duplicados por variantes de formato (acentos, N.L., Nuevo León, etc.)
-- 3) Backfill desde empresas + pre_leads con valores canónicos
--
-- Requiere (recomendado) haber aplicado la migración 066 para usar:
-- - normalize_company_location_label(text)
-- - normalize_company_location_duplicate_key(text)

BEGIN;

DO $$
BEGIN
    IF to_regprocedure('public.normalize_company_location_label(text)') IS NULL
       OR to_regprocedure('public.normalize_company_location_duplicate_key(text)') IS NULL THEN
        RAISE EXCEPTION 'Aplica primero la migración 066 (normalización de ubicaciones) antes de 068.';
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS company_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    duplicate_key TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE company_locations
    ADD COLUMN IF NOT EXISTS duplicate_key TEXT;

ALTER TABLE company_locations
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE company_locations
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE company_locations
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE company_locations
SET name = normalize_company_location_label(name)
WHERE name IS DISTINCT FROM normalize_company_location_label(name);

UPDATE company_locations
SET duplicate_key = normalize_company_location_duplicate_key(COALESCE(name, duplicate_key))
WHERE duplicate_key IS DISTINCT FROM normalize_company_location_duplicate_key(COALESCE(name, duplicate_key));

DELETE FROM company_locations
WHERE name IS NULL
   OR BTRIM(COALESCE(name, '')) = ''
   OR duplicate_key IS NULL
   OR BTRIM(COALESCE(duplicate_key, '')) = '';

WITH ranked_existing AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY duplicate_key
            ORDER BY created_at NULLS LAST, id
        ) AS rn
    FROM company_locations
    WHERE duplicate_key IS NOT NULL
)
DELETE FROM company_locations cl
USING ranked_existing re
WHERE cl.id = re.id
  AND re.rn > 1;

ALTER TABLE company_locations
    ALTER COLUMN name SET NOT NULL;

ALTER TABLE company_locations
    ALTER COLUMN duplicate_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_locations_duplicate_key_unique
    ON company_locations (duplicate_key);

CREATE INDEX IF NOT EXISTS idx_company_locations_active_name
    ON company_locations (is_active, name);

CREATE OR REPLACE FUNCTION set_company_locations_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := NOW();
    NEW.name := normalize_company_location_label(NEW.name);
    NEW.duplicate_key := normalize_company_location_duplicate_key(COALESCE(NEW.name, NEW.duplicate_key));
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_company_locations_set_updated_at ON company_locations;
CREATE TRIGGER trg_company_locations_set_updated_at
BEFORE INSERT OR UPDATE ON company_locations
FOR EACH ROW
EXECUTE FUNCTION set_company_locations_updated_at();

ALTER TABLE company_locations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'company_locations'
          AND policyname = 'company_locations_select_authenticated'
    ) THEN
        CREATE POLICY company_locations_select_authenticated
            ON company_locations
            FOR SELECT
            TO authenticated
            USING (is_active = TRUE);
    END IF;
END $$;

GRANT SELECT ON TABLE company_locations TO authenticated;

WITH all_locations AS (
    SELECT normalize_company_location_label(ubicacion) AS normalized_label
    FROM empresas
    WHERE ubicacion IS NOT NULL AND BTRIM(ubicacion) <> ''
    UNION ALL
    SELECT normalize_company_location_label(ubicacion) AS normalized_label
    FROM pre_leads
    WHERE ubicacion IS NOT NULL AND BTRIM(ubicacion) <> ''
),
ranked AS (
    SELECT
        normalized_label,
        normalize_company_location_duplicate_key(normalized_label) AS duplicate_key,
        ROW_NUMBER() OVER (
            PARTITION BY normalize_company_location_duplicate_key(normalized_label)
            ORDER BY CHAR_LENGTH(normalized_label), normalized_label
        ) AS rn
    FROM all_locations
    WHERE normalized_label IS NOT NULL
      AND BTRIM(normalized_label) <> ''
)
INSERT INTO company_locations (name, duplicate_key, is_active)
SELECT normalized_label, duplicate_key, TRUE
FROM ranked
WHERE rn = 1
  AND duplicate_key IS NOT NULL
  AND BTRIM(duplicate_key) <> ''
ON CONFLICT (duplicate_key) DO UPDATE
SET name = EXCLUDED.name,
    is_active = TRUE,
    updated_at = NOW();

COMMIT;
