-- Numeração só com dígitos: 1 + ano (2 dígitos) + 4 dígitos sequenciais.
--
-- Pedido do dono (2026-10-12): o número do aluno, o da matrícula e o dos documentos da
-- escola têm 7 dígitos e começam por «1» seguido do ano: em 2026, 1260001, 1260002…
-- A contagem recomeça em 0001 em cada ano, por escola e por tipo (aluno, matrícula,
-- documento), até 9999. Os números já existentes (EST-…, MAT-…) são renumerados por
-- ordem de criação.
--
--   aluno     → ano da data de admissão;
--   matrícula → ano em que começa o ano lectivo da turma;
--   documento → ano civil de emissão (hora de Luanda).
--
-- Fora: facturas, recibos, notas de crédito e despesas (`invoice`, `receipt`,
-- `credit_note`, `expense`) mantêm a série com prefixo — a numeração fiscal segue as
-- regras da AGT e não muda aqui.
--
-- Idempotente: a tabela e as restrições usam IF NOT EXISTS / DROP IF EXISTS, as funções
-- CREATE OR REPLACE (mantêm as permissões), e a renumeração só toca nos números que
-- ainda não estão no formato novo, continuando a partir do maior já atribuído. O
-- Supabase corre a migração numa só transacção: se um passo falha, nada fica a meio.


-- 1. Contadores por escola, tipo e ano. Só o servidor (funções SECURITY DEFINER).
create table if not exists private.siga_year_sequences (
  school_id uuid not null references public.schools (id) on delete cascade,
  kind text not null check (kind in ('student', 'enrollment', 'document')),
  year smallint not null check (year between 2000 and 2099),
  next_number integer not null default 1 check (next_number between 1 and 10000),
  updated_at timestamptz not null default now(),
  primary key (school_id, kind, year)
);
alter table private.siga_year_sequences enable row level security;
alter table private.siga_year_sequences force row level security;
revoke all on private.siga_year_sequences from public, anon, authenticated;
grant all on private.siga_year_sequences to service_role;

-- 2. Próximo número: «1» + ano com 2 dígitos + sequência com 4 dígitos.
create or replace function private.next_year_number(
  target_school_id uuid,
  target_kind text,
  target_year integer
)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  issued integer;
begin
  if target_year is null or target_year < 2000 or target_year > 2099 then
    raise exception using errcode = '22023', message = 'Ano inválido para a numeração.';
  end if;

  insert into private.siga_year_sequences (school_id, kind, year)
  values (target_school_id, target_kind, target_year)
  on conflict (school_id, kind, year) do nothing;

  select next_number into issued
  from private.siga_year_sequences
  where school_id = target_school_id and kind = target_kind and year = target_year
  for update;

  if issued > 9999 then
    raise exception using errcode = '54000', message = format(
      'A escola já usou os 9999 números de %s de %s.',
      case target_kind when 'student' then 'aluno' when 'enrollment' then 'matrícula' else 'documento' end,
      target_year
    );
  end if;

  update private.siga_year_sequences
  set next_number = issued + 1, updated_at = now()
  where school_id = target_school_id and kind = target_kind and year = target_year;

  return '1' || lpad((target_year % 100)::text, 2, '0') || lpad(issued::text, 4, '0');
end;
$function$;
revoke all on function private.next_year_number(uuid, text, integer) from public, anon, authenticated;

-- 3. Aluno: igual à versão em produção, só muda a linha do número.
create or replace function private.register_student(
  target_school_id uuid,
  target_person_id uuid,
  target_admission_date date,
  target_guardian_person_id uuid default null::uuid,
  target_relationship text default null::text,
  target_primary_guardian boolean default false,
  target_financial_responsibility boolean default false,
  target_pickup_authorization boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  generated_student_number text;
  generated_student_id uuid;
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

  generated_student_number := private.next_year_number(
    target_school_id, 'student', extract(year from target_admission_date)::integer
  );

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

-- 4. Matrícula: igual à versão em produção, só muda o número (ano do ano lectivo).
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
  where school_id = target_school_id and id = selected_group.academic_year_id and status = 'active';
  if selected_year.id is null or target_enrolled_on not between selected_year.starts_on and selected_year.ends_on
     or not exists (
       select 1 from public.students
       where school_id = target_school_id and id = target_student_id
         and status in ('applicant', 'active')
     ) then
    raise exception using errcode = '22023', message = 'Estudante, ano letivo ou data de matrícula inválida.';
  end if;

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
    target_student_id, generated_enrollment_number, target_enrolled_on,
    (select auth.uid()), (select auth.uid())
  ) returning id into generated_enrollment_id;

  update public.students set status = 'active', updated_by = (select auth.uid()), updated_at = now()
  where school_id = target_school_id and id = target_student_id and status = 'applicant';

  return jsonb_build_object(
    'enrollmentId', generated_enrollment_id,
    'enrollmentNumber', generated_enrollment_number,
    'classGroupId', target_class_group_id,
    'status', 'active'
  );
end;
$function$;

-- 5. Documentos da escola: só dígitos. Os fiscais continuam com a série.
create or replace function private.next_document_number(
  target_school_id uuid,
  target_document_type text,
  default_prefix text default null::text
)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  seq public.document_sequences%rowtype;
  issued text;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Autenticação obrigatória.';
  end if;
  if not private.is_active_member(target_school_id) then
    raise exception using errcode = '42501', message = 'Sem associação activa à escola.';
  end if;

  if target_document_type not in ('invoice', 'receipt', 'credit_note', 'expense') then
    return private.next_year_number(
      target_school_id, 'document',
      extract(year from (now() at time zone 'Africa/Luanda'))::integer
    );
  end if;

  insert into public.document_sequences (school_id, document_type, prefix)
  values (
    target_school_id,
    target_document_type,
    coalesce(nullif(upper(btrim(default_prefix)), ''), upper(left(target_document_type, 3)))
  )
  on conflict (school_id, document_type) do nothing;

  select * into seq from public.document_sequences
  where school_id = target_school_id and document_type = target_document_type
  for update;
  if not found then
    raise exception using errcode = '55000', message = 'Sequência documental indisponível.';
  end if;

  issued := seq.prefix || '-' || lpad(seq.next_number::text, seq.padding, '0');
  update public.document_sequences
  set next_number = next_number + 1, updated_at = now()
  where school_id = target_school_id and document_type = target_document_type;
  return issued;
end;
$function$;

create or replace function private.next_document_number_service(
  target_school_id uuid,
  target_document_type text,
  default_prefix text default null::text
)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  seq public.document_sequences%rowtype;
  issued text;
begin
  if target_document_type not in ('invoice', 'receipt', 'credit_note', 'expense') then
    return private.next_year_number(
      target_school_id, 'document',
      extract(year from (now() at time zone 'Africa/Luanda'))::integer
    );
  end if;

  insert into public.document_sequences (school_id, document_type, prefix)
  values (
    target_school_id,
    target_document_type,
    coalesce(nullif(upper(btrim(default_prefix)), ''), upper(left(target_document_type, 3)))
  )
  on conflict (school_id, document_type) do nothing;

  select * into seq from public.document_sequences
  where school_id = target_school_id and document_type = target_document_type
  for update;
  if not found then
    raise exception using errcode = '55000', message = 'Sequência documental indisponível.';
  end if;

  issued := seq.prefix || '-' || lpad(seq.next_number::text, seq.padding, '0');
  update public.document_sequences
  set next_number = next_number + 1, updated_at = now()
  where school_id = target_school_id and document_type = target_document_type;
  return issued;
end;
$function$;

-- 6. Validar e planear antes de desactivar protecções ou alterar números.
-- Executar apenas numa transacção única. Estes locks impedem escritas nas tabelas
-- de origem enquanto o plano é calculado e aplicado.
lock table public.students, public.enrollments, public.issued_documents,
  public.academic_years in share row exclusive mode;

create table if not exists private.siga_numbering_changes (
  migration text not null,
  school_id uuid not null references public.schools(id),
  kind text not null check (kind in ('student', 'enrollment', 'document')),
  record_id uuid not null,
  old_number text not null,
  new_number text not null,
  changed_at timestamptz not null default now(),
  primary key (migration, kind, record_id)
);
alter table private.siga_numbering_changes enable row level security;
alter table private.siga_numbering_changes force row level security;
revoke all on private.siga_numbering_changes from public, anon, authenticated, service_role;
grant select on private.siga_numbering_changes to service_role;

-- Tabelas temporárias explícitas permitem ensaiar a mesma migração duas vezes.
drop table if exists pg_temp.siga_numbering_source;
drop table if exists pg_temp.siga_numbering_plan;
create temporary table siga_numbering_source on commit drop as
select 'student'::text as kind, s.id, s.school_id, s.student_number as old_number,
  extract(year from s.admission_date)::integer as year, s.created_at as ordered_at
from public.students s
union all
select 'enrollment', e.id, e.school_id, e.enrollment_number,
  extract(year from y.starts_on)::integer, e.created_at
from public.enrollments e
left join public.academic_years y on y.id = e.academic_year_id and y.school_id = e.school_id
union all
select 'document', d.id, d.school_id, d.document_number,
  extract(year from (d.issued_at at time zone 'Africa/Luanda'))::integer, d.issued_at
from public.issued_documents d
where d.document_type not in ('invoice', 'receipt', 'credit_note', 'expense');

do $preflight$
begin
  if exists (select 1 from pg_temp.siga_numbering_source
    where year is null or year not between 2000 and 2099 or old_number is null) then
    raise exception using errcode = '22023',
      message = 'Renumeração recusada: data, ano, escola do ano lectivo ou número inválido.';
  end if;
  if exists (select 1 from pg_temp.siga_numbering_source
    where old_number ~ '^1[0-9]{6}$'
      and (right(old_number, 4) = '0000'
        or ('20' || substr(old_number, 2, 2))::integer <> year)) then
    raise exception using errcode = '22023',
      message = 'Renumeração recusada: número existente com sequência zero ou ano divergente.';
  end if;
end;
$preflight$;

create temporary table siga_numbering_plan on commit drop as
with base as (
  select kind, school_id, year, max(right(old_number, 4)::integer) as last
  from pg_temp.siga_numbering_source where old_number ~ '^1[0-9]{6}$'
  group by kind, school_id, year
), pending as (
  select *, row_number() over (
    partition by kind, school_id, year order by ordered_at, id
  ) as rn
  from pg_temp.siga_numbering_source where old_number !~ '^1[0-9]{6}$'
)
select p.*, coalesce(b.last, 0) + p.rn as sequence
from pending p left join base b using (kind, school_id, year);

do $capacity$
begin
  if exists (select 1 from pg_temp.siga_numbering_plan where sequence > 9999) then
    raise exception using errcode = '54000',
      message = 'Renumeração recusada: excede 9999 números por escola, tipo e ano.';
  end if;
  if exists (
    select 1 from pg_temp.siga_numbering_plan p
    join private.siga_numbering_changes c
      on c.migration = '20261012140000' and c.kind = p.kind and c.record_id = p.id
  ) then
    raise exception using errcode = '22023',
      message = 'Renumeração recusada: registo já renumerado foi alterado; rever histórico.';
  end if;
end;
$capacity$;

-- Guardar o mapa na mesma transacção: uma falha desfaz mapa e alterações juntos.
insert into private.siga_numbering_changes
  (migration, school_id, kind, record_id, old_number, new_number)
select '20261012140000', school_id, kind, id, old_number,
  '1' || lpad((year % 100)::text, 2, '0') || lpad(sequence::text, 4, '0')
from pg_temp.siga_numbering_plan;

alter table public.students drop constraint if exists students_student_number_check;
alter table public.enrollments drop constraint if exists enrollments_enrollment_number_check;
alter table public.students disable trigger protect_student_identity;
alter table public.enrollments disable trigger protect_enrollment_identity;

update public.students t
set student_number = c.new_number
from private.siga_numbering_changes c
join pg_temp.siga_numbering_plan p on p.id = c.record_id and p.kind = c.kind
where c.migration = '20261012140000' and c.kind = 'student'
  and t.id = c.record_id and t.school_id = c.school_id;

update public.enrollments t
set enrollment_number = c.new_number
from private.siga_numbering_changes c
join pg_temp.siga_numbering_plan p on p.id = c.record_id and p.kind = c.kind
where c.migration = '20261012140000' and c.kind = 'enrollment'
  and t.id = c.record_id and t.school_id = c.school_id;

update public.issued_documents t
set document_number = c.new_number
from private.siga_numbering_changes c
join pg_temp.siga_numbering_plan p on p.id = c.record_id and p.kind = c.kind
where c.migration = '20261012140000' and c.kind = 'document'
  and t.id = c.record_id and t.school_id = c.school_id;

alter table public.students enable trigger protect_student_identity;
alter table public.enrollments enable trigger protect_enrollment_identity;

-- Os contadores continuam a seguir ao maior número de cada escola e ano.
insert into private.siga_year_sequences (school_id, kind, year, next_number)
select school_id, 'student', ('20' || substr(student_number, 2, 2))::integer,
  max(right(student_number, 4)::integer) + 1
from public.students where student_number ~ '^1[0-9]{6}$'
group by 1, 3
on conflict (school_id, kind, year)
do update set next_number = greatest(private.siga_year_sequences.next_number, excluded.next_number);

insert into private.siga_year_sequences (school_id, kind, year, next_number)
select school_id, 'enrollment', ('20' || substr(enrollment_number, 2, 2))::integer,
  max(right(enrollment_number, 4)::integer) + 1
from public.enrollments where enrollment_number ~ '^1[0-9]{6}$'
group by 1, 3
on conflict (school_id, kind, year)
do update set next_number = greatest(private.siga_year_sequences.next_number, excluded.next_number);

insert into private.siga_year_sequences (school_id, kind, year, next_number)
select school_id, 'document', ('20' || substr(document_number, 2, 2))::integer,
  max(right(document_number, 4)::integer) + 1
from public.issued_documents where document_number ~ '^1[0-9]{6}$'
  and document_type not in ('invoice', 'receipt', 'credit_note', 'expense')
group by 1, 3
on conflict (school_id, kind, year)
do update set next_number = greatest(private.siga_year_sequences.next_number, excluded.next_number);

-- 7. O formato novo passa a ser a regra.
alter table public.students
  add constraint students_student_number_check check (student_number ~ '^1[0-9]{6}$' and right(student_number, 4) <> '0000');
alter table public.enrollments
  add constraint enrollments_enrollment_number_check check (enrollment_number ~ '^1[0-9]{6}$' and right(enrollment_number, 4) <> '0000');

