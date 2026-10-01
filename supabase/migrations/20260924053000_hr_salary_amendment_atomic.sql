-- Record approved salary amendments atomically without rewriting historical contract or payroll values.
create table if not exists public.hr_contract_salary_amendments (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id),
 contract_id uuid not null references public.hr_contracts(id),
 request_id uuid not null unique references public.hr_salary_change_requests(id),
 effective_on date not null,
 previous_base_salary_kz numeric(16,2) not null,
 new_base_salary_kz numeric(16,2) not null check(new_base_salary_kz>=0),
 salary_scale_step_id uuid references public.hr_salary_scale_steps(id),
 applied_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create index if not exists hr_contract_salary_amendments_effective_idx on public.hr_contract_salary_amendments(contract_id,effective_on desc);
alter table public.hr_contract_salary_amendments enable row level security;
revoke all on public.hr_contract_salary_amendments from anon,authenticated;
create or replace function public.hr_validate_salary_change_request()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_school uuid; v_start date; v_end date; v_status text; v_from date; v_until date;
begin
 select school_id,starts_on,ends_on into v_school,v_start,v_end from public.hr_contracts
 where id=new.contract_id and deleted_at is null;
 if v_school is null or v_school<>new.school_id then
  raise exception 'Pedido salarial e contrato pertencem a escolas diferentes' using errcode='23514';
 end if;
 if new.effective_on<v_start or (v_end is not null and new.effective_on>v_end) then
  raise exception 'Data salarial fora da vigência contratual' using errcode='23514';
 end if;
 if new.requested_step_id is not null then
  select v.status,v.effective_from,v.effective_until into v_status,v_from,v_until
  from public.hr_salary_scale_steps s join public.hr_salary_scale_versions v on v.id=s.version_id
  where s.id=new.requested_step_id;
  if v_status is distinct from 'approved' or new.effective_on<v_from
    or (v_until is not null and new.effective_on>v_until) then
   raise exception 'Escalão não aprovado ou fora de vigência' using errcode='23514';
  end if;
 end if;
 if tg_op='UPDATE' then
  if old.status='approved' and new.status='applied' and
     current_setting('app.hr_salary_apply',true)='on' then
   if new.contract_id is distinct from old.contract_id
    or new.school_id is distinct from old.school_id
    or new.proposed_base_salary_kz is distinct from old.proposed_base_salary_kz
    or new.effective_on is distinct from old.effective_on
    or new.requested_step_id is distinct from old.requested_step_id then
    raise exception 'Pedido aprovado é imutável' using errcode='23514';
   end if;
  elsif old.status<>'pending' then
   raise exception 'Pedido salarial decidido é imutável' using errcode='23514';
  elsif new.status not in ('pending','approved','rejected','cancelled') then
   raise exception 'Transição salarial inválida' using errcode='23514';
  elsif new.status<>'pending' and (
    new.contract_id is distinct from old.contract_id
    or new.school_id is distinct from old.school_id
    or new.proposed_base_salary_kz is distinct from old.proposed_base_salary_kz
    or new.effective_on is distinct from old.effective_on
    or new.requested_step_id is distinct from old.requested_step_id) then
   raise exception 'Não é permitido alterar o pedido durante a decisão' using errcode='23514';
  end if;
 end if;
 new.updated_at:=now(); return new;
end $$;
create or replace function public.hr_apply_approved_salary_change(p_request_id uuid,p_school_id uuid,p_actor_id uuid)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.hr_salary_change_requests%rowtype; c public.hr_contracts%rowtype; v_id uuid;
begin
 select * into r from public.hr_salary_change_requests
 where id=p_request_id and school_id=p_school_id and status='approved' for update;
 if not found then raise exception 'Pedido aprovado não encontrado' using errcode='P0002'; end if;
 if r.requested_by=p_actor_id or r.reviewed_by=p_actor_id then
  raise exception 'Aplicação exige terceiro interveniente' using errcode='42501';
 end if;
 if r.effective_on<current_date then
  raise exception 'Alterações retroactivas exigem processamento específico' using errcode='23514';
 end if;
 select * into c from public.hr_contracts
 where id=r.contract_id and school_id=p_school_id and status='active' and deleted_at is null for update;
 if not found then raise exception 'Contrato activo não encontrado' using errcode='P0002'; end if;
 if exists(select 1 from public.hr_contract_salary_amendments
   where contract_id=c.id and effective_on=r.effective_on) then
  raise exception 'Já existe alteração salarial nesta data' using errcode='23505';
 end if;
 insert into public.hr_contract_salary_amendments
 (school_id,contract_id,request_id,effective_on,previous_base_salary_kz,new_base_salary_kz,salary_scale_step_id,applied_by)
 values(p_school_id,c.id,r.id,r.effective_on,c.base_salary_kz,r.proposed_base_salary_kz,r.requested_step_id,p_actor_id)
 returning id into v_id;
 perform set_config('app.hr_salary_apply','on',true);
 update public.hr_salary_change_requests set status='applied',applied_at=now() where id=r.id;
 perform set_config('app.hr_salary_apply','off',true);
 return v_id;
end $$;
revoke all on function public.hr_apply_approved_salary_change(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.hr_apply_approved_salary_change(uuid,uuid,uuid) to service_role;
comment on function public.hr_apply_approved_salary_change(uuid,uuid,uuid) is 'Server-only atomic application to effective-dated amendment ledger. Payroll integration must read amendment effective dates; no automatic backpay.';
