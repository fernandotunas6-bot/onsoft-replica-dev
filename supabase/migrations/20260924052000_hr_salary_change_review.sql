-- Contract salary change requests: approval workflow, no direct payroll mutation.
create table if not exists public.hr_salary_change_requests (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id),
 contract_id uuid not null references public.hr_contracts(id),
 requested_step_id uuid references public.hr_salary_scale_steps(id),
 proposed_base_salary_kz numeric(16,2) not null check(proposed_base_salary_kz>=0),
 effective_on date not null,
 reason text not null check(length(btrim(reason))>=10),
 status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled','applied')),
 requested_by uuid references auth.users(id),
 reviewed_by uuid references auth.users(id),
 reviewed_at timestamptz,
 review_reason text,
 applied_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint hr_salary_change_review_consistency check (
  (status in ('approved','rejected','applied') and reviewed_by is not null and reviewed_at is not null)
  or status in ('pending','cancelled')),
 constraint hr_salary_change_no_self_approval check (
  requested_by is null or reviewed_by is null or requested_by<>reviewed_by)
);
create unique index if not exists hr_salary_change_one_pending
 on public.hr_salary_change_requests(contract_id)
 where status='pending';
create index if not exists hr_salary_change_school_status
 on public.hr_salary_change_requests(school_id,status,created_at desc);
create or replace function public.hr_validate_salary_change_request()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_school uuid; v_contract_start date; v_contract_end date; v_status text; v_from date; v_until date;
begin
 select school_id,starts_on,ends_on into v_school,v_contract_start,v_contract_end
 from public.hr_contracts where id=new.contract_id and deleted_at is null;
 if v_school is null or v_school<>new.school_id then
  raise exception 'Pedido salarial e contrato pertencem a escolas diferentes' using errcode='23514';
 end if;
 if new.effective_on<v_contract_start or (v_contract_end is not null and new.effective_on>v_contract_end) then
  raise exception 'Data salarial fora da vigência contratual' using errcode='23514';
 end if;
 if new.requested_step_id is not null then
  select v.status,v.effective_from,v.effective_until into v_status,v_from,v_until
  from public.hr_salary_scale_steps s join public.hr_salary_scale_versions v on v.id=s.version_id
  where s.id=new.requested_step_id;
  if v_status is distinct from 'approved' or new.effective_on<v_from or (v_until is not null and new.effective_on>v_until) then
   raise exception 'Escalão não aprovado ou fora de vigência' using errcode='23514';
  end if;
 end if;
 if tg_op='UPDATE' then
  if old.status<>'pending' then
   raise exception 'Pedido salarial decidido é imutável' using errcode='23514';
  end if;
  if new.status not in ('pending','approved','rejected','cancelled') then
   raise exception 'Transição salarial inválida' using errcode='23514';
  end if;
  if new.status<>'pending' and
    (new.contract_id is distinct from old.contract_id or new.school_id is distinct from old.school_id
     or new.proposed_base_salary_kz is distinct from old.proposed_base_salary_kz
     or new.effective_on is distinct from old.effective_on
     or new.requested_step_id is distinct from old.requested_step_id) then
   raise exception 'Não é permitido alterar o pedido durante a decisão' using errcode='23514';
  end if;
 end if;
 new.updated_at:=now();
 return new;
end $$;
drop trigger if exists hr_salary_change_validate on public.hr_salary_change_requests;
create trigger hr_salary_change_validate before insert or update on public.hr_salary_change_requests
for each row execute function public.hr_validate_salary_change_request();
alter table public.hr_salary_change_requests enable row level security;
revoke all on public.hr_salary_change_requests from anon,authenticated;
revoke all on function public.hr_validate_salary_change_request() from public,anon,authenticated;
comment on table public.hr_salary_change_requests is 'Server-only audited salary change proposals; approval does not directly update contracts or payroll.';
