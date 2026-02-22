-- Force consistency for badges when lead stage/owner/company changes.
-- This trigger does not depend on fragile old/new won checks; it always
-- normalizes seller_badge_closures and recomputes affected sellers.

CREATE OR REPLACE FUNCTION trg_refresh_badges_on_lead_change_strict()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    old_owner UUID;
    old_empresa UUID;
    new_owner UUID;
    new_empresa UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        old_owner := OLD.owner_id;
        old_empresa := OLD.empresa_id;

        DELETE FROM seller_badge_closures
        WHERE lead_id = OLD.id;

        IF old_owner IS NOT NULL THEN
            PERFORM recompute_badges_for_seller_company(old_owner, old_empresa, OLD.id);
        END IF;

        RETURN OLD;
    END IF;

    old_owner := CASE WHEN TG_OP = 'UPDATE' THEN OLD.owner_id ELSE NULL END;
    old_empresa := CASE WHEN TG_OP = 'UPDATE' THEN OLD.empresa_id ELSE NULL END;
    new_owner := NEW.owner_id;
    new_empresa := NEW.empresa_id;

    -- Always reset closure row for this lead first (prevents stale mappings).
    DELETE FROM seller_badge_closures
    WHERE lead_id = NEW.id;

    -- Recreate closure row only when lead is currently won.
    IF new_owner IS NOT NULL
       AND new_empresa IS NOT NULL
       AND is_won_stage(NEW.etapa)
    THEN
        INSERT INTO seller_badge_closures (lead_id, seller_id, empresa_id, closed_at)
        VALUES (NEW.id, new_owner, new_empresa, NOW())
        ON CONFLICT (lead_id)
        DO UPDATE SET
            seller_id = EXCLUDED.seller_id,
            empresa_id = EXCLUDED.empresa_id,
            closed_at = EXCLUDED.closed_at;
    END IF;

    -- Recompute old owner if changed/updated.
    IF old_owner IS NOT NULL THEN
        PERFORM recompute_badges_for_seller_company(old_owner, old_empresa, NEW.id);
    END IF;

    -- Recompute current owner as well.
    IF new_owner IS NOT NULL THEN
        PERFORM recompute_badges_for_seller_company(new_owner, new_empresa, NEW.id);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clientes_refresh_badges_on_win ON clientes;
CREATE TRIGGER clientes_refresh_badges_on_win
AFTER INSERT OR UPDATE OF etapa, owner_id, empresa_id OR DELETE
ON clientes
FOR EACH ROW
EXECUTE FUNCTION trg_refresh_badges_on_lead_change_strict();

-- Safety cleanup for any stale closures and stale active badges.
DELETE FROM seller_badge_closures sbc
WHERE NOT EXISTS (
    SELECT 1
    FROM clientes c
    WHERE c.id = sbc.lead_id
      AND c.owner_id = sbc.seller_id
      AND c.empresa_id = sbc.empresa_id
      AND is_won_stage(c.etapa)
);

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

