-- Enhance pre_leads for company linkage and correlation analytics
-- Safe migration: all statements are IF NOT EXISTS-compatible

ALTER TABLE IF EXISTS pre_leads
    ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS industria_id UUID REFERENCES industrias(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS tamano SMALLINT,
    ADD COLUMN IF NOT EXISTS website TEXT,
    ADD COLUMN IF NOT EXISTS logo_url TEXT,
    ADD COLUMN IF NOT EXISTS is_converted BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS converted_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pre_leads_vendedor_created_at
    ON pre_leads (vendedor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pre_leads_empresa_id
    ON pre_leads (empresa_id);

CREATE INDEX IF NOT EXISTS idx_pre_leads_conversion
    ON pre_leads (is_converted, converted_at DESC);
