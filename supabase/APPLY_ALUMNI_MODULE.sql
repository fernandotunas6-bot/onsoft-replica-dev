-- SIGA / Onsoft — Alumni Master Module
-- Reutiliza students/people/enrollments e acrescenta apenas o ciclo pós-formação.
-- Toda informação académica oficial continua nas tabelas académicas existentes.

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
  "current_role" text,
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
  profile_completion integer not null default 0 check (profile_completion between 0 and 100),
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

create table if not exists public.alumni_opportunity_applications (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  opportunity_id uuid not null references public.alumni_opportunities(id) on delete cascade,
  alumni_id uuid not null references public.alumni_profiles(id) on delete cascade,
  status text not null default 'interested' check (status in ('interested','applied','shortlisted','accepted','rejected','withdrawn')),
  applied_at timestamptz,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opportunity_id, alumni_id)
);

create table if not exists public.alumni_mentorships (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  mentor_alumni_id uuid not null references public.alumni_profiles(id) on delete cascade,
  mentee_alumni_id uuid not null references public.alumni_profiles(id) on delete cascade,
  focus_area text not null,
  status text not null default 'requested' check (status in ('requested','active','completed','cancelled')),
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (mentor_alumni_id <> mentee_alumni_id)
);

create table if not exists public.alumni_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  title text not null,
  description text,
  event_type text not null default 'networking' check (event_type in ('reunion','career','mentoring','networking','webinar','volunteer','fundraising','other')),
  location text,
  online_url text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  capacity integer check (capacity is null or capacity > 0),
  status text not null default 'draft' check (status in ('draft','published','completed','cancelled')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.alumni_event_registrations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  event_id uuid not null references public.alumni_events(id) on delete cascade,
  alumni_id uuid not null references public.alumni_profiles(id) on delete cascade,
  status text not null default 'registered' check (status in ('registered','attended','cancelled','waitlist')),
  registered_at timestamptz not null default now(),
  checked_in_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique (event_id, alumni_id)
);

create table if not exists public.alumni_surveys (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  title text not null,
  description text,
  purpose text not null default 'tracer_study' check (purpose in ('tracer_study','employment','satisfaction','skills','impact','other')),
  schema_json jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft','published','closed','archived')),
  opens_at timestamptz,
  closes_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.alumni_survey_responses (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  survey_id uuid not null references public.alumni_surveys(id) on delete cascade,
  alumni_id uuid not null references public.alumni_profiles(id) on delete cascade,
  response_json jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  unique (survey_id, alumni_id)
);

create table if not exists public.alumni_contributions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  alumni_id uuid not null references public.alumni_profiles(id) on delete cascade,
  contribution_type text not null check (contribution_type in ('donation','sponsorship','scholarship','in_kind','volunteer_hours','other')),
  amount numeric(18,2),
  currency text not null default 'AOA',
  hours numeric(10,2),
  designation text,
  occurred_at timestamptz not null default now(),
  reference text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (amount is not null or hours is not null or contribution_type = 'other')
);

create index if not exists idx_alumni_profiles_school on public.alumni_profiles(school_id);
create index if not exists idx_alumni_profiles_graduation_year on public.alumni_profiles(school_id, graduation_year desc);
create index if not exists idx_alumni_profiles_employment on public.alumni_profiles(school_id, employment_status);
create index if not exists idx_alumni_profiles_location on public.alumni_profiles(school_id, province, city);
create index if not exists idx_alumni_profiles_mentoring on public.alumni_profiles(school_id, available_for_mentoring) where available_for_mentoring = true;
create index if not exists idx_alumni_profiles_opportunities on public.alumni_profiles(school_id, open_to_opportunities) where open_to_opportunities = true;
create index if not exists idx_alumni_experiences_alumni_recent on public.alumni_experiences(school_id, alumni_id, started_on desc);
create index if not exists idx_alumni_engagements_recent on public.alumni_engagements(school_id, occurred_at desc);
create index if not exists idx_alumni_opportunities_live on public.alumni_opportunities(school_id, status, expires_at);
create index if not exists idx_alumni_opportunity_applications on public.alumni_opportunity_applications(school_id, opportunity_id, status);
create index if not exists idx_alumni_mentorships_school_status on public.alumni_mentorships(school_id, status, created_at desc);
create index if not exists idx_alumni_events_upcoming on public.alumni_events(school_id, status, starts_at);
create index if not exists idx_alumni_event_registrations on public.alumni_event_registrations(school_id, event_id, status);
create index if not exists idx_alumni_surveys_status on public.alumni_surveys(school_id, status, closes_at);
create index if not exists idx_alumni_contributions_recent on public.alumni_contributions(school_id, occurred_at desc);

alter table public.alumni_profiles enable row level security;
alter table public.alumni_experiences enable row level security;
alter table public.alumni_engagements enable row level security;
alter table public.alumni_opportunities enable row level security;
alter table public.alumni_opportunity_applications enable row level security;
alter table public.alumni_mentorships enable row level security;
alter table public.alumni_events enable row level security;
alter table public.alumni_event_registrations enable row level security;
alter table public.alumni_surveys enable row level security;
alter table public.alumni_survey_responses enable row level security;
alter table public.alumni_contributions enable row level security;

-- O acesso operacional passa pelas server functions autenticadas do SIGA.
-- Service role continua com bypass de RLS; não são abertas policies públicas.

create or replace function public.siga_alumni_profile_completion(target public.alumni_profiles)
returns integer
language sql
immutable
as $$
  select least(100,
    (case when target.headline is not null and target.headline <> '' then 10 else 0 end) +
    (case when target.biography is not null and target.biography <> '' then 10 else 0 end) +
    (case when target.graduation_year is not null then 10 else 0 end) +
    (case when target.graduation_course is not null and target.graduation_course <> '' then 10 else 0 end) +
    (case when target."current_role" is not null and target."current_role" <> '' then 10 else 0 end) +
    (case when target.current_company is not null and target.current_company <> '' then 10 else 0 end) +
    (case when target.employment_status <> 'unknown' then 10 else 0 end) +
    (case when target.province is not null and target.province <> '' then 10 else 0 end) +
    (case when cardinality(target.skills) > 0 then 10 else 0 end) +
    (case when target.contact_consent then 10 else 0 end)
  );
$$;

create or replace function public.siga_refresh_alumni_profile_completion()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.profile_completion := public.siga_alumni_profile_completion(new);
  return new;
end;
$$;

drop trigger if exists trg_alumni_profile_completion on public.alumni_profiles;
create trigger trg_alumni_profile_completion
before insert or update on public.alumni_profiles
for each row execute function public.siga_refresh_alumni_profile_completion();

comment on table public.alumni_profiles is 'Perfil pós-formação ligado ao aluno/pessoa original, sem duplicar identidade académica.';
comment on table public.alumni_experiences is 'Percurso profissional, académico e comunitário do alumni.';
comment on table public.alumni_engagements is 'Histórico de relacionamento da instituição com alumni.';
comment on table public.alumni_opportunities is 'Empregos, bolsas, mentoria, negócios, voluntariado e eventos para a rede alumni.';
comment on table public.alumni_opportunity_applications is 'Pipeline de interesse e candidatura de alumni a oportunidades.';
comment on table public.alumni_mentorships is 'Relações formais mentor-mentorado entre antigos alunos.';
comment on table public.alumni_events is 'Eventos, reencontros, networking, carreira e voluntariado Alumni.';
comment on table public.alumni_event_registrations is 'Inscrições e presença de Alumni nos eventos.';
comment on table public.alumni_surveys is 'Pesquisas e tracer studies de empregabilidade e impacto.';
comment on table public.alumni_survey_responses is 'Respostas individuais dos Alumni às pesquisas institucionais.';
comment on table public.alumni_contributions is 'Doações, bolsas, patrocínios, bens e horas de voluntariado dos Alumni.';
-- SIGA / Onsoft — Alumni Self-Service Portal
-- Liga uma conta autenticada ao perfil Alumni sem duplicar a identidade académica.

alter table public.alumni_profiles
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

alter table public.alumni_profiles
  add column if not exists self_service_enabled boolean not null default false;

alter table public.alumni_profiles
  add column if not exists self_service_claimed_at timestamptz;

create unique index if not exists uq_alumni_profiles_auth_user
  on public.alumni_profiles(auth_user_id)
  where auth_user_id is not null;

create index if not exists idx_alumni_profiles_self_service
  on public.alumni_profiles(school_id, self_service_enabled)
  where self_service_enabled = true;

comment on column public.alumni_profiles.auth_user_id is 'Conta Supabase Auth vinculada ao antigo aluno para o portal self-service.';
comment on column public.alumni_profiles.self_service_enabled is 'Permite acesso do próprio Alumni ao portal, após vínculo validado.';
comment on column public.alumni_profiles.self_service_claimed_at is 'Data em que a conta autenticada foi vinculada ao perfil Alumni.';
-- SIGA / Onsoft — Alumni Privacy & Communications

create table if not exists public.alumni_communication_preferences (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  alumni_id uuid not null references public.alumni_profiles(id) on delete cascade,
  email_enabled boolean not null default true,
  sms_enabled boolean not null default false,
  whatsapp_enabled boolean not null default false,
  opportunities_enabled boolean not null default true,
  events_enabled boolean not null default true,
  mentoring_enabled boolean not null default true,
  surveys_enabled boolean not null default true,
  fundraising_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (school_id, alumni_id)
);

create table if not exists public.alumni_privacy_audit (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  alumni_id uuid not null references public.alumni_profiles(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('claim','profile_update','consent_update','visibility_update','export_included','communication_targeted')),
  previous_value jsonb,
  new_value jsonb,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_alumni_comm_preferences_school on public.alumni_communication_preferences(school_id, alumni_id);
create index if not exists idx_alumni_privacy_audit_recent on public.alumni_privacy_audit(school_id, occurred_at desc);

alter table public.alumni_communication_preferences enable row level security;
alter table public.alumni_privacy_audit enable row level security;

comment on table public.alumni_communication_preferences is 'Preferências granulares de comunicação do antigo aluno por canal e finalidade.';
comment on table public.alumni_privacy_audit is 'Auditoria de consentimento, visibilidade, exportação e segmentação de Alumni.';
-- SIGA / Onsoft — Alumni self-service audit hardening
-- Garante trilho de auditoria do vínculo de conta mesmo quando a activação
-- ocorre por server function/service role.

create or replace function public.audit_alumni_self_service_claim()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.auth_user_id is distinct from old.auth_user_id
     and new.auth_user_id is not null then
    insert into public.alumni_privacy_audit (
      school_id,
      alumni_id,
      auth_user_id,
      action,
      previous_value,
      new_value,
      occurred_at,
      metadata
    ) values (
      new.school_id,
      new.id,
      new.auth_user_id,
      'claim',
      jsonb_build_object(
        'auth_user_id', old.auth_user_id,
        'self_service_enabled', old.self_service_enabled
      ),
      jsonb_build_object(
        'auth_user_id', new.auth_user_id,
        'self_service_enabled', new.self_service_enabled,
        'self_service_claimed_at', new.self_service_claimed_at
      ),
      now(),
      jsonb_build_object('source', 'alumni_profiles_trigger')
    );
  end if;
  return new;
end;
$$;

revoke all on function public.audit_alumni_self_service_claim() from public, anon, authenticated;
grant execute on function public.audit_alumni_self_service_claim() to service_role;

drop trigger if exists alumni_profiles_audit_self_service_claim on public.alumni_profiles;
create trigger alumni_profiles_audit_self_service_claim
after update of auth_user_id, self_service_enabled, self_service_claimed_at
on public.alumni_profiles
for each row
execute function public.audit_alumni_self_service_claim();

comment on function public.audit_alumni_self_service_claim() is
  'Regista automaticamente a activação/vínculo da conta autenticada ao perfil Alumni.';
-- SIGA / Onsoft — integração Alumni no motor central de comunicados
-- Preserva os públicos existentes e acrescenta finalidades Alumni.

DO $$
DECLARE
  constraint_record record;
BEGIN
  IF to_regclass('public.school_announcements') IS NULL THEN
    RAISE NOTICE 'school_announcements não existe neste ambiente; extensão Alumni ignorada.';
    RETURN;
  END IF;

  -- Remove apenas CHECK constraints que governam a coluna audience.
  FOR constraint_record IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'school_announcements'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%audience%'
  LOOP
    EXECUTE format('ALTER TABLE public.school_announcements DROP CONSTRAINT %I', constraint_record.conname);
  END LOOP;

  ALTER TABLE public.school_announcements
    ADD CONSTRAINT school_announcements_audience_check
    CHECK (audience IN (
      'all_guardians',
      'guardians_with_debt',
      'students_secondary',
      'students_finalists',
      'teaching_staff',
      'alumni_all',
      'alumni_opportunities',
      'alumni_events',
      'alumni_mentoring',
      'alumni_surveys',
      'alumni_fundraising'
    ));

  COMMENT ON CONSTRAINT school_announcements_audience_check ON public.school_announcements IS
    'Públicos SIGA, incluindo segmentos Alumni que são resolvidos com consentimento e preferências.';
END;
$$;
-- Alumni Portfolio
-- Professional evidence linked to the canonical alumni/student/person identity.
-- Official school documents remain in document_requests/document_templates and are only referenced here.

create table if not exists public.alumni_portfolio_items (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  alumni_id uuid not null references public.alumni_profiles(id) on delete cascade,
  item_type text not null check (item_type in ('project','publication','award','certificate','media','link','case_study','other')),
  title text not null,
  summary text,
  organization text,
  role text,
  started_on date,
  ended_on date,
  external_url text,
  image_url text,
  official_document_request_id uuid references public.document_requests(id) on delete set null,
  skills text[] not null default '{}',
  tags text[] not null default '{}',
  featured boolean not null default false,
  visibility text not null default 'alumni' check (visibility in ('private','school','alumni')),
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_on is null or started_on is null or ended_on >= started_on)
);

create index if not exists idx_alumni_portfolio_school_alumni on public.alumni_portfolio_items(school_id, alumni_id, sort_order, created_at desc);
create index if not exists idx_alumni_portfolio_featured on public.alumni_portfolio_items(school_id, alumni_id, featured) where featured = true;
create index if not exists idx_alumni_portfolio_type on public.alumni_portfolio_items(school_id, item_type);

alter table public.alumni_portfolio_items enable row level security;

comment on table public.alumni_portfolio_items is 'Portfólio profissional do Alumni: projectos, publicações, prémios, certificados externos, media e links. Documentos oficiais do SIGA são referenciados, não duplicados.';
comment on column public.alumni_portfolio_items.official_document_request_id is 'Referência opcional a document_requests quando o item corresponde a um documento oficial da escola.';
-- Portfolio por nível de ensino: Primária, Médio e Superior.
-- Mantém os itens existentes válidos (education_level nullable) e permite
-- classificar cada evidência sem duplicar o perfil académico oficial.

alter table public.alumni_portfolio_items
  add column if not exists education_level text;

alter table public.alumni_portfolio_items
  drop constraint if exists alumni_portfolio_items_education_level_check;

alter table public.alumni_portfolio_items
  add constraint alumni_portfolio_items_education_level_check
  check (education_level is null or education_level in ('primary','middle','higher'));

create index if not exists idx_alumni_portfolio_level
  on public.alumni_portfolio_items(school_id, alumni_id, education_level, featured desc, sort_order asc);

comment on column public.alumni_portfolio_items.education_level is
  'Nível do percurso a que a evidência pertence: primary, middle ou higher. Null preserva itens legados ainda não classificados.';
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
