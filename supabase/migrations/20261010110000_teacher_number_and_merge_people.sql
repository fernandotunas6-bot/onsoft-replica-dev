-- Professores numerados por register_teacher e fusão de pessoas numa transacção
-- (auditoria 14, P3 e P4). Decidido pelo dono a 2026-10-10.
--
-- 1. private.register_teacher (P3). «Novo professor» passa a usá-la. A sequência dela
--    (private.teacher_number_sequences) nunca foi usada: começa em 1 e dava logo
--    DOC-000001, que já existe. O número passa a ser o maior entre a sequência e o maior
--    DOC-<n> da escola + 1 — acerta-se sozinha, também depois de professores criados
--    por importação ou pela ligação de um login. O resto do corpo é o da produção
--    (pg_get_functiondef de 2026-10-10).
--
-- 2. private.merge_people (P4). «Fundir pessoas» fazia cerca de dez escritas soltas
--    (aluno, professor, documentos, cartões, RH, encarregados, papéis, as duas fichas e a
--    auditoria): uma falha a meio deixava a fusão parcial. Agora é uma função, numa
--    transacção: tudo ou nada. Só o servidor a chama (chave de serviço, que já validou o
--    papel e a 2FA); `p_actor` é a conta que fundiu. As regras são as de mergePeople
--    (src/features/people/server.ts).
--
-- Não mexe em dados. CREATE OR REPLACE mantém as permissões de register_teacher.
-- Idempotente.

BEGIN;

CREATE OR REPLACE FUNCTION private.register_teacher(target_school_id uuid, target_person_id uuid, target_hired_on date, target_employment_type text, target_highest_qualification text, target_subject_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  generated_number bigint;
  generated_employee_number text;
  generated_teacher_id uuid;
  requested_subject_count integer;
  valid_subject_count integer;
begin
  if (select auth.uid()) is null
     or not private.is_aal2()
     or not private.has_permission(target_school_id, 'teachers.records.create') then
    raise exception using errcode = '42501', message = 'Sem autorização para cadastrar docentes.';
  end if;

  if target_hired_on is null or target_hired_on > current_date
     or target_employment_type not in ('permanent', 'fixed_term', 'part_time', 'visiting')
     or target_highest_qualification not in ('secondary', 'bachelor', 'licentiate', 'master', 'doctorate', 'other')
     or not exists (
       select 1 from public.people
       where school_id = target_school_id and id = target_person_id and status = 'active'
     ) then
    raise exception using errcode = '22023', message = 'Dados funcionais ou pessoa inválida.';
  end if;

  select count(distinct subject_id) into requested_subject_count
  from unnest(coalesce(target_subject_ids, '{}'::uuid[])) subject_id;
  select count(*) into valid_subject_count
  from public.subjects
  where school_id = target_school_id and status = 'active'
    and id = any(coalesce(target_subject_ids, '{}'::uuid[]));
  if valid_subject_count <> requested_subject_count then
    raise exception using errcode = '22023', message = 'Existe disciplina inválida ou pertencente a outra escola.';
  end if;

  insert into private.teacher_number_sequences (school_id)
  values (target_school_id)
  on conflict (school_id) do nothing;
  select next_number into generated_number
  from private.teacher_number_sequences
  where school_id = target_school_id
  for update;
  -- Nunca abaixo do maior número da escola: professores criados fora desta função
  -- (importação, ligação de um login) não avançavam a sequência.
  select greatest(
    generated_number,
    coalesce(max(substring(t.employee_number from 5)::bigint), 0) + 1
  ) into generated_number
  from public.teachers t
  -- A mesma regra de nextSequentialCode (education-catalog/identifiers.ts).
  where t.school_id = target_school_id and t.employee_number ~* '^DOC-[0-9]{1,18}$';
  generated_employee_number := 'DOC-' || lpad(generated_number::text, 6, '0');
  update private.teacher_number_sequences
  set next_number = generated_number + 1, updated_at = now()
  where school_id = target_school_id;

  insert into public.teachers (
    school_id, person_id, employee_number, hired_on, employment_type,
    highest_qualification, created_by, updated_by
  ) values (
    target_school_id, target_person_id, generated_employee_number, target_hired_on,
    target_employment_type, target_highest_qualification, (select auth.uid()), (select auth.uid())
  ) returning id into generated_teacher_id;

  insert into public.teacher_subjects (
    school_id, teacher_id, subject_id, valid_from, created_by
  )
  select target_school_id, generated_teacher_id, subject_id, target_hired_on, (select auth.uid())
  from unnest(coalesce(target_subject_ids, '{}'::uuid[])) subject_id
  group by subject_id;

  return jsonb_build_object(
    'teacherId', generated_teacher_id,
    'employeeNumber', generated_employee_number,
    'subjectCount', requested_subject_count
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.merge_people(
  p_school_id uuid, p_survivor_id uuid, p_duplicate_id uuid, p_reason text, p_actor uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_survivor public.people%rowtype;
  v_duplicate public.people%rowtype;
  v_move_login boolean;
  v_moved_links integer := 0;
  v_redundant_links integer := 0;
begin
  if p_actor is null then
    raise exception using errcode = '42501', message = 'Sem autorização para fundir fichas.';
  end if;
  if p_survivor_id = p_duplicate_id then
    raise exception using errcode = '22023', message = 'Seleccione duas pessoas diferentes.';
  end if;

  -- As duas fichas trancadas até ao fim: duas fusões ao mesmo tempo não se cruzam.
  select * into v_survivor from public.people
  where school_id = p_school_id and id = p_survivor_id for update;
  select * into v_duplicate from public.people
  where school_id = p_school_id and id = p_duplicate_id for update;
  if v_survivor.id is null or v_duplicate.id is null then
    raise exception using errcode = '22023', message = 'Uma das pessoas não existe nesta escola.';
  end if;

  if v_survivor.user_id is not null and v_duplicate.user_id is not null
     and v_survivor.user_id <> v_duplicate.user_id then
    raise exception using errcode = '22023',
      message = 'As duas fichas têm contas de acesso diferentes. Não é seguro fundi-las — desactive o duplicado.';
  end if;
  if exists (select 1 from public.students where school_id = p_school_id and person_id = p_survivor_id)
     and exists (select 1 from public.students where school_id = p_school_id and person_id = p_duplicate_id) then
    raise exception using errcode = '22023',
      message = 'As duas fichas têm matrícula de aluno. Não é seguro fundi-las — desactive o duplicado.';
  end if;
  if (select count(distinct person_id) from public.hr_employments
      where school_id = p_school_id and person_id in (p_survivor_id, p_duplicate_id)
        and deleted_at is null) > 1 then
    raise exception using errcode = '22023',
      message = 'As duas fichas têm vínculo laboral (RH). Não é seguro fundi-las — desactive o duplicado.';
  end if;
  if exists (select 1 from public.teachers where school_id = p_school_id and person_id = p_survivor_id)
     and exists (select 1 from public.teachers where school_id = p_school_id and person_id = p_duplicate_id) then
    raise exception using errcode = '22023',
      message = 'As duas fichas têm registo de professor. Não é seguro fundi-las — desactive o duplicado.';
  end if;

  -- Tudo o que aponta para o duplicado passa para a ficha que fica.
  update public.students set person_id = p_survivor_id, updated_by = p_actor
  where school_id = p_school_id and person_id = p_duplicate_id;
  update public.teachers set person_id = p_survivor_id, updated_by = p_actor
  where school_id = p_school_id and person_id = p_duplicate_id;
  update public.person_documents set person_id = p_survivor_id, updated_by = p_actor
  where school_id = p_school_id and person_id = p_duplicate_id;
  update public.siga_access_cards set person_id = p_survivor_id
  where school_id = p_school_id and person_id = p_duplicate_id;
  update public.hr_employments set person_id = p_survivor_id, updated_by = p_actor
  where school_id = p_school_id and person_id = p_duplicate_id;

  -- Educandos: a ligação repetida (mesmo educando nas duas fichas) sai; as outras passam.
  delete from public.student_guardians d
  where d.school_id = p_school_id and d.guardian_person_id = p_duplicate_id
    and exists (
      select 1 from public.student_guardians s
      where s.school_id = p_school_id and s.guardian_person_id = p_survivor_id
        and s.student_id = d.student_id
    );
  get diagnostics v_redundant_links = row_count;
  update public.student_guardians set guardian_person_id = p_survivor_id
  where school_id = p_school_id and guardian_person_id = p_duplicate_id;
  get diagnostics v_moved_links = row_count;

  -- Papéis que a ficha que fica ainda não tem.
  update public.person_roles d set person_id = p_survivor_id, updated_by = p_actor
  where d.school_id = p_school_id and d.person_id = p_duplicate_id and d.deleted_at is null
    and not exists (
      select 1 from public.person_roles s
      where s.school_id = p_school_id and s.person_id = p_survivor_id
        and s.deleted_at is null and s.role = d.role
    );

  -- Contactos que só o duplicado tem passam para a ficha que fica. O duplicado larga-os
  -- primeiro: e-mail, BI e conta têm índices únicos por escola.
  v_move_login := v_duplicate.user_id is not null and v_survivor.user_id is null;
  update public.people set
    status = 'inactive',
    email = case when v_survivor.email is null then null else email end,
    phone = case when v_survivor.phone is null then null else phone end,
    national_id = case when v_survivor.national_id is null then null else national_id end,
    user_id = case when v_move_login then null else user_id end,
    updated_by = p_actor
  where school_id = p_school_id and id = p_duplicate_id;

  update public.people set
    user_id = case when v_move_login then v_duplicate.user_id else user_id end,
    email = coalesce(email, v_duplicate.email),
    phone = coalesce(phone, v_duplicate.phone),
    national_id = coalesce(national_id, v_duplicate.national_id),
    date_of_birth = coalesce(date_of_birth, v_duplicate.date_of_birth),
    updated_by = p_actor
  where school_id = p_school_id and id = p_survivor_id;

  insert into public.audit_logs (school_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    p_school_id, p_actor, 'people.merged', 'person', p_survivor_id,
    jsonb_build_object(
      'duplicate_id', p_duplicate_id,
      'reason', p_reason,
      'moved_guardian_links', v_moved_links,
      'removed_redundant_guardian_links', v_redundant_links,
      'moved_login', v_move_login
    )
  );

  return jsonb_build_object(
    'survivorId', p_survivor_id,
    'duplicateId', p_duplicate_id,
    'movedGuardianLinks', v_moved_links,
    'removedRedundantGuardianLinks', v_redundant_links,
    'movedLogin', v_move_login
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.siga_merge_people(
  p_school_id uuid, p_survivor_id uuid, p_duplicate_id uuid, p_reason text, p_actor uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $function$
  select private.merge_people(p_school_id, p_survivor_id, p_duplicate_id, p_reason, p_actor);
$function$;

-- Só o servidor: quem chama escolhe `p_actor`, por isso o browser nunca a pode chamar.
REVOKE ALL ON FUNCTION private.merge_people(uuid, uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.siga_merge_people(uuid, uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.merge_people(uuid, uuid, uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.siga_merge_people(uuid, uuid, uuid, text, uuid) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
