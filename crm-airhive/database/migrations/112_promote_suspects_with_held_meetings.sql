-- Promote suspect companies (pre_lead) to lead when they already have at least one held meeting.
-- Also backfills lead counters/dates and marks linked pre_leads as converted when columns exist.

WITH held_company_lead_stats AS (
    SELECT
        c.empresa_id,
        COUNT(DISTINCT c.id)::INTEGER AS total_leads,
        MIN(c.created_at) AS first_lead_at,
        MAX(c.created_at) AS last_lead_at
    FROM public.clientes c
    INNER JOIN public.meetings m
        ON m.lead_id = c.id
    WHERE c.empresa_id IS NOT NULL
      AND (
        LOWER(COALESCE(m.meeting_status, '')) = 'held'
        OR (
            LOWER(COALESCE(m.status, '')) = 'completed'
            AND LOWER(COALESCE(m.meeting_status, '')) NOT IN ('not_held', 'cancelled')
        )
      )
    GROUP BY c.empresa_id
)
UPDATE public.empresas e
SET
    lifecycle_stage = 'lead',
    leads_count = GREATEST(COALESCE(e.leads_count, 0), hs.total_leads),
    first_lead_at = COALESCE(e.first_lead_at, hs.first_lead_at, NOW()),
    last_lead_at = GREATEST(
        COALESCE(e.last_lead_at, '-infinity'::timestamptz),
        COALESCE(hs.last_lead_at, hs.first_lead_at, NOW())
    )
FROM held_company_lead_stats hs
WHERE e.id = hs.empresa_id
  AND COALESCE(e.lifecycle_stage, 'pre_lead') = 'pre_lead';

DO $$
DECLARE
    has_converted_at BOOLEAN;
    has_converted_to_lead_id BOOLEAN;
    has_updated_by BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'pre_leads'
          AND column_name = 'converted_at'
    )
    INTO has_converted_at;

    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'pre_leads'
          AND column_name = 'converted_to_lead_id'
    )
    INTO has_converted_to_lead_id;

    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'pre_leads'
          AND column_name = 'updated_by'
    )
    INTO has_updated_by;

    IF has_converted_at AND has_converted_to_lead_id AND has_updated_by THEN
        EXECUTE $q$
            WITH promoted_companies AS (
                SELECT DISTINCT c.empresa_id
                FROM public.clientes c
                INNER JOIN public.meetings m
                    ON m.lead_id = c.id
                INNER JOIN public.empresas e
                    ON e.id = c.empresa_id
                WHERE c.empresa_id IS NOT NULL
                  AND e.lifecycle_stage = 'lead'
                  AND (
                    LOWER(COALESCE(m.meeting_status, '')) = 'held'
                    OR (
                        LOWER(COALESCE(m.status, '')) = 'completed'
                        AND LOWER(COALESCE(m.meeting_status, '')) NOT IN ('not_held', 'cancelled')
                    )
                  )
            ),
            first_company_lead AS (
                SELECT DISTINCT ON (c.empresa_id)
                    c.empresa_id,
                    c.id AS lead_id
                FROM public.clientes c
                WHERE c.empresa_id IS NOT NULL
                ORDER BY c.empresa_id, c.created_at ASC, c.id ASC
            )
            UPDATE public.pre_leads pl
            SET
                is_converted = TRUE,
                converted_at = COALESCE(pl.converted_at, NOW()),
                converted_to_lead_id = COALESCE(pl.converted_to_lead_id, fcl.lead_id),
                updated_by = COALESCE(pl.updated_by, pl.vendedor_id)
            FROM promoted_companies pc
            LEFT JOIN first_company_lead fcl
                ON fcl.empresa_id = pc.empresa_id
            WHERE pl.empresa_id = pc.empresa_id
              AND COALESCE(pl.is_converted, FALSE) = FALSE
        $q$;
    ELSIF has_converted_at AND has_converted_to_lead_id THEN
        EXECUTE $q$
            WITH promoted_companies AS (
                SELECT DISTINCT c.empresa_id
                FROM public.clientes c
                INNER JOIN public.meetings m
                    ON m.lead_id = c.id
                INNER JOIN public.empresas e
                    ON e.id = c.empresa_id
                WHERE c.empresa_id IS NOT NULL
                  AND e.lifecycle_stage = 'lead'
                  AND (
                    LOWER(COALESCE(m.meeting_status, '')) = 'held'
                    OR (
                        LOWER(COALESCE(m.status, '')) = 'completed'
                        AND LOWER(COALESCE(m.meeting_status, '')) NOT IN ('not_held', 'cancelled')
                    )
                  )
            ),
            first_company_lead AS (
                SELECT DISTINCT ON (c.empresa_id)
                    c.empresa_id,
                    c.id AS lead_id
                FROM public.clientes c
                WHERE c.empresa_id IS NOT NULL
                ORDER BY c.empresa_id, c.created_at ASC, c.id ASC
            )
            UPDATE public.pre_leads pl
            SET
                is_converted = TRUE,
                converted_at = COALESCE(pl.converted_at, NOW()),
                converted_to_lead_id = COALESCE(pl.converted_to_lead_id, fcl.lead_id)
            FROM promoted_companies pc
            LEFT JOIN first_company_lead fcl
                ON fcl.empresa_id = pc.empresa_id
            WHERE pl.empresa_id = pc.empresa_id
              AND COALESCE(pl.is_converted, FALSE) = FALSE
        $q$;
    ELSE
        EXECUTE $q$
            UPDATE public.pre_leads pl
            SET is_converted = TRUE
            WHERE COALESCE(pl.is_converted, FALSE) = FALSE
              AND EXISTS (
                SELECT 1
                FROM public.empresas e
                INNER JOIN public.clientes c
                    ON c.empresa_id = e.id
                INNER JOIN public.meetings m
                    ON m.lead_id = c.id
                WHERE e.id = pl.empresa_id
                  AND e.lifecycle_stage = 'lead'
                  AND (
                    LOWER(COALESCE(m.meeting_status, '')) = 'held'
                    OR (
                        LOWER(COALESCE(m.status, '')) = 'completed'
                        AND LOWER(COALESCE(m.meeting_status, '')) NOT IN ('not_held', 'cancelled')
                    )
                  )
              )
        $q$;
    END IF;
END $$;
