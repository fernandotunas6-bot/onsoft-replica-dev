-- Juntar disciplinas duplicadas da mesma escola («Matemática», «Matematica»,
-- «MAT») numa só, sem perder ligações nem notas.
--
-- public.merge_school_subjects(escola, a_manter, a_juntar[]) passa para a
-- disciplina a manter tudo o que aponta para as outras e desactiva-as
-- (status 'inactive'; não apaga — o histórico e a auditoria ficam).
--
-- Uma só transacção: qualquer erro, incluindo uma restrição da produção que
-- o repositório não conhece ou o gatilho de período fechado das avaliações,
-- desfaz tudo.
--
-- Recusa à partida, com a razão, o que juntar perderia ou misturaria:
--   - as duas disciplinas na mesma turma (cada uma tem a sua pauta);
--   - o mesmo aluno inscrito no mesmo exame nas duas;
--   - competências com o mesmo código no mesmo nível nas duas;
--   - disciplinas em planos do ensino superior (`program_subjects` tem a
--     identidade imutável e inscrições por cadeira).
-- Nas tabelas que só ligam (currículos, professores, disciplinas-chave),
-- uma ligação repetida é retirada e fica a da disciplina a manter.
--
-- Acesso: chamada pelo utilizador (cliente com RLS), não pelo servidor
-- privilegiado. A própria função exige sessão com 2FA (is_aal2) e a
-- permissão academic.subjects.manage na escola da linha — a mesma regra da
-- política de UPDATE de `subjects`. SECURITY DEFINER para mexer nas tabelas
-- de ligação numa só transacção; as verificações vêm antes de tudo.
--
-- Idempotente (CREATE OR REPLACE). Ensaio: tests/sql/merge-school-subjects.mjs.

CREATE OR REPLACE FUNCTION public.merge_school_subjects(
  target_school_id uuid,
  keep_subject_id uuid,
  merge_subject_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_ids uuid[];
  v_all uuid[];
  v_conflict text;
  v_counts jsonb := '{}'::jsonb;
  v_n integer;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Autenticação obrigatória.';
  END IF;
  IF NOT private.is_aal2() THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Juntar disciplinas exige 2FA activo nesta sessão.';
  END IF;
  IF NOT private.has_permission(target_school_id, 'academic.subjects.manage') THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Sem permissão para gerir as disciplinas desta escola.';
  END IF;

  v_ids := ARRAY(
    SELECT DISTINCT x FROM unnest(coalesce(merge_subject_ids, '{}'::uuid[])) AS x
    WHERE x IS NOT NULL AND x <> keep_subject_id
  );
  IF cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Escolha pelo menos uma disciplina para juntar.';
  END IF;
  IF cardinality(v_ids) > 20 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Junte no máximo 20 disciplinas de cada vez.';
  END IF;
  v_all := v_ids || keep_subject_id;

  -- Todas da escola e não apagadas; bloqueadas até ao fim da transacção.
  PERFORM 1 FROM public.subjects
  WHERE school_id = target_school_id AND id = ANY (v_all)
  FOR UPDATE;
  SELECT count(*) INTO v_n FROM public.subjects
  WHERE school_id = target_school_id AND id = ANY (v_all) AND deleted_at IS NULL;
  IF v_n <> cardinality(v_all) THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'Uma das disciplinas não existe nesta escola ou foi apagada.';
  END IF;

  -- ── Recusas ──────────────────────────────────────────────────────────────
  IF EXISTS (
    SELECT 1 FROM public.program_subjects
    WHERE school_id = target_school_id AND subject_id = ANY (v_ids)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'Uma das disciplinas a juntar está em planos do ensino superior: não pode ser junta aqui.';
  END IF;

  SELECT string_agg(DISTINCT cg.name, ', ' ORDER BY cg.name) INTO v_conflict
  FROM (
    SELECT class_group_id FROM public.class_subjects
    WHERE school_id = target_school_id AND subject_id = ANY (v_all)
    GROUP BY class_group_id HAVING count(*) > 1
  ) dup
  JOIN public.class_groups cg ON cg.id = dup.class_group_id;
  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = format(
        'As disciplinas estão juntas na mesma turma (%s), cada uma com a sua pauta. Retire uma delas da turma primeiro.',
        v_conflict
      );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.siga_exam_registrations
    WHERE school_id = target_school_id AND subject_id = ANY (v_all)
    GROUP BY session_id, enrollment_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'Há alunos inscritos no mesmo exame nas duas disciplinas. Anule uma das inscrições primeiro.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.siga_competencies
    WHERE school_id = target_school_id AND subject_id = ANY (v_all)
    GROUP BY coalesce(grade_level_id, '00000000-0000-0000-0000-000000000000'::uuid), code
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'As disciplinas têm competências com o mesmo código no mesmo nível. Mude um dos códigos primeiro.';
  END IF;

  -- ── Ligações repetidas: fica a da disciplina a manter ───────────────────
  WITH ranked AS (
    SELECT id, row_number() OVER (
      PARTITION BY curriculum_id
      ORDER BY (subject_id = keep_subject_id) DESC, (deleted_at IS NULL) DESC, created_at, id
    ) AS rn
    FROM public.curriculum_subjects
    WHERE school_id = target_school_id AND subject_id = ANY (v_all)
  )
  DELETE FROM public.curriculum_subjects c USING ranked r WHERE c.id = r.id AND r.rn > 1;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('curriculum_subjects_removed', v_n);

  WITH ranked AS (
    SELECT id, row_number() OVER (
      PARTITION BY teacher_id, valid_from
      ORDER BY (subject_id = keep_subject_id) DESC, created_at, id
    ) AS rn
    FROM public.teacher_subjects
    WHERE school_id = target_school_id AND subject_id = ANY (v_all)
  )
  DELETE FROM public.teacher_subjects t USING ranked r WHERE t.id = r.id AND r.rn > 1;
  -- Uma só atribuição em vigor por professor e disciplina (teacher_subjects_active_uidx).
  WITH ranked AS (
    SELECT id, row_number() OVER (
      PARTITION BY teacher_id
      ORDER BY (subject_id = keep_subject_id) DESC, valid_from DESC, created_at, id
    ) AS rn
    FROM public.teacher_subjects
    WHERE school_id = target_school_id AND subject_id = ANY (v_all) AND valid_until IS NULL
  )
  DELETE FROM public.teacher_subjects t USING ranked r WHERE t.id = r.id AND r.rn > 1;

  WITH ranked AS (
    SELECT id, row_number() OVER (
      PARTITION BY rule_set_id
      ORDER BY (subject_id = keep_subject_id) DESC, created_at, id
    ) AS rn
    FROM public.assessment_key_subjects
    WHERE school_id = target_school_id AND subject_id = ANY (v_all)
  )
  DELETE FROM public.assessment_key_subjects a USING ranked r WHERE a.id = r.id AND r.rn > 1;

  -- ── Passar tudo para a disciplina a manter ──────────────────────────────
  UPDATE public.class_subjects SET subject_id = keep_subject_id, updated_by = v_actor
  WHERE school_id = target_school_id AND subject_id = ANY (v_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('class_subjects', v_n);

  UPDATE public.curriculum_subjects SET subject_id = keep_subject_id, updated_by = v_actor
  WHERE school_id = target_school_id AND subject_id = ANY (v_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('curriculum_subjects', v_n);

  UPDATE public.teacher_subjects SET subject_id = keep_subject_id
  WHERE school_id = target_school_id AND subject_id = ANY (v_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('teacher_subjects', v_n);

  UPDATE public.assessment_key_subjects SET subject_id = keep_subject_id
  WHERE school_id = target_school_id AND subject_id = ANY (v_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('assessment_key_subjects', v_n);

  UPDATE public.siga_assessment_items SET subject_id = keep_subject_id
  WHERE school_id = target_school_id AND subject_id = ANY (v_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('siga_assessment_items', v_n);

  UPDATE public.siga_attendance_sessions SET subject_id = keep_subject_id
  WHERE school_id = target_school_id AND subject_id = ANY (v_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('siga_attendance_sessions', v_n);

  UPDATE public.siga_competencies SET subject_id = keep_subject_id
  WHERE school_id = target_school_id AND subject_id = ANY (v_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('siga_competencies', v_n);

  UPDATE public.siga_exam_registrations SET subject_id = keep_subject_id
  WHERE school_id = target_school_id AND subject_id = ANY (v_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('siga_exam_registrations', v_n);

  UPDATE public.siga_lesson_plans SET subject_id = keep_subject_id
  WHERE school_id = target_school_id AND subject_id = ANY (v_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('siga_lesson_plans', v_n);

  -- ── Desactivar as juntas (não apagar) ───────────────────────────────────
  UPDATE public.subjects SET status = 'inactive', updated_by = v_actor
  WHERE school_id = target_school_id AND id = ANY (v_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN v_counts || jsonb_build_object('merged', v_n, 'keep', keep_subject_id);
END;
$$;

REVOKE ALL ON FUNCTION public.merge_school_subjects(uuid, uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_school_subjects(uuid, uuid, uuid[]) TO authenticated, service_role;
