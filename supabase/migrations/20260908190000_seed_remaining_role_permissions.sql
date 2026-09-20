-- SIGA / SGA — RBAC-v2 Default Role Permissions Expansion
-- Preenche as permissões canónicas em `role_permissions` para os papéis:
--   - treasury  (20 permissões: finanças, contratos, faturas, pagamentos, estudantes, arquivo)
--   - teacher   (19 permissões: turmas, horários, presenças, notas, submissões, diários)
--   - secretary (expansão com 18 permissões operacionais: registo/atualização de estudantes, matrículas, docentes, turmas)
--   - guardian  (14 permissões de leitura portal e pedidos de documentos)
--   - student   (11 permissões de consulta portal e pedidos de documentos)
--   - user      (2 permissões básicas de notificações e anúncios)
--
-- Totalmente aditivo e idempotente (ON CONFLICT DO NOTHING na PK (school_id, role_id, permission_id)).

-- 1. Treasury (Tesouraria)
INSERT INTO public.role_permissions (school_id, role_id, permission_id)
SELECT r.school_id, r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code = ANY (ARRAY[
  'finance.contracts.create',
  'finance.contracts.read',
  'finance.invoices.cancel',
  'finance.invoices.read',
  'finance.payments.create',
  'finance.payments.reverse',
  'finance.settings.manage',
  'finance.settings.read',
  'students.records.read',
  'students.enrollments.read',
  'people.records.read',
  'documents.issued.read',
  'documents.issued.issue',
  'documents.templates.read',
  'documents.requests.read',
  'documents.requests.manage',
  'files.objects.read',
  'files.objects.create',
  'communication.inbox.read',
  'communication.announcements.read'
])
WHERE r.code = 'treasury'
ON CONFLICT (school_id, role_id, permission_id) DO NOTHING;

-- 2. Teacher (Professor / Docente)
INSERT INTO public.role_permissions (school_id, role_id, permission_id)
SELECT r.school_id, r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code = ANY (ARRAY[
  'academic.classes.read',
  'academic.structure.read',
  'academic.subjects.read',
  'academic.timetable.read',
  'attendance.records.read',
  'attendance.records.take',
  'assessment.grades.read',
  'assessment.grades.manage',
  'assessment.grades.submit',
  'assessment.complaints.read',
  'assessment.reports.read',
  'assessment.rules.read',
  'students.records.read',
  'students.enrollments.read',
  'people.records.read',
  'communication.inbox.read',
  'communication.announcements.read',
  'files.objects.read',
  'files.objects.create'
])
WHERE r.code = 'teacher'
ON CONFLICT (school_id, role_id, permission_id) DO NOTHING;

-- 3. Secretary Expansion (Secretaria - permissões de gestão operacional)
INSERT INTO public.role_permissions (school_id, role_id, permission_id)
SELECT r.school_id, r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code = ANY (ARRAY[
  'students.records.create',
  'students.records.update',
  'students.enrollments.create',
  'students.enrollments.update',
  'people.records.create',
  'people.records.update',
  'teachers.records.read',
  'teachers.records.create',
  'teachers.records.update',
  'academic.classes.manage',
  'academic.subjects.read',
  'academic.subjects.manage',
  'academic.timetable.read',
  'academic.timetable.manage',
  'attendance.records.read',
  'assessment.grades.read',
  'assessment.reports.read',
  'communication.announcements.manage'
])
WHERE r.code = 'secretary'
ON CONFLICT (school_id, role_id, permission_id) DO NOTHING;

-- 4. Guardian (Encarregado de Educação)
INSERT INTO public.role_permissions (school_id, role_id, permission_id)
SELECT r.school_id, r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code = ANY (ARRAY[
  'academic.structure.read',
  'academic.classes.read',
  'academic.timetable.read',
  'assessment.grades.read',
  'assessment.reports.read',
  'attendance.records.read',
  'finance.contracts.read',
  'finance.invoices.read',
  'communication.announcements.read',
  'communication.inbox.read',
  'documents.issued.read',
  'documents.requests.read',
  'documents.requests.manage',
  'students.records.read'
])
WHERE r.code = 'guardian'
ON CONFLICT (school_id, role_id, permission_id) DO NOTHING;

-- 5. Student (Aluno)
INSERT INTO public.role_permissions (school_id, role_id, permission_id)
SELECT r.school_id, r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code = ANY (ARRAY[
  'academic.structure.read',
  'academic.classes.read',
  'academic.timetable.read',
  'assessment.grades.read',
  'assessment.reports.read',
  'attendance.records.read',
  'communication.announcements.read',
  'communication.inbox.read',
  'documents.issued.read',
  'documents.requests.read',
  'documents.requests.manage'
])
WHERE r.code = 'student'
ON CONFLICT (school_id, role_id, permission_id) DO NOTHING;

-- 6. User (Utilizador Básico)
INSERT INTO public.role_permissions (school_id, role_id, permission_id)
SELECT r.school_id, r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code = ANY (ARRAY[
  'communication.announcements.read',
  'communication.inbox.read'
])
WHERE r.code = 'user'
ON CONFLICT (school_id, role_id, permission_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
