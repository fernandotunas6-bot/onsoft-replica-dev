-- Pacote da liquidação atómica de pagamentos de gateway. JÁ APLICADO na produção
-- (xodgfmxiaunpamctfeea) a 2026-10-02, versão 20261002090137. Idempotente; só service_role
-- executa. Ensaio local: node tests/sql/gateway-settlement.mjs (PGlite).

-- Liquidação de pagamentos de gateway (EMIS/Unitel, AppyPay, PayFlow) numa só transacção.
--
-- Os webhooks correm com a chave de serviço, sem auth.uid() nem aal2, por isso
-- private.register_payment recusa-os sempre e o servidor caía num caminho em quatro
-- passos soltos: somar recibos → validar saldo → inserir recibo → actualizar fatura.
-- Dois avisos simultâneos passavam ambos a validação do saldo e emitiam recibos acima
-- do valor da fatura. Esta função faz os quatro passos com a fatura bloqueada
-- (FOR UPDATE) e devolve o recibo existente quando o mesmo external_id volta.
--
-- Só service_role a executa. Idempotente: pode correr duas vezes.
-- Regras: docs/agents/DATABASE_RULES.md (colunas confirmadas em PRODUCTION_SNAPSHOT.json).

CREATE OR REPLACE FUNCTION private.settle_gateway_payment_service(
  target_school_id uuid,
  target_invoice_id uuid,
  target_amount numeric,
  target_payment_method text,
  target_received_by uuid,
  target_external_id text,
  target_paid_on date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  selected_invoice public.finance_invoices%rowtype;
  existing_receipt public.finance_receipts%rowtype;
  already_paid numeric(18,2);
  amount_due numeric(18,2);
  generated_number text;
  new_receipt_id uuid;
  new_status text;
begin
  if target_amount is null or target_amount <= 0
     or target_payment_method not in ('cash', 'bank_transfer', 'card', 'other') then
    raise exception using errcode = '22023', message = 'Valor ou método de pagamento inválido.';
  end if;
  if target_external_id is null or length(trim(target_external_id)) < 6 then
    raise exception using errcode = '22023', message = 'Identificador da transacção em falta.';
  end if;
  if target_received_by is null then
    raise exception using errcode = '22023',
      message = 'Não há responsável nesta escola para assinar o recibo do gateway.';
  end if;

  -- Bloqueia a fatura: um segundo aviso da mesma fatura espera aqui pelo primeiro.
  select * into selected_invoice from public.finance_invoices
  where school_id = target_school_id and id = target_invoice_id
  for update;
  if selected_invoice.id is null then
    raise exception using errcode = '22023', message = 'Fatura não encontrada para esta escola.';
  end if;

  -- A mesma transacção do provedor já liquidada: devolve o recibo que existe.
  select * into existing_receipt from public.finance_receipts
  where school_id = target_school_id and external_id = target_external_id
  limit 1;
  if existing_receipt.id is not null then
    return jsonb_build_object(
      'alreadyPaid', true,
      'receiptId', existing_receipt.id,
      'receiptNumber', existing_receipt.receipt_number,
      'invoiceStatus', selected_invoice.status
    );
  end if;

  if selected_invoice.status = 'cancelled' then
    raise exception using errcode = '22023', message = 'Fatura cancelada.';
  end if;
  if selected_invoice.status = 'paid' then
    return jsonb_build_object('alreadyPaid', true, 'invoiceStatus', 'paid');
  end if;

  -- Saldo devido = valor - desconto + multa (a multa é gravada antes, pelo servidor).
  amount_due := greatest(
    selected_invoice.amount - coalesce(selected_invoice.discount_amount, 0)
      + coalesce(selected_invoice.penalty_amount, 0),
    0
  );
  select coalesce(sum(amount), 0) into already_paid from public.finance_receipts
  where school_id = target_school_id and invoice_id = target_invoice_id and status = 'issued';
  if already_paid + target_amount > amount_due + 0.009 then
    raise exception using errcode = '22023',
      message = 'O valor do pagamento excede o saldo em aberto da fatura.';
  end if;

  generated_number := private.next_document_number_service(target_school_id, 'receipt', 'REC');
  insert into public.finance_receipts (
    school_id, invoice_id, receipt_number, amount, paid_on, payment_method, received_by,
    status, external_id
  ) values (
    target_school_id, target_invoice_id, generated_number, target_amount, target_paid_on,
    target_payment_method, target_received_by, 'issued', target_external_id
  )
  returning id into new_receipt_id;

  new_status := case
    when already_paid + target_amount >= amount_due - 0.009 then 'paid'
    else 'partially_paid'
  end;
  update public.finance_invoices set status = new_status
  where school_id = target_school_id and id = target_invoice_id;

  return jsonb_build_object(
    'alreadyPaid', false,
    'receiptId', new_receipt_id,
    'receiptNumber', generated_number,
    'invoiceStatus', new_status
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.settle_gateway_payment_service(
  school_id uuid,
  invoice_id uuid,
  amount numeric,
  payment_method text,
  received_by uuid,
  external_id text,
  paid_on date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT private.settle_gateway_payment_service(
    school_id, invoice_id, amount, payment_method, received_by, external_id, paid_on
  );
$function$;

REVOKE ALL ON FUNCTION private.settle_gateway_payment_service(uuid, uuid, numeric, text, uuid, text, date)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_gateway_payment_service(uuid, uuid, numeric, text, uuid, text, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.settle_gateway_payment_service(uuid, uuid, numeric, text, uuid, text, date)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_gateway_payment_service(uuid, uuid, numeric, text, uuid, text, date)
  TO service_role;
