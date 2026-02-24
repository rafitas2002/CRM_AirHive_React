-- Rework industry badge progression to 8 tiers (visual + functional alignment).
-- New thresholds requested:
-- L1=1, L2=3, L3=5, L4=8, L5=12, L6=20, L7=30, L8=50
--
-- This migration updates the source-of-truth config table (`badge_level_config`)
-- and recomputes current seller industry badges so the profile shows the correct
-- evolved badge state. Existing event generation logic remains DB-first.

BEGIN;

DELETE FROM badge_level_config;

INSERT INTO badge_level_config (level, min_closures)
VALUES
    (1, 1),
    (2, 3),
    (3, 5),
    (4, 8),
    (5, 12),
    (6, 20),
    (7, 30),
    (8, 50);

-- Recompute all known seller/industry pairs from current badge rows and badge closures.
DO $$
DECLARE
    seller_record RECORD;
    industry_record RECORD;
BEGIN
    FOR seller_record IN (
        SELECT DISTINCT seller_id
        FROM (
            SELECT sib.seller_id
            FROM seller_industry_badges sib
            WHERE sib.seller_id IS NOT NULL

            UNION

            SELECT sc.seller_id
            FROM seller_badge_closures sc
            WHERE sc.seller_id IS NOT NULL
        ) s
    ) LOOP
        FOR industry_record IN (
            SELECT DISTINCT industria_id
            FROM (
                SELECT sib.industria_id
                FROM seller_industry_badges sib
                WHERE sib.seller_id = seller_record.seller_id

                UNION

                SELECT ci.industria_id
                FROM seller_badge_closures sc
                JOIN company_industries ci ON ci.empresa_id = sc.empresa_id
                WHERE sc.seller_id = seller_record.seller_id
                  AND ci.industria_id IS NOT NULL

                UNION

                SELECT e.industria_id
                FROM seller_badge_closures sc
                JOIN empresas e ON e.id = sc.empresa_id
                WHERE sc.seller_id = seller_record.seller_id
                  AND e.industria_id IS NOT NULL
            ) x
            WHERE industria_id IS NOT NULL
        ) LOOP
            PERFORM recompute_seller_industry_badge(seller_record.seller_id, industry_record.industria_id, NULL);
        END LOOP;

        -- Keep special badges in sync after industry changes (multi-industry, etc.)
        PERFORM recompute_seller_special_badges(seller_record.seller_id, NULL);
    END LOOP;
END $$;

COMMIT;
