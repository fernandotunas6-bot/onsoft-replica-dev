-- Notas e devoluções: uma transacção, auditoria incluída. Só o servidor chama,
-- depois de requireSgaWriterForWrite e do âmbito docente/turma. Sem grants ao browser.
-- A base anterior continua intacta; sem estas RPC o cliente recusa a escrita,
-- nunca regressa ao caminho não atómico. Aplicar primeiro em staging.
CREATE OR REPLACE FUNCTION public.siga_write_assessment_scores_atomic(
  p_school_id uuid, p_actor_user_id uuid, p_item_id uuid, p_rows jsonb
) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
DECLARE
  v_item public.siga_assessment_items%ROWTYPE;
  v_row record;
  v_old public.siga_assessment_scores%ROWTYPE;
  v_year uuid;
  v_term uuid;
  v_closed jsonb;
  v_count integer := 0;
BEGIN
  -- Ordem comum às duas RPC; impede também novas linhas filhas entre validação
  -- e escrita (FKs). Os fechos de linhas existentes ficam sob locks abaixo.
  PERFORM 1 FROM public.schools WHERE id = p_school_id AND status IN ('active', 'setup') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'A escola não permite alterações.'; END IF;
  PERFORM 1 FROM public.school_memberships WHERE school_id = p_school_id
    AND user_id = p_actor_user_id AND status = 'active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sem vínculo activo nesta escola.'; END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Lote de notas inválido.';
  END IF;
  SELECT * INTO v_item FROM public.siga_assessment_items
    WHERE id = p_item_id AND school_id = p_school_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Avaliação não encontrada.'; END IF;
  SELECT academic_year_id INTO v_year FROM public.class_groups
    WHERE id = v_item.class_group_id AND school_id = p_school_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Turma inválida nesta escola.'; END IF;
  SELECT value->'closedTerms' INTO v_closed FROM public.school_settings
    WHERE school_id = p_school_id AND domain = 'pedagogy' FOR SHARE;
  IF COALESCE(v_closed @> jsonb_build_array(v_item.term), false) THEN
    RAISE EXCEPTION 'O período está fechado.';
  END IF;
  SELECT id INTO v_term FROM public.terms WHERE school_id = p_school_id
    AND academic_year_id = v_year AND sequence = v_item.term FOR SHARE;
  -- Bloquear TODAS as pautas da turma, mesmo em draft: homologação concorrente
  -- deve esperar pela escrita ou ser observada antes dela.
  PERFORM 1 FROM public.grade_sheets WHERE school_id = p_school_id
    AND class_group_id = v_item.class_group_id ORDER BY id FOR SHARE;
  IF EXISTS (SELECT 1 FROM public.grade_sheets WHERE school_id = p_school_id
      AND class_group_id = v_item.class_group_id
      AND status IN ('homologated', 'published', 'closed', 'contested')
      AND (kind = 'annual' OR term_id = v_term)) THEN
    RAISE EXCEPTION 'A pauta deste período já é oficial.';
  END IF;
  IF (SELECT count(*) FROM jsonb_to_recordset(p_rows) AS x("enrollmentId" uuid, score numeric)) <>
     (SELECT count(DISTINCT "enrollmentId") FROM jsonb_to_recordset(p_rows) AS x("enrollmentId" uuid, score numeric)) THEN
    RAISE EXCEPTION 'Matrículas repetidas ou inválidas no lote.';
  END IF;
  FOR v_row IN SELECT * FROM jsonb_to_recordset(p_rows) AS x("enrollmentId" uuid, score numeric)
    ORDER BY "enrollmentId"
  LOOP
    IF v_row.score IS NOT NULL AND (v_row.score < 0 OR v_row.score > COALESCE(v_item.max_score, 20)
        OR v_row.score::text IN ('NaN', 'Infinity', '-Infinity')) THEN
      RAISE EXCEPTION 'A nota não respeita a cotação da avaliação.';
    END IF;
    PERFORM 1 FROM public.enrollments WHERE id = v_row."enrollmentId"
      AND school_id = p_school_id AND class_group_id = v_item.class_group_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Há alunos que não são da turma desta avaliação.'; END IF;
    SELECT * INTO v_old FROM public.siga_assessment_scores
      WHERE school_id = p_school_id AND item_id = p_item_id
      AND enrollment_id = v_row."enrollmentId" FOR UPDATE;
    IF FOUND THEN
      IF v_old.score IS DISTINCT FROM v_row.score THEN
        UPDATE public.siga_assessment_scores SET previous_score = v_old.score,
          score = v_row.score, recorded_by = p_actor_user_id, updated_at = now()
          WHERE id = v_old.id AND school_id = p_school_id;
        INSERT INTO public.audit_logs(school_id, actor_user_id, action, entity_type, entity_id, metadata)
          VALUES(p_school_id, p_actor_user_id, 'grades.assessment_score_changed', 'siga_assessment_scores', v_old.id,
            jsonb_build_object('item_id', p_item_id, 'enrollment_id', v_row."enrollmentId", 'from', v_old.score, 'to', v_row.score));
      END IF;
    ELSE
      INSERT INTO public.siga_assessment_scores(school_id, item_id, enrollment_id, score, recorded_by)
        VALUES(p_school_id, p_item_id, v_row."enrollmentId", v_row.score, p_actor_user_id)
        RETURNING * INTO v_old;
      INSERT INTO public.audit_logs(school_id, actor_user_id, action, entity_type, entity_id, metadata)
        VALUES(p_school_id, p_actor_user_id, 'grades.assessment_score_recorded', 'siga_assessment_scores', v_old.id,
          jsonb_build_object('item_id', p_item_id, 'enrollment_id', v_row."enrollmentId", 'to', v_row.score));
    END IF;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;
REVOKE ALL ON FUNCTION public.siga_write_assessment_scores_atomic(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.siga_write_assessment_scores_atomic(uuid, uuid, uuid, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.siga_return_task_submission_atomic(
  p_school_id uuid, p_actor_user_id uuid, p_task_id uuid, p_submission_id uuid,
  p_grade numeric, p_feedback text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
DECLARE
  v_task public.siga_class_tasks%ROWTYPE;
  v_cs public.class_subjects%ROWTYPE;
  v_sub public.siga_class_task_submissions%ROWTYPE;
  v_to_pauta boolean;
BEGIN
  PERFORM 1 FROM public.schools WHERE id = p_school_id AND status IN ('active', 'setup') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'A escola não permite alterações.'; END IF;
  PERFORM 1 FROM public.school_memberships WHERE school_id = p_school_id
    AND user_id = p_actor_user_id AND status = 'active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sem vínculo activo nesta escola.'; END IF;
  IF (p_grade IS NOT NULL AND (p_grade < 0 OR p_grade > 20 OR p_grade::text IN ('NaN', 'Infinity', '-Infinity')))
     OR length(p_feedback) > 2000 THEN RAISE EXCEPTION 'Nota ou comentário inválido.'; END IF;
  SELECT * INTO v_task FROM public.siga_class_tasks WHERE id = p_task_id AND school_id = p_school_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa não encontrada.'; END IF;
  SELECT * INTO v_cs FROM public.class_subjects WHERE id = v_task.class_subject_id AND school_id = p_school_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Disciplina da tarefa inválida.'; END IF;
  SELECT * INTO v_sub FROM public.siga_class_task_submissions
    WHERE id = p_submission_id AND task_id = p_task_id AND school_id = p_school_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entrega não encontrada.'; END IF;
  v_to_pauta := v_task.assessment_item_id IS NOT NULL AND p_grade IS NOT NULL;
  IF v_sub.status = 'returned' AND v_sub.graded_by = p_actor_user_id
      AND v_sub.grade IS NOT DISTINCT FROM p_grade AND v_sub.feedback IS NOT DISTINCT FROM p_feedback THEN
    -- A tarefa pode ter sido ligada à pauta depois da devolução. Um retry não
    -- pode anunciar uma nota que nunca foi sincronizada com essa avaliação.
    v_to_pauta := v_to_pauta AND EXISTS (
      SELECT 1 FROM public.siga_assessment_scores WHERE school_id=p_school_id
        AND item_id=v_task.assessment_item_id AND enrollment_id=v_sub.enrollment_id
        AND score IS NOT DISTINCT FROM p_grade
    );
    RETURN jsonb_build_object('pauta', v_to_pauta, 'changed', false);
  END IF;
  IF v_sub.status <> 'submitted' THEN RAISE EXCEPTION 'Esta entrega já foi devolvida ou não existe.'; END IF;
  PERFORM 1 FROM public.enrollments WHERE id = v_sub.enrollment_id
    AND school_id = p_school_id AND class_group_id = v_cs.class_group_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'A entrega não pertence à turma da tarefa.'; END IF;
  IF v_to_pauta THEN
    PERFORM 1 FROM public.siga_assessment_items WHERE id = v_task.assessment_item_id
      AND school_id = p_school_id AND class_group_id = v_cs.class_group_id
      AND subject_id = v_cs.subject_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'A avaliação não pertence à turma e disciplina da tarefa.'; END IF;
    PERFORM public.siga_write_assessment_scores_atomic(p_school_id, p_actor_user_id,
      v_task.assessment_item_id, jsonb_build_array(jsonb_build_object('enrollmentId', v_sub.enrollment_id, 'score', p_grade)));
  END IF;
  UPDATE public.siga_class_task_submissions SET status = 'returned', returned_at = now(),
    grade = p_grade, feedback = p_feedback, graded_by = p_actor_user_id, updated_by = p_actor_user_id
    WHERE id = p_submission_id AND school_id = p_school_id;
  INSERT INTO public.audit_logs(school_id, actor_user_id, action, entity_type, entity_id, metadata)
    VALUES(p_school_id, p_actor_user_id, 'academic.task_submission_returned', 'siga_class_task_submissions', p_submission_id,
      jsonb_build_object('task_id', p_task_id, 'grade', p_grade, 'pauta', v_to_pauta));
  RETURN jsonb_build_object('pauta', v_to_pauta, 'changed', true);
END;
$function$;
REVOKE ALL ON FUNCTION public.siga_return_task_submission_atomic(uuid, uuid, uuid, uuid, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.siga_return_task_submission_atomic(uuid, uuid, uuid, uuid, numeric, text) TO service_role;

-- Mudança usada SOMENTE pela organização etária. Transferências pedagógicas
-- autorizadas conservam o caminho próprio; aqui não se muda quem já tem registos.
CREATE OR REPLACE FUNCTION public.siga_reorganize_enrollment_guarded(
  p_school_id uuid, p_actor_user_id uuid, p_enrollment_id uuid,
  p_source_class_id uuid, p_target_class_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
DECLARE v_enrollment public.enrollments%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.schools WHERE id = p_school_id AND status IN ('active','setup') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'A escola não permite alterações.'; END IF;
  PERFORM 1 FROM public.school_memberships WHERE school_id = p_school_id
    AND user_id = p_actor_user_id AND status = 'active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sem vínculo activo nesta escola.'; END IF;
  -- Ordem estável entre turmas; bloqueia a criação concorrente de sessões.
  PERFORM 1 FROM public.class_groups WHERE school_id = p_school_id
    AND id IN (p_source_class_id,p_target_class_id) ORDER BY id FOR UPDATE;
  SELECT * INTO v_enrollment FROM public.enrollments WHERE id = p_enrollment_id
    AND school_id = p_school_id FOR UPDATE;
  IF NOT FOUND OR v_enrollment.class_group_id <> p_source_class_id
     OR v_enrollment.status NOT IN ('active','pending') THEN
    RAISE EXCEPTION 'A matrícula mudou. Reveja a organização das turmas.';
  END IF;
  PERFORM 1 FROM public.class_groups WHERE school_id = p_school_id AND id = p_target_class_id
    AND academic_year_id = v_enrollment.academic_year_id AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Turma de destino inválida.'; END IF;
  -- Os locks das sessões impedem uma chamada nova de surgir depois desta leitura.
  PERFORM 1 FROM public.siga_attendance_sessions WHERE school_id = p_school_id
    AND class_group_id = p_source_class_id AND academic_year_id = v_enrollment.academic_year_id
    ORDER BY id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.siga_assessment_scores WHERE school_id=p_school_id AND enrollment_id=p_enrollment_id)
    OR EXISTS (SELECT 1 FROM public.grade_scores WHERE school_id=p_school_id AND enrollment_id=p_enrollment_id)
    OR EXISTS (SELECT 1 FROM public.grade_sheet_rows WHERE school_id=p_school_id AND enrollment_id=p_enrollment_id)
    OR EXISTS (SELECT 1 FROM public.attendance_records WHERE school_id=p_school_id AND enrollment_id=p_enrollment_id)
    OR EXISTS (SELECT 1 FROM public.siga_class_task_submissions WHERE school_id=p_school_id AND enrollment_id=p_enrollment_id)
    OR EXISTS (SELECT 1 FROM public.report_cards WHERE school_id=p_school_id AND enrollment_id=p_enrollment_id)
    OR EXISTS (SELECT 1 FROM public.siga_attendance_records ar
      JOIN public.siga_attendance_sessions s ON s.id=ar.session_id AND s.school_id=ar.school_id
      WHERE ar.school_id=p_school_id AND ar.student_id=v_enrollment.student_id
        AND s.class_group_id=p_source_class_id AND s.academic_year_id=v_enrollment.academic_year_id) THEN
    RAISE EXCEPTION 'Este aluno já tem registos académicos. Não pode ser reorganizado por idade.';
  END IF;
  -- O gatilho canónico de matrícula continua a impor lotação/identidade/ano.
  UPDATE public.enrollments SET class_group_id=p_target_class_id, status='active', updated_by=p_actor_user_id
    WHERE id=p_enrollment_id AND school_id=p_school_id;
  INSERT INTO public.audit_logs(school_id,actor_user_id,action,entity_type,entity_id,metadata)
    VALUES(p_school_id,p_actor_user_id,'academic.enrollment_reorganized','enrollments',p_enrollment_id,
      jsonb_build_object('from',p_source_class_id,'to',p_target_class_id));
END;
$function$;
REVOKE ALL ON FUNCTION public.siga_reorganize_enrollment_guarded(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.siga_reorganize_enrollment_guarded(uuid,uuid,uuid,uuid,uuid) TO service_role;
