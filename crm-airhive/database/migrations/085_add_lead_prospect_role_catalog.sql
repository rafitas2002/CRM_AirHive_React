-- Catálogo canónico de puestos del prospecto para leads.
-- Objetivo: normalizar análisis por rol (evitar variantes libres como "Gerente de Producción" vs "Gerente").

CREATE TABLE IF NOT EXISTS lead_prospect_roles_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE CHECK (char_length(trim(code)) > 0),
    label TEXT NOT NULL CHECK (char_length(trim(label)) > 0),
    description TEXT NULL,
    sort_order INTEGER NOT NULL DEFAULT 100,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_prospect_roles_catalog_active_sort
    ON lead_prospect_roles_catalog (is_active, sort_order, label);

DROP TRIGGER IF EXISTS trg_lead_prospect_roles_catalog_set_updated_at ON lead_prospect_roles_catalog;
CREATE TRIGGER trg_lead_prospect_roles_catalog_set_updated_at
BEFORE UPDATE ON lead_prospect_roles_catalog
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_column();

INSERT INTO lead_prospect_roles_catalog (code, label, description, sort_order, is_active)
VALUES
    ('direccion_general', 'Dirección general', 'Dueño/a de decisión global del negocio o unidad.', 10, TRUE),
    ('propietario_socio', 'Propietario / Socio', 'Persona socia o propietaria con decisión comercial.', 20, TRUE),
    ('gerencia', 'Gerencia', 'Nivel gerencial sin especialidad específica.', 30, TRUE),
    ('jefatura', 'Jefatura', 'Responsable de área con equipo a cargo.', 40, TRUE),
    ('coordinacion', 'Coordinación', 'Rol coordinador de procesos o equipos.', 50, TRUE),
    ('compras_abastecimiento', 'Compras / Abastecimiento', 'Responsable de compras, cotizaciones o abastecimiento.', 60, TRUE),
    ('operaciones_produccion', 'Operaciones / Producción', 'Responsable operativo o de producción.', 70, TRUE),
    ('comercial_ventas', 'Comercial / Ventas', 'Responsable comercial, desarrollo de negocio o ventas.', 80, TRUE),
    ('finanzas_administracion', 'Finanzas / Administración', 'Responsable financiero o administrativo.', 90, TRUE),
    ('tecnologia_sistemas', 'Tecnología / Sistemas', 'Responsable de TI, sistemas o infraestructura tecnológica.', 100, TRUE),
    ('recursos_humanos', 'Recursos Humanos', 'Responsable de talento, desarrollo organizacional o RH.', 110, TRUE),
    ('rol_no_especificado', 'Rol no especificado', 'Se identificó contacto, pero sin claridad de su puesto.', 120, TRUE)
ON CONFLICT (code) DO UPDATE
SET
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

ALTER TABLE clientes
    ADD COLUMN IF NOT EXISTS prospect_role_catalog_id UUID NULL,
    ADD COLUMN IF NOT EXISTS prospect_role_custom TEXT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'clientes_prospect_role_catalog_id_fkey'
    ) THEN
        ALTER TABLE clientes
            ADD CONSTRAINT clientes_prospect_role_catalog_id_fkey
            FOREIGN KEY (prospect_role_catalog_id)
            REFERENCES lead_prospect_roles_catalog(id)
            ON DELETE SET NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'clientes_prospect_role_custom_not_blank_check'
    ) THEN
        ALTER TABLE clientes
            ADD CONSTRAINT clientes_prospect_role_custom_not_blank_check
            CHECK (prospect_role_custom IS NULL OR char_length(trim(prospect_role_custom)) > 0);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'clientes_prospect_role_single_source_check'
    ) THEN
        ALTER TABLE clientes
            ADD CONSTRAINT clientes_prospect_role_single_source_check
            CHECK (prospect_role_catalog_id IS NULL OR prospect_role_custom IS NULL);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_clientes_prospect_role_catalog_id
    ON clientes (prospect_role_catalog_id);

ALTER TABLE lead_prospect_roles_catalog ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'lead_prospect_roles_catalog'
          AND policyname = 'lead_prospect_roles_catalog_select_authenticated'
    ) THEN
        CREATE POLICY "lead_prospect_roles_catalog_select_authenticated"
        ON lead_prospect_roles_catalog FOR SELECT
        USING (auth.role() = 'authenticated');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'lead_prospect_roles_catalog'
          AND policyname = 'lead_prospect_roles_catalog_insert_own'
    ) THEN
        CREATE POLICY "lead_prospect_roles_catalog_insert_own"
        ON lead_prospect_roles_catalog FOR INSERT
        WITH CHECK (auth.uid() = created_by);
    END IF;
END $$;

GRANT SELECT, INSERT ON lead_prospect_roles_catalog TO authenticated;

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
    COALESCE(r.label, c.prospect_role_custom, 'Sin puesto registrado') AS prospect_role_bucket
FROM clientes c
LEFT JOIN lead_prospect_roles_catalog r
    ON r.id = c.prospect_role_catalog_id;

GRANT SELECT ON lead_prospect_role_analytics_view TO authenticated;
