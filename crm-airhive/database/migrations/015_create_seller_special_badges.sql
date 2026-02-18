-- Additional badge categories:
-- 1) Company size badges
-- 2) Location badges (city / country)
-- 3) Multi-industry badge

CREATE TABLE IF NOT EXISTS badge_special_level_config (
    id BIGSERIAL PRIMARY KEY,
    badge_type TEXT NOT NULL CHECK (badge_type IN ('company_size', 'location_city', 'location_country', 'multi_industry')),
    level INTEGER NOT NULL CHECK (level > 0),
    min_progress INTEGER NOT NULL CHECK (min_progress > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (badge_type, level),
    UNIQUE (badge_type, min_progress)
);

INSERT INTO badge_special_level_config (badge_type, level, min_progress)
VALUES
    -- Company size badges (closures per company size tier)
    ('company_size', 1, 1),
    ('company_size', 2, 3),
    ('company_size', 3, 7),
    ('company_size', 4, 15),

    -- City badges (closures in same city)
    ('location_city', 1, 1),
    ('location_city', 2, 3),
    ('location_city', 3, 8),
    ('location_city', 4, 15),

    -- Country badges (closures in same country)
    ('location_country', 1, 1),
    ('location_country', 2, 2),
    ('location_country', 3, 5),
    ('location_country', 4, 10),

    -- Multi-industry badge (distinct unlocked industries)
    ('multi_industry', 1, 5),
    ('multi_industry', 2, 10),
    ('multi_industry', 3, 15),
    ('multi_industry', 4, 20)
ON CONFLICT (badge_type, level) DO NOTHING;

CREATE TABLE IF NOT EXISTS seller_special_badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    badge_type TEXT NOT NULL CHECK (badge_type IN ('company_size', 'location_city', 'location_country', 'multi_industry')),
    badge_key TEXT NOT NULL,
    badge_label TEXT NOT NULL,
    progress_count INTEGER NOT NULL DEFAULT 0 CHECK (progress_count >= 0),
    level INTEGER NOT NULL DEFAULT 0 CHECK (level >= 0),
    next_level_threshold INTEGER,
    unlocked_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (seller_id, badge_type, badge_key)
);

CREATE INDEX IF NOT EXISTS idx_seller_special_badges_seller
    ON seller_special_badges (seller_id, badge_type, level DESC, progress_count DESC);

CREATE TABLE IF NOT EXISTS seller_special_badge_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    badge_type TEXT NOT NULL CHECK (badge_type IN ('company_size', 'location_city', 'location_country', 'multi_industry')),
    badge_key TEXT NOT NULL,
    badge_label TEXT NOT NULL,
    level INTEGER NOT NULL CHECK (level > 0),
    event_type TEXT NOT NULL CHECK (event_type IN ('unlocked', 'upgraded')),
    progress_count INTEGER NOT NULL CHECK (progress_count > 0),
    source_lead_id BIGINT REFERENCES clientes(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (seller_id, badge_type, badge_key, level)
);

CREATE INDEX IF NOT EXISTS idx_seller_special_badge_events_seller
    ON seller_special_badge_events (seller_id, created_at DESC);

CREATE OR REPLACE FUNCTION get_special_badge_level(p_badge_type TEXT, p_progress INTEGER)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(MAX(level), 0)
    FROM badge_special_level_config
    WHERE badge_type = p_badge_type
      AND min_progress <= COALESCE(p_progress, 0)
$$;

CREATE OR REPLACE FUNCTION get_special_badge_next_threshold(p_badge_type TEXT, p_current_level INTEGER)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
    SELECT min_progress
    FROM badge_special_level_config
    WHERE badge_type = p_badge_type
      AND level = COALESCE(p_current_level, 0) + 1
    LIMIT 1
$$;

CREATE OR REPLACE FUNCTION normalize_location_city(p_location TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_trimmed TEXT;
BEGIN
    v_trimmed := NULLIF(BTRIM(COALESCE(p_location, '')), '');
    IF v_trimmed IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN INITCAP(BTRIM(SPLIT_PART(v_trimmed, ',', 1)));
END;
$$;

CREATE OR REPLACE FUNCTION normalize_location_country(p_location TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_trimmed TEXT;
    v_country_raw TEXT;
    v_city TEXT;
    v_lower TEXT;
BEGIN
    v_trimmed := NULLIF(BTRIM(COALESCE(p_location, '')), '');
    IF v_trimmed IS NULL THEN
        RETURN NULL;
    END IF;

    v_country_raw := NULLIF(BTRIM(SPLIT_PART(v_trimmed, ',', ARRAY_LENGTH(REGEXP_SPLIT_TO_ARRAY(v_trimmed, ','), 1))), '');
    v_city := LOWER(BTRIM(SPLIT_PART(v_trimmed, ',', 1)));
    v_lower := LOWER(COALESCE(v_country_raw, v_trimmed));

    IF v_lower IN ('mx', 'mexico', 'méxico') OR v_lower LIKE '%mex%' THEN
        RETURN 'Mexico';
    END IF;

    IF v_lower IN ('usa', 'us', 'eeuu', 'eua', 'united states', 'estados unidos') OR v_lower LIKE '%united states%' OR v_lower LIKE '%estados unidos%' THEN
        RETURN 'Estados Unidos';
    END IF;

    IF v_city IN ('monterrey', 'guadalajara', 'cdmx', 'ciudad de mexico', 'puebla', 'queretaro', 'querétaro', 'tijuana', 'merida', 'mérida') THEN
        RETURN 'Mexico';
    END IF;

    IF v_country_raw IS NOT NULL AND LOWER(v_country_raw) <> v_city THEN
        RETURN INITCAP(v_country_raw);
    END IF;

    RETURN INITCAP(v_trimmed);
END;
$$;

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
      AND ssb.badge_type IN ('company_size', 'location_city', 'location_country', 'multi_industry')
      AND NOT EXISTS (
          SELECT 1
          FROM tmp_seller_special_badges t
          WHERE t.badge_type = ssb.badge_type
            AND t.badge_key = ssb.badge_key
      );
END;
$$;

-- Extend existing lead refresh to include special badges.
CREATE OR REPLACE FUNCTION refresh_seller_badges_for_lead(p_lead_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_seller_id UUID;
    v_empresa_id UUID;
    v_etapa TEXT;
    rec RECORD;
BEGIN
    SELECT owner_id, empresa_id, etapa
    INTO v_seller_id, v_empresa_id, v_etapa
    FROM clientes
    WHERE id = p_lead_id;

    IF v_seller_id IS NULL OR v_empresa_id IS NULL OR NOT is_won_stage(v_etapa) THEN
        RETURN;
    END IF;

    INSERT INTO seller_badge_closures (lead_id, seller_id, empresa_id, closed_at)
    VALUES (p_lead_id, v_seller_id, v_empresa_id, NOW())
    ON CONFLICT (lead_id)
    DO UPDATE SET
        seller_id = EXCLUDED.seller_id,
        empresa_id = EXCLUDED.empresa_id;

    FOR rec IN (
        SELECT DISTINCT industria_id
        FROM (
            SELECT ci.industria_id
            FROM company_industries ci
            WHERE ci.empresa_id = v_empresa_id
              AND ci.industria_id IS NOT NULL
            UNION
            SELECT e.industria_id
            FROM empresas e
            WHERE e.id = v_empresa_id
              AND e.industria_id IS NOT NULL
        ) x
    ) LOOP
        PERFORM recompute_seller_industry_badge(v_seller_id, rec.industria_id, p_lead_id);
    END LOOP;

    PERFORM recompute_seller_special_badges(v_seller_id, p_lead_id);
END;
$$;

ALTER TABLE badge_special_level_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_special_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_special_badge_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated can read special badge config') THEN
        CREATE POLICY "Authenticated can read special badge config"
            ON badge_special_level_config FOR SELECT
            TO authenticated
            USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can manage special badge config') THEN
        CREATE POLICY "Admins can manage special badge config"
            ON badge_special_level_config FOR ALL
            TO authenticated
            USING (
                EXISTS (
                    SELECT 1
                    FROM profiles
                    WHERE profiles.id = auth.uid()
                      AND profiles.role IN ('admin', 'rh')
                )
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1
                    FROM profiles
                    WHERE profiles.id = auth.uid()
                      AND profiles.role IN ('admin', 'rh')
                )
            );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated can read seller special badges') THEN
        CREATE POLICY "Authenticated can read seller special badges"
            ON seller_special_badges FOR SELECT
            TO authenticated
            USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated can read seller special badge events') THEN
        CREATE POLICY "Authenticated can read seller special badge events"
            ON seller_special_badge_events FOR SELECT
            TO authenticated
            USING (true);
    END IF;
END $$;

-- Backfill all current sellers based on historical won closures.
DO $$
DECLARE
    seller_record RECORD;
BEGIN
    FOR seller_record IN (
        SELECT DISTINCT seller_id
        FROM seller_badge_closures
    ) LOOP
        PERFORM recompute_seller_special_badges(seller_record.seller_id, NULL);
    END LOOP;
END $$;
