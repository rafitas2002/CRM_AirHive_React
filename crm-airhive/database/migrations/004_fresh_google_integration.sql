-- Clean slate migration for Google Integrations
-- Drops old tables and creates the new definitive table

-- 1. Drop the problematic old table
DROP TABLE IF EXISTS user_calendar_tokens;
DROP TABLE IF EXISTS google_connections; -- In case both exist

-- 2. Create the new clean table
CREATE TABLE google_integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL CHECK (auth.uid() = user_id), -- Enforce RLS at constraints level too if possible, but mostly for FK
  email TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_integration UNIQUE (user_id)
);

-- 3. Enable RLS
ALTER TABLE google_integrations ENABLE ROW LEVEL SECURITY;

-- 4. Create Policies
-- Allow users to view their own integration
CREATE POLICY "Users can view their own google integration"
  ON google_integrations
  FOR SELECT
  USING (auth.uid() = user_id);

-- Allow users to insert their own integration
CREATE POLICY "Users can insert their own google integration"
  ON google_integrations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own integration
CREATE POLICY "Users can update their own google integration"
  ON google_integrations
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Allow users to delete their own integration
CREATE POLICY "Users can delete their own google integration"
  ON google_integrations
  FOR DELETE
  USING (auth.uid() = user_id);

-- 5. Create updated_at trigger
create extension if not exists moddatetime schema extensions;

create trigger handle_updated_at before update on google_integrations
  for each row execute procedure moddatetime (updated_at);
