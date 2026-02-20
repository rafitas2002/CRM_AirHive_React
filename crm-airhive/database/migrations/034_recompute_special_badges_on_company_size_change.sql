-- Keep company size badges directly linked to empresa.tamano (1..5).
-- If company size changes, recompute special badges for sellers who closed that company.

CREATE OR REPLACE FUNCTION trg_refresh_special_badges_from_company_size_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    seller_record RECORD;
BEGIN
    IF TG_OP <> 'UPDATE' THEN
        RETURN NEW;
    END IF;

    IF OLD.tamano IS NOT DISTINCT FROM NEW.tamano THEN
        RETURN NEW;
    END IF;

    FOR seller_record IN (
        SELECT DISTINCT sc.seller_id
        FROM seller_badge_closures sc
        WHERE sc.empresa_id = NEW.id
          AND sc.seller_id IS NOT NULL
    ) LOOP
        PERFORM recompute_seller_special_badges(seller_record.seller_id, NULL);
    END LOOP;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_empresas_refresh_special_badges_on_size_change ON empresas;
CREATE TRIGGER trg_empresas_refresh_special_badges_on_size_change
AFTER UPDATE OF tamano ON empresas
FOR EACH ROW
EXECUTE FUNCTION trg_refresh_special_badges_from_company_size_change();

