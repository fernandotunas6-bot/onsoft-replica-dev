-- Versões da pauta oficial (ponto 17 da especificação do motor académico).
--
-- `build_grade_sheet` apaga e refaz as linhas da pauta sempre que é gerada.
-- Numa pauta homologada ou publicada que é reaberta para rectificação, a
-- versão que foi oficial perdia-se sem cópia. Passa a ficar guardada em
-- `grade_sheet_versions` (imutável, só o servidor lê) antes de as linhas serem
-- refeitas: número de versão, estado e motivo da reabertura, modelo usado,
-- quando foi gerada e as linhas completas.
--
-- `private.build_grade_sheet` é a definição de produção (lida a 2026-09-29)
-- com o bloco de versões acrescentado antes de a pauta voltar a rascunho.
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.grade_sheet_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  grade_sheet_id uuid NOT NULL REFERENCES public.grade_sheets(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL,
  reason text,
  rule_set_id uuid,
  built_at timestamptz,
  snapshot jsonb NOT NULL,
  archived_by uuid REFERENCES auth.users(id),
  archived_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (grade_sheet_id, version)
);
CREATE INDEX IF NOT EXISTS grade_sheet_versions_school_sheet_idx
  ON public.grade_sheet_versions (school_id, grade_sheet_id);

-- Só o servidor: sem políticas, sem concessões ao cliente.
ALTER TABLE public.grade_sheet_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_sheet_versions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.grade_sheet_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.grade_sheet_versions TO service_role;

-- Imutável: ninguém altera nem apaga uma versão guardada.
CREATE OR REPLACE FUNCTION private.grade_sheet_versions_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
begin
  raise exception using errcode = '42501', message = 'As versões da pauta não se alteram.';
end;
$$;
DROP TRIGGER IF EXISTS grade_sheet_versions_immutable ON public.grade_sheet_versions;
CREATE TRIGGER grade_sheet_versions_immutable
  BEFORE UPDATE OR DELETE ON public.grade_sheet_versions
  FOR EACH ROW EXECUTE FUNCTION private.grade_sheet_versions_immutable();

-- Guarda a versão oficial de uma pauta antes de ser refeita. Só actua se a
-- pauta já foi homologada ou publicada e tem linhas; caso contrário não faz
-- nada. SECURITY DEFINER porque `build_grade_sheet` corre com o utilizador.
CREATE OR REPLACE FUNCTION private.archive_grade_sheet_version(
  target_school_id uuid,
  target_sheet_id uuid,
  actor uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
declare
  sheet public.grade_sheets%rowtype;
begin
  select * into sheet from public.grade_sheets
  where school_id = target_school_id and id = target_sheet_id;
  if not found or (sheet.homologated_at is null and sheet.published_at is null) then
    return;
  end if;
  if not exists (
    select 1 from public.grade_sheet_rows
    where school_id = target_school_id and grade_sheet_id = target_sheet_id
  ) then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('grade_sheet_versions:' || target_sheet_id::text));

  insert into public.grade_sheet_versions (
    school_id, grade_sheet_id, version, status, reason, rule_set_id, built_at, snapshot, archived_by
  )
  select
    target_school_id, target_sheet_id,
    coalesce((
      select max(v.version) from public.grade_sheet_versions v
      where v.school_id = target_school_id and v.grade_sheet_id = target_sheet_id
    ), 0) + 1,
    sheet.status, sheet.reopen_reason, sheet.rule_set_id,
    min(r.created_at),
    jsonb_agg(to_jsonb(r) - 'school_id' - 'grade_sheet_id' order by r.enrollment_id),
    actor
  from public.grade_sheet_rows r
  where r.school_id = target_school_id and r.grade_sheet_id = target_sheet_id;
end;
$$;
REVOKE ALL ON FUNCTION private.archive_grade_sheet_version(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.archive_grade_sheet_version(uuid, uuid, uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.build_grade_sheet(target_school_id uuid, target_class_group_id uuid, target_term_id uuid, sheet_kind text DEFAULT 'term'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  group_row public.class_groups%rowtype;
  term_row public.terms%rowtype;
  active_rule public.assessment_rule_sets%rowtype;
  sheet_id uuid;
  enrollment_row record;
  book_row record;
  averages jsonb;
  continuous_values numeric[] := '{}';
  exam_values numeric[] := '{}';
  average_values numeric[] := '{}';
  breakdown jsonb;
  absence_pct numeric;
  result_code text;
  title_text text;
  key_fail boolean;
  key_cause_failure boolean;
begin
  if actor is null or not private.is_aal2() or not private.has_permission(target_school_id, 'assessment.grades.manage') then
    raise exception using errcode = '42501', message = 'Sem autorização para construir pauta.';
  end if;
  if sheet_kind not in ('term', 'annual') then
    raise exception using errcode = '22023', message = 'Tipo de pauta inválido.';
  end if;

  select * into group_row from public.class_groups
  where school_id = target_school_id and id = target_class_group_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Turma não encontrada.';
  end if;

  if sheet_kind = 'term' then
    select * into term_row from public.terms where school_id = target_school_id and id = target_term_id;
    if not found then
      raise exception using errcode = 'P0002', message = 'Período não encontrado.';
    end if;
    title_text := 'Pauta ' || term_row.name || ' · ' || group_row.code;
  else
    title_text := 'Pauta final anual · ' || group_row.code;
  end if;

  select * into active_rule from public.assessment_rule_sets
  where school_id = target_school_id and status = 'active' and code = 'DEFAULT'
  order by version desc limit 1;
  if not found then
    raise exception using errcode = '55000', message = 'Regra de avaliação ativa em falta.';
  end if;
  key_cause_failure := coalesce((active_rule.formula->>'keySubjectsCauseFailure')::boolean, true);

  if sheet_kind = 'term' then
    select id into sheet_id from public.grade_sheets
    where school_id = target_school_id and class_group_id = target_class_group_id and term_id = target_term_id and kind = 'term';
  else
    select id into sheet_id from public.grade_sheets
    where school_id = target_school_id and class_group_id = target_class_group_id and academic_year_id = group_row.academic_year_id and kind = 'annual';
  end if;

  if sheet_id is null then
    insert into public.grade_sheets (
      school_id, academic_year_id, term_id, class_group_id, rule_set_id, kind, status, title, created_by, updated_by
    ) values (
      target_school_id, group_row.academic_year_id,
      case when sheet_kind = 'term' then term_row.id else null end,
      group_row.id, active_rule.id, sheet_kind, 'draft', title_text, actor, actor
    ) returning id into sheet_id;
  end if;

  -- Versões da pauta: antes de refazer as linhas de uma pauta já homologada
  -- ou publicada, guardar a versão oficial (função com privilégios próprios,
  -- porque esta corre com o utilizador e a tabela de versões é só do servidor).
  perform private.archive_grade_sheet_version(target_school_id, sheet_id, actor);

  update public.grade_sheets
  set status = 'draft', updated_by = actor, updated_at = now(), title = title_text, rule_set_id = active_rule.id
  where school_id = target_school_id and id = sheet_id and status not in ('published', 'closed');

  delete from public.grade_sheet_rows
  where school_id = target_school_id and grade_sheet_id = sheet_id;

  for enrollment_row in
    select id from public.enrollments
    where school_id = target_school_id and class_group_id = target_class_group_id and status in ('pending', 'active')
  loop
    continuous_values := '{}';
    exam_values := '{}';
    average_values := '{}';
    breakdown := '[]'::jsonb;
    key_fail := false;

    for book_row in
      select gb.id, sub.name as subject_name, sub.id as subject_id
      from public.gradebooks gb
      join public.class_subjects cs on cs.school_id = gb.school_id and cs.id = gb.class_subject_id
      join public.subjects sub on sub.school_id = cs.school_id and sub.id = cs.subject_id
      where gb.school_id = target_school_id
        and gb.class_group_id = target_class_group_id
        and (
          (sheet_kind = 'term' and gb.term_id = target_term_id)
          or (sheet_kind = 'annual')
        )
    loop
      averages := private.compute_subject_averages(target_school_id, book_row.id, enrollment_row.id);
      if averages->>'average' is not null then
        continuous_values := array_append(continuous_values, nullif(averages->>'continuous', '')::numeric);
        exam_values := array_append(exam_values, nullif(averages->>'exam', '')::numeric);
        average_values := array_append(average_values, (averages->>'average')::numeric);
        breakdown := breakdown || jsonb_build_array(jsonb_build_object(
          'subject', book_row.subject_name,
          'subjectId', book_row.subject_id,
          'continuous', averages->'continuous',
          'exam', averages->'exam',
          'average', averages->'average',
          'isKeySubject', exists (
            select 1 from public.assessment_key_subjects aks
            where aks.school_id = target_school_id and aks.rule_set_id = active_rule.id and aks.subject_id = book_row.subject_id
          )
        ));
        if key_cause_failure and exists (
          select 1 from public.assessment_key_subjects aks
          where aks.school_id = target_school_id and aks.rule_set_id = active_rule.id and aks.subject_id = book_row.subject_id
        ) and (averages->>'average')::numeric < active_rule.passing_value then
          key_fail := true;
        end if;
      end if;
    end loop;

    select coalesce(
      (
        select (count(*) filter (where sr.status = 'absent')::numeric * 100)
               / nullif(count(*), 0)
        from public.siga_attendance_records sr
        join public.siga_attendance_sessions ss on ss.school_id = sr.school_id and ss.id = sr.session_id
        join public.enrollments en on en.school_id = sr.school_id and en.student_id = sr.student_id
        where sr.school_id = target_school_id
          and en.id = enrollment_row.id
          and ss.class_group_id = target_class_group_id
          and sr.status <> 'excused'
      ),
      (
        select (count(*) filter (where ar.status in ('absent'))::numeric * 100)
               / nullif(count(*), 0)
        from public.attendance_records ar
        join public.attendance_sessions sess on sess.school_id = ar.school_id and sess.id = ar.attendance_session_id
        join public.class_subjects cs on cs.school_id = sess.school_id and cs.id = sess.class_subject_id
        where ar.school_id = target_school_id
          and ar.enrollment_id = enrollment_row.id
          and cs.class_group_id = target_class_group_id
          and ar.status <> 'excused'
      ),
      0
    ) into absence_pct;

    result_code := case
      when cardinality(average_values) = 0 then 'incomplete'
      when absence_pct > active_rule.maximum_absence_percentage then 'fail'
      when key_fail then 'fail'
      when (select avg(value) from unnest(average_values) as value) >= active_rule.passing_value then 'pass'
      else 'fail'
    end;

    insert into public.grade_sheet_rows (
      school_id, grade_sheet_id, enrollment_id, continuous_average, exam_average, term_average,
      absence_percentage, result, subject_breakdown
    ) values (
      target_school_id, sheet_id, enrollment_row.id,
      (select avg(value) from unnest(continuous_values) as value where value is not null),
      (select avg(value) from unnest(exam_values) as value where value is not null),
      (select avg(value) from unnest(average_values) as value),
      absence_pct, result_code, breakdown
    );
  end loop;

  return jsonb_build_object('gradeSheetId', sheet_id, 'kind', sheet_kind, 'status', 'draft', 'ruleSetId', active_rule.id);
end;
$function$;
