-- O estorno recalculava o estado da fatura sem a multa por atraso.
--
-- `private.register_payment` cobra `valor - desconto + multa`; o estorno comparava
-- os recibos restantes com `valor - desconto`. Numa fatura de 10 000 Kz com 1 000
-- de multa, paga em 5 000 + 5 500 + 500, estornar o recibo de 500 deixava 10 500
-- contra 10 000 e marcava-a «paga» — e `register_payment` recusa faturas pagas,
-- pelo que os 500 em dívida deixavam de poder ser cobrados.
--
-- Medido na produção a 2026-10-24: 38 faturas, nenhuma com multa nem estorno —
-- o defeito ainda não disparou.
--
-- Corpo copiado de `pg_get_functiondef` na produção a 2026-10-24; muda só o
-- cálculo de `v_net`, que passa a ser o mesmo de `register_payment`.

CREATE OR REPLACE FUNCTION private.reverse_finance_receipt(p_school_id uuid, p_receipt_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_receipt public.finance_receipts%ROWTYPE;
  v_invoice public.finance_invoices%ROWTYPE;
  v_paid numeric;
  v_net numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_aal2()
    OR private.sga_app_role(p_school_id) NOT IN ('Administrador','Tesouraria')
    OR NOT private.has_permission(p_school_id,'finance.payments.create')
    OR EXISTS (SELECT 1 FROM public.staff_module_grants WHERE school_id=p_school_id AND user_id=auth.uid() AND module_key='financeiro' AND level IN ('Nenhum','Leitura')) THEN
    RAISE EXCEPTION 'Sem autorização para estornar. Confirme o vínculo e o 2FA.' USING ERRCODE='42501';
  END IF;
  IF COALESCE(length(btrim(p_reason)),0) < 3 THEN RAISE EXCEPTION 'Indique o motivo do estorno.' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_receipt FROM public.finance_receipts WHERE id=p_receipt_id AND school_id=p_school_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recibo não encontrado.' USING ERRCODE='22023'; END IF;
  -- Same lock order as register_payment: invoice first, then receipt.
  IF v_receipt.invoice_id IS NOT NULL THEN
    SELECT * INTO v_invoice FROM public.finance_invoices WHERE id=v_receipt.invoice_id AND school_id=p_school_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Factura do recibo não encontrada.' USING ERRCODE='22023'; END IF;
  END IF;
  SELECT * INTO v_receipt FROM public.finance_receipts WHERE id=p_receipt_id AND school_id=p_school_id FOR UPDATE;
  IF v_receipt.status <> 'issued' THEN RAISE EXCEPTION 'Este recibo já foi estornado.' USING ERRCODE='22023'; END IF;
  UPDATE public.finance_receipts SET status='reversed',reversed_at=now(),reversed_by=auth.uid(),reversal_reason=btrim(p_reason)
    WHERE id=p_receipt_id AND school_id=p_school_id RETURNING * INTO v_receipt;
  IF v_invoice.id IS NOT NULL AND v_invoice.status <> 'cancelled' THEN
    SELECT COALESCE(sum(amount),0) INTO v_paid FROM public.finance_receipts WHERE invoice_id=v_invoice.id AND school_id=p_school_id AND status='issued';
    v_net := greatest(v_invoice.amount-COALESCE(v_invoice.discount_amount,0)+COALESCE(v_invoice.penalty_amount,0),0);
    UPDATE public.finance_invoices SET status=CASE WHEN round(v_paid,2)>=round(v_net,2) AND v_paid>0 THEN 'paid' WHEN v_paid>0 THEN 'partially_paid' ELSE 'open' END
      WHERE id=v_invoice.id AND school_id=p_school_id;
  END IF;
  RETURN to_jsonb(v_receipt);
END $function$;
