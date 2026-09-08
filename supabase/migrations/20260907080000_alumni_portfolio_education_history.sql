-- Percurso educacional exibido no Portfólio Alumni.
-- Não substitui matrículas/histórico académico oficial do SIGA.
-- Permite representar escolas externas ou anteriores que não pertencem ao tenant actual.

create table if not exists public.alumni_education_stages (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  alumni_id uuid not null references public.alumni_profiles(id) on delete cascade,
  education_level text not null check (education_level in ('primary','middle','higher')),
  institution_name text not null,
  course_name text,
  degree_name text,
  started_year integer check (started_year is null or started_year between 1900 and 2200),
  ended_year integer check (ended_year is null or ended_year between 1900 and 2200),
  city text,
  province text,
  country text default 'Angola',
  is_current boolean not null default false,
  is_verified boolean not null default false,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_year is null or started_year is null or ended_year >= started_year)
);

create index if not exists idx_alumni_education_stages_lookup
  on public.alumni_education_stages(school_id, alumni_id, education_level, sort_order, started_year);

alter table public.alumni_education_stages enable row level security;

alter table public.alumni_portfolio_items
  add column if not exists education_stage_id uuid references public.alumni_education_stages(id) on delete set null;

create index if not exists idx_alumni_portfolio_education_stage
  on public.alumni_portfolio_items(school_id, alumni_id, education_stage_id, featured desc, sort_order asc);

comment on table public.alumni_education_stages is
  'Percurso educacional de apresentação do Alumni. Complementa, sem substituir, o histórico académico oficial do SIGA.';
comment on column public.alumni_education_stages.institution_name is
  'Nome da instituição frequentada naquela etapa, incluindo instituições externas ao tenant SIGA.';
comment on column public.alumni_portfolio_items.education_stage_id is
  'Etapa/instituição específica à qual o item do portfólio pertence.';
