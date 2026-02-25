-- Rework "Juntas Completadas" (meeting_completed) to 8 tiers.
-- Uses the existing recompute_seller_activity_badges(...) function so the functional
-- counting logic remains exactly the same (meeting_confirmations.was_held = true).

BEGIN;

DELETE FROM badge_special_level_config
WHERE badge_type = 'meeting_completed';

INSERT INTO badge_special_level_config (badge_type, level, min_progress)
VALUES
    ('meeting_completed', 1, 1),
    ('meeting_completed', 2, 10),
    ('meeting_completed', 3, 25),
    ('meeting_completed', 4, 50),
    ('meeting_completed', 5, 75),
    ('meeting_completed', 6, 100),
    ('meeting_completed', 7, 200),
    ('meeting_completed', 8, 500);

-- Backfill all affected sellers so current level/next threshold reflects the new config.
DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN (
        SELECT DISTINCT m.seller_id
        FROM meetings m
        WHERE m.seller_id IS NOT NULL
        UNION
        SELECT ssb.seller_id
        FROM seller_special_badges ssb
        WHERE ssb.badge_type = 'meeting_completed'
    ) LOOP
        PERFORM recompute_seller_activity_badges(rec.seller_id);
    END LOOP;
END $$;

COMMIT;
