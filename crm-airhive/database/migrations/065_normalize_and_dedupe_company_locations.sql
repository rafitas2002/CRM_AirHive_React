-- Normaliza ubicaciones libres en pre_leads y empresas para reducir duplicados
-- causados por espacios, acentos, variantes de ciudad/municipio y placeholders.

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

    v_city_raw := NULLIF(BTRIM(SPLIT_PART(v_clean, ',', 1)), '');
    v_rest_raw := NULLIF(BTRIM(SPLIT_PART(v_clean, ',', 2)), '');

    IF v_city_raw IS NULL THEN
        RETURN NULL;
    END IF;

    v_city_key := LOWER(TRANSLATE(v_city_raw, 'ÁÀÄÂáàäâÉÈËÊéèëêÍÌÏÎíìïîÓÒÖÔóòöôÚÙÜÛúùüûÑñ', 'AAAAaaaaEEEEeeeeIIIIiiiiOOOOooooUUUUuuuuNn'));
    v_rest_key := LOWER(TRANSLATE(COALESCE(v_rest_raw, ''), 'ÁÀÄÂáàäâÉÈËÊéèëêÍÌÏÎíìïîÓÒÖÔóòöôÚÙÜÛúùüûÑñ', 'AAAAaaaaEEEEeeeeIIIIiiiiOOOOooooUUUUuuuuNn'));

    -- Canonicaliza ciudades base usadas en el CRM.
    IF v_city_key IN ('cdmx', 'ciudad de mexico') THEN
        v_city := 'CDMX';
    ELSIF v_city_key = 'queretaro' THEN
        v_city := 'Querétaro';
    ELSIF v_city_key = 'guadalajara' THEN
        v_city := 'Guadalajara';
    ELSIF v_city_key = 'monterrey' THEN
        v_city := 'Monterrey';
    ELSE
        v_city := INITCAP(v_city_raw);
    END IF;

    -- Si no hay sub-ubicación, devolvemos la ciudad canonical.
    IF COALESCE(v_rest_raw, '') = '' THEN
        RETURN v_city;
    END IF;

    -- Canonicaliza municipios de Monterrey más usados.
    IF v_city = 'Monterrey' THEN
        v_rest := CASE
            WHEN v_rest_key IN ('san pedro', 'san pedro garza garcia') THEN 'San Pedro Garza García'
            WHEN v_rest_key = 'santa catarina' THEN 'Santa Catarina'
            WHEN v_rest_key = 'monterrey' THEN 'Monterrey'
            WHEN v_rest_key = 'guadalupe' THEN 'Guadalupe'
            WHEN v_rest_key IN ('san nicolas', 'san nicolas de los garza') THEN 'San Nicolás'
            WHEN v_rest_key = 'escobedo' THEN 'Escobedo'
            WHEN v_rest_key = 'apodaca' THEN 'Apodaca'
            WHEN v_rest_key = 'garcia' THEN 'García'
            ELSE INITCAP(v_rest_raw)
        END;
        RETURN v_city || ', ' || v_rest;
    END IF;

    RETURN v_city || ', ' || INITCAP(v_rest_raw);
END;
$$;

-- Sweep de deduplicación (normalización in-place)
UPDATE pre_leads
SET ubicacion = normalize_company_location_label(ubicacion)
WHERE ubicacion IS DISTINCT FROM normalize_company_location_label(ubicacion);

UPDATE empresas
SET ubicacion = normalize_company_location_label(ubicacion)
WHERE ubicacion IS DISTINCT FROM normalize_company_location_label(ubicacion);

