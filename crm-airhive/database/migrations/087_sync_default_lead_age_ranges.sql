-- Sincroniza rangos de edad por defecto para perfiles de prospecto.
-- Ejecutar después de la migración 086.

DO $$
BEGIN
    IF to_regclass('public.lead_age_ranges_catalog') IS NULL THEN
        RAISE EXCEPTION 'La tabla public.lead_age_ranges_catalog no existe. Ejecuta primero la migración 086_add_extended_prospect_profile_fields.sql';
    END IF;
END $$;

INSERT INTO lead_age_ranges_catalog (code, label, min_age, max_age, sort_order, is_active)
VALUES
    ('18_24', '18 a 24 años', 18, 24, 10, TRUE),
    ('25_34', '25 a 34 años', 25, 34, 20, TRUE),
    ('35_44', '35 a 44 años', 35, 44, 30, TRUE),
    ('45_54', '45 a 54 años', 45, 54, 40, TRUE),
    ('55_64', '55 a 64 años', 55, 64, 50, TRUE),
    ('65_plus', '65 años o más', 65, NULL, 60, TRUE)
ON CONFLICT (code) DO UPDATE
SET
    label = EXCLUDED.label,
    min_age = EXCLUDED.min_age,
    max_age = EXCLUDED.max_age,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- Normaliza etiquetas legacy (si existieran) para no duplicar análisis.
UPDATE lead_age_ranges_catalog
SET
    label = '18 a 24 años',
    min_age = 18,
    max_age = 24,
    sort_order = 10,
    is_active = TRUE,
    updated_at = NOW()
WHERE code = '18-24';

UPDATE lead_age_ranges_catalog
SET
    label = '25 a 34 años',
    min_age = 25,
    max_age = 34,
    sort_order = 20,
    is_active = TRUE,
    updated_at = NOW()
WHERE code = '25-34';

UPDATE lead_age_ranges_catalog
SET
    label = '35 a 44 años',
    min_age = 35,
    max_age = 44,
    sort_order = 30,
    is_active = TRUE,
    updated_at = NOW()
WHERE code = '35-44';

UPDATE lead_age_ranges_catalog
SET
    label = '45 a 54 años',
    min_age = 45,
    max_age = 54,
    sort_order = 40,
    is_active = TRUE,
    updated_at = NOW()
WHERE code = '45-54';

UPDATE lead_age_ranges_catalog
SET
    label = '55 a 64 años',
    min_age = 55,
    max_age = 64,
    sort_order = 50,
    is_active = TRUE,
    updated_at = NOW()
WHERE code = '55-64';

UPDATE lead_age_ranges_catalog
SET
    label = '65 años o más',
    min_age = 65,
    max_age = NULL,
    sort_order = 60,
    is_active = TRUE,
    updated_at = NOW()
WHERE code IN ('65+', '65_mas');
