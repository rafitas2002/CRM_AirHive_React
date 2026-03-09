-- Favoritos personales de consultas de prospectos por admin.
-- Este catálogo es privado por usuario (no compartido).

CREATE TABLE IF NOT EXISTS admin_prospect_query_favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    query_text TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'admin_prospect_query_favorites_name_not_blank_check'
    ) THEN
        ALTER TABLE admin_prospect_query_favorites
            ADD CONSTRAINT admin_prospect_query_favorites_name_not_blank_check
            CHECK (char_length(trim(name)) > 0);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'admin_prospect_query_favorites_query_text_not_blank_check'
    ) THEN
        ALTER TABLE admin_prospect_query_favorites
            ADD CONSTRAINT admin_prospect_query_favorites_query_text_not_blank_check
            CHECK (char_length(trim(query_text)) > 0);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_admin_prospect_query_favorites_user_active_created
    ON admin_prospect_query_favorites (user_id, is_active, created_at DESC);

DROP TRIGGER IF EXISTS trg_admin_prospect_query_favorites_set_updated_at ON admin_prospect_query_favorites;
CREATE TRIGGER trg_admin_prospect_query_favorites_set_updated_at
BEFORE UPDATE ON admin_prospect_query_favorites
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_column();

ALTER TABLE admin_prospect_query_favorites ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'admin_prospect_query_favorites'
          AND policyname = 'admin_prospect_query_favorites_owner_select'
    ) THEN
        CREATE POLICY admin_prospect_query_favorites_owner_select
            ON admin_prospect_query_favorites
            FOR SELECT
            TO authenticated
            USING (
                user_id = auth.uid()
                AND EXISTS (
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
          AND tablename = 'admin_prospect_query_favorites'
          AND policyname = 'admin_prospect_query_favorites_owner_insert'
    ) THEN
        CREATE POLICY admin_prospect_query_favorites_owner_insert
            ON admin_prospect_query_favorites
            FOR INSERT
            TO authenticated
            WITH CHECK (
                user_id = auth.uid()
                AND EXISTS (
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
          AND tablename = 'admin_prospect_query_favorites'
          AND policyname = 'admin_prospect_query_favorites_owner_update'
    ) THEN
        CREATE POLICY admin_prospect_query_favorites_owner_update
            ON admin_prospect_query_favorites
            FOR UPDATE
            TO authenticated
            USING (
                user_id = auth.uid()
                AND EXISTS (
                    SELECT 1
                    FROM profiles p
                    WHERE p.id = auth.uid()
                      AND p.role = 'admin'
                )
            )
            WITH CHECK (
                user_id = auth.uid()
                AND EXISTS (
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
          AND tablename = 'admin_prospect_query_favorites'
          AND policyname = 'admin_prospect_query_favorites_owner_delete'
    ) THEN
        CREATE POLICY admin_prospect_query_favorites_owner_delete
            ON admin_prospect_query_favorites
            FOR DELETE
            TO authenticated
            USING (
                user_id = auth.uid()
                AND EXISTS (
                    SELECT 1
                    FROM profiles p
                    WHERE p.id = auth.uid()
                      AND p.role = 'admin'
                )
            );
    END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON admin_prospect_query_favorites TO authenticated;
