-- Governed catalog of public SGA tables for premium import/export.
-- Non-destructive: adds metadata only; no existing business table is modified.

create table if not exists public.import_table_specs (
  id uuid primary key default gen_random_uuid(),
  table_schema text not null default 'public',
  table_name text not null,
  direct_import_policy text not null default 'review',
  export_policy text not null default 'review',
  sensitivity text not null default 'normal',
  module_code text,
  dependency_rank integer,
  natural_key_columns jsonb not null default '[]'::jsonb,
  fk_dependencies jsonb not null default '[]'::jsonb,
  derived_from jsonb not null default '[]'::jsonb,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(table_schema, table_name),
  check (direct_import_policy in ('allow','controlled','review','deny')),
  check (export_policy in ('allow','controlled','review','deny')),
  check (sensitivity in ('normal','sensitive','secret','internal'))
);

insert into public.import_table_specs
(table_schema,table_name,direct_import_policy,export_policy,sensitivity,module_code,dependency_rank,natural_key_columns,fk_dependencies,derived_from,notes)
select
 'public', t.table_name,
 case
   when t.table_name in ('school_integration_secrets','calendar_feed_tokens','verification_otps','audit_logs','saas_audit_logs','import_audits','finance_gateway_webhook_events','siga_file_events','siga_attendance_audits','alumni_privacy_audit','document_signatures','school_invitations') then 'deny'
   when t.table_name in ('people','students','student_guardians','teachers','teacher_subjects','hr_employments','hr_contracts','hr_departments','hr_positions','academic_years','academic_levels','grade_levels','programs','subjects','subject_types','curriculum_areas','curriculum_subjects','curricula','campuses','rooms','school_shifts','school_shift_slots','class_groups','class_subjects','enrollments','timetable_slots','academic_schedules','terms','siga_attendance_sessions','siga_attendance_records','siga_assessment_items','siga_assessment_scores','gradebooks','grade_items','grade_scores','grade_sheets','grade_sheet_rows','report_cards','fee_plans','fee_items','finance_contracts','finance_invoices','finance_receipts','finance_payment_plans','student_status_history','student_academic_history') then 'controlled'
   else 'review'
 end,
 case
   when t.table_name in ('school_integration_secrets','calendar_feed_tokens','verification_otps','audit_logs','saas_audit_logs','import_audits','finance_gateway_webhook_events','siga_file_events','siga_attendance_audits','alumni_privacy_audit','document_signatures') then 'deny'
   else 'review'
 end,
 case
   when t.table_name in ('school_integration_secrets','calendar_feed_tokens','verification_otps','audit_logs','saas_audit_logs','finance_gateway_webhook_events') then 'secret'
   when t.table_name like 'audit%' or t.table_name like '%_audits' then 'internal'
   else 'normal'
 end,
 case
   when t.table_name in ('people','students','student_guardians') then 'pessoas'
   when t.table_name in ('teachers','teacher_subjects','hr_employments','hr_contracts','hr_departments','hr_positions') then 'professores'
   when t.table_name in ('academic_years','academic_levels','grade_levels','programs','subjects','subject_types','curriculum_areas','curriculum_subjects','curricula','class_groups','class_subjects','enrollments','terms','academic_schedules','timetable_slots','campuses','rooms','school_shifts','school_shift_slots') then 'academico'
   when t.table_name in ('siga_attendance_sessions','siga_attendance_records') then 'presencas'
   when t.table_name in ('siga_assessment_items','siga_assessment_scores','gradebooks','grade_items','grade_scores','grade_sheets','grade_sheet_rows','report_cards') then 'avaliacoes'
   when t.table_name like 'finance_%' or t.table_name in ('fee_plans','fee_items') then 'financeiro'
   when t.table_name like 'alumni_%' then 'alumni'
   else null
 end,
 case
   when t.table_name='schools' then 0
   when t.table_name in ('people','academic_years','academic_levels','campuses','school_shifts') then 10
   when t.table_name in ('students','teachers','grade_levels','programs','subjects','rooms','hr_departments','hr_positions') then 20
   when t.table_name in ('class_groups','class_subjects','terms','curricula','teacher_subjects','hr_employments') then 30
   when t.table_name in ('enrollments','academic_schedules','school_shift_slots','curriculum_subjects','hr_contracts') then 40
   when t.table_name in ('timetable_slots','fee_plans','fee_items') then 50
   when t.table_name in ('siga_attendance_sessions','siga_assessment_items','gradebooks','grade_sheets') then 60
   when t.table_name in ('siga_attendance_records','siga_assessment_scores','grade_items','grade_scores','grade_sheet_rows','report_cards','finance_contracts','finance_invoices') then 70
   else null
 end,
 '[]'::jsonb,'[]'::jsonb,'[]'::jsonb,
 case when t.table_name in ('school_integration_secrets','calendar_feed_tokens','verification_otps','audit_logs','saas_audit_logs','import_audits','finance_gateway_webhook_events') then 'Não importar directamente; usar operações server-side controladas.' else null end
from information_schema.tables t
where t.table_schema='public' and t.table_type='BASE TABLE'
on conflict (table_schema,table_name) do update set
  direct_import_policy=excluded.direct_import_policy,
  export_policy=excluded.export_policy,
  sensitivity=excluded.sensitivity,
  module_code=excluded.module_code,
  dependency_rank=excluded.dependency_rank,
  notes=coalesce(excluded.notes, public.import_table_specs.notes),
  updated_at=now();

create index if not exists import_table_specs_policy_idx on public.import_table_specs (direct_import_policy, module_code, dependency_rank);
create index if not exists import_table_specs_module_idx on public.import_table_specs (module_code, dependency_rank);

comment on table public.import_table_specs is 'Catálogo governado das 156 tabelas públicas do SGA para import/export. Política conservadora contra escrita cega em segurança, auditoria e segredos.';
