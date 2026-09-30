-- Escrita directa em pessoas, alunos, matrículas e turmas passa a exigir 2FA.
--
-- people, students, enrollments e class_groups tinham, para INSERT e UPDATE, duas
-- políticas permissivas: a actual (`*_insert_authorized` / `*_update_authorized`,
-- com private.is_aal2() e a permissão da acção) e uma antiga («Create/Update … in
-- own school», só is_school_office). As permissivas somam-se por OR: a antiga
-- anulava a exigência de 2FA, e quem tivesse só a senha de um Administrador ou da
-- Secretaria escrevia nestas tabelas pela API REST.
--
-- Nenhum caminho da app depende das antigas (verificado a 2026-09-30): as escritas
-- vão pelo servidor com a chave de serviço (BYPASSRLS), as funções INVOKER que
-- escrevem nestas tabelas não são executáveis por `authenticated`, e as que o são
-- (register_student, enroll_student) são SECURITY DEFINER. Nenhum trigger escreve
-- nelas.
--
-- Guardado: cada política antiga só sai se a actual, com is_aal2, existir para a
-- mesma tabela e comando: INSERT e UPDATE de people e class_groups, UPDATE de
-- students e enrollments. Os INSERT de students e enrollments não têm política
-- actual; por decisão do dono (2026-09-30) saem sem substituta: deixa de haver
-- inserção directa pela API nestas duas tabelas (a app insere pelo servidor e por
-- register_student / enroll_student, SECURITY DEFINER). Idempotente.

DO $legacy$
DECLARE
  item text[];
BEGIN
  FOREACH item SLICE 1 IN ARRAY ARRAY[
    ['people',       'INSERT', 'Create people in own school',       'people_insert_authorized'],
    ['people',       'UPDATE', 'Update people in own school',       'people_update_authorized'],
    ['students',     'UPDATE', 'Update students in own school',     'students_update_authorized'],
    ['enrollments',  'UPDATE', 'Update enrollments in own school',  'enrollments_update_authorized'],
    ['class_groups', 'INSERT', 'Create class_groups in own school', 'class_groups_insert_authorized'],
    ['class_groups', 'UPDATE', 'Update class_groups in own school', 'class_groups_update_authorized'],
    -- Sem substituta (quarta coluna vazia): a inserção directa deixa de existir.
    ['students',     'INSERT', 'Create students in own school',     ''],
    ['enrollments',  'INSERT', 'Create enrollments in own school',  '']
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = item[1] AND policyname = item[3]
    ) THEN
      CONTINUE; -- já retirada
    END IF;
    IF item[4] <> '' AND NOT EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = item[1] AND policyname = item[4]
         AND cmd = item[2] AND permissive = 'PERMISSIVE'
         AND coalesce(qual, '') || coalesce(with_check, '') LIKE '%is_aal2()%'
    ) THEN
      RAISE NOTICE '%: sem "%" com is_aal2; "%" mantida.', item[1], item[4], item[3];
      CONTINUE;
    END IF;
    EXECUTE format('DROP POLICY %I ON public.%I', item[3], item[1]);
  END LOOP;
END
$legacy$;
