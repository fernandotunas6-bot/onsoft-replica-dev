-- SIGA Plus — SQL a aplicar no Supabase (projecto Sga), pacote de 2026-09-28 (2.º)
-- Colar TUDO no SQL Editor → Run. Pode correr mais do que uma vez sem problema.
-- 1 migração: a LEITURA das tabelas centrais (pessoas, alunos, documentos de
-- identificação, encarregados, matrículas, notas, turmas, horários…) passa a
-- exigir Administrador/Secretaria NESSA escola — completa o pacote de ontem,
-- que fez o mesmo para a escrita. Não mexe em dados; para quem tem uma só
-- escola nada muda.
-- Testado em 2026-09-28 num Postgres 16 com as 24 políticas actuais: conta
-- Secretaria na escola A e encarregado na B — antes lia alunos e pessoas da B;
-- depois só da A. Duas corridas sem erros.
-- Confirmar no fim com a consulta do fundo deste ficheiro (deve dar "aplicada").


-- ══════════ 20260928110000_core_read_policies_school_role.sql ══════════
-- Leitura das tabelas centrais pelo papel na própria escola.
--
-- Continuação de 20260927230000 (escrita). 24 políticas de leitura (pessoas,
-- alunos, documentos de identificação, encarregados, matrículas, notas,
-- turmas, horários, currículos…) usavam `can_read_students()` /
-- `can_manage_students()`, que lêem `profiles.cargo` — o papel global da conta.
-- Para quem tem várias escolas, o cargo global não muda com a escola: quem é
-- Secretaria numa escola e encarregado noutra lia os dados pessoais da segunda.
--
-- Mesma expressão da produção, trocando só essa parte por
-- `is_school_office(school_id)` (Administrador/Secretaria NESSA escola). Para
-- quem tem uma só escola o cargo acompanha o papel (access/server.ts), por
-- isso nada muda; os ramos do professor da disciplina mantêm-se. Idempotente.

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

DROP POLICY IF EXISTS "Read academic_schedules in own school" ON public.academic_schedules;
CREATE POLICY "Read academic_schedules in own school" ON public.academic_schedules
  FOR SELECT TO authenticated
  USING (((school_id = ( SELECT current_school_id() AS current_school_id)) AND (deleted_at IS NULL) AND is_school_office(school_id)));

DROP POLICY IF EXISTS "Read academic_years in own school" ON public.academic_years;
CREATE POLICY "Read academic_years in own school" ON public.academic_years
  FOR SELECT TO authenticated
  USING ((is_school_office(school_id)));

DROP POLICY IF EXISTS "Read class_groups in own school" ON public.class_groups;
CREATE POLICY "Read class_groups in own school" ON public.class_groups
  FOR SELECT TO authenticated
  USING ((is_school_office(school_id)));

DROP POLICY IF EXISTS "Academic read class subjects" ON public.class_subjects;
CREATE POLICY "Academic read class subjects" ON public.class_subjects
  FOR SELECT TO authenticated
  USING ((is_school_member(school_id) AND (is_school_office(school_id) OR (EXISTS ( SELECT 1
   FROM teachers t
  WHERE ((t.id = class_subjects.teacher_id) AND (t.school_id = class_subjects.school_id) AND (t.status = 'active'::text) AND (t.user_id = ( SELECT auth.uid() AS uid))))) OR (NOT (EXISTS ( SELECT 1
   FROM teachers self_teacher
  WHERE ((self_teacher.school_id = class_subjects.school_id) AND (self_teacher.status = 'active'::text) AND (self_teacher.user_id = ( SELECT auth.uid() AS uid)))))))));

DROP POLICY IF EXISTS "Read curricula in own school" ON public.curricula;
CREATE POLICY "Read curricula in own school" ON public.curricula
  FOR SELECT TO authenticated
  USING (((school_id = ( SELECT current_school_id() AS current_school_id)) AND (deleted_at IS NULL) AND is_school_office(school_id)));

DROP POLICY IF EXISTS "Read curriculum_areas in own school" ON public.curriculum_areas;
CREATE POLICY "Read curriculum_areas in own school" ON public.curriculum_areas
  FOR SELECT TO authenticated
  USING (((school_id = ( SELECT current_school_id() AS current_school_id)) AND (deleted_at IS NULL) AND is_school_office(school_id)));

DROP POLICY IF EXISTS "Read curriculum_subjects in own school" ON public.curriculum_subjects;
CREATE POLICY "Read curriculum_subjects in own school" ON public.curriculum_subjects
  FOR SELECT TO authenticated
  USING (((school_id = ( SELECT current_school_id() AS current_school_id)) AND (deleted_at IS NULL) AND is_school_office(school_id)));

DROP POLICY IF EXISTS "Read enrollments in own school" ON public.enrollments;
CREATE POLICY "Read enrollments in own school" ON public.enrollments
  FOR SELECT TO authenticated
  USING ((is_school_office(school_id)));

DROP POLICY IF EXISTS "Academic read grade items" ON public.grade_items;
CREATE POLICY "Academic read grade items" ON public.grade_items
  FOR SELECT TO authenticated
  USING ((is_school_member(school_id) AND (is_school_office(school_id) OR (EXISTS ( SELECT 1
   FROM ((gradebooks gb
     JOIN class_subjects cs ON (((cs.id = gb.class_subject_id) AND (cs.school_id = gb.school_id))))
     JOIN teachers t ON (((t.id = cs.teacher_id) AND (t.school_id = cs.school_id))))
  WHERE ((gb.id = grade_items.gradebook_id) AND (gb.school_id = grade_items.school_id) AND (cs.status = 'active'::text) AND (t.user_id = ( SELECT auth.uid() AS uid))))))));

DROP POLICY IF EXISTS "Read grade_levels in own school" ON public.grade_levels;
CREATE POLICY "Read grade_levels in own school" ON public.grade_levels
  FOR SELECT TO authenticated
  USING ((is_school_office(school_id)));

DROP POLICY IF EXISTS "Academic read grade scores" ON public.grade_scores;
CREATE POLICY "Academic read grade scores" ON public.grade_scores
  FOR SELECT TO authenticated
  USING ((is_school_member(school_id) AND (is_school_office(school_id) OR (EXISTS ( SELECT 1
   FROM (((grade_items gi
     JOIN gradebooks gb ON (((gb.id = gi.gradebook_id) AND (gb.school_id = gi.school_id))))
     JOIN class_subjects cs ON (((cs.id = gb.class_subject_id) AND (cs.school_id = gb.school_id))))
     JOIN teachers t ON (((t.id = cs.teacher_id) AND (t.school_id = cs.school_id))))
  WHERE ((gi.id = grade_scores.grade_item_id) AND (gi.school_id = grade_scores.school_id) AND (cs.status = 'active'::text) AND (t.user_id = ( SELECT auth.uid() AS uid))))))));

DROP POLICY IF EXISTS "Academic read gradebooks" ON public.gradebooks;
CREATE POLICY "Academic read gradebooks" ON public.gradebooks
  FOR SELECT TO authenticated
  USING ((is_school_member(school_id) AND (is_school_office(school_id) OR (EXISTS ( SELECT 1
   FROM (class_subjects cs
     JOIN teachers t ON (((t.id = cs.teacher_id) AND (t.school_id = cs.school_id))))
  WHERE ((cs.id = gradebooks.class_subject_id) AND (cs.school_id = gradebooks.school_id) AND (cs.status = 'active'::text) AND (t.user_id = ( SELECT auth.uid() AS uid))))))));

DROP POLICY IF EXISTS "Read people in own school" ON public.people;
CREATE POLICY "Read people in own school" ON public.people
  FOR SELECT TO authenticated
  USING ((is_school_office(school_id)));

DROP POLICY IF EXISTS "Read person_documents in own school" ON public.person_documents;
CREATE POLICY "Read person_documents in own school" ON public.person_documents
  FOR SELECT TO authenticated
  USING ((is_school_office(school_id)));

DROP POLICY IF EXISTS "Read person roles in own school" ON public.person_roles;
CREATE POLICY "Read person roles in own school" ON public.person_roles
  FOR SELECT TO authenticated
  USING ((is_school_office(school_id)));

DROP POLICY IF EXISTS "Read program subjects in own school" ON public.program_subjects;
CREATE POLICY "Read program subjects in own school" ON public.program_subjects
  FOR SELECT TO authenticated
  USING (((school_id = ( SELECT current_school_id() AS current_school_id)) AND (deleted_at IS NULL) AND is_school_office(school_id)));

DROP POLICY IF EXISTS "Read rooms in own school" ON public.rooms;
CREATE POLICY "Read rooms in own school" ON public.rooms
  FOR SELECT TO authenticated
  USING (((school_id = ( SELECT current_school_id() AS current_school_id)) AND (deleted_at IS NULL) AND is_school_office(school_id)));

DROP POLICY IF EXISTS "Read school_shift_slots in own school" ON public.school_shift_slots;
CREATE POLICY "Read school_shift_slots in own school" ON public.school_shift_slots
  FOR SELECT TO authenticated
  USING (((school_id = ( SELECT current_school_id() AS current_school_id)) AND (deleted_at IS NULL) AND is_school_office(school_id)));

DROP POLICY IF EXISTS "Read school_shifts in own school" ON public.school_shifts;
CREATE POLICY "Read school_shifts in own school" ON public.school_shifts
  FOR SELECT TO authenticated
  USING (((school_id = ( SELECT current_school_id() AS current_school_id)) AND (deleted_at IS NULL) AND is_school_office(school_id)));

DROP POLICY IF EXISTS "Read student_guardians in own school" ON public.student_guardians;
CREATE POLICY "Read student_guardians in own school" ON public.student_guardians
  FOR SELECT TO authenticated
  USING ((is_school_office(school_id)));

DROP POLICY IF EXISTS "Read students in own school" ON public.students;
CREATE POLICY "Read students in own school" ON public.students
  FOR SELECT TO authenticated
  USING ((is_school_office(school_id)));

DROP POLICY IF EXISTS "Read subject_types in own school" ON public.subject_types;
CREATE POLICY "Read subject_types in own school" ON public.subject_types
  FOR SELECT TO authenticated
  USING (((school_id = ( SELECT current_school_id() AS current_school_id)) AND (deleted_at IS NULL) AND is_school_office(school_id)));

DROP POLICY IF EXISTS "Read teacher_availability in own school" ON public.teacher_availability;
CREATE POLICY "Read teacher_availability in own school" ON public.teacher_availability
  FOR SELECT TO authenticated
  USING (((school_id = ( SELECT current_school_id() AS current_school_id)) AND (deleted_at IS NULL) AND is_school_office(school_id)));

DROP POLICY IF EXISTS "Academic read timetable slots" ON public.timetable_slots;
CREATE POLICY "Academic read timetable slots" ON public.timetable_slots
  FOR SELECT TO authenticated
  USING ((is_school_member(school_id) AND (is_school_office(school_id) OR (EXISTS ( SELECT 1
   FROM (class_subjects cs
     JOIN teachers t ON (((t.id = cs.teacher_id) AND (t.school_id = cs.school_id))))
  WHERE ((cs.id = timetable_slots.class_subject_id) AND (cs.school_id = timetable_slots.school_id) AND (cs.status = 'active'::text) AND (t.status = 'active'::text) AND (t.user_id = ( SELECT auth.uid() AS uid))))) OR (NOT (EXISTS ( SELECT 1
   FROM teachers self_teacher
  WHERE ((self_teacher.school_id = timetable_slots.school_id) AND (self_teacher.status = 'active'::text) AND (self_teacher.user_id = ( SELECT auth.uid() AS uid)))))))));


-- ══════════ Confirmação ══════════
SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM pg_policies
  WHERE schemaname = 'public'
    AND coalesce(qual, '') || coalesce(with_check, '') ~ 'can_(read|manage)_students'
) THEN 'aplicada' ELSE 'por aplicar' END AS leitura_por_papel_na_escola;
