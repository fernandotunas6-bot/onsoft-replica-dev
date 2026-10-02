-- Financial consistency: an approved statutory step cannot be requested with a different base amount.
create or replace function public.hr_validate_salary_change_request()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_school uuid; v_start date; v_end date; v_status text; v_from date; v_until date; v_amount numeric(16,2);
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
  select v.status,v.effective_from,v.effective_until,s.monthly_base_kz
   into v_status,v_from,v_until,v_amount
   from public.hr_salary_scale_steps s join public.hr_salary_scale_versions v on v.id=s.version_id
   where s.id=new.requested_step_id;
  if v_status is distinct from 'approved' or new.effective_on<v_from
   or (v_until is not null and new.effective_on>v_until) then
   raise exception 'Escalão não aprovado ou fora de vigência' using errcode='23514';
  end if;
  if new.proposed_base_salary_kz<>v_amount then
   raise exception 'Valor proposto diverge do escalão salarial aprovado' using errcode='23514';
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
 new.updated_at:=now();return new;
end $$;
