-- Capa maestra de tamaños de empresa (DB-first)
-- Objetivo:
-- 1) Definir catálogo canónico de tamaños (1..5) con aliases
-- 2) Sincronizar tablas operativas (empresas / pre_leads) con FK + campos canónicos
-- 3) Mantener compatibilidad con el campo legacy numérico `tamano`

BEGIN;

CREATE TABLE IF NOT EXISTS company_sizes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    size_value SMALLINT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'company_sizes_size_value_range_check'
    ) THEN
        ALTER TABLE company_sizes
            ADD CONSTRAINT company_sizes_size_value_range_check
            CHECK (size_value BETWEEN 1 AND 5);
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_sizes_size_value_unique
    ON company_sizes (size_value);

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_sizes_code_unique
    ON company_sizes (code);

CREATE INDEX IF NOT EXISTS idx_company_sizes_active_sort
    ON company_sizes (is_active, sort_order, size_value);

CREATE OR REPLACE FUNCTION set_company_sizes_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := NOW();
    NEW.code := lower(trim(coalesce(NEW.code, '')));
    NEW.name := trim(coalesce(NEW.name, ''));
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_company_sizes_set_updated_at ON company_sizes;
CREATE TRIGGER trg_company_sizes_set_updated_at
BEFORE INSERT OR UPDATE ON company_sizes
FOR EACH ROW
EXECUTE FUNCTION set_company_sizes_updated_at();

INSERT INTO company_sizes (size_value, code, name, description, sort_order, is_active)
VALUES
    (1, 'size_1', 'Micro', 'Empresa micro', 10, TRUE),
    (2, 'size_2', 'Pequeña', 'Empresa pequeña', 20, TRUE),
    (3, 'size_3', 'Mediana', 'Empresa mediana', 30, TRUE),
    (4, 'size_4', 'Grande', 'Empresa grande', 40, TRUE),
    (5, 'size_5', 'Corporativo', 'Empresa corporativa', 50, TRUE)
ON CONFLICT (size_value) DO UPDATE
SET code = EXCLUDED.code,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

CREATE OR REPLACE FUNCTION normalize_company_size_alias_key(p_value TEXT)
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

CREATE TABLE IF NOT EXISTS company_size_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_size_id UUID NOT NULL REFERENCES company_sizes(id) ON DELETE CASCADE,
    alias_label TEXT NOT NULL,
    alias_key TEXT NOT NULL,
    alias_type TEXT NOT NULL DEFAULT 'label',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE company_size_aliases
    ADD COLUMN IF NOT EXISTS alias_key TEXT,
    ADD COLUMN IF NOT EXISTS alias_type TEXT NOT NULL DEFAULT 'label',
    ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE company_size_aliases
SET alias_key = normalize_company_size_alias_key(COALESCE(alias_label, alias_key))
WHERE alias_key IS DISTINCT FROM normalize_company_size_alias_key(COALESCE(alias_label, alias_key));

DELETE FROM company_size_aliases
WHERE alias_label IS NULL
   OR BTRIM(alias_label) = ''
   OR alias_key IS NULL
   OR BTRIM(alias_key) = '';

ALTER TABLE company_size_aliases
    ALTER COLUMN alias_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_size_aliases_alias_key_unique
    ON company_size_aliases (alias_key);

CREATE INDEX IF NOT EXISTS idx_company_size_aliases_company_size_active
    ON company_size_aliases (company_size_id, is_active, sort_order);

CREATE OR REPLACE FUNCTION set_company_size_aliases_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := NOW();
    NEW.alias_key := normalize_company_size_alias_key(COALESCE(NEW.alias_label, NEW.alias_key));
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_company_size_aliases_set_fields ON company_size_aliases;
CREATE TRIGGER trg_company_size_aliases_set_fields
BEFORE INSERT OR UPDATE ON company_size_aliases
FOR EACH ROW
EXECUTE FUNCTION set_company_size_aliases_fields();

-- Seed aliases base (label + code + numérico)
INSERT INTO company_size_aliases (company_size_id, alias_label, alias_type, sort_order, is_active)
SELECT cs.id, cs.name, 'label', cs.sort_order, cs.is_active
FROM company_sizes cs
ON CONFLICT (alias_key) DO UPDATE
SET company_size_id = EXCLUDED.company_size_id,
    alias_label = EXCLUDED.alias_label,
    alias_type = EXCLUDED.alias_type,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

INSERT INTO company_size_aliases (company_size_id, alias_label, alias_type, sort_order, is_active)
SELECT cs.id, cs.code, 'code', cs.sort_order, cs.is_active
FROM company_sizes cs
ON CONFLICT (alias_key) DO UPDATE
SET company_size_id = EXCLUDED.company_size_id,
    alias_label = EXCLUDED.alias_label,
    alias_type = EXCLUDED.alias_type,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

INSERT INTO company_size_aliases (company_size_id, alias_label, alias_type, sort_order, is_active)
SELECT cs.id, cs.size_value::TEXT, 'numeric', cs.sort_order, cs.is_active
FROM company_sizes cs
ON CONFLICT (alias_key) DO UPDATE
SET company_size_id = EXCLUDED.company_size_id,
    alias_label = EXCLUDED.alias_label,
    alias_type = EXCLUDED.alias_type,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

INSERT INTO company_size_aliases (company_size_id, alias_label, alias_type, sort_order, is_active)
SELECT cs.id, v.alias_label, 'synonym', cs.sort_order, TRUE
FROM (
    VALUES
        ('size_1', 'microempresa'),
        ('size_1', 'muy pequeña'),
        ('size_1', 'muy pequena'),
        ('size_1', 'nivel 1'),
        ('size_2', 'pequena'),
        ('size_2', 'pequeña'),
        ('size_2', 'small'),
        ('size_2', 'nivel 2'),
        ('size_3', 'mediana'),
        ('size_3', 'pyme'),
        ('size_3', 'medium'),
        ('size_3', 'nivel 3'),
        ('size_4', 'grande'),
        ('size_4', 'large'),
        ('size_4', 'nivel 4'),
        ('size_5', 'corporativa'),
        ('size_5', 'enterprise'),
        ('size_5', 'nivel 5')
) AS v(code, alias_label)
JOIN company_sizes cs ON cs.code = v.code
ON CONFLICT (alias_key) DO NOTHING;

CREATE OR REPLACE FUNCTION resolve_company_size_catalog_id_from_alias(p_input TEXT)
RETURNS UUID
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_key TEXT;
    v_id UUID;
BEGIN
    v_key := normalize_company_size_alias_key(p_input);
    IF v_key IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT a.company_size_id
    INTO v_id
    FROM company_size_aliases a
    JOIN company_sizes cs
      ON cs.id = a.company_size_id
    WHERE a.alias_key = v_key
      AND a.is_active = TRUE
      AND cs.is_active = TRUE
    ORDER BY a.sort_order, a.alias_label
    LIMIT 1;

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION resolve_company_size_value_from_alias(p_input TEXT)
RETURNS SMALLINT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_id UUID;
    v_value SMALLINT;
BEGIN
    v_id := resolve_company_size_catalog_id_from_alias(p_input);
    IF v_id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT cs.size_value INTO v_value
    FROM company_sizes cs
    WHERE cs.id = v_id
    LIMIT 1;

    RETURN v_value;
END;
$$;

ALTER TABLE empresas
    ADD COLUMN IF NOT EXISTS tamano_catalog_id UUID NULL,
    ADD COLUMN IF NOT EXISTS tamano_code TEXT NULL,
    ADD COLUMN IF NOT EXISTS tamano_label TEXT NULL;

ALTER TABLE pre_leads
    ADD COLUMN IF NOT EXISTS tamano_catalog_id UUID NULL,
    ADD COLUMN IF NOT EXISTS tamano_code TEXT NULL,
    ADD COLUMN IF NOT EXISTS tamano_label TEXT NULL;

-- Normaliza basura histórica (si existiera) antes de constraints.
UPDATE empresas
SET tamano = NULL
WHERE tamano IS NOT NULL
  AND (tamano < 1 OR tamano > 5);

UPDATE pre_leads
SET tamano = NULL
WHERE tamano IS NOT NULL
  AND (tamano < 1 OR tamano > 5);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'empresas_tamano_range_check'
    ) THEN
        ALTER TABLE empresas
            ADD CONSTRAINT empresas_tamano_range_check
            CHECK (tamano IS NULL OR tamano BETWEEN 1 AND 5);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'pre_leads_tamano_range_check'
    ) THEN
        ALTER TABLE pre_leads
            ADD CONSTRAINT pre_leads_tamano_range_check
            CHECK (tamano IS NULL OR tamano BETWEEN 1 AND 5);
    END IF;
END $$;

CREATE OR REPLACE FUNCTION sync_company_size_structured_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_size RECORD;
BEGIN
    IF NEW.tamano IS NULL AND NEW.tamano_catalog_id IS NOT NULL THEN
        SELECT cs.id, cs.size_value, cs.code, cs.name, cs.is_active
        INTO v_size
        FROM company_sizes cs
        WHERE cs.id = NEW.tamano_catalog_id
        LIMIT 1;

        IF v_size.id IS NULL THEN
            RAISE EXCEPTION 'Tamaño de empresa inválido (catalog_id no existe)'
                USING ERRCODE = '23503';
        END IF;

        IF COALESCE(v_size.is_active, FALSE) IS NOT TRUE THEN
            RAISE EXCEPTION 'Tamaño de empresa inactivo'
                USING ERRCODE = '23514';
        END IF;

        NEW.tamano := v_size.size_value;
    END IF;

    IF NEW.tamano IS NOT NULL AND (NEW.tamano < 1 OR NEW.tamano > 5) THEN
        RAISE EXCEPTION 'Tamaño de empresa fuera de rango (1-5)'
            USING ERRCODE = '23514';
    END IF;

    IF NEW.tamano IS NULL THEN
        NEW.tamano_catalog_id := NULL;
        NEW.tamano_code := NULL;
        NEW.tamano_label := NULL;
        RETURN NEW;
    END IF;

    SELECT cs.id, cs.size_value, cs.code, cs.name, cs.is_active
    INTO v_size
    FROM company_sizes cs
    WHERE cs.size_value = NEW.tamano
    LIMIT 1;

    IF v_size.id IS NULL THEN
        RAISE EXCEPTION 'No existe catálogo para tamaño de empresa %', NEW.tamano
            USING ERRCODE = '23514';
    END IF;

    IF COALESCE(v_size.is_active, FALSE) IS NOT TRUE THEN
        RAISE EXCEPTION 'El tamaño de empresa % está inactivo en catálogo', NEW.tamano
            USING ERRCODE = '23514';
    END IF;

    NEW.tamano_catalog_id := v_size.id;
    NEW.tamano_code := v_size.code;
    NEW.tamano_label := v_size.name;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_empresas_sync_company_size_structured_fields ON empresas;
CREATE TRIGGER trg_empresas_sync_company_size_structured_fields
BEFORE INSERT OR UPDATE OF tamano, tamano_catalog_id ON empresas
FOR EACH ROW
EXECUTE FUNCTION sync_company_size_structured_fields();

DROP TRIGGER IF EXISTS trg_pre_leads_sync_company_size_structured_fields ON pre_leads;
CREATE TRIGGER trg_pre_leads_sync_company_size_structured_fields
BEFORE INSERT OR UPDATE OF tamano, tamano_catalog_id ON pre_leads
FOR EACH ROW
EXECUTE FUNCTION sync_company_size_structured_fields();

-- Backfill canonical fields desde tamano numérico.
WITH mapped AS (
    SELECT
        e.id,
        cs.id AS cs_id,
        cs.code AS cs_code,
        cs.name AS cs_name
    FROM empresas e
    LEFT JOIN company_sizes cs
      ON cs.size_value = e.tamano
)
UPDATE empresas e
SET tamano_catalog_id = m.cs_id,
    tamano_code = m.cs_code,
    tamano_label = m.cs_name
FROM mapped m
WHERE e.id = m.id
  AND (
      e.tamano_catalog_id IS DISTINCT FROM m.cs_id
      OR e.tamano_code IS DISTINCT FROM m.cs_code
      OR e.tamano_label IS DISTINCT FROM m.cs_name
  );

WITH mapped AS (
    SELECT
        p.id,
        cs.id AS cs_id,
        cs.code AS cs_code,
        cs.name AS cs_name
    FROM pre_leads p
    LEFT JOIN company_sizes cs
      ON cs.size_value = p.tamano
)
UPDATE pre_leads p
SET tamano_catalog_id = m.cs_id,
    tamano_code = m.cs_code,
    tamano_label = m.cs_name
FROM mapped m
WHERE p.id = m.id
  AND (
      p.tamano_catalog_id IS DISTINCT FROM m.cs_id
      OR p.tamano_code IS DISTINCT FROM m.cs_code
      OR p.tamano_label IS DISTINCT FROM m.cs_name
  );

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'empresas_tamano_catalog_id_fkey'
    ) THEN
        ALTER TABLE empresas
            ADD CONSTRAINT empresas_tamano_catalog_id_fkey
            FOREIGN KEY (tamano_catalog_id)
            REFERENCES company_sizes(id)
            ON UPDATE CASCADE
            ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'pre_leads_tamano_catalog_id_fkey'
    ) THEN
        ALTER TABLE pre_leads
            ADD CONSTRAINT pre_leads_tamano_catalog_id_fkey
            FOREIGN KEY (tamano_catalog_id)
            REFERENCES company_sizes(id)
            ON UPDATE CASCADE
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_empresas_tamano_catalog_id
    ON empresas (tamano_catalog_id);

CREATE INDEX IF NOT EXISTS idx_empresas_tamano_code
    ON empresas (tamano_code);

CREATE INDEX IF NOT EXISTS idx_pre_leads_tamano_catalog_id
    ON pre_leads (tamano_catalog_id);

CREATE INDEX IF NOT EXISTS idx_pre_leads_tamano_code
    ON pre_leads (tamano_code);

ALTER TABLE company_sizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_size_aliases ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'company_sizes'
          AND policyname = 'company_sizes_select_authenticated'
    ) THEN
        CREATE POLICY company_sizes_select_authenticated
            ON company_sizes
            FOR SELECT
            TO authenticated
            USING (is_active = TRUE);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'company_size_aliases'
          AND policyname = 'company_size_aliases_select_authenticated'
    ) THEN
        CREATE POLICY company_size_aliases_select_authenticated
            ON company_size_aliases
            FOR SELECT
            TO authenticated
            USING (is_active = TRUE);
    END IF;
END $$;

GRANT SELECT ON TABLE company_sizes TO authenticated;
GRANT SELECT ON TABLE company_size_aliases TO authenticated;

COMMIT;
