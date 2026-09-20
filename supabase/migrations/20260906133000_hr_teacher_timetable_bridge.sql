-- SIGA / Onsoft — ponte RH ↔ Professores ↔ Horários
-- Depende da fundação de RH (20260906124500) e do modelo académico actual
-- teachers -> class_subjects -> timetable_slots.
-- Um horário programado NÃO gera pagamento sozinho. A ocorrência precisa de
-- confirmação/evidência antes de ser transformada em hr_compensation_events.

-- ---------------------------------------------------------------------------
-- Vínculo explícito entre a ficha académica do professor e o vínculo funcional.
-- Evita inferências frágeis e permite histórico/controlos administrativos.
-- ---------------------------------------------------------------------------
CREATE TABLE public.hr_teacher_employment_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id),
  employment_id uuid NOT NULL REFERENCES public.hr_employments(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  starts_on date NOT NULL DEFAULT CURRENT_DATE,
  ends_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CHECK (ends_on IS NULL OR ends_on >= starts_on)
);

CREATE UNIQUE INDEX hr_teacher_employment_active_teacher_idx
  ON public.hr_teacher_employment_links (school_id, teacher_id)
  WHERE deleted_at IS NULL AND status = 'active';
CREATE UNIQUE INDEX hr_teacher_employment_active_employment_idx
  ON public.hr_teacher_employment_links (school_id, employment_id)
  WHERE deleted_at IS NULL AND status = 'active';

-- ---------------------------------------------------------------------------
-- Ocorrência concreta de uma aula. timetable_slots é semanal/recorrente;
-- esta tabela materializa a aula numa data real e guarda a prova de execução.
-- evidence_method já prevê QR sem obrigar a implementação do leitor nesta fase.
-- ---------------------------------------------------------------------------
CREATE TABLE public.hr_teacher_lesson_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  timetable_slot_id uuid NOT NULL REFERENCES public.timetable_slots(id),
  class_subject_id uuid NOT NULL REFERENCES public.class_subjects(id),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id),
  employment_id uuid NOT NULL REFERENCES public.hr_employments(id),
  contract_id uuid REFERENCES public.hr_contracts(id),
  lesson_date date NOT NULL,
  scheduled_starts_at time NOT NULL,
  scheduled_ends_at time NOT NULL,
  actual_started_at timestamptz,
  actual_ended_at timestamptz,
  quantity numeric(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN (
    'scheduled', 'confirmed', 'rejected', 'cancelled'
  )),
  evidence_method text CHECK (evidence_method IS NULL OR evidence_method IN (
    'manual', 'qr', 'attendance_import', 'system'
  )),
  evidence_ref text,
  confirmed_at timestamptz,
  confirmed_by uuid REFERENCES auth.users(id),
  compensation_event_id uuid REFERENCES public.hr_compensation_events(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CHECK (scheduled_ends_at > scheduled_starts_at),
  CHECK (actual_ended_at IS NULL OR actual_started_at IS NULL OR actual_ended_at >= actual_started_at),
  CHECK (
    status <> 'confirmed'
    OR (evidence_method IS NOT NULL AND confirmed_at IS NOT NULL AND confirmed_by IS NOT NULL)
  )
);

CREATE UNIQUE INDEX hr_teacher_lesson_occurrence_slot_date_idx
  ON public.hr_teacher_lesson_occurrences (school_id, timetable_slot_id, lesson_date)
  WHERE deleted_at IS NULL;
CREATE INDEX hr_teacher_lesson_occurrence_teacher_date_idx
  ON public.hr_teacher_lesson_occurrences (school_id, teacher_id, lesson_date, status)
  WHERE deleted_at IS NULL;
CREATE INDEX hr_teacher_lesson_occurrence_payroll_idx
  ON public.hr_teacher_lesson_occurrences (school_id, employment_id, lesson_date, status)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Integridade: tudo deve pertencer à mesma escola e o slot deve apontar para a
-- mesma class_subject/teacher que originou a ocorrência.
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
  SELECT school_id, class_subject_id
    INTO v_school, v_slot_subject
  FROM public.timetable_slots
  WHERE id = NEW.timetable_slot_id;
  IF v_school IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'HR cross-school timetable slot reference';
  END IF;
  IF v_slot_subject IS DISTINCT FROM NEW.class_subject_id THEN
    RAISE EXCEPTION 'HR timetable slot/class subject mismatch';
  END IF;

  SELECT school_id, teacher_id
    INTO v_school, v_subject_teacher
  FROM public.class_subjects
  WHERE id = NEW.class_subject_id;
  IF v_school IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'HR cross-school class subject reference';
  END IF;
  IF v_subject_teacher IS DISTINCT FROM NEW.teacher_id THEN
    RAISE EXCEPTION 'HR class subject/teacher mismatch';
  END IF;

  SELECT school_id INTO v_school FROM public.teachers WHERE id = NEW.teacher_id;
  IF v_school IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'HR cross-school teacher reference';
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

CREATE OR REPLACE FUNCTION public.hr_assert_teacher_employment_link_same_school()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_school uuid;
BEGIN
  SELECT school_id INTO v_school FROM public.teachers WHERE id = NEW.teacher_id;
  IF v_school IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'HR cross-school teacher reference';
  END IF;
  SELECT school_id INTO v_school FROM public.hr_employments WHERE id = NEW.employment_id;
  IF v_school IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'HR cross-school employment reference';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER hr_teacher_employment_link_same_school
  BEFORE INSERT OR UPDATE ON public.hr_teacher_employment_links
  FOR EACH ROW EXECUTE FUNCTION public.hr_assert_teacher_employment_link_same_school();

CREATE TRIGGER hr_teacher_lesson_same_school
  BEFORE INSERT OR UPDATE ON public.hr_teacher_lesson_occurrences
  FOR EACH ROW EXECUTE FUNCTION public.hr_assert_teacher_lesson_same_school();

CREATE TRIGGER hr_teacher_employment_links_set_updated_at
  BEFORE UPDATE ON public.hr_teacher_employment_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER hr_teacher_lesson_occurrences_set_updated_at
  BEFORE UPDATE ON public.hr_teacher_lesson_occurrences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();

-- ---------------------------------------------------------------------------
-- Confirmação atómica: apenas uma aula confirmada e com contrato lesson_hour
-- activo pode criar o evento remunerável. Idempotente por compensation_event_id.
-- A chamada operacional ficará no servidor autenticado do módulo RH.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_confirm_teacher_lesson(
  p_occurrence_id uuid,
  p_evidence_method text,
  p_evidence_ref text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_occ public.hr_teacher_lesson_occurrences%ROWTYPE;
  v_rate numeric(14,2);
  v_event_id uuid;
BEGIN
  IF p_evidence_method NOT IN ('manual', 'qr', 'attendance_import', 'system') THEN
    RAISE EXCEPTION 'Invalid lesson evidence method';
  END IF;

  SELECT * INTO v_occ
  FROM public.hr_teacher_lesson_occurrences
  WHERE id = p_occurrence_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Lesson occurrence not found'; END IF;
  IF v_occ.school_id IS DISTINCT FROM (SELECT public.current_school_id()) THEN
    RAISE EXCEPTION 'Lesson occurrence outside current school';
  END IF;
  IF v_occ.compensation_event_id IS NOT NULL THEN
    RETURN v_occ.compensation_event_id;
  END IF;
  IF v_occ.status IN ('rejected', 'cancelled') THEN
    RAISE EXCEPTION 'Rejected/cancelled lesson cannot be paid';
  END IF;
  IF v_occ.contract_id IS NULL THEN
    RAISE EXCEPTION 'Lesson occurrence has no payroll contract';
  END IF;

  SELECT lesson_hour_rate_kz INTO v_rate
  FROM public.hr_contracts
  WHERE id = v_occ.contract_id
    AND school_id = v_occ.school_id
    AND employment_id = v_occ.employment_id
    AND salary_type = 'lesson_hour'
    AND status = 'active'
    AND deleted_at IS NULL
    AND starts_on <= v_occ.lesson_date
    AND (ends_on IS NULL OR ends_on >= v_occ.lesson_date);

  IF v_rate IS NULL THEN
    RAISE EXCEPTION 'No active lesson-hour contract for this occurrence';
  END IF;

  INSERT INTO public.hr_compensation_events (
    school_id, employment_id, contract_id, event_date, event_type,
    quantity, unit_rate_kz, source_type, source_id, description,
    validation_status, validated_at, validated_by, created_by
  ) VALUES (
    v_occ.school_id, v_occ.employment_id, v_occ.contract_id, v_occ.lesson_date,
    'lesson_hour', v_occ.quantity, v_rate, 'teacher_lesson_occurrence', v_occ.id,
    'Aula confirmada a partir do horário académico', 'validated', now(),
    (SELECT auth.uid()), (SELECT auth.uid())
  )
  ON CONFLICT (school_id, source_type, source_id, employment_id, event_type)
    WHERE deleted_at IS NULL AND source_type IS NOT NULL AND source_id IS NOT NULL
  DO UPDATE SET updated_by = (SELECT auth.uid())
  RETURNING id INTO v_event_id;

  UPDATE public.hr_teacher_lesson_occurrences
  SET status = 'confirmed',
      evidence_method = p_evidence_method,
      evidence_ref = NULLIF(btrim(p_evidence_ref), ''),
      confirmed_at = now(),
      confirmed_by = (SELECT auth.uid()),
      compensation_event_id = v_event_id,
      updated_by = (SELECT auth.uid())
  WHERE id = v_occ.id;

  RETURN v_event_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hr_confirm_teacher_lesson(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_confirm_teacher_lesson(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS: dados salariais/operacionais apenas Administração/Tesouraria nesta fase.
-- O professor receberá posteriormente uma visão limitada às próprias ocorrências.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON public.hr_teacher_employment_links TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.hr_teacher_lesson_occurrences TO authenticated;
GRANT ALL ON public.hr_teacher_employment_links TO service_role;
GRANT ALL ON public.hr_teacher_lesson_occurrences TO service_role;

ALTER TABLE public.hr_teacher_employment_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_teacher_employment_links FORCE ROW LEVEL SECURITY;
ALTER TABLE public.hr_teacher_lesson_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_teacher_lesson_occurrences FORCE ROW LEVEL SECURITY;

CREATE POLICY "HR reads teacher employment links in own school"
  ON public.hr_teacher_employment_links FOR SELECT TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria')
    AND deleted_at IS NULL
  );
CREATE POLICY "HR creates teacher employment links in own school"
  ON public.hr_teacher_employment_links FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND created_by = (SELECT auth.uid())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria')
  );
CREATE POLICY "HR updates teacher employment links in own school"
  ON public.hr_teacher_employment_links FOR UPDATE TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria')
  )
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria')
  );

CREATE POLICY "HR reads teacher lesson occurrences in own school"
  ON public.hr_teacher_lesson_occurrences FOR SELECT TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria')
    AND deleted_at IS NULL
  );
CREATE POLICY "HR creates teacher lesson occurrences in own school"
  ON public.hr_teacher_lesson_occurrences FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND created_by = (SELECT auth.uid())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria')
  );
CREATE POLICY "HR updates teacher lesson occurrences in own school"
  ON public.hr_teacher_lesson_occurrences FOR UPDATE TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria')
  )
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria')
  );

NOTIFY pgrst, 'reload schema';
