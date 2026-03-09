-- Presets compartidos para consultas rápidas de prospectos en correlaciones (solo admins).

CREATE TABLE IF NOT EXISTS admin_prospect_query_presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    query_text TEXT NOT NULL,
    created_by UUID NULL REFERENCES profiles(id) ON DELETE SET NULL,
    created_by_name TEXT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'admin_prospect_query_presets_name_not_blank_check'
    ) THEN
        ALTER TABLE admin_prospect_query_presets
            ADD CONSTRAINT admin_prospect_query_presets_name_not_blank_check
            CHECK (char_length(trim(name)) > 0);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'admin_prospect_query_presets_query_text_not_blank_check'
    ) THEN
        ALTER TABLE admin_prospect_query_presets
            ADD CONSTRAINT admin_prospect_query_presets_query_text_not_blank_check
            CHECK (char_length(trim(query_text)) > 0);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_admin_prospect_query_presets_active_created_at
    ON admin_prospect_query_presets (is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_prospect_query_presets_created_by
    ON admin_prospect_query_presets (created_by);

DROP TRIGGER IF EXISTS trg_admin_prospect_query_presets_set_updated_at ON admin_prospect_query_presets;
CREATE TRIGGER trg_admin_prospect_query_presets_set_updated_at
BEFORE UPDATE ON admin_prospect_query_presets
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_column();

ALTER TABLE admin_prospect_query_presets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'admin_prospect_query_presets'
          AND policyname = 'admin_prospect_query_presets_admin_select'
    ) THEN
        CREATE POLICY admin_prospect_query_presets_admin_select
            ON admin_prospect_query_presets
            FOR SELECT
            TO authenticated
            USING (
                EXISTS (
                    SELECT 1
                    FROM profiles p
                    WHERE p.id = auth.uid()
                      AND p.role = 'admin'
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'admin_prospect_query_presets'
          AND policyname = 'admin_prospect_query_presets_admin_insert'
    ) THEN
        CREATE POLICY admin_prospect_query_presets_admin_insert
            ON admin_prospect_query_presets
            FOR INSERT
            TO authenticated
            WITH CHECK (
                EXISTS (
                    SELECT 1
                    FROM profiles p
                    WHERE p.id = auth.uid()
                      AND p.role = 'admin'
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'admin_prospect_query_presets'
          AND policyname = 'admin_prospect_query_presets_admin_update'
    ) THEN
        CREATE POLICY admin_prospect_query_presets_admin_update
            ON admin_prospect_query_presets
            FOR UPDATE
            TO authenticated
            USING (
                EXISTS (
                    SELECT 1
                    FROM profiles p
                    WHERE p.id = auth.uid()
                      AND p.role = 'admin'
                )
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1
                    FROM profiles p
                    WHERE p.id = auth.uid()
                      AND p.role = 'admin'
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'admin_prospect_query_presets'
          AND policyname = 'admin_prospect_query_presets_admin_delete'
    ) THEN
        CREATE POLICY admin_prospect_query_presets_admin_delete
            ON admin_prospect_query_presets
            FOR DELETE
            TO authenticated
            USING (
                EXISTS (
                    SELECT 1
                    FROM profiles p
                    WHERE p.id = auth.uid()
                      AND p.role = 'admin'
                )
            );
    END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON admin_prospect_query_presets TO authenticated;
