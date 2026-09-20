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
