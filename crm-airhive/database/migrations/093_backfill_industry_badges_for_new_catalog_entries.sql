-- Ensure newly added industries (e.g. "Energías Eléctricas") are fully reflected
-- in seller industry badges using the standard 8-level progression.
-- This is safe to run multiple times.

DO $$
DECLARE
    seller_record RECORD;
    industry_record RECORD;
BEGIN
    -- Keep the canonical electric-industry label active if present.
    UPDATE industrias
    SET
        is_active = TRUE
    WHERE lower(trim(name)) IN ('energías eléctricas', 'energias electricas');

    FOR seller_record IN (
        SELECT DISTINCT seller_id
        FROM seller_badge_closures
        WHERE seller_id IS NOT NULL
    ) LOOP
        FOR industry_record IN (
            SELECT DISTINCT industria_id
            FROM (
                SELECT sib.industria_id
                FROM seller_industry_badges sib
                WHERE sib.seller_id = seller_record.seller_id
                  AND sib.industria_id IS NOT NULL
                UNION
                SELECT e.industria_id
                FROM seller_badge_closures sc
                JOIN empresas e
                    ON e.id = sc.empresa_id
                WHERE sc.seller_id = seller_record.seller_id
                  AND e.industria_id IS NOT NULL
            ) merged
        ) LOOP
            PERFORM recompute_seller_industry_badge(
                seller_record.seller_id,
                industry_record.industria_id,
                NULL
            );
        END LOOP;

        PERFORM recompute_seller_special_badges(seller_record.seller_id, NULL);
    END LOOP;
END $$;
