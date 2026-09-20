-- private.register_student() gerava student_number no formato "YYMMnnn"
-- (ex.: "2609001"), mas a tabela public.students tem
-- students_student_number_check: CHECK (student_number ~ '^EST-[0-9]{6,}$').
-- Toda e qualquer chamada à função rebentava sempre no INSERT final com
-- 23514 ("Um ou mais valores não respeitam as regras do sistema") — a
-- matrícula de aluno nunca conseguiu completar-se por esta via, em nenhuma
-- escola criada depois da mudança de formato. Descoberto ao vivo no Ciclo 60.
--
-- Os dois alunos reais existentes (Colegio Adventista - Huambo, EST-000001 /
-- EST-000002) foram gerados com period = 'legacy' fixo em
-- private.student_number_sequences — confirma o formato correcto: prefixo
-- "EST-" + sequência de 6 dígitos por escola, sem componente de data. Esta
-- migração restaura esse comportamento (period constante 'legacy' em vez de
-- to_char(admission_date, 'YYMM')); toda a restante lógica da função
-- (autorização AAL2 + has_permission, validação de pessoa/data/encarregado,
-- inserção de aluno e encarregado) mantém-se inalterada.
--
-- private.register_student() não estava capturada em nenhuma migração do
-- repositório (aplicada directamente ao SGA por uma sessão anterior) — esta
-- é a primeira vez que o corpo da função fica versionado.

CREATE OR REPLACE FUNCTION private.register_student(
  target_school_id uuid,
  target_person_id uuid,
  target_admission_date date,
  target_guardian_person_id uuid DEFAULT NULL::uuid,
  target_relationship text DEFAULT NULL::text,
  target_primary_guardian boolean DEFAULT false,
  target_financial_responsibility boolean DEFAULT false,
  target_pickup_authorization boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  generated_number bigint;
  generated_student_number text;
  generated_student_id uuid;
  v_period text := 'legacy';
begin
  if (select auth.uid()) is null
     or not private.is_aal2()
     or not private.has_permission(target_school_id, 'students.records.create') then
    raise exception using errcode = '42501', message = 'Sem autorização para cadastrar estudantes.';
  end if;

  if target_admission_date is null or target_admission_date > current_date
     or not exists (
       select 1 from public.people
       where school_id = target_school_id and id = target_person_id and status = 'active'
     ) then
    raise exception using errcode = '22023', message = 'Pessoa ou data de admissão inválida.';
  end if;

  if target_guardian_person_id is not null and (
    target_relationship not in ('mother', 'father', 'guardian', 'sibling', 'grandparent', 'other')
    or target_guardian_person_id = target_person_id
    or not exists (
      select 1 from public.people
      where school_id = target_school_id and id = target_guardian_person_id and status = 'active'
    )
  ) then
    raise exception using errcode = '22023', message = 'Encarregado inválido para esta escola.';
  end if;

  insert into private.student_number_sequences (school_id, period)
  values (target_school_id, v_period)
  on conflict (school_id, period) do nothing;

  select next_number into generated_number
  from private.student_number_sequences
  where school_id = target_school_id and period = v_period
  for update;

  generated_student_number := 'EST-' || lpad(generated_number::text, 6, '0');
  update private.student_number_sequences
  set next_number = generated_number + 1, updated_at = now()
  where school_id = target_school_id and period = v_period;

  insert into public.students (
    school_id, person_id, student_number, admission_date, created_by, updated_by
  ) values (
    target_school_id, target_person_id, generated_student_number,
    target_admission_date, (select auth.uid()), (select auth.uid())
  ) returning id into generated_student_id;

  if target_guardian_person_id is not null then
    insert into public.student_guardians (
      school_id, student_id, guardian_person_id, relationship, is_primary,
      is_financially_responsible, is_pickup_authorized, created_by
    ) values (
      target_school_id, generated_student_id, target_guardian_person_id,
      target_relationship, target_primary_guardian,
      target_financial_responsibility, target_pickup_authorization, (select auth.uid())
    );
  end if;

  return jsonb_build_object(
    'studentId', generated_student_id,
    'studentNumber', generated_student_number,
    'status', 'applicant'
  );
end;
$function$;

NOTIFY pgrst, 'reload schema';
