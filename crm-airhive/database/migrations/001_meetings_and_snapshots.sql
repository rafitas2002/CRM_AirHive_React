-- Migration: Add meetings and forecast_snapshots tables
-- Description: Implements meeting-based forecast snapshot system

-- ============================================
-- Table: meetings
-- ============================================
CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL,
  title VARCHAR(255) NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  meeting_type VARCHAR(50) NOT NULL CHECK (meeting_type IN ('presencial', 'llamada', 'video')),
  notes TEXT,
  attendees TEXT[], -- Array de emails/nombres
  calendar_event_id VARCHAR(255), -- ID del evento en Google/Outlook
  calendar_provider VARCHAR(50) CHECK (calendar_provider IN ('google', 'outlook')),
  status VARCHAR(50) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for meetings
CREATE INDEX IF NOT EXISTS idx_meetings_lead_id ON meetings(lead_id);
CREATE INDEX IF NOT EXISTS idx_meetings_seller_id ON meetings(seller_id);
CREATE INDEX IF NOT EXISTS idx_meetings_start_time ON meetings(start_time);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);

-- ============================================
-- Table: forecast_snapshots
-- ============================================
CREATE TABLE IF NOT EXISTS forecast_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL,
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  snapshot_number INTEGER NOT NULL,
  probability DECIMAL(5,2) NOT NULL CHECK (probability >= 0 AND probability <= 100),
  snapshot_timestamp TIMESTAMPTZ NOT NULL,
  source VARCHAR(50) DEFAULT 'meeting_start_snapshot',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure one snapshot per meeting per lead
  UNIQUE(lead_id, meeting_id)
);

-- Indexes for forecast_snapshots
CREATE INDEX IF NOT EXISTS idx_snapshots_lead_id ON forecast_snapshots(lead_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_meeting_id ON forecast_snapshots(meeting_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_seller_id ON forecast_snapshots(seller_id);

-- ============================================
-- Modify clientes table
-- ============================================
ALTER TABLE clientes
ADD COLUMN IF NOT EXISTS probability_locked BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS next_meeting_id UUID REFERENCES meetings(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS last_snapshot_at TIMESTAMPTZ;

-- ============================================
-- Function: Update updated_at timestamp
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for meetings
DROP TRIGGER IF EXISTS update_meetings_updated_at ON meetings;
CREATE TRIGGER update_meetings_updated_at
    BEFORE UPDATE ON meetings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Function: Get next meeting for a lead
-- ============================================
CREATE OR REPLACE FUNCTION get_next_meeting(p_lead_id INTEGER)
RETURNS TABLE (
  id UUID,
  start_time TIMESTAMPTZ,
  title VARCHAR(255)
) AS $$
BEGIN
  RETURN QUERY
  SELECT m.id, m.start_time, m.title
  FROM meetings m
  WHERE m.lead_id = p_lead_id
    AND m.status = 'scheduled'
    AND m.start_time > NOW()
  ORDER BY m.start_time ASC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Function: Get snapshot count for a lead
-- ============================================
CREATE OR REPLACE FUNCTION get_snapshot_count(p_lead_id INTEGER)
RETURNS INTEGER AS $$
DECLARE
  snapshot_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO snapshot_count
  FROM forecast_snapshots
  WHERE lead_id = p_lead_id;
  
  RETURN snapshot_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Comments for documentation
-- ============================================
COMMENT ON TABLE meetings IS 'Stores all meetings/juntas associated with leads for forecast tracking';
COMMENT ON TABLE forecast_snapshots IS 'Immutable snapshots of probability forecasts captured at meeting start times';
COMMENT ON COLUMN clientes.probability_locked IS 'Indicates if probability field is currently locked (between meetings)';
COMMENT ON COLUMN clientes.next_meeting_id IS 'Reference to the next scheduled meeting for this lead';
COMMENT ON COLUMN clientes.last_snapshot_at IS 'Timestamp of the last captured forecast snapshot';
