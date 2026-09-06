-- SIGA / Onsoft — ciclo operacional de folha salarial
-- Criação de competência, cálculo em lote, totais e aprovação/bloqueio.

CREATE OR REPLACE FUNCTION public.hr_recompute_payroll_run_totals(p_payroll_run_id uuid)
RETURNS public.hr_payroll_runs
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_run public.hr_payroll_runs;
  v_gross numeric(16,2);
  v_deductions numeric(16,2);
  v_net numeric(16,2);
BEGIN
  SELECT * INTO v_run FROM public.hr_payroll_runs WHERE id = p_payroll_run_id;
  IF NOT FOUND OR v_run.school_id <> public.is_school_member(v_run.school_id) THEN
    RAISE EXCEPTION 'Payroll run not accessible';
  END IF;

  SELECT
    COALESCE(sum(gross_amount_kz), 0),
    COALESCE(sum(deductions_kz), 0),
    COALESCE(sum(net_amount_kz), 0)
  INTO v_gross, v_deductions, v_net
  FROM public.hr_payroll_items
  WHERE payroll_run_id = v_run.id
    AND school_id = v_run.school_id
    AND status <> 'cancelled';

  UPDATE public.hr_payroll_runs
  SET total_gross_kz = v_gross,
      total_deductions_kz = v_deductions,
      total_net_kz = v_net,
      updated_by = auth.uid()
  WHERE id = v_run.id
  RETURNING * INTO v_run;

  RETURN v_run;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hr_recompute_payroll_run_totals(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_recompute_payroll_run_totals(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.hr_create_payroll_run(
  p_year integer,
  p_month integer,
  p_notes text DEFAULT NULL
)
RETURNS public.hr_payroll_runs
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_school uuid := public.current_school_id();
  v_role text := public.current_profile_role();
  v_start date;
  v_end date;
  v_run public.hr_payroll_runs;
BEGIN
  IF v_school IS NULL THEN RAISE EXCEPTION 'School context required'; END IF;
  IF v_role NOT IN ('Administrador','Tesouraria') THEN RAISE EXCEPTION 'Insufficient payroll permission'; END IF;
  IF p_year < 2000 OR p_year > 2200 OR p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'Invalid payroll competence';
  END IF;

  v_start := make_date(p_year, p_month, 1);
  v_end := (v_start + interval '1 month - 1 day')::date;

  INSERT INTO public.hr_payroll_runs (
    school_id, competence_year, competence_month, period_start, period_end,
    status, notes, created_by, updated_by
  ) VALUES (
    v_school, p_year, p_month, v_start, v_end,
    'draft', NULLIF(trim(p_notes), ''), auth.uid(), auth.uid()
  )
  ON CONFLICT (school_id, competence_year, competence_month) DO NOTHING
  RETURNING * INTO v_run;

  IF v_run.id IS NULL THEN
    SELECT * INTO v_run FROM public.hr_payroll_runs
    WHERE school_id = v_school AND competence_year = p_year AND competence_month = p_month;
  END IF;

  RETURN v_run;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hr_create_payroll_run(integer,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_create_payroll_run(integer,integer,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.hr_calculate_payroll_run(p_payroll_run_id uuid)
RETURNS TABLE (
  payroll_run_id uuid,
  calculated_items integer,
  skipped_items integer,
  total_gross_kz numeric,
  total_deductions_kz numeric,
  total_net_kz numeric
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_run public.hr_payroll_runs;
  v_emp record;
  v_calculated integer := 0;
  v_skipped integer := 0;
  v_totals public.hr_payroll_runs;
BEGIN
  SELECT * INTO v_run FROM public.hr_payroll_runs WHERE id = p_payroll_run_id FOR UPDATE;
  IF NOT FOUND OR v_run.school_id <> public.is_school_member(v_run.school_id) THEN
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
      -- Não aborta toda a folha por um vínculo inconsistente. Mantém o run em review
      -- e registra item draft/cancelled apenas via revisão administrativa posterior.
      v_skipped := v_skipped + 1;
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
$$;

REVOKE EXECUTE ON FUNCTION public.hr_calculate_payroll_run(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_calculate_payroll_run(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.hr_approve_payroll_run(p_payroll_run_id uuid)
RETURNS public.hr_payroll_runs
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_run public.hr_payroll_runs;
  v_problem_count integer;
BEGIN
  SELECT * INTO v_run FROM public.hr_payroll_runs WHERE id = p_payroll_run_id FOR UPDATE;
  IF NOT FOUND OR v_run.school_id <> public.is_school_member(v_run.school_id) THEN
    RAISE EXCEPTION 'Payroll run not accessible';
  END IF;
  IF public.current_profile_role() NOT IN ('Administrador','Tesouraria') THEN
    RAISE EXCEPTION 'Insufficient payroll approval permission';
  END IF;
  IF v_run.status <> 'review' THEN
    RAISE EXCEPTION 'Payroll run must be in review before approval';
  END IF;

  SELECT count(*) INTO v_problem_count
  FROM public.hr_payroll_items
  WHERE payroll_run_id = v_run.id
    AND school_id = v_run.school_id
    AND status NOT IN ('calculated','approved','cancelled');

  IF v_problem_count > 0 THEN
    RAISE EXCEPTION 'Payroll run has unresolved items';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.hr_payroll_items
    WHERE payroll_run_id = v_run.id AND school_id = v_run.school_id AND status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'Payroll run has no calculated items';
  END IF;

  UPDATE public.hr_payroll_items
  SET status = 'approved', updated_by = auth.uid()
  WHERE payroll_run_id = v_run.id
    AND school_id = v_run.school_id
    AND status = 'calculated';

  PERFORM public.hr_recompute_payroll_run_totals(v_run.id);

  UPDATE public.hr_payroll_runs
  SET status = 'approved',
      approved_at = now(),
      approved_by = auth.uid(),
      updated_by = auth.uid()
  WHERE id = v_run.id
  RETURNING * INTO v_run;

  RETURN v_run;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hr_approve_payroll_run(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_approve_payroll_run(uuid) TO authenticated;

-- Bloqueia mutações financeiras de itens depois de a folha sair da revisão.
CREATE OR REPLACE FUNCTION public.hr_block_locked_payroll_item_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM public.hr_payroll_runs WHERE id = COALESCE(NEW.payroll_run_id, OLD.payroll_run_id);
  IF v_status IN ('approved','processing','paid','cancelled') THEN
    RAISE EXCEPTION 'Payroll run is locked';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER hr_payroll_items_lock_after_approval
  BEFORE INSERT OR UPDATE OR DELETE ON public.hr_payroll_items
  FOR EACH ROW EXECUTE FUNCTION public.hr_block_locked_payroll_item_mutation();

COMMENT ON FUNCTION public.hr_calculate_payroll_run(uuid) IS
  'Calcula todos os vínculos elegíveis da competência, preserva falhas individuais para revisão e recomputa totais.';

NOTIFY pgrst, 'reload schema';
