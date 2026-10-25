-- Migration: 20261025070458_capture_existing_cash_tables
-- Objetivo: Declarar em versionamento as 2 tabelas que existiam na base ao
--   vivo sem nenhum CREATE TABLE no repositório — a divergência que
--   tests/security/production-snapshot.test.ts media e travava.
-- Metodologia: DDL lido do catálogo do Postgres (pg_attribute, pg_constraint,
--   pg_get_indexdef) por scripts/siga/capture-table-ddl.mjs, não escrito à mão.
--   100% idempotente: CREATE TABLE IF NOT EXISTS, chaves estrangeiras em blocos
--   guardados por pg_constraint, CREATE INDEX IF NOT EXISTS. Seguro de reaplicar
--   num ambiente onde estas tabelas já correm.
-- Âmbito: captura de duas tabelas financeiras já presentes na produção, sem
--   criar qualquer fluxo financeiro. Sem políticas de browser; acesso só servidor.
-- NUNCA executar via Lovable. Usar: npm run siga:sql (colar no SQL Editor do SGA)
-- Gerado em 2026-10-25T07:05:47.891Z

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. TABELAS, RESTRIÇÕES EM LINHA E ÍNDICES
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- finance_cash_points
CREATE TABLE IF NOT EXISTS public.finance_cash_points (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  name text DEFAULT 'Caixa principal'::text NOT NULL,
  active boolean DEFAULT true NOT NULL,
  enforce_from date DEFAULT (CURRENT_DATE + 30) NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT finance_cash_points_pkey PRIMARY KEY (id),
  CONSTRAINT finance_cash_points_school_id_name_key UNIQUE (school_id, name)
);
ALTER TABLE public.finance_cash_points ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS finance_cash_points_one_active ON public.finance_cash_points USING btree (school_id) WHERE active;

-- finance_cash_sessions
CREATE TABLE IF NOT EXISTS public.finance_cash_sessions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  cash_point_id uuid NOT NULL,
  status text DEFAULT 'open'::text NOT NULL,
  opened_by uuid NOT NULL,
  opened_at timestamp with time zone DEFAULT now() NOT NULL,
  opening_float numeric(18,2) NOT NULL,
  closed_by uuid,
  closed_at timestamp with time zone,
  counted_cash numeric(18,2),
  expected_cash numeric(18,2),
  difference numeric(18,2),
  difference_reason text,
  approved_by uuid,
  approved_at timestamp with time zone,
  CONSTRAINT finance_cash_sessions_approver_not_closer CHECK (((approved_by IS NULL) OR (approved_by IS DISTINCT FROM closed_by))),
  CONSTRAINT finance_cash_sessions_closed_complete CHECK (((status = 'open'::text) OR ((closed_by IS NOT NULL) AND (closed_at IS NOT NULL) AND (counted_cash IS NOT NULL) AND (expected_cash IS NOT NULL) AND (difference IS NOT NULL)))),
  CONSTRAINT finance_cash_sessions_counted_cash_check CHECK ((counted_cash >= (0)::numeric)),
  CONSTRAINT finance_cash_sessions_difference_reason CHECK (((difference IS NULL) OR (difference = (0)::numeric) OR (length(btrim(COALESCE(difference_reason, ''::text))) >= 3))),
  CONSTRAINT finance_cash_sessions_opening_float_check CHECK ((opening_float >= (0)::numeric)),
  CONSTRAINT finance_cash_sessions_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text]))),
  CONSTRAINT finance_cash_sessions_pkey PRIMARY KEY (id)
);
ALTER TABLE public.finance_cash_sessions ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS finance_cash_sessions_one_open ON public.finance_cash_sessions USING btree (cash_point_id) WHERE (status = 'open'::text);
CREATE INDEX IF NOT EXISTS finance_cash_sessions_school_recent ON public.finance_cash_sessions USING btree (school_id, opened_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. CHAVES ESTRANGEIRAS (adiadas — independentes da ordem das tabelas)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'finance_cash_points_school_id_fkey'
      AND conrelid = 'public.finance_cash_points'::regclass
  ) THEN
    ALTER TABLE public.finance_cash_points ADD CONSTRAINT finance_cash_points_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'finance_cash_sessions_cash_point_id_fkey'
      AND conrelid = 'public.finance_cash_sessions'::regclass
  ) THEN
    ALTER TABLE public.finance_cash_sessions ADD CONSTRAINT finance_cash_sessions_cash_point_id_fkey FOREIGN KEY (cash_point_id) REFERENCES public.finance_cash_points(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'finance_cash_sessions_school_id_fkey'
      AND conrelid = 'public.finance_cash_sessions'::regclass
  ) THEN
    ALTER TABLE public.finance_cash_sessions ADD CONSTRAINT finance_cash_sessions_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE public.finance_cash_points FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_cash_points FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.finance_cash_points TO service_role;
ALTER TABLE public.finance_cash_sessions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_cash_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.finance_cash_sessions TO service_role;
COMMIT;
