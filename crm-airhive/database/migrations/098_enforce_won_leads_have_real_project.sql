-- Asegura que ningún lead en etapa Cerrado Ganado quede sin al menos
-- un proyecto implementado real.
--
-- Compatibilidad:
-- - Si existe columna legacy/denormalizada `proyectos_implementados_reales_ids`
--   en `clientes`, se toma en cuenta.
-- - En esquema actual (normalizado), valida en `empresa_proyecto_asignaciones`.

CREATE OR REPLACE FUNCTION enforce_won_lead_requires_real_project()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_projects_json JSONB;
    v_projects_count INTEGER := 0;
    v_has_real_assignment BOOLEAN := FALSE;
BEGIN
    IF NOT is_won_stage(NEW.etapa) THEN
        RETURN NEW;
    END IF;

    -- Soporta esquemas donde el payload incluya esta columna (si existe).
    v_projects_json := to_jsonb(NEW) -> 'proyectos_implementados_reales_ids';
    IF v_projects_json IS NOT NULL AND jsonb_typeof(v_projects_json) = 'array' THEN
        v_projects_count := jsonb_array_length(v_projects_json);
    END IF;

    IF to_regclass('public.empresa_proyecto_asignaciones') IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1
            FROM empresa_proyecto_asignaciones epa
            WHERE epa.assignment_stage = 'implemented_real'
              AND (
                (NEW.id IS NOT NULL AND epa.source_lead_id = NEW.id)
                OR (NEW.empresa_id IS NOT NULL AND epa.empresa_id = NEW.empresa_id)
              )
        )
        INTO v_has_real_assignment;
    END IF;

    IF v_projects_count <= 0 AND NOT v_has_real_assignment THEN
        RAISE EXCEPTION 'Para guardar Cerrado Ganado debes asignar al menos 1 proyecto implementado real.'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_won_lead_requires_real_project ON clientes;

CREATE TRIGGER trg_enforce_won_lead_requires_real_project
BEFORE INSERT OR UPDATE OF etapa, empresa_id
ON clientes
FOR EACH ROW
EXECUTE FUNCTION enforce_won_lead_requires_real_project();
