-- Record previous effective salary rather than original contract salary on subsequent amendments.
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
