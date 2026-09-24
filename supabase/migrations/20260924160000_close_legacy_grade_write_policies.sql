-- Achado P0 (docs/auditoria/05-auditoria.md, 5.3), a parte que a migracao
-- 20260924123000 nao cobriu. Essa fechou as tabelas cujo `FOR ALL` tinha como
-- condicao unica `is_school_member`. O modelo de notas `gradebooks`/`grade_items`/
-- `grade_scores` tem outra forma -- e continua aberto.
--
-- Cada uma das tres tem SEIS politicas: um par por comando, e em cada par uma
-- endurecida e uma antiga.
--
--   grade_scores UPDATE
--     grade_scores_update            is_aal2() AND has_permission('assessment.grades.manage')
--                                    AND updated_by = auth.uid()          ← endurecida
--     "Academic update grade scores" is_school_member AND can_manage_students()
--                                    OR <e o docente da disciplina>        ← antiga
--
-- Politicas permissivas combinam-se com OR: a antiga ganha sempre. Na pratica,
-- quem tem papel de `can_manage_students()` -- owner, admin, direccao,
-- coordenacao pedagogica, secretaria -- altera qualquer nota da escola **sem
-- MFA**, **sem a permissao `assessment.grades.manage`** e **sem que o autor
-- declarado tenha de ser o utilizador real**.
--
-- Esse ultimo ponto e o que estraga a auditoria: a politica endurecida existe
-- para amarrar `updated_by`/`recorded_by`/`created_by` a `auth.uid()`, e
-- `private.enforce_teacher_grade_score_scope` tira o actor **dessa coluna**
-- (`v_actor := COALESCE(NEW.updated_by, NEW.recorded_by)`) e devolve `NEW` sem
-- verificar nada quando ela vem nula. Sem a amarra, o trigger aceita o que lhe
-- derem, e o registo de auditoria fica com actor nulo.
--
-- ---------------------------------------------------------------------------
-- A MESMA PEDRA, UMA GERACAO DEPOIS
--
-- As politicas antigas vem de `20260903023500_fix_import_and_academic_rls.sql`,
-- que foi escrita precisamente para **remover** politicas `FOR ALL` amplas. O
-- comentario dela di-lo por palavras suas: "uma politica FOR ALL permissiva e
-- combinada por OR com elas e acaba por alargar o acesso". Na altura estas eram
-- o aperto. As endurecidas chegaram depois, e as de 03-09 passaram a ser o lado
-- fraco do par sem que ninguem reparasse.
--
-- Como vem de uma migracao numerada e nao de um `APPLY_*.sql` corrido a mao, nao
-- ha aqui fonte a tapar: larga-se e fica largado.
--
-- ---------------------------------------------------------------------------
-- PORQUE E SEGURO
--
-- Nenhuma escrita da aplicacao passa pelo cliente do utilizador. Verificado
-- ficheiro a ficheiro:
--
--   · src/features/academic/server-legacy.ts  -- `upsertTermGrade`,
--     `upsertTermGradesBatch` e `listTermGrades` fazem
--     `const db = await loadSgaAdminClient()` (:913, :943, :968) e passam esse
--     `db` a `sga-grades.ts` → `sga-grades-legacy.ts`, que e quem toca nas tres
--     tabelas.
--   · src/features/import/importers/notas-importer.ts e avaliacoes-importer.ts
--     escrevem em `ctx.db`, tipado em `import/server.ts:37,60` como
--     `Awaited<ReturnType<typeof loadSgaAdminClient>>`. O `ctx.sessionSupabase`
--     existe no mesmo contexto mas so e usado para as RPCs `register_student` e
--     `enroll_student` (`alunos-importer.ts:131,209`) -- nunca para notas.
--   · src/features/import/export-engine.ts -- so le.
--
-- `service_role` ignora RLS, logo largar estas politicas nao alcanca nenhum
-- caminho da aplicacao. Alcanca o acesso directo pelo PostgREST com o token do
-- utilizador, que e o buraco.
--
-- A leitura nao e tocada, pela mesma razao que 20260924123000 deu: apertar exige
-- mapear primeiro o que os portais do aluno e do encarregado precisam de ver.
-- As tres politicas `Academic read ...` ficam onde estao.
--
-- Idempotente. NAO foi aplicada -- e escrita na base, decisao do dono.
-- Depois de aplicar: `npm run siga:db-snapshot`.
-- ---------------------------------------------------------------------------

BEGIN;

DROP POLICY IF EXISTS "Academic create gradebooks"   ON public.gradebooks;
DROP POLICY IF EXISTS "Academic update gradebooks"   ON public.gradebooks;
DROP POLICY IF EXISTS "Academic create grade items"  ON public.grade_items;
DROP POLICY IF EXISTS "Academic update grade items"  ON public.grade_items;
DROP POLICY IF EXISTS "Academic create grade scores" ON public.grade_scores;
DROP POLICY IF EXISTS "Academic update grade scores" ON public.grade_scores;

COMMIT;

-- Ficam, todas ja existentes:
--   gradebooks    INSERT gradebooks_insert    UPDATE gradebooks_update    SELECT x2
--   grade_items   INSERT grade_items_insert   UPDATE grade_items_update   SELECT x2
--   grade_scores  INSERT grade_scores_insert  UPDATE grade_scores_update  SELECT x2
--
-- Nenhuma tem DELETE, e continua a nao ter: uma nota nao se apaga.

NOTIFY pgrst, 'reload schema';
