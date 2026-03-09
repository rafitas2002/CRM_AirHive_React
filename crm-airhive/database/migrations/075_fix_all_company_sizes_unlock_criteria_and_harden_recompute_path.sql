-- Fix incorrect unlocks for "Todos los Tamaños" (all_company_sizes).
--
-- Root cause:
-- Some flows call recompute_seller_special_badges(...) directly. In legacy versions,
-- that recompute path can calculate all_company_sizes with a permissive criterion.
--
-- Hardening strategy (DB-first):
-- 1) Keep legacy generic recompute for all other special badges.
-- 2) Force strict company-size recompute right after generic recompute, every time.
-- 3) Backfill affected sellers to remove incorrectly unlocked all_company_sizes rows.

BEGIN;

DO $$
DECLARE
    fn_oid OID;
    fn_def TEXT;
BEGIN
    fn_oid := to_regprocedure('public.recompute_seller_special_badges(uuid,bigint)');

    IF fn_oid IS NOT NULL
       AND to_regprocedure('public.recompute_seller_special_badges_legacy(uuid,bigint)') IS NULL
    THEN
        SELECT pg_get_functiondef(fn_oid) INTO fn_def;

        -- Rename only when it's not already the hardened wrapper.
        IF POSITION('recompute_seller_special_badges_legacy' IN COALESCE(fn_def, '')) = 0 THEN
            ALTER FUNCTION public.recompute_seller_special_badges(uuid,bigint)
                RENAME TO recompute_seller_special_badges_legacy;
        END IF;
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.recompute_seller_company_size_badges_strict(
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
      AND e.tamano IN (1, 2, 3, 4, 5)
    GROUP BY e.tamano;

    -- "Todos los Tamaños":
    -- progress_count = min cierres entre tamaños 1..5, pero solo cuando hay cobertura total.
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

CREATE OR REPLACE FUNCTION public.recompute_seller_special_badges(
    p_seller_id UUID,
    p_source_lead_id BIGINT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_seller_id IS NULL THEN
        RETURN;
    END IF;

    -- Generic special-badge recompute (race, streaks, value tiers, quotes, etc.).
    IF to_regprocedure('public.recompute_seller_special_badges_legacy(uuid,bigint)') IS NOT NULL THEN
        EXECUTE 'SELECT public.recompute_seller_special_badges_legacy($1, $2)'
        USING p_seller_id, p_source_lead_id;
    END IF;

    -- Enforce strict company-size semantics, including all_company_sizes.
    IF to_regprocedure('public.recompute_seller_company_size_badges_strict(uuid,bigint)') IS NOT NULL THEN
        EXECUTE 'SELECT public.recompute_seller_company_size_badges_strict($1, $2)'
        USING p_seller_id, p_source_lead_id;
    END IF;
END;
$$;

DO $$
DECLARE
    seller_record RECORD;
BEGIN
    FOR seller_record IN (
        SELECT DISTINCT seller_id
        FROM seller_special_badges
        WHERE seller_id IS NOT NULL
          AND badge_type IN ('company_size', 'all_company_sizes')

        UNION

        SELECT DISTINCT owner_id AS seller_id
        FROM clientes
        WHERE owner_id IS NOT NULL

        UNION

        SELECT DISTINCT seller_id
        FROM seller_badge_closures
        WHERE seller_id IS NOT NULL
    ) LOOP
        PERFORM public.recompute_seller_special_badges(seller_record.seller_id, NULL);
    END LOOP;
END $$;

COMMIT;
