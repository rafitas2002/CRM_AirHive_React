-- Rework "Racha Imparable" to:
-- - unlock at 2 consecutive months with >=1 won company close each month
-- - keep evolution thresholds in badge_special_level_config (8 tiers)
-- - keep active/inactive state based on current streak recency
-- - compute level from BEST streak, while UI can display CURRENT streak separately

BEGIN;

DELETE FROM badge_special_level_config
WHERE badge_type = 'closing_streak';

INSERT INTO badge_special_level_config (badge_type, level, min_progress)
VALUES
    ('closing_streak', 1, 2),
    ('closing_streak', 2, 5),
    ('closing_streak', 3, 8),
    ('closing_streak', 4, 12),
    ('closing_streak', 5, 18),
    ('closing_streak', 6, 24),
    ('closing_streak', 7, 36),
    ('closing_streak', 8, 48);

CREATE OR REPLACE FUNCTION refresh_seller_closing_streak_special_badge(
    p_seller_id UUID,
    p_source_lead_id BIGINT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_streak INTEGER := 0;
    v_best_streak INTEGER := 0;
    v_last_closed_month DATE := NULL;
    v_is_active BOOLEAN := FALSE;
    v_now_month DATE := date_trunc('month', NOW())::date;
    v_prev_month DATE := (date_trunc('month', NOW()) - interval '1 month')::date;
    v_old_row RECORD;
    v_old_level INTEGER := 0;
    v_new_level INTEGER := 0;
    v_next_threshold INTEGER := NULL;
    v_badge_label TEXT;
    lvl INTEGER;
BEGIN
    IF p_seller_id IS NULL THEN
        RETURN;
    END IF;

    WITH monthly AS (
        SELECT DISTINCT date_trunc('month', sc.closed_at)::date AS m
        FROM seller_badge_closures sc
        WHERE sc.seller_id = p_seller_id
    ),
    ordered AS (
        SELECT
            m,
            ROW_NUMBER() OVER (ORDER BY m) AS rn,
            (EXTRACT(YEAR FROM m)::int * 12 + EXTRACT(MONTH FROM m)::int) AS month_idx
        FROM monthly
    ),
    grouped AS (
        SELECT
            m,
            rn,
            month_idx,
            month_idx - rn AS grp
        FROM ordered
    ),
    streaks AS (
        SELECT
            MIN(m) AS start_month,
            MAX(m) AS end_month,
            COUNT(*)::int AS len
        FROM grouped
        GROUP BY grp
    )
    SELECT
        COALESCE((SELECT len FROM streaks ORDER BY end_month DESC, len DESC LIMIT 1), 0),
        COALESCE((SELECT MAX(len) FROM streaks), 0),
        (SELECT end_month FROM streaks ORDER BY end_month DESC, len DESC LIMIT 1)
    INTO v_current_streak, v_best_streak, v_last_closed_month;

    v_is_active := (
        v_current_streak >= 2
        AND v_last_closed_month IS NOT NULL
        AND v_last_closed_month IN (v_now_month, v_prev_month)
    );

    SELECT *
    INTO v_old_row
    FROM seller_special_badges
    WHERE seller_id = p_seller_id
      AND badge_type = 'closing_streak'
      AND badge_key = 'closing_streak';

    IF FOUND THEN
        v_old_level := COALESCE(v_old_row.level, 0);
    ELSE
        v_old_level := 0;
    END IF;

    IF v_best_streak < 2 THEN
        DELETE FROM seller_special_badges
        WHERE seller_id = p_seller_id
          AND badge_type = 'closing_streak'
          AND badge_key = 'closing_streak';
        RETURN;
    END IF;

    v_new_level := get_special_badge_level('closing_streak', v_best_streak);
    v_next_threshold := get_special_badge_next_threshold('closing_streak', v_new_level);
    v_badge_label := CASE WHEN v_is_active THEN 'Racha Imparable · Activa' ELSE 'Racha Imparable · Inactiva' END;

    IF FOUND
       AND COALESCE(v_old_row.badge_label, '') = v_badge_label
       AND COALESCE(v_old_row.progress_count, 0) = v_best_streak
       AND COALESCE(v_old_row.level, 0) = v_new_level
       AND (v_old_row.next_level_threshold IS NOT DISTINCT FROM v_next_threshold) THEN
        RETURN;
    END IF;

    INSERT INTO seller_special_badges (
        seller_id,
        badge_type,
        badge_key,
        badge_label,
        progress_count,
        level,
        next_level_threshold,
        unlocked_at,
        updated_at
    )
    VALUES (
        p_seller_id,
        'closing_streak',
        'closing_streak',
        v_badge_label,
        v_best_streak,
        v_new_level,
        v_next_threshold,
        CASE WHEN v_new_level > 0 THEN NOW() ELSE NULL END,
        NOW()
    )
    ON CONFLICT (seller_id, badge_type, badge_key)
    DO UPDATE SET
        badge_label = EXCLUDED.badge_label,
        progress_count = EXCLUDED.progress_count,
        level = EXCLUDED.level,
        next_level_threshold = EXCLUDED.next_level_threshold,
        unlocked_at = CASE
            WHEN EXCLUDED.level > 0 THEN COALESCE(seller_special_badges.unlocked_at, EXCLUDED.unlocked_at)
            ELSE NULL
        END,
        updated_at = NOW();

    IF v_new_level > v_old_level THEN
        FOR lvl IN (v_old_level + 1)..v_new_level LOOP
            INSERT INTO seller_special_badge_events (
                seller_id,
                badge_type,
                badge_key,
                badge_label,
                level,
                event_type,
                progress_count,
                source_lead_id
            )
            VALUES (
                p_seller_id,
                'closing_streak',
                'closing_streak',
                v_badge_label,
                lvl,
                CASE WHEN lvl = 1 THEN 'unlocked' ELSE 'upgraded' END,
                GREATEST(1, v_best_streak),
                p_source_lead_id
            )
            ON CONFLICT (seller_id, badge_type, badge_key, level) DO NOTHING;
        END LOOP;
    END IF;
END;
$$;

-- Extend the existing post-write normalizer trigger so closing streak is corrected after
-- legacy recompute_seller_special_badges(...) writes stale levels/thresholds.
CREATE OR REPLACE FUNCTION trg_normalize_special_badge_progression_after_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_seller_id UUID;
    v_badge_type TEXT;
    v_badge_key TEXT;
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    v_seller_id := COALESCE(NEW.seller_id, OLD.seller_id);
    v_badge_type := COALESCE(NEW.badge_type, OLD.badge_type);
    v_badge_key := COALESCE(NEW.badge_key, OLD.badge_key);

    IF v_badge_type IN ('closure_milestone', 'company_size', 'deal_value_tier') THEN
        PERFORM normalize_special_badge_progression_row(v_seller_id, v_badge_type, v_badge_key, NULL);
    END IF;

    IF v_badge_type IN ('closure_milestone', 'company_size', 'deal_value_tier', 'closing_streak') THEN
        PERFORM refresh_seller_closing_streak_special_badge(v_seller_id, NULL);
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Direct refresh on badge closure writes keeps streak state synced even before any later recompute.
CREATE OR REPLACE FUNCTION trg_refresh_closing_streak_on_badge_closure_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_seller_id UUID;
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_OP = 'DELETE' THEN
        v_seller_id := OLD.seller_id;
        PERFORM refresh_seller_closing_streak_special_badge(v_seller_id, OLD.lead_id);
    ELSE
        v_seller_id := NEW.seller_id;
        PERFORM refresh_seller_closing_streak_special_badge(v_seller_id, NEW.lead_id);
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_seller_badge_closures_refresh_closing_streak ON seller_badge_closures;
CREATE TRIGGER trg_seller_badge_closures_refresh_closing_streak
AFTER INSERT OR UPDATE OR DELETE
ON seller_badge_closures
FOR EACH ROW
EXECUTE FUNCTION trg_refresh_closing_streak_on_badge_closure_write();

-- Backfill streak badge for all sellers with closures or existing streak rows.
DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN (
        SELECT seller_id FROM seller_badge_closures
        UNION
        SELECT seller_id
        FROM seller_special_badges
        WHERE badge_type = 'closing_streak'
    ) LOOP
        PERFORM refresh_seller_closing_streak_special_badge(rec.seller_id, NULL);
    END LOOP;
END $$;

COMMIT;
