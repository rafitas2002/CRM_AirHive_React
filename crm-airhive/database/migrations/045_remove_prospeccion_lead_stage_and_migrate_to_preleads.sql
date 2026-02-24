-- Remove "Prospección" from lead lifecycle.
-- Any lead currently in Prospección is migrated back into pre_leads and removed from clientes.
-- This keeps the funnel split clean: pre_leads own prospecting, clientes own negotiation/closed stages.

DO $$
DECLARE
    migrated_count INTEGER := 0;
    upgraded_to_negotiation_count INTEGER := 0;
BEGIN
    -- Safety: if a "Prospección" lead already has operational dependencies (meetings/tasks),
    -- converting it to pre_lead would delete those rows due to FK cascades. We preserve them by
    -- promoting stage to Negociación instead.
    CREATE TEMP TABLE tmp_prospeccion_blocked_leads ON COMMIT DROP AS
    SELECT DISTINCT c.id
    FROM clientes c
    LEFT JOIN meetings m ON m.lead_id = c.id
    LEFT JOIN tareas t ON t.lead_id = c.id
    WHERE LOWER(COALESCE(c.etapa, '')) IN ('prospección', 'prospeccion')
      AND (m.id IS NOT NULL OR t.id IS NOT NULL);

    UPDATE clientes c
    SET etapa = 'Negociación'
    WHERE c.id IN (SELECT id FROM tmp_prospeccion_blocked_leads)
      AND LOWER(COALESCE(c.etapa, '')) IN ('prospección', 'prospeccion');

    GET DIAGNOSTICS upgraded_to_negotiation_count = ROW_COUNT;

    -- Collect remaining target leads first so we can reuse the same set across insert/delete/recount.
    CREATE TEMP TABLE tmp_prospeccion_leads_to_migrate ON COMMIT DROP AS
    SELECT
        c.id,
        c.empresa,
        c.nombre,
        c.contacto,
        c.email,
        c.telefono,
        c.notas,
        c.owner_id,
        c.owner_username,
        c.empresa_id,
        c.created_at,
        c.updated_at,
        COALESCE(c.created_by, c.owner_id) AS created_by_resolved,
        e.industria,
        e.industria_id,
        e.tamano,
        e.website,
        e.logo_url,
        e.ubicacion
    FROM clientes c
    LEFT JOIN empresas e ON e.id = c.empresa_id
    WHERE LOWER(COALESCE(c.etapa, '')) IN ('prospección', 'prospeccion');

    -- Insert as active pre_leads.
    INSERT INTO pre_leads (
        nombre_empresa,
        correos,
        nombre_contacto,
        telefonos,
        ubicacion,
        giro_empresa,
        vendedor_id,
        vendedor_name,
        notas,
        created_at,
        updated_at,
        empresa_id,
        industria_id,
        tamano,
        website,
        logo_url,
        is_converted,
        converted_at,
        converted_by,
        created_by,
        updated_by
    )
    SELECT
        COALESCE(NULLIF(BTRIM(t.empresa), ''), 'Empresa sin nombre') AS nombre_empresa,
        COALESCE(ARRAY_REMOVE(ARRAY[NULLIF(BTRIM(t.email), '')], NULL), ARRAY[]::TEXT[]) AS correos,
        NULLIF(BTRIM(COALESCE(t.contacto, t.nombre, '')), '') AS nombre_contacto,
        COALESCE(ARRAY_REMOVE(ARRAY[NULLIF(BTRIM(t.telefono), '')], NULL), ARRAY[]::TEXT[]) AS telefonos,
        NULLIF(BTRIM(COALESCE(t.ubicacion, '')), '') AS ubicacion,
        COALESCE(NULLIF(BTRIM(t.industria), ''), 'Sin clasificar') AS giro_empresa,
        t.owner_id AS vendedor_id,
        t.owner_username AS vendedor_name,
        t.notas,
        COALESCE(t.created_at, NOW()) AS created_at,
        COALESCE(t.updated_at, t.created_at, NOW()) AS updated_at,
        t.empresa_id,
        t.industria_id,
        t.tamano,
        t.website,
        t.logo_url,
        FALSE AS is_converted,
        NULL::TIMESTAMPTZ AS converted_at,
        NULL::UUID AS converted_by,
        t.created_by_resolved AS created_by,
        t.owner_id AS updated_by
    FROM tmp_prospeccion_leads_to_migrate t;

    GET DIAGNOSTICS migrated_count = ROW_COUNT;

    -- Remove prospecting rows from leads.
    DELETE FROM clientes c
    USING tmp_prospeccion_leads_to_migrate t
    WHERE c.id = t.id;

    -- Recalculate lifecycle counters/stages for affected companies.
    WITH affected_companies AS (
        SELECT DISTINCT empresa_id
        FROM tmp_prospeccion_leads_to_migrate
        WHERE empresa_id IS NOT NULL
    ),
    pre_stats AS (
        SELECT
            pl.empresa_id,
            COUNT(*)::INTEGER AS total_pre_leads,
            MIN(pl.created_at) AS first_pre_lead_at,
            MAX(pl.created_at) AS last_pre_lead_at
        FROM pre_leads pl
        JOIN affected_companies ac ON ac.empresa_id = pl.empresa_id
        GROUP BY pl.empresa_id
    ),
    lead_stats AS (
        SELECT
            c.empresa_id,
            COUNT(*)::INTEGER AS total_leads,
            MIN(c.created_at) AS first_lead_at,
            MAX(c.created_at) AS last_lead_at
        FROM clientes c
        JOIN affected_companies ac ON ac.empresa_id = c.empresa_id
        GROUP BY c.empresa_id
    )
    UPDATE empresas e
    SET
        pre_leads_count = COALESCE(ps.total_pre_leads, 0),
        leads_count = COALESCE(ls.total_leads, 0),
        first_pre_lead_at = ps.first_pre_lead_at,
        last_pre_lead_at = ps.last_pre_lead_at,
        first_lead_at = ls.first_lead_at,
        last_lead_at = ls.last_lead_at,
        lifecycle_stage = CASE
            WHEN COALESCE(ls.total_leads, 0) > 0 THEN 'lead'
            WHEN COALESCE(ps.total_pre_leads, 0) > 0 THEN 'pre_lead'
            ELSE e.lifecycle_stage
        END
    FROM affected_companies ac
    LEFT JOIN pre_stats ps ON ps.empresa_id = ac.empresa_id
    LEFT JOIN lead_stats ls ON ls.empresa_id = ac.empresa_id
    WHERE e.id = ac.empresa_id;

    RAISE NOTICE 'Prospección removed from clientes: % migrated to pre_leads, % upgraded to Negociación (preserved operational dependencies)',
      migrated_count, upgraded_to_negotiation_count;
END $$;
