-- Add table for storing user calendar OAuth tokens
-- This allows users to connect their @airhivemx.com Google Workspace accounts

CREATE TABLE IF NOT EXISTS user_calendar_tokens (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL CHECK (provider IN ('google', 'outlook')),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  email VARCHAR(255), -- Store the connected email for reference
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_calendar_tokens_user_id ON user_calendar_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_tokens_provider ON user_calendar_tokens(provider);

-- Trigger to update updated_at
DROP TRIGGER IF EXISTS update_calendar_tokens_updated_at ON user_calendar_tokens;
CREATE TRIGGER update_calendar_tokens_updated_at
    BEFORE UPDATE ON user_calendar_tokens
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE user_calendar_tokens IS 'Stores OAuth tokens for calendar integrations (Google Workspace, Outlook)';
COMMENT ON COLUMN user_calendar_tokens.provider IS 'Calendar provider: google or outlook';
COMMENT ON COLUMN user_calendar_tokens.access_token IS 'OAuth access token (encrypted in production)';
COMMENT ON COLUMN user_calendar_tokens.refresh_token IS 'OAuth refresh token for renewing access';
COMMENT ON COLUMN user_calendar_tokens.expires_at IS 'When the access token expires';
