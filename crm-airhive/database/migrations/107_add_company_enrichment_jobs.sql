-- MVP de enriquecimiento de empresas (semi-automático con revisión humana)

BEGIN;

ALTER TABLE public.empresas
    ADD COLUMN IF NOT EXISTS enrichment_status TEXT NOT NULL DEFAULT 'not_requested',
    ADD COLUMN IF NOT EXISTS enrichment_payload JSONB,
    ADD COLUMN IF NOT EXISTS enrichment_last_run_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS enrichment_last_error TEXT,
    ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'empresas_enrichment_status_check'
    ) THEN
        ALTER TABLE public.empresas
            ADD CONSTRAINT empresas_enrichment_status_check
            CHECK (
                enrichment_status IN (
                    'not_requested',
                    'queued',
                    'processing',
                    'ready',
                    'applied',
                    'rejected',
                    'failed'
                )
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_empresas_enrichment_status
    ON public.empresas (enrichment_status);

CREATE INDEX IF NOT EXISTS idx_empresas_enriched_at
    ON public.empresas (enriched_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS public.company_enrichment_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    requested_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    provider TEXT NOT NULL DEFAULT 'heuristic_v1',
    input_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    result_payload JSONB,
    confidence NUMERIC(5,4),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    applied_at TIMESTAMPTZ
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'company_enrichment_jobs_status_check'
    ) THEN
        ALTER TABLE public.company_enrichment_jobs
            ADD CONSTRAINT company_enrichment_jobs_status_check
            CHECK (
                status IN (
                    'queued',
                    'processing',
                    'ready',
                    'applied',
                    'rejected',
                    'failed'
                )
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_company_enrichment_jobs_empresa_status
    ON public.company_enrichment_jobs (empresa_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_company_enrichment_jobs_created_at
    ON public.company_enrichment_jobs (created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_company_enrichment_jobs_single_active
    ON public.company_enrichment_jobs (empresa_id)
    WHERE status IN ('queued', 'processing');

CREATE OR REPLACE FUNCTION public.set_company_enrichment_jobs_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_company_enrichment_jobs_updated_at
ON public.company_enrichment_jobs;

CREATE TRIGGER trg_company_enrichment_jobs_updated_at
BEFORE UPDATE ON public.company_enrichment_jobs
FOR EACH ROW
EXECUTE FUNCTION public.set_company_enrichment_jobs_updated_at();

COMMIT;
