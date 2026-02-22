-- Harden special badges recompute:
-- 1) company_size unlocks directly by empresa.tamano (size_1..size_5), level fixed at 1.
-- 2) deal_value_tier stays exclusive by range:
--    100K: [100k, 500k), 500K: [500k, 1M), 1M: [1M, +inf)

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
    v_current_streak INTEGER := 0;
    v_best_streak INTEGER := 0;
    v_last_streak_month DATE;
    v_streak_active BOOLEAN := FALSE;
    v_race_points INTEGER := 0;
    v_top_race_points INTEGER := 0;
    v_is_race_points_leader BOOLEAN := FALSE;
    v_had_race_points_leader BOOLEAN := FALSE;
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

    -- All company sizes badge
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
            CASE WHEN EXISTS (SELECT 1 FROM race_results x WHERE x.user_id = p_seller_id AND (x.rank = 1 OR x.medal = 'gold')) THEN 1 ELSE 0 END
            +
            CASE WHEN EXISTS (SELECT 1 FROM race_results x WHERE x.user_id = p_seller_id AND (x.rank = 2 OR x.medal = 'silver')) THEN 1 ELSE 0 END
            +
            CASE WHEN EXISTS (SELECT 1 FROM race_results x WHERE x.user_id = p_seller_id AND (x.rank = 3 OR x.medal = 'bronze')) THEN 1 ELSE 0 END
        )::INTEGER
    WHERE (
        CASE WHEN EXISTS (SELECT 1 FROM race_results x WHERE x.user_id = p_seller_id AND (x.rank = 1 OR x.medal = 'gold')) THEN 1 ELSE 0 END
        +
        CASE WHEN EXISTS (SELECT 1 FROM race_results x WHERE x.user_id = p_seller_id AND (x.rank = 2 OR x.medal = 'silver')) THEN 1 ELSE 0 END
        +
        CASE WHEN EXISTS (SELECT 1 FROM race_results x WHERE x.user_id = p_seller_id AND (x.rank = 3 OR x.medal = 'bronze')) THEN 1 ELSE 0 END
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

    -- Seniority badge
    INSERT INTO tmp_seller_special_badges (badge_type, badge_key, badge_label, progress_count)
    SELECT
        'seniority_years',
        'seniority_years',
        'Antigüedad',
        GREATEST(0, (EXTRACT(YEAR FROM age(NOW(), ep.start_date::timestamp)))::INTEGER)
    FROM employee_profiles ep
    WHERE ep.user_id = p_seller_id
      AND ep.start_date IS NOT NULL;

    -- Closure milestone badge
    INSERT INTO tmp_seller_special_badges (badge_type, badge_key, badge_label, progress_count)
    SELECT
        'closure_milestone',
        'closure_milestone',
        'Cierre de Empresas',
        COUNT(DISTINCT sc.lead_id)::INTEGER
    FROM seller_badge_closures sc
    WHERE sc.seller_id = p_seller_id
    HAVING COUNT(DISTINCT sc.lead_id) > 0;

    -- Reliability badge
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

    -- Deal value tier badges (real closed value)
    INSERT INTO tmp_seller_special_badges (badge_type, badge_key, badge_label, progress_count)
    SELECT
        'deal_value_tier',
        'value_100k',
        'Valor 100K',
        COUNT(*)::INTEGER
    FROM clientes c
    WHERE c.owner_id = p_seller_id
      AND is_won_stage(c.etapa)
      AND COALESCE(c.valor_real_cierre, c.valor_estimado, 0) >= 100000
      AND COALESCE(c.valor_real_cierre, c.valor_estimado, 0) < 500000
    HAVING COUNT(*) > 0;

    INSERT INTO tmp_seller_special_badges (badge_type, badge_key, badge_label, progress_count)
    SELECT
        'deal_value_tier',
        'value_500k',
        'Valor 500K',
        COUNT(*)::INTEGER
    FROM clientes c
    WHERE c.owner_id = p_seller_id
      AND is_won_stage(c.etapa)
      AND COALESCE(c.valor_real_cierre, c.valor_estimado, 0) >= 500000
      AND COALESCE(c.valor_real_cierre, c.valor_estimado, 0) < 1000000
    HAVING COUNT(*) > 0;

    INSERT INTO tmp_seller_special_badges (badge_type, badge_key, badge_label, progress_count)
    SELECT
        'deal_value_tier',
        'value_1m',
        'Valor 1M',
        COUNT(*)::INTEGER
    FROM clientes c
    WHERE c.owner_id = p_seller_id
      AND is_won_stage(c.etapa)
      AND COALESCE(c.valor_real_cierre, c.valor_estimado, 0) >= 1000000
    HAVING COUNT(*) > 0;

    -- Closing streak badge (best streak + active/paused state)
    WITH monthly AS (
        SELECT DISTINCT date_trunc('month', sc.closed_at)::date AS m
        FROM seller_badge_closures sc
        WHERE sc.seller_id = p_seller_id
    ),
    ordered AS (
        SELECT
            m,
            ROW_NUMBER() OVER (ORDER BY m) AS rn,
            (EXTRACT(YEAR FROM m)::int * 12 + EXTRACT(MONTH FROM m)::int) AS month_idx
        FROM monthly
    ),
    grouped AS (
        SELECT
            m,
            rn,
            month_idx,
            month_idx - rn AS grp
        FROM ordered
    ),
    streaks AS (
        SELECT
            MIN(m) AS start_month,
            MAX(m) AS end_month,
            COUNT(*)::int AS len
        FROM grouped
        GROUP BY grp
    )
    SELECT
        COALESCE((SELECT len FROM streaks ORDER BY end_month DESC, len DESC LIMIT 1), 0),
        COALESCE((SELECT MAX(len) FROM streaks), 0),
        (SELECT end_month FROM streaks ORDER BY end_month DESC, len DESC LIMIT 1)
    INTO v_current_streak, v_best_streak, v_last_streak_month;

    v_streak_active := (
        v_best_streak >= 5
        AND v_current_streak = v_best_streak
        AND v_last_streak_month = date_trunc('month', NOW())::date
    );

    IF v_best_streak >= 5 THEN
        INSERT INTO tmp_seller_special_badges (badge_type, badge_key, badge_label, progress_count)
        VALUES (
            'closing_streak',
            'closing_streak',
            CASE WHEN v_streak_active THEN 'Racha Imparable · Activa' ELSE 'Racha Imparable · Pausada' END,
            v_best_streak
        );
    END IF;

    -- Trophy points leader badge (balanced weights: 3/2/1)
    SELECT COALESCE(
        SUM(
            CASE
                WHEN (rr.rank = 1 OR rr.medal = 'gold') THEN 3
                WHEN (rr.rank = 2 OR rr.medal = 'silver') THEN 2
                WHEN (rr.rank = 3 OR rr.medal = 'bronze') THEN 1
                ELSE 0
            END
        ),
        0
    )::INTEGER
    INTO v_race_points
    FROM race_results rr
    WHERE rr.user_id = p_seller_id;

    SELECT COALESCE(MAX(points), 0)::INTEGER
    INTO v_top_race_points
    FROM (
        SELECT
            rr.user_id,
            SUM(
                CASE
                    WHEN (rr.rank = 1 OR rr.medal = 'gold') THEN 3
                    WHEN (rr.rank = 2 OR rr.medal = 'silver') THEN 2
                    WHEN (rr.rank = 3 OR rr.medal = 'bronze') THEN 1
                    ELSE 0
                END
            )::INTEGER AS points
        FROM race_results rr
        WHERE rr.user_id IS NOT NULL
        GROUP BY rr.user_id
    ) seller_points;

    v_is_race_points_leader := (v_top_race_points > 0 AND v_race_points = v_top_race_points);

    SELECT EXISTS (
        SELECT 1
        FROM seller_special_badges ssb
        WHERE ssb.seller_id = p_seller_id
          AND ssb.badge_type = 'race_points_leader'
          AND ssb.badge_key = 'race_points_leader'
          AND ssb.level > 0
    )
    INTO v_had_race_points_leader;

    IF v_is_race_points_leader OR v_had_race_points_leader THEN
        INSERT INTO tmp_seller_special_badges (badge_type, badge_key, badge_label, progress_count)
        VALUES (
            'race_points_leader',
            'race_points_leader',
            CASE WHEN v_is_race_points_leader THEN 'Soberano del Podio · Activo' ELSE 'Soberano del Podio · Histórico' END,
            v_race_points
        );
    END IF;

    FOR rec IN SELECT * FROM tmp_seller_special_badges LOOP
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
        ELSIF rec.badge_type = 'closing_streak' THEN
            v_new_level := GREATEST(0, rec.progress_count - 4);
            v_next_threshold := rec.progress_count + 1;
        ELSIF rec.badge_type = 'company_size' THEN
            -- A company contributes only to its own size badge; no tiered progression per size.
            v_new_level := 1;
            v_next_threshold := NULL;
        ELSIF rec.badge_type = 'deal_value_tier' THEN
            v_new_level := 1;
            v_next_threshold := NULL;
        ELSIF rec.badge_type = 'race_points_leader' THEN
            v_new_level := 1;
            v_next_threshold := NULL;
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
          'reliability_score',
          'closing_streak',
          'deal_value_tier',
          'race_points_leader'
      )
      AND NOT EXISTS (
          SELECT 1
          FROM tmp_seller_special_badges t
          WHERE t.badge_type = ssb.badge_type
            AND t.badge_key = ssb.badge_key
      );
END;
$$;

-- Recompute special badges for all relevant sellers (owners + current badge holders).
DO $$
DECLARE
    seller_record RECORD;
BEGIN
    FOR seller_record IN (
        SELECT DISTINCT seller_id FROM seller_special_badges WHERE seller_id IS NOT NULL
        UNION
        SELECT DISTINCT owner_id AS seller_id FROM clientes WHERE owner_id IS NOT NULL
    ) LOOP
        PERFORM recompute_seller_special_badges(seller_record.seller_id, NULL);
    END LOOP;
END $$;
