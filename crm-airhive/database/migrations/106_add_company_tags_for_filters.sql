-- Company tags for custom follow-up filtering (example: "Llamar")

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'empresas'
          AND column_name = 'tags'
    ) THEN
        ALTER TABLE public.empresas
            ADD COLUMN tags TEXT[] DEFAULT ARRAY[]::TEXT[];
    END IF;
END $$;

UPDATE public.empresas
SET tags = ARRAY[]::TEXT[]
WHERE tags IS NULL;

ALTER TABLE public.empresas
    ALTER COLUMN tags SET DEFAULT ARRAY[]::TEXT[],
    ALTER COLUMN tags SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_empresas_tags_gin
    ON public.empresas
    USING GIN (tags);
