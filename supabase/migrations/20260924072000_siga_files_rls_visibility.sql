-- `siga_files` guarda os documentos da escola -- e e onde os recibos financeiros
-- sao arquivados (`archiveFinanceQuietly` -> `insertFinanceArchive`). As suas duas
-- politicas eram:
--
--   SELECT → is_school_member(school_id)
--   ALL    → is_school_member(school_id)
--
-- As colunas `visibility`, `area` e `owner_user_id` nao entravam em nenhuma delas.
-- As tres regras de privacidade viviam so em `src/features/arquivos/server.ts`
-- (`canSeeRow`, :134-141) e em `kinds.ts` (`canReadFileArea`, `canWriteFileArea`).
--
-- Consequencia: quem consultasse `siga_files` pelo PostgREST com o seu proprio
-- token -- que esta no browser -- lia todos os ficheiros da escola, incluindo os
-- marcados `private` e os de outros utilizadores, e podia altera-los ou apaga-los.
--
-- Esta migracao leva essas regras para dentro da politica, sem as mudar.
--
-- Porque e seguro: nenhum caminho da aplicacao le ou escreve `siga_files` com a
-- sessao do utilizador. Verificados os tres ficheiros que tocam a tabela --
-- `arquivos/server.ts`, `people/server.ts`, `arquivos/archive-finance-core.ts` --
-- e todos usam `loadSgaAdminClient()` (service_role), que ignora RLS. Apertar a
-- politica so fecha o acesso directo, que e exactamente o buraco.
--
-- Aditiva e idempotente. NAO foi aplicada -- e escrita na base, decisao do dono.
-- Depois de aplicar: `npm run siga:db-snapshot`.

-- ---------------------------------------------------------------------------
-- O papel do utilizador NESTA escola.
--
-- Nao usa `current_profile_role()` de proposito: essa funcao escolhe a inscricao
-- com `created_at` mais antigo de TODAS as escolas do utilizador, ignorando a
-- escola em causa. Para quem pertence a duas escolas, devolve o papel errado.
-- `current_school_role_is()` herda o mesmo defeito, por assentar nela.
--
-- O mapeamento de codigo RBAC para papel e o mesmo de `mapAppRoleToSgaCodes`
-- (`src/integrations/supabase/sga.ts:33-50`), para que a base e a aplicacao
-- decidam a mesma coisa.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.sga_file_role(p_school_id uuid)
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
    -- Mesma degradacao que `current_profile_role()`: quem ainda nao tem papel
    -- RBAC atribuido cai no cargo do perfil.
    (SELECT cargo FROM public.profiles WHERE id = (SELECT auth.uid()) LIMIT 1),
    'Utilizador'
  );
$$;

REVOKE ALL ON FUNCTION private.sga_file_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.sga_file_role(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION private.sga_file_role(uuid) IS
  'Papel do utilizador actual nessa escola, no vocabulario de ApplicationRole. Com ambito de escola, ao contrario de current_profile_role().';

-- ---------------------------------------------------------------------------
-- Leitura: as tres regras de `canSeeRow`, pela mesma ordem.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Read school files" ON public.siga_files;
DROP POLICY IF EXISTS siga_files_select_scoped ON public.siga_files;
CREATE POLICY siga_files_select_scoped ON public.siga_files
  FOR SELECT TO authenticated
  USING (
    public.is_school_member(school_id)
    -- 1. canReadFileArea: a area `secretaria` e so de quem la trabalha.
    AND (
      CASE
        WHEN area = 'secretaria'
          THEN private.sga_file_role(school_id) IN ('Administrador', 'Secretaria')
        ELSE private.sga_file_role(school_id)
             IN ('Administrador', 'Secretaria', 'Tesouraria', 'Professor')
      END
    )
    -- 2. A area pessoal e so do dono.
    AND (area <> 'pessoal' OR owner_user_id = (SELECT auth.uid()))
    -- 3. Um ficheiro privado e do dono, da administracao, ou da secretaria
    --    quando esta na area dela.
    AND (
      visibility <> 'private'
      OR owner_user_id = (SELECT auth.uid())
      OR private.sga_file_role(school_id) = 'Administrador'
      OR (area = 'secretaria' AND private.sga_file_role(school_id) = 'Secretaria')
    )
  );

-- ---------------------------------------------------------------------------
-- `canWriteFileArea` (`src/features/arquivos/kinds.ts:182-190`), tal e qual.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.sga_file_can_write_area(p_role text, p_area text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_area = 'pessoal'
      THEN p_role IN ('Administrador', 'Secretaria', 'Tesouraria', 'Professor')
    WHEN p_area IN ('secretaria', 'escola', 'publico')
      THEN p_role IN ('Administrador', 'Secretaria')
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION private.sga_file_can_write_area(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.sga_file_can_write_area(text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Escrita. A politica `ALL` que aqui estava dava escrita e apagamento de
-- qualquer ficheiro a qualquer membro. Fica separada por comando, para que
-- apagar seja uma decisao propria e nao um efeito lateral de `FOR ALL`.
--
-- A regra de edicao e a que a aplicacao aplica em `server.ts:595-599`,
-- `:772-776` e `:847-851`:
--
--   canEdit = dono OR Administrador OR (area secretaria E Secretaria)
--   E canWriteFileArea(papel, area)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Write school files" ON public.siga_files;
DROP POLICY IF EXISTS siga_files_insert_scoped ON public.siga_files;
DROP POLICY IF EXISTS siga_files_update_scoped ON public.siga_files;
DROP POLICY IF EXISTS siga_files_delete_scoped ON public.siga_files;
DROP POLICY IF EXISTS siga_files_delete_admin ON public.siga_files;

-- A aplicacao grava sempre `owner_user_id: userId` e `is_system: false`
-- (`server.ts:408,435` e `:502,517`). A politica exige o mesmo, o que amarra o
-- autor -- como ja fazem as politicas de `issued_documents`.
CREATE POLICY siga_files_insert_scoped ON public.siga_files
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_school_member(school_id)
    AND owner_user_id = (SELECT auth.uid())
    AND is_system IS NOT TRUE
    AND private.sga_file_can_write_area(private.sga_file_role(school_id), area)
  );

CREATE POLICY siga_files_update_scoped ON public.siga_files
  FOR UPDATE TO authenticated
  USING (
    public.is_school_member(school_id)
    AND is_system IS NOT TRUE
    AND (
      owner_user_id = (SELECT auth.uid())
      OR private.sga_file_role(school_id) = 'Administrador'
      OR (area = 'secretaria' AND private.sga_file_role(school_id) = 'Secretaria')
    )
    AND private.sga_file_can_write_area(private.sga_file_role(school_id), area)
  )
  WITH CHECK (
    public.is_school_member(school_id)
    AND is_system IS NOT TRUE
    AND (
      owner_user_id = (SELECT auth.uid())
      OR private.sga_file_role(school_id) = 'Administrador'
      OR (area = 'secretaria' AND private.sga_file_role(school_id) = 'Secretaria')
    )
    AND private.sga_file_can_write_area(private.sga_file_role(school_id), area)
  );

-- Apagar e so da administracao. A aplicacao usa `deleted_at` (apagamento suave);
-- um DELETE verdadeiro nao deve estar ao alcance de quem apenas edita.
CREATE POLICY siga_files_delete_admin ON public.siga_files
  FOR DELETE TO authenticated
  USING (
    public.is_school_member(school_id)
    AND is_system IS NOT TRUE
    AND private.sga_file_role(school_id) = 'Administrador'
  );

-- A concessao a `anon` nunca serviu para nada aqui: nenhuma politica abrange
-- `anon`, logo a leitura ja estava travada. Retira-se a camada que sobrava.
REVOKE SELECT ON public.siga_files FROM anon;
