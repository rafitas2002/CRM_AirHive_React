-- CRM AirHive - Separación de industria logística en dos categorías operativas
-- Objetivo:
-- 1) Permitir separar autotransporte de carga (trailers) vs paquetería/mensajería
-- 2) Mantener compatibilidad con registros históricos que aún usan "Logística y transporte"
-- 3) No reclasificar automáticamente empresas existentes (requiere decisión de negocio)

BEGIN;

DO $$
DECLARE
    v_autocarga_name TEXT := 'Autotransporte de carga (trailers)';
    v_paqueteria_name TEXT := 'Paquetería y mensajería';
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM industrias
        WHERE translate(lower(BTRIM(name)), 'áéíóú', 'aeiou')
            = translate(lower(v_autocarga_name), 'áéíóú', 'aeiou')
    ) THEN
        INSERT INTO industrias (name, is_active)
        VALUES (v_autocarga_name, true);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM industrias
        WHERE translate(lower(BTRIM(name)), 'áéíóú', 'aeiou')
            = translate(lower(v_paqueteria_name), 'áéíóú', 'aeiou')
    ) THEN
        INSERT INTO industrias (name, is_active)
        VALUES (v_paqueteria_name, true);
    END IF;
END $$;

COMMIT;

