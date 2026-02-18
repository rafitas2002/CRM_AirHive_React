-- RH master sync toggle. When enabled, CRM employee data becomes read-only.

CREATE TABLE IF NOT EXISTS rh_sync_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    rh_master_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT rh_sync_settings_singleton CHECK (id = 1)
);

INSERT INTO rh_sync_settings (id, rh_master_enabled)
VALUES (1, FALSE)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION set_rh_sync_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rh_sync_settings_updated_at ON rh_sync_settings;
CREATE TRIGGER trg_rh_sync_settings_updated_at
    BEFORE UPDATE ON rh_sync_settings
    FOR EACH ROW
    EXECUTE FUNCTION set_rh_sync_settings_updated_at();

ALTER TABLE rh_sync_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'rh_sync_settings'
          AND policyname = 'Authenticated can read RH sync settings'
    ) THEN
        CREATE POLICY "Authenticated can read RH sync settings"
            ON rh_sync_settings
            FOR SELECT
            TO authenticated
            USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'rh_sync_settings'
          AND policyname = 'Admin RH can update RH sync settings'
    ) THEN
        CREATE POLICY "Admin RH can update RH sync settings"
            ON rh_sync_settings
            FOR UPDATE
            TO authenticated
            USING (
                EXISTS (
                    SELECT 1 FROM profiles p
                    WHERE p.id = auth.uid()
                      AND p.role IN ('admin', 'rh')
                )
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM profiles p
                    WHERE p.id = auth.uid()
                      AND p.role IN ('admin', 'rh')
                )
            );
    END IF;
END;
$$;
