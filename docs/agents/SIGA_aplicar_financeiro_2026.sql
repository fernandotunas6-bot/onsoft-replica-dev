-- SIGA · Financeiro 2026 · aplicar as cinco migrações (escreve na base)
--
-- ESTADO: APLICADO na produção a 2026-10-25 (projecto xodgfmxiaunpamctfeea), pela API
-- de gestão, numa transacção; a confirmação deu true nas cinco linhas e o histórico
-- registou as seis versões. Esquema do PostgREST recarregado a seguir. Não voltar a correr:
-- a guarda recusa (propina única já existe).
--
-- Gerado a 2026-10-25 a partir dos ficheiros dos ramos, sem transcrição; o md5 de cada
-- corpo está ao lado do nome.
--
-- Como aplicar:
--   1. Correr antes SIGA_verificar_financeiro_2026.sql. No resultado 2, só a lista de
--      estados das despesas deve ter «troca» = true.
--   2. De preferência, correr este ficheiro primeiro num ramo do Supabase.
--   3. Abrir no SQL Editor (projecto xodgfmxiaunpamctfeea), colar tudo e correr.
--      É uma só transacção: se uma parte falhar, nada fica aplicado.
--   4. No fim, o SELECT de confirmação deve dar true nas cinco linhas.
--
-- O código dos PRs funciona com ou sem estas migrações; elas só activam as regras.
-- A produção já tem a primeira versão das sessões de caixa (20261024110000, sem
-- registo no histórico); a 20261025110000 actualiza-a para a final. Recusa correr se a
-- propina única já existir (não é repetível); as outras quatro podem correr outra vez.
--
--   20261024090000_reverse_receipt_counts_late_fee  6e2a906209093855d5a0efc682d8274c  O estorno conta a multa por atraso
--   20261024100000_register_payment_idempotency_key  f35a95dce275b237015eeeca122f93a4  Pagamento manual idempotente (chave por tentativa)
--   20261025110000_cash_sessions_upgrade_to_final  2e4a4daecac55b7b9e092eab2033c432  Sessões de caixa: da primeira versão (já na produção) à final (#283)
--   20261025090000_one_tuition_invoice_per_month  1799278d315b1be4fdd726635b95b0fa  Uma propina por aluno e por mês (#290)
--   20261025100000_cash_expenses_audit_and_approval  3ae2c45c93d14c8f4c2ab0e98324d3ae  Aprovação e auditoria das despesas (#295)

BEGIN;

DO $guard$
begin
  if to_regclass('public.finance_cash_sessions') is null then
    raise exception 'Falta a primeira versão das sessões de caixa (20261024110000): esta base não é a da produção. Aplicar as migrações pela ordem do repositório.';
  end if;
  if exists (select 1 from pg_trigger where tgname = 'finance_invoices_one_tuition_per_month') then
    raise exception 'A 20261025090000 (propina única) já está aplicada. Correr SIGA_verificar_financeiro_2026.sql e aplicar só as que faltam.';
  end if;
end
$guard$;

-- ════════════════════════════════════════════════════════════════════
-- 20261024090000_reverse_receipt_counts_late_fee — O estorno conta a multa por atraso
-- ════════════════════════════════════════════════════════════════════

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

-- ════════════════════════════════════════════════════════════════════
-- 20261024100000_register_payment_idempotency_key — Pagamento manual idempotente (chave por tentativa)
-- ════════════════════════════════════════════════════════════════════

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

-- ════════════════════════════════════════════════════════════════════
-- 20261025110000_cash_sessions_upgrade_to_final — Sessões de caixa: da primeira versão (já na produção) à final (#283)
-- ════════════════════════════════════════════════════════════════════

-- Sessões de caixa: da primeira versão à final, na produção.
--
-- A produção tem a 20261024110000 tal como estava no commit 8154da88 (25/10, 05:31),
-- aplicada sem registo no histórico (as tabelas foram depois declaradas pela
-- 20261025070458_capture_existing_cash_tables). Faltam-lhe três correcções do mesmo
-- dia, já no ficheiro da 20261024110000:
--
--   * recibos do gateway: o gatilho deixava-os fora da gaveta por `received_by is
--     null`, mas a coluna é NOT NULL e o webhook grava quem emitiu a fatura. Um
--     pagamento do gateway em numerário entrava na sessão e, passado o prazo, o
--     webhook seria recusado. Passa a ser pelo `external_id`;
--   * despesa «Por aprovar» (20261025100000): só sai da gaveta quando é aprovada;
--   * depósito da gaveta no banco: tabela, funções e o desconto no esperado.
--
-- Os corpos vêm do ficheiro da 20261024110000, sem transcrição. Repetível: CREATE OR
-- REPLACE e IF NOT EXISTS; numa base onde a 20261024110000 já é a final, não muda nada.
-- Os gatilhos existentes apontam para as funções pelo nome; não se recriam.

-- ---------------------------------------------------------------- depósitos no banco

CREATE TABLE IF NOT EXISTS public.finance_cash_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  cash_session_id uuid NOT NULL REFERENCES public.finance_cash_sessions(id),
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  bank_reference text NOT NULL CHECK (length(btrim(bank_reference)) >= 3),
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'reversed')),
  deposited_by uuid NOT NULL,
  deposited_at timestamptz NOT NULL DEFAULT now(),
  confirmed_by uuid,
  confirmed_at timestamptz,
  reversed_by uuid,
  reversed_at timestamptz,
  reversal_reason text,
  CONSTRAINT finance_cash_deposits_confirmer_not_depositor CHECK (
    confirmed_by IS NULL OR confirmed_by IS DISTINCT FROM deposited_by
  ),
  CONSTRAINT finance_cash_deposits_reversal_complete CHECK (
    status = 'posted'
    OR (reversed_by IS NOT NULL AND reversed_at IS NOT NULL
        AND length(btrim(coalesce(reversal_reason, ''))) >= 3 AND confirmed_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS finance_cash_deposits_session ON public.finance_cash_deposits (cash_session_id);
CREATE UNIQUE INDEX IF NOT EXISTS finance_cash_deposits_one_reference
  ON public.finance_cash_deposits (school_id, btrim(bank_reference)) WHERE status = 'posted';

ALTER TABLE public.finance_cash_deposits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_cash_deposits FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.finance_cash_deposits TO service_role;

-- ---------------------------------------------------------------- funções corrigidas

-- Fundo + numerário que entrou − numerário estornado − despesas em numerário
-- + despesas estornadas − depósitos no banco, tudo nesta sessão. Um recibo feito e estornado na mesma
-- sessão anula-se; estornado noutra, sai na sessão do estorno.
CREATE OR REPLACE FUNCTION private.cash_session_expected(p_session_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select s.opening_float
    + coalesce((select sum(r.amount) from public.finance_receipts r
                where r.school_id = s.school_id and r.cash_session_id = s.id), 0)
    - coalesce((select sum(r.amount) from public.finance_receipts r
                where r.school_id = s.school_id and r.reversed_in_session_id = s.id), 0)
    - coalesce((select sum(e.amount) from public.siga_cash_expenses e
                where e.school_id = s.school_id and e.cash_session_id = s.id), 0)
    + coalesce((select sum(e.amount) from public.siga_cash_expenses e
                where e.school_id = s.school_id and e.reversed_in_session_id = s.id), 0)
    - coalesce((select sum(d.amount) from public.finance_cash_deposits d
                where d.school_id = s.school_id and d.cash_session_id = s.id
                  and d.status = 'posted'), 0)
  from public.finance_cash_sessions s
  where s.id = p_session_id;
$function$;

CREATE OR REPLACE FUNCTION private.cash_movement_attach_session()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_method text;
begin
  if TG_TABLE_NAME = 'finance_receipts' then
    v_method := NEW.payment_method;
    -- Recibos do gateway (com external_id) não passam pela gaveta. Não se pode usar
    -- received_by: é NOT NULL e o webhook grava quem emitiu a fatura.
    if NEW.external_id is not null then
      return NEW;
    end if;
  else
    v_method := NEW.method;
    -- Despesa por aprovar (20261025100000): o numerário só sai da gaveta quando é
    -- aprovada; entra na sessão nesse momento, em cash_movement_reversal_session.
    if NEW.status = 'pending_approval' then
      return NEW;
    end if;
  end if;
  if v_method is distinct from 'cash' or NEW.cash_session_id is not null then
    return NEW;
  end if;
  NEW.cash_session_id := private.cash_session_or_refuse(NEW.school_id);
  return NEW;
end;
$function$;

CREATE OR REPLACE FUNCTION private.cash_movement_reversal_session()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_method text;
begin
  -- Despesa por aprovar: aprovada, entra na sessão aberta; anulada, nunca saiu da gaveta.
  if TG_TABLE_NAME = 'siga_cash_expenses' and OLD.status = 'pending_approval' then
    if NEW.status = 'posted' and OLD.method = 'cash' and NEW.cash_session_id is null then
      NEW.cash_session_id := private.cash_session_or_refuse(NEW.school_id);
    end if;
    return NEW;
  end if;
  if OLD.status = 'reversed' or NEW.status is distinct from 'reversed' then
    return NEW;
  end if;
  if TG_TABLE_NAME = 'finance_receipts' then
    v_method := OLD.payment_method;
    if OLD.external_id is not null then
      return NEW;
    end if;
  else
    v_method := OLD.method;
  end if;
  if v_method is distinct from 'cash' then
    return NEW;
  end if;
  NEW.reversed_in_session_id := private.cash_session_or_refuse(NEW.school_id);
  return NEW;
end;
$function$;

-- Depositar no banco: tranca a sessão como o fecho, para o esperado não mudar entre a
-- verificação e o registo; não deposita mais do que há na gaveta.
CREATE OR REPLACE FUNCTION private.record_cash_deposit(p_school_id uuid, p_amount numeric, p_bank_reference text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_session uuid;
  v_id uuid;
begin
  if (select auth.uid()) is null or not private.is_aal2()
     or private.sga_app_role(p_school_id) not in ('Administrador', 'Tesouraria')
     or not private.has_permission(p_school_id, 'finance.payments.create') then
    raise exception using errcode = '42501', message = 'Sem autorização para depositar.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception using errcode = '22023', message = 'Indique o valor depositado.';
  end if;
  if length(btrim(coalesce(p_bank_reference, ''))) < 3 then
    raise exception using errcode = '22023', message = 'Indique o nº do talão de depósito.';
  end if;
  select s.id into v_session from public.finance_cash_sessions s
  join public.finance_cash_points p on p.id = s.cash_point_id and p.active
  where s.school_id = p_school_id and s.status = 'open'
  for update of s;
  if v_session is null then
    raise exception using errcode = '22023', message = 'Abra o caixa antes de depositar.';
  end if;
  if p_amount > private.cash_session_expected(v_session) then
    raise exception using errcode = '22023', message = 'O depósito é maior do que o numerário na gaveta.';
  end if;
  begin
    insert into public.finance_cash_deposits (school_id, cash_session_id, amount, bank_reference, deposited_by)
    values (p_school_id, v_session, p_amount, btrim(p_bank_reference), (select auth.uid()))
    returning id into v_id;
  exception when unique_violation then
    raise exception using errcode = '22023', message = 'Este talão de depósito já está registado.';
  end;
  return jsonb_build_object('depositId', v_id, 'sessionId', v_session);
end;
$function$;

-- Anular um depósito registado por engano: só com o caixa ainda aberto e antes de
-- confirmado no extracto. O numerário volta ao esperado da gaveta.
CREATE OR REPLACE FUNCTION private.reverse_cash_deposit(p_school_id uuid, p_deposit_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_deposit public.finance_cash_deposits%rowtype;
  v_status text;
begin
  if (select auth.uid()) is null or not private.is_aal2()
     or private.sga_app_role(p_school_id) not in ('Administrador', 'Tesouraria')
     or not private.has_permission(p_school_id, 'finance.payments.create') then
    raise exception using errcode = '42501', message = 'Sem autorização para anular o depósito.';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception using errcode = '22023', message = 'Indique o motivo da anulação do depósito.';
  end if;
  -- A sessão primeiro, como o fecho: um fecho a meio espera, ou já a fechou.
  select s.status into v_status from public.finance_cash_sessions s
  join public.finance_cash_deposits d on d.cash_session_id = s.id
  where d.id = p_deposit_id and d.school_id = p_school_id
  for update of s;
  select * into v_deposit from public.finance_cash_deposits
  where id = p_deposit_id and school_id = p_school_id
  for update;
  if v_deposit.id is null or v_deposit.status <> 'posted' then
    raise exception using errcode = '22023', message = 'Depósito não encontrado ou já anulado.';
  end if;
  if v_deposit.confirmed_at is not null then
    raise exception using errcode = '22023', message = 'Este depósito já foi confirmado no extracto e não se anula.';
  end if;
  if v_status is distinct from 'open' then
    raise exception using errcode = '22023', message = 'O caixa deste depósito já fechou: a diferença fica no fecho.';
  end if;
  update public.finance_cash_deposits set
    status = 'reversed', reversed_by = (select auth.uid()), reversed_at = now(),
    reversal_reason = btrim(p_reason)
  where id = v_deposit.id;
  return jsonb_build_object('depositId', v_deposit.id);
end;
$function$;

-- Confirmar no extracto: quem registou o depósito não o confirma.
CREATE OR REPLACE FUNCTION private.confirm_cash_deposit(p_school_id uuid, p_deposit_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_deposit public.finance_cash_deposits%rowtype;
begin
  if (select auth.uid()) is null or not private.is_aal2()
     or private.sga_app_role(p_school_id) not in ('Administrador', 'Tesouraria')
     or not private.has_permission(p_school_id, 'finance.payments.create') then
    raise exception using errcode = '42501', message = 'Sem autorização para confirmar o depósito.';
  end if;
  select * into v_deposit from public.finance_cash_deposits
  where id = p_deposit_id and school_id = p_school_id
  for update;
  if v_deposit.id is null or v_deposit.status <> 'posted' or v_deposit.confirmed_at is not null then
    raise exception using errcode = '22023', message = 'Não há depósito por confirmar com este número.';
  end if;
  if v_deposit.deposited_by = (select auth.uid()) then
    raise exception using errcode = '42501', message = 'Quem registou o depósito não o pode confirmar.';
  end if;
  update public.finance_cash_deposits
  set confirmed_by = (select auth.uid()), confirmed_at = now()
  where id = v_deposit.id;
  return jsonb_build_object('depositId', v_deposit.id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_cash_deposit(school_id uuid, amount numeric, bank_reference text)
 RETURNS jsonb LANGUAGE sql SET search_path TO ''
AS $function$ select private.record_cash_deposit(school_id, amount, bank_reference); $function$;

CREATE OR REPLACE FUNCTION public.reverse_cash_deposit(school_id uuid, deposit_id uuid, reason text)
 RETURNS jsonb LANGUAGE sql SET search_path TO ''
AS $function$ select private.reverse_cash_deposit(school_id, deposit_id, reason); $function$;

CREATE OR REPLACE FUNCTION public.confirm_cash_deposit(school_id uuid, deposit_id uuid)
 RETURNS jsonb LANGUAGE sql SET search_path TO ''
AS $function$ select private.confirm_cash_deposit(school_id, deposit_id); $function$;

-- Funções novas nascem com EXECUTE para PUBLIC; fecham-se aqui.
REVOKE ALL ON FUNCTION private.record_cash_deposit(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.record_cash_deposit(uuid, numeric, text) TO authenticated;
REVOKE ALL ON FUNCTION private.reverse_cash_deposit(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.reverse_cash_deposit(uuid, uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION private.confirm_cash_deposit(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.confirm_cash_deposit(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.record_cash_deposit(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_cash_deposit(uuid, numeric, text) TO authenticated;
REVOKE ALL ON FUNCTION public.reverse_cash_deposit(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_cash_deposit(uuid, uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.confirm_cash_deposit(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_cash_deposit(uuid, uuid) TO authenticated;

-- ════════════════════════════════════════════════════════════════════
-- 20261025090000_one_tuition_invoice_per_month — Uma propina por aluno e por mês (#290)
-- ════════════════════════════════════════════════════════════════════

-- Uma propina por aluno e por mês, garantida na base.
--
-- `issueInvoice` (src/features/finance/server.ts) já recusa a segunda propina do mesmo
-- mês, mas verifica e insere em dois passos: duas emissões em paralelo — duplo clique,
-- duas pessoas na secretaria, uma emissão em lote a correr ao mesmo tempo — passam as
-- duas pela verificação e o aluno fica com duas propinas do mesmo mês.
--
-- Um índice único não serve: o tipo da taxa (`tuition`) está em `fee_items`, não na
-- fatura, e o preço da classe e o geral são itens diferentes do mesmo tipo. Por isso um
-- gatilho: tranca o par (contrato, mês) com um advisory lock da transacção e só depois
-- procura outra propina não anulada. A segunda emissão espera pela primeira e, quando a
-- primeira faz COMMIT, encontra-a.
--
-- Só actua em INSERT de propinas com mês de competência. Faturas existentes não mudam.

CREATE FUNCTION private.finance_invoice_one_tuition_per_month()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_kind text;
  v_existing text;
begin
  if NEW.competence_month is null or NEW.fee_item_id is null or NEW.contract_id is null then
    return NEW;
  end if;
  select kind into v_kind from public.fee_items
  where id = NEW.fee_item_id and school_id = NEW.school_id;
  if v_kind is distinct from 'tuition' then
    return NEW;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('finance_tuition:' || NEW.contract_id::text || ':' || NEW.competence_month::text, 0)
  );

  select i.invoice_number into v_existing
  from public.finance_invoices i
  join public.fee_items f on f.id = i.fee_item_id and f.kind = 'tuition'
  where i.school_id = NEW.school_id
    and i.contract_id = NEW.contract_id
    and i.competence_month = NEW.competence_month
    and i.status <> 'cancelled'
  limit 1;
  if v_existing is not null then
    raise exception using errcode = '22023',
      message = 'Este aluno já tem a propina deste mês. Anule-a antes de emitir outra.';
  end if;
  return NEW;
end;
$function$;

REVOKE ALL ON FUNCTION private.finance_invoice_one_tuition_per_month() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER finance_invoices_one_tuition_per_month
  BEFORE INSERT ON public.finance_invoices
  FOR EACH ROW EXECUTE FUNCTION private.finance_invoice_one_tuition_per_month();

-- ════════════════════════════════════════════════════════════════════
-- 20261025100000_cash_expenses_audit_and_approval — Aprovação e auditoria das despesas (#295)
-- ════════════════════════════════════════════════════════════════════

-- Despesas de caixa: rasto em audit_logs, como as faturas, e quem aprovou.
--
-- `finance_invoices` tem `audit_finance_invoices_change`; `siga_cash_expenses` só tinha
-- o gatilho de `updated_at`. Registar e estornar uma despesa — dinheiro que sai da
-- escola — não ficava no registo de auditoria: só nas colunas `created_by` e
-- `reversed_by` da própria linha, que um UPDATE pelo servidor podia reescrever sem
-- deixar nada (§8 do plano financeiro: «um operador não pode eliminar o histórico»).
--
-- Mesma função genérica das outras tabelas (`private.audit_row_change`): grava a
-- operação, a linha afectada e os nomes dos campos alterados (não os valores). As despesas são gravadas pelo cliente do
-- servidor, por isso `actor_user_id` fica nulo nesses registos; o autor continua em
-- `created_by` / `reversed_by`, e qualquer reescrita fica registada.

DROP TRIGGER IF EXISTS audit_siga_cash_expenses_change ON public.siga_cash_expenses;
CREATE TRIGGER audit_siga_cash_expenses_change
  AFTER INSERT OR DELETE OR UPDATE ON public.siga_cash_expenses
  FOR EACH ROW EXECUTE FUNCTION private.audit_row_change();

-- Aprovação das despesas acima de 50 000 Kz (§8, decidido a 25/10/2026): status
-- `pending_approval` até um Administrador que não a registou a aprovar.
--
-- A produção tem um CHECK em `status` que só aceita `posted` e `reversed` (retrato de
-- 21/10, `valores`), mas o nome não está em nenhum ficheiro do repositório. O bloco
-- abaixo encontra os CHECK que são a lista de valores de `status` e troca-os por um com
-- nome conhecido. Só esses: outro CHECK que mencione `status` (por exemplo, o motivo
-- obrigatório do estorno) fica como está. Sem esta migração o servidor lança a despesa
-- como antes (posted).
DO $$
declare
  v_name text;
begin
  for v_name in
    select c.conname from pg_constraint c
    where c.conrelid = 'public.siga_cash_expenses'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ~ '^CHECK \(\(status = ANY \(ARRAY\['
  loop
    execute format('ALTER TABLE public.siga_cash_expenses DROP CONSTRAINT %I', v_name);
  end loop;
end $$;

ALTER TABLE public.siga_cash_expenses
  ADD CONSTRAINT siga_cash_expenses_status_check
  CHECK (status IN ('posted', 'reversed', 'pending_approval'));

-- Quem aprovou e quando. Sem estas colunas o servidor aprova na mesma e guarda quem
-- aprovou em `updated_by`.
ALTER TABLE public.siga_cash_expenses
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

-- Histórico: as mesmas versões dos ficheiros do repositório.
INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES
  ('20261024110000', 'finance_cash_sessions', ARRAY['-- aplicada antes na versão 8154da88; ver supabase/migrations/20261024110000_finance_cash_sessions.sql']),
  ('20261024090000', 'reverse_receipt_counts_late_fee', ARRAY['-- ver supabase/migrations/20261024090000_reverse_receipt_counts_late_fee.sql']),
  ('20261024100000', 'register_payment_idempotency_key', ARRAY['-- ver supabase/migrations/20261024100000_register_payment_idempotency_key.sql']),
  ('20261025110000', 'cash_sessions_upgrade_to_final', ARRAY['-- ver supabase/migrations/20261025110000_cash_sessions_upgrade_to_final.sql']),
  ('20261025090000', 'one_tuition_invoice_per_month', ARRAY['-- ver supabase/migrations/20261025090000_one_tuition_invoice_per_month.sql']),
  ('20261025100000', 'cash_expenses_audit_and_approval', ARRAY['-- ver supabase/migrations/20261025100000_cash_expenses_audit_and_approval.sql'])
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- Confirmação: true nas cinco linhas.
select '20261024090000 estorno conta a multa' as migracao,
  coalesce((select position('penalty_amount' in prosrc) > 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'private' and proname = 'reverse_finance_receipt'), false) as aplicada
union all select '20261024100000 chave de idempotência',
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'finance_receipts' and column_name = 'idempotency_key')
union all select '20261025110000 sessões de caixa na versão final',
  to_regclass('public.finance_cash_deposits') is not null
  and coalesce((select position('external_id' in prosrc) > 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'private' and proname = 'cash_movement_attach_session'), false)
union all select '20261025090000 propina única por mês',
  exists (select 1 from pg_trigger where tgname = 'finance_invoices_one_tuition_per_month')
union all select '20261025100000 aprovação e auditoria de despesas',
  exists (select 1 from pg_trigger where tgname = 'audit_siga_cash_expenses_change');
