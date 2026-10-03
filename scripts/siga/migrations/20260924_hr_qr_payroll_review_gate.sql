-- Applied to active Sga on 2026-09-24. Captured from active Sga on 2026-09-24.
-- Review full function replacement against newer migrations before applying.
BEGIN;
DO $qr_preflight$
BEGIN
  IF md5(pg_catalog.pg_get_functiondef('public.hr_redeem_teacher_qr(text)'::regprocedure))
     <> '0d963d7ac3c92d0d16c34e995b0a8495' THEN
    RAISE EXCEPTION 'HR QR RPC definition changed; review replacement before applying';
  END IF;
END;
$qr_preflight$;
CREATE OR REPLACE FUNCTION public.hr_redeem_teacher_qr(p_token_hash text)
 RETURNS TABLE(occurrence_id uuid, purpose text, compensation_event_id uuid, occurrence_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_session public.hr_teacher_qr_sessions%ROWTYPE;
  v_occ public.hr_teacher_lesson_occurrences%ROWTYPE;
  v_contract public.hr_contracts%ROWTYPE;
  v_teacher_user uuid;
  v_rate numeric(14,2);
  v_event_id uuid;
  v_now timestamptz := now();
  v_policy public.hr_teacher_attendance_policies%ROWTYPE;
  v_scheduled_start timestamptz;
  v_scheduled_end timestamptz;
  v_scheduled_seconds numeric;
  v_actual_seconds numeric;
  v_percent numeric;
  v_late integer;
  v_early integer;
  v_payable numeric;
  v_exception_status text;
  v_event_type text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_token_hash IS NULL OR char_length(p_token_hash) < 32 THEN RAISE EXCEPTION 'Invalid QR token'; END IF;

  PERFORM public.hr_expire_teacher_qr_sessions(NULL);

  SELECT * INTO v_session
  FROM public.hr_teacher_qr_sessions
  WHERE token_hash = p_token_hash
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'QR challenge not found'; END IF;
  IF v_session.status <> 'active' OR v_session.expires_at <= v_now THEN
    RAISE EXCEPTION 'QR challenge expired or unavailable';
  END IF;

  SELECT * INTO v_occ
  FROM public.hr_teacher_lesson_occurrences
  WHERE id = v_session.occurrence_id AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lesson occurrence not found'; END IF;
  IF v_occ.status IN ('rejected', 'cancelled') THEN RAISE EXCEPTION 'Lesson occurrence is not eligible for attendance'; END IF;

  SELECT user_id INTO v_teacher_user
  FROM public.teachers
  WHERE id = v_occ.teacher_id AND school_id = v_occ.school_id AND status = 'active';
  IF v_teacher_user IS DISTINCT FROM v_user_id THEN RAISE EXCEPTION 'QR challenge belongs to another teacher'; END IF;
  -- The public RPC is callable independently of the server function. Require
  -- fresh assurance from the same teacher, school, occurrence and operation.
  IF NOT EXISTS (
    SELECT 1 FROM public.hr_attendance_assurance_evidence a
    WHERE a.school_id=v_occ.school_id AND a.occurrence_id=v_occ.id
      AND a.purpose=v_session.purpose AND a.actor_user_id=v_user_id
      AND a.qr_valid AND a.identity_valid AND a.time_valid
      AND a.decision IN ('auto_approve','review')
      AND a.captured_at BETWEEN v_now - interval '2 minutes' AND v_now
  ) THEN
    RAISE EXCEPTION 'Recent valid attendance assurance required';
  END IF;


  IF v_occ.occurrence_kind = 'scheduled' AND NOT EXISTS (
    SELECT 1
    FROM public.timetable_slots ts
    JOIN public.academic_schedules sch
      ON sch.id=ts.schedule_id AND sch.school_id=ts.school_id
    WHERE ts.id=v_occ.timetable_slot_id
      AND ts.school_id=v_occ.school_id
      AND ts.class_subject_id=v_occ.class_subject_id
      AND ts.status='active' AND sch.status='published'
      AND sch.valid_from IS NOT NULL AND sch.valid_to IS NOT NULL
      AND v_occ.lesson_date BETWEEN sch.valid_from AND sch.valid_to
      AND ts.starts_at=v_occ.scheduled_starts_at
      AND ts.ends_at=v_occ.scheduled_ends_at
  ) THEN
    RAISE EXCEPTION 'Scheduled QR attendance requires the published official timetable';
  END IF;

  IF v_session.purpose = 'check_in' THEN
    IF v_occ.actual_started_at IS NOT NULL THEN RAISE EXCEPTION 'Teacher already checked in for this lesson'; END IF;
    UPDATE public.hr_teacher_lesson_occurrences
    SET actual_started_at = v_now,
        evidence_method = 'qr',
        evidence_ref = v_session.id::text,
        updated_by = v_user_id
    WHERE id = v_occ.id;

  ELSIF v_session.purpose = 'check_out' THEN
    IF v_occ.actual_started_at IS NULL THEN RAISE EXCEPTION 'Check-in is required before check-out'; END IF;
    IF v_occ.actual_ended_at IS NOT NULL THEN RAISE EXCEPTION 'Teacher already checked out for this lesson'; END IF;
    IF v_occ.contract_id IS NULL THEN RAISE EXCEPTION 'Lesson occurrence has no payroll contract'; END IF;

    SELECT * INTO v_contract
    FROM public.hr_contracts
    WHERE id = v_occ.contract_id
      AND school_id = v_occ.school_id
      AND employment_id = v_occ.employment_id
      AND status = 'active'
      AND deleted_at IS NULL
      AND starts_on <= v_occ.lesson_date
      AND (ends_on IS NULL OR ends_on >= v_occ.lesson_date);
    IF NOT FOUND THEN RAISE EXCEPTION 'No active contract for this occurrence'; END IF;

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
    v_actual_seconds := GREATEST(EXTRACT(EPOCH FROM (v_now - v_occ.actual_started_at)), 0);
    v_percent := LEAST(100, round((v_actual_seconds / v_scheduled_seconds) * 100, 2));
    v_late := GREATEST(floor(EXTRACT(EPOCH FROM (v_occ.actual_started_at - v_scheduled_start)) / 60), 0)::integer;
    v_early := GREATEST(floor(EXTRACT(EPOCH FROM (v_scheduled_end - v_now)) / 60), 0)::integer;

    IF v_percent < v_policy.minimum_attendance_percent THEN
      v_payable := NULL;
      v_exception_status := 'pending_review';
    ELSIF v_late <= v_policy.late_grace_minutes AND v_early <= v_policy.early_leave_grace_minutes THEN
      v_payable := CASE
        WHEN v_contract.salary_type = 'hourly' THEN round(v_scheduled_seconds / 3600.0, 2)
        ELSE v_occ.quantity
      END;
      v_exception_status := 'within_grace';
    ELSIF v_policy.outside_grace_mode = 'proportional' THEN
      v_payable := CASE
        WHEN v_contract.salary_type = 'hourly' THEN round((v_actual_seconds / 3600.0), 2)
        ELSE round(v_occ.quantity * (v_percent / 100), 2)
      END;
      v_exception_status := 'proportional';
    ELSE
      v_payable := NULL;
      v_exception_status := 'pending_review';
    END IF;

    -- QR attendance requires independent RH review before remuneration.
    v_payable := NULL;
    v_exception_status := 'pending_review';

    UPDATE public.hr_teacher_lesson_occurrences
    SET actual_ended_at = v_now,
        evidence_method = 'qr',
        evidence_ref = v_session.id::text,
        late_minutes = v_late,
        early_leave_minutes = v_early,
        attendance_percent = v_percent,
        payable_quantity = v_payable,
        attendance_exception_status = v_exception_status,
        updated_by = v_user_id
    WHERE id = v_occ.id;

    IF v_payable IS NOT NULL AND v_payable > 0 AND v_contract.salary_type IN ('hourly','lesson_hour') THEN
      IF v_contract.salary_type = 'lesson_hour' THEN
        v_rate := v_contract.lesson_hour_rate_kz;
        v_event_type := 'lesson_hour';
      ELSE
        v_rate := v_contract.hourly_rate_kz;
        v_event_type := 'worked_hour';
      END IF;
      IF v_rate IS NULL THEN RAISE EXCEPTION 'Active contract has no applicable unit rate'; END IF;

      INSERT INTO public.hr_compensation_events (
        school_id, employment_id, contract_id, event_date, event_type,
        quantity, unit_rate_kz, source_type, source_id, description,
        validation_status, validated_at, validated_by, created_by
      ) VALUES (
        v_occ.school_id, v_occ.employment_id, v_occ.contract_id, v_occ.lesson_date,
        v_event_type, v_payable, v_rate, 'teacher_lesson_occurrence', v_occ.id,
        CASE
          WHEN v_contract.salary_type = 'hourly' THEN 'Horas docentes confirmadas por presença'
          WHEN v_occ.occurrence_kind = 'substitution' THEN 'Aula de substituição confirmada por QR'
          WHEN v_occ.occurrence_kind = 'extra' THEN 'Aula extraordinária confirmada por QR'
          WHEN v_exception_status = 'proportional' THEN 'Aula confirmada por QR com remuneração proporcional'
          ELSE 'Aula confirmada por check-in/check-out QR'
        END,
        'validated', v_now, v_user_id, v_user_id
      )
      ON CONFLICT (school_id, source_type, source_id, employment_id, event_type)
        WHERE deleted_at IS NULL AND source_type IS NOT NULL AND source_id IS NOT NULL
      DO UPDATE SET quantity = EXCLUDED.quantity, updated_by = v_user_id
      RETURNING id INTO v_event_id;
    ELSE
      v_event_id := NULL;
    END IF;

    IF v_payable IS NOT NULL AND v_payable > 0 THEN
      UPDATE public.hr_teacher_lesson_occurrences
      SET status = 'confirmed',
          confirmed_at = v_now,
          confirmed_by = v_user_id,
          compensation_event_id = v_event_id,
          updated_by = v_user_id
      WHERE id = v_occ.id;
    END IF;
  END IF;

  UPDATE public.hr_teacher_qr_sessions
  SET status = 'used', used_at = v_now, used_by = v_user_id
  WHERE id = v_session.id;

  RETURN QUERY
  SELECT v_occ.id,
         v_session.purpose,
         CASE WHEN v_session.purpose = 'check_out' THEN v_event_id ELSE NULL::uuid END,
         CASE
           WHEN v_session.purpose = 'check_in' THEN 'scheduled'::text
           WHEN v_payable IS NOT NULL AND v_payable > 0 THEN 'confirmed'::text
           ELSE 'pending_review'::text
         END;
END;
$function$

COMMIT;
