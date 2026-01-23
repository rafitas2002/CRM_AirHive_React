-- Enable RLS on user_calendar_tokens
ALTER TABLE user_calendar_tokens ENABLE ROW LEVEL SECURITY;
-- Force RLS for owner to ensure it applies consistently
ALTER TABLE user_calendar_tokens FORCE ROW LEVEL SECURITY;

-- Policies for user_calendar_tokens
DROP POLICY IF EXISTS "Users can view their own tokens" ON user_calendar_tokens;
CREATE POLICY "Users can view their own tokens" ON user_calendar_tokens
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own tokens" ON user_calendar_tokens;
CREATE POLICY "Users can insert their own tokens" ON user_calendar_tokens
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own tokens" ON user_calendar_tokens;
CREATE POLICY "Users can update their own tokens" ON user_calendar_tokens
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own tokens" ON user_calendar_tokens;
CREATE POLICY "Users can delete their own tokens" ON user_calendar_tokens
    FOR DELETE TO authenticated
    USING (auth.uid() = user_id);
