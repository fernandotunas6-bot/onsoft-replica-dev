-- Pautas oficiais: «Gerar pauta» e as mudanças de estado nunca funcionaram.
--
-- `public.build_grade_sheet` e `public.transition_grade_sheet` são SECURITY
-- INVOKER e chamam `private.build_grade_sheet` / `private.transition_grade_sheet`,
-- cujo EXECUTE só o `postgres` tinha (`CREATE OR REPLACE` mantém as permissões
-- antigas). A app chama-as com a sessão do utilizador (grade-sheets.ts), e a
-- base respondia sempre «permission denied for function build_grade_sheet»
-- (reproduzido a 2026-09-30 como `authenticated`, em transacção desfeita). A
-- produção não tinha nenhuma pauta.
--
-- Árvore de chamadas (produção, 2026-09-30; igual às definições do repositório):
--   build_grade_sheet      → has_permission, is_aal2, archive_grade_sheet_version
--                            (já executáveis) e compute_subject_averages
--   compute_subject_averages → round_grade
--   transition_grade_sheet → has_permission, is_aal2 (já executáveis)
-- Por isso as quatro funções abaixo, não só as duas de topo.
--
-- Porque não abre nada de novo:
--   · build_grade_sheet e transition_grade_sheet verificam auth.uid(),
--     private.is_aal2() e private.has_permission(...) antes de tocar em dados;
--   · as quatro são SECURITY INVOKER: todas as leituras e escritas continuam
--     sujeitas ao RLS de quem chama (grade_sheets e grade_sheet_rows exigem
--     aal2 + assessment.grades.manage, created_by/updated_by = auth.uid());
--   · compute_subject_averages lê notas com o RLS de quem chama; round_grade é
--     aritmética.
--
-- As outras 29 funções public.* com o mesmo defeito (open_gradebook,
-- publish_assessment_rule_version, create_document_request, …) ficam como
-- estão: a app não as chama (os modelos de avaliação publicam-se pelo servidor,
-- siga_publish_assessment_rule). Dar-lhes EXECUTE seria abrir superfície sem uso.
--
-- Idempotente: GRANT/REVOKE repetidos não falham; funções ausentes são saltadas.

DO $grant$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'private.build_grade_sheet(uuid, uuid, uuid, text)',
    'private.transition_grade_sheet(uuid, uuid, text, text)',
    'private.compute_subject_averages(uuid, uuid, uuid)',
    'private.round_grade(numeric, text, smallint)'
  ]
  LOOP
    IF to_regprocedure(fn) IS NULL THEN
      RAISE NOTICE 'Função % não existe; saltada.', fn;
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
  END LOOP;
END
$grant$;
