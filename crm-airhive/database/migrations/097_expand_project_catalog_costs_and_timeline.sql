-- Amplia el catálogo de proyectos para planeación operativa y financiera interna.
-- Mantiene todos los campos nuevos como opcionales.

ALTER TABLE IF EXISTS proyectos_catalogo
    ADD COLUMN IF NOT EXISTS tiempo_implementacion_dias INTEGER NULL,
    ADD COLUMN IF NOT EXISTS costo_interno_mensualidad_usd NUMERIC(12, 2) NULL,
    ADD COLUMN IF NOT EXISTS costo_interno_implementacion_usd NUMERIC(12, 2) NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'proyectos_catalogo_tiempo_implementacion_dias_check'
    ) THEN
        ALTER TABLE proyectos_catalogo
            ADD CONSTRAINT proyectos_catalogo_tiempo_implementacion_dias_check
            CHECK (
                tiempo_implementacion_dias IS NULL
                OR tiempo_implementacion_dias >= 0
            );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'proyectos_catalogo_costo_interno_mensualidad_usd_check'
    ) THEN
        ALTER TABLE proyectos_catalogo
            ADD CONSTRAINT proyectos_catalogo_costo_interno_mensualidad_usd_check
            CHECK (
                costo_interno_mensualidad_usd IS NULL
                OR costo_interno_mensualidad_usd >= 0
            );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'proyectos_catalogo_costo_interno_implementacion_usd_check'
    ) THEN
        ALTER TABLE proyectos_catalogo
            ADD CONSTRAINT proyectos_catalogo_costo_interno_implementacion_usd_check
            CHECK (
                costo_interno_implementacion_usd IS NULL
                OR costo_interno_implementacion_usd >= 0
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_proyectos_catalogo_tiempo_implementacion_dias
    ON proyectos_catalogo (tiempo_implementacion_dias);

