-- Applied to Sga on 2026-09-24. Additive HR salary catalog; no payroll recalculation.
create table if not exists public.hr_salary_scales (
 id uuid primary key default gen_random_uuid(), code text not null unique,
 name text not null, jurisdiction text not null default 'AO', sector text not null,
 source_title text, source_reference text, source_url text,
 created_at timestamptz not null default now()
);
create table if not exists public.hr_salary_scale_versions (
 id uuid primary key default gen_random_uuid(),
 scale_id uuid not null references public.hr_salary_scales(id) on delete restrict,
 version_label text not null, effective_from date not null, effective_until date,
 status text not null default 'draft' check(status in ('draft','approved','retired')),
 approved_at timestamptz, created_at timestamptz not null default now(),
 unique(scale_id,version_label),
 check(effective_until is null or effective_until >= effective_from),
 check(status <> 'approved' or approved_at is not null)
);
create table if not exists public.hr_salary_scale_steps (
 id uuid primary key default gen_random_uuid(),
 version_id uuid not null references public.hr_salary_scale_versions(id) on delete restrict,
 category_code text not null, category_name text not null, grade text not null,
 monthly_base_kz numeric(16,2) not null check(monthly_base_kz >= 0),
 created_at timestamptz not null default now(),
 unique(version_id,category_code,grade)
);
alter table public.hr_contracts add column if not exists salary_scale_step_id uuid references public.hr_salary_scale_steps(id) on delete restrict;
alter table public.hr_contracts add column if not exists salary_scale_snapshot_kz numeric(16,2) check(salary_scale_snapshot_kz >= 0);
create index if not exists hr_salary_versions_effective_idx on public.hr_salary_scale_versions(scale_id,effective_from desc);
create index if not exists hr_contracts_salary_step_idx on public.hr_contracts(salary_scale_step_id) where salary_scale_step_id is not null;
alter table public.hr_salary_scales enable row level security;
alter table public.hr_salary_scale_versions enable row level security;
alter table public.hr_salary_scale_steps enable row level security;
revoke all on public.hr_salary_scales,public.hr_salary_scale_versions,public.hr_salary_scale_steps from anon,authenticated;
comment on table public.hr_salary_scales is 'Versioned statutory or institutional reference catalog; server-managed, not automatically binding on employment contracts.';
comment on column public.hr_contracts.salary_scale_snapshot_kz is 'Approved contractual snapshot; future catalog updates must not retroactively change payroll.';
