-- Seller badges by industry with progression levels and audit events

CREATE TABLE IF NOT EXISTS badge_level_config (
    id BIGSERIAL PRIMARY KEY,
    level INTEGER NOT NULL UNIQUE CHECK (level > 0),
    min_closures INTEGER NOT NULL UNIQUE CHECK (min_closures > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO badge_level_config (level, min_closures)
VALUES
    (1, 1),
    (2, 5),
    (3, 10),
    (4, 25)
ON CONFLICT (level) DO NOTHING;

CREATE TABLE IF NOT EXISTS seller_badge_closures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id BIGINT NOT NULL UNIQUE REFERENCES clientes(id) ON DELETE CASCADE,
    seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seller_badge_closures_seller
    ON seller_badge_closures (seller_id);

CREATE INDEX IF NOT EXISTS idx_seller_badge_closures_empresa
    ON seller_badge_closures (empresa_id);

CREATE TABLE IF NOT EXISTS seller_industry_badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    industria_id UUID NOT NULL REFERENCES industrias(id) ON DELETE CASCADE,
    closures_count INTEGER NOT NULL DEFAULT 0 CHECK (closures_count >= 0),
    level INTEGER NOT NULL DEFAULT 0 CHECK (level >= 0),
    next_level_threshold INTEGER,
    unlocked_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (seller_id, industria_id)
);

CREATE INDEX IF NOT EXISTS idx_seller_industry_badges_seller
    ON seller_industry_badges (seller_id, closures_count DESC);

CREATE TABLE IF NOT EXISTS seller_badge_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    industria_id UUID NOT NULL REFERENCES industrias(id) ON DELETE CASCADE,
    level INTEGER NOT NULL CHECK (level > 0),
    event_type TEXT NOT NULL CHECK (event_type IN ('unlocked', 'upgraded')),
    closures_count INTEGER NOT NULL CHECK (closures_count > 0),
    source_lead_id BIGINT REFERENCES clientes(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (seller_id, industria_id, level)
);

CREATE INDEX IF NOT EXISTS idx_seller_badge_events_seller
    ON seller_badge_events (seller_id, created_at DESC);

CREATE OR REPLACE FUNCTION is_won_stage(stage_text TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(LOWER(TRIM(stage_text)) IN ('cerrado ganado', 'cerrada ganada'), FALSE)
$$;

CREATE OR REPLACE FUNCTION get_badge_level(closures INTEGER)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(MAX(level), 0)
    FROM badge_level_config
    WHERE min_closures <= COALESCE(closures, 0)
$$;

CREATE OR REPLACE FUNCTION get_next_badge_threshold(current_level INTEGER)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
    SELECT min_closures
    FROM badge_level_config
    WHERE level = COALESCE(current_level, 0) + 1
    LIMIT 1
$$;

CREATE OR REPLACE FUNCTION recompute_seller_industry_badge(
    p_seller_id UUID,
    p_industria_id UUID,
    p_source_lead_id BIGINT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_closures INTEGER;
    v_new_level INTEGER;
    v_old_level INTEGER := 0;
    v_next_threshold INTEGER;
    lvl INTEGER;
BEGIN
    IF p_seller_id IS NULL OR p_industria_id IS NULL THEN
        RETURN;
    END IF;

    SELECT COUNT(DISTINCT sc.lead_id)::INTEGER
    INTO v_closures
    FROM seller_badge_closures sc
    WHERE sc.seller_id = p_seller_id
      AND (
        EXISTS (
            SELECT 1
            FROM company_industries ci
            WHERE ci.empresa_id = sc.empresa_id
              AND ci.industria_id = p_industria_id
        )
        OR EXISTS (
            SELECT 1
            FROM empresas e
            WHERE e.id = sc.empresa_id
              AND e.industria_id = p_industria_id
        )
      );

    v_new_level := get_badge_level(v_closures);
    v_next_threshold := get_next_badge_threshold(v_new_level);

    SELECT COALESCE(level, 0)
    INTO v_old_level
    FROM seller_industry_badges
    WHERE seller_id = p_seller_id
      AND industria_id = p_industria_id;

    INSERT INTO seller_industry_badges (
        seller_id,
        industria_id,
        closures_count,
        level,
        next_level_threshold,
        unlocked_at,
        updated_at
    )
    VALUES (
        p_seller_id,
        p_industria_id,
        v_closures,
        v_new_level,
        v_next_threshold,
        CASE WHEN v_new_level > 0 THEN NOW() ELSE NULL END,
        NOW()
    )
    ON CONFLICT (seller_id, industria_id)
    DO UPDATE SET
        closures_count = EXCLUDED.closures_count,
        level = EXCLUDED.level,
        next_level_threshold = EXCLUDED.next_level_threshold,
        unlocked_at = COALESCE(seller_industry_badges.unlocked_at, EXCLUDED.unlocked_at),
        updated_at = NOW();

    IF v_new_level > v_old_level THEN
        FOR lvl IN (v_old_level + 1)..v_new_level LOOP
            INSERT INTO seller_badge_events (
                seller_id,
                industria_id,
                level,
                event_type,
                closures_count,
                source_lead_id
            )
            VALUES (
                p_seller_id,
                p_industria_id,
                lvl,
                CASE WHEN lvl = 1 THEN 'unlocked' ELSE 'upgraded' END,
                v_closures,
                p_source_lead_id
            )
            ON CONFLICT (seller_id, industria_id, level) DO NOTHING;
        END LOOP;
    END IF;
END;
$$;

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
END;
$$;

CREATE OR REPLACE FUNCTION trg_refresh_badges_on_lead_win()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF is_won_stage(NEW.etapa) THEN
        IF TG_OP = 'INSERT'
            OR OLD.etapa IS DISTINCT FROM NEW.etapa
            OR OLD.owner_id IS DISTINCT FROM NEW.owner_id
            OR OLD.empresa_id IS DISTINCT FROM NEW.empresa_id
        THEN
            PERFORM refresh_seller_badges_for_lead(NEW.id);
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'clientes_refresh_badges_on_win') THEN
        CREATE TRIGGER clientes_refresh_badges_on_win
            AFTER INSERT OR UPDATE OF etapa, owner_id, empresa_id
            ON clientes
            FOR EACH ROW
            EXECUTE FUNCTION trg_refresh_badges_on_lead_win();
    END IF;
END $$;

ALTER TABLE badge_level_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_badge_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_industry_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_badge_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated can read badge level config') THEN
        CREATE POLICY "Authenticated can read badge level config"
            ON badge_level_config FOR SELECT
            TO authenticated
            USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can manage badge level config') THEN
        CREATE POLICY "Admins can manage badge level config"
            ON badge_level_config FOR ALL
            TO authenticated
            USING (
                EXISTS (
                    SELECT 1 FROM profiles
                    WHERE profiles.id = auth.uid()
                      AND profiles.role IN ('admin', 'rh')
                )
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM profiles
                    WHERE profiles.id = auth.uid()
                      AND profiles.role IN ('admin', 'rh')
                )
            );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated can read seller industry badges') THEN
        CREATE POLICY "Authenticated can read seller industry badges"
            ON seller_industry_badges FOR SELECT
            TO authenticated
            USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated can read seller badge events') THEN
        CREATE POLICY "Authenticated can read seller badge events"
            ON seller_badge_events FOR SELECT
            TO authenticated
            USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can read badge closures') THEN
        CREATE POLICY "Admins can read badge closures"
            ON seller_badge_closures FOR SELECT
            TO authenticated
            USING (
                EXISTS (
                    SELECT 1 FROM profiles
                    WHERE profiles.id = auth.uid()
                      AND profiles.role IN ('admin', 'rh')
                )
            );
    END IF;
END $$;

-- Backfill historical won closures
INSERT INTO seller_badge_closures (lead_id, seller_id, empresa_id, closed_at)
SELECT c.id, c.owner_id, c.empresa_id, COALESCE(c.updated_at, c.created_at, NOW())
FROM clientes c
WHERE c.owner_id IS NOT NULL
  AND c.empresa_id IS NOT NULL
  AND is_won_stage(c.etapa)
ON CONFLICT (lead_id) DO NOTHING;

DO $$
DECLARE
    closure RECORD;
BEGIN
    FOR closure IN (SELECT lead_id FROM seller_badge_closures) LOOP
        PERFORM refresh_seller_badges_for_lead(closure.lead_id);
    END LOOP;
END $$;

