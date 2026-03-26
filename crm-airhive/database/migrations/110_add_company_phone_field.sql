-- Permite registrar teléfono corporativo en empresas y usarlo en autollenado.

ALTER TABLE public.empresas
    ADD COLUMN IF NOT EXISTS telefono TEXT;

UPDATE public.empresas
SET telefono = NULLIF(BTRIM(telefono), '')
WHERE telefono IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'empresas_telefono_len_check'
    ) THEN
        ALTER TABLE public.empresas
            ADD CONSTRAINT empresas_telefono_len_check
            CHECK (
                telefono IS NULL
                OR CHAR_LENGTH(BTRIM(telefono)) <= 40
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_empresas_telefono
    ON public.empresas (telefono);
