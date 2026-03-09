-- Enforce monthly semantics for deal_value_tier badges:
-- - Progress counts only won leads with real close value in current UTC month.
-- - Upgrades/unlocks are only accepted when source lead belongs to same tier and month.

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
    v_month_start_utc TIMESTAMPTZ;
    v_month_end_utc TIMESTAMPTZ;
    lvl INTEGER;
BEGIN
    IF p_seller_id IS NULL THEN
        RETURN;
    END IF;

    -- Prevent recursive normalization trigger loops while this recompute writes rows.
    PERFORM set_config('airhive.deal_value_recompute_running', '1', true);

    v_month_start_utc := (date_trunc('month', timezone('UTC', now())) AT TIME ZONE 'UTC');
    v_month_end_utc := ((date_trunc('month', timezone('UTC', now())) + interval '1 month') AT TIME ZONE 'UTC');

    CREATE TEMP TABLE IF NOT EXISTS tmp_deal_value_tier_badges_usd (
        badge_type TEXT NOT NULL,
        badge_key TEXT NOT NULL,
        badge_label TEXT NOT NULL,
        progress_count INTEGER NOT NULL
    ) ON COMMIT DROP;

    -- DELETE is safe under re-entrant trigger contexts; TRUNCATE can fail with SQLSTATE 55006.
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
      AND c.closed_at_real IS NOT NULL
      AND c.closed_at_real >= v_month_start_utc
      AND c.closed_at_real < v_month_end_utc
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
      AND c.closed_at_real IS NOT NULL
      AND c.closed_at_real >= v_month_start_utc
      AND c.closed_at_real < v_month_end_utc
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
      AND c.closed_at_real IS NOT NULL
      AND c.closed_at_real >= v_month_start_utc
      AND c.closed_at_real < v_month_end_utc
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
      AND c.closed_at_real IS NOT NULL
      AND c.closed_at_real >= v_month_start_utc
      AND c.closed_at_real < v_month_end_utc
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
                  AND c.closed_at_real IS NOT NULL
                  AND c.closed_at_real >= v_month_start_utc
                  AND c.closed_at_real < v_month_end_utc
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

    PERFORM set_config('airhive.deal_value_recompute_running', '0', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_normalize_deal_value_tier_badges_after_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_seller_id UUID;
    v_badge_type TEXT;
BEGIN
    IF COALESCE(current_setting('airhive.deal_value_recompute_running', true), '0') = '1' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF pg_trigger_depth() > 1 THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    v_seller_id := COALESCE(NEW.seller_id, OLD.seller_id);
    v_badge_type := COALESCE(NEW.badge_type, OLD.badge_type);

    IF v_badge_type = 'deal_value_tier' AND v_seller_id IS NOT NULL THEN
        PERFORM public.recompute_seller_deal_value_tier_badges_usd(v_seller_id, NULL);
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_seller_special_badges_normalize_deal_value_tier_after_write ON seller_special_badges;
CREATE TRIGGER trg_seller_special_badges_normalize_deal_value_tier_after_write
AFTER INSERT OR UPDATE OR DELETE
ON seller_special_badges
FOR EACH ROW
EXECUTE FUNCTION public.trg_normalize_deal_value_tier_badges_after_write();

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
       OR OLD.valor_real_cierre IS DISTINCT FROM NEW.valor_real_cierre
       OR OLD.closed_at_real IS DISTINCT FROM NEW.closed_at_real THEN
        IF NEW.owner_id IS NOT NULL AND (is_won_stage(OLD.etapa) OR is_won_stage(NEW.etapa)) THEN
            PERFORM public.recompute_seller_deal_value_tier_badges_usd(NEW.owner_id, NEW.id);
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- Reconcile data under monthly + strict source semantics.
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
        WITH params AS (
            SELECT
                (date_trunc('month', timezone('UTC', now())) AT TIME ZONE 'UTC') AS month_start_utc,
                ((date_trunc('month', timezone('UTC', now())) + interval '1 month') AT TIME ZONE 'UTC') AS month_end_utc
        ),
        qualified AS (
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
            CROSS JOIN params p
            WHERE c.owner_id IS NOT NULL
              AND is_won_stage(c.etapa)
              AND c.valor_real_cierre IS NOT NULL
              AND c.closed_at_real IS NOT NULL
              AND c.closed_at_real >= p.month_start_utc
              AND c.closed_at_real < p.month_end_utc
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
