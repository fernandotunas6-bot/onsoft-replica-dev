-- Targeted FK indexes for high-volume import/audit and school-scoped tables.
-- Non-destructive: indexes only; no data or constraints are removed.
create index if not exists import_rows_import_job_id_idx on public.import_rows (import_job_id);
create index if not exists import_audits_import_job_id_idx on public.import_audits (import_job_id);
create index if not exists audit_logs_school_id_idx on public.audit_logs (school_id);
create index if not exists audit_logs_actor_user_id_idx on public.audit_logs (actor_user_id);
create index if not exists document_sequences_school_id_idx on public.document_sequences (school_id);
create index if not exists roles_school_id_idx on public.roles (school_id);
create index if not exists people_school_id_idx on public.people (school_id);
