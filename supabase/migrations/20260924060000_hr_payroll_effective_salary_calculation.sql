-- Preserve existing calculation; apply effective-dated approved amendments to base and absence deductions.
CREATE OR REPLACE FUNCTION public.hr_calculate_payroll_item(p_payroll_run_id uuid, p_employment_id uuid)
 RETURNS hr_payroll_items
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_run public.hr_payroll_runs;
  v_emp public.hr_employments;
  v_contract public.hr_contracts;
  v_policy public.hr_contract_remuneration_policies;
  v_has_policy boolean := false;
  v_model text;
  v_base numeric(14,2) := 0;
  v_effective_base numeric(14,2) := 0;
  v_midperiod_amendments integer := 0;
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
  IF NOT FOUND OR NOT public.is_school_member(v_run.school_id) THEN RAISE EXCEPTION 'Payroll run not accessible'; END IF;
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

  v_effective_base := v_contract.base_salary_kz;
  IF v_model IN ('fixed_deduct_absence','hybrid') THEN
    SELECT count(*) INTO v_midperiod_amendments
    FROM public.hr_contract_salary_amendments a
    WHERE a.contract_id=v_contract.id AND a.school_id=v_run.school_id
      AND a.effective_on>v_run.period_start AND a.effective_on<=v_run.period_end;
    IF v_midperiod_amendments>0 THEN
      RAISE EXCEPTION 'Alteração salarial durante a competência exige cálculo proporcional específico';
    END IF;
    SELECT coalesce(
      (SELECT a.new_base_salary_kz FROM public.hr_contract_salary_amendments a
       WHERE a.contract_id=v_contract.id AND a.school_id=v_run.school_id
         AND a.effective_on<=v_run.period_start
       ORDER BY a.effective_on DESC,a.created_at DESC LIMIT 1),
      v_contract.base_salary_kz
    ) INTO v_effective_base;
    v_base := v_effective_base;
  END IF;

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
            (v_effective_base / v_policy.monthly_divisor_days)
            * (ae.duration_minutes::numeric / v_policy.standard_workday_minutes)
            * ae.deduction_multiplier
          WHEN ae.absence_type = 'justified_unpaid' AND v_policy.deduct_justified_unpaid_absence THEN
            (v_effective_base / v_policy.monthly_divisor_days)
            * (ae.duration_minutes::numeric / v_policy.standard_workday_minutes)
            * ae.deduction_multiplier
          WHEN ae.absence_type = 'justified_paid' AND v_policy.deduct_justified_paid_absence THEN
            (v_effective_base / v_policy.monthly_divisor_days)
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
      'effective_base_salary_kz',v_effective_base,
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
$function$
;
