-- Registar pagamento contra o total a pagar da fatura (valor menos desconto).
--
-- `private.register_payment` comparava o já pago com `finance_invoices.amount`
-- e ignorava `discount_amount`, enquanto toda a aplicação (faturas, referências
-- Multicaixa, AppyPay, relatórios, SAF-T) usa `amount - discount_amount`. Uma
-- fatura com desconto paga por inteiro ficava `partially_paid` e aceitava
-- pagamentos até ao valor sem desconto.
--
-- Igual à versão capturada em 20260908210000 em tudo o resto: a mesma
-- assinatura, a mesma verificação de 2FA e permissão, o mesmo bloqueio da
-- fatura (FOR UPDATE) e a mesma numeração. CREATE OR REPLACE: idempotente.

CREATE OR REPLACE FUNCTION private.register_payment(target_school_id uuid, target_invoice_id uuid, target_amount numeric, target_payment_method text, target_paid_on date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  selected_invoice public.finance_invoices%rowtype;
  already_paid numeric(18,2);
  invoice_total numeric(18,2);
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

  -- Total a pagar: valor menos desconto (nunca negativo).
  invoice_total := greatest(selected_invoice.amount - coalesce(selected_invoice.discount_amount, 0), 0);

  select coalesce(sum(amount), 0) into already_paid from public.finance_receipts
  where school_id = target_school_id and invoice_id = target_invoice_id and status = 'issued';
  if already_paid + target_amount > invoice_total then
    raise exception using errcode = '22023', message = 'O valor do pagamento excede o saldo em aberto da fatura.';
  end if;

  generated_number := private.next_document_number(target_school_id, 'receipt');
  insert into public.finance_receipts (school_id, invoice_id, receipt_number, amount, paid_on, payment_method, received_by)
  values (target_school_id, target_invoice_id, generated_number, target_amount, target_paid_on, target_payment_method, (select auth.uid()))
  returning id into new_receipt_id;

  new_status := case when already_paid + target_amount >= invoice_total then 'paid' else 'partially_paid' end;
  update public.finance_invoices set status = new_status where school_id = target_school_id and id = target_invoice_id;

  return jsonb_build_object('receiptId', new_receipt_id, 'receiptNumber', generated_number, 'invoiceStatus', new_status);
end;
$function$;
