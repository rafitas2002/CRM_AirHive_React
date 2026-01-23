-- Migration: Add 5-minute meeting alert
-- Description: Updates meeting_alerts constraint and trigger function to include 5-minute reminders

-- 1. Update the CHECK constraint on meeting_alerts
-- PostgreSQL doesn't allow easy ALTER of a check constraint, so we drop and recreate
ALTER TABLE meeting_alerts DROP CONSTRAINT IF EXISTS meeting_alerts_alert_type_check;
ALTER TABLE meeting_alerts ADD CONSTRAINT meeting_alerts_alert_type_check 
  CHECK (alert_type IN ('24h', '2h', '15min', '5min', 'overdue'));

-- 2. Update the trigger function to include 5min alert
CREATE OR REPLACE FUNCTION create_meeting_alerts()
RETURNS TRIGGER AS $$
DECLARE
  alert_24h TIMESTAMPTZ;
  alert_2h TIMESTAMPTZ;
  alert_15min TIMESTAMPTZ;
  alert_5min TIMESTAMPTZ;
BEGIN
  -- Calculate alert times
  alert_24h := NEW.start_time - INTERVAL '24 hours';
  alert_2h := NEW.start_time - INTERVAL '2 hours';
  alert_15min := NEW.start_time - INTERVAL '15 minutes';
  alert_5min := NEW.start_time - INTERVAL '5 minutes';

  -- Only create alerts for future meetings
  IF NEW.start_time > NOW() THEN
    -- 24 hour alert
    IF alert_24h > NOW() THEN
      INSERT INTO meeting_alerts (meeting_id, user_id, alert_type, alert_time)
      VALUES (NEW.id, NEW.seller_id, '24h', alert_24h);
    END IF;

    -- 2 hour alert
    IF alert_2h > NOW() THEN
      INSERT INTO meeting_alerts (meeting_id, user_id, alert_type, alert_time)
      VALUES (NEW.id, NEW.seller_id, '2h', alert_2h);
    END IF;

    -- 15 minute alert
    IF alert_15min > NOW() THEN
      INSERT INTO meeting_alerts (meeting_id, user_id, alert_type, alert_time)
      VALUES (NEW.id, NEW.seller_id, '15min', alert_15min);
    END IF;

    -- 5 minute alert (NEW)
    IF alert_5min > NOW() THEN
      INSERT INTO meeting_alerts (meeting_id, user_id, alert_type, alert_time)
      VALUES (NEW.id, NEW.seller_id, '5min', alert_5min);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. (Optional) Retroactively create 5min alerts for future scheduled meetings 
-- that don't have them yet.
INSERT INTO meeting_alerts (meeting_id, user_id, alert_type, alert_time)
SELECT m.id, m.seller_id, '5min', m.start_time - INTERVAL '5 minutes'
FROM meetings m
WHERE m.status = 'scheduled'
  AND m.meeting_status = 'scheduled'
  AND m.start_time - INTERVAL '5 minutes' > NOW()
  AND NOT EXISTS (
    SELECT 1 FROM meeting_alerts ma 
    WHERE ma.meeting_id = m.id AND ma.alert_type = '5min'
  );
