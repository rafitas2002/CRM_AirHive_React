-- Expands quotes metadata for richer capture (year, origin type, work/source detail, notes, own-quote flag).

ALTER TABLE IF EXISTS crm_quotes
    ADD COLUMN IF NOT EXISTS is_own_quote BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS quote_year INTEGER,
    ADD COLUMN IF NOT EXISTS quote_origin_type TEXT,
    ADD COLUMN IF NOT EXISTS quote_origin_title TEXT,
    ADD COLUMN IF NOT EXISTS quote_origin_reference TEXT,
    ADD COLUMN IF NOT EXISTS quote_notes TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'crm_quotes_quote_year_range_ck'
    ) THEN
        ALTER TABLE crm_quotes
            ADD CONSTRAINT crm_quotes_quote_year_range_ck
            CHECK (quote_year IS NULL OR (quote_year >= 1200 AND quote_year <= 2200));
    END IF;
END $$;
