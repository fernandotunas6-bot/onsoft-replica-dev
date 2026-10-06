-- SIGA Plus — SQL a aplicar no Supabase (projecto Sga), pacote de 2026-10-06
--
-- Colar TUDO no SQL Editor → Run. Pode correr mais do que uma vez sem problema:
-- as cinco migrações são idempotentes. Usa-se o SQL Editor e não `apply_migration`
-- porque a ferramenta cancela as migrações com `DROP` (tentado a 04/10 e a 05/10,
-- cancelado duas vezes e expirado duas vezes sem aplicar nada).
--
-- Junta, por ordem de versão, as cinco migrações que estão no repositório e não
-- estão na produção. As três primeiras são os achados da auditoria 12 (A6, A5, A9);
-- as duas últimas são as funcionalidades de 05/10 (também disponíveis em pacote
-- separado: SIGA_aplicar_propina_por_classe.sql e SIGA_aplicar_mudar_turma.sql).
--
--   1. 20261005010000_assessment_closed_term_guard   — A6: escrita directa em
--      siga_assessment_items/_scores recusada quando a pauta está oficial.
--   2. 20261005020000_direct_writes_require_mfa      — A5: 2FA nas escritas directas
--      de 11 tabelas da plataforma e das duas de avaliações.
--   3. 20261005030000_school_row_role_policies       — A9: papel pela escola da linha
--      nos eventos de gateway; retira a política morta de `schools`.
--   4. 20261005150000_fee_items_grade_level          — propina por classe.
--   5. 20261006100000_enrollment_class_change        — mudar de turma no mesmo ano.
--
-- Ensaiadas em PGlite a 2026-10-06, as cinco a passar:
--   tests/sql/assessment-closed-term.mjs, direct-writes-mfa.mjs,
--   school-row-role-policies.mjs, fee-items-grade-level.mjs, enrollment-class-change.mjs
--
-- Confirmar no fim com a consulta do fundo deste ficheiro: as 5 linhas devem dizer
-- "aplicada". A sonda completa de todas as migrações está em SIGA_confirmar_migracoes.sql.
--
-- Depois de aplicar: recapturar supabase/PRODUCTION_SNAPSHOT.json e retirar
-- fee_items.grade_level_id de tests/security/espera-migracao.ts.



-- ══════════ 20261005010000_assessment_closed_term_guard.sql ══════════
-- Fecho de período na base para as avaliações (auditoria 12, A6).
--
-- O servidor recusa lançar ou alterar avaliações e notas de um período cuja pauta já é oficial
-- (`assertAssessmentTermNotLocked`, src/features/academic/sga-grades.ts): existe uma pauta da
-- turma em homologated / published / closed / contested que é anual ou do mesmo período.
-- Mas `siga_assessment_items` e `siga_assessment_scores` aceitam escrita directa do papel
-- `authenticated` pela API REST (políticas "Manage assigned assessment ..."), e os triggers
-- que lá existem só verificam o âmbito do professor, não o fecho.
--
-- Este trigger repete a mesma regra na base, SÓ para pedidos de utilizadores (auth.uid() não
-- nulo e fora de service_role): o servidor continua a validar como hoje e a manutenção feita
-- pelo SQL Editor / migrações (sem auth.uid()) não é afectada. Idempotente.

CREATE OR REPLACE FUNCTION private.assessment_term_is_locked(
  p_school_id uuid, p_class_group_id uuid, p_term integer
) RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_term_id uuid;
BEGIN
  -- Mesmo critério do servidor: sem ano lectivo ou sem período configurado, nada a bloquear.
  SELECT t.id INTO v_term_id
  FROM public.class_groups cg
  JOIN public.terms t
    ON t.school_id = cg.school_id
   AND t.academic_year_id = cg.academic_year_id
   AND t.sequence = p_term
  WHERE cg.school_id = p_school_id AND cg.id = p_class_group_id
  LIMIT 1;
  IF v_term_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.grade_sheets gs
    WHERE gs.school_id = p_school_id
      AND gs.class_group_id = p_class_group_id
      AND gs.status IN ('homologated', 'published', 'closed', 'contested')
      AND (gs.kind = 'annual' OR gs.term_id = v_term_id)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION private.enforce_assessment_closed_term()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_class uuid;
  v_term integer;
  v_locked boolean := false;
BEGIN
  -- O servidor (service_role) valida por si; a manutenção sem sessão também passa.
  IF private.sga_request_is_service_role() OR (SELECT auth.uid()) IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  -- Estado anterior (UPDATE e DELETE) e estado novo (INSERT e UPDATE): ambos têm de estar abertos.
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    IF TG_TABLE_NAME = 'siga_assessment_items' THEN
      v_locked := private.assessment_term_is_locked(OLD.school_id, OLD.class_group_id, OLD.term);
    ELSE
      SELECT ai.class_group_id, ai.term INTO v_class, v_term
      FROM public.siga_assessment_items ai
      WHERE ai.id = OLD.item_id AND ai.school_id = OLD.school_id;
      v_locked := v_class IS NOT NULL
        AND private.assessment_term_is_locked(OLD.school_id, v_class, v_term);
    END IF;
  END IF;

  IF NOT v_locked AND TG_OP IN ('INSERT', 'UPDATE') THEN
    IF TG_TABLE_NAME = 'siga_assessment_items' THEN
      v_locked := private.assessment_term_is_locked(NEW.school_id, NEW.class_group_id, NEW.term);
    ELSE
      v_class := NULL;
      SELECT ai.class_group_id, ai.term INTO v_class, v_term
      FROM public.siga_assessment_items ai
      WHERE ai.id = NEW.item_id AND ai.school_id = NEW.school_id;
      v_locked := v_class IS NOT NULL
        AND private.assessment_term_is_locked(NEW.school_id, v_class, v_term);
    END IF;
  END IF;

  IF v_locked THEN
    RAISE EXCEPTION 'A pauta deste período já é oficial: as notas e avaliações já não se alteram aqui. Peça a alteração na pauta (Pedagógica → Pautas), com o motivo.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.assessment_term_is_locked(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.enforce_assessment_closed_term() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_assessment_item_closed_term ON public.siga_assessment_items;
CREATE TRIGGER enforce_assessment_item_closed_term
  BEFORE INSERT OR UPDATE OR DELETE ON public.siga_assessment_items
  FOR EACH ROW EXECUTE FUNCTION private.enforce_assessment_closed_term();

DROP TRIGGER IF EXISTS enforce_assessment_score_closed_term ON public.siga_assessment_scores;
CREATE TRIGGER enforce_assessment_score_closed_term
  BEFORE INSERT OR UPDATE OR DELETE ON public.siga_assessment_scores
  FOR EACH ROW EXECUTE FUNCTION private.enforce_assessment_closed_term();


-- ══════════ 20261005020000_direct_writes_require_mfa.sql ══════════
-- 2FA nas escritas directas pela API (auditoria 12, A5; DATABASE_RULES.md regra 6c).
--
-- Política RESTRICTIVE por comando, no mesmo modelo de 20260930190000_money_writes_require_mfa.sql:
-- o papel `authenticated` só escreve com uma sessão aal2. O servidor escreve com `service_role`
-- (contorna a RLS) e continua igual; o que muda é a escrita directa pela API REST com o token do
-- utilizador, que passa a exigir o segundo factor.
--
-- Âmbito escolhido de propósito curto. Só entram tabelas onde se confirmou que nada escreve com o
-- token do utilizador (nem o browser, nem uma função RPC INVOKER, nem outra app do ecossistema):
--   · plataforma (SaaS): tenants, subscriptions, subscription_addons, plans, tenant_domains,
--     tenant_provisioning, tenant_usage, saas_audit_logs, school_slug_history,
--     reserved_subdomains, email_aliases — escritas pelo ADMIN através da API SaaS (service_role);
--   · avaliações: siga_assessment_items, siga_assessment_scores — escritas só em
--     features/academic/server-legacy.ts e lesson-plans/server.ts, com o cliente de serviço.
-- Fora de propósito (escrevem com o token do utilizador; exigir aal2 partiria quem não tem 2FA):
--   profiles, notifications, siga_chat_*, calendar_feed_tokens, staff_module_grants (server fn com o
--   cliente do utilizador) e as tabelas hr_* escritas por RPC INVOKER.
--
-- Idempotente; salta tabelas que não existam.

DO $mfa$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenants', 'subscriptions', 'subscription_addons', 'plans', 'tenant_domains',
    'tenant_provisioning', 'tenant_usage', 'saas_audit_logs', 'school_slug_history',
    'reserved_subdomains', 'email_aliases',
    'siga_assessment_items', 'siga_assessment_scores'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'Tabela public.% não existe; saltada.', t;
      CONTINUE;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS "Direct writes require MFA (insert)" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Direct writes require MFA (update)" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Direct writes require MFA (delete)" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Direct writes require MFA (insert)" ON public.%I AS RESTRICTIVE '
      'FOR INSERT TO authenticated WITH CHECK (private.is_aal2())', t);
    EXECUTE format(
      'CREATE POLICY "Direct writes require MFA (update)" ON public.%I AS RESTRICTIVE '
      'FOR UPDATE TO authenticated USING (private.is_aal2()) WITH CHECK (private.is_aal2())', t);
    EXECUTE format(
      'CREATE POLICY "Direct writes require MFA (delete)" ON public.%I AS RESTRICTIVE '
      'FOR DELETE TO authenticated USING (private.is_aal2())', t);
  END LOOP;
END
$mfa$;


-- ══════════ 20261005030000_school_row_role_policies.sql ══════════
-- Papel pela escola da linha em duas políticas que ainda usavam o perfil global
-- (auditoria 12, A9; DATABASE_RULES.md regra 6d). Idempotente.
--
-- 1) finance_gateway_webhook_events — "Read gateway webhook events in own school" aceitava
--    `current_profile_role()` (papel da escola activa, não da linha) OU `profiles.cargo` em
--    ('Administrador','Tesouraria'), que é o cargo GLOBAL da pessoa. Com isso, um Administrador
--    da escola A que fosse apenas membro da escola B (encarregado, por exemplo) lia os eventos
--    de pagamento da escola B. Passa a exigir o papel nessa mesma escola. O código lê esta
--    tabela só com o cliente de serviço (finance/server.ts, gateway-webhook-handler.ts,
--    platform-ops.ts), por isso nada no SIGA muda; fecha-se a leitura directa pela API.
--
-- 2) schools — "Administrators can update their own school" comparava `current_profile_role()`
--    (devolve o código do papel: owner, admin, treasury…) com 'Administrador'. Nenhum código de
--    papel na produção é 'Administrador' (consultado a 04/10: owner, admin, secretary, treasury,
--    teacher, guardian, student, user), por isso a política nunca deu acesso. O servidor
--    actualiza a escola com o cliente de serviço (school/server.ts, updateSchoolSettings).
--    Retira-se a política em vez de a "reparar", para não abrir uma escrita directa nova.

DROP POLICY IF EXISTS "Read gateway webhook events in own school" ON public.finance_gateway_webhook_events;
CREATE POLICY "Read gateway webhook events in own school" ON public.finance_gateway_webhook_events
  FOR SELECT TO authenticated
  USING (
    (school_id IS NOT NULL)
    AND (school_id IN (SELECT private.user_member_school_ids()))
    AND (private.sga_app_role(school_id) = ANY (ARRAY['Administrador'::text, 'Tesouraria'::text]))
  );

DROP POLICY IF EXISTS "Administrators can update their own school" ON public.schools;


-- ══════════ 20261005150000_fee_items_grade_level.sql ══════════
-- Propina por classe: um item do plano pode ter o preço de uma classe.
--
-- Até 2026-10-05 o plano de propinas tinha um preço por tipo (propina, matrícula) e a
-- tesouraria escrevia o valor de cada fatura à mão; o modelo oficial de importação de
-- «propinas» já pedia um preço por classe e era ignorado. Agora:
--   · fee_items.grade_level_id (opcional): o item vale para essa classe; sem ela é o
--     preço geral, como até aqui;
--   · a emissão de faturas escolhe o item da classe do aluno e, sem valor escrito, usa
--     o preço dele (src/features/finance/fee-items.ts);
--   · Definições › Cobrança › Plano de propinas e a importação de propinas gravam-nos.
--
-- A classe tem de ser da mesma escola (chave composta, como fee_plans). Apagar a classe
-- apaga o preço dela (se nenhuma fatura o usar; com faturas, o apagar é recusado, como
-- já era pelas turmas). Um só preço activo por classe e tipo em cada plano.
--
-- Idempotente. Não mexe nos itens existentes (ficam como preço geral).

ALTER TABLE public.fee_items ADD COLUMN IF NOT EXISTS grade_level_id uuid;

DO $fee_items$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.fee_items'::regclass AND conname = 'fee_items_grade_level_fkey'
  ) THEN
    ALTER TABLE public.fee_items
      ADD CONSTRAINT fee_items_grade_level_fkey
      FOREIGN KEY (school_id, grade_level_id)
      REFERENCES public.grade_levels (school_id, id)
      ON DELETE CASCADE;
  END IF;
END
$fee_items$;

CREATE UNIQUE INDEX IF NOT EXISTS fee_items_plan_grade_kind_active_key
  ON public.fee_items (school_id, fee_plan_id, kind, grade_level_id)
  WHERE is_active AND grade_level_id IS NOT NULL;


-- ══════════ 20261006100000_enrollment_class_change.sql ══════════
-- Mudar um aluno de turma no mesmo ano lectivo, com as vagas da turma.
--
-- Até 2026-10-05 o gatilho private.protect_enrollment_identity tratava a turma como
-- parte da identidade da matrícula e recusava qualquer UPDATE de class_group_id
-- («Identidade da matrícula é imutável.»). Por isso «Alterar turma» na ficha do aluno,
-- a atribuição em lote a alunos já matriculados e a importação de matrículas com
-- «actualizar» falhavam sempre que a turma mudava: nas 36 matrículas da produção
-- (leitura de 2026-10-05) nunca houve uma mudança de turma gravada.
--
-- Mudar de turma dentro do ano é uma operação normal e tem de manter a matrícula: as
-- notas, as presenças e o contrato financeiro estão ligados a ela. Agora:
--   · a turma pode mudar, se a nova for da mesma escola e do mesmo ano lectivo da
--     matrícula e estiver activa;
--   · ocupar um lugar (mudar de turma, ou voltar a pending/active) respeita a lotação,
--     com a mesma regra de private.enroll_student: pending e active contam, e a turma
--     fica bloqueada (FOR UPDATE) enquanto se conta;
--   · o resto da identidade (escola, ano, aluno, número, criação) continua imutável.
--
-- SECURITY DEFINER para contar as vagas sem depender da RLS de quem grava; corre só
-- como gatilho (BEFORE UPDATE). Idempotente. Não mexe em dados.

CREATE OR REPLACE FUNCTION private.protect_enrollment_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_group public.class_groups%rowtype;
  occupied_places integer;
begin
  if new.id <> old.id or new.school_id <> old.school_id
     or new.academic_year_id <> old.academic_year_id
     or new.student_id <> old.student_id
     or new.enrollment_number <> old.enrollment_number
     or new.created_by <> old.created_by or new.created_at <> old.created_at then
    raise exception using errcode = '22023', message = 'Identidade da matrícula é imutável.';
  end if;

  -- Ocupa um lugar: mudou de turma, ou passou a pending/active vindo de outro estado.
  if new.status in ('pending', 'active')
     and (new.class_group_id is distinct from old.class_group_id
          or old.status not in ('pending', 'active')) then
    select * into target_group from public.class_groups
    where school_id = new.school_id and id = new.class_group_id
    for update;
    if target_group.id is null or target_group.academic_year_id <> new.academic_year_id then
      raise exception using errcode = '22023',
        message = 'A turma nova tem de ser da mesma escola e do mesmo ano lectivo da matrícula.';
    end if;
    if new.class_group_id is distinct from old.class_group_id and target_group.status <> 'active' then
      raise exception using errcode = '22023', message = 'Turma ativa inválida para esta escola.';
    end if;
    select count(*) into occupied_places from public.enrollments
    where school_id = new.school_id and class_group_id = new.class_group_id
      and status in ('pending', 'active') and id <> new.id;
    if occupied_places >= target_group.capacity then
      raise exception using errcode = '23514', message = 'A turma atingiu a capacidade configurada.';
    end if;
  end if;

  new.end_reason := nullif(btrim(new.end_reason), '');
  new.updated_at := now();
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION private.protect_enrollment_identity() FROM PUBLIC, anon, authenticated;


-- ══════════ Confirmação (só leitura) ══════════
-- As 5 linhas devem dizer "aplicada".

select migracao, case when ok then 'aplicada' else 'EM FALTA' end as estado
from (values
  ('20261005010000_assessment_closed_term_guard',
     to_regprocedure('private.assessment_term_is_locked(uuid, uuid, integer)') is not null
     and exists (select 1 from pg_trigger
                 where tgname = 'enforce_assessment_item_closed_term' and not tgisinternal)
     and exists (select 1 from pg_trigger
                 where tgname = 'enforce_assessment_score_closed_term' and not tgisinternal)),
  ('20261005020000_direct_writes_require_mfa',
     (select count(*) from pg_policies
      where schemaname = 'public'
        and policyname = 'Direct writes require MFA (insert)'
        and tablename in ('tenants', 'subscriptions', 'subscription_addons', 'plans',
                          'tenant_domains', 'tenant_provisioning', 'tenant_usage',
                          'saas_audit_logs', 'school_slug_history', 'reserved_subdomains',
                          'email_aliases', 'siga_assessment_items', 'siga_assessment_scores')) = 13),
  ('20261005030000_school_row_role_policies',
     exists (select 1 from pg_policies
             where tablename = 'finance_gateway_webhook_events'
               and policyname = 'Read gateway webhook events in own school'
               and qual like '%sga_app_role%')
     and not exists (select 1 from pg_policies
                     where tablename = 'schools'
                       and policyname = 'Administrators can update their own school')),
  ('20261005150000_fee_items_grade_level',
     exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'fee_items'
               and column_name = 'grade_level_id')
     and to_regclass('public.fee_items_plan_grade_kind_active_key') is not null),
  ('20261006100000_enrollment_class_change',
     coalesce(position('A turma atingiu a capacidade' in pg_get_functiondef(
       to_regprocedure('private.protect_enrollment_identity()'))) > 0, false))
) as m(migracao, ok)
order by migracao;
