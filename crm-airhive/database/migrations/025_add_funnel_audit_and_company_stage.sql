-- Funnel audit + company stage separation between pre-lead and lead lifecycle.

-- 1) Company lifecycle/audit columns
ALTER TABLE IF EXISTS empresas
    ADD COLUMN IF NOT EXISTS lifecycle_stage TEXT NOT NULL DEFAULT 'lead'
        CHECK (lifecycle_stage IN ('pre_lead', 'lead')),
    ADD COLUMN IF NOT EXISTS source_channel TEXT NOT NULL DEFAULT 'lead',
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS first_pre_lead_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_pre_lead_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS first_lead_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_lead_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS pre_leads_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS leads_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_empresas_lifecycle_stage
    ON empresas (lifecycle_stage);

CREATE INDEX IF NOT EXISTS idx_empresas_source_channel
    ON empresas (source_channel);

-- 2) Explicit audit in pre_leads
ALTER TABLE IF EXISTS pre_leads
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

UPDATE pre_leads
SET created_by = vendedor_id
WHERE created_by IS NULL;

-- 3) Explicit audit in leads
ALTER TABLE IF EXISTS clientes
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

UPDATE clientes
SET created_by = owner_id
WHERE created_by IS NULL;

-- 4) Backfill lifecycle and audit counters from historical records
WITH pre_lead_stats AS (
    SELECT
        pl.empresa_id,
        COUNT(*)::INTEGER AS total_pre_leads,
        MIN(pl.created_at) AS first_pre_lead_at,
        MAX(pl.created_at) AS last_pre_lead_at
    FROM pre_leads pl
    WHERE pl.empresa_id IS NOT NULL
    GROUP BY pl.empresa_id
)
UPDATE empresas e
SET
    source_channel = CASE
        WHEN e.source_channel = 'lead' THEN 'pre_lead'
        ELSE e.source_channel
    END,
    lifecycle_stage = CASE
        WHEN e.lifecycle_stage = 'lead' THEN 'pre_lead'
        ELSE e.lifecycle_stage
    END,
    pre_leads_count = GREATEST(COALESCE(e.pre_leads_count, 0), pls.total_pre_leads),
    first_pre_lead_at = COALESCE(e.first_pre_lead_at, pls.first_pre_lead_at),
    last_pre_lead_at = COALESCE(e.last_pre_lead_at, pls.last_pre_lead_at)
FROM pre_lead_stats pls
WHERE e.id = pls.empresa_id;

WITH lead_stats AS (
    SELECT
        c.empresa_id,
        COUNT(*)::INTEGER AS total_leads,
        MIN(c.created_at) AS first_lead_at,
        MAX(c.created_at) AS last_lead_at
    FROM clientes c
    WHERE c.empresa_id IS NOT NULL
    GROUP BY c.empresa_id
)
UPDATE empresas e
SET
    lifecycle_stage = 'lead',
    source_channel = CASE
        WHEN e.source_channel = 'pre_lead' THEN e.source_channel
        ELSE 'lead'
    END,
    leads_count = GREATEST(COALESCE(e.leads_count, 0), ls.total_leads),
    first_lead_at = COALESCE(e.first_lead_at, ls.first_lead_at),
    last_lead_at = COALESCE(e.last_lead_at, ls.last_lead_at)
FROM lead_stats ls
WHERE e.id = ls.empresa_id;
