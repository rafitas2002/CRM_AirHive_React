-- Global hardening for badge consistency and event generation.
-- Goals:
-- 1) A seller cannot keep company_size badges without real won leads.
-- 2) refresh_seller_badges_for_lead becomes self-healing (removes stale closures).
-- 3) Industry badges get guaranteed events on upsert (same strategy as special badges).
-- 4) Run a global cleanup/recompute for all sellers.

CREATE OR REPLACE FUNCTION refresh_seller_badges_for_lead(p_lead_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_seller_id UUID;
    v_empresa_id UUID;
    v_etapa TEXT;
    v_prev_seller_id UUID;
    v_prev_empresa_id UUID;
    rec RECORD;
BEGIN
    SELECT owner_id, empresa_id, etapa
    INTO v_seller_id, v_empresa_id, v_etapa
    FROM clientes
    WHERE id = p_lead_id;

    SELECT seller_id, empresa_id
    INTO v_prev_seller_id, v_prev_empresa_id
    FROM seller_badge_closures
    WHERE lead_id = p_lead_id;

    -- If lead is missing or not a valid won closure, purge stale closure and recompute old owner.
    IF NOT FOUND
       OR v_seller_id IS NULL
       OR v_empresa_id IS NULL
       OR NOT is_won_stage(v_etapa)
    THEN
        DELETE FROM seller_badge_closures
        WHERE lead_id = p_lead_id;

        IF v_prev_seller_id IS NOT NULL THEN
            PERFORM recompute_badges_for_seller_company(v_prev_seller_id, v_prev_empresa_id, p_lead_id);
        END IF;

        RETURN;
    END IF;

    -- Upsert canonical closure row from lead current owner/company.
    INSERT INTO seller_badge_closures (lead_id, seller_id, empresa_id, closed_at)
    VALUES (p_lead_id, v_seller_id, v_empresa_id, NOW())
    ON CONFLICT (lead_id)
    DO UPDATE SET
        seller_id = EXCLUDED.seller_id,
        empresa_id = EXCLUDED.empresa_id,
        closed_at = EXCLUDED.closed_at;

    -- If closure moved across seller/company, recompute old one to remove inherited badges.
    IF v_prev_seller_id IS NOT NULL
       AND (
           v_prev_seller_id IS DISTINCT FROM v_seller_id
           OR v_prev_empresa_id IS DISTINCT FROM v_empresa_id
       )
    THEN
        PERFORM recompute_badges_for_seller_company(v_prev_seller_id, v_prev_empresa_id, p_lead_id);
    END IF;

    -- Recompute current owner/company badges.
    PERFORM recompute_badges_for_seller_company(v_seller_id, v_empresa_id, p_lead_id);

    -- Keep legacy behavior of touching all industries linked to company.
    FOR rec IN (
        SELECT DISTINCT industria_id
        FROM (
            SELECT ci.industria_id
            FROM company_industries ci
            WHERE ci.empresa_id = v_empresa_id
              AND ci.industria_id IS NOT NULL
            UNION
            SELECT e.industria_id
            FROM empresas e
            WHERE e.id = v_empresa_id
              AND e.industria_id IS NOT NULL
        ) x
    ) LOOP
        PERFORM recompute_seller_industry_badge(v_seller_id, rec.industria_id, p_lead_id);
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION ensure_industry_badge_event_on_badge_upsert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    has_any_event BOOLEAN := FALSE;
BEGIN
    IF NEW.seller_id IS NULL OR NEW.industria_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF COALESCE(NEW.level, 0) <= 0 THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM seller_badge_events e
        WHERE e.seller_id = NEW.seller_id
          AND e.industria_id = NEW.industria_id
          AND e.level = NEW.level
    ) THEN
        RETURN NEW;
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM seller_badge_events e
        WHERE e.seller_id = NEW.seller_id
          AND e.industria_id = NEW.industria_id
    )
    INTO has_any_event;

    INSERT INTO seller_badge_events (
        seller_id,
        industria_id,
        level,
        event_type,
        closures_count,
        source_lead_id
    )
    VALUES (
        NEW.seller_id,
        NEW.industria_id,
        NEW.level,
        CASE WHEN has_any_event THEN 'upgraded' ELSE 'unlocked' END,
        GREATEST(1, COALESCE(NEW.closures_count, 1)),
        NULL
    )
    ON CONFLICT (seller_id, industria_id, level) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_industry_badge_event_on_badge_upsert ON seller_industry_badges;
CREATE TRIGGER trg_ensure_industry_badge_event_on_badge_upsert
AFTER INSERT OR UPDATE OF level, closures_count, unlocked_at
ON seller_industry_badges
FOR EACH ROW
EXECUTE FUNCTION ensure_industry_badge_event_on_badge_upsert();

-- Backfill missing industry events for already unlocked industry badges.
INSERT INTO seller_badge_events (
    seller_id,
    industria_id,
    level,
    event_type,
    closures_count,
    source_lead_id
)
SELECT
    sib.seller_id,
    sib.industria_id,
    sib.level,
    CASE
        WHEN EXISTS (
            SELECT 1
            FROM seller_badge_events prev
            WHERE prev.seller_id = sib.seller_id
              AND prev.industria_id = sib.industria_id
        ) THEN 'upgraded'
        ELSE 'unlocked'
    END,
    GREATEST(1, COALESCE(sib.closures_count, 1)),
    NULL
FROM seller_industry_badges sib
WHERE COALESCE(sib.level, 0) > 0
  AND NOT EXISTS (
      SELECT 1
      FROM seller_badge_events e
      WHERE e.seller_id = sib.seller_id
        AND e.industria_id = sib.industria_id
        AND e.level = sib.level
  )
ON CONFLICT (seller_id, industria_id, level) DO NOTHING;

-- Global closure integrity repair + global recompute.
DO $$
DECLARE
    seller_record RECORD;
    industry_record RECORD;
BEGIN
    -- 1) Remove closure rows that no longer map to a real won lead owner/company.
    DELETE FROM seller_badge_closures sbc
    WHERE NOT EXISTS (
        SELECT 1
        FROM clientes c
        WHERE c.id = sbc.lead_id
          AND c.owner_id = sbc.seller_id
          AND c.empresa_id = sbc.empresa_id
          AND is_won_stage(c.etapa)
    );

    -- 2) Upsert canonical closures from current won leads.
    INSERT INTO seller_badge_closures (lead_id, seller_id, empresa_id, closed_at)
    SELECT
        c.id,
        c.owner_id,
        c.empresa_id,
        COALESCE(c.created_at, NOW())
    FROM clientes c
    WHERE c.owner_id IS NOT NULL
      AND c.empresa_id IS NOT NULL
      AND is_won_stage(c.etapa)
    ON CONFLICT (lead_id)
    DO UPDATE SET
        seller_id = EXCLUDED.seller_id,
        empresa_id = EXCLUDED.empresa_id,
        closed_at = EXCLUDED.closed_at;

    -- 3) Recompute all badge families for every known seller.
    FOR seller_record IN (
        SELECT DISTINCT seller_id
        FROM seller_badge_closures
        WHERE seller_id IS NOT NULL

        UNION

        SELECT DISTINCT owner_id AS seller_id
        FROM clientes
        WHERE owner_id IS NOT NULL

        UNION

        SELECT DISTINCT seller_id
        FROM seller_industry_badges
        WHERE seller_id IS NOT NULL

        UNION

        SELECT DISTINCT seller_id
        FROM seller_special_badges
        WHERE seller_id IS NOT NULL
    ) LOOP
        FOR industry_record IN (
            SELECT DISTINCT industria_id
            FROM (
                SELECT sib.industria_id
                FROM seller_industry_badges sib
                WHERE sib.seller_id = seller_record.seller_id

                UNION

                SELECT ci.industria_id
                FROM seller_badge_closures sc
                JOIN company_industries ci ON ci.empresa_id = sc.empresa_id
                WHERE sc.seller_id = seller_record.seller_id
                  AND ci.industria_id IS NOT NULL

                UNION

                SELECT e.industria_id
                FROM seller_badge_closures sc
                JOIN empresas e ON e.id = sc.empresa_id
                WHERE sc.seller_id = seller_record.seller_id
                  AND e.industria_id IS NOT NULL
            ) x
            WHERE industria_id IS NOT NULL
        ) LOOP
            PERFORM recompute_seller_industry_badge(seller_record.seller_id, industry_record.industria_id, NULL);
        END LOOP;

        PERFORM recompute_seller_special_badges(seller_record.seller_id, NULL);
    END LOOP;
END $$;
