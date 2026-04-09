-- Permite registrar correo corporativo en empresas para comunicación y envío de invitaciones.

ALTER TABLE public.empresas
    ADD COLUMN IF NOT EXISTS email TEXT;

UPDATE public.empresas
SET email = NULLIF(LOWER(BTRIM(email)), '')
WHERE email IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'empresas_email_format_check'
    ) THEN
        ALTER TABLE public.empresas
            ADD CONSTRAINT empresas_email_format_check
            CHECK (
                email IS NULL
                OR (
                    CHAR_LENGTH(BTRIM(email)) <= 180
                    AND BTRIM(email) ~* '^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$'
                )
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_empresas_email
    ON public.empresas (email);
