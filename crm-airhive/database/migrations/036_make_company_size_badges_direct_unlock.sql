-- Company size badges must map directly to empresa.tamano (1..5).
-- Closing a size 3 company unlocks only badge size_3 (not size_1/size_2).
-- Keep progress_count for analytics, but disable tiered leveling for company_size.

CREATE OR REPLACE FUNCTION get_special_badge_level(p_badge_type TEXT, p_progress INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    IF p_badge_type = 'company_size' THEN
        IF COALESCE(p_progress, 0) > 0 THEN
            RETURN 1;
        END IF;
        RETURN 0;
    END IF;

    RETURN COALESCE((
        SELECT MAX(level)
        FROM badge_special_level_config
        WHERE badge_type = p_badge_type
          AND min_progress <= COALESCE(p_progress, 0)
    ), 0);
END;
$$;

CREATE OR REPLACE FUNCTION get_special_badge_next_threshold(p_badge_type TEXT, p_current_level INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    IF p_badge_type = 'company_size' THEN
        RETURN NULL;
    END IF;

    RETURN (
        SELECT min_progress
        FROM badge_special_level_config
        WHERE badge_type = p_badge_type
          AND level = COALESCE(p_current_level, 0) + 1
        LIMIT 1
    );
END;
$$;

-- Recompute current sellers so existing rows reflect direct company-size unlock behavior.
DO $$
DECLARE
    seller_record RECORD;
BEGIN
    FOR seller_record IN (
        SELECT DISTINCT seller_id
        FROM seller_special_badges
        WHERE seller_id IS NOT NULL

        UNION

        SELECT DISTINCT owner_id AS seller_id
        FROM clientes
        WHERE owner_id IS NOT NULL
    ) LOOP
        PERFORM recompute_seller_special_badges(seller_record.seller_id, NULL);
    END LOOP;
END $$;
