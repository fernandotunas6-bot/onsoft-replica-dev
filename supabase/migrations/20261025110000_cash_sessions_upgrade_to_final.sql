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
