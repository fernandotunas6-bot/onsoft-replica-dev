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
