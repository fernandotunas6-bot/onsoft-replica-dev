-- SIGA — confirmar se as migrações pendentes já estão aplicadas (só leitura).
-- Supabase → SQL Editor → colar → Run. Cada linha deve dizer "aplicada".
-- Se alguma disser "EM FALTA", aplicar docs/agents/SIGA_aplicar_migracoes.sql
-- (pode correr mais do que uma vez sem problema: foi testado duas vezes seguidas).
-- As cinco de 2026-10-05 ainda por aplicar estão juntas, por ordem, em
-- docs/agents/SIGA_aplicar_pendentes_2026-10-06.sql.

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
  -- Só higiene: mesmo com as 2 políticas antigas, `authenticated` não tem SELECT e o RLS
  -- está forçado (verificado a 2026-10-04), por isso "EM FALTA" aqui não é exposição.
  ('20260927090000_student_history_server_only',
     not exists (select 1 from pg_policies
                 where tablename in ('student_academic_history', 'student_status_history'))
     and not has_table_privilege('authenticated', 'public.student_academic_history', 'SELECT')),
  ('20260927110000_grade_sheet_absences_from_siga',
     coalesce(position('siga_attendance_records' in
       (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'private' and p.proname = 'build_grade_sheet' limit 1)) > 0, false)),
  -- A assinatura de 13 argumentos foi substituída pela de 14 (calculation_options,
  -- 20260929110000); qualquer das duas prova que as regras de transição existem.
  ('20260927130000_assessment_rule_promotion_rules',
     to_regprocedure('public.siga_publish_assessment_rule(uuid, uuid, text, numeric, numeric, numeric, numeric, text, boolean, boolean, uuid[], boolean, jsonb)') is not null
     or to_regprocedure('public.siga_publish_assessment_rule(uuid, uuid, text, numeric, numeric, numeric, numeric, text, boolean, boolean, uuid[], boolean, jsonb, jsonb)') is not null),
  ('20260929110000_assessment_rule_calculation_options',
     to_regprocedure('public.siga_publish_assessment_rule(uuid, uuid, text, numeric, numeric, numeric, numeric, text, boolean, boolean, uuid[], boolean, jsonb, jsonb)') is not null),
  ('20260927150000_competencies',
     to_regclass('public.siga_competencies') is not null
     and to_regclass('public.siga_assessment_item_competencies') is not null),
  ('20260927170000_shared_rate_limit',
     to_regprocedure('public.siga_rate_limit_consume(text[], integer, integer)') is not null),
  ('20260926203852_harden_teacher_qr_attendance',
     exists (select 1 from pg_proc where proname = 'hr_redeem_teacher_qr_secure')),
  ('20260929230000_attendance_sessions_unique_slot_day',
     to_regclass('public.siga_attendance_sessions_school_slot_day_key') is not null),
  ('20260930090000_one_active_academic_year',
     to_regclass('public.academic_years_one_active_per_school') is not null),
  -- Esta está no pacote docs/agents/SIGA_aplicar_tempo_real.sql.
  ('20261004101000_realtime_publish_school_screens',
     (select count(*) from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and tablename in ('siga_direct_messages', 'students', 'enrollments',
                          'enrollment_applications', 'finance_invoices', 'finance_receipts')) = 6),
  -- Estas duas estão no pacote docs/agents/SIGA_aplicar_multas_atraso.sql.
  ('20261004135000_late_fee_one_rule',
     to_regprocedure('private.late_fee_due(uuid, numeric, date, numeric, date, text)') is not null
     and coalesce(position('private.late_fee_due' in pg_get_functiondef(
       to_regprocedure('private.register_payment(uuid, uuid, numeric, text, date)'))) > 0, false)),
  ('20261004141000_propinas_import_into_billing_rules',
     exists (select 1 from public.import_table_specs
             where table_schema = 'public' and table_name = 'school_settings'
               and direct_import_policy = 'controlled')),
  -- Estatuto de trabalhador-estudante (aplicada a 2026-10-04).
  ('20261004140000_student_special_statuses',
     to_regclass('public.student_special_statuses') is not null
     and not coalesce(has_table_privilege('authenticated',
       to_regclass('public.student_special_statuses'), 'SELECT'), true)),
  -- Anular um salário e voltar a pagar (aplicadas a 2026-10-05).
  ('20261005040000_hr_confirm_payment_free_expense_number',
     coalesce(position('WHILE EXISTS' in pg_get_functiondef(
       to_regprocedure('private.hr_confirm_payroll_payment_item(uuid, uuid, text, text, text)'))) > 0, false)),
  ('20261005050000_hr_reverse_payroll_payment_lock_states',
     coalesce(position('siga.hr_payroll_reversal' in pg_get_functiondef(
       to_regprocedure('public.hr_block_locked_payroll_item_mutation()'))) > 0, false)
     and coalesce(position('siga.hr_payroll_reversal' in pg_get_functiondef(
       to_regprocedure('private.hr_reverse_payroll_payment(uuid, uuid, uuid, text, text)'))) > 0, false)),
  -- Esta está no pacote docs/agents/SIGA_aplicar_propina_por_classe.sql.
  ('20261005150000_fee_items_grade_level',
     exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'fee_items'
               and column_name = 'grade_level_id')
     and to_regclass('public.fee_items_plan_grade_kind_active_key') is not null),
  -- Esta está no pacote docs/agents/SIGA_aplicar_mudar_turma.sql.
  ('20261006100000_enrollment_class_change',
     coalesce(position('A turma atingiu a capacidade' in pg_get_functiondef(
       to_regprocedure('private.protect_enrollment_identity()'))) > 0, false)),
  -- QR do professor: só a versão endurecida é chamável (aplicada a 2026-10-05).
  ('20261005143409_teacher_qr_inner_functions_not_callable',
     not coalesce(has_function_privilege('authenticated',
       to_regprocedure('public.hr_redeem_teacher_qr(text)'), 'EXECUTE'), true)
     and not coalesce(has_function_privilege('authenticated',
       to_regprocedure('public.hr_evaluate_teacher_attendance_assurance(uuid, text, double precision, double precision, double precision)'),
       'EXECUTE'), true)),
  -- As três da auditoria 12, no pacote docs/agents/SIGA_aplicar_pendentes_2026-10-06.sql.
  ('20261005010000_assessment_closed_term_guard',
     to_regprocedure('private.assessment_term_is_locked(uuid, uuid, integer)') is not null
     and exists (select 1 from pg_trigger
                 where tgname = 'enforce_assessment_item_closed_term' and not tgisinternal)
     and exists (select 1 from pg_trigger
                 where tgname = 'enforce_assessment_score_closed_term' and not tgisinternal)),
  ('20261005020000_direct_writes_require_mfa',
     (select count(*) from pg_policies
      where schemaname = 'public'
        and policyname = 'Direct writes require MFA (insert)'
        and tablename in ('tenants', 'subscriptions', 'subscription_addons', 'plans',
                          'tenant_domains', 'tenant_provisioning', 'tenant_usage',
                          'saas_audit_logs', 'school_slug_history', 'reserved_subdomains',
                          'email_aliases', 'siga_assessment_items', 'siga_assessment_scores')) = 13),
  ('20261005030000_school_row_role_policies',
     exists (select 1 from pg_policies
             where tablename = 'finance_gateway_webhook_events'
               and policyname = 'Read gateway webhook events in own school'
               and qual like '%sga_app_role%')
     and not exists (select 1 from pg_policies
                     where tablename = 'schools'
                       and policyname = 'Administrators can update their own school'))
) as m(migracao, ok)
order by migracao;
