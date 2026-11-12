-- Sessões de caixa: abertura com fundo de maneio, fecho com contagem, diferença
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
-- nenhuma função existente. Os recibos do gateway (sem utilizador na sessão) não
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

-- ---------------------------------------------------------------- acesso às tabelas

ALTER TABLE public.finance_cash_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_cash_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_cash_points FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.finance_cash_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.finance_cash_points TO service_role;
GRANT SELECT ON public.finance_cash_sessions TO service_role;

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
-- + despesas estornadas, tudo nesta sessão. Um recibo feito e estornado na mesma
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
    -- Recibos do gateway entram sem utilizador na sessão e não passam pela gaveta.
    if NEW.received_by is null then
      return NEW;
    end if;
  else
    v_method := NEW.method;
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
  if OLD.status = 'reversed' or NEW.status is distinct from 'reversed' then
    return NEW;
  end if;
  if TG_TABLE_NAME = 'finance_receipts' then
    v_method := OLD.payment_method;
    if OLD.received_by is null then
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
