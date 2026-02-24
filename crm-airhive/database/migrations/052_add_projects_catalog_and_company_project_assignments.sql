-- CRM AirHive - Proyectos replicables por empresa/industria
-- Objetivo:
-- 1) Catálogo de proyectos (nuestros proyectos replicables)
-- 2) Relación multi-industria por proyecto, separando:
--    - implemented_in_industry (ya implementado)
--    - available_not_implemented (se puede implementar, aún no implementado)
-- 3) Asignación de proyectos a empresas separando:
--    - in_negotiation / prospection_same_close / future_lead_opportunity
--    - implemented_real (implementado real)
--    con referencia opcional al lead que originó la asignación.

CREATE TABLE IF NOT EXISTS proyectos_catalogo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    descripcion TEXT NULL,
    valor_real_mensualidad_usd NUMERIC(12, 2) NULL CHECK (valor_real_mensualidad_usd IS NULL OR valor_real_mensualidad_usd >= 0),
    valor_real_implementacion_usd NUMERIC(12, 2) NULL CHECK (valor_real_implementacion_usd IS NULL OR valor_real_implementacion_usd >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID NULL REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT proyectos_catalogo_nombre_unique UNIQUE (nombre)
);

CREATE INDEX IF NOT EXISTS idx_proyectos_catalogo_nombre
    ON proyectos_catalogo (nombre);

CREATE INDEX IF NOT EXISTS idx_proyectos_catalogo_precio
    ON proyectos_catalogo ((COALESCE(valor_real_mensualidad_usd, 0) + COALESCE(valor_real_implementacion_usd, 0)));

CREATE INDEX IF NOT EXISTS idx_proyectos_catalogo_created_at
    ON proyectos_catalogo (created_at DESC);

CREATE TABLE IF NOT EXISTS proyecto_industrias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proyecto_id UUID NOT NULL REFERENCES proyectos_catalogo(id) ON DELETE CASCADE,
    industria_id UUID NOT NULL REFERENCES industrias(id) ON DELETE CASCADE,
    relation_status TEXT NOT NULL CHECK (relation_status IN ('implemented_in_industry', 'available_not_implemented')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT proyecto_industrias_unique UNIQUE (proyecto_id, industria_id)
);

CREATE INDEX IF NOT EXISTS idx_proyecto_industrias_proyecto
    ON proyecto_industrias (proyecto_id);

CREATE INDEX IF NOT EXISTS idx_proyecto_industrias_industria
    ON proyecto_industrias (industria_id);

CREATE INDEX IF NOT EXISTS idx_proyecto_industrias_status
    ON proyecto_industrias (relation_status);

CREATE TABLE IF NOT EXISTS empresa_proyecto_asignaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    proyecto_id UUID NOT NULL REFERENCES proyectos_catalogo(id) ON DELETE CASCADE,
    assignment_stage TEXT NOT NULL CHECK (assignment_stage IN (
        'in_negotiation',
        'prospection_same_close',
        'future_lead_opportunity',
        'implemented_real'
    )),
    source_lead_id BIGINT NULL REFERENCES clientes(id) ON DELETE SET NULL,
    assigned_by UUID NULL REFERENCES profiles(id) ON DELETE SET NULL,
    mensualidad_pactada_usd NUMERIC(12, 2) NULL CHECK (mensualidad_pactada_usd IS NULL OR mensualidad_pactada_usd >= 0),
    implementacion_pactada_usd NUMERIC(12, 2) NULL CHECK (implementacion_pactada_usd IS NULL OR implementacion_pactada_usd >= 0),
    notes TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT empresa_proyecto_asignaciones_unique UNIQUE (empresa_id, proyecto_id, assignment_stage)
);

CREATE INDEX IF NOT EXISTS idx_empresa_proyecto_asignaciones_empresa
    ON empresa_proyecto_asignaciones (empresa_id);

CREATE INDEX IF NOT EXISTS idx_empresa_proyecto_asignaciones_proyecto
    ON empresa_proyecto_asignaciones (proyecto_id);

CREATE INDEX IF NOT EXISTS idx_empresa_proyecto_asignaciones_stage
    ON empresa_proyecto_asignaciones (assignment_stage);

CREATE INDEX IF NOT EXISTS idx_empresa_proyecto_asignaciones_source_lead
    ON empresa_proyecto_asignaciones (source_lead_id);

CREATE INDEX IF NOT EXISTS idx_empresa_proyecto_asignaciones_valores_pactados
    ON empresa_proyecto_asignaciones (mensualidad_pactada_usd, implementacion_pactada_usd);

CREATE OR REPLACE FUNCTION set_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proyectos_catalogo_set_updated_at ON proyectos_catalogo;
CREATE TRIGGER trg_proyectos_catalogo_set_updated_at
BEFORE UPDATE ON proyectos_catalogo
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_column();

DROP TRIGGER IF EXISTS trg_proyecto_industrias_set_updated_at ON proyecto_industrias;
CREATE TRIGGER trg_proyecto_industrias_set_updated_at
BEFORE UPDATE ON proyecto_industrias
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_column();

DROP TRIGGER IF EXISTS trg_empresa_proyecto_asignaciones_set_updated_at ON empresa_proyecto_asignaciones;
CREATE TRIGGER trg_empresa_proyecto_asignaciones_set_updated_at
BEFORE UPDATE ON empresa_proyecto_asignaciones
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_column();

-- Vista de apoyo para promedio real vendido (solo implementado real).
CREATE OR REPLACE VIEW proyectos_catalogo_sales_summary AS
SELECT
    p.id AS proyecto_id,
    COUNT(*) FILTER (WHERE epa.assignment_stage = 'implemented_real')::INTEGER AS implemented_sales_count,
    AVG(epa.mensualidad_pactada_usd) FILTER (WHERE epa.assignment_stage = 'implemented_real' AND epa.mensualidad_pactada_usd IS NOT NULL) AS avg_mensualidad_pactada_usd,
    AVG(epa.implementacion_pactada_usd) FILTER (WHERE epa.assignment_stage = 'implemented_real' AND epa.implementacion_pactada_usd IS NOT NULL) AS avg_implementacion_pactada_usd
FROM proyectos_catalogo p
LEFT JOIN empresa_proyecto_asignaciones epa
    ON epa.proyecto_id = p.id
GROUP BY p.id;
