-- Keep lead-linked badges consistent when a won lead is deleted
-- or when a lead stops being a valid won closure for badges.

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

CREATE OR REPLACE FUNCTION trg_refresh_badges_on_lead_win()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    old_won BOOLEAN := FALSE;
    new_won BOOLEAN := FALSE;
BEGIN
    IF TG_OP = 'DELETE' THEN
        old_won := is_won_stage(OLD.etapa) AND OLD.owner_id IS NOT NULL AND OLD.empresa_id IS NOT NULL;

        IF old_won THEN
            DELETE FROM seller_badge_closures
            WHERE lead_id = OLD.id;

            PERFORM recompute_badges_for_seller_company(OLD.owner_id, OLD.empresa_id, OLD.id);
        END IF;

        RETURN OLD;
    END IF;

    IF TG_OP = 'INSERT' THEN
        new_won := is_won_stage(NEW.etapa) AND NEW.owner_id IS NOT NULL AND NEW.empresa_id IS NOT NULL;

        IF new_won THEN
            PERFORM refresh_seller_badges_for_lead(NEW.id);
        END IF;

        RETURN NEW;
    END IF;

    old_won := is_won_stage(OLD.etapa) AND OLD.owner_id IS NOT NULL AND OLD.empresa_id IS NOT NULL;
    new_won := is_won_stage(NEW.etapa) AND NEW.owner_id IS NOT NULL AND NEW.empresa_id IS NOT NULL;

    IF old_won AND (
        NOT new_won
        OR OLD.owner_id IS DISTINCT FROM NEW.owner_id
        OR OLD.empresa_id IS DISTINCT FROM NEW.empresa_id
    ) THEN
        DELETE FROM seller_badge_closures
        WHERE lead_id = OLD.id;

        PERFORM recompute_badges_for_seller_company(OLD.owner_id, OLD.empresa_id, NEW.id);
    END IF;

    IF new_won THEN
        PERFORM refresh_seller_badges_for_lead(NEW.id);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clientes_refresh_badges_on_win ON clientes;
CREATE TRIGGER clientes_refresh_badges_on_win
AFTER INSERT OR UPDATE OF etapa, owner_id, empresa_id OR DELETE
ON clientes
FOR EACH ROW
EXECUTE FUNCTION trg_refresh_badges_on_lead_win();

