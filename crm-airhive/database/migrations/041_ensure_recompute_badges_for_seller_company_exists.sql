-- Compatibility migration:
-- Some environments don't have recompute_badges_for_seller_company(...) yet.
-- 040 depends on it when updating/deleting won leads.

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

    IF p_empresa_id IS NOT NULL THEN
        FOR rec IN (
            SELECT DISTINCT industria_id
            FROM (
                SELECT ci.industria_id
                FROM company_industries ci
                WHERE ci.empresa_id = p_empresa_id
                  AND ci.industria_id IS NOT NULL
                UNION
                SELECT e.industria_id
                FROM empresas e
                WHERE e.id = p_empresa_id
                  AND e.industria_id IS NOT NULL
            ) x
        ) LOOP
            PERFORM recompute_seller_industry_badge(p_seller_id, rec.industria_id, p_source_lead_id);
        END LOOP;
    END IF;

    PERFORM recompute_seller_special_badges(p_seller_id, p_source_lead_id);
END;
$$;

