-- STAGING ONLY. Confirm migration must be tested with HR review workflow.
BEGIN;
DO $preflight$
BEGIN
  IF md5(pg_catalog.pg_get_functiondef('public.hr_confirm_teacher_lesson(uuid,text,text)'::regprocedure))
     <> 'c46e714eb228d6e9bdf9b01be586ced9' THEN
    RAISE EXCEPTION 'HR confirmation RPC changed; review replacement before applying';
  END IF;
END;
$preflight$;
CREATE OR REPLACE FUNCTION public.hr_confirm_teacher_lesson(p_occurrence_id uuid, p_evidence_method text, p_evidence_ref text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  IF (SELECT public.current_profile_role()) NOT IN ('Administrador', 'Tesouraria') THEN
    RAISE EXCEPTION 'Independent HR reviewer required';
  END IF;
  IF (SELECT auth.uid()) IS NULL OR (SELECT auth.uid()) =
    (SELECT t.user_id FROM public.teachers t
     WHERE t.id = v_occ.teacher_id AND t.school_id = v_occ.school_id) THEN
    RAISE EXCEPTION 'Teacher cannot approve own remuneration';
  END IF;
  IF v_occ.actual_started_at IS NULL OR v_occ.actual_ended_at IS NULL
     OR v_occ.actual_ended_at <= v_occ.actual_started_at THEN
    RAISE EXCEPTION 'Valid check-in and check-out required before HR confirmation';
  END IF;
  IF v_occ.payable_quantity IS NULL OR v_occ.payable_quantity <= 0 THEN
    RAISE EXCEPTION 'HR must record a positive reviewed payable quantity';
  END IF;
  IF p_evidence_method = 'qr' THEN
    IF v_occ.evidence_method IS DISTINCT FROM 'qr' OR NOT EXISTS (
      SELECT 1 FROM public.hr_teacher_qr_sessions q
      JOIN public.teachers t ON t.id=v_occ.teacher_id AND t.school_id=v_occ.school_id
      WHERE q.id::text=v_occ.evidence_ref AND q.school_id=v_occ.school_id
        AND q.occurrence_id=v_occ.id AND q.purpose='check_out'
        AND q.status='used' AND q.used_by=t.user_id
    ) OR NOT EXISTS (
      SELECT 1 FROM public.hr_teacher_qr_sessions q
      JOIN public.teachers t ON t.id=v_occ.teacher_id AND t.school_id=v_occ.school_id
      WHERE q.school_id=v_occ.school_id AND q.occurrence_id=v_occ.id
        AND q.purpose='check_in' AND q.status='used' AND q.used_by=t.user_id
    ) THEN
      RAISE EXCEPTION 'Verified QR entry and exit required for HR confirmation';
    END IF;
  END IF;
  IF p_evidence_method <> 'qr' AND NULLIF(btrim(p_evidence_ref), '') IS NULL THEN
    RAISE EXCEPTION 'Documented evidence reference required for manual HR confirmation';
  END IF;
  IF v_occ.occurrence_kind = 'scheduled' AND NOT EXISTS (
    SELECT 1 FROM public.timetable_slots ts
    JOIN public.academic_schedules sch ON sch.id=ts.schedule_id AND sch.school_id=ts.school_id
    WHERE ts.id=v_occ.timetable_slot_id AND ts.school_id=v_occ.school_id
      AND ts.class_subject_id=v_occ.class_subject_id AND ts.status='active'
      AND sch.status='published' AND v_occ.lesson_date BETWEEN sch.valid_from AND sch.valid_to
      AND ts.starts_at=v_occ.scheduled_starts_at AND ts.ends_at=v_occ.scheduled_ends_at
  ) THEN
    RAISE EXCEPTION 'Published timetable required for scheduled remuneration';
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
    'lesson_hour', v_occ.payable_quantity, v_rate, 'teacher_lesson_occurrence', v_occ.id,
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
      evidence_ref = CASE WHEN p_evidence_method = 'qr' THEN v_occ.evidence_ref
                          ELSE NULLIF(btrim(p_evidence_ref), '') END,
      confirmed_at = now(),
      confirmed_by = (SELECT auth.uid()),
      compensation_event_id = v_event_id,
      updated_by = (SELECT auth.uid())
  WHERE id = v_occ.id;

  RETURN v_event_id;
END;
$function$

COMMIT;
