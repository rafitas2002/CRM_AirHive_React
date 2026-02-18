-- Allow many-to-many relationship between companies and industries
CREATE TABLE IF NOT EXISTS company_industries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    industria_id UUID NOT NULL REFERENCES industrias(id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (empresa_id, industria_id)
);

CREATE INDEX IF NOT EXISTS idx_company_industries_empresa_id
    ON company_industries (empresa_id);

CREATE INDEX IF NOT EXISTS idx_company_industries_industria_id
    ON company_industries (industria_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_industries_primary_unique
    ON company_industries (empresa_id)
    WHERE is_primary = TRUE;

-- Backfill existing primary industries from empresas
INSERT INTO company_industries (empresa_id, industria_id, is_primary)
SELECT e.id, e.industria_id, TRUE
FROM empresas e
WHERE e.industria_id IS NOT NULL
ON CONFLICT (empresa_id, industria_id) DO NOTHING;

ALTER TABLE company_industries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can read company industries') THEN
        CREATE POLICY "Authenticated users can read company industries"
        ON company_industries FOR SELECT
        TO authenticated
        USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Owners and admins can manage company industries') THEN
        CREATE POLICY "Owners and admins can manage company industries"
        ON company_industries FOR ALL
        TO authenticated
        USING (
            EXISTS (
                SELECT 1
                FROM empresas e
                LEFT JOIN profiles p ON p.id = auth.uid()
                WHERE e.id = company_industries.empresa_id
                AND (
                    e.owner_id = auth.uid()
                    OR p.role IN ('admin', 'rh')
                )
            )
        )
        WITH CHECK (
            EXISTS (
                SELECT 1
                FROM empresas e
                LEFT JOIN profiles p ON p.id = auth.uid()
                WHERE e.id = company_industries.empresa_id
                AND (
                    e.owner_id = auth.uid()
                    OR p.role IN ('admin', 'rh')
                )
            )
        );
    END IF;
END $$;
