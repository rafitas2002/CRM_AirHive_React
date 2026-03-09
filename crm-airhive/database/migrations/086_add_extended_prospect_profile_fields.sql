-- Perfil extendido del prospecto para análisis comercial (100% opcional).
-- Incluye edad exacta o rango estandarizado, rol en decisión y canal preferido.

CREATE TABLE IF NOT EXISTS lead_age_ranges_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE CHECK (char_length(trim(code)) > 0),
    label TEXT NOT NULL CHECK (char_length(trim(label)) > 0),
    min_age SMALLINT NULL CHECK (min_age IS NULL OR (min_age >= 0 AND min_age <= 120)),
    max_age SMALLINT NULL CHECK (max_age IS NULL OR (max_age >= 0 AND max_age <= 120)),
    sort_order INTEGER NOT NULL DEFAULT 100,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT lead_age_ranges_catalog_bounds_check CHECK (
        (min_age IS NULL AND max_age IS NULL)
        OR (min_age IS NOT NULL AND (max_age IS NULL OR min_age <= max_age))
    )
);

CREATE INDEX IF NOT EXISTS idx_lead_age_ranges_catalog_active_sort
    ON lead_age_ranges_catalog (is_active, sort_order, label);

DROP TRIGGER IF EXISTS trg_lead_age_ranges_catalog_set_updated_at ON lead_age_ranges_catalog;
CREATE TRIGGER trg_lead_age_ranges_catalog_set_updated_at
BEFORE UPDATE ON lead_age_ranges_catalog
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_column();

INSERT INTO lead_age_ranges_catalog (code, label, min_age, max_age, sort_order, is_active)
VALUES
    ('18_24', '18 a 24 años', 18, 24, 10, TRUE),
    ('25_34', '25 a 34 años', 25, 34, 20, TRUE),
    ('35_44', '35 a 44 años', 35, 44, 30, TRUE),
    ('45_54', '45 a 54 años', 45, 54, 40, TRUE),
    ('55_64', '55 a 64 años', 55, 64, 50, TRUE),
    ('65_plus', '65 años o más', 65, NULL, 60, TRUE)
ON CONFLICT (code) DO UPDATE
SET
    label = EXCLUDED.label,
    min_age = EXCLUDED.min_age,
    max_age = EXCLUDED.max_age,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

ALTER TABLE clientes
    ADD COLUMN IF NOT EXISTS prospect_age_exact SMALLINT NULL,
    ADD COLUMN IF NOT EXISTS prospect_age_range_id UUID NULL,
    ADD COLUMN IF NOT EXISTS prospect_decision_role TEXT NULL,
    ADD COLUMN IF NOT EXISTS prospect_preferred_contact_channel TEXT NULL,
    ADD COLUMN IF NOT EXISTS prospect_linkedin_url TEXT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'clientes_prospect_age_range_id_fkey'
    ) THEN
        ALTER TABLE clientes
            ADD CONSTRAINT clientes_prospect_age_range_id_fkey
            FOREIGN KEY (prospect_age_range_id)
            REFERENCES lead_age_ranges_catalog(id)
            ON DELETE SET NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'clientes_prospect_age_exact_range_check'
    ) THEN
        ALTER TABLE clientes
            ADD CONSTRAINT clientes_prospect_age_exact_range_check
            CHECK (prospect_age_exact IS NULL OR (prospect_age_exact >= 16 AND prospect_age_exact <= 100));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'clientes_prospect_decision_role_check'
    ) THEN
        ALTER TABLE clientes
            ADD CONSTRAINT clientes_prospect_decision_role_check
            CHECK (
                prospect_decision_role IS NULL
                OR prospect_decision_role IN ('decision_maker', 'influencer', 'evaluator', 'user', 'gatekeeper', 'unknown')
            );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'clientes_prospect_preferred_contact_channel_check'
    ) THEN
        ALTER TABLE clientes
            ADD CONSTRAINT clientes_prospect_preferred_contact_channel_check
            CHECK (
                prospect_preferred_contact_channel IS NULL
                OR prospect_preferred_contact_channel IN ('whatsapp', 'llamada', 'email', 'video', 'presencial', 'sin_preferencia')
            );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'clientes_prospect_linkedin_url_not_blank_check'
    ) THEN
        ALTER TABLE clientes
            ADD CONSTRAINT clientes_prospect_linkedin_url_not_blank_check
            CHECK (prospect_linkedin_url IS NULL OR char_length(trim(prospect_linkedin_url)) > 0);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_clientes_prospect_age_range_id
    ON clientes (prospect_age_range_id);

CREATE INDEX IF NOT EXISTS idx_clientes_prospect_decision_role
    ON clientes (prospect_decision_role)
    WHERE prospect_decision_role IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clientes_prospect_preferred_contact_channel
    ON clientes (prospect_preferred_contact_channel)
    WHERE prospect_preferred_contact_channel IS NOT NULL;

ALTER TABLE lead_age_ranges_catalog ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'lead_age_ranges_catalog'
          AND policyname = 'lead_age_ranges_catalog_select_authenticated'
    ) THEN
        CREATE POLICY "lead_age_ranges_catalog_select_authenticated"
        ON lead_age_ranges_catalog FOR SELECT
        USING (auth.role() = 'authenticated');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'lead_age_ranges_catalog'
          AND policyname = 'lead_age_ranges_catalog_insert_own'
    ) THEN
        CREATE POLICY "lead_age_ranges_catalog_insert_own"
        ON lead_age_ranges_catalog FOR INSERT
        WITH CHECK (auth.uid() = created_by);
    END IF;
END $$;

GRANT SELECT, INSERT ON lead_age_ranges_catalog TO authenticated;

CREATE OR REPLACE VIEW lead_prospect_profile_analytics_view AS
SELECT
    c.id AS lead_id,
    c.owner_id AS seller_id,
    c.owner_username AS seller_username,
    c.empresa_id,
    c.empresa,
    c.nombre,
    c.etapa,
    c.created_at,
    c.closed_at_real,
    c.prospect_role_catalog_id,
    pr.code AS prospect_role_code,
    pr.label AS prospect_role_label,
    c.prospect_role_custom,
    c.prospect_age_exact,
    c.prospect_age_range_id,
    ar.code AS prospect_age_range_code,
    ar.label AS prospect_age_range_label,
    c.prospect_decision_role,
    c.prospect_preferred_contact_channel,
    c.prospect_linkedin_url,
    COALESCE(pr.label, c.prospect_role_custom, 'Sin puesto registrado') AS prospect_role_bucket,
    COALESCE(ar.label, 'Sin rango registrado') AS prospect_age_bucket
FROM clientes c
LEFT JOIN lead_prospect_roles_catalog pr
    ON pr.id = c.prospect_role_catalog_id
LEFT JOIN lead_age_ranges_catalog ar
    ON ar.id = c.prospect_age_range_id;

GRANT SELECT ON lead_prospect_profile_analytics_view TO authenticated;
