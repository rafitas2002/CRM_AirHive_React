-- Backfill historical pre-leads into empresas and link missing empresa_id.
-- Idempotent migration: safe to run multiple times.

-- 0) Ensure pre_leads.created_by has fallback value for historical rows.
UPDATE pre_leads
SET created_by = vendedor_id
WHERE created_by IS NULL
  AND vendedor_id IS NOT NULL;

-- 1) Create missing companies from historical pre-leads (only when name does not exist yet).
WITH prelead_base AS (
    SELECT
        pl.id,
        TRIM(pl.nombre_empresa) AS nombre_empresa,
        LOWER(TRIM(pl.nombre_empresa)) AS nombre_empresa_key,
        pl.ubicacion,
        pl.notas,
        pl.giro_empresa,
        pl.tamano,
        pl.website,
        pl.logo_url,
        pl.created_at,
        COALESCE(pl.created_by, pl.vendedor_id) AS actor_id
    FROM pre_leads pl
    WHERE pl.nombre_empresa IS NOT NULL
      AND TRIM(pl.nombre_empresa) <> ''
),
first_prelead AS (
    SELECT DISTINCT ON (pb.nombre_empresa_key)
        pb.nombre_empresa_key,
        pb.nombre_empresa,
        pb.ubicacion,
        pb.notas,
        pb.giro_empresa,
        pb.tamano,
        pb.website,
        pb.logo_url,
        pb.created_at AS first_created_at,
        pb.actor_id AS first_actor_id
    FROM prelead_base pb
    ORDER BY pb.nombre_empresa_key, pb.created_at ASC, pb.id ASC
),
last_prelead AS (
    SELECT DISTINCT ON (pb.nombre_empresa_key)
        pb.nombre_empresa_key,
        pb.created_at AS last_created_at,
        pb.actor_id AS last_actor_id
    FROM prelead_base pb
    ORDER BY pb.nombre_empresa_key, pb.created_at DESC, pb.id DESC
),
prelead_counts AS (
    SELECT
        pb.nombre_empresa_key,
        COUNT(*)::INTEGER AS pre_leads_count
    FROM prelead_base pb
    GROUP BY pb.nombre_empresa_key
),
to_insert AS (
    SELECT
        fp.nombre_empresa,
        fp.nombre_empresa_key,
        fp.ubicacion,
        fp.notas,
        COALESCE(NULLIF(fp.giro_empresa, ''), 'Sin clasificar') AS industria,
        COALESCE(fp.tamano, 1) AS tamano,
        fp.website,
        fp.logo_url,
        fp.first_created_at,
        lp.last_created_at,
        fp.first_actor_id,
        lp.last_actor_id,
        pc.pre_leads_count
    FROM first_prelead fp
    JOIN last_prelead lp ON lp.nombre_empresa_key = fp.nombre_empresa_key
    JOIN prelead_counts pc ON pc.nombre_empresa_key = fp.nombre_empresa_key
    LEFT JOIN empresas e ON LOWER(TRIM(e.nombre)) = fp.nombre_empresa_key
    WHERE e.id IS NULL
)
INSERT INTO empresas (
    nombre,
    ubicacion,
    descripcion,
    owner_id,
    industria,
    tamano,
    website,
    logo_url,
    source_channel,
    lifecycle_stage,
    created_by,
    updated_by,
    first_pre_lead_at,
    last_pre_lead_at,
    pre_leads_count,
    leads_count,
    created_at
)
SELECT
    ti.nombre_empresa,
    ti.ubicacion,
    ti.notas,
    ti.first_actor_id,
    ti.industria,
    ti.tamano,
    ti.website,
    ti.logo_url,
    'pre_lead',
    'pre_lead',
    ti.first_actor_id,
    COALESCE(ti.last_actor_id, ti.first_actor_id),
    ti.first_created_at,
    ti.last_created_at,
    ti.pre_leads_count,
    0,
    COALESCE(ti.first_created_at, NOW())
FROM to_insert ti;

-- 2) Link any historical pre-lead without empresa_id to an empresa by normalized name.
UPDATE pre_leads pl
SET empresa_id = e.id
FROM empresas e
WHERE pl.empresa_id IS NULL
  AND pl.nombre_empresa IS NOT NULL
  AND TRIM(pl.nombre_empresa) <> ''
  AND LOWER(TRIM(pl.nombre_empresa)) = LOWER(TRIM(e.nombre));

-- 3) Refresh company lifecycle counters/dates from historical pre-leads.
WITH pre_lead_stats AS (
    SELECT
        pl.empresa_id,
        COUNT(*)::INTEGER AS total_pre_leads,
        MIN(pl.created_at) AS first_pre_lead_at,
        MAX(pl.created_at) AS last_pre_lead_at,
        (ARRAY_AGG(COALESCE(pl.created_by, pl.vendedor_id) ORDER BY pl.created_at ASC, pl.id ASC))[1] AS first_actor_id,
        (ARRAY_AGG(COALESCE(pl.created_by, pl.vendedor_id) ORDER BY pl.created_at DESC, pl.id DESC))[1] AS last_actor_id
    FROM pre_leads pl
    WHERE pl.empresa_id IS NOT NULL
    GROUP BY pl.empresa_id
)
UPDATE empresas e
SET
    source_channel = CASE
        WHEN COALESCE(e.source_channel, 'lead') = 'lead' THEN 'pre_lead'
        ELSE e.source_channel
    END,
    lifecycle_stage = CASE
        WHEN COALESCE(e.lifecycle_stage, 'lead') = 'lead' AND COALESCE(e.leads_count, 0) = 0 THEN 'pre_lead'
        ELSE e.lifecycle_stage
    END,
    pre_leads_count = GREATEST(COALESCE(e.pre_leads_count, 0), pls.total_pre_leads),
    first_pre_lead_at = COALESCE(e.first_pre_lead_at, pls.first_pre_lead_at),
    last_pre_lead_at = COALESCE(e.last_pre_lead_at, pls.last_pre_lead_at),
    created_by = COALESCE(e.created_by, pls.first_actor_id),
    updated_by = COALESCE(pls.last_actor_id, e.updated_by)
FROM pre_lead_stats pls
WHERE e.id = pls.empresa_id;

-- 4) Refresh lead counters/dates and promote lifecycle when real leads exist.
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
    leads_count = GREATEST(COALESCE(e.leads_count, 0), ls.total_leads),
    first_lead_at = COALESCE(e.first_lead_at, ls.first_lead_at),
    last_lead_at = COALESCE(e.last_lead_at, ls.last_lead_at)
FROM lead_stats ls
WHERE e.id = ls.empresa_id;
