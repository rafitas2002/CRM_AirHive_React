-- Structured catalog for meeting cancellation reasons.
-- Enables consistent analytics/correlations across not-held meetings.

CREATE TABLE IF NOT EXISTS meeting_cancellation_reasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE CHECK (char_length(trim(code)) > 0),
    label TEXT NOT NULL CHECK (char_length(trim(label)) > 0),
    description TEXT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 100,
    created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meeting_cancel_reasons_active_sort
    ON meeting_cancellation_reasons (is_active, sort_order, label);

DROP TRIGGER IF EXISTS trg_meeting_cancellation_reasons_set_updated_at ON meeting_cancellation_reasons;
CREATE TRIGGER trg_meeting_cancellation_reasons_set_updated_at
BEFORE UPDATE ON meeting_cancellation_reasons
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_column();

INSERT INTO meeting_cancellation_reasons (code, label, description, is_active, is_default, sort_order)
VALUES
    ('cliente_no_asistio', 'El cliente no asistió', 'El contacto externo no se conectó o no acudió.', TRUE, TRUE, 10),
    ('conflicto_agenda_cliente', 'Conflicto de agenda del cliente', 'El cliente tuvo traslape de agenda.', TRUE, TRUE, 20),
    ('conflicto_agenda_interno', 'Conflicto de agenda interno', 'Nuestro equipo tuvo traslape de agenda.', TRUE, TRUE, 30),
    ('reagenda_solicitada_cliente', 'Reprogramación solicitada por el cliente', 'El cliente pidió reprogramar la junta.', TRUE, TRUE, 40),
    ('reagenda_solicitada_interno', 'Reprogramación solicitada por nuestro equipo', 'Nuestro equipo pidió reprogramar.', TRUE, TRUE, 50),
    ('decision_maker_no_disponible', 'Persona decisora no disponible', 'La persona clave no estuvo disponible.', TRUE, TRUE, 60),
    ('problema_tecnico_conexion', 'Problemas técnicos o de conectividad', 'Falla de internet, audio/video o plataforma.', TRUE, TRUE, 70),
    ('falta_informacion_previa', 'Información previa insuficiente para realizar la reunión', 'No estaban listos documentos/insumos necesarios.', TRUE, TRUE, 80),
    ('cambio_prioridad_cliente', 'Cambio de prioridad del cliente', 'El cliente movió enfoque a otra prioridad interna.', TRUE, TRUE, 90),
    ('motivo_no_especificado', 'Motivo no especificado por la contraparte', 'No se proporcionó una razón concreta al momento de cancelar.', TRUE, TRUE, 100)
ON CONFLICT (code) DO UPDATE
SET
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active,
    is_default = EXCLUDED.is_default,
    sort_order = EXCLUDED.sort_order,
    updated_at = NOW();

ALTER TABLE meetings
ADD COLUMN IF NOT EXISTS not_held_reason_id UUID NULL;

ALTER TABLE meeting_confirmations
ADD COLUMN IF NOT EXISTS not_held_reason_id UUID NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'meetings_not_held_reason_id_fkey'
    ) THEN
        ALTER TABLE meetings
            ADD CONSTRAINT meetings_not_held_reason_id_fkey
            FOREIGN KEY (not_held_reason_id)
            REFERENCES meeting_cancellation_reasons(id)
            ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'meeting_confirmations_not_held_reason_id_fkey'
    ) THEN
        ALTER TABLE meeting_confirmations
            ADD CONSTRAINT meeting_confirmations_not_held_reason_id_fkey
            FOREIGN KEY (not_held_reason_id)
            REFERENCES meeting_cancellation_reasons(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_meetings_not_held_reason_id
    ON meetings (not_held_reason_id)
    WHERE meeting_status = 'not_held';

CREATE INDEX IF NOT EXISTS idx_meeting_confirmations_not_held_reason_id
    ON meeting_confirmations (not_held_reason_id)
    WHERE was_held = FALSE;

UPDATE meetings m
SET not_held_reason_id = r.id
FROM meeting_cancellation_reasons r
WHERE m.meeting_status = 'not_held'
  AND m.not_held_reason_id IS NULL
  AND trim(coalesce(m.not_held_reason, '')) <> ''
  AND lower(trim(m.not_held_reason)) = lower(trim(r.label));

UPDATE meeting_confirmations mc
SET not_held_reason_id = m.not_held_reason_id
FROM meetings m
WHERE m.id = mc.meeting_id
  AND mc.was_held = FALSE
  AND mc.not_held_reason_id IS NULL
  AND m.not_held_reason_id IS NOT NULL;

ALTER TABLE meeting_cancellation_reasons ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'meeting_cancellation_reasons'
          AND policyname = 'meeting_cancellation_reasons_select_authenticated'
    ) THEN
        CREATE POLICY "meeting_cancellation_reasons_select_authenticated"
        ON meeting_cancellation_reasons FOR SELECT
        USING (auth.role() = 'authenticated');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'meeting_cancellation_reasons'
          AND policyname = 'meeting_cancellation_reasons_insert_own'
    ) THEN
        CREATE POLICY "meeting_cancellation_reasons_insert_own"
        ON meeting_cancellation_reasons FOR INSERT
        WITH CHECK (auth.uid() = created_by);
    END IF;
END $$;

GRANT SELECT, INSERT ON meeting_cancellation_reasons TO authenticated;

CREATE OR REPLACE VIEW meeting_cancellation_reason_analytics_view AS
SELECT
    m.id AS meeting_id,
    m.seller_id,
    m.lead_id,
    m.start_time,
    m.duration_minutes,
    m.meeting_type,
    m.not_held_responsibility,
    COALESCE(r.id, m.not_held_reason_id) AS reason_id,
    COALESCE(r.code, 'sin_catalogo') AS reason_code,
    COALESCE(r.label, m.not_held_reason, 'Sin motivo') AS reason_label,
    c.empresa_id,
    c.empresa,
    c.etapa,
    c.owner_id AS lead_owner_id
FROM meetings m
LEFT JOIN meeting_cancellation_reasons r
    ON r.id = m.not_held_reason_id
LEFT JOIN clientes c
    ON c.id = m.lead_id
WHERE m.meeting_status = 'not_held';

GRANT SELECT ON meeting_cancellation_reason_analytics_view TO authenticated;
