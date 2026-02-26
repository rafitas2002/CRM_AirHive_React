-- Enriquecer analytics de razones de pérdida y agregar índices de soporte
-- Objetivo:
-- 1) Reducir joins ad-hoc en server actions (DB-first)
-- 2) Entregar una vista lista para analytics/dirección
-- 3) Mejorar performance de consultas frecuentes de pérdidas

-- Índices de soporte en clientes (analytics de pérdidas)
CREATE INDEX IF NOT EXISTS idx_clientes_etapa_closed_owner
    ON clientes (etapa, closed_at_real DESC, owner_id);

CREATE INDEX IF NOT EXISTS idx_clientes_loss_reason_subreason
    ON clientes (loss_reason_id, loss_subreason_id);

CREATE INDEX IF NOT EXISTS idx_clientes_empresa_id
    ON clientes (empresa_id);

-- Índice parcial orientado a leads perdidos (para rangos + vendedor)
CREATE INDEX IF NOT EXISTS idx_clientes_lost_stage_closed_owner_partial
    ON clientes (closed_at_real DESC, owner_id, empresa_id)
    WHERE lower(trim(coalesce(etapa, ''))) IN ('cerrado perdido', 'cerrada perdida');

-- Vista enriquecida para analytics de pérdidas
CREATE OR REPLACE VIEW lead_loss_analytics_enriched_view AS
SELECT
    base.lead_id,
    base.seller_id,
    base.seller_username,
    p.full_name AS seller_full_name,
    -- Algunas bases no tienen profiles.avatar_url; mantener columna estable en la vista.
    NULL::TEXT AS seller_avatar_url,
    base.empresa_id,
    base.empresa,
    base.nombre,
    base.etapa,
    base.valor_estimado,
    base.valor_real_cierre,
    COALESCE(c.valor_implementacion_estimado, 0)::NUMERIC AS valor_implementacion_estimado,
    base.closed_at_real,
    base.loss_recorded_at,
    base.loss_recorded_by,
    c.fecha_registro,
    c.created_at,
    base.loss_month,
    base.loss_reason_id,
    base.loss_reason_code,
    base.loss_reason_label,
    base.loss_subreason_id,
    base.loss_subreason_code,
    base.loss_subreason_label,
    base.loss_notes,
    e.industria_id,
    COALESCE(NULLIF(trim(e.industria), ''), i.name) AS industria,
    e.tamano AS tamano_empresa
FROM lead_loss_analytics_view base
LEFT JOIN clientes c
    ON c.id = base.lead_id
LEFT JOIN profiles p
    ON p.id = base.seller_id
LEFT JOIN empresas e
    ON e.id = base.empresa_id
LEFT JOIN industrias i
    ON i.id = e.industria_id;
