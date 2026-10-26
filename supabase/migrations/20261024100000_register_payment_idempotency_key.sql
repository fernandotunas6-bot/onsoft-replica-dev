-- Pagamento manual idempotente.
--
-- O formulário bloqueia o duplo clique, mas não a repetição depois de um tempo
-- esgotado: se o primeiro pedido entrou e a resposta se perdeu, voltar a carregar
-- em «Confirmar» emitia um segundo recibo da mesma quantia. O gateway já se defende
-- pelo `external_id`; o pagamento na tesouraria não tinha nada equivalente.
--
-- O formulário passa a gerar uma chave ao abrir e a reenviá-la em cada tentativa.
-- `register_payment` devolve o recibo existente quando a chave já entrou, e recusa
-- a chave reutilizada noutra fatura ou noutra quantia.
--
-- O corpo de `private.register_payment` vem de `pg_get_functiondef` na produção a
-- 2026-10-24 (md5 do corpo 3859155b78ee30a92d77f74bde6c32eb); acrescenta-se só o
-- bloco da chave e a coluna no insert. As permissões repõem as da produção:
-- EXECUTE para authenticated (e service_role no invólucro público), nada para anon.
-- O parâmetro novo tem valor por omissão, por isso as chamadas actuais, sem chave,
-- continuam a funcionar.

ALTER TABLE public.finance_receipts
  ADD COLUMN IF NOT EXISTS idempotency_key uuid;

COMMENT ON COLUMN public.finance_receipts.idempotency_key IS
  'Chave do pedido de pagamento na tesouraria. Nula nos recibos anteriores e nos do gateway (que usam external_id).';

CREATE UNIQUE INDEX IF NOT EXISTS finance_receipts_school_idempotency_key
  ON public.finance_receipts (school_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

DROP FUNCTION IF EXISTS public.register_payment(uuid, uuid, numeric, text, date);
DROP FUNCTION IF EXISTS private.register_payment(uuid, uuid, numeric, text, date);
-- E a desta migração, para poder correr outra vez sem falhar no CREATE.
DROP FUNCTION IF EXISTS public.register_payment(uuid, uuid, numeric, text, date, uuid);
DROP FUNCTION IF EXISTS private.register_payment(uuid, uuid, numeric, text, date, uuid);

CREATE FUNCTION private.register_payment(target_school_id uuid, target_invoice_id uuid, target_amount numeric, target_payment_method text, target_paid_on date DEFAULT CURRENT_DATE, target_idempotency_key uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  selected_invoice public.finance_invoices%rowtype;
  already_paid numeric(18,2);
  invoice_total numeric(18,2);
  late_fee numeric(18,2);
  generated_number text;
  new_receipt_id uuid;
  new_status text;
  replayed public.finance_receipts%rowtype;
begin
  if (select auth.uid()) is null or not private.is_aal2()
     or not private.has_permission(target_school_id, 'finance.payments.create') then
    raise exception using errcode = '42501', message = 'Sem autorização para registar pagamentos.';
  end if;
  if target_amount <= 0 or target_payment_method not in ('cash', 'bank_transfer', 'card', 'other') then
    raise exception using errcode = '22023', message = 'Valor ou método de pagamento inválido.';
  end if;

  -- Repetição do mesmo pedido (tempo esgotado, resposta perdida): devolve o recibo
  -- que já entrou em vez de emitir outro. A fatura é trancada antes da leitura, para
  -- que dois envios em paralelo com a mesma chave fiquem em fila.
  if target_idempotency_key is not null then
    perform 1 from public.finance_invoices
    where school_id = target_school_id and id = target_invoice_id
    for update;
    select * into replayed from public.finance_receipts
    where school_id = target_school_id and idempotency_key = target_idempotency_key;
    if replayed.id is not null then
      if replayed.invoice_id is distinct from target_invoice_id or replayed.amount <> target_amount then
        raise exception using errcode = '22023', message = 'Esta chave de pagamento já foi usada noutro pagamento.';
      end if;
      return jsonb_build_object(
        'receiptId', replayed.id,
        'receiptNumber', replayed.receipt_number,
        'invoiceStatus', (select status from public.finance_invoices
                          where school_id = target_school_id and id = target_invoice_id),
        'replayed', true
      );
    end if;
  end if;

  select * into selected_invoice from public.finance_invoices
  where school_id = target_school_id and id = target_invoice_id and status in ('open', 'partially_paid')
  for update;
  if selected_invoice.id is null then
    raise exception using errcode = '22023', message = 'Fatura inválida, cancelada ou já paga.';
  end if;

  -- Multa por atraso (regra da escola, uma vez): ver private.late_fee_due.
  late_fee := private.late_fee_due(
    target_school_id, selected_invoice.amount, selected_invoice.due_date,
    selected_invoice.penalty_amount, coalesce(target_paid_on, current_date), target_payment_method
  );
  if late_fee > 0 then
    update public.finance_invoices set penalty_amount = late_fee
    where school_id = target_school_id and id = target_invoice_id;
    selected_invoice.penalty_amount := late_fee;
  end if;

  -- Total a pagar: valor menos desconto mais a multa aplicada (nunca negativo).
  invoice_total := greatest(
    selected_invoice.amount - coalesce(selected_invoice.discount_amount, 0)
      + coalesce(selected_invoice.penalty_amount, 0),
    0
  );

  select coalesce(sum(amount), 0) into already_paid from public.finance_receipts
  where school_id = target_school_id and invoice_id = target_invoice_id and status = 'issued';
  if already_paid + target_amount > invoice_total then
    raise exception using errcode = '22023', message = 'O valor do pagamento excede o saldo em aberto da fatura.';
  end if;

  generated_number := private.next_document_number(target_school_id, 'receipt');
  insert into public.finance_receipts (school_id, invoice_id, receipt_number, amount, paid_on, payment_method, received_by, idempotency_key)
  values (target_school_id, target_invoice_id, generated_number, target_amount, target_paid_on, target_payment_method, (select auth.uid()), target_idempotency_key)
  returning id into new_receipt_id;

  new_status := case when already_paid + target_amount >= invoice_total then 'paid' else 'partially_paid' end;
  update public.finance_invoices set status = new_status where school_id = target_school_id and id = target_invoice_id;

  return jsonb_build_object('receiptId', new_receipt_id, 'receiptNumber', generated_number, 'invoiceStatus', new_status);
end;
$function$;

CREATE FUNCTION public.register_payment(school_id uuid, invoice_id uuid, amount numeric, payment_method text, paid_on date DEFAULT CURRENT_DATE, idempotency_key uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.register_payment(school_id, invoice_id, amount, payment_method, paid_on, idempotency_key);
$function$;

REVOKE ALL ON FUNCTION private.register_payment(uuid, uuid, numeric, text, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.register_payment(uuid, uuid, numeric, text, date, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.register_payment(uuid, uuid, numeric, text, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_payment(uuid, uuid, numeric, text, date, uuid) TO authenticated, service_role;
