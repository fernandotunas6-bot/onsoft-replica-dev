-- SIGA Alumni Premium — foundation
-- Additive migration: preserves existing academic/person/finance modules.

create extension if not exists pgcrypto;

create table if not exists public.alumni_profiles (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  person_id uuid not null,
  graduation_year integer,
  course_name text,
  class_name text,
  current_city text,
  current_country text,
  headline text,
  biography text,
  employer text,
  job_title text,
  linkedin_url text,
  website_url text,
  visibility text not null default 'school' check (visibility in ('private','school','alumni','public')),
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','rejected')),
  verified_at timestamptz,
  verified_by uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, person_id)
);

create table if not exists public.alumni_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  title text not null,
  description text,
  event_type text not null default 'community',
  starts_at timestamptz not null,
  ends_at timestamptz,
  location_name text,
  location_url text,
  capacity integer check (capacity is null or capacity > 0),
  status text not null default 'draft' check (status in ('draft','published','cancelled','completed')),
  created_by uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.alumni_event_registrations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  event_id uuid not null references public.alumni_events(id) on delete cascade,
  alumni_id uuid not null references public.alumni_profiles(id) on delete cascade,
  status text not null default 'registered' check (status in ('registered','waitlist','attended','cancelled')),
  registered_at timestamptz not null default now(),
  unique (event_id, alumni_id)
);

create table if not exists public.alumni_opportunities (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  created_by_alumni_id uuid references public.alumni_profiles(id) on delete set null,
  opportunity_type text not null check (opportunity_type in ('job','internship','scholarship','mentorship','volunteer','business')),
  title text not null,
  organization text,
  description text not null,
  location text,
  external_url text,
  expires_at timestamptz,
  status text not null default 'draft' check (status in ('draft','published','closed','archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.alumni_mentorships (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  mentor_alumni_id uuid not null references public.alumni_profiles(id) on delete cascade,
  mentee_alumni_id uuid references public.alumni_profiles(id) on delete cascade,
  focus_area text not null,
  status text not null default 'open' check (status in ('open','matched','active','completed','cancelled')),
  started_at timestamptz,
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (mentee_alumni_id is null or mentor_alumni_id <> mentee_alumni_id)
);

create table if not exists public.alumni_contributions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  alumni_id uuid references public.alumni_profiles(id) on delete set null,
  contribution_type text not null check (contribution_type in ('donation','sponsorship','volunteer_hours','in_kind','other')),
  amount numeric(18,2) check (amount is null or amount >= 0),
  currency text not null default 'AOA',
  quantity numeric(18,2),
  notes text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_alumni_profiles_school_year on public.alumni_profiles(school_id, graduation_year);
create index if not exists idx_alumni_profiles_school_status on public.alumni_profiles(school_id, verification_status);
create index if not exists idx_alumni_events_school_start on public.alumni_events(school_id, starts_at);
create index if not exists idx_alumni_opportunities_school_status on public.alumni_opportunities(school_id, status, expires_at);
create index if not exists idx_alumni_mentorships_school_status on public.alumni_mentorships(school_id, status);
create index if not exists idx_alumni_contributions_school_date on public.alumni_contributions(school_id, occurred_at desc);

alter table public.alumni_profiles enable row level security;
alter table public.alumni_events enable row level security;
alter table public.alumni_event_registrations enable row level security;
alter table public.alumni_opportunities enable row level security;
alter table public.alumni_mentorships enable row level security;
alter table public.alumni_contributions enable row level security;

-- RLS intentionally starts deny-by-default. Application policies must reuse the
-- repository's canonical tenant/membership helpers after schema verification.
comment on table public.alumni_profiles is 'SIGA Alumni Premium: canonical alumni profile per school/person.';
comment on table public.alumni_contributions is 'Alumni engagement contributions; financial settlement remains owned by Finance/PayFlow.';
