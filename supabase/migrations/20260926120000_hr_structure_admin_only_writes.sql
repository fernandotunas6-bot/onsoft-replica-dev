-- Endurecimento RLS (2026-09-26): departamentos e cargos (hr_departments,
-- hr_positions).
--
-- Complemento de 20260925190000_harden_member_wide_policies.sql, que deixou as
-- tabelas hr_* de fora por falta de prova. Para estas duas há prova:
--   · as políticas INSERT e UPDATE usam só is_school_member(school_id), que é
--     verdadeiro para alunos e encarregados — um aluno podia criar ou renomear
--     departamentos e cargos pela API REST;
--   · nenhuma função da base escreve nelas (procurado em todas as migrações);
--   · o único escritor da aplicação é o importador de funcionários, que usa a
--     chave de serviço (src/features/import/server.ts) e não é afectado.
--
-- A escrita directa passa a ser só do Administrador da escola da linha
-- (public.is_school_admin, criada em 20260925190000 — aplicar essa primeiro).
-- A leitura por membro mantém-se: nomes de departamentos e cargos não são
-- dados sensíveis e o painel de RH lê-os com o JWT.
--
-- Idempotente: DROP ... IF EXISTS antes de cada CREATE.

DROP POLICY IF EXISTS "Create hr_departments in own school" ON public.hr_departments;
CREATE POLICY "Create hr_departments in own school" ON public.hr_departments
  FOR INSERT TO authenticated
  WITH CHECK (public.is_school_admin(school_id) AND created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Update hr_departments in own school" ON public.hr_departments;
CREATE POLICY "Update hr_departments in own school" ON public.hr_departments
  FOR UPDATE TO authenticated
  USING (public.is_school_admin(school_id))
  WITH CHECK (public.is_school_admin(school_id));

DROP POLICY IF EXISTS "Create hr_positions in own school" ON public.hr_positions;
CREATE POLICY "Create hr_positions in own school" ON public.hr_positions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_school_admin(school_id) AND created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Update hr_positions in own school" ON public.hr_positions;
CREATE POLICY "Update hr_positions in own school" ON public.hr_positions
  FOR UPDATE TO authenticated
  USING (public.is_school_admin(school_id))
  WITH CHECK (public.is_school_admin(school_id));

-- O retrato mostra SELECT concedido a anon. Sem política para anon o RLS já
-- devolve zero linhas; retirar a concessão fecha também a porta.
REVOKE ALL ON TABLE public.hr_departments FROM anon;
REVOKE ALL ON TABLE public.hr_positions FROM anon;
