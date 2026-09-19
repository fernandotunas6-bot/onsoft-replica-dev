-- Migration: 20260914151906_capture_undeclared_production_tables
-- Objetivo: Declarar em versionamento as 35 tabelas que existiam na base ao
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
-- Gerado em 2026-09-14T15:19:06.694Z

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. TABELAS, RESTRIÇÕES EM LINHA E ÍNDICES
-- ═══════════════════════════════════════════════════════════════════════════

-- academic_levels
CREATE TABLE IF NOT EXISTS public.academic_levels (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  sequence smallint NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT academic_levels_sequence_check CHECK ((sequence > 0)),
  CONSTRAINT academic_levels_pkey PRIMARY KEY (id),
  CONSTRAINT academic_levels_school_id_code_key UNIQUE (school_id, code),
  CONSTRAINT academic_levels_school_id_id_key UNIQUE (school_id, id)
);
ALTER TABLE public.academic_levels ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS academic_levels_school_active_idx ON public.academic_levels USING btree (school_id, is_active, sequence);

-- announcements
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  audience text DEFAULT 'school'::text NOT NULL,
  class_group_id uuid,
  role_code text,
  priority text DEFAULT 'normal'::text NOT NULL,
  status text DEFAULT 'draft'::text NOT NULL,
  published_at timestamp with time zone,
  archived_at timestamp with time zone,
  created_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  channel text DEFAULT 'portal'::text NOT NULL,
  scheduled_for date,
  updated_by uuid,
  CONSTRAINT announcements_audience_check CHECK ((audience = 'school'::text)),
  CONSTRAINT announcements_audience_shape CHECK ((((audience = 'school'::text) AND (class_group_id IS NULL) AND (role_code IS NULL)) OR ((audience = 'class_group'::text) AND (class_group_id IS NOT NULL) AND (role_code IS NULL)) OR ((audience = 'role'::text) AND (role_code IS NOT NULL) AND (class_group_id IS NULL)))),
  CONSTRAINT announcements_body_check CHECK (((body = btrim(body)) AND ((char_length(body) >= 2) AND (char_length(body) <= 4000)))),
  CONSTRAINT announcements_channel_check CHECK ((channel = ANY (ARRAY['sms'::text, 'email'::text, 'portal'::text]))),
  CONSTRAINT announcements_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text]))),
  CONSTRAINT announcements_role_code_check CHECK (((role_code IS NULL) OR (role_code ~ '^[a-z_]{2,40}$'::text))),
  CONSTRAINT announcements_scheduled_for_check CHECK (((status <> 'scheduled'::text) OR (scheduled_for IS NOT NULL))),
  CONSTRAINT announcements_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'published'::text, 'archived'::text]))),
  CONSTRAINT announcements_title_check CHECK (((title = btrim(title)) AND ((char_length(title) >= 2) AND (char_length(title) <= 160)))),
  CONSTRAINT announcements_pkey PRIMARY KEY (id),
  CONSTRAINT announcements_school_id_id_key UNIQUE (school_id, id)
);
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS announcements_school_created_desc_idx ON public.announcements USING btree (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS announcements_school_created_idx ON public.announcements USING btree (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS announcements_school_status_idx ON public.announcements USING btree (school_id, status, published_at DESC);
CREATE INDEX IF NOT EXISTS announcements_school_status_schedule_idx ON public.announcements USING btree (school_id, status, scheduled_for) WHERE (status = ANY (ARRAY['scheduled'::text, 'published'::text]));

-- attendance_records
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  attendance_session_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  status text NOT NULL,
  minutes_late smallint DEFAULT 0 NOT NULL,
  note text,
  recorded_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT attendance_records_check CHECK ((((status = 'late'::text) AND (minutes_late > 0)) OR ((status <> 'late'::text) AND (minutes_late = 0)))),
  CONSTRAINT attendance_records_minutes_late_check CHECK (((minutes_late >= 0) AND (minutes_late <= 720))),
  CONSTRAINT attendance_records_note_check CHECK (((note IS NULL) OR ((char_length(btrim(note)) >= 3) AND (char_length(btrim(note)) <= 300)))),
  CONSTRAINT attendance_records_status_check CHECK ((status = ANY (ARRAY['present'::text, 'absent'::text, 'late'::text, 'excused'::text]))),
  CONSTRAINT attendance_records_pkey PRIMARY KEY (id),
  CONSTRAINT attendance_records_school_id_attendance_session_id_enrollme_key UNIQUE (school_id, attendance_session_id, enrollment_id),
  CONSTRAINT attendance_records_school_id_id_key UNIQUE (school_id, id)
);
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS attendance_records_enrollment_idx ON public.attendance_records USING btree (enrollment_id);
CREATE INDEX IF NOT EXISTS attendance_records_school_enrollment_idx ON public.attendance_records USING btree (school_id, enrollment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS attendance_records_school_session_idx ON public.attendance_records USING btree (school_id, attendance_session_id, status, id);
CREATE INDEX IF NOT EXISTS attendance_records_session_idx ON public.attendance_records USING btree (attendance_session_id);

-- attendance_session_roster
CREATE TABLE IF NOT EXISTS public.attendance_session_roster (
  school_id uuid NOT NULL,
  attendance_session_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  captured_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT attendance_session_roster_pkey PRIMARY KEY (school_id, attendance_session_id, enrollment_id)
);
ALTER TABLE public.attendance_session_roster ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS attendance_session_roster_enrollment_idx ON public.attendance_session_roster USING btree (school_id, enrollment_id, attendance_session_id);

-- attendance_sessions
CREATE TABLE IF NOT EXISTS public.attendance_sessions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  timetable_slot_id uuid NOT NULL,
  class_subject_id uuid NOT NULL,
  session_date date NOT NULL,
  status text DEFAULT 'draft'::text NOT NULL,
  submission_key text,
  opened_by uuid NOT NULL,
  submitted_by uuid,
  submitted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  reopened_by uuid,
  reopened_at timestamp with time zone,
  reopen_reason text,
  CONSTRAINT attendance_reopen_metadata_check CHECK ((((reopened_by IS NULL) AND (reopened_at IS NULL) AND (reopen_reason IS NULL)) OR ((reopened_by IS NOT NULL) AND (reopened_at IS NOT NULL) AND (reopen_reason IS NOT NULL)))),
  CONSTRAINT attendance_sessions_check CHECK ((((status = ANY (ARRAY['draft'::text, 'reopened'::text])) AND (submitted_by IS NULL) AND (submitted_at IS NULL)) OR ((status = 'submitted'::text) AND (submitted_by IS NOT NULL) AND (submitted_at IS NOT NULL) AND (submission_key IS NOT NULL)))),
  CONSTRAINT attendance_sessions_reopen_reason_check CHECK (((reopen_reason IS NULL) OR ((char_length(btrim(reopen_reason)) >= 5) AND (char_length(btrim(reopen_reason)) <= 300)))),
  CONSTRAINT attendance_sessions_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'reopened'::text]))),
  CONSTRAINT attendance_sessions_submission_key_check CHECK (((submission_key IS NULL) OR ((char_length(submission_key) >= 8) AND (char_length(submission_key) <= 120)))),
  CONSTRAINT attendance_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT attendance_sessions_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT attendance_sessions_school_id_timetable_slot_id_session_dat_key UNIQUE (school_id, timetable_slot_id, session_date)
);
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS attendance_sessions_class_subject_idx ON public.attendance_sessions USING btree (class_subject_id);
CREATE INDEX IF NOT EXISTS attendance_sessions_school_date_idx ON public.attendance_sessions USING btree (school_id, session_date, status, id);
CREATE INDEX IF NOT EXISTS attendance_sessions_school_subject_idx ON public.attendance_sessions USING btree (school_id, class_subject_id, session_date DESC);
CREATE INDEX IF NOT EXISTS attendance_sessions_slot_idx ON public.attendance_sessions USING btree (timetable_slot_id);

-- campuses
CREATE TABLE IF NOT EXISTS public.campuses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  province text,
  municipality text,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  address text,
  CONSTRAINT campuses_pkey PRIMARY KEY (id),
  CONSTRAINT campuses_school_id_code_key UNIQUE (school_id, code),
  CONSTRAINT campuses_school_id_id_key UNIQUE (school_id, id)
);
ALTER TABLE public.campuses ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS campuses_school_active_idx ON public.campuses USING btree (school_id, is_active);

-- class_subjects
CREATE TABLE IF NOT EXISTS public.class_subjects (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  class_group_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  teacher_id uuid,
  weekly_periods smallint NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT class_subjects_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text]))),
  CONSTRAINT class_subjects_weekly_periods_check CHECK (((weekly_periods >= 1) AND (weekly_periods <= 30))),
  CONSTRAINT class_subjects_pkey PRIMARY KEY (id),
  CONSTRAINT class_subjects_school_id_class_group_id_subject_id_key UNIQUE (school_id, class_group_id, subject_id),
  CONSTRAINT class_subjects_school_id_id_key UNIQUE (school_id, id)
);
ALTER TABLE public.class_subjects ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS class_subjects_class_group_idx ON public.class_subjects USING btree (class_group_id);
CREATE INDEX IF NOT EXISTS class_subjects_school_class_idx ON public.class_subjects USING btree (school_id, class_group_id, status, id);
CREATE INDEX IF NOT EXISTS class_subjects_school_teacher_idx ON public.class_subjects USING btree (school_id, teacher_id, status, id);
CREATE INDEX IF NOT EXISTS class_subjects_subject_idx ON public.class_subjects USING btree (subject_id);
CREATE INDEX IF NOT EXISTS class_subjects_teacher_idx ON public.class_subjects USING btree (teacher_id);

-- document_sequences
CREATE TABLE IF NOT EXISTS public.document_sequences (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  document_type text NOT NULL,
  prefix text NOT NULL,
  next_number bigint DEFAULT 1 NOT NULL,
  padding smallint DEFAULT 6 NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT document_sequences_document_type_check CHECK ((document_type = ANY (ARRAY['invoice'::text, 'receipt'::text, 'credit_note'::text, 'expense'::text, 'declaration'::text, 'certificate'::text, 'transfer'::text, 'term'::text, 'other'::text]))),
  CONSTRAINT document_sequences_next_number_check CHECK ((next_number > 0)),
  CONSTRAINT document_sequences_padding_check CHECK (((padding >= 4) AND (padding <= 12))),
  CONSTRAINT document_sequences_pkey PRIMARY KEY (id),
  CONSTRAINT document_sequences_school_id_document_type_key UNIQUE (school_id, document_type),
  CONSTRAINT document_sequences_school_id_id_key UNIQUE (school_id, id)
);
ALTER TABLE public.document_sequences ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS document_sequences_school_type_idx ON public.document_sequences USING btree (school_id, document_type);

-- document_signatures
CREATE TABLE IF NOT EXISTS public.document_signatures (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  issued_document_id uuid NOT NULL,
  signer_role text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  requested_by uuid NOT NULL,
  acted_by uuid,
  acted_at timestamp with time zone,
  note text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT document_signatures_signer_role_check CHECK ((signer_role = ANY (ARRAY['director'::text, 'secretary'::text, 'coordinator'::text, 'other'::text]))),
  CONSTRAINT document_signatures_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'signed'::text, 'rejected'::text]))),
  CONSTRAINT document_signatures_pkey PRIMARY KEY (id),
  CONSTRAINT document_signatures_school_id_id_key UNIQUE (school_id, id)
);
ALTER TABLE public.document_signatures ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS document_signatures_school_status_idx ON public.document_signatures USING btree (school_id, status, created_at DESC);

-- fee_items
CREATE TABLE IF NOT EXISTS public.fee_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  fee_plan_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL,
  amount numeric(18,2) NOT NULL,
  frequency text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT fee_items_amount_check CHECK ((amount >= (0)::numeric)),
  CONSTRAINT fee_items_frequency_check CHECK ((frequency = ANY (ARRAY['once'::text, 'monthly'::text, 'term'::text, 'annual'::text]))),
  CONSTRAINT fee_items_kind_check CHECK ((kind = ANY (ARRAY['enrollment'::text, 'tuition'::text, 'service'::text, 'other'::text]))),
  CONSTRAINT fee_items_pkey PRIMARY KEY (id),
  CONSTRAINT fee_items_school_id_fee_plan_id_code_key UNIQUE (school_id, fee_plan_id, code),
  CONSTRAINT fee_items_school_id_unique UNIQUE (school_id, id)
);
ALTER TABLE public.fee_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS fee_items_plan_idx ON public.fee_items USING btree (fee_plan_id);
CREATE INDEX IF NOT EXISTS fee_items_school_plan_idx ON public.fee_items USING btree (school_id, fee_plan_id, is_active);

-- fee_plans
CREATE TABLE IF NOT EXISTS public.fee_plans (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  currency_code text DEFAULT 'AOA'::text NOT NULL,
  status text DEFAULT 'draft'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT fee_plans_currency_code_check CHECK ((currency_code = 'AOA'::text)),
  CONSTRAINT fee_plans_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'retired'::text]))),
  CONSTRAINT fee_plans_pkey PRIMARY KEY (id),
  CONSTRAINT fee_plans_school_id_code_key UNIQUE (school_id, code),
  CONSTRAINT fee_plans_school_id_id_key UNIQUE (school_id, id)
);
ALTER TABLE public.fee_plans ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS fee_plans_school_year_idx ON public.fee_plans USING btree (school_id, academic_year_id, status);

-- finance_contracts
CREATE TABLE IF NOT EXISTS public.finance_contracts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  fee_plan_id uuid NOT NULL,
  discount_percentage numeric(5,2) DEFAULT 0 NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT finance_contracts_discount_percentage_check CHECK (((discount_percentage >= (0)::numeric) AND (discount_percentage <= (100)::numeric))),
  CONSTRAINT finance_contracts_status_check CHECK ((status = ANY (ARRAY['active'::text, 'cancelled'::text]))),
  CONSTRAINT finance_contracts_pkey PRIMARY KEY (id),
  CONSTRAINT finance_contracts_school_id_enrollment_id_key UNIQUE (school_id, enrollment_id),
  CONSTRAINT finance_contracts_school_id_id_key UNIQUE (school_id, id)
);
ALTER TABLE public.finance_contracts ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS finance_contracts_enrollment_idx ON public.finance_contracts USING btree (enrollment_id);
CREATE INDEX IF NOT EXISTS finance_contracts_school_enrollment_idx ON public.finance_contracts USING btree (school_id, enrollment_id);

-- finance_invoice_events
CREATE TABLE IF NOT EXISTS public.finance_invoice_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL,
  reason text,
  changed_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT finance_invoice_events_pkey PRIMARY KEY (id)
);
ALTER TABLE public.finance_invoice_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS finance_invoice_events_invoice_idx ON public.finance_invoice_events USING btree (school_id, invoice_id, created_at DESC);

-- finance_invoices
CREATE TABLE IF NOT EXISTS public.finance_invoices (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  contract_id uuid NOT NULL,
  fee_item_id uuid NOT NULL,
  invoice_number text NOT NULL,
  competence_month date,
  amount numeric(18,2) NOT NULL,
  discount_amount numeric(18,2) DEFAULT 0 NOT NULL,
  due_date date NOT NULL,
  status text DEFAULT 'open'::text NOT NULL,
  issued_by uuid NOT NULL,
  cancelled_at timestamp with time zone,
  cancelled_by uuid,
  cancellation_reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  penalty_amount numeric DEFAULT 0 NOT NULL,
  CONSTRAINT finance_invoices_amount_check CHECK ((amount >= (0)::numeric)),
  CONSTRAINT finance_invoices_cancellation_reason_check CHECK (((cancellation_reason IS NULL) OR ((char_length(btrim(cancellation_reason)) >= 5) AND (char_length(btrim(cancellation_reason)) <= 300)))),
  CONSTRAINT finance_invoices_check CHECK (((status = 'cancelled'::text) = (cancelled_at IS NOT NULL))),
  CONSTRAINT finance_invoices_competence_month_check CHECK (((competence_month IS NULL) OR (EXTRACT(day FROM competence_month) = (1)::numeric))),
  CONSTRAINT finance_invoices_discount_amount_check CHECK ((discount_amount >= (0)::numeric)),
  CONSTRAINT finance_invoices_status_check CHECK ((status = ANY (ARRAY['open'::text, 'partially_paid'::text, 'paid'::text, 'cancelled'::text]))),
  CONSTRAINT finance_invoices_pkey PRIMARY KEY (id),
  CONSTRAINT finance_invoices_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT finance_invoices_school_id_invoice_number_key UNIQUE (school_id, invoice_number)
);
ALTER TABLE public.finance_invoices ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS finance_invoices_contract_idx ON public.finance_invoices USING btree (contract_id);
CREATE INDEX IF NOT EXISTS finance_invoices_school_contract_idx ON public.finance_invoices USING btree (school_id, contract_id);
CREATE INDEX IF NOT EXISTS finance_invoices_school_created_desc_idx ON public.finance_invoices USING btree (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS finance_invoices_school_status_due_idx ON public.finance_invoices USING btree (school_id, status, due_date);
CREATE INDEX IF NOT EXISTS finance_invoices_school_status_idx ON public.finance_invoices USING btree (school_id, status);

-- finance_receipts
CREATE TABLE IF NOT EXISTS public.finance_receipts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  receipt_number text NOT NULL,
  amount numeric(18,2) NOT NULL,
  paid_on date NOT NULL,
  payment_method text NOT NULL,
  received_by uuid NOT NULL,
  status text DEFAULT 'issued'::text NOT NULL,
  reversed_at timestamp with time zone,
  reversed_by uuid,
  reversal_reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT finance_receipts_amount_check CHECK ((amount > (0)::numeric)),
  CONSTRAINT finance_receipts_check CHECK (((status = 'reversed'::text) = (reversed_at IS NOT NULL))),
  CONSTRAINT finance_receipts_payment_method_check CHECK ((payment_method = ANY (ARRAY['cash'::text, 'bank_transfer'::text, 'card'::text, 'other'::text]))),
  CONSTRAINT finance_receipts_reversal_reason_check CHECK (((reversal_reason IS NULL) OR ((char_length(btrim(reversal_reason)) >= 5) AND (char_length(btrim(reversal_reason)) <= 300)))),
  CONSTRAINT finance_receipts_status_check CHECK ((status = ANY (ARRAY['issued'::text, 'reversed'::text]))),
  CONSTRAINT finance_receipts_pkey PRIMARY KEY (id),
  CONSTRAINT finance_receipts_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT finance_receipts_school_id_receipt_number_key UNIQUE (school_id, receipt_number)
);
ALTER TABLE public.finance_receipts ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS finance_receipts_invoice_idx ON public.finance_receipts USING btree (invoice_id);
CREATE INDEX IF NOT EXISTS finance_receipts_school_invoice_idx ON public.finance_receipts USING btree (school_id, invoice_id);

-- financial_rule_sets
CREATE TABLE IF NOT EXISTS public.financial_rule_sets (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  code text NOT NULL,
  version integer NOT NULL,
  status text NOT NULL,
  currency_code text DEFAULT 'AOA'::text NOT NULL,
  monthly_due_day smallint NOT NULL,
  late_penalty_kind text NOT NULL,
  late_penalty_value numeric(18,2) NOT NULL,
  maximum_discount_percentage numeric(5,2) NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT financial_rule_sets_currency_code_check CHECK ((currency_code = 'AOA'::text)),
  CONSTRAINT financial_rule_sets_late_penalty_kind_check CHECK ((late_penalty_kind = ANY (ARRAY['none'::text, 'fixed'::text, 'percentage'::text]))),
  CONSTRAINT financial_rule_sets_late_penalty_value_check CHECK ((late_penalty_value >= (0)::numeric)),
  CONSTRAINT financial_rule_sets_maximum_discount_percentage_check CHECK (((maximum_discount_percentage >= (0)::numeric) AND (maximum_discount_percentage <= (100)::numeric))),
  CONSTRAINT financial_rule_sets_monthly_due_day_check CHECK (((monthly_due_day >= 1) AND (monthly_due_day <= 28))),
  CONSTRAINT financial_rule_sets_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'retired'::text]))),
  CONSTRAINT financial_rule_sets_version_check CHECK ((version > 0)),
  CONSTRAINT financial_rule_sets_pkey PRIMARY KEY (id),
  CONSTRAINT financial_rule_sets_school_id_code_version_key UNIQUE (school_id, code, version),
  CONSTRAINT financial_rule_sets_school_id_id_key UNIQUE (school_id, id)
);
ALTER TABLE public.financial_rule_sets ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS financial_rules_one_active_idx ON public.financial_rule_sets USING btree (school_id, code) WHERE (status = 'active'::text);
CREATE INDEX IF NOT EXISTS financial_rules_school_status_idx ON public.financial_rule_sets USING btree (school_id, status, code, version DESC);

-- grade_items
CREATE TABLE IF NOT EXISTS public.grade_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  gradebook_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL,
  weight numeric(6,2) DEFAULT 1 NOT NULL,
  max_score numeric(6,2) NOT NULL,
  assessed_on date,
  sequence smallint DEFAULT 1 NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT grade_items_code_check CHECK ((code ~ '^[A-Z0-9_-]{2,30}$'::text)),
  CONSTRAINT grade_items_kind_check CHECK ((kind = ANY (ARRAY['continuous'::text, 'assignment'::text, 'test'::text, 'term_exam'::text, 'exam'::text, 'resit'::text, 'recovery'::text]))),
  CONSTRAINT grade_items_max_score_check CHECK ((max_score > (0)::numeric)),
  CONSTRAINT grade_items_name_check CHECK (((char_length(btrim(name)) >= 2) AND (char_length(btrim(name)) <= 120))),
  CONSTRAINT grade_items_sequence_check CHECK ((sequence > 0)),
  CONSTRAINT grade_items_weight_check CHECK (((weight > (0)::numeric) AND (weight <= (100)::numeric))),
  CONSTRAINT grade_items_pkey PRIMARY KEY (id),
  CONSTRAINT grade_items_school_id_gradebook_id_code_key UNIQUE (school_id, gradebook_id, code),
  CONSTRAINT grade_items_school_id_id_key UNIQUE (school_id, id)
);
ALTER TABLE public.grade_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS grade_items_gradebook_idx ON public.grade_items USING btree (school_id, gradebook_id, sequence, id);

-- grade_scores
CREATE TABLE IF NOT EXISTS public.grade_scores (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  grade_item_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  score numeric(6,2) NOT NULL,
  status text DEFAULT 'draft'::text NOT NULL,
  note text,
  recorded_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  pending_score numeric(6,2),
  pending_reason text,
  pending_requested_by uuid,
  pending_requested_at timestamp with time zone,
  CONSTRAINT grade_scores_note_check CHECK (((note IS NULL) OR ((char_length(btrim(note)) >= 3) AND (char_length(btrim(note)) <= 300)))),
  CONSTRAINT grade_scores_pending_consistency CHECK ((((pending_score IS NULL) AND (pending_reason IS NULL) AND (pending_requested_by IS NULL) AND (pending_requested_at IS NULL)) OR ((pending_score IS NOT NULL) AND (pending_reason IS NOT NULL) AND (pending_requested_by IS NOT NULL) AND (pending_requested_at IS NOT NULL)))),
  CONSTRAINT grade_scores_pending_reason_check CHECK (((pending_reason IS NULL) OR ((char_length(btrim(pending_reason)) >= 3) AND (char_length(btrim(pending_reason)) <= 300)))),
  CONSTRAINT grade_scores_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'locked'::text]))),
  CONSTRAINT grade_scores_pkey PRIMARY KEY (id),
  CONSTRAINT grade_scores_school_id_grade_item_id_enrollment_id_key UNIQUE (school_id, grade_item_id, enrollment_id),
  CONSTRAINT grade_scores_school_id_id_key UNIQUE (school_id, id)
);
ALTER TABLE public.grade_scores ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS grade_scores_enrollment_idx ON public.grade_scores USING btree (school_id, enrollment_id, grade_item_id);
CREATE INDEX IF NOT EXISTS grade_scores_grade_item_idx ON public.grade_scores USING btree (grade_item_id);

-- grade_sheet_rows
CREATE TABLE IF NOT EXISTS public.grade_sheet_rows (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  grade_sheet_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  continuous_average numeric(6,2),
  exam_average numeric(6,2),
  term_average numeric(6,2),
  absence_percentage numeric(5,2) DEFAULT 0 NOT NULL,
  result text DEFAULT 'pending'::text NOT NULL,
  observation text,
  subject_breakdown jsonb DEFAULT '[]'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT grade_sheet_rows_result_check CHECK ((result = ANY (ARRAY['pending'::text, 'pass'::text, 'fail'::text, 'incomplete'::text]))),
  CONSTRAINT grade_sheet_rows_pkey PRIMARY KEY (id),
  CONSTRAINT grade_sheet_rows_school_id_grade_sheet_id_enrollment_id_key UNIQUE (school_id, grade_sheet_id, enrollment_id),
  CONSTRAINT grade_sheet_rows_school_id_id_key UNIQUE (school_id, id)
);
ALTER TABLE public.grade_sheet_rows ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS grade_sheet_rows_enrollment_idx ON public.grade_sheet_rows USING btree (enrollment_id);
CREATE INDEX IF NOT EXISTS grade_sheet_rows_sheet_idx ON public.grade_sheet_rows USING btree (grade_sheet_id);

-- grade_sheets
CREATE TABLE IF NOT EXISTS public.grade_sheets (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  term_id uuid,
  class_group_id uuid NOT NULL,
  rule_set_id uuid NOT NULL,
  kind text NOT NULL,
  status text DEFAULT 'draft'::text NOT NULL,
  title text NOT NULL,
  submitted_at timestamp with time zone,
  homologated_at timestamp with time zone,
  published_at timestamp with time zone,
  closed_at timestamp with time zone,
  reopen_reason text,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT grade_sheets_check CHECK ((((kind = 'term'::text) AND (term_id IS NOT NULL)) OR ((kind = 'annual'::text) AND (term_id IS NULL)))),
  CONSTRAINT grade_sheets_kind_check CHECK ((kind = ANY (ARRAY['term'::text, 'annual'::text]))),
  CONSTRAINT grade_sheets_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'in_review'::text, 'homologated'::text, 'published'::text, 'contested'::text, 'rectified'::text, 'closed'::text]))),
  CONSTRAINT grade_sheets_pkey PRIMARY KEY (id),
  CONSTRAINT grade_sheets_school_id_id_key UNIQUE (school_id, id)
);
ALTER TABLE public.grade_sheets ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS grade_sheets_academic_year_idx ON public.grade_sheets USING btree (academic_year_id);
CREATE UNIQUE INDEX IF NOT EXISTS grade_sheets_annual_uidx ON public.grade_sheets USING btree (school_id, class_group_id, academic_year_id) WHERE (kind = 'annual'::text);
CREATE INDEX IF NOT EXISTS grade_sheets_class_group_idx ON public.grade_sheets USING btree (class_group_id);
CREATE INDEX IF NOT EXISTS grade_sheets_school_status_idx ON public.grade_sheets USING btree (school_id, status, kind, id);
CREATE UNIQUE INDEX IF NOT EXISTS grade_sheets_term_uidx ON public.grade_sheets USING btree (school_id, class_group_id, term_id) WHERE (kind = 'term'::text);

-- gradebooks
CREATE TABLE IF NOT EXISTS public.gradebooks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  term_id uuid NOT NULL,
  class_subject_id uuid NOT NULL,
  class_group_id uuid NOT NULL,
  rule_set_id uuid NOT NULL,
  status text DEFAULT 'draft'::text NOT NULL,
  opened_at timestamp with time zone,
  submitted_at timestamp with time zone,
  closed_at timestamp with time zone,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT gradebooks_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'open'::text, 'submitted'::text, 'closed'::text]))),
  CONSTRAINT gradebooks_pkey PRIMARY KEY (id),
  CONSTRAINT gradebooks_school_id_class_subject_id_term_id_key UNIQUE (school_id, class_subject_id, term_id),
  CONSTRAINT gradebooks_school_id_id_key UNIQUE (school_id, id)
);
ALTER TABLE public.gradebooks ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS gradebooks_academic_year_idx ON public.gradebooks USING btree (academic_year_id);
CREATE INDEX IF NOT EXISTS gradebooks_class_group_idx ON public.gradebooks USING btree (class_group_id);
CREATE INDEX IF NOT EXISTS gradebooks_class_subject_idx ON public.gradebooks USING btree (class_subject_id);
CREATE INDEX IF NOT EXISTS gradebooks_school_class_idx ON public.gradebooks USING btree (school_id, class_group_id, term_id);
CREATE INDEX IF NOT EXISTS gradebooks_school_term_status_idx ON public.gradebooks USING btree (school_id, term_id, status, id);

-- grading_scales
CREATE TABLE IF NOT EXISTS public.grading_scales (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  version integer DEFAULT 1 NOT NULL,
  minimum_value numeric(6,2) NOT NULL,
  maximum_value numeric(6,2) NOT NULL,
  passing_value numeric(6,2) NOT NULL,
  decimal_places smallint DEFAULT 0 NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT grading_scales_check CHECK (((minimum_value < passing_value) AND (passing_value <= maximum_value))),
  CONSTRAINT grading_scales_decimal_places_check CHECK (((decimal_places >= 0) AND (decimal_places <= 2))),
  CONSTRAINT grading_scales_version_check CHECK ((version > 0)),
  CONSTRAINT grading_scales_pkey PRIMARY KEY (id),
  CONSTRAINT grading_scales_school_id_code_version_key UNIQUE (school_id, code, version),
  CONSTRAINT grading_scales_school_id_unique UNIQUE (school_id, id)
);
ALTER TABLE public.grading_scales ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS grading_scales_school_active_idx ON public.grading_scales USING btree (school_id, is_active, code);

-- issued_documents
CREATE TABLE IF NOT EXISTS public.issued_documents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  student_id uuid NOT NULL,
  request_id uuid,
  template_id uuid NOT NULL,
  template_version integer NOT NULL,
  document_number text NOT NULL,
  document_type text NOT NULL,
  title text NOT NULL,
  body_snapshot text NOT NULL,
  validation_code text NOT NULL,
  status text DEFAULT 'issued'::text NOT NULL,
  issued_by uuid NOT NULL,
  issued_at timestamp with time zone DEFAULT now() NOT NULL,
  revoked_at timestamp with time zone,
  revoked_by uuid,
  revocation_reason text,
  requires_signature boolean DEFAULT false NOT NULL,
  signature_status text DEFAULT 'not_required'::text NOT NULL,
  signed_at timestamp with time zone,
  signed_by uuid,
  signature_note text,
  archived_at timestamp with time zone,
  archived_by uuid,
  CONSTRAINT issued_documents_check CHECK (((status = 'revoked'::text) = (revoked_at IS NOT NULL))),
  CONSTRAINT issued_documents_signature_status_check CHECK ((signature_status = ANY (ARRAY['not_required'::text, 'pending'::text, 'signed'::text, 'rejected'::text]))),
  CONSTRAINT issued_documents_status_check CHECK ((status = ANY (ARRAY['issued'::text, 'revoked'::text]))),
  CONSTRAINT issued_documents_validation_code_check CHECK (((char_length(validation_code) >= 8) AND (char_length(validation_code) <= 64))),
  CONSTRAINT issued_documents_pkey PRIMARY KEY (id),
  CONSTRAINT issued_documents_school_id_document_number_key UNIQUE (school_id, document_number),
  CONSTRAINT issued_documents_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT issued_documents_school_id_validation_code_key UNIQUE (school_id, validation_code)
);
ALTER TABLE public.issued_documents ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS issued_documents_school_student_idx ON public.issued_documents USING btree (school_id, student_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS issued_documents_student_idx ON public.issued_documents USING btree (student_id);

-- module_catalog
CREATE TABLE IF NOT EXISTS public.module_catalog (
  code text NOT NULL,
  name text NOT NULL,
  version text NOT NULL,
  manifest jsonb NOT NULL,
  is_essential boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT module_catalog_pkey PRIMARY KEY (code)
);
ALTER TABLE public.module_catalog ENABLE ROW LEVEL SECURITY;

-- notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  user_id uuid NOT NULL,
  channel text DEFAULT 'in_app'::text NOT NULL,
  event_type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  announcement_id uuid,
  status text DEFAULT 'delivered'::text NOT NULL,
  read_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT notifications_body_check CHECK (((char_length(btrim(body)) >= 1) AND (char_length(btrim(body)) <= 4000))),
  CONSTRAINT notifications_channel_check CHECK ((channel = ANY (ARRAY['in_app'::text, 'email'::text, 'sms'::text, 'whatsapp'::text]))),
  CONSTRAINT notifications_event_type_check CHECK (((char_length(btrim(event_type)) >= 3) AND (char_length(btrim(event_type)) <= 80))),
  CONSTRAINT notifications_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'delivered'::text, 'failed'::text, 'read'::text]))),
  CONSTRAINT notifications_title_check CHECK (((char_length(btrim(title)) >= 3) AND (char_length(btrim(title)) <= 160))),
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_school_id_id_key UNIQUE (school_id, id)
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS notifications_inbox_idx ON public.notifications USING btree (school_id, user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON public.notifications USING btree (school_id, user_id) WHERE ((status <> 'read'::text) AND (channel = 'in_app'::text));
CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications USING btree (user_id);

-- programs
CREATE TABLE IF NOT EXISTS public.programs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  academic_level_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  kind text DEFAULT 'general'::text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  grading_profile jsonb,
  CONSTRAINT programs_grading_profile_shape_valid CHECK (((grading_profile IS NULL) OR ((grading_profile ? 'scale'::text) AND (grading_profile ? 'components'::text) AND ((grading_profile ->> 'scale'::text) = ANY (ARRAY['20_ects'::text, 'gpa4'::text])) AND ((grading_profile ->> 'components'::text) = ANY (ARRAY['frequencia_exame'::text, 'so_exame'::text]))))),
  CONSTRAINT programs_kind_check CHECK ((kind = ANY (ARRAY['general'::text, 'technical'::text, 'professional'::text, 'undergraduate'::text, 'postgraduate'::text]))),
  CONSTRAINT programs_pkey PRIMARY KEY (id),
  CONSTRAINT programs_school_id_code_key UNIQUE (school_id, code),
  CONSTRAINT programs_school_id_id_key UNIQUE (school_id, id)
);
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS programs_school_level_idx ON public.programs USING btree (school_id, academic_level_id, is_active);

-- report_cards
CREATE TABLE IF NOT EXISTS public.report_cards (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  grade_sheet_id uuid NOT NULL,
  term_id uuid,
  academic_year_id uuid NOT NULL,
  status text DEFAULT 'draft'::text NOT NULL,
  averages jsonb DEFAULT '{}'::jsonb NOT NULL,
  issued_at timestamp with time zone,
  created_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT report_cards_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'issued'::text, 'revoked'::text]))),
  CONSTRAINT report_cards_pkey PRIMARY KEY (id),
  CONSTRAINT report_cards_school_id_enrollment_id_grade_sheet_id_key UNIQUE (school_id, enrollment_id, grade_sheet_id),
  CONSTRAINT report_cards_school_id_id_key UNIQUE (school_id, id)
);
ALTER TABLE public.report_cards ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS report_cards_enrollment_idx ON public.report_cards USING btree (enrollment_id);

-- school_integration_secrets
CREATE TABLE IF NOT EXISTS public.school_integration_secrets (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  provider text NOT NULL,
  secret_key text NOT NULL,
  secret_value text NOT NULL,
  expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT school_integration_secrets_pkey PRIMARY KEY (id),
  CONSTRAINT school_integration_secrets_unique UNIQUE (school_id, provider, secret_key)
);
ALTER TABLE public.school_integration_secrets ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_school_integration_secrets_school_provider ON public.school_integration_secrets USING btree (school_id, provider);

-- school_modules
CREATE TABLE IF NOT EXISTS public.school_modules (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  module_code text NOT NULL,
  installed_version text NOT NULL,
  status text NOT NULL,
  settings jsonb DEFAULT '{}'::jsonb NOT NULL,
  installed_by uuid NOT NULL,
  installed_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT school_modules_status_check CHECK ((status = ANY (ARRAY['installed'::text, 'active'::text, 'disabled'::text, 'update_available'::text, 'incompatible'::text, 'error'::text, 'archived'::text]))),
  CONSTRAINT school_modules_pkey PRIMARY KEY (id),
  CONSTRAINT school_modules_school_id_module_code_key UNIQUE (school_id, module_code)
);
ALTER TABLE public.school_modules ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS school_modules_school_status_idx ON public.school_modules USING btree (school_id, status);

-- siga_lesson_meetings
CREATE TABLE IF NOT EXISTS public.siga_lesson_meetings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  attendance_session_id uuid NOT NULL,
  provider text DEFAULT 'zoom'::text NOT NULL,
  external_meeting_id text NOT NULL,
  join_url text NOT NULL,
  topic text,
  starts_at timestamp with time zone,
  duration_minutes integer,
  status text DEFAULT 'active'::text NOT NULL,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT siga_lesson_meetings_duration_check CHECK (((duration_minutes IS NULL) OR (duration_minutes > 0))),
  CONSTRAINT siga_lesson_meetings_provider_check CHECK ((provider = 'zoom'::text)),
  CONSTRAINT siga_lesson_meetings_status_check CHECK ((status = ANY (ARRAY['active'::text, 'cancelled'::text, 'ended'::text]))),
  CONSTRAINT siga_lesson_meetings_pkey PRIMARY KEY (id),
  CONSTRAINT siga_lesson_meetings_unique_provider_meeting UNIQUE (provider, external_meeting_id),
  CONSTRAINT siga_lesson_meetings_unique_session_provider UNIQUE (attendance_session_id, provider)
);
ALTER TABLE public.siga_lesson_meetings ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_siga_lesson_meetings_school ON public.siga_lesson_meetings USING btree (school_id);
CREATE INDEX IF NOT EXISTS idx_siga_lesson_meetings_session ON public.siga_lesson_meetings USING btree (attendance_session_id);

-- student_status_events
CREATE TABLE IF NOT EXISTS public.student_status_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  student_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL,
  reason text,
  changed_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT student_status_events_pkey PRIMARY KEY (id)
);
ALTER TABLE public.student_status_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS student_status_events_student_idx ON public.student_status_events USING btree (school_id, student_id, created_at DESC);

-- teacher_subjects
CREATE TABLE IF NOT EXISTS public.teacher_subjects (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  teacher_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  valid_from date NOT NULL,
  valid_until date,
  created_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT teacher_subjects_check CHECK (((valid_until IS NULL) OR (valid_until >= valid_from))),
  CONSTRAINT teacher_subjects_pkey PRIMARY KEY (id),
  CONSTRAINT teacher_subjects_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT teacher_subjects_school_id_teacher_id_subject_id_valid_from_key UNIQUE (school_id, teacher_id, subject_id, valid_from)
);
ALTER TABLE public.teacher_subjects ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS teacher_subjects_active_uidx ON public.teacher_subjects USING btree (school_id, teacher_id, subject_id) WHERE (valid_until IS NULL);
CREATE INDEX IF NOT EXISTS teacher_subjects_school_subject_idx ON public.teacher_subjects USING btree (school_id, subject_id, valid_until);
CREATE INDEX IF NOT EXISTS teacher_subjects_school_teacher_idx ON public.teacher_subjects USING btree (school_id, teacher_id, valid_until);
CREATE INDEX IF NOT EXISTS teacher_subjects_subject_idx ON public.teacher_subjects USING btree (subject_id);
CREATE INDEX IF NOT EXISTS teacher_subjects_teacher_idx ON public.teacher_subjects USING btree (teacher_id);

-- teachers
CREATE TABLE IF NOT EXISTS public.teachers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  person_id uuid NOT NULL,
  employee_number text NOT NULL,
  hired_on date NOT NULL,
  employment_type text NOT NULL,
  highest_qualification text NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  user_id uuid,
  CONSTRAINT teachers_employee_number_check CHECK ((employee_number ~ '^DOC-[0-9]{6,}$'::text)),
  CONSTRAINT teachers_employment_type_check CHECK ((employment_type = ANY (ARRAY['permanent'::text, 'fixed_term'::text, 'part_time'::text, 'visiting'::text]))),
  CONSTRAINT teachers_highest_qualification_check CHECK ((highest_qualification = ANY (ARRAY['secondary'::text, 'bachelor'::text, 'licentiate'::text, 'master'::text, 'doctorate'::text, 'other'::text]))),
  CONSTRAINT teachers_status_check CHECK ((status = ANY (ARRAY['active'::text, 'leave'::text, 'inactive'::text, 'archived'::text]))),
  CONSTRAINT teachers_pkey PRIMARY KEY (id),
  CONSTRAINT teachers_school_id_employee_number_key UNIQUE (school_id, employee_number),
  CONSTRAINT teachers_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT teachers_school_id_person_id_key UNIQUE (school_id, person_id)
);
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS teachers_person_idx ON public.teachers USING btree (person_id);
CREATE INDEX IF NOT EXISTS teachers_school_person_idx ON public.teachers USING btree (school_id, person_id);
CREATE INDEX IF NOT EXISTS teachers_school_status_number_idx ON public.teachers USING btree (school_id, status, employee_number);

-- terms
CREATE TABLE IF NOT EXISTS public.terms (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  name text NOT NULL,
  sequence smallint NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  updated_by uuid,
  CONSTRAINT terms_check CHECK ((ends_on >= starts_on)),
  CONSTRAINT terms_sequence_check CHECK ((sequence > 0)),
  CONSTRAINT terms_pkey PRIMARY KEY (id),
  CONSTRAINT terms_school_id_academic_year_id_sequence_key UNIQUE (school_id, academic_year_id, sequence),
  CONSTRAINT terms_school_id_unique UNIQUE (school_id, id)
);
ALTER TABLE public.terms ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS terms_academic_year_idx ON public.terms USING btree (academic_year_id);
CREATE INDEX IF NOT EXISTS terms_school_year_idx ON public.terms USING btree (school_id, academic_year_id, sequence);

-- timetable_slots
CREATE TABLE IF NOT EXISTS public.timetable_slots (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  class_subject_id uuid NOT NULL,
  weekday smallint NOT NULL,
  starts_at time without time zone NOT NULL,
  ends_at time without time zone NOT NULL,
  room text NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_by uuid,
  schedule_id uuid,
  room_id uuid,
  shift_id uuid,
  day_period_number integer,
  notes text,
  CONSTRAINT timetable_slots_check CHECK ((ends_at > starts_at)),
  CONSTRAINT timetable_slots_room_check CHECK (((char_length(btrim(room)) >= 1) AND (char_length(btrim(room)) <= 80))),
  CONSTRAINT timetable_slots_status_check CHECK ((status = ANY (ARRAY['active'::text, 'cancelled'::text, 'archived'::text]))),
  CONSTRAINT timetable_slots_weekday_check CHECK (((weekday >= 1) AND (weekday <= 7))),
  CONSTRAINT timetable_slots_pkey PRIMARY KEY (id),
  CONSTRAINT timetable_slots_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT timetable_slots_school_slot_assignment_key UNIQUE (school_id, id, class_subject_id)
);
ALTER TABLE public.timetable_slots ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS timetable_slots_class_subject_idx ON public.timetable_slots USING btree (class_subject_id);
CREATE INDEX IF NOT EXISTS timetable_slots_room_idx ON public.timetable_slots USING btree (school_id, room_id) WHERE (room_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS timetable_slots_schedule_idx ON public.timetable_slots USING btree (school_id, schedule_id) WHERE (schedule_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS timetable_slots_school_day_time_idx ON public.timetable_slots USING btree (school_id, weekday, starts_at, ends_at) WHERE (status = 'active'::text);
CREATE INDEX IF NOT EXISTS timetable_slots_school_subject_day_idx ON public.timetable_slots USING btree (school_id, class_subject_id, weekday, starts_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. CHAVES ESTRANGEIRAS (adiadas — independentes da ordem das tabelas)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'academic_levels_school_id_fkey'
      AND conrelid = 'public.academic_levels'::regclass
  ) THEN
    ALTER TABLE public.academic_levels ADD CONSTRAINT academic_levels_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'announcements_class_fk'
      AND conrelid = 'public.announcements'::regclass
  ) THEN
    ALTER TABLE public.announcements ADD CONSTRAINT announcements_class_fk FOREIGN KEY (school_id, class_group_id) REFERENCES class_groups(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'announcements_created_by_fkey'
      AND conrelid = 'public.announcements'::regclass
  ) THEN
    ALTER TABLE public.announcements ADD CONSTRAINT announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'announcements_school_id_fkey'
      AND conrelid = 'public.announcements'::regclass
  ) THEN
    ALTER TABLE public.announcements ADD CONSTRAINT announcements_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'announcements_updated_by_fkey'
      AND conrelid = 'public.announcements'::regclass
  ) THEN
    ALTER TABLE public.announcements ADD CONSTRAINT announcements_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_records_recorded_by_fkey'
      AND conrelid = 'public.attendance_records'::regclass
  ) THEN
    ALTER TABLE public.attendance_records ADD CONSTRAINT attendance_records_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_records_roster_fkey'
      AND conrelid = 'public.attendance_records'::regclass
  ) THEN
    ALTER TABLE public.attendance_records ADD CONSTRAINT attendance_records_roster_fkey FOREIGN KEY (school_id, attendance_session_id, enrollment_id) REFERENCES attendance_session_roster(school_id, attendance_session_id, enrollment_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_records_school_id_attendance_session_id_fkey'
      AND conrelid = 'public.attendance_records'::regclass
  ) THEN
    ALTER TABLE public.attendance_records ADD CONSTRAINT attendance_records_school_id_attendance_session_id_fkey FOREIGN KEY (school_id, attendance_session_id) REFERENCES attendance_sessions(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_records_school_id_enrollment_id_fkey'
      AND conrelid = 'public.attendance_records'::regclass
  ) THEN
    ALTER TABLE public.attendance_records ADD CONSTRAINT attendance_records_school_id_enrollment_id_fkey FOREIGN KEY (school_id, enrollment_id) REFERENCES enrollments(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_records_school_id_fkey'
      AND conrelid = 'public.attendance_records'::regclass
  ) THEN
    ALTER TABLE public.attendance_records ADD CONSTRAINT attendance_records_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_session_roster_school_id_attendance_session_id_fkey'
      AND conrelid = 'public.attendance_session_roster'::regclass
  ) THEN
    ALTER TABLE public.attendance_session_roster ADD CONSTRAINT attendance_session_roster_school_id_attendance_session_id_fkey FOREIGN KEY (school_id, attendance_session_id) REFERENCES attendance_sessions(school_id, id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_session_roster_school_id_enrollment_id_fkey'
      AND conrelid = 'public.attendance_session_roster'::regclass
  ) THEN
    ALTER TABLE public.attendance_session_roster ADD CONSTRAINT attendance_session_roster_school_id_enrollment_id_fkey FOREIGN KEY (school_id, enrollment_id) REFERENCES enrollments(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_session_roster_school_id_fkey'
      AND conrelid = 'public.attendance_session_roster'::regclass
  ) THEN
    ALTER TABLE public.attendance_session_roster ADD CONSTRAINT attendance_session_roster_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_sessions_opened_by_fkey'
      AND conrelid = 'public.attendance_sessions'::regclass
  ) THEN
    ALTER TABLE public.attendance_sessions ADD CONSTRAINT attendance_sessions_opened_by_fkey FOREIGN KEY (opened_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_sessions_reopened_by_fkey'
      AND conrelid = 'public.attendance_sessions'::regclass
  ) THEN
    ALTER TABLE public.attendance_sessions ADD CONSTRAINT attendance_sessions_reopened_by_fkey FOREIGN KEY (reopened_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_sessions_school_id_class_subject_id_fkey'
      AND conrelid = 'public.attendance_sessions'::regclass
  ) THEN
    ALTER TABLE public.attendance_sessions ADD CONSTRAINT attendance_sessions_school_id_class_subject_id_fkey FOREIGN KEY (school_id, class_subject_id) REFERENCES class_subjects(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_sessions_school_id_fkey'
      AND conrelid = 'public.attendance_sessions'::regclass
  ) THEN
    ALTER TABLE public.attendance_sessions ADD CONSTRAINT attendance_sessions_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_sessions_school_id_timetable_slot_id_fkey'
      AND conrelid = 'public.attendance_sessions'::regclass
  ) THEN
    ALTER TABLE public.attendance_sessions ADD CONSTRAINT attendance_sessions_school_id_timetable_slot_id_fkey FOREIGN KEY (school_id, timetable_slot_id) REFERENCES timetable_slots(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_sessions_slot_assignment_fkey'
      AND conrelid = 'public.attendance_sessions'::regclass
  ) THEN
    ALTER TABLE public.attendance_sessions ADD CONSTRAINT attendance_sessions_slot_assignment_fkey FOREIGN KEY (school_id, timetable_slot_id, class_subject_id) REFERENCES timetable_slots(school_id, id, class_subject_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_sessions_submitted_by_fkey'
      AND conrelid = 'public.attendance_sessions'::regclass
  ) THEN
    ALTER TABLE public.attendance_sessions ADD CONSTRAINT attendance_sessions_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'campuses_school_id_fkey'
      AND conrelid = 'public.campuses'::regclass
  ) THEN
    ALTER TABLE public.campuses ADD CONSTRAINT campuses_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'class_subjects_created_by_fkey'
      AND conrelid = 'public.class_subjects'::regclass
  ) THEN
    ALTER TABLE public.class_subjects ADD CONSTRAINT class_subjects_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'class_subjects_school_id_class_group_id_fkey'
      AND conrelid = 'public.class_subjects'::regclass
  ) THEN
    ALTER TABLE public.class_subjects ADD CONSTRAINT class_subjects_school_id_class_group_id_fkey FOREIGN KEY (school_id, class_group_id) REFERENCES class_groups(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'class_subjects_school_id_fkey'
      AND conrelid = 'public.class_subjects'::regclass
  ) THEN
    ALTER TABLE public.class_subjects ADD CONSTRAINT class_subjects_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'class_subjects_school_id_subject_id_fkey'
      AND conrelid = 'public.class_subjects'::regclass
  ) THEN
    ALTER TABLE public.class_subjects ADD CONSTRAINT class_subjects_school_id_subject_id_fkey FOREIGN KEY (school_id, subject_id) REFERENCES subjects(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'class_subjects_school_id_teacher_id_fkey'
      AND conrelid = 'public.class_subjects'::regclass
  ) THEN
    ALTER TABLE public.class_subjects ADD CONSTRAINT class_subjects_school_id_teacher_id_fkey FOREIGN KEY (school_id, teacher_id) REFERENCES teachers(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'class_subjects_updated_by_fkey'
      AND conrelid = 'public.class_subjects'::regclass
  ) THEN
    ALTER TABLE public.class_subjects ADD CONSTRAINT class_subjects_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'document_sequences_school_id_fkey'
      AND conrelid = 'public.document_sequences'::regclass
  ) THEN
    ALTER TABLE public.document_sequences ADD CONSTRAINT document_sequences_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'document_signatures_acted_by_fkey'
      AND conrelid = 'public.document_signatures'::regclass
  ) THEN
    ALTER TABLE public.document_signatures ADD CONSTRAINT document_signatures_acted_by_fkey FOREIGN KEY (acted_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'document_signatures_requested_by_fkey'
      AND conrelid = 'public.document_signatures'::regclass
  ) THEN
    ALTER TABLE public.document_signatures ADD CONSTRAINT document_signatures_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'document_signatures_school_id_fkey'
      AND conrelid = 'public.document_signatures'::regclass
  ) THEN
    ALTER TABLE public.document_signatures ADD CONSTRAINT document_signatures_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'document_signatures_school_id_issued_document_id_fkey'
      AND conrelid = 'public.document_signatures'::regclass
  ) THEN
    ALTER TABLE public.document_signatures ADD CONSTRAINT document_signatures_school_id_issued_document_id_fkey FOREIGN KEY (school_id, issued_document_id) REFERENCES issued_documents(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fee_items_school_id_fee_plan_id_fkey'
      AND conrelid = 'public.fee_items'::regclass
  ) THEN
    ALTER TABLE public.fee_items ADD CONSTRAINT fee_items_school_id_fee_plan_id_fkey FOREIGN KEY (school_id, fee_plan_id) REFERENCES fee_plans(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fee_items_school_id_fkey'
      AND conrelid = 'public.fee_items'::regclass
  ) THEN
    ALTER TABLE public.fee_items ADD CONSTRAINT fee_items_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fee_plans_school_id_academic_year_id_fkey'
      AND conrelid = 'public.fee_plans'::regclass
  ) THEN
    ALTER TABLE public.fee_plans ADD CONSTRAINT fee_plans_school_id_academic_year_id_fkey FOREIGN KEY (school_id, academic_year_id) REFERENCES academic_years(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fee_plans_school_id_fkey'
      AND conrelid = 'public.fee_plans'::regclass
  ) THEN
    ALTER TABLE public.fee_plans ADD CONSTRAINT fee_plans_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'finance_contracts_created_by_fkey'
      AND conrelid = 'public.finance_contracts'::regclass
  ) THEN
    ALTER TABLE public.finance_contracts ADD CONSTRAINT finance_contracts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'finance_contracts_school_id_enrollment_id_fkey'
      AND conrelid = 'public.finance_contracts'::regclass
  ) THEN
    ALTER TABLE public.finance_contracts ADD CONSTRAINT finance_contracts_school_id_enrollment_id_fkey FOREIGN KEY (school_id, enrollment_id) REFERENCES enrollments(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'finance_contracts_school_id_fee_plan_id_fkey'
      AND conrelid = 'public.finance_contracts'::regclass
  ) THEN
    ALTER TABLE public.finance_contracts ADD CONSTRAINT finance_contracts_school_id_fee_plan_id_fkey FOREIGN KEY (school_id, fee_plan_id) REFERENCES fee_plans(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'finance_contracts_school_id_fkey'
      AND conrelid = 'public.finance_contracts'::regclass
  ) THEN
    ALTER TABLE public.finance_contracts ADD CONSTRAINT finance_contracts_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'finance_invoice_events_changed_by_fkey'
      AND conrelid = 'public.finance_invoice_events'::regclass
  ) THEN
    ALTER TABLE public.finance_invoice_events ADD CONSTRAINT finance_invoice_events_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'finance_invoice_events_invoice_id_fkey'
      AND conrelid = 'public.finance_invoice_events'::regclass
  ) THEN
    ALTER TABLE public.finance_invoice_events ADD CONSTRAINT finance_invoice_events_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES finance_invoices(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'finance_invoice_events_school_id_fkey'
      AND conrelid = 'public.finance_invoice_events'::regclass
  ) THEN
    ALTER TABLE public.finance_invoice_events ADD CONSTRAINT finance_invoice_events_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'finance_invoices_cancelled_by_fkey'
      AND conrelid = 'public.finance_invoices'::regclass
  ) THEN
    ALTER TABLE public.finance_invoices ADD CONSTRAINT finance_invoices_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'finance_invoices_issued_by_fkey'
      AND conrelid = 'public.finance_invoices'::regclass
  ) THEN
    ALTER TABLE public.finance_invoices ADD CONSTRAINT finance_invoices_issued_by_fkey FOREIGN KEY (issued_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'finance_invoices_school_id_contract_id_fkey'
      AND conrelid = 'public.finance_invoices'::regclass
  ) THEN
    ALTER TABLE public.finance_invoices ADD CONSTRAINT finance_invoices_school_id_contract_id_fkey FOREIGN KEY (school_id, contract_id) REFERENCES finance_contracts(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'finance_invoices_school_id_fee_item_id_fkey'
      AND conrelid = 'public.finance_invoices'::regclass
  ) THEN
    ALTER TABLE public.finance_invoices ADD CONSTRAINT finance_invoices_school_id_fee_item_id_fkey FOREIGN KEY (school_id, fee_item_id) REFERENCES fee_items(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'finance_invoices_school_id_fkey'
      AND conrelid = 'public.finance_invoices'::regclass
  ) THEN
    ALTER TABLE public.finance_invoices ADD CONSTRAINT finance_invoices_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'finance_receipts_received_by_fkey'
      AND conrelid = 'public.finance_receipts'::regclass
  ) THEN
    ALTER TABLE public.finance_receipts ADD CONSTRAINT finance_receipts_received_by_fkey FOREIGN KEY (received_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'finance_receipts_reversed_by_fkey'
      AND conrelid = 'public.finance_receipts'::regclass
  ) THEN
    ALTER TABLE public.finance_receipts ADD CONSTRAINT finance_receipts_reversed_by_fkey FOREIGN KEY (reversed_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'finance_receipts_school_id_fkey'
      AND conrelid = 'public.finance_receipts'::regclass
  ) THEN
    ALTER TABLE public.finance_receipts ADD CONSTRAINT finance_receipts_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'finance_receipts_school_id_invoice_id_fkey'
      AND conrelid = 'public.finance_receipts'::regclass
  ) THEN
    ALTER TABLE public.finance_receipts ADD CONSTRAINT finance_receipts_school_id_invoice_id_fkey FOREIGN KEY (school_id, invoice_id) REFERENCES finance_invoices(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'financial_rule_sets_created_by_fkey'
      AND conrelid = 'public.financial_rule_sets'::regclass
  ) THEN
    ALTER TABLE public.financial_rule_sets ADD CONSTRAINT financial_rule_sets_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'financial_rule_sets_school_id_fkey'
      AND conrelid = 'public.financial_rule_sets'::regclass
  ) THEN
    ALTER TABLE public.financial_rule_sets ADD CONSTRAINT financial_rule_sets_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'grade_items_created_by_fkey'
      AND conrelid = 'public.grade_items'::regclass
  ) THEN
    ALTER TABLE public.grade_items ADD CONSTRAINT grade_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'grade_items_school_id_fkey'
      AND conrelid = 'public.grade_items'::regclass
  ) THEN
    ALTER TABLE public.grade_items ADD CONSTRAINT grade_items_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'grade_items_school_id_gradebook_id_fkey'
      AND conrelid = 'public.grade_items'::regclass
  ) THEN
    ALTER TABLE public.grade_items ADD CONSTRAINT grade_items_school_id_gradebook_id_fkey FOREIGN KEY (school_id, gradebook_id) REFERENCES gradebooks(school_id, id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'grade_scores_pending_requested_by_fkey'
      AND conrelid = 'public.grade_scores'::regclass
  ) THEN
    ALTER TABLE public.grade_scores ADD CONSTRAINT grade_scores_pending_requested_by_fkey FOREIGN KEY (pending_requested_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'grade_scores_recorded_by_fkey'
      AND conrelid = 'public.grade_scores'::regclass
  ) THEN
    ALTER TABLE public.grade_scores ADD CONSTRAINT grade_scores_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'grade_scores_school_id_enrollment_id_fkey'
      AND conrelid = 'public.grade_scores'::regclass
  ) THEN
    ALTER TABLE public.grade_scores ADD CONSTRAINT grade_scores_school_id_enrollment_id_fkey FOREIGN KEY (school_id, enrollment_id) REFERENCES enrollments(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'grade_scores_school_id_fkey'
      AND conrelid = 'public.grade_scores'::regclass
  ) THEN
    ALTER TABLE public.grade_scores ADD CONSTRAINT grade_scores_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'grade_scores_school_id_grade_item_id_fkey'
      AND conrelid = 'public.grade_scores'::regclass
  ) THEN
    ALTER TABLE public.grade_scores ADD CONSTRAINT grade_scores_school_id_grade_item_id_fkey FOREIGN KEY (school_id, grade_item_id) REFERENCES grade_items(school_id, id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'grade_scores_updated_by_fkey'
      AND conrelid = 'public.grade_scores'::regclass
  ) THEN
    ALTER TABLE public.grade_scores ADD CONSTRAINT grade_scores_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'grade_sheet_rows_school_id_enrollment_id_fkey'
      AND conrelid = 'public.grade_sheet_rows'::regclass
  ) THEN
    ALTER TABLE public.grade_sheet_rows ADD CONSTRAINT grade_sheet_rows_school_id_enrollment_id_fkey FOREIGN KEY (school_id, enrollment_id) REFERENCES enrollments(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'grade_sheet_rows_school_id_fkey'
      AND conrelid = 'public.grade_sheet_rows'::regclass
  ) THEN
    ALTER TABLE public.grade_sheet_rows ADD CONSTRAINT grade_sheet_rows_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'grade_sheet_rows_school_id_grade_sheet_id_fkey'
      AND conrelid = 'public.grade_sheet_rows'::regclass
  ) THEN
    ALTER TABLE public.grade_sheet_rows ADD CONSTRAINT grade_sheet_rows_school_id_grade_sheet_id_fkey FOREIGN KEY (school_id, grade_sheet_id) REFERENCES grade_sheets(school_id, id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'grade_sheets_created_by_fkey'
      AND conrelid = 'public.grade_sheets'::regclass
  ) THEN
    ALTER TABLE public.grade_sheets ADD CONSTRAINT grade_sheets_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'grade_sheets_school_id_academic_year_id_fkey'
      AND conrelid = 'public.grade_sheets'::regclass
  ) THEN
    ALTER TABLE public.grade_sheets ADD CONSTRAINT grade_sheets_school_id_academic_year_id_fkey FOREIGN KEY (school_id, academic_year_id) REFERENCES academic_years(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'grade_sheets_school_id_class_group_id_fkey'
      AND conrelid = 'public.grade_sheets'::regclass
  ) THEN
    ALTER TABLE public.grade_sheets ADD CONSTRAINT grade_sheets_school_id_class_group_id_fkey FOREIGN KEY (school_id, class_group_id) REFERENCES class_groups(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'grade_sheets_school_id_fkey'
      AND conrelid = 'public.grade_sheets'::regclass
  ) THEN
    ALTER TABLE public.grade_sheets ADD CONSTRAINT grade_sheets_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'grade_sheets_school_id_term_id_fkey'
      AND conrelid = 'public.grade_sheets'::regclass
  ) THEN
    ALTER TABLE public.grade_sheets ADD CONSTRAINT grade_sheets_school_id_term_id_fkey FOREIGN KEY (school_id, term_id) REFERENCES terms(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'grade_sheets_updated_by_fkey'
      AND conrelid = 'public.grade_sheets'::regclass
  ) THEN
    ALTER TABLE public.grade_sheets ADD CONSTRAINT grade_sheets_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'gradebooks_created_by_fkey'
      AND conrelid = 'public.gradebooks'::regclass
  ) THEN
    ALTER TABLE public.gradebooks ADD CONSTRAINT gradebooks_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'gradebooks_school_id_academic_year_id_fkey'
      AND conrelid = 'public.gradebooks'::regclass
  ) THEN
    ALTER TABLE public.gradebooks ADD CONSTRAINT gradebooks_school_id_academic_year_id_fkey FOREIGN KEY (school_id, academic_year_id) REFERENCES academic_years(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'gradebooks_school_id_class_group_id_fkey'
      AND conrelid = 'public.gradebooks'::regclass
  ) THEN
    ALTER TABLE public.gradebooks ADD CONSTRAINT gradebooks_school_id_class_group_id_fkey FOREIGN KEY (school_id, class_group_id) REFERENCES class_groups(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'gradebooks_school_id_class_subject_id_fkey'
      AND conrelid = 'public.gradebooks'::regclass
  ) THEN
    ALTER TABLE public.gradebooks ADD CONSTRAINT gradebooks_school_id_class_subject_id_fkey FOREIGN KEY (school_id, class_subject_id) REFERENCES class_subjects(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'gradebooks_school_id_fkey'
      AND conrelid = 'public.gradebooks'::regclass
  ) THEN
    ALTER TABLE public.gradebooks ADD CONSTRAINT gradebooks_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'gradebooks_school_id_term_id_fkey'
      AND conrelid = 'public.gradebooks'::regclass
  ) THEN
    ALTER TABLE public.gradebooks ADD CONSTRAINT gradebooks_school_id_term_id_fkey FOREIGN KEY (school_id, term_id) REFERENCES terms(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'gradebooks_updated_by_fkey'
      AND conrelid = 'public.gradebooks'::regclass
  ) THEN
    ALTER TABLE public.gradebooks ADD CONSTRAINT gradebooks_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'grading_scales_school_id_fkey'
      AND conrelid = 'public.grading_scales'::regclass
  ) THEN
    ALTER TABLE public.grading_scales ADD CONSTRAINT grading_scales_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'issued_documents_archived_by_fkey'
      AND conrelid = 'public.issued_documents'::regclass
  ) THEN
    ALTER TABLE public.issued_documents ADD CONSTRAINT issued_documents_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'issued_documents_issued_by_fkey'
      AND conrelid = 'public.issued_documents'::regclass
  ) THEN
    ALTER TABLE public.issued_documents ADD CONSTRAINT issued_documents_issued_by_fkey FOREIGN KEY (issued_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'issued_documents_revoked_by_fkey'
      AND conrelid = 'public.issued_documents'::regclass
  ) THEN
    ALTER TABLE public.issued_documents ADD CONSTRAINT issued_documents_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'issued_documents_school_id_fkey'
      AND conrelid = 'public.issued_documents'::regclass
  ) THEN
    ALTER TABLE public.issued_documents ADD CONSTRAINT issued_documents_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'issued_documents_school_id_request_id_fkey'
      AND conrelid = 'public.issued_documents'::regclass
  ) THEN
    ALTER TABLE public.issued_documents ADD CONSTRAINT issued_documents_school_id_request_id_fkey FOREIGN KEY (school_id, request_id) REFERENCES document_requests(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'issued_documents_school_id_student_id_fkey'
      AND conrelid = 'public.issued_documents'::regclass
  ) THEN
    ALTER TABLE public.issued_documents ADD CONSTRAINT issued_documents_school_id_student_id_fkey FOREIGN KEY (school_id, student_id) REFERENCES students(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'issued_documents_school_id_template_id_fkey'
      AND conrelid = 'public.issued_documents'::regclass
  ) THEN
    ALTER TABLE public.issued_documents ADD CONSTRAINT issued_documents_school_id_template_id_fkey FOREIGN KEY (school_id, template_id) REFERENCES document_templates(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'issued_documents_signed_by_fkey'
      AND conrelid = 'public.issued_documents'::regclass
  ) THEN
    ALTER TABLE public.issued_documents ADD CONSTRAINT issued_documents_signed_by_fkey FOREIGN KEY (signed_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notifications_announcement_fk'
      AND conrelid = 'public.notifications'::regclass
  ) THEN
    ALTER TABLE public.notifications ADD CONSTRAINT notifications_announcement_fk FOREIGN KEY (school_id, announcement_id) REFERENCES announcements(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notifications_school_id_fkey'
      AND conrelid = 'public.notifications'::regclass
  ) THEN
    ALTER TABLE public.notifications ADD CONSTRAINT notifications_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notifications_user_id_fkey'
      AND conrelid = 'public.notifications'::regclass
  ) THEN
    ALTER TABLE public.notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'programs_school_id_academic_level_id_fkey'
      AND conrelid = 'public.programs'::regclass
  ) THEN
    ALTER TABLE public.programs ADD CONSTRAINT programs_school_id_academic_level_id_fkey FOREIGN KEY (school_id, academic_level_id) REFERENCES academic_levels(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'programs_school_id_fkey'
      AND conrelid = 'public.programs'::regclass
  ) THEN
    ALTER TABLE public.programs ADD CONSTRAINT programs_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'report_cards_created_by_fkey'
      AND conrelid = 'public.report_cards'::regclass
  ) THEN
    ALTER TABLE public.report_cards ADD CONSTRAINT report_cards_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'report_cards_school_id_academic_year_id_fkey'
      AND conrelid = 'public.report_cards'::regclass
  ) THEN
    ALTER TABLE public.report_cards ADD CONSTRAINT report_cards_school_id_academic_year_id_fkey FOREIGN KEY (school_id, academic_year_id) REFERENCES academic_years(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'report_cards_school_id_enrollment_id_fkey'
      AND conrelid = 'public.report_cards'::regclass
  ) THEN
    ALTER TABLE public.report_cards ADD CONSTRAINT report_cards_school_id_enrollment_id_fkey FOREIGN KEY (school_id, enrollment_id) REFERENCES enrollments(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'report_cards_school_id_fkey'
      AND conrelid = 'public.report_cards'::regclass
  ) THEN
    ALTER TABLE public.report_cards ADD CONSTRAINT report_cards_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'report_cards_school_id_grade_sheet_id_fkey'
      AND conrelid = 'public.report_cards'::regclass
  ) THEN
    ALTER TABLE public.report_cards ADD CONSTRAINT report_cards_school_id_grade_sheet_id_fkey FOREIGN KEY (school_id, grade_sheet_id) REFERENCES grade_sheets(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'report_cards_school_id_term_id_fkey'
      AND conrelid = 'public.report_cards'::regclass
  ) THEN
    ALTER TABLE public.report_cards ADD CONSTRAINT report_cards_school_id_term_id_fkey FOREIGN KEY (school_id, term_id) REFERENCES terms(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'school_integration_secrets_school_id_fkey'
      AND conrelid = 'public.school_integration_secrets'::regclass
  ) THEN
    ALTER TABLE public.school_integration_secrets ADD CONSTRAINT school_integration_secrets_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'school_modules_installed_by_fkey'
      AND conrelid = 'public.school_modules'::regclass
  ) THEN
    ALTER TABLE public.school_modules ADD CONSTRAINT school_modules_installed_by_fkey FOREIGN KEY (installed_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'school_modules_module_code_fkey'
      AND conrelid = 'public.school_modules'::regclass
  ) THEN
    ALTER TABLE public.school_modules ADD CONSTRAINT school_modules_module_code_fkey FOREIGN KEY (module_code) REFERENCES module_catalog(code);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'school_modules_school_id_fkey'
      AND conrelid = 'public.school_modules'::regclass
  ) THEN
    ALTER TABLE public.school_modules ADD CONSTRAINT school_modules_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_lesson_meetings_attendance_session_id_fkey'
      AND conrelid = 'public.siga_lesson_meetings'::regclass
  ) THEN
    ALTER TABLE public.siga_lesson_meetings ADD CONSTRAINT siga_lesson_meetings_attendance_session_id_fkey FOREIGN KEY (attendance_session_id) REFERENCES siga_attendance_sessions(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_lesson_meetings_school_id_fkey'
      AND conrelid = 'public.siga_lesson_meetings'::regclass
  ) THEN
    ALTER TABLE public.siga_lesson_meetings ADD CONSTRAINT siga_lesson_meetings_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'student_status_events_changed_by_fkey'
      AND conrelid = 'public.student_status_events'::regclass
  ) THEN
    ALTER TABLE public.student_status_events ADD CONSTRAINT student_status_events_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'student_status_events_school_id_fkey'
      AND conrelid = 'public.student_status_events'::regclass
  ) THEN
    ALTER TABLE public.student_status_events ADD CONSTRAINT student_status_events_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'student_status_events_student_id_fkey'
      AND conrelid = 'public.student_status_events'::regclass
  ) THEN
    ALTER TABLE public.student_status_events ADD CONSTRAINT student_status_events_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'teacher_subjects_created_by_fkey'
      AND conrelid = 'public.teacher_subjects'::regclass
  ) THEN
    ALTER TABLE public.teacher_subjects ADD CONSTRAINT teacher_subjects_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'teacher_subjects_school_id_fkey'
      AND conrelid = 'public.teacher_subjects'::regclass
  ) THEN
    ALTER TABLE public.teacher_subjects ADD CONSTRAINT teacher_subjects_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'teacher_subjects_school_id_subject_id_fkey'
      AND conrelid = 'public.teacher_subjects'::regclass
  ) THEN
    ALTER TABLE public.teacher_subjects ADD CONSTRAINT teacher_subjects_school_id_subject_id_fkey FOREIGN KEY (school_id, subject_id) REFERENCES subjects(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'teacher_subjects_school_id_teacher_id_fkey'
      AND conrelid = 'public.teacher_subjects'::regclass
  ) THEN
    ALTER TABLE public.teacher_subjects ADD CONSTRAINT teacher_subjects_school_id_teacher_id_fkey FOREIGN KEY (school_id, teacher_id) REFERENCES teachers(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'teachers_created_by_fkey'
      AND conrelid = 'public.teachers'::regclass
  ) THEN
    ALTER TABLE public.teachers ADD CONSTRAINT teachers_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'teachers_school_id_fkey'
      AND conrelid = 'public.teachers'::regclass
  ) THEN
    ALTER TABLE public.teachers ADD CONSTRAINT teachers_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'teachers_school_id_person_id_fkey'
      AND conrelid = 'public.teachers'::regclass
  ) THEN
    ALTER TABLE public.teachers ADD CONSTRAINT teachers_school_id_person_id_fkey FOREIGN KEY (school_id, person_id) REFERENCES people(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'teachers_updated_by_fkey'
      AND conrelid = 'public.teachers'::regclass
  ) THEN
    ALTER TABLE public.teachers ADD CONSTRAINT teachers_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'teachers_user_id_fkey'
      AND conrelid = 'public.teachers'::regclass
  ) THEN
    ALTER TABLE public.teachers ADD CONSTRAINT teachers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'terms_created_by_fkey'
      AND conrelid = 'public.terms'::regclass
  ) THEN
    ALTER TABLE public.terms ADD CONSTRAINT terms_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'terms_school_id_academic_year_id_fkey'
      AND conrelid = 'public.terms'::regclass
  ) THEN
    ALTER TABLE public.terms ADD CONSTRAINT terms_school_id_academic_year_id_fkey FOREIGN KEY (school_id, academic_year_id) REFERENCES academic_years(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'terms_school_id_fkey'
      AND conrelid = 'public.terms'::regclass
  ) THEN
    ALTER TABLE public.terms ADD CONSTRAINT terms_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'terms_updated_by_fkey'
      AND conrelid = 'public.terms'::regclass
  ) THEN
    ALTER TABLE public.terms ADD CONSTRAINT terms_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'timetable_slots_created_by_fkey'
      AND conrelid = 'public.timetable_slots'::regclass
  ) THEN
    ALTER TABLE public.timetable_slots ADD CONSTRAINT timetable_slots_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'timetable_slots_room_id_fkey'
      AND conrelid = 'public.timetable_slots'::regclass
  ) THEN
    ALTER TABLE public.timetable_slots ADD CONSTRAINT timetable_slots_room_id_fkey FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'timetable_slots_schedule_id_fkey'
      AND conrelid = 'public.timetable_slots'::regclass
  ) THEN
    ALTER TABLE public.timetable_slots ADD CONSTRAINT timetable_slots_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES academic_schedules(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'timetable_slots_school_id_class_subject_id_fkey'
      AND conrelid = 'public.timetable_slots'::regclass
  ) THEN
    ALTER TABLE public.timetable_slots ADD CONSTRAINT timetable_slots_school_id_class_subject_id_fkey FOREIGN KEY (school_id, class_subject_id) REFERENCES class_subjects(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'timetable_slots_school_id_fkey'
      AND conrelid = 'public.timetable_slots'::regclass
  ) THEN
    ALTER TABLE public.timetable_slots ADD CONSTRAINT timetable_slots_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'timetable_slots_shift_id_fkey'
      AND conrelid = 'public.timetable_slots'::regclass
  ) THEN
    ALTER TABLE public.timetable_slots ADD CONSTRAINT timetable_slots_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES school_shifts(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'timetable_slots_updated_by_fkey'
      AND conrelid = 'public.timetable_slots'::regclass
  ) THEN
    ALTER TABLE public.timetable_slots ADD CONSTRAINT timetable_slots_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
  END IF;
END $$;
