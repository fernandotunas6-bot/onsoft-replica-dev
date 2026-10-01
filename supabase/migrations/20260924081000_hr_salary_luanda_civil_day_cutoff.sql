-- All salary workflow cutoffs use the school's Angola civil date, independent of server timezone.
CREATE OR REPLACE FUNCTION public.hr_apply_approved_salary_change(p_request_id uuid, p_school_id uuid, p_actor_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r public.hr_salary_change_requests%rowtype; c public.hr_contracts%rowtype; v_id uuid;
begin
 select * into r from public.hr_salary_change_requests
 where id=p_request_id and school_id=p_school_id and status='approved' for update;
 if not found then raise exception 'Pedido aprovado não encontrado' using errcode='P0002'; end if;
 if r.requested_by=p_actor_id or r.reviewed_by=p_actor_id then
  raise exception 'Aplicação exige terceiro interveniente' using errcode='42501';
 end if;
 if r.effective_on<(now() at time zone 'Africa/Luanda')::date then
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
 values(p_school_id,c.id,r.id,r.effective_on,
  coalesce(
    (select a.new_base_salary_kz from public.hr_contract_salary_amendments a
     where a.contract_id=c.id and a.school_id=p_school_id and a.effective_on<r.effective_on
     order by a.effective_on desc,a.created_at desc limit 1),
    c.base_salary_kz
  ),
  r.proposed_base_salary_kz,r.requested_step_id,p_actor_id)
 returning id into v_id;
 perform set_config('app.hr_salary_apply','on',true);
 update public.hr_salary_change_requests set status='applied',applied_at=now() where id=r.id;
 perform set_config('app.hr_salary_apply','off',true);
 return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.hr_guard_salary_review()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_contract_status text; v_existing uuid;
begin
 if tg_op='UPDATE' and old.status='pending' and new.status='approved' then
  if new.reviewed_by is null or new.reviewed_at is null
     or length(btrim(coalesce(new.review_reason,'')))<10 then
   raise exception 'Aprovação exige revisor e fundamentação' using errcode='23514';
  end if;
  if new.requested_by is null or new.requested_by=new.reviewed_by then
   raise exception 'Revisor tem de ser diferente do requerente' using errcode='23514';
  end if;
  if new.effective_on<(now() at time zone 'Africa/Luanda')::date then
   raise exception 'Aprovação retroactiva exige rectificação própria' using errcode='23514';
  end if;
  select status into v_contract_status from public.hr_contracts
   where id=new.contract_id and school_id=new.school_id and deleted_at is null for share;
  if v_contract_status is distinct from 'active' then
   raise exception 'Não é possível aprovar pedido de contrato inactivo' using errcode='23514';
  end if;
  select id into v_existing from public.hr_salary_change_requests
   where contract_id=new.contract_id and id<>new.id and status='approved'
   order by created_at limit 1;
  if v_existing is not null then
   raise exception 'Já existe pedido aprovado por aplicar neste contrato' using errcode='23514';
  end if;
 end if;
 return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.hr_validate_salary_change_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_school uuid; v_start date; v_end date; v_status text; v_from date; v_until date; v_amount numeric(16,2);
begin
 select school_id,starts_on,ends_on into v_school,v_start,v_end from public.hr_contracts
 where id=new.contract_id and deleted_at is null;
 if v_school is null or v_school<>new.school_id then
  raise exception 'Pedido salarial e contrato pertencem a escolas diferentes' using errcode='23514';
 end if;
 if tg_op='INSERT' then
  if not exists(select 1 from public.hr_contracts c where c.id=new.contract_id and c.status='active') then
   raise exception 'Pedido salarial exige contrato activo' using errcode='23514';
  end if;
  if new.effective_on<(now() at time zone 'Africa/Luanda')::date then
   raise exception 'Pedido retroactivo exige procedimento de rectificação' using errcode='23514';
  end if;
  if new.requested_by is null then
   raise exception 'Pedido salarial exige identificação do requerente' using errcode='23514';
  end if;
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
end $function$
;
