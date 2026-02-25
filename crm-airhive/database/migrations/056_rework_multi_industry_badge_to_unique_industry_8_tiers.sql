-- Multi-Industry badge: align real DB progression with the new 8-tier evolution.
-- Progress is based on UNIQUE industries closed by the seller (not number of companies).
-- Source of truth for progress:
--   COUNT(DISTINCT seller_industry_badges.industria_id) WHERE level > 0
--
-- Requested tiers:
--  L1  3 industrias
--  L2  5 industrias
--  L3  7 industrias
--  L4 10 industrias
--  L5 12 industrias
--  L6 15 industrias
--  L7 18 industrias
--  L8 20 industrias

BEGIN;

-- 1) Source-of-truth thresholds.
DELETE FROM badge_special_level_config
WHERE badge_type = 'multi_industry';

INSERT INTO badge_special_level_config (badge_type, level, min_progress)
VALUES
    ('multi_industry', 1, 3),
    ('multi_industry', 2, 5),
    ('multi_industry', 3, 7),
    ('multi_industry', 4, 10),
    ('multi_industry', 5, 12),
    ('multi_industry', 6, 15),
    ('multi_industry', 7, 18),
    ('multi_industry', 8, 20)
ON CONFLICT (badge_type, level) DO UPDATE
SET min_progress = EXCLUDED.min_progress;

-- 2) Dedicated refresh for multi-industry special badge (avoids touching unrelated badge types).
CREATE OR REPLACE FUNCTION refresh_seller_multi_industry_special_badge(
    p_seller_id UUID,
    p_source_lead_id BIGINT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_progress_count INTEGER := 0;
    v_old_level INTEGER := 0;
    v_new_level INTEGER := 0;
    v_next_threshold INTEGER := NULL;
    v_existing_id UUID := NULL;
    v_existing_unlocked_at TIMESTAMPTZ := NULL;
    lvl INTEGER;
BEGIN
    IF p_seller_id IS NULL THEN
        RETURN;
    END IF;

    SELECT COUNT(DISTINCT sib.industria_id)::INTEGER
    INTO v_progress_count
    FROM seller_industry_badges sib
    WHERE sib.seller_id = p_seller_id
      AND sib.level > 0
      AND sib.industria_id IS NOT NULL;

    SELECT id, COALESCE(level, 0), unlocked_at
    INTO v_existing_id, v_old_level, v_existing_unlocked_at
    FROM seller_special_badges
    WHERE seller_id = p_seller_id
      AND badge_type = 'multi_industry'
      AND badge_key = 'multi_industry';

    IF COALESCE(v_progress_count, 0) <= 0 THEN
        DELETE FROM seller_special_badges
        WHERE seller_id = p_seller_id
          AND badge_type = 'multi_industry'
          AND badge_key = 'multi_industry';
        RETURN;
    END IF;

    v_new_level := get_special_badge_level('multi_industry', v_progress_count);
    v_next_threshold := get_special_badge_next_threshold('multi_industry', v_new_level);

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
        'multi_industry',
        'multi_industry',
        'Multi Industria',
        v_progress_count,
        v_new_level,
        v_next_threshold,
        CASE WHEN v_new_level > 0 THEN COALESCE(v_existing_unlocked_at, NOW()) ELSE NULL END,
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
                'multi_industry',
                'multi_industry',
                'Multi Industria',
                lvl,
                CASE WHEN lvl = 1 THEN 'unlocked' ELSE 'upgraded' END,
                GREATEST(1, v_progress_count),
                p_source_lead_id
            )
            ON CONFLICT (seller_id, badge_type, badge_key, level) DO NOTHING;
        END LOOP;
    END IF;
END;
$$;

-- 3) Backfill all sellers that already have industry badges or a prior multi_industry row.
DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN (
        SELECT DISTINCT seller_id
        FROM seller_industry_badges
        WHERE seller_id IS NOT NULL
        UNION
        SELECT DISTINCT seller_id
        FROM seller_special_badges
        WHERE seller_id IS NOT NULL
          AND badge_type = 'multi_industry'
    ) LOOP
        PERFORM refresh_seller_multi_industry_special_badge(rec.seller_id, NULL);
    END LOOP;
END $$;

COMMIT;
