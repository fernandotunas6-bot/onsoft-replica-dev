-- Comunicados: cada membro lê só os do seu público.
--
-- A política «Read school announcements» deixava qualquer membro da escola
-- (aluno, encarregado) ler todos os comunicados pela API — rascunhos,
-- agendados, os do corpo docente, o aviso de cobrança aos encarregados em
-- dívida e os de antigos alunos. O servidor (listSchoolAnnouncements) já
-- filtra; esta política faz o mesmo na base, para leituras directas e para o
-- painel, que lê com a sessão do utilizador.
--
-- Pessoal (private.is_school_staff): tudo. Aluno: comunicados enviados para
-- all_guardians, students_secondary, students_finalists. Encarregado:
-- all_guardians e, só com factura vencida de um educando, guardians_with_debt.
-- Idempotente. Regras: docs/agents/DATABASE_RULES.md (is_school_member não serve
-- para dados que não são de todos).

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

DROP POLICY IF EXISTS "Read school announcements" ON public.school_announcements;
CREATE POLICY "Read school announcements" ON public.school_announcements
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      private.is_school_staff(school_id)
      OR (
        status = 'sent'
        AND audience = ANY (private.announcement_audiences_for(school_id))
      )
    )
  );
