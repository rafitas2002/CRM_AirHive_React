-- Guarda el nombre exacto del puesto del prospecto de forma opcional,
-- separado del área normalizada por catálogo.

ALTER TABLE clientes
    ADD COLUMN IF NOT EXISTS prospect_role_exact_title TEXT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'clientes_prospect_role_exact_title_not_blank_check'
    ) THEN
        ALTER TABLE clientes
            ADD CONSTRAINT clientes_prospect_role_exact_title_not_blank_check
            CHECK (prospect_role_exact_title IS NULL OR char_length(trim(prospect_role_exact_title)) > 0);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_clientes_prospect_role_exact_title
    ON clientes (prospect_role_exact_title)
    WHERE prospect_role_exact_title IS NOT NULL;

CREATE OR REPLACE VIEW lead_prospect_role_analytics_view AS
SELECT
    c.id AS lead_id,
    c.owner_id AS seller_id,
    c.owner_username AS seller_username,
    c.empresa_id,
    c.empresa,
    c.nombre,
    c.etapa,
    c.valor_estimado,
    c.valor_real_cierre,
    c.created_at,
    c.closed_at_real,
    c.prospect_role_catalog_id,
    r.code AS prospect_role_code,
    r.label AS prospect_role_label,
    c.prospect_role_custom,
    COALESCE(r.label, c.prospect_role_custom, c.prospect_role_exact_title, 'Sin puesto registrado') AS prospect_role_bucket,
    c.prospect_role_exact_title
FROM clientes c
LEFT JOIN lead_prospect_roles_catalog r
    ON r.id = c.prospect_role_catalog_id;

GRANT SELECT ON lead_prospect_role_analytics_view TO authenticated;

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
    COALESCE(pr.label, c.prospect_role_custom, c.prospect_role_exact_title, 'Sin puesto registrado') AS prospect_role_bucket,
    COALESCE(ar.label, 'Sin rango registrado') AS prospect_age_bucket,
    c.prospect_is_family_member,
    c.prospect_role_exact_title
FROM clientes c
LEFT JOIN lead_prospect_roles_catalog pr
    ON pr.id = c.prospect_role_catalog_id
LEFT JOIN lead_age_ranges_catalog ar
    ON ar.id = c.prospect_age_range_id;

GRANT SELECT ON lead_prospect_profile_analytics_view TO authenticated;
