-- Separar autorização inicial da confirmação final da matrícula.
alter table public.school_access_requests
 add column if not exists enrollment_application_id uuid unique references public.enrollment_applications(id);
alter table public.school_access_requests
 drop constraint if exists school_access_requests_status_check;
alter table public.school_access_requests
 add constraint school_access_requests_status_check
 check (status in ('pending','under_review','needs_information','approved','enrollment_pending','enrollment_rejected','rejected','cancelled'));
drop index if exists public.school_access_requests_one_open;
create unique index school_access_requests_one_open
 on public.school_access_requests(school_id,user_id)
 where status in ('pending','under_review','needs_information','approved','enrollment_pending');
-- A autorização inicial não cria vínculos. Apenas candidatos pré-aprovados podem enviar matrícula.
create or replace function public.submit_approved_school_enrollment(
 p_request_id uuid, p_user_id uuid,p_payload jsonb
) returns uuid language plpgsql security invoker
 set search_path=public,pg_temp as $$
declare r public.school_access_requests%rowtype; f public.enrollment_forms%rowtype; v_application_id uuid;
begin
 select * into r from public.school_access_requests where id=p_request_id and user_id=p_user_id for update;
 if not found or r.status <> 'approved' or r.requested_role <> 'student' then
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
revoke all on function public.submit_approved_school_enrollment(uuid,uuid,jsonb)
 from public,anon,authenticated;
grant execute on function public.submit_approved_school_enrollment(uuid,uuid,jsonb) to service_role;
-- A autorização escolar só ocorre quando a candidatura ligada foi aceite.
create or replace function public.approve_school_access_request(
 p_request_id uuid,p_reviewer_id uuid,p_person_id uuid default null
) returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.school_access_requests%rowtype; v_membership uuid; v_role uuid; a public.enrollment_applications%rowtype; st public.students%rowtype;
begin
 select * into r from public.school_access_requests where id=p_request_id for update;
 if not found or r.status <> 'enrollment_pending' or r.enrollment_application_id is null then
  raise exception 'É necessária candidatura submetida e aprovada antes do acesso';
 end if;
 if not exists (
  select 1 from public.school_memberships sm
  join public.member_roles mr on mr.membership_id=sm.id and mr.school_id=sm.school_id
  join public.roles ro on ro.id=mr.role_id and ro.school_id=sm.school_id
  where sm.school_id=r.school_id and sm.user_id=p_reviewer_id and sm.status='active'
   and ro.code in ('owner','admin','secretary')
 ) then raise exception 'Revisor sem autorização institucional'; end if;
 select * into a from public.enrollment_applications
 where id=r.enrollment_application_id and school_id=r.school_id
  and created_by=r.user_id and status='accepted' and deleted_at is null;
 if not found or a.student_id is null then raise exception 'Matrícula ainda não confirmada'; end if;
 select * into st from public.students where id=a.student_id and school_id=r.school_id
 and deleted_at is null;
 if not found then raise exception 'Aluno confirmado não encontrado na escola'; end if;
 if not exists(select 1 from public.enrollments e where e.student_id=st.id and e.school_id=r.school_id and e.status='active') then
  raise exception 'A matrícula e a turma precisam ser confirmadas antes do acesso'; end if;
 if p_person_id is distinct from st.person_id then raise exception 'Cadastro incompatível com matrícula confirmada'; end if;
 select id into v_role from public.roles where school_id=r.school_id and code='student' limit 1;
 if v_role is null then raise exception 'Papel de aluno não configurado'; end if;
 if exists(select 1 from public.people where id=st.person_id and user_id is not null
 and user_id <> r.user_id) then raise exception 'Cadastro já associado a outra identidade'; end if;
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
 values(r.school_id,v_membership,v_role) on conflict do nothing;
 update public.people set user_id=r.user_id,updated_at=now() where id=st.person_id
 and school_id=r.school_id and (user_id is null or user_id=r.user_id);
 if not found then raise exception 'Não foi possível vincular o cadastro confirmado'; end if;
 update public.school_access_requests set status='approved',person_id=st.person_id,
 reviewed_by=p_reviewer_id,reviewed_at=now(),updated_at=now() where id=r.id;
 return v_membership;
end $$;
revoke all on function public.approve_school_access_request(uuid,uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.approve_school_access_request(uuid,uuid,uuid) to service_role;
