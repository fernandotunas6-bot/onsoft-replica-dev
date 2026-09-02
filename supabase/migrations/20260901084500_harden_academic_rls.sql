-- FASE 5: ROW LEVEL SECURITY (RLS) PARA TABELAS ACADÉMICAS

-- 1. Activar RLS para todas as tabelas académicas que ainda não têm
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.term_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_schedule_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_status_history ENABLE ROW LEVEL SECURITY;

-- 2. Conceder acessos básicos (GRANTS)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_guardians TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grade_levels TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rooms TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subjects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.term_grades TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_schedule_slots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.enrollments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_status_history TO authenticated;

-- 3. Criar Políticas Baseadas na Função is_school_member (já existente no APPLY_ENROLLMENT)

-- Students
CREATE POLICY "School members can access students" ON public.students
  FOR ALL TO authenticated USING (public.is_school_member(school_id));

-- Student Guardians
CREATE POLICY "School members can access student guardians" ON public.student_guardians
  FOR ALL TO authenticated USING (public.is_school_member(school_id));

-- Courses
CREATE POLICY "School members can access courses" ON public.courses
  FOR ALL TO authenticated USING (public.is_school_member(school_id));

-- Grade Levels
CREATE POLICY "School members can access grade levels" ON public.grade_levels
  FOR ALL TO authenticated USING (public.is_school_member(school_id));

-- Rooms
CREATE POLICY "School members can access rooms" ON public.rooms
  FOR ALL TO authenticated USING (public.is_school_member(school_id));

-- Class Groups
CREATE POLICY "School members can access class groups" ON public.class_groups
  FOR ALL TO authenticated USING (public.is_school_member(school_id));

-- Subjects
CREATE POLICY "School members can access subjects" ON public.subjects
  FOR ALL TO authenticated USING (public.is_school_member(school_id));

-- Term Grades
CREATE POLICY "School members can access term grades" ON public.term_grades
  FOR ALL TO authenticated USING (public.is_school_member(school_id));

-- Class Schedule Slots
CREATE POLICY "School members can access class schedule slots" ON public.class_schedule_slots
  FOR ALL TO authenticated USING (public.is_school_member(school_id));

-- Enrollments
CREATE POLICY "School members can access enrollments" ON public.enrollments
  FOR ALL TO authenticated USING (public.is_school_member(school_id));

-- Student Status History
CREATE POLICY "School members can access student status history" ON public.student_status_history
  FOR ALL TO authenticated USING (public.is_school_member(school_id));
