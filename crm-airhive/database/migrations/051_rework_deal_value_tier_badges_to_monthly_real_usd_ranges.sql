-- Rework deal_value_tier badges to monthly real value (USD) ranges.
-- New exclusive ranges (based ONLY on clientes.valor_real_cierre, won leads):
-- 1,000-1,999 · 2,000-4,999 · 5,000-9,999 · 10,000-100,000
--
-- This migration adds a focused recompute path for deal_value_tier so we do not need to
-- replace the larger historical recompute_seller_special_badges(...) function.

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

    FOR rec IN
        SELECT * FROM tmp_deal_value_tier_badges_usd
    LOOP
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

        v_new_level := 1;
        v_next_threshold := NULL;

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
            COALESCE(v_prev_unlocked_at, NOW()),
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

        IF v_new_level > COALESCE(v_old_level, 0) THEN
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
                1,
                'unlocked',
                rec.progress_count,
                p_source_lead_id
            )
            ON CONFLICT (seller_id, badge_type, badge_key, level) DO NOTHING;
        END IF;
    END LOOP;

    -- Remove stale/legacy deal_value_tier rows (including old 100K/500K/1M keys).
    DELETE FROM seller_special_badges ssb
    WHERE ssb.seller_id = p_seller_id
      AND ssb.badge_type = 'deal_value_tier'
      AND ssb.badge_key NOT IN (
          SELECT t.badge_key
          FROM tmp_deal_value_tier_badges_usd t
      );
END;
$$;

CREATE OR REPLACE FUNCTION trg_recompute_deal_value_tier_badges_from_clientes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM recompute_seller_deal_value_tier_badges_usd(OLD.owner_id, OLD.id);
        RETURN OLD;
    END IF;

    IF TG_OP = 'INSERT' THEN
        PERFORM recompute_seller_deal_value_tier_badges_usd(NEW.owner_id, NEW.id);
        RETURN NEW;
    END IF;

    IF OLD.owner_id IS DISTINCT FROM NEW.owner_id THEN
        PERFORM recompute_seller_deal_value_tier_badges_usd(OLD.owner_id, OLD.id);
        PERFORM recompute_seller_deal_value_tier_badges_usd(NEW.owner_id, NEW.id);
        RETURN NEW;
    END IF;

    IF OLD.etapa IS DISTINCT FROM NEW.etapa
       OR OLD.valor_real_cierre IS DISTINCT FROM NEW.valor_real_cierre THEN
        PERFORM recompute_seller_deal_value_tier_badges_usd(NEW.owner_id, NEW.id);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clientes_recompute_deal_value_tier_badges_usd ON clientes;
CREATE TRIGGER trg_clientes_recompute_deal_value_tier_badges_usd
AFTER INSERT OR UPDATE OR DELETE
ON clientes
FOR EACH ROW
EXECUTE FUNCTION trg_recompute_deal_value_tier_badges_from_clientes();

CREATE OR REPLACE FUNCTION trg_normalize_deal_value_tier_badges_after_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_seller_id UUID;
    v_badge_type TEXT;
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    v_seller_id := COALESCE(NEW.seller_id, OLD.seller_id);
    v_badge_type := COALESCE(NEW.badge_type, OLD.badge_type);

    IF v_badge_type = 'deal_value_tier' THEN
        PERFORM recompute_seller_deal_value_tier_badges_usd(v_seller_id, NULL);
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_seller_special_badges_normalize_deal_value_tier_after_write ON seller_special_badges;
CREATE TRIGGER trg_seller_special_badges_normalize_deal_value_tier_after_write
AFTER INSERT OR UPDATE OR DELETE
ON seller_special_badges
FOR EACH ROW
EXECUTE FUNCTION trg_normalize_deal_value_tier_badges_after_write();

-- Backfill for all known sellers and remove legacy 100K/500K/1M rows.
DO $$
DECLARE
    seller_record RECORD;
BEGIN
    FOR seller_record IN (
        SELECT DISTINCT id AS seller_id FROM profiles WHERE id IS NOT NULL
        UNION
        SELECT DISTINCT owner_id AS seller_id FROM clientes WHERE owner_id IS NOT NULL
        UNION
        SELECT DISTINCT seller_id FROM seller_special_badges WHERE seller_id IS NOT NULL
    ) LOOP
        PERFORM recompute_seller_deal_value_tier_badges_usd(seller_record.seller_id, NULL);
    END LOOP;
END $$;
