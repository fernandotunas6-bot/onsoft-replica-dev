-- Fecha o buraco mais grave encontrado na auditoria da área 5
-- (docs/auditoria/05-auditoria.md): **um aluno ou encarregado autenticado pode escrever
-- notas, avaliações, presenças e histórico académico de qualquer aluno da sua escola.**
--
-- Como acontece:
--
--   1. Estas tabelas têm uma política `FOR ALL TO authenticated` cuja condição é apenas
--      `public.is_school_member(school_id)` — que é `EXISTS (school_memberships activa)`,
--      **sem olhar ao papel**. `Aluno` e `Encarregado` são papéis com membership
--      (`access-policy.ts:51`; `attendance-server.ts:637` decide por `appRole === "Aluno"`).
--   2. Em `siga_assessment_items` e `siga_assessment_scores` existe ao lado a política
--      estrita certa (`current_user_can_manage_assessment_*`). Não adianta: o PostgreSQL
--      combina políticas **permissivas com OR**, portanto a larga vence sempre.
--   3. Os triggers de âmbito não tapam. `enforce_teacher_assessment_score_scope` foi
--      desenhado para restringir *docentes*: quem não é gestor nem docente cai no
--      `RETURN NEW` (20260903041000:224-229). Não é uma porta, é um corrimão.
--
-- `HARDEN_TEACHER_ASSESSMENT_SCOPE.sql:157,177` já tinha feito a correcção certa — larga a
-- política ampla antes de criar a estrita. Mas `APPLY_ENROLLMENT_AND_PREMIUM.sql:439-444`
-- recria-a, é idempotente, e nenhum dos dois é migração numerada. Correr o APPLY depois do
-- HARDEN reabre tudo em silêncio, e foi o que a produção ficou a ter. É por isso que a
-- correcção vem aqui, em `migrations/`, e não em mais um script solto.
--
-- ---------------------------------------------------------------------------------------
-- O QUE ESTA MIGRAÇÃO FAZ, E PORQUE É SEGURA
--
-- Troca `FOR ALL` por `FOR SELECT`, mantendo **exactamente** a mesma condição. Ou seja:
-- tira a escrita ao cliente do browser e não mexe em nenhuma leitura.
--
-- É seguro porque nenhuma escrita da aplicação passa pelo cliente do utilizador.
-- Verificado ficheiro a ficheiro: todos os `insert`/`update`/`upsert`/`delete` sobre estas
-- sete tabelas correm em `db` / `ctx.db`, que vêm de `loadSgaAdminClient()` (service_role,
-- que ignora RLS) —
--   · siga_assessment_items/_scores → academic/server-legacy.ts, lesson-plans/server.ts
--   · siga_attendance_*            → pedagogica/attendance-server.ts, import/presencas-importer.ts,
--                                    hr/teacher-lessons.ts, academic/advanced-academic-server.ts
--   · student_academic_history     → import/historico-academico-importer.ts
--   · student_status_history       → students/status-history.ts
--
-- E as leituras pelo cliente da sessão ficam intactas: `dashboard/server.ts` lê
-- `siga_assessment_scores` (:420) e `siga_attendance_sessions` (:915) com
-- `context.supabase`, e continua a poder.
--
-- ---------------------------------------------------------------------------------------
-- O QUE ESTA MIGRAÇÃO **NÃO** FAZ
--
-- Não aperta a *leitura*. Hoje qualquer membro da escola lê as notas e as presenças de
-- todos os alunos, e isso continua verdade depois desta migração. É um problema real de
-- privacidade, mas apertá-lo exige mapear primeiro o que o portal do aluno e o do
-- encarregado precisam de ver — caso contrário partem-se ecrãs legítimos. Fica separado de
-- propósito: esta migração resolve a escrita, que é inequívoca e não tem esse risco.
--
-- APLICADA à produção (xodgfmxiaunpamctfeea) em 2026-09-24, e o retrato recapturado.
--
-- Verificado na própria base, numa transacção revertida, com um membro activo a quem se
-- retiraram todos os papéis — o caso 'Aluno/Encarregado':
--   · lançar nota em siga_assessment_scores .... 42501 (bloqueado)
--   · inserir em student_academic_history ...... 42501 (bloqueado)
--   · ler siga_assessment_scores ................ continua a funcionar
--
-- Nota sobre o alcance real: à data da aplicação não existia na base um único membro
-- activo sem papel de docente ou de gestão, pelo que o buraco estava **latente** e não
-- explorado. Fechá-lo antes de existirem contas de aluno e de encarregado é precisamente
-- o momento certo.

-- Avaliações — a política estrita `Manage assigned assessment items` fica a governar a
-- escrita, que era a intenção original do HARDEN.
DROP POLICY IF EXISTS "Manage assessment items in own school" ON public.siga_assessment_items;
CREATE POLICY "Read assessment items in own school" ON public.siga_assessment_items
  FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));

DROP POLICY IF EXISTS "Manage assessment scores in own school" ON public.siga_assessment_scores;
CREATE POLICY "Read assessment scores in own school" ON public.siga_assessment_scores
  FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));

-- Presenças — aqui não havia política estrita nenhuma ao lado. Sem política de escrita para
-- `authenticated`, o cliente do browser deixa de poder marcar faltas; a aplicação não
-- perde nada, porque marca sempre por service_role.
DROP POLICY IF EXISTS "Manage attendance sessions in own school" ON public.siga_attendance_sessions;
CREATE POLICY "Read attendance sessions in own school" ON public.siga_attendance_sessions
  FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));

DROP POLICY IF EXISTS "Manage attendance records in own school" ON public.siga_attendance_records;
CREATE POLICY "Read attendance records in own school" ON public.siga_attendance_records
  FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));

DROP POLICY IF EXISTS "Manage attendance justifications in own school" ON public.siga_attendance_justifications;
CREATE POLICY "Read attendance justifications in own school" ON public.siga_attendance_justifications
  FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));

-- Histórico académico — a verificação 5.8 pede-o "imutável ou versionado após aprovação".
-- Não é nem uma coisa nem outra, e além de editável por qualquer membro **não tem um único
-- trigger** (confirmado: não aparece nos 173 triggers do retrato de produção), nem sequer
-- `audit_row_change`, que `grade_scores`, `gradebooks`, `grade_sheets`, `report_cards` e
-- `enrollments` têm. Tirar a escrita ao cliente é o primeiro passo; a imutabilidade e a
-- auditoria são trabalho à parte.
DROP POLICY IF EXISTS "School members can access student academic history" ON public.student_academic_history;
CREATE POLICY "School members can read student academic history" ON public.student_academic_history
  FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));

DROP POLICY IF EXISTS "School members can access student status history" ON public.student_status_history;
CREATE POLICY "School members can read student status history" ON public.student_status_history
  FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));

-- Nas cinco tabelas que ficaram sem **nenhuma** política de escrita, retirar também o GRANT
-- torna a intenção explícita e fecha a porta um nível acima do RLS. service_role mantém tudo.
--
-- As duas tabelas de avaliação ficam de fora de propósito: aí a escrita passa a ser governada
-- pela política estrita `Manage assigned assessment items/scores`, que é legítima e é a que o
-- HARDEN queria deixar a mandar. Revogar o GRANT mataria-a também, e isso não é fechar um
-- buraco — é apagar a porta certa junto com a errada.
REVOKE INSERT, UPDATE, DELETE ON public.siga_attendance_sessions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.siga_attendance_records FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.siga_attendance_justifications FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.student_academic_history FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.student_status_history FROM authenticated;
