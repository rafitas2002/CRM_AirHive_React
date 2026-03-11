-- Enable multi-user lead assignments and distribute lead-linked badges
-- to every user assigned to that lead.

BEGIN;

CREATE TABLE IF NOT EXISTS public.lead_user_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id BIGINT NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    assigned_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (lead_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_user_assignments_lead
    ON public.lead_user_assignments (lead_id);

CREATE INDEX IF NOT EXISTS idx_lead_user_assignments_user
    ON public.lead_user_assignments (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_user_assignments_primary_per_lead
    ON public.lead_user_assignments (lead_id)
    WHERE is_primary = TRUE;

ALTER TABLE public.lead_user_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_user_assignments_select ON public.lead_user_assignments;
CREATE POLICY lead_user_assignments_select
ON public.lead_user_assignments
FOR SELECT
TO authenticated
USING (
    user_id = auth.uid()
    OR assigned_by = auth.uid()
    OR EXISTS (
        SELECT 1
        FROM public.clientes c
        WHERE c.id = lead_id
          AND c.owner_id = auth.uid()
    )
    OR EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'admin'
    )
);

DROP POLICY IF EXISTS lead_user_assignments_insert ON public.lead_user_assignments;
CREATE POLICY lead_user_assignments_insert
ON public.lead_user_assignments
FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
        assigned_by = auth.uid()
        OR EXISTS (
            SELECT 1
            FROM public.clientes c
            WHERE c.id = lead_id
              AND c.owner_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role = 'admin'
        )
    )
);

DROP POLICY IF EXISTS lead_user_assignments_update ON public.lead_user_assignments;
CREATE POLICY lead_user_assignments_update
ON public.lead_user_assignments
FOR UPDATE
TO authenticated
USING (
    assigned_by = auth.uid()
    OR EXISTS (
        SELECT 1
        FROM public.clientes c
        WHERE c.id = lead_id
          AND c.owner_id = auth.uid()
    )
    OR EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'admin'
    )
)
WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
        assigned_by = auth.uid()
        OR EXISTS (
            SELECT 1
            FROM public.clientes c
            WHERE c.id = lead_id
              AND c.owner_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role = 'admin'
        )
    )
);

DROP POLICY IF EXISTS lead_user_assignments_delete ON public.lead_user_assignments;
CREATE POLICY lead_user_assignments_delete
ON public.lead_user_assignments
FOR DELETE
TO authenticated
USING (
    assigned_by = auth.uid()
    OR EXISTS (
        SELECT 1
        FROM public.clientes c
        WHERE c.id = lead_id
          AND c.owner_id = auth.uid()
    )
    OR EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'admin'
    )
);

CREATE OR REPLACE FUNCTION public.trg_set_lead_user_assignments_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at := NOW();
    IF NEW.assigned_by IS NULL THEN
        NEW.assigned_by := auth.uid();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lead_user_assignments_set_updated_at ON public.lead_user_assignments;
CREATE TRIGGER lead_user_assignments_set_updated_at
BEFORE UPDATE ON public.lead_user_assignments
FOR EACH ROW
EXECUTE FUNCTION public.trg_set_lead_user_assignments_updated_at();

-- Backfill existing owners as primary assignees.
INSERT INTO public.lead_user_assignments (lead_id, user_id, is_primary, assigned_by)
SELECT
    c.id,
    c.owner_id,
    TRUE,
    c.owner_id
FROM public.clientes c
WHERE c.owner_id IS NOT NULL
ON CONFLICT (lead_id, user_id)
DO UPDATE SET
    is_primary = EXCLUDED.is_primary,
    assigned_by = COALESCE(public.lead_user_assignments.assigned_by, EXCLUDED.assigned_by),
    updated_at = NOW();

-- Allow one lead to grant closures to multiple sellers.
ALTER TABLE public.seller_badge_closures
DROP CONSTRAINT IF EXISTS seller_badge_closures_lead_id_key;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'seller_badge_closures_lead_seller_key'
    ) THEN
        ALTER TABLE public.seller_badge_closures
        ADD CONSTRAINT seller_badge_closures_lead_seller_key UNIQUE (lead_id, seller_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_seller_badge_closures_lead
    ON public.seller_badge_closures (lead_id);

CREATE OR REPLACE FUNCTION public.recompute_seller_industry_badge(
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
    FROM public.seller_badge_closures sc
    WHERE sc.seller_id = p_seller_id
      AND (
        EXISTS (
            SELECT 1
            FROM public.company_industries ci
            WHERE ci.empresa_id = sc.empresa_id
              AND ci.industria_id = p_industria_id
        )
        OR EXISTS (
            SELECT 1
            FROM public.empresas e
            WHERE e.id = sc.empresa_id
              AND e.industria_id = p_industria_id
        )
      );

    v_new_level := get_badge_level(v_closures);
    v_next_threshold := get_next_badge_threshold(v_new_level);

    SELECT COALESCE(level, 0)
    INTO v_old_level
    FROM public.seller_industry_badges
    WHERE seller_id = p_seller_id
      AND industria_id = p_industria_id;

    INSERT INTO public.seller_industry_badges (
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
        unlocked_at = CASE
            WHEN EXCLUDED.level > 0 THEN COALESCE(seller_industry_badges.unlocked_at, EXCLUDED.unlocked_at)
            ELSE NULL
        END,
        updated_at = NOW();

    IF v_new_level > v_old_level THEN
        FOR lvl IN (v_old_level + 1)..v_new_level LOOP
            INSERT INTO public.seller_badge_events (
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
                GREATEST(1, v_closures),
                p_source_lead_id
            )
            ON CONFLICT (seller_id, industria_id, level) DO NOTHING;
        END LOOP;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.recompute_seller_company_size_badges_strict(
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
    v_old_level INTEGER;
    lvl INTEGER;
    v_new_level INTEGER;
    v_next_threshold INTEGER;
BEGIN
    IF p_seller_id IS NULL THEN
        RETURN;
    END IF;

    CREATE TEMP TABLE IF NOT EXISTS tmp_company_size_badges_strict (
        badge_type TEXT NOT NULL,
        badge_key TEXT NOT NULL,
        badge_label TEXT NOT NULL,
        progress_count INTEGER NOT NULL
    ) ON COMMIT DROP;

    DELETE FROM tmp_company_size_badges_strict;

    INSERT INTO tmp_company_size_badges_strict (badge_type, badge_key, badge_label, progress_count)
    SELECT
        'company_size',
        'size_' || e.tamano::TEXT,
        'Tamaño de Empresa ' || e.tamano::TEXT,
        COUNT(DISTINCT sc.lead_id)::INTEGER
    FROM public.seller_badge_closures sc
    JOIN public.empresas e ON e.id = sc.empresa_id
    WHERE sc.seller_id = p_seller_id
      AND e.tamano IS NOT NULL
    GROUP BY e.tamano;

    INSERT INTO tmp_company_size_badges_strict (badge_type, badge_key, badge_label, progress_count)
    SELECT
        'all_company_sizes',
        'all_sizes',
        'Todos los Tamaños',
        COUNT(DISTINCT e.tamano)::INTEGER
    FROM public.seller_badge_closures sc
    JOIN public.empresas e ON e.id = sc.empresa_id
    WHERE sc.seller_id = p_seller_id
      AND e.tamano IS NOT NULL
    HAVING COUNT(DISTINCT e.tamano) > 0;

    FOR rec IN SELECT * FROM tmp_company_size_badges_strict LOOP
        IF rec.badge_type = 'company_size' THEN
            v_new_level := 1;
            v_next_threshold := NULL;
        ELSE
            v_new_level := get_special_badge_level(rec.badge_type, rec.progress_count);
            v_next_threshold := get_special_badge_next_threshold(rec.badge_type, v_new_level);
        END IF;

        SELECT COALESCE(level, 0)
        INTO v_old_level
        FROM public.seller_special_badges
        WHERE seller_id = p_seller_id
          AND badge_type = rec.badge_type
          AND badge_key = rec.badge_key;

        INSERT INTO public.seller_special_badges (
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
            unlocked_at = CASE
                WHEN EXCLUDED.level > 0 THEN COALESCE(seller_special_badges.unlocked_at, EXCLUDED.unlocked_at)
                ELSE NULL
            END,
            updated_at = NOW();

        IF v_new_level > v_old_level THEN
            FOR lvl IN (v_old_level + 1)..v_new_level LOOP
                INSERT INTO public.seller_special_badge_events (
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

    DELETE FROM public.seller_special_badges ssb
    WHERE ssb.seller_id = p_seller_id
      AND ssb.badge_type IN ('company_size', 'all_company_sizes')
      AND NOT EXISTS (
          SELECT 1
          FROM tmp_company_size_badges_strict t
          WHERE t.badge_type = ssb.badge_type
            AND t.badge_key = ssb.badge_key
      );
END;
$$;

CREATE OR REPLACE FUNCTION public.recompute_badges_for_seller_company(
    p_seller_id UUID,
    p_empresa_id UUID,
    p_source_lead_id BIGINT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    rec RECORD;
BEGIN
    IF p_seller_id IS NULL THEN
        RETURN;
    END IF;

    FOR rec IN (
        SELECT DISTINCT industria_id
        FROM (
            SELECT sib.industria_id
            FROM public.seller_industry_badges sib
            WHERE sib.seller_id = p_seller_id
              AND sib.industria_id IS NOT NULL

            UNION

            SELECT ci.industria_id
            FROM public.seller_badge_closures sc
            JOIN public.company_industries ci ON ci.empresa_id = sc.empresa_id
            WHERE sc.seller_id = p_seller_id
              AND ci.industria_id IS NOT NULL

            UNION

            SELECT e.industria_id
            FROM public.seller_badge_closures sc
            JOIN public.empresas e ON e.id = sc.empresa_id
            WHERE sc.seller_id = p_seller_id
              AND e.industria_id IS NOT NULL
        ) x
        WHERE industria_id IS NOT NULL
    ) LOOP
        PERFORM public.recompute_seller_industry_badge(p_seller_id, rec.industria_id, p_source_lead_id);
    END LOOP;

    PERFORM public.recompute_seller_special_badges(p_seller_id, p_source_lead_id);
    PERFORM public.recompute_seller_company_size_badges_strict(p_seller_id, p_source_lead_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_seller_badges_for_lead(p_lead_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_empresa_id UUID;
    v_etapa TEXT;
    v_lead_exists BOOLEAN := FALSE;
    rec RECORD;
BEGIN
    CREATE TEMP TABLE IF NOT EXISTS tmp_refresh_badges_prev_sellers (
        seller_id UUID PRIMARY KEY
    ) ON COMMIT DROP;

    CREATE TEMP TABLE IF NOT EXISTS tmp_refresh_badges_curr_sellers (
        seller_id UUID PRIMARY KEY
    ) ON COMMIT DROP;

    DELETE FROM tmp_refresh_badges_prev_sellers;
    DELETE FROM tmp_refresh_badges_curr_sellers;

    SELECT empresa_id, etapa
    INTO v_empresa_id, v_etapa
    FROM public.clientes
    WHERE id = p_lead_id;
    v_lead_exists := FOUND;

    INSERT INTO tmp_refresh_badges_prev_sellers (seller_id)
    SELECT DISTINCT sc.seller_id
    FROM public.seller_badge_closures sc
    WHERE sc.lead_id = p_lead_id
      AND sc.seller_id IS NOT NULL
    ON CONFLICT (seller_id) DO NOTHING;

    IF v_lead_exists THEN
        INSERT INTO tmp_refresh_badges_curr_sellers (seller_id)
        SELECT DISTINCT s.seller_id
        FROM (
            SELECT lua.user_id AS seller_id
            FROM public.lead_user_assignments lua
            WHERE lua.lead_id = p_lead_id

            UNION

            SELECT c.owner_id AS seller_id
            FROM public.clientes c
            WHERE c.id = p_lead_id
              AND c.owner_id IS NOT NULL
        ) s
        WHERE s.seller_id IS NOT NULL
        ON CONFLICT (seller_id) DO NOTHING;
    END IF;

    DELETE FROM public.seller_badge_closures
    WHERE lead_id = p_lead_id;

    IF v_lead_exists
       AND v_empresa_id IS NOT NULL
       AND is_won_stage(v_etapa)
    THEN
        INSERT INTO public.seller_badge_closures (lead_id, seller_id, empresa_id, closed_at)
        SELECT
            p_lead_id,
            seller_id,
            v_empresa_id,
            NOW()
        FROM tmp_refresh_badges_curr_sellers
        ON CONFLICT (lead_id, seller_id)
        DO UPDATE SET
            empresa_id = EXCLUDED.empresa_id,
            closed_at = EXCLUDED.closed_at;
    END IF;

    FOR rec IN (
        SELECT seller_id FROM tmp_refresh_badges_prev_sellers
        UNION
        SELECT seller_id FROM tmp_refresh_badges_curr_sellers
    ) LOOP
        PERFORM public.recompute_badges_for_seller_company(rec.seller_id, v_empresa_id, p_lead_id);
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.recompute_seller_deal_value_tier_badges_usd(
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
    v_old_level INTEGER := 0;
    v_new_level INTEGER := 0;
    v_effective_level INTEGER := 0;
    v_effective_next_threshold INTEGER := NULL;
    v_prev_unlocked_at TIMESTAMPTZ := NULL;
    v_source_qualifies_upgrade BOOLEAN := FALSE;
    v_month_start_utc TIMESTAMPTZ;
    v_month_end_utc TIMESTAMPTZ;
    lvl INTEGER;
BEGIN
    IF p_seller_id IS NULL THEN
        RETURN;
    END IF;

    PERFORM set_config('airhive.deal_value_recompute_running', '1', true);

    v_month_start_utc := (date_trunc('month', timezone('UTC', now())) AT TIME ZONE 'UTC');
    v_month_end_utc := ((date_trunc('month', timezone('UTC', now())) + interval '1 month') AT TIME ZONE 'UTC');

    CREATE TEMP TABLE IF NOT EXISTS tmp_deal_value_tier_badges_usd (
        badge_type TEXT NOT NULL,
        badge_key TEXT NOT NULL,
        badge_label TEXT NOT NULL,
        progress_count INTEGER NOT NULL
    ) ON COMMIT DROP;

    DELETE FROM tmp_deal_value_tier_badges_usd;

    INSERT INTO tmp_deal_value_tier_badges_usd (badge_type, badge_key, badge_label, progress_count)
    SELECT
        'deal_value_tier',
        'value_1k_2k',
        'Mensualidad 1k',
        COUNT(*)::INTEGER
    FROM public.seller_badge_closures sc
    JOIN public.clientes c ON c.id = sc.lead_id
    WHERE sc.seller_id = p_seller_id
      AND c.valor_real_cierre IS NOT NULL
      AND c.closed_at_real IS NOT NULL
      AND c.closed_at_real >= v_month_start_utc
      AND c.closed_at_real < v_month_end_utc
      AND c.valor_real_cierre >= 1000
      AND c.valor_real_cierre < 2000
    HAVING COUNT(*) > 0;

    INSERT INTO tmp_deal_value_tier_badges_usd (badge_type, badge_key, badge_label, progress_count)
    SELECT
        'deal_value_tier',
        'value_2k_5k',
        'Mensualidad 2k',
        COUNT(*)::INTEGER
    FROM public.seller_badge_closures sc
    JOIN public.clientes c ON c.id = sc.lead_id
    WHERE sc.seller_id = p_seller_id
      AND c.valor_real_cierre IS NOT NULL
      AND c.closed_at_real IS NOT NULL
      AND c.closed_at_real >= v_month_start_utc
      AND c.closed_at_real < v_month_end_utc
      AND c.valor_real_cierre >= 2000
      AND c.valor_real_cierre < 5000
    HAVING COUNT(*) > 0;

    INSERT INTO tmp_deal_value_tier_badges_usd (badge_type, badge_key, badge_label, progress_count)
    SELECT
        'deal_value_tier',
        'value_5k_10k',
        'Mensualidad 5k',
        COUNT(*)::INTEGER
    FROM public.seller_badge_closures sc
    JOIN public.clientes c ON c.id = sc.lead_id
    WHERE sc.seller_id = p_seller_id
      AND c.valor_real_cierre IS NOT NULL
      AND c.closed_at_real IS NOT NULL
      AND c.closed_at_real >= v_month_start_utc
      AND c.closed_at_real < v_month_end_utc
      AND c.valor_real_cierre >= 5000
      AND c.valor_real_cierre < 10000
    HAVING COUNT(*) > 0;

    INSERT INTO tmp_deal_value_tier_badges_usd (badge_type, badge_key, badge_label, progress_count)
    SELECT
        'deal_value_tier',
        'value_10k_100k',
        'Mensualidad 10k',
        COUNT(*)::INTEGER
    FROM public.seller_badge_closures sc
    JOIN public.clientes c ON c.id = sc.lead_id
    WHERE sc.seller_id = p_seller_id
      AND c.valor_real_cierre IS NOT NULL
      AND c.closed_at_real IS NOT NULL
      AND c.closed_at_real >= v_month_start_utc
      AND c.closed_at_real < v_month_end_utc
      AND c.valor_real_cierre >= 10000
      AND c.valor_real_cierre <= 100000
    HAVING COUNT(*) > 0;

    FOR rec IN SELECT * FROM tmp_deal_value_tier_badges_usd LOOP
        SELECT
            COALESCE(level, 0),
            unlocked_at
        INTO
            v_old_level,
            v_prev_unlocked_at
        FROM public.seller_special_badges
        WHERE seller_id = p_seller_id
          AND badge_type = rec.badge_type
          AND badge_key = rec.badge_key;

        v_new_level := get_special_badge_level(rec.badge_type, rec.progress_count);
        v_effective_level := v_new_level;

        v_source_qualifies_upgrade := FALSE;
        IF p_source_lead_id IS NOT NULL THEN
            SELECT EXISTS (
                SELECT 1
                FROM public.seller_badge_closures sc
                JOIN public.clientes c ON c.id = sc.lead_id
                WHERE c.id = p_source_lead_id
                  AND sc.seller_id = p_seller_id
                  AND c.valor_real_cierre IS NOT NULL
                  AND c.closed_at_real IS NOT NULL
                  AND c.closed_at_real >= v_month_start_utc
                  AND c.closed_at_real < v_month_end_utc
                  AND (
                      (rec.badge_key = 'value_1k_2k' AND c.valor_real_cierre >= 1000 AND c.valor_real_cierre < 2000)
                      OR (rec.badge_key = 'value_2k_5k' AND c.valor_real_cierre >= 2000 AND c.valor_real_cierre < 5000)
                      OR (rec.badge_key = 'value_5k_10k' AND c.valor_real_cierre >= 5000 AND c.valor_real_cierre < 10000)
                      OR (rec.badge_key = 'value_10k_100k' AND c.valor_real_cierre >= 10000 AND c.valor_real_cierre <= 100000)
                  )
            )
            INTO v_source_qualifies_upgrade;
        END IF;

        IF v_new_level > COALESCE(v_old_level, 0) AND NOT v_source_qualifies_upgrade THEN
            v_effective_level := COALESCE(v_old_level, 0);
        END IF;

        v_effective_next_threshold := get_special_badge_next_threshold(rec.badge_type, v_effective_level);

        INSERT INTO public.seller_special_badges (
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
            v_effective_level,
            v_effective_next_threshold,
            CASE WHEN v_effective_level > 0 THEN COALESCE(v_prev_unlocked_at, NOW()) ELSE NULL END,
            NOW()
        )
        ON CONFLICT (seller_id, badge_type, badge_key)
        DO UPDATE SET
            badge_label = EXCLUDED.badge_label,
            progress_count = EXCLUDED.progress_count,
            level = EXCLUDED.level,
            next_level_threshold = EXCLUDED.next_level_threshold,
            unlocked_at = CASE
                WHEN EXCLUDED.level > 0 THEN COALESCE(seller_special_badges.unlocked_at, EXCLUDED.unlocked_at)
                ELSE NULL
            END,
            updated_at = NOW();

        IF v_effective_level > COALESCE(v_old_level, 0) THEN
            FOR lvl IN (COALESCE(v_old_level, 0) + 1)..v_effective_level LOOP
                INSERT INTO public.seller_special_badge_events (
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

    DELETE FROM public.seller_special_badges ssb
    WHERE ssb.seller_id = p_seller_id
      AND ssb.badge_type = 'deal_value_tier'
      AND ssb.badge_key NOT IN (
          SELECT t.badge_key
          FROM tmp_deal_value_tier_badges_usd t
      );

    PERFORM set_config('airhive.deal_value_recompute_running', '0', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_special_badge_progression_row(
    p_seller_id UUID,
    p_badge_type TEXT,
    p_badge_key TEXT,
    p_source_lead_id BIGINT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row RECORD;
    v_old_level INTEGER := 0;
    v_new_level INTEGER := 0;
    v_next_threshold INTEGER := NULL;
    v_source_qualifies_upgrade BOOLEAN := FALSE;
    lvl INTEGER;
BEGIN
    IF p_seller_id IS NULL OR p_badge_type IS NULL OR p_badge_key IS NULL THEN
        RETURN;
    END IF;

    IF p_badge_type NOT IN ('closure_milestone', 'company_size', 'deal_value_tier') THEN
        RETURN;
    END IF;

    SELECT *
    INTO v_row
    FROM public.seller_special_badges
    WHERE seller_id = p_seller_id
      AND badge_type = p_badge_type
      AND badge_key = p_badge_key;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    v_old_level := COALESCE(v_row.level, 0);
    v_new_level := get_special_badge_level(v_row.badge_type, v_row.progress_count);
    v_next_threshold := get_special_badge_next_threshold(v_row.badge_type, v_new_level);

    IF p_badge_type = 'deal_value_tier' AND v_new_level > v_old_level THEN
        v_source_qualifies_upgrade := FALSE;

        IF p_source_lead_id IS NOT NULL THEN
            SELECT EXISTS (
                SELECT 1
                FROM public.seller_badge_closures sc
                JOIN public.clientes c ON c.id = sc.lead_id
                WHERE c.id = p_source_lead_id
                  AND sc.seller_id = p_seller_id
                  AND c.valor_real_cierre IS NOT NULL
                  AND (
                      (p_badge_key = 'value_1k_2k' AND c.valor_real_cierre >= 1000 AND c.valor_real_cierre < 2000)
                      OR (p_badge_key = 'value_2k_5k' AND c.valor_real_cierre >= 2000 AND c.valor_real_cierre < 5000)
                      OR (p_badge_key = 'value_5k_10k' AND c.valor_real_cierre >= 5000 AND c.valor_real_cierre < 10000)
                      OR ((p_badge_key = 'value_10k_100k' OR p_badge_key = 'value_10k_plus') AND c.valor_real_cierre >= 10000 AND c.valor_real_cierre <= 100000)
                  )
            )
            INTO v_source_qualifies_upgrade;
        END IF;

        IF NOT v_source_qualifies_upgrade THEN
            v_new_level := v_old_level;
            v_next_threshold := get_special_badge_next_threshold(v_row.badge_type, v_new_level);
        END IF;
    END IF;

    IF v_new_level = v_old_level
       AND (v_row.next_level_threshold IS NOT DISTINCT FROM v_next_threshold) THEN
        RETURN;
    END IF;

    UPDATE public.seller_special_badges
    SET level = v_new_level,
        next_level_threshold = v_next_threshold,
        unlocked_at = CASE
            WHEN v_new_level > 0 THEN COALESCE(unlocked_at, NOW())
            ELSE NULL
        END,
        updated_at = NOW()
    WHERE id = v_row.id;

    IF v_new_level > v_old_level THEN
        FOR lvl IN (v_old_level + 1)..v_new_level LOOP
            INSERT INTO public.seller_special_badge_events (
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
                v_row.seller_id,
                v_row.badge_type,
                v_row.badge_key,
                v_row.badge_label,
                lvl,
                CASE WHEN lvl = 1 THEN 'unlocked' ELSE 'upgraded' END,
                GREATEST(1, COALESCE(v_row.progress_count, 0)),
                p_source_lead_id
            )
            ON CONFLICT (seller_id, badge_type, badge_key, level) DO NOTHING;
        END LOOP;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_refresh_badges_on_lead_change_strict()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM public.refresh_seller_badges_for_lead(OLD.id);
        RETURN OLD;
    END IF;

    PERFORM public.refresh_seller_badges_for_lead(NEW.id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clientes_refresh_badges_on_win ON public.clientes;
CREATE TRIGGER clientes_refresh_badges_on_win
AFTER INSERT OR UPDATE OF etapa, owner_id, empresa_id, valor_real_cierre, closed_at_real OR DELETE
ON public.clientes
FOR EACH ROW
EXECUTE FUNCTION public.trg_refresh_badges_on_lead_change_strict();

CREATE OR REPLACE FUNCTION public.trg_refresh_badges_on_lead_assignment_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_lead_id BIGINT;
BEGIN
    v_lead_id := COALESCE(NEW.lead_id, OLD.lead_id);
    IF v_lead_id IS NOT NULL THEN
        PERFORM public.refresh_seller_badges_for_lead(v_lead_id);
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS lead_user_assignments_refresh_badges ON public.lead_user_assignments;
CREATE TRIGGER lead_user_assignments_refresh_badges
AFTER INSERT OR UPDATE OR DELETE
ON public.lead_user_assignments
FOR EACH ROW
EXECUTE FUNCTION public.trg_refresh_badges_on_lead_assignment_change();

-- Rebuild canonical closure cache using assignment table + owner fallback.
DELETE FROM public.seller_badge_closures
WHERE TRUE;

INSERT INTO public.seller_badge_closures (lead_id, seller_id, empresa_id, closed_at)
SELECT
    c.id AS lead_id,
    s.seller_id,
    c.empresa_id,
    COALESCE(c.closed_at_real, c.created_at, NOW()) AS closed_at
FROM public.clientes c
JOIN LATERAL (
    SELECT DISTINCT seller_id
    FROM (
        SELECT lua.user_id AS seller_id
        FROM public.lead_user_assignments lua
        WHERE lua.lead_id = c.id

        UNION

        SELECT c.owner_id AS seller_id
    ) x
    WHERE seller_id IS NOT NULL
) s ON TRUE
WHERE c.empresa_id IS NOT NULL
  AND is_won_stage(c.etapa)
ON CONFLICT (lead_id, seller_id)
DO UPDATE SET
    empresa_id = EXCLUDED.empresa_id,
    closed_at = EXCLUDED.closed_at;

DO $$
DECLARE
    seller_record RECORD;
BEGIN
    FOR seller_record IN (
        SELECT DISTINCT seller_id
        FROM public.seller_badge_closures
        WHERE seller_id IS NOT NULL

        UNION

        SELECT DISTINCT user_id AS seller_id
        FROM public.lead_user_assignments
        WHERE user_id IS NOT NULL

        UNION

        SELECT DISTINCT owner_id AS seller_id
        FROM public.clientes
        WHERE owner_id IS NOT NULL

        UNION

        SELECT DISTINCT seller_id
        FROM public.seller_industry_badges
        WHERE seller_id IS NOT NULL

        UNION

        SELECT DISTINCT seller_id
        FROM public.seller_special_badges
        WHERE seller_id IS NOT NULL
    ) LOOP
        PERFORM public.recompute_badges_for_seller_company(seller_record.seller_id, NULL, NULL);
    END LOOP;
END $$;

COMMIT;
