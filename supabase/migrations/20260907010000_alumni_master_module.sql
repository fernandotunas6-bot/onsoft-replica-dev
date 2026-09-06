-- SIGA / Onsoft — Alumni Master Module
-- Reutiliza students/people/enrollments e acrescenta apenas o ciclo pós-formação.

create table if not exists public.alumni_profiles (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  graduation_year integer,
  graduation_grade text,
  graduation_course text,
  headline text,
  biography text,
  current_company text,
  current_role text,
  employment_status text not null default 'unknown' check (employment_status in ('employed','self_employed','student','seeking','unavailable','unknown')),
  industry text,
  city text,
  province text,
  country text default 'Angola',
  linkedin_url text,
  website_url text,
  skills text[] not null default '{}',
  interests text[] not null default '{}',
  available_for_mentoring boolean not null default false,
  seeking_mentor boolean not null default false,
  open_to_opportunities boolean not null default false,
  directory_visibility text not null default 'school' check (directory_visibility in ('private','school','alumni')),
  contact_consent boolean not null default false,
  verified_at timestamptz,
  last_engagement_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, student_id)
);

create table if not exists public.alumni_experiences (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  alumni_id uuid not null references public.alumni_profiles(id) on delete cascade,
  kind text not null check (kind in ('education','employment','business','volunteering','award','certification')),
  organization text not null,
  title text,
  field text,
  location text,
  started_on date,
  ended_on date,
  is_current boolean not null default false,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.alumni_engagements (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  alumni_id uuid not null references public.alumni_profiles(id) on delete cascade,
  kind text not null check (kind in ('event','mentoring','career','volunteer','donation','survey','communication','other')),
  title text not null,
  occurred_at timestamptz not null default now(),
  value_numeric numeric,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.alumni_opportunities (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  created_by_alumni_id uuid references public.alumni_profiles(id) on delete set null,
  title text not null,
  organization text,
  opportunity_type text not null default 'job' check (opportunity_type in ('job','internship','scholarship','mentoring','business','volunteer','event','other')),
  description text,
  location text,
  remote_allowed boolean not null default false,
  application_url text,
  starts_at timestamptz,
  expires_at timestamptz,
  status text not null default 'draft' check (status in ('draft','published','closed','archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_alumni_profiles_school on public.alumni_profiles(school_id);
create index if not exists idx_alumni_profiles_graduation_year on public.alumni_profiles(school_id, graduation_year desc);
create index if not exists idx_alumni_profiles_employment on public.alumni_profiles(school_id, employment_status);
create index if not exists idx_alumni_profiles_mentoring on public.alumni_profiles(school_id, available_for_mentoring) where available_for_mentoring = true;
create index if not exists idx_alumni_engagements_recent on public.alumni_engagements(school_id, occurred_at desc);
create index if not exists idx_alumni_opportunities_live on public.alumni_opportunities(school_id, status, expires_at);

alter table public.alumni_profiles enable row level security;
alter table public.alumni_experiences enable row level security;
alter table public.alumni_engagements enable row level security;
alter table public.alumni_opportunities enable row level security;

-- O acesso operacional passa pelas server functions autenticadas do SIGA.
-- Service role continua com bypass de RLS; não são abertas policies públicas.

comment on table public.alumni_profiles is 'Perfil pós-formação ligado ao aluno/pessoa original, sem duplicar identidade académica.';
comment on table public.alumni_experiences is 'Percurso profissional, académico e comunitário do alumni.';
comment on table public.alumni_engagements is 'Histórico de relacionamento da instituição com alumni.';
comment on table public.alumni_opportunities is 'Empregos, bolsas, mentoria, negócios, voluntariado e eventos para a rede alumni.';
