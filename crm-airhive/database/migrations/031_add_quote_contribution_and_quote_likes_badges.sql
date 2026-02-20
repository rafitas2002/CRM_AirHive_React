-- Add quote-based badges:
-- 1) quote_contribution: levels at 1, 5, 10, 25 approved contributions
-- 2) quote_likes_received: levels at 10, 25, 50 likes accumulated across contributed quotes

DO $$
DECLARE
    c RECORD;
BEGIN
    FOR c IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'badge_special_level_config'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%badge_type%'
    LOOP
        EXECUTE format('ALTER TABLE badge_special_level_config DROP CONSTRAINT %I', c.conname);
    END LOOP;

    FOR c IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'seller_special_badges'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%badge_type%'
    LOOP
        EXECUTE format('ALTER TABLE seller_special_badges DROP CONSTRAINT %I', c.conname);
    END LOOP;

    FOR c IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'seller_special_badge_events'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%badge_type%'
    LOOP
        EXECUTE format('ALTER TABLE seller_special_badge_events DROP CONSTRAINT %I', c.conname);
    END LOOP;
END $$;

ALTER TABLE badge_special_level_config
    ADD CONSTRAINT badge_special_level_config_badge_type_check
    CHECK (
        badge_type IN (
            'company_size',
            'location_city',
            'location_country',
            'multi_industry',
            'all_company_sizes',
            'race_first_place',
            'race_second_place',
            'race_third_place',
            'race_all_positions',
            'race_total_trophies',
            'admin_granted',
            'badge_leader',
            'seniority_years',
            'closure_milestone',
            'reliability_score',
            'closing_streak',
            'deal_value_tier',
            'race_points_leader',
            'quote_contribution',
            'quote_likes_received'
        )
    );

ALTER TABLE seller_special_badges
    ADD CONSTRAINT seller_special_badges_badge_type_check
    CHECK (
        badge_type IN (
            'company_size',
            'location_city',
            'location_country',
            'multi_industry',
            'all_company_sizes',
            'race_first_place',
            'race_second_place',
            'race_third_place',
            'race_all_positions',
            'race_total_trophies',
            'admin_granted',
            'badge_leader',
            'seniority_years',
            'closure_milestone',
            'reliability_score',
            'closing_streak',
            'deal_value_tier',
            'race_points_leader',
            'quote_contribution',
            'quote_likes_received'
        )
    );

ALTER TABLE seller_special_badge_events
    ADD CONSTRAINT seller_special_badge_events_badge_type_check
    CHECK (
        badge_type IN (
            'company_size',
            'location_city',
            'location_country',
            'multi_industry',
            'all_company_sizes',
            'race_first_place',
            'race_second_place',
            'race_third_place',
            'race_all_positions',
            'race_total_trophies',
            'admin_granted',
            'badge_leader',
            'seniority_years',
            'closure_milestone',
            'reliability_score',
            'closing_streak',
            'deal_value_tier',
            'race_points_leader',
            'quote_contribution',
            'quote_likes_received'
        )
    );

INSERT INTO badge_special_level_config (badge_type, level, min_progress)
VALUES
    ('quote_contribution', 1, 1),
    ('quote_contribution', 2, 5),
    ('quote_contribution', 3, 10),
    ('quote_contribution', 4, 25),
    ('quote_likes_received', 1, 10),
    ('quote_likes_received', 2, 25),
    ('quote_likes_received', 3, 50)
ON CONFLICT (badge_type, level) DO NOTHING;

CREATE OR REPLACE FUNCTION recompute_seller_quote_badges(
    p_seller_id UUID,
    p_source_quote_id BIGINT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    rec RECORD;
    v_old_level INTEGER;
    v_new_level INTEGER;
    v_next_threshold INTEGER;
    lvl INTEGER;
BEGIN
    IF p_seller_id IS NULL THEN
        RETURN;
    END IF;

    CREATE TEMP TABLE IF NOT EXISTS tmp_seller_quote_badges (
        badge_type TEXT NOT NULL,
        badge_key TEXT NOT NULL,
        badge_label TEXT NOT NULL,
        progress_count INTEGER NOT NULL
    ) ON COMMIT DROP;

    TRUNCATE TABLE tmp_seller_quote_badges;

    INSERT INTO tmp_seller_quote_badges (badge_type, badge_key, badge_label, progress_count)
    SELECT
        'quote_contribution',
        'quote_contribution',
        'Aportación de Frases',
        COUNT(*)::INTEGER
    FROM crm_quotes q
    WHERE q.deleted_at IS NULL
      AND q.contributed_by = p_seller_id
    HAVING COUNT(*) > 0;

    INSERT INTO tmp_seller_quote_badges (badge_type, badge_key, badge_label, progress_count)
    SELECT
        'quote_likes_received',
        'quote_likes_received',
        'Frases con Likes',
        COUNT(*)::INTEGER
    FROM crm_quote_reactions r
    JOIN crm_quotes q ON q.id = r.quote_id
    WHERE q.deleted_at IS NULL
      AND q.contributed_by = p_seller_id
      AND r.reaction_type = 'like'
    HAVING COUNT(*) > 0;

    FOR rec IN SELECT * FROM tmp_seller_quote_badges LOOP
        IF rec.badge_type = 'quote_contribution' THEN
            IF rec.progress_count >= 25 THEN
                v_new_level := 4;
                v_next_threshold := NULL;
            ELSIF rec.progress_count >= 10 THEN
                v_new_level := 3;
                v_next_threshold := 25;
            ELSIF rec.progress_count >= 5 THEN
                v_new_level := 2;
                v_next_threshold := 10;
            ELSIF rec.progress_count >= 1 THEN
                v_new_level := 1;
                v_next_threshold := 5;
            ELSE
                v_new_level := 0;
                v_next_threshold := 1;
            END IF;
        ELSE
            IF rec.progress_count >= 50 THEN
                v_new_level := 3;
                v_next_threshold := NULL;
            ELSIF rec.progress_count >= 25 THEN
                v_new_level := 2;
                v_next_threshold := 50;
            ELSIF rec.progress_count >= 10 THEN
                v_new_level := 1;
                v_next_threshold := 25;
            ELSE
                v_new_level := 0;
                v_next_threshold := 10;
            END IF;
        END IF;

        SELECT COALESCE(level, 0)
        INTO v_old_level
        FROM seller_special_badges
        WHERE seller_id = p_seller_id
          AND badge_type = rec.badge_type
          AND badge_key = rec.badge_key;

        INSERT INTO seller_special_badges (
            seller_id,
            badge_type,
            badge_key,
            badge_label,
            progress_count,
            level,
            next_level_threshold,
            unlocked_at,
            updated_at
        )
        VALUES (
            p_seller_id,
            rec.badge_type,
            rec.badge_key,
            rec.badge_label,
            rec.progress_count,
            v_new_level,
            v_next_threshold,
            CASE WHEN v_new_level > 0 THEN NOW() ELSE NULL END,
            NOW()
        )
        ON CONFLICT (seller_id, badge_type, badge_key)
        DO UPDATE SET
            badge_label = EXCLUDED.badge_label,
            progress_count = EXCLUDED.progress_count,
            level = EXCLUDED.level,
            next_level_threshold = EXCLUDED.next_level_threshold,
            unlocked_at = COALESCE(seller_special_badges.unlocked_at, EXCLUDED.unlocked_at),
            updated_at = NOW();

        IF v_new_level > v_old_level THEN
            FOR lvl IN (v_old_level + 1)..v_new_level LOOP
                INSERT INTO seller_special_badge_events (
                    seller_id,
                    badge_type,
                    badge_key,
                    badge_label,
                    level,
                    event_type,
                    progress_count,
                    source_lead_id
                )
                VALUES (
                    p_seller_id,
                    rec.badge_type,
                    rec.badge_key,
                    rec.badge_label,
                    lvl,
                    CASE WHEN lvl = 1 THEN 'unlocked' ELSE 'upgraded' END,
                    rec.progress_count,
                    p_source_quote_id
                )
                ON CONFLICT (seller_id, badge_type, badge_key, level) DO NOTHING;
            END LOOP;
        END IF;
    END LOOP;

    DELETE FROM seller_special_badges ssb
    WHERE ssb.seller_id = p_seller_id
      AND ssb.badge_type IN ('quote_contribution', 'quote_likes_received')
      AND NOT EXISTS (
          SELECT 1
          FROM tmp_seller_quote_badges t
          WHERE t.badge_type = ssb.badge_type
            AND t.badge_key = ssb.badge_key
      );
END;
$$;

CREATE OR REPLACE FUNCTION trg_refresh_quote_badges_from_quotes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.contributed_by IS NOT NULL THEN
            PERFORM recompute_seller_quote_badges(NEW.contributed_by, NEW.id);
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD.contributed_by IS DISTINCT FROM NEW.contributed_by
           OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at THEN
            IF OLD.contributed_by IS NOT NULL THEN
                PERFORM recompute_seller_quote_badges(OLD.contributed_by, NEW.id);
            END IF;
            IF NEW.contributed_by IS NOT NULL THEN
                PERFORM recompute_seller_quote_badges(NEW.contributed_by, NEW.id);
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF OLD.contributed_by IS NOT NULL THEN
            PERFORM recompute_seller_quote_badges(OLD.contributed_by, OLD.id);
        END IF;
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_quotes_refresh_quote_badges ON crm_quotes;
CREATE TRIGGER trg_crm_quotes_refresh_quote_badges
AFTER INSERT OR UPDATE OR DELETE ON crm_quotes
FOR EACH ROW
EXECUTE FUNCTION trg_refresh_quote_badges_from_quotes();

CREATE OR REPLACE FUNCTION trg_refresh_quote_badges_from_reactions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_old_seller UUID;
    v_new_seller UUID;
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        SELECT q.contributed_by INTO v_old_seller
        FROM crm_quotes q
        WHERE q.id = OLD.quote_id;

        IF v_old_seller IS NOT NULL THEN
            PERFORM recompute_seller_quote_badges(v_old_seller, OLD.quote_id);
        END IF;
    END IF;

    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        SELECT q.contributed_by INTO v_new_seller
        FROM crm_quotes q
        WHERE q.id = NEW.quote_id;

        IF v_new_seller IS NOT NULL THEN
            PERFORM recompute_seller_quote_badges(v_new_seller, NEW.quote_id);
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_quote_reactions_refresh_quote_badges ON crm_quote_reactions;
CREATE TRIGGER trg_crm_quote_reactions_refresh_quote_badges
AFTER INSERT OR UPDATE OR DELETE ON crm_quote_reactions
FOR EACH ROW
EXECUTE FUNCTION trg_refresh_quote_badges_from_reactions();

-- Normalize historical quotes that only stored contributor name.
UPDATE crm_quotes q
SET contributed_by = p.id
FROM profiles p
WHERE q.contributed_by IS NULL
  AND q.deleted_at IS NULL
  AND lower(trim(COALESCE(q.contributed_by_name, ''))) = lower(trim(COALESCE(p.full_name, '')));

-- Backfill existing contributors to grant historical levels and events.
DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN (
        SELECT DISTINCT q.contributed_by AS seller_id
        FROM crm_quotes q
        WHERE q.contributed_by IS NOT NULL
        UNION
        SELECT DISTINCT q.contributed_by AS seller_id
        FROM crm_quote_reactions r
        JOIN crm_quotes q ON q.id = r.quote_id
        WHERE q.contributed_by IS NOT NULL
    ) LOOP
        PERFORM recompute_seller_quote_badges(rec.seller_id, NULL);
    END LOOP;
END $$;
