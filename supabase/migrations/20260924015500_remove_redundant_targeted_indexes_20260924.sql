-- Remove indexes that duplicated pre-existing indexes.
-- Keep the original indexes already used by the SGA schema.
drop index if exists public.import_audits_import_job_id_idx;
drop index if exists public.roles_school_id_idx;
