-- Optional lead prospect profile flag:
-- whether the contact is family-linked to the company ownership/family business.

ALTER TABLE clientes
    ADD COLUMN IF NOT EXISTS prospect_is_family_member BOOLEAN NULL;

CREATE INDEX IF NOT EXISTS idx_clientes_prospect_is_family_member
    ON clientes (prospect_is_family_member)
    WHERE prospect_is_family_member IS NOT NULL;

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
    COALESCE(ar.label, 'Sin rango registrado') AS prospect_age_bucket,
    c.prospect_is_family_member
FROM clientes c
LEFT JOIN lead_prospect_roles_catalog pr
    ON pr.id = c.prospect_role_catalog_id
LEFT JOIN lead_age_ranges_catalog ar
    ON ar.id = c.prospect_age_range_id;

GRANT SELECT ON lead_prospect_profile_analytics_view TO authenticated;
