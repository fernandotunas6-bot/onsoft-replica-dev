-- Migration: 20260927070051_capture_undeclared_production_tables
-- Objetivo: Declarar em versionamento as 7 tabelas que existiam na base ao
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
-- Gerado em 2026-09-27T07:00:51.866Z

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. TABELAS, RESTRIÇÕES EM LINHA E ÍNDICES
-- ═══════════════════════════════════════════════════════════════════════════

-- grade_score_history
CREATE TABLE IF NOT EXISTS public.grade_score_history (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  grade_score_id uuid NOT NULL,
  previous_score numeric,
  new_score numeric,
  reason text,
  actor_user_id uuid,
  approved_by uuid,
  kind text DEFAULT 'change'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT grade_score_history_kind_check CHECK ((kind = ANY (ARRAY['launch'::text, 'change'::text, 'request_approved'::text, 'request_rejected'::text]))),
  CONSTRAINT grade_score_history_reason_check CHECK (((reason IS NULL) OR (char_length(reason) <= 1000))),
  CONSTRAINT grade_score_history_pkey PRIMARY KEY (id)
);
ALTER TABLE public.grade_score_history ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS grade_score_history_score_idx ON public.grade_score_history USING btree (school_id, grade_score_id, created_at DESC);

-- siga_class_tasks
CREATE TABLE IF NOT EXISTS public.siga_class_tasks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  class_subject_id uuid NOT NULL,
  timetable_slot_id uuid,
  kind text DEFAULT 'tpc'::text NOT NULL,
  title text NOT NULL,
  description text,
  due_on date,
  status text DEFAULT 'published'::text NOT NULL,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT siga_class_tasks_description_check CHECK (((description IS NULL) OR (char_length(description) <= 2000))),
  CONSTRAINT siga_class_tasks_kind_check CHECK ((kind = ANY (ARRAY['tpc'::text, 'trabalho'::text, 'leitura'::text, 'projecto'::text, 'pesquisa'::text, 'outra'::text]))),
  CONSTRAINT siga_class_tasks_status_check CHECK ((status = ANY (ARRAY['published'::text, 'archived'::text]))),
  CONSTRAINT siga_class_tasks_title_check CHECK (((char_length(title) >= 2) AND (char_length(title) <= 160))),
  CONSTRAINT siga_class_tasks_pkey PRIMARY KEY (id)
);
ALTER TABLE public.siga_class_tasks ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS siga_class_tasks_class_subject_idx ON public.siga_class_tasks USING btree (school_id, class_subject_id, due_on);

-- siga_exam_registrations — Inscrições em exame por matrícula e disciplina, com média de origem, nota e média final. Só o servidor.
CREATE TABLE IF NOT EXISTS public.siga_exam_registrations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  session_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  class_group_id uuid NOT NULL,
  grade_sheet_id uuid,
  original_average numeric(6,2),
  exam_date date,
  room text,
  jury text,
  score numeric(6,2),
  final_average numeric(6,2),
  status text DEFAULT 'registered'::text NOT NULL,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT siga_exam_registrations_graded_check CHECK (((status <> 'graded'::text) OR ((score IS NOT NULL) AND (final_average IS NOT NULL)))),
  CONSTRAINT siga_exam_registrations_jury_check CHECK (((jury IS NULL) OR (char_length(jury) <= 300))),
  CONSTRAINT siga_exam_registrations_notes_check CHECK (((notes IS NULL) OR (char_length(notes) <= 1000))),
  CONSTRAINT siga_exam_registrations_room_check CHECK (((room IS NULL) OR (char_length(room) <= 80))),
  CONSTRAINT siga_exam_registrations_status_check CHECK ((status = ANY (ARRAY['registered'::text, 'absent'::text, 'graded'::text, 'cancelled'::text]))),
  CONSTRAINT siga_exam_registrations_pkey PRIMARY KEY (id),
  CONSTRAINT siga_exam_registrations_unique UNIQUE (session_id, enrollment_id, subject_id)
);
ALTER TABLE public.siga_exam_registrations ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS siga_exam_registrations_class_group_idx ON public.siga_exam_registrations USING btree (class_group_id);
CREATE INDEX IF NOT EXISTS siga_exam_registrations_enrollment_idx ON public.siga_exam_registrations USING btree (enrollment_id);
CREATE INDEX IF NOT EXISTS siga_exam_registrations_grade_sheet_idx ON public.siga_exam_registrations USING btree (grade_sheet_id);
CREATE INDEX IF NOT EXISTS siga_exam_registrations_school_idx ON public.siga_exam_registrations USING btree (school_id);
CREATE INDEX IF NOT EXISTS siga_exam_registrations_session_class_idx ON public.siga_exam_registrations USING btree (session_id, class_group_id);
CREATE INDEX IF NOT EXISTS siga_exam_registrations_subject_idx ON public.siga_exam_registrations USING btree (subject_id);

-- siga_exam_sessions — Épocas de exame (recurso, especial, final, melhoria) por ano lectivo. Só o servidor.
CREATE TABLE IF NOT EXISTS public.siga_exam_sessions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  kind text NOT NULL,
  name text NOT NULL,
  starts_on date,
  ends_on date,
  max_failed_subjects integer,
  result_method text DEFAULT 'replace'::text NOT NULL,
  status text DEFAULT 'draft'::text NOT NULL,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT siga_exam_sessions_dates_check CHECK (((starts_on IS NULL) OR (ends_on IS NULL) OR (ends_on >= starts_on))),
  CONSTRAINT siga_exam_sessions_kind_check CHECK ((kind = ANY (ARRAY['recurso'::text, 'exame_especial'::text, 'exame_final'::text, 'melhoria'::text]))),
  CONSTRAINT siga_exam_sessions_max_failed_subjects_check CHECK (((max_failed_subjects IS NULL) OR ((max_failed_subjects >= 1) AND (max_failed_subjects <= 30)))),
  CONSTRAINT siga_exam_sessions_name_check CHECK (((char_length(name) >= 2) AND (char_length(name) <= 120))),
  CONSTRAINT siga_exam_sessions_result_method_check CHECK ((result_method = ANY (ARRAY['replace'::text, 'average'::text, 'max'::text]))),
  CONSTRAINT siga_exam_sessions_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'open'::text, 'closed'::text]))),
  CONSTRAINT siga_exam_sessions_pkey PRIMARY KEY (id)
);
ALTER TABLE public.siga_exam_sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS siga_exam_sessions_school_year_idx ON public.siga_exam_sessions USING btree (school_id, academic_year_id, created_at DESC);
CREATE INDEX IF NOT EXISTS siga_exam_sessions_year_idx ON public.siga_exam_sessions USING btree (academic_year_id);

-- siga_lesson_reminder_log
CREATE TABLE IF NOT EXISTS public.siga_lesson_reminder_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  user_id uuid NOT NULL,
  lesson_date date NOT NULL,
  channel text NOT NULL,
  lessons_count integer DEFAULT 0 NOT NULL,
  status text DEFAULT 'sent'::text NOT NULL,
  error text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT siga_lesson_reminder_log_channel_check CHECK ((channel = ANY (ARRAY['in_app'::text, 'email'::text, 'sms'::text]))),
  CONSTRAINT siga_lesson_reminder_log_status_check CHECK ((status = ANY (ARRAY['sent'::text, 'failed'::text, 'skipped'::text]))),
  CONSTRAINT siga_lesson_reminder_log_pkey PRIMARY KEY (id)
);
ALTER TABLE public.siga_lesson_reminder_log ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS siga_lesson_reminder_log_once_idx ON public.siga_lesson_reminder_log USING btree (school_id, user_id, lesson_date, channel);

-- siga_lesson_reminder_settings
CREATE TABLE IF NOT EXISTS public.siga_lesson_reminder_settings (
  school_id uuid NOT NULL,
  enabled boolean DEFAULT false NOT NULL,
  send_hour smallint DEFAULT 18 NOT NULL,
  notify_teachers boolean DEFAULT true NOT NULL,
  notify_students boolean DEFAULT true NOT NULL,
  notify_guardians boolean DEFAULT false NOT NULL,
  channel_in_app boolean DEFAULT true NOT NULL,
  channel_email boolean DEFAULT false NOT NULL,
  channel_sms boolean DEFAULT false NOT NULL,
  notify_on_publish boolean DEFAULT true NOT NULL,
  updated_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT siga_lesson_reminder_settings_send_hour_check CHECK (((send_hour >= 0) AND (send_hour <= 23))),
  CONSTRAINT siga_lesson_reminder_settings_pkey PRIMARY KEY (school_id)
);
ALTER TABLE public.siga_lesson_reminder_settings ENABLE ROW LEVEL SECURITY;

-- siga_timetable_slot_details
CREATE TABLE IF NOT EXISTS public.siga_timetable_slot_details (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  timetable_slot_id uuid NOT NULL,
  lesson_type text DEFAULT 'teorica'::text NOT NULL,
  delivery_mode text DEFAULT 'presencial'::text NOT NULL,
  online_url text,
  topic text,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT siga_timetable_slot_details_delivery_mode_check CHECK ((delivery_mode = ANY (ARRAY['presencial'::text, 'zoom'::text, 'online'::text, 'hibrido'::text]))),
  CONSTRAINT siga_timetable_slot_details_lesson_type_check CHECK ((lesson_type = ANY (ARRAY['teorica'::text, 'pratica'::text, 'laboratorio'::text, 'revisao'::text, 'avaliacao'::text, 'outra'::text]))),
  CONSTRAINT siga_timetable_slot_details_notes_check CHECK (((notes IS NULL) OR (char_length(notes) <= 1000))),
  CONSTRAINT siga_timetable_slot_details_online_url_check CHECK (((online_url IS NULL) OR ((char_length(online_url) <= 500) AND (online_url ~* '^https://'::text)))),
  CONSTRAINT siga_timetable_slot_details_topic_check CHECK (((topic IS NULL) OR (char_length(topic) <= 200))),
  CONSTRAINT siga_timetable_slot_details_pkey PRIMARY KEY (id)
);
ALTER TABLE public.siga_timetable_slot_details ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS siga_timetable_slot_details_school_idx ON public.siga_timetable_slot_details USING btree (school_id);
CREATE UNIQUE INDEX IF NOT EXISTS siga_timetable_slot_details_slot_idx ON public.siga_timetable_slot_details USING btree (timetable_slot_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. CHAVES ESTRANGEIRAS (adiadas — independentes da ordem das tabelas)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'grade_score_history_actor_user_id_fkey'
      AND conrelid = 'public.grade_score_history'::regclass
  ) THEN
    ALTER TABLE public.grade_score_history ADD CONSTRAINT grade_score_history_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'grade_score_history_approved_by_fkey'
      AND conrelid = 'public.grade_score_history'::regclass
  ) THEN
    ALTER TABLE public.grade_score_history ADD CONSTRAINT grade_score_history_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'grade_score_history_grade_score_id_fkey'
      AND conrelid = 'public.grade_score_history'::regclass
  ) THEN
    ALTER TABLE public.grade_score_history ADD CONSTRAINT grade_score_history_grade_score_id_fkey FOREIGN KEY (grade_score_id) REFERENCES grade_scores(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'grade_score_history_school_id_fkey'
      AND conrelid = 'public.grade_score_history'::regclass
  ) THEN
    ALTER TABLE public.grade_score_history ADD CONSTRAINT grade_score_history_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_class_tasks_class_subject_id_fkey'
      AND conrelid = 'public.siga_class_tasks'::regclass
  ) THEN
    ALTER TABLE public.siga_class_tasks ADD CONSTRAINT siga_class_tasks_class_subject_id_fkey FOREIGN KEY (class_subject_id) REFERENCES class_subjects(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_class_tasks_created_by_fkey'
      AND conrelid = 'public.siga_class_tasks'::regclass
  ) THEN
    ALTER TABLE public.siga_class_tasks ADD CONSTRAINT siga_class_tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_class_tasks_school_id_fkey'
      AND conrelid = 'public.siga_class_tasks'::regclass
  ) THEN
    ALTER TABLE public.siga_class_tasks ADD CONSTRAINT siga_class_tasks_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_class_tasks_timetable_slot_id_fkey'
      AND conrelid = 'public.siga_class_tasks'::regclass
  ) THEN
    ALTER TABLE public.siga_class_tasks ADD CONSTRAINT siga_class_tasks_timetable_slot_id_fkey FOREIGN KEY (timetable_slot_id) REFERENCES timetable_slots(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_class_tasks_updated_by_fkey'
      AND conrelid = 'public.siga_class_tasks'::regclass
  ) THEN
    ALTER TABLE public.siga_class_tasks ADD CONSTRAINT siga_class_tasks_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_exam_registrations_class_group_id_fkey'
      AND conrelid = 'public.siga_exam_registrations'::regclass
  ) THEN
    ALTER TABLE public.siga_exam_registrations ADD CONSTRAINT siga_exam_registrations_class_group_id_fkey FOREIGN KEY (class_group_id) REFERENCES class_groups(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_exam_registrations_enrollment_id_fkey'
      AND conrelid = 'public.siga_exam_registrations'::regclass
  ) THEN
    ALTER TABLE public.siga_exam_registrations ADD CONSTRAINT siga_exam_registrations_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_exam_registrations_grade_sheet_id_fkey'
      AND conrelid = 'public.siga_exam_registrations'::regclass
  ) THEN
    ALTER TABLE public.siga_exam_registrations ADD CONSTRAINT siga_exam_registrations_grade_sheet_id_fkey FOREIGN KEY (grade_sheet_id) REFERENCES grade_sheets(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_exam_registrations_school_id_fkey'
      AND conrelid = 'public.siga_exam_registrations'::regclass
  ) THEN
    ALTER TABLE public.siga_exam_registrations ADD CONSTRAINT siga_exam_registrations_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_exam_registrations_session_id_fkey'
      AND conrelid = 'public.siga_exam_registrations'::regclass
  ) THEN
    ALTER TABLE public.siga_exam_registrations ADD CONSTRAINT siga_exam_registrations_session_id_fkey FOREIGN KEY (session_id) REFERENCES siga_exam_sessions(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_exam_registrations_subject_id_fkey'
      AND conrelid = 'public.siga_exam_registrations'::regclass
  ) THEN
    ALTER TABLE public.siga_exam_registrations ADD CONSTRAINT siga_exam_registrations_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_exam_sessions_academic_year_id_fkey'
      AND conrelid = 'public.siga_exam_sessions'::regclass
  ) THEN
    ALTER TABLE public.siga_exam_sessions ADD CONSTRAINT siga_exam_sessions_academic_year_id_fkey FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_exam_sessions_school_id_fkey'
      AND conrelid = 'public.siga_exam_sessions'::regclass
  ) THEN
    ALTER TABLE public.siga_exam_sessions ADD CONSTRAINT siga_exam_sessions_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_lesson_reminder_log_school_id_fkey'
      AND conrelid = 'public.siga_lesson_reminder_log'::regclass
  ) THEN
    ALTER TABLE public.siga_lesson_reminder_log ADD CONSTRAINT siga_lesson_reminder_log_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_lesson_reminder_log_user_id_fkey'
      AND conrelid = 'public.siga_lesson_reminder_log'::regclass
  ) THEN
    ALTER TABLE public.siga_lesson_reminder_log ADD CONSTRAINT siga_lesson_reminder_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_lesson_reminder_settings_school_id_fkey'
      AND conrelid = 'public.siga_lesson_reminder_settings'::regclass
  ) THEN
    ALTER TABLE public.siga_lesson_reminder_settings ADD CONSTRAINT siga_lesson_reminder_settings_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_lesson_reminder_settings_updated_by_fkey'
      AND conrelid = 'public.siga_lesson_reminder_settings'::regclass
  ) THEN
    ALTER TABLE public.siga_lesson_reminder_settings ADD CONSTRAINT siga_lesson_reminder_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_timetable_slot_details_created_by_fkey'
      AND conrelid = 'public.siga_timetable_slot_details'::regclass
  ) THEN
    ALTER TABLE public.siga_timetable_slot_details ADD CONSTRAINT siga_timetable_slot_details_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_timetable_slot_details_school_id_fkey'
      AND conrelid = 'public.siga_timetable_slot_details'::regclass
  ) THEN
    ALTER TABLE public.siga_timetable_slot_details ADD CONSTRAINT siga_timetable_slot_details_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_timetable_slot_details_timetable_slot_id_fkey'
      AND conrelid = 'public.siga_timetable_slot_details'::regclass
  ) THEN
    ALTER TABLE public.siga_timetable_slot_details ADD CONSTRAINT siga_timetable_slot_details_timetable_slot_id_fkey FOREIGN KEY (timetable_slot_id) REFERENCES timetable_slots(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_timetable_slot_details_updated_by_fkey'
      AND conrelid = 'public.siga_timetable_slot_details'::regclass
  ) THEN
    ALTER TABLE public.siga_timetable_slot_details ADD CONSTRAINT siga_timetable_slot_details_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;
