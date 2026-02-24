-- Phase 4: add implementation forecast (one-time fee) alongside monthly forecast.
-- Existing generic "value forecast" remains as the monthly forecast semantics.

ALTER TABLE IF EXISTS clientes
    ADD COLUMN IF NOT EXISTS valor_implementacion_estimado NUMERIC(14, 2) NULL,
    ADD COLUMN IF NOT EXISTS valor_implementacion_real_cierre NUMERIC(14, 2) NULL,
    ADD COLUMN IF NOT EXISTS implementation_forecast_estimated NUMERIC(14, 2) NULL,
    ADD COLUMN IF NOT EXISTS implementation_forecast_actual NUMERIC(14, 2) NULL,
    ADD COLUMN IF NOT EXISTS implementation_forecast_abs_error NUMERIC(14, 2) NULL,
    ADD COLUMN IF NOT EXISTS implementation_forecast_pct_error NUMERIC(8, 4) NULL,
    ADD COLUMN IF NOT EXISTS implementation_forecast_scored_at TIMESTAMPTZ NULL;

ALTER TABLE IF EXISTS forecast_snapshots
    ADD COLUMN IF NOT EXISTS forecast_implementation_amount NUMERIC(14, 2) NULL;

CREATE TABLE IF NOT EXISTS lead_implementation_forecast_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id BIGINT NOT NULL UNIQUE REFERENCES clientes(id) ON DELETE CASCADE,
    seller_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    estimated_value NUMERIC(14, 2) NOT NULL,
    actual_value NUMERIC(14, 2) NOT NULL,
    abs_error NUMERIC(14, 2) NOT NULL,
    pct_error NUMERIC(8, 4),
    source TEXT NOT NULL DEFAULT 'lead_closed_won',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_implementation_forecast_snapshots_seller
    ON lead_implementation_forecast_snapshots (seller_id, created_at DESC);

CREATE OR REPLACE FUNCTION trg_capture_implementation_forecast_on_close()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_won BOOLEAN;
    v_estimated NUMERIC(14, 2);
    v_actual NUMERIC(14, 2);
    v_abs NUMERIC(14, 2);
    v_pct NUMERIC(8, 4);
BEGIN
    v_is_won := lower(trim(COALESCE(NEW.etapa, ''))) LIKE '%ganad%';
    IF NOT v_is_won THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        v_estimated := COALESCE(NEW.valor_implementacion_estimado, 0)::NUMERIC(14, 2);
    ELSE
        v_estimated := COALESCE(OLD.valor_implementacion_estimado, NEW.valor_implementacion_estimado, 0)::NUMERIC(14, 2);
    END IF;

    v_actual := COALESCE(NEW.valor_implementacion_real_cierre, NEW.valor_implementacion_estimado, 0)::NUMERIC(14, 2);
    v_abs := ABS(v_actual - v_estimated)::NUMERIC(14, 2);
    v_pct := CASE WHEN v_estimated > 0 THEN ROUND((v_abs / v_estimated) * 100, 4)::NUMERIC(8, 4) ELSE NULL END;

    NEW.implementation_forecast_estimated := v_estimated;
    NEW.implementation_forecast_actual := v_actual;
    NEW.implementation_forecast_abs_error := v_abs;
    NEW.implementation_forecast_pct_error := v_pct;
    NEW.implementation_forecast_scored_at := NOW();

    INSERT INTO lead_implementation_forecast_snapshots (
        lead_id,
        seller_id,
        estimated_value,
        actual_value,
        abs_error,
        pct_error,
        source
    )
    VALUES (
        NEW.id,
        NEW.owner_id,
        v_estimated,
        v_actual,
        v_abs,
        v_pct,
        'lead_closed_won'
    )
    ON CONFLICT (lead_id)
    DO UPDATE SET
        seller_id = EXCLUDED.seller_id,
        estimated_value = EXCLUDED.estimated_value,
        actual_value = EXCLUDED.actual_value,
        abs_error = EXCLUDED.abs_error,
        pct_error = EXCLUDED.pct_error,
        source = EXCLUDED.source,
        created_at = NOW();

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clientes_capture_implementation_forecast_on_close_insert ON clientes;
CREATE TRIGGER trg_clientes_capture_implementation_forecast_on_close_insert
BEFORE INSERT ON clientes
FOR EACH ROW
WHEN (lower(trim(COALESCE(NEW.etapa, ''))) LIKE '%ganad%')
EXECUTE FUNCTION trg_capture_implementation_forecast_on_close();

DROP TRIGGER IF EXISTS trg_clientes_capture_implementation_forecast_on_close_update ON clientes;
CREATE TRIGGER trg_clientes_capture_implementation_forecast_on_close_update
BEFORE UPDATE OF etapa, valor_implementacion_estimado, valor_implementacion_real_cierre, owner_id ON clientes
FOR EACH ROW
WHEN (
    lower(trim(COALESCE(NEW.etapa, ''))) LIKE '%ganad%'
    AND (
        OLD.etapa IS DISTINCT FROM NEW.etapa
        OR OLD.valor_implementacion_estimado IS DISTINCT FROM NEW.valor_implementacion_estimado
        OR OLD.valor_implementacion_real_cierre IS DISTINCT FROM NEW.valor_implementacion_real_cierre
        OR OLD.owner_id IS DISTINCT FROM NEW.owner_id
    )
)
EXECUTE FUNCTION trg_capture_implementation_forecast_on_close();

ALTER TABLE IF EXISTS seller_forecast_reliability_metrics
    ADD COLUMN IF NOT EXISTS implementation_reliability_score NUMERIC(6, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS implementation_reliability_samples INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS implementation_bias_pct_signed NUMERIC(10, 4) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS implementation_mape_pct NUMERIC(10, 4) NOT NULL DEFAULT 0;

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
    v_prob_bias_pct_signed NUMERIC(8, 4) := 0;

    v_value_score NUMERIC(6, 2) := 0;
    v_value_n INTEGER := 0;
    v_value_score_avg NUMERIC := NULL;
    v_value_bias_pct_signed NUMERIC(10, 4) := 0;
    v_value_mape_pct NUMERIC(10, 4) := 0;

    v_impl_score NUMERIC(6, 2) := 0;
    v_impl_n INTEGER := 0;
    v_impl_score_avg NUMERIC := NULL;
    v_impl_bias_pct_signed NUMERIC(10, 4) := 0;
    v_impl_mape_pct NUMERIC(10, 4) := 0;

    v_date_score NUMERIC(6, 2) := 0;
    v_date_n INTEGER := 0;
    v_date_score_avg NUMERIC := NULL;
    v_date_bias_days_signed NUMERIC(10, 4) := 0;
    v_date_mae_days NUMERIC(10, 4) := 0;
BEGIN
    IF p_seller_id IS NULL THEN
        RETURN;
    END IF;

    SELECT
        COUNT(*),
        AVG(POWER((COALESCE(c.forecast_outcome, 0)::NUMERIC) - (c.forecast_evaluated_probability::NUMERIC / 100.0), 2)),
        AVG(((COALESCE(c.forecast_outcome, 0)::NUMERIC) - (c.forecast_evaluated_probability::NUMERIC / 100.0)) * 100.0)
    INTO v_prob_n, v_prob_brier_avg, v_prob_bias_pct_signed
    FROM clientes c
    WHERE c.owner_id = p_seller_id
      AND c.forecast_evaluated_probability IS NOT NULL
      AND c.forecast_outcome IS NOT NULL;

    IF COALESCE(v_prob_n, 0) > 0 THEN
        v_prob_raw_acc := 1 - COALESCE(v_prob_brier_avg, 0);
        v_prob_score := GREATEST(0, LEAST(100, ROUND((v_prob_raw_acc * (v_prob_n::NUMERIC / (v_prob_n::NUMERIC + 4))) * 100, 2)));
    END IF;
    v_prob_bias_pct_signed := COALESCE(ROUND(v_prob_bias_pct_signed, 4), 0);

    SELECT
        COUNT(*),
        AVG(GREATEST(0, LEAST(100, 100 - COALESCE(c.value_forecast_pct_error, 100)))),
        AVG(CASE
            WHEN COALESCE(c.value_forecast_estimated, 0) > 0 AND COALESCE(c.value_forecast_actual, c.valor_real_cierre) IS NOT NULL
            THEN (((COALESCE(c.value_forecast_actual, c.valor_real_cierre) - c.value_forecast_estimated) / NULLIF(c.value_forecast_estimated, 0)) * 100.0)
            ELSE NULL
        END),
        AVG(c.value_forecast_pct_error)
    INTO v_value_n, v_value_score_avg, v_value_bias_pct_signed, v_value_mape_pct
    FROM clientes c
    WHERE c.owner_id = p_seller_id
      AND lower(trim(COALESCE(c.etapa, ''))) LIKE '%ganad%'
      AND c.value_forecast_pct_error IS NOT NULL;

    v_value_score := COALESCE(ROUND(v_value_score_avg, 2), 0);
    v_value_bias_pct_signed := COALESCE(ROUND(v_value_bias_pct_signed, 4), 0);
    v_value_mape_pct := COALESCE(ROUND(v_value_mape_pct, 4), 0);

    SELECT
        COUNT(*),
        AVG(GREATEST(0, LEAST(100, 100 - COALESCE(c.implementation_forecast_pct_error, 100)))),
        AVG(CASE
            WHEN COALESCE(c.implementation_forecast_estimated, 0) > 0 AND COALESCE(c.implementation_forecast_actual, c.valor_implementacion_real_cierre) IS NOT NULL
            THEN (((COALESCE(c.implementation_forecast_actual, c.valor_implementacion_real_cierre) - c.implementation_forecast_estimated) / NULLIF(c.implementation_forecast_estimated, 0)) * 100.0)
            ELSE NULL
        END),
        AVG(c.implementation_forecast_pct_error)
    INTO v_impl_n, v_impl_score_avg, v_impl_bias_pct_signed, v_impl_mape_pct
    FROM clientes c
    WHERE c.owner_id = p_seller_id
      AND lower(trim(COALESCE(c.etapa, ''))) LIKE '%ganad%'
      AND c.implementation_forecast_pct_error IS NOT NULL;

    v_impl_score := COALESCE(ROUND(v_impl_score_avg, 2), 0);
    v_impl_bias_pct_signed := COALESCE(ROUND(v_impl_bias_pct_signed, 4), 0);
    v_impl_mape_pct := COALESCE(ROUND(v_impl_mape_pct, 4), 0);

    SELECT
        COUNT(*),
        AVG(c.close_date_forecast_score),
        AVG(c.close_date_forecast_days_error),
        AVG(c.close_date_forecast_abs_days_error)
    INTO v_date_n, v_date_score_avg, v_date_bias_days_signed, v_date_mae_days
    FROM clientes c
    WHERE c.owner_id = p_seller_id
      AND lower(trim(COALESCE(c.etapa, ''))) LIKE '%ganad%'
      AND c.close_date_forecast_score IS NOT NULL;

    v_date_score := COALESCE(ROUND(v_date_score_avg, 2), 0);
    v_date_bias_days_signed := COALESCE(ROUND(v_date_bias_days_signed, 4), 0);
    v_date_mae_days := COALESCE(ROUND(v_date_mae_days, 4), 0);

    INSERT INTO seller_forecast_reliability_metrics (
        seller_id,
        probability_reliability_score,
        probability_reliability_samples,
        probability_bias_pct_signed,
        value_reliability_score,
        value_reliability_samples,
        value_bias_pct_signed,
        value_mape_pct,
        implementation_reliability_score,
        implementation_reliability_samples,
        implementation_bias_pct_signed,
        implementation_mape_pct,
        close_date_reliability_score,
        close_date_reliability_samples,
        close_date_bias_days_signed,
        close_date_mae_days,
        model_version,
        last_recomputed_at,
        updated_at
    )
    VALUES (
        p_seller_id,
        COALESCE(v_prob_score, 0),
        COALESCE(v_prob_n, 0),
        COALESCE(v_prob_bias_pct_signed, 0),
        COALESCE(v_value_score, 0),
        COALESCE(v_value_n, 0),
        COALESCE(v_value_bias_pct_signed, 0),
        COALESCE(v_value_mape_pct, 0),
        COALESCE(v_impl_score, 0),
        COALESCE(v_impl_n, 0),
        COALESCE(v_impl_bias_pct_signed, 0),
        COALESCE(v_impl_mape_pct, 0),
        COALESCE(v_date_score, 0),
        COALESCE(v_date_n, 0),
        COALESCE(v_date_bias_days_signed, 0),
        COALESCE(v_date_mae_days, 0),
        'forecast_calibration_v2',
        NOW(),
        NOW()
    )
    ON CONFLICT (seller_id)
    DO UPDATE SET
        probability_reliability_score = EXCLUDED.probability_reliability_score,
        probability_reliability_samples = EXCLUDED.probability_reliability_samples,
        probability_bias_pct_signed = EXCLUDED.probability_bias_pct_signed,
        value_reliability_score = EXCLUDED.value_reliability_score,
        value_reliability_samples = EXCLUDED.value_reliability_samples,
        value_bias_pct_signed = EXCLUDED.value_bias_pct_signed,
        value_mape_pct = EXCLUDED.value_mape_pct,
        implementation_reliability_score = EXCLUDED.implementation_reliability_score,
        implementation_reliability_samples = EXCLUDED.implementation_reliability_samples,
        implementation_bias_pct_signed = EXCLUDED.implementation_bias_pct_signed,
        implementation_mape_pct = EXCLUDED.implementation_mape_pct,
        close_date_reliability_score = EXCLUDED.close_date_reliability_score,
        close_date_reliability_samples = EXCLUDED.close_date_reliability_samples,
        close_date_bias_days_signed = EXCLUDED.close_date_bias_days_signed,
        close_date_mae_days = EXCLUDED.close_date_mae_days,
        model_version = EXCLUDED.model_version,
        last_recomputed_at = NOW(),
        updated_at = NOW();
END;
$$;

DROP TRIGGER IF EXISTS trg_clientes_refresh_seller_forecast_reliability_metrics ON clientes;
CREATE TRIGGER trg_clientes_refresh_seller_forecast_reliability_metrics
AFTER INSERT OR UPDATE OF owner_id, etapa, forecast_evaluated_probability, forecast_outcome, value_forecast_pct_error, implementation_forecast_pct_error, forecast_close_date, closed_at_real, close_date_forecast_score OR DELETE
ON clientes
FOR EACH ROW
EXECUTE FUNCTION trg_refresh_seller_forecast_reliability_metrics_from_clientes();

CREATE OR REPLACE FUNCTION compute_adjusted_seller_forecast_quartet(
    p_seller_id UUID,
    p_raw_probability NUMERIC,
    p_raw_monthly_value NUMERIC,
    p_raw_implementation_value NUMERIC,
    p_raw_close_date DATE
)
RETURNS TABLE (
    adjusted_probability NUMERIC,
    adjusted_monthly_value NUMERIC,
    adjusted_implementation_value NUMERIC,
    adjusted_close_date DATE,
    probability_shrinkage_weight NUMERIC,
    monthly_value_shrinkage_weight NUMERIC,
    implementation_value_shrinkage_weight NUMERIC,
    close_date_shrinkage_weight NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_metrics seller_forecast_reliability_metrics%ROWTYPE;
    v_prob_weight NUMERIC := 0;
    v_monthly_weight NUMERIC := 0;
    v_impl_weight NUMERIC := 0;
    v_date_weight NUMERIC := 0;
    v_prob_adj NUMERIC := p_raw_probability;
    v_monthly_adj NUMERIC := p_raw_monthly_value;
    v_impl_adj NUMERIC := p_raw_implementation_value;
    v_date_adj DATE := p_raw_close_date;
    v_days_shift INTEGER := 0;
    v_effective_monthly_bias_pct NUMERIC := 0;
    v_effective_impl_bias_pct NUMERIC := 0;
BEGIN
    SELECT * INTO v_metrics
    FROM seller_forecast_reliability_metrics
    WHERE seller_id = p_seller_id;

    IF NOT FOUND THEN
        RETURN QUERY
        SELECT
            ROUND(COALESCE(p_raw_probability, 0), 2),
            ROUND(COALESCE(p_raw_monthly_value, 0), 2),
            ROUND(COALESCE(p_raw_implementation_value, 0), 2),
            p_raw_close_date,
            0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC;
        RETURN;
    END IF;

    v_prob_weight := compute_forecast_shrinkage_weight(v_metrics.probability_reliability_samples, 12);
    v_monthly_weight := compute_forecast_shrinkage_weight(v_metrics.value_reliability_samples, 10);
    v_impl_weight := compute_forecast_shrinkage_weight(v_metrics.implementation_reliability_samples, 10);
    v_date_weight := compute_forecast_shrinkage_weight(v_metrics.close_date_reliability_samples, 8);

    IF p_raw_probability IS NOT NULL THEN
        v_prob_adj := GREATEST(0, LEAST(100, p_raw_probability + (COALESCE(v_metrics.probability_bias_pct_signed, 0) * v_prob_weight)));
    END IF;

    IF p_raw_monthly_value IS NOT NULL THEN
        v_effective_monthly_bias_pct := GREATEST(-50, LEAST(50, COALESCE(v_metrics.value_bias_pct_signed, 0) * v_monthly_weight));
        v_monthly_adj := GREATEST(0, p_raw_monthly_value * (1 + (v_effective_monthly_bias_pct / 100.0)));
    END IF;

    IF p_raw_implementation_value IS NOT NULL THEN
        v_effective_impl_bias_pct := GREATEST(-50, LEAST(50, COALESCE(v_metrics.implementation_bias_pct_signed, 0) * v_impl_weight));
        v_impl_adj := GREATEST(0, p_raw_implementation_value * (1 + (v_effective_impl_bias_pct / 100.0)));
    END IF;

    IF p_raw_close_date IS NOT NULL THEN
        v_days_shift := ROUND(GREATEST(-90, LEAST(90, COALESCE(v_metrics.close_date_bias_days_signed, 0) * v_date_weight)));
        v_date_adj := (p_raw_close_date + v_days_shift);
    END IF;

    RETURN QUERY
    SELECT
        CASE WHEN v_prob_adj IS NULL THEN NULL ELSE ROUND(v_prob_adj, 2) END,
        CASE WHEN v_monthly_adj IS NULL THEN NULL ELSE ROUND(v_monthly_adj, 2) END,
        CASE WHEN v_impl_adj IS NULL THEN NULL ELSE ROUND(v_impl_adj, 2) END,
        v_date_adj,
        ROUND(v_prob_weight, 6),
        ROUND(v_monthly_weight, 6),
        ROUND(v_impl_weight, 6),
        ROUND(v_date_weight, 6);
END;
$$;

-- Backfill implementation forecast scoring from already won leads where values exist.
UPDATE clientes c
SET valor_implementacion_real_cierre = COALESCE(c.valor_implementacion_real_cierre, c.valor_implementacion_estimado)
WHERE lower(trim(COALESCE(c.etapa, ''))) LIKE '%ganad%'
  AND c.valor_implementacion_estimado IS NOT NULL;

UPDATE clientes
SET valor_implementacion_estimado = valor_implementacion_estimado
WHERE lower(trim(COALESCE(etapa, ''))) LIKE '%ganad%'
  AND valor_implementacion_estimado IS NOT NULL;

-- Backfill new metrics for all known sellers.
DO $$
DECLARE
    seller_record RECORD;
BEGIN
    FOR seller_record IN (
        SELECT DISTINCT id AS seller_id FROM profiles WHERE id IS NOT NULL
        UNION
        SELECT DISTINCT owner_id AS seller_id FROM clientes WHERE owner_id IS NOT NULL
        UNION
        SELECT DISTINCT seller_id FROM seller_forecast_reliability_metrics WHERE seller_id IS NOT NULL
    ) LOOP
        PERFORM recompute_seller_forecast_reliability_metrics(seller_record.seller_id);
    END LOOP;
END $$;
