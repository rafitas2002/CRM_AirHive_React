-- Keep badge notifications/events in sync with current unlocked badges.
-- If a badge is removed (DELETE) or downgraded to level 0, remove its notification events.

CREATE OR REPLACE FUNCTION cleanup_industry_badge_events_on_badge_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM seller_badge_events
        WHERE seller_id = OLD.seller_id
          AND industria_id = OLD.industria_id;
        RETURN OLD;
    END IF;

    IF COALESCE(NEW.level, 0) <= 0 THEN
        DELETE FROM seller_badge_events
        WHERE seller_id = NEW.seller_id
          AND industria_id = NEW.industria_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_industry_badge_events_on_change ON seller_industry_badges;
CREATE TRIGGER trg_cleanup_industry_badge_events_on_change
AFTER UPDATE OF level OR DELETE
ON seller_industry_badges
FOR EACH ROW
EXECUTE FUNCTION cleanup_industry_badge_events_on_badge_change();

CREATE OR REPLACE FUNCTION cleanup_special_badge_events_on_badge_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM seller_special_badge_events
        WHERE seller_id = OLD.seller_id
          AND badge_type = OLD.badge_type
          AND badge_key = OLD.badge_key;
        RETURN OLD;
    END IF;

    IF COALESCE(NEW.level, 0) <= 0 THEN
        DELETE FROM seller_special_badge_events
        WHERE seller_id = NEW.seller_id
          AND badge_type = NEW.badge_type
          AND badge_key = NEW.badge_key;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_special_badge_events_on_change ON seller_special_badges;
CREATE TRIGGER trg_cleanup_special_badge_events_on_change
AFTER UPDATE OF level OR DELETE
ON seller_special_badges
FOR EACH ROW
EXECUTE FUNCTION cleanup_special_badge_events_on_badge_change();

-- Backfill cleanup for stale events already stored from previous tests/flows.
DELETE FROM seller_badge_events sbe
WHERE NOT EXISTS (
    SELECT 1
    FROM seller_industry_badges sib
    WHERE sib.seller_id = sbe.seller_id
      AND sib.industria_id = sbe.industria_id
      AND sib.level > 0
);

DELETE FROM seller_special_badge_events ssbe
WHERE NOT EXISTS (
    SELECT 1
    FROM seller_special_badges ssb
    WHERE ssb.seller_id = ssbe.seller_id
      AND ssb.badge_type = ssbe.badge_type
      AND ssb.badge_key = ssbe.badge_key
      AND ssb.level > 0
);
