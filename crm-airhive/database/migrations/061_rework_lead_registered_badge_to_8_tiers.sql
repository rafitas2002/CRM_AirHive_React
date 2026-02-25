-- Rework "Leads Registrados" (lead_registered) to 8 tiers.
-- Uses the existing recompute_seller_activity_badges(...) function so the functional
-- counting logic remains exactly the same (clientes.owner_id per seller).

BEGIN;

DELETE FROM badge_special_level_config
WHERE badge_type = 'lead_registered';

INSERT INTO badge_special_level_config (badge_type, level, min_progress)
VALUES
    ('lead_registered', 1, 1),
    ('lead_registered', 2, 10),
    ('lead_registered', 3, 25),
    ('lead_registered', 4, 50),
    ('lead_registered', 5, 75),
    ('lead_registered', 6, 100),
    ('lead_registered', 7, 200),
    ('lead_registered', 8, 500);

-- Backfill all affected sellers so current level/next threshold reflects the new config.
DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN (
        SELECT DISTINCT c.owner_id AS seller_id
        FROM clientes c
        WHERE c.owner_id IS NOT NULL
        UNION
        SELECT ssb.seller_id
        FROM seller_special_badges ssb
        WHERE ssb.badge_type = 'lead_registered'
    ) LOOP
        PERFORM recompute_seller_activity_badges(rec.seller_id);
    END LOOP;
END $$;

COMMIT;
