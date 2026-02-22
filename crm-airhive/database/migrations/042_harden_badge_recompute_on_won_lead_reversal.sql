-- Harden recompute path when a won lead is reverted/deleted.
-- Fixes cases where an industry/company-size badge can remain stale if the
-- touched company no longer exposes the same industry mapping at recompute time.

CREATE OR REPLACE FUNCTION recompute_badges_for_seller_company(
    p_seller_id UUID,
    p_empresa_id UUID,
    p_source_lead_id BIGINT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    rec RECORD;
BEGIN
    IF p_seller_id IS NULL THEN
        RETURN;
    END IF;

    -- Recompute all currently reachable industries for this seller
    -- (not only industries from p_empresa_id) to prevent stale rows.
    FOR rec IN (
        SELECT DISTINCT industria_id
        FROM (
            -- Industries already present in seller badge rows (for cleanup path).
            SELECT sib.industria_id
            FROM seller_industry_badges sib
            WHERE sib.seller_id = p_seller_id
              AND sib.industria_id IS NOT NULL

            UNION

            -- Industries from seller closures via junction table.
            SELECT ci.industria_id
            FROM seller_badge_closures sc
            JOIN company_industries ci ON ci.empresa_id = sc.empresa_id
            WHERE sc.seller_id = p_seller_id
              AND ci.industria_id IS NOT NULL

            UNION

            -- Industries from seller closures via empresas.industria_id.
            SELECT e.industria_id
            FROM seller_badge_closures sc
            JOIN empresas e ON e.id = sc.empresa_id
            WHERE sc.seller_id = p_seller_id
              AND e.industria_id IS NOT NULL

            UNION

            -- Industries from the specific company passed by trigger.
            SELECT ci2.industria_id
            FROM company_industries ci2
            WHERE p_empresa_id IS NOT NULL
              AND ci2.empresa_id = p_empresa_id
              AND ci2.industria_id IS NOT NULL

            UNION

            SELECT e2.industria_id
            FROM empresas e2
            WHERE p_empresa_id IS NOT NULL
              AND e2.id = p_empresa_id
              AND e2.industria_id IS NOT NULL
        ) x
        WHERE industria_id IS NOT NULL
    ) LOOP
        PERFORM recompute_seller_industry_badge(p_seller_id, rec.industria_id, p_source_lead_id);
    END LOOP;

    PERFORM recompute_seller_special_badges(p_seller_id, p_source_lead_id);
END;
$$;

-- Global recompute so existing stale industry/special badges are corrected.
DO $$
DECLARE
    seller_record RECORD;
BEGIN
    FOR seller_record IN (
        SELECT DISTINCT seller_id
        FROM seller_badge_closures
        WHERE seller_id IS NOT NULL

        UNION

        SELECT DISTINCT owner_id AS seller_id
        FROM clientes
        WHERE owner_id IS NOT NULL

        UNION

        SELECT DISTINCT seller_id
        FROM seller_industry_badges
        WHERE seller_id IS NOT NULL

        UNION

        SELECT DISTINCT seller_id
        FROM seller_special_badges
        WHERE seller_id IS NOT NULL
    ) LOOP
        PERFORM recompute_badges_for_seller_company(seller_record.seller_id, NULL, NULL);
    END LOOP;
END $$;

