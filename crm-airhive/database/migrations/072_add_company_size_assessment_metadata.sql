-- Metadatos de clasificación de tamaño de empresa (DB-first)
-- Objetivo:
-- 1) Reducir subjetividad documentando fuente y confianza de la clasificación
-- 2) Guardar la señal principal usada por el vendedor (evidencia breve)
-- 3) Estandarizar valores con checks + trigger en empresas y pre_leads

BEGIN;

ALTER TABLE empresas
    ADD COLUMN IF NOT EXISTS tamano_fuente TEXT NULL,
    ADD COLUMN IF NOT EXISTS tamano_confianza TEXT NULL,
    ADD COLUMN IF NOT EXISTS tamano_senal_principal TEXT NULL;

ALTER TABLE pre_leads
    ADD COLUMN IF NOT EXISTS tamano_fuente TEXT NULL,
    ADD COLUMN IF NOT EXISTS tamano_confianza TEXT NULL,
    ADD COLUMN IF NOT EXISTS tamano_senal_principal TEXT NULL;

-- Backfill pragmático para registros con tamaño ya capturado pero sin metadata.
UPDATE empresas
SET tamano_fuente = 'inferencia_comercial'
WHERE tamano IS NOT NULL
  AND (tamano_fuente IS NULL OR BTRIM(tamano_fuente) = '');

UPDATE pre_leads
SET tamano_fuente = 'inferencia_comercial'
WHERE tamano IS NOT NULL
  AND (tamano_fuente IS NULL OR BTRIM(tamano_fuente) = '');

UPDATE empresas
SET tamano_confianza = 'baja'
WHERE tamano IS NOT NULL
  AND (tamano_confianza IS NULL OR BTRIM(tamano_confianza) = '');

UPDATE pre_leads
SET tamano_confianza = 'baja'
WHERE tamano IS NOT NULL
  AND (tamano_confianza IS NULL OR BTRIM(tamano_confianza) = '');

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'empresas_tamano_fuente_check'
    ) THEN
        ALTER TABLE empresas
            ADD CONSTRAINT empresas_tamano_fuente_check
            CHECK (
                tamano_fuente IS NULL
                OR tamano_fuente IN ('cliente_confirmado', 'linkedin', 'sitio_web', 'inferencia_comercial', 'otro')
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'empresas_tamano_confianza_check'
    ) THEN
        ALTER TABLE empresas
            ADD CONSTRAINT empresas_tamano_confianza_check
            CHECK (
                tamano_confianza IS NULL
                OR tamano_confianza IN ('alta', 'media', 'baja')
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'empresas_tamano_senal_principal_len_check'
    ) THEN
        ALTER TABLE empresas
            ADD CONSTRAINT empresas_tamano_senal_principal_len_check
            CHECK (
                tamano_senal_principal IS NULL
                OR CHAR_LENGTH(BTRIM(tamano_senal_principal)) BETWEEN 1 AND 280
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'pre_leads_tamano_fuente_check'
    ) THEN
        ALTER TABLE pre_leads
            ADD CONSTRAINT pre_leads_tamano_fuente_check
            CHECK (
                tamano_fuente IS NULL
                OR tamano_fuente IN ('cliente_confirmado', 'linkedin', 'sitio_web', 'inferencia_comercial', 'otro')
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'pre_leads_tamano_confianza_check'
    ) THEN
        ALTER TABLE pre_leads
            ADD CONSTRAINT pre_leads_tamano_confianza_check
            CHECK (
                tamano_confianza IS NULL
                OR tamano_confianza IN ('alta', 'media', 'baja')
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'pre_leads_tamano_senal_principal_len_check'
    ) THEN
        ALTER TABLE pre_leads
            ADD CONSTRAINT pre_leads_tamano_senal_principal_len_check
            CHECK (
                tamano_senal_principal IS NULL
                OR CHAR_LENGTH(BTRIM(tamano_senal_principal)) BETWEEN 1 AND 280
            );
    END IF;
END $$;

CREATE OR REPLACE FUNCTION sync_company_size_assessment_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.tamano_fuente := lower(NULLIF(BTRIM(COALESCE(NEW.tamano_fuente, '')), ''));
    NEW.tamano_confianza := lower(NULLIF(BTRIM(COALESCE(NEW.tamano_confianza, '')), ''));
    NEW.tamano_senal_principal := NULLIF(BTRIM(COALESCE(NEW.tamano_senal_principal, '')), '');

    IF NEW.tamano IS NULL THEN
        NEW.tamano_fuente := NULL;
        NEW.tamano_confianza := NULL;
        NEW.tamano_senal_principal := NULL;
        RETURN NEW;
    END IF;

    NEW.tamano_fuente := COALESCE(NEW.tamano_fuente, 'inferencia_comercial');
    NEW.tamano_confianza := COALESCE(NEW.tamano_confianza, 'media');

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_empresas_sync_company_size_assessment_metadata ON empresas;
CREATE TRIGGER trg_empresas_sync_company_size_assessment_metadata
BEFORE INSERT OR UPDATE OF tamano, tamano_fuente, tamano_confianza, tamano_senal_principal ON empresas
FOR EACH ROW
EXECUTE FUNCTION sync_company_size_assessment_metadata();

DROP TRIGGER IF EXISTS trg_pre_leads_sync_company_size_assessment_metadata ON pre_leads;
CREATE TRIGGER trg_pre_leads_sync_company_size_assessment_metadata
BEFORE INSERT OR UPDATE OF tamano, tamano_fuente, tamano_confianza, tamano_senal_principal ON pre_leads
FOR EACH ROW
EXECUTE FUNCTION sync_company_size_assessment_metadata();

-- Normaliza de nuevo con trigger para legacy ya existente.
UPDATE empresas
SET tamano_fuente = tamano_fuente
WHERE tamano IS NOT NULL;

UPDATE pre_leads
SET tamano_fuente = tamano_fuente
WHERE tamano IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_empresas_tamano_fuente
    ON empresas (tamano_fuente);

CREATE INDEX IF NOT EXISTS idx_empresas_tamano_confianza
    ON empresas (tamano_confianza);

CREATE INDEX IF NOT EXISTS idx_pre_leads_tamano_fuente
    ON pre_leads (tamano_fuente);

CREATE INDEX IF NOT EXISTS idx_pre_leads_tamano_confianza
    ON pre_leads (tamano_confianza);

COMMIT;
