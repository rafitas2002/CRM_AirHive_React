-- Add activity badges:
-- 1) prelead_registered  : 1 / 25 / 100 / 300
-- 2) lead_registered     : 1 / 5 / 15 / 50
-- 3) meeting_completed   : 1 / 10 / 25 / 50
--
-- Also performs:
-- - historical backfill/recompute for all sellers (generates events => popup/notifs)
-- - quote contributor normalization + quote badge recompute (fixes legacy/manual quote contributions)

DO $$
DECLARE
    c RECORD;
BEGIN
    -- Drop existing badge_type check constraints dynamically before recreating with expanded list.
    FOR c IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'badge_special_level_config'::regclass
          AND pg_get_constraintdef(oid) ILIKE '%badge_type%'
    LOOP
        EXECUTE format('ALTER TABLE badge_special_level_config DROP CONSTRAINT %I', c.conname);
    END LOOP;

    FOR c IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'seller_special_badges'::regclass
          AND pg_get_constraintdef(oid) ILIKE '%badge_type%'
    LOOP
        EXECUTE format('ALTER TABLE seller_special_badges DROP CONSTRAINT %I', c.conname);
    END LOOP;

    FOR c IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'seller_special_badge_events'::regclass
          AND pg_get_constraintdef(oid) ILIKE '%badge_type%'
    LOOP
        EXECUTE format('ALTER TABLE seller_special_badge_events DROP CONSTRAINT %I', c.conname);
    END LOOP;
END $$;

-- Hardening for schema drift:
-- some environments have a wrong UNIQUE on seller_special_badge_events
-- over (seller_id, badge_type, badge_key) instead of including level.
DO $$
DECLARE
    c RECORD;
BEGIN
    FOR c IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'seller_special_badge_events'::regclass
          AND contype = 'u'
          AND pg_get_constraintdef(oid) ILIKE 'UNIQUE (seller_id, badge_type, badge_key)%'
          AND pg_get_constraintdef(oid) NOT ILIKE '%level%'
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
            'admin_granted',
            'seniority_years',
            'closure_milestone',
            'reliability_score',
            'closing_streak',
            'deal_value_tier',
            'race_first_place',
            'race_second_place',
            'race_third_place',
            'race_all_positions',
            'race_total_trophies',
            'race_points_leader',
            'quote_contribution',
            'quote_likes_received',
            'badge_leader',
            'prelead_registered',
            'lead_registered',
            'meeting_completed'
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
            'admin_granted',
            'seniority_years',
            'closure_milestone',
            'reliability_score',
            'closing_streak',
            'deal_value_tier',
            'race_first_place',
            'race_second_place',
            'race_third_place',
            'race_all_positions',
            'race_total_trophies',
            'race_points_leader',
            'quote_contribution',
            'quote_likes_received',
            'badge_leader',
            'prelead_registered',
            'lead_registered',
            'meeting_completed'
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
            'admin_granted',
            'seniority_years',
            'closure_milestone',
            'reliability_score',
            'closing_streak',
            'deal_value_tier',
            'race_first_place',
            'race_second_place',
            'race_third_place',
            'race_all_positions',
            'race_total_trophies',
            'race_points_leader',
            'quote_contribution',
            'quote_likes_received',
            'badge_leader',
            'prelead_registered',
            'lead_registered',
            'meeting_completed'
        )
    );

-- Hardening: some environments may be missing the unique indexes/constraints used by
-- ON CONFLICT in recompute paths (schema drift from earlier manual changes).
-- Ensure the conflict targets are inferable before any backfill runs.
CREATE UNIQUE INDEX IF NOT EXISTS idx_badge_special_level_config_unique_type_level
    ON badge_special_level_config (badge_type, level);

CREATE UNIQUE INDEX IF NOT EXISTS idx_seller_special_badges_unique_key
    ON seller_special_badges (seller_id, badge_type, badge_key);

CREATE UNIQUE INDEX IF NOT EXISTS idx_seller_special_badge_events_unique_level
    ON seller_special_badge_events (seller_id, badge_type, badge_key, level);

INSERT INTO badge_special_level_config (badge_type, level, min_progress)
VALUES
    ('prelead_registered', 1, 1),
    ('prelead_registered', 2, 25),
    ('prelead_registered', 3, 100),
    ('prelead_registered', 4, 300),
    ('lead_registered', 1, 1),
    ('lead_registered', 2, 5),
    ('lead_registered', 3, 15),
    ('lead_registered', 4, 50),
    ('meeting_completed', 1, 1),
    ('meeting_completed', 2, 10),
    ('meeting_completed', 3, 25),
    ('meeting_completed', 4, 50)
ON CONFLICT (badge_type, level) DO NOTHING;

CREATE OR REPLACE FUNCTION recompute_seller_activity_badges(
    p_seller_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    rec RECORD;
    lvl INTEGER;
    v_old_level INTEGER;
    v_new_level INTEGER;
    v_next_threshold INTEGER;
BEGIN
    IF p_seller_id IS NULL THEN
        RETURN;
    END IF;

    CREATE TEMP TABLE IF NOT EXISTS tmp_seller_activity_badges (
        badge_type TEXT NOT NULL,
        badge_key TEXT NOT NULL,
        badge_label TEXT NOT NULL,
        progress_count INTEGER NOT NULL
    ) ON COMMIT DROP;

    TRUNCATE TABLE tmp_seller_activity_badges;

    -- Pre-leads registered by seller (all historical rows currently in pre_leads).
    INSERT INTO tmp_seller_activity_badges (badge_type, badge_key, badge_label, progress_count)
    SELECT
        'prelead_registered',
        'prelead_registered',
        'Pre-Leads Registrados',
        COUNT(*)::INTEGER
    FROM pre_leads pl
    WHERE pl.vendedor_id = p_seller_id
    HAVING COUNT(*) > 0;

    -- Leads registered/owned by seller.
    INSERT INTO tmp_seller_activity_badges (badge_type, badge_key, badge_label, progress_count)
    SELECT
        'lead_registered',
        'lead_registered',
        'Leads Registrados',
        COUNT(*)::INTEGER
    FROM clientes c
    WHERE c.owner_id = p_seller_id
    HAVING COUNT(*) > 0;

    -- Completed meetings (held confirmations) attributed to meeting seller.
    INSERT INTO tmp_seller_activity_badges (badge_type, badge_key, badge_label, progress_count)
    SELECT
        'meeting_completed',
        'meeting_completed',
        'Juntas Completadas',
        COUNT(DISTINCT mc.meeting_id)::INTEGER
    FROM meeting_confirmations mc
    JOIN meetings m ON m.id = mc.meeting_id
    WHERE m.seller_id = p_seller_id
      AND mc.was_held = TRUE
    HAVING COUNT(DISTINCT mc.meeting_id) > 0;

    FOR rec IN SELECT * FROM tmp_seller_activity_badges LOOP
        v_new_level := get_special_badge_level(rec.badge_type, rec.progress_count);
        v_next_threshold := get_special_badge_next_threshold(rec.badge_type, v_new_level);

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
                    NULL
                )
                ON CONFLICT (seller_id, badge_type, badge_key, level) DO NOTHING;
            END LOOP;
        END IF;
    END LOOP;

    DELETE FROM seller_special_badges ssb
    WHERE ssb.seller_id = p_seller_id
      AND ssb.badge_type IN ('prelead_registered', 'lead_registered', 'meeting_completed')
      AND NOT EXISTS (
          SELECT 1
          FROM tmp_seller_activity_badges t
          WHERE t.badge_type = ssb.badge_type
            AND t.badge_key = ssb.badge_key
      );
END;
$$;

CREATE OR REPLACE FUNCTION trg_refresh_activity_badges_from_pre_leads()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM recompute_seller_activity_badges(NEW.vendedor_id);
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD.vendedor_id IS DISTINCT FROM NEW.vendedor_id THEN
            PERFORM recompute_seller_activity_badges(OLD.vendedor_id);
            PERFORM recompute_seller_activity_badges(NEW.vendedor_id);
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        PERFORM recompute_seller_activity_badges(OLD.vendedor_id);
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_pre_leads_refresh_activity_badges ON pre_leads;
CREATE TRIGGER trg_pre_leads_refresh_activity_badges
AFTER INSERT OR UPDATE OF vendedor_id OR DELETE
ON pre_leads
FOR EACH ROW
EXECUTE FUNCTION trg_refresh_activity_badges_from_pre_leads();

CREATE OR REPLACE FUNCTION trg_refresh_activity_badges_from_leads()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM recompute_seller_activity_badges(NEW.owner_id);
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD.owner_id IS DISTINCT FROM NEW.owner_id THEN
            PERFORM recompute_seller_activity_badges(OLD.owner_id);
            PERFORM recompute_seller_activity_badges(NEW.owner_id);
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        PERFORM recompute_seller_activity_badges(OLD.owner_id);
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_clientes_refresh_activity_badges ON clientes;
CREATE TRIGGER trg_clientes_refresh_activity_badges
AFTER INSERT OR UPDATE OF owner_id OR DELETE
ON clientes
FOR EACH ROW
EXECUTE FUNCTION trg_refresh_activity_badges_from_leads();

CREATE OR REPLACE FUNCTION trg_refresh_activity_badges_from_meeting_confirmations()
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
        SELECT m.seller_id INTO v_old_seller
        FROM meetings m
        WHERE m.id = OLD.meeting_id;

        PERFORM recompute_seller_activity_badges(v_old_seller);
    END IF;

    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        SELECT m.seller_id INTO v_new_seller
        FROM meetings m
        WHERE m.id = NEW.meeting_id;

        IF TG_OP = 'UPDATE' AND v_old_seller IS NOT DISTINCT FROM v_new_seller AND OLD.was_held IS NOT DISTINCT FROM NEW.was_held THEN
            RETURN NEW;
        END IF;

        PERFORM recompute_seller_activity_badges(v_new_seller);
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meeting_confirmations_refresh_activity_badges ON meeting_confirmations;
CREATE TRIGGER trg_meeting_confirmations_refresh_activity_badges
AFTER INSERT OR UPDATE OR DELETE
ON meeting_confirmations
FOR EACH ROW
EXECUTE FUNCTION trg_refresh_activity_badges_from_meeting_confirmations();

CREATE OR REPLACE FUNCTION trg_refresh_activity_badges_from_meetings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_has_held BOOLEAN := FALSE;
BEGIN
    IF TG_OP <> 'UPDATE' THEN
        RETURN NEW;
    END IF;

    IF OLD.seller_id IS NOT DISTINCT FROM NEW.seller_id THEN
        RETURN NEW;
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM meeting_confirmations mc
        WHERE mc.meeting_id = NEW.id
          AND mc.was_held = TRUE
    ) INTO v_has_held;

    IF v_has_held THEN
        PERFORM recompute_seller_activity_badges(OLD.seller_id);
        PERFORM recompute_seller_activity_badges(NEW.seller_id);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meetings_refresh_activity_badges ON meetings;
CREATE TRIGGER trg_meetings_refresh_activity_badges
AFTER UPDATE OF seller_id
ON meetings
FOR EACH ROW
EXECUTE FUNCTION trg_refresh_activity_badges_from_meetings();

-- Strengthen historical quote attribution (fix legacy/manual contributions not linked to contributed_by).
UPDATE crm_quotes q
SET contributed_by = p.id
FROM profiles p
WHERE q.deleted_at IS NULL
  AND q.contributed_by IS NULL
  AND lower(trim(COALESCE(q.contributed_by_name, ''))) = lower(trim(COALESCE(p.full_name, '')));

UPDATE crm_quotes q
SET contributed_by = p.id
FROM profiles p
WHERE q.deleted_at IS NULL
  AND q.contributed_by IS NULL
  AND lower(trim(COALESCE(q.quote_author, ''))) = lower(trim(COALESCE(p.full_name, '')))
  AND lower(COALESCE(q.quote_source, '')) LIKE '%interna%airhive%';

-- Global backfill: activity badges + quote badges so advanced users receive historical unlock events.
DO $$
DECLARE
    seller_record RECORD;
    has_quote_recompute_two_args BOOLEAN := FALSE;
    has_quote_recompute_one_arg BOOLEAN := FALSE;
BEGIN
    SELECT to_regprocedure('public.recompute_seller_quote_badges(uuid,bigint)') IS NOT NULL
    INTO has_quote_recompute_two_args;

    SELECT to_regprocedure('public.recompute_seller_quote_badges(uuid)') IS NOT NULL
    INTO has_quote_recompute_one_arg;

    FOR seller_record IN (
        SELECT DISTINCT id AS seller_id FROM profiles WHERE id IS NOT NULL
        UNION
        SELECT DISTINCT seller_id FROM seller_special_badges WHERE seller_id IS NOT NULL
        UNION
        SELECT DISTINCT owner_id AS seller_id FROM clientes WHERE owner_id IS NOT NULL
        UNION
        SELECT DISTINCT vendedor_id AS seller_id FROM pre_leads WHERE vendedor_id IS NOT NULL
        UNION
        SELECT DISTINCT seller_id FROM meetings WHERE seller_id IS NOT NULL
        UNION
        SELECT DISTINCT contributed_by AS seller_id FROM crm_quotes WHERE contributed_by IS NOT NULL
    ) LOOP
        PERFORM recompute_seller_activity_badges(seller_record.seller_id);
        IF has_quote_recompute_two_args THEN
            PERFORM recompute_seller_quote_badges(seller_record.seller_id, NULL::BIGINT);
        ELSIF has_quote_recompute_one_arg THEN
            PERFORM recompute_seller_quote_badges(seller_record.seller_id);
        END IF;
    END LOOP;
END $$;
