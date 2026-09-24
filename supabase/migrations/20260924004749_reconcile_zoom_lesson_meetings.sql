-- Reconciliation: canonical Zoom lesson meetings schema.
-- This migration is intentionally idempotent so a fresh database can reproduce
-- the live SGA Zoom boundary without replacing or destructuring existing data.
-- Zoom is attached to an attendance session, never to the lesson title.

CREATE TABLE IF NOT EXISTS public.siga_lesson_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  attendance_session_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'zoom',
  external_meeting_id text NOT NULL,
  join_url text NOT NULL,
  topic text,
  starts_at timestamptz,
  duration_minutes integer,
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'siga_lesson_meetings_school_id_fkey'
      AND conrelid = 'public.siga_lesson_meetings'::regclass
  ) THEN
    ALTER TABLE public.siga_lesson_meetings
      ADD CONSTRAINT siga_lesson_meetings_school_id_fkey
      FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'siga_lesson_meetings_attendance_session_id_fkey'
      AND conrelid = 'public.siga_lesson_meetings'::regclass
  ) THEN
    ALTER TABLE public.siga_lesson_meetings
      ADD CONSTRAINT siga_lesson_meetings_attendance_session_id_fkey
      FOREIGN KEY (attendance_session_id) REFERENCES public.siga_attendance_sessions(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'siga_lesson_meetings_duration_check'
      AND conrelid = 'public.siga_lesson_meetings'::regclass
  ) THEN
    ALTER TABLE public.siga_lesson_meetings
      ADD CONSTRAINT siga_lesson_meetings_duration_check
      CHECK (duration_minutes IS NULL OR duration_minutes > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'siga_lesson_meetings_provider_check'
      AND conrelid = 'public.siga_lesson_meetings'::regclass
  ) THEN
    ALTER TABLE public.siga_lesson_meetings
      ADD CONSTRAINT siga_lesson_meetings_provider_check
      CHECK (provider = 'zoom');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'siga_lesson_meetings_status_check'
      AND conrelid = 'public.siga_lesson_meetings'::regclass
  ) THEN
    ALTER TABLE public.siga_lesson_meetings
      ADD CONSTRAINT siga_lesson_meetings_status_check
      CHECK (status = ANY (ARRAY['active','cancelled','ended']));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'siga_lesson_meetings_unique_provider_meeting'
      AND conrelid = 'public.siga_lesson_meetings'::regclass
  ) THEN
    ALTER TABLE public.siga_lesson_meetings
      ADD CONSTRAINT siga_lesson_meetings_unique_provider_meeting
      UNIQUE (provider, external_meeting_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'siga_lesson_meetings_unique_session_provider'
      AND conrelid = 'public.siga_lesson_meetings'::regclass
  ) THEN
    ALTER TABLE public.siga_lesson_meetings
      ADD CONSTRAINT siga_lesson_meetings_unique_session_provider
      UNIQUE (attendance_session_id, provider);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_siga_lesson_meetings_school
  ON public.siga_lesson_meetings (school_id);

CREATE INDEX IF NOT EXISTS idx_siga_lesson_meetings_session
  ON public.siga_lesson_meetings (attendance_session_id);

ALTER TABLE public.siga_lesson_meetings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public'
      AND tablename='siga_lesson_meetings'
      AND policyname='Members read lesson meetings in own school'
  ) THEN
    CREATE POLICY "Members read lesson meetings in own school"
      ON public.siga_lesson_meetings
      FOR SELECT
      TO authenticated
      USING (
        school_id = (SELECT current_school_id())
        AND is_school_member(school_id)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public'
      AND tablename='siga_lesson_meetings'
      AND policyname='Staff manage lesson meetings in own school'
  ) THEN
    CREATE POLICY "Staff manage lesson meetings in own school"
      ON public.siga_lesson_meetings
      FOR ALL
      TO authenticated
      USING (
        school_id = (SELECT current_school_id())
        AND is_school_member(school_id)
        AND current_school_role_is(ARRAY[
          'owner','admin','administrator','administrador',
          'diretor geral','director geral','professor','teacher'
        ])
      )
      WITH CHECK (
        school_id = (SELECT current_school_id())
        AND is_school_member(school_id)
        AND current_school_role_is(ARRAY[
          'owner','admin','administrator','administrador',
          'diretor geral','director geral','professor','teacher'
        ])
      );
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.siga_lesson_meetings TO authenticated;
GRANT ALL ON public.siga_lesson_meetings TO service_role;
