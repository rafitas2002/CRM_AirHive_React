BEGIN;

ALTER TABLE IF EXISTS clientes
    ADD COLUMN IF NOT EXISTS sede_objetivo TEXT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'clientes_sede_objetivo_len_check'
    ) THEN
        ALTER TABLE clientes
            ADD CONSTRAINT clientes_sede_objetivo_len_check
            CHECK (
                sede_objetivo IS NULL
                OR CHAR_LENGTH(BTRIM(sede_objetivo)) BETWEEN 1 AND 200
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_clientes_empresa_sede_objetivo
    ON clientes (empresa_id, sede_objetivo);

ALTER TABLE IF EXISTS lead_proyecto_asignaciones
    ADD COLUMN IF NOT EXISTS sede_objetivo TEXT NULL;

ALTER TABLE IF EXISTS empresa_proyecto_asignaciones
    ADD COLUMN IF NOT EXISTS sede_objetivo TEXT NULL;

DO $$
BEGIN
    IF to_regclass('public.lead_proyecto_asignaciones') IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
           FROM pg_constraint
           WHERE conname = 'lead_proyecto_asignaciones_sede_objetivo_len_check'
       ) THEN
        ALTER TABLE lead_proyecto_asignaciones
            ADD CONSTRAINT lead_proyecto_asignaciones_sede_objetivo_len_check
            CHECK (
                sede_objetivo IS NULL
                OR CHAR_LENGTH(BTRIM(sede_objetivo)) BETWEEN 1 AND 200
            );
    END IF;

    IF to_regclass('public.empresa_proyecto_asignaciones') IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
           FROM pg_constraint
           WHERE conname = 'empresa_proyecto_asignaciones_sede_objetivo_len_check'
       ) THEN
        ALTER TABLE empresa_proyecto_asignaciones
            ADD CONSTRAINT empresa_proyecto_asignaciones_sede_objetivo_len_check
            CHECK (
                sede_objetivo IS NULL
                OR CHAR_LENGTH(BTRIM(sede_objetivo)) BETWEEN 1 AND 200
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lead_proyecto_asignaciones_sede_objetivo
    ON lead_proyecto_asignaciones (lead_id, sede_objetivo);

CREATE INDEX IF NOT EXISTS idx_empresa_proyecto_asignaciones_sede_objetivo
    ON empresa_proyecto_asignaciones (empresa_id, sede_objetivo);

DO $$
BEGIN
    IF to_regclass('public.lead_proyecto_asignaciones') IS NOT NULL THEN
        UPDATE lead_proyecto_asignaciones lpa
        SET sede_objetivo = c.sede_objetivo
        FROM clientes c
        WHERE lpa.lead_id = c.id
          AND (lpa.sede_objetivo IS NULL OR BTRIM(lpa.sede_objetivo) = '')
          AND c.sede_objetivo IS NOT NULL
          AND BTRIM(c.sede_objetivo) <> '';
    END IF;

    IF to_regclass('public.empresa_proyecto_asignaciones') IS NOT NULL THEN
        UPDATE empresa_proyecto_asignaciones epa
        SET sede_objetivo = c.sede_objetivo
        FROM clientes c
        WHERE epa.source_lead_id = c.id
          AND (epa.sede_objetivo IS NULL OR BTRIM(epa.sede_objetivo) = '')
          AND c.sede_objetivo IS NOT NULL
          AND BTRIM(c.sede_objetivo) <> '';
    END IF;
END $$;

COMMIT;
