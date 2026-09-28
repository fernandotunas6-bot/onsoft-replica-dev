-- SIGA Plus — leitura pelo papel na própria escola
-- APLICADO à produção a 2026-09-28 (pelo conector do Supabase, migração 20260928110000_core_read_policies_school_role).
-- Esta versão recria as políticas a partir das expressões que tiverem na base
-- (a anterior, tirada da captura antiga, recriaria escrita directa nas notas).
-- Pode correr mais do que uma vez: depois de aplicada, não muda nada.


-- ══════════ 20260928110000_core_read_policies_school_role.sql ══════════
-- Leitura das tabelas centrais pelo papel na própria escola.
--
-- Continuação de 20260927230000 (escrita): as políticas de leitura (pessoas,
-- alunos, documentos, encarregados, matrículas, notas, turmas, horários,
-- currículos…) usavam `can_read_students()` / `can_manage_students()`, que
-- lêem `profiles.cargo` (global). Quem tem várias escolas lia os dados da
-- segunda com o papel da primeira. Mesma técnica: expressão actual da base,
-- só essa parte trocada; os ramos do professor e o ramo de leitura dos
-- horários para quem não é professor mantêm-se. Na produção eram 24 políticas.

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
      AND cmd = 'SELECT'
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


-- ══════════ Confirmação ══════════
SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM pg_policies
  WHERE schemaname = 'public'
    AND coalesce(qual, '') || coalesce(with_check, '') ~ 'can_(read|manage)_students'
) THEN 'aplicada' ELSE 'por aplicar' END AS papel_na_escola;
