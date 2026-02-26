-- Aging de negociaciones (DB-first)
-- Objetivo:
-- 1) Registrar cuándo inicia una negociación por lead
-- 2) Exponer una vista operativa para detectar leads "atorados"
-- 3) Reducir lógica duplicada en frontend

ALTER TABLE clientes
    ADD COLUMN IF NOT EXISTS negotiation_started_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_clientes_negotiation_started_at
    ON clientes (negotiation_started_at DESC);

CREATE INDEX IF NOT EXISTS idx_clientes_stage_owner_negotiation_started
    ON clientes (etapa, owner_id, negotiation_started_at DESC);

CREATE INDEX IF NOT EXISTS idx_meetings_lead_start_status
    ON meetings (lead_id, start_time, status, meeting_status);

CREATE INDEX IF NOT EXISTS idx_meetings_lead_updated_at
    ON meetings (lead_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_tareas_lead_estado_vencimiento
    ON tareas (lead_id, estado, fecha_vencimiento);

CREATE INDEX IF NOT EXISTS idx_tareas_lead_updated_at
    ON tareas (lead_id, updated_at DESC);

CREATE OR REPLACE FUNCTION set_client_negotiation_started_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    old_stage_normalized TEXT;
    new_stage_normalized TEXT;
BEGIN
    old_stage_normalized := lower(trim(coalesce(OLD.etapa, '')));
    new_stage_normalized := lower(trim(coalesce(NEW.etapa, '')));

    -- Inserción en negociación: registrar inicio si no viene informado.
    IF TG_OP = 'INSERT' THEN
        IF new_stage_normalized IN ('negociación', 'negociacion') AND NEW.negotiation_started_at IS NULL THEN
            NEW.negotiation_started_at := NOW();
        END IF;
        RETURN NEW;
    END IF;

    -- Transición hacia negociación: reiniciar timestamp para medir la corrida actual.
    IF new_stage_normalized IN ('negociación', 'negociacion')
       AND old_stage_normalized NOT IN ('negociación', 'negociacion') THEN
        NEW.negotiation_started_at := NOW();
        RETURN NEW;
    END IF;

    -- Si sigue en negociación y el campo viene nulo por datos legacy, conservar o sembrar.
    IF new_stage_normalized IN ('negociación', 'negociacion')
       AND NEW.negotiation_started_at IS NULL THEN
        NEW.negotiation_started_at := COALESCE(OLD.negotiation_started_at, NOW());
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clientes_set_negotiation_started_at ON clientes;
CREATE TRIGGER trg_clientes_set_negotiation_started_at
BEFORE INSERT OR UPDATE ON clientes
FOR EACH ROW
EXECUTE FUNCTION set_client_negotiation_started_at();

-- Backfill: usar la última vez que el lead entró a negociación según historial.
WITH latest_negotiation_entries AS (
    SELECT
        h.lead_id,
        MAX(h.created_at) AS negotiation_started_at
    FROM lead_history h
    WHERE h.lead_id IS NOT NULL
      AND lower(trim(coalesce(h.field_name, ''))) = 'etapa'
      AND lower(trim(coalesce(h.new_value, ''))) IN ('negociación', 'negociacion')
    GROUP BY h.lead_id
)
UPDATE clientes c
SET negotiation_started_at = COALESCE(
    lne.negotiation_started_at,
    CASE
        WHEN c.fecha_registro IS NOT NULL THEN c.fecha_registro::timestamptz
        ELSE c.created_at
    END,
    NOW()
)
FROM latest_negotiation_entries lne
WHERE c.id = lne.lead_id
  AND c.negotiation_started_at IS NULL
  AND lower(trim(coalesce(c.etapa, ''))) IN ('negociación', 'negociacion');

-- Backfill residual: leads en negociación sin historial útil.
UPDATE clientes c
SET negotiation_started_at = COALESCE(
    CASE
        WHEN c.fecha_registro IS NOT NULL THEN c.fecha_registro::timestamptz
        ELSE c.created_at
    END,
    NOW()
)
WHERE c.negotiation_started_at IS NULL
  AND lower(trim(coalesce(c.etapa, ''))) IN ('negociación', 'negociacion');

CREATE OR REPLACE VIEW lead_negotiation_aging_view AS
WITH negotiation_leads AS (
    SELECT
        c.id AS lead_id,
        c.owner_id AS seller_id,
        c.owner_username AS seller_username,
        p.full_name AS seller_full_name,
        c.empresa_id,
        c.empresa,
        c.nombre,
        c.etapa,
        c.valor_estimado,
        c.probabilidad,
        c.forecast_close_date,
        c.last_snapshot_at,
        c.negotiation_started_at,
        c.fecha_registro,
        c.created_at,
        e.industria_id,
        COALESCE(NULLIF(trim(e.industria), ''), i.name) AS industria,
        e.tamano AS tamano_empresa
    FROM clientes c
    LEFT JOIN profiles p
        ON p.id = c.owner_id
    LEFT JOIN empresas e
        ON e.id = c.empresa_id
    LEFT JOIN industrias i
        ON i.id = e.industria_id
    WHERE lower(trim(coalesce(c.etapa, ''))) IN ('negociación', 'negociacion')
),
meetings_rollup AS (
    SELECT
        m.lead_id,
        MIN(m.start_time) FILTER (
            WHERE m.start_time >= NOW()
              AND lower(trim(coalesce(m.status, ''))) <> 'cancelled'
              AND lower(trim(coalesce(m.meeting_status, ''))) IN ('scheduled', 'pending_confirmation')
        ) AS next_meeting_at,
        MAX(
            GREATEST(
                COALESCE(m.updated_at, '-infinity'::timestamptz),
                COALESCE(m.confirmation_timestamp, '-infinity'::timestamptz),
                COALESCE(m.start_time, '-infinity'::timestamptz)
            )
        ) AS last_meeting_activity_at
    FROM meetings m
    GROUP BY m.lead_id
),
tasks_rollup AS (
    SELECT
        t.lead_id,
        COUNT(*) FILTER (WHERE lower(trim(coalesce(t.estado, ''))) IN ('pendiente', 'atrasada'))::INTEGER AS pending_tasks_count,
        COUNT(*) FILTER (
            WHERE lower(trim(coalesce(t.estado, ''))) = 'atrasada'
               OR (
                   lower(trim(coalesce(t.estado, ''))) = 'pendiente'
                   AND t.fecha_vencimiento < NOW()
               )
        )::INTEGER AS overdue_tasks_count,
        MAX(COALESCE(t.updated_at, '-infinity'::timestamptz)) AS last_task_activity_at
    FROM tareas t
    GROUP BY t.lead_id
),
base AS (
    SELECT
        nl.*,
        mr.next_meeting_at,
        mr.last_meeting_activity_at,
        COALESCE(tr.pending_tasks_count, 0) AS pending_tasks_count,
        COALESCE(tr.overdue_tasks_count, 0) AS overdue_tasks_count,
        tr.last_task_activity_at,
        GREATEST(
            COALESCE(nl.last_snapshot_at, '-infinity'::timestamptz),
            COALESCE(mr.last_meeting_activity_at, '-infinity'::timestamptz),
            COALESCE(tr.last_task_activity_at, '-infinity'::timestamptz),
            COALESCE(nl.negotiation_started_at, '-infinity'::timestamptz),
            COALESCE(nl.created_at, '-infinity'::timestamptz)
        ) AS last_activity_at
    FROM negotiation_leads nl
    LEFT JOIN meetings_rollup mr
        ON mr.lead_id = nl.lead_id
    LEFT JOIN tasks_rollup tr
        ON tr.lead_id = nl.lead_id
)
SELECT
    b.lead_id,
    b.seller_id,
    b.seller_username,
    b.seller_full_name,
    b.empresa_id,
    b.empresa,
    b.nombre,
    b.etapa,
    b.valor_estimado,
    b.probabilidad,
    b.forecast_close_date,
    b.industria_id,
    b.industria,
    b.tamano_empresa,
    b.negotiation_started_at,
    GREATEST(
        0,
        FLOOR(EXTRACT(EPOCH FROM (NOW() - COALESCE(b.negotiation_started_at, b.created_at, NOW()))) / 86400)
    )::INTEGER AS aging_days,
    b.pending_tasks_count,
    b.overdue_tasks_count,
    (COALESCE(b.pending_tasks_count, 0) > 0) AS has_open_tasks,
    b.next_meeting_at,
    (b.next_meeting_at IS NOT NULL) AS has_future_meeting,
    b.last_task_activity_at,
    b.last_meeting_activity_at,
    CASE
        WHEN b.last_activity_at = '-infinity'::timestamptz THEN NULL
        ELSE b.last_activity_at
    END AS last_activity_at,
    CASE
        WHEN b.last_activity_at = '-infinity'::timestamptz THEN NULL
        ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - b.last_activity_at)) / 86400))::INTEGER
    END AS days_since_last_activity,
    (
        GREATEST(
            0,
            FLOOR(EXTRACT(EPOCH FROM (NOW() - COALESCE(b.negotiation_started_at, b.created_at, NOW()))) / 86400)
        )::INTEGER >= 14
        AND COALESCE(
            CASE
                WHEN b.last_activity_at = '-infinity'::timestamptz THEN NULL
                ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - b.last_activity_at)) / 86400))::INTEGER
            END,
            9999
        ) >= 7
        AND b.next_meeting_at IS NULL
        AND COALESCE(b.pending_tasks_count, 0) = 0
    ) AS is_stalled
FROM base b;
