-- Achado P1 (docs/auditoria/06-auditoria.md, 6.1): finance_invoices.penalty_amount é
-- sempre gravado a 0 -- a "Multa por atraso (%)" que a escola configura em
-- Definições > Cobrança (school_settings, domain "billing", campo late_fee_percent)
-- nunca é lida em lado nenhum. Uma escola que configure multa por atraso não consegue
-- de facto cobrá-la: é um controlo de negócio que existe na UI e não existe na prática.
--
-- Decisão de produto confirmada: a multa aplica-se no momento do pagamento (não por
-- tarefa agendada), à primeira vez que um pagamento é registado depois do prazo de
-- tolerância (grace_days) sobre a data de vencimento. Uma vez aplicada
-- (penalty_amount > 0), não é recalculada em pagamentos parciais seguintes -- evita que
-- a multa "suba" a meio de um plano de pagamento já em curso.
--
-- Continua a partir de 20260924135028 (que já fazia amount_due respeitar
-- discount_amount e penalty_amount); esta migração é quem passa a escrever um
-- penalty_amount que não é sempre zero.

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
  v_billing jsonb;
  v_grace_days integer;
  v_late_fee_percent numeric;
  v_computed_penalty numeric(18,2);
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

  -- Multa por atraso: uma única vez, no primeiro pagamento registado depois da
  -- tolerância. Já há multa (penalty_amount > 0) -- não recalcula.
  if coalesce(selected_invoice.penalty_amount, 0) = 0 then
    select value into v_billing from public.school_settings
    where school_id = target_school_id and domain = 'billing';
    v_grace_days := coalesce((v_billing->>'grace_days')::integer, 0);
    v_late_fee_percent := coalesce((v_billing->>'late_fee_percent')::numeric, 0);
    if v_late_fee_percent > 0
       and selected_invoice.due_date is not null
       and target_paid_on > (selected_invoice.due_date + v_grace_days) then
      v_computed_penalty := round(selected_invoice.amount * v_late_fee_percent / 100, 2);
      update public.finance_invoices
      set penalty_amount = v_computed_penalty
      where school_id = target_school_id and id = target_invoice_id;
      selected_invoice.penalty_amount := v_computed_penalty;
    end if;
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

  return jsonb_build_object(
    'receiptId', new_receipt_id,
    'receiptNumber', generated_number,
    'invoiceStatus', new_status,
    'penaltyAmount', selected_invoice.penalty_amount
  );
end;
$function$;

COMMIT;
