-- Industry approval workflow
-- Allows sellers to register temporary new industries while requiring review from admin approver.

CREATE TABLE IF NOT EXISTS industry_change_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposed_name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved_new', 'mapped_existing', 'rejected')),
    requested_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    requested_by_name TEXT,
    context_module TEXT,
    context_entity_type TEXT,
    context_entity_id TEXT,
    context_entity_name TEXT,
    resolved_industria_id UUID REFERENCES industrias(id) ON DELETE SET NULL,
    resolved_industria_name TEXT,
    resolution_note TEXT,
    resolved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_industry_change_requests_status_created
    ON industry_change_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_industry_change_requests_requested_by
    ON industry_change_requests (requested_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_industry_change_requests_normalized_name
    ON industry_change_requests (normalized_name);

CREATE OR REPLACE FUNCTION set_industry_change_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_industry_change_requests_updated_at ON industry_change_requests;
CREATE TRIGGER trg_set_industry_change_requests_updated_at
    BEFORE UPDATE ON industry_change_requests
    FOR EACH ROW
    EXECUTE FUNCTION set_industry_change_requests_updated_at();

ALTER TABLE industry_change_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "industry_change_requests_insert_own" ON industry_change_requests;
CREATE POLICY "industry_change_requests_insert_own"
ON industry_change_requests
FOR INSERT
TO authenticated
WITH CHECK (requested_by = auth.uid());

DROP POLICY IF EXISTS "industry_change_requests_select_scoped" ON industry_change_requests;
CREATE POLICY "industry_change_requests_select_scoped"
ON industry_change_requests
FOR SELECT
TO authenticated
USING (
    requested_by = auth.uid()
    OR EXISTS (
        SELECT 1
        FROM profiles p
        WHERE p.id = auth.uid()
          AND (
              lower(coalesce(p.role, '')) IN ('admin', 'rh')
              OR lower(coalesce(p.username, '')) = 'jesus.gracia'
              OR lower(coalesce(p.full_name, '')) = 'jesus gracia'
          )
    )
);

DROP POLICY IF EXISTS "industry_change_requests_update_reviewer" ON industry_change_requests;
CREATE POLICY "industry_change_requests_update_reviewer"
ON industry_change_requests
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM profiles p
        WHERE p.id = auth.uid()
          AND (
              lower(coalesce(p.role, '')) IN ('admin', 'rh')
              OR lower(coalesce(p.username, '')) = 'jesus.gracia'
              OR lower(coalesce(p.full_name, '')) = 'jesus gracia'
          )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM profiles p
        WHERE p.id = auth.uid()
          AND (
              lower(coalesce(p.role, '')) IN ('admin', 'rh')
              OR lower(coalesce(p.username, '')) = 'jesus.gracia'
              OR lower(coalesce(p.full_name, '')) = 'jesus gracia'
          )
    )
);
