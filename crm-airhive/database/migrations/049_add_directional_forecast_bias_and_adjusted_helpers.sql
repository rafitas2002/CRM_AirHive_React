-- Phase 3 for forecast reliability calibration.
-- Adds directional bias metrics (signed) and helper functions to compute
-- seller-adjusted forecasts from raw predictions using shrinkage by sample size.

ALTER TABLE IF EXISTS seller_forecast_reliability_metrics
    ADD COLUMN IF NOT EXISTS probability_bias_pct_signed NUMERIC(8, 4) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS value_bias_pct_signed NUMERIC(10, 4) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS value_mape_pct NUMERIC(10, 4) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS close_date_bias_days_signed NUMERIC(10, 4) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS close_date_mae_days NUMERIC(10, 4) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS model_version TEXT NOT NULL DEFAULT 'forecast_calibration_v1';

CREATE OR REPLACE FUNCTION compute_forecast_shrinkage_weight(
    p_samples INTEGER,
    p_k NUMERIC DEFAULT 8
)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_n NUMERIC;
    v_k NUMERIC;
BEGIN
    v_n := GREATEST(COALESCE(p_samples, 0), 0);
    v_k := GREATEST(COALESCE(p_k, 8), 0.0001);

    RETURN ROUND(v_n / (v_n + v_k), 6);
END;
$$;

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
        v_prob_score := GREATEST(
            0,
            LEAST(
                100,
                ROUND((v_prob_raw_acc * (v_prob_n::NUMERIC / (v_prob_n::NUMERIC + 4))) * 100, 2)
            )
        );
    END IF;
    v_prob_bias_pct_signed := COALESCE(ROUND(v_prob_bias_pct_signed, 4), 0);

    SELECT
        COUNT(*),
        AVG(GREATEST(0, LEAST(100, 100 - COALESCE(c.value_forecast_pct_error, 100)))),
        AVG(
            CASE
                WHEN COALESCE(c.value_forecast_estimated, 0) > 0
                 AND COALESCE(c.value_forecast_actual, c.valor_real_cierre) IS NOT NULL
                THEN ROUND((((COALESCE(c.value_forecast_actual, c.valor_real_cierre) - c.value_forecast_estimated)
                    / NULLIF(c.value_forecast_estimated, 0)) * 100.0), 6)
                ELSE NULL
            END
        ),
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
        COALESCE(v_date_score, 0),
        COALESCE(v_date_n, 0),
        COALESCE(v_date_bias_days_signed, 0),
        COALESCE(v_date_mae_days, 0),
        'forecast_calibration_v1',
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
        close_date_reliability_score = EXCLUDED.close_date_reliability_score,
        close_date_reliability_samples = EXCLUDED.close_date_reliability_samples,
        close_date_bias_days_signed = EXCLUDED.close_date_bias_days_signed,
        close_date_mae_days = EXCLUDED.close_date_mae_days,
        model_version = EXCLUDED.model_version,
        last_recomputed_at = NOW(),
        updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION compute_adjusted_seller_forecast_triplet(
    p_seller_id UUID,
    p_raw_probability NUMERIC,
    p_raw_value NUMERIC,
    p_raw_close_date DATE
)
RETURNS TABLE (
    adjusted_probability NUMERIC,
    adjusted_value NUMERIC,
    adjusted_close_date DATE,
    probability_shrinkage_weight NUMERIC,
    value_shrinkage_weight NUMERIC,
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
    v_value_weight NUMERIC := 0;
    v_date_weight NUMERIC := 0;
    v_prob_adj NUMERIC := p_raw_probability;
    v_value_adj NUMERIC := p_raw_value;
    v_date_adj DATE := p_raw_close_date;
    v_days_shift INTEGER := 0;
    v_effective_value_bias_pct NUMERIC := 0;
BEGIN
    SELECT *
    INTO v_metrics
    FROM seller_forecast_reliability_metrics
    WHERE seller_id = p_seller_id;

    IF NOT FOUND THEN
        RETURN QUERY
        SELECT
            ROUND(COALESCE(p_raw_probability, 0), 2),
            ROUND(COALESCE(p_raw_value, 0), 2),
            p_raw_close_date,
            0::NUMERIC,
            0::NUMERIC,
            0::NUMERIC;
        RETURN;
    END IF;

    v_prob_weight := compute_forecast_shrinkage_weight(v_metrics.probability_reliability_samples, 12);
    v_value_weight := compute_forecast_shrinkage_weight(v_metrics.value_reliability_samples, 10);
    v_date_weight := compute_forecast_shrinkage_weight(v_metrics.close_date_reliability_samples, 8);

    IF p_raw_probability IS NOT NULL THEN
        v_prob_adj := p_raw_probability + (COALESCE(v_metrics.probability_bias_pct_signed, 0) * v_prob_weight);
        v_prob_adj := GREATEST(0, LEAST(100, v_prob_adj));
    END IF;

    IF p_raw_value IS NOT NULL THEN
        v_effective_value_bias_pct := GREATEST(
            -50,
            LEAST(50, COALESCE(v_metrics.value_bias_pct_signed, 0) * v_value_weight)
        );
        v_value_adj := GREATEST(0, p_raw_value * (1 + (v_effective_value_bias_pct / 100.0)));
    END IF;

    IF p_raw_close_date IS NOT NULL THEN
        v_days_shift := ROUND(
            GREATEST(-90, LEAST(90, COALESCE(v_metrics.close_date_bias_days_signed, 0) * v_date_weight))
        );
        v_date_adj := (p_raw_close_date + v_days_shift);
    END IF;

    RETURN QUERY
    SELECT
        CASE WHEN v_prob_adj IS NULL THEN NULL ELSE ROUND(v_prob_adj, 2) END,
        CASE WHEN v_value_adj IS NULL THEN NULL ELSE ROUND(v_value_adj, 2) END,
        v_date_adj,
        ROUND(v_prob_weight, 6),
        ROUND(v_value_weight, 6),
        ROUND(v_date_weight, 6);
END;
$$;

-- Backfill new directional metrics for all known sellers.
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
