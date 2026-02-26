-- Canonicaliza variantes equivalentes de ubicaciones a un solo label por clave.
-- Ejemplos: "ALLENDE, N.L.", "ALLENDE, N.L", "ALLENDE NUEVO LEON" -> mismo valor.
-- No fusiona registros; solo unifica el texto de la ubicación en pre_leads y empresas.

CREATE OR REPLACE FUNCTION normalize_company_location_label(p_location TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_raw TEXT;
    v_clean TEXT;
    v_city_raw TEXT;
    v_rest_raw TEXT;
    v_city_key TEXT;
    v_rest_key TEXT;
    v_city TEXT;
    v_rest TEXT;
    v_match TEXT[];
BEGIN
    v_raw := NULLIF(BTRIM(COALESCE(p_location, '')), '');
    IF v_raw IS NULL THEN
        RETURN NULL;
    END IF;

    -- Unifica espacios/comas y elimina comas residuales al final.
    v_clean := REGEXP_REPLACE(v_raw, '\s+', ' ', 'g');
    v_clean := REGEXP_REPLACE(v_clean, '\s*,\s*', ', ', 'g');
    v_clean := REGEXP_REPLACE(v_clean, '(,\s*)+$', '', 'g');
    v_clean := NULLIF(BTRIM(v_clean), '');
    IF v_clean IS NULL THEN
        RETURN NULL;
    END IF;

    -- Placeholder accidental guardado.
    IF LOWER(v_clean) = 'otra' THEN
        RETURN NULL;
    END IF;

    -- Soporta variantes sin coma del estilo "ALLENDE NUEVO LEON" / "ALLENDE NL".
    IF POSITION(',' IN v_clean) = 0 THEN
        v_match := REGEXP_MATCH(
            v_clean,
            '^(.*?)(?:\s+)(n\s*\.?\s*l\s*\.?|nuevo le[oó]n)$',
            'i'
        );
        IF v_match IS NOT NULL THEN
            v_city_raw := NULLIF(BTRIM(v_match[1]), '');
            v_rest_raw := NULLIF(BTRIM(v_match[2]), '');
        ELSE
            v_city_raw := NULLIF(BTRIM(v_clean), '');
            v_rest_raw := NULL;
        END IF;
    ELSE
        v_city_raw := NULLIF(BTRIM(SPLIT_PART(v_clean, ',', 1)), '');
        v_rest_raw := NULLIF(BTRIM(SPLIT_PART(v_clean, ',', 2)), '');
    END IF;

    IF v_city_raw IS NULL THEN
        RETURN NULL;
    END IF;

    v_city_key := LOWER(TRANSLATE(
        v_city_raw,
        'ÁÀÄÂáàäâÉÈËÊéèëêÍÌÏÎíìïîÓÒÖÔóòöôÚÙÜÛúùüûÑñ',
        'AAAAaaaaEEEEeeeeIIIIiiiiOOOOooooUUUUuuuuNn'
    ));
    v_rest_key := LOWER(TRANSLATE(
        COALESCE(v_rest_raw, ''),
        'ÁÀÄÂáàäâÉÈËÊéèëêÍÌÏÎíìïîÓÒÖÔóòöôÚÙÜÛúùüûÑñ',
        'AAAAaaaaEEEEeeeeIIIIiiiiOOOOooooUUUUuuuuNn'
    ));

    v_city_key := REGEXP_REPLACE(v_city_key, '\s+', ' ', 'g');
    v_city_key := BTRIM(v_city_key);
    v_rest_key := REGEXP_REPLACE(v_rest_key, '\s+', ' ', 'g');
    v_rest_key := BTRIM(v_rest_key);

    -- Canonicaliza ciudades base y aliases comunes.
    IF v_city_key IN ('cdmx', 'ciudad de mexico') THEN
        v_city := 'CDMX';
    ELSIF v_city_key = 'queretaro' THEN
        v_city := 'Querétaro';
    ELSIF v_city_key = 'guadalajara' THEN
        v_city := 'Guadalajara';
    ELSIF v_city_key = 'monterrey' THEN
        v_city := 'Monterrey';
    ELSIF v_city_key IN ('san pedro garza garcia', 'san pedro') THEN
        v_city := 'San Pedro Garza García';
    ELSIF v_city_key IN ('san nicolas de los garza', 'san nicolas') THEN
        v_city := 'San Nicolás de los Garza';
    ELSIF v_city_key = 'cienega de flores' THEN
        v_city := 'Ciénega de Flores';
    ELSIF v_city_key IN ('cadereyta', 'cadereyta jimenez') THEN
        v_city := 'Cadereyta Jiménez';
    ELSIF v_city_key = 'juarez' THEN
        v_city := 'Juárez';
    ELSIF v_city_key = 'pesqueria' THEN
        v_city := 'Pesquería';
    ELSIF v_city_key IN ('zuazua', 'general zuazua') THEN
        v_city := 'General Zuazua';
    ELSIF v_city_key IN ('gral escobedo', 'gral. escobedo', 'general escobedo', 'escobedo') THEN
        v_city := 'Escobedo';
    ELSE
        v_city := INITCAP(v_city_raw);
    END IF;

    -- Si no hay sub-ubicación, devolvemos la ciudad canonical.
    IF COALESCE(v_rest_raw, '') = '' THEN
        RETURN v_city;
    END IF;

    -- Canonicaliza estado NL en variantes comunes (incluye "N. L.").
    IF v_rest_key ~* '^(n\s*\.?\s*l\s*\.?|nuevo leon)$' THEN
        v_rest := 'N.L.';
        RETURN v_city || ', ' || v_rest;
    END IF;

    -- Canonicaliza municipios de Monterrey más usados.
    IF v_city = 'Monterrey' THEN
        v_rest := CASE
            WHEN v_rest_key IN ('san pedro', 'san pedro garza garcia') THEN 'San Pedro Garza García'
            WHEN v_rest_key = 'santa catarina' THEN 'Santa Catarina'
            WHEN v_rest_key = 'monterrey' THEN 'Monterrey'
            WHEN v_rest_key = 'guadalupe' THEN 'Guadalupe'
            WHEN v_rest_key IN ('san nicolas', 'san nicolas de los garza') THEN 'San Nicolás'
            WHEN v_rest_key IN ('gral escobedo', 'general escobedo', 'escobedo') THEN 'Escobedo'
            WHEN v_rest_key = 'apodaca' THEN 'Apodaca'
            WHEN v_rest_key = 'garcia' THEN 'García'
            WHEN v_rest_key = 'juarez' THEN 'Juárez'
            WHEN v_rest_key = 'santiago' THEN 'Santiago'
            WHEN v_rest_key = 'pesqueria' THEN 'Pesquería'
            WHEN v_rest_key = 'el carmen' THEN 'El Carmen'
            WHEN v_rest_key = 'allende' THEN 'Allende'
            WHEN v_rest_key IN ('cadereyta', 'cadereyta jimenez') THEN 'Cadereyta Jiménez'
            WHEN v_rest_key = 'cienega de flores' THEN 'Ciénega de Flores'
            WHEN v_rest_key = 'salinas victoria' THEN 'Salinas Victoria'
            WHEN v_rest_key IN ('zuazua', 'general zuazua') THEN 'General Zuazua'
            ELSE INITCAP(v_rest_raw)
        END;
        RETURN v_city || ', ' || v_rest;
    END IF;

    v_rest := REGEXP_REPLACE(v_rest_raw, '\s*,\s*', ', ', 'g');
    v_rest := REGEXP_REPLACE(v_rest, '\s+', ' ', 'g');
    v_rest := BTRIM(v_rest);

    RETURN v_city || ', ' || INITCAP(v_rest);
END;
$$;

CREATE OR REPLACE FUNCTION normalize_company_location_duplicate_key(p_location TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_label TEXT;
    v_key TEXT;
BEGIN
    v_label := normalize_company_location_label(p_location);
    IF v_label IS NULL THEN
        RETURN NULL;
    END IF;

    v_key := LOWER(TRANSLATE(
        v_label,
        'ÁÀÄÂáàäâÉÈËÊéèëêÍÌÏÎíìïîÓÒÖÔóòöôÚÙÜÛúùüûÑñ',
        'AAAAaaaaEEEEeeeeIIIIiiiiOOOOooooUUUUuuuuNn'
    ));

    v_key := REGEXP_REPLACE(v_key, '[.]', '', 'g');
    v_key := REGEXP_REPLACE(v_key, '\s*,\s*', ' ', 'g');
    v_key := REGEXP_REPLACE(v_key, '\s+', ' ', 'g');
    v_key := BTRIM(v_key);

    -- Unifica aliases de Nuevo León (con o sin signos).
    v_key := REGEXP_REPLACE(v_key, '(^| )nuevo leon($| )', ' nl ', 'g');
    v_key := REGEXP_REPLACE(v_key, '(^| )n\s*l($| )', ' nl ', 'g');
    v_key := REGEXP_REPLACE(v_key, '\s+', ' ', 'g');
    v_key := BTRIM(v_key);

    -- Trata sufijo explícito de NL como la misma ubicación (ej. Monterrey == Monterrey, N.L.).
    v_key := REGEXP_REPLACE(v_key, ' nl$', '', 'g');
    v_key := BTRIM(v_key);

    RETURN NULLIF(v_key, '');
END;
$$;

-- Paso 1: normalización in-place (espacios, acentos, aliases, placeholders).
UPDATE pre_leads
SET ubicacion = normalize_company_location_label(ubicacion)
WHERE ubicacion IS DISTINCT FROM normalize_company_location_label(ubicacion);

UPDATE empresas
SET ubicacion = normalize_company_location_label(ubicacion)
WHERE ubicacion IS DISTINCT FROM normalize_company_location_label(ubicacion);

-- Paso 2: consolidación cross-table por clave equivalente a un label canónico.
WITH all_locations AS (
    SELECT 'pre_leads'::TEXT AS source_table, id::TEXT AS id, ubicacion AS normalized_label
    FROM pre_leads
    WHERE ubicacion IS NOT NULL AND BTRIM(ubicacion) <> ''
    UNION ALL
    SELECT 'empresas'::TEXT AS source_table, id::TEXT AS id, ubicacion AS normalized_label
    FROM empresas
    WHERE ubicacion IS NOT NULL AND BTRIM(ubicacion) <> ''
),
location_keys AS (
    SELECT
        source_table,
        id,
        normalized_label,
        normalize_company_location_duplicate_key(normalized_label) AS location_key
    FROM all_locations
),
canonical_by_key AS (
    SELECT DISTINCT ON (location_key)
        location_key,
        normalized_label AS canonical_label
    FROM location_keys
    WHERE location_key IS NOT NULL
      AND normalized_label IS NOT NULL
      AND BTRIM(normalized_label) <> ''
    ORDER BY location_key, CHAR_LENGTH(normalized_label), normalized_label
),
pre_leads_target AS (
    SELECT lk.id, cbk.canonical_label
    FROM location_keys lk
    JOIN canonical_by_key cbk
      ON cbk.location_key = lk.location_key
    WHERE lk.source_table = 'pre_leads'
)
UPDATE pre_leads p
SET ubicacion = plt.canonical_label
FROM pre_leads_target plt
WHERE p.id::TEXT = plt.id
  AND p.ubicacion IS DISTINCT FROM plt.canonical_label;

WITH all_locations AS (
    SELECT 'pre_leads'::TEXT AS source_table, id::TEXT AS id, ubicacion AS normalized_label
    FROM pre_leads
    WHERE ubicacion IS NOT NULL AND BTRIM(ubicacion) <> ''
    UNION ALL
    SELECT 'empresas'::TEXT AS source_table, id::TEXT AS id, ubicacion AS normalized_label
    FROM empresas
    WHERE ubicacion IS NOT NULL AND BTRIM(ubicacion) <> ''
),
location_keys AS (
    SELECT
        source_table,
        id,
        normalized_label,
        normalize_company_location_duplicate_key(normalized_label) AS location_key
    FROM all_locations
),
canonical_by_key AS (
    SELECT DISTINCT ON (location_key)
        location_key,
        normalized_label AS canonical_label
    FROM location_keys
    WHERE location_key IS NOT NULL
      AND normalized_label IS NOT NULL
      AND BTRIM(normalized_label) <> ''
    ORDER BY location_key, CHAR_LENGTH(normalized_label), normalized_label
),
empresas_target AS (
    SELECT lk.id, cbk.canonical_label
    FROM location_keys lk
    JOIN canonical_by_key cbk
      ON cbk.location_key = lk.location_key
    WHERE lk.source_table = 'empresas'
)
UPDATE empresas e
SET ubicacion = et.canonical_label
FROM empresas_target et
WHERE e.id::TEXT = et.id
  AND e.ubicacion IS DISTINCT FROM et.canonical_label;
