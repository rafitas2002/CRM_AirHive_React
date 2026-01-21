-- ============================================
-- SCRIPT MAESTRO DE REINICIO: SISTEMA DE CALENDARIO
-- ============================================
-- ⚠️ ADVERTENCIA: Este script borrará datos de juntas existentes.
-- Tus clientes y empresas NO se borrarán.

BEGIN;

-- 1. Limpieza de tablas antiguas (Orden correcto para evitar error de FK)
DROP TABLE IF EXISTS meeting_alerts CASCADE;
DROP TABLE IF EXISTS meeting_confirmations CASCADE;
DROP TABLE IF EXISTS forecast_snapshots CASCADE;
DROP TABLE IF EXISTS meetings CASCADE;

-- 2. Limpieza de columnas en clientes (Opcional, para reiniciar estado)
ALTER TABLE clientes 
DROP COLUMN IF EXISTS probability_locked,
DROP COLUMN IF EXISTS next_meeting_id,
DROP COLUMN IF EXISTS last_snapshot_at;

-- ============================================
-- 3. Crear Tablas Principales
-- ============================================

-- Tabla: meetings
CREATE TABLE meetings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    seller_id UUID NOT NULL DEFAULT auth.uid(), -- Asigna usuario actual por defecto
    title VARCHAR(255) NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 60,
    meeting_type VARCHAR(50) NOT NULL CHECK (meeting_type IN ('presencial', 'llamada', 'video')),
    notes TEXT,
    attendees TEXT[],
    calendar_provider VARCHAR(50), -- 'google', 'outlook', etc.
    calendar_event_id TEXT,
    
    -- Estado de la junta
    status VARCHAR(50) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
    meeting_status VARCHAR(50) DEFAULT 'scheduled' CHECK (meeting_status IN ('scheduled', 'held', 'not_held', 'pending_confirmation', 'cancelled')),
    
    -- Campos de confirmación y snapshot
    frozen_probability_value DECIMAL(5,2),
    confirmation_timestamp TIMESTAMPTZ,
    confirmed_by UUID REFERENCES auth.users(id),
    confirmation_notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla: meeting_alerts (Notificaciones)
CREATE TABLE meeting_alerts (
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

-- Tabla: forecast_snapshots (Historial de pronósticos)
CREATE TABLE forecast_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    seller_id UUID NOT NULL REFERENCES auth.users(id),
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    snapshot_number INTEGER NOT NULL,
    probability DECIMAL(5,2) NOT NULL CHECK (probability >= 0 AND probability <= 100),
    snapshot_timestamp TIMESTAMPTZ NOT NULL,
    source VARCHAR(50) DEFAULT 'meeting_confirmed_held',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(lead_id, meeting_id) -- Un snapshot por junta por cliente
);

-- Tabla: meeting_confirmations (Log de confirmaciones)
CREATE TABLE meeting_confirmations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    confirmed_by UUID NOT NULL REFERENCES auth.users(id),
    was_held BOOLEAN NOT NULL,
    confirmation_notes TEXT,
    snapshot_created BOOLEAN DEFAULT FALSE,
    snapshot_id UUID REFERENCES forecast_snapshots(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4. Actualizar Tabla Clientes
-- ============================================
ALTER TABLE clientes
ADD COLUMN probability_locked BOOLEAN DEFAULT FALSE,
ADD COLUMN next_meeting_id UUID REFERENCES meetings(id) ON DELETE SET NULL,
ADD COLUMN last_snapshot_at TIMESTAMPTZ;

-- ============================================
-- 5. Seguridad Row Level Security (RLS)
-- ============================================

-- Habilitar RLS
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_snapshots ENABLE ROW LEVEL SECURITY;

-- Políticas para Meetings
CREATE POLICY "Users can manage their own meetings" ON meetings
    USING (auth.uid() = seller_id)
    WITH CHECK (auth.uid() = seller_id);

-- Políticas para Alerts
CREATE POLICY "Users can manage their own alerts" ON meeting_alerts
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Políticas para Confirmations
CREATE POLICY "Users can manage their own confirmations" ON meeting_confirmations
    USING (auth.uid() = confirmed_by)
    WITH CHECK (auth.uid() = confirmed_by);

-- Políticas para Snapshots
CREATE POLICY "Users can view snapshots" ON forecast_snapshots
    FOR SELECT USING (auth.uid() = seller_id);

CREATE POLICY "System can insert snapshots" ON forecast_snapshots
    FOR INSERT WITH CHECK (auth.uid() = seller_id);

-- ============================================
-- 6. Funciones y Triggers
-- ============================================

-- Trigger para crear alertas automáticamente
CREATE OR REPLACE FUNCTION create_meeting_alerts()
RETURNS TRIGGER AS $$
BEGIN
  -- Solo crear alertas para juntas futuras
  IF NEW.start_time > NOW() THEN
    -- 24h
    IF (NEW.start_time - INTERVAL '24 hours') > NOW() THEN
      INSERT INTO meeting_alerts (meeting_id, user_id, alert_type, alert_time)
      VALUES (NEW.id, NEW.seller_id, '24h', NEW.start_time - INTERVAL '24 hours');
    END IF;
    -- 2h
    IF (NEW.start_time - INTERVAL '2 hours') > NOW() THEN
      INSERT INTO meeting_alerts (meeting_id, user_id, alert_type, alert_time)
      VALUES (NEW.id, NEW.seller_id, '2h', NEW.start_time - INTERVAL '2 hours');
    END IF;
    -- 15min
    IF (NEW.start_time - INTERVAL '15 minutes') > NOW() THEN
      INSERT INTO meeting_alerts (meeting_id, user_id, alert_type, alert_time)
      VALUES (NEW.id, NEW.seller_id, '15min', NEW.start_time - INTERVAL '15 minutes');
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_meeting_alerts
AFTER INSERT ON meetings
FOR EACH ROW
EXECUTE FUNCTION create_meeting_alerts();


-- Función para actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_meetings_updated_at
BEFORE UPDATE ON meetings
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Permisos básicos
GRANT ALL ON meetings TO authenticated;
GRANT ALL ON meeting_alerts TO authenticated;
GRANT ALL ON meeting_confirmations TO authenticated;
GRANT ALL ON forecast_snapshots TO authenticated;

COMMIT;
