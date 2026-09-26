CREATE TABLE IF NOT EXISTS public.siga_lesson_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_group_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  term integer NOT NULL CHECK (term BETWEEN 1 AND 3),
  title text NOT NULL,
  content text,
  file_id uuid,
  file_name text,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);
CREATE INDEX IF NOT EXISTS siga_lesson_plans_scope_idx ON public.siga_lesson_plans (school_id, class_group_id, subject_id, term);
CREATE TABLE IF NOT EXISTS public.siga_lesson_plan_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  lesson_plan_id uuid NOT NULL REFERENCES public.siga_lesson_plans(id) ON DELETE CASCADE,
  kind text NOT NULL,
  name text NOT NULL,
  planned_count integer NOT NULL DEFAULT 1,
  sequence integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS siga_lesson_plan_components_plan_idx ON public.siga_lesson_plan_components (lesson_plan_id, sequence);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.siga_lesson_plans TO authenticated;
GRANT ALL ON public.siga_lesson_plans TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.siga_lesson_plan_components TO authenticated;
GRANT ALL ON public.siga_lesson_plan_components TO service_role;
ALTER TABLE public.siga_lesson_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_lesson_plan_components ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Manage lesson plans in own school" ON public.siga_lesson_plans
  FOR ALL TO authenticated USING (public.is_school_member(school_id)) WITH CHECK (public.is_school_member(school_id));
CREATE POLICY "Manage lesson plan components in own school" ON public.siga_lesson_plan_components
  FOR ALL TO authenticated USING (public.is_school_member(school_id)) WITH CHECK (public.is_school_member(school_id));
CREATE TRIGGER siga_lesson_plans_set_updated_at BEFORE UPDATE ON public.siga_lesson_plans
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();
ALTER TABLE public.siga_assessment_items ADD COLUMN IF NOT EXISTS lesson_plan_component_id uuid
  REFERENCES public.siga_lesson_plan_components(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS siga_assessment_items_component_idx ON public.siga_assessment_items (lesson_plan_component_id)
  WHERE lesson_plan_component_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_class_subject_grade_range()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_seq int; v_from int; v_to int; v_subject text;
BEGIN
  SELECT coalesce(l.sequence, l.sort_order) INTO v_seq
  FROM class_groups g JOIN grade_levels l ON l.id = g.grade_level_id WHERE g.id = NEW.class_group_id;
  SELECT grade_from, grade_to, name INTO v_from, v_to, v_subject FROM subjects WHERE id = NEW.subject_id;
  IF v_seq IS NOT NULL AND ((v_from IS NOT NULL AND v_seq < v_from) OR (v_to IS NOT NULL AND v_seq > v_to)) THEN
    RAISE EXCEPTION 'A disciplina % só é leccionada da %ª à %ª classe.', v_subject, v_from, v_to USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_class_subject_grade_range ON public.class_subjects;
CREATE TRIGGER trg_guard_class_subject_grade_range
BEFORE INSERT OR UPDATE OF class_group_id, subject_id ON public.class_subjects
FOR EACH ROW EXECUTE FUNCTION public.guard_class_subject_grade_range();
REVOKE EXECUTE ON FUNCTION public.guard_class_subject_grade_range() FROM PUBLIC, anon, authenticated;