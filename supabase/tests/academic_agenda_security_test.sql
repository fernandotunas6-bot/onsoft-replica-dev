-- Ensaio contra o SGA depois das migrações. Tudo é revertido, incluindo auditoria.
BEGIN;
DO $test$
DECLARE
  y public.academic_years%rowtype;
  event_id uuid;
  rejected boolean := false;
BEGIN
  IF has_table_privilege('authenticated','public.siga_calendar_events','SELECT')
    OR has_table_privilege('anon','public.siga_calendar_events','INSERT')
    OR NOT has_table_privilege('service_role','public.siga_calendar_events','SELECT') THEN
    RAISE EXCEPTION 'Privilégios da agenda inválidos';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.siga_calendar_events'::regclass AND relrowsecurity AND relforcerowsecurity) THEN
    RAISE EXCEPTION 'Agenda sem RLS forçada';
  END IF;
  IF pg_get_functiondef('private.enroll_student(uuid,uuid,uuid,date)'::regprocedure) NOT LIKE '%next_year_number%'
    OR pg_get_functiondef('private.enroll_student(uuid,uuid,uuid,date)'::regprocedure) NOT LIKE '%183%' THEN
    RAISE EXCEPTION 'Regressão da numeração ou da matrícula antecipada';
  END IF;
  IF has_function_privilege('authenticated','public.siga_merge_people(uuid,uuid,uuid,text,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Fusão de pessoas exposta ao browser';
  END IF;
  SELECT * INTO STRICT y FROM public.academic_years ORDER BY created_at LIMIT 1;
  INSERT INTO public.siga_calendar_events(school_id,academic_year_id,title,category,starts_on,ends_on)
  VALUES(y.school_id,y.id,'Ensaio transaccional','meeting',y.starts_on,y.starts_on)
  RETURNING id INTO event_id;
  BEGIN
    UPDATE public.siga_calendar_events SET title='Versão inválida' WHERE id=event_id;
  EXCEPTION WHEN check_violation THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Actualização sem versão aceite'; END IF;
  UPDATE public.siga_calendar_events SET title='Versão seguinte',version=2 WHERE id=event_id;
  rejected := false;
  BEGIN
    INSERT INTO public.siga_calendar_events(school_id,academic_year_id,title,category,starts_on,ends_on)
    VALUES(y.school_id,y.id,'Fora do ano','meeting',y.ends_on+1,y.ends_on+1);
  EXCEPTION WHEN check_violation THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Evento fora do ano aceite'; END IF;
  rejected := false;
  BEGIN
    INSERT INTO public.siga_calendar_events(school_id,academic_year_id,title,category,starts_on,ends_on,starts_at,ends_at,blocks_teaching)
    VALUES(y.school_id,y.id,'Interrupção inválida','closure',y.starts_on,y.starts_on,'08:00','09:00',true);
  EXCEPTION WHEN check_violation THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Interrupção parcial aceite'; END IF;
END;
$test$;
DO $enrollment$
DECLARE
  selected_student public.students%rowtype;
  base_group public.class_groups%rowtype;
  actor uuid;
  year_id uuid;
  group_id uuid;
  result jsonb;
  test_person_id uuid;
  highest_teacher_number bigint;
  rejected boolean := false;
  first_day date := (now() AT TIME ZONE 'Africa/Luanda')::date + 60;
BEGIN
  SELECT s.* INTO STRICT selected_student FROM public.students s
  WHERE s.status IN ('applicant','active') AND EXISTS (
    SELECT 1 FROM public.school_memberships m JOIN public.member_roles mr ON mr.membership_id=m.id
    JOIN public.roles r ON r.id=mr.role_id
    WHERE m.school_id=s.school_id AND m.status='active' AND r.code='owner'
  ) ORDER BY s.created_at LIMIT 1;
  SELECT m.user_id INTO STRICT actor FROM public.school_memberships m
    JOIN public.member_roles mr ON mr.membership_id=m.id JOIN public.roles r ON r.id=mr.role_id
    WHERE m.school_id=selected_student.school_id AND m.status='active' AND r.code='owner' LIMIT 1;
  SELECT * INTO STRICT base_group FROM public.class_groups WHERE school_id=selected_student.school_id AND status='active' LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'aal','aal2','role','authenticated')::text,true);
  INSERT INTO public.academic_years(school_id,name,starts_on,ends_on,status,created_by,updated_by)
  VALUES(selected_student.school_id,'Ensaio '||gen_random_uuid()::text,first_day,first_day+300,'draft',actor,actor)
  RETURNING id INTO year_id;
  INSERT INTO public.class_groups(school_id,academic_year_id,campus_id,grade_level_id,code,name,shift,capacity,status,created_by,updated_by)
  VALUES(selected_student.school_id,year_id,base_group.campus_id,base_group.grade_level_id,
    'TEST-'||left(gen_random_uuid()::text,8),'Ensaio transaccional',base_group.shift,10,'active',actor,actor)
  RETURNING id INTO group_id;
  SELECT coalesce(max(substring(employee_number from 5)::bigint),0) INTO highest_teacher_number
    FROM public.teachers WHERE school_id=selected_student.school_id AND employee_number ~* '^DOC-[0-9]{1,18}$';
  INSERT INTO private.teacher_number_sequences(school_id,next_number)
    VALUES(selected_student.school_id,greatest(1000000,highest_teacher_number+1))
    ON CONFLICT(school_id) DO UPDATE SET next_number=EXCLUDED.next_number;
  INSERT INTO public.people(school_id,full_name,sex,created_by,updated_by)
    VALUES(selected_student.school_id,'Ensaio docente transaccional','other',actor,actor) RETURNING id INTO test_person_id;
  result := private.register_teacher(selected_student.school_id,test_person_id,current_date,'part_time','master');
  IF result->>'employeeNumber' !~ '^DOC-[0-9]+$'
    OR substring(result->>'employeeNumber' from 5)::bigint <= highest_teacher_number THEN
    RAISE EXCEPTION 'Numeração docente repetida';
  END IF;
  result := private.enroll_student(selected_student.school_id,selected_student.id,group_id,first_day-60);
  IF result->>'enrolledOn' <> first_day::text OR result->>'enrollmentNumber' !~ '^1[0-9]{6}$' THEN
    RAISE EXCEPTION 'Matrícula antecipada não preservou data/numeração: %',result;
  END IF;
  BEGIN
    PERFORM private.enroll_student(selected_student.school_id,selected_student.id,group_id,first_day-184);
  EXCEPTION WHEN invalid_parameter_value THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Matrícula fora da janela antecipada aceite'; END IF;
  rejected := false;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'aal','aal1','role','authenticated')::text,true);
  BEGIN
    PERFORM private.enroll_student(selected_student.school_id,selected_student.id,group_id,first_day-60);
  EXCEPTION WHEN insufficient_privilege THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Matrícula sem MFA aceite'; END IF;
END;
$enrollment$;
SELECT 'Agenda, cadastro docente e matrícula antecipada com MFA/numeração aprovados; dados revertidos' AS result;
ROLLBACK;
