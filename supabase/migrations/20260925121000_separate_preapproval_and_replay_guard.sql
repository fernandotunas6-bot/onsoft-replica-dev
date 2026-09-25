-- Prevent repeat enrollment after final approval and separate first approval from final access.
alter table public.school_access_requests drop constraint if exists school_access_requests_status_check;
alter table public.school_access_requests add constraint school_access_requests_status_check
 check (status in ('pending','under_review','needs_information','preapproved','approved','enrollment_pending','enrollment_rejected','rejected','cancelled'));
drop index if exists public.school_access_requests_one_open;
create unique index school_access_requests_one_open on public.school_access_requests(school_id,user_id)
 where status in ('pending','under_review','needs_information','preapproved','approved','enrollment_pending');
create or replace function public.submit_approved_school_enrollment(
 p_request_id uuid, p_user_id uuid,p_payload jsonb
) returns uuid language plpgsql security invoker
 set search_path=public,pg_temp as $$
declare r public.school_access_requests%rowtype; f public.enrollment_forms%rowtype; v_application_id uuid;
begin
 select * into r from public.school_access_requests where id=p_request_id and user_id=p_user_id for update;
 if not found or r.status <> 'preapproved' or r.enrollment_application_id is not null or r.requested_role <> 'student' then
  raise exception 'Acesso à candidatura não autorizado ou já utilizado';
 end if;
 select * into f from public.enrollment_forms where school_id=r.school_id
  and is_open and deleted_at is null order by created_at limit 1;
 if not found then raise exception 'A escola ainda não abriu a candidatura a matrícula'; end if;
 if jsonb_typeof(p_payload->'person') <> 'object' or
   length(trim(coalesce(p_payload#>>'{person,full_name}',''))) < 3 then
  raise exception 'Dados pessoais obrigatórios em falta'; end if;
 insert into public.enrollment_applications(
  school_id,form_id,full_name,payload,status,created_by,updated_by
 ) values(r.school_id,f.id,trim(p_payload#>>'{person,full_name}'),
  p_payload||jsonb_build_object('accessRequestId',r.id),'pending',p_user_id,p_user_id)
 returning id into v_application_id;
 update public.school_access_requests set enrollment_application_id=v_application_id,
  full_name=trim(p_payload#>>'{person,full_name}'), status='enrollment_pending',
  updated_at=now() where id=r.id;
 return v_application_id;
end $$;

revoke all on function public.submit_approved_school_enrollment(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.submit_approved_school_enrollment(uuid,uuid,jsonb) to service_role;
