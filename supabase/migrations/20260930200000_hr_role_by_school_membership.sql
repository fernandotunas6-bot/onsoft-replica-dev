-- RH e faturação: o papel passa a ser o da escola da linha, como no resto da app.
--
-- 35 políticas das tabelas hr_* e de school_billing_settings, e 10 funções hr_*,
-- comparavam current_profile_role() com 'Administrador' / 'Tesouraria'. Mas essa
-- função devolve o CÓDIGO do papel (owner, admin, treasury…): a comparação nunca
-- era verdadeira. Na produção (2026-09-30) um dono com 2FA recebia «Insufficient
-- payroll permission» em hr_create_payroll_run e lia 0 linhas das definições de
-- faturação. O RH não estava em uso (0 vínculos, 0 contratos, 0 folhas).
--
-- Troca, em cada política (texto lido da base, não reescrito à mão):
--   ( SELECT current_profile_role() AS current_profile_role)  → private.sga_app_role(school_id)
--   (school_id = ( SELECT current_school_id() AS current_school_id)) → is_school_member(school_id)
-- sga_app_role(school_id) é o papel na escola da linha, com os nomes que a app usa
-- (Administrador, Tesouraria…). Vai SEMPRE com is_school_member: para quem não é
-- membro, sga_app_role cai no cargo global do perfil, e sem a verificação de
-- membro um Administrador de outra escola passaria.
--
-- Em cada função hr_* (SECURITY INVOKER): public.current_profile_role() →
-- private.sga_app_role(public.current_school_id()), o papel na escola em que a
-- função já trabalha. As outras verificações das funções não mudam.
--
-- Fora de âmbito (comparam códigos e nomes misturados, mexer muda acessos fora do
-- RH): can_manage_students, can_read_students, current_school_role_is, a política
-- de UPDATE de schools e a de finance_gateway_webhook_events.
--
-- As restritivas de 2FA (20260930190000) e «School staff only» (20260930130000)
-- continuam por cima. Idempotente: depois de aplicada, não encontra nada a mudar.

DO $pols$
DECLARE
  p record;
  role_old constant text := '( SELECT current_profile_role() AS current_profile_role)';
  school_old constant text := '(school_id = ( SELECT current_school_id() AS current_school_id))';
  new_qual text;
  new_check text;
BEGIN
  FOR p IN
    SELECT tablename, policyname, cmd, roles, permissive, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (tablename LIKE 'hr\_%' OR tablename = 'school_billing_settings')
      AND coalesce(qual, '') || coalesce(with_check, '') LIKE '%current_profile_role()%'
  LOOP
    new_qual := replace(replace(p.qual, role_old, 'private.sga_app_role(school_id)'),
                        school_old, 'is_school_member(school_id)');
    new_check := replace(replace(p.with_check, role_old, 'private.sga_app_role(school_id)'),
                         school_old, 'is_school_member(school_id)');
    IF coalesce(new_qual, '') || coalesce(new_check, '') LIKE '%current_profile_role()%'
       OR coalesce(new_qual, '') || coalesce(new_check, '') NOT LIKE '%is_school_member(school_id)%' THEN
      RAISE NOTICE '%.%: expressão inesperada; mantida.', p.tablename, p.policyname;
      CONTINUE;
    END IF;
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
    EXECUTE format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s',
                   p.policyname, p.tablename, p.permissive, p.cmd, array_to_string(p.roles, ', '))
      || CASE WHEN new_qual IS NOT NULL THEN ' USING (' || new_qual || ')' ELSE '' END
      || CASE WHEN new_check IS NOT NULL THEN ' WITH CHECK (' || new_check || ')' ELSE '' END;
  END LOOP;
END
$pols$;

DO $fns$
DECLARE
  f record;
  def text;
BEGIN
  FOR f IN
    SELECT p.oid
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname LIKE 'hr\_%'
      AND NOT p.prosecdef
      AND p.prosrc LIKE '%current_profile_role()%'
  LOOP
    def := replace(pg_get_functiondef(f.oid), 'public.current_profile_role()',
                   'private.sga_app_role(public.current_school_id())');
    IF def LIKE '%current_profile_role()%' THEN
      RAISE NOTICE '%: chamada não qualificada a current_profile_role; mantida.', f.oid::regprocedure;
      CONTINUE;
    END IF;
    EXECUTE def;
  END LOOP;
END
$fns$;
