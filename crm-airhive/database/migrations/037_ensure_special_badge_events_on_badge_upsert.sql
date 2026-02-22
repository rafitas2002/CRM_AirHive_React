-- Ensure special badge events always exist when a special badge is unlocked/upgraded.
-- This guarantees popup/notif feed can react even if a recompute path skipped event insert.

CREATE OR REPLACE FUNCTION ensure_special_badge_event_on_badge_upsert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    has_any_event BOOLEAN := FALSE;
BEGIN
    IF NEW.seller_id IS NULL OR NEW.badge_type IS NULL OR NEW.badge_key IS NULL THEN
        RETURN NEW;
    END IF;

    IF COALESCE(NEW.level, 0) <= 0 THEN
        RETURN NEW;
    END IF;

    -- If event for current level already exists, nothing to do.
    IF EXISTS (
        SELECT 1
        FROM seller_special_badge_events e
        WHERE e.seller_id = NEW.seller_id
          AND e.badge_type = NEW.badge_type
          AND e.badge_key = NEW.badge_key
          AND e.level = NEW.level
    ) THEN
        RETURN NEW;
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM seller_special_badge_events e
        WHERE e.seller_id = NEW.seller_id
          AND e.badge_type = NEW.badge_type
          AND e.badge_key = NEW.badge_key
    )
    INTO has_any_event;

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
        NEW.seller_id,
        NEW.badge_type,
        NEW.badge_key,
        COALESCE(NEW.badge_label, 'Badge especial'),
        NEW.level,
        CASE WHEN has_any_event THEN 'upgraded' ELSE 'unlocked' END,
        GREATEST(1, COALESCE(NEW.progress_count, 1)),
        NULL
    )
    ON CONFLICT (seller_id, badge_type, badge_key, level) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_special_badge_event_on_badge_upsert ON seller_special_badges;
CREATE TRIGGER trg_ensure_special_badge_event_on_badge_upsert
AFTER INSERT OR UPDATE OF level, unlocked_at, progress_count
ON seller_special_badges
FOR EACH ROW
EXECUTE FUNCTION ensure_special_badge_event_on_badge_upsert();

-- Backfill missing event rows for already-unlocked badges.
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
SELECT
    ssb.seller_id,
    ssb.badge_type,
    ssb.badge_key,
    COALESCE(ssb.badge_label, 'Badge especial'),
    ssb.level,
    CASE
        WHEN EXISTS (
            SELECT 1
            FROM seller_special_badge_events prev
            WHERE prev.seller_id = ssb.seller_id
              AND prev.badge_type = ssb.badge_type
              AND prev.badge_key = ssb.badge_key
        ) THEN 'upgraded'
        ELSE 'unlocked'
    END,
    GREATEST(1, COALESCE(ssb.progress_count, 1)),
    NULL
FROM seller_special_badges ssb
WHERE COALESCE(ssb.level, 0) > 0
  AND NOT EXISTS (
      SELECT 1
      FROM seller_special_badge_events e
      WHERE e.seller_id = ssb.seller_id
        AND e.badge_type = ssb.badge_type
        AND e.badge_key = ssb.badge_key
        AND e.level = ssb.level
  )
ON CONFLICT (seller_id, badge_type, badge_key, level) DO NOTHING;
