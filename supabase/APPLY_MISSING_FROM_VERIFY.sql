-- ⚠️  NÃO CORRER NA PRODUÇÃO (2026-09-28).
-- Este script manual antigo recria políticas que as migrações de 2026-09-25 a
-- 2026-09-28 corrigiram (matrículas abertas a alunos, logótipos sem escola,
-- arquivo legível por qualquer membro, escrita só com is_school_member…).
-- A fonte de verdade é supabase/migrations/. Ver docs/agents/CONTINUE.md.

-- =============================================================================
-- PATCH: tabelas em falta detectadas por `npm run siga:sql:verify` (2026-08-29)
-- Projecto SGA: xodgfmxiaunpamctfeea
--
-- Pré-requisito: APPLY_ENROLLMENT_AND_PREMIUM.sql já aplicado (current_school_id,
-- schools, people, students, siga_files, etc.).
--
-- Uso: colar no SQL Editor do Supabase e executar uma vez.
-- Depois: npm run siga:sql:verify
--
-- Idempotente (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- NÃO substitui a ordem canónica completa — só fecha lacunas.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0) Funções de segurança fundamentais (RLS e isolamento)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_school_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT school_id
  FROM public.school_memberships
  WHERE user_id = (SELECT auth.uid())
    AND status = 'active'
  ORDER BY created_at ASC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_school_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_school_id() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.current_profile_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(
    (
      SELECT r.code
      FROM public.school_memberships sm
      JOIN public.member_roles mr ON mr.membership_id = sm.id
      JOIN public.roles r ON r.id = mr.role_id
      WHERE sm.user_id = (SELECT auth.uid())
        AND sm.status = 'active'
      ORDER BY sm.created_at ASC
      LIMIT 1
    ),
    (
      SELECT cargo
      FROM public.profiles
      WHERE id = (SELECT auth.uid())
      LIMIT 1
    ),
    'Utilizador'
  );
$$;

REVOKE ALL ON FUNCTION public.current_profile_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_profile_role() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1) Telemetria gateway (APPLY_IN_SQL_EDITOR.sql)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_gateway_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  channel text NOT NULL,
  http_status integer NOT NULL,
  ok boolean NOT NULL,
  message text,
  reference text,
  invoice_id uuid,
  amount numeric,
  provider text,
  dev_mode boolean NOT NULL DEFAULT false,
  external_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finance_gateway_webhook_events_school_recent_idx
  ON public.finance_gateway_webhook_events (school_id, created_at DESC);

CREATE INDEX IF NOT EXISTS finance_gateway_webhook_events_failures_idx
  ON public.finance_gateway_webhook_events (created_at DESC)
  WHERE ok = false;

GRANT SELECT ON public.finance_gateway_webhook_events TO authenticated;
GRANT ALL ON public.finance_gateway_webhook_events TO service_role;

ALTER TABLE public.finance_gateway_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_gateway_webhook_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read gateway webhook events in own school" ON public.finance_gateway_webhook_events;
CREATE POLICY "Read gateway webhook events in own school" ON public.finance_gateway_webhook_events
  FOR SELECT TO authenticated
  USING (
    public.is_school_member(school_id)
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria')
  );

-- ---------------------------------------------------------------------------
-- 2) Presenças (bloco APPLY_ENROLLMENT_AND_PREMIUM.sql)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.siga_attendance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE SET NULL,
  class_group_id uuid NOT NULL REFERENCES public.class_groups(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  teacher_id uuid REFERENCES public.teachers(id) ON DELETE SET NULL,
  timetable_slot_id uuid REFERENCES public.timetable_slots(id) ON DELETE SET NULL,
  lesson_date date NOT NULL DEFAULT CURRENT_DATE,
  period_number integer NOT NULL DEFAULT 1,
  starts_at text,
  ends_at text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS siga_attendance_sessions_school_class_date_idx
  ON public.siga_attendance_sessions (school_id, class_group_id, lesson_date DESC);
CREATE INDEX IF NOT EXISTS siga_attendance_sessions_teacher_date_idx
  ON public.siga_attendance_sessions (school_id, teacher_id, lesson_date DESC);

ALTER TABLE public.siga_attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_attendance_sessions FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.siga_attendance_sessions TO authenticated;
GRANT ALL ON public.siga_attendance_sessions TO service_role;

-- SÓ LEITURA. Com `FOR ALL`, esta política deixava qualquer membro da escola -- incluindo
-- um utilizador cujo único papel é Aluno ou Encarregado -- escrever nesta tabela, porque
-- `is_school_member` não olha ao papel e o PostgreSQL combina políticas permissivas com OR
-- (anulando a política estrita que existisse ao lado). Ver
-- migrations/20260924123000_close_school_member_write_policies.sql e docs/auditoria/05-auditoria.md.
-- Nenhuma escrita da aplicação passa por aqui: todas correm por service_role.
DROP POLICY IF EXISTS "Manage attendance sessions in own school" ON public.siga_attendance_sessions;
DROP POLICY IF EXISTS "Read attendance sessions in own school" ON public.siga_attendance_sessions;
CREATE POLICY "Read attendance sessions in own school"
  ON public.siga_attendance_sessions
  FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));

CREATE TABLE IF NOT EXISTS public.siga_attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.siga_attendance_sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_registered' CHECK (status IN ('present', 'absent', 'excused', 'late', 'early_exit', 'not_registered')),
  notes text,
  recorded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, student_id)
);

CREATE INDEX IF NOT EXISTS siga_attendance_records_student_idx
  ON public.siga_attendance_records (school_id, student_id, created_at DESC);

ALTER TABLE public.siga_attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_attendance_records FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.siga_attendance_records TO authenticated;
GRANT ALL ON public.siga_attendance_records TO service_role;

-- SÓ LEITURA. Com `FOR ALL`, esta política deixava qualquer membro da escola -- incluindo
-- um utilizador cujo único papel é Aluno ou Encarregado -- escrever nesta tabela, porque
-- `is_school_member` não olha ao papel e o PostgreSQL combina políticas permissivas com OR
-- (anulando a política estrita que existisse ao lado). Ver
-- migrations/20260924123000_close_school_member_write_policies.sql e docs/auditoria/05-auditoria.md.
-- Nenhuma escrita da aplicação passa por aqui: todas correm por service_role.
DROP POLICY IF EXISTS "Manage attendance records in own school" ON public.siga_attendance_records;
DROP POLICY IF EXISTS "Read attendance records in own school" ON public.siga_attendance_records;
CREATE POLICY "Read attendance records in own school"
  ON public.siga_attendance_records
  FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));

CREATE TABLE IF NOT EXISTS public.siga_attendance_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.siga_attendance_sessions(id) ON DELETE CASCADE,
  attendance_record_id uuid REFERENCES public.siga_attendance_records(id) ON DELETE SET NULL,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  old_status text NOT NULL,
  new_status text NOT NULL,
  reason text NOT NULL,
  changed_by uuid NOT NULL REFERENCES auth.users(id),
  device_info text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS siga_attendance_audits_session_idx
  ON public.siga_attendance_audits (school_id, session_id, created_at DESC);

ALTER TABLE public.siga_attendance_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_attendance_audits FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.siga_attendance_audits TO authenticated;
GRANT ALL ON public.siga_attendance_audits TO service_role;

DROP POLICY IF EXISTS "Read attendance audits in own school" ON public.siga_attendance_audits;
CREATE POLICY "Read attendance audits in own school"
  ON public.siga_attendance_audits
  FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));

CREATE TABLE IF NOT EXISTS public.siga_attendance_justifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  attendance_record_id uuid REFERENCES public.siga_attendance_records(id) ON DELETE SET NULL,
  session_id uuid REFERENCES public.siga_attendance_sessions(id) ON DELETE SET NULL,
  reason text NOT NULL,
  file_id uuid REFERENCES public.siga_files(id) ON DELETE SET NULL,
  file_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_by uuid NOT NULL REFERENCES auth.users(id),
  reviewed_by uuid REFERENCES auth.users(id),
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS siga_attendance_justifications_student_idx
  ON public.siga_attendance_justifications (school_id, student_id, created_at DESC);

ALTER TABLE public.siga_attendance_justifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_attendance_justifications FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.siga_attendance_justifications TO authenticated;
GRANT ALL ON public.siga_attendance_justifications TO service_role;

-- SÓ LEITURA. Com `FOR ALL`, esta política deixava qualquer membro da escola -- incluindo
-- um utilizador cujo único papel é Aluno ou Encarregado -- escrever nesta tabela, porque
-- `is_school_member` não olha ao papel e o PostgreSQL combina políticas permissivas com OR
-- (anulando a política estrita que existisse ao lado). Ver
-- migrations/20260924123000_close_school_member_write_policies.sql e docs/auditoria/05-auditoria.md.
-- Nenhuma escrita da aplicação passa por aqui: todas correm por service_role.
DROP POLICY IF EXISTS "Manage attendance justifications in own school" ON public.siga_attendance_justifications;
DROP POLICY IF EXISTS "Read attendance justifications in own school" ON public.siga_attendance_justifications;
CREATE POLICY "Read attendance justifications in own school"
  ON public.siga_attendance_justifications
  FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));

-- ---------------------------------------------------------------------------
-- 3) Catracas / cartões (bloco APPLY_ENROLLMENT_AND_PREMIUM.sql)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.siga_access_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  card_number text NOT NULL,
  barcode text NOT NULL,
  qr_secret text NOT NULL DEFAULT gen_random_uuid()::text,
  rfid_tag text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'lost', 'expired')),
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT siga_access_cards_number_key UNIQUE (school_id, card_number)
);

CREATE INDEX IF NOT EXISTS siga_access_cards_person_idx
  ON public.siga_access_cards (school_id, person_id);
CREATE INDEX IF NOT EXISTS siga_access_cards_student_idx
  ON public.siga_access_cards (school_id, student_id);

ALTER TABLE public.siga_access_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_access_cards FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.siga_access_cards TO authenticated;
GRANT ALL ON public.siga_access_cards TO service_role;

-- SEM POLÍTICA PARA `authenticated`, de propósito. Esta tabela guarda credenciais:
--   · siga_turnstile_devices.api_key É a autenticação do leitor físico
--     (gate-pass-validation.ts:64 procura o dispositivo por .eq("api_key", ...));
--   · siga_access_cards.qr_secret / rfid_tag SÃO o passe (gate-pass-validation.ts:85
--     aceita qualquer um dos quatro identificadores como válido).
-- Com `ALL → is_school_member`, um aluno lia o segredo de qualquer colega e passava a
-- catraca como ele, ou forjava entradas com o api_key do leitor. Uma política de LINHA não
-- esconde uma COLUNA, por isso nem sequer se deixa SELECT: toda a aplicação lê estas
-- tabelas por service_role (catracas/server.ts, gate-pass-validation.ts,
-- device-webhook-handler.ts -- 18 ocorrências, todas em loadSgaAdminClient).
-- Ver migrations/20260924230000_close_access_card_and_device_secrets.sql.
DROP POLICY IF EXISTS "Access cards in own school" ON public.siga_access_cards;

CREATE TABLE IF NOT EXISTS public.siga_turnstile_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  location text NOT NULL,
  device_type text NOT NULL DEFAULT 'turnstile' CHECK (device_type IN ('turnstile', 'gate', 'door', 'scanner_app')),
  direction_capability text NOT NULL DEFAULT 'bidirectional' CHECK (direction_capability IN ('entry', 'exit', 'bidirectional')),
  ip_address text,
  mac_address text,
  api_key text,
  status text NOT NULL DEFAULT 'online' CHECK (status IN ('online', 'offline', 'maintenance')),
  last_ping_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS siga_turnstile_devices_school_idx
  ON public.siga_turnstile_devices (school_id, status);

ALTER TABLE public.siga_turnstile_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_turnstile_devices FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.siga_turnstile_devices TO authenticated;
GRANT ALL ON public.siga_turnstile_devices TO service_role;

-- SEM POLÍTICA PARA `authenticated`, de propósito. Esta tabela guarda credenciais:
--   · siga_turnstile_devices.api_key É a autenticação do leitor físico
--     (gate-pass-validation.ts:64 procura o dispositivo por .eq("api_key", ...));
--   · siga_access_cards.qr_secret / rfid_tag SÃO o passe (gate-pass-validation.ts:85
--     aceita qualquer um dos quatro identificadores como válido).
-- Com `ALL → is_school_member`, um aluno lia o segredo de qualquer colega e passava a
-- catraca como ele, ou forjava entradas com o api_key do leitor. Uma política de LINHA não
-- esconde uma COLUNA, por isso nem sequer se deixa SELECT: toda a aplicação lê estas
-- tabelas por service_role (catracas/server.ts, gate-pass-validation.ts,
-- device-webhook-handler.ts -- 18 ocorrências, todas em loadSgaAdminClient).
-- Ver migrations/20260924230000_close_access_card_and_device_secrets.sql.
DROP POLICY IF EXISTS "Turnstile devices in own school" ON public.siga_turnstile_devices;

CREATE TABLE IF NOT EXISTS public.siga_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  card_id uuid REFERENCES public.siga_access_cards(id) ON DELETE SET NULL,
  device_id uuid REFERENCES public.siga_turnstile_devices(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('entry', 'exit')),
  status text NOT NULL CHECK (status IN ('granted', 'denied')),
  denial_reason text,
  device_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS siga_access_logs_school_person_idx
  ON public.siga_access_logs (school_id, person_id, created_at DESC);
CREATE INDEX IF NOT EXISTS siga_access_logs_student_idx
  ON public.siga_access_logs (school_id, student_id, created_at DESC);

ALTER TABLE public.siga_access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_access_logs FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.siga_access_logs TO authenticated;
GRANT ALL ON public.siga_access_logs TO service_role;

-- `FOR SELECT`, nao `FOR ALL`: ver 20260924180000. Um registo de passagem na
-- catraca nao se altera nem se apaga pelo browser. A aplicacao so escreve aqui com
-- `loadSgaAdminClient()`.
DROP POLICY IF EXISTS "Access logs in own school" ON public.siga_access_logs;
CREATE POLICY "Access logs in own school" ON public.siga_access_logs
  FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));

-- Smoke: deve listar as 5 tabelas alvo (+ relacionadas de presença)
SELECT c.relname AS tabela
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'finance_gateway_webhook_events',
    'siga_attendance_sessions',
    'siga_attendance_records',
    'siga_access_cards',
    'siga_turnstile_devices',
    'siga_access_logs'
  )
ORDER BY 1;

-- ---------------------------------------------------------------------------
-- 5) school_invitations (Convites para professores e staff)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.school_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  email text NOT NULL,
  role_code text NOT NULL DEFAULT 'teacher',
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS school_invitations_school_email_idx
  ON public.school_invitations (school_id, lower(email));
CREATE INDEX IF NOT EXISTS school_invitations_token_hash_idx
  ON public.school_invitations (token_hash)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS school_invitations_school_created_desc_idx
  ON public.school_invitations (school_id, created_at DESC)
  WHERE status = 'pending';

DROP TRIGGER IF EXISTS school_invitations_set_updated_at ON public.school_invitations;
CREATE TRIGGER school_invitations_set_updated_at
  BEFORE UPDATE ON public.school_invitations
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

GRANT SELECT, INSERT, UPDATE ON public.school_invitations TO authenticated;
GRANT ALL ON public.school_invitations TO service_role;
ALTER TABLE public.school_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_invitations FORCE ROW LEVEL SECURITY;

-- `FOR SELECT`, nao `FOR ALL`: ver 20260924170000. `school_invitations` tem uma
-- coluna `role_code`. Com escrita por simples pertenca a escola, qualquer membro
-- criava um convite `role_code = 'owner'` e aceitava-o a seguir. A aplicacao so
-- lhe toca com `loadAdminClient()`, que ignora RLS -- nao perde nada.
DROP POLICY IF EXISTS "Manage invitations in own school" ON public.school_invitations;
CREATE POLICY "Manage invitations in own school" ON public.school_invitations
  FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));
