-- Anular um salário pago (20261004130000) falhava sempre na produção.
--
-- 1. A linha da folha passava de «pago» para «aprovado»/«cancelado», e o trigger
--    hr_block_locked_payroll_item_mutation (20260906185000) só deixa avançar
--    approved -> processing -> paid: «Invalid locked payroll item status transition».
-- 2. A folha passava de «paga» para «aprovada», o que corre outra vez as validações
--    da aprovação (hr_guard_payroll_item_arithmetic exige todas as linhas aprovadas;
--    as outras estão pagas).
--
-- Correcção:
--   * o trigger aceita pago -> em processamento/cancelado só quando a anulação marca
--     essa linha na transacção (set_config local, como siga.defer_term_overlap);
--     qualquer outra escrita continua bloqueada;
--   * «voltar a pagar» deixa a linha em processamento, o estado que a confirmação
--     (hr_confirm_payroll_payment_item) aceita; a folha fica em processamento
--     enquanto houver salários por pagar e paga quando não houver.
-- Na produção, a 2026-10-05, não havia salários pagos nem anulações registadas.
-- Os corpos de partida são os da produção (md5 do prosrc conferido; a anulação só
-- difere nos comentários). Ensaio: tests/sql/payroll-confirmation.mjs.
-- Idempotente (CREATE OR REPLACE). Regras: docs/agents/DATABASE_RULES.md.

CREATE OR REPLACE FUNCTION public.hr_block_locked_payroll_item_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_payroll_run_id uuid;
  v_run_status text;
  v_status_transition_allowed boolean := false;
BEGIN
  v_payroll_run_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.payroll_run_id ELSE NEW.payroll_run_id END;
  SELECT status INTO v_run_status FROM public.hr_payroll_runs WHERE id = v_payroll_run_id;

  IF v_run_status NOT IN ('approved','processing','paid','cancelled') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP IN ('INSERT','DELETE') THEN
    RAISE EXCEPTION 'Payroll run is locked';
  END IF;

  -- Nenhum valor/identidade/snapshot de cálculo pode mudar após aprovação.
  IF NEW.school_id IS DISTINCT FROM OLD.school_id
     OR NEW.payroll_run_id IS DISTINCT FROM OLD.payroll_run_id
     OR NEW.employment_id IS DISTINCT FROM OLD.employment_id
     OR NEW.contract_id IS DISTINCT FROM OLD.contract_id
     OR NEW.base_amount_kz IS DISTINCT FROM OLD.base_amount_kz
     OR NEW.hourly_amount_kz IS DISTINCT FROM OLD.hourly_amount_kz
     OR NEW.allowances_kz IS DISTINCT FROM OLD.allowances_kz
     OR NEW.bonuses_kz IS DISTINCT FROM OLD.bonuses_kz
     OR NEW.overtime_kz IS DISTINCT FROM OLD.overtime_kz
     OR NEW.deductions_kz IS DISTINCT FROM OLD.deductions_kz
     OR NEW.gross_amount_kz IS DISTINCT FROM OLD.gross_amount_kz
     OR NEW.net_amount_kz IS DISTINCT FROM OLD.net_amount_kz
     OR NEW.calculation_details IS DISTINCT FROM OLD.calculation_details THEN
    RAISE EXCEPTION 'Approved payroll financial values are immutable';
  END IF;

  v_status_transition_allowed :=
       (OLD.status = NEW.status)
    OR (OLD.status = 'approved' AND NEW.status IN ('processing','paid'))
    OR (OLD.status = 'processing' AND NEW.status = 'paid')
    OR (OLD.status = 'paid' AND NEW.status = 'paid')
    -- Só dentro de private.hr_reverse_payroll_payment, que marca esta linha na transacção.
    OR (OLD.status = 'paid' AND NEW.status IN ('processing','cancelled')
        AND COALESCE(current_setting('siga.hr_payroll_reversal', true), '') = OLD.id::text);

  IF NOT v_status_transition_allowed THEN
    RAISE EXCEPTION 'Invalid locked payroll item status transition: % -> %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

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
  outstanding boolean;
  new_run_status text;
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

  -- 3. Linha da folha, ordem e folha. A linha volta a «em processamento» (à espera de
  -- pagamento, como depois de autorizar a ordem) ou fica cancelada; o trigger de
  -- bloqueio só aceita sair de «pago» com esta marca, que vale para esta linha e
  -- esta transacção.
  perform set_config('siga.hr_payroll_reversal', item.payroll_item_id::text, true);
  update public.hr_payroll_items
  set status = case when p_next = 'repay' then 'processing' else 'cancelled' end,
      updated_by = p_actor
  where school_id = p_school_id and id = item.payroll_item_id;
  perform set_config('siga.hr_payroll_reversal', '', true);

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

  -- A folha não volta a «aprovada»: isso refaz as validações da aprovação, que exigem
  -- todas as linhas aprovadas. Fica «em processamento» enquanto houver salários por
  -- pagar e «paga» quando não houver (como na confirmação).
  select exists (
    select 1 from public.hr_payroll_items
    where school_id = p_school_id and payroll_run_id = batch.payroll_run_id
      and status not in ('paid', 'cancelled')
  ) into outstanding;
  new_run_status := case when outstanding then 'processing' else 'paid' end;
  update public.hr_payroll_runs
  set status = new_run_status,
      paid_at = case when outstanding then null else coalesce(paid_at, now()) end,
      updated_by = p_actor
  where school_id = p_school_id and id = batch.payroll_run_id
    and status in ('processing', 'paid') and status <> new_run_status;

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
