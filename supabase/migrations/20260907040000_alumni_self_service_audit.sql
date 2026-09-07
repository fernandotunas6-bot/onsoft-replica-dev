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
