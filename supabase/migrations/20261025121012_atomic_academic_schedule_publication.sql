-- Publicação atómica: validar carga, arquivar versão anterior, criar a nova e
-- associar slots na mesma transacção. Sem alterações de linhas ao aplicar DDL.
-- Só o servidor, depois de verificar escola, grant pedagógico, papel e MFA.
BEGIN;
CREATE OR REPLACE FUNCTION public.publish_academic_schedule_atomic(
  p_school_id uuid,
  p_class_group_id uuid,
  p_academic_year_id uuid,
  p_actor uuid,
  p_valid_from date DEFAULT NULL,
  p_valid_to date DEFAULT NULL,
  p_name text DEFAULT NULL
)
RETURNS public.academic_schedules
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $publication$
DECLARE
  v_group public.class_groups%rowtype;
  v_year public.academic_years%rowtype;
  v_schedule public.academic_schedules%rowtype;
  v_version integer;
  v_start date;
  v_end date;
  v_day integer;
  v_count integer;
  v_linked integer;
  v_snapshot jsonb;
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.school_memberships m
    WHERE m.school_id=p_school_id AND m.user_id=p_actor AND m.status='active'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Sem autorização para publicar o horário.';
  END IF;

  -- A chave 7 é a primeira da operação em lote apply_timetable_plan_guarded.
  -- Os RPCs de slot usam a chave escola/dia antes das escritas. Adquirir todas
  -- impede inserir aulas enquanto validamos, sem bloquear outras escolas.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_school_id::text,7));
  FOR v_day IN 1..6 LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_school_id::text,v_day));
  END LOOP;
  SELECT * INTO v_group FROM public.class_groups
    WHERE school_id=p_school_id AND id=p_class_group_id FOR UPDATE;
  IF v_group.id IS NULL OR v_group.status <> 'active' OR v_group.academic_year_id <> p_academic_year_id THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Turma ou ano lectivo inválido para publicar.';
  END IF;
  SELECT * INTO v_year FROM public.academic_years
    WHERE school_id=p_school_id AND id=p_academic_year_id FOR SHARE;
  IF v_year.id IS NULL OR v_year.status NOT IN ('active','draft') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='O ano lectivo não aceita publicação de horários.';
  END IF;
  v_start := coalesce(p_valid_from,greatest(v_year.starts_on,(now() AT TIME ZONE 'Africa/Luanda')::date));
  v_end := coalesce(p_valid_to,v_year.ends_on);
  IF v_start < v_year.starts_on OR v_end > v_year.ends_on OR v_end < v_start THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='A validade do horário tem de estar dentro do ano lectivo.';
  END IF;
  IF p_name IS NOT NULL AND char_length(btrim(p_name)) > 160 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='O nome do horário é demasiado longo.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.terms term WHERE term.school_id=p_school_id AND term.academic_year_id=p_academic_year_id
      AND term.starts_on <= v_end AND term.ends_on >= v_start
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Configure os períodos lectivos antes de publicar o horário.';
  END IF;
  PERFORM cs.id FROM public.class_subjects cs
    WHERE cs.school_id=p_school_id AND cs.class_group_id=p_class_group_id
    ORDER BY cs.id FOR UPDATE;
  PERFORM t.id FROM public.timetable_slots t JOIN public.class_subjects cs ON cs.id=t.class_subject_id
    WHERE t.school_id=p_school_id AND cs.school_id=p_school_id AND cs.class_group_id=p_class_group_id
    ORDER BY t.id FOR UPDATE OF t;
  IF NOT EXISTS (
    SELECT 1 FROM public.class_subjects cs WHERE cs.school_id=p_school_id
      AND cs.class_group_id=p_class_group_id AND cs.status='active'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Associe disciplinas activas à turma antes de publicar o horário.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.class_subjects cs LEFT JOIN public.teachers teacher
      ON teacher.id=cs.teacher_id AND teacher.school_id=cs.school_id AND teacher.status='active'
    JOIN public.subjects subject ON subject.id=cs.subject_id AND subject.school_id=cs.school_id
    WHERE cs.school_id=p_school_id AND cs.class_group_id=p_class_group_id AND cs.status='active'
      AND (teacher.id IS NULL OR subject.status <> 'active')
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Atribua docentes e disciplinas activos antes de publicar o horário.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.class_subjects cs
    LEFT JOIN public.timetable_slots t ON t.class_subject_id=cs.id AND t.school_id=cs.school_id AND t.status='active'
    WHERE cs.school_id=p_school_id AND cs.class_group_id=p_class_group_id AND cs.status='active'
    GROUP BY cs.id,cs.weekly_periods
    HAVING cs.weekly_periods IS NULL OR cs.weekly_periods <= 0 OR count(t.id) <> cs.weekly_periods
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='A carga semanal do horário não corresponde às disciplinas da turma.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.timetable_slots own
    JOIN public.class_subjects a ON a.id=own.class_subject_id AND a.school_id=own.school_id
    JOIN public.timetable_slots other ON other.school_id=own.school_id AND other.id <> own.id
      AND other.status='active' AND other.weekday=own.weekday
      AND other.starts_at < own.ends_at AND own.starts_at < other.ends_at
    JOIN public.class_subjects b ON b.id=other.class_subject_id AND b.school_id=other.school_id
    WHERE own.school_id=p_school_id AND a.class_group_id=p_class_group_id AND a.status='active' AND own.status='active'
      AND (a.class_group_id=b.class_group_id OR (a.teacher_id IS NOT NULL AND a.teacher_id=b.teacher_id)
        OR (own.room_id IS NOT NULL AND own.room_id=other.room_id)
        OR (private.timetable_room_is_explicit(own.room) AND lower(btrim(own.room))=lower(btrim(other.room))))
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Resolva os conflitos de turma, docente ou sala antes de publicar.';
  END IF;
  SELECT count(*),jsonb_agg(jsonb_build_object(
    'slot_id',t.id,'class_subject_id',cs.id,'class_group_id',cs.class_group_id,
    'subject_id',cs.subject_id,'teacher_id',cs.teacher_id,'weekday',t.weekday,
    'starts_at',t.starts_at,'ends_at',t.ends_at,'room',t.room,'room_id',t.room_id,'shift_id',t.shift_id
  ) ORDER BY t.weekday,t.starts_at,t.id)
  INTO v_count,v_snapshot FROM public.timetable_slots t
    JOIN public.class_subjects cs ON cs.id=t.class_subject_id AND cs.school_id=t.school_id
    WHERE t.school_id=p_school_id AND cs.class_group_id=p_class_group_id AND cs.status='active' AND t.status='active';
  IF v_count=0 THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Adicione pelo menos uma aula activa antes de publicar o horário.';
  END IF;
  SELECT coalesce(max(version_number),0)+1 INTO v_version FROM public.academic_schedules
    WHERE school_id=p_school_id AND class_group_id=p_class_group_id;
  UPDATE public.academic_schedules SET status='archived',updated_by=p_actor
    WHERE school_id=p_school_id AND class_group_id=p_class_group_id AND status='published';
  INSERT INTO public.academic_schedules(
    school_id,academic_year_id,class_group_id,version_number,name,status,
    valid_from,valid_to,published_at,published_by,created_by,updated_by,snapshot,metrics
  ) VALUES (
    p_school_id,p_academic_year_id,p_class_group_id,v_version,
    coalesce(nullif(btrim(p_name),''),'Horário V'||v_version),'published',
    v_start,v_end,now(),p_actor,p_actor,p_actor,v_snapshot,jsonb_build_object('lessonCount',v_count)
  ) RETURNING * INTO v_schedule;
  UPDATE public.timetable_slots t SET schedule_id=v_schedule.id,updated_by=p_actor
    FROM public.class_subjects cs WHERE cs.id=t.class_subject_id AND cs.school_id=t.school_id
      AND t.school_id=p_school_id AND cs.class_group_id=p_class_group_id AND cs.status='active' AND t.status='active';
  GET DIAGNOSTICS v_linked=ROW_COUNT;
  IF v_linked <> v_count THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='O horário mudou durante a publicação; tente novamente.';
  END IF;
  INSERT INTO public.audit_logs(school_id,actor_user_id,action,entity_type,entity_id,metadata)
    VALUES(p_school_id,p_actor,'academic.schedule.published','academic_schedule',v_schedule.id,
      jsonb_build_object('class_group_id',p_class_group_id,'version_number',v_version,'lesson_count',v_count));
  RETURN v_schedule;
END;
$publication$;
REVOKE ALL ON FUNCTION public.publish_academic_schedule_atomic(uuid,uuid,uuid,uuid,date,date,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.publish_academic_schedule_atomic(uuid,uuid,uuid,uuid,date,date,text) TO service_role;
COMMIT;
NOTIFY pgrst,'reload schema';
