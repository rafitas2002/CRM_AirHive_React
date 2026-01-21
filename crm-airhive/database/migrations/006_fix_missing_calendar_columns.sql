-- Fix missing calendar columns
ALTER TABLE meetings
ADD COLUMN IF NOT EXISTS calendar_provider VARCHAR(50),
ADD COLUMN IF NOT EXISTS calendar_event_id TEXT;
