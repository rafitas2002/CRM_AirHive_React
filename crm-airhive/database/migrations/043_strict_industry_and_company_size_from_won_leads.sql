-- Make industry/company_size badges derive directly from current won leads in `clientes`.
-- This keeps behavior consistent with deal_value_tier and prevents stale badges when
-- a lead is reverted from won -> negociación or deleted.

CREATE OR REPLACE FUNCTION recompute_seller_industry_badge(
    p_seller_id UUID,
    p_industria_id UUID,
    p_source_lead_id BIGINT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_closures INTEGER;
    v_new_level INTEGER;
    v_old_level INTEGER := 0;
    v_next_threshold INTEGER;
    lvl INTEGER;
BEGIN
    IF p_seller_id IS NULL OR p_industria_id IS NULL THEN
        RETURN;
    END IF;

    -- Strict source of truth: won leads from clientes (not closure cache table).
    SELECT COUNT(DISTINCT c.id)::INTEGER
    INTO v_closures
    FROM clientes c
    WHERE c.owner_id = p_seller_id
      AND c.empresa_id IS NOT NULL
      AND is_won_stage(c.etapa)
      AND (
        EXISTS (
            SELECT 1
            FROM company_industries ci
            WHERE ci.empresa_id = c.empresa_id
              AND ci.industria_id = p_industria_id
        )
        OR EXISTS (
            SELECT 1
            FROM empresas e
            WHERE e.id = c.empresa_id
              AND e.industria_id = p_industria_id
        )
      );

    v_new_level := get_badge_level(v_closures);
    v_next_threshold := get_next_badge_threshold(v_new_level);

    SELECT COALESCE(level, 0)
    INTO v_old_level
    FROM seller_industry_badges
    WHERE seller_id = p_seller_id
      AND industria_id = p_industria_id;

    INSERT INTO seller_industry_badges (
        seller_id,
        industria_id,
        closures_count,
        level,
        next_level_threshold,
        unlocked_at,
        updated_at
    )
    VALUES (
        p_seller_id,
        p_industria_id,
        v_closures,
        v_new_level,
        v_next_threshold,
        CASE WHEN v_new_level > 0 THEN NOW() ELSE NULL END,
        NOW()
    )
    ON CONFLICT (seller_id, industria_id)
    DO UPDATE SET
        closures_count = EXCLUDED.closures_count,
        level = EXCLUDED.level,
        next_level_threshold = EXCLUDED.next_level_threshold,
        unlocked_at = CASE
            WHEN EXCLUDED.level > 0 THEN COALESCE(seller_industry_badges.unlocked_at, EXCLUDED.unlocked_at)
            ELSE NULL
        END,
        updated_at = NOW();

    IF v_new_level > v_old_level THEN
        FOR lvl IN (v_old_level + 1)..v_new_level LOOP
            INSERT INTO seller_badge_events (
                seller_id,
                industria_id,
                level,
                event_type,
                closures_count,
                source_lead_id
            )
            VALUES (
                p_seller_id,
                p_industria_id,
                lvl,
                CASE WHEN lvl = 1 THEN 'unlocked' ELSE 'upgraded' END,
                GREATEST(1, v_closures),
                p_source_lead_id
            )
            ON CONFLICT (seller_id, industria_id, level) DO NOTHING;
        END LOOP;
    END IF;
END;
$$;

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

    -- company_size badges: one badge per real company size closed.
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

    -- all_company_sizes badge.
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
        IF rec.badge_type = 'company_size' THEN
            v_new_level := 1;
            v_next_threshold := NULL;
        ELSE
            v_new_level := get_special_badge_level(rec.badge_type, rec.progress_count);
            v_next_threshold := get_special_badge_next_threshold(rec.badge_type, v_new_level);
        END IF;

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

CREATE OR REPLACE FUNCTION recompute_badges_for_seller_company(
    p_seller_id UUID,
    p_empresa_id UUID,
    p_source_lead_id BIGINT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    rec RECORD;
BEGIN
    IF p_seller_id IS NULL THEN
        RETURN;
    END IF;

    -- Recompute all industries reachable from current won leads + existing badge rows.
    FOR rec IN (
        SELECT DISTINCT industria_id
        FROM (
            SELECT sib.industria_id
            FROM seller_industry_badges sib
            WHERE sib.seller_id = p_seller_id
              AND sib.industria_id IS NOT NULL

            UNION

            SELECT ci.industria_id
            FROM clientes c
            JOIN company_industries ci ON ci.empresa_id = c.empresa_id
            WHERE c.owner_id = p_seller_id
              AND c.empresa_id IS NOT NULL
              AND is_won_stage(c.etapa)
              AND ci.industria_id IS NOT NULL

            UNION

            SELECT e.industria_id
            FROM clientes c
            JOIN empresas e ON e.id = c.empresa_id
            WHERE c.owner_id = p_seller_id
              AND c.empresa_id IS NOT NULL
              AND is_won_stage(c.etapa)
              AND e.industria_id IS NOT NULL
        ) x
        WHERE industria_id IS NOT NULL
    ) LOOP
        PERFORM recompute_seller_industry_badge(p_seller_id, rec.industria_id, p_source_lead_id);
    END LOOP;

    -- Keep full special recompute, then enforce strict company-size correctness.
    PERFORM recompute_seller_special_badges(p_seller_id, p_source_lead_id);
    PERFORM recompute_seller_company_size_badges_strict(p_seller_id, p_source_lead_id);
END;
$$;

-- Global correction pass for existing stale rows.
DO $$
DECLARE
    seller_record RECORD;
BEGIN
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
        PERFORM recompute_badges_for_seller_company(seller_record.seller_id, NULL, NULL);
    END LOOP;
END $$;

