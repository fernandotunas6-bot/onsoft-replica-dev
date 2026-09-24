-- Reconcile student history tables that already exist in the live SGA.
CREATE TABLE IF NOT EXISTS public.student_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  previous_status text,
  new_status text NOT NULL,
  reason text,
  changed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='student_status_history_student_fkey' AND conrelid='public.student_status_history'::regclass) THEN
    ALTER TABLE public.student_status_history ADD CONSTRAINT student_status_history_student_fkey
      FOREIGN KEY (school_id, student_id) REFERENCES public.students (school_id, id) ON DELETE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS student_status_history_student_idx
  ON public.student_status_history (school_id, student_id, created_at DESC);
ALTER TABLE public.student_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_status_history FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.student_status_history TO authenticated;
GRANT ALL ON public.student_status_history TO service_role;
DROP POLICY IF EXISTS "Read student status history in own school" ON public.student_status_history;
DROP POLICY IF EXISTS "School members can access student status history" ON public.student_status_history;
CREATE POLICY "School members can access student status history" ON public.student_status_history
  FOR ALL TO authenticated USING (public.is_school_member(school_id)) WITH CHECK (public.is_school_member(school_id));

CREATE TABLE IF NOT EXISTS public.student_academic_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  academic_year_label text NOT NULL,
  grade_level text NOT NULL,
  previous_school text,
  final_average numeric(5,2),
  outcome text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='student_academic_history_student_fkey' AND conrelid='public.student_academic_history'::regclass) THEN
    ALTER TABLE public.student_academic_history ADD CONSTRAINT student_academic_history_student_fkey
      FOREIGN KEY (school_id, student_id) REFERENCES public.students (school_id, id) ON DELETE CASCADE;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS student_academic_history_unique_year_grade_idx
  ON public.student_academic_history (school_id, student_id, academic_year_label, grade_level);
CREATE INDEX IF NOT EXISTS student_academic_history_student_idx
  ON public.student_academic_history (school_id, student_id, created_at DESC);
ALTER TABLE public.student_academic_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_academic_history FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.student_academic_history TO authenticated;
GRANT ALL ON public.student_academic_history TO service_role;
DROP POLICY IF EXISTS "School members can access student academic history" ON public.student_academic_history;
CREATE POLICY "School members can access student academic history" ON public.student_academic_history
  FOR ALL TO authenticated USING (public.is_school_member(school_id)) WITH CHECK (public.is_school_member(school_id));