-- Migration: 20260908210000_capture_all_db_functions
-- Objetivo: Capturar em versionamento todas as funções private.* e public.*
--   que existem na BD ao vivo mas nunca foram registadas em supabase/migrations/
-- Metodologia: CREATE OR REPLACE FUNCTION — 100% idempotente
-- NUNCA executar via Lovable. Usar: npm run siga:sql (colar no SQL Editor do SGA)
-- Gerado automaticamente em 2026-09-08 por auditoria pg_get_functiondef

-- ═══════════════════════════════════════════════════════════════════════════
-- SCHEMA: private  (funções internas — triggers, guards, helpers RBAC)
-- ═══════════════════════════════════════════════════════════════════════════


-- ── private ──────────────────────────────────────────────────────────────

-- private.act_on_document_signature
CREATE OR REPLACE FUNCTION private.act_on_document_signature(target_school_id uuid, target_signature_id uuid, next_status text, note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  sig public.document_signatures%rowtype;
begin
  if actor is null or not private.is_aal2() or not private.has_permission(target_school_id, 'documents.signatures.sign') then
    raise exception using errcode = '42501', message = 'Sem autorização para assinar documento.';
  end if;
  if next_status not in ('signed', 'rejected') then
    raise exception using errcode = '22023', message = 'Estado de assinatura inválido.';
  end if;

  select * into sig from public.document_signatures
  where school_id = target_school_id and id = target_signature_id and status = 'pending'
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'Pedido de assinatura indisponível.';
  end if;

  update public.document_signatures
  set status = next_status, acted_by = actor, acted_at = now(),
      note = coalesce(nullif(btrim(coalesce(note, '')), ''), note)
  where school_id = target_school_id and id = target_signature_id;

  update public.issued_documents
  set signature_status = next_status,
      signed_at = case when next_status = 'signed' then now() else null end,
      signed_by = case when next_status = 'signed' then actor else null end,
      signature_note = nullif(btrim(coalesce(note, '')), '')
  where school_id = target_school_id and id = sig.issued_document_id;

  return jsonb_build_object('signatureId', target_signature_id, 'status', next_status);
end;
$function$;

-- private.add_student_case_item
CREATE OR REPLACE FUNCTION private.add_student_case_item(target_school_id uuid, target_case_id uuid, item_kind text, target_request_id uuid DEFAULT NULL::uuid, target_issued_document_id uuid DEFAULT NULL::uuid, note_text text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  item_id uuid;
begin
  if actor is null or not private.is_aal2() or not private.has_permission(target_school_id, 'documents.cases.manage') then
    raise exception using errcode = '42501', message = 'Sem autorização para actualizar processo.';
  end if;
  if not exists (select 1 from public.student_cases where school_id = target_school_id and id = target_case_id and status not in ('closed', 'archived')) then
    raise exception using errcode = '22023', message = 'Processo fechado ou inexistente.';
  end if;

  insert into public.student_case_items (
    school_id, case_id, item_kind, request_id, issued_document_id, note_text, created_by
  ) values (
    target_school_id, target_case_id, item_kind, target_request_id, target_issued_document_id,
    nullif(btrim(coalesce(note_text, '')), ''), actor
  ) returning id into item_id;

  update public.student_cases set updated_at = now() where school_id = target_school_id and id = target_case_id;
  return jsonb_build_object('itemId', item_id, 'itemKind', item_kind);
end;
$function$;

-- private.archive_school_record
CREATE OR REPLACE FUNCTION private.archive_school_record(target_school_id uuid, title text, classification text DEFAULT 'geral'::text, target_student_id uuid DEFAULT NULL::uuid, target_issued_document_id uuid DEFAULT NULL::uuid, target_case_id uuid DEFAULT NULL::uuid, retention_until date DEFAULT NULL::date, notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  archive_id uuid;
  reference text;
  record_type text := 'manual';
begin
  if actor is null or not private.is_aal2() or not private.has_permission(target_school_id, 'documents.archive.manage') then
    raise exception using errcode = '42501', message = 'Sem autorização para arquivar.';
  end if;

  if target_issued_document_id is not null then
    record_type := 'issued_document';
    update public.issued_documents
    set archived_at = now(), archived_by = actor
    where school_id = target_school_id and id = target_issued_document_id and archived_at is null;
  elsif target_case_id is not null then
    record_type := 'case';
  end if;

  reference := private.next_document_number(target_school_id, 'other', 'ARQ');
  insert into public.school_archive_records (
    school_id, student_id, issued_document_id, case_id, record_type, classification,
    title, reference_code, retention_until, status, notes, created_by
  ) values (
    target_school_id, target_student_id, target_issued_document_id, target_case_id, record_type,
    btrim(coalesce(classification, 'geral')), btrim(title), reference, retention_until, 'archived',
    nullif(btrim(coalesce(notes, '')), ''), actor
  ) returning id into archive_id;

  return jsonb_build_object('archiveId', archive_id, 'referenceCode', reference, 'status', 'archived');
end;
$function$;

-- private.assign_school_role
CREATE OR REPLACE FUNCTION private.assign_school_role(target_school_id uuid, target_membership_id uuid, role_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  role_id uuid;
  normalized text := lower(btrim(role_code));
begin
  if actor is null or not private.is_aal2() or not private.has_permission(target_school_id, 'rbac.memberships.manage') then
    raise exception using errcode = '42501', message = 'Sem autorização para atribuir funções.';
  end if;
  if normalized in ('owner') then
    raise exception using errcode = '22023', message = 'A função owner só pode ser atribuída pelo instalador.';
  end if;
  if not exists (
    select 1 from public.school_memberships
    where school_id = target_school_id and id = target_membership_id and status = 'active'
  ) then
    raise exception using errcode = '22023', message = 'Membership activa não encontrada.';
  end if;

  select id into role_id from public.roles
  where school_id = target_school_id and code = normalized;
  if role_id is null then
    raise exception using errcode = '22023', message = 'Função inexistente nesta escola.';
  end if;

  insert into public.member_roles (school_id, membership_id, role_id)
  values (target_school_id, target_membership_id, role_id)
  on conflict do nothing;

  return jsonb_build_object('membershipId', target_membership_id, 'roleCode', normalized, 'status', 'assigned');
end;
$function$;

-- private.audit_row_change
CREATE OR REPLACE FUNCTION private.audit_row_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  row_before jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else '{}'::jsonb end;
  row_after jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else '{}'::jsonb end;
  source_row jsonb := case when tg_op = 'DELETE' then row_before else row_after end;
  target_school_id uuid;
  target_entity_id uuid;
  changed_fields jsonb := '[]'::jsonb;
begin
  if tg_table_name = 'schools' then
    target_school_id := (source_row->>'id')::uuid;
  else
    target_school_id := (source_row->>'school_id')::uuid;
  end if;

  if coalesce(source_row->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    target_entity_id := (source_row->>'id')::uuid;
  end if;

  if tg_op = 'UPDATE' then
    select coalesce(jsonb_agg(key order by key), '[]'::jsonb)
      into changed_fields
    from jsonb_each(row_after) item
    where (row_before -> item.key) is distinct from item.value;
  end if;

  insert into public.audit_logs (
    school_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    target_school_id,
    (select auth.uid()),
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    target_entity_id,
    jsonb_build_object('operation', lower(tg_op), 'changed_fields', changed_fields)
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

-- private.batch_issue_school_documents
CREATE OR REPLACE FUNCTION private.batch_issue_school_documents(target_school_id uuid, target_template_id uuid, target_student_ids uuid[], requires_signature boolean DEFAULT false, title text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  template public.document_templates%rowtype;
  student_id uuid;
  rendered text;
  result jsonb;
  issued jsonb := '[]'::jsonb;
  failures jsonb := '[]'::jsonb;
begin
  if actor is null or not private.is_aal2() or not private.has_permission(target_school_id, 'documents.batch.issue') then
    raise exception using errcode = '42501', message = 'Sem autorização para emissão em lote.';
  end if;
  if target_student_ids is null or cardinality(target_student_ids) = 0 then
    raise exception using errcode = '22023', message = 'Seleccione pelo menos um estudante.';
  end if;
  if cardinality(target_student_ids) > 200 then
    raise exception using errcode = '22023', message = 'Lote máximo: 200 estudantes.';
  end if;

  select * into template from public.document_templates
  where school_id = target_school_id and id = target_template_id and status = 'active';
  if not found then
    raise exception using errcode = '22023', message = 'Modelo activo não encontrado.';
  end if;

  foreach student_id in array target_student_ids loop
    begin
      rendered := private.render_document_placeholders(target_school_id, student_id, template.body_template);
      result := private.issue_school_document(
        target_school_id, student_id, target_template_id, rendered, null,
        coalesce(nullif(btrim(coalesce(title, '')), ''), template.name)
      );
      if requires_signature then
        update public.issued_documents
        set requires_signature = true, signature_status = 'pending'
        where school_id = target_school_id and id = (result->>'documentId')::uuid;
      end if;
      issued := issued || jsonb_build_array(result);
    exception when others then
      failures := failures || jsonb_build_array(jsonb_build_object(
        'studentId', student_id, 'error', SQLERRM
      ));
    end;
  end loop;

  return jsonb_build_object(
    'issuedCount', jsonb_array_length(issued),
    'failureCount', jsonb_array_length(failures),
    'issued', issued,
    'failures', failures
  );
end;
$function$;

-- private.build_grade_sheet
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
        select (count(*) filter (where ar.status in ('absent'))::numeric * 100)
               / nullif(count(*), 0)
        from public.attendance_records ar
        join public.attendance_sessions sess on sess.school_id = ar.school_id and sess.id = ar.attendance_session_id
        join public.class_subjects cs on cs.school_id = sess.school_id and cs.id = sess.class_subject_id
        where ar.school_id = target_school_id
          and ar.enrollment_id = enrollment_row.id
          and cs.class_group_id = target_class_group_id
          and ar.status <> 'excused'
      ), 0
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

-- private.can_access_portal_student
CREATE OR REPLACE FUNCTION private.can_access_portal_student(target_school_id uuid, target_student_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.is_portal_guardian_of(target_school_id, target_student_id)
      or private.is_portal_student_of(target_school_id, target_student_id);
$function$;

-- private.cancel_invoice
CREATE OR REPLACE FUNCTION private.cancel_invoice(target_school_id uuid, target_invoice_id uuid, target_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  selected_invoice public.finance_invoices%rowtype;
begin
  if (select auth.uid()) is null or not private.is_aal2()
     or not private.has_permission(target_school_id, 'finance.invoices.cancel') then
    raise exception using errcode = '42501', message = 'Sem autorização para cancelar faturas.';
  end if;
  if target_reason is null or char_length(btrim(target_reason)) < 5 then
    raise exception using errcode = '22023', message = 'Indique o motivo do cancelamento.';
  end if;

  select * into selected_invoice from public.finance_invoices
  where school_id = target_school_id and id = target_invoice_id and status <> 'cancelled'
  for update;
  if selected_invoice.id is null then
    raise exception using errcode = '22023', message = 'Fatura inválida ou já cancelada.';
  end if;
  if exists (
    select 1 from public.finance_receipts
    where school_id = target_school_id and invoice_id = target_invoice_id and status = 'issued'
  ) then
    raise exception using errcode = '22023', message = 'Não é possível cancelar uma fatura com recibos emitidos.';
  end if;

  update public.finance_invoices
  set status = 'cancelled', cancelled_at = now(), cancelled_by = (select auth.uid()), cancellation_reason = btrim(target_reason)
  where school_id = target_school_id and id = target_invoice_id;

  return jsonb_build_object('invoiceId', target_invoice_id, 'status', 'cancelled');
end;
$function$;

-- private.capture_attendance_session_roster
CREATE OR REPLACE FUNCTION private.capture_attendance_session_roster()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  insert into public.attendance_session_roster (
    school_id, attendance_session_id, enrollment_id
  )
  select new.school_id, new.id, enrollment.id
  from public.class_subjects assignment
  join public.enrollments enrollment
    on enrollment.school_id = assignment.school_id
   and enrollment.class_group_id = assignment.class_group_id
   and enrollment.status = 'active'
  where assignment.school_id = new.school_id
    and assignment.id = new.class_subject_id
  on conflict (school_id, attendance_session_id, enrollment_id) do nothing;
  return new;
end;
$function$;

-- private.close_gradebook
CREATE OR REPLACE FUNCTION private.close_gradebook(target_school_id uuid, target_gradebook_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null or not private.is_aal2() or not private.has_permission(target_school_id, 'assessment.grades.homologate') then
    raise exception using errcode = '42501', message = 'Sem autorização para encerrar o diário.';
  end if;
  if exists (
    select 1 from public.grade_scores scores
    join public.grade_items items on items.school_id = scores.school_id and items.id = scores.grade_item_id
    where items.school_id = target_school_id and items.gradebook_id = target_gradebook_id and scores.pending_score is not null
  ) then
    raise exception using errcode = '22023', message = 'Existem alterações de nota pendentes de aprovação.';
  end if;
  update public.gradebooks
  set status = 'closed', closed_at = now(), updated_by = actor, updated_at = now()
  where school_id = target_school_id and id = target_gradebook_id and status in ('submitted', 'open');
  if not found then
    raise exception using errcode = '22023', message = 'Diário não pode ser encerrado no estado atual.';
  end if;
  update public.grade_scores scores
  set status = 'locked', updated_by = actor, updated_at = now()
  from public.grade_items items
  where items.school_id = target_school_id and items.gradebook_id = target_gradebook_id
    and scores.school_id = items.school_id and scores.grade_item_id = items.id;
  return jsonb_build_object('gradebookId', target_gradebook_id, 'status', 'closed');
end;
$function$;

-- private.compute_subject_averages
CREATE OR REPLACE FUNCTION private.compute_subject_averages(target_school_id uuid, target_gradebook_id uuid, target_enrollment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  book public.gradebooks%rowtype;
  rule public.assessment_rule_sets%rowtype;
  scale public.grading_scales%rowtype;
  continuous_avg numeric;
  exam_avg numeric;
  final_avg numeric;
begin
  select * into book from public.gradebooks where school_id = target_school_id and id = target_gradebook_id;
  select * into rule from public.assessment_rule_sets where school_id = target_school_id and id = book.rule_set_id;
  select * into scale from public.grading_scales where school_id = target_school_id and id = rule.grading_scale_id;

  select case when sum(items.weight) = 0 then null
    else sum(scores.score * items.weight) / nullif(sum(items.weight), 0) end
  into continuous_avg
  from public.grade_items items
  join public.grade_scores scores
    on scores.school_id = items.school_id and scores.grade_item_id = items.id
  where items.school_id = target_school_id
    and items.gradebook_id = target_gradebook_id
    and scores.enrollment_id = target_enrollment_id
    and items.kind in ('continuous', 'assignment', 'test', 'recovery');

  select case when sum(items.weight) = 0 then null
    else sum(scores.score * items.weight) / nullif(sum(items.weight), 0) end
  into exam_avg
  from public.grade_items items
  join public.grade_scores scores
    on scores.school_id = items.school_id and scores.grade_item_id = items.id
  where items.school_id = target_school_id
    and items.gradebook_id = target_gradebook_id
    and scores.enrollment_id = target_enrollment_id
    and items.kind in ('term_exam', 'exam', 'resit');

  if continuous_avg is null and exam_avg is null then
    return jsonb_build_object('continuous', null, 'exam', null, 'average', null);
  end if;

  final_avg := (
    coalesce(continuous_avg, 0) * rule.continuous_weight
    + coalesce(exam_avg, 0) * rule.exam_weight
  ) / 100.0;

  return jsonb_build_object(
    'continuous', private.round_grade(continuous_avg, rule.rounding_method, scale.decimal_places),
    'exam', private.round_grade(exam_avg, rule.rounding_method, scale.decimal_places),
    'average', private.round_grade(final_avg, rule.rounding_method, scale.decimal_places)
  );
end;
$function$;

-- private.configure_academic_structure
CREATE OR REPLACE FUNCTION private.configure_academic_structure(target_school_id uuid, education_level_codes text[], program_code text, program_name text, grade_code text, grade_name text, academic_year_name text, year_starts_on date, year_ends_on date, period_model text, grade_minimum numeric, grade_maximum numeric, grade_passing numeric, grade_decimals smallint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  installation_id uuid;
  first_level_id uuid;
  configured_program_id uuid;
  configured_year_id uuid;
  period_count integer;
  total_days integer;
  period_number integer;
  period_starts date;
  period_ends date;
begin
  if (select auth.uid()) is null or not private.is_aal2() or not private.has_permission(target_school_id, 'installer.runs.update') then
    raise exception using errcode = '42501', message = 'Sem autorização para configurar a estrutura académica.';
  end if;

  select id into installation_id from public.installation_runs
  where school_id = target_school_id and status = 'in_progress' and current_step >= 6 for update;
  if installation_id is null then
    raise exception using errcode = '55000', message = 'A instalação não está pronta para a estrutura académica.';
  end if;

  if coalesce(array_length(education_level_codes, 1), 0) = 0
     or exists (select 1 from unnest(education_level_codes) code where code <> all(array['initiation','primary','cycle_i','cycle_ii','technical_secondary','professional','undergraduate','postgraduate']))
     or btrim(program_code) !~ '^[A-Za-z0-9_-]{2,20}$'
     or char_length(btrim(program_name)) not between 2 and 160
     or btrim(grade_code) !~ '^[A-Za-z0-9_-]{1,20}$'
     or char_length(btrim(grade_name)) not between 1 and 120
     or char_length(btrim(academic_year_name)) not between 4 and 40
     or year_ends_on <= year_starts_on
     or period_model not in ('trimester','semester')
     or grade_minimum < 0 or grade_maximum <= grade_minimum or grade_passing <= grade_minimum or grade_passing > grade_maximum
     or grade_decimals not between 0 and 2 then
    raise exception using errcode = '22023', message = 'Estrutura académica inicial inválida.';
  end if;

  insert into public.academic_levels (school_id, code, name, sequence)
  select target_school_id, item.code,
    case item.code when 'initiation' then 'Iniciação' when 'primary' then 'Ensino Primário' when 'cycle_i' then 'I Ciclo' when 'cycle_ii' then 'II Ciclo' when 'technical_secondary' then 'Ensino Médio Técnico' when 'professional' then 'Formação Profissional' when 'undergraduate' then 'Licenciatura' else 'Pós-Graduação' end,
    item.ordinality::smallint
  from unnest(education_level_codes) with ordinality item(code, ordinality)
  on conflict (school_id, code) do update set is_active = true, sequence = excluded.sequence;

  select id into first_level_id from public.academic_levels where school_id = target_school_id and code = education_level_codes[1];
  insert into public.programs (school_id, academic_level_id, code, name)
  values (target_school_id, first_level_id, upper(btrim(program_code)), btrim(program_name))
  on conflict (school_id, code) do update set academic_level_id = excluded.academic_level_id, name = excluded.name, is_active = true
  returning id into configured_program_id;

  insert into public.grade_levels (school_id, program_id, code, name)
  values (target_school_id, configured_program_id, upper(btrim(grade_code)), btrim(grade_name))
  on conflict (school_id, program_id, code) do update set name = excluded.name, is_active = true;

  insert into public.academic_years (school_id, name, starts_on, ends_on, status)
  values (target_school_id, btrim(academic_year_name), year_starts_on, year_ends_on, 'active')
  on conflict (school_id, name) do update set starts_on = excluded.starts_on, ends_on = excluded.ends_on, status = 'active'
  returning id into configured_year_id;

  period_count := case when period_model = 'trimester' then 3 else 2 end;
  total_days := year_ends_on - year_starts_on + 1;
  for period_number in 1..period_count loop
    period_starts := year_starts_on + floor(((period_number - 1) * total_days)::numeric / period_count)::integer;
    period_ends := year_starts_on + floor((period_number * total_days)::numeric / period_count)::integer - 1;
    insert into public.terms (school_id, academic_year_id, name, sequence, starts_on, ends_on)
    values (target_school_id, configured_year_id, period_number || case when period_model = 'trimester' then '.º Trimestre' else '.º Semestre' end, period_number, period_starts, period_ends)
    on conflict (school_id, academic_year_id, sequence) do update set name = excluded.name, starts_on = excluded.starts_on, ends_on = excluded.ends_on;
  end loop;

  insert into public.grading_scales (school_id, code, name, minimum_value, maximum_value, passing_value, decimal_places)
  values (target_school_id, 'DEFAULT', 'Escala principal', grade_minimum, grade_maximum, grade_passing, grade_decimals)
  on conflict (school_id, code, version) do update set minimum_value = excluded.minimum_value, maximum_value = excluded.maximum_value, passing_value = excluded.passing_value, decimal_places = excluded.decimal_places, is_active = true;

  update public.installation_runs
  set current_step = greatest(current_step, 7), draft = draft || jsonb_build_object('academicStructure', jsonb_build_object('configuredAt', clock_timestamp(), 'academicYearId', configured_year_id, 'programId', configured_program_id)), updated_at = now()
  where id = installation_id;

  return jsonb_build_object('academicYearId', configured_year_id, 'programId', configured_program_id, 'currentStep', 7);
end;
$function$;

-- private.configure_assessment_rules
CREATE OR REPLACE FUNCTION private.configure_assessment_rules(target_school_id uuid, continuous_weight_value numeric, exam_weight_value numeric, passing_grade_value numeric, maximum_absence_value numeric, rounding_method_value text, require_change_approval boolean, lock_after_publication_value boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  installation_id uuid;
  active_scale public.grading_scales%rowtype;
  next_version integer;
  configured_rule_id uuid;
begin
  if (select auth.uid()) is null or not private.is_aal2() or not private.has_permission(target_school_id, 'installer.runs.update') then
    raise exception using errcode = '42501', message = 'Sem autorização para configurar regras de avaliação.';
  end if;

  select id into installation_id from public.installation_runs
  where school_id = target_school_id and status = 'in_progress' and current_step >= 7 for update;
  select * into active_scale from public.grading_scales
  where school_id = target_school_id and is_active order by version desc limit 1;

  if installation_id is null or active_scale.id is null then
    raise exception using errcode = '55000', message = 'A instalação ou a escala de notas não está pronta.';
  end if;
  if continuous_weight_value < 0 or exam_weight_value < 0 or continuous_weight_value + exam_weight_value <> 100
     or passing_grade_value <= active_scale.minimum_value or passing_grade_value > active_scale.maximum_value
     or maximum_absence_value < 0 or maximum_absence_value > 100
     or rounding_method_value not in ('none','nearest','up','down') then
    raise exception using errcode = '22023', message = 'Regras de avaliação inválidas.';
  end if;

  select coalesce(max(version), 0) + 1 into next_version
  from public.assessment_rule_sets where school_id = target_school_id and code = 'DEFAULT';
  update public.assessment_rule_sets set status = 'retired'
  where school_id = target_school_id and code = 'DEFAULT' and status = 'active';

  insert into public.assessment_rule_sets (
    school_id, grading_scale_id, code, name, version, status, continuous_weight, exam_weight,
    passing_value, maximum_absence_percentage, rounding_method, grade_change_requires_approval,
    lock_after_publication, formula, created_by
  ) values (
    target_school_id, active_scale.id, 'DEFAULT', 'Regra principal de avaliação', next_version, 'active',
    continuous_weight_value, exam_weight_value, passing_grade_value, maximum_absence_value,
    rounding_method_value, require_change_approval, lock_after_publication_value,
    jsonb_build_object('operation','weighted_average','components',jsonb_build_array(
      jsonb_build_object('code','continuous','weight',continuous_weight_value),
      jsonb_build_object('code','exam','weight',exam_weight_value)
    )), (select auth.uid())
  ) returning id into configured_rule_id;

  update public.installation_runs
  set current_step = greatest(current_step, 8), draft = draft || jsonb_build_object('assessmentRules', jsonb_build_object('configuredAt', clock_timestamp(), 'ruleSetId', configured_rule_id, 'version', next_version)), updated_at = now()
  where id = installation_id;

  return jsonb_build_object('ruleSetId', configured_rule_id, 'version', next_version, 'currentStep', 8);
end;
$function$;

-- private.configure_class_subject
CREATE OR REPLACE FUNCTION private.configure_class_subject(target_school_id uuid, target_class_group_id uuid, target_subject_id uuid, target_teacher_id uuid, target_weekly_periods integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  configured_id uuid;
begin
  if (select auth.uid()) is null or not private.is_aal2()
     or not private.has_permission(target_school_id, 'academic.timetable.manage') then
    raise exception using errcode = '42501', message = 'Sem autorização para configurar a distribuição docente.';
  end if;
  if target_weekly_periods not between 1 and 30
     or not exists (
       select 1 from public.class_groups
       where school_id = target_school_id and id = target_class_group_id and status = 'active'
     )
     or not exists (
       select 1 from public.subjects
       where school_id = target_school_id and id = target_subject_id and status = 'active'
     )
     or not exists (
       select 1 from public.teachers
       where school_id = target_school_id and id = target_teacher_id and status = 'active'
     )
     or not exists (
       select 1 from public.teacher_subjects
       where school_id = target_school_id and teacher_id = target_teacher_id
         and subject_id = target_subject_id and valid_until is null
     ) then
    raise exception using errcode = '22023', message = 'Turma, disciplina ou habilitação docente inválida.';
  end if;

  insert into public.class_subjects (
    school_id, class_group_id, subject_id, teacher_id, weekly_periods, created_by, updated_by
  ) values (
    target_school_id, target_class_group_id, target_subject_id, target_teacher_id,
    target_weekly_periods::smallint, (select auth.uid()), (select auth.uid())
  )
  on conflict (school_id, class_group_id, subject_id) do update
  set teacher_id = excluded.teacher_id, weekly_periods = excluded.weekly_periods,
      status = 'active', updated_by = excluded.updated_by, updated_at = now()
  returning id into configured_id;

  return jsonb_build_object('classSubjectId', configured_id, 'weeklyPeriods', target_weekly_periods);
end;
$function$;

-- private.configure_default_modules
CREATE OR REPLACE FUNCTION private.configure_default_modules(target_school_id uuid, requested_module_codes text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  installation_id uuid;
  installed_count integer;
begin
  if (select auth.uid()) is null or not private.is_aal2() or not private.has_permission(target_school_id, 'installer.runs.update') then
    raise exception using errcode = '42501', message = 'Sem autorização para instalar módulos.';
  end if;
  select id into installation_id from public.installation_runs
  where school_id = target_school_id and status = 'in_progress' and current_step >= 9 for update;
  if installation_id is null then
    raise exception using errcode = '55000', message = 'A instalação não está pronta para selecionar módulos.';
  end if;
  if coalesce(array_length(requested_module_codes, 1), 0) = 0
     or exists (select 1 from unnest(requested_module_codes) as requested(code) left join public.module_catalog m on m.code = requested.code where m.code is null)
     or exists (select 1 from public.module_catalog m where m.is_essential and not m.code = any(requested_module_codes))
     or exists (
       select 1 from public.module_catalog m
       cross join lateral jsonb_array_elements_text(m.manifest->'dependencies') dependency
       where m.code = any(requested_module_codes) and not dependency = any(requested_module_codes)
     ) then
    raise exception using errcode = '22023', message = 'Seleção de módulos inválida ou com dependências em falta.';
  end if;

  insert into public.school_modules (school_id, module_code, installed_version, status, installed_by)
  select target_school_id, m.code, m.version, 'active', (select auth.uid())
  from public.module_catalog m where m.code = any(requested_module_codes)
  on conflict (school_id, module_code) do update
    set installed_version = excluded.installed_version, status = 'active', updated_at = now();
  get diagnostics installed_count = row_count;

  update public.school_modules sm set status = 'disabled', updated_at = now()
  where sm.school_id = target_school_id and not sm.module_code = any(requested_module_codes)
    and exists (select 1 from public.module_catalog m where m.code = sm.module_code and not m.is_essential);

  update public.installation_runs
  set current_step = greatest(current_step, 10), draft = draft || jsonb_build_object('modules', jsonb_build_object('configuredAt', clock_timestamp(), 'codes', to_jsonb(requested_module_codes))), updated_at = now()
  where id = installation_id;
  return jsonb_build_object('installedCount', installed_count, 'currentStep', 10);
end;
$function$;

-- private.configure_financial_plan
CREATE OR REPLACE FUNCTION private.configure_financial_plan(target_school_id uuid, enrollment_amount_value numeric, tuition_amount_value numeric, due_day_value smallint, penalty_kind_value text, penalty_value numeric, maximum_discount_value numeric, invoice_prefix_value text, receipt_prefix_value text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  installation_id uuid;
  active_year_id uuid;
  configured_plan_id uuid;
  next_version integer;
begin
  if (select auth.uid()) is null or not private.is_aal2() or not private.has_permission(target_school_id, 'installer.runs.update') then
    raise exception using errcode = '42501', message = 'Sem autorização para configurar o plano financeiro.';
  end if;
  select id into installation_id from public.installation_runs
  where school_id = target_school_id and status = 'in_progress' and current_step >= 8 for update;
  select id into active_year_id from public.academic_years
  where school_id = target_school_id and status = 'active' order by starts_on desc limit 1;
  if installation_id is null or active_year_id is null then
    raise exception using errcode = '55000', message = 'A instalação ou o ano letivo não está pronto para o financeiro.';
  end if;
  if enrollment_amount_value < 0 or tuition_amount_value < 0 or enrollment_amount_value + tuition_amount_value <= 0
     or due_day_value not between 1 and 28 or penalty_kind_value not in ('none','fixed','percentage')
     or penalty_value < 0 or (penalty_kind_value = 'percentage' and penalty_value > 100)
     or (penalty_kind_value = 'none' and penalty_value <> 0)
     or maximum_discount_value not between 0 and 100
     or upper(btrim(invoice_prefix_value)) !~ '^[A-Z0-9-]{2,10}$'
     or upper(btrim(receipt_prefix_value)) !~ '^[A-Z0-9-]{2,10}$'
     or upper(btrim(invoice_prefix_value)) = upper(btrim(receipt_prefix_value)) then
    raise exception using errcode = '22023', message = 'Configuração financeira inválida.';
  end if;

  select coalesce(max(version), 0) + 1 into next_version from public.financial_rule_sets
  where school_id = target_school_id and code = 'DEFAULT';
  update public.financial_rule_sets set status = 'retired'
  where school_id = target_school_id and code = 'DEFAULT' and status = 'active';
  insert into public.financial_rule_sets (school_id, code, version, status, monthly_due_day, late_penalty_kind, late_penalty_value, maximum_discount_percentage, created_by)
  values (target_school_id, 'DEFAULT', next_version, 'active', due_day_value, penalty_kind_value, penalty_value, maximum_discount_value, (select auth.uid()));

  insert into public.fee_plans (school_id, academic_year_id, code, name, status)
  values (target_school_id, active_year_id, 'DEFAULT', 'Plano financeiro principal', 'active')
  on conflict (school_id, code) do update set academic_year_id = excluded.academic_year_id, name = excluded.name, status = 'active'
  returning id into configured_plan_id;
  insert into public.fee_items (school_id, fee_plan_id, code, name, kind, amount, frequency) values
    (target_school_id, configured_plan_id, 'ENROLLMENT', 'Matrícula', 'enrollment', enrollment_amount_value, 'once'),
    (target_school_id, configured_plan_id, 'TUITION', 'Propina', 'tuition', tuition_amount_value, 'monthly')
  on conflict (school_id, fee_plan_id, code) do update set amount = excluded.amount, is_active = true;

  insert into public.document_sequences (school_id, document_type, prefix) values
    (target_school_id, 'invoice', upper(btrim(invoice_prefix_value))),
    (target_school_id, 'receipt', upper(btrim(receipt_prefix_value)))
  on conflict (school_id, document_type) do update set prefix = excluded.prefix, updated_at = now();

  update public.installation_runs
  set current_step = greatest(current_step, 9), draft = draft || jsonb_build_object('financialPlan', jsonb_build_object('configuredAt', clock_timestamp(), 'feePlanId', configured_plan_id, 'ruleVersion', next_version)), updated_at = now()
  where id = installation_id;
  return jsonb_build_object('feePlanId', configured_plan_id, 'ruleVersion', next_version, 'currentStep', 9);
end;
$function$;

-- private.configure_school_identity_campus
CREATE OR REPLACE FUNCTION private.configure_school_identity_campus(target_school_id uuid, primary_color text, secondary_color text, contrast_color text, school_logo_path text, campus_code text, campus_name text, campus_province text, campus_municipality text, campus_address text, official_reference text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  installation_id uuid;
  configured_campus_id uuid;
begin
  if (select auth.uid()) is null
     or not private.is_aal2()
     or not private.has_permission(target_school_id, 'installer.runs.update') then
    raise exception using errcode = '42501', message = 'Sem autorização para configurar a identidade da escola.';
  end if;

  select i.id into installation_id
  from public.installation_runs i
  where i.school_id = target_school_id and i.status = 'in_progress' and i.current_step >= 5
  for update;

  if installation_id is null then
    raise exception using errcode = '55000', message = 'A instalação não está pronta para configurar identidade e campus.';
  end if;

  if primary_color !~ '^#[0-9A-Fa-f]{6}$'
     or secondary_color !~ '^#[0-9A-Fa-f]{6}$'
     or contrast_color not in ('#000000', '#FFFFFF')
     or (school_logo_path is not null and school_logo_path !~ ('^' || target_school_id::text || '/identity/school/[A-Za-z0-9._-]+$'))
     or btrim(campus_code) !~ '^[A-Za-z0-9_-]{2,20}$'
     or char_length(btrim(campus_name)) not between 2 and 160
     or char_length(btrim(campus_province)) not between 2 and 100
     or char_length(btrim(campus_municipality)) not between 2 and 120
     or char_length(btrim(campus_address)) not between 5 and 300
     or char_length(btrim(official_reference)) not between 3 and 160 then
    raise exception using errcode = '22023', message = 'Identidade, campus ou referência oficial inválida.';
  end if;

  -- Revisitar a etapa sem escolher um novo ficheiro não deve apagar o logótipo já guardado.
  update public.schools
  set theme = theme || jsonb_build_object('primary', upper(primary_color), 'secondary', upper(secondary_color), 'primaryContrast', contrast_color),
      logo_path = coalesce(school_logo_path, logo_path),
      official_authorization_reference = btrim(official_reference),
      updated_at = now()
  where id = target_school_id;

  insert into public.campuses (school_id, code, name, province, municipality, address, is_active)
  values (target_school_id, upper(btrim(campus_code)), btrim(campus_name), btrim(campus_province), btrim(campus_municipality), btrim(campus_address), true)
  on conflict (school_id, code) do update
    set name = excluded.name, province = excluded.province, municipality = excluded.municipality, address = excluded.address, is_active = true
  returning id into configured_campus_id;

  update public.installation_runs
  set current_step = greatest(current_step, 6),
      draft = draft || jsonb_build_object('identityCampus', jsonb_build_object(
        'configuredAt', clock_timestamp(), 'campusId', configured_campus_id,
        'campusAddress', btrim(campus_address), 'officialReference', btrim(official_reference)
      )),
      updated_at = now()
  where id = installation_id;

  return jsonb_build_object('schoolId', target_school_id, 'campusId', configured_campus_id, 'currentStep', 6);
end;
$function$;

-- private.configure_school_owner
CREATE OR REPLACE FUNCTION private.configure_school_owner(target_school_id uuid, school_name text, school_nif text, school_email text, school_phone text, school_province text, school_municipality text, school_address text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  active_membership_id uuid;
  owner_role_id uuid;
  installation_id uuid;
begin
  if (select auth.uid()) is null
     or not private.is_aal2()
     or not private.has_permission(target_school_id, 'installer.runs.update') then
    raise exception using errcode = '42501', message = 'Sem autorização para configurar a escola proprietária.';
  end if;

  select m.id into active_membership_id
  from public.school_memberships m
  where m.school_id = target_school_id
    and m.user_id = (select auth.uid())
    and m.status = 'active'
  for update;

  select i.id into installation_id
  from public.installation_runs i
  where i.school_id = target_school_id
    and i.status = 'in_progress'
    and i.current_step >= 4
  for update;

  if active_membership_id is null or installation_id is null then
    raise exception using errcode = '55000', message = 'A instalação não está pronta para configurar a escola.';
  end if;

  if char_length(btrim(school_name)) not between 2 and 200
     or btrim(school_nif) !~ '^[A-Za-z0-9]{9,14}$'
     or btrim(school_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or btrim(school_phone) !~ '^\+?[0-9 ]{9,18}$'
     or school_province <> all(array['Bengo','Benguela','Bié','Cabinda','Cuando','Cuanza Norte','Cuanza Sul','Cubango','Cunene','Huambo','Huíla','Icolo e Bengo','Luanda','Lunda Norte','Lunda Sul','Malanje','Moxico','Moxico Leste','Namibe','Uíge','Zaire'])
     or char_length(btrim(school_municipality)) not between 2 and 120
     or char_length(btrim(school_address)) not between 5 and 300 then
    raise exception using errcode = '22023', message = 'Dados institucionais inválidos.';
  end if;

  update public.schools
  set name = btrim(school_name),
      nif = nullif(upper(btrim(school_nif)), ''),
      email = nullif(lower(btrim(school_email)), ''),
      phone = nullif(btrim(school_phone), ''),
      province = nullif(btrim(school_province), ''),
      municipality = nullif(btrim(school_municipality), ''),
      address = nullif(btrim(school_address), ''),
      status = 'setup',
      updated_at = now()
  where id = target_school_id;

  insert into public.roles (school_id, code, name, is_system)
  values (target_school_id, 'owner', 'Administrador proprietário', true)
  on conflict (school_id, code) do update
    set name = excluded.name, is_system = true
  returning id into owner_role_id;

  insert into public.role_permissions (school_id, role_id, permission_id)
  select target_school_id, owner_role_id, p.id
  from public.permissions p
  on conflict do nothing;

  insert into public.member_roles (school_id, membership_id, role_id)
  values (target_school_id, active_membership_id, owner_role_id)
  on conflict do nothing;

  update public.installation_runs
  set current_step = greatest(current_step, 5),
      draft = draft || jsonb_build_object('schoolOwner', jsonb_build_object('configuredAt', clock_timestamp(), 'membershipId', active_membership_id)),
      updated_at = now()
  where id = installation_id;

  return jsonb_build_object('schoolId', target_school_id, 'membershipId', active_membership_id, 'roleId', owner_role_id, 'currentStep', 5);
end;
$function$;

-- private.create_council_minutes
CREATE OR REPLACE FUNCTION private.create_council_minutes(target_school_id uuid, target_class_group_id uuid, target_academic_year_id uuid, minutes_title text, minutes_body text, target_term_id uuid DEFAULT NULL::uuid, decided_on date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  minutes_id uuid;
begin
  if actor is null or not private.is_aal2() or not private.has_permission(target_school_id, 'assessment.grades.homologate') then
    raise exception using errcode = '42501', message = 'Sem autorização para registar ata de conselho.';
  end if;

  insert into public.grade_council_minutes (
    school_id, class_group_id, term_id, academic_year_id, title, body, decided_on, created_by
  ) values (
    target_school_id, target_class_group_id, target_term_id, target_academic_year_id,
    btrim(minutes_title), btrim(minutes_body), decided_on, actor
  ) returning id into minutes_id;

  return jsonb_build_object('minutesId', minutes_id);
end;
$function$;

-- private.create_document_request
CREATE OR REPLACE FUNCTION private.create_document_request(target_school_id uuid, target_student_id uuid, request_type text, purpose text, target_template_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  request_id uuid;
begin
  if actor is null or not private.is_aal2() or not private.has_permission(target_school_id, 'documents.requests.manage') then
    raise exception using errcode = '42501', message = 'Sem autorização para criar pedido.';
  end if;
  insert into public.document_requests (
    school_id, student_id, template_id, request_type, purpose, requested_by
  ) values (
    target_school_id, target_student_id, target_template_id, request_type, btrim(purpose), actor
  ) returning id into request_id;
  return jsonb_build_object('requestId', request_id, 'status', 'submitted');
end;
$function$;

-- private.create_financial_contract
CREATE OR REPLACE FUNCTION private.create_financial_contract(target_school_id uuid, target_enrollment_id uuid, target_discount_percentage numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  selected_enrollment public.enrollments%rowtype;
  selected_year public.academic_years%rowtype;
  active_rules public.financial_rule_sets%rowtype;
  selected_fee_plan public.fee_plans%rowtype;
  enrollment_item public.fee_items%rowtype;
  tuition_item public.fee_items%rowtype;
  new_contract_id uuid;
  month_cursor date;
  generated_number text;
  invoice_amount numeric(18,2);
  invoice_discount numeric(18,2);
  invoices_created integer := 0;
begin
  if (select auth.uid()) is null or not private.is_aal2()
     or not private.has_permission(target_school_id, 'finance.contracts.create') then
    raise exception using errcode = '42501', message = 'Sem autorização para criar contratos financeiros.';
  end if;

  select * into selected_enrollment from public.enrollments
  where school_id = target_school_id and id = target_enrollment_id and status in ('pending', 'active')
  for update;
  if selected_enrollment.id is null then
    raise exception using errcode = '22023', message = 'Matrícula inválida ou inativa para esta escola.';
  end if;
  if exists (select 1 from public.finance_contracts where school_id = target_school_id and enrollment_id = target_enrollment_id) then
    raise exception using errcode = '23505', message = 'Esta matrícula já possui um contrato financeiro.';
  end if;

  select * into selected_year from public.academic_years
  where school_id = target_school_id and id = selected_enrollment.academic_year_id;
  select * into active_rules from public.financial_rule_sets
  where school_id = target_school_id and code = 'DEFAULT' and status = 'active';
  select * into selected_fee_plan from public.fee_plans
  where school_id = target_school_id and academic_year_id = selected_enrollment.academic_year_id and status = 'active'
  order by created_at desc limit 1;
  if selected_year.id is null or active_rules.id is null or selected_fee_plan.id is null then
    raise exception using errcode = '55000', message = 'Plano financeiro não está configurado para o ano letivo desta matrícula.';
  end if;
  if target_discount_percentage < 0 or target_discount_percentage > active_rules.maximum_discount_percentage then
    raise exception using errcode = '22023', message = 'Desconto excede o limite configurado para a escola.';
  end if;

  select * into enrollment_item from public.fee_items
  where school_id = target_school_id and fee_plan_id = selected_fee_plan.id and kind = 'enrollment' and is_active
  order by created_at limit 1;
  select * into tuition_item from public.fee_items
  where school_id = target_school_id and fee_plan_id = selected_fee_plan.id and kind = 'tuition' and is_active
  order by created_at limit 1;
  if enrollment_item.id is null or tuition_item.id is null then
    raise exception using errcode = '55000', message = 'Plano de propinas não tem itens de matrícula e propina ativos.';
  end if;

  insert into public.finance_contracts (school_id, enrollment_id, fee_plan_id, discount_percentage, created_by)
  values (target_school_id, target_enrollment_id, selected_fee_plan.id, target_discount_percentage, (select auth.uid()))
  returning id into new_contract_id;

  invoice_discount := round(enrollment_item.amount * target_discount_percentage / 100, 2);
  invoice_amount := enrollment_item.amount - invoice_discount;
  generated_number := private.next_document_number(target_school_id, 'invoice');
  insert into public.finance_invoices (
    school_id, contract_id, fee_item_id, invoice_number, competence_month,
    amount, discount_amount, due_date, issued_by
  ) values (
    target_school_id, new_contract_id, enrollment_item.id, generated_number, null,
    invoice_amount, invoice_discount, selected_enrollment.enrolled_on, (select auth.uid())
  );
  invoices_created := invoices_created + 1;

  month_cursor := date_trunc('month', selected_year.starts_on)::date;
  while month_cursor <= selected_year.ends_on loop
    invoice_discount := round(tuition_item.amount * target_discount_percentage / 100, 2);
    invoice_amount := tuition_item.amount - invoice_discount;
    generated_number := private.next_document_number(target_school_id, 'invoice');
    insert into public.finance_invoices (
      school_id, contract_id, fee_item_id, invoice_number, competence_month,
      amount, discount_amount, due_date, issued_by
    ) values (
      target_school_id, new_contract_id, tuition_item.id, generated_number, month_cursor,
      invoice_amount, invoice_discount,
      month_cursor + (active_rules.monthly_due_day - 1) * interval '1 day',
      (select auth.uid())
    );
    invoices_created := invoices_created + 1;
    month_cursor := (month_cursor + interval '1 month')::date;
  end loop;

  return jsonb_build_object('contractId', new_contract_id, 'invoicesCreated', invoices_created);
end;
$function$;

-- private.create_grade_complaint
CREATE OR REPLACE FUNCTION private.create_grade_complaint(target_school_id uuid, target_enrollment_id uuid, complaint_reason text, deadline_on date, target_grade_score_id uuid DEFAULT NULL::uuid, target_grade_sheet_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  complaint_id uuid;
  sheet public.grade_sheets%rowtype;
begin
  if actor is null or not private.is_aal2() or not private.has_permission(target_school_id, 'assessment.complaints.manage') then
    raise exception using errcode = '42501', message = 'Sem autorização para registar reclamação.';
  end if;
  if target_grade_score_id is null and target_grade_sheet_id is null then
    raise exception using errcode = '22023', message = 'Indique a nota ou a pauta contestada.';
  end if;
  if deadline_on < current_date then
    raise exception using errcode = '22023', message = 'O prazo da reclamação não pode estar no passado.';
  end if;

  if target_grade_sheet_id is not null then
    select * into sheet from public.grade_sheets where school_id = target_school_id and id = target_grade_sheet_id;
    if sheet.status = 'closed' then
      raise exception using errcode = '22023', message = 'Não é possível reclamar após o fecho da pauta.';
    end if;
  end if;

  insert into public.grade_complaints (
    school_id, enrollment_id, grade_score_id, grade_sheet_id, reason, deadline_on, created_by
  ) values (
    target_school_id, target_enrollment_id, target_grade_score_id, target_grade_sheet_id,
    btrim(complaint_reason), deadline_on, actor
  ) returning id into complaint_id;

  if target_grade_sheet_id is not null and sheet.status in ('published', 'homologated') then
    perform private.transition_grade_sheet(target_school_id, target_grade_sheet_id, 'contested', null);
  end if;

  return jsonb_build_object('complaintId', complaint_id, 'status', 'open');
end;
$function$;

-- private.create_student_case
CREATE OR REPLACE FUNCTION private.create_student_case(target_school_id uuid, target_student_id uuid, case_type text, title text, summary text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  case_id uuid;
  case_no text;
begin
  if actor is null or not private.is_aal2() or not private.has_permission(target_school_id, 'documents.cases.manage') then
    raise exception using errcode = '42501', message = 'Sem autorização para abrir processo.';
  end if;
  if case_type not in ('transfer', 'enrollment', 'disciplinary', 'document_pack', 'other') then
    raise exception using errcode = '22023', message = 'Tipo de processo inválido.';
  end if;

  case_no := private.next_document_number(target_school_id, 'other', 'PRC');
  insert into public.student_cases (
    school_id, student_id, case_number, case_type, title, summary, opened_by
  ) values (
    target_school_id, target_student_id, case_no, case_type, btrim(title),
    nullif(btrim(coalesce(summary, '')), ''), actor
  ) returning id into case_id;

  return jsonb_build_object('caseId', case_id, 'caseNumber', case_no, 'status', 'open');
end;
$function$;

-- private.enroll_student
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

-- private.fanout_announcement_notifications
CREATE OR REPLACE FUNCTION private.fanout_announcement_notifications(target_school_id uuid, target_announcement_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  ann public.announcements%rowtype;
  inserted integer := 0;
begin
  select * into ann
  from public.announcements
  where school_id = target_school_id and id = target_announcement_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Anúncio não encontrado.';
  end if;
  if ann.status <> 'published' then
    raise exception using errcode = '22023', message = 'Só anúncios publicados geram notificações.';
  end if;

  insert into public.notifications (
    school_id, user_id, channel, event_type, title, body, payload, announcement_id, status
  )
  select
    target_school_id,
    m.user_id,
    'in_app',
    'announcement.published',
    ann.title,
    left(ann.body, 4000),
    jsonb_build_object(
      'announcementId', ann.id,
      'audience', ann.audience,
      'priority', ann.priority,
      'classGroupId', ann.class_group_id,
      'roleCode', ann.role_code
    ),
    ann.id,
    'delivered'
  from public.school_memberships m
  where m.school_id = target_school_id
    and m.status = 'active'
    and (
      ann.audience = 'school'
      or ann.audience = 'class_group'
      or (
        ann.audience = 'role'
        and exists (
          select 1
          from public.member_roles mr
          join public.roles r on r.school_id = mr.school_id and r.id = mr.role_id
          where mr.school_id = m.school_id
            and mr.membership_id = m.id
            and r.code = ann.role_code
        )
      )
    )
    and not exists (
      select 1 from public.notification_preferences pref
      where pref.school_id = m.school_id
        and pref.user_id = m.user_id
        and pref.in_app_enabled = false
    )
    and not exists (
      select 1 from public.notifications n
      where n.school_id = target_school_id
        and n.user_id = m.user_id
        and n.announcement_id = ann.id
        and n.channel = 'in_app'
    );

  get diagnostics inserted = row_count;
  return inserted;
end;
$function$;

-- private.finalize_installation
CREATE OR REPLACE FUNCTION private.finalize_installation(target_school_id uuid, schedule_demo_seed boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  installation_id uuid;
  school_identity_ready boolean;
  owner_ready boolean;
  campus_ready boolean;
  academic_ready boolean;
  assessment_ready boolean;
  finance_ready boolean;
  modules_ready boolean;
  all_ready boolean;
  checks_result jsonb;
  report_id uuid;
begin
  if (select auth.uid()) is null or not private.is_aal2() or not private.has_permission(target_school_id, 'installer.runs.update') then
    raise exception using errcode = '42501', message = 'Sem autorização para concluir a instalação.';
  end if;
  select id into installation_id from public.installation_runs
  where school_id = target_school_id and status = 'in_progress' and current_step = 10 for update;
  if installation_id is null then
    raise exception using errcode = '55000', message = 'A instalação não está pronta para o diagnóstico final.';
  end if;

  select name is not null and nif is not null and province is not null and municipality is not null
    and official_authorization_reference is not null into school_identity_ready
  from public.schools where id = target_school_id;
  select exists(
    select 1 from public.school_memberships m join public.member_roles mr on mr.school_id = m.school_id and mr.membership_id = m.id
    join public.roles r on r.school_id = mr.school_id and r.id = mr.role_id
    where m.school_id = target_school_id and m.status = 'active' and r.code = 'owner'
  ) into owner_ready;
  select exists(select 1 from public.campuses where school_id = target_school_id and is_active) into campus_ready;
  select exists(select 1 from public.academic_years where school_id = target_school_id and status = 'active')
    and exists(select 1 from public.terms where school_id = target_school_id)
    and exists(select 1 from public.academic_levels where school_id = target_school_id and is_active)
    into academic_ready;
  select exists(select 1 from public.assessment_rule_sets where school_id = target_school_id and status = 'active') into assessment_ready;
  select exists(select 1 from public.financial_rule_sets where school_id = target_school_id and status = 'active')
    and exists(select 1 from public.fee_plans where school_id = target_school_id and status = 'active')
    and (select count(*) = 2 from public.document_sequences where school_id = target_school_id and document_type in ('invoice','receipt'))
    into finance_ready;
  select not exists(
    select 1 from public.module_catalog m where m.is_essential
      and not exists(select 1 from public.school_modules sm where sm.school_id = target_school_id and sm.module_code = m.code and sm.status = 'active')
  ) into modules_ready;

  all_ready := school_identity_ready and owner_ready and campus_ready and academic_ready and assessment_ready and finance_ready and modules_ready;
  checks_result := jsonb_build_array(
    jsonb_build_object('code','school_identity','label','Identidade institucional','status',case when school_identity_ready then 'passed' else 'failed' end),
    jsonb_build_object('code','owner_membership','label','Administrador proprietário','status',case when owner_ready then 'passed' else 'failed' end),
    jsonb_build_object('code','active_campus','label','Campus principal','status',case when campus_ready then 'passed' else 'failed' end),
    jsonb_build_object('code','academic_structure','label','Estrutura académica','status',case when academic_ready then 'passed' else 'failed' end),
    jsonb_build_object('code','assessment_rules','label','Regras de avaliação','status',case when assessment_ready then 'passed' else 'failed' end),
    jsonb_build_object('code','financial_plan','label','Plano financeiro','status',case when finance_ready then 'passed' else 'failed' end),
    jsonb_build_object('code','essential_modules','label','Módulos essenciais','status',case when modules_ready then 'passed' else 'failed' end)
  );

  insert into public.installation_health_reports (school_id, installation_run_id, status, checks, demo_seed_scheduled, checked_by)
  values (target_school_id, installation_id, case when all_ready then 'passed' else 'failed' end, checks_result, all_ready and schedule_demo_seed, (select auth.uid()))
  returning id into report_id;

  if all_ready then
    if schedule_demo_seed then
      insert into public.async_jobs (school_id, kind, idempotency_key, requested_by)
      values (target_school_id, 'demo.seed.foundation', 'installation:' || installation_id::text, (select auth.uid()))
      on conflict (school_id, kind, idempotency_key) do nothing;
    end if;
    update public.schools set status = 'active', updated_at = now() where id = target_school_id;
    update public.installation_runs
    set status = 'completed', completed_at = now(), updated_at = now(),
      draft = draft || jsonb_build_object('completion', jsonb_build_object('reportId', report_id, 'completedAt', clock_timestamp(), 'demoSeedScheduled', schedule_demo_seed))
    where id = installation_id;
  end if;

  return jsonb_build_object('reportId', report_id, 'status', case when all_ready then 'passed' else 'failed' end, 'checks', checks_result, 'demoSeedScheduled', all_ready and schedule_demo_seed);
end;
$function$;

-- private.has_permission
CREATE OR REPLACE FUNCTION private.has_permission(target_school_id uuid, permission_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.school_memberships m
    join public.member_roles mr on mr.school_id = m.school_id and mr.membership_id = m.id
    join public.role_permissions rp on rp.school_id = mr.school_id and rp.role_id = mr.role_id
    join public.permissions p on p.id = rp.permission_id
    where (select auth.uid()) is not null
      and m.school_id = target_school_id and m.user_id = (select auth.uid())
      and m.status = 'active' and p.code = permission_code
  );
$function$;

-- private.installer_database_health
CREATE OR REPLACE FUNCTION private.installer_database_health(target_school_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  postgres_ready boolean;
  tables_ready boolean;
  rls_ready boolean;
  indexes_ready boolean;
  storage_ready boolean;
  extension_ready boolean;
  checks jsonb;
begin
  if (select auth.uid()) is null
     or not private.is_aal2()
     or not private.has_permission(target_school_id, 'installer.runs.update') then
    raise exception using errcode = '42501', message = 'Sem autorização para executar o diagnóstico da base.';
  end if;

  postgres_ready := current_setting('server_version_num')::integer >= 170000;
  tables_ready := array_position(array[
    to_regclass('public.schools'), to_regclass('public.school_memberships'),
    to_regclass('public.roles'), to_regclass('public.permissions'),
    to_regclass('public.role_permissions'), to_regclass('public.member_roles'),
    to_regclass('public.school_settings'), to_regclass('public.audit_logs'),
    to_regclass('public.installation_runs'), to_regclass('public.academic_years')
  ], null) is null;

  select coalesce(bool_and(c.relrowsecurity), false) into rls_ready
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = any(array['schools','school_memberships','roles','role_permissions','member_roles','school_settings','audit_logs','installation_runs','academic_years']);

  indexes_ready := to_regclass('public.school_memberships_user_school_idx') is not null
    and to_regclass('public.roles_school_idx') is not null
    and to_regclass('public.school_settings_school_domain_idx') is not null
    and to_regclass('public.audit_logs_school_time_idx') is not null
    and to_regclass('public.academic_years_school_status_idx') is not null;

  select count(*) = 2 into storage_ready
  from storage.buckets
  where id in ('school-private', 'school-exports');

  select exists(select 1 from pg_catalog.pg_extension where extname = 'pgcrypto') into extension_ready;

  checks := jsonb_build_array(
    jsonb_build_object('code','postgres_version','label','PostgreSQL 17 ou superior','status',case when postgres_ready then 'passed' else 'failed' end,'detail',case when postgres_ready then 'Versão compatível.' else 'Atualização do PostgreSQL necessária.' end),
    jsonb_build_object('code','foundation_tables','label','Tabelas da Fundação','status',case when tables_ready then 'passed' else 'failed' end,'detail',case when tables_ready then 'Entidades essenciais disponíveis.' else 'Existem tabelas essenciais em falta.' end),
    jsonb_build_object('code','row_level_security','label','Isolamento RLS','status',case when rls_ready then 'passed' else 'failed' end,'detail',case when rls_ready then 'RLS ativa nas tabelas críticas.' else 'Existem tabelas críticas sem RLS.' end),
    jsonb_build_object('code','tenant_indexes','label','Índices multi-tenant','status',case when indexes_ready then 'passed' else 'failed' end,'detail',case when indexes_ready then 'Índices essenciais disponíveis.' else 'Existem índices essenciais em falta.' end),
    jsonb_build_object('code','storage_buckets','label','Storage privado','status',case when storage_ready then 'passed' else 'failed' end,'detail',case when storage_ready then 'Buckets privados disponíveis.' else 'Buckets obrigatórios em falta.' end),
    jsonb_build_object('code','pgcrypto_extension','label','Extensão criptográfica','status',case when extension_ready then 'passed' else 'failed' end,'detail',case when extension_ready then 'pgcrypto disponível.' else 'Extensão pgcrypto indisponível.' end)
  );

  return jsonb_build_object(
    'checkedAt', clock_timestamp(),
    'status', case when postgres_ready and tables_ready and rls_ready and indexes_ready and storage_ready and extension_ready then 'passed' else 'failed' end,
    'schemaVersion', '20260803073912',
    'results', checks
  );
end;
$function$;

-- private.is_aal2
CREATE OR REPLACE FUNCTION private.is_aal2()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select coalesce((select auth.jwt()->>'aal') = 'aal2', false);
$function$;

-- private.is_active_member
CREATE OR REPLACE FUNCTION private.is_active_member(target_school_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.school_memberships m
    where (select auth.uid()) is not null
      and m.school_id = target_school_id and m.user_id = (select auth.uid()) and m.status = 'active'
  );
$function$;

-- private.is_portal_guardian_of
CREATE OR REPLACE FUNCTION private.is_portal_guardian_of(target_school_id uuid, target_student_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.portal_identities pi
    join public.student_guardians sg
      on sg.school_id = pi.school_id
     and sg.guardian_person_id = pi.person_id
    where pi.school_id = target_school_id
      and pi.user_id = (select auth.uid())
      and pi.status = 'active'
      and pi.portal_role = 'guardian'
      and sg.student_id = target_student_id
      and sg.valid_until is null
  );
$function$;

-- private.is_portal_student_of
CREATE OR REPLACE FUNCTION private.is_portal_student_of(target_school_id uuid, target_student_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.portal_identities pi
    join public.students s
      on s.school_id = pi.school_id
     and s.person_id = pi.person_id
    where pi.school_id = target_school_id
      and pi.user_id = (select auth.uid())
      and pi.status = 'active'
      and pi.portal_role = 'student'
      and s.id = target_student_id
  );
$function$;

-- private.issue_report_cards
CREATE OR REPLACE FUNCTION private.issue_report_cards(target_school_id uuid, target_grade_sheet_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  sheet public.grade_sheets%rowtype;
  issued_count integer := 0;
  row_rec record;
begin
  if actor is null or not private.is_aal2() or not private.has_permission(target_school_id, 'assessment.grades.homologate') then
    raise exception using errcode = '42501', message = 'Sem autorização para emitir boletins.';
  end if;

  select * into sheet from public.grade_sheets
  where school_id = target_school_id and id = target_grade_sheet_id;
  if not found or sheet.status not in ('homologated', 'published', 'closed') then
    raise exception using errcode = '22023', message = 'A pauta precisa estar homologada ou publicada.';
  end if;

  for row_rec in
    select * from public.grade_sheet_rows
    where school_id = target_school_id and grade_sheet_id = target_grade_sheet_id
  loop
    insert into public.report_cards (
      school_id, enrollment_id, grade_sheet_id, term_id, academic_year_id, status, averages, issued_at, created_by
    ) values (
      target_school_id, row_rec.enrollment_id, sheet.id, sheet.term_id, sheet.academic_year_id, 'issued',
      jsonb_build_object(
        'continuous', row_rec.continuous_average,
        'exam', row_rec.exam_average,
        'term', row_rec.term_average,
        'result', row_rec.result,
        'subjects', row_rec.subject_breakdown
      ),
      now(), actor
    )
    on conflict (school_id, enrollment_id, grade_sheet_id) do update
      set averages = excluded.averages,
          status = 'issued',
          issued_at = now();
    issued_count := issued_count + 1;
  end loop;

  return jsonb_build_object('gradeSheetId', target_grade_sheet_id, 'issuedCount', issued_count);
end;
$function$;

-- private.issue_school_document
CREATE OR REPLACE FUNCTION private.issue_school_document(target_school_id uuid, target_student_id uuid, target_template_id uuid, rendered_body text, target_request_id uuid DEFAULT NULL::uuid, title text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  template public.document_templates%rowtype;
  doc_id uuid;
  doc_no text;
  validation text;
begin
  if actor is null or not private.is_aal2() or not private.has_permission(target_school_id, 'documents.issued.issue') then
    raise exception using errcode = '42501', message = 'Sem autorização para emitir documento.';
  end if;

  select * into template from public.document_templates
  where school_id = target_school_id and id = target_template_id and status = 'active';
  if not found then
    raise exception using errcode = '22023', message = 'Modelo ativo não encontrado.';
  end if;

  if target_request_id is not null and not exists (
    select 1 from public.document_requests
    where school_id = target_school_id and id = target_request_id and student_id = target_student_id
      and status in ('approved', 'fulfilled')
  ) then
    raise exception using errcode = '22023', message = 'Pedido associado inválido ou não aprovado.';
  end if;

  doc_no := private.next_document_number(target_school_id, template.document_type, upper(left(template.code, 3)));
  validation := replace(gen_random_uuid()::text, '-', '');

  insert into public.issued_documents (
    school_id, student_id, request_id, template_id, template_version, document_number, document_type,
    title, body_snapshot, validation_code, issued_by
  ) values (
    target_school_id, target_student_id, target_request_id, template.id, template.version, doc_no, template.document_type,
    coalesce(nullif(btrim(coalesce(title, '')), ''), template.name), btrim(rendered_body), validation, actor
  ) returning id into doc_id;

  if target_request_id is not null then
    update public.document_requests
    set status = 'fulfilled', updated_at = now()
    where school_id = target_school_id and id = target_request_id;
  end if;

  return jsonb_build_object(
    'documentId', doc_id, 'documentNumber', doc_no, 'validationCode', validation, 'templateVersion', template.version
  );
end;
$function$;

-- private.next_document_number
CREATE OR REPLACE FUNCTION private.next_document_number(target_school_id uuid, target_document_type text, default_prefix text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

-- private.normalize_class_group
CREATE OR REPLACE FUNCTION private.normalize_class_group()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'UPDATE' and (
    new.id <> old.id or new.school_id <> old.school_id
    or new.academic_year_id <> old.academic_year_id
    or new.campus_id <> old.campus_id or new.grade_level_id <> old.grade_level_id
    or new.created_by <> old.created_by or new.created_at <> old.created_at
  ) then
    raise exception using errcode = '22023', message = 'Identidade académica da turma é imutável.';
  end if;
  new.code := upper(btrim(new.code));
  new.name := btrim(new.name);
  new.updated_at := now();
  return new;
end;
$function$;

-- private.normalize_subject
CREATE OR REPLACE FUNCTION private.normalize_subject()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'UPDATE' and (
    new.id <> old.id or new.school_id <> old.school_id
    or new.created_by <> old.created_by or new.created_at <> old.created_at
  ) then
    raise exception using errcode = '22023', message = 'Identidade e escola da disciplina são imutáveis.';
  end if;
  new.code := upper(btrim(new.code));
  new.name := btrim(new.name);
  new.short_name := nullif(btrim(new.short_name), '');
  new.updated_at := now();
  return new;
end;
$function$;

-- private.notify_permission_holders
CREATE OR REPLACE FUNCTION private.notify_permission_holders(target_school_id uuid, permission_code text, event_type text, title text, body text, payload jsonb DEFAULT '{}'::jsonb, exclude_user_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  inserted integer := 0;
begin
  insert into public.notifications (
    school_id, user_id, channel, event_type, title, body, payload, status
  )
  select distinct
    target_school_id,
    m.user_id,
    'in_app',
    event_type,
    left(btrim(title), 160),
    left(btrim(body), 4000),
    coalesce(payload, '{}'::jsonb),
    'delivered'
  from public.school_memberships m
  join public.member_roles mr on mr.school_id = m.school_id and mr.membership_id = m.id
  join public.role_permissions rp on rp.school_id = mr.school_id and rp.role_id = mr.role_id
  join public.permissions p on p.id = rp.permission_id
  where m.school_id = target_school_id
    and m.status = 'active'
    and p.code = permission_code
    and (exclude_user_id is null or m.user_id <> exclude_user_id)
    and not exists (
      select 1 from public.notification_preferences pref
      where pref.school_id = m.school_id
        and pref.user_id = m.user_id
        and pref.in_app_enabled = false
    );

  get diagnostics inserted = row_count;
  return inserted;
end;
$function$;

-- private.open_attendance_session
CREATE OR REPLACE FUNCTION private.open_attendance_session(target_school_id uuid, target_timetable_slot_id uuid, target_session_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  selected_slot public.timetable_slots%rowtype;
  selected_assignment public.class_subjects%rowtype;
  selected_group public.class_groups%rowtype;
  session_id uuid;
  session_status text;
  roster_count integer;
begin
  if (select auth.uid()) is null or not private.is_aal2()
     or not private.has_permission(target_school_id, 'attendance.records.take') then
    raise exception using errcode = '42501', message = 'Sem autorização para abrir a chamada.';
  end if;
  select * into selected_slot from public.timetable_slots
  where school_id = target_school_id and id = target_timetable_slot_id and status = 'active';
  select * into selected_assignment from public.class_subjects
  where school_id = target_school_id and id = selected_slot.class_subject_id and status = 'active';
  select * into selected_group from public.class_groups
  where school_id = target_school_id and id = selected_assignment.class_group_id and status = 'active';
  if selected_slot.id is null or selected_group.id is null
     or extract(isodow from target_session_date)::integer <> selected_slot.weekday
     or not exists (
       select 1 from public.academic_years
       where school_id = target_school_id and id = selected_group.academic_year_id
         and target_session_date between starts_on and ends_on
     ) then
    raise exception using errcode = '22023', message = 'Horário ou data inválida para a chamada.';
  end if;

  insert into public.attendance_sessions (
    school_id, timetable_slot_id, class_subject_id, session_date, opened_by
  ) values (
    target_school_id, target_timetable_slot_id, selected_assignment.id,
    target_session_date, (select auth.uid())
  ) on conflict (school_id, timetable_slot_id, session_date) do nothing;
  select id, status into session_id, session_status from public.attendance_sessions
  where school_id = target_school_id and timetable_slot_id = target_timetable_slot_id
    and session_date = target_session_date;
  select count(*) into roster_count from public.enrollments
  where school_id = target_school_id and class_group_id = selected_group.id and status = 'active';

  return jsonb_build_object('attendanceSessionId', session_id, 'status', session_status, 'rosterCount', roster_count);
end;
$function$;

-- private.open_gradebook
CREATE OR REPLACE FUNCTION private.open_gradebook(target_school_id uuid, target_class_subject_id uuid, target_term_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  assignment public.class_subjects%rowtype;
  term_row public.terms%rowtype;
  active_rule public.assessment_rule_sets%rowtype;
  gradebook_id uuid;
begin
  if actor is null or not private.is_aal2() or not private.has_permission(target_school_id, 'assessment.grades.manage') then
    raise exception using errcode = '42501', message = 'Sem autorização para abrir diário de notas.';
  end if;

  select * into assignment from public.class_subjects
  where school_id = target_school_id and id = target_class_subject_id and status = 'active';
  if not found then
    raise exception using errcode = 'P0002', message = 'Distribuição curricular não encontrada.';
  end if;

  select * into term_row from public.terms
  where school_id = target_school_id and id = target_term_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Período letivo não encontrado.';
  end if;

  select * into active_rule from public.assessment_rule_sets
  where school_id = target_school_id and status = 'active' and code = 'DEFAULT'
  order by version desc limit 1;
  if not found then
    raise exception using errcode = '55000', message = 'Não existe regra de avaliação ativa.';
  end if;

  insert into public.gradebooks (
    school_id, academic_year_id, term_id, class_subject_id, class_group_id, rule_set_id,
    status, opened_at, created_by, updated_by
  ) values (
    target_school_id, term_row.academic_year_id, term_row.id, assignment.id, assignment.class_group_id, active_rule.id,
    'open', now(), actor, actor
  )
  on conflict (school_id, class_subject_id, term_id) do update
    set status = case when public.gradebooks.status = 'closed' then public.gradebooks.status else 'open' end,
        updated_by = actor,
        updated_at = now(),
        opened_at = coalesce(public.gradebooks.opened_at, now())
  returning id into gradebook_id;

  return jsonb_build_object('gradebookId', gradebook_id, 'status', 'open', 'ruleSetId', active_rule.id);
end;
$function$;

-- private.prevent_audit_mutation
CREATE OR REPLACE FUNCTION private.prevent_audit_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  raise exception using
    errcode = '55000',
    message = 'audit_logs é append-only; UPDATE e DELETE não são permitidos';
end;
$function$;

-- private.protect_enrollment_identity
CREATE OR REPLACE FUNCTION private.protect_enrollment_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.id <> old.id or new.school_id <> old.school_id
     or new.academic_year_id <> old.academic_year_id
     or new.class_group_id <> old.class_group_id or new.student_id <> old.student_id
     or new.enrollment_number <> old.enrollment_number
     or new.created_by <> old.created_by or new.created_at <> old.created_at then
    raise exception using errcode = '22023', message = 'Identidade da matrícula é imutável.';
  end if;
  new.end_reason := nullif(btrim(new.end_reason), '');
  new.updated_at := now();
  return new;
end;
$function$;

-- private.protect_installation_identity
CREATE OR REPLACE FUNCTION private.protect_installation_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.school_id is distinct from old.school_id or new.initiated_by is distinct from old.initiated_by then
    raise exception using errcode = '22023', message = 'A escola e o autor inicial da instalação são imutáveis.';
  end if;
  return new;
end;
$function$;

-- private.protect_person_identity
CREATE OR REPLACE FUNCTION private.protect_person_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'UPDATE' and (
     new.id <> old.id
     or new.school_id <> old.school_id
     or new.created_by <> old.created_by
     or new.created_at <> old.created_at
  ) then
    raise exception using errcode = '22023', message = 'Identidade e escola da pessoa são imutáveis.';
  end if;

  new.full_name := btrim(new.full_name);
  new.preferred_name := nullif(btrim(new.preferred_name), '');
  new.national_id := nullif(upper(btrim(new.national_id)), '');
  new.email := nullif(lower(btrim(new.email)), '');
  new.phone := nullif(btrim(new.phone), '');
  new.updated_at := now();
  return new;
end;
$function$;

-- private.protect_student_identity
CREATE OR REPLACE FUNCTION private.protect_student_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.id <> old.id
     or new.school_id <> old.school_id
     or new.person_id <> old.person_id
     or new.student_number <> old.student_number
     or new.created_by <> old.created_by
     or new.created_at <> old.created_at then
    raise exception using errcode = '22023', message = 'Identidade institucional do estudante é imutável.';
  end if;
  new.updated_at := now();
  return new;
end;
$function$;

-- private.protect_teacher_identity
CREATE OR REPLACE FUNCTION private.protect_teacher_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.id <> old.id or new.school_id <> old.school_id
     or new.person_id <> old.person_id or new.employee_number <> old.employee_number
     or new.created_by <> old.created_by or new.created_at <> old.created_at then
    raise exception using errcode = '22023', message = 'Identidade funcional do docente é imutável.';
  end if;
  new.updated_at := now();
  return new;
end;
$function$;

-- private.publish_assessment_rule_version
CREATE OR REPLACE FUNCTION private.publish_assessment_rule_version(target_school_id uuid, continuous_weight_value numeric, exam_weight_value numeric, passing_grade_value numeric, maximum_absence_value numeric, rounding_method_value text, require_change_approval boolean, lock_after_publication_value boolean, key_subject_ids uuid[] DEFAULT '{}'::uuid[], key_subjects_cause_failure boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  active_scale public.grading_scales%rowtype;
  next_version integer;
  new_rule_id uuid;
  subject_id uuid;
begin
  if actor is null or not private.is_aal2() or not private.has_permission(target_school_id, 'assessment.rules.manage') then
    raise exception using errcode = '42501', message = 'Sem autorização para versionar regras de avaliação.';
  end if;

  select * into active_scale from public.grading_scales
  where school_id = target_school_id and is_active
  order by version desc limit 1;
  if not found then
    raise exception using errcode = '55000', message = 'Escala de notas ativa em falta.';
  end if;

  if continuous_weight_value < 0 or exam_weight_value < 0 or continuous_weight_value + exam_weight_value <> 100
     or passing_grade_value < active_scale.minimum_value or passing_grade_value > active_scale.maximum_value
     or maximum_absence_value < 0 or maximum_absence_value > 100
     or rounding_method_value not in ('none','nearest','up','down') then
    raise exception using errcode = '22023', message = 'Parâmetros de regra inválidos.';
  end if;

  select coalesce(max(version), 0) + 1 into next_version
  from public.assessment_rule_sets where school_id = target_school_id and code = 'DEFAULT';

  update public.assessment_rule_sets
  set status = 'retired'
  where school_id = target_school_id and code = 'DEFAULT' and status = 'active';

  insert into public.assessment_rule_sets (
    school_id, grading_scale_id, code, name, version, status, continuous_weight, exam_weight,
    passing_value, maximum_absence_percentage, rounding_method, grade_change_requires_approval,
    lock_after_publication, formula, created_by
  ) values (
    target_school_id, active_scale.id, 'DEFAULT', 'Regra principal de avaliação', next_version, 'active',
    continuous_weight_value, exam_weight_value, passing_grade_value, maximum_absence_value,
    rounding_method_value, require_change_approval, lock_after_publication_value,
    jsonb_build_object(
      'operation', 'weighted_average',
      'components', jsonb_build_array(
        jsonb_build_object('code', 'continuous', 'weight', continuous_weight_value),
        jsonb_build_object('code', 'exam', 'weight', exam_weight_value)
      ),
      'keySubjectsCauseFailure', key_subjects_cause_failure,
      'scale', jsonb_build_object(
        'minimum', active_scale.minimum_value,
        'maximum', active_scale.maximum_value,
        'passing', passing_grade_value,
        'decimalPlaces', active_scale.decimal_places
      )
    ),
    actor
  ) returning id into new_rule_id;

  foreach subject_id in array coalesce(key_subject_ids, '{}') loop
    if not exists (
      select 1 from public.subjects
      where school_id = target_school_id and id = subject_id and status = 'active'
    ) then
      raise exception using errcode = '22023', message = 'Disciplina-chave inválida.';
    end if;
    insert into public.assessment_key_subjects (school_id, rule_set_id, subject_id)
    values (target_school_id, new_rule_id, subject_id);
  end loop;

  return jsonb_build_object('ruleSetId', new_rule_id, 'version', next_version, 'status', 'active');
end;
$function$;

-- private.publish_document_template
CREATE OR REPLACE FUNCTION private.publish_document_template(target_school_id uuid, template_code text, template_name text, template_type text, body_template text, allowed_fields jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  next_version integer;
  template_id uuid;
begin
  if actor is null or not private.is_aal2() or not private.has_permission(target_school_id, 'documents.templates.manage') then
    raise exception using errcode = '42501', message = 'Sem autorização para publicar modelo.';
  end if;
  if template_type not in ('declaration', 'certificate', 'transfer', 'term', 'other') then
    raise exception using errcode = '22023', message = 'Tipo de documento inválido.';
  end if;

  select coalesce(max(version), 0) + 1 into next_version
  from public.document_templates where school_id = target_school_id and code = upper(btrim(template_code));
  update public.document_templates set status = 'retired'
  where school_id = target_school_id and code = upper(btrim(template_code)) and status = 'active';

  insert into public.document_templates (
    school_id, code, name, document_type, version, status, body_template, allowed_fields, created_by
  ) values (
    target_school_id, upper(btrim(template_code)), btrim(template_name), template_type, next_version, 'active',
    btrim(body_template), coalesce(allowed_fields, '[]'::jsonb), actor
  ) returning id into template_id;

  return jsonb_build_object('templateId', template_id, 'version', next_version, 'status', 'active');
end;
$function$;

-- private.register_payment
CREATE OR REPLACE FUNCTION private.register_payment(target_school_id uuid, target_invoice_id uuid, target_amount numeric, target_payment_method text, target_paid_on date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  selected_invoice public.finance_invoices%rowtype;
  already_paid numeric(18,2);
  generated_number text;
  new_receipt_id uuid;
  new_status text;
begin
  if (select auth.uid()) is null or not private.is_aal2()
     or not private.has_permission(target_school_id, 'finance.payments.create') then
    raise exception using errcode = '42501', message = 'Sem autorização para registar pagamentos.';
  end if;
  if target_amount <= 0 or target_payment_method not in ('cash', 'bank_transfer', 'card', 'other') then
    raise exception using errcode = '22023', message = 'Valor ou método de pagamento inválido.';
  end if;

  select * into selected_invoice from public.finance_invoices
  where school_id = target_school_id and id = target_invoice_id and status in ('open', 'partially_paid')
  for update;
  if selected_invoice.id is null then
    raise exception using errcode = '22023', message = 'Fatura inválida, cancelada ou já paga.';
  end if;

  select coalesce(sum(amount), 0) into already_paid from public.finance_receipts
  where school_id = target_school_id and invoice_id = target_invoice_id and status = 'issued';
  if already_paid + target_amount > selected_invoice.amount then
    raise exception using errcode = '22023', message = 'O valor do pagamento excede o saldo em aberto da fatura.';
  end if;

  generated_number := private.next_document_number(target_school_id, 'receipt');
  insert into public.finance_receipts (school_id, invoice_id, receipt_number, amount, paid_on, payment_method, received_by)
  values (target_school_id, target_invoice_id, generated_number, target_amount, target_paid_on, target_payment_method, (select auth.uid()))
  returning id into new_receipt_id;

  new_status := case when already_paid + target_amount >= selected_invoice.amount then 'paid' else 'partially_paid' end;
  update public.finance_invoices set status = new_status where school_id = target_school_id and id = target_invoice_id;

  return jsonb_build_object('receiptId', new_receipt_id, 'receiptNumber', generated_number, 'invoiceStatus', new_status);
end;
$function$;

-- private.register_teacher
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

-- private.render_document_placeholders
CREATE OR REPLACE FUNCTION private.render_document_placeholders(target_school_id uuid, target_student_id uuid, body_template text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  school_name text;
  student_number text;
  full_name text;
  national_id text;
  birth_date text;
  rendered text := body_template;
begin
  if (select auth.uid()) is null or not private.is_active_member(target_school_id) then
    raise exception using errcode = '42501', message = 'Sem autorização para renderizar documento.';
  end if;
  if not (
    private.has_permission(target_school_id, 'documents.issued.issue')
    or private.has_permission(target_school_id, 'documents.batch.issue')
    or private.has_permission(target_school_id, 'documents.templates.read')
  ) then
    raise exception using errcode = '42501', message = 'Sem permissão de secretaria para renderizar.';
  end if;

  select s.name into school_name from public.schools s where s.id = target_school_id;
  select st.student_number, p.full_name, coalesce(p.national_id, ''),
         coalesce(to_char(p.date_of_birth, 'DD/MM/YYYY'), '')
  into student_number, full_name, national_id, birth_date
  from public.students st
  join public.people p on p.school_id = st.school_id and p.id = st.person_id
  where st.school_id = target_school_id and st.id = target_student_id;
  if not found then
    raise exception using errcode = '22023', message = 'Estudante não encontrado para renderização.';
  end if;

  rendered := replace(rendered, '{{nome}}', full_name);
  rendered := replace(rendered, '{{numero_estudante}}', student_number);
  rendered := replace(rendered, '{{documento}}', national_id);
  rendered := replace(rendered, '{{data_nascimento}}', birth_date);
  rendered := replace(rendered, '{{escola}}', coalesce(school_name, ''));
  rendered := replace(rendered, '{{data}}', to_char(current_date, 'DD/MM/YYYY'));
  rendered := replace(rendered, '{{ano}}', to_char(current_date, 'YYYY'));
  return rendered;
end;
$function$;

-- private.reopen_attendance
CREATE OR REPLACE FUNCTION private.reopen_attendance(target_school_id uuid, target_session_id uuid, target_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  selected_session public.attendance_sessions%rowtype;
  removed_count integer;
begin
  if (select auth.uid()) is null or not private.is_aal2()
     or not private.has_permission(target_school_id, 'attendance.records.reopen') then
    raise exception using errcode = '42501', message = 'Sem autorização para reabrir a chamada.';
  end if;
  if char_length(btrim(target_reason)) not between 5 and 300 then
    raise exception using errcode = '22023', message = 'Informe um motivo válido para a reabertura.';
  end if;
  select * into selected_session from public.attendance_sessions
  where school_id = target_school_id and id = target_session_id for update;
  if selected_session.id is null or selected_session.status <> 'submitted' then
    raise exception using errcode = '55000', message = 'Apenas chamadas submetidas podem ser reabertas.';
  end if;

  delete from public.attendance_records
  where school_id = target_school_id and attendance_session_id = target_session_id;
  get diagnostics removed_count = row_count;
  update public.attendance_sessions set status = 'reopened', submission_key = null,
    submitted_by = null, submitted_at = null, reopened_by = (select auth.uid()),
    reopened_at = now(), reopen_reason = btrim(target_reason), updated_at = now()
  where id = target_session_id;
  return jsonb_build_object('attendanceSessionId', target_session_id, 'status', 'reopened', 'removedRecordCount', removed_count);
end;
$function$;

-- private.reopen_gradebook
CREATE OR REPLACE FUNCTION private.reopen_gradebook(target_school_id uuid, target_gradebook_id uuid, reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null or not private.is_aal2() or not private.has_permission(target_school_id, 'assessment.grades.reopen') then
    raise exception using errcode = '42501', message = 'Sem autorização para reabrir o diário.';
  end if;
  if char_length(btrim(coalesce(reason, ''))) < 5 then
    raise exception using errcode = '22023', message = 'Informe o motivo da reabertura.';
  end if;
  update public.gradebooks
  set status = 'open', closed_at = null, submitted_at = null, updated_by = actor, updated_at = now()
  where school_id = target_school_id and id = target_gradebook_id and status in ('submitted', 'closed');
  if not found then
    raise exception using errcode = '22023', message = 'Diário não pode ser reaberto no estado atual.';
  end if;
  update public.grade_scores scores
  set status = 'draft', updated_by = actor, updated_at = now()
  from public.grade_items items
  where items.school_id = target_school_id and items.gradebook_id = target_gradebook_id
    and scores.school_id = items.school_id and scores.grade_item_id = items.id;
  return jsonb_build_object('gradebookId', target_gradebook_id, 'status', 'open', 'reason', btrim(reason));
end;
$function$;

-- private.request_document_signature
CREATE OR REPLACE FUNCTION private.request_document_signature(target_school_id uuid, target_document_id uuid, signer_role text, note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  signature_id uuid;
begin
  if actor is null or not private.is_aal2() or not private.has_permission(target_school_id, 'documents.signatures.sign') then
    raise exception using errcode = '42501', message = 'Sem autorização para pedir assinatura.';
  end if;
  if signer_role not in ('director', 'secretary', 'coordinator', 'other') then
    raise exception using errcode = '22023', message = 'Papel de assinante inválido.';
  end if;

  update public.issued_documents
  set requires_signature = true, signature_status = 'pending'
  where school_id = target_school_id and id = target_document_id and status = 'issued'
    and signature_status in ('not_required', 'pending', 'rejected');
  if not found then
    raise exception using errcode = '22023', message = 'Documento não pode receber pedido de assinatura.';
  end if;

  insert into public.document_signatures (school_id, issued_document_id, signer_role, requested_by, note)
  values (target_school_id, target_document_id, signer_role, actor, nullif(btrim(coalesce(note, '')), ''))
  returning id into signature_id;

  return jsonb_build_object('signatureId', signature_id, 'status', 'pending');
end;
$function$;

-- private.respond_grade_complaint
CREATE OR REPLACE FUNCTION private.respond_grade_complaint(target_school_id uuid, target_complaint_id uuid, next_status text, response_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null or not private.is_aal2() or not private.has_permission(target_school_id, 'assessment.complaints.manage') then
    raise exception using errcode = '42501', message = 'Sem autorização para responder reclamação.';
  end if;
  if next_status not in ('answered', 'accepted', 'rejected') then
    raise exception using errcode = '22023', message = 'Estado de resposta inválido.';
  end if;
  if char_length(btrim(response_text)) < 5 then
    raise exception using errcode = '22023', message = 'A resposta deve ter pelo menos 5 caracteres.';
  end if;

  update public.grade_complaints
  set status = next_status,
      response = btrim(response_text),
      responded_by = actor,
      responded_at = now()
  where school_id = target_school_id and id = target_complaint_id and status = 'open';
  if not found then
    raise exception using errcode = '22023', message = 'Reclamação não está aberta.';
  end if;

  return jsonb_build_object('complaintId', target_complaint_id, 'status', next_status);
end;
$function$;

-- private.reverse_receipt
CREATE OR REPLACE FUNCTION private.reverse_receipt(target_school_id uuid, target_receipt_id uuid, target_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  selected_receipt public.finance_receipts%rowtype;
  remaining_paid numeric(18,2);
  invoice_amount numeric(18,2);
  new_status text;
begin
  if (select auth.uid()) is null or not private.is_aal2()
     or not private.has_permission(target_school_id, 'finance.payments.reverse') then
    raise exception using errcode = '42501', message = 'Sem autorização para estornar recibos.';
  end if;
  if target_reason is null or char_length(btrim(target_reason)) < 5 then
    raise exception using errcode = '22023', message = 'Indique o motivo do estorno.';
  end if;

  select * into selected_receipt from public.finance_receipts
  where school_id = target_school_id and id = target_receipt_id and status = 'issued'
  for update;
  if selected_receipt.id is null then
    raise exception using errcode = '22023', message = 'Recibo inválido ou já estornado.';
  end if;

  update public.finance_receipts
  set status = 'reversed', reversed_at = now(), reversed_by = (select auth.uid()), reversal_reason = btrim(target_reason)
  where school_id = target_school_id and id = target_receipt_id;

  select amount into invoice_amount from public.finance_invoices
  where school_id = target_school_id and id = selected_receipt.invoice_id for update;
  select coalesce(sum(amount), 0) into remaining_paid from public.finance_receipts
  where school_id = target_school_id and invoice_id = selected_receipt.invoice_id and status = 'issued';
  new_status := case
    when remaining_paid <= 0 then 'open'
    when remaining_paid < invoice_amount then 'partially_paid'
    else 'paid'
  end;
  update public.finance_invoices set status = new_status
  where school_id = target_school_id and id = selected_receipt.invoice_id and status <> 'cancelled';

  return jsonb_build_object('receiptId', target_receipt_id, 'invoiceStatus', new_status);
end;
$function$;

-- private.review_document_request
CREATE OR REPLACE FUNCTION private.review_document_request(target_school_id uuid, target_request_id uuid, next_status text, review_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null or not private.is_aal2() or not private.has_permission(target_school_id, 'documents.requests.manage') then
    raise exception using errcode = '42501', message = 'Sem autorização para rever pedido.';
  end if;
  if next_status not in ('in_review', 'approved', 'rejected', 'cancelled') then
    raise exception using errcode = '22023', message = 'Estado de pedido inválido.';
  end if;
  update public.document_requests
  set status = next_status, reviewed_by = actor, reviewed_at = now(),
      review_note = nullif(btrim(coalesce(review_note, '')), ''), updated_at = now()
  where school_id = target_school_id and id = target_request_id
    and status in ('submitted', 'in_review', 'approved');
  if not found then
    raise exception using errcode = '22023', message = 'Pedido não pode transitar para o estado pedido.';
  end if;
  return jsonb_build_object('requestId', target_request_id, 'status', next_status);
end;
$function$;

-- private.review_grade_change
CREATE OR REPLACE FUNCTION private.review_grade_change(target_school_id uuid, target_grade_score_id uuid, approve boolean, review_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  score_row public.grade_scores%rowtype;
  book_status text;
begin
  if actor is null or not private.is_aal2() or not private.has_permission(target_school_id, 'assessment.grades.homologate') then
    raise exception using errcode = '42501', message = 'Sem autorização para aprovar alterações de nota.';
  end if;

  select * into score_row from public.grade_scores
  where school_id = target_school_id and id = target_grade_score_id for update;
  if not found or score_row.pending_score is null then
    raise exception using errcode = '22023', message = 'Não existe alteração pendente nesta nota.';
  end if;

  select gb.status into book_status
  from public.grade_items gi
  join public.gradebooks gb on gb.school_id = gi.school_id and gb.id = gi.gradebook_id
  where gi.school_id = target_school_id and gi.id = score_row.grade_item_id;
  if book_status in ('submitted', 'closed') then
    raise exception using errcode = '22023', message = 'Diário bloqueado; não é possível concluir a aprovação.';
  end if;

  if approve then
    insert into public.grade_score_history (
      school_id, grade_score_id, previous_score, new_score, reason, actor_user_id, approved_by
    ) values (
      target_school_id, score_row.id, score_row.score, score_row.pending_score,
      score_row.pending_reason || coalesce(' · ' || nullif(btrim(coalesce(review_note, '')), ''), ''),
      score_row.pending_requested_by, actor
    );
    update public.grade_scores
    set score = pending_score,
        pending_score = null, pending_reason = null, pending_requested_by = null, pending_requested_at = null,
        updated_by = actor, updated_at = now()
    where school_id = target_school_id and id = target_grade_score_id;
    return jsonb_build_object('gradeScoreId', target_grade_score_id, 'status', 'approved', 'score', score_row.pending_score);
  end if;

  insert into public.grade_score_history (
    school_id, grade_score_id, previous_score, new_score, reason, actor_user_id, approved_by
  ) values (
    target_school_id, score_row.id, score_row.score, score_row.score,
    'Alteração rejeitada: ' || score_row.pending_reason || coalesce(' · ' || nullif(btrim(coalesce(review_note, '')), ''), ''),
    score_row.pending_requested_by, actor
  );
  update public.grade_scores
  set pending_score = null, pending_reason = null, pending_requested_by = null, pending_requested_at = null,
      updated_by = actor, updated_at = now()
  where school_id = target_school_id and id = target_grade_score_id;
  return jsonb_build_object('gradeScoreId', target_grade_score_id, 'status', 'rejected', 'score', score_row.score);
end;
$function$;

-- private.revoke_school_document
CREATE OR REPLACE FUNCTION private.revoke_school_document(target_school_id uuid, target_document_id uuid, reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null or not private.is_aal2() or not private.has_permission(target_school_id, 'documents.issued.revoke') then
    raise exception using errcode = '42501', message = 'Sem autorização para revogar documento.';
  end if;
  if char_length(btrim(coalesce(reason, ''))) < 5 then
    raise exception using errcode = '22023', message = 'Motivo de revogação obrigatório.';
  end if;
  update public.issued_documents
  set status = 'revoked', revoked_at = now(), revoked_by = actor, revocation_reason = btrim(reason)
  where school_id = target_school_id and id = target_document_id and status = 'issued';
  if not found then
    raise exception using errcode = '22023', message = 'Documento não pode ser revogado.';
  end if;
  return jsonb_build_object('documentId', target_document_id, 'status', 'revoked');
end;
$function$;

-- private.revoke_school_role
CREATE OR REPLACE FUNCTION private.revoke_school_role(target_school_id uuid, target_membership_id uuid, role_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  normalized text := lower(btrim(role_code));
begin
  if actor is null or not private.is_aal2() or not private.has_permission(target_school_id, 'rbac.memberships.manage') then
    raise exception using errcode = '42501', message = 'Sem autorização para remover funções.';
  end if;
  if normalized in ('owner') then
    raise exception using errcode = '22023', message = 'A função owner não pode ser removida por esta via.';
  end if;

  delete from public.member_roles mr
  using public.roles r
  where mr.school_id = target_school_id
    and mr.membership_id = target_membership_id
    and r.school_id = mr.school_id
    and r.id = mr.role_id
    and r.code = normalized;

  if not found then
    raise exception using errcode = '22023', message = 'Atribuição de função não encontrada.';
  end if;

  return jsonb_build_object('membershipId', target_membership_id, 'roleCode', normalized, 'status', 'revoked');
end;
$function$;

-- private.round_grade
CREATE OR REPLACE FUNCTION private.round_grade(raw_value numeric, rounding_method text, decimal_places smallint)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  factor numeric := power(10::numeric, greatest(coalesce(decimal_places, 0), 0));
begin
  if raw_value is null then
    return null;
  end if;
  return case rounding_method
    when 'nearest' then round(raw_value * factor) / factor
    when 'up' then ceil(raw_value * factor) / factor
    when 'down' then floor(raw_value * factor) / factor
    else raw_value
  end;
end;
$function$;

-- private.schedule_lesson
CREATE OR REPLACE FUNCTION private.schedule_lesson(target_school_id uuid, target_class_subject_id uuid, target_weekday integer, target_starts_at time without time zone, target_ends_at time without time zone, target_room text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  selected_assignment record;
  generated_slot_id uuid;
  normalized_room text;
begin
  if (select auth.uid()) is null or not private.is_aal2()
     or not private.has_permission(target_school_id, 'academic.timetable.manage') then
    raise exception using errcode = '42501', message = 'Sem autorização para configurar horários.';
  end if;
  normalized_room := btrim(target_room);
  if target_weekday not between 1 and 7 or target_ends_at <= target_starts_at
     or char_length(normalized_room) not between 1 and 80 then
    raise exception using errcode = '22023', message = 'Bloco de horário inválido.';
  end if;

  select cs.class_group_id, cs.teacher_id, cg.campus_id
  into selected_assignment
  from public.class_subjects cs
  join public.class_groups cg on cg.school_id = cs.school_id and cg.id = cs.class_group_id
  where cs.school_id = target_school_id and cs.id = target_class_subject_id
    and cs.status = 'active' and cg.status = 'active';
  if selected_assignment.class_group_id is null then
    raise exception using errcode = '22023', message = 'Distribuição docente inválida.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_school_id::text || ':' || target_weekday::text, 0)
  );
  if exists (
    select 1
    from public.timetable_slots slot
    join public.class_subjects assignment
      on assignment.school_id = slot.school_id and assignment.id = slot.class_subject_id
    join public.class_groups scheduled_group
      on scheduled_group.school_id = assignment.school_id and scheduled_group.id = assignment.class_group_id
    where slot.school_id = target_school_id and slot.weekday = target_weekday
      and slot.status = 'active'
      and slot.starts_at < target_ends_at and slot.ends_at > target_starts_at
      and (
        assignment.class_group_id = selected_assignment.class_group_id
        or assignment.teacher_id = selected_assignment.teacher_id
        or (scheduled_group.campus_id = selected_assignment.campus_id and lower(slot.room) = lower(normalized_room))
      )
  ) then
    raise exception using errcode = '23P01', message = 'Conflito de turma, docente ou sala no horário.';
  end if;

  insert into public.timetable_slots (
    school_id, class_subject_id, weekday, starts_at, ends_at, room, created_by
  ) values (
    target_school_id, target_class_subject_id, target_weekday::smallint,
    target_starts_at, target_ends_at, normalized_room, (select auth.uid())
  ) returning id into generated_slot_id;

  return jsonb_build_object('slotId', generated_slot_id, 'status', 'active');
end;
$function$;

-- private.storage_school_id
CREATE OR REPLACE FUNCTION private.storage_school_id(object_name text)
 RETURNS uuid
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when object_name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[a-z0-9][a-z0-9_-]*/[a-z0-9][a-z0-9_-]*/[^/]+$'
      then split_part(object_name, '/', 1)::uuid
    else null
  end;
$function$;

-- private.submit_attendance
CREATE OR REPLACE FUNCTION private.submit_attendance(target_school_id uuid, target_session_id uuid, target_submission_key text, target_records jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  selected_session public.attendance_sessions%rowtype;
  expected_count integer;
  supplied_count integer;
  distinct_enrollment_count integer;
begin
  if (select auth.uid()) is null or not private.is_aal2()
     or not private.has_permission(target_school_id, 'attendance.records.take') then
    raise exception using errcode = '42501', message = 'Sem autorização para submeter a chamada.';
  end if;
  if char_length(btrim(target_submission_key)) not between 8 and 120
     or jsonb_typeof(target_records) <> 'array' then
    raise exception using errcode = '22023', message = 'Chave ou lista de presenças inválida.';
  end if;

  select * into selected_session from public.attendance_sessions
  where school_id = target_school_id and id = target_session_id for update;
  if selected_session.id is null then
    raise exception using errcode = '22023', message = 'Sessão de presença inválida.';
  end if;
  if selected_session.status = 'submitted' then
    if selected_session.submission_key = btrim(target_submission_key) then
      return jsonb_build_object(
        'attendanceSessionId', selected_session.id, 'status', 'submitted',
        'recordCount', (select count(*) from public.attendance_records where school_id = target_school_id and attendance_session_id = target_session_id),
        'idempotentReplay', true
      );
    end if;
    raise exception using errcode = '55000', message = 'A chamada já foi submetida.';
  end if;

  select count(*) into expected_count
  from public.attendance_session_roster
  where school_id = target_school_id
    and attendance_session_id = target_session_id;
  select count(*), count(distinct item->>'enrollmentId')
  into supplied_count, distinct_enrollment_count
  from jsonb_array_elements(target_records) item;
  if supplied_count <> expected_count
     or distinct_enrollment_count <> expected_count
     or exists (
       select 1 from jsonb_array_elements(target_records) item
       where item->>'status' not in ('present', 'absent', 'late', 'excused')
          or not exists (
            select 1 from public.attendance_session_roster roster
            where roster.school_id = target_school_id
              and roster.attendance_session_id = target_session_id
              and roster.enrollment_id = (item->>'enrollmentId')::uuid
          )
          or (item->>'status' = 'late' and coalesce((item->>'minutesLate')::integer, 0) not between 1 and 720)
          or (item->>'status' <> 'late' and coalesce((item->>'minutesLate')::integer, 0) <> 0)
          or (item->>'note' is not null and char_length(btrim(item->>'note')) not between 3 and 300)
     ) then
    raise exception using errcode = '22023', message = 'A chamada deve conter exatamente a pauta capturada e estados válidos.';
  end if;

  insert into public.attendance_records (
    school_id, attendance_session_id, enrollment_id, status, minutes_late, note, recorded_by
  )
  select target_school_id, target_session_id, (item->>'enrollmentId')::uuid,
    item->>'status', coalesce((item->>'minutesLate')::smallint, 0),
    nullif(btrim(item->>'note'), ''), (select auth.uid())
  from jsonb_array_elements(target_records) item;

  update public.attendance_sessions set status = 'submitted',
    submission_key = btrim(target_submission_key), submitted_by = (select auth.uid()),
    submitted_at = now(), updated_at = now()
  where school_id = target_school_id and id = target_session_id;

  return jsonb_build_object(
    'attendanceSessionId', target_session_id, 'status', 'submitted',
    'recordCount', expected_count, 'idempotentReplay', false
  );
end;
$function$;

-- private.submit_gradebook
CREATE OR REPLACE FUNCTION private.submit_gradebook(target_school_id uuid, target_gradebook_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null or not private.is_aal2() or not private.has_permission(target_school_id, 'assessment.grades.submit') then
    raise exception using errcode = '42501', message = 'Sem autorização para submeter o diário.';
  end if;
  update public.gradebooks
  set status = 'submitted', submitted_at = now(), updated_by = actor, updated_at = now()
  where school_id = target_school_id and id = target_gradebook_id and status in ('draft', 'open');
  if not found then
    raise exception using errcode = '22023', message = 'Diário não pode ser submetido no estado atual.';
  end if;
  update public.grade_scores scores
  set status = 'submitted', updated_by = actor, updated_at = now()
  from public.grade_items items
  where items.school_id = target_school_id
    and items.gradebook_id = target_gradebook_id
    and scores.school_id = items.school_id
    and scores.grade_item_id = items.id
    and scores.status = 'draft';
  return jsonb_build_object('gradebookId', target_gradebook_id, 'status', 'submitted');
end;
$function$;

-- private.transition_grade_sheet
CREATE OR REPLACE FUNCTION private.transition_grade_sheet(target_school_id uuid, target_grade_sheet_id uuid, next_status text, reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  sheet public.grade_sheets%rowtype;
  allowed boolean := false;
begin
  if actor is null or not private.is_aal2() then
    raise exception using errcode = '42501', message = 'MFA obrigatório.';
  end if;

  select * into sheet from public.grade_sheets
  where school_id = target_school_id and id = target_grade_sheet_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Pauta não encontrada.';
  end if;

  if next_status = 'submitted' and sheet.status in ('draft', 'rectified')
     and private.has_permission(target_school_id, 'assessment.grades.submit') then
    allowed := true;
    update public.grade_sheets set status = 'submitted', submitted_at = now(), updated_by = actor, updated_at = now()
    where school_id = target_school_id and id = target_grade_sheet_id;
  elsif next_status = 'in_review' and sheet.status = 'submitted'
     and private.has_permission(target_school_id, 'assessment.grades.homologate') then
    allowed := true;
    update public.grade_sheets set status = 'in_review', updated_by = actor, updated_at = now()
    where school_id = target_school_id and id = target_grade_sheet_id;
  elsif next_status = 'homologated' and sheet.status in ('submitted', 'in_review', 'rectified')
     and private.has_permission(target_school_id, 'assessment.grades.homologate') then
    allowed := true;
    update public.grade_sheets set status = 'homologated', homologated_at = now(), updated_by = actor, updated_at = now()
    where school_id = target_school_id and id = target_grade_sheet_id;
  elsif next_status = 'published' and sheet.status = 'homologated'
     and private.has_permission(target_school_id, 'assessment.grades.homologate') then
    allowed := true;
    update public.grade_sheets set status = 'published', published_at = now(), updated_by = actor, updated_at = now()
    where school_id = target_school_id and id = target_grade_sheet_id;
  elsif next_status = 'closed' and sheet.status in ('published', 'homologated')
     and private.has_permission(target_school_id, 'assessment.grades.homologate') then
    allowed := true;
    update public.grade_sheets set status = 'closed', closed_at = now(), updated_by = actor, updated_at = now()
    where school_id = target_school_id and id = target_grade_sheet_id;
  elsif next_status = 'contested' and sheet.status in ('published', 'homologated')
     and private.has_permission(target_school_id, 'assessment.complaints.manage') then
    allowed := true;
    update public.grade_sheets set status = 'contested', updated_by = actor, updated_at = now()
    where school_id = target_school_id and id = target_grade_sheet_id;
  elsif next_status = 'rectified' and sheet.status in ('contested', 'closed', 'published')
     and private.has_permission(target_school_id, 'assessment.grades.reopen') then
    if nullif(btrim(coalesce(reason, '')), '') is null then
      raise exception using errcode = '22023', message = 'Reabertura exige motivo.';
    end if;
    allowed := true;
    update public.grade_sheets
    set status = 'rectified', reopen_reason = btrim(reason), updated_by = actor, updated_at = now()
    where school_id = target_school_id and id = target_grade_sheet_id;
  end if;

  if not allowed then
    raise exception using errcode = '22023', message = 'Transição de estado da pauta não permitida.';
  end if;

  return jsonb_build_object('gradeSheetId', target_grade_sheet_id, 'status', next_status);
end;
$function$;

-- private.trg_notify_attendance_submitted
CREATE OR REPLACE FUNCTION private.trg_notify_attendance_submitted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'UPDATE'
     and old.status is distinct from new.status
     and new.status = 'submitted' then
    perform private.notify_permission_holders(
      new.school_id,
      'attendance.records.read',
      'attendance.submitted',
      'Chamada submetida',
      format('A chamada de %s foi submetida.', coalesce(new.session_date::text, 'hoje')),
      jsonb_build_object('attendanceSessionId', new.id, 'sessionDate', new.session_date),
      new.submitted_by
    );
  end if;
  return new;
end;
$function$;

-- private.trg_notify_document_issued
CREATE OR REPLACE FUNCTION private.trg_notify_document_issued()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT' and new.status = 'issued' then
    perform private.notify_permission_holders(
      new.school_id,
      'documents.issued.read',
      'document.issued',
      'Documento emitido',
      format('Foi emitido o documento %s — %s.', new.document_number, new.title),
      jsonb_build_object('documentId', new.id, 'documentNumber', new.document_number, 'studentId', new.student_id),
      new.issued_by
    );
  elsif tg_op = 'UPDATE' and old.status = 'issued' and new.status = 'revoked' then
    perform private.notify_permission_holders(
      new.school_id,
      'documents.issued.read',
      'document.revoked',
      'Documento revogado',
      format('O documento %s foi revogado.', new.document_number),
      jsonb_build_object('documentId', new.id, 'documentNumber', new.document_number),
      new.revoked_by
    );
  end if;
  return new;
end;
$function$;

-- private.trg_notify_document_request
CREATE OR REPLACE FUNCTION private.trg_notify_document_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT' and new.status in ('submitted', 'in_review') then
    perform private.notify_permission_holders(
      new.school_id,
      'documents.requests.manage',
      'document_request.submitted',
      'Novo pedido de documento',
      format('Pedido %s aguarda revisão.', coalesce(new.request_type, 'documento')),
      jsonb_build_object('requestId', new.id, 'studentId', new.student_id, 'status', new.status),
      new.requested_by
    );
  end if;
  return new;
end;
$function$;

-- private.trg_notify_grade_sheet
CREATE OR REPLACE FUNCTION private.trg_notify_grade_sheet()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'UPDATE'
     and old.status is distinct from new.status
     and new.status in ('published', 'homologated') then
    perform private.notify_permission_holders(
      new.school_id,
      'assessment.reports.read',
      'grade_sheet.' || new.status,
      case when new.status = 'published' then 'Pauta publicada' else 'Pauta homologada' end,
      format('A pauta da turma alterou o estado para %s.', new.status),
      jsonb_build_object('gradeSheetId', new.id, 'status', new.status, 'classGroupId', new.class_group_id),
      null
    );
  end if;
  return new;
end;
$function$;

-- private.trg_notify_invoice_issued
CREATE OR REPLACE FUNCTION private.trg_notify_invoice_issued()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT' and new.status in ('open', 'partially_paid', 'paid') then
    perform private.notify_permission_holders(
      new.school_id,
      'finance.invoices.read',
      'invoice.issued',
      'Nova fatura',
      format('Fatura %s emitida (valor %s AOA).', new.invoice_number, (new.amount - new.discount_amount + new.penalty_amount)::text),
      jsonb_build_object(
        'invoiceId', new.id,
        'invoiceNumber', new.invoice_number,
        'netAmount', new.amount - new.discount_amount + new.penalty_amount
      ),
      new.issued_by
    );
  end if;
  return new;
end;
$function$;

-- private.trg_notify_signature_pending
CREATE OR REPLACE FUNCTION private.trg_notify_signature_pending()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform private.notify_permission_holders(
      new.school_id,
      'documents.signatures.sign',
      'document_signature.pending',
      'Assinatura pendente',
      'Existe um documento a aguardar a sua assinatura.',
      jsonb_build_object('signatureId', new.id, 'issuedDocumentId', new.issued_document_id),
      new.requested_by
    );
  end if;
  return new;
end;
$function$;

-- private.update_enrollment_status
CREATE OR REPLACE FUNCTION private.update_enrollment_status(target_school_id uuid, target_enrollment_id uuid, next_status text, target_ended_on date DEFAULT NULL::date, target_end_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  current_row public.enrollments%rowtype;
  normalized_reason text := nullif(btrim(coalesce(target_end_reason, '')), '');
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'Autenticação obrigatória.';
  end if;
  if not private.is_aal2() then
    raise exception using errcode = '42501', message = 'MFA (AAL2) obrigatório para alterar matrículas.';
  end if;
  if not private.has_permission(target_school_id, 'students.enrollments.update') then
    raise exception using errcode = '42501', message = 'Sem permissão para atualizar matrículas.';
  end if;
  if next_status not in ('pending', 'active', 'transferred', 'completed', 'cancelled') then
    raise exception using errcode = '22023', message = 'Estado de matrícula inválido.';
  end if;

  select * into current_row
  from public.enrollments
  where school_id = target_school_id and id = target_enrollment_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Matrícula não encontrada nesta escola.';
  end if;

  if next_status in ('pending', 'active') then
    if exists (
      select 1 from public.enrollments
      where school_id = target_school_id
        and student_id = current_row.student_id
        and academic_year_id = current_row.academic_year_id
        and id <> current_row.id
        and status in ('pending', 'active')
    ) then
      raise exception using errcode = '23505', message = 'O estudante já possui matrícula corrente neste ano letivo.';
    end if;
    update public.enrollments
    set status = next_status, ended_on = null, end_reason = null, updated_by = actor
    where school_id = target_school_id and id = target_enrollment_id;
  else
    if target_ended_on is null then
      raise exception using errcode = '22023', message = 'Informe a data de término da matrícula.';
    end if;
    if target_ended_on < current_row.enrolled_on then
      raise exception using errcode = '22023', message = 'A data de término não pode ser anterior à matrícula.';
    end if;
    if normalized_reason is null or char_length(normalized_reason) < 3 then
      raise exception using errcode = '22023', message = 'Informe o motivo do encerramento (mínimo 3 caracteres).';
    end if;
    update public.enrollments
    set status = next_status, ended_on = target_ended_on, end_reason = normalized_reason, updated_by = actor
    where school_id = target_school_id and id = target_enrollment_id;
  end if;

  return jsonb_build_object(
    'enrollmentId', current_row.id,
    'status', next_status,
    'enrollmentNumber', current_row.enrollment_number
  );
end;
$function$;

-- private.update_student_case_status
CREATE OR REPLACE FUNCTION private.update_student_case_status(target_school_id uuid, target_case_id uuid, next_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null or not private.is_aal2() or not private.has_permission(target_school_id, 'documents.cases.manage') then
    raise exception using errcode = '42501', message = 'Sem autorização para actualizar processo.';
  end if;
  if next_status not in ('open', 'in_progress', 'pending_docs', 'closed', 'archived') then
    raise exception using errcode = '22023', message = 'Estado de processo inválido.';
  end if;

  update public.student_cases
  set status = next_status,
      closed_at = case when next_status in ('closed', 'archived') then now() else null end,
      updated_at = now()
  where school_id = target_school_id and id = target_case_id;
  if not found then
    raise exception using errcode = '22023', message = 'Processo não encontrado.';
  end if;
  return jsonb_build_object('caseId', target_case_id, 'status', next_status);
end;
$function$;

-- private.upsert_grade_item
CREATE OR REPLACE FUNCTION private.upsert_grade_item(target_school_id uuid, target_gradebook_id uuid, item_code text, item_name text, item_kind text, item_weight numeric, item_max_score numeric, item_assessed_on date, item_sequence smallint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  book public.gradebooks%rowtype;
  item_id uuid;
  scale public.grading_scales%rowtype;
begin
  if actor is null or not private.is_aal2() or not private.has_permission(target_school_id, 'assessment.grades.manage') then
    raise exception using errcode = '42501', message = 'Sem autorização para configurar avaliações.';
  end if;

  select * into book from public.gradebooks
  where school_id = target_school_id and id = target_gradebook_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Diário não encontrado.';
  end if;
  if book.status in ('submitted', 'closed') then
    raise exception using errcode = '22023', message = 'Diário bloqueado para novas avaliações.';
  end if;

  select gs.* into scale
  from public.assessment_rule_sets rules
  join public.grading_scales gs on gs.school_id = rules.school_id and gs.id = rules.grading_scale_id
  where rules.school_id = target_school_id and rules.id = book.rule_set_id;

  if item_max_score <= 0 or item_max_score > scale.maximum_value then
    raise exception using errcode = '22023', message = 'Pontuação máxima fora da escala da escola.';
  end if;
  if item_kind not in ('continuous', 'assignment', 'test', 'term_exam', 'exam', 'resit', 'recovery') then
    raise exception using errcode = '22023', message = 'Tipo de avaliação inválido.';
  end if;

  insert into public.grade_items (
    school_id, gradebook_id, code, name, kind, weight, max_score, assessed_on, sequence, created_by
  ) values (
    target_school_id, target_gradebook_id, upper(btrim(item_code)), btrim(item_name), item_kind,
    item_weight, item_max_score, item_assessed_on, coalesce(item_sequence, 1), actor
  )
  on conflict (school_id, gradebook_id, code) do update
    set name = excluded.name,
        kind = excluded.kind,
        weight = excluded.weight,
        max_score = excluded.max_score,
        assessed_on = excluded.assessed_on,
        sequence = excluded.sequence
  returning id into item_id;

  return jsonb_build_object('gradeItemId', item_id);
end;
$function$;

-- private.upsert_grade_score
CREATE OR REPLACE FUNCTION private.upsert_grade_score(target_school_id uuid, target_grade_item_id uuid, target_enrollment_id uuid, new_score numeric, change_reason text DEFAULT NULL::text, score_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  item public.grade_items%rowtype;
  book public.gradebooks%rowtype;
  rule public.assessment_rule_sets%rowtype;
  scale public.grading_scales%rowtype;
  existing public.grade_scores%rowtype;
  score_id uuid;
  reason text := nullif(btrim(coalesce(change_reason, '')), '');
begin
  if actor is null or not private.is_aal2() or not private.has_permission(target_school_id, 'assessment.grades.manage') then
    raise exception using errcode = '42501', message = 'Sem autorização para lançar notas.';
  end if;

  select * into item from public.grade_items
  where school_id = target_school_id and id = target_grade_item_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Avaliação não encontrada.';
  end if;

  select * into book from public.gradebooks
  where school_id = target_school_id and id = item.gradebook_id for update;
  if book.status in ('submitted', 'closed') then
    raise exception using errcode = '22023', message = 'Diário bloqueado para alteração de notas.';
  end if;

  if not exists (
    select 1 from public.enrollments
    where school_id = target_school_id and id = target_enrollment_id
      and class_group_id = book.class_group_id
      and status in ('pending', 'active')
  ) then
    raise exception using errcode = '22023', message = 'Matrícula inválida para este diário.';
  end if;

  select * into rule from public.assessment_rule_sets
  where school_id = target_school_id and id = book.rule_set_id;
  select * into scale from public.grading_scales
  where school_id = target_school_id and id = rule.grading_scale_id;

  if new_score < scale.minimum_value or new_score > least(item.max_score, scale.maximum_value) then
    raise exception using errcode = '22023', message = 'Nota fora dos limites permitidos.';
  end if;

  select * into existing from public.grade_scores
  where school_id = target_school_id and grade_item_id = target_grade_item_id and enrollment_id = target_enrollment_id
  for update;

  if found then
    if existing.status = 'locked' then
      raise exception using errcode = '22023', message = 'Nota bloqueada.';
    end if;

    if existing.score is not distinct from new_score then
      update public.grade_scores
      set note = nullif(btrim(coalesce(score_note, '')), ''),
          pending_score = null, pending_reason = null, pending_requested_by = null, pending_requested_at = null,
          updated_by = actor, updated_at = now()
      where school_id = target_school_id and id = existing.id
      returning id into score_id;
      return jsonb_build_object('gradeScoreId', score_id, 'score', new_score, 'pendingApproval', false);
    end if;

    if rule.grade_change_requires_approval then
      if reason is null then
        raise exception using errcode = '22023', message = 'Alteração de nota exige motivo.';
      end if;
      update public.grade_scores
      set pending_score = new_score,
          pending_reason = reason,
          pending_requested_by = actor,
          pending_requested_at = now(),
          note = coalesce(nullif(btrim(coalesce(score_note, '')), ''), note),
          updated_by = actor,
          updated_at = now()
      where school_id = target_school_id and id = existing.id
      returning id into score_id;
      return jsonb_build_object('gradeScoreId', score_id, 'score', existing.score, 'pendingApproval', true, 'pendingScore', new_score);
    end if;

    insert into public.grade_score_history (
      school_id, grade_score_id, previous_score, new_score, reason, actor_user_id
    ) values (
      target_school_id, existing.id, existing.score, new_score, coalesce(reason, 'Atualização de nota'), actor
    );
    update public.grade_scores
    set score = new_score,
        note = nullif(btrim(coalesce(score_note, '')), ''),
        pending_score = null, pending_reason = null, pending_requested_by = null, pending_requested_at = null,
        updated_by = actor, updated_at = now()
    where school_id = target_school_id and id = existing.id
    returning id into score_id;
  else
    insert into public.grade_scores (
      school_id, grade_item_id, enrollment_id, score, status, note, recorded_by, updated_by
    ) values (
      target_school_id, target_grade_item_id, target_enrollment_id, new_score, 'draft',
      nullif(btrim(coalesce(score_note, '')), ''), actor, actor
    ) returning id into score_id;
    insert into public.grade_score_history (
      school_id, grade_score_id, previous_score, new_score, reason, actor_user_id
    ) values (
      target_school_id, score_id, null, new_score, coalesce(reason, 'Lançamento inicial'), actor
    );
  end if;

  return jsonb_build_object('gradeScoreId', score_id, 'score', new_score, 'pendingApproval', false);
end;
$function$;


-- ═══════════════════════════════════════════════════════════════════════════
-- SCHEMA: public  (funções expostas via RPC ao cliente)
-- ═══════════════════════════════════════════════════════════════════════════


-- ── public ──────────────────────────────────────────────────────────────

-- public.act_on_document_signature
CREATE OR REPLACE FUNCTION public.act_on_document_signature(school_id uuid, signature_id uuid, status text, note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.act_on_document_signature(school_id, signature_id, status, note);
$function$;

-- public.activate_guardian_portal_link
CREATE OR REPLACE FUNCTION public.activate_guardian_portal_link(school_id uuid, guardian_person_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  person_email text;
  target_user uuid;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'Autenticação obrigatória.';
  end if;
  if not private.has_permission(school_id, 'portal.access.manage') then
    raise exception using errcode = '42501', message = 'Sem permissão para activar o portal.';
  end if;

  select lower(p.email) into person_email
  from public.people p
  where p.school_id = activate_guardian_portal_link.school_id
    and p.id = guardian_person_id
    and p.status = 'active';
  if person_email is null then
    raise exception using errcode = 'P0002', message = 'Pessoa sem e-mail activo para ligar ao portal.';
  end if;

  if not exists (
    select 1 from public.student_guardians sg
    where sg.school_id = activate_guardian_portal_link.school_id
      and sg.guardian_person_id = guardian_person_id
      and sg.valid_until is null
  ) then
    raise exception using errcode = '22023', message = 'A pessoa não é encarregado activo de nenhum estudante.';
  end if;

  select u.id into target_user
  from auth.users u
  where lower(u.email) = person_email
  limit 1;
  if target_user is null then
    raise exception using errcode = 'P0002', message = 'Ainda não existe conta SIGA com este e-mail. Peça ao encarregado para se registar/iniciar sessão e usar «Reivindicar acesso».';
  end if;

  insert into public.portal_identities (school_id, user_id, person_id, portal_role, status, linked_by)
  values (school_id, target_user, guardian_person_id, 'guardian', 'active', actor)
  on conflict (school_id, user_id) do update
    set person_id = excluded.person_id,
        status = 'active',
        revoked_at = null,
        linked_at = now(),
        linked_by = excluded.linked_by;

  insert into public.audit_logs (school_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    school_id, actor, 'portal.guardian_linked', 'portal_identities', guardian_person_id,
    jsonb_build_object('userId', target_user, 'email', person_email)
  );

  return jsonb_build_object('userId', target_user, 'personId', guardian_person_id, 'email', person_email);
end;
$function$;

-- public.activate_student_portal_link
CREATE OR REPLACE FUNCTION public.activate_student_portal_link(school_id uuid, student_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  person_id uuid;
  person_email text;
  target_user uuid;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'Autenticação obrigatória.';
  end if;
  if not private.has_permission(school_id, 'portal.access.manage') then
    raise exception using errcode = '42501', message = 'Sem permissão para activar o portal.';
  end if;

  select s.person_id, lower(p.email)
  into person_id, person_email
  from public.students s
  join public.people p on p.school_id = s.school_id and p.id = s.person_id
  where s.school_id = activate_student_portal_link.school_id
    and s.id = activate_student_portal_link.student_id
    and p.status = 'active';

  if person_id is null then
    raise exception using errcode = 'P0002', message = 'Estudante não encontrado.';
  end if;
  if person_email is null then
    raise exception using errcode = 'P0002', message = 'Estudante sem e-mail activo para ligar ao portal.';
  end if;

  select u.id into target_user
  from auth.users u
  where lower(u.email) = person_email
  limit 1;
  if target_user is null then
    raise exception using errcode = 'P0002', message = 'Ainda não existe conta SIGA com este e-mail. Peça ao estudante para se registar e usar «Reivindicar acesso de estudante».';
  end if;

  insert into public.portal_identities (school_id, user_id, person_id, portal_role, status, linked_by)
  values (school_id, target_user, person_id, 'student', 'active', actor)
  on conflict (school_id, user_id) do update
    set person_id = excluded.person_id,
        portal_role = 'student',
        status = 'active',
        revoked_at = null,
        linked_at = now(),
        linked_by = excluded.linked_by;

  insert into public.audit_logs (school_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    school_id, actor, 'portal.student_linked', 'portal_identities', student_id,
    jsonb_build_object('userId', target_user, 'personId', person_id, 'email', person_email)
  );

  return jsonb_build_object('userId', target_user, 'studentId', student_id, 'personId', person_id, 'email', person_email);
end;
$function$;

-- public.add_student_case_item
CREATE OR REPLACE FUNCTION public.add_student_case_item(school_id uuid, case_id uuid, item_kind text, request_id uuid DEFAULT NULL::uuid, issued_document_id uuid DEFAULT NULL::uuid, note_text text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.add_student_case_item(school_id, case_id, item_kind, request_id, issued_document_id, note_text);
$function$;

-- public.archive_announcement
CREATE OR REPLACE FUNCTION public.archive_announcement(school_id uuid, announcement_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'Autenticação obrigatória.';
  end if;
  if not private.has_permission(school_id, 'communication.announcements.manage') then
    raise exception using errcode = '42501', message = 'Sem permissão para arquivar anúncios.';
  end if;

  update public.announcements a
  set status = 'archived', archived_at = now(), updated_at = now()
  where a.school_id = archive_announcement.school_id
    and a.id = archive_announcement.announcement_id
    and a.status = 'published';
  if not found then
    raise exception using errcode = 'P0002', message = 'Anúncio publicado não encontrado.';
  end if;

  insert into public.audit_logs (school_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (school_id, actor, 'announcement.archived', 'announcements', announcement_id, '{}'::jsonb);

  return jsonb_build_object('announcementId', announcement_id, 'status', 'archived');
end;
$function$;

-- public.archive_school_record
CREATE OR REPLACE FUNCTION public.archive_school_record(school_id uuid, title text, classification text DEFAULT 'geral'::text, student_id uuid DEFAULT NULL::uuid, issued_document_id uuid DEFAULT NULL::uuid, case_id uuid DEFAULT NULL::uuid, retention_until date DEFAULT NULL::date, notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.archive_school_record(
    school_id, title, classification, student_id, issued_document_id, case_id, retention_until, notes
  );
$function$;

-- public.assign_school_role
CREATE OR REPLACE FUNCTION public.assign_school_role(school_id uuid, membership_id uuid, role_code text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.assign_school_role(school_id, membership_id, role_code);
$function$;

-- public.audit_alumni_self_service_claim
CREATE OR REPLACE FUNCTION public.audit_alumni_self_service_claim()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if new.auth_user_id is distinct from old.auth_user_id
     and new.auth_user_id is not null then
    insert into public.alumni_privacy_audit (
      school_id,
      alumni_id,
      auth_user_id,
      action,
      previous_value,
      new_value,
      occurred_at,
      metadata
    ) values (
      new.school_id,
      new.id,
      new.auth_user_id,
      'claim',
      jsonb_build_object(
        'auth_user_id', old.auth_user_id,
        'self_service_enabled', old.self_service_enabled
      ),
      jsonb_build_object(
        'auth_user_id', new.auth_user_id,
        'self_service_enabled', new.self_service_enabled,
        'self_service_claimed_at', new.self_service_claimed_at
      ),
      now(),
      jsonb_build_object('source', 'alumni_profiles_trigger')
    );
  end if;
  return new;
end;
$function$;

-- public.batch_issue_school_documents
CREATE OR REPLACE FUNCTION public.batch_issue_school_documents(school_id uuid, template_id uuid, student_ids uuid[], requires_signature boolean DEFAULT false, title text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.batch_issue_school_documents(school_id, template_id, student_ids, requires_signature, title);
$function$;

-- public.build_grade_sheet
CREATE OR REPLACE FUNCTION public.build_grade_sheet(school_id uuid, class_group_id uuid, term_id uuid, kind text DEFAULT 'term'::text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.build_grade_sheet(school_id, class_group_id, term_id, kind);
$function$;

-- public.cancel_invoice
CREATE OR REPLACE FUNCTION public.cancel_invoice(school_id uuid, invoice_id uuid, reason text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.cancel_invoice(school_id, invoice_id, reason);
$function$;

-- public.claim_guardian_portal
CREATE OR REPLACE FUNCTION public.claim_guardian_portal()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  actor_email text := lower(coalesce((select auth.jwt() ->> 'email'), ''));
  linked integer := 0;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'Autenticação obrigatória.';
  end if;
  if actor_email = '' then
    raise exception using errcode = '22023', message = 'A conta não tem e-mail para reivindicar o portal.';
  end if;

  insert into public.portal_identities (school_id, user_id, person_id, portal_role, status, linked_by)
  select distinct p.school_id, actor, p.id, 'guardian', 'active', actor
  from public.people p
  where p.status = 'active'
    and p.email is not null
    and lower(p.email) = actor_email
    and exists (
      select 1 from public.student_guardians sg
      where sg.school_id = p.school_id
        and sg.guardian_person_id = p.id
        and sg.valid_until is null
    )
  on conflict (school_id, user_id) do update
    set person_id = excluded.person_id,
        portal_role = 'guardian',
        status = 'active',
        revoked_at = null,
        linked_at = now(),
        linked_by = excluded.linked_by
  where public.portal_identities.status = 'revoked'
     or public.portal_identities.person_id is distinct from excluded.person_id;

  get diagnostics linked = row_count;

  return jsonb_build_object('linked', linked, 'email', actor_email);
end;
$function$;

-- public.claim_student_portal
CREATE OR REPLACE FUNCTION public.claim_student_portal()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  actor_email text := lower(coalesce((select auth.jwt() ->> 'email'), ''));
  linked integer := 0;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'Autenticação obrigatória.';
  end if;
  if actor_email = '' then
    raise exception using errcode = '22023', message = 'A conta não tem e-mail para reivindicar o portal.';
  end if;

  insert into public.portal_identities (school_id, user_id, person_id, portal_role, status, linked_by)
  select distinct p.school_id, actor, p.id, 'student', 'active', actor
  from public.people p
  join public.students s
    on s.school_id = p.school_id
   and s.person_id = p.id
  where p.status = 'active'
    and p.email is not null
    and lower(p.email) = actor_email
    and s.status in ('applicant', 'active', 'suspended')
  on conflict (school_id, user_id) do update
    set person_id = excluded.person_id,
        portal_role = 'student',
        status = 'active',
        revoked_at = null,
        linked_at = now(),
        linked_by = excluded.linked_by
  where public.portal_identities.status = 'revoked'
     or public.portal_identities.person_id is distinct from excluded.person_id
     or public.portal_identities.portal_role is distinct from 'student';

  get diagnostics linked = row_count;

  return jsonb_build_object('linked', linked, 'email', actor_email);
end;
$function$;

-- public.close_gradebook
CREATE OR REPLACE FUNCTION public.close_gradebook(school_id uuid, gradebook_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.close_gradebook(school_id, gradebook_id);
$function$;

-- public.configure_academic_structure
CREATE OR REPLACE FUNCTION public.configure_academic_structure(school_id uuid, level_codes text[], program_code text, program_name text, grade_code text, grade_name text, year_name text, starts_on date, ends_on date, terms_model text, minimum_grade numeric, maximum_grade numeric, passing_grade numeric, decimal_places integer)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.configure_academic_structure(
    school_id,
    level_codes,
    program_code,
    program_name,
    grade_code,
    grade_name,
    year_name,
    starts_on,
    ends_on,
    terms_model,
    minimum_grade,
    maximum_grade,
    passing_grade,
    decimal_places::smallint
  );
$function$;

-- public.configure_assessment_rules
CREATE OR REPLACE FUNCTION public.configure_assessment_rules(school_id uuid, continuous_weight numeric, exam_weight numeric, passing_grade numeric, maximum_absence_percentage numeric, rounding_method text, require_change_approval boolean, lock_after_publication boolean)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.configure_assessment_rules(school_id, continuous_weight, exam_weight, passing_grade, maximum_absence_percentage, rounding_method, require_change_approval, lock_after_publication);
$function$;

-- public.configure_class_subject
CREATE OR REPLACE FUNCTION public.configure_class_subject(school_id uuid, class_group_id uuid, subject_id uuid, teacher_id uuid, weekly_periods integer)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.configure_class_subject(school_id, class_group_id, subject_id, teacher_id, weekly_periods);
$function$;

-- public.configure_default_modules
CREATE OR REPLACE FUNCTION public.configure_default_modules(school_id uuid, module_codes text[])
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.configure_default_modules(school_id, module_codes);
$function$;

-- public.configure_financial_plan
CREATE OR REPLACE FUNCTION public.configure_financial_plan(school_id uuid, enrollment_amount numeric, tuition_amount numeric, due_day integer, penalty_kind text, penalty_value numeric, maximum_discount_percentage numeric, invoice_prefix text, receipt_prefix text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.configure_financial_plan(
    school_id,
    enrollment_amount,
    tuition_amount,
    due_day::smallint,
    penalty_kind,
    penalty_value,
    maximum_discount_percentage,
    invoice_prefix,
    receipt_prefix
  );
$function$;

-- public.configure_school_identity_campus
CREATE OR REPLACE FUNCTION public.configure_school_identity_campus(school_id uuid, primary_color text, secondary_color text, contrast_color text, logo_path text, campus_code text, campus_name text, campus_province text, campus_municipality text, campus_address text, official_reference text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.configure_school_identity_campus(
    school_id, primary_color, secondary_color, contrast_color, logo_path,
    campus_code, campus_name, campus_province, campus_municipality, campus_address, official_reference
  );
$function$;

-- public.configure_school_owner
CREATE OR REPLACE FUNCTION public.configure_school_owner(school_id uuid, name text, nif text, email text, phone text, province text, municipality text, address text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.configure_school_owner(school_id, name, nif, email, phone, province, municipality, address);
$function$;

-- public.create_council_minutes
CREATE OR REPLACE FUNCTION public.create_council_minutes(school_id uuid, class_group_id uuid, academic_year_id uuid, title text, body text, term_id uuid DEFAULT NULL::uuid, decided_on date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.create_council_minutes(school_id, class_group_id, academic_year_id, title, body, term_id, decided_on);
$function$;

-- public.create_document_request
CREATE OR REPLACE FUNCTION public.create_document_request(school_id uuid, student_id uuid, request_type text, purpose text, template_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.create_document_request(school_id, student_id, request_type, purpose, template_id);
$function$;

-- public.create_financial_contract
CREATE OR REPLACE FUNCTION public.create_financial_contract(school_id uuid, enrollment_id uuid, discount_percentage numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.create_financial_contract(school_id, enrollment_id, discount_percentage);
$function$;

-- public.create_grade_complaint
CREATE OR REPLACE FUNCTION public.create_grade_complaint(school_id uuid, enrollment_id uuid, reason text, deadline_on date, grade_score_id uuid DEFAULT NULL::uuid, grade_sheet_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.create_grade_complaint(school_id, enrollment_id, reason, deadline_on, grade_score_id, grade_sheet_id);
$function$;

-- public.create_student_case
CREATE OR REPLACE FUNCTION public.create_student_case(school_id uuid, student_id uuid, case_type text, title text, summary text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.create_student_case(school_id, student_id, case_type, title, summary);
$function$;

-- public.current_school_role_is
CREATE OR REPLACE FUNCTION public.current_school_role_is(p_allowed_roles text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT
    public.current_school_id() IS NOT NULL
    AND lower(public.current_profile_role()) = ANY (p_allowed_roles);
$function$;

-- public.current_teacher_can_manage_class_subject
CREATE OR REPLACE FUNCTION public.current_teacher_can_manage_class_subject(p_class_group_id uuid, p_subject_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT
    public.current_school_id() IS NOT NULL
    AND public.current_teacher_id() IS NOT NULL
    AND p_class_group_id IS NOT NULL
    AND p_subject_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.class_subjects cs
      WHERE cs.school_id = public.current_school_id()
        AND cs.class_group_id = p_class_group_id
        AND cs.subject_id = p_subject_id
        AND cs.teacher_id = public.current_teacher_id()
        AND cs.status = 'active'
    );
$function$;

-- public.current_teacher_id
CREATE OR REPLACE FUNCTION public.current_teacher_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT CASE
    WHEN count(*) = 1 THEN min(t.id::text)::uuid
    ELSE NULL::uuid
  END
  FROM public.teachers t
  LEFT JOIN public.people p ON p.id = t.person_id
  WHERE t.school_id = public.current_school_id()
    AND (t.user_id = (SELECT auth.uid()) OR p.user_id = (SELECT auth.uid()));
$function$;

-- public.current_user_can_manage_assessment_item
CREATE OR REPLACE FUNCTION public.current_user_can_manage_assessment_item(p_school_id uuid, p_class_group_id uuid, p_subject_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT
    p_school_id = public.current_school_id()
    AND public.is_school_member(p_school_id)
    AND (
      public.current_school_role_is(
        ARRAY[
          'owner','admin','administrator','administrador',
          'diretor geral','director geral',
          'coordenação pedagógica','coordenacao pedagogica',
          'secretaria','secretary'
        ]::text[]
      )
      OR (
        public.current_school_role_is(ARRAY['professor','teacher']::text[])
        AND public.current_teacher_can_manage_class_subject(p_class_group_id, p_subject_id)
      )
    );
$function$;

-- public.current_user_can_manage_assessment_score
CREATE OR REPLACE FUNCTION public.current_user_can_manage_assessment_score(p_school_id uuid, p_item_id uuid, p_enrollment_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT
    p_school_id = public.current_school_id()
    AND EXISTS (
      SELECT 1
      FROM public.siga_assessment_items ai
      JOIN public.enrollments e
        ON e.id = p_enrollment_id
       AND e.school_id = ai.school_id
       AND e.class_group_id = ai.class_group_id
      WHERE ai.id = p_item_id
        AND ai.school_id = p_school_id
        AND public.current_user_can_manage_assessment_item(
          ai.school_id,
          ai.class_group_id,
          ai.subject_id
        )
    );
$function$;

-- public.enroll_student
CREATE OR REPLACE FUNCTION public.enroll_student(school_id uuid, student_id uuid, class_group_id uuid, enrolled_on date)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.enroll_student(school_id, student_id, class_group_id, enrolled_on);
$function$;

-- public.finalize_installation
CREATE OR REPLACE FUNCTION public.finalize_installation(school_id uuid, schedule_demo_seed boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.finalize_installation(school_id, schedule_demo_seed);
$function$;

-- public.installer_database_health
CREATE OR REPLACE FUNCTION public.installer_database_health(school_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.installer_database_health(school_id);
$function$;

-- public.issue_report_cards
CREATE OR REPLACE FUNCTION public.issue_report_cards(school_id uuid, grade_sheet_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.issue_report_cards(school_id, grade_sheet_id);
$function$;

-- public.issue_school_document
CREATE OR REPLACE FUNCTION public.issue_school_document(school_id uuid, student_id uuid, template_id uuid, rendered_body text, request_id uuid DEFAULT NULL::uuid, title text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.issue_school_document(school_id, student_id, template_id, rendered_body, request_id, title);
$function$;

-- public.mark_all_notifications_read
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read(school_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  updated integer;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'Autenticação obrigatória.';
  end if;
  if not private.is_active_member(school_id) then
    raise exception using errcode = '42501', message = 'Sem associação activa à escola.';
  end if;

  update public.notifications n
  set status = 'read', read_at = coalesce(n.read_at, now())
  where n.school_id = mark_all_notifications_read.school_id
    and n.user_id = actor
    and n.channel = 'in_app'
    and n.status <> 'read';

  get diagnostics updated = row_count;
  return jsonb_build_object('updated', updated);
end;
$function$;

-- public.mark_notification_read
CREATE OR REPLACE FUNCTION public.mark_notification_read(school_id uuid, notification_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'Autenticação obrigatória.';
  end if;
  if not private.is_active_member(school_id) then
    raise exception using errcode = '42501', message = 'Sem associação activa à escola.';
  end if;

  update public.notifications n
  set status = 'read', read_at = coalesce(n.read_at, now())
  where n.school_id = mark_notification_read.school_id
    and n.id = mark_notification_read.notification_id
    and n.user_id = actor
    and n.channel = 'in_app';
  if not found then
    raise exception using errcode = 'P0002', message = 'Notificação não encontrada.';
  end if;

  return jsonb_build_object('notificationId', notification_id, 'status', 'read');
end;
$function$;

-- public.open_attendance_session
CREATE OR REPLACE FUNCTION public.open_attendance_session(school_id uuid, timetable_slot_id uuid, session_date date)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.open_attendance_session(school_id, timetable_slot_id, session_date);
$function$;

-- public.open_gradebook
CREATE OR REPLACE FUNCTION public.open_gradebook(school_id uuid, class_subject_id uuid, term_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.open_gradebook(school_id, class_subject_id, term_id);
$function$;

-- public.portal_list_my_student_profiles
CREATE OR REPLACE FUNCTION public.portal_list_my_student_profiles()
 RETURNS TABLE(school_id uuid, school_name text, student_id uuid, student_number text, full_name text, status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    s.school_id,
    sch.name,
    s.id,
    s.student_number,
    p.full_name,
    s.status
  from public.portal_identities pi
  join public.students s
    on s.school_id = pi.school_id
   and s.person_id = pi.person_id
  join public.people p
    on p.school_id = s.school_id
   and p.id = s.person_id
  join public.schools sch on sch.id = s.school_id
  where pi.user_id = (select auth.uid())
    and pi.status = 'active'
    and pi.portal_role = 'student'
    and sch.status in ('setup', 'active')
  order by sch.name, p.full_name;
$function$;

-- public.portal_list_wards
CREATE OR REPLACE FUNCTION public.portal_list_wards()
 RETURNS TABLE(school_id uuid, school_name text, student_id uuid, student_number text, full_name text, status text, relationship text, is_primary boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    s.school_id,
    sch.name,
    s.id,
    s.student_number,
    p.full_name,
    s.status,
    sg.relationship,
    sg.is_primary
  from public.portal_identities pi
  join public.student_guardians sg
    on sg.school_id = pi.school_id
   and sg.guardian_person_id = pi.person_id
   and sg.valid_until is null
  join public.students s
    on s.school_id = sg.school_id
   and s.id = sg.student_id
  join public.people p
    on p.school_id = s.school_id
   and p.id = s.person_id
  join public.schools sch on sch.id = s.school_id
  where pi.user_id = (select auth.uid())
    and pi.status = 'active'
    and pi.portal_role = 'guardian'
    and sch.status in ('setup', 'active')
  order by sch.name, p.full_name;
$function$;

-- public.portal_ward_overview
CREATE OR REPLACE FUNCTION public.portal_ward_overview(school_id uuid, student_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  result jsonb;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Autenticação obrigatória.';
  end if;
  if not private.can_access_portal_student(school_id, student_id) then
    raise exception using errcode = '42501', message = 'Sem acesso portal a este estudante.';
  end if;

  select jsonb_build_object(
    'student', jsonb_build_object(
      'id', s.id,
      'studentNumber', s.student_number,
      'status', s.status,
      'fullName', p.full_name,
      'schoolId', s.school_id,
      'schoolName', sch.name
    ),
    'enrollments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'className', cg.name,
        'classCode', cg.code,
        'status', e.status,
        'yearName', ay.name
      ) order by ay.starts_on desc nulls last)
      from public.enrollments e
      join public.class_groups cg on cg.school_id = e.school_id and cg.id = e.class_group_id
      join public.academic_years ay on ay.school_id = e.school_id and ay.id = e.academic_year_id
      where e.school_id = portal_ward_overview.school_id
        and e.student_id = portal_ward_overview.student_id
    ), '[]'::jsonb),
    'recentAttendance', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', x.session_date,
        'status', x.status,
        'subject', x.subject
      ) order by x.session_date desc)
      from (
        select
          sess.session_date,
          ar.status,
          sub.name as subject,
          ar.created_at
        from public.attendance_records ar
        join public.enrollments e
          on e.school_id = ar.school_id and e.id = ar.enrollment_id
        join public.attendance_sessions sess
          on sess.school_id = ar.school_id and sess.id = ar.attendance_session_id
        join public.class_subjects cs
          on cs.school_id = sess.school_id and cs.id = sess.class_subject_id
        join public.subjects sub
          on sub.school_id = cs.school_id and sub.id = cs.subject_id
        where ar.school_id = portal_ward_overview.school_id
          and e.student_id = portal_ward_overview.student_id
        order by sess.session_date desc, ar.created_at desc
        limit 10
      ) x
    ), '[]'::jsonb),
    'openInvoices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'invoiceNumber', fi.invoice_number,
        'dueDate', fi.due_date,
        'status', fi.status,
        'amount', fi.amount - fi.discount_amount + fi.penalty_amount
      ) order by fi.due_date)
      from public.finance_invoices fi
      join public.finance_contracts fc on fc.school_id = fi.school_id and fc.id = fi.contract_id
      where fi.school_id = portal_ward_overview.school_id
        and fc.student_id = portal_ward_overview.student_id
        and fi.status in ('open', 'partially_paid')
    ), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'documentNumber', d.document_number,
        'title', d.title,
        'status', d.status,
        'issuedAt', d.issued_at,
        'validationCode', d.validation_code
      ) order by d.issued_at desc)
      from (
        select *
        from public.issued_documents d
        where d.school_id = portal_ward_overview.school_id
          and d.student_id = portal_ward_overview.student_id
        order by d.issued_at desc
        limit 10
      ) d
    ), '[]'::jsonb),
    'latestReportCards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'termName', t.name,
        'status', rc.status,
        'averages', rc.averages,
        'issuedAt', rc.issued_at
      ) order by rc.created_at desc)
      from (
        select rc.*
        from public.report_cards rc
        join public.enrollments e on e.school_id = rc.school_id and e.id = rc.enrollment_id
        where rc.school_id = portal_ward_overview.school_id
          and e.student_id = portal_ward_overview.student_id
          and rc.status = 'issued'
        order by rc.created_at desc
        limit 5
      ) rc
      left join public.terms t on t.school_id = rc.school_id and t.id = rc.term_id
    ), '[]'::jsonb)
  )
  into result
  from public.students s
  join public.people p on p.school_id = s.school_id and p.id = s.person_id
  join public.schools sch on sch.id = s.school_id
  where s.school_id = portal_ward_overview.school_id
    and s.id = portal_ward_overview.student_id;

  if result is null then
    raise exception using errcode = 'P0002', message = 'Estudante não encontrado.';
  end if;
  return result;
end;
$function$;

-- public.publish_announcement
CREATE OR REPLACE FUNCTION public.publish_announcement(school_id uuid, title text, body text, audience text DEFAULT 'school'::text, class_group_id uuid DEFAULT NULL::uuid, role_code text DEFAULT NULL::text, priority text DEFAULT 'normal'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  new_id uuid;
  sent integer;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'Autenticação obrigatória.';
  end if;
  if not private.has_permission(school_id, 'communication.announcements.manage') then
    raise exception using errcode = '42501', message = 'Sem permissão para publicar anúncios.';
  end if;
  if audience not in ('school', 'class_group', 'role') then
    raise exception using errcode = '22023', message = 'Audiência inválida.';
  end if;
  if priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception using errcode = '22023', message = 'Prioridade inválida.';
  end if;

  insert into public.announcements (
    school_id, title, body, audience, class_group_id, role_code, priority,
    status, published_at, created_by
  ) values (
    school_id,
    btrim(title),
    btrim(body),
    audience,
    case when audience = 'class_group' then class_group_id else null end,
    case when audience = 'role' then nullif(btrim(role_code), '') else null end,
    priority,
    'published',
    now(),
    actor
  )
  returning id into new_id;

  sent := private.fanout_announcement_notifications(school_id, new_id);

  insert into public.audit_logs (school_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    school_id, actor, 'announcement.published', 'announcements', new_id,
    jsonb_build_object('audience', audience, 'priority', priority, 'notifications', sent)
  );

  return jsonb_build_object('announcementId', new_id, 'notificationsSent', sent);
end;
$function$;

-- public.publish_assessment_rule_version
CREATE OR REPLACE FUNCTION public.publish_assessment_rule_version(school_id uuid, continuous_weight numeric, exam_weight numeric, passing_grade numeric, maximum_absence_percentage numeric, rounding_method text, require_change_approval boolean, lock_after_publication boolean, key_subject_ids uuid[] DEFAULT '{}'::uuid[], key_subjects_cause_failure boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.publish_assessment_rule_version(
    school_id, continuous_weight, exam_weight, passing_grade, maximum_absence_percentage,
    rounding_method, require_change_approval, lock_after_publication, key_subject_ids, key_subjects_cause_failure
  );
$function$;

-- public.publish_document_template
CREATE OR REPLACE FUNCTION public.publish_document_template(school_id uuid, code text, name text, document_type text, body_template text, allowed_fields jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.publish_document_template(school_id, code, name, document_type, body_template, allowed_fields);
$function$;

-- public.register_payment
CREATE OR REPLACE FUNCTION public.register_payment(school_id uuid, invoice_id uuid, amount numeric, payment_method text, paid_on date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.register_payment(school_id, invoice_id, amount, payment_method, paid_on);
$function$;

-- public.register_student
CREATE OR REPLACE FUNCTION public.register_student(school_id uuid, person_id uuid, admission_date date, guardian_person_id uuid DEFAULT NULL::uuid, relationship text DEFAULT NULL::text, primary_guardian boolean DEFAULT false, financial_responsibility boolean DEFAULT false, pickup_authorization boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.register_student(
    school_id, person_id, admission_date, guardian_person_id, relationship,
    primary_guardian, financial_responsibility, pickup_authorization
  );
$function$;

-- public.register_teacher
CREATE OR REPLACE FUNCTION public.register_teacher(school_id uuid, person_id uuid, hired_on date, employment_type text, highest_qualification text, subject_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.register_teacher(
    school_id, person_id, hired_on, employment_type, highest_qualification, subject_ids
  );
$function$;

-- public.render_document_placeholders
CREATE OR REPLACE FUNCTION public.render_document_placeholders(school_id uuid, student_id uuid, body_template text)
 RETURNS text
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.render_document_placeholders(school_id, student_id, body_template);
$function$;

-- public.reopen_attendance
CREATE OR REPLACE FUNCTION public.reopen_attendance(school_id uuid, attendance_session_id uuid, reason text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.reopen_attendance(school_id, attendance_session_id, reason);
$function$;

-- public.reopen_gradebook
CREATE OR REPLACE FUNCTION public.reopen_gradebook(school_id uuid, gradebook_id uuid, reason text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.reopen_gradebook(school_id, gradebook_id, reason);
$function$;

-- public.request_document_signature
CREATE OR REPLACE FUNCTION public.request_document_signature(school_id uuid, document_id uuid, signer_role text, note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.request_document_signature(school_id, document_id, signer_role, note);
$function$;

-- public.respond_grade_complaint
CREATE OR REPLACE FUNCTION public.respond_grade_complaint(school_id uuid, complaint_id uuid, status text, response text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.respond_grade_complaint(school_id, complaint_id, status, response);
$function$;

-- public.reverse_receipt
CREATE OR REPLACE FUNCTION public.reverse_receipt(school_id uuid, receipt_id uuid, reason text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.reverse_receipt(school_id, receipt_id, reason);
$function$;

-- public.review_document_request
CREATE OR REPLACE FUNCTION public.review_document_request(school_id uuid, request_id uuid, status text, review_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.review_document_request(school_id, request_id, status, review_note);
$function$;

-- public.review_grade_change
CREATE OR REPLACE FUNCTION public.review_grade_change(school_id uuid, grade_score_id uuid, approve boolean, review_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.review_grade_change(school_id, grade_score_id, approve, review_note);
$function$;

-- public.revoke_school_document
CREATE OR REPLACE FUNCTION public.revoke_school_document(school_id uuid, document_id uuid, reason text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.revoke_school_document(school_id, document_id, reason);
$function$;

-- public.revoke_school_role
CREATE OR REPLACE FUNCTION public.revoke_school_role(school_id uuid, membership_id uuid, role_code text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.revoke_school_role(school_id, membership_id, role_code);
$function$;

-- public.rls_auto_enable
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

-- public.schedule_lesson
CREATE OR REPLACE FUNCTION public.schedule_lesson(school_id uuid, class_subject_id uuid, weekday integer, starts_at time without time zone, ends_at time without time zone, room text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.schedule_lesson(school_id, class_subject_id, weekday, starts_at, ends_at, room);
$function$;

-- public.siga_alumni_profile_completion
CREATE OR REPLACE FUNCTION public.siga_alumni_profile_completion(target alumni_profiles)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select least(100,
    (case when target.headline is not null and target.headline <> '' then 10 else 0 end) +
    (case when target.biography is not null and target.biography <> '' then 10 else 0 end) +
    (case when target.graduation_year is not null then 10 else 0 end) +
    (case when target.graduation_course is not null and target.graduation_course <> '' then 10 else 0 end) +
    (case when target."current_role" is not null and target."current_role" <> '' then 10 else 0 end) +
    (case when target.current_company is not null and target.current_company <> '' then 10 else 0 end) +
    (case when target.employment_status <> 'unknown' then 10 else 0 end) +
    (case when target.province is not null and target.province <> '' then 10 else 0 end) +
    (case when cardinality(target.skills) > 0 then 10 else 0 end) +
    (case when target.contact_consent then 10 else 0 end)
  );
$function$;

-- public.siga_refresh_alumni_profile_completion
CREATE OR REPLACE FUNCTION public.siga_refresh_alumni_profile_completion()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at := now();
  new.profile_completion := public.siga_alumni_profile_completion(new);
  return new;
end;
$function$;

-- public.submit_attendance
CREATE OR REPLACE FUNCTION public.submit_attendance(school_id uuid, attendance_session_id uuid, submission_key text, records jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.submit_attendance(school_id, attendance_session_id, submission_key, records);
$function$;

-- public.submit_gradebook
CREATE OR REPLACE FUNCTION public.submit_gradebook(school_id uuid, gradebook_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.submit_gradebook(school_id, gradebook_id);
$function$;

-- public.transition_grade_sheet
CREATE OR REPLACE FUNCTION public.transition_grade_sheet(school_id uuid, grade_sheet_id uuid, status text, reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.transition_grade_sheet(school_id, grade_sheet_id, status, reason);
$function$;

-- public.update_enrollment_status
CREATE OR REPLACE FUNCTION public.update_enrollment_status(school_id uuid, enrollment_id uuid, status text, ended_on date DEFAULT NULL::date, end_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.update_enrollment_status(school_id, enrollment_id, status, ended_on, end_reason);
$function$;

-- public.update_student_case_status
CREATE OR REPLACE FUNCTION public.update_student_case_status(school_id uuid, case_id uuid, status text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.update_student_case_status(school_id, case_id, status);
$function$;

-- public.upsert_grade_item
CREATE OR REPLACE FUNCTION public.upsert_grade_item(school_id uuid, gradebook_id uuid, code text, name text, kind text, weight numeric, max_score numeric, assessed_on date DEFAULT NULL::date, sequence smallint DEFAULT 1)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.upsert_grade_item(school_id, gradebook_id, code, name, kind, weight, max_score, assessed_on, sequence);
$function$;

-- public.upsert_grade_score
CREATE OR REPLACE FUNCTION public.upsert_grade_score(school_id uuid, grade_item_id uuid, enrollment_id uuid, score numeric, reason text DEFAULT NULL::text, note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.upsert_grade_score(school_id, grade_item_id, enrollment_id, score, reason, note);
$function$;

-- public.upsert_notification_preferences
CREATE OR REPLACE FUNCTION public.upsert_notification_preferences(school_id uuid, in_app_enabled boolean DEFAULT true, email_enabled boolean DEFAULT true, sms_enabled boolean DEFAULT false, whatsapp_enabled boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'Autenticação obrigatória.';
  end if;
  if not private.has_permission(school_id, 'communication.preferences.manage') then
    raise exception using errcode = '42501', message = 'Sem permissão para preferências.';
  end if;

  insert into public.notification_preferences (
    school_id, user_id, in_app_enabled, email_enabled, sms_enabled, whatsapp_enabled, updated_at
  ) values (
    school_id, actor, in_app_enabled, email_enabled, sms_enabled, whatsapp_enabled, now()
  )
  on conflict (school_id, user_id) do update
    set in_app_enabled = excluded.in_app_enabled,
        email_enabled = excluded.email_enabled,
        sms_enabled = excluded.sms_enabled,
        whatsapp_enabled = excluded.whatsapp_enabled,
        updated_at = now();

  return jsonb_build_object(
    'inAppEnabled', in_app_enabled,
    'emailEnabled', email_enabled,
    'smsEnabled', sms_enabled,
    'whatsappEnabled', whatsapp_enabled
  );
end;
$function$;

-- public.validate_issued_document
CREATE OR REPLACE FUNCTION public.validate_issued_document(validation_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  code text := upper(btrim(coalesce(validation_code, '')));
  doc public.issued_documents%rowtype;
  school_name text;
  student_name text;
  student_number text;
begin
  if char_length(code) < 8 then
    return jsonb_build_object('valid', false, 'reason', 'Código inválido.');
  end if;

  select * into doc from public.issued_documents
  where upper(validation_code) = code
  order by issued_at desc
  limit 1;
  if not found then
    return jsonb_build_object('valid', false, 'reason', 'Documento não encontrado.');
  end if;

  select name into school_name from public.schools where id = doc.school_id;
  select st.student_number, p.full_name into student_number, student_name
  from public.students st
  join public.people p on p.school_id = st.school_id and p.id = st.person_id
  where st.school_id = doc.school_id and st.id = doc.student_id;

  return jsonb_build_object(
    'valid', true,
    'status', doc.status,
    'documentNumber', doc.document_number,
    'documentType', doc.document_type,
    'title', doc.title,
    'templateVersion', doc.template_version,
    'issuedAt', doc.issued_at,
    'revokedAt', doc.revoked_at,
    'signatureStatus', doc.signature_status,
    'schoolName', school_name,
    'studentNumber', student_number,
    'studentName', student_name
  );
end;
$function$;
