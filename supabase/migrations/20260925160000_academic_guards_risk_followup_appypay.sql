CREATE OR REPLACE FUNCTION public.guard_timetable_slot_conflicts()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_class uuid; v_teacher uuid; v_conflict text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'active' THEN RETURN NEW; END IF;
  IF NEW.starts_at >= NEW.ends_at THEN
    RAISE EXCEPTION 'A hora de fim tem de ser depois da hora de início.' USING ERRCODE = '23514';
  END IF;
  SELECT class_group_id, teacher_id INTO v_class, v_teacher FROM class_subjects WHERE id = NEW.class_subject_id;

  SELECT 'A turma já tem aula neste horário.' INTO v_conflict
  FROM timetable_slots t JOIN class_subjects c ON c.id = t.class_subject_id
  WHERE t.id <> NEW.id AND t.status = 'active' AND t.weekday = NEW.weekday
    AND t.starts_at < NEW.ends_at AND NEW.starts_at < t.ends_at AND c.class_group_id = v_class LIMIT 1;

  IF v_conflict IS NULL AND v_teacher IS NOT NULL THEN
    SELECT 'O professor já tem aula noutra turma neste horário.' INTO v_conflict
    FROM timetable_slots t JOIN class_subjects c ON c.id = t.class_subject_id
    WHERE t.id <> NEW.id AND t.status = 'active' AND t.weekday = NEW.weekday
      AND t.starts_at < NEW.ends_at AND NEW.starts_at < t.ends_at AND c.teacher_id = v_teacher LIMIT 1;
  END IF;

  IF v_conflict IS NULL AND NULLIF(btrim(NEW.room), '') IS NOT NULL THEN
    SELECT 'A sala já está ocupada neste horário.' INTO v_conflict
    FROM timetable_slots t
    WHERE t.id <> NEW.id AND t.status = 'active' AND t.school_id = NEW.school_id AND t.weekday = NEW.weekday
      AND t.starts_at < NEW.ends_at AND NEW.starts_at < t.ends_at AND t.room = NEW.room LIMIT 1;
  END IF;

  IF v_conflict IS NOT NULL THEN RAISE EXCEPTION '%', v_conflict USING ERRCODE = '23P01'; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_timetable_slot_conflicts ON public.timetable_slots;
CREATE TRIGGER trg_guard_timetable_slot_conflicts
BEFORE INSERT OR UPDATE OF weekday, starts_at, ends_at, room, status, class_subject_id ON public.timetable_slots
FOR EACH ROW EXECUTE FUNCTION public.guard_timetable_slot_conflicts();

CREATE OR REPLACE FUNCTION public.guard_term_within_year()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE y record;
BEGIN
  IF NEW.starts_on IS NOT NULL AND NEW.ends_on IS NOT NULL AND NEW.starts_on >= NEW.ends_on THEN
    RAISE EXCEPTION 'O período tem de terminar depois de começar.' USING ERRCODE = '23514';
  END IF;
  SELECT starts_on, ends_on INTO y FROM academic_years WHERE id = NEW.academic_year_id;
  IF FOUND AND (NEW.starts_on < y.starts_on OR NEW.ends_on > y.ends_on) THEN
    RAISE EXCEPTION 'O período tem de ficar dentro das datas do ano lectivo.' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM terms t WHERE t.id <> NEW.id AND t.academic_year_id = NEW.academic_year_id
             AND t.starts_on <= NEW.ends_on AND NEW.starts_on <= t.ends_on) THEN
    RAISE EXCEPTION 'O período sobrepõe-se a outro período do mesmo ano lectivo.' USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_term_within_year ON public.terms;
CREATE TRIGGER trg_guard_term_within_year
BEFORE INSERT OR UPDATE OF starts_on, ends_on, academic_year_id ON public.terms
FOR EACH ROW EXECUTE FUNCTION public.guard_term_within_year();

REVOKE EXECUTE ON FUNCTION public.guard_timetable_slot_conflicts() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_term_within_year() FROM PUBLIC, anon, authenticated;CREATE TABLE public.student_risk_cases (
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
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();CREATE TABLE public.payment_gateway_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'appypay',
  invoice_id uuid NOT NULL,
  student_name text,
  method text NOT NULL,
  merchant_transaction_id text NOT NULL UNIQUE,
  provider_charge_id text UNIQUE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  reference_entity text,
  reference_number text,
  phone_number text,
  status text NOT NULL DEFAULT 'pending',
  status_message text,
  receipt_number text,
  reconciled_at timestamptz,
  last_webhook_at timestamptz,
  raw_last_payload jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_gateway_charges_invoice ON public.payment_gateway_charges(school_id, invoice_id);
CREATE INDEX idx_gateway_charges_status ON public.payment_gateway_charges(school_id, status);
GRANT SELECT ON public.payment_gateway_charges TO authenticated;
GRANT ALL ON public.payment_gateway_charges TO service_role;
ALTER TABLE public.payment_gateway_charges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros da escola vêem cobranças" ON public.payment_gateway_charges
  FOR SELECT TO authenticated USING (public.is_school_member(school_id));
CREATE TRIGGER trg_gateway_charges_updated BEFORE UPDATE ON public.payment_gateway_charges
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();