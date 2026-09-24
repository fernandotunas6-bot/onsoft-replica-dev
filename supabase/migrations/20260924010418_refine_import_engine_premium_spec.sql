-- SGA Import Engine Premium Spec v1
-- Non-destructive: only adds defaulted metadata, constraints, indexes and comments.
-- Existing rows, IDs, relations and import behavior remain valid.

alter table public.import_jobs
  add column if not exists schema_version text not null default '1.0',
  add column if not exists exchange_mode text not null default 'human',
  add column if not exists source_format text not null default 'xlsx',
  add column if not exists dry_run boolean not null default false,
  add column if not exists idempotency_key text,
  add column if not exists manifest jsonb not null default '{}'::jsonb,
  add column if not exists dependency_plan jsonb not null default '[]'::jsonb,
  add column if not exists error_summary jsonb not null default '[]'::jsonb;

alter table public.import_jobs drop constraint if exists import_jobs_exchange_mode_check;
alter table public.import_jobs add constraint import_jobs_exchange_mode_check
  check (exchange_mode in ('human','siga_exchange'));

alter table public.import_jobs drop constraint if exists import_jobs_source_format_check;
alter table public.import_jobs add constraint import_jobs_source_format_check
  check (source_format in ('csv','xlsx','xls','ods','json'));

create unique index if not exists import_jobs_school_idempotency_idx
  on public.import_jobs (school_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists import_jobs_school_status_idx
  on public.import_jobs (school_id, status, created_at desc);

alter table public.import_rows
  add column if not exists natural_key jsonb not null default '{}'::jsonb,
  add column if not exists natural_key_hash text,
  add column if not exists validation_stage text not null default 'row',
  add column if not exists resolution jsonb not null default '{}'::jsonb,
  add column if not exists source_hash text;

alter table public.import_rows drop constraint if exists import_rows_validation_stage_check;
alter table public.import_rows add constraint import_rows_validation_stage_check
  check (validation_stage in ('row','reference','duplicate','business_rule','ready','committed'));

create index if not exists import_rows_job_natural_hash_idx
  on public.import_rows (import_job_id, natural_key_hash)
  where natural_key_hash is not null;

create index if not exists import_rows_job_source_hash_idx
  on public.import_rows (import_job_id, source_hash)
  where source_hash is not null;

alter table public.import_templates
  add column if not exists version integer not null default 1,
  add column if not exists mode text not null default 'human',
  add column if not exists target_tables jsonb not null default '[]'::jsonb,
  add column if not exists dependencies jsonb not null default '[]'::jsonb,
  add column if not exists checksum text,
  add column if not exists is_system boolean not null default false;

alter table public.import_templates drop constraint if exists import_templates_mode_check;
alter table public.import_templates add constraint import_templates_mode_check
  check (mode in ('human','siga_exchange'));

create unique index if not exists import_templates_school_module_name_version_idx
  on public.import_templates (school_id, module, name, version);

alter table public.import_audits
  add column if not exists sequence_no bigint,
  add column if not exists reversible boolean not null default true,
  add column if not exists source_hash text;

create unique index if not exists import_audits_job_sequence_idx
  on public.import_audits (import_job_id, sequence_no)
  where sequence_no is not null;

create index if not exists import_audits_job_created_idx
  on public.import_audits (import_job_id, created_at desc);

comment on table public.import_jobs is
  'Premium import orchestration: idempotency, source manifest, dependency plan, dry-run and exchange mode.';
comment on table public.import_rows is
  'Premium import staging: natural-key resolution, validation stages, source hashes and row-level resolution.';
comment on table public.import_templates is
  'Premium import templates: versioned human/SIGA exchange contracts, dependencies, target tables and checksum.';
comment on table public.import_audits is
  'Premium import audit trail: ordered, reversible row-level changes with source hashes.';

notify pgrst, 'reload schema';
