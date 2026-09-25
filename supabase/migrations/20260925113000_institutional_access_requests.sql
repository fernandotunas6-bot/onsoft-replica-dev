-- Solicitações de vínculo: adição isolada, sem alterar tabelas académicas existentes.
create table if not exists public.school_access_requests (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id),
 user_id uuid not null references auth.users(id),
 full_name text not null check (char_length(trim(full_name)) between 3 and 160),
 national_id text,
 institutional_id text,
 requested_role text not null check (requested_role in ('student','teacher','guardian','user')),
 status text not null default 'pending' check (status in ('pending','under_review','needs_information','approved','rejected','cancelled')),
 person_id uuid references public.people(id),
 reviewed_by uuid references auth.users(id),
 review_note text,
 reviewed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index if not exists school_access_requests_one_open
 on public.school_access_requests(school_id,user_id)
 where status in ('pending','under_review','needs_information');
create index if not exists school_access_requests_school_status
 on public.school_access_requests(school_id,status,created_at desc);
create index if not exists school_access_requests_user
 on public.school_access_requests(user_id,created_at desc);
alter table public.school_access_requests enable row level security;
-- Este fluxo usa apenas funções de servidor autenticadas. Não conceder acesso directo à tabela.
revoke all on public.school_access_requests from anon,authenticated;
grant select,insert,update on public.school_access_requests to service_role;
-- A aprovação, vínculo, papel e estado mudam na mesma transacção.
create or replace function public.approve_school_access_request(
 p_request_id uuid,p_reviewer_id uuid,p_person_id uuid default null
) returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.school_access_requests%rowtype; v_membership uuid; v_role uuid;
begin
 select * into r from public.school_access_requests where id=p_request_id for update;
 if not found or r.status not in ('pending','under_review','needs_information') then
  raise exception 'Solicitação indisponível para aprovação';
 end if;
 if not exists (
  select 1 from public.school_memberships sm
  join public.member_roles mr on mr.membership_id=sm.id and mr.school_id=sm.school_id
  join public.roles ro on ro.id=mr.role_id and ro.school_id=sm.school_id
  where sm.school_id=r.school_id and sm.user_id=p_reviewer_id and sm.status='active'
   and ro.code in ('owner','admin','secretary')
 ) then raise exception 'Revisor sem autorização institucional'; end if;
 if p_person_id is not null and not exists (
  select 1 from public.people p where p.id=p_person_id and p.school_id=r.school_id and p.deleted_at is null
 ) then raise exception 'Pessoa não pertence à escola'; end if;
 select id into v_role from public.roles
  where school_id=r.school_id and code=r.requested_role limit 1;
 if v_role is null then raise exception 'Papel ainda não configurado nesta escola'; end if;
 select id into v_membership from public.school_memberships
  where school_id=r.school_id and user_id=r.user_id for update;
 if v_membership is null then
  insert into public.school_memberships(school_id,user_id,status,joined_at,activated_at)
  values(r.school_id,r.user_id,'active',now(),now()) returning id into v_membership;
 else
  update public.school_memberships set status='active',activated_at=now(),updated_at=now()
  where id=v_membership;
 end if;
 insert into public.member_roles(school_id,membership_id,role_id)
 select r.school_id,v_membership,v_role
 where not exists(select 1 from public.member_roles where school_id=r.school_id
  and membership_id=v_membership and role_id=v_role);
 if p_person_id is not null then
  update public.people set user_id=r.user_id,updated_at=now()
  where id=p_person_id and school_id=r.school_id
   and (user_id is null or user_id=r.user_id);
  if not found then raise exception 'Pessoa associada a outra conta'; end if;
 end if;
 update public.school_access_requests set status='approved',person_id=p_person_id,
  reviewed_by=p_reviewer_id,reviewed_at=now(),updated_at=now()
  where id=r.id;
 return v_membership;
end $$;
revoke all on function public.approve_school_access_request(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.approve_school_access_request(uuid,uuid,uuid) to service_role;
