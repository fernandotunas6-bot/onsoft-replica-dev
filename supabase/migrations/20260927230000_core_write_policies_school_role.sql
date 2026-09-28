-- Escrita nas tabelas centrais: o papel conta na própria escola, não na conta.
--
-- As políticas de escrita (alunos, pessoas, documentos, encarregados,
-- matrículas, anos lectivos, períodos, classes, turmas, disciplinas da turma,
-- horários, currículos, salas, turnos…) exigiam `can_manage_students()`, que lê
-- `profiles.cargo` — o papel global da conta. Quem era Administrador/Secretaria
-- numa escola e aluno ou encarregado noutra podia escrever na segunda.
--
-- Versão aplicada à produção a 2026-09-28: em vez de recriar as políticas a
-- partir da captura antiga (que já não correspondia à produção — as políticas
-- de escrita de notas tinham sido removidas e as de leitura de horários
-- ganharam um ramo novo), recria cada política a partir da expressão que tem
-- na própria base, trocando só essa parte por `is_school_office(school_id)`.
-- Na produção eram 42 políticas.

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

-- Recria, com a mesma expressão que tiverem na base, as políticas que ainda
-- usam o papel global; troca só essa parte por is_school_office(school_id).
-- Idempotente: depois de aplicada, não encontra nada para mudar.
DO $migr$
DECLARE
  p record;
  pattern_wrapped constant text := '\( SELECT can_(manage|read)_students\(\) AS can_(manage|read)_students\)';
  pattern_bare constant text := 'can_(manage|read)_students\(\)';
  new_qual text;
  new_check text;
BEGIN
  FOR p IN
    SELECT tablename, policyname, cmd, roles, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND cmd <> 'SELECT'
      AND coalesce(qual, '') || coalesce(with_check, '') ~ 'can_(manage|read)_students'
  LOOP
    new_qual := regexp_replace(regexp_replace(p.qual, pattern_wrapped, 'is_school_office(school_id)', 'g'), pattern_bare, 'is_school_office(school_id)', 'g');
    new_check := regexp_replace(regexp_replace(p.with_check, pattern_wrapped, 'is_school_office(school_id)', 'g'), pattern_bare, 'is_school_office(school_id)', 'g');
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, p.tablename);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO %s', p.policyname, p.tablename, p.cmd, array_to_string(p.roles, ', '))
      || CASE WHEN new_qual IS NOT NULL THEN ' USING (' || new_qual || ')' ELSE '' END
      || CASE WHEN new_check IS NOT NULL THEN ' WITH CHECK (' || new_check || ')' ELSE '' END;
  END LOOP;
END
$migr$;
