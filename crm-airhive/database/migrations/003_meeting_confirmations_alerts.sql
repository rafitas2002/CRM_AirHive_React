-- Migration: Add meeting confirmation and alert system
-- Description: Extends meetings table and adds alert/confirmation tracking

-- ============================================
-- Modify meetings table
-- ============================================
ALTER TABLE meetings
ADD COLUMN IF NOT EXISTS meeting_status VARCHAR(50) DEFAULT 'scheduled' 
  CHECK (meeting_status IN ('scheduled', 'held', 'not_held', 'pending_confirmation', 'cancelled')),
ADD COLUMN IF NOT EXISTS frozen_probability_value DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS confirmation_timestamp TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS confirmation_notes TEXT;

-- Comments
COMMENT ON COLUMN meetings.meeting_status IS 'Status: scheduled, held, not_held, pending_confirmation, cancelled';
COMMENT ON COLUMN meetings.frozen_probability_value IS 'Probability value frozen at meeting start time for snapshot';
COMMENT ON COLUMN meetings.confirmation_timestamp IS 'When the meeting was confirmed as held/not held';
COMMENT ON COLUMN meetings.confirmed_by IS 'User who confirmed the meeting status';
COMMENT ON COLUMN meetings.confirmation_notes IS 'Notes added during confirmation';

-- ============================================
-- Table: meeting_alerts
-- ============================================
CREATE TABLE IF NOT EXISTS meeting_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN ('24h', '2h', '15min', 'overdue')),
  alert_time TIMESTAMPTZ NOT NULL,
  sent BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMPTZ,
  dismissed BOOLEAN DEFAULT FALSE,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for meeting_alerts
CREATE INDEX IF NOT EXISTS idx_alerts_meeting ON meeting_alerts(meeting_id);
CREATE INDEX IF NOT EXISTS idx_alerts_user ON meeting_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_time ON meeting_alerts(alert_time);
CREATE INDEX IF NOT EXISTS idx_alerts_sent ON meeting_alerts(sent) WHERE sent = FALSE;
CREATE INDEX IF NOT EXISTS idx_alerts_dismissed ON meeting_alerts(dismissed) WHERE dismissed = FALSE;

-- Comments
COMMENT ON TABLE meeting_alerts IS 'Scheduled alerts for upcoming meetings (24h, 2h, 15min before)';
COMMENT ON COLUMN meeting_alerts.alert_type IS 'Type of alert: 24h, 2h, 15min, overdue';
COMMENT ON COLUMN meeting_alerts.sent IS 'Whether the alert has been sent/shown to user';
COMMENT ON COLUMN meeting_alerts.dismissed IS 'Whether user has dismissed the alert';

-- ============================================
-- Table: meeting_confirmations
-- ============================================
CREATE TABLE IF NOT EXISTS meeting_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  confirmed_by UUID NOT NULL REFERENCES auth.users(id),
  was_held BOOLEAN NOT NULL,
  confirmation_notes TEXT,
  snapshot_created BOOLEAN DEFAULT FALSE,
  snapshot_id UUID REFERENCES forecast_snapshots(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for meeting_confirmations
CREATE INDEX IF NOT EXISTS idx_confirmations_meeting ON meeting_confirmations(meeting_id);
CREATE INDEX IF NOT EXISTS idx_confirmations_user ON meeting_confirmations(confirmed_by);

-- Comments
COMMENT ON TABLE meeting_confirmations IS 'Historical record of meeting confirmations (held/not held)';
COMMENT ON COLUMN meeting_confirmations.was_held IS 'True if meeting was held, false if not held';
COMMENT ON COLUMN meeting_confirmations.snapshot_created IS 'True if a forecast snapshot was created';
COMMENT ON COLUMN meeting_confirmations.snapshot_id IS 'Reference to created snapshot (if any)';

-- ============================================
-- Function: Create alerts when meeting is created
-- ============================================
CREATE OR REPLACE FUNCTION create_meeting_alerts()
RETURNS TRIGGER AS $$
DECLARE
  alert_24h TIMESTAMPTZ;
  alert_2h TIMESTAMPTZ;
  alert_15min TIMESTAMPTZ;
BEGIN
  -- Calculate alert times
  alert_24h := NEW.start_time - INTERVAL '24 hours';
  alert_2h := NEW.start_time - INTERVAL '2 hours';
  alert_15min := NEW.start_time - INTERVAL '15 minutes';

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
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to create alerts automatically
DROP TRIGGER IF EXISTS trigger_create_meeting_alerts ON meetings;
CREATE TRIGGER trigger_create_meeting_alerts
  AFTER INSERT ON meetings
  FOR EACH ROW
  EXECUTE FUNCTION create_meeting_alerts();

-- ============================================
-- Function: Get pending confirmations for user
-- ============================================
CREATE OR REPLACE FUNCTION get_pending_confirmations(p_user_id UUID)
RETURNS TABLE (
  meeting_id UUID,
  lead_id INTEGER,
  title VARCHAR(255),
  start_time TIMESTAMPTZ,
  frozen_probability DECIMAL(5,2),
  empresa VARCHAR(255)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.id,
    m.lead_id,
    m.title,
    m.start_time,
    m.frozen_probability_value,
    c.empresa
  FROM meetings m
  JOIN clientes c ON m.lead_id = c.id
  WHERE m.seller_id = p_user_id
    AND m.meeting_status = 'pending_confirmation'
    AND m.start_time < NOW()
  ORDER BY m.start_time ASC;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Function: Get upcoming meetings with urgency
-- ============================================
CREATE OR REPLACE FUNCTION get_upcoming_meetings(p_user_id UUID, p_limit INTEGER DEFAULT 10)
RETURNS TABLE (
  meeting_id UUID,
  lead_id INTEGER,
  title VARCHAR(255),
  start_time TIMESTAMPTZ,
  duration_minutes INTEGER,
  meeting_type VARCHAR(50),
  empresa VARCHAR(255),
  etapa VARCHAR(50),
  hours_until NUMERIC,
  urgency_level VARCHAR(20)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.id,
    m.lead_id,
    m.title,
    m.start_time,
    m.duration_minutes,
    m.meeting_type,
    c.empresa,
    c.etapa,
    EXTRACT(EPOCH FROM (m.start_time - NOW())) / 3600 AS hours_until,
    CASE
      WHEN m.start_time < NOW() THEN 'overdue'
      WHEN EXTRACT(EPOCH FROM (m.start_time - NOW())) / 3600 < 2 THEN 'urgent'
      WHEN EXTRACT(EPOCH FROM (m.start_time - NOW())) / 3600 < 24 THEN 'today'
      WHEN EXTRACT(EPOCH FROM (m.start_time - NOW())) / 3600 < 48 THEN 'soon'
      ELSE 'scheduled'
    END AS urgency_level
  FROM meetings m
  JOIN clientes c ON m.lead_id = c.id
  WHERE m.seller_id = p_user_id
    AND m.status = 'scheduled'
    AND m.meeting_status IN ('scheduled', 'pending_confirmation')
  ORDER BY m.start_time ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
