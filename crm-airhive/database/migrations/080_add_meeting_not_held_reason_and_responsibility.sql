-- Track structured confirmation details when a meeting is not held.
-- This preserves reason + responsibility ("propia" / "ajena") for audits and analytics.

ALTER TABLE meetings
ADD COLUMN IF NOT EXISTS not_held_reason TEXT NULL,
ADD COLUMN IF NOT EXISTS not_held_responsibility VARCHAR(20) NULL;

ALTER TABLE meetings
DROP CONSTRAINT IF EXISTS meetings_not_held_responsibility_check;

ALTER TABLE meetings
ADD CONSTRAINT meetings_not_held_responsibility_check
CHECK (
    not_held_responsibility IS NULL
    OR not_held_responsibility IN ('propia', 'ajena')
);

ALTER TABLE meeting_confirmations
ADD COLUMN IF NOT EXISTS not_held_reason TEXT NULL,
ADD COLUMN IF NOT EXISTS not_held_responsibility VARCHAR(20) NULL;

ALTER TABLE meeting_confirmations
DROP CONSTRAINT IF EXISTS meeting_confirmations_not_held_responsibility_check;

ALTER TABLE meeting_confirmations
ADD CONSTRAINT meeting_confirmations_not_held_responsibility_check
CHECK (
    not_held_responsibility IS NULL
    OR not_held_responsibility IN ('propia', 'ajena')
);

COMMENT ON COLUMN meetings.not_held_reason IS 'Structured reason when meeting_status = not_held';
COMMENT ON COLUMN meetings.not_held_responsibility IS 'Responsibility for not_held meetings: propia | ajena';
COMMENT ON COLUMN meeting_confirmations.not_held_reason IS 'Captured reason when was_held = false';
COMMENT ON COLUMN meeting_confirmations.not_held_responsibility IS 'Captured responsibility when was_held = false: propia | ajena';

-- Keep historical consistency if future edits added inconsistent rows before this migration.
UPDATE meetings
SET
    not_held_reason = NULL,
    not_held_responsibility = NULL
WHERE meeting_status = 'held';

UPDATE meeting_confirmations
SET
    not_held_reason = NULL,
    not_held_responsibility = NULL
WHERE was_held = TRUE;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'meeting_confirmations'
          AND policyname = 'Users can update their own confirmations'
    ) THEN
        CREATE POLICY "Users can update their own confirmations"
        ON meeting_confirmations FOR UPDATE
        USING (auth.uid() = confirmed_by)
        WITH CHECK (auth.uid() = confirmed_by);
    END IF;
END $$;
