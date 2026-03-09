-- Meeting UX upgrade:
-- 1) Stable meeting numbering per lead
-- 2) Company-level contacts catalog
-- 3) External participants + primary contact linkage on meetings

ALTER TABLE meetings
ADD COLUMN IF NOT EXISTS meeting_sequence_number INTEGER,
ADD COLUMN IF NOT EXISTS primary_company_contact_id UUID NULL,
ADD COLUMN IF NOT EXISTS primary_company_contact_name TEXT NULL,
ADD COLUMN IF NOT EXISTS external_participants TEXT[] NULL;

CREATE INDEX IF NOT EXISTS idx_meetings_lead_sequence
    ON meetings (lead_id, meeting_sequence_number DESC);

CREATE OR REPLACE FUNCTION assign_meeting_sequence_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.meeting_sequence_number IS NULL THEN
        SELECT COALESCE(MAX(m.meeting_sequence_number), 0) + 1
        INTO NEW.meeting_sequence_number
        FROM meetings m
        WHERE m.lead_id = NEW.lead_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_meeting_sequence_number ON meetings;
CREATE TRIGGER trg_assign_meeting_sequence_number
BEFORE INSERT ON meetings
FOR EACH ROW
EXECUTE FUNCTION assign_meeting_sequence_number();

WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY lead_id
            ORDER BY start_time ASC, created_at ASC, id ASC
        ) AS sequence_number
    FROM meetings
)
UPDATE meetings m
SET meeting_sequence_number = ranked.sequence_number
FROM ranked
WHERE ranked.id = m.id
  AND m.meeting_sequence_number IS NULL;

CREATE TABLE IF NOT EXISTS company_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL CHECK (char_length(trim(full_name)) > 0),
    email TEXT NULL,
    phone TEXT NULL,
    job_title TEXT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'lead_sync')),
    created_by UUID NULL REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_contacts_empresa_id
    ON company_contacts (empresa_id);

CREATE INDEX IF NOT EXISTS idx_company_contacts_empresa_primary
    ON company_contacts (empresa_id, is_primary DESC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_company_contacts_name_search
    ON company_contacts (empresa_id, lower(full_name));

DROP TRIGGER IF EXISTS trg_company_contacts_set_updated_at ON company_contacts;
CREATE TRIGGER trg_company_contacts_set_updated_at
BEFORE UPDATE ON company_contacts
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_column();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'meetings_primary_company_contact_id_fkey'
    ) THEN
        ALTER TABLE meetings
            ADD CONSTRAINT meetings_primary_company_contact_id_fkey
            FOREIGN KEY (primary_company_contact_id)
            REFERENCES company_contacts(id)
            ON DELETE SET NULL;
    END IF;
END $$;

WITH lead_contacts AS (
    SELECT DISTINCT ON (
        c.empresa_id,
        lower(trim(c.contacto)),
        lower(coalesce(c.email, ''))
    )
        c.empresa_id::UUID AS empresa_id,
        trim(c.contacto) AS full_name,
        NULLIF(trim(c.email), '') AS email,
        NULLIF(trim(c.telefono), '') AS phone,
        c.created_at,
        c.id AS lead_id
    FROM clientes c
    WHERE c.empresa_id IS NOT NULL
      AND trim(coalesce(c.contacto, '')) <> ''
    ORDER BY
        c.empresa_id,
        lower(trim(c.contacto)),
        lower(coalesce(c.email, '')),
        c.created_at ASC,
        c.id ASC
),
lead_contacts_ranked AS (
    SELECT
        lc.*,
        ROW_NUMBER() OVER (
            PARTITION BY lc.empresa_id
            ORDER BY lc.created_at ASC, lc.lead_id ASC
        ) AS rn
    FROM lead_contacts lc
)
INSERT INTO company_contacts (
    empresa_id,
    full_name,
    email,
    phone,
    is_primary,
    source,
    created_at,
    updated_at
)
SELECT
    lc.empresa_id,
    lc.full_name,
    lc.email,
    lc.phone,
    lc.rn = 1,
    'lead_sync',
    NOW(),
    NOW()
FROM lead_contacts_ranked lc
WHERE NOT EXISTS (
    SELECT 1
    FROM company_contacts cc
    WHERE cc.empresa_id = lc.empresa_id
      AND lower(trim(cc.full_name)) = lower(trim(lc.full_name))
      AND lower(coalesce(cc.email, '')) = lower(coalesce(lc.email, ''))
);

UPDATE meetings m
SET primary_company_contact_name = c.contacto
FROM clientes c
WHERE c.id = m.lead_id
  AND m.primary_company_contact_name IS NULL
  AND trim(coalesce(c.contacto, '')) <> '';

UPDATE meetings m
SET external_participants = ARRAY[c.contacto]
FROM clientes c
WHERE c.id = m.lead_id
  AND (m.external_participants IS NULL OR cardinality(m.external_participants) = 0)
  AND trim(coalesce(c.contacto, '')) <> '';
