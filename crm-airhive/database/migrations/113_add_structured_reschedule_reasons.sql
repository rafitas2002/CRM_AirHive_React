-- Store structured reasons when a meeting is rescheduled so analytics can segment causes.

DO $$
BEGIN
    IF to_regclass('public.meeting_reschedule_events') IS NULL THEN
        RETURN;
    END IF;

    ALTER TABLE public.meeting_reschedule_events
        ADD COLUMN IF NOT EXISTS reason_catalog_id UUID NULL;

    ALTER TABLE public.meeting_reschedule_events
        ADD COLUMN IF NOT EXISTS reason_custom TEXT NULL;

    ALTER TABLE public.meeting_reschedule_events
        ADD COLUMN IF NOT EXISTS responsibility TEXT NULL;

    ALTER TABLE public.meeting_reschedule_events
        ADD COLUMN IF NOT EXISTS notes TEXT NULL;

    ALTER TABLE public.meeting_reschedule_events
        DROP CONSTRAINT IF EXISTS meeting_reschedule_events_responsibility_check;

    ALTER TABLE public.meeting_reschedule_events
        ADD CONSTRAINT meeting_reschedule_events_responsibility_check
        CHECK (
            responsibility IS NULL
            OR responsibility IN ('propia', 'ajena')
        );

    IF to_regclass('public.meeting_cancellation_reasons') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'meeting_reschedule_events_reason_catalog_id_fkey'
       ) THEN
        ALTER TABLE public.meeting_reschedule_events
            ADD CONSTRAINT meeting_reschedule_events_reason_catalog_id_fkey
            FOREIGN KEY (reason_catalog_id)
            REFERENCES public.meeting_cancellation_reasons(id)
            ON DELETE SET NULL;
    END IF;

    CREATE INDEX IF NOT EXISTS idx_meeting_reschedule_events_reason_catalog
        ON public.meeting_reschedule_events (reason_catalog_id);

    CREATE INDEX IF NOT EXISTS idx_meeting_reschedule_events_responsibility
        ON public.meeting_reschedule_events (responsibility);

    UPDATE public.meeting_reschedule_events
    SET reason_custom = reason
    WHERE reason_custom IS NULL
      AND reason IS NOT NULL
      AND trim(reason) <> ''
      AND reason <> 'manual_update'
      AND reason NOT LIKE 'catalog:%';
END $$;
