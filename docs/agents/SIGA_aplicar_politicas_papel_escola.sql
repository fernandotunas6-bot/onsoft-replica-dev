-- SIGA Plus — SQL a aplicar no Supabase (projecto Sga), pacote de 2026-09-27 (4.º)
-- Colar TUDO no SQL Editor → Run. Pode correr mais do que uma vez sem problema.
-- 1 migração: nas tabelas centrais (alunos, pessoas, matrículas, notas, turmas,
-- horários, currículos…), escrever exige ser Administrador/Secretaria NESSA
-- escola, e não "ter esse papel no perfil". Não mexe em dados; os ecrãs não
-- mudam (a aplicação escreve pelo servidor).
-- Testado em 2026-09-27 num Postgres 16 com as 48 políticas actuais da
-- produção: conta secretaria na escola A e encarregado na escola B — antes
-- criava anos lectivos na B; depois só na A. Duas corridas sem erros.
-- Confirmar no fim com a consulta do fundo deste ficheiro (deve dar "aplicada").


-- ══════════ 20260927230000_core_write_policies_school_role.sql ══════════
-- Escrita nas tabelas centrais: o papel conta na própria escola, não na conta.
--
-- 48 políticas de escrita (alunos, pessoas, documentos, encarregados,
-- matrículas, anos lectivos, períodos, classes, turmas, disciplinas da turma,
-- horários, cadernetas, avaliações, notas, currículos e calendários
-- académicos) exigiam `can_manage_students()`, junto com
-- `is_school_member(school_id)` ou `school_id = current_school_id()`, e
-- `can_manage_students()` lê `current_profile_role()` — o papel do perfil,
-- global da conta. Quem é Administrador/Secretaria numa escola e aluno ou
-- encarregado noutra podia escrever nas tabelas da segunda (bastava ser
-- membro dela, ou escolhê-la como escola actual no perfil).
--
-- Cada política é recriada com a mesma expressão da produção, trocando essa
-- parte por `is_school_office(school_id)` (Administrador/Secretaria NESSA
-- escola, pelos papéis da inscrição). O resto mantém-se: `created_by =
-- auth.uid()` nas criações e, nas notas, o ramo do professor da disciplina.
-- A aplicação escreve estas tabelas pelo servidor (chave de serviço, que não
-- passa por estas políticas) e por funções SECURITY DEFINER; nada muda nos
-- ecrãs. Idempotente.

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

DROP POLICY IF EXISTS "Create academic_schedules in own school" ON public.academic_schedules;
CREATE POLICY "Create academic_schedules in own school" ON public.academic_schedules
  FOR INSERT TO authenticated
  WITH CHECK (((school_id = ( SELECT current_school_id() AS current_school_id)) AND (created_by = ( SELECT auth.uid() AS uid)) AND is_school_office(school_id)));

DROP POLICY IF EXISTS "Update academic_schedules in own school" ON public.academic_schedules;
CREATE POLICY "Update academic_schedules in own school" ON public.academic_schedules
  FOR UPDATE TO authenticated
  USING (((school_id = ( SELECT current_school_id() AS current_school_id)) AND is_school_office(school_id)))
  WITH CHECK (((school_id = ( SELECT current_school_id() AS current_school_id)) AND is_school_office(school_id)));

DROP POLICY IF EXISTS "Create academic_years in own school" ON public.academic_years;
CREATE POLICY "Create academic_years in own school" ON public.academic_years
  FOR INSERT TO authenticated
  WITH CHECK ((is_school_office(school_id)));

DROP POLICY IF EXISTS "Update academic_years in own school" ON public.academic_years;
CREATE POLICY "Update academic_years in own school" ON public.academic_years
  FOR UPDATE TO authenticated
  USING ((is_school_office(school_id)))
  WITH CHECK ((is_school_office(school_id)));

DROP POLICY IF EXISTS "Create class_groups in own school" ON public.class_groups;
CREATE POLICY "Create class_groups in own school" ON public.class_groups
  FOR INSERT TO authenticated
  WITH CHECK ((is_school_member(school_id) AND (created_by = ( SELECT auth.uid() AS uid)) AND is_school_office(school_id)));

DROP POLICY IF EXISTS "Update class_groups in own school" ON public.class_groups;
CREATE POLICY "Update class_groups in own school" ON public.class_groups
  FOR UPDATE TO authenticated
  USING ((is_school_office(school_id)))
  WITH CHECK ((is_school_office(school_id)));

DROP POLICY IF EXISTS "Academic create class subjects" ON public.class_subjects;
CREATE POLICY "Academic create class subjects" ON public.class_subjects
  FOR INSERT TO authenticated
  WITH CHECK ((is_school_office(school_id)));

DROP POLICY IF EXISTS "Academic update class subjects" ON public.class_subjects;
CREATE POLICY "Academic update class subjects" ON public.class_subjects
  FOR UPDATE TO authenticated
  USING ((is_school_office(school_id)))
  WITH CHECK ((is_school_office(school_id)));

DROP POLICY IF EXISTS "Create curricula in own school" ON public.curricula;
CREATE POLICY "Create curricula in own school" ON public.curricula
  FOR INSERT TO authenticated
  WITH CHECK (((school_id = ( SELECT current_school_id() AS current_school_id)) AND (created_by = ( SELECT auth.uid() AS uid)) AND is_school_office(school_id)));

DROP POLICY IF EXISTS "Update curricula in own school" ON public.curricula;
CREATE POLICY "Update curricula in own school" ON public.curricula
  FOR UPDATE TO authenticated
  USING (((school_id = ( SELECT current_school_id() AS current_school_id)) AND is_school_office(school_id)))
  WITH CHECK (((school_id = ( SELECT current_school_id() AS current_school_id)) AND is_school_office(school_id)));

DROP POLICY IF EXISTS "Create curriculum_areas in own school" ON public.curriculum_areas;
CREATE POLICY "Create curriculum_areas in own school" ON public.curriculum_areas
  FOR INSERT TO authenticated
  WITH CHECK (((school_id = ( SELECT current_school_id() AS current_school_id)) AND (created_by = ( SELECT auth.uid() AS uid)) AND is_school_office(school_id)));

DROP POLICY IF EXISTS "Update curriculum_areas in own school" ON public.curriculum_areas;
CREATE POLICY "Update curriculum_areas in own school" ON public.curriculum_areas
  FOR UPDATE TO authenticated
  USING (((school_id = ( SELECT current_school_id() AS current_school_id)) AND is_school_office(school_id)))
  WITH CHECK (((school_id = ( SELECT current_school_id() AS current_school_id)) AND is_school_office(school_id)));

DROP POLICY IF EXISTS "Create curriculum_subjects in own school" ON public.curriculum_subjects;
CREATE POLICY "Create curriculum_subjects in own school" ON public.curriculum_subjects
  FOR INSERT TO authenticated
  WITH CHECK (((school_id = ( SELECT current_school_id() AS current_school_id)) AND (created_by = ( SELECT auth.uid() AS uid)) AND is_school_office(school_id)));

DROP POLICY IF EXISTS "Update curriculum_subjects in own school" ON public.curriculum_subjects;
CREATE POLICY "Update curriculum_subjects in own school" ON public.curriculum_subjects
  FOR UPDATE TO authenticated
  USING (((school_id = ( SELECT current_school_id() AS current_school_id)) AND is_school_office(school_id)))
  WITH CHECK (((school_id = ( SELECT current_school_id() AS current_school_id)) AND is_school_office(school_id)));

DROP POLICY IF EXISTS "Create enrollments in own school" ON public.enrollments;
CREATE POLICY "Create enrollments in own school" ON public.enrollments
  FOR INSERT TO authenticated
  WITH CHECK ((is_school_member(school_id) AND (created_by = ( SELECT auth.uid() AS uid)) AND is_school_office(school_id)));

DROP POLICY IF EXISTS "Update enrollments in own school" ON public.enrollments;
CREATE POLICY "Update enrollments in own school" ON public.enrollments
  FOR UPDATE TO authenticated
  USING ((is_school_office(school_id)))
  WITH CHECK ((is_school_office(school_id)));

DROP POLICY IF EXISTS "Academic create grade items" ON public.grade_items;
CREATE POLICY "Academic create grade items" ON public.grade_items
  FOR INSERT TO authenticated
  WITH CHECK ((is_school_office(school_id)));

DROP POLICY IF EXISTS "Academic update grade items" ON public.grade_items;
CREATE POLICY "Academic update grade items" ON public.grade_items
  FOR UPDATE TO authenticated
  USING ((is_school_office(school_id)))
  WITH CHECK ((is_school_office(school_id)));

DROP POLICY IF EXISTS "Create grade_levels in own school" ON public.grade_levels;
CREATE POLICY "Create grade_levels in own school" ON public.grade_levels
  FOR INSERT TO authenticated
  WITH CHECK ((is_school_office(school_id)));

DROP POLICY IF EXISTS "Update grade_levels in own school" ON public.grade_levels;
CREATE POLICY "Update grade_levels in own school" ON public.grade_levels
  FOR UPDATE TO authenticated
  USING ((is_school_office(school_id)))
  WITH CHECK ((is_school_office(school_id)));

DROP POLICY IF EXISTS "Academic create grade scores" ON public.grade_scores;
CREATE POLICY "Academic create grade scores" ON public.grade_scores
  FOR INSERT TO authenticated
  WITH CHECK ((is_school_member(school_id) AND (is_school_office(school_id) OR (EXISTS ( SELECT 1
   FROM (((grade_items gi
     JOIN gradebooks gb ON (((gb.id = gi.gradebook_id) AND (gb.school_id = gi.school_id))))
     JOIN class_subjects cs ON (((cs.id = gb.class_subject_id) AND (cs.school_id = gb.school_id))))
     JOIN teachers t ON (((t.id = cs.teacher_id) AND (t.school_id = cs.school_id))))
  WHERE ((gi.id = grade_scores.grade_item_id) AND (gi.school_id = grade_scores.school_id) AND (cs.status = 'active'::text) AND (t.user_id = ( SELECT auth.uid() AS uid))))))));

DROP POLICY IF EXISTS "Academic update grade scores" ON public.grade_scores;
CREATE POLICY "Academic update grade scores" ON public.grade_scores
  FOR UPDATE TO authenticated
  USING ((is_school_member(school_id) AND (is_school_office(school_id) OR (EXISTS ( SELECT 1
   FROM (((grade_items gi
     JOIN gradebooks gb ON (((gb.id = gi.gradebook_id) AND (gb.school_id = gi.school_id))))
     JOIN class_subjects cs ON (((cs.id = gb.class_subject_id) AND (cs.school_id = gb.school_id))))
     JOIN teachers t ON (((t.id = cs.teacher_id) AND (t.school_id = cs.school_id))))
  WHERE ((gi.id = grade_scores.grade_item_id) AND (gi.school_id = grade_scores.school_id) AND (cs.status = 'active'::text) AND (t.user_id = ( SELECT auth.uid() AS uid))))))))
  WITH CHECK ((is_school_member(school_id) AND (is_school_office(school_id) OR (EXISTS ( SELECT 1
   FROM (((grade_items gi
     JOIN gradebooks gb ON (((gb.id = gi.gradebook_id) AND (gb.school_id = gi.school_id))))
     JOIN class_subjects cs ON (((cs.id = gb.class_subject_id) AND (cs.school_id = gb.school_id))))
     JOIN teachers t ON (((t.id = cs.teacher_id) AND (t.school_id = cs.school_id))))
  WHERE ((gi.id = grade_scores.grade_item_id) AND (gi.school_id = grade_scores.school_id) AND (cs.status = 'active'::text) AND (t.user_id = ( SELECT auth.uid() AS uid))))))));

DROP POLICY IF EXISTS "Academic create gradebooks" ON public.gradebooks;
CREATE POLICY "Academic create gradebooks" ON public.gradebooks
  FOR INSERT TO authenticated
  WITH CHECK ((is_school_office(school_id)));

DROP POLICY IF EXISTS "Academic update gradebooks" ON public.gradebooks;
CREATE POLICY "Academic update gradebooks" ON public.gradebooks
  FOR UPDATE TO authenticated
  USING ((is_school_office(school_id)))
  WITH CHECK ((is_school_office(school_id)));

DROP POLICY IF EXISTS "Create people in own school" ON public.people;
CREATE POLICY "Create people in own school" ON public.people
  FOR INSERT TO authenticated
  WITH CHECK ((is_school_member(school_id) AND (created_by = ( SELECT auth.uid() AS uid)) AND is_school_office(school_id)));

DROP POLICY IF EXISTS "Update people in own school" ON public.people;
CREATE POLICY "Update people in own school" ON public.people
  FOR UPDATE TO authenticated
  USING ((is_school_office(school_id)))
  WITH CHECK ((is_school_office(school_id)));

DROP POLICY IF EXISTS "Create person_documents in own school" ON public.person_documents;
CREATE POLICY "Create person_documents in own school" ON public.person_documents
  FOR INSERT TO authenticated
  WITH CHECK ((is_school_member(school_id) AND (created_by = ( SELECT auth.uid() AS uid)) AND is_school_office(school_id)));

DROP POLICY IF EXISTS "Update person_documents in own school" ON public.person_documents;
CREATE POLICY "Update person_documents in own school" ON public.person_documents
  FOR UPDATE TO authenticated
  USING ((is_school_office(school_id)))
  WITH CHECK ((is_school_office(school_id)));

DROP POLICY IF EXISTS "Create program subjects in own school" ON public.program_subjects;
CREATE POLICY "Create program subjects in own school" ON public.program_subjects
  FOR INSERT TO authenticated
  WITH CHECK (((school_id = ( SELECT current_school_id() AS current_school_id)) AND (created_by = ( SELECT auth.uid() AS uid)) AND is_school_office(school_id)));

DROP POLICY IF EXISTS "Update program subjects in own school" ON public.program_subjects;
CREATE POLICY "Update program subjects in own school" ON public.program_subjects
  FOR UPDATE TO authenticated
  USING (((school_id = ( SELECT current_school_id() AS current_school_id)) AND is_school_office(school_id)))
  WITH CHECK (((school_id = ( SELECT current_school_id() AS current_school_id)) AND is_school_office(school_id)));

DROP POLICY IF EXISTS "Create rooms in own school" ON public.rooms;
CREATE POLICY "Create rooms in own school" ON public.rooms
  FOR INSERT TO authenticated
  WITH CHECK (((school_id = ( SELECT current_school_id() AS current_school_id)) AND (created_by = ( SELECT auth.uid() AS uid)) AND is_school_office(school_id)));

DROP POLICY IF EXISTS "Update rooms in own school" ON public.rooms;
CREATE POLICY "Update rooms in own school" ON public.rooms
  FOR UPDATE TO authenticated
  USING (((school_id = ( SELECT current_school_id() AS current_school_id)) AND is_school_office(school_id)))
  WITH CHECK (((school_id = ( SELECT current_school_id() AS current_school_id)) AND is_school_office(school_id)));

DROP POLICY IF EXISTS "Create school_shift_slots in own school" ON public.school_shift_slots;
CREATE POLICY "Create school_shift_slots in own school" ON public.school_shift_slots
  FOR INSERT TO authenticated
  WITH CHECK (((school_id = ( SELECT current_school_id() AS current_school_id)) AND (created_by = ( SELECT auth.uid() AS uid)) AND is_school_office(school_id)));

DROP POLICY IF EXISTS "Update school_shift_slots in own school" ON public.school_shift_slots;
CREATE POLICY "Update school_shift_slots in own school" ON public.school_shift_slots
  FOR UPDATE TO authenticated
  USING (((school_id = ( SELECT current_school_id() AS current_school_id)) AND is_school_office(school_id)))
  WITH CHECK (((school_id = ( SELECT current_school_id() AS current_school_id)) AND is_school_office(school_id)));

DROP POLICY IF EXISTS "Create school_shifts in own school" ON public.school_shifts;
CREATE POLICY "Create school_shifts in own school" ON public.school_shifts
  FOR INSERT TO authenticated
  WITH CHECK (((school_id = ( SELECT current_school_id() AS current_school_id)) AND (created_by = ( SELECT auth.uid() AS uid)) AND is_school_office(school_id)));

DROP POLICY IF EXISTS "Update school_shifts in own school" ON public.school_shifts;
CREATE POLICY "Update school_shifts in own school" ON public.school_shifts
  FOR UPDATE TO authenticated
  USING (((school_id = ( SELECT current_school_id() AS current_school_id)) AND is_school_office(school_id)))
  WITH CHECK (((school_id = ( SELECT current_school_id() AS current_school_id)) AND is_school_office(school_id)));

DROP POLICY IF EXISTS "Create student_guardians in own school" ON public.student_guardians;
CREATE POLICY "Create student_guardians in own school" ON public.student_guardians
  FOR INSERT TO authenticated
  WITH CHECK ((is_school_member(school_id) AND (created_by = ( SELECT auth.uid() AS uid)) AND is_school_office(school_id)));

DROP POLICY IF EXISTS "Update student_guardians in own school" ON public.student_guardians;
CREATE POLICY "Update student_guardians in own school" ON public.student_guardians
  FOR UPDATE TO authenticated
  USING ((is_school_office(school_id)))
  WITH CHECK ((is_school_office(school_id)));

DROP POLICY IF EXISTS "Create students in own school" ON public.students;
CREATE POLICY "Create students in own school" ON public.students
  FOR INSERT TO authenticated
  WITH CHECK ((is_school_member(school_id) AND (created_by = ( SELECT auth.uid() AS uid)) AND is_school_office(school_id)));

DROP POLICY IF EXISTS "Update students in own school" ON public.students;
CREATE POLICY "Update students in own school" ON public.students
  FOR UPDATE TO authenticated
  USING ((is_school_office(school_id)))
  WITH CHECK ((is_school_office(school_id)));

DROP POLICY IF EXISTS "Create subject_types in own school" ON public.subject_types;
CREATE POLICY "Create subject_types in own school" ON public.subject_types
  FOR INSERT TO authenticated
  WITH CHECK (((school_id = ( SELECT current_school_id() AS current_school_id)) AND (created_by = ( SELECT auth.uid() AS uid)) AND is_school_office(school_id)));

DROP POLICY IF EXISTS "Update subject_types in own school" ON public.subject_types;
CREATE POLICY "Update subject_types in own school" ON public.subject_types
  FOR UPDATE TO authenticated
  USING (((school_id = ( SELECT current_school_id() AS current_school_id)) AND is_school_office(school_id)))
  WITH CHECK (((school_id = ( SELECT current_school_id() AS current_school_id)) AND is_school_office(school_id)));

DROP POLICY IF EXISTS "Create teacher_availability in own school" ON public.teacher_availability;
CREATE POLICY "Create teacher_availability in own school" ON public.teacher_availability
  FOR INSERT TO authenticated
  WITH CHECK (((school_id = ( SELECT current_school_id() AS current_school_id)) AND (created_by = ( SELECT auth.uid() AS uid)) AND is_school_office(school_id)));

DROP POLICY IF EXISTS "Update teacher_availability in own school" ON public.teacher_availability;
CREATE POLICY "Update teacher_availability in own school" ON public.teacher_availability
  FOR UPDATE TO authenticated
  USING (((school_id = ( SELECT current_school_id() AS current_school_id)) AND is_school_office(school_id)))
  WITH CHECK (((school_id = ( SELECT current_school_id() AS current_school_id)) AND is_school_office(school_id)));

DROP POLICY IF EXISTS "Academic create terms" ON public.terms;
CREATE POLICY "Academic create terms" ON public.terms
  FOR INSERT TO authenticated
  WITH CHECK ((is_school_office(school_id)));

DROP POLICY IF EXISTS "Academic update terms" ON public.terms;
CREATE POLICY "Academic update terms" ON public.terms
  FOR UPDATE TO authenticated
  USING ((is_school_office(school_id)))
  WITH CHECK ((is_school_office(school_id)));

DROP POLICY IF EXISTS "Academic create timetable slots" ON public.timetable_slots;
CREATE POLICY "Academic create timetable slots" ON public.timetable_slots
  FOR INSERT TO authenticated
  WITH CHECK ((is_school_office(school_id)));

DROP POLICY IF EXISTS "Academic update timetable slots" ON public.timetable_slots;
CREATE POLICY "Academic update timetable slots" ON public.timetable_slots
  FOR UPDATE TO authenticated
  USING ((is_school_office(school_id)))
  WITH CHECK ((is_school_office(school_id)));


-- ══════════ Confirmação ══════════
SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM pg_policies
  WHERE schemaname = 'public' AND cmd <> 'SELECT'
    AND coalesce(qual, '') || coalesce(with_check, '') LIKE '%can_manage_students%'
) THEN 'aplicada' ELSE 'por aplicar' END AS escrita_por_papel_na_escola;
