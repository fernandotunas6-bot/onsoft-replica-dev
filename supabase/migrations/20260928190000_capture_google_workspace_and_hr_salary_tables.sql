-- Migration: 20260928190000_capture_google_workspace_and_hr_salary_tables
-- Objetivo: Declarar em versionamento as 7 tabelas que existiam na produção sem
--   CREATE TABLE no repositório (Google Workspace e escalas/alterações salariais
--   de RH) — a divergência que tests/security/production-snapshot.test.ts mede.
-- Metodologia: DDL lido do catálogo do Postgres a 2026-09-28, com as mesmas
--   consultas de scripts/siga/capture-table-ddl.mjs (corridas pelo conector
--   Supabase, só leitura), não escrito à mão.
--   100% idempotente: CREATE TABLE IF NOT EXISTS, chaves estrangeiras em blocos
--   guardados por pg_constraint, CREATE INDEX IF NOT EXISTS.
-- Acesso: na produção estas tabelas têm RLS ligado, nenhuma política e nenhuma
--   concessão a anon/authenticated — só o servidor (service role) as lê. O
--   REVOKE repete esse estado para uma reconstrução ficar igual.
-- NUNCA executar via Lovable. Usar: npm run siga:sql (colar no SQL Editor do SGA)

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. TABELAS, RESTRIÇÕES EM LINHA E ÍNDICES
-- ═══════════════════════════════════════════════════════════════════════════

-- google_workspace_connections — Server-only Google Workspace tokens encrypted using GOOGLE_WORKSPACE_TOKEN_KEY; no client read policies.
CREATE TABLE IF NOT EXISTS public.google_workspace_connections (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  school_id uuid NOT NULL,
  account_email text,
  encrypted_access_token text NOT NULL,
  encrypted_refresh_token text NOT NULL,
  granted_scopes text[] DEFAULT '{}'::text[] NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  connected_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  revoked_at timestamp with time zone,
  google_sub text NOT NULL,
  CONSTRAINT google_workspace_connections_google_sub_nonempty CHECK ((length(btrim(google_sub)) > 0)),
  CONSTRAINT google_workspace_connections_scope_limit CHECK (((cardinality(granted_scopes) >= 1) AND (cardinality(granted_scopes) <= 24))),
  CONSTRAINT google_workspace_connections_pkey PRIMARY KEY (id),
  CONSTRAINT google_workspace_user_school_unique UNIQUE (user_id, school_id)
);
ALTER TABLE public.google_workspace_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.google_workspace_connections FROM PUBLIC, anon, authenticated;
CREATE INDEX IF NOT EXISTS google_workspace_connections_school_idx ON public.google_workspace_connections USING btree (school_id);

-- google_workspace_oauth_states — Server-only OAuth PKCE pending states; encrypted verifier, short TTL, atomic consume.
CREATE TABLE IF NOT EXISTS public.google_workspace_oauth_states (
  state_hash text NOT NULL,
  user_id uuid NOT NULL,
  school_id uuid NOT NULL,
  encrypted_verifier text NOT NULL,
  requested_services text[] NOT NULL,
  redirect_uri text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  consumed_at timestamp with time zone,
  session_id text NOT NULL,
  CONSTRAINT google_workspace_oauth_states_services_limit CHECK (((cardinality(requested_services) >= 1) AND (cardinality(requested_services) <= 7))),
  CONSTRAINT google_workspace_oauth_states_session_nonempty CHECK ((length(btrim(session_id)) > 0)),
  CONSTRAINT google_workspace_oauth_states_state_hash_check CHECK (((length(state_hash) >= 32) AND (length(state_hash) <= 128))),
  CONSTRAINT google_workspace_oauth_states_pkey PRIMARY KEY (state_hash)
);
ALTER TABLE public.google_workspace_oauth_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.google_workspace_oauth_states FROM PUBLIC, anon, authenticated;
CREATE INDEX IF NOT EXISTS google_workspace_states_expiry_idx ON public.google_workspace_oauth_states USING btree (expires_at);
CREATE INDEX IF NOT EXISTS google_workspace_states_user_idx ON public.google_workspace_oauth_states USING btree (user_id, school_id);

-- hr_salary_scales — Versioned statutory or institutional reference catalog; server-managed, not automatically binding on employment contracts.
CREATE TABLE IF NOT EXISTS public.hr_salary_scales (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  jurisdiction text DEFAULT 'AO'::text NOT NULL,
  sector text NOT NULL,
  source_title text,
  source_reference text,
  source_url text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT hr_salary_scales_pkey PRIMARY KEY (id),
  CONSTRAINT hr_salary_scales_code_key UNIQUE (code)
);
ALTER TABLE public.hr_salary_scales ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_salary_scales FROM PUBLIC, anon, authenticated;

-- hr_salary_scale_versions
CREATE TABLE IF NOT EXISTS public.hr_salary_scale_versions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  scale_id uuid NOT NULL,
  version_label text NOT NULL,
  effective_from date NOT NULL,
  effective_until date,
  status text DEFAULT 'draft'::text NOT NULL,
  approved_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT hr_salary_scale_versions_check CHECK (((effective_until IS NULL) OR (effective_until >= effective_from))),
  CONSTRAINT hr_salary_scale_versions_check1 CHECK (((status <> 'approved'::text) OR (approved_at IS NOT NULL))),
  CONSTRAINT hr_salary_scale_versions_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'approved'::text, 'retired'::text]))),
  CONSTRAINT hr_salary_scale_versions_pkey PRIMARY KEY (id),
  CONSTRAINT hr_salary_scale_versions_scale_id_version_label_key UNIQUE (scale_id, version_label)
);
ALTER TABLE public.hr_salary_scale_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_salary_scale_versions FROM PUBLIC, anon, authenticated;
CREATE INDEX IF NOT EXISTS hr_salary_versions_effective_idx ON public.hr_salary_scale_versions USING btree (scale_id, effective_from DESC);

-- hr_salary_scale_steps
CREATE TABLE IF NOT EXISTS public.hr_salary_scale_steps (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  version_id uuid NOT NULL,
  category_code text NOT NULL,
  category_name text NOT NULL,
  grade text NOT NULL,
  monthly_base_kz numeric(16,2) NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT hr_salary_scale_steps_monthly_base_kz_check CHECK ((monthly_base_kz >= (0)::numeric)),
  CONSTRAINT hr_salary_scale_steps_pkey PRIMARY KEY (id),
  CONSTRAINT hr_salary_scale_steps_version_id_category_code_grade_key UNIQUE (version_id, category_code, grade)
);
ALTER TABLE public.hr_salary_scale_steps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_salary_scale_steps FROM PUBLIC, anon, authenticated;

-- hr_salary_change_requests — Server-only audited salary change proposals; approval does not directly update contracts or payroll.
CREATE TABLE IF NOT EXISTS public.hr_salary_change_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  contract_id uuid NOT NULL,
  requested_step_id uuid,
  proposed_base_salary_kz numeric(16,2) NOT NULL,
  effective_on date NOT NULL,
  reason text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  requested_by uuid,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  review_reason text,
  applied_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT hr_salary_change_no_self_approval CHECK (((requested_by IS NULL) OR (reviewed_by IS NULL) OR (requested_by <> reviewed_by))),
  CONSTRAINT hr_salary_change_requests_proposed_base_salary_kz_check CHECK ((proposed_base_salary_kz >= (0)::numeric)),
  CONSTRAINT hr_salary_change_requests_reason_check CHECK ((length(btrim(reason)) >= 10)),
  CONSTRAINT hr_salary_change_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text, 'applied'::text]))),
  CONSTRAINT hr_salary_change_review_consistency CHECK ((((status = ANY (ARRAY['approved'::text, 'rejected'::text, 'applied'::text])) AND (reviewed_by IS NOT NULL) AND (reviewed_at IS NOT NULL)) OR (status = ANY (ARRAY['pending'::text, 'cancelled'::text])))),
  CONSTRAINT hr_salary_change_requests_pkey PRIMARY KEY (id)
);
ALTER TABLE public.hr_salary_change_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_salary_change_requests FROM PUBLIC, anon, authenticated;
CREATE UNIQUE INDEX IF NOT EXISTS hr_salary_change_one_pending ON public.hr_salary_change_requests USING btree (contract_id) WHERE (status = 'pending'::text);
CREATE INDEX IF NOT EXISTS hr_salary_change_school_status ON public.hr_salary_change_requests USING btree (school_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS hr_salary_one_approved_unapplied_per_contract ON public.hr_salary_change_requests USING btree (contract_id) WHERE (status = 'approved'::text);

-- hr_contract_salary_amendments
CREATE TABLE IF NOT EXISTS public.hr_contract_salary_amendments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  contract_id uuid NOT NULL,
  request_id uuid NOT NULL,
  effective_on date NOT NULL,
  previous_base_salary_kz numeric(16,2) NOT NULL,
  new_base_salary_kz numeric(16,2) NOT NULL,
  salary_scale_step_id uuid,
  applied_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT hr_contract_salary_amendments_new_base_salary_kz_check CHECK ((new_base_salary_kz >= (0)::numeric)),
  CONSTRAINT hr_contract_salary_amendments_pkey PRIMARY KEY (id),
  CONSTRAINT hr_contract_salary_amendments_request_id_key UNIQUE (request_id)
);
ALTER TABLE public.hr_contract_salary_amendments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_contract_salary_amendments FROM PUBLIC, anon, authenticated;
CREATE INDEX IF NOT EXISTS hr_contract_salary_amendments_effective_idx ON public.hr_contract_salary_amendments USING btree (contract_id, effective_on DESC);
CREATE UNIQUE INDEX IF NOT EXISTS hr_salary_amendment_unique_effective_date ON public.hr_contract_salary_amendments USING btree (contract_id, effective_on);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. CHAVES ESTRANGEIRAS (adiadas — independentes da ordem das tabelas)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'google_workspace_connections_school_id_fkey'
      AND conrelid = 'public.google_workspace_connections'::regclass
  ) THEN
    ALTER TABLE public.google_workspace_connections ADD CONSTRAINT google_workspace_connections_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'google_workspace_connections_user_id_fkey'
      AND conrelid = 'public.google_workspace_connections'::regclass
  ) THEN
    ALTER TABLE public.google_workspace_connections ADD CONSTRAINT google_workspace_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'google_workspace_oauth_states_school_id_fkey'
      AND conrelid = 'public.google_workspace_oauth_states'::regclass
  ) THEN
    ALTER TABLE public.google_workspace_oauth_states ADD CONSTRAINT google_workspace_oauth_states_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'google_workspace_oauth_states_user_id_fkey'
      AND conrelid = 'public.google_workspace_oauth_states'::regclass
  ) THEN
    ALTER TABLE public.google_workspace_oauth_states ADD CONSTRAINT google_workspace_oauth_states_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_salary_scale_versions_scale_id_fkey'
      AND conrelid = 'public.hr_salary_scale_versions'::regclass
  ) THEN
    ALTER TABLE public.hr_salary_scale_versions ADD CONSTRAINT hr_salary_scale_versions_scale_id_fkey FOREIGN KEY (scale_id) REFERENCES hr_salary_scales(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_salary_scale_steps_version_id_fkey'
      AND conrelid = 'public.hr_salary_scale_steps'::regclass
  ) THEN
    ALTER TABLE public.hr_salary_scale_steps ADD CONSTRAINT hr_salary_scale_steps_version_id_fkey FOREIGN KEY (version_id) REFERENCES hr_salary_scale_versions(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_salary_change_requests_contract_id_fkey'
      AND conrelid = 'public.hr_salary_change_requests'::regclass
  ) THEN
    ALTER TABLE public.hr_salary_change_requests ADD CONSTRAINT hr_salary_change_requests_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES hr_contracts(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_salary_change_requests_requested_by_fkey'
      AND conrelid = 'public.hr_salary_change_requests'::regclass
  ) THEN
    ALTER TABLE public.hr_salary_change_requests ADD CONSTRAINT hr_salary_change_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_salary_change_requests_requested_step_id_fkey'
      AND conrelid = 'public.hr_salary_change_requests'::regclass
  ) THEN
    ALTER TABLE public.hr_salary_change_requests ADD CONSTRAINT hr_salary_change_requests_requested_step_id_fkey FOREIGN KEY (requested_step_id) REFERENCES hr_salary_scale_steps(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_salary_change_requests_reviewed_by_fkey'
      AND conrelid = 'public.hr_salary_change_requests'::regclass
  ) THEN
    ALTER TABLE public.hr_salary_change_requests ADD CONSTRAINT hr_salary_change_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_salary_change_requests_school_id_fkey'
      AND conrelid = 'public.hr_salary_change_requests'::regclass
  ) THEN
    ALTER TABLE public.hr_salary_change_requests ADD CONSTRAINT hr_salary_change_requests_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_contract_salary_amendments_applied_by_fkey'
      AND conrelid = 'public.hr_contract_salary_amendments'::regclass
  ) THEN
    ALTER TABLE public.hr_contract_salary_amendments ADD CONSTRAINT hr_contract_salary_amendments_applied_by_fkey FOREIGN KEY (applied_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_contract_salary_amendments_contract_id_fkey'
      AND conrelid = 'public.hr_contract_salary_amendments'::regclass
  ) THEN
    ALTER TABLE public.hr_contract_salary_amendments ADD CONSTRAINT hr_contract_salary_amendments_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES hr_contracts(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_contract_salary_amendments_request_id_fkey'
      AND conrelid = 'public.hr_contract_salary_amendments'::regclass
  ) THEN
    ALTER TABLE public.hr_contract_salary_amendments ADD CONSTRAINT hr_contract_salary_amendments_request_id_fkey FOREIGN KEY (request_id) REFERENCES hr_salary_change_requests(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_contract_salary_amendments_salary_scale_step_id_fkey'
      AND conrelid = 'public.hr_contract_salary_amendments'::regclass
  ) THEN
    ALTER TABLE public.hr_contract_salary_amendments ADD CONSTRAINT hr_contract_salary_amendments_salary_scale_step_id_fkey FOREIGN KEY (salary_scale_step_id) REFERENCES hr_salary_scale_steps(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_contract_salary_amendments_school_id_fkey'
      AND conrelid = 'public.hr_contract_salary_amendments'::regclass
  ) THEN
    ALTER TABLE public.hr_contract_salary_amendments ADD CONSTRAINT hr_contract_salary_amendments_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;
