-- CAPTURADA da produção (supabase_migrations.schema_migrations, versão 20260930193133).
-- Aplicada a 2026-09-30 19:31 UTC fora do repositório; trazida para cá a 2026-10-02
-- (auditoria 11, O4). Corpo sem alterações, confirmado por md5 contra o registo.
-- @@corpo-capturado@@
-- A confirmação manual regista caixa, pagamento, ordem e folha numa transacção.
-- Helper privado privilegiado: guarda completa antes de qualquer leitura/escrita.
CREATE OR REPLACE FUNCTION private.hr_confirm_payroll_payment_item(
  p_school_id uuid, p_payment_item_id uuid, p_result text,
  p_reference text, p_failure_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_item public.hr_payroll_payment_items;
  v_batch public.hr_payroll_payment_batches;
  v_run public.hr_payroll_runs;
  v_payroll public.hr_payroll_items;
  v_expense public.siga_cash_expenses;
  v_cash uuid;
  v_all_paid boolean;
  v_any_paid boolean;
BEGIN
  IF v_actor IS NULL OR NOT COALESCE(private.is_aal2(), false)
    OR COALESCE(private.sga_app_role(p_school_id), '') NOT IN ('Administrador','Tesouraria')
    OR NOT COALESCE(private.has_permission(p_school_id,'finance.payments.create'), false)
    OR EXISTS (SELECT 1 FROM public.staff_module_grants WHERE school_id=p_school_id
      AND user_id=v_actor AND module_key='financeiro' AND level IN ('Nenhum','Leitura')) THEN
    RAISE EXCEPTION 'Sem autorização para confirmar salário. Confirme o vínculo e o 2FA.' USING ERRCODE='42501';
  END IF;
  IF p_result IS NULL OR p_result NOT IN ('paid','failed')
    OR COALESCE(length(btrim(p_reference)),0) NOT BETWEEN 3 AND 160
    OR (p_result='failed' AND COALESCE(length(btrim(p_failure_reason)),0) NOT BETWEEN 3 AND 500) THEN
    RAISE EXCEPTION 'Resultado, referência ou motivo inválido.' USING ERRCODE='22023';
  END IF;
  -- Descobrir o lote sem bloquear; bloquear o lote serializa as confirmações.
  SELECT * INTO v_item FROM public.hr_payroll_payment_items
    WHERE id=p_payment_item_id AND school_id=p_school_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item de pagamento não encontrado.' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_batch FROM public.hr_payroll_payment_batches
    WHERE id=v_item.batch_id AND school_id=p_school_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ordem salarial não encontrada.' USING ERRCODE='22023'; END IF;
  -- Mesma ordem de bloqueio da autorização: lote, item da folha, competência.
  SELECT * INTO v_payroll FROM public.hr_payroll_items
    WHERE id=v_item.payroll_item_id AND school_id=p_school_id
      AND payroll_run_id=v_batch.payroll_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item da folha incompatível com a ordem.' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_run FROM public.hr_payroll_runs
    WHERE id=v_batch.payroll_run_id AND school_id=p_school_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Folha salarial não encontrada.' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_item FROM public.hr_payroll_payment_items
    WHERE id=p_payment_item_id AND school_id=p_school_id AND batch_id=v_batch.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'O item mudou; actualize a ordem.' USING ERRCODE='22023'; END IF;
  IF v_item.status='paid' THEN
    IF p_result<>'paid' OR v_item.provider_reference IS DISTINCT FROM btrim(p_reference) THEN
      RAISE EXCEPTION 'Pagamento já confirmado com outro resultado ou referência.' USING ERRCODE='22023';
    END IF;
    RETURN jsonb_build_object('paid',true,'idempotent',true,'cashExpenseId',v_item.cash_expense_id,
      'batchCompleted',v_batch.status='completed');
  END IF;
  IF v_batch.status NOT IN ('authorized','processing','partial')
    OR v_batch.authorized_by IS NULL OR v_batch.authorized_at IS NULL
    OR v_run.status NOT IN ('approved','processing')
    OR v_payroll.status NOT IN ('approved','processing')
    OR v_item.status NOT IN ('authorized','processing','failed') THEN
    RAISE EXCEPTION 'A ordem e a folha precisam estar autorizadas para confirmação.' USING ERRCODE='22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.hr_payment_settings WHERE school_id=p_school_id
    AND NOT allow_manual_confirmation) THEN
    RAISE EXCEPTION 'Confirmação manual desactivada pela escola.' USING ERRCODE='42501';
  END IF;
  IF v_item.amount_kz IS DISTINCT FROM v_payroll.net_amount_kz OR v_item.amount_kz<=0
    OR v_item.employment_id IS DISTINCT FROM v_payroll.employment_id THEN
    RAISE EXCEPTION 'Beneficiário ou valor incompatível com a folha aprovada.' USING ERRCODE='22023';
  END IF;
  IF p_result='failed' THEN
    IF v_item.cash_expense_id IS NOT NULL THEN
      RAISE EXCEPTION 'Item com saída de caixa requer conciliação antes de registar falha.' USING ERRCODE='22023';
    END IF;
    UPDATE public.hr_payroll_payment_items SET status='failed', provider_reference=btrim(p_reference),
      failure_reason=btrim(p_failure_reason), updated_by=v_actor WHERE id=v_item.id;
    UPDATE public.hr_payroll_payment_batches SET status='partial',updated_by=v_actor WHERE id=v_batch.id;
    RETURN jsonb_build_object('paid',false,'failed',true);
  END IF;
  IF v_item.cash_expense_id IS NOT NULL THEN
    SELECT * INTO v_expense FROM public.siga_cash_expenses
      WHERE id=v_item.cash_expense_id AND school_id=p_school_id FOR UPDATE;
    IF NOT FOUND OR v_expense.status<>'posted' OR v_expense.category<>'Salários'
      OR v_expense.amount IS DISTINCT FROM v_item.amount_kz
      OR v_expense.reference IS DISTINCT FROM btrim(p_reference) THEN
      RAISE EXCEPTION 'Saída de caixa incompatível; concilie o pagamento.' USING ERRCODE='22023';
    END IF;
    v_cash := v_expense.id;
  ELSE
    INSERT INTO public.siga_cash_expenses(school_id,document_number,description,category,amount,
      method,reference,occurred_at,status,created_by,updated_by)
    VALUES(p_school_id,v_batch.batch_number||'-'||v_item.id::text,
      'Pagamento salarial '||v_item.beneficiary_name||' · '||v_batch.batch_number,
      'Salários',v_item.amount_kz,CASE WHEN v_batch.method='cash' THEN 'cash' ELSE 'transfer' END,
      btrim(p_reference),now(),'posted',v_actor,v_actor) RETURNING id INTO v_cash;
  END IF;
  UPDATE public.hr_payroll_payment_items SET status='paid',provider_reference=btrim(p_reference),
    failure_reason=NULL,paid_at=now(),confirmed_by=v_actor,cash_expense_id=v_cash,updated_by=v_actor
    WHERE id=v_item.id;
  UPDATE public.hr_payroll_items SET status='paid',updated_by=v_actor WHERE id=v_payroll.id;
  SELECT count(*)>0 AND bool_and(status='paid'),COALESCE(bool_or(status='paid'),false)
    INTO v_all_paid,v_any_paid FROM public.hr_payroll_payment_items
    WHERE batch_id=v_batch.id AND school_id=p_school_id AND status<>'cancelled';
  UPDATE public.hr_payroll_payment_batches SET
    status=CASE WHEN v_all_paid THEN 'completed' WHEN v_any_paid THEN 'partial' ELSE 'processing' END,
    updated_by=v_actor WHERE id=v_batch.id;
  -- Uma ordem concluída não prova que todos os salários da competência foram pagos.
  IF NOT EXISTS (SELECT 1 FROM public.hr_payroll_items WHERE payroll_run_id=v_run.id
    AND school_id=p_school_id AND status NOT IN ('paid','cancelled')) THEN
    UPDATE public.hr_payroll_runs SET status='paid',paid_at=now(),updated_by=v_actor WHERE id=v_run.id;
  END IF;
  RETURN jsonb_build_object('paid',true,'cashExpenseId',v_cash,'batchCompleted',v_all_paid);
END $$;
REVOKE ALL ON FUNCTION private.hr_confirm_payroll_payment_item(uuid,uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.hr_confirm_payroll_payment_item(uuid,uuid,text,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.hr_confirm_payroll_payment_item(
  p_school_id uuid,p_payment_item_id uuid,p_result text,p_reference text,p_failure_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT private.hr_confirm_payroll_payment_item(p_school_id,p_payment_item_id,p_result,p_reference,p_failure_reason);
$$;
REVOKE ALL ON FUNCTION public.hr_confirm_payroll_payment_item(uuid,uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hr_confirm_payroll_payment_item(uuid,uuid,text,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
