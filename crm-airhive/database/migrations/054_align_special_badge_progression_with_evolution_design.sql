-- Align special badge functional progression (DB-first) with the new evolution tiers.
-- This migration makes the REAL unlock/upgrade logic match the UI evolution for:
--   - closure_milestone
--   - company_size
--   - deal_value_tier
--
-- Requested thresholds:
-- closure_milestone: 1, 5, 10, 15, 20, 30, 40, 50
-- company_size:      1, 3, 5, 8, 12, 20, 30, 50
-- deal_value_tier:   1, 3, 5, 8, 12, 20, 30, 50
--
-- Notes:
-- - Keeps DB-first event generation (`seller_special_badge_events`) so celebration popups
--   continue to work when badges are unlocked/upgraded.
-- - Restores tiered leveling for company_size (migration 036 had forced direct unlock only).
-- - Updates deal_value_tier recompute introduced in migration 051 (which hardcoded level=1).

BEGIN;

-- 1) Source-of-truth thresholds for special badges.
DELETE FROM badge_special_level_config
WHERE badge_type IN ('closure_milestone', 'company_size', 'deal_value_tier');

INSERT INTO badge_special_level_config (badge_type, level, min_progress)
VALUES
    -- closure_milestone
    ('closure_milestone', 1, 1),
    ('closure_milestone', 2, 5),
    ('closure_milestone', 3, 10),
    ('closure_milestone', 4, 15),
    ('closure_milestone', 5, 20),
    ('closure_milestone', 6, 30),
    ('closure_milestone', 7, 40),
    ('closure_milestone', 8, 50),

    -- company_size (applies per size badge key, e.g. size_1..size_5)
    ('company_size', 1, 1),
    ('company_size', 2, 3),
    ('company_size', 3, 5),
    ('company_size', 4, 8),
    ('company_size', 5, 12),
    ('company_size', 6, 20),
    ('company_size', 7, 30),
    ('company_size', 8, 50),

    -- deal_value_tier (applies per value-range key)
    ('deal_value_tier', 1, 1),
    ('deal_value_tier', 2, 3),
    ('deal_value_tier', 3, 5),
    ('deal_value_tier', 4, 8),
    ('deal_value_tier', 5, 12),
    ('deal_value_tier', 6, 20),
    ('deal_value_tier', 7, 30),
    ('deal_value_tier', 8, 50)
ON CONFLICT (badge_type, level) DO UPDATE
SET min_progress = EXCLUDED.min_progress;

-- 2) Restore generic special-badge leveling helpers (company_size must no longer be level=1 only).
CREATE OR REPLACE FUNCTION get_special_badge_level(p_badge_type TEXT, p_progress INTEGER)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(MAX(level), 0)
    FROM badge_special_level_config
    WHERE badge_type = p_badge_type
      AND min_progress <= COALESCE(p_progress, 0)
$$;

CREATE OR REPLACE FUNCTION get_special_badge_next_threshold(p_badge_type TEXT, p_current_level INTEGER)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
    SELECT min_progress
    FROM badge_special_level_config
    WHERE badge_type = p_badge_type
      AND level = COALESCE(p_current_level, 0) + 1
    LIMIT 1
$$;

-- 3) Company-size strict recompute should stay strict by won leads, but use tiered levels.
CREATE OR REPLACE FUNCTION recompute_seller_company_size_badges_strict(
    p_seller_id UUID,
    p_source_lead_id BIGINT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    rec RECORD;
    v_old_level INTEGER;
    lvl INTEGER;
    v_new_level INTEGER;
    v_next_threshold INTEGER;
BEGIN
    IF p_seller_id IS NULL THEN
        RETURN;
    END IF;

    CREATE TEMP TABLE IF NOT EXISTS tmp_company_size_badges_strict (
        badge_type TEXT NOT NULL,
        badge_key TEXT NOT NULL,
        badge_label TEXT NOT NULL,
        progress_count INTEGER NOT NULL
    ) ON COMMIT DROP;

    TRUNCATE TABLE tmp_company_size_badges_strict;

    INSERT INTO tmp_company_size_badges_strict (badge_type, badge_key, badge_label, progress_count)
    SELECT
        'company_size',
        'size_' || e.tamano::TEXT,
        'Tamaño de Empresa ' || e.tamano::TEXT,
        COUNT(DISTINCT c.id)::INTEGER
    FROM clientes c
    JOIN empresas e ON e.id = c.empresa_id
    WHERE c.owner_id = p_seller_id
      AND c.empresa_id IS NOT NULL
      AND is_won_stage(c.etapa)
      AND e.tamano IS NOT NULL
    GROUP BY e.tamano;

    INSERT INTO tmp_company_size_badges_strict (badge_type, badge_key, badge_label, progress_count)
    SELECT
        'all_company_sizes',
        'all_sizes',
        'Todos los Tamaños',
        COUNT(DISTINCT e.tamano)::INTEGER
    FROM clientes c
    JOIN empresas e ON e.id = c.empresa_id
    WHERE c.owner_id = p_seller_id
      AND c.empresa_id IS NOT NULL
      AND is_won_stage(c.etapa)
      AND e.tamano IS NOT NULL
    HAVING COUNT(DISTINCT e.tamano) > 0;

    FOR rec IN SELECT * FROM tmp_company_size_badges_strict LOOP
        v_new_level := get_special_badge_level(rec.badge_type, rec.progress_count);
        v_next_threshold := get_special_badge_next_threshold(rec.badge_type, v_new_level);

        SELECT COALESCE(level, 0)
        INTO v_old_level
        FROM seller_special_badges
        WHERE seller_id = p_seller_id
          AND badge_type = rec.badge_type
          AND badge_key = rec.badge_key;

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
            rec.badge_type,
            rec.badge_key,
            rec.badge_label,
            rec.progress_count,
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
                    rec.badge_type,
                    rec.badge_key,
                    rec.badge_label,
                    lvl,
                    CASE WHEN lvl = 1 THEN 'unlocked' ELSE 'upgraded' END,
                    rec.progress_count,
                    p_source_lead_id
                )
                ON CONFLICT (seller_id, badge_type, badge_key, level) DO NOTHING;
            END LOOP;
        END IF;
    END LOOP;

    DELETE FROM seller_special_badges ssb
    WHERE ssb.seller_id = p_seller_id
      AND ssb.badge_type IN ('company_size', 'all_company_sizes')
      AND NOT EXISTS (
          SELECT 1
          FROM tmp_company_size_badges_strict t
          WHERE t.badge_type = ssb.badge_type
            AND t.badge_key = ssb.badge_key
      );
END;
$$;

-- 4) Deal value tier recompute (USD monthly ranges) must also be tiered by progress_count.
CREATE OR REPLACE FUNCTION recompute_seller_deal_value_tier_badges_usd(
    p_seller_id UUID,
    p_source_lead_id BIGINT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    rec RECORD;
    v_old_level INTEGER := 0;
    v_new_level INTEGER := 0;
    v_next_threshold INTEGER := NULL;
    v_prev_unlocked_at TIMESTAMPTZ := NULL;
    lvl INTEGER;
BEGIN
    IF p_seller_id IS NULL THEN
        RETURN;
    END IF;

    CREATE TEMP TABLE IF NOT EXISTS tmp_deal_value_tier_badges_usd (
        badge_type TEXT NOT NULL,
        badge_key TEXT NOT NULL,
        badge_label TEXT NOT NULL,
        progress_count INTEGER NOT NULL
    ) ON COMMIT DROP;

    DELETE FROM tmp_deal_value_tier_badges_usd;

    INSERT INTO tmp_deal_value_tier_badges_usd (badge_type, badge_key, badge_label, progress_count)
    SELECT
        'deal_value_tier',
        'value_1k_2k',
        'Mensualidad 1,000-1,999 USD',
        COUNT(*)::INTEGER
    FROM clientes c
    WHERE c.owner_id = p_seller_id
      AND lower(trim(COALESCE(c.etapa, ''))) LIKE '%ganad%'
      AND COALESCE(c.valor_real_cierre, 0) >= 1000
      AND COALESCE(c.valor_real_cierre, 0) < 2000
    HAVING COUNT(*) > 0;

    INSERT INTO tmp_deal_value_tier_badges_usd (badge_type, badge_key, badge_label, progress_count)
    SELECT
        'deal_value_tier',
        'value_2k_5k',
        'Mensualidad 2,000-4,999 USD',
        COUNT(*)::INTEGER
    FROM clientes c
    WHERE c.owner_id = p_seller_id
      AND lower(trim(COALESCE(c.etapa, ''))) LIKE '%ganad%'
      AND COALESCE(c.valor_real_cierre, 0) >= 2000
      AND COALESCE(c.valor_real_cierre, 0) < 5000
    HAVING COUNT(*) > 0;

    INSERT INTO tmp_deal_value_tier_badges_usd (badge_type, badge_key, badge_label, progress_count)
    SELECT
        'deal_value_tier',
        'value_5k_10k',
        'Mensualidad 5,000-9,999 USD',
        COUNT(*)::INTEGER
    FROM clientes c
    WHERE c.owner_id = p_seller_id
      AND lower(trim(COALESCE(c.etapa, ''))) LIKE '%ganad%'
      AND COALESCE(c.valor_real_cierre, 0) >= 5000
      AND COALESCE(c.valor_real_cierre, 0) < 10000
    HAVING COUNT(*) > 0;

    INSERT INTO tmp_deal_value_tier_badges_usd (badge_type, badge_key, badge_label, progress_count)
    SELECT
        'deal_value_tier',
        'value_10k_100k',
        'Mensualidad 10,000-100,000 USD',
        COUNT(*)::INTEGER
    FROM clientes c
    WHERE c.owner_id = p_seller_id
      AND lower(trim(COALESCE(c.etapa, ''))) LIKE '%ganad%'
      AND COALESCE(c.valor_real_cierre, 0) >= 10000
      AND COALESCE(c.valor_real_cierre, 0) <= 100000
    HAVING COUNT(*) > 0;

    FOR rec IN SELECT * FROM tmp_deal_value_tier_badges_usd LOOP
        SELECT
            COALESCE(level, 0),
            unlocked_at
        INTO
            v_old_level,
            v_prev_unlocked_at
        FROM seller_special_badges
        WHERE seller_id = p_seller_id
          AND badge_type = rec.badge_type
          AND badge_key = rec.badge_key;

        v_new_level := get_special_badge_level(rec.badge_type, rec.progress_count);
        v_next_threshold := get_special_badge_next_threshold(rec.badge_type, v_new_level);

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
            rec.badge_type,
            rec.badge_key,
            rec.badge_label,
            rec.progress_count,
            v_new_level,
            v_next_threshold,
            CASE WHEN v_new_level > 0 THEN COALESCE(v_prev_unlocked_at, NOW()) ELSE NULL END,
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

        IF v_new_level > COALESCE(v_old_level, 0) THEN
            FOR lvl IN (COALESCE(v_old_level, 0) + 1)..v_new_level LOOP
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
                    rec.badge_type,
                    rec.badge_key,
                    rec.badge_label,
                    lvl,
                    CASE WHEN lvl = 1 THEN 'unlocked' ELSE 'upgraded' END,
                    rec.progress_count,
                    p_source_lead_id
                )
                ON CONFLICT (seller_id, badge_type, badge_key, level) DO NOTHING;
            END LOOP;
        END IF;
    END LOOP;

    DELETE FROM seller_special_badges ssb
    WHERE ssb.seller_id = p_seller_id
      AND ssb.badge_type = 'deal_value_tier'
      AND ssb.badge_key NOT IN (
          SELECT t.badge_key
          FROM tmp_deal_value_tier_badges_usd t
      );
END;
$$;

-- 5) Backfill so current sellers get the corrected levels immediately (and events on upgrade).
DO $$
DECLARE
    seller_record RECORD;
BEGIN
    FOR seller_record IN (
        SELECT DISTINCT id AS seller_id
        FROM profiles
        WHERE id IS NOT NULL

        UNION

        SELECT DISTINCT owner_id AS seller_id
        FROM clientes
        WHERE owner_id IS NOT NULL

        UNION

        SELECT DISTINCT seller_id
        FROM seller_special_badges
        WHERE seller_id IS NOT NULL
    ) LOOP
        -- Includes closure_milestone and all other special badges.
        PERFORM recompute_seller_special_badges(seller_record.seller_id, NULL);
        -- Enforce strict won-lead company_size calculation, now with tiered levels.
        PERFORM recompute_seller_company_size_badges_strict(seller_record.seller_id, NULL);
        -- Keep deal_value_tier range logic (051), now also tiered.
        PERFORM recompute_seller_deal_value_tier_badges_usd(seller_record.seller_id, NULL);
    END LOOP;
END $$;

COMMIT;
