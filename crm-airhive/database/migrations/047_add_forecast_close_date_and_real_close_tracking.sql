-- Phase 1 for real closing race + forecast-date reliability foundations.
-- Adds:
-- - clientes.forecast_close_date (seller predicted close date)
-- - clientes.closed_at_real (real timestamp when lead became won)
-- - forecast_snapshots extensions for future value/date reliability scoring
--
-- Also includes a trigger to keep closed_at_real synchronized on stage changes.

ALTER TABLE IF EXISTS clientes
    ADD COLUMN IF NOT EXISTS forecast_close_date DATE NULL;

ALTER TABLE IF EXISTS clientes
    ADD COLUMN IF NOT EXISTS closed_at_real TIMESTAMPTZ NULL;

ALTER TABLE IF EXISTS forecast_snapshots
    ADD COLUMN IF NOT EXISTS forecast_value_amount NUMERIC(14, 2) NULL;

ALTER TABLE IF EXISTS forecast_snapshots
    ADD COLUMN IF NOT EXISTS forecast_close_date DATE NULL;

CREATE INDEX IF NOT EXISTS idx_clientes_owner_closed_at_real
    ON clientes (owner_id, closed_at_real)
    WHERE owner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clientes_closed_at_real
    ON clientes (closed_at_real)
    WHERE closed_at_real IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clientes_forecast_close_date
    ON clientes (forecast_close_date)
    WHERE forecast_close_date IS NOT NULL;

CREATE OR REPLACE FUNCTION set_clientes_closed_at_real_from_stage()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_old_stage TEXT;
    v_new_stage TEXT;
    v_old_is_won BOOLEAN;
    v_new_is_won BOOLEAN;
BEGIN
    v_new_stage := lower(trim(COALESCE(NEW.etapa, '')));
    v_new_is_won := (v_new_stage LIKE '%ganad%');

    IF TG_OP = 'INSERT' THEN
        IF v_new_is_won AND NEW.closed_at_real IS NULL THEN
            NEW.closed_at_real := NOW();
        ELSIF NOT v_new_is_won THEN
            NEW.closed_at_real := NULL;
        END IF;
        RETURN NEW;
    END IF;

    -- UPDATE
    v_old_stage := lower(trim(COALESCE(OLD.etapa, '')));
    v_old_is_won := (v_old_stage LIKE '%ganad%');

    IF v_new_is_won THEN
        -- Transition into won: stamp once if missing.
        IF NOT v_old_is_won AND NEW.closed_at_real IS NULL THEN
            NEW.closed_at_real := NOW();
        END IF;
    ELSE
        -- Lead reopened or lost: clear real closure timestamp.
        NEW.closed_at_real := NULL;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clientes_set_closed_at_real ON clientes;
CREATE TRIGGER trg_clientes_set_closed_at_real
BEFORE INSERT OR UPDATE OF etapa, closed_at_real
ON clientes
FOR EACH ROW
EXECUTE FUNCTION set_clientes_closed_at_real_from_stage();

-- Backfill real close timestamp for won leads if missing.
UPDATE clientes
SET closed_at_real = COALESCE(
    forecast_scored_at,
    created_at,
    NULLIF(fecha_registro::text, '')::timestamptz
)
WHERE closed_at_real IS NULL
  AND lower(trim(COALESCE(etapa, ''))) LIKE '%ganad%';
