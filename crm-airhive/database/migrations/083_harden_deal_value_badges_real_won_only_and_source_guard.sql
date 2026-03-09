-- Harden deal_value_tier so progression/level-ups only happen from real closure value
-- on won leads. This also blocks normalization-trigger upgrades when source lead is absent.

BEGIN;

CREATE OR REPLACE FUNCTION public.recompute_seller_deal_value_tier_badges_usd(
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
    v_effective_level INTEGER := 0;
    v_effective_next_threshold INTEGER := NULL;
    v_prev_unlocked_at TIMESTAMPTZ := NULL;
    v_source_qualifies_upgrade BOOLEAN := FALSE;
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

    -- DELETE is safer than TRUNCATE under recursive trigger/recompute contexts.
    DELETE FROM tmp_deal_value_tier_badges_usd;

    INSERT INTO tmp_deal_value_tier_badges_usd (badge_type, badge_key, badge_label, progress_count)
    SELECT
        'deal_value_tier',
        'value_1k_2k',
        'Mensualidad 1k',
        COUNT(*)::INTEGER
    FROM clientes c
    WHERE c.owner_id = p_seller_id
      AND is_won_stage(c.etapa)
      AND c.valor_real_cierre IS NOT NULL
      AND c.valor_real_cierre >= 1000
      AND c.valor_real_cierre < 2000
    HAVING COUNT(*) > 0;

    INSERT INTO tmp_deal_value_tier_badges_usd (badge_type, badge_key, badge_label, progress_count)
    SELECT
        'deal_value_tier',
        'value_2k_5k',
        'Mensualidad 2k',
        COUNT(*)::INTEGER
    FROM clientes c
    WHERE c.owner_id = p_seller_id
      AND is_won_stage(c.etapa)
      AND c.valor_real_cierre IS NOT NULL
      AND c.valor_real_cierre >= 2000
      AND c.valor_real_cierre < 5000
    HAVING COUNT(*) > 0;

    INSERT INTO tmp_deal_value_tier_badges_usd (badge_type, badge_key, badge_label, progress_count)
    SELECT
        'deal_value_tier',
        'value_5k_10k',
        'Mensualidad 5k',
        COUNT(*)::INTEGER
    FROM clientes c
    WHERE c.owner_id = p_seller_id
      AND is_won_stage(c.etapa)
      AND c.valor_real_cierre IS NOT NULL
      AND c.valor_real_cierre >= 5000
      AND c.valor_real_cierre < 10000
    HAVING COUNT(*) > 0;

    INSERT INTO tmp_deal_value_tier_badges_usd (badge_type, badge_key, badge_label, progress_count)
    SELECT
        'deal_value_tier',
        'value_10k_100k',
        'Mensualidad 10k',
        COUNT(*)::INTEGER
    FROM clientes c
    WHERE c.owner_id = p_seller_id
      AND is_won_stage(c.etapa)
      AND c.valor_real_cierre IS NOT NULL
      AND c.valor_real_cierre >= 10000
      AND c.valor_real_cierre <= 100000
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
        v_effective_level := v_new_level;

        v_source_qualifies_upgrade := FALSE;
        IF p_source_lead_id IS NOT NULL THEN
            SELECT EXISTS (
                SELECT 1
                FROM clientes c
                WHERE c.id = p_source_lead_id
                  AND c.owner_id = p_seller_id
                  AND is_won_stage(c.etapa)
                  AND c.valor_real_cierre IS NOT NULL
                  AND (
                      (rec.badge_key = 'value_1k_2k' AND c.valor_real_cierre >= 1000 AND c.valor_real_cierre < 2000)
                      OR (rec.badge_key = 'value_2k_5k' AND c.valor_real_cierre >= 2000 AND c.valor_real_cierre < 5000)
                      OR (rec.badge_key = 'value_5k_10k' AND c.valor_real_cierre >= 5000 AND c.valor_real_cierre < 10000)
                      OR (rec.badge_key = 'value_10k_100k' AND c.valor_real_cierre >= 10000 AND c.valor_real_cierre <= 100000)
                  )
            )
            INTO v_source_qualifies_upgrade;
        END IF;

        IF v_new_level > COALESCE(v_old_level, 0) AND NOT v_source_qualifies_upgrade THEN
            v_effective_level := COALESCE(v_old_level, 0);
        END IF;

        v_effective_next_threshold := get_special_badge_next_threshold(rec.badge_type, v_effective_level);

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
            v_effective_level,
            v_effective_next_threshold,
            CASE WHEN v_effective_level > 0 THEN COALESCE(v_prev_unlocked_at, NOW()) ELSE NULL END,
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

        IF v_effective_level > COALESCE(v_old_level, 0) THEN
            FOR lvl IN (COALESCE(v_old_level, 0) + 1)..v_effective_level LOOP
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

    -- Generic special-badge recompute (legacy path).
    IF to_regprocedure('public.recompute_seller_special_badges_legacy(uuid,bigint)') IS NOT NULL THEN
        BEGIN
            EXECUTE 'SELECT public.recompute_seller_special_badges_legacy($1, $2)'
            USING p_seller_id, p_source_lead_id;
        EXCEPTION
            WHEN OTHERS THEN
                -- Some environments enforce safe-delete and can fail legacy internals.
                -- Do not block lead writes; keep strict recomputes below.
                IF POSITION('DELETE requires a WHERE clause' IN COALESCE(SQLERRM, '')) = 0 THEN
                    RAISE;
                END IF;
                RAISE WARNING 'Legacy recompute_seller_special_badges skipped due safe-delete guard: %', SQLERRM;
        END;
    END IF;

    IF to_regprocedure('public.recompute_seller_company_size_badges_strict(uuid,bigint)') IS NOT NULL THEN
        EXECUTE 'SELECT public.recompute_seller_company_size_badges_strict($1, $2)'
        USING p_seller_id, p_source_lead_id;
    END IF;

    -- Enforce strict deal-value semantics even if legacy path was executed.
    IF to_regprocedure('public.recompute_seller_deal_value_tier_badges_usd(uuid,bigint)') IS NOT NULL THEN
        EXECUTE 'SELECT public.recompute_seller_deal_value_tier_badges_usd($1, $2)'
        USING p_seller_id, p_source_lead_id;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_special_badge_progression_row(
    p_seller_id UUID,
    p_badge_type TEXT,
    p_badge_key TEXT,
    p_source_lead_id BIGINT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row RECORD;
    v_old_level INTEGER := 0;
    v_new_level INTEGER := 0;
    v_next_threshold INTEGER := NULL;
    v_source_qualifies_upgrade BOOLEAN := FALSE;
    lvl INTEGER;
BEGIN
    IF p_seller_id IS NULL OR p_badge_type IS NULL OR p_badge_key IS NULL THEN
        RETURN;
    END IF;

    IF p_badge_type NOT IN ('closure_milestone', 'company_size', 'deal_value_tier') THEN
        RETURN;
    END IF;

    SELECT *
    INTO v_row
    FROM seller_special_badges
    WHERE seller_id = p_seller_id
      AND badge_type = p_badge_type
      AND badge_key = p_badge_key;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    v_old_level := COALESCE(v_row.level, 0);
    v_new_level := get_special_badge_level(v_row.badge_type, v_row.progress_count);
    v_next_threshold := get_special_badge_next_threshold(v_row.badge_type, v_new_level);

    IF p_badge_type = 'deal_value_tier' AND v_new_level > v_old_level THEN
        v_source_qualifies_upgrade := FALSE;

        IF p_source_lead_id IS NOT NULL THEN
            SELECT EXISTS (
                SELECT 1
                FROM clientes c
                WHERE c.id = p_source_lead_id
                  AND c.owner_id = p_seller_id
                  AND is_won_stage(c.etapa)
                  AND c.valor_real_cierre IS NOT NULL
                  AND (
                      (p_badge_key = 'value_1k_2k' AND c.valor_real_cierre >= 1000 AND c.valor_real_cierre < 2000)
                      OR (p_badge_key = 'value_2k_5k' AND c.valor_real_cierre >= 2000 AND c.valor_real_cierre < 5000)
                      OR (p_badge_key = 'value_5k_10k' AND c.valor_real_cierre >= 5000 AND c.valor_real_cierre < 10000)
                      OR ((p_badge_key = 'value_10k_100k' OR p_badge_key = 'value_10k_plus') AND c.valor_real_cierre >= 10000 AND c.valor_real_cierre <= 100000)
                  )
            )
            INTO v_source_qualifies_upgrade;
        END IF;

        IF NOT v_source_qualifies_upgrade THEN
            v_new_level := v_old_level;
            v_next_threshold := get_special_badge_next_threshold(v_row.badge_type, v_new_level);
        END IF;
    END IF;

    IF v_new_level = v_old_level
       AND (v_row.next_level_threshold IS NOT DISTINCT FROM v_next_threshold) THEN
        RETURN;
    END IF;

    UPDATE seller_special_badges
    SET level = v_new_level,
        next_level_threshold = v_next_threshold,
        unlocked_at = CASE
            WHEN v_new_level > 0 THEN COALESCE(unlocked_at, NOW())
            ELSE NULL
        END,
        updated_at = NOW()
    WHERE id = v_row.id;

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
                v_row.seller_id,
                v_row.badge_type,
                v_row.badge_key,
                v_row.badge_label,
                lvl,
                CASE WHEN lvl = 1 THEN 'unlocked' ELSE 'upgraded' END,
                GREATEST(1, COALESCE(v_row.progress_count, 0)),
                p_source_lead_id
            )
            ON CONFLICT (seller_id, badge_type, badge_key, level) DO NOTHING;
        END LOOP;
    END IF;
END;
$$;

-- Global correction pass:
-- 1) purge stale/incompatible rows by strict recompute per seller
-- 2) re-allow valid unlocks/upgrades using a real won lead source per tier
DO $$
DECLARE
    seller_record RECORD;
    tier_source RECORD;
BEGIN
    FOR seller_record IN (
        SELECT DISTINCT seller_id
        FROM seller_special_badges
        WHERE seller_id IS NOT NULL
          AND badge_type = 'deal_value_tier'

        UNION

        SELECT DISTINCT owner_id AS seller_id
        FROM clientes
        WHERE owner_id IS NOT NULL
    ) LOOP
        PERFORM public.recompute_seller_deal_value_tier_badges_usd(seller_record.seller_id, NULL);
    END LOOP;

    FOR tier_source IN (
        WITH qualified AS (
            SELECT
                c.owner_id AS seller_id,
                c.id AS lead_id,
                CASE
                    WHEN c.valor_real_cierre >= 1000 AND c.valor_real_cierre < 2000 THEN 'value_1k_2k'
                    WHEN c.valor_real_cierre >= 2000 AND c.valor_real_cierre < 5000 THEN 'value_2k_5k'
                    WHEN c.valor_real_cierre >= 5000 AND c.valor_real_cierre < 10000 THEN 'value_5k_10k'
                    WHEN c.valor_real_cierre >= 10000 AND c.valor_real_cierre <= 100000 THEN 'value_10k_100k'
                    ELSE NULL
                END AS badge_key,
                COALESCE(c.closed_at_real, c.created_at, NOW()) AS sort_ts
            FROM clientes c
            WHERE c.owner_id IS NOT NULL
              AND is_won_stage(c.etapa)
              AND c.valor_real_cierre IS NOT NULL
              AND c.valor_real_cierre >= 1000
              AND c.valor_real_cierre <= 100000
        ),
        ranked AS (
            SELECT
                seller_id,
                lead_id,
                badge_key,
                ROW_NUMBER() OVER (
                    PARTITION BY seller_id, badge_key
                    ORDER BY sort_ts DESC, lead_id DESC
                ) AS rn
            FROM qualified
            WHERE badge_key IS NOT NULL
        )
        SELECT seller_id, lead_id
        FROM ranked
        WHERE rn = 1
    ) LOOP
        PERFORM public.recompute_seller_deal_value_tier_badges_usd(tier_source.seller_id, tier_source.lead_id);
    END LOOP;
END $$;

COMMIT;
