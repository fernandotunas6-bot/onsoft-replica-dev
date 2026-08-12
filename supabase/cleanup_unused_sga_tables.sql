-- SGA: remove módulos operacionais / avançados ainda não usados pela UI actual.
-- Executar no SQL Editor do projecto xodgfmxiaunpamctfeea (service role / dashboard).
-- NÃO apaga escolas, pessoas, alunos, turmas, finanças, documentos nem RBAC.

BEGIN;

DROP TABLE IF EXISTS public.installation_health_reports CASCADE;
DROP TABLE IF EXISTS public.installation_runs CASCADE;
DROP TABLE IF EXISTS public.async_jobs CASCADE;
DROP TABLE IF EXISTS public.school_archive_records CASCADE;
DROP TABLE IF EXISTS public.portal_identities CASCADE;
-- NÃO dropar notification_preferences (triggers de finance_invoices)
-- NÃO dropar assessment_rule_sets (necessário para gradebooks)
DROP TABLE IF EXISTS public.assessment_key_subjects CASCADE;
DROP TABLE IF EXISTS public.grade_complaints CASCADE;
DROP TABLE IF EXISTS public.grade_council_minutes CASCADE;
DROP TABLE IF EXISTS public.grade_score_history CASCADE;
DROP TABLE IF EXISTS public.student_case_items CASCADE;
DROP TABLE IF EXISTS public.student_cases CASCADE;

COMMIT;

-- Tabelas que a UI SIGA usa (manter):
-- schools, profiles, school_memberships, roles, member_roles, permissions, role_permissions,
-- people, students, student_guardians, teachers, enrollments,
-- academic_years, academic_levels, programs, grade_levels, campuses, class_groups,
-- subjects, class_subjects, teacher_subjects, terms, timetable_slots,
-- announcements, notifications,
-- finance_*, fee_*, financial_rule_sets,
-- document_*, issued_documents,
-- school_settings, school_modules, module_catalog, audit_logs,
-- attendance_*, gradebooks/grade_* (notas), report_cards, grading_scales.
