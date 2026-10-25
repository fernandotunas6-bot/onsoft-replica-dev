-- Reconcilia a matrícula antecipada sem repor os antigos números MAT-.
-- Base: função actual da produção (20261012140000); mantém next_year_number,
-- capacidade sob lock, MFA, permissões e escola. Não altera matrículas existentes.
-- Aplicar após 20261010110000 para completar também o cadastro/fusão de docentes.
BEGIN;
create or replace function private.enroll_student(
  target_school_id uuid,
  target_student_id uuid,
  target_class_group_id uuid,
  target_enrolled_on date
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  selected_group public.class_groups%rowtype;
  selected_year public.academic_years%rowtype;
  occupied_places integer;
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
  select * into selected_year from public.academic_years
  where school_id = target_school_id and id = selected_group.academic_year_id and status in ('active', 'draft');
  if selected_year.id is null or target_enrolled_on is null
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

  generated_enrollment_number := private.next_year_number(
    target_school_id, 'enrollment', extract(year from selected_year.starts_on)::integer
  );

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
NOTIFY pgrst, 'reload schema';
