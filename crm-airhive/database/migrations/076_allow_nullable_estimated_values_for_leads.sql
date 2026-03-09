-- Permite registrar "No disponible" en pronósticos de valor al crear/editar leads.
-- Esto evita romper creación en bases antiguas que todavía tienen NOT NULL en columnas estimadas.

BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = 'clientes'
          AND a.attname = 'valor_estimado'
          AND a.attnotnull
    ) THEN
        ALTER TABLE clientes ALTER COLUMN valor_estimado DROP NOT NULL;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = 'clientes'
          AND a.attname = 'valor_implementacion_estimado'
          AND a.attnotnull
    ) THEN
        ALTER TABLE clientes ALTER COLUMN valor_implementacion_estimado DROP NOT NULL;
    END IF;
END $$;

ALTER TABLE IF EXISTS clientes
    ALTER COLUMN valor_estimado DROP DEFAULT,
    ALTER COLUMN valor_implementacion_estimado DROP DEFAULT;

COMMIT;
