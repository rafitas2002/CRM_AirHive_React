-- Quote contribution requests workflow (non-admin submit, admin approve/reject).

CREATE TABLE IF NOT EXISTS crm_quote_requests (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    quote_text TEXT NOT NULL,
    quote_author TEXT NOT NULL,
    quote_author_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    quote_source TEXT,
    quote_author_context TEXT,
    contributed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    contributed_by_name TEXT NOT NULL,
    is_own_quote BOOLEAN NOT NULL DEFAULT false,
    quote_year INTEGER,
    quote_origin_type TEXT,
    quote_origin_title TEXT,
    quote_origin_reference TEXT,
    quote_notes TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    requested_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'crm_quote_requests_quote_year_range_ck'
    ) THEN
        ALTER TABLE crm_quote_requests
            ADD CONSTRAINT crm_quote_requests_quote_year_range_ck
            CHECK (quote_year IS NULL OR (quote_year >= 1200 AND quote_year <= 2200));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_crm_quote_requests_status_created
    ON crm_quote_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_quote_requests_requested_by
    ON crm_quote_requests (requested_by, created_at DESC);

CREATE OR REPLACE FUNCTION set_crm_quote_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_crm_quote_requests_updated_at ON crm_quote_requests;
CREATE TRIGGER trg_set_crm_quote_requests_updated_at
    BEFORE UPDATE ON crm_quote_requests
    FOR EACH ROW
    EXECUTE FUNCTION set_crm_quote_requests_updated_at();
