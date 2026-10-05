-- Multa por atraso igual em todos os caminhos de pagamento.
--
-- Até aqui o webhook EMIS/Unitel cobrava `valor − desconto + multa`, e a tesouraria
-- (esta função) cobrava `valor − desconto`: 20260927190000 repôs o desconto mas tirou
-- a multa que 20260924143000 tinha introduzido. O mesmo encarregado pagava valores
-- diferentes conforme o canal.
--
-- Regra (igual a src/features/finance/late-fee.ts):
--   * multa = late_fee_percent % do valor da fatura (domínio `billing` de school_settings),
--     arredondada ao cêntimo;
--   * aplica-se quando paid_on > due_date + grace_days;
--   * fica gravada em penalty_amount ao primeiro pagamento depois do prazo e não é
--     recalculada; uma multa gravada faz parte da dívida em qualquer canal;
--   * late_fee_scope = 'electronic' → no balcão (dinheiro, transferência) não se
--     aplica; 'all' (ou ausente) → aplica-se sempre.
-- Total a pagar = greatest(valor − desconto, 0) + multa.
--
-- Mesma assinatura, verificação de 2FA e permissão, bloqueio (FOR UPDATE) e numeração
-- de 20260927190000. A 2026-10-04 nenhuma escola tinha multa configurada (0 linhas de
-- `billing` com late_fee_percent > 0): nada muda até uma escola a definir.
-- CREATE OR REPLACE: idempotente. Regras: docs/agents/DATABASE_RULES.md.

CREATE OR REPLACE FUNCTION private.register_payment(target_school_id uuid, target_invoice_id uuid, target_amount numeric, target_payment_method text, target_paid_on date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  selected_invoice public.finance_invoices%rowtype;
  billing jsonb;
  fee_percent numeric;
  grace integer;
  applies_to text;
  penalty numeric(18,2);
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

  -- Multa por atraso (ver cabeçalho).
  penalty := coalesce(selected_invoice.penalty_amount, 0);
  if penalty = 0 and selected_invoice.due_date is not null then
    select s.value into billing from public.school_settings s
    where s.school_id = target_school_id and s.domain = 'billing'
    limit 1;
    fee_percent := least(greatest(coalesce((billing->>'late_fee_percent')::numeric, 0), 0), 100);
    grace := least(greatest(coalesce((billing->>'grace_days')::numeric, 0), 0), 60)::integer;
    applies_to := coalesce(billing->>'late_fee_scope', 'all');
    if fee_percent > 0
       and target_paid_on > selected_invoice.due_date + grace
       and not (applies_to = 'electronic' and target_payment_method in ('cash', 'bank_transfer')) then
      penalty := round(selected_invoice.amount * fee_percent / 100, 2);
      update public.finance_invoices set penalty_amount = penalty
      where school_id = target_school_id and id = target_invoice_id;
    end if;
  end if;

  -- Total a pagar: valor menos desconto (nunca negativo), mais a multa.
  invoice_total := greatest(selected_invoice.amount - coalesce(selected_invoice.discount_amount, 0), 0) + penalty;

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

  return jsonb_build_object(
    'receiptId', new_receipt_id,
    'receiptNumber', generated_number,
    'invoiceStatus', new_status,
    'penaltyAmount', penalty,
    'amountDue', invoice_total
  );
end;
$function$;
