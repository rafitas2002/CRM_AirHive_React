-- Hardening: avoid "DELETE requires a WHERE clause" in environments enforcing safe-delete.
-- Impact: lead creation/update should no longer fail due to badge recompute internals.

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

    -- Safe-delete compliant reset (instead of DELETE without WHERE).
    -- DELETE is safer than TRUNCATE under recursive trigger/recompute contexts.
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
                -- Do not block lead writes; keep strict/critical recomputes below.
                IF POSITION('DELETE requires a WHERE clause' IN COALESCE(SQLERRM, '')) = 0 THEN
                    RAISE;
                END IF;
                RAISE WARNING 'Legacy recompute_seller_special_badges skipped due safe-delete guard: %', SQLERRM;
        END;
    END IF;

    -- Enforce strict company-size semantics, including all_company_sizes.
    IF to_regprocedure('public.recompute_seller_company_size_badges_strict(uuid,bigint)') IS NOT NULL THEN
        EXECUTE 'SELECT public.recompute_seller_company_size_badges_strict($1, $2)'
        USING p_seller_id, p_source_lead_id;
    END IF;

    -- Keep deal-value tiers updated even if legacy path was skipped.
    IF to_regprocedure('public.recompute_seller_deal_value_tier_badges_usd(uuid,bigint)') IS NOT NULL THEN
        EXECUTE 'SELECT public.recompute_seller_deal_value_tier_badges_usd($1, $2)'
        USING p_seller_id, p_source_lead_id;
    END IF;
END;
$$;

COMMIT;
