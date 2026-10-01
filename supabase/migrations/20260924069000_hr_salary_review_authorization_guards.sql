-- Enforce review-time controls independently of the API.
create or replace function public.hr_guard_salary_review()
returns trigger language plpgsql set search_path=public,pg_temp as $$
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
  if new.effective_on<current_date then
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
end $$;
drop trigger if exists hr_salary_review_guard on public.hr_salary_change_requests;
create trigger hr_salary_review_guard before update of status on public.hr_salary_change_requests
for each row execute function public.hr_guard_salary_review();
revoke all on function public.hr_guard_salary_review() from public,anon,authenticated;
