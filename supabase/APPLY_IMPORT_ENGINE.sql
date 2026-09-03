-- ============================================================================
-- MOTOR DE IMPORTAÇÃO — aplicar manualmente no SQL Editor do projecto SGA
-- (xodgfmxiaunpamctfeea), como os outros ficheiros APPLY_*.sql desta pasta.
--
-- Extraído verbatim de APPLY_ENROLLMENT_AND_PREMIUM.sql (secção "MOTOR
-- CENTRAL DE IMPORTAÇÃO", linhas 958-1103) para poder ser corrido isolado.
-- Idempotente (IF NOT EXISTS / DROP+CREATE em constraints e policies) —
-- seguro correr mais que uma vez.
--
-- Nota: em 2026-08-25 confirmámos por API REST que estas 4 tabelas não
-- estavam visíveis ao PostgREST (schema cache), apesar de o SQL já existir
-- neste ficheiro-fonte — ou nunca foi corrido, ou a cache nunca foi
-- recarregada. O NOTIFY no fim força o recarregamento sem esperar pelo
-- próximo deploy.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  module text NOT NULL,
  file_name text NOT NULL,
  file_path text,
  status text NOT NULL DEFAULT 'uploaded',
  total_rows integer NOT NULL DEFAULT 0,
  valid_rows integer NOT NULL DEFAULT 0,
  invalid_rows integer NOT NULL DEFAULT 0,
  duplicate_rows integer NOT NULL DEFAULT 0,
  inserted_rows integer NOT NULL DEFAULT 0,
  updated_rows integer NOT NULL DEFAULT 0,
  ignored_rows integer NOT NULL DEFAULT 0,
  job_metadata jsonb DEFAULT '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.import_jobs DROP CONSTRAINT IF EXISTS import_jobs_status_check;
ALTER TABLE public.import_jobs
  ADD CONSTRAINT import_jobs_status_check CHECK (status IN (
    'uploaded', 'analyzing', 'mapping', 'validating', 'ready', 'importing', 'completed', 'failed', 'cancelled', 'rolled_back'
  ));

CREATE INDEX IF NOT EXISTS import_jobs_school_idx ON public.import_jobs (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS import_jobs_module_idx ON public.import_jobs (school_id, module, created_at DESC);

ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_jobs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.import_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.import_jobs TO authenticated;
GRANT ALL ON public.import_jobs TO service_role;

DROP POLICY IF EXISTS "Read school import jobs" ON public.import_jobs;
CREATE POLICY "Read school import jobs"
  ON public.import_jobs
  FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));

CREATE TABLE IF NOT EXISTS public.import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id uuid NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  sheet_name text NOT NULL DEFAULT 'Sheet1',
  row_number integer NOT NULL,
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  normalized_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'valid',
  warnings jsonb DEFAULT '[]'::jsonb,
  errors jsonb DEFAULT '[]'::jsonb,
  duplicate_of uuid,
  target_record_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.import_rows DROP CONSTRAINT IF EXISTS import_rows_status_check;
ALTER TABLE public.import_rows
  ADD CONSTRAINT import_rows_status_check CHECK (status IN (
    'valid', 'warning', 'error', 'duplicate', 'will_update', 'will_insert', 'ignored', 'imported'
  ));

CREATE INDEX IF NOT EXISTS import_rows_job_idx ON public.import_rows (import_job_id, row_number);
CREATE INDEX IF NOT EXISTS import_rows_status_idx ON public.import_rows (import_job_id, status);

ALTER TABLE public.import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_rows FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.import_rows FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.import_rows TO authenticated;
GRANT ALL ON public.import_rows TO service_role;

DROP POLICY IF EXISTS "Read school import rows" ON public.import_rows;
CREATE POLICY "Read school import rows"
  ON public.import_rows
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.import_jobs j
      WHERE j.id = import_job_id
        AND public.is_school_member(j.school_id)
    )
  );

CREATE TABLE IF NOT EXISTS public.import_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  module text NOT NULL,
  name text NOT NULL,
  header_signature jsonb NOT NULL DEFAULT '[]'::jsonb,
  mappings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS import_templates_school_idx ON public.import_templates (school_id, module);

ALTER TABLE public.import_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_templates FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.import_templates FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.import_templates TO authenticated;
GRANT ALL ON public.import_templates TO service_role;

DROP POLICY IF EXISTS "Read school import templates" ON public.import_templates;
CREATE POLICY "Read school import templates"
  ON public.import_templates
  FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));

CREATE TABLE IF NOT EXISTS public.import_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id uuid NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  row_id uuid REFERENCES public.import_rows(id) ON DELETE SET NULL,
  table_name text NOT NULL,
  target_id uuid NOT NULL,
  action_type text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.import_audits DROP CONSTRAINT IF EXISTS import_audits_action_check;
ALTER TABLE public.import_audits
  ADD CONSTRAINT import_audits_action_check CHECK (action_type IN ('inserted', 'updated', 'deleted'));

CREATE INDEX IF NOT EXISTS import_audits_job_idx ON public.import_audits (import_job_id);

ALTER TABLE public.import_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_audits FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.import_audits FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.import_audits TO authenticated;
GRANT ALL ON public.import_audits TO service_role;

DROP POLICY IF EXISTS "Read school import audits" ON public.import_audits;
CREATE POLICY "Read school import audits"
  ON public.import_audits
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.import_jobs j
      WHERE j.id = import_job_id
        AND public.is_school_member(j.school_id)
    )
  );

-- Força o PostgREST a recarregar o schema (sem isto, as tabelas acima podem
-- ficar invisíveis à API REST durante minutos/horas até ao próximo reload automático).
NOTIFY pgrst, 'reload schema';

-- Verificação: deve devolver as 4 linhas.
SELECT c.relname AS tabela
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('import_jobs', 'import_rows', 'import_templates', 'import_audits')
ORDER BY c.relname;
