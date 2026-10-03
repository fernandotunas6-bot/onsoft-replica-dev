-- Escalada de privilégios: de aluno a administrador, por uma linha de INSERT.
--
-- `school_invitations` tinha a mesma política larga das sete tabelas fechadas por
-- 20260924123000 — `FOR ALL TO authenticated USING is_school_member(school_id)` — mas aqui
-- a consequência é de outra ordem, porque a tabela tem uma coluna `role_code` e aceitar um
-- convite **concede o papel que lá estiver escrito** (`access/server.ts:909-926`: procura
-- `roles.code = role_code` e faz upsert em `member_roles`).
--
-- A cadeia completa, verificada contra a produção numa transacção revertida:
--
--   1. um utilizador cujo único papel é Aluno ou Encarregado — mas que é membro activo —
--      autentica-se;
--   2. insere directamente por PostgREST uma linha em `school_invitations` com
--      `school_id` = a sua escola (passa `is_school_member`),
--      `email`     = o seu próprio email (passa a verificação anti-sequestro do passo 3.1,
--                    que compara o email do convite com o da sessão),
--      `role_code` = 'admin' (existe: admin, owner, secretary, treasury, teacher,
--                    guardian, student, user),
--      `token_hash`= sha256 de um segredo que ele próprio escolhe;
--   3. chama o endpoint de aceitação com esse segredo;
--   4. o passo 5 da aceitação concede-lhe `admin`.
--
-- A verificação anti-sequestro não trava nada: o atacante põe o seu próprio email. E o
-- `token_hash` é dele, porque foi ele que criou a linha.
--
-- Verificado: `has_table_privilege('authenticated','school_invitations','INSERT')` é TRUE,
-- há um só trigger (carimbo de `updated_at`) e uma só CHECK (sobre `status`). Nada no
-- caminho o impedia. A inserção de um convite `admin` por um membro sem papel nenhum
-- **passou** na prova.
--
-- ---------------------------------------------------------------------------------------
-- A CORRECÇÃO
--
-- Nenhum acesso da aplicação a esta tabela passa pelo cliente do utilizador: as seis
-- ocorrências em `access/server.ts` (692, 726, 806, 846, 858, 960) correm todas em `admin`,
-- de `loadAdminClient()`. Logo o cliente do browser não precisa de escrever, e também não
-- precisa de ler.
--
-- Ao contrário das sete tabelas de 20260924123000, aqui a leitura **também** se aperta. Ali
-- manteve-se `is_school_member` no SELECT porque o dashboard lia com a sessão; aqui não há
-- leitor nenhum, e a lista de convites pendentes expõe emails e papéis por conceder. Fica
-- atrás de `rbac.memberships.read`, que é a permissão que a base já define para isto — um
-- convite é uma concessão de membership.
--
-- RELAÇÃO COM `20260924170000_close_invitation_and_module_grant_escalation.sql`
--
-- Essa migração chegou à mesma conclusão sobre `school_invitations`, e já foi aplicada:
-- trocou `ALL` por `SELECT` mantendo o nome e a condição `is_school_member`. Esta vai mais
-- longe em dois pontos, e por isso tem carimbo posterior — numa reposição ordenada, é esta
-- que fica:
--
--   · aperta a leitura a `rbac.memberships.read`, em vez de a deixar em `is_school_member`.
--     Lá isso fazia sentido porque o dashboard lia com a sessão; aqui não há leitor nenhum
--     pelo cliente do utilizador, e a lista de convites pendentes expõe emails e papéis por
--     conceder a quem não tem nada que ver com eles;
--   · retira o GRANT de escrita, que sem política já não era satisfazível, mas cuja
--     presença deixava a intenção ambígua.
--
-- O `DROP POLICY IF EXISTS` acima remove a política criada por essa migração, pelo que
-- aplicar as duas por ordem não deixa duas políticas de leitura sobrepostas — que seria
-- precisamente o defeito que ambas existem para corrigir.
--
-- APLICADA à produção (xodgfmxiaunpamctfeea) em 2026-09-24, e o retrato recapturado.

DROP POLICY IF EXISTS "Manage invitations in own school" ON public.school_invitations;

DROP POLICY IF EXISTS "Read invitations with membership permission" ON public.school_invitations;
CREATE POLICY "Read invitations with membership permission" ON public.school_invitations
  FOR SELECT TO authenticated
  USING (private.has_permission(school_id, 'rbac.memberships.read'));

-- Sem política de escrita para `authenticated`, o GRANT deixa de ter como ser satisfeito;
-- retirá-lo torna a intenção explícita e fecha a porta um nível acima do RLS.
-- service_role mantém tudo, que é por onde a aplicação escreve.
REVOKE INSERT, UPDATE, DELETE ON public.school_invitations FROM authenticated;
