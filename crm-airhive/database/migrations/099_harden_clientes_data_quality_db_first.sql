-- Refuerza calidad de datos en clientes con enfoque DB-first.
-- Objetivo: evitar inconsistencias aunque falle/omita validación frontend.

-- 1) Normalización robusta de etapa (expande el comportamiento de 096)
CREATE OR REPLACE FUNCTION normalize_legacy_prospeccion_stage_on_clientes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    normalized_stage TEXT;
BEGIN
    normalized_stage := lower(trim(coalesce(NEW.etapa, '')));

    IF normalized_stage IN (
        '',
        'prospección',
        'prospeccion',
        'negociación',
        'negociacion',
        'en negociación',
        'en negociacion',
        'nuevo',
        'nueva',
        'open',
        'activa',
        'activo'
    ) THEN
        NEW.etapa := 'Negociación';
    ELSIF normalized_stage IN (
        'cerrado ganado',
        'cerrada ganada',
        'ganado',
        'ganada',
        'closed won',
        'won'
    ) THEN
        NEW.etapa := 'Cerrado Ganado';
    ELSIF normalized_stage IN (
        'cerrado perdido',
        'cerrada perdida',
        'perdido',
        'perdida',
        'closed lost',
        'lost'
    ) THEN
        NEW.etapa := 'Cerrado Perdido';
    ELSE
        RAISE EXCEPTION 'Etapa no válida: "%". Usa Negociación, Cerrado Ganado o Cerrado Perdido.', coalesce(NEW.etapa, '')
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clientes_normalize_legacy_prospeccion_stage ON clientes;
CREATE TRIGGER trg_clientes_normalize_legacy_prospeccion_stage
BEFORE INSERT OR UPDATE OF etapa
ON clientes
FOR EACH ROW
EXECUTE FUNCTION normalize_legacy_prospeccion_stage_on_clientes();

-- 2) Validador central de calidad para columnas críticas
CREATE OR REPLACE FUNCTION validate_clientes_core_data_quality_db_first()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_new JSONB := to_jsonb(NEW);
    v_old JSONB := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::JSONB END;

    v_stage_norm TEXT := lower(trim(coalesce(v_new->>'etapa', '')));
    v_stage_changed BOOLEAN := TG_OP = 'INSERT'
        OR coalesce(v_new->>'etapa', '') IS DISTINCT FROM coalesce(v_old->>'etapa', '');
    v_prob_changed BOOLEAN := TG_OP = 'INSERT'
        OR coalesce(v_new->>'probabilidad', '') IS DISTINCT FROM coalesce(v_old->>'probabilidad', '');
    v_forecast_eval_prob_changed BOOLEAN := TG_OP = 'INSERT'
        OR coalesce(v_new->>'forecast_evaluated_probability', '') IS DISTINCT FROM coalesce(v_old->>'forecast_evaluated_probability', '');
    v_calificacion_changed BOOLEAN := TG_OP = 'INSERT'
        OR coalesce(v_new->>'calificacion', '') IS DISTINCT FROM coalesce(v_old->>'calificacion', '');
    v_valor_estimado_changed BOOLEAN := TG_OP = 'INSERT'
        OR coalesce(v_new->>'valor_estimado', '') IS DISTINCT FROM coalesce(v_old->>'valor_estimado', '');
    v_valor_real_changed BOOLEAN := TG_OP = 'INSERT'
        OR coalesce(v_new->>'valor_real_cierre', '') IS DISTINCT FROM coalesce(v_old->>'valor_real_cierre', '');
    v_valor_impl_estimado_changed BOOLEAN := TG_OP = 'INSERT'
        OR coalesce(v_new->>'valor_implementacion_estimado', '') IS DISTINCT FROM coalesce(v_old->>'valor_implementacion_estimado', '');
    v_valor_impl_real_changed BOOLEAN := TG_OP = 'INSERT'
        OR coalesce(v_new->>'valor_implementacion_real_cierre', '') IS DISTINCT FROM coalesce(v_old->>'valor_implementacion_real_cierre', '');

    v_loss_fields_changed BOOLEAN := TG_OP = 'INSERT'
        OR coalesce(v_new->>'loss_reason_id', '') IS DISTINCT FROM coalesce(v_old->>'loss_reason_id', '')
        OR coalesce(v_new->>'loss_subreason_id', '') IS DISTINCT FROM coalesce(v_old->>'loss_subreason_id', '');

    v_won_value_fields_changed BOOLEAN := TG_OP = 'INSERT'
        OR coalesce(v_new->>'valor_real_cierre', '') IS DISTINCT FROM coalesce(v_old->>'valor_real_cierre', '')
        OR coalesce(v_new->>'valor_implementacion_real_cierre', '') IS DISTINCT FROM coalesce(v_old->>'valor_implementacion_real_cierre', '');

    v_probabilidad NUMERIC := NULLIF(BTRIM(COALESCE(v_new->>'probabilidad', '')), '')::NUMERIC;
    v_forecast_eval_prob NUMERIC := NULLIF(BTRIM(COALESCE(v_new->>'forecast_evaluated_probability', '')), '')::NUMERIC;
    v_calificacion NUMERIC := NULLIF(BTRIM(COALESCE(v_new->>'calificacion', '')), '')::NUMERIC;
    v_valor_estimado NUMERIC := NULLIF(BTRIM(COALESCE(v_new->>'valor_estimado', '')), '')::NUMERIC;
    v_valor_real_cierre NUMERIC := NULLIF(BTRIM(COALESCE(v_new->>'valor_real_cierre', '')), '')::NUMERIC;
    v_valor_impl_estimado NUMERIC := NULLIF(BTRIM(COALESCE(v_new->>'valor_implementacion_estimado', '')), '')::NUMERIC;
    v_valor_impl_real NUMERIC := NULLIF(BTRIM(COALESCE(v_new->>'valor_implementacion_real_cierre', '')), '')::NUMERIC;

    v_loss_reason_raw TEXT := NULLIF(BTRIM(COALESCE(v_new->>'loss_reason_id', '')), '');
    v_loss_subreason_raw TEXT := NULLIF(BTRIM(COALESCE(v_new->>'loss_subreason_id', '')), '');

    v_is_won BOOLEAN := v_stage_norm IN ('cerrado ganado', 'cerrada ganada', 'ganado', 'ganada', 'closed won', 'won');
    v_is_lost BOOLEAN := v_stage_norm IN ('cerrado perdido', 'cerrada perdida', 'perdido', 'perdida', 'closed lost', 'lost');
BEGIN
    -- Etapa permitida (solo cuando cambia)
    IF v_stage_changed THEN
        IF v_stage_norm NOT IN ('negociación', 'negociacion', 'cerrado ganado', 'cerrada ganada', 'cerrado perdido', 'cerrada perdida') THEN
            RAISE EXCEPTION 'Etapa no válida en clientes: "%".', coalesce(v_new->>'etapa', '')
                USING ERRCODE = '23514';
        END IF;
    END IF;

    -- Rangos numéricos base
    IF v_prob_changed AND v_probabilidad IS NOT NULL AND (v_probabilidad < 0 OR v_probabilidad > 100) THEN
        RAISE EXCEPTION 'La probabilidad debe estar entre 0 y 100.'
            USING ERRCODE = '23514';
    END IF;

    IF v_forecast_eval_prob_changed AND v_forecast_eval_prob IS NOT NULL AND (v_forecast_eval_prob < 0 OR v_forecast_eval_prob > 100) THEN
        RAISE EXCEPTION 'forecast_evaluated_probability debe estar entre 0 y 100.'
            USING ERRCODE = '23514';
    END IF;

    IF v_calificacion_changed AND v_calificacion IS NOT NULL AND (v_calificacion < 1 OR v_calificacion > 5) THEN
        RAISE EXCEPTION 'La calificación debe estar entre 1 y 5.'
            USING ERRCODE = '23514';
    END IF;

    IF v_valor_estimado_changed AND v_valor_estimado IS NOT NULL AND v_valor_estimado < 0 THEN
        RAISE EXCEPTION 'valor_estimado no puede ser negativo.'
            USING ERRCODE = '23514';
    END IF;

    IF v_valor_real_changed AND v_valor_real_cierre IS NOT NULL AND v_valor_real_cierre < 0 THEN
        RAISE EXCEPTION 'valor_real_cierre no puede ser negativo.'
            USING ERRCODE = '23514';
    END IF;

    IF v_valor_impl_estimado_changed AND v_valor_impl_estimado IS NOT NULL AND v_valor_impl_estimado < 0 THEN
        RAISE EXCEPTION 'valor_implementacion_estimado no puede ser negativo.'
            USING ERRCODE = '23514';
    END IF;

    IF v_valor_impl_real_changed AND v_valor_impl_real IS NOT NULL AND v_valor_impl_real < 0 THEN
        RAISE EXCEPTION 'valor_implementacion_real_cierre no puede ser negativo.'
            USING ERRCODE = '23514';
    END IF;

    -- Reglas no negociables en cierre ganado (cuando cambia etapa o campos reales)
    IF v_is_won AND (v_stage_changed OR v_won_value_fields_changed) THEN
        IF COALESCE(v_valor_real_cierre, 0) <= 0 THEN
            RAISE EXCEPTION 'Cerrado Ganado requiere mensualidad real (valor_real_cierre) mayor a 0.'
                USING ERRCODE = '23514';
        END IF;

        IF COALESCE(v_valor_impl_real, 0) <= 0 THEN
            RAISE EXCEPTION 'Cerrado Ganado requiere valor de implementación real (valor_implementacion_real_cierre) mayor a 0.'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    -- Reglas mínimas en cierre perdido (cuando cambia etapa o motivo/submotivo)
    IF v_is_lost AND (v_stage_changed OR v_loss_fields_changed) THEN
        IF v_loss_reason_raw IS NULL OR v_loss_subreason_raw IS NULL THEN
            RAISE EXCEPTION 'Cerrado Perdido requiere motivo y submotivo.'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clientes_validate_core_data_quality_db_first ON clientes;
CREATE TRIGGER trg_clientes_validate_core_data_quality_db_first
BEFORE INSERT OR UPDATE
ON clientes
FOR EACH ROW
EXECUTE FUNCTION validate_clientes_core_data_quality_db_first();
