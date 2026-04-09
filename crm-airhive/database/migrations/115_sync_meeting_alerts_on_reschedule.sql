-- Keep meeting reminders synchronized when a meeting is rescheduled or status changes.
-- This prevents stale reminders from firing with an old datetime.

CREATE OR REPLACE FUNCTION public.create_meeting_alerts()
RETURNS TRIGGER AS $$
DECLARE
    alert_24h TIMESTAMPTZ;
    alert_2h TIMESTAMPTZ;
    alert_15min TIMESTAMPTZ;
    alert_5min TIMESTAMPTZ;
    should_schedule BOOLEAN;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.start_time IS NOT DISTINCT FROM OLD.start_time
            AND NEW.seller_id IS NOT DISTINCT FROM OLD.seller_id
            AND NEW.status IS NOT DISTINCT FROM OLD.status
            AND NEW.meeting_status IS NOT DISTINCT FROM OLD.meeting_status THEN
            RETURN NEW;
        END IF;
    END IF;

    -- Retire current pending reminders for this meeting before re-scheduling.
    UPDATE public.meeting_alerts
    SET
        dismissed = TRUE,
        dismissed_at = COALESCE(dismissed_at, NOW())
    WHERE meeting_id = NEW.id
      AND sent = FALSE
      AND dismissed = FALSE;

    should_schedule := NEW.start_time > NOW()
        AND LOWER(COALESCE(NEW.status, '')) = 'scheduled'
        AND LOWER(COALESCE(NEW.meeting_status, '')) IN ('scheduled', 'pending_confirmation');

    IF NOT should_schedule THEN
        RETURN NEW;
    END IF;

    alert_24h := NEW.start_time - INTERVAL '24 hours';
    alert_2h := NEW.start_time - INTERVAL '2 hours';
    alert_15min := NEW.start_time - INTERVAL '15 minutes';
    alert_5min := NEW.start_time - INTERVAL '5 minutes';

    IF alert_24h > NOW() THEN
        INSERT INTO public.meeting_alerts (meeting_id, user_id, alert_type, alert_time)
        VALUES (NEW.id, NEW.seller_id, '24h', alert_24h);
    END IF;

    IF alert_2h > NOW() THEN
        INSERT INTO public.meeting_alerts (meeting_id, user_id, alert_type, alert_time)
        VALUES (NEW.id, NEW.seller_id, '2h', alert_2h);
    END IF;

    IF alert_15min > NOW() THEN
        INSERT INTO public.meeting_alerts (meeting_id, user_id, alert_type, alert_time)
        VALUES (NEW.id, NEW.seller_id, '15min', alert_15min);
    END IF;

    IF alert_5min > NOW() THEN
        BEGIN
            INSERT INTO public.meeting_alerts (meeting_id, user_id, alert_type, alert_time)
            VALUES (NEW.id, NEW.seller_id, '5min', alert_5min);
        EXCEPTION
            WHEN check_violation THEN
                -- Backward compatibility: some DBs may still have old CHECK without 5min.
                NULL;
        END;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_create_meeting_alerts ON public.meetings;
CREATE TRIGGER trigger_create_meeting_alerts
AFTER INSERT OR UPDATE OF start_time, seller_id, status, meeting_status ON public.meetings
FOR EACH ROW
EXECUTE FUNCTION public.create_meeting_alerts();

-- One-time cleanup for stale reminders that no longer match the meeting schedule.
WITH alert_audit AS (
    SELECT
        ma.id,
        ma.alert_type,
        ma.alert_time,
        m.id AS meeting_exists,
        m.start_time,
        m.status,
        m.meeting_status,
        CASE
            WHEN ma.alert_type = '24h' THEN m.start_time - INTERVAL '24 hours'
            WHEN ma.alert_type = '2h' THEN m.start_time - INTERVAL '2 hours'
            WHEN ma.alert_type = '15min' THEN m.start_time - INTERVAL '15 minutes'
            WHEN ma.alert_type = '5min' THEN m.start_time - INTERVAL '5 minutes'
            ELSE NULL
        END AS expected_alert_time
    FROM public.meeting_alerts ma
    LEFT JOIN public.meetings m ON m.id = ma.meeting_id
    WHERE ma.sent = FALSE
      AND ma.dismissed = FALSE
)
UPDATE public.meeting_alerts ma
SET
    dismissed = TRUE,
    dismissed_at = COALESCE(ma.dismissed_at, NOW())
FROM alert_audit audit
WHERE ma.id = audit.id
  AND (
    audit.meeting_exists IS NULL
    OR NOT (
        audit.start_time > NOW()
        AND LOWER(COALESCE(audit.status, '')) = 'scheduled'
        AND LOWER(COALESCE(audit.meeting_status, '')) IN ('scheduled', 'pending_confirmation')
    )
    OR (
        audit.expected_alert_time IS NOT NULL
        AND ABS(EXTRACT(EPOCH FROM (audit.alert_time - audit.expected_alert_time))) > 90
    )
  );
