-- SIGA / Onsoft — exceções de aula, substituições e tolerâncias de presença
-- Complementa o fluxo horário -> ocorrência -> QR -> remuneração sem criar um motor paralelo.

-- ---------------------------------------------------------------------------
-- Política de tolerância por escola.
-- Fora da tolerância, o padrão seguro é revisão manual antes de gerar pagamento.
-- ---------------------------------------------------------------------------
CREATE TABLE public.hr_teacher_attendance_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  name text NOT NULL DEFAULT 'Política padrão',
  late_grace_minutes integer NOT NULL DEFAULT 10 CHECK (late_grace_minutes BETWEEN 0 AND 120),
  early_leave_grace_minutes integer NOT NULL DEFAULT 10 CHECK (early_leave_grace_minutes BETWEEN 0 AND 120),
  minimum_attendance_percent numeric(5,2) NOT NULL DEFAULT 80
    CHECK (minimum_attendance_percent BETWEEN 0 AND 100),
  outside_grace_mode text NOT NULL DEFAULT 'review'
    CHECK (outside_grace_mode IN ('review', 'proportional')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX hr_teacher_attendance_policy_active_school_idx
  ON public.hr_teacher_attendance_policies (school_id)
  WHERE active AND deleted_at IS NULL;

CREATE TRIGGER hr_teacher_attendance_policies_set_updated_at
  BEFORE UPDATE ON public.hr_teacher_attendance_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();

-- ---------------------------------------------------------------------------
-- A ocorrência passa a distinguir aula normal, substituição e extraordinária.
-- timetable_slot_id fica opcional apenas para aula extraordinária.
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_teacher_lesson_occurrences
  ALTER COLUMN timetable_slot_id DROP NOT NULL,
  ADD COLUMN occurrence_kind text NOT NULL DEFAULT 'scheduled'
    CHECK (occurrence_kind IN ('scheduled', 'substitution', 'extra')),
  ADD COLUMN original_teacher_id uuid REFERENCES public.teachers(id),
  ADD COLUMN adjustment_reason text,
  ADD COLUMN late_minutes integer NOT NULL DEFAULT 0 CHECK (late_minutes >= 0),
  ADD COLUMN early_leave_minutes integer NOT NULL DEFAULT 0 CHECK (early_leave_minutes >= 0),
  ADD COLUMN attendance_percent numeric(5,2) CHECK (attendance_percent IS NULL OR attendance_percent BETWEEN 0 AND 100),
  ADD COLUMN payable_quantity numeric(10,2) CHECK (payable_quantity IS NULL OR payable_quantity >= 0),
  ADD COLUMN attendance_exception_status text NOT NULL DEFAULT 'none'
    CHECK (attendance_exception_status IN ('none', 'within_grace', 'proportional', 'pending_review', 'approved', 'rejected'));

DROP INDEX IF EXISTS public.hr_teacher_lesson_occurrence_slot_date_idx;
CREATE UNIQUE INDEX hr_teacher_lesson_occurrence_slot_date_idx
  ON public.hr_teacher_lesson_occurrences (school_id, timetable_slot_id, lesson_date)
  WHERE deleted_at IS NULL AND timetable_slot_id IS NOT NULL;

CREATE INDEX hr_teacher_lesson_exception_idx
  ON public.hr_teacher_lesson_occurrences (school_id, attendance_exception_status, lesson_date)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Integridade actualizada: substituto pode diferir do professor da disciplina,
-- desde que original_teacher_id preserve o professor originalmente atribuído.
-- Aula extra mantém class_subject e professor normal, mas não exige timetable_slot.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_assert_teacher_lesson_same_school()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_school uuid;
  v_slot_subject uuid;
  v_subject_teacher uuid;
BEGIN
  IF NEW.timetable_slot_id IS NOT NULL THEN
    SELECT school_id, class_subject_id INTO v_school, v_slot_subject
    FROM public.timetable_slots WHERE id = NEW.timetable_slot_id;
    IF v_school IS DISTINCT FROM NEW.school_id THEN
      RAISE EXCEPTION 'HR cross-school timetable slot reference';
    END IF;
    IF v_slot_subject IS DISTINCT FROM NEW.class_subject_id THEN
      RAISE EXCEPTION 'HR timetable slot/class subject mismatch';
    END IF;
  ELSIF NEW.occurrence_kind <> 'extra' THEN
    RAISE EXCEPTION 'Only extra lessons may omit timetable slot';
  END IF;

  SELECT school_id, teacher_id INTO v_school, v_subject_teacher
  FROM public.class_subjects WHERE id = NEW.class_subject_id;
  IF v_school IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'HR cross-school class subject reference';
  END IF;

  IF NEW.occurrence_kind = 'substitution' THEN
    IF NEW.original_teacher_id IS NULL OR NEW.original_teacher_id IS DISTINCT FROM v_subject_teacher THEN
      RAISE EXCEPTION 'Substitution must preserve original assigned teacher';
    END IF;
  ELSIF NEW.teacher_id IS DISTINCT FROM v_subject_teacher THEN
    RAISE EXCEPTION 'HR class subject/teacher mismatch';
  END IF;

  SELECT school_id INTO v_school FROM public.teachers WHERE id = NEW.teacher_id;
  IF v_school IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'HR cross-school teacher reference';
  END IF;

  IF NEW.original_teacher_id IS NOT NULL THEN
    SELECT school_id INTO v_school FROM public.teachers WHERE id = NEW.original_teacher_id;
    IF v_school IS DISTINCT FROM NEW.school_id THEN
      RAISE EXCEPTION 'HR cross-school original teacher reference';
    END IF;
  END IF;

  SELECT school_id INTO v_school FROM public.hr_employments WHERE id = NEW.employment_id;
  IF v_school IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'HR cross-school employment reference';
  END IF;

  IF NEW.contract_id IS NOT NULL THEN
    SELECT school_id INTO v_school FROM public.hr_contracts WHERE id = NEW.contract_id;
    IF v_school IS DISTINCT FROM NEW.school_id THEN
      RAISE EXCEPTION 'HR cross-school contract reference';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Substituição formal: troca apenas a ocorrência concreta. O horário base e a
-- atribuição académica original não são alterados.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_assign_teacher_substitute(
  p_occurrence_id uuid,
  p_substitute_teacher_id uuid,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_occ public.hr_teacher_lesson_occurrences%ROWTYPE;
  v_employment uuid;
  v_contract uuid;
BEGIN
  SELECT * INTO v_occ
  FROM public.hr_teacher_lesson_occurrences
  WHERE id = p_occurrence_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Lesson occurrence not found'; END IF;
  IF v_occ.school_id IS DISTINCT FROM (SELECT public.current_school_id()) THEN
    RAISE EXCEPTION 'Lesson occurrence outside current school';
  END IF;
  IF v_occ.status <> 'scheduled' OR v_occ.actual_started_at IS NOT NULL THEN
    RAISE EXCEPTION 'Only untouched scheduled lessons may be substituted';
  END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Substitution reason is required';
  END IF;

  SELECT l.employment_id INTO v_employment
  FROM public.hr_teacher_employment_links l
  JOIN public.hr_employments e ON e.id = l.employment_id AND e.school_id = l.school_id
  WHERE l.school_id = v_occ.school_id
    AND l.teacher_id = p_substitute_teacher_id
    AND l.status = 'active'
    AND l.deleted_at IS NULL
    AND l.starts_on <= v_occ.lesson_date
    AND (l.ends_on IS NULL OR l.ends_on >= v_occ.lesson_date)
    AND e.status = 'active'
    AND e.deleted_at IS NULL
  LIMIT 1;

  IF v_employment IS NULL THEN
    RAISE EXCEPTION 'Substitute teacher has no active HR employment link';
  END IF;

  SELECT c.id INTO v_contract
  FROM public.hr_contracts c
  WHERE c.school_id = v_occ.school_id
    AND c.employment_id = v_employment
    AND c.salary_type = 'lesson_hour'
    AND c.status = 'active'
    AND c.deleted_at IS NULL
    AND c.starts_on <= v_occ.lesson_date
    AND (c.ends_on IS NULL OR c.ends_on >= v_occ.lesson_date)
  ORDER BY c.starts_on DESC
  LIMIT 1;

  IF v_contract IS NULL THEN
    RAISE EXCEPTION 'Substitute teacher has no active lesson-hour contract';
  END IF;

  UPDATE public.hr_teacher_lesson_occurrences
  SET original_teacher_id = COALESCE(original_teacher_id, teacher_id),
      teacher_id = p_substitute_teacher_id,
      employment_id = v_employment,
      contract_id = v_contract,
      occurrence_kind = 'substitution',
      adjustment_reason = btrim(p_reason),
      updated_by = (SELECT auth.uid())
  WHERE id = v_occ.id;

  RETURN v_occ.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hr_assign_teacher_substitute(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_assign_teacher_substitute(uuid, uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Aula extraordinária: usa uma disciplina/turma existente, mas nasce fora do
-- timetable semanal. Continua a exigir professor, vínculo RH e contrato válidos.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_create_extra_teacher_lesson(
  p_class_subject_id uuid,
  p_lesson_date date,
  p_starts_at time,
  p_ends_at time,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_school uuid := (SELECT public.current_school_id());
  v_teacher uuid;
  v_employment uuid;
  v_contract uuid;
  v_id uuid;
BEGIN
  IF v_school IS NULL THEN RAISE EXCEPTION 'No active school'; END IF;
  IF p_ends_at <= p_starts_at THEN RAISE EXCEPTION 'Invalid lesson time interval'; END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Extra lesson reason is required'; END IF;

  SELECT teacher_id INTO v_teacher
  FROM public.class_subjects
  WHERE id = p_class_subject_id
    AND school_id = v_school
    AND status = 'active';
  IF v_teacher IS NULL THEN RAISE EXCEPTION 'Active class subject/teacher not found'; END IF;

  SELECT l.employment_id INTO v_employment
  FROM public.hr_teacher_employment_links l
  JOIN public.hr_employments e ON e.id = l.employment_id AND e.school_id = l.school_id
  WHERE l.school_id = v_school
    AND l.teacher_id = v_teacher
    AND l.status = 'active'
    AND l.deleted_at IS NULL
    AND l.starts_on <= p_lesson_date
    AND (l.ends_on IS NULL OR l.ends_on >= p_lesson_date)
    AND e.status = 'active'
    AND e.deleted_at IS NULL
  LIMIT 1;
  IF v_employment IS NULL THEN RAISE EXCEPTION 'Teacher has no active HR employment link'; END IF;

  SELECT id INTO v_contract
  FROM public.hr_contracts
  WHERE school_id = v_school
    AND employment_id = v_employment
    AND salary_type = 'lesson_hour'
    AND status = 'active'
    AND deleted_at IS NULL
    AND starts_on <= p_lesson_date
    AND (ends_on IS NULL OR ends_on >= p_lesson_date)
  ORDER BY starts_on DESC
  LIMIT 1;
  IF v_contract IS NULL THEN RAISE EXCEPTION 'Teacher has no active lesson-hour contract'; END IF;

  INSERT INTO public.hr_teacher_lesson_occurrences (
    school_id, timetable_slot_id, class_subject_id, teacher_id, employment_id, contract_id,
    lesson_date, scheduled_starts_at, scheduled_ends_at, occurrence_kind,
    adjustment_reason, status, created_by
  ) VALUES (
    v_school, NULL, p_class_subject_id, v_teacher, v_employment, v_contract,
    p_lesson_date, p_starts_at, p_ends_at, 'extra', btrim(p_reason), 'scheduled', (SELECT auth.uid())
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hr_create_extra_teacher_lesson(uuid, date, time, time, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_create_extra_teacher_lesson(uuid, date, time, time, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Cálculo auditável de presença após check-out.
-- Não gera pagamento por si só; prepara quantidade/status a ser usada no fecho.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_evaluate_teacher_lesson_attendance(p_occurrence_id uuid)
RETURNS TABLE (
  attendance_percent numeric,
  payable_quantity numeric,
  exception_status text
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_occ public.hr_teacher_lesson_occurrences%ROWTYPE;
  v_policy public.hr_teacher_attendance_policies%ROWTYPE;
  v_scheduled_start timestamptz;
  v_scheduled_end timestamptz;
  v_scheduled_seconds numeric;
  v_actual_seconds numeric;
  v_percent numeric;
  v_late integer;
  v_early integer;
  v_payable numeric;
  v_status text;
BEGIN
  SELECT * INTO v_occ FROM public.hr_teacher_lesson_occurrences
  WHERE id = p_occurrence_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lesson occurrence not found'; END IF;
  IF v_occ.actual_started_at IS NULL OR v_occ.actual_ended_at IS NULL THEN
    RAISE EXCEPTION 'Check-in and check-out are required';
  END IF;

  SELECT * INTO v_policy
  FROM public.hr_teacher_attendance_policies
  WHERE school_id = v_occ.school_id AND active AND deleted_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    v_policy.late_grace_minutes := 10;
    v_policy.early_leave_grace_minutes := 10;
    v_policy.minimum_attendance_percent := 80;
    v_policy.outside_grace_mode := 'review';
  END IF;

  v_scheduled_start := ((v_occ.lesson_date + v_occ.scheduled_starts_at)::timestamp AT TIME ZONE 'Africa/Luanda');
  v_scheduled_end := ((v_occ.lesson_date + v_occ.scheduled_ends_at)::timestamp AT TIME ZONE 'Africa/Luanda');
  v_scheduled_seconds := GREATEST(EXTRACT(EPOCH FROM (v_scheduled_end - v_scheduled_start)), 1);
  v_actual_seconds := GREATEST(EXTRACT(EPOCH FROM (v_occ.actual_ended_at - v_occ.actual_started_at)), 0);
  v_percent := LEAST(100, round((v_actual_seconds / v_scheduled_seconds) * 100, 2));
  v_late := GREATEST(floor(EXTRACT(EPOCH FROM (v_occ.actual_started_at - v_scheduled_start)) / 60), 0)::integer;
  v_early := GREATEST(floor(EXTRACT(EPOCH FROM (v_scheduled_end - v_occ.actual_ended_at)) / 60), 0)::integer;

  IF v_percent < v_policy.minimum_attendance_percent THEN
    v_payable := 0;
    v_status := 'pending_review';
  ELSIF v_late <= v_policy.late_grace_minutes
     AND v_early <= v_policy.early_leave_grace_minutes THEN
    v_payable := v_occ.quantity;
    v_status := 'within_grace';
  ELSIF v_policy.outside_grace_mode = 'proportional' THEN
    v_payable := round(v_occ.quantity * (v_percent / 100), 2);
    v_status := 'proportional';
  ELSE
    v_payable := NULL;
    v_status := 'pending_review';
  END IF;

  UPDATE public.hr_teacher_lesson_occurrences
  SET late_minutes = v_late,
      early_leave_minutes = v_early,
      attendance_percent = v_percent,
      payable_quantity = v_payable,
      attendance_exception_status = v_status,
      updated_by = (SELECT auth.uid())
  WHERE id = v_occ.id;

  RETURN QUERY SELECT v_percent, v_payable, v_status;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hr_evaluate_teacher_lesson_attendance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_evaluate_teacher_lesson_attendance(uuid) TO authenticated;

-- Política multi-tenant.
GRANT SELECT, INSERT, UPDATE ON public.hr_teacher_attendance_policies TO authenticated;
GRANT ALL ON public.hr_teacher_attendance_policies TO service_role;
ALTER TABLE public.hr_teacher_attendance_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_teacher_attendance_policies FORCE ROW LEVEL SECURITY;

CREATE POLICY "HR reads teacher attendance policy in own school"
  ON public.hr_teacher_attendance_policies FOR SELECT TO authenticated
  USING (school_id = (SELECT public.current_school_id()) AND deleted_at IS NULL);
CREATE POLICY "HR creates teacher attendance policy in own school"
  ON public.hr_teacher_attendance_policies FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND created_by = (SELECT auth.uid())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria')
  );
CREATE POLICY "HR updates teacher attendance policy in own school"
  ON public.hr_teacher_attendance_policies FOR UPDATE TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria')
  )
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria')
  );

COMMENT ON TABLE public.hr_teacher_attendance_policies IS
  'Tolerâncias de atraso/saída antecipada e regra de revisão/proporcionalidade da hora-aula.';

NOTIFY pgrst, 'reload schema';