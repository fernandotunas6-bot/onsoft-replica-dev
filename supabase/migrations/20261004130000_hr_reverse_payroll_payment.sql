-- Anular um salário pago por engano, numa só transacção.
--
-- O caixa recusa anular a saída de um salário (reverseCashEntry): o salário ficava
-- «pago» com o dinheiro de volta no caixa. Faltava o caminho certo, nos RH. Esta
-- função faz tudo ou nada:
--   1. o item da ordem salarial deixa de estar pago (com o motivo no histórico);
--   2. a saída de caixa fica anulada com o mesmo motivo;
--   3. a linha da folha, a ordem e a folha voltam ao estado que corresponde.
-- Depois da anulação, o RH escolhe (p_next):
--   * 'repay'  — o item volta a «autorizado» e pode ser pago de novo (ex.: IBAN errado);
--   * 'cancel' — o item e a linha da folha ficam cancelados (o salário não era devido).
--
-- Só o servidor a chama (Administrador/Tesouraria, 2FA, ver src/features/hr/payments.ts):
-- SECURITY DEFINER sem EXECUTE para PUBLIC, anon nem authenticated.
-- Idempotente (CREATE OR REPLACE). Regras: docs/agents/DATABASE_RULES.md.

CREATE OR REPLACE FUNCTION private.hr_reverse_payroll_payment(
  p_school_id uuid,
  p_payment_item_id uuid,
  p_actor uuid,
  p_reason text,
  p_next text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  item public.hr_payroll_payment_items%rowtype;
  batch public.hr_payroll_payment_batches%rowtype;
  reason text := btrim(coalesce(p_reason, ''));
  next_item_status text;
  live_count integer;
  paid_count integer;
  new_batch_status text;
begin
  if p_next not in ('repay', 'cancel') then
    raise exception using errcode = '22023', message = 'Escolha voltar a pagar ou cancelar o pagamento.';
  end if;
  if char_length(reason) < 5 or char_length(reason) > 500 then
    raise exception using errcode = '22023', message = 'Indique o motivo da anulação (5 a 500 caracteres).';
  end if;
  if p_actor is null then
    raise exception using errcode = '42501', message = 'Utilizador em falta.';
  end if;

  select * into item from public.hr_payroll_payment_items
  where school_id = p_school_id and id = p_payment_item_id
  for update;
  if item.id is null then
    raise exception using errcode = 'P0002', message = 'Pagamento salarial não encontrado.';
  end if;
  if item.status <> 'paid' then
    raise exception using errcode = '22023', message = 'Só se anula um salário que está pago.';
  end if;

  select * into batch from public.hr_payroll_payment_batches
  where school_id = p_school_id and id = item.batch_id
  for update;

  -- 2. Saída de caixa anulada com o mesmo motivo.
  if item.cash_expense_id is not null then
    update public.siga_cash_expenses
    set status = 'reversed', reversed_at = now(), reversed_by = p_actor,
        reversal_reason = 'Salário anulado: ' || reason, updated_by = p_actor
    where school_id = p_school_id and id = item.cash_expense_id and status = 'posted';
  end if;

  -- 1. Item deixa de estar pago; o histórico guarda o que foi anulado.
  next_item_status := case when p_next = 'repay' then 'authorized' else 'cancelled' end;
  update public.hr_payroll_payment_items
  set status = next_item_status,
      paid_at = null,
      confirmed_by = null,
      cash_expense_id = null,
      failure_reason = 'Anulado: ' || reason,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'reversals',
        coalesce(metadata->'reversals', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
          'at', now(),
          'by', p_actor,
          'reason', reason,
          'next', p_next,
          'cash_expense_id', item.cash_expense_id,
          'provider_reference', item.provider_reference,
          'paid_at', item.paid_at
        ))
      ),
      updated_by = p_actor
  where school_id = p_school_id and id = item.id;

  -- 3. Linha da folha, ordem e folha.
  update public.hr_payroll_items
  set status = case when p_next = 'repay' then 'approved' else 'cancelled' end,
      updated_by = p_actor
  where school_id = p_school_id and id = item.payroll_item_id;

  select count(*) filter (where status <> 'cancelled'),
         count(*) filter (where status = 'paid')
  into live_count, paid_count
  from public.hr_payroll_payment_items
  where school_id = p_school_id and batch_id = item.batch_id;
  new_batch_status := case
    when live_count = 0 then 'cancelled'
    when paid_count = live_count then 'completed'
    when paid_count > 0 then 'partial'
    else 'authorized'
  end;
  update public.hr_payroll_payment_batches
  set status = new_batch_status, updated_by = p_actor
  where school_id = p_school_id and id = item.batch_id;

  update public.hr_payroll_runs
  set status = 'approved', paid_at = null, updated_by = p_actor
  where school_id = p_school_id and id = batch.payroll_run_id and status = 'paid';

  insert into public.audit_logs (school_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    p_school_id, p_actor, 'hr.payroll_payment.reversed', 'hr_payroll_payment_item', item.id,
    jsonb_build_object(
      'reason', reason, 'next', p_next, 'amount_kz', item.amount_kz,
      'beneficiary', item.beneficiary_name, 'cash_expense_id', item.cash_expense_id,
      'batch_id', item.batch_id, 'batch_status', new_batch_status
    )
  );

  return jsonb_build_object(
    'paymentItemId', item.id,
    'itemStatus', next_item_status,
    'batchStatus', new_batch_status,
    'cashExpenseId', item.cash_expense_id
  );
end;
$function$;

REVOKE ALL ON FUNCTION private.hr_reverse_payroll_payment(uuid, uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.hr_reverse_payroll_payment(uuid, uuid, uuid, text, text)
  TO service_role;

-- Porta para o servidor (PostgREST só expõe `public`); só service_role a executa.
CREATE OR REPLACE FUNCTION public.hr_reverse_payroll_payment(
  school_id uuid,
  payment_item_id uuid,
  actor uuid,
  reason text,
  next_step text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT private.hr_reverse_payroll_payment(school_id, payment_item_id, actor, reason, next_step);
$function$;

REVOKE ALL ON FUNCTION public.hr_reverse_payroll_payment(uuid, uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_reverse_payroll_payment(uuid, uuid, uuid, text, text)
  TO service_role;
