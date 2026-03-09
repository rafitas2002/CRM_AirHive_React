-- Hardening: evitar que el trigger de ubicaciones estructuradas falle por RLS en company_locations.
-- Caso observado:
--   "new row violates row-level security policy for table \"company_locations\""
-- al insertar/actualizar empresas o pre_leads con ubicacion.
--
-- Causa:
-- - `sync_company_location_structured_fields()` (069) hace upsert en `company_locations`
-- - `company_locations` (068) solo expone policy SELECT para `authenticated`
-- - el trigger corría como invoker (sin SECURITY DEFINER)
--
-- Solución:
-- - recrear la función del trigger como SECURITY DEFINER con search_path fijo
-- - mantener fallback no bloqueante si el catálogo no existe o hay restricciones inesperadas

BEGIN;

CREATE OR REPLACE FUNCTION sync_company_location_structured_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_facet RECORD;
    v_catalog_id UUID;
BEGIN
    SELECT *
    INTO v_facet
    FROM get_company_location_structured_facet(NEW.ubicacion)
    LIMIT 1;

    NEW.ubicacion := v_facet.normalized_label;
    NEW.ubicacion_duplicate_key := v_facet.duplicate_key;
    NEW.ubicacion_group := v_facet.group_label;
    NEW.ubicacion_group_key := v_facet.group_key;
    NEW.ubicacion_municipio := v_facet.monterrey_municipio;
    NEW.ubicacion_municipio_key := v_facet.monterrey_municipio_key;
    NEW.ubicacion_is_monterrey_metro := COALESCE(v_facet.is_monterrey_metro, FALSE);

    NEW.ubicacion_catalog_id := NULL;

    IF v_facet.duplicate_key IS NOT NULL
       AND to_regclass('public.company_locations') IS NOT NULL
       AND to_regclass('public.idx_company_locations_duplicate_key_unique') IS NOT NULL THEN
        BEGIN
            INSERT INTO company_locations (name, duplicate_key, is_active)
            VALUES (v_facet.normalized_label, v_facet.duplicate_key, TRUE)
            ON CONFLICT (duplicate_key) DO UPDATE
            SET name = EXCLUDED.name,
                is_active = TRUE
            RETURNING id INTO v_catalog_id;

            NEW.ubicacion_catalog_id := v_catalog_id;
        EXCEPTION
            WHEN undefined_table OR undefined_column OR insufficient_privilege THEN
                -- No bloquear writes de empresas/pre_leads por estado parcial de catálogo/permisos.
                NEW.ubicacion_catalog_id := NULL;
        END;
    END IF;

    RETURN NEW;
END;
$$;

COMMIT;

