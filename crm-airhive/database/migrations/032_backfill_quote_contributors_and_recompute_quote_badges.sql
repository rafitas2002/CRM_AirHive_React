-- Fix historical quote contributor linkage and force quote badge recomputation.
-- This addresses cases like "Jesús" vs "Jesus" where simple lowercase comparison fails.

DO $$
BEGIN
    -- Normalize contributor linkage by exact UUID already present (no-op safeguard)
    UPDATE crm_quotes q
    SET contributed_by = NULL
    WHERE q.deleted_at IS NULL
      AND q.contributed_by IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM profiles p WHERE p.id = q.contributed_by
      );

    -- Accent-insensitive name matching for historical rows that only have contributor name.
    UPDATE crm_quotes q
    SET contributed_by = p.id
    FROM profiles p
    WHERE q.deleted_at IS NULL
      AND q.contributed_by IS NULL
      AND COALESCE(trim(q.contributed_by_name), '') <> ''
      AND translate(lower(trim(q.contributed_by_name)), 'áéíóúäëïöüàèìòùâêîôûñ', 'aeiouaeiouaeiouaeioun')
          = translate(lower(trim(COALESCE(p.full_name, ''))), 'áéíóúäëïöüàèìòùâêîôûñ', 'aeiouaeiouaeiouaeioun');

    -- Fallback: if still unlinked and quote appears to be an internal own quote,
    -- link by author name to recover legacy migrated contributions.
    UPDATE crm_quotes q
    SET contributed_by = p.id
    FROM profiles p
    WHERE q.deleted_at IS NULL
      AND q.contributed_by IS NULL
      AND translate(lower(trim(COALESCE(q.quote_author, ''))), 'áéíóúäëïöüàèìòùâêîôûñ', 'aeiouaeiouaeiouaeioun')
          = translate(lower(trim(COALESCE(p.full_name, ''))), 'áéíóúäëïöüàèìòùâêîôûñ', 'aeiouaeiouaeiouaeioun')
      AND (
          COALESCE(q.is_own_quote, false) = true
          OR lower(COALESCE(q.quote_origin_type, '')) = 'propia'
          OR lower(COALESCE(q.quote_source, '')) LIKE '%interna en airhive%'
      );

    -- If quote badge recompute function exists, force recompute for all linked contributors.
    IF EXISTS (
        SELECT 1
        FROM pg_proc
        WHERE proname = 'recompute_seller_quote_badges'
    ) THEN
        PERFORM recompute_seller_quote_badges(rec.seller_id, NULL)
        FROM (
            SELECT DISTINCT q.contributed_by AS seller_id
            FROM crm_quotes q
            WHERE q.deleted_at IS NULL
              AND q.contributed_by IS NOT NULL
        ) rec;
    END IF;
END $$;
