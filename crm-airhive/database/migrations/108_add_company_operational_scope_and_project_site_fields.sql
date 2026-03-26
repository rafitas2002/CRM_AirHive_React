BEGIN;

ALTER TABLE empresas
    ADD COLUMN IF NOT EXISTS alcance_empresa TEXT NULL,
    ADD COLUMN IF NOT EXISTS sede_objetivo TEXT NULL,
    ADD COLUMN IF NOT EXISTS sedes_sugeridas JSONB NULL;

ALTER TABLE empresas
    ALTER COLUMN alcance_empresa SET DEFAULT 'por_definir';

UPDATE empresas
SET alcance_empresa = 'por_definir'
WHERE alcance_empresa IS NULL OR BTRIM(alcance_empresa) = '';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'empresas_alcance_empresa_check'
    ) THEN
        ALTER TABLE empresas
            ADD CONSTRAINT empresas_alcance_empresa_check
            CHECK (
                alcance_empresa IS NULL
                OR alcance_empresa IN ('local', 'nacional', 'internacional', 'por_definir')
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'empresas_sede_objetivo_len_check'
    ) THEN
        ALTER TABLE empresas
            ADD CONSTRAINT empresas_sede_objetivo_len_check
            CHECK (
                sede_objetivo IS NULL
                OR CHAR_LENGTH(BTRIM(sede_objetivo)) BETWEEN 1 AND 200
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'empresas_sedes_sugeridas_json_check'
    ) THEN
        ALTER TABLE empresas
            ADD CONSTRAINT empresas_sedes_sugeridas_json_check
            CHECK (
                sedes_sugeridas IS NULL
                OR (
                    jsonb_typeof(sedes_sugeridas) = 'array'
                    AND jsonb_array_length(sedes_sugeridas) <= 20
                )
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_empresas_alcance_empresa
    ON empresas (alcance_empresa);

COMMIT;
