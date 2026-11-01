-- Comunicados «encarregados com dívida»: só para quem ainda é encarregado.
--
-- Desde a #409, remover um encarregado fecha a vigência do vínculo
-- (student_guardians.valid_until) em vez de apagar a linha. O portal já o
-- respeita (private.is_portal_guardian_of: sg.valid_until is null), mas
-- private.announcement_audiences_for continuava a contar vínculos fechados:
-- um encarregado removido de um aluno com factura vencida via na base os
-- comunicados de cobrança aos encarregados em dívida. O servidor
-- (visibleAnnouncementAudiences → loadStudentScope) já filtrava.
--
-- Igual a 20261003070000_announcements_audience_rls.sql, com o vínculo vigente
-- como única diferença. CREATE OR REPLACE conserva as permissões; repetem-se por
-- clareza. Idempotente. A política «Read school announcements» não muda.
-- Regras: docs/agents/DATABASE_RULES.md.

CREATE OR REPLACE FUNCTION private.announcement_audiences_for(p_school_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH me AS (SELECT (SELECT auth.uid()) AS uid),
  roles AS (
    SELECT lower(btrim(r.code)) AS code
    FROM public.school_memberships sm
    JOIN public.member_roles mr ON mr.membership_id = sm.id
    JOIN public.roles r ON r.id = mr.role_id
    JOIN me ON sm.user_id = me.uid
    WHERE me.uid IS NOT NULL AND sm.school_id = p_school_id AND sm.status = 'active'
  ),
  is_student AS (SELECT EXISTS (SELECT 1 FROM roles WHERE code IN ('student', 'aluno')) AS v),
  is_guardian AS (
    SELECT EXISTS (SELECT 1 FROM roles WHERE code IN ('guardian', 'encarregado', 'parent')) AS v
  ),
  guardian_has_debt AS (
    SELECT EXISTS (
      SELECT 1
      FROM me
      JOIN public.people p ON p.user_id = me.uid AND p.school_id = p_school_id
      JOIN public.student_guardians sg
        ON sg.school_id = p_school_id AND sg.guardian_person_id = p.id
       AND sg.valid_until IS NULL
      JOIN public.enrollments e ON e.school_id = p_school_id AND e.student_id = sg.student_id
      JOIN public.finance_contracts fc ON fc.school_id = p_school_id AND fc.enrollment_id = e.id
      JOIN public.finance_invoices fi ON fi.school_id = p_school_id AND fi.contract_id = fc.id
      WHERE fi.status IN ('open', 'partially_paid') AND fi.due_date < current_date
    ) AS v
  )
  SELECT array_remove(ARRAY[
    CASE WHEN (SELECT v FROM is_student) OR (SELECT v FROM is_guardian) THEN 'all_guardians' END,
    CASE WHEN (SELECT v FROM is_student) THEN 'students_secondary' END,
    CASE WHEN (SELECT v FROM is_student) THEN 'students_finalists' END,
    CASE WHEN (SELECT v FROM is_guardian) AND (SELECT v FROM guardian_has_debt)
      THEN 'guardians_with_debt' END
  ], NULL);
$$;
REVOKE ALL ON FUNCTION private.announcement_audiences_for(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.announcement_audiences_for(uuid) TO authenticated, service_role;
