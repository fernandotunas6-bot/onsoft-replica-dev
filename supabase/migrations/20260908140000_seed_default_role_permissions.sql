-- SIGA / SGA — bootstrap gap crítico: nenhuma escola criada pelo assistente
-- WEB /start alguma vez recebeu linhas em `role_permissions`. `school-bootstrap.ts`
-- cria os 8 papéis canónicos (owner/admin/secretary/treasury/teacher/student/
-- guardian/user) mas nunca concedeu permissões — `private.has_permission()`
-- devolve sempre false, e todas as RPCs finas (register_student, register_payment,
-- issue_school_document, etc.) rejeitam qualquer utilizador, incluindo o dono da
-- escola. Confirmado ao vivo (Ciclo 60): das 2 escolas em produção, só a
-- "Colegio Adventista - Huambo" (semeada manualmente) tem `role_permissions`
-- (owner = todas as 74 permissões; secretary = 23 códigos). Qualquer escola
-- criada depois disso — incluindo a escola de teste e2e-web-mts7ka0q — tem 0.
--
-- Esta migração é aditiva e idempotente (ON CONFLICT DO NOTHING na PK
-- (school_id, role_id, permission_id)) e replica exactamente o padrão já em
-- produção na Huambo:
--   owner/admin  → todas as permissões (acesso total do dono/administrador)
--   secretary    → o conjunto de 23 códigos já validado na Huambo
-- treasury/teacher/student/guardian/user ficam por definir nesta fatia — sem
-- precedente de produção para copiar; ver docs/agents/CONTINUE.md.

INSERT INTO public.role_permissions (school_id, role_id, permission_id)
SELECT r.school_id, r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code IN ('owner', 'admin')
ON CONFLICT (school_id, role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (school_id, role_id, permission_id)
SELECT r.school_id, r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code = ANY (ARRAY[
  'academic.classes.read',
  'academic.structure.read',
  'communication.announcements.read',
  'communication.inbox.read',
  'communication.preferences.manage',
  'documents.archive.manage',
  'documents.archive.read',
  'documents.batch.issue',
  'documents.cases.manage',
  'documents.cases.read',
  'documents.issued.issue',
  'documents.issued.read',
  'documents.issued.revoke',
  'documents.requests.manage',
  'documents.requests.read',
  'documents.signatures.read',
  'documents.signatures.sign',
  'documents.templates.manage',
  'documents.templates.read',
  'people.records.read',
  'portal.access.manage',
  'portal.access.read',
  'students.records.read'
])
WHERE r.code = 'secretary'
ON CONFLICT (school_id, role_id, permission_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
