-- Migration: 20260908200000_backfill_huambo_roles_and_permissions
-- Objetivo: Recuperar papéis e permissões em falta para escolas legadas
--   (aquelas criadas antes do school-bootstrap.ts ser actualizado com todos os papéis)
-- Metodologia: 100% idempotente (ON CONFLICT DO NOTHING em todo o lado)
-- Impacto: Aditivo — nunca remove nem altera dados existentes

-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 1: Garantir que todas as escolas têm os 8 papéis canónicos
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_school_id UUID;
  v_codes TEXT[] := ARRAY['owner','admin','secretary','treasury','teacher','guardian','student','user'];
  v_names TEXT[] := ARRAY['Proprietário','Administrador','Secretaria','Tesouraria','Professor','Encarregado de Educação','Estudante','Utilizador'];
  v_code TEXT;
  v_name TEXT;
  i INT;
BEGIN
  FOR v_school_id IN SELECT id FROM public.schools LOOP
    FOR i IN 1..array_length(v_codes, 1) LOOP
      v_code := v_codes[i];
      v_name := v_names[i];
      INSERT INTO public.roles (school_id, code, name, is_system)
        VALUES (v_school_id, v_code, v_name, TRUE)
        ON CONFLICT (school_id, code) DO NOTHING;
    END LOOP;
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 2: Semear role_permissions para todos os papéis de todas as escolas
-- Idêntico à lógica de 20260908190000 mas iterando sobre TODAS as escolas
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  -- ── OWNER / ADMIN: todas as 74 permissões ─────────────────────────────────
  v_all_perms TEXT[] := ARRAY[
    'schools.settings.view','schools.settings.update',
    'schools.terms.manage','schools.subjects.manage','schools.rooms.manage',
    'schools.shifts.manage','schools.curriculum.manage','schools.schedule.manage',
    'roles.view','roles.assign','roles.manage',
    'staff.invite','staff.view','staff.update','staff.deactivate',
    'students.records.create','students.records.view','students.records.update','students.records.delete',
    'students.documents.view','students.documents.issue','students.documents.sign',
    'enrollments.create','enrollments.view','enrollments.update','enrollments.cancel',
    'people.view','people.create','people.update',
    'guardians.view','guardians.link','guardians.unlink',
    'teachers.view','teachers.create','teachers.update','teachers.deactivate',
    'classes.view','classes.create','classes.update','classes.archive',
    'classes.subjects.manage','classes.students.manage','classes.timetable.manage',
    'attendance.view','attendance.take','attendance.correct','attendance.report',
    'grades.view','grades.enter','grades.correct','grades.submit','grades.report',
    'diary.view','diary.create','diary.update',
    'finance.contracts.view','finance.contracts.create','finance.contracts.update','finance.contracts.cancel',
    'finance.invoices.view','finance.invoices.create','finance.invoices.cancel',
    'finance.payments.view','finance.payments.register','finance.payments.reverse',
    'finance.receipts.view','finance.receipts.issue',
    'finance.settings.view','finance.settings.update',
    'reports.academic.view','reports.financial.view','reports.attendance.view',
    'communications.announcements.view','communications.announcements.create',
    'communications.notifications.view',
    'portal.student.access','portal.guardian.access',
    'documents.view','documents.issue','documents.sign'
  ];

  -- ── SECRETARY: 41 permissões ───────────────────────────────────────────────
  v_secretary_perms TEXT[] := ARRAY[
    'schools.settings.view','schools.terms.manage','schools.subjects.manage',
    'schools.rooms.manage','schools.shifts.manage','schools.curriculum.manage','schools.schedule.manage',
    'staff.view','staff.invite',
    'students.records.create','students.records.view','students.records.update',
    'students.documents.view','students.documents.issue',
    'enrollments.create','enrollments.view','enrollments.update','enrollments.cancel',
    'people.view','people.create','people.update',
    'guardians.view','guardians.link','guardians.unlink',
    'teachers.view','teachers.create','teachers.update',
    'classes.view','classes.create','classes.update',
    'classes.subjects.manage','classes.students.manage','classes.timetable.manage',
    'attendance.view','attendance.report',
    'grades.view','grades.report',
    'finance.contracts.view','finance.invoices.view','finance.payments.view','finance.receipts.view'
  ];

  -- ── TREASURY: 20 permissões ────────────────────────────────────────────────
  v_treasury_perms TEXT[] := ARRAY[
    'finance.contracts.view','finance.contracts.create','finance.contracts.update','finance.contracts.cancel',
    'finance.invoices.view','finance.invoices.create','finance.invoices.cancel',
    'finance.payments.view','finance.payments.register','finance.payments.reverse',
    'finance.receipts.view','finance.receipts.issue',
    'finance.settings.view','finance.settings.update',
    'students.records.view','enrollments.view',
    'people.view',
    'reports.financial.view',
    'students.documents.view','documents.view'
  ];

  -- ── TEACHER: 19 permissões ─────────────────────────────────────────────────
  v_teacher_perms TEXT[] := ARRAY[
    'classes.view','classes.subjects.manage','classes.timetable.manage',
    'schools.subjects.manage','schools.schedule.manage','schools.rooms.manage',
    'attendance.view','attendance.take','attendance.correct','attendance.report',
    'grades.view','grades.enter','grades.correct','grades.submit','grades.report',
    'diary.view','diary.create','diary.update',
    'reports.academic.view'
  ];

  -- ── GUARDIAN: 14 permissões ────────────────────────────────────────────────
  v_guardian_perms TEXT[] := ARRAY[
    'portal.guardian.access',
    'grades.view','attendance.view',
    'students.records.view','students.documents.view',
    'finance.contracts.view','finance.invoices.view','finance.receipts.view',
    'classes.view','schools.terms.manage',
    'communications.announcements.view','communications.notifications.view',
    'documents.view','reports.academic.view'
  ];

  -- ── STUDENT: 11 permissões ─────────────────────────────────────────────────
  v_student_perms TEXT[] := ARRAY[
    'portal.student.access',
    'grades.view','attendance.view',
    'students.records.view','students.documents.view',
    'classes.view','schools.terms.manage',
    'communications.announcements.view','communications.notifications.view',
    'documents.view','reports.academic.view'
  ];

  -- ── USER: 2 permissões ─────────────────────────────────────────────────────
  v_user_perms TEXT[] := ARRAY[
    'communications.notifications.view','communications.announcements.view'
  ];

  v_school   RECORD;
  v_role     RECORD;
  v_perm_id  UUID;
  v_code     TEXT;
BEGIN
  FOR v_school IN SELECT id FROM public.schools LOOP
    FOR v_role IN SELECT id, code FROM public.roles WHERE school_id = v_school.id LOOP

      -- Selecionar lista de permissões consoante o papel
      DECLARE
        v_perms TEXT[];
      BEGIN
        CASE v_role.code
          WHEN 'owner'      THEN v_perms := v_all_perms;
          WHEN 'admin'      THEN v_perms := v_all_perms;
          WHEN 'secretary'  THEN v_perms := v_secretary_perms;
          WHEN 'treasury'   THEN v_perms := v_treasury_perms;
          WHEN 'teacher'    THEN v_perms := v_teacher_perms;
          WHEN 'guardian'   THEN v_perms := v_guardian_perms;
          WHEN 'student'    THEN v_perms := v_student_perms;
          WHEN 'user'       THEN v_perms := v_user_perms;
          ELSE v_perms := ARRAY[]::TEXT[];
        END CASE;

        FOREACH v_code IN ARRAY v_perms LOOP
          SELECT id INTO v_perm_id FROM public.permissions WHERE code = v_code;
          IF v_perm_id IS NOT NULL THEN
            INSERT INTO public.role_permissions (school_id, role_id, permission_id)
              VALUES (v_school.id, v_role.id, v_perm_id)
              ON CONFLICT DO NOTHING;
          END IF;
        END LOOP;
      END;
    END LOOP;
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICAÇÃO FINAL
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_total INT;
BEGIN
  SELECT COUNT(*) INTO v_total FROM public.role_permissions;
  RAISE NOTICE 'role_permissions total após backfill: %', v_total;
END;
$$;
