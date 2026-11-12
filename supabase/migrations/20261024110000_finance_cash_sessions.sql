-- Sessões de caixa: abertura com fundo de maneio, depósitos no banco, fecho com contagem, diferença
-- gravada e aprovada por quem não fechou.
--
-- Desenho e decisões em docs/specs/finance/CAIXA_SESSOES.md (24/10/2026):
--   * um posto activo por escola nesta versão («Caixa principal»);
--   * numerário sem caixa aberto é aceite durante 30 dias a contar do primeiro
--     uso (`enforce_from`) e recusado depois;
--   * qualquer diferença ≠ 0 fica por aprovar, e quem fechou não a aprova;
--   * o estorno de numerário entra na sessão aberta no momento do estorno, e o
--     fecho já contado não muda.
--
-- Os movimentos continuam onde estão (`finance_receipts`, `siga_cash_expenses`).
-- Gatilhos ligam-nos à sessão aberta, por isso todos os caminhos de escrita
-- (register_payment, despesa, folha paga em numerário) ficam cobertos sem mudar
-- nenhuma função existente. Os recibos do gateway (com `external_id`) não
-- passam pela gaveta e ficam de fora.
--
-- As tabelas nascem fechadas: RLS ligado, sem políticas, sem privilégios para
-- anon nem authenticated. Lêem-se no servidor; escrevem-se só pelas funções.

-- ---------------------------------------------------------------- postos

CREATE TABLE public.finance_cash_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Caixa principal',
  active boolean NOT NULL DEFAULT true,
  -- Até esta data, numerário sem caixa aberto é aceite (com aviso na interface).
  enforce_from date NOT NULL DEFAULT (current_date + 30),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);

-- Um posto activo por escola nesta versão.
CREATE UNIQUE INDEX finance_cash_points_one_active
  ON public.finance_cash_points (school_id) WHERE active;

-- ---------------------------------------------------------------- sessões

CREATE TABLE public.finance_cash_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  cash_point_id uuid NOT NULL REFERENCES public.finance_cash_points(id),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_by uuid NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  opening_float numeric(18,2) NOT NULL CHECK (opening_float >= 0),
  closed_by uuid,
  closed_at timestamptz,
  counted_cash numeric(18,2) CHECK (counted_cash >= 0),
  expected_cash numeric(18,2),
  difference numeric(18,2),
  difference_reason text,
  approved_by uuid,
  approved_at timestamptz,
  CONSTRAINT finance_cash_sessions_closed_complete CHECK (
    status = 'open'
    OR (closed_by IS NOT NULL AND closed_at IS NOT NULL AND counted_cash IS NOT NULL
        AND expected_cash IS NOT NULL AND difference IS NOT NULL)
  ),
  CONSTRAINT finance_cash_sessions_difference_reason CHECK (
    difference IS NULL OR difference = 0 OR length(btrim(coalesce(difference_reason, ''))) >= 3
  ),
  CONSTRAINT finance_cash_sessions_approver_not_closer CHECK (
    approved_by IS NULL OR approved_by IS DISTINCT FROM closed_by
  )
);

-- Duas aberturas em paralelo no mesmo posto: uma passa, a outra falha aqui.
CREATE UNIQUE INDEX finance_cash_sessions_one_open
  ON public.finance_cash_sessions (cash_point_id) WHERE status = 'open';
CREATE INDEX finance_cash_sessions_school_recent
  ON public.finance_cash_sessions (school_id, opened_at DESC);

-- ---------------------------------------------------------------- movimentos

ALTER TABLE public.finance_receipts
  ADD COLUMN IF NOT EXISTS cash_session_id uuid REFERENCES public.finance_cash_sessions(id),
  ADD COLUMN IF NOT EXISTS reversed_in_session_id uuid REFERENCES public.finance_cash_sessions(id);
ALTER TABLE public.siga_cash_expenses
  ADD COLUMN IF NOT EXISTS cash_session_id uuid REFERENCES public.finance_cash_sessions(id),
  ADD COLUMN IF NOT EXISTS reversed_in_session_id uuid REFERENCES public.finance_cash_sessions(id);

CREATE INDEX IF NOT EXISTS finance_receipts_cash_session
  ON public.finance_receipts (cash_session_id) WHERE cash_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS finance_receipts_reversed_in_session
  ON public.finance_receipts (reversed_in_session_id) WHERE reversed_in_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS siga_cash_expenses_cash_session
  ON public.siga_cash_expenses (cash_session_id) WHERE cash_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS siga_cash_expenses_reversed_in_session
  ON public.siga_cash_expenses (reversed_in_session_id) WHERE reversed_in_session_id IS NOT NULL;

-- ---------------------------------------------------------------- depósitos no banco
-- Numerário que sai da gaveta para o banco (decidido a 25/10/2026). Sai na sessão aberta
-- e fica por confirmar até alguém que não o registou o ver no extracto. O mesmo talão
-- não entra duas vezes; anular só com o caixa ainda aberto e antes de confirmado.

CREATE TABLE public.finance_cash_deposits (
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

CREATE INDEX finance_cash_deposits_session ON public.finance_cash_deposits (cash_session_id);
CREATE UNIQUE INDEX finance_cash_deposits_one_reference
  ON public.finance_cash_deposits (school_id, btrim(bank_reference)) WHERE status = 'posted';

-- ---------------------------------------------------------------- acesso às tabelas

ALTER TABLE public.finance_cash_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_cash_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_cash_points FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.finance_cash_sessions FROM PUBLIC, anon, authenticated;
ALTER TABLE public.finance_cash_deposits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_cash_deposits FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.finance_cash_points TO service_role;
GRANT SELECT ON public.finance_cash_sessions TO service_role;
GRANT SELECT ON public.finance_cash_deposits TO service_role;

-- ---------------------------------------------------------------- auxiliares

-- O posto activo da escola; cria-o no primeiro uso, e é aí que começam os 30 dias.
CREATE FUNCTION private.cash_point_for(p_school_id uuid)
 RETURNS public.finance_cash_points
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_point public.finance_cash_points%rowtype;
begin
  select * into v_point from public.finance_cash_points
  where school_id = p_school_id and active;
  if v_point.id is null then
    insert into public.finance_cash_points (school_id) values (p_school_id)
    on conflict do nothing;
    select * into v_point from public.finance_cash_points
    where school_id = p_school_id and active;
  end if;
  return v_point;
end;
$function$;

-- A sessão aberta, trancada FOR SHARE: o fecho tranca-a FOR UPDATE, por isso um
-- movimento a meio espera pelo fecho e, depois dele, já não a encontra aberta —
-- nada entra numa sessão depois de o esperado ter sido calculado.
CREATE FUNCTION private.open_cash_session_for(p_school_id uuid)
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select s.id from public.finance_cash_sessions s
  join public.finance_cash_points p on p.id = s.cash_point_id and p.active
  where s.school_id = p_school_id and s.status = 'open'
  for share of s;
$function$;

-- Fundo + numerário que entrou − numerário estornado − despesas em numerário
-- + despesas estornadas − depósitos no banco, tudo nesta sessão. Um recibo feito e estornado na mesma
-- sessão anula-se; estornado noutra, sai na sessão do estorno.
CREATE FUNCTION private.cash_session_expected(p_session_id uuid)
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

-- Numerário fora de sessão: aceite até `enforce_from`, recusado depois.
CREATE FUNCTION private.cash_session_or_refuse(p_school_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_point public.finance_cash_points%rowtype;
  v_session uuid;
begin
  v_point := private.cash_point_for(p_school_id);
  v_session := private.open_cash_session_for(p_school_id);
  if v_session is null and current_date >= v_point.enforce_from then
    raise exception using errcode = '22023', message = 'Abra o caixa antes de registar numerário.';
  end if;
  return v_session;
end;
$function$;

-- ---------------------------------------------------------------- gatilhos

CREATE FUNCTION private.cash_movement_attach_session()
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

CREATE FUNCTION private.cash_movement_reversal_session()
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

CREATE TRIGGER finance_receipts_cash_session
  BEFORE INSERT ON public.finance_receipts
  FOR EACH ROW EXECUTE FUNCTION private.cash_movement_attach_session();
CREATE TRIGGER finance_receipts_cash_reversal
  BEFORE UPDATE OF status ON public.finance_receipts
  FOR EACH ROW EXECUTE FUNCTION private.cash_movement_reversal_session();
CREATE TRIGGER siga_cash_expenses_cash_session
  BEFORE INSERT ON public.siga_cash_expenses
  FOR EACH ROW EXECUTE FUNCTION private.cash_movement_attach_session();
CREATE TRIGGER siga_cash_expenses_cash_reversal
  BEFORE UPDATE OF status ON public.siga_cash_expenses
  FOR EACH ROW EXECUTE FUNCTION private.cash_movement_reversal_session();

-- ---------------------------------------------------------------- operações

CREATE FUNCTION private.open_cash_session(p_school_id uuid, p_opening_float numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_point public.finance_cash_points%rowtype;
  v_id uuid;
begin
  if (select auth.uid()) is null or not private.is_aal2()
     or private.sga_app_role(p_school_id) not in ('Administrador', 'Tesouraria')
     or not private.has_permission(p_school_id, 'finance.payments.create') then
    raise exception using errcode = '42501', message = 'Sem autorização para abrir o caixa.';
  end if;
  if p_opening_float is null or p_opening_float < 0 then
    raise exception using errcode = '22023', message = 'Indique o fundo de maneio contado.';
  end if;
  v_point := private.cash_point_for(p_school_id);
  perform 1 from public.finance_cash_points where id = v_point.id for update;
  if exists (select 1 from public.finance_cash_sessions
             where cash_point_id = v_point.id and status = 'open') then
    raise exception using errcode = '22023', message = 'O caixa já está aberto.';
  end if;
  insert into public.finance_cash_sessions (school_id, cash_point_id, opened_by, opening_float)
  values (p_school_id, v_point.id, (select auth.uid()), p_opening_float)
  returning id into v_id;
  return jsonb_build_object('sessionId', v_id);
end;
$function$;

CREATE FUNCTION private.close_cash_session(p_school_id uuid, p_session_id uuid, p_counted_cash numeric, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_session public.finance_cash_sessions%rowtype;
  v_role text;
  v_expected numeric(18,2);
  v_difference numeric(18,2);
begin
  v_role := private.sga_app_role(p_school_id);
  if (select auth.uid()) is null or not private.is_aal2()
     or v_role not in ('Administrador', 'Tesouraria')
     or not private.has_permission(p_school_id, 'finance.payments.create') then
    raise exception using errcode = '42501', message = 'Sem autorização para fechar o caixa.';
  end if;
  if p_counted_cash is null or p_counted_cash < 0 then
    raise exception using errcode = '22023', message = 'Indique o numerário contado.';
  end if;
  select * into v_session from public.finance_cash_sessions
  where id = p_session_id and school_id = p_school_id and status = 'open'
  for update;
  if v_session.id is null then
    raise exception using errcode = '22023', message = 'Este caixa já não está aberto.';
  end if;
  if v_session.opened_by <> (select auth.uid()) and v_role <> 'Administrador' then
    raise exception using errcode = '42501', message = 'Só quem abriu o caixa, ou um Administrador, o pode fechar.';
  end if;
  v_expected := private.cash_session_expected(v_session.id);
  v_difference := p_counted_cash - v_expected;
  if v_difference <> 0 and length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception using errcode = '22023', message = 'Indique o motivo da diferença de caixa.';
  end if;
  update public.finance_cash_sessions set
    status = 'closed',
    closed_by = (select auth.uid()),
    closed_at = now(),
    counted_cash = p_counted_cash,
    expected_cash = v_expected,
    difference = v_difference,
    difference_reason = nullif(btrim(coalesce(p_reason, '')), '')
  where id = v_session.id;
  return jsonb_build_object('sessionId', v_session.id, 'expectedCash', v_expected, 'difference', v_difference);
end;
$function$;

CREATE FUNCTION private.approve_cash_difference(p_school_id uuid, p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_session public.finance_cash_sessions%rowtype;
begin
  if (select auth.uid()) is null or not private.is_aal2()
     or private.sga_app_role(p_school_id) <> 'Administrador' then
    raise exception using errcode = '42501', message = 'Só um Administrador aprova diferenças de caixa.';
  end if;
  select * into v_session from public.finance_cash_sessions
  where id = p_session_id and school_id = p_school_id
  for update;
  if v_session.id is null or v_session.status <> 'closed' or v_session.difference = 0
     or v_session.approved_by is not null then
    raise exception using errcode = '22023', message = 'Não há diferença por aprovar neste caixa.';
  end if;
  if v_session.closed_by = (select auth.uid()) then
    raise exception using errcode = '42501', message = 'Quem fechou o caixa não pode aprovar a diferença.';
  end if;
  update public.finance_cash_sessions
  set approved_by = (select auth.uid()), approved_at = now()
  where id = v_session.id;
  return jsonb_build_object('sessionId', v_session.id);
end;
$function$;

-- Depositar no banco: tranca a sessão como o fecho, para o esperado não mudar entre a
-- verificação e o registo; não deposita mais do que há na gaveta.
CREATE FUNCTION private.record_cash_deposit(p_school_id uuid, p_amount numeric, p_bank_reference text)
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
CREATE FUNCTION private.reverse_cash_deposit(p_school_id uuid, p_deposit_id uuid, p_reason text)
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
CREATE FUNCTION private.confirm_cash_deposit(p_school_id uuid, p_deposit_id uuid)
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

-- ---------------------------------------------------------------- invólucros públicos

CREATE FUNCTION public.open_cash_session(school_id uuid, opening_float numeric)
 RETURNS jsonb LANGUAGE sql SET search_path TO ''
AS $function$ select private.open_cash_session(school_id, opening_float); $function$;

CREATE FUNCTION public.close_cash_session(school_id uuid, session_id uuid, counted_cash numeric, reason text DEFAULT NULL)
 RETURNS jsonb LANGUAGE sql SET search_path TO ''
AS $function$ select private.close_cash_session(school_id, session_id, counted_cash, reason); $function$;

CREATE FUNCTION public.approve_cash_difference(school_id uuid, session_id uuid)
 RETURNS jsonb LANGUAGE sql SET search_path TO ''
AS $function$ select private.approve_cash_difference(school_id, session_id); $function$;

CREATE FUNCTION public.record_cash_deposit(school_id uuid, amount numeric, bank_reference text)
 RETURNS jsonb LANGUAGE sql SET search_path TO ''
AS $function$ select private.record_cash_deposit(school_id, amount, bank_reference); $function$;

CREATE FUNCTION public.reverse_cash_deposit(school_id uuid, deposit_id uuid, reason text)
 RETURNS jsonb LANGUAGE sql SET search_path TO ''
AS $function$ select private.reverse_cash_deposit(school_id, deposit_id, reason); $function$;

CREATE FUNCTION public.confirm_cash_deposit(school_id uuid, deposit_id uuid)
 RETURNS jsonb LANGUAGE sql SET search_path TO ''
AS $function$ select private.confirm_cash_deposit(school_id, deposit_id); $function$;

-- O esperado em tempo real, para o ecrã; lido pelo servidor com service_role.
CREATE FUNCTION public.cash_session_expected(session_id uuid)
 RETURNS numeric LANGUAGE sql STABLE SET search_path TO ''
AS $function$ select private.cash_session_expected(session_id); $function$;

-- ---------------------------------------------------------------- privilégios das funções
-- Funções nascem com EXECUTE para PUBLIC; fecham-se aqui, na mesma migração.

REVOKE ALL ON FUNCTION private.cash_point_for(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.open_cash_session_for(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.cash_session_or_refuse(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.cash_movement_attach_session() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.cash_movement_reversal_session() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.cash_session_expected(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.cash_session_expected(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.cash_session_expected(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cash_session_expected(uuid) TO service_role;

REVOKE ALL ON FUNCTION private.open_cash_session(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.open_cash_session(uuid, numeric) TO authenticated;
REVOKE ALL ON FUNCTION private.close_cash_session(uuid, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.close_cash_session(uuid, uuid, numeric, text) TO authenticated;
REVOKE ALL ON FUNCTION private.approve_cash_difference(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.approve_cash_difference(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.open_cash_session(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_cash_session(uuid, numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.close_cash_session(uuid, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_cash_session(uuid, uuid, numeric, text) TO authenticated;
REVOKE ALL ON FUNCTION public.approve_cash_difference(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_cash_difference(uuid, uuid) TO authenticated;

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
