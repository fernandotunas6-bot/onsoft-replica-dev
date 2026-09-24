-- private.register_payment comparava o pagamento acumulado contra
-- finance_invoices.amount (valor bruto), ignorando discount_amount e
-- penalty_amount. Consequência: uma fatura com desconto nunca podia ser
-- marcada "paid" pagando o valor líquido — o sistema continuava a exigir o
-- valor cheio; e uma fatura com multa por atraso ficava "paid" antes do
-- valor realmente devido entrar. Achado P3 (docs/auditoria/06-auditoria.md).
--
-- Corrige para comparar contra amount - discount_amount + penalty_amount,
-- mantendo todo o resto da função (aal2, permissão, lock FOR UPDATE, geração
-- de recibo) exactamente como estava.

BEGIN;

CREATE OR REPLACE FUNCTION private.register_payment(target_school_id uuid, target_invoice_id uuid, target_amount numeric, target_payment_method text, target_paid_on date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  selected_invoice public.finance_invoices%rowtype;
  already_paid numeric(18,2);
  amount_due numeric(18,2);
  generated_number text;
  new_receipt_id uuid;
  new_status text;
begin
  if (select auth.uid()) is null or not private.is_aal2()
     or not private.has_permission(target_school_id, 'finance.payments.create') then
    raise exception using errcode = '42501', message = 'Sem autorização para registar pagamentos.';
  end if;
  if target_amount <= 0 or target_payment_method not in ('cash', 'bank_transfer', 'card', 'other') then
    raise exception using errcode = '22023', message = 'Valor ou método de pagamento inválido.';
  end if;

  select * into selected_invoice from public.finance_invoices
  where school_id = target_school_id and id = target_invoice_id and status in ('open', 'partially_paid')
  for update;
  if selected_invoice.id is null then
    raise exception using errcode = '22023', message = 'Fatura inválida, cancelada ou já paga.';
  end if;

  amount_due := selected_invoice.amount
    - coalesce(selected_invoice.discount_amount, 0)
    + coalesce(selected_invoice.penalty_amount, 0);

  select coalesce(sum(amount), 0) into already_paid from public.finance_receipts
  where school_id = target_school_id and invoice_id = target_invoice_id and status = 'issued';
  if already_paid + target_amount > amount_due then
    raise exception using errcode = '22023', message = 'O valor do pagamento excede o saldo em aberto da fatura.';
  end if;

  generated_number := private.next_document_number(target_school_id, 'receipt');
  insert into public.finance_receipts (school_id, invoice_id, receipt_number, amount, paid_on, payment_method, received_by)
  values (target_school_id, target_invoice_id, generated_number, target_amount, target_paid_on, target_payment_method, (select auth.uid()))
  returning id into new_receipt_id;

  new_status := case when already_paid + target_amount >= amount_due then 'paid' else 'partially_paid' end;
  update public.finance_invoices set status = new_status where school_id = target_school_id and id = target_invoice_id;

  return jsonb_build_object('receiptId', new_receipt_id, 'receiptNumber', generated_number, 'invoiceStatus', new_status);
end;
$function$;

COMMIT;
