-- Corrige o acesso demasiado permissivo introduzido em
-- 20260908175000_base_rooms_table.sql e 20260908180000_advanced_academic_core.sql.
--
-- Ambas instalaram uma única política `FOR ALL USING (public.is_school_member(school_id))`
-- em `rooms`, `subject_types`, `curriculum_areas`, `school_shifts`, `school_shift_slots`,
-- `curricula`, `curriculum_subjects`, `teacher_availability` e `academic_schedules` — ou
-- seja, qualquer membro activo da escola (Professor, Aluno, Encarregado) podia
-- INSERT/UPDATE/DELETE directamente nestas tabelas via API, contornando por completo os
-- checks de papel (`requireSgaWriter(..., ["Administrador","Secretaria"])`) que só
-- existem no servidor. Isto repete exactamente o erro que
-- `20260903023500_fix_import_and_academic_rls.sql` já tinha corrigido para
-- subjects/class_groups/rooms/courses ("uma política FOR ALL permissiva é combinada
-- por OR com elas e acaba por alargar o acesso").
--
-- Substitui pelo padrão já estabelecido em `program_subjects`/`subjects`/`class_groups`:
-- leitura via `can_read_students()` (inclui Professor), escrita via
-- `can_manage_students()` (apenas Administrador/Secretaria). Sem política de DELETE —
-- estas tabelas usam soft-delete via `status`/`deleted_at`, tal como o resto do núcleo
-- académico.

BEGIN;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'rooms', 'subject_types', 'curriculum_areas', 'school_shifts', 'school_shift_slots',
    'curricula', 'curriculum_subjects', 'teacher_availability', 'academic_schedules'
  ]
  LOOP
    CONTINUE WHEN to_regclass('public.' || tbl) IS NULL;

    EXECUTE format('DROP POLICY IF EXISTS "Academic access in own school" ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Read ' || tbl || ' in own school', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Create ' || tbl || ' in own school', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Update ' || tbl || ' in own school', tbl);

    EXECUTE format(
      $pol$CREATE POLICY %2$I ON public.%1$I
        FOR SELECT TO authenticated
        USING (
          school_id = (SELECT public.current_school_id())
          AND deleted_at IS NULL
          AND (SELECT public.can_read_students())
        )$pol$,
      tbl, 'Read ' || tbl || ' in own school'
    );

    EXECUTE format(
      $pol$CREATE POLICY %2$I ON public.%1$I
        FOR INSERT TO authenticated
        WITH CHECK (
          school_id = (SELECT public.current_school_id())
          AND created_by = (SELECT auth.uid())
          AND (SELECT public.can_manage_students())
        )$pol$,
      tbl, 'Create ' || tbl || ' in own school'
    );

    EXECUTE format(
      $pol$CREATE POLICY %2$I ON public.%1$I
        FOR UPDATE TO authenticated
        USING (
          school_id = (SELECT public.current_school_id())
          AND (SELECT public.can_manage_students())
        )
        WITH CHECK (
          school_id = (SELECT public.current_school_id())
          AND (SELECT public.can_manage_students())
        )$pol$,
      tbl, 'Update ' || tbl || ' in own school'
    );
  END LOOP;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
