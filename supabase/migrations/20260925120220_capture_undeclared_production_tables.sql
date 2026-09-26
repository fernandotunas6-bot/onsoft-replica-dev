-- Migration: 20260925120220_capture_undeclared_production_tables
-- Objetivo: Declarar em versionamento as 3 tabelas que existiam na base ao
--   vivo sem nenhum CREATE TABLE no repositório — a divergência que
--   tests/security/production-snapshot.test.ts media e travava.
-- Metodologia: DDL lido do catálogo do Postgres (pg_attribute, pg_constraint,
--   pg_get_indexdef) por scripts/siga/capture-table-ddl.mjs, não escrito à mão.
--   100% idempotente: CREATE TABLE IF NOT EXISTS, chaves estrangeiras em blocos
--   guardados por pg_constraint, CREATE INDEX IF NOT EXISTS. Seguro de reaplicar
--   num ambiente onde estas tabelas já correm.
-- Âmbito: tabelas, restrições e índices. As políticas de RLS destas tabelas já
--   estão versionadas em supabase/HARDEN_*.sql e nas migrações de origem; aqui
--   só se liga o RLS onde a produção o tem ligado.
-- NUNCA executar via Lovable. Usar: npm run siga:sql (colar no SQL Editor do SGA)
-- Gerado em 2026-09-25T12:02:20.444Z

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
CREATE INDEX IF NOT EXISTS google_workspace_states_expiry_idx ON public.google_workspace_oauth_states USING btree (expires_at);
CREATE INDEX IF NOT EXISTS google_workspace_states_user_idx ON public.google_workspace_oauth_states USING btree (user_id, school_id);

-- school_access_requests
CREATE TABLE IF NOT EXISTS public.school_access_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  user_id uuid NOT NULL,
  full_name text NOT NULL,
  national_id text,
  institutional_id text,
  requested_role text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  person_id uuid,
  reviewed_by uuid,
  review_note text,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  enrollment_application_id uuid,
  CONSTRAINT school_access_requests_full_name_check CHECK (((char_length(TRIM(BOTH FROM full_name)) >= 3) AND (char_length(TRIM(BOTH FROM full_name)) <= 160))),
  CONSTRAINT school_access_requests_requested_role_check CHECK ((requested_role = ANY (ARRAY['student'::text, 'teacher'::text, 'guardian'::text, 'user'::text]))),
  CONSTRAINT school_access_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'under_review'::text, 'needs_information'::text, 'preapproved'::text, 'approved'::text, 'enrollment_pending'::text, 'enrollment_rejected'::text, 'rejected'::text, 'cancelled'::text]))),
  CONSTRAINT school_access_requests_pkey PRIMARY KEY (id),
  CONSTRAINT school_access_requests_enrollment_application_id_key UNIQUE (enrollment_application_id)
);
ALTER TABLE public.school_access_requests ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS school_access_requests_one_open ON public.school_access_requests USING btree (school_id, user_id) WHERE (status = ANY (ARRAY['pending'::text, 'under_review'::text, 'needs_information'::text, 'preapproved'::text, 'approved'::text, 'enrollment_pending'::text]));
CREATE UNIQUE INDEX IF NOT EXISTS school_access_requests_open_uidx ON public.school_access_requests USING btree (school_id, user_id) WHERE (status = ANY (ARRAY['pending'::text, 'in_review'::text, 'info_requested'::text]));
CREATE INDEX IF NOT EXISTS school_access_requests_school_status ON public.school_access_requests USING btree (school_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS school_access_requests_school_status_idx ON public.school_access_requests USING btree (school_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS school_access_requests_user ON public.school_access_requests USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS school_access_requests_user_idx ON public.school_access_requests USING btree (user_id, created_at DESC);

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
    SELECT 1 FROM pg_constraint WHERE conname = 'school_access_requests_enrollment_application_id_fkey'
      AND conrelid = 'public.school_access_requests'::regclass
  ) THEN
    ALTER TABLE public.school_access_requests ADD CONSTRAINT school_access_requests_enrollment_application_id_fkey FOREIGN KEY (enrollment_application_id) REFERENCES enrollment_applications(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'school_access_requests_person_id_fkey'
      AND conrelid = 'public.school_access_requests'::regclass
  ) THEN
    ALTER TABLE public.school_access_requests ADD CONSTRAINT school_access_requests_person_id_fkey FOREIGN KEY (person_id) REFERENCES people(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'school_access_requests_reviewed_by_fkey'
      AND conrelid = 'public.school_access_requests'::regclass
  ) THEN
    ALTER TABLE public.school_access_requests ADD CONSTRAINT school_access_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'school_access_requests_school_id_fkey'
      AND conrelid = 'public.school_access_requests'::regclass
  ) THEN
    ALTER TABLE public.school_access_requests ADD CONSTRAINT school_access_requests_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'school_access_requests_user_id_fkey'
      AND conrelid = 'public.school_access_requests'::regclass
  ) THEN
    ALTER TABLE public.school_access_requests ADD CONSTRAINT school_access_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
  END IF;
END $$;
