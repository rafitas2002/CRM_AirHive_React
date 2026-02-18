-- Admin-granted special badge:
-- Each admin can grant only one badge per month (globally).

DO $$
DECLARE
    c RECORD;
BEGIN
    FOR c IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'badge_special_level_config'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%badge_type%'
    LOOP
        EXECUTE format('ALTER TABLE badge_special_level_config DROP CONSTRAINT %I', c.conname);
    END LOOP;

    FOR c IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'seller_special_badges'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%badge_type%'
    LOOP
        EXECUTE format('ALTER TABLE seller_special_badges DROP CONSTRAINT %I', c.conname);
    END LOOP;

    FOR c IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'seller_special_badge_events'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%badge_type%'
    LOOP
        EXECUTE format('ALTER TABLE seller_special_badge_events DROP CONSTRAINT %I', c.conname);
    END LOOP;
END $$;

ALTER TABLE badge_special_level_config
    ADD CONSTRAINT badge_special_level_config_badge_type_check
    CHECK (
        badge_type IN (
            'company_size',
            'location_city',
            'location_country',
            'multi_industry',
            'all_company_sizes',
            'race_first_place',
            'race_second_place',
            'race_third_place',
            'race_all_positions',
            'race_total_trophies',
            'admin_granted'
        )
    );

ALTER TABLE seller_special_badges
    ADD CONSTRAINT seller_special_badges_badge_type_check
    CHECK (
        badge_type IN (
            'company_size',
            'location_city',
            'location_country',
            'multi_industry',
            'all_company_sizes',
            'race_first_place',
            'race_second_place',
            'race_third_place',
            'race_all_positions',
            'race_total_trophies',
            'admin_granted'
        )
    );

ALTER TABLE seller_special_badge_events
    ADD CONSTRAINT seller_special_badge_events_badge_type_check
    CHECK (
        badge_type IN (
            'company_size',
            'location_city',
            'location_country',
            'multi_industry',
            'all_company_sizes',
            'race_first_place',
            'race_second_place',
            'race_third_place',
            'race_all_positions',
            'race_total_trophies',
            'admin_granted'
        )
    );

INSERT INTO badge_special_level_config (badge_type, level, min_progress)
VALUES ('admin_granted', 1, 1)
ON CONFLICT (badge_type, level) DO NOTHING;

CREATE TABLE IF NOT EXISTS admin_badge_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    badge_type TEXT NOT NULL DEFAULT 'admin_granted' CHECK (badge_type = 'admin_granted'),
    badge_key TEXT NOT NULL DEFAULT 'admin_granted',
    badge_label TEXT NOT NULL DEFAULT 'Distinción Administrativa',
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_badge_grants_admin
    ON admin_badge_grants (admin_id, granted_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_badge_grants_seller
    ON admin_badge_grants (seller_id, granted_at DESC);

-- One grant per admin per month.
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_badge_grants_admin_month
    ON admin_badge_grants (admin_id, date_trunc('month', granted_at));

ALTER TABLE admin_badge_grants ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can read admin badge grants') THEN
        CREATE POLICY "Admins can read admin badge grants"
            ON admin_badge_grants FOR SELECT
            TO authenticated
            USING (
                EXISTS (
                    SELECT 1
                    FROM profiles p
                    WHERE p.id = auth.uid()
                      AND p.role IN ('admin', 'rh')
                )
            );
    END IF;
END $$;
