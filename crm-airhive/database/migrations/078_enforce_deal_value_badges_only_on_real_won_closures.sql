-- Enforce deal_value_tier unlock semantics:
-- 1) Only closures in "Cerrado Ganado" can unlock/upgrade.
-- 2) Source lead must be the triggering won closure.
-- 3) Range is evaluated from valor_real_cierre (never from forecast).
-- 4) Canonical short labels (Mensualidad 1k/2k/5k/10k) to match visual catalog.

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

        -- Upgrades are only valid when the triggering source lead is a won closure
        -- and its REAL monthly value belongs to this tier.
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

-- Recompute trigger should react only to won/real-value relevant changes.
CREATE OR REPLACE FUNCTION public.trg_recompute_deal_value_tier_badges_from_clientes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.owner_id IS NOT NULL AND is_won_stage(OLD.etapa) THEN
            PERFORM public.recompute_seller_deal_value_tier_badges_usd(OLD.owner_id, OLD.id);
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.owner_id IS NOT NULL AND is_won_stage(NEW.etapa) THEN
            PERFORM public.recompute_seller_deal_value_tier_badges_usd(NEW.owner_id, NEW.id);
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.owner_id IS DISTINCT FROM NEW.owner_id THEN
        IF OLD.owner_id IS NOT NULL AND is_won_stage(OLD.etapa) THEN
            PERFORM public.recompute_seller_deal_value_tier_badges_usd(OLD.owner_id, OLD.id);
        END IF;
        IF NEW.owner_id IS NOT NULL AND is_won_stage(NEW.etapa) THEN
            PERFORM public.recompute_seller_deal_value_tier_badges_usd(NEW.owner_id, NEW.id);
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.etapa IS DISTINCT FROM NEW.etapa
       OR OLD.valor_real_cierre IS DISTINCT FROM NEW.valor_real_cierre THEN
        IF NEW.owner_id IS NOT NULL AND (is_won_stage(OLD.etapa) OR is_won_stage(NEW.etapa)) THEN
            PERFORM public.recompute_seller_deal_value_tier_badges_usd(NEW.owner_id, NEW.id);
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

UPDATE seller_special_badges
SET badge_label = CASE badge_key
    WHEN 'value_1k_2k' THEN 'Mensualidad 1k'
    WHEN 'value_2k_5k' THEN 'Mensualidad 2k'
    WHEN 'value_5k_10k' THEN 'Mensualidad 5k'
    WHEN 'value_10k_100k' THEN 'Mensualidad 10k'
    WHEN 'value_10k_plus' THEN 'Mensualidad 10k'
    ELSE badge_label
END
WHERE badge_type = 'deal_value_tier';

UPDATE seller_special_badge_events
SET badge_label = CASE badge_key
    WHEN 'value_1k_2k' THEN 'Mensualidad 1k'
    WHEN 'value_2k_5k' THEN 'Mensualidad 2k'
    WHEN 'value_5k_10k' THEN 'Mensualidad 5k'
    WHEN 'value_10k_100k' THEN 'Mensualidad 10k'
    WHEN 'value_10k_plus' THEN 'Mensualidad 10k'
    ELSE badge_label
END
WHERE badge_type = 'deal_value_tier';

COMMIT;
