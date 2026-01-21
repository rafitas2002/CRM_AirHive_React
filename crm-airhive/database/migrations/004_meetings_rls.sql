-- Migration: Enable RLS and add policies for meetings system
-- Description: Ensures users can manage their own meetings, alerts, and confirmations

-- ============================================
-- Table: meetings
-- ============================================
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see their own meetings
DROP POLICY IF EXISTS "Users can see their own meetings" ON meetings;
CREATE POLICY "Users can see their own meetings"
ON meetings FOR SELECT
USING (auth.uid() = seller_id);

-- Policy: Users can insert their own meetings
DROP POLICY IF EXISTS "Users can create meetings" ON meetings;
CREATE POLICY "Users can create meetings"
ON meetings FOR INSERT
WITH CHECK (auth.uid() = seller_id);

-- Policy: Users can update their own meetings
DROP POLICY IF EXISTS "Users can update their own meetings" ON meetings;
CREATE POLICY "Users can update their own meetings"
ON meetings FOR UPDATE
USING (auth.uid() = seller_id);

-- ============================================
-- Table: meeting_alerts
-- ============================================
ALTER TABLE meeting_alerts ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see their own alerts
DROP POLICY IF EXISTS "Users can see their own alerts" ON meeting_alerts;
CREATE POLICY "Users can see their own alerts"
ON meeting_alerts FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can update their own alerts (dismiss)
DROP POLICY IF EXISTS "Users can update their own alerts" ON meeting_alerts;
CREATE POLICY "Users can update their own alerts"
ON meeting_alerts FOR UPDATE
USING (auth.uid() = user_id);

-- ============================================
-- Table: meeting_confirmations
-- ============================================
ALTER TABLE meeting_confirmations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see their own confirmations
DROP POLICY IF EXISTS "Users can see their own confirmations" ON meeting_confirmations;
CREATE POLICY "Users can see their own confirmations"
ON meeting_confirmations FOR SELECT
USING (auth.uid() = confirmed_by);

-- Policy: Users can insert confirmations
DROP POLICY IF EXISTS "Users can create confirmations" ON meeting_confirmations;
CREATE POLICY "Users can create confirmations"
ON meeting_confirmations FOR INSERT
WITH CHECK (auth.uid() = confirmed_by);

-- ============================================
-- Permissions for authenticated users
-- ============================================
GRANT ALL ON meetings TO authenticated;
GRANT ALL ON meeting_alerts TO authenticated;
GRANT ALL ON meeting_confirmations TO authenticated;
GRANT ALL ON forecast_snapshots TO authenticated;
