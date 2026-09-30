-- Migration: 20260930155158_capture_undeclared_production_tables
-- Objetivo: Declarar em versionamento as 2 tabelas que existiam na base ao
--   vivo sem nenhum CREATE TABLE no repositório — a divergência que
--   tests/security/production-snapshot.test.ts media e travava.
-- Metodologia: DDL lido do catálogo do Postgres (pg_attribute, pg_constraint,
--   pg_get_indexdef) por scripts/siga/capture-table-ddl.mjs, não escrito à mão.
--   100% idempotente: CREATE TABLE IF NOT EXISTS, chaves estrangeiras em blocos
--   guardados por pg_constraint, CREATE INDEX IF NOT EXISTS. Seguro de reaplicar
--   num ambiente onde estas tabelas já correm.
-- Âmbito: tabelas, restrições e índices, e a postura de acesso que a produção
--   tem (2026-09-30): RLS ligado e forçado, sem políticas, privilégios só para
--   service_role — tabelas só do servidor. Ambas estavam vazias.
-- Origem: criadas directamente na produção entre 27 e 30/09, sem migração no
--   repositório. Capturadas a 2026-09-30 com as consultas de catálogo deste
--   script, executadas pelo MCP do Supabase (o CLI não tinha rede).
-- NUNCA executar via Lovable. Usar: npm run siga:sql (colar no SQL Editor do SGA)
-- Gerado em 2026-09-30T15:51:58.546Z

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. TABELAS, RESTRIÇÕES EM LINHA E ÍNDICES
-- ═══════════════════════════════════════════════════════════════════════════

-- course_unit_enrollments
CREATE TABLE IF NOT EXISTS public.course_unit_enrollments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  student_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  program_id uuid NOT NULL,
  program_subject_id uuid NOT NULL,
  semester smallint NOT NULL,
  credits numeric(4,1) NOT NULL,
  attempt smallint DEFAULT 1 NOT NULL,
  status text DEFAULT 'inscrito'::text NOT NULL,
  final_grade numeric(4,1),
  season text,
  credits_earned numeric(4,1) DEFAULT 0 NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  updated_by uuid,
  CONSTRAINT course_unit_enrollments_attempt_check CHECK (((attempt >= 1) AND (attempt <= 20))),
  CONSTRAINT course_unit_enrollments_check CHECK (((credits_earned >= (0)::numeric) AND (credits_earned <= credits))),
  CONSTRAINT course_unit_enrollments_credits_check CHECK (((credits > (0)::numeric) AND (credits <= (60)::numeric))),
  CONSTRAINT course_unit_enrollments_credits_only_when_passed CHECK (((credits_earned = (0)::numeric) OR (status = ANY (ARRAY['aprovado'::text, 'dispensado'::text])))),
  CONSTRAINT course_unit_enrollments_final_grade_check CHECK (((final_grade IS NULL) OR ((final_grade >= (0)::numeric) AND (final_grade <= (20)::numeric)))),
  CONSTRAINT course_unit_enrollments_season_check CHECK (((season IS NULL) OR (season = ANY (ARRAY['frequencia'::text, 'normal'::text, 'recurso'::text, 'especial'::text, 'melhoria'::text])))),
  CONSTRAINT course_unit_enrollments_semester_check CHECK (((semester >= 1) AND (semester <= 12))),
  CONSTRAINT course_unit_enrollments_status_check CHECK ((status = ANY (ARRAY['inscrito'::text, 'dispensado'::text, 'aprovado'::text, 'reprovado'::text, 'excluido_faltas'::text, 'excluido_frequencia'::text, 'anulado'::text]))),
  CONSTRAINT course_unit_enrollments_pkey PRIMARY KEY (id),
  CONSTRAINT course_unit_enrollments_unique UNIQUE (student_id, academic_year_id, program_subject_id)
);
ALTER TABLE public.course_unit_enrollments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS course_unit_enrollments_student_idx ON public.course_unit_enrollments USING btree (school_id, student_id, academic_year_id);
CREATE INDEX IF NOT EXISTS course_unit_enrollments_unit_idx ON public.course_unit_enrollments USING btree (school_id, program_subject_id, academic_year_id);

-- program_subject_prerequisites
CREATE TABLE IF NOT EXISTS public.program_subject_prerequisites (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  program_subject_id uuid NOT NULL,
  required_program_subject_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  CONSTRAINT program_subject_prerequisites_not_self CHECK ((program_subject_id <> required_program_subject_id)),
  CONSTRAINT program_subject_prerequisites_pkey PRIMARY KEY (id),
  CONSTRAINT program_subject_prerequisites_unique UNIQUE (program_subject_id, required_program_subject_id)
);
ALTER TABLE public.program_subject_prerequisites ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS program_subject_prerequisites_required_idx ON public.program_subject_prerequisites USING btree (school_id, required_program_subject_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. CHAVES ESTRANGEIRAS (adiadas — independentes da ordem das tabelas)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'course_unit_enrollments_created_by_fkey'
      AND conrelid = 'public.course_unit_enrollments'::regclass
  ) THEN
    ALTER TABLE public.course_unit_enrollments ADD CONSTRAINT course_unit_enrollments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'course_unit_enrollments_program_fkey'
      AND conrelid = 'public.course_unit_enrollments'::regclass
  ) THEN
    ALTER TABLE public.course_unit_enrollments ADD CONSTRAINT course_unit_enrollments_program_fkey FOREIGN KEY (school_id, program_id) REFERENCES programs(school_id, id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'course_unit_enrollments_program_subject_fkey'
      AND conrelid = 'public.course_unit_enrollments'::regclass
  ) THEN
    ALTER TABLE public.course_unit_enrollments ADD CONSTRAINT course_unit_enrollments_program_subject_fkey FOREIGN KEY (school_id, program_subject_id) REFERENCES program_subjects(school_id, id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'course_unit_enrollments_school_id_fkey'
      AND conrelid = 'public.course_unit_enrollments'::regclass
  ) THEN
    ALTER TABLE public.course_unit_enrollments ADD CONSTRAINT course_unit_enrollments_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'course_unit_enrollments_student_fkey'
      AND conrelid = 'public.course_unit_enrollments'::regclass
  ) THEN
    ALTER TABLE public.course_unit_enrollments ADD CONSTRAINT course_unit_enrollments_student_fkey FOREIGN KEY (school_id, student_id) REFERENCES students(school_id, id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'course_unit_enrollments_updated_by_fkey'
      AND conrelid = 'public.course_unit_enrollments'::regclass
  ) THEN
    ALTER TABLE public.course_unit_enrollments ADD CONSTRAINT course_unit_enrollments_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'course_unit_enrollments_year_fkey'
      AND conrelid = 'public.course_unit_enrollments'::regclass
  ) THEN
    ALTER TABLE public.course_unit_enrollments ADD CONSTRAINT course_unit_enrollments_year_fkey FOREIGN KEY (school_id, academic_year_id) REFERENCES academic_years(school_id, id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'program_subject_prerequisites_created_by_fkey'
      AND conrelid = 'public.program_subject_prerequisites'::regclass
  ) THEN
    ALTER TABLE public.program_subject_prerequisites ADD CONSTRAINT program_subject_prerequisites_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'program_subject_prerequisites_required_fkey'
      AND conrelid = 'public.program_subject_prerequisites'::regclass
  ) THEN
    ALTER TABLE public.program_subject_prerequisites ADD CONSTRAINT program_subject_prerequisites_required_fkey FOREIGN KEY (school_id, required_program_subject_id) REFERENCES program_subjects(school_id, id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'program_subject_prerequisites_school_id_fkey'
      AND conrelid = 'public.program_subject_prerequisites'::regclass
  ) THEN
    ALTER TABLE public.program_subject_prerequisites ADD CONSTRAINT program_subject_prerequisites_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'program_subject_prerequisites_subject_fkey'
      AND conrelid = 'public.program_subject_prerequisites'::regclass
  ) THEN
    ALTER TABLE public.program_subject_prerequisites ADD CONSTRAINT program_subject_prerequisites_subject_fkey FOREIGN KEY (school_id, program_subject_id) REFERENCES program_subjects(school_id, id) ON DELETE CASCADE;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. ACESSO (igual à produção): só o servidor
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.course_unit_enrollments FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.course_unit_enrollments FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.course_unit_enrollments TO service_role;

ALTER TABLE public.program_subject_prerequisites FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.program_subject_prerequisites FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.program_subject_prerequisites TO service_role;
