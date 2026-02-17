-- Ensure multi-area support exists even if previous migrations were partial.
ALTER TABLE IF EXISTS employee_profiles
ADD COLUMN IF NOT EXISTS area_ids UUID[] DEFAULT '{}'::UUID[];

UPDATE employee_profiles
SET area_ids = ARRAY[area_id]::UUID[]
WHERE area_id IS NOT NULL
  AND (area_ids IS NULL OR cardinality(area_ids) = 0);

-- Ensure "Diseño" exists in areas catalog.
INSERT INTO areas (name, is_active)
SELECT 'Diseño', true
WHERE NOT EXISTS (
    SELECT 1
    FROM areas
    WHERE lower(name) IN ('diseño', 'diseno')
);

