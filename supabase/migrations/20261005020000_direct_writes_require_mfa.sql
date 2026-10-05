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
