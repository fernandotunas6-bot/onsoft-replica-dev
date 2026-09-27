-- SIGA — confirmar se as migrações pendentes já estão aplicadas (só leitura).
-- Supabase → SQL Editor → colar → Run. Cada linha deve dizer "aplicada".
-- Se alguma disser "EM FALTA", aplicar docs/agents/SIGA_aplicar_migracoes.sql
-- (pode correr mais do que uma vez sem problema: foi testado duas vezes seguidas).

select migracao, case when ok then 'aplicada' else 'EM FALTA' end as estado
from (values
  ('20260925090000_school_access_requests',
     to_regclass('public.school_access_requests') is not null),
  ('20260925160000_academic_guards_risk_followup_appypay',
     exists (select 1 from pg_trigger where tgname = 'trg_guard_timetable_slot_conflicts')),
  ('20260925162000_lesson_plans_and_subject_guards',
     exists (select 1 from pg_trigger where tgname like '%class_subject_grade_range%')),
  ('20260925190000_harden_member_wide_policies',
     exists (select 1 from pg_proc where proname = 'is_school_admin')
     and not exists (select 1 from pg_policies where policyname = 'Manage assessment scores in own school')),
  ('20260926100000_direct_messages_server_only_insert',
     not exists (select 1 from pg_policies where tablename = 'siga_direct_messages'
                 and policyname = 'Send school direct messages')
     and not has_table_privilege('authenticated', 'public.siga_direct_messages', 'INSERT')),
  ('20260926120000_hr_structure_admin_only_writes',
     exists (select 1 from pg_policies where tablename = 'hr_departments'
             and policyname = 'Update hr_departments in own school'
             and qual like '%is_school_admin%')),
  ('20260926140000_timetable_lesson_details_tasks_reminders',
     to_regclass('public.siga_timetable_slot_details') is not null
     and to_regclass('public.siga_class_tasks') is not null
     and to_regclass('public.siga_lesson_reminder_settings') is not null
     and to_regclass('public.siga_lesson_reminder_log') is not null),
  ('20260926160000_grade_score_history',
     to_regclass('public.grade_score_history') is not null),
  ('20260924010712_import_table_specs (catálogo de importação, 7 ficheiros)',
     to_regclass('public.import_table_specs') is not null),
  ('20260926180000_tenant_mailboxes_server_only',
     to_regclass('public.tenant_mailboxes') is not null),
  ('20260926200000_assessment_rule_publish_server',
     exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'siga_publish_assessment_rule')),
  ('20260926220000_exam_sessions_registrations',
     to_regclass('public.siga_exam_sessions') is not null
     and to_regclass('public.siga_exam_registrations') is not null),
  ('20260927090000_student_history_server_only',
     not exists (select 1 from pg_policies
                 where tablename in ('student_academic_history', 'student_status_history'))
     and not has_table_privilege('authenticated', 'public.student_academic_history', 'SELECT')),
  ('20260927110000_grade_sheet_absences_from_siga',
     coalesce(position('siga_attendance_records' in
       (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'private' and p.proname = 'build_grade_sheet' limit 1)) > 0, false)),
  ('20260927130000_assessment_rule_promotion_rules',
     to_regprocedure('public.siga_publish_assessment_rule(uuid, uuid, text, numeric, numeric, numeric, numeric, text, boolean, boolean, uuid[], boolean, jsonb)') is not null)
) as m(migracao, ok)
order by migracao;
