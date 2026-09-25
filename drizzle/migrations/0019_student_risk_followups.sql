CREATE TABLE public.student_risk_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  enrollment_id uuid NOT NULL,
  class_group_id uuid,
  student_name text NOT NULL,
  class_group_name text,
  risk_level text NOT NULL DEFAULT 'médio',
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggested_interventions jsonb NOT NULL DEFAULT '[]'::jsonb,
  baseline_average numeric,
  latest_average numeric,
  status text NOT NULL DEFAULT 'aberto',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, enrollment_id)
);
CREATE TABLE public.student_risk_interventions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.student_risk_cases(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'nota',
  description text NOT NULL,
  outcome text,
  risk_level text,
  average_snapshot numeric,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_risk_interventions_case ON public.student_risk_interventions(case_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_risk_cases TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_risk_interventions TO authenticated;
GRANT ALL ON public.student_risk_cases TO service_role;
GRANT ALL ON public.student_risk_interventions TO service_role;
ALTER TABLE public.student_risk_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_risk_interventions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros da escola gerem casos de risco" ON public.student_risk_cases
  FOR ALL TO authenticated USING (public.is_school_member(school_id)) WITH CHECK (public.is_school_member(school_id));
CREATE POLICY "Membros da escola gerem intervenções" ON public.student_risk_interventions
  FOR ALL TO authenticated USING (public.is_school_member(school_id)) WITH CHECK (public.is_school_member(school_id));
CREATE TRIGGER trg_student_risk_cases_updated BEFORE UPDATE ON public.student_risk_cases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();