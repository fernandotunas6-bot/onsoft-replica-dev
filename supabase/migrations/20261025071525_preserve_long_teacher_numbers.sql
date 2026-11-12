-- O lpad(text,6) do PostgreSQL corta números com mais de seis dígitos.
-- A produção já contém identificadores docentes maiores: não renumerar pessoas.
-- Mantém a sequência sob lock e o maior número da escola; só corrige a formatação.
-- Segurança e assinatura preservadas. Nenhuma linha de docentes é alterada.
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
  generated_employee_number := 'DOC-' || lpad(generated_number::text, greatest(6, length(generated_number::text)), '0');
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
COMMIT;
NOTIFY pgrst, 'reload schema';
