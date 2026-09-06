-- SIGA / Onsoft — presença docente para mensalistas, horistas e hora/aula
-- Corrige o cálculo por política, amplia materialização para contratos mensais/horários
-- e transforma ausência sem check-in em falta PENDENTE (nunca desconto automático).

-- ---------------------------------------------------------------------------
-- 1) Materializar aulas para qualquer contrato docente activo.
-- A ocorrência é prova de assiduidade; o contrato decide se presença soma remuneração
-- ou se a ausência validada desconta do salário-base.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_materialize_teacher_lessons(
  p_from date,
  p_to date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_school_id uuid := (SELECT public.current_school_id());
  v_role text := (SELECT public.current_profile_role());
  v_inserted integer := 0;
BEGIN
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'School context required'; END IF;
  IF v_role NOT IN ('Administrador', 'Tesouraria') THEN RAISE EXCEPTION 'Insufficient HR permission'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN RAISE EXCEPTION 'Invalid materialization range'; END IF;
  IF (p_to - p_from) > 31 THEN RAISE EXCEPTION 'Materialization range cannot exceed 31 days'; END IF;

  INSERT INTO public.hr_teacher_lesson_occurrences (
    school_id, timetable_slot_id, class_subject_id, teacher_id,
    employment_id, contract_id, lesson_date,
    scheduled_starts_at, scheduled_ends_at, quantity, status, created_by
  )
  SELECT
    v_school_id, ts.id, cs.id, cs.teacher_id,
    link.employment_id, contract.id, d::date,
    ts.starts_at, ts.ends_at, 1, 'scheduled', (SELECT auth.uid())
  FROM generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') AS g(d)
  JOIN public.timetable_slots ts
    ON ts.school_id = v_school_id
   AND ts.status = 'active'
   AND ts.weekday = EXTRACT(ISODOW FROM d)::integer
  JOIN public.class_subjects cs
    ON cs.id = ts.class_subject_id
   AND cs.school_id = v_school_id
   AND cs.status = 'active'
   AND cs.teacher_id IS NOT NULL
  JOIN public.class_groups cg
    ON cg.id = cs.class_group_id
   AND cg.school_id = v_school_id
   AND cg.status = 'active'
  JOIN public.terms term
    ON term.school_id = v_school_id
   AND term.academic_year_id = cg.academic_year_id
   AND d::date BETWEEN term.starts_on AND term.ends_on
  JOIN public.hr_teacher_employment_links link
    ON link.school_id = v_school_id
   AND link.teacher_id = cs.teacher_id
   AND link.status = 'active'
   AND link.deleted_at IS NULL
   AND link.starts_on <= d::date
   AND (link.ends_on IS NULL OR link.ends_on >= d::date)
  JOIN LATERAL (
    SELECT hc.id
    FROM public.hr_contracts hc
    WHERE hc.school_id = v_school_id
      AND hc.employment_id = link.employment_id
      AND hc.status = 'active'
      AND hc.deleted_at IS NULL
      AND hc.starts_on <= d::date
      AND (hc.ends_on IS NULL OR hc.ends_on >= d::date)
    ORDER BY hc.starts_on DESC, hc.created_at DESC
    LIMIT 1
  ) contract ON true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.calendar_events ce
    WHERE ce.school_id = v_school_id
      AND ce.deleted_at IS NULL
      AND ce.category = 'holiday'
      AND d::date BETWEEN ce.event_date AND COALESCE(ce.ends_on, ce.event_date)
  )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION public.hr_materialize_teacher_lessons(date, date) IS
  'Materializa aulas para contratos mensais, horários ou hora/aula; a política remuneratória decide o efeito financeiro.';

-- ---------------------------------------------------------------------------
-- 2) QR unificado por tipo de contrato.
-- mensal: confirma presença, sem criar acréscimo;
-- hourly: cria worked_hour pelas horas efectivas/pagáveis;
-- lesson_hour: cria lesson_hour pela quantidade pagável.
-- ---------------------------------------------------------------------------
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
$$;

-- ---------------------------------------------------------------------------
-- 3) Detectar automaticamente aula mensalista/horista sem presença.
-- Cria falta PENDENTE; não desconta nem classifica definitivamente sozinho.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_detect_missed_teacher_lessons(
  p_until date DEFAULT CURRENT_DATE
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_school_id uuid := (SELECT public.current_school_id());
  v_role text := (SELECT public.current_profile_role());
  v_inserted integer := 0;
BEGIN
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'School context required'; END IF;
  IF v_role NOT IN ('Administrador','Tesouraria') THEN RAISE EXCEPTION 'Insufficient HR permission'; END IF;

  INSERT INTO public.hr_absence_events (
    school_id, employment_id, contract_id, absence_date,
    absence_type, duration_minutes, deduction_multiplier,
    source_type, source_id, reason, validation_status, created_by
  )
  SELECT
    o.school_id,
    o.employment_id,
    o.contract_id,
    o.lesson_date,
    'unjustified',
    GREATEST(
      1,
      floor(EXTRACT(EPOCH FROM (
        ((o.lesson_date + o.scheduled_ends_at)::timestamp AT TIME ZONE 'Africa/Luanda') -
        ((o.lesson_date + o.scheduled_starts_at)::timestamp AT TIME ZONE 'Africa/Luanda')
      )) / 60)::integer
    ),
    1,
    'teacher_lesson_missed',
    o.id,
    'Ausência detectada automaticamente a partir do horário; aguarda classificação/justificação',
    'pending',
    (SELECT auth.uid())
  FROM public.hr_teacher_lesson_occurrences o
  JOIN public.hr_contracts c
    ON c.id = o.contract_id
   AND c.school_id = o.school_id
   AND c.employment_id = o.employment_id
   AND c.status = 'active'
   AND c.deleted_at IS NULL
  WHERE o.school_id = v_school_id
    AND o.deleted_at IS NULL
    AND o.lesson_date <= p_until
    AND o.status = 'scheduled'
    AND o.actual_started_at IS NULL
    AND ((o.lesson_date + o.scheduled_ends_at)::timestamp AT TIME ZONE 'Africa/Luanda') < now()
    AND c.salary_type IN ('monthly','hourly')
  ON CONFLICT (school_id, source_type, source_id, employment_id)
    WHERE deleted_at IS NULL AND source_type IS NOT NULL AND source_id IS NOT NULL
  DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hr_detect_missed_teacher_lessons(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_detect_missed_teacher_lessons(date) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) Corrigir cálculo de folha com estado explícito de existência da política.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_calculate_payroll_item(
  p_payroll_run_id uuid,
  p_employment_id uuid
)
RETURNS public.hr_payroll_items
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_run public.hr_payroll_runs;
  v_emp public.hr_employments;
  v_contract public.hr_contracts;
  v_policy public.hr_contract_remuneration_policies;
  v_has_policy boolean := false;
  v_model text;
  v_base numeric(14,2) := 0;
  v_hourly numeric(14,2) := 0;
  v_allowances numeric(14,2) := 0;
  v_bonuses numeric(14,2) := 0;
  v_overtime numeric(14,2) := 0;
  v_absence_deduction numeric(14,2) := 0;
  v_gross numeric(14,2) := 0;
  v_net numeric(14,2) := 0;
  v_item public.hr_payroll_items;
BEGIN
  SELECT * INTO v_run FROM public.hr_payroll_runs WHERE id = p_payroll_run_id;
  IF NOT FOUND OR v_run.school_id <> public.is_school_member(v_run.school_id) THEN RAISE EXCEPTION 'Payroll run not accessible'; END IF;
  IF v_run.status NOT IN ('draft','calculating','review') THEN RAISE EXCEPTION 'Payroll run is locked for calculation'; END IF;

  SELECT * INTO v_emp FROM public.hr_employments
  WHERE id = p_employment_id AND school_id = v_run.school_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employment not found in payroll school'; END IF;

  SELECT * INTO v_contract
  FROM public.hr_contracts
  WHERE employment_id = p_employment_id
    AND school_id = v_run.school_id
    AND deleted_at IS NULL
    AND status = 'active'
    AND starts_on <= v_run.period_end
    AND (ends_on IS NULL OR ends_on >= v_run.period_start)
  ORDER BY starts_on DESC, created_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'No active contract for payroll period'; END IF;

  SELECT * INTO v_policy
  FROM public.hr_contract_remuneration_policies
  WHERE contract_id = v_contract.id AND school_id = v_run.school_id AND active = true;
  v_has_policy := FOUND;

  IF v_has_policy THEN
    v_model := v_policy.remuneration_model;
  ELSE
    v_model := CASE WHEN v_contract.salary_type = 'monthly' THEN 'fixed_deduct_absence' ELSE 'validated_units' END;
  END IF;

  IF v_model IN ('fixed_deduct_absence','hybrid') THEN v_base := v_contract.base_salary_kz; END IF;

  SELECT
    COALESCE(sum(amount_kz) FILTER (WHERE event_type = 'allowance'),0),
    COALESCE(sum(amount_kz) FILTER (WHERE event_type = 'bonus'),0),
    COALESCE(sum(amount_kz) FILTER (
      WHERE event_type = 'overtime' AND (NOT v_has_policy OR v_policy.allow_overtime_additions)
    ),0)
  INTO v_allowances, v_bonuses, v_overtime
  FROM public.hr_compensation_events
  WHERE school_id = v_run.school_id
    AND employment_id = p_employment_id
    AND event_date BETWEEN v_run.period_start AND v_run.period_end
    AND validation_status = 'validated'
    AND deleted_at IS NULL;

  SELECT COALESCE(sum(amount_kz),0)
  INTO v_hourly
  FROM public.hr_compensation_events
  WHERE school_id = v_run.school_id
    AND employment_id = p_employment_id
    AND event_date BETWEEN v_run.period_start AND v_run.period_end
    AND validation_status = 'validated'
    AND deleted_at IS NULL
    AND (
      (event_type = 'worked_hour' AND (v_model = 'validated_units' OR (v_has_policy AND v_policy.allow_validated_hour_additions)))
      OR
      (event_type = 'lesson_hour' AND (v_model = 'validated_units' OR (v_has_policy AND v_policy.allow_validated_lesson_additions)))
    );

  IF v_model IN ('fixed_deduct_absence','hybrid') THEN
    IF NOT v_has_policy THEN
      IF EXISTS (
        SELECT 1 FROM public.hr_absence_events ae
        WHERE ae.school_id = v_run.school_id
          AND ae.employment_id = p_employment_id
          AND ae.absence_date BETWEEN v_run.period_start AND v_run.period_end
          AND ae.validation_status = 'validated'
          AND ae.deleted_at IS NULL
      ) THEN
        RAISE EXCEPTION 'Monthly contract has validated absences but no remuneration policy';
      END IF;
    ELSE
      SELECT COALESCE(sum(
        CASE
          WHEN ae.absence_type = 'unjustified' AND v_policy.deduct_unjustified_absence THEN
            (v_contract.base_salary_kz / v_policy.monthly_divisor_days)
            * (ae.duration_minutes::numeric / v_policy.standard_workday_minutes)
            * ae.deduction_multiplier
          WHEN ae.absence_type = 'justified_unpaid' AND v_policy.deduct_justified_unpaid_absence THEN
            (v_contract.base_salary_kz / v_policy.monthly_divisor_days)
            * (ae.duration_minutes::numeric / v_policy.standard_workday_minutes)
            * ae.deduction_multiplier
          WHEN ae.absence_type = 'justified_paid' AND v_policy.deduct_justified_paid_absence THEN
            (v_contract.base_salary_kz / v_policy.monthly_divisor_days)
            * (ae.duration_minutes::numeric / v_policy.standard_workday_minutes)
            * ae.deduction_multiplier
          ELSE 0
        END
      ),0)
      INTO v_absence_deduction
      FROM public.hr_absence_events ae
      WHERE ae.school_id = v_run.school_id
        AND ae.employment_id = p_employment_id
        AND (ae.contract_id IS NULL OR ae.contract_id = v_contract.id)
        AND ae.absence_date BETWEEN v_run.period_start AND v_run.period_end
        AND ae.validation_status = 'validated'
        AND ae.deleted_at IS NULL;
    END IF;
  END IF;

  v_gross := v_base + v_hourly + v_allowances + v_bonuses + v_overtime;
  v_absence_deduction := LEAST(round(v_absence_deduction,2), v_gross);
  v_net := GREATEST(v_gross - v_absence_deduction,0);

  INSERT INTO public.hr_payroll_items (
    school_id, payroll_run_id, employment_id, contract_id,
    base_amount_kz, hourly_amount_kz, allowances_kz, bonuses_kz, overtime_kz,
    deductions_kz, gross_amount_kz, net_amount_kz, status,
    calculation_details, created_by, updated_by
  ) VALUES (
    v_run.school_id, v_run.id, v_emp.id, v_contract.id,
    v_base, v_hourly, v_allowances, v_bonuses, v_overtime,
    v_absence_deduction, v_gross, v_net, 'calculated',
    jsonb_build_object(
      'salary_type',v_contract.salary_type,
      'remuneration_model',v_model,
      'policy_configured',v_has_policy,
      'contract_id',v_contract.id,
      'absence_deduction_kz',v_absence_deduction,
      'calculated_at',now(),
      'period_start',v_run.period_start,
      'period_end',v_run.period_end
    ),
    auth.uid(),auth.uid()
  )
  ON CONFLICT (payroll_run_id, employment_id) DO UPDATE SET
    contract_id = EXCLUDED.contract_id,
    base_amount_kz = EXCLUDED.base_amount_kz,
    hourly_amount_kz = EXCLUDED.hourly_amount_kz,
    allowances_kz = EXCLUDED.allowances_kz,
    bonuses_kz = EXCLUDED.bonuses_kz,
    overtime_kz = EXCLUDED.overtime_kz,
    deductions_kz = EXCLUDED.deductions_kz,
    gross_amount_kz = EXCLUDED.gross_amount_kz,
    net_amount_kz = EXCLUDED.net_amount_kz,
    status = EXCLUDED.status,
    calculation_details = EXCLUDED.calculation_details,
    updated_by = auth.uid()
  RETURNING * INTO v_item;

  RETURN v_item;
END;
$$;

NOTIFY pgrst, 'reload schema';
