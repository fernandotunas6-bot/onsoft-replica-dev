-- Horários: detalhes da aula, tarefas da turma e lembretes da véspera (2026-09-26).
--
-- Aditiva: não altera tabelas existentes. Quatro tabelas só do servidor
-- (FORCE RLS + REVOKE a anon/authenticated, sem políticas): a autorização é
-- feita em src/features/academic/timetable-lessons.ts (professor da disciplina,
-- Administrador ou Secretaria para escrever; aluno/encarregado só lêem os da
-- sua turma, pelo servidor).
--
-- Idempotente: pode correr mais do que uma vez.

-- ── 1. Detalhes de cada bloco do horário ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.siga_timetable_slot_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  timetable_slot_id uuid NOT NULL REFERENCES public.timetable_slots(id) ON DELETE CASCADE,
  lesson_type text NOT NULL DEFAULT 'teorica' CHECK (
    lesson_type IN ('teorica', 'pratica', 'laboratorio', 'revisao', 'avaliacao', 'outra')
  ),
  delivery_mode text NOT NULL DEFAULT 'presencial' CHECK (
    delivery_mode IN ('presencial', 'zoom', 'online', 'hibrido')
  ),
  online_url text CHECK (online_url IS NULL OR (char_length(online_url) <= 500 AND online_url ~* '^https://')),
  topic text CHECK (topic IS NULL OR char_length(topic) <= 200),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 1000),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS siga_timetable_slot_details_slot_idx
  ON public.siga_timetable_slot_details (timetable_slot_id);
CREATE INDEX IF NOT EXISTS siga_timetable_slot_details_school_idx
  ON public.siga_timetable_slot_details (school_id);

-- ── 2. Tarefas da turma (TPC, trabalhos, leituras) ────────────────────────
CREATE TABLE IF NOT EXISTS public.siga_class_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_subject_id uuid NOT NULL REFERENCES public.class_subjects(id) ON DELETE CASCADE,
  timetable_slot_id uuid REFERENCES public.timetable_slots(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'tpc' CHECK (
    kind IN ('tpc', 'trabalho', 'leitura', 'projecto', 'pesquisa', 'outra')
  ),
  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 160),
  description text CHECK (description IS NULL OR char_length(description) <= 2000),
  due_on date,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'archived')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS siga_class_tasks_class_subject_idx
  ON public.siga_class_tasks (school_id, class_subject_id, due_on);

-- ── 3. Configuração dos lembretes da véspera (uma por escola) ─────────────
CREATE TABLE IF NOT EXISTS public.siga_lesson_reminder_settings (
  school_id uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  -- Hora local (Luanda) a que sai o lembrete do dia seguinte.
  send_hour smallint NOT NULL DEFAULT 18 CHECK (send_hour BETWEEN 0 AND 23),
  notify_teachers boolean NOT NULL DEFAULT true,
  notify_students boolean NOT NULL DEFAULT true,
  notify_guardians boolean NOT NULL DEFAULT false,
  channel_in_app boolean NOT NULL DEFAULT true,
  channel_email boolean NOT NULL DEFAULT false,
  channel_sms boolean NOT NULL DEFAULT false,
  -- Na publicação de um horário, avisar professores e alunos da turma.
  notify_on_publish boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── 4. Registo de envios (nunca duplicar o mesmo lembrete) ────────────────
CREATE TABLE IF NOT EXISTS public.siga_lesson_reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_date date NOT NULL,
  channel text NOT NULL CHECK (channel IN ('in_app', 'email', 'sms')),
  lessons_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'skipped')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS siga_lesson_reminder_log_once_idx
  ON public.siga_lesson_reminder_log (school_id, user_id, lesson_date, channel);

-- ── updated_at ────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS siga_timetable_slot_details_touch ON public.siga_timetable_slot_details;
CREATE TRIGGER siga_timetable_slot_details_touch
  BEFORE UPDATE ON public.siga_timetable_slot_details
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

DROP TRIGGER IF EXISTS siga_class_tasks_touch ON public.siga_class_tasks;
CREATE TRIGGER siga_class_tasks_touch
  BEFORE UPDATE ON public.siga_class_tasks
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

DROP TRIGGER IF EXISTS siga_lesson_reminder_settings_touch ON public.siga_lesson_reminder_settings;
CREATE TRIGGER siga_lesson_reminder_settings_touch
  BEFORE UPDATE ON public.siga_lesson_reminder_settings
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

-- ── Só o servidor ─────────────────────────────────────────────────────────
ALTER TABLE public.siga_timetable_slot_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_timetable_slot_details FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siga_timetable_slot_details FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.siga_timetable_slot_details TO service_role;

ALTER TABLE public.siga_class_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_class_tasks FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siga_class_tasks FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.siga_class_tasks TO service_role;

ALTER TABLE public.siga_lesson_reminder_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_lesson_reminder_settings FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siga_lesson_reminder_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.siga_lesson_reminder_settings TO service_role;

ALTER TABLE public.siga_lesson_reminder_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_lesson_reminder_log FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siga_lesson_reminder_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.siga_lesson_reminder_log TO service_role;
