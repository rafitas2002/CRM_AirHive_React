-- Backfill historical events into crm_audit_log so existing meetings/snapshots/leads
-- are visible in Insights Bitácora even if they were created before migration 101.
-- Safe to run multiple times.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'idx_crm_audit_log_backfill_key_lookup'
    ) THEN
        CREATE INDEX idx_crm_audit_log_backfill_key_lookup
            ON public.crm_audit_log ((context_data ->> 'backfill_key'))
            WHERE context_data ? 'backfill_key';
    END IF;
END $$;

-- Lead created baseline
INSERT INTO public.crm_audit_log (
    event_type,
    entity_type,
    entity_id,
    actor_user_id,
    event_source,
    before_data,
    after_data,
    context_data,
    created_at
)
SELECT
    'lead_created',
    'lead',
    c.id::TEXT,
    c.owner_id,
    'db_backfill',
    NULL,
    public.crm_audit_lead_state(c),
    jsonb_build_object(
        'table', 'clientes',
        'operation', 'backfill_insert',
        'backfill_key', 'lead_created:' || c.id::TEXT
    ),
    COALESCE(c.created_at, NOW())
FROM public.clientes c
WHERE NOT EXISTS (
    SELECT 1
    FROM public.crm_audit_log l
    WHERE l.context_data ->> 'backfill_key' = 'lead_created:' || c.id::TEXT
);

-- Meeting scheduled baseline
INSERT INTO public.crm_audit_log (
    event_type,
    entity_type,
    entity_id,
    actor_user_id,
    event_source,
    before_data,
    after_data,
    context_data,
    created_at
)
SELECT
    'meeting_scheduled',
    'meeting',
    m.id::TEXT,
    m.seller_id,
    'db_backfill',
    NULL,
    public.crm_audit_meeting_state(m),
    jsonb_build_object(
        'table', 'meetings',
        'operation', 'backfill_insert',
        'backfill_key', 'meeting_scheduled:' || m.id::TEXT
    ),
    COALESCE(m.created_at, NOW())
FROM public.meetings m
WHERE NOT EXISTS (
    SELECT 1
    FROM public.crm_audit_log l
    WHERE l.context_data ->> 'backfill_key' = 'meeting_scheduled:' || m.id::TEXT
);

-- Meeting confirmed held / not held baseline
INSERT INTO public.crm_audit_log (
    event_type,
    entity_type,
    entity_id,
    actor_user_id,
    event_source,
    before_data,
    after_data,
    context_data,
    created_at
)
SELECT
    CASE
        WHEN LOWER(TRIM(COALESCE(m.meeting_status, ''))) = 'held' THEN 'meeting_confirmed_held'
        WHEN LOWER(TRIM(COALESCE(m.meeting_status, ''))) IN ('not_held', 'cancelled') THEN 'meeting_confirmed_not_held'
        ELSE 'meeting_updated'
    END,
    'meeting',
    m.id::TEXT,
    COALESCE(m.confirmed_by, m.seller_id),
    'db_backfill',
    NULL,
    public.crm_audit_meeting_state(m),
    jsonb_build_object(
        'table', 'meetings',
        'operation', 'backfill_status',
        'meeting_status', m.meeting_status,
        'backfill_key', 'meeting_status:' || m.id::TEXT || ':' || LOWER(TRIM(COALESCE(m.meeting_status, 'none')))
    ),
    COALESCE(m.confirmation_timestamp, m.updated_at, m.created_at, NOW())
FROM public.meetings m
WHERE LOWER(TRIM(COALESCE(m.meeting_status, ''))) IN ('held', 'not_held', 'cancelled')
AND NOT EXISTS (
    SELECT 1
    FROM public.crm_audit_log l
    WHERE l.context_data ->> 'backfill_key' = 'meeting_status:' || m.id::TEXT || ':' || LOWER(TRIM(COALESCE(m.meeting_status, 'none')))
);

-- Forecast snapshots baseline
INSERT INTO public.crm_audit_log (
    event_type,
    entity_type,
    entity_id,
    actor_user_id,
    event_source,
    before_data,
    after_data,
    context_data,
    created_at
)
SELECT
    'forecast_snapshot_created',
    'forecast_snapshot',
    fs.id::TEXT,
    fs.seller_id,
    'db_backfill',
    NULL,
    public.crm_audit_snapshot_state(fs),
    jsonb_build_object(
        'table', 'forecast_snapshots',
        'operation', 'backfill_insert',
        'lead_id', fs.lead_id,
        'meeting_id', fs.meeting_id,
        'source', fs.source,
        'backfill_key', 'forecast_snapshot_created:' || fs.id::TEXT
    ),
    COALESCE(fs.snapshot_timestamp, fs.created_at, NOW())
FROM public.forecast_snapshots fs
WHERE NOT EXISTS (
    SELECT 1
    FROM public.crm_audit_log l
    WHERE l.context_data ->> 'backfill_key' = 'forecast_snapshot_created:' || fs.id::TEXT
);
