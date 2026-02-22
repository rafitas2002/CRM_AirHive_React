-- Hotfix:
-- 039 introduced a NOT FOUND check after reading seller_badge_closures.
-- For first-time won leads (no prior closure row), FOUND became false and the
-- function returned early, skipping closure upsert and industry/company_size recompute.
-- This migration fixes that logic and runs a global repair/recompute.

CREATE OR REPLACE FUNCTION refresh_seller_badges_for_lead(p_lead_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_seller_id UUID;
    v_empresa_id UUID;
    v_etapa TEXT;
    v_prev_seller_id UUID;
    v_prev_empresa_id UUID;
    v_lead_exists BOOLEAN := FALSE;
    rec RECORD;
BEGIN
    SELECT owner_id, empresa_id, etapa
    INTO v_seller_id, v_empresa_id, v_etapa
    FROM clientes
    WHERE id = p_lead_id;
    v_lead_exists := FOUND;

    SELECT seller_id, empresa_id
    INTO v_prev_seller_id, v_prev_empresa_id
    FROM seller_badge_closures
    WHERE lead_id = p_lead_id;

    -- If lead is missing or not a valid won closure, purge stale closure and recompute old owner.
    IF NOT v_lead_exists
       OR v_seller_id IS NULL
       OR v_empresa_id IS NULL
       OR NOT is_won_stage(v_etapa)
    THEN
        DELETE FROM seller_badge_closures
        WHERE lead_id = p_lead_id;

        IF v_prev_seller_id IS NOT NULL THEN
            PERFORM recompute_badges_for_seller_company(v_prev_seller_id, v_prev_empresa_id, p_lead_id);
        END IF;

        RETURN;
    END IF;

    -- Upsert canonical closure row from lead current owner/company.
    INSERT INTO seller_badge_closures (lead_id, seller_id, empresa_id, closed_at)
    VALUES (p_lead_id, v_seller_id, v_empresa_id, NOW())
    ON CONFLICT (lead_id)
    DO UPDATE SET
        seller_id = EXCLUDED.seller_id,
        empresa_id = EXCLUDED.empresa_id,
        closed_at = EXCLUDED.closed_at;

    -- If closure moved across seller/company, recompute old one to remove inherited badges.
    IF v_prev_seller_id IS NOT NULL
       AND (
           v_prev_seller_id IS DISTINCT FROM v_seller_id
           OR v_prev_empresa_id IS DISTINCT FROM v_empresa_id
       )
    THEN
        PERFORM recompute_badges_for_seller_company(v_prev_seller_id, v_prev_empresa_id, p_lead_id);
    END IF;

    -- Recompute current owner/company badges.
    PERFORM recompute_badges_for_seller_company(v_seller_id, v_empresa_id, p_lead_id);

    -- Keep legacy behavior of touching all industries linked to company.
    FOR rec IN (
        SELECT DISTINCT industria_id
        FROM (
            SELECT ci.industria_id
            FROM company_industries ci
            WHERE ci.empresa_id = v_empresa_id
              AND ci.industria_id IS NOT NULL
            UNION
            SELECT e.industria_id
            FROM empresas e
            WHERE e.id = v_empresa_id
              AND e.industria_id IS NOT NULL
        ) x
    ) LOOP
        PERFORM recompute_seller_industry_badge(v_seller_id, rec.industria_id, p_lead_id);
    END LOOP;
END;
$$;

-- Global repair after the bug:
-- 1) remove stale closures
-- 2) restore canonical closures from won leads
-- 3) recompute all sellers
DO $$
DECLARE
    seller_record RECORD;
    industry_record RECORD;
BEGIN
    DELETE FROM seller_badge_closures sbc
    WHERE NOT EXISTS (
        SELECT 1
        FROM clientes c
        WHERE c.id = sbc.lead_id
          AND c.owner_id = sbc.seller_id
          AND c.empresa_id = sbc.empresa_id
          AND is_won_stage(c.etapa)
    );

    INSERT INTO seller_badge_closures (lead_id, seller_id, empresa_id, closed_at)
    SELECT
        c.id,
        c.owner_id,
        c.empresa_id,
        COALESCE(c.created_at, NOW())
    FROM clientes c
    WHERE c.owner_id IS NOT NULL
      AND c.empresa_id IS NOT NULL
      AND is_won_stage(c.etapa)
    ON CONFLICT (lead_id)
    DO UPDATE SET
        seller_id = EXCLUDED.seller_id,
        empresa_id = EXCLUDED.empresa_id,
        closed_at = EXCLUDED.closed_at;

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

        PERFORM recompute_seller_special_badges(seller_record.seller_id, NULL);
    END LOOP;
END $$;

