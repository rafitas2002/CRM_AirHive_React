-- Add new special badges:
-- 1) seniority_years (unlocks at 1 year and levels up yearly)
-- 2) closure_milestone (10 / 20 / 50 closed companies)
-- 3) reliability_score (unlocks at 80% reliability)

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

-- Keep special badges fresh when reliability data or start date changes.
CREATE OR REPLACE FUNCTION trg_refresh_special_badges_from_clientes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.owner_id IS NOT NULL THEN
            PERFORM recompute_seller_special_badges(NEW.owner_id, NEW.id);
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF (OLD.owner_id IS DISTINCT FROM NEW.owner_id) OR (OLD.forecast_logloss IS DISTINCT FROM NEW.forecast_logloss) THEN
            IF OLD.owner_id IS NOT NULL THEN
                PERFORM recompute_seller_special_badges(OLD.owner_id, NEW.id);
            END IF;
            IF NEW.owner_id IS NOT NULL THEN
                PERFORM recompute_seller_special_badges(NEW.owner_id, NEW.id);
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF OLD.owner_id IS NOT NULL THEN
            PERFORM recompute_seller_special_badges(OLD.owner_id, OLD.id);
        END IF;
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_clientes_refresh_special_badges ON clientes;
CREATE TRIGGER trg_clientes_refresh_special_badges
AFTER INSERT OR UPDATE OR DELETE ON clientes
FOR EACH ROW
EXECUTE FUNCTION trg_refresh_special_badges_from_clientes();

CREATE OR REPLACE FUNCTION trg_refresh_special_badges_from_employee_profiles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.user_id IS NOT NULL THEN
            PERFORM recompute_seller_special_badges(NEW.user_id, NULL);
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF (OLD.user_id IS DISTINCT FROM NEW.user_id) OR (OLD.start_date IS DISTINCT FROM NEW.start_date) THEN
            IF OLD.user_id IS NOT NULL THEN
                PERFORM recompute_seller_special_badges(OLD.user_id, NULL);
            END IF;
            IF NEW.user_id IS NOT NULL THEN
                PERFORM recompute_seller_special_badges(NEW.user_id, NULL);
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF OLD.user_id IS NOT NULL THEN
            PERFORM recompute_seller_special_badges(OLD.user_id, NULL);
        END IF;
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_employee_profiles_refresh_special_badges ON employee_profiles;
CREATE TRIGGER trg_employee_profiles_refresh_special_badges
AFTER INSERT OR UPDATE OR DELETE ON employee_profiles
FOR EACH ROW
EXECUTE FUNCTION trg_refresh_special_badges_from_employee_profiles();

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
            'reliability_score'
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
            'reliability_score'
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
            'reliability_score'
        )
    );

INSERT INTO badge_special_level_config (badge_type, level, min_progress)
VALUES
    -- Seniority: dynamic yearly levels (base unlock threshold)
    ('seniority_years', 1, 1),
    -- Closure milestones
    ('closure_milestone', 1, 10),
    ('closure_milestone', 2, 20),
    ('closure_milestone', 3, 50),
    -- Reliability score threshold
    ('reliability_score', 1, 80)
ON CONFLICT (badge_type, level) DO NOTHING;

CREATE OR REPLACE FUNCTION recompute_seller_special_badges(
    p_seller_id UUID,
    p_source_lead_id BIGINT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    rec RECORD;
    v_new_level INTEGER;
    v_old_level INTEGER;
    v_next_threshold INTEGER;
    lvl INTEGER;
BEGIN
    IF p_seller_id IS NULL THEN
        RETURN;
    END IF;

    CREATE TEMP TABLE IF NOT EXISTS tmp_seller_special_badges (
        badge_type TEXT NOT NULL,
        badge_key TEXT NOT NULL,
        badge_label TEXT NOT NULL,
        progress_count INTEGER NOT NULL
    ) ON COMMIT DROP;

    TRUNCATE TABLE tmp_seller_special_badges;

    -- Company size badges
    INSERT INTO tmp_seller_special_badges (badge_type, badge_key, badge_label, progress_count)
    SELECT
        'company_size',
        'size_' || e.tamano::TEXT,
        'Tamaño de Empresa ' || e.tamano::TEXT,
        COUNT(DISTINCT sc.lead_id)::INTEGER
    FROM seller_badge_closures sc
    JOIN empresas e ON e.id = sc.empresa_id
    WHERE sc.seller_id = p_seller_id
      AND e.tamano IS NOT NULL
    GROUP BY e.tamano;

    -- All company sizes badge (distinct size tiers closed)
    INSERT INTO tmp_seller_special_badges (badge_type, badge_key, badge_label, progress_count)
    SELECT
        'all_company_sizes',
        'all_sizes',
        'Todos los Tamaños',
        COUNT(DISTINCT e.tamano)::INTEGER
    FROM seller_badge_closures sc
    JOIN empresas e ON e.id = sc.empresa_id
    WHERE sc.seller_id = p_seller_id
      AND e.tamano IS NOT NULL
    HAVING COUNT(DISTINCT e.tamano) > 0;

    -- City badges
    INSERT INTO tmp_seller_special_badges (badge_type, badge_key, badge_label, progress_count)
    SELECT
        'location_city',
        'city_' || md5(normalize_location_city(e.ubicacion)),
        normalize_location_city(e.ubicacion),
        COUNT(DISTINCT sc.lead_id)::INTEGER
    FROM seller_badge_closures sc
    JOIN empresas e ON e.id = sc.empresa_id
    WHERE sc.seller_id = p_seller_id
      AND normalize_location_city(e.ubicacion) IS NOT NULL
    GROUP BY normalize_location_city(e.ubicacion);

    -- Country badges
    INSERT INTO tmp_seller_special_badges (badge_type, badge_key, badge_label, progress_count)
    SELECT
        'location_country',
        'country_' || md5(normalize_location_country(e.ubicacion)),
        normalize_location_country(e.ubicacion),
        COUNT(DISTINCT sc.lead_id)::INTEGER
    FROM seller_badge_closures sc
    JOIN empresas e ON e.id = sc.empresa_id
    WHERE sc.seller_id = p_seller_id
      AND normalize_location_country(e.ubicacion) IS NOT NULL
    GROUP BY normalize_location_country(e.ubicacion);

    -- Multi-industry badge
    INSERT INTO tmp_seller_special_badges (badge_type, badge_key, badge_label, progress_count)
    SELECT
        'multi_industry',
        'multi_industry',
        'Multi Industria',
        COUNT(DISTINCT sib.industria_id)::INTEGER
    FROM seller_industry_badges sib
    WHERE sib.seller_id = p_seller_id
      AND sib.level > 0
    HAVING COUNT(DISTINCT sib.industria_id) > 0;

    -- Race badges
    INSERT INTO tmp_seller_special_badges (badge_type, badge_key, badge_label, progress_count)
    SELECT 'race_first_place', 'race_first', 'Primer Lugar', COUNT(*)::INTEGER
    FROM race_results rr
    WHERE rr.user_id = p_seller_id
      AND (rr.rank = 1 OR rr.medal = 'gold')
    HAVING COUNT(*) > 0;

    INSERT INTO tmp_seller_special_badges (badge_type, badge_key, badge_label, progress_count)
    SELECT 'race_second_place', 'race_second', 'Segundo Lugar', COUNT(*)::INTEGER
    FROM race_results rr
    WHERE rr.user_id = p_seller_id
      AND (rr.rank = 2 OR rr.medal = 'silver')
    HAVING COUNT(*) > 0;

    INSERT INTO tmp_seller_special_badges (badge_type, badge_key, badge_label, progress_count)
    SELECT 'race_third_place', 'race_third', 'Tercer Lugar', COUNT(*)::INTEGER
    FROM race_results rr
    WHERE rr.user_id = p_seller_id
      AND (rr.rank = 3 OR rr.medal = 'bronze')
    HAVING COUNT(*) > 0;

    INSERT INTO tmp_seller_special_badges (badge_type, badge_key, badge_label, progress_count)
    SELECT
        'race_all_positions',
        'race_podio',
        'Podio Completo',
        (
            CASE WHEN EXISTS (
                SELECT 1 FROM race_results x WHERE x.user_id = p_seller_id AND (x.rank = 1 OR x.medal = 'gold')
            ) THEN 1 ELSE 0 END
            +
            CASE WHEN EXISTS (
                SELECT 1 FROM race_results x WHERE x.user_id = p_seller_id AND (x.rank = 2 OR x.medal = 'silver')
            ) THEN 1 ELSE 0 END
            +
            CASE WHEN EXISTS (
                SELECT 1 FROM race_results x WHERE x.user_id = p_seller_id AND (x.rank = 3 OR x.medal = 'bronze')
            ) THEN 1 ELSE 0 END
        )::INTEGER
    WHERE (
        CASE WHEN EXISTS (
            SELECT 1 FROM race_results x WHERE x.user_id = p_seller_id AND (x.rank = 1 OR x.medal = 'gold')
        ) THEN 1 ELSE 0 END
        +
        CASE WHEN EXISTS (
            SELECT 1 FROM race_results x WHERE x.user_id = p_seller_id AND (x.rank = 2 OR x.medal = 'silver')
        ) THEN 1 ELSE 0 END
        +
        CASE WHEN EXISTS (
            SELECT 1 FROM race_results x WHERE x.user_id = p_seller_id AND (x.rank = 3 OR x.medal = 'bronze')
        ) THEN 1 ELSE 0 END
    ) > 0;

    INSERT INTO tmp_seller_special_badges (badge_type, badge_key, badge_label, progress_count)
    SELECT
        'race_total_trophies',
        'race_10_trophies',
        '10 Trofeos',
        COUNT(*)::INTEGER
    FROM race_results rr
    WHERE rr.user_id = p_seller_id
      AND (rr.rank IN (1, 2, 3) OR rr.medal IN ('gold', 'silver', 'bronze'))
    HAVING COUNT(*) > 0;

    -- Seniority badge (years since employee start_date)
    INSERT INTO tmp_seller_special_badges (badge_type, badge_key, badge_label, progress_count)
    SELECT
        'seniority_years',
        'seniority_years',
        'Antigüedad',
        GREATEST(
            0,
            (
                EXTRACT(YEAR FROM age(NOW(), ep.start_date::timestamp))
            )::INTEGER
        )
    FROM employee_profiles ep
    WHERE ep.user_id = p_seller_id
      AND ep.start_date IS NOT NULL;

    -- Closure milestone badge (total valid closed companies)
    INSERT INTO tmp_seller_special_badges (badge_type, badge_key, badge_label, progress_count)
    SELECT
        'closure_milestone',
        'closure_milestone',
        'Cierre de Empresas',
        COUNT(DISTINCT sc.lead_id)::INTEGER
    FROM seller_badge_closures sc
    WHERE sc.seller_id = p_seller_id
    HAVING COUNT(DISTINCT sc.lead_id) > 0;

    -- Reliability badge (historical score from forecast_logloss)
    INSERT INTO tmp_seller_special_badges (badge_type, badge_key, badge_label, progress_count)
    SELECT
        'reliability_score',
        'reliability_score',
        'Confiabilidad',
        ROUND(
            GREATEST(
                0,
                LEAST(
                    100,
                    (
                        GREATEST(0, 1 - AVG(c.forecast_logloss))
                        * (COUNT(*)::numeric / (COUNT(*)::numeric + 4))
                        * 100
                    )
                )
            )
        )::INTEGER
    FROM clientes c
    WHERE c.owner_id = p_seller_id
      AND c.forecast_logloss IS NOT NULL
    HAVING COUNT(*) > 0;

    FOR rec IN SELECT * FROM tmp_seller_special_badges LOOP
        -- Dynamic level rules for new badges
        IF rec.badge_type = 'seniority_years' THEN
            v_new_level := GREATEST(0, rec.progress_count);
            v_next_threshold := rec.progress_count + 1;
        ELSIF rec.badge_type = 'closure_milestone' THEN
            IF rec.progress_count >= 50 THEN
                v_new_level := 3;
                v_next_threshold := NULL;
            ELSIF rec.progress_count >= 20 THEN
                v_new_level := 2;
                v_next_threshold := 50;
            ELSIF rec.progress_count >= 10 THEN
                v_new_level := 1;
                v_next_threshold := 20;
            ELSE
                v_new_level := 0;
                v_next_threshold := 10;
            END IF;
        ELSIF rec.badge_type = 'reliability_score' THEN
            IF rec.progress_count >= 80 THEN
                v_new_level := 1;
                v_next_threshold := NULL;
            ELSE
                v_new_level := 0;
                v_next_threshold := 80;
            END IF;
        ELSE
            v_new_level := get_special_badge_level(rec.badge_type, rec.progress_count);
            v_next_threshold := get_special_badge_next_threshold(rec.badge_type, v_new_level);
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
                    p_source_lead_id
                )
                ON CONFLICT (seller_id, badge_type, badge_key, level) DO NOTHING;
            END LOOP;
        END IF;
    END LOOP;

    DELETE FROM seller_special_badges ssb
    WHERE ssb.seller_id = p_seller_id
      AND ssb.badge_type IN (
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
          'seniority_years',
          'closure_milestone',
          'reliability_score'
      )
      AND NOT EXISTS (
          SELECT 1
          FROM tmp_seller_special_badges t
          WHERE t.badge_type = ssb.badge_type
            AND t.badge_key = ssb.badge_key
      );
END;
$$;

-- Backfill recompute for sellers with potential activity.
DO $$
DECLARE
    seller_record RECORD;
BEGIN
    FOR seller_record IN (
        SELECT DISTINCT seller_id
        FROM seller_badge_closures
        WHERE seller_id IS NOT NULL

        UNION

        SELECT DISTINCT user_id AS seller_id
        FROM race_results
        WHERE user_id IS NOT NULL

        UNION

        SELECT DISTINCT user_id AS seller_id
        FROM employee_profiles
        WHERE user_id IS NOT NULL

        UNION

        SELECT DISTINCT owner_id AS seller_id
        FROM clientes
        WHERE owner_id IS NOT NULL
    ) LOOP
        PERFORM recompute_seller_special_badges(seller_record.seller_id, NULL);
    END LOOP;
END $$;
