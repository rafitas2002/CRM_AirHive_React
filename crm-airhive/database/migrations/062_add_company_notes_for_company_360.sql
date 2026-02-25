-- Company 360 Notes
-- Enables quick account notes directly from the company detail view (Empresa 360).

CREATE TABLE IF NOT EXISTS empresa_notas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    note_text TEXT NOT NULL CHECK (char_length(trim(note_text)) > 0),
    note_type TEXT NULL CHECK (note_type IN ('seguimiento', 'contexto', 'riesgo', 'acuerdo')),
    created_by UUID NULL REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_empresa_notas_empresa_id
    ON empresa_notas (empresa_id);

CREATE INDEX IF NOT EXISTS idx_empresa_notas_created_at
    ON empresa_notas (created_at DESC);

DROP TRIGGER IF EXISTS trg_empresa_notas_set_updated_at ON empresa_notas;
CREATE TRIGGER trg_empresa_notas_set_updated_at
BEFORE UPDATE ON empresa_notas
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_column();

