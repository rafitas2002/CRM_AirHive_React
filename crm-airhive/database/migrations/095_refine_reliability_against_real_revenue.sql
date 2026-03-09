-- Refine seller forecast reliability using full forecast timelines,
-- now scoring money forecasts directly against REAL closed revenue.
-- Goals:
-- 1) Penalize early forecast misses less than recent misses.
-- 2) Reward sellers who converge to accurate forecasts through meetings/snapshots.
-- 3) Support race reliability as a blend of close-probability reliability + monthly forecast reliability.

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
    v_prob_lead_n INTEGER := 0;
    v_prob_effective_n NUMERIC := 0;
    v_prob_brier_avg NUMERIC := NULL;
    v_prob_raw_acc NUMERIC := NULL;
    v_prob_bias_pct_signed NUMERIC(8, 4) := 0;

    v_value_score NUMERIC(6, 2) := 0;
    v_value_n INTEGER := 0;
    v_value_lead_n INTEGER := 0;
    v_value_effective_n NUMERIC := 0;
    v_value_score_avg NUMERIC := NULL;
    v_value_bias_pct_signed NUMERIC(10, 4) := 0;
    v_value_mape_pct NUMERIC(10, 4) := 0;

    v_impl_score NUMERIC(6, 2) := 0;
    v_impl_n INTEGER := 0;
    v_impl_lead_n INTEGER := 0;
    v_impl_effective_n NUMERIC := 0;
    v_impl_score_avg NUMERIC := NULL;
    v_impl_bias_pct_signed NUMERIC(10, 4) := 0;
    v_impl_mape_pct NUMERIC(10, 4) := 0;

    v_date_score NUMERIC(6, 2) := 0;
    v_date_n INTEGER := 0;
    v_date_lead_n INTEGER := 0;
    v_date_effective_n NUMERIC := 0;
    v_date_score_avg NUMERIC := NULL;
    v_date_bias_days_signed NUMERIC(10, 4) := 0;
    v_date_mae_days NUMERIC(10, 4) := 0;
    v_score_prior NUMERIC := 40;
    v_extra_snapshot_sample_weight NUMERIC := 0.20;
BEGIN
    IF p_seller_id IS NULL THEN
        RETURN;
    END IF;

    WITH seller_closed_leads AS (
        SELECT
            c.id AS lead_id,
            c.owner_id,
            lower(trim(COALESCE(c.etapa, ''))) AS stage_norm,
            CASE WHEN lower(trim(COALESCE(c.etapa, ''))) LIKE '%ganad%' THEN 1 ELSE 0 END AS forecast_outcome,
            COALESCE(c.closed_at_real, c.forecast_scored_at, c.created_at, NOW()) AS closed_at_source,
            COALESCE(c.closed_at_real::date, c.forecast_scored_at::date, c.created_at::date, NOW()::date) AS closed_date,
            c.created_at,
            c.forecast_scored_at,
            c.forecast_evaluated_probability,
            c.value_forecast_estimated,
            c.implementation_forecast_estimated,
            c.close_date_forecast_estimated,
            c.forecast_close_date,
            c.valor_real_cierre,
            c.valor_implementacion_real_cierre,
            c.value_forecast_actual,
            c.implementation_forecast_actual
        FROM clientes c
        WHERE c.owner_id = p_seller_id
          AND (
            lower(trim(COALESCE(c.etapa, ''))) LIKE '%cerrad%'
            OR lower(trim(COALESCE(c.etapa, ''))) LIKE '%ganad%'
            OR lower(trim(COALESCE(c.etapa, ''))) LIKE '%perdid%'
          )
    ),
    probability_observations AS (
        SELECT
            scl.lead_id,
            scl.forecast_outcome,
            obs.observed_at,
            obs.source_rank,
            obs.predicted_probability
        FROM seller_closed_leads scl
        JOIN (
            SELECT
                h.lead_id,
                h.created_at AS observed_at,
                1 AS source_rank,
                CASE
                    WHEN trim(COALESCE(h.new_value, '')) ~ '^-?[0-9]+([.][0-9]+)?$'
                    THEN trim(h.new_value)::NUMERIC
                    ELSE NULL
                END AS predicted_probability
            FROM lead_history h
            WHERE h.field_name = 'probabilidad'

            UNION ALL

            SELECT
                fs.lead_id,
                COALESCE(fs.snapshot_timestamp, fs.created_at, NOW()) AS observed_at,
                2 AS source_rank,
                fs.probability::NUMERIC AS predicted_probability
            FROM forecast_snapshots fs

            UNION ALL

            SELECT
                scl2.lead_id,
                COALESCE(scl2.forecast_scored_at, scl2.closed_at_source, scl2.created_at, NOW()) AS observed_at,
                3 AS source_rank,
                scl2.forecast_evaluated_probability::NUMERIC AS predicted_probability
            FROM seller_closed_leads scl2
        ) obs ON obs.lead_id = scl.lead_id
        WHERE obs.predicted_probability IS NOT NULL
          AND obs.predicted_probability >= 0
          AND obs.predicted_probability <= 100
    ),
    probability_weighted AS (
        SELECT
            po.lead_id,
            po.forecast_outcome,
            po.predicted_probability,
            POWER(
                (ROW_NUMBER() OVER (PARTITION BY po.lead_id ORDER BY po.observed_at ASC, po.source_rank ASC)::NUMERIC)
                / NULLIF((COUNT(*) OVER (PARTITION BY po.lead_id))::NUMERIC, 0),
                2.2
            ) AS temporal_weight
        FROM probability_observations po
    )
    SELECT
        COUNT(*)::INTEGER,
        COUNT(DISTINCT pw.lead_id)::INTEGER,
        SUM(pw.temporal_weight * POWER((pw.forecast_outcome::NUMERIC) - (pw.predicted_probability / 100.0), 2)) / NULLIF(SUM(pw.temporal_weight), 0),
        SUM(pw.temporal_weight * (((pw.forecast_outcome::NUMERIC) - (pw.predicted_probability / 100.0)) * 100.0)) / NULLIF(SUM(pw.temporal_weight), 0)
    INTO v_prob_n, v_prob_lead_n, v_prob_brier_avg, v_prob_bias_pct_signed
    FROM probability_weighted pw;

    IF COALESCE(v_prob_n, 0) > 0 THEN
        v_prob_effective_n := COALESCE(v_prob_lead_n, 0) + (GREATEST(COALESCE(v_prob_n, 0) - COALESCE(v_prob_lead_n, 0), 0) * v_extra_snapshot_sample_weight);
        v_prob_raw_acc := 1 - COALESCE(v_prob_brier_avg, 0);
        v_prob_score := GREATEST(
            0,
            LEAST(
                100,
                ROUND(
                    v_score_prior + ((((v_prob_raw_acc * 100) - v_score_prior) * (v_prob_effective_n / NULLIF(v_prob_effective_n + 6, 0)))),
                    2
                )
            )
        );
    END IF;
    v_prob_bias_pct_signed := COALESCE(ROUND(v_prob_bias_pct_signed, 4), 0);

    WITH seller_won_leads AS (
        SELECT
            c.id AS lead_id,
            c.owner_id,
            COALESCE(c.closed_at_real, c.forecast_scored_at, c.created_at, NOW()) AS closed_at_source,
            c.created_at,
            c.forecast_scored_at,
            c.value_forecast_estimated,
            c.implementation_forecast_estimated,
            COALESCE(c.valor_real_cierre, c.value_forecast_actual) AS monthly_real_value,
            COALESCE(c.valor_implementacion_real_cierre, c.implementation_forecast_actual) AS implementation_real_value
        FROM clientes c
        WHERE c.owner_id = p_seller_id
          AND lower(trim(COALESCE(c.etapa, ''))) LIKE '%ganad%'
    ),
    monthly_observations AS (
        SELECT
            swl.lead_id,
            swl.monthly_real_value,
            obs.observed_at,
            obs.source_rank,
            obs.forecast_value
        FROM seller_won_leads swl
        JOIN (
            SELECT
                h.lead_id,
                h.created_at AS observed_at,
                1 AS source_rank,
                CASE
                    WHEN trim(COALESCE(h.new_value, '')) ~ '^-?[0-9]+([.][0-9]+)?$'
                    THEN trim(h.new_value)::NUMERIC
                    ELSE NULL
                END AS forecast_value
            FROM lead_history h
            WHERE h.field_name IN ('valor_estimado', 'value_forecast_estimated')

            UNION ALL

            SELECT
                fs.lead_id,
                COALESCE(fs.snapshot_timestamp, fs.created_at, NOW()) AS observed_at,
                2 AS source_rank,
                fs.forecast_value_amount::NUMERIC AS forecast_value
            FROM forecast_snapshots fs

            UNION ALL

            SELECT
                swl2.lead_id,
                COALESCE(swl2.forecast_scored_at, swl2.closed_at_source, swl2.created_at, NOW()) AS observed_at,
                3 AS source_rank,
                swl2.value_forecast_estimated::NUMERIC AS forecast_value
            FROM seller_won_leads swl2
        ) obs ON obs.lead_id = swl.lead_id
        WHERE swl.monthly_real_value IS NOT NULL
          AND swl.monthly_real_value > 0
          AND obs.forecast_value IS NOT NULL
          AND obs.forecast_value > 0
    ),
    monthly_weighted AS (
        SELECT
            mo.lead_id,
            mo.monthly_real_value,
            mo.forecast_value,
            POWER(
                (ROW_NUMBER() OVER (PARTITION BY mo.lead_id ORDER BY mo.observed_at ASC, mo.source_rank ASC)::NUMERIC)
                / NULLIF((COUNT(*) OVER (PARTITION BY mo.lead_id))::NUMERIC, 0),
                2.2
            ) AS temporal_weight
        FROM monthly_observations mo
    )
    SELECT
        COUNT(*)::INTEGER,
        COUNT(DISTINCT mw.lead_id)::INTEGER,
        SUM(mw.temporal_weight * GREATEST(0, LEAST(100, 100 - LEAST(100, (ABS(mw.monthly_real_value - mw.forecast_value) / NULLIF(mw.monthly_real_value, 0)) * 100.0)))) / NULLIF(SUM(mw.temporal_weight), 0),
        SUM(mw.temporal_weight * (((mw.monthly_real_value - mw.forecast_value) / NULLIF(mw.monthly_real_value, 0)) * 100.0)) / NULLIF(SUM(mw.temporal_weight), 0),
        SUM(mw.temporal_weight * ((ABS(mw.monthly_real_value - mw.forecast_value) / NULLIF(mw.monthly_real_value, 0)) * 100.0)) / NULLIF(SUM(mw.temporal_weight), 0)
    INTO v_value_n, v_value_lead_n, v_value_score_avg, v_value_bias_pct_signed, v_value_mape_pct
    FROM monthly_weighted mw;

    IF COALESCE(v_value_n, 0) > 0 THEN
        v_value_effective_n := COALESCE(v_value_lead_n, 0) + (GREATEST(COALESCE(v_value_n, 0) - COALESCE(v_value_lead_n, 0), 0) * v_extra_snapshot_sample_weight);
        v_value_score := GREATEST(
            0,
            LEAST(
                100,
                COALESCE(
                    ROUND(
                        v_score_prior + (((COALESCE(v_value_score_avg, v_score_prior) - v_score_prior) * (v_value_effective_n / NULLIF(v_value_effective_n + 6, 0)))),
                        2
                    ),
                    v_score_prior
                )
            )
        );
    ELSE
        v_value_score := 0;
    END IF;
    v_value_bias_pct_signed := COALESCE(ROUND(v_value_bias_pct_signed, 4), 0);
    v_value_mape_pct := COALESCE(ROUND(v_value_mape_pct, 4), 0);

    WITH seller_won_leads AS (
        SELECT
            c.id AS lead_id,
            c.owner_id,
            COALESCE(c.closed_at_real, c.forecast_scored_at, c.created_at, NOW()) AS closed_at_source,
            c.created_at,
            c.forecast_scored_at,
            c.implementation_forecast_estimated,
            COALESCE(c.valor_implementacion_real_cierre, c.implementation_forecast_actual) AS implementation_real_value
        FROM clientes c
        WHERE c.owner_id = p_seller_id
          AND lower(trim(COALESCE(c.etapa, ''))) LIKE '%ganad%'
    ),
    implementation_observations AS (
        SELECT
            swl.lead_id,
            swl.implementation_real_value,
            obs.observed_at,
            obs.source_rank,
            obs.forecast_value
        FROM seller_won_leads swl
        JOIN (
            SELECT
                h.lead_id,
                h.created_at AS observed_at,
                1 AS source_rank,
                CASE
                    WHEN trim(COALESCE(h.new_value, '')) ~ '^-?[0-9]+([.][0-9]+)?$'
                    THEN trim(h.new_value)::NUMERIC
                    ELSE NULL
                END AS forecast_value
            FROM lead_history h
            WHERE h.field_name IN ('valor_implementacion_estimado', 'implementation_forecast_estimated')

            UNION ALL

            SELECT
                fs.lead_id,
                COALESCE(fs.snapshot_timestamp, fs.created_at, NOW()) AS observed_at,
                2 AS source_rank,
                fs.forecast_implementation_amount::NUMERIC AS forecast_value
            FROM forecast_snapshots fs

            UNION ALL

            SELECT
                swl2.lead_id,
                COALESCE(swl2.forecast_scored_at, swl2.closed_at_source, swl2.created_at, NOW()) AS observed_at,
                3 AS source_rank,
                swl2.implementation_forecast_estimated::NUMERIC AS forecast_value
            FROM seller_won_leads swl2
        ) obs ON obs.lead_id = swl.lead_id
        WHERE swl.implementation_real_value IS NOT NULL
          AND swl.implementation_real_value > 0
          AND obs.forecast_value IS NOT NULL
          AND obs.forecast_value > 0
    ),
    implementation_weighted AS (
        SELECT
            io.lead_id,
            io.implementation_real_value,
            io.forecast_value,
            POWER(
                (ROW_NUMBER() OVER (PARTITION BY io.lead_id ORDER BY io.observed_at ASC, io.source_rank ASC)::NUMERIC)
                / NULLIF((COUNT(*) OVER (PARTITION BY io.lead_id))::NUMERIC, 0),
                2.2
            ) AS temporal_weight
        FROM implementation_observations io
    )
    SELECT
        COUNT(*)::INTEGER,
        COUNT(DISTINCT iw.lead_id)::INTEGER,
        SUM(iw.temporal_weight * GREATEST(0, LEAST(100, 100 - LEAST(100, (ABS(iw.implementation_real_value - iw.forecast_value) / NULLIF(iw.implementation_real_value, 0)) * 100.0)))) / NULLIF(SUM(iw.temporal_weight), 0),
        SUM(iw.temporal_weight * (((iw.implementation_real_value - iw.forecast_value) / NULLIF(iw.implementation_real_value, 0)) * 100.0)) / NULLIF(SUM(iw.temporal_weight), 0),
        SUM(iw.temporal_weight * ((ABS(iw.implementation_real_value - iw.forecast_value) / NULLIF(iw.implementation_real_value, 0)) * 100.0)) / NULLIF(SUM(iw.temporal_weight), 0)
    INTO v_impl_n, v_impl_lead_n, v_impl_score_avg, v_impl_bias_pct_signed, v_impl_mape_pct
    FROM implementation_weighted iw;

    IF COALESCE(v_impl_n, 0) > 0 THEN
        v_impl_effective_n := COALESCE(v_impl_lead_n, 0) + (GREATEST(COALESCE(v_impl_n, 0) - COALESCE(v_impl_lead_n, 0), 0) * v_extra_snapshot_sample_weight);
        v_impl_score := GREATEST(
            0,
            LEAST(
                100,
                COALESCE(
                    ROUND(
                        v_score_prior + (((COALESCE(v_impl_score_avg, v_score_prior) - v_score_prior) * (v_impl_effective_n / NULLIF(v_impl_effective_n + 6, 0)))),
                        2
                    ),
                    v_score_prior
                )
            )
        );
    ELSE
        v_impl_score := 0;
    END IF;
    v_impl_bias_pct_signed := COALESCE(ROUND(v_impl_bias_pct_signed, 4), 0);
    v_impl_mape_pct := COALESCE(ROUND(v_impl_mape_pct, 4), 0);

    WITH seller_closed_leads AS (
        SELECT
            c.id AS lead_id,
            c.owner_id,
            COALESCE(c.closed_at_real, c.forecast_scored_at, c.created_at, NOW()) AS closed_at_source,
            COALESCE(c.closed_at_real::date, c.forecast_scored_at::date, c.created_at::date, NOW()::date) AS actual_close_date,
            c.created_at,
            c.forecast_scored_at,
            c.close_date_forecast_estimated,
            c.forecast_close_date
        FROM clientes c
        WHERE c.owner_id = p_seller_id
          AND (
            lower(trim(COALESCE(c.etapa, ''))) LIKE '%cerrad%'
            OR lower(trim(COALESCE(c.etapa, ''))) LIKE '%ganad%'
            OR lower(trim(COALESCE(c.etapa, ''))) LIKE '%perdid%'
          )
    ),
    close_date_observations AS (
        SELECT
            scl.lead_id,
            scl.actual_close_date,
            obs.observed_at,
            obs.source_rank,
            obs.forecast_close_date
        FROM seller_closed_leads scl
        JOIN (
            SELECT
                h.lead_id,
                h.created_at AS observed_at,
                1 AS source_rank,
                CASE
                    WHEN substring(trim(COALESCE(h.new_value, '')) FROM 1 FOR 10) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
                    THEN substring(trim(h.new_value) FROM 1 FOR 10)::DATE
                    ELSE NULL
                END AS forecast_close_date
            FROM lead_history h
            WHERE h.field_name = 'forecast_close_date'

            UNION ALL

            SELECT
                fs.lead_id,
                COALESCE(fs.snapshot_timestamp, fs.created_at, NOW()) AS observed_at,
                2 AS source_rank,
                fs.forecast_close_date::DATE AS forecast_close_date
            FROM forecast_snapshots fs

            UNION ALL

            SELECT
                scl2.lead_id,
                COALESCE(scl2.forecast_scored_at, scl2.closed_at_source, scl2.created_at, NOW()) AS observed_at,
                3 AS source_rank,
                COALESCE(scl2.close_date_forecast_estimated, scl2.forecast_close_date)::DATE AS forecast_close_date
            FROM seller_closed_leads scl2
        ) obs ON obs.lead_id = scl.lead_id
        WHERE obs.forecast_close_date IS NOT NULL
          AND scl.actual_close_date IS NOT NULL
    ),
    close_date_weighted AS (
        SELECT
            cdo.lead_id,
            cdo.actual_close_date,
            cdo.forecast_close_date,
            POWER(
                (ROW_NUMBER() OVER (PARTITION BY cdo.lead_id ORDER BY cdo.observed_at ASC, cdo.source_rank ASC)::NUMERIC)
                / NULLIF((COUNT(*) OVER (PARTITION BY cdo.lead_id))::NUMERIC, 0),
                2.2
            ) AS temporal_weight,
            (cdo.actual_close_date - cdo.forecast_close_date) AS signed_days_error,
            ABS(cdo.actual_close_date - cdo.forecast_close_date) AS abs_days_error
        FROM close_date_observations cdo
    )
    SELECT
        COUNT(*)::INTEGER,
        COUNT(DISTINCT cdw.lead_id)::INTEGER,
        SUM(cdw.temporal_weight * compute_close_date_forecast_score(cdw.abs_days_error)) / NULLIF(SUM(cdw.temporal_weight), 0),
        SUM(cdw.temporal_weight * cdw.signed_days_error::NUMERIC) / NULLIF(SUM(cdw.temporal_weight), 0),
        SUM(cdw.temporal_weight * cdw.abs_days_error::NUMERIC) / NULLIF(SUM(cdw.temporal_weight), 0)
    INTO v_date_n, v_date_lead_n, v_date_score_avg, v_date_bias_days_signed, v_date_mae_days
    FROM close_date_weighted cdw;

    IF COALESCE(v_date_n, 0) > 0 THEN
        v_date_effective_n := COALESCE(v_date_lead_n, 0) + (GREATEST(COALESCE(v_date_n, 0) - COALESCE(v_date_lead_n, 0), 0) * v_extra_snapshot_sample_weight);
        v_date_score := GREATEST(
            0,
            LEAST(
                100,
                COALESCE(
                    ROUND(
                        v_score_prior + (((COALESCE(v_date_score_avg, v_score_prior) - v_score_prior) * (v_date_effective_n / NULLIF(v_date_effective_n + 6, 0)))),
                        2
                    ),
                    v_score_prior
                )
            )
        );
    ELSE
        v_date_score := 0;
    END IF;
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
        GREATEST(COALESCE(v_prob_lead_n, 0), ROUND(COALESCE(v_prob_effective_n, 0))::INTEGER),
        COALESCE(v_prob_bias_pct_signed, 0),
        COALESCE(v_value_score, 0),
        GREATEST(COALESCE(v_value_lead_n, 0), ROUND(COALESCE(v_value_effective_n, 0))::INTEGER),
        COALESCE(v_value_bias_pct_signed, 0),
        COALESCE(v_value_mape_pct, 0),
        COALESCE(v_impl_score, 0),
        GREATEST(COALESCE(v_impl_lead_n, 0), ROUND(COALESCE(v_impl_effective_n, 0))::INTEGER),
        COALESCE(v_impl_bias_pct_signed, 0),
        COALESCE(v_impl_mape_pct, 0),
        COALESCE(v_date_score, 0),
        GREATEST(COALESCE(v_date_lead_n, 0), ROUND(COALESCE(v_date_effective_n, 0))::INTEGER),
        COALESCE(v_date_bias_days_signed, 0),
        COALESCE(v_date_mae_days, 0),
        'forecast_calibration_v6_balanced_snapshot_weight',
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

-- Backfill recalculation for all known sellers under the new weighted model.
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
