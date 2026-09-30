-- Políticas de leitura duplicadas (advisor «multiple_permissive_policies»).
--
-- Na produção (2026-09-30) cinco tabelas tinham dois SELECT permissivos com a
-- mesma expressão, os mesmos papéis e o mesmo modo — `is_school_member(school_id)`
-- para `authenticated`. Os «Members read …» estão versionados em
-- 20260925190000_harden_member_wide_policies.sql; os «Read … in own school» foram
-- criados directamente na base e não existem em nenhuma migração.
--
-- Retirar uma cópia exacta não muda quem vê o quê (as permissivas somam-se por OR
-- e as duas são iguais); poupa avaliar a mesma função duas vezes por linha. Nas
-- quatro tabelas com dados de alunos a leitura continua limitada ao pessoal pela
-- política RESTRICTIVE de 20260930130000.
--
-- Guardado: só retira a cópia se a política versionada existir com a mesma
-- expressão. Idempotente.

DO $dedupe$
DECLARE
  pair text[];
  kept_qual text;
  dup_qual text;
BEGIN
  FOREACH pair SLICE 1 IN ARRAY ARRAY[
    ['siga_assessment_items',          'Members read siga_assessment_items',          'Read assessment items in own school'],
    ['siga_assessment_scores',         'Members read siga_assessment_scores',         'Read assessment scores in own school'],
    ['siga_attendance_justifications', 'Members read siga_attendance_justifications', 'Read attendance justifications in own school'],
    ['siga_attendance_records',        'Members read siga_attendance_records',        'Read attendance records in own school'],
    ['siga_attendance_sessions',       'Members read siga_attendance_sessions',       'Read attendance sessions in own school']
  ]
  LOOP
    SELECT qual INTO kept_qual FROM pg_policies
     WHERE schemaname = 'public' AND tablename = pair[1] AND policyname = pair[2]
       AND cmd = 'SELECT' AND permissive = 'PERMISSIVE';
    SELECT qual INTO dup_qual FROM pg_policies
     WHERE schemaname = 'public' AND tablename = pair[1] AND policyname = pair[3]
       AND cmd = 'SELECT' AND permissive = 'PERMISSIVE';
    IF dup_qual IS NULL THEN
      CONTINUE; -- já retirada
    END IF;
    IF kept_qual IS DISTINCT FROM dup_qual THEN
      RAISE NOTICE '%: "%" difere de "%"; mantida.', pair[1], pair[3], pair[2];
      CONTINUE;
    END IF;
    EXECUTE format('DROP POLICY %I ON public.%I', pair[3], pair[1]);
  END LOOP;
END
$dedupe$;
