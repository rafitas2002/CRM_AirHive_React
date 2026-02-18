-- Add race-related special badges:
-- 1) First place trophies
-- 2) Second place trophies
-- 3) Third place trophies
-- 4) Podium complete (at least one of each 1st/2nd/3rd)
-- 5) Total trophies (10)

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
            'race_total_trophies'
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
            'race_total_trophies'
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
            'race_total_trophies'
        )
    );

INSERT INTO badge_special_level_config (badge_type, level, min_progress)
VALUES
    ('race_first_place', 1, 1),
    ('race_first_place', 2, 3),
    ('race_first_place', 3, 5),
    ('race_first_place', 4, 10),
    ('race_second_place', 1, 1),
    ('race_second_place', 2, 3),
    ('race_second_place', 3, 5),
    ('race_second_place', 4, 10),
    ('race_third_place', 1, 1),
    ('race_third_place', 2, 3),
    ('race_third_place', 3, 5),
    ('race_third_place', 4, 10),
    ('race_all_positions', 1, 3),
    ('race_total_trophies', 1, 10)
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

    -- All company sizes badge (distinct size tiers closed).
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

    -- Race badges: first/second/third places by period.
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

    -- Badge for getting trophies in each podium position.
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

    -- Badge for total trophy count.
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

    FOR rec IN SELECT * FROM tmp_seller_special_badges LOOP
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
          'race_total_trophies'
      )
      AND NOT EXISTS (
          SELECT 1
          FROM tmp_seller_special_badges t
          WHERE t.badge_type = ssb.badge_type
            AND t.badge_key = ssb.badge_key
      );
END;
$$;

DO $$
DECLARE
    seller_record RECORD;
BEGIN
    FOR seller_record IN (
        SELECT DISTINCT user_id AS seller_id
        FROM race_results
        WHERE user_id IS NOT NULL
    ) LOOP
        PERFORM recompute_seller_special_badges(seller_record.seller_id, NULL);
    END LOOP;
END $$;
