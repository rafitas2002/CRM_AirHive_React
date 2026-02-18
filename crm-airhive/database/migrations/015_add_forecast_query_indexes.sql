-- Performance indexes for commercial forecast analytics

CREATE INDEX IF NOT EXISTS idx_clientes_empresa_id_created_at
    ON clientes (empresa_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_clientes_etapa_created_at
    ON clientes (etapa, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_meetings_lead_id_start_time
    ON meetings (lead_id, start_time DESC);

CREATE INDEX IF NOT EXISTS idx_empresas_segmentacion
    ON empresas (tamano, industria, ubicacion);

CREATE INDEX IF NOT EXISTS idx_crm_events_type_entity
    ON crm_events (event_type, entity_id);
