-- Rework quote badges to 8 tiers and align recompute_seller_quote_badges(...) with
-- badge_special_level_config (DB-first).
--
-- quote_contribution thresholds: 1,3,5,8,10,12,15,20
-- quote_likes_received thresholds: 1,5,15,25,50,75,100,200

BEGIN;

DELETE FROM badge_special_level_config
WHERE badge_type IN ('quote_contribution', 'quote_likes_received');

INSERT INTO badge_special_level_config (badge_type, level, min_progress)
VALUES
    ('quote_contribution', 1, 1),
    ('quote_contribution', 2, 3),
    ('quote_contribution', 3, 5),
    ('quote_contribution', 4, 8),
    ('quote_contribution', 5, 10),
    ('quote_contribution', 6, 12),
    ('quote_contribution', 7, 15),
    ('quote_contribution', 8, 20),
    ('quote_likes_received', 1, 1),
    ('quote_likes_received', 2, 5),
    ('quote_likes_received', 3, 15),
    ('quote_likes_received', 4, 25),
    ('quote_likes_received', 5, 50),
    ('quote_likes_received', 6, 75),
    ('quote_likes_received', 7, 100),
    ('quote_likes_received', 8, 200);

CREATE OR REPLACE FUNCTION recompute_seller_quote_badges(
    p_seller_id UUID,
    p_source_quote_id BIGINT DEFAULT NULL
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
    v_next_threshold INTEGER;
    lvl INTEGER;
BEGIN
    IF p_seller_id IS NULL THEN
        RETURN;
    END IF;

    CREATE TEMP TABLE IF NOT EXISTS tmp_seller_quote_badges (
        badge_type TEXT NOT NULL,
        badge_key TEXT NOT NULL,
        badge_label TEXT NOT NULL,
        progress_count INTEGER NOT NULL
    ) ON COMMIT DROP;

    TRUNCATE TABLE tmp_seller_quote_badges;

    INSERT INTO tmp_seller_quote_badges (badge_type, badge_key, badge_label, progress_count)
    SELECT
        'quote_contribution',
        'quote_contribution',
        'Aportación de Frases',
        COUNT(*)::INTEGER
    FROM crm_quotes q
    WHERE q.deleted_at IS NULL
      AND q.contributed_by = p_seller_id
    HAVING COUNT(*) > 0;

    INSERT INTO tmp_seller_quote_badges (badge_type, badge_key, badge_label, progress_count)
    SELECT
        'quote_likes_received',
        'quote_likes_received',
        'Frases con Likes',
        COUNT(*)::INTEGER
    FROM crm_quote_reactions r
    JOIN crm_quotes q ON q.id = r.quote_id
    WHERE q.deleted_at IS NULL
      AND q.contributed_by = p_seller_id
      AND r.reaction_type = 'like'
    HAVING COUNT(*) > 0;

    FOR rec IN SELECT * FROM tmp_seller_quote_badges LOOP
        v_new_level := COALESCE(get_special_badge_level(rec.badge_type, rec.progress_count), 0);
        v_next_threshold := get_special_badge_next_threshold(rec.badge_type, v_new_level);

        v_old_level := 0;
        SELECT COALESCE(level, 0)
        INTO v_old_level
        FROM seller_special_badges
        WHERE seller_id = p_seller_id
          AND badge_type = rec.badge_type
          AND badge_key = rec.badge_key;
        v_old_level := COALESCE(v_old_level, 0);

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
            unlocked_at = COALESCE(seller_special_badges.unlocked_at, EXCLUDED.unlocked_at),
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
                    p_source_quote_id
                )
                ON CONFLICT (seller_id, badge_type, badge_key, level) DO NOTHING;
            END LOOP;
        END IF;
    END LOOP;

    DELETE FROM seller_special_badges ssb
    WHERE ssb.seller_id = p_seller_id
      AND ssb.badge_type IN ('quote_contribution', 'quote_likes_received')
      AND NOT EXISTS (
          SELECT 1
          FROM tmp_seller_quote_badges t
          WHERE t.badge_type = ssb.badge_type
            AND t.badge_key = ssb.badge_key
      );
END;
$$;

-- Backfill all affected sellers so current level/next threshold reflects the new config.
DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN (
        SELECT DISTINCT q.contributed_by AS seller_id
        FROM crm_quotes q
        WHERE q.contributed_by IS NOT NULL
        UNION
        SELECT DISTINCT q.contributed_by AS seller_id
        FROM crm_quote_reactions r
        JOIN crm_quotes q ON q.id = r.quote_id
        WHERE q.contributed_by IS NOT NULL
        UNION
        SELECT DISTINCT ssb.seller_id
        FROM seller_special_badges ssb
        WHERE ssb.badge_type IN ('quote_contribution', 'quote_likes_received')
    ) LOOP
        PERFORM recompute_seller_quote_badges(rec.seller_id, NULL);
    END LOOP;
END $$;

COMMIT;
