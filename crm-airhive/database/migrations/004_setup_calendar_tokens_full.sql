-- 1. Crear la tabla si no existe
CREATE TABLE IF NOT EXISTS user_calendar_tokens (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL CHECK (provider IN ('google', 'outlook')),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  email VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Habilitar Seguridad de Nivel de Fila (RLS)
ALTER TABLE user_calendar_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_calendar_tokens FORCE ROW LEVEL SECURITY;

-- 3. Crear Políticas de Acceso
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
