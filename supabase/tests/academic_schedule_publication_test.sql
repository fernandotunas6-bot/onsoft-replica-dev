-- Apenas ensaio transaccional: nenhuma pessoa, turma, versão ou auditoria é persistida.
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.fail_schedule_link() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('siga.test.fail_schedule_link',true)='on' THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Falha provocada ao associar aulas';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER zz_test_fail_schedule_link BEFORE UPDATE OF schedule_id ON public.timetable_slots
FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_schedule_link();
DO $test$
DECLARE
  base_group public.class_groups%rowtype;
  actor uuid;
  year_id uuid;
  group_id uuid;
  person_id uuid;
  teacher_id uuid;
  subject_id uuid;
  assignment_id uuid;
  slot_id uuid;
  first_version public.academic_schedules%rowtype;
  second_version public.academic_schedules%rowtype;
  starts date := (now() AT TIME ZONE 'Africa/Luanda')::date + 60;
  rejected boolean := false;
  affected integer;
  session_id uuid;
BEGIN
  IF has_function_privilege('authenticated','public.publish_academic_schedule_atomic(uuid,uuid,uuid,uuid,date,date,text)','EXECUTE')
    OR has_function_privilege('anon','public.publish_academic_schedule_atomic(uuid,uuid,uuid,uuid,date,date,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Publicação exposta ao browser';
  END IF;
  SELECT g.* INTO STRICT base_group FROM public.class_groups g
  WHERE g.status='active' AND EXISTS (
    SELECT 1 FROM public.school_memberships m JOIN public.member_roles mr ON mr.membership_id=m.id
      JOIN public.roles r ON r.id=mr.role_id
    WHERE m.school_id=g.school_id AND m.status='active' AND r.code='owner'
  ) ORDER BY g.created_at LIMIT 1;
  SELECT m.user_id INTO STRICT actor FROM public.school_memberships m
    JOIN public.member_roles mr ON mr.membership_id=m.id JOIN public.roles r ON r.id=mr.role_id
    WHERE m.school_id=base_group.school_id AND m.status='active' AND r.code='owner' LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'aal','aal2','role','authenticated')::text,true);
  INSERT INTO public.academic_years(school_id,name,starts_on,ends_on,status,created_by,updated_by)
    VALUES(base_group.school_id,'Ensaio publicação '||gen_random_uuid(),starts,starts+300,'draft',actor,actor) RETURNING id INTO year_id;
  INSERT INTO public.terms(school_id,academic_year_id,name,sequence,starts_on,ends_on,created_by,updated_by)
    VALUES(base_group.school_id,year_id,'Semestre de ensaio',1,starts,starts+300,actor,actor);
  INSERT INTO public.class_groups(school_id,academic_year_id,campus_id,grade_level_id,code,name,shift,capacity,status,created_by,updated_by)
    VALUES(base_group.school_id,year_id,base_group.campus_id,base_group.grade_level_id,'TP-'||left(gen_random_uuid()::text,8),'Turma de ensaio',base_group.shift,10,'active',actor,actor) RETURNING id INTO group_id;
  INSERT INTO public.people(school_id,full_name,sex,created_by,updated_by)
    VALUES(base_group.school_id,'Docente de ensaio transaccional','other',actor,actor) RETURNING id INTO person_id;
  teacher_id := (private.register_teacher(base_group.school_id,person_id,current_date,'part_time','master')->>'teacherId')::uuid;
  INSERT INTO public.subjects(school_id,code,name,created_by,updated_by)
    VALUES(base_group.school_id,'TP-'||left(gen_random_uuid()::text,8),'Disciplina de ensaio',actor,actor) RETURNING id INTO subject_id;
  INSERT INTO public.class_subjects(school_id,class_group_id,subject_id,teacher_id,weekly_periods,created_by,updated_by)
    VALUES(base_group.school_id,group_id,subject_id,teacher_id,1,actor,actor) RETURNING id INTO assignment_id;
  INSERT INTO public.timetable_slots(school_id,class_subject_id,weekday,starts_at,ends_at,room,status,created_by,updated_by)
    VALUES(base_group.school_id,assignment_id,7,'23:00','23:45','S/N','active',actor,actor) RETURNING id INTO slot_id;
  -- O RPC corre com a mesma role de base de dados usada pelo servidor.
  PERFORM set_config('request.jwt.claim.sub','',true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','service_role')::text,true);
  PERFORM set_config('role','service_role',true);
  first_version := public.publish_academic_schedule_atomic(base_group.school_id,group_id,year_id,actor,starts,starts+300,'Ensaio V1');
  IF first_version.version_number<>1 OR jsonb_array_length(first_version.snapshot)<>1
    OR (SELECT schedule_id FROM public.timetable_slots WHERE id=slot_id)<>first_version.id THEN
    RAISE EXCEPTION 'Primeira publicação inválida';
  END IF;
  PERFORM set_config('siga.test.fail_schedule_link','on',true);
  BEGIN
    PERFORM public.publish_academic_schedule_atomic(base_group.school_id,group_id,year_id,actor,starts,starts+300,'Ensaio falha');
  EXCEPTION WHEN check_violation THEN rejected := true;
  END;
  PERFORM set_config('siga.test.fail_schedule_link','off',true);
  IF NOT rejected OR (SELECT count(*) FROM public.academic_schedules WHERE class_group_id=group_id)<>1
    OR (SELECT status FROM public.academic_schedules WHERE id=first_version.id)<>'published'
    OR (SELECT schedule_id FROM public.timetable_slots WHERE id=slot_id)<>first_version.id THEN
    RAISE EXCEPTION 'Uma falha na associação deixou publicação parcial';
  END IF;
  second_version := public.publish_academic_schedule_atomic(base_group.school_id,group_id,year_id,actor,starts,starts+300,'Ensaio V2');
  IF second_version.version_number<>2 OR (SELECT count(*) FROM public.academic_schedules WHERE class_group_id=group_id AND status='published')<>1
    OR (SELECT status FROM public.academic_schedules WHERE id=first_version.id)<>'archived' THEN
    RAISE EXCEPTION 'Versionamento inválido';
  END IF;
  -- Mesmo alvo ON CONFLICT do PostgREST: não actualiza uma chamada concluída.
  INSERT INTO public.siga_attendance_sessions(school_id,academic_year_id,class_group_id,subject_id,teacher_id,timetable_slot_id,lesson_date,starts_at,ends_at,status,created_by)
    VALUES(base_group.school_id,year_id,group_id,subject_id,teacher_id,slot_id,starts,'23:00','23:45','completed',actor)
    ON CONFLICT (school_id,timetable_slot_id,lesson_date) DO NOTHING RETURNING id INTO session_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected<>1 OR session_id IS NULL THEN RAISE EXCEPTION 'Sessão de ensaio não criada'; END IF;
  INSERT INTO public.siga_attendance_sessions(school_id,academic_year_id,class_group_id,subject_id,teacher_id,timetable_slot_id,lesson_date,starts_at,ends_at,status,created_by)
    VALUES(base_group.school_id,year_id,group_id,subject_id,teacher_id,slot_id,starts,'22:00','22:45','pending',actor)
    ON CONFLICT (school_id,timetable_slot_id,lesson_date) DO NOTHING;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected<>0 OR (SELECT count(*) FROM public.siga_attendance_sessions WHERE timetable_slot_id=slot_id)<>1
    OR NOT EXISTS (SELECT 1 FROM public.siga_attendance_sessions s WHERE s.id=session_id AND s.status='completed' AND s.starts_at='23:00') THEN
    RAISE EXCEPTION 'Ressincronização duplicou ou substituiu uma sessão existente';
  END IF;
  UPDATE public.class_subjects SET weekly_periods=2 WHERE id=assignment_id;
  rejected := false;
  BEGIN
    PERFORM public.publish_academic_schedule_atomic(base_group.school_id,group_id,year_id,actor,starts,starts+300,'Ensaio carga inválida');
  EXCEPTION WHEN check_violation THEN rejected := true;
  END;
  IF NOT rejected OR (SELECT count(*) FROM public.academic_schedules WHERE class_group_id=group_id)<>2 THEN
    RAISE EXCEPTION 'Carga inválida mudou a versão';
  END IF;
  rejected := false;
  BEGIN
    PERFORM public.publish_academic_schedule_atomic(base_group.school_id,group_id,year_id,actor,starts-1,starts+300,'Ensaio datas inválidas');
  EXCEPTION WHEN invalid_parameter_value THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Validade fora do ano aceite'; END IF;
END;
$test$;
SELECT 'Publicação e presenças: versões, snapshot, rollback, carga, datas, privilégios e conflito sem sobrescrita aprovados' AS result;

ROLLBACK;
