-- SIGA / Onsoft — sincronizar destinos adicionados após criação da ordem salarial.

CREATE OR REPLACE FUNCTION public.hr_refresh_payroll_payment_batch(p_batch_id uuid)
RETURNS public.hr_payroll_payment_batches
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_school uuid := public.current_school_id();
  v_role text := public.current_profile_role();
  v_batch public.hr_payroll_payment_batches;
BEGIN
  IF v_school IS NULL OR v_role NOT IN ('Administrador','Tesouraria') THEN
    RAISE EXCEPTION 'Insufficient payroll payment permission';
  END IF;

  SELECT * INTO v_batch
  FROM public.hr_payroll_payment_batches
  WHERE id = p_batch_id AND school_id = v_school
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment batch not found'; END IF;
  IF v_batch.status NOT IN ('draft','awaiting_authorization') THEN
    RAISE EXCEPTION 'Payment batch can no longer refresh beneficiaries';
  END IF;

  UPDATE public.hr_payroll_payment_items i
  SET destination_id = dest.id,
      beneficiary_name = COALESCE(dest.beneficiary_name, i.beneficiary_name),
      destination_label = CASE
        WHEN dest.method = 'transfer' AND dest.iban IS NOT NULL THEN concat('IBAN ••••', right(regexp_replace(dest.iban, '\s', '', 'g'), 4))
        WHEN dest.method = 'transfer' AND dest.account_number IS NOT NULL THEN concat('Conta ••••', right(dest.account_number, 4))
        WHEN dest.method = 'cash' THEN 'Pagamento em numerário'
        ELSE dest.destination_reference
      END,
      status = 'pending',
      block_reason = NULL,
      updated_by = auth.uid()
  FROM public.hr_payment_destinations dest
  WHERE i.batch_id = v_batch.id
    AND i.school_id = v_school
    AND i.status = 'blocked'
    AND dest.id = (
      SELECT d2.id
      FROM public.hr_payment_destinations d2
      WHERE d2.school_id = v_school
        AND d2.employment_id = i.employment_id
        AND d2.active
        AND d2.deleted_at IS NULL
      ORDER BY d2.is_primary DESC, d2.created_at DESC
      LIMIT 1
    );

  UPDATE public.hr_payroll_payment_batches b
  SET payable_count = COALESCE((SELECT count(*) FROM public.hr_payroll_payment_items i WHERE i.batch_id = b.id AND i.status = 'pending'),0),
      blocked_count = COALESCE((SELECT count(*) FROM public.hr_payroll_payment_items i WHERE i.batch_id = b.id AND i.status = 'blocked'),0),
      status = CASE
        WHEN EXISTS (SELECT 1 FROM public.hr_payroll_payment_items i WHERE i.batch_id = b.id AND i.status = 'blocked') THEN 'draft'
        ELSE 'awaiting_authorization'
      END,
      updated_by = auth.uid()
  WHERE b.id = v_batch.id
  RETURNING * INTO v_batch;

  RETURN v_batch;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hr_refresh_payroll_payment_batch(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_refresh_payroll_payment_batch(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';