-- Align "Todos los Tamaños" (all_company_sizes) with 8-tier evolution.
-- Progress semantics:
--   progress_count = minimum number of WON closures across company sizes 1..5
--                    (only once the seller has at least one WON closure in all 5 sizes)
--   If not all 5 sizes are covered yet, progress_count = 0 (badge remains locked).
--
-- Requested tiers:
-- 1:  1 cierre de cada tamaño
-- 2:  2 cierres de cada tamaño
-- 3:  3 cierres de cada tamaño
-- 4:  5 cierres de cada tamaño
-- 5:  7 cierres de cada tamaño
-- 6: 10 cierres de cada tamaño
-- 7: 12 cierres de cada tamaño
-- 8: 15 cierres de cada tamaño

BEGIN;

-- 1) Source-of-truth thresholds for all_company_sizes.
DELETE FROM badge_special_level_config
WHERE badge_type = 'all_company_sizes';

INSERT INTO badge_special_level_config (badge_type, level, min_progress)
VALUES
    ('all_company_sizes', 1, 1),
    ('all_company_sizes', 2, 2),
    ('all_company_sizes', 3, 3),
    ('all_company_sizes', 4, 5),
    ('all_company_sizes', 5, 7),
    ('all_company_sizes', 6, 10),
    ('all_company_sizes', 7, 12),
    ('all_company_sizes', 8, 15)
ON CONFLICT (badge_type, level) DO UPDATE
SET min_progress = EXCLUDED.min_progress;

-- 2) Override strict company-size recompute so "Todos los Tamaños" uses per-size minimum closures.
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

    -- Per-size badges (unchanged semantics: won closures per size).
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

    -- "Todos los Tamaños": progress = min closures across sizes 1..5, only if all 5 sizes are present.
    INSERT INTO tmp_company_size_badges_strict (badge_type, badge_key, badge_label, progress_count)
    WITH size_counts AS (
        SELECT
            e.tamano,
            COUNT(DISTINCT c.id)::INTEGER AS closures_count
        FROM clientes c
        JOIN empresas e ON e.id = c.empresa_id
        WHERE c.owner_id = p_seller_id
          AND c.empresa_id IS NOT NULL
          AND is_won_stage(c.etapa)
          AND e.tamano IN (1, 2, 3, 4, 5)
        GROUP BY e.tamano
    ),
    summary AS (
        SELECT
            COUNT(DISTINCT tamano)::INTEGER AS covered_sizes,
            COALESCE(MIN(closures_count), 0)::INTEGER AS min_closures_each_size
        FROM size_counts
    )
    SELECT
        'all_company_sizes',
        'all_sizes',
        'Todos los Tamaños',
        CASE
            WHEN covered_sizes = 5 THEN min_closures_each_size
            ELSE 0
        END AS progress_count
    FROM summary
    WHERE covered_sizes > 0;

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

-- 3) Backfill all sellers (company_size + all_company_sizes) with the new semantics.
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
          AND badge_type IN ('company_size', 'all_company_sizes')
    ) LOOP
        PERFORM recompute_seller_company_size_badges_strict(seller_record.seller_id, NULL);
    END LOOP;
END $$;

COMMIT;
