-- Continuacao de 20260924123000 / 20260924140000 / 20260924160000. Restam dez
-- tabelas com `FOR ALL` amplo (ver `tests/security/politicas-largas-de-escrita.test.ts`).
-- Estas duas sao as que permitem **subir de privilegio**, e por isso vem primeiro.
--
-- `school_invitations` tem uma coluna `role_code`. Com
--   ALL → is_school_member(school_id)
-- qualquer membro activo cria um convite com `role_code = 'owner'` e aceita-o a
-- seguir, ou altera o `role_code` de um convite pendente de outra pessoa.
--
-- `staff_module_grants` decide que modulos cada funcionario ve. A politica
-- chama-se "Admins manage staff grants" e a condicao e so
--   ALL → is_school_member(school_id)
-- Qualquer membro concede a si proprio qualquer modulo, a qualquer nivel. O nome
-- da politica diz o que ela devia fazer; a condicao nunca o implementou.
--
-- ---------------------------------------------------------------------------
-- AS DUAS NAO SE TRATAM DA MESMA MANEIRA
--
-- `school_invitations`: a aplicacao so lhe toca em `access/server.ts`, nas seis
-- ocorrencias (:692, :726, :806, :846, :858, :960), e todas sob
-- `const admin = await loadAdminClient()`. `service_role` ignora RLS, logo basta
-- trocar `ALL` por `SELECT` -- a escrita sai do cliente do browser e nao ha
-- caminho da aplicacao a perder.
--
-- `staff_module_grants`: **e escrita pelo cliente da sessao**, em
-- `access/grants.ts` (`listStaffModuleGrants` :41, `setStaffModuleGrant` :63,
-- `clearStaffModuleGrant` :90). Tirar-lhe a escrita sem por nada no lugar partia
-- o painel de acessos. As tres exigem `requireSgaWriter(..., ["Administrador"])`,
-- por isso a politica passa a dizer o mesmo -- e ai a base deixa de depender de
-- a aplicacao se lembrar.
--
-- A leitura de `staff_module_grants` passa a ser o que o nome da politica ja
-- prometia: as proprias, ou todas se for administracao. Verificado seguro --
-- `listStaffModuleGrants` e a unica leitura pela sessao e ja exige
-- `Administrador`; `auth/server.ts:305` le as do proprio utilizador mas com
-- `loadSgaAdminClient()` (:217), que ignora RLS.
--
-- Idempotente. NAO foi aplicada -- e escrita na base, decisao do dono.
-- Depois de aplicar: `npm run siga:db-snapshot`.
-- ---------------------------------------------------------------------------

BEGIN;

-- ---------------------------------------------------------------------------
-- O papel na escola, generalizado.
--
-- `private.sga_file_role` (20260924072000) ja fazia este mapeamento, mas com um
-- nome preso aos ficheiros. Passa a ser `sga_app_role`, e a antiga fica como
-- invocacao desta, para as politicas de `siga_files` continuarem validas.
--
-- Continua a nao assentar em `current_profile_role()`: essa escolhe a inscricao
-- mais antiga de TODAS as escolas do utilizador e devolve o papel errado a quem
-- pertence a duas.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.sga_app_role(p_school_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(
    (
      SELECT CASE lower(btrim(r.code))
               WHEN 'owner'         THEN 'Administrador'
               WHEN 'admin'         THEN 'Administrador'
               WHEN 'administrador' THEN 'Administrador'
               WHEN 'secretary'     THEN 'Secretaria'
               WHEN 'secretaria'    THEN 'Secretaria'
               WHEN 'treasury'      THEN 'Tesouraria'
               WHEN 'tesouraria'    THEN 'Tesouraria'
               WHEN 'finance'       THEN 'Tesouraria'
               WHEN 'teacher'       THEN 'Professor'
               WHEN 'professor'     THEN 'Professor'
               WHEN 'guardian'      THEN 'Encarregado'
               WHEN 'encarregado'   THEN 'Encarregado'
               WHEN 'parent'        THEN 'Encarregado'
               WHEN 'student'       THEN 'Aluno'
               WHEN 'aluno'         THEN 'Aluno'
               ELSE 'Utilizador'
             END
      FROM public.school_memberships sm
      JOIN public.member_roles mr ON mr.membership_id = sm.id
      JOIN public.roles r         ON r.id = mr.role_id
      WHERE sm.user_id = (SELECT auth.uid())
        AND sm.school_id = p_school_id
        AND sm.status = 'active'
      ORDER BY sm.created_at ASC
      LIMIT 1
    ),
    (SELECT cargo FROM public.profiles WHERE id = (SELECT auth.uid()) LIMIT 1),
    'Utilizador'
  );
$$;

REVOKE ALL ON FUNCTION private.sga_app_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.sga_app_role(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION private.sga_app_role(uuid) IS
  'Papel do utilizador actual nessa escola, no vocabulario de ApplicationRole (mapAppRoleToSgaCodes). Com ambito de escola.';

-- A antiga passa a invocar esta. As politicas de `siga_files` nao mudam.
CREATE OR REPLACE FUNCTION private.sga_file_role(p_school_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
  SELECT private.sga_app_role(p_school_id);
$$;

-- ---------------------------------------------------------------------------
-- school_invitations: a escrita sai do cliente do browser.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Manage invitations in own school" ON public.school_invitations;
CREATE POLICY "Manage invitations in own school" ON public.school_invitations
  FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));

-- ---------------------------------------------------------------------------
-- staff_module_grants: escrita so da administracao, leitura como o nome promete.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins manage staff grants" ON public.staff_module_grants;
DROP POLICY IF EXISTS "Read own or admin staff grants" ON public.staff_module_grants;
DROP POLICY IF EXISTS staff_module_grants_select_own_or_admin ON public.staff_module_grants;
DROP POLICY IF EXISTS staff_module_grants_insert_admin ON public.staff_module_grants;
DROP POLICY IF EXISTS staff_module_grants_update_admin ON public.staff_module_grants;
DROP POLICY IF EXISTS staff_module_grants_delete_admin ON public.staff_module_grants;

CREATE POLICY staff_module_grants_select_own_or_admin ON public.staff_module_grants
  FOR SELECT TO authenticated
  USING (
    public.is_school_member(school_id)
    AND (
      user_id = (SELECT auth.uid())
      OR private.sga_app_role(school_id) = 'Administrador'
    )
  );

-- `setStaffModuleGrant` faz `upsert`, que precisa de INSERT e de UPDATE.
CREATE POLICY staff_module_grants_insert_admin ON public.staff_module_grants
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_school_member(school_id)
    AND private.sga_app_role(school_id) = 'Administrador'
  );

CREATE POLICY staff_module_grants_update_admin ON public.staff_module_grants
  FOR UPDATE TO authenticated
  USING (
    public.is_school_member(school_id)
    AND private.sga_app_role(school_id) = 'Administrador'
  )
  WITH CHECK (
    public.is_school_member(school_id)
    AND private.sga_app_role(school_id) = 'Administrador'
  );

CREATE POLICY staff_module_grants_delete_admin ON public.staff_module_grants
  FOR DELETE TO authenticated
  USING (
    public.is_school_member(school_id)
    AND private.sga_app_role(school_id) = 'Administrador'
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
