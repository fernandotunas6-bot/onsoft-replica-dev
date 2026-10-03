-- Continuação de 20260924140000 (que fechou a escrita de person_documents mas deixou a
-- leitura por tratar): "Read school person documents" ainda existe com
-- USING (is_school_member(school_id)) -- qualquer membro activo da escola lê o
-- documento de identidade (BI, passaporte) de qualquer pessoa.
--
-- Decisão de produto confirmada: leitura fica restrita a Administrador e Secretaria
-- (can_manage_students()), não a can_read_students() (que também inclui Professor,
-- Direcção e Coordenação). BI e passaporte são dados administrativos de matrícula, não
-- pedagógicos -- e nenhum portal da aplicação lê hoje esta tabela pela sessão do
-- utilizador (confirmado: enrollment/server.ts e people/server.ts usam sempre
-- loadSgaAdminClient()), logo apertar não quebra nada em uso.
--
-- Fica UMA política de SELECT, não duas: a estrita existente ("Read person_documents in
-- own school", com can_read_students()) e a larga combinavam-se por OR e a larga
-- vencia. Em vez de deixar as duas e trocar só a larga, a estrita também é substituída
-- para can_manage_students() -- não faz sentido ficar mais permissiva que a política
-- que a substitui.

BEGIN;

DROP POLICY IF EXISTS "Read school person documents" ON public.person_documents;
DROP POLICY IF EXISTS "Read person_documents in own school" ON public.person_documents;

CREATE POLICY "Read person_documents in own school"
  ON public.person_documents
  FOR SELECT TO authenticated
  USING (
    public.is_school_member(school_id)
    AND public.can_manage_students()
  );

COMMENT ON POLICY "Read person_documents in own school" ON public.person_documents IS
  'Restrito a Administrador/Secretaria (can_manage_students) -- BI e passaporte são dados de matrícula, não pedagógicos. Ver docs/auditoria/07-auditoria.md, 7.5.';

COMMIT;

NOTIFY pgrst, 'reload schema';
