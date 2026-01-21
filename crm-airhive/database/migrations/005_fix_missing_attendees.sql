-- Fix missing attendees column
ALTER TABLE meetings
ADD COLUMN IF NOT EXISTS attendees TEXT[];
