-- SIGA Plus — SQL a aplicar no Supabase (projecto Sga), pacote de 2026-10-04
-- Colar TUDO no SQL Editor → Run. Pode correr mais do que uma vez sem problema.
-- 2 migrações:
--   · multa por atraso com uma regra só: a tesouraria passa a cobrar o total a pagar
--     com a multa (valor − desconto + multa) e a aplicá-la segundo as regras de
--     Definições › Cobrança, como já fazia o webhook EMIS/Unitel;
--   · a importação de «propinas» passa a gravar essas regras (catálogo da importação:
--     school_settings fica «controlled», só para o domínio billing).
-- Não mexe em faturas, recibos nem regras. A 2026-10-04 (produção, só leitura)
-- nenhuma escola tinha multa nas regras de cobrança: aplicar não muda nenhum valor
-- até uma escola a definir.
-- Ensaiado em PGlite (tests/sql/late-fee.mjs): corre duas vezes; a regra da base e a
-- do ecrã (late-fee.ts) dão o mesmo em 5040 casos.
-- Confirmar no fim com a consulta do fundo deste ficheiro (deve dar "aplicada").


-- ══════════ 20261004135000_late_fee_one_rule.sql ══════════
-- Multa por atraso: uma regra só, na tesouraria como nas referências.
--
-- Antes (produção, só leitura, 2026-10-04):
--   · o webhook EMIS/Unitel aplicava a multa e cobrava valor − desconto + multa;
--   · `private.register_payment` (tesouraria e confirmação manual de referências)
--     cobrava valor − desconto: não aplicava a multa e ignorava a que já estivesse
--     gravada na fatura, por isso uma fatura com multa ficava «paga» sem ela;
--   · a referência gerada no ecrã e o AppyPay pediam valor − desconto.
-- Nenhuma escola tinha ainda multa nas regras de cobrança: nada foi cobrado a mais
-- nem a menos até hoje.
--
-- A regra (igual a src/features/finance/late-fee.ts):
--   · aplica-se uma vez: a fatura que já tem multa (penalty_amount > 0) não leva outra;
--   · só a pagamentos com data depois do vencimento mais a tolerância (quem paga no
--     último dia da tolerância não paga multa);
--   · valor = round(round(valor, 2) × round(percentagem, 2) / 100, 2);
--   · âmbito (Definições › Cobrança, school_settings domínio billing,
--     late_fee_scope): «all» (omissão) em todos os pagamentos; «electronic» só nos
--     electrónicos — métodos card e other (Multicaixa, Express, Unitel Money,
--     referências), não cash nem bank_transfer.
-- As regras lêem-se como em settings-domains.ts: percentagem 0–100, tolerância
-- 0–60 dias inteiros; valor ausente ou inválido conta como 0.
--
-- `private.register_payment` fica igual à da produção em tudo o resto: assinatura,
-- 2FA e permissão, bloqueio da fatura (FOR UPDATE), numeração e estado. O total a
-- pagar passa a ser valor − desconto + multa, como em settle_gateway_payment_service.
-- Se o pagamento for recusado (excede o saldo), a multa gravada desfaz-se com ele.
--
-- Idempotente (CREATE OR REPLACE). Não mexe em dados existentes.

CREATE OR REPLACE FUNCTION private.late_fee_due(
  target_school_id uuid,
  invoice_amount numeric,
  invoice_due_date date,
  invoice_penalty numeric,
  payment_date date,
  payment_method text
)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  rule jsonb;
  raw_percent jsonb;
  raw_grace jsonb;
  fee_percent numeric;
  grace_days integer;
begin
  if coalesce(invoice_penalty, 0) > 0 or invoice_due_date is null or payment_date is null
     or coalesce(invoice_amount, 0) <= 0 then
    return 0;
  end if;

  select s.value into rule from public.school_settings s
  where s.school_id = target_school_id and s.domain = 'billing';
  if rule is null or jsonb_typeof(rule) <> 'object' then
    return 0;
  end if;

  raw_percent := rule -> 'late_fee_percent';
  fee_percent := case
    when jsonb_typeof(raw_percent) = 'number' then (raw_percent #>> '{}')::numeric
    when jsonb_typeof(raw_percent) = 'string' and btrim(raw_percent #>> '{}') ~ '^[0-9]+([.][0-9]+)?$'
      then btrim(raw_percent #>> '{}')::numeric
    else 0
  end;
  fee_percent := round(least(greatest(fee_percent, 0), 100), 2);
  if fee_percent <= 0 then
    return 0;
  end if;

  if rule ->> 'late_fee_scope' = 'electronic'
     and coalesce(payment_method, '') not in ('card', 'other') then
    return 0;
  end if;

  raw_grace := rule -> 'grace_days';
  grace_days := round(least(greatest(case
    when jsonb_typeof(raw_grace) = 'number' then (raw_grace #>> '{}')::numeric
    when jsonb_typeof(raw_grace) = 'string' and btrim(raw_grace #>> '{}') ~ '^[0-9]+([.][0-9]+)?$'
      then btrim(raw_grace #>> '{}')::numeric
    else 0
  end, 0), 60))::integer;
  if payment_date <= invoice_due_date + grace_days then
    return 0;
  end if;

  return round(round(invoice_amount, 2) * fee_percent / 100, 2);
end;
$function$;
-- Só corre dentro de private.register_payment (SECURITY DEFINER), como o dono.
REVOKE ALL ON FUNCTION private.late_fee_due(uuid, numeric, date, numeric, date, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.register_payment(target_school_id uuid, target_invoice_id uuid, target_amount numeric, target_payment_method text, target_paid_on date DEFAULT CURRENT_DATE)
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
  insert into public.finance_receipts (school_id, invoice_id, receipt_number, amount, paid_on, payment_method, received_by)
  values (target_school_id, target_invoice_id, generated_number, target_amount, target_paid_on, target_payment_method, (select auth.uid()))
  returning id into new_receipt_id;

  new_status := case when already_paid + target_amount >= invoice_total then 'paid' else 'partially_paid' end;
  update public.finance_invoices set status = new_status where school_id = target_school_id and id = target_invoice_id;

  return jsonb_build_object('receiptId', new_receipt_id, 'receiptNumber', generated_number, 'invoiceStatus', new_status);
end;
$function$;


-- ══════════ 20261004141000_propinas_import_into_billing_rules.sql ══════════
-- Importação de «propinas» grava as regras de cobrança activas.
--
-- Até 2026-10-04 o importador gravava em school_billing_settings, que nada lê: as
-- regras activas (Definições › Cobrança, a multa por atraso, o desconto de irmãos)
-- estão em school_settings, domínio billing. Agora grava aí, só no domínio billing,
-- com 2FA e a mesma gravação versionada do ecrã (src/features/import/importers/
-- propinas-importer.ts).
--
-- A governança da importação (src/features/import/engine/governance.ts) exige que a
-- tabela de destino esteja «controlled» no catálogo. school_settings estava em
-- «review»: passa a «controlled», módulo financeiro. Só o importador de propinas a
-- tem como destino, e só o domínio billing; dados bancários, AGT e os outros domínios
-- nunca por importação (tests/finance/late-fee.test.ts confere as duas coisas).
--
-- Não toca nos dados de school_billing_settings (2 linhas a 2026-10-04): o que lá está
-- não passa a valer; cada escola revê as regras em Definições › Cobrança.
--
-- Idempotente: só altera a linha enquanto não estiver «controlled».

UPDATE public.import_table_specs
SET direct_import_policy = 'controlled',
    module_code = 'financeiro',
    notes = concat_ws(
      ' ',
      nullif(notes, ''),
      'Importação controlada só do domínio billing, pelo importador de propinas (com 2FA); dados bancários, AGT e restantes domínios nunca por importação.'
    )
WHERE table_schema = 'public'
  AND table_name = 'school_settings'
  AND direct_import_policy <> 'controlled';


-- ══════════ Confirmar ══════════
SELECT CASE WHEN to_regprocedure('private.late_fee_due(uuid, numeric, date, numeric, date, text)') IS NOT NULL
  AND position('private.late_fee_due' in pg_get_functiondef(
    to_regprocedure('private.register_payment(uuid, uuid, numeric, text, date)'))) > 0
THEN 'aplicada' ELSE 'por aplicar' END AS "20261004135000 multa por atraso",
CASE WHEN EXISTS (
  SELECT 1 FROM public.import_table_specs
   WHERE table_schema = 'public' AND table_name = 'school_settings'
     AND direct_import_policy = 'controlled'
) THEN 'aplicada' ELSE 'por aplicar' END AS "20261004141000 importação de propinas";
