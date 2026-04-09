-- Add lead/suspect origin classification and support "visita a empresa" meeting type.

ALTER TABLE IF EXISTS public.empresas
    ADD COLUMN IF NOT EXISTS lead_origin TEXT;

UPDATE public.empresas
SET lead_origin = 'sin_definir'
WHERE lead_origin IS NULL;

ALTER TABLE IF EXISTS public.empresas
    ALTER COLUMN lead_origin SET DEFAULT 'sin_definir',
    ALTER COLUMN lead_origin SET NOT NULL;

ALTER TABLE IF EXISTS public.empresas
    DROP CONSTRAINT IF EXISTS empresas_lead_origin_check;

ALTER TABLE IF EXISTS public.empresas
    ADD CONSTRAINT empresas_lead_origin_check
    CHECK (
        lead_origin IN (
            'contacto_propio',
            'referido',
            'inbound_marketing',
            'outbound_prospeccion',
            'evento_networking',
            'alianza_partner',
            'base_datos',
            'visita_puerta_fria',
            'cliente_existente',
            'otro',
            'sin_definir'
        )
    );

ALTER TABLE IF EXISTS public.pre_leads
    ADD COLUMN IF NOT EXISTS lead_origin TEXT;

UPDATE public.pre_leads
SET lead_origin = 'sin_definir'
WHERE lead_origin IS NULL;

ALTER TABLE IF EXISTS public.pre_leads
    ALTER COLUMN lead_origin SET DEFAULT 'sin_definir',
    ALTER COLUMN lead_origin SET NOT NULL;

ALTER TABLE IF EXISTS public.pre_leads
    DROP CONSTRAINT IF EXISTS pre_leads_lead_origin_check;

ALTER TABLE IF EXISTS public.pre_leads
    ADD CONSTRAINT pre_leads_lead_origin_check
    CHECK (
        lead_origin IN (
            'contacto_propio',
            'referido',
            'inbound_marketing',
            'outbound_prospeccion',
            'evento_networking',
            'alianza_partner',
            'base_datos',
            'visita_puerta_fria',
            'cliente_existente',
            'otro',
            'sin_definir'
        )
    );

DO $$
DECLARE
    row_record RECORD;
BEGIN
    IF to_regclass('public.meetings') IS NULL THEN
        RETURN;
    END IF;

    FOR row_record IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.meetings'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%meeting_type%'
    LOOP
        EXECUTE format('ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS %I', row_record.conname);
    END LOOP;

    ALTER TABLE public.meetings
        ADD CONSTRAINT meetings_meeting_type_check
        CHECK (meeting_type IN ('presencial', 'visita_empresa', 'llamada', 'video'));
END $$;
