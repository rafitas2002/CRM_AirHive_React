-- Enables admin manual corrections for closed race months with audit metadata.

ALTER TABLE IF EXISTS race_results
    ADD COLUMN IF NOT EXISTS is_manual_override BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS override_note TEXT NULL,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_by UUID NULL REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_race_results_period_rank
    ON race_results (period, rank);

CREATE INDEX IF NOT EXISTS idx_race_results_period_manual
    ON race_results (period, is_manual_override);
