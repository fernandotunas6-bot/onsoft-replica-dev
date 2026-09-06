-- SIGA / Onsoft — aplicar tolerância da presença no check-out QR.
-- Mantém o mesmo contrato da RPC hr_redeem_teacher_qr usado pelo frontend.

CREATE OR REPLACE FUNCTION public.hr_redeem_teacher_qr(
  p_token_hash text
)
RETURNS TABLE (
  occurrence_id uuid,
  purpose text,
  compensation_event_id uuid,
  occurrence_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_session public.hr_teacher_qr_sessions%ROWTYPE;
  v_occ public.hr_teacher_lesson_occurrences%ROWTYPE;
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
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_token_hash IS NULL OR char_length(p_token_hash) < 32 THEN
    RAISE EXCEPTION 'Invalid QR token';
  END IF;

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
  WHERE id = v_session.occurrence_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Lesson occurrence not found'; END IF;
  IF v_occ.status IN ('rejected', 'cancelled') THEN
    RAISE EXCEPTION 'Lesson occurrence is not eligible for attendance';
  END IF;

  SELECT user_id INTO v_teacher_user
  FROM public.teachers
  WHERE id = v_occ.teacher_id
    AND school_id = v_occ.school_id
    AND status = 'active';

  IF v_teacher_user IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'QR challenge belongs to another teacher';
  END IF;

  IF v_session.purpose = 'check_in' THEN
    IF v_occ.actual_started_at IS NOT NULL THEN
      RAISE EXCEPTION 'Teacher already checked in for this lesson';
    END IF;

    UPDATE public.hr_teacher_lesson_occurrences
    SET actual_started_at = v_now,
        evidence_method = 'qr',
        evidence_ref = v_session.id::text,
        updated_by = v_user_id
    WHERE id = v_occ.id;

  ELSIF v_session.purpose = 'check_out' THEN
    IF v_occ.actual_started_at IS NULL THEN
      RAISE EXCEPTION 'Check-in is required before check-out';
    END IF;
    IF v_occ.actual_ended_at IS NOT NULL THEN
      RAISE EXCEPTION 'Teacher already checked out for this lesson';
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

    SELECT * INTO v_policy
    FROM public.hr_teacher_attendance_policies
    WHERE school_id = v_occ.school_id
      AND active
      AND deleted_at IS NULL
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
    ELSIF v_late <= v_policy.late_grace_minutes
       AND v_early <= v_policy.early_leave_grace_minutes THEN
      v_payable := v_occ.quantity;
      v_exception_status := 'within_grace';
    ELSIF v_policy.outside_grace_mode = 'proportional' THEN
      v_payable := round(v_occ.quantity * (v_percent / 100), 2);
      v_exception_status := 'proportional';
    ELSE
      v_payable := NULL;
      v_exception_status := 'pending_review';
    END IF;

    -- Check-out sempre é gravado. Pagamento só nasce quando a política o permite.
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

    IF v_payable IS NOT NULL AND v_payable > 0 THEN
      INSERT INTO public.hr_compensation_events (
        school_id, employment_id, contract_id, event_date, event_type,
        quantity, unit_rate_kz, source_type, source_id, description,
        validation_status, validated_at, validated_by, created_by
      ) VALUES (
        v_occ.school_id, v_occ.employment_id, v_occ.contract_id, v_occ.lesson_date,
        'lesson_hour', v_payable, v_rate, 'teacher_lesson_occurrence', v_occ.id,
        CASE
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

      UPDATE public.hr_teacher_lesson_occurrences
      SET status = 'confirmed',
          confirmed_at = v_now,
          confirmed_by = v_user_id,
          compensation_event_id = v_event_id,
          updated_by = v_user_id
      WHERE id = v_occ.id;
    ELSE
      -- Fora da política: check-out concluído, mas remuneração fica bloqueada para revisão.
      v_event_id := NULL;
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
           WHEN v_event_id IS NOT NULL THEN 'confirmed'::text
           ELSE 'pending_review'::text
         END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hr_redeem_teacher_qr(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_redeem_teacher_qr(text) TO authenticated;

NOTIFY pgrst, 'reload schema';