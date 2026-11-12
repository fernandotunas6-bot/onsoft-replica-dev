-- Matrícula antecipada no ano lectivo seguinte (auditoria 14, A2). Decidido pelo dono a
-- 2026-10-10.
--
-- private.enroll_student só aceitava o ano lectivo `active` e uma data de matrícula dentro
-- dele: em Agosto não se matriculava ninguém para o ano que começa em Setembro (nem se
-- renovava a matrícula de quem já estuda na escola).
--
-- Agora aceita também o ano em preparação (`draft`) e datas até 183 dias antes do início
-- do ano. A data gravada nunca é anterior ao início do ano: uma matrícula feita a 20/08
-- para o ano que começa a 01/09 fica com 01/09 — as faltas, as notas e as propinas contam
-- a partir daí. Anos fechados ou arquivados continuam recusados, e a data continua a não
-- poder passar o fim do ano.
--
-- A regra está igual no servidor (`enrollmentWindow`, students/enrollment-core.ts), que a
-- verifica antes de criar a pessoa e o aluno. O resto do corpo é o da produção
-- (pg_get_functiondef de 2026-10-10). Não mexe em dados. CREATE OR REPLACE mantém as
-- permissões. Idempotente.

BEGIN;

CREATE OR REPLACE FUNCTION private.enroll_student(target_school_id uuid, target_student_id uuid, target_class_group_id uuid, target_enrolled_on date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  selected_group public.class_groups%rowtype;
  selected_year public.academic_years%rowtype;
  occupied_places integer;
  generated_number bigint;
  generated_enrollment_number text;
  generated_enrollment_id uuid;
  recorded_enrolled_on date;
begin
  if (select auth.uid()) is null or not private.is_aal2()
     or not private.has_permission(target_school_id, 'students.enrollments.create') then
    raise exception using errcode = '42501', message = 'Sem autorização para matricular estudantes.';
  end if;

  select * into selected_group from public.class_groups
  where school_id = target_school_id and id = target_class_group_id and status = 'active'
  for update;
  if selected_group.id is null then
    raise exception using errcode = '22023', message = 'Turma ativa inválida para esta escola.';
  end if;
  -- Ano activo ou em preparação; a data pode ser até 183 dias antes do início
  -- (matrícula antecipada) e grava-se o início do ano nesse caso.
  select * into selected_year from public.academic_years
  where school_id = target_school_id and id = selected_group.academic_year_id
    and status in ('active', 'draft');
  if selected_year.id is null
     or target_enrolled_on is null
     or target_enrolled_on < selected_year.starts_on - 183
     or target_enrolled_on > selected_year.ends_on
     or not exists (
       select 1 from public.students
       where school_id = target_school_id and id = target_student_id
         and status in ('applicant', 'active')
     ) then
    raise exception using errcode = '22023', message = 'Estudante, ano letivo ou data de matrícula inválida.';
  end if;
  recorded_enrolled_on := greatest(target_enrolled_on, selected_year.starts_on);

  select count(*) into occupied_places from public.enrollments
  where school_id = target_school_id and class_group_id = target_class_group_id
    and status in ('pending', 'active');
  if occupied_places >= selected_group.capacity then
    raise exception using errcode = '23514', message = 'A turma atingiu a capacidade configurada.';
  end if;

  insert into private.enrollment_number_sequences (school_id)
  values (target_school_id) on conflict (school_id) do nothing;
  select next_number into generated_number from private.enrollment_number_sequences
  where school_id = target_school_id for update;
  generated_enrollment_number := 'MAT-' || lpad(generated_number::text, 6, '0');
  update private.enrollment_number_sequences
  set next_number = generated_number + 1, updated_at = now()
  where school_id = target_school_id;

  insert into public.enrollments (
    school_id, academic_year_id, class_group_id, student_id,
    enrollment_number, enrolled_on, created_by, updated_by
  ) values (
    target_school_id, selected_group.academic_year_id, target_class_group_id,
    target_student_id, generated_enrollment_number, recorded_enrolled_on,
    (select auth.uid()), (select auth.uid())
  ) returning id into generated_enrollment_id;

  update public.students set status = 'active', updated_by = (select auth.uid()), updated_at = now()
  where school_id = target_school_id and id = target_student_id and status = 'applicant';

  return jsonb_build_object(
    'enrollmentId', generated_enrollment_id,
    'enrollmentNumber', generated_enrollment_number,
    'classGroupId', target_class_group_id,
    'status', 'active',
    'enrolledOn', recorded_enrolled_on
  );
end;
$function$;

COMMIT;
