-- Matrículas públicas: formulários e candidaturas deixam de estar abertos a
-- qualquer membro da escola.
--
-- As políticas em produção usavam só `is_school_member(school_id)`, que é
-- verdadeiro para alunos e encarregados. Com a chave pública, um aluno podia:
--   * ler todas as candidaturas da escola (nome e `payload` com os dados
--     pessoais dos candidatos);
--   * alterar candidaturas (aceitar/recusar);
--   * criar, alterar e apagar os formulários de matrícula.
--
-- A aplicação lê e escreve estas tabelas pelo servidor (chave de serviço,
-- depois de validar o perfil). Fica:
--   * candidaturas: leitura só para a administração e a secretaria dessa
--     escola (o ecrã de alunos subscreve-as em tempo real, que respeita esta
--     política); sem escrita do cliente autenticado. A submissão pública
--     (`anon`, formulário aberto) mantém-se como estava.
--   * formulários: leitura para os membros da escola e leitura pública dos
--     abertos, como estava; sem escrita do cliente autenticado.
--
-- Idempotente: pode correr mais do que uma vez.

CREATE OR REPLACE FUNCTION public.is_school_office(p_school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.school_memberships sm
    JOIN public.member_roles mr ON mr.membership_id = sm.id
    JOIN public.roles r ON r.id = mr.role_id
    WHERE sm.user_id = (SELECT auth.uid())
      AND sm.school_id = p_school_id
      AND sm.status = 'active'
      AND lower(r.code) IN ('owner', 'admin', 'administrador', 'secretary', 'secretaria')
  );
$$;
REVOKE ALL ON FUNCTION public.is_school_office(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_school_office(uuid) TO authenticated, service_role;

-- Já activado e forçado na produção; repetido para não depender disso.
ALTER TABLE public.enrollment_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollment_applications FORCE ROW LEVEL SECURITY;
ALTER TABLE public.enrollment_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollment_forms FORCE ROW LEVEL SECURITY;

-- ── Candidaturas ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Read enrollment applications in own school" ON public.enrollment_applications;
DROP POLICY IF EXISTS "Update enrollment applications in own school" ON public.enrollment_applications;
DROP POLICY IF EXISTS "Office reads enrollment applications" ON public.enrollment_applications;
CREATE POLICY "Office reads enrollment applications" ON public.enrollment_applications
  FOR SELECT TO authenticated
  USING (public.is_school_office(school_id) AND deleted_at IS NULL);
REVOKE INSERT, UPDATE, DELETE ON public.enrollment_applications FROM authenticated;

-- ── Formulários ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Manage enrollment forms in own school" ON public.enrollment_forms;
REVOKE INSERT, UPDATE, DELETE ON public.enrollment_forms FROM authenticated;
