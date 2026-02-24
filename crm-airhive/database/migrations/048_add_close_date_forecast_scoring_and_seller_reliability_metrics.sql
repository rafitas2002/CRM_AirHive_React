-- Phase 2 for forecast reliability persistence.
-- Adds:
-- - close-date forecast scoring fields on clientes
-- - lead_close_date_forecast_snapshots (1 row per lead)
-- - seller_forecast_reliability_metrics (prob/value/date scores + samples)
-- - triggers/backfill to keep metrics updated

ALTER TABLE IF EXISTS clientes
    ADD COLUMN IF NOT EXISTS close_date_forecast_estimated DATE NULL,
    ADD COLUMN IF NOT EXISTS close_date_forecast_actual DATE NULL,
    ADD COLUMN IF NOT EXISTS close_date_forecast_days_error INTEGER NULL,
    ADD COLUMN IF NOT EXISTS close_date_forecast_abs_days_error INTEGER NULL,
    ADD COLUMN IF NOT EXISTS close_date_forecast_score NUMERIC(6, 2) NULL,
    ADD COLUMN IF NOT EXISTS close_date_forecast_scored_at TIMESTAMPTZ NULL;

CREATE TABLE IF NOT EXISTS lead_close_date_forecast_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id BIGINT NOT NULL UNIQUE REFERENCES clientes(id) ON DELETE CASCADE,
    seller_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    estimated_close_date DATE NOT NULL,
    actual_close_date DATE NOT NULL,
    days_error INTEGER NOT NULL,
    abs_days_error INTEGER NOT NULL,
    score NUMERIC(6, 2) NOT NULL,
    source TEXT NOT NULL DEFAULT 'lead_closed_won',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_close_date_forecast_snapshots_seller
    ON lead_close_date_forecast_snapshots (seller_id, created_at DESC);

CREATE TABLE IF NOT EXISTS seller_forecast_reliability_metrics (
    seller_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    probability_reliability_score NUMERIC(6, 2) NOT NULL DEFAULT 0,
    probability_reliability_samples INTEGER NOT NULL DEFAULT 0,
    value_reliability_score NUMERIC(6, 2) NOT NULL DEFAULT 0,
    value_reliability_samples INTEGER NOT NULL DEFAULT 0,
    close_date_reliability_score NUMERIC(6, 2) NOT NULL DEFAULT 0,
    close_date_reliability_samples INTEGER NOT NULL DEFAULT 0,
    last_recomputed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seller_forecast_reliability_metrics_updated_at
    ON seller_forecast_reliability_metrics (updated_at DESC);

CREATE OR REPLACE FUNCTION compute_close_date_forecast_score(p_abs_days INTEGER)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    IF p_abs_days IS NULL THEN
        RETURN NULL;
    ELSIF p_abs_days = 0 THEN
        RETURN 100;
    ELSIF p_abs_days <= 3 THEN
        RETURN 90;
    ELSIF p_abs_days <= 7 THEN
        RETURN 75;
    ELSIF p_abs_days <= 14 THEN
        RETURN 55;
    ELSIF p_abs_days <= 30 THEN
        RETURN 35;
    ELSE
        RETURN 15;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION trg_capture_close_date_forecast_on_close()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_won BOOLEAN;
    v_old_is_won BOOLEAN := FALSE;
    v_estimated DATE;
    v_actual DATE;
    v_days_error INTEGER;
    v_abs_days_error INTEGER;
    v_score NUMERIC(6, 2);
BEGIN
    v_is_won := lower(trim(COALESCE(NEW.etapa, ''))) LIKE '%ganad%';
    IF NOT v_is_won THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        v_old_is_won := lower(trim(COALESCE(OLD.etapa, ''))) LIKE '%ganad%';
    END IF;

    -- Use the forecast known before closing when possible.
    IF TG_OP = 'INSERT' THEN
        v_estimated := NEW.forecast_close_date;
    ELSE
        v_estimated := COALESCE(OLD.forecast_close_date, NEW.forecast_close_date);
    END IF;

    IF v_estimated IS NULL THEN
        -- No forecasted close date => nothing to score.
        RETURN NEW;
    END IF;

    v_actual := COALESCE(NEW.closed_at_real::date, NOW()::date);
    v_days_error := (v_actual - v_estimated);
    v_abs_days_error := ABS(v_days_error);
    v_score := compute_close_date_forecast_score(v_abs_days_error);

    NEW.close_date_forecast_estimated := v_estimated;
    NEW.close_date_forecast_actual := v_actual;
    NEW.close_date_forecast_days_error := v_days_error;
    NEW.close_date_forecast_abs_days_error := v_abs_days_error;
    NEW.close_date_forecast_score := v_score;
    NEW.close_date_forecast_scored_at := NOW();

    INSERT INTO lead_close_date_forecast_snapshots (
        lead_id,
        seller_id,
        estimated_close_date,
        actual_close_date,
        days_error,
        abs_days_error,
        score,
        source
    )
    VALUES (
        NEW.id,
        NEW.owner_id,
        v_estimated,
        v_actual,
        v_days_error,
        v_abs_days_error,
        v_score,
        CASE WHEN TG_OP = 'INSERT' THEN 'lead_inserted_won' ELSE 'lead_closed_or_updated_won' END
    )
    ON CONFLICT (lead_id)
    DO UPDATE SET
        seller_id = EXCLUDED.seller_id,
        estimated_close_date = EXCLUDED.estimated_close_date,
        actual_close_date = EXCLUDED.actual_close_date,
        days_error = EXCLUDED.days_error,
        abs_days_error = EXCLUDED.abs_days_error,
        score = EXCLUDED.score,
        source = EXCLUDED.source,
        created_at = NOW();

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clientes_capture_close_date_forecast_on_close_insert ON clientes;
CREATE TRIGGER trg_clientes_capture_close_date_forecast_on_close_insert
BEFORE INSERT ON clientes
FOR EACH ROW
WHEN (lower(trim(COALESCE(NEW.etapa, ''))) LIKE '%ganad%')
EXECUTE FUNCTION trg_capture_close_date_forecast_on_close();

DROP TRIGGER IF EXISTS trg_clientes_capture_close_date_forecast_on_close_update ON clientes;
CREATE TRIGGER trg_clientes_capture_close_date_forecast_on_close_update
BEFORE UPDATE OF etapa, forecast_close_date, closed_at_real, owner_id ON clientes
FOR EACH ROW
WHEN (
    lower(trim(COALESCE(NEW.etapa, ''))) LIKE '%ganad%'
    AND (
        OLD.etapa IS DISTINCT FROM NEW.etapa
        OR OLD.forecast_close_date IS DISTINCT FROM NEW.forecast_close_date
        OR OLD.closed_at_real IS DISTINCT FROM NEW.closed_at_real
        OR OLD.owner_id IS DISTINCT FROM NEW.owner_id
    )
)
EXECUTE FUNCTION trg_capture_close_date_forecast_on_close();

CREATE OR REPLACE FUNCTION recompute_seller_forecast_reliability_metrics(
    p_seller_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_prob_score NUMERIC(6, 2) := 0;
    v_prob_n INTEGER := 0;
    v_prob_brier_avg NUMERIC := NULL;
    v_prob_raw_acc NUMERIC := NULL;

    v_value_score NUMERIC(6, 2) := 0;
    v_value_n INTEGER := 0;

    v_date_score NUMERIC(6, 2) := 0;
    v_date_n INTEGER := 0;
BEGIN
    IF p_seller_id IS NULL THEN
        RETURN;
    END IF;

    SELECT
        COUNT(*),
        AVG(POWER((COALESCE(c.forecast_outcome, 0)::NUMERIC) - (c.forecast_evaluated_probability::NUMERIC / 100.0), 2))
    INTO v_prob_n, v_prob_brier_avg
    FROM clientes c
    WHERE c.owner_id = p_seller_id
      AND c.forecast_evaluated_probability IS NOT NULL
      AND c.forecast_outcome IS NOT NULL;

    IF COALESCE(v_prob_n, 0) > 0 THEN
        v_prob_raw_acc := 1 - COALESCE(v_prob_brier_avg, 0);
        v_prob_score := GREATEST(
            0,
            LEAST(
                100,
                ROUND((v_prob_raw_acc * (v_prob_n::NUMERIC / (v_prob_n::NUMERIC + 4))) * 100, 2)
            )
        );
    END IF;

    SELECT
        COUNT(*),
        AVG(GREATEST(0, LEAST(100, 100 - COALESCE(c.value_forecast_pct_error, 100))))
    INTO v_value_n, v_value_score
    FROM clientes c
    WHERE c.owner_id = p_seller_id
      AND lower(trim(COALESCE(c.etapa, ''))) LIKE '%ganad%'
      AND c.value_forecast_pct_error IS NOT NULL;

    v_value_score := COALESCE(ROUND(v_value_score, 2), 0);

    SELECT
        COUNT(*),
        AVG(c.close_date_forecast_score)
    INTO v_date_n, v_date_score
    FROM clientes c
    WHERE c.owner_id = p_seller_id
      AND lower(trim(COALESCE(c.etapa, ''))) LIKE '%ganad%'
      AND c.close_date_forecast_score IS NOT NULL;

    v_date_score := COALESCE(ROUND(v_date_score, 2), 0);

    INSERT INTO seller_forecast_reliability_metrics (
        seller_id,
        probability_reliability_score,
        probability_reliability_samples,
        value_reliability_score,
        value_reliability_samples,
        close_date_reliability_score,
        close_date_reliability_samples,
        last_recomputed_at,
        updated_at
    )
    VALUES (
        p_seller_id,
        COALESCE(v_prob_score, 0),
        COALESCE(v_prob_n, 0),
        COALESCE(v_value_score, 0),
        COALESCE(v_value_n, 0),
        COALESCE(v_date_score, 0),
        COALESCE(v_date_n, 0),
        NOW(),
        NOW()
    )
    ON CONFLICT (seller_id)
    DO UPDATE SET
        probability_reliability_score = EXCLUDED.probability_reliability_score,
        probability_reliability_samples = EXCLUDED.probability_reliability_samples,
        value_reliability_score = EXCLUDED.value_reliability_score,
        value_reliability_samples = EXCLUDED.value_reliability_samples,
        close_date_reliability_score = EXCLUDED.close_date_reliability_score,
        close_date_reliability_samples = EXCLUDED.close_date_reliability_samples,
        last_recomputed_at = NOW(),
        updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION trg_refresh_seller_forecast_reliability_metrics_from_clientes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM recompute_seller_forecast_reliability_metrics(OLD.owner_id);
        RETURN OLD;
    END IF;

    IF TG_OP = 'INSERT' THEN
        PERFORM recompute_seller_forecast_reliability_metrics(NEW.owner_id);
        RETURN NEW;
    END IF;

    IF OLD.owner_id IS DISTINCT FROM NEW.owner_id THEN
        PERFORM recompute_seller_forecast_reliability_metrics(OLD.owner_id);
        PERFORM recompute_seller_forecast_reliability_metrics(NEW.owner_id);
    ELSE
        PERFORM recompute_seller_forecast_reliability_metrics(NEW.owner_id);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clientes_refresh_seller_forecast_reliability_metrics ON clientes;
CREATE TRIGGER trg_clientes_refresh_seller_forecast_reliability_metrics
AFTER INSERT OR UPDATE OF owner_id, etapa, forecast_evaluated_probability, forecast_outcome, value_forecast_pct_error, forecast_close_date, closed_at_real, close_date_forecast_score OR DELETE
ON clientes
FOR EACH ROW
EXECUTE FUNCTION trg_refresh_seller_forecast_reliability_metrics_from_clientes();

-- Backfill close-date scoring for won leads that already have a forecasted close date.
UPDATE clientes
SET closed_at_real = closed_at_real
WHERE lower(trim(COALESCE(etapa, ''))) LIKE '%ganad%'
  AND forecast_close_date IS NOT NULL;

-- Backfill seller metrics for all known sellers.
DO $$
DECLARE
    seller_record RECORD;
BEGIN
    FOR seller_record IN (
        SELECT DISTINCT id AS seller_id FROM profiles WHERE id IS NOT NULL
        UNION
        SELECT DISTINCT owner_id AS seller_id FROM clientes WHERE owner_id IS NOT NULL
    ) LOOP
        PERFORM recompute_seller_forecast_reliability_metrics(seller_record.seller_id);
    END LOOP;
END $$;
