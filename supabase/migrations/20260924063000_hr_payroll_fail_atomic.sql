-- Fail atomically rather than silently skipping eligible employees.
CREATE OR REPLACE FUNCTION public.hr_calculate_payroll_run(p_payroll_run_id uuid)
 RETURNS TABLE(payroll_run_id uuid, calculated_items integer, skipped_items integer, total_gross_kz numeric, total_deductions_kz numeric, total_net_kz numeric)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_run public.hr_payroll_runs;
  v_emp record;
  v_calculated integer := 0;
  v_skipped integer := 0;
  v_totals public.hr_payroll_runs;
BEGIN
  SELECT * INTO v_run FROM public.hr_payroll_runs WHERE id = p_payroll_run_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_school_member(v_run.school_id) THEN
    RAISE EXCEPTION 'Payroll run not accessible';
  END IF;
  IF public.current_profile_role() NOT IN ('Administrador','Tesouraria') THEN
    RAISE EXCEPTION 'Insufficient payroll permission';
  END IF;
  IF v_run.status NOT IN ('draft','calculating','review') THEN
    RAISE EXCEPTION 'Payroll run is locked for calculation';
  END IF;

  UPDATE public.hr_payroll_runs
  SET status = 'calculating', updated_by = auth.uid()
  WHERE id = v_run.id;

  FOR v_emp IN
    SELECT DISTINCT e.id
    FROM public.hr_employments e
    WHERE e.school_id = v_run.school_id
      AND e.deleted_at IS NULL
      AND e.status = 'active'
      AND e.hire_date <= v_run.period_end
      AND (e.termination_date IS NULL OR e.termination_date >= v_run.period_start)
      AND EXISTS (
        SELECT 1 FROM public.hr_contracts c
        WHERE c.school_id = v_run.school_id
          AND c.employment_id = e.id
          AND c.deleted_at IS NULL
          AND c.status = 'active'
          AND c.starts_on <= v_run.period_end
          AND (c.ends_on IS NULL OR c.ends_on >= v_run.period_start)
      )
  LOOP
    BEGIN
      PERFORM public.hr_calculate_payroll_item(v_run.id, v_emp.id);
      v_calculated := v_calculated + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Falha no cálculo salarial do vínculo %: %',v_emp.id,SQLERRM
        USING ERRCODE='P0001', HINT='Corrija a causa e volte a calcular a competência; nenhuma folha parcial é aprovada.';
    END;
  END LOOP;

  SELECT * INTO v_totals FROM public.hr_recompute_payroll_run_totals(v_run.id);

  UPDATE public.hr_payroll_runs
  SET status = 'review', updated_by = auth.uid()
  WHERE id = v_run.id
  RETURNING * INTO v_totals;

  RETURN QUERY SELECT
    v_run.id,
    v_calculated,
    v_skipped,
    v_totals.total_gross_kz,
    v_totals.total_deductions_kz,
    v_totals.total_net_kz;
END;
$function$
;
