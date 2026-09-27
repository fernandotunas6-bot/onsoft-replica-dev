-- Funções do portal antigo, órfãs desde que `portal_identities` foi apagada
-- (`supabase/cleanup_unused_sga_tables.sql`).
--
-- As oito funções abaixo lêem ou escrevem `public.portal_identities`, que não
-- existe na produção (verificado a 2026-09-28): qualquer chamada falha. A
-- aplicação não as chama — o portal de alunos e encarregados usa
-- `school_memberships` e `student_guardians`. Mas as cinco de `public` estavam
-- expostas como RPC a qualquer utilizador autenticado, e duas delas
-- (`claim_guardian_portal`, `claim_student_portal`) reactivavam ligações que a
-- escola tinha revogado (`on conflict … where status = 'revoked'`): se a
-- tabela voltasse a ser criada, a revogação deixava de valer.
--
-- Aqui só se retira a execução — nada é apagado, e um `GRANT` repõe tudo.
-- Idempotente; ignora as funções que já não existam.

DO $$
DECLARE
  assinatura text;
BEGIN
  FOREACH assinatura IN ARRAY ARRAY[
    'public.activate_guardian_portal_link(uuid, uuid)',
    'public.activate_student_portal_link(uuid, uuid)',
    'public.claim_guardian_portal()',
    'public.claim_student_portal()',
    'public.portal_list_wards()',
    'public.portal_list_my_student_profiles()',
    'public.portal_ward_overview(uuid, uuid)',
    'private.is_portal_guardian_of(uuid, uuid)',
    'private.is_portal_student_of(uuid, uuid)',
    'private.can_access_portal_student(uuid, uuid)'
  ]
  LOOP
    IF to_regprocedure(assinatura) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', assinatura);
    END IF;
  END LOOP;
END $$;
