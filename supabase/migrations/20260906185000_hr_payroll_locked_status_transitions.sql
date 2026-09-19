-- SIGA / Onsoft — folha aprovada é financeiramente imutável, mas o estado
-- operacional ainda precisa avançar de approved -> processing -> paid.

CREATE OR REPLACE FUNCTION public.hr_block_locked_payroll_item_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_payroll_run_id uuid;
  v_run_status text;
  v_status_transition_allowed boolean := false;
BEGIN
  v_payroll_run_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.payroll_run_id ELSE NEW.payroll_run_id END;
  SELECT status INTO v_run_status FROM public.hr_payroll_runs WHERE id = v_payroll_run_id;

  IF v_run_status NOT IN ('approved','processing','paid','cancelled') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP IN ('INSERT','DELETE') THEN
    RAISE EXCEPTION 'Payroll run is locked';
  END IF;

  -- Nenhum valor/identidade/snapshot de cálculo pode mudar após aprovação.
  IF NEW.school_id IS DISTINCT FROM OLD.school_id
     OR NEW.payroll_run_id IS DISTINCT FROM OLD.payroll_run_id
     OR NEW.employment_id IS DISTINCT FROM OLD.employment_id
     OR NEW.contract_id IS DISTINCT FROM OLD.contract_id
     OR NEW.base_amount_kz IS DISTINCT FROM OLD.base_amount_kz
     OR NEW.hourly_amount_kz IS DISTINCT FROM OLD.hourly_amount_kz
     OR NEW.allowances_kz IS DISTINCT FROM OLD.allowances_kz
     OR NEW.bonuses_kz IS DISTINCT FROM OLD.bonuses_kz
     OR NEW.overtime_kz IS DISTINCT FROM OLD.overtime_kz
     OR NEW.deductions_kz IS DISTINCT FROM OLD.deductions_kz
     OR NEW.gross_amount_kz IS DISTINCT FROM OLD.gross_amount_kz
     OR NEW.net_amount_kz IS DISTINCT FROM OLD.net_amount_kz
     OR NEW.calculation_details IS DISTINCT FROM OLD.calculation_details THEN
    RAISE EXCEPTION 'Approved payroll financial values are immutable';
  END IF;

  v_status_transition_allowed :=
       (OLD.status = NEW.status)
    OR (OLD.status = 'approved' AND NEW.status IN ('processing','paid'))
    OR (OLD.status = 'processing' AND NEW.status = 'paid')
    OR (OLD.status = 'paid' AND NEW.status = 'paid');

  IF NOT v_status_transition_allowed THEN
    RAISE EXCEPTION 'Invalid locked payroll item status transition: % -> %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

-- Ao autorizar a ordem, a folha entra em processamento e os seus itens aprovados
-- passam para processing. Isto não altera qualquer valor calculado.
CREATE OR REPLACE FUNCTION public.hr_authorize_payroll_payment_batch(p_batch_id uuid)
RETURNS public.hr_payroll_payment_batches
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_school uuid := public.current_school_id();
  v_role text := public.current_profile_role();
  v_settings public.hr_payment_settings;
  v_batch public.hr_payroll_payment_batches;
BEGIN
  IF v_school IS NULL OR v_role NOT IN ('Administrador','Tesouraria') THEN
    RAISE EXCEPTION 'Insufficient payment authorization permission';
  END IF;

  SELECT * INTO v_batch
  FROM public.hr_payroll_payment_batches
  WHERE id = p_batch_id AND school_id = v_school
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment batch not found'; END IF;
  IF v_batch.status NOT IN ('draft','awaiting_authorization') THEN
    RAISE EXCEPTION 'Payment batch is not awaiting authorization';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.hr_payroll_payment_items
    WHERE batch_id = v_batch.id AND status = 'blocked'
  ) THEN
    RAISE EXCEPTION 'Payment batch has blocked beneficiaries';
  END IF;

  SELECT * INTO v_settings FROM public.hr_payment_settings WHERE school_id = v_school;
  IF COALESCE(v_settings.require_dual_control, true) AND v_batch.prepared_by = auth.uid() THEN
    RAISE EXCEPTION 'Dual control requires a different user to authorize the payment batch';
  END IF;

  UPDATE public.hr_payroll_payment_items
  SET status = 'authorized', updated_by = auth.uid()
  WHERE batch_id = v_batch.id AND status = 'pending';

  UPDATE public.hr_payroll_items pi
  SET status = 'processing', updated_by = auth.uid()
  WHERE pi.payroll_run_id = v_batch.payroll_run_id
    AND pi.school_id = v_school
    AND pi.status = 'approved';

  UPDATE public.hr_payroll_runs
  SET status = 'processing', updated_by = auth.uid()
  WHERE id = v_batch.payroll_run_id
    AND school_id = v_school
    AND status = 'approved';

  UPDATE public.hr_payroll_payment_batches
  SET status = 'authorized',
      authorized_at = now(),
      authorized_by = auth.uid(),
      updated_by = auth.uid()
  WHERE id = v_batch.id
  RETURNING * INTO v_batch;

  RETURN v_batch;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hr_authorize_payroll_payment_batch(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_authorize_payroll_payment_batch(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';