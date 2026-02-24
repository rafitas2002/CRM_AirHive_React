-- Normalize special badge progression after writes so functional DB behavior matches
-- the evolution design even if legacy recompute_seller_special_badges(...) still contains
-- hardcoded levels for some badge types (closure_milestone/company_size/deal_value_tier).
--
-- This fixes cases like closure_milestone still requiring 10 closures for level 1 even
-- after updating badge_special_level_config.

BEGIN;

CREATE OR REPLACE FUNCTION normalize_special_badge_progression_row(
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

CREATE OR REPLACE FUNCTION trg_normalize_special_badge_progression_after_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_seller_id UUID;
    v_badge_type TEXT;
    v_badge_key TEXT;
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    v_seller_id := COALESCE(NEW.seller_id, OLD.seller_id);
    v_badge_type := COALESCE(NEW.badge_type, OLD.badge_type);
    v_badge_key := COALESCE(NEW.badge_key, OLD.badge_key);

    IF v_badge_type IN ('closure_milestone', 'company_size', 'deal_value_tier') THEN
        PERFORM normalize_special_badge_progression_row(v_seller_id, v_badge_type, v_badge_key, NULL);
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_seller_special_badges_normalize_progression_after_write ON seller_special_badges;
CREATE TRIGGER trg_seller_special_badges_normalize_progression_after_write
AFTER INSERT OR UPDATE OR DELETE
ON seller_special_badges
FOR EACH ROW
EXECUTE FUNCTION trg_normalize_special_badge_progression_after_write();

-- Backfill all existing rows for the affected badge types.
DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN (
        SELECT seller_id, badge_type, badge_key
        FROM seller_special_badges
        WHERE badge_type IN ('closure_milestone', 'company_size', 'deal_value_tier')
    ) LOOP
        PERFORM normalize_special_badge_progression_row(rec.seller_id, rec.badge_type, rec.badge_key, NULL);
    END LOOP;
END $$;

COMMIT;
