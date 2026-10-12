-- PREPARADA, NÃO APLICADA. Apenas tabelas/colunas do catálogo SGA de 07/10/2026.
-- As funções compostas reutilizam as regras existentes de cadastro/matrícula.
-- Nenhuma regra de avaliação ou obrigação financeira é criada aqui.
CREATE INDEX IF NOT EXISTS audit_logs_student_request_idx
  ON public.audit_logs (school_id, actor_user_id, request_id)
  WHERE action = 'students.enrollment_created';

CREATE OR REPLACE FUNCTION private.enroll_new_student_atomic(
  p_school_id uuid, p_request_id uuid, p_person jsonb, p_guardians jsonb,
  p_class_group_id uuid, p_academic_year_id uuid, p_admission_date date
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_person jsonb;
  v_student public.students%ROWTYPE;
  v_guardian jsonb;
  v_group public.class_groups%ROWTYPE;
  v_enrollment jsonb;
  v_previous jsonb;
  v_result jsonb;
  v_fingerprint text;
  v_limit integer;
  v_date date := COALESCE(p_admission_date, (now() AT TIME ZONE 'Africa/Luanda')::date);
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_aal2()
    OR NOT public.is_school_member(p_school_id)
    OR private.sga_app_role(p_school_id) NOT IN ('Administrador', 'Secretaria')
    OR NOT private.has_permission(p_school_id, 'students.records.create')
    OR EXISTS (SELECT 1 FROM public.staff_module_grants WHERE school_id=p_school_id
      AND user_id=auth.uid() AND module_key='pessoas' AND level IN ('Nenhum','Leitura')) THEN
    RAISE EXCEPTION 'Sem autorização para matricular. Confirme o vínculo e o 2FA.' USING ERRCODE='42501';
  END IF;
  IF p_request_id IS NULL OR jsonb_typeof(p_person) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_guardians) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_guardians) > 20
    OR ((p_class_group_id IS NULL) <> (p_academic_year_id IS NULL)) THEN
    RAISE EXCEPTION 'Dados de matrícula inválidos.' USING ERRCODE='22023';
  END IF;
  -- Serializa o mesmo pedido, inclusive quando a resposta anterior se perdeu.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_school_id::text || ':' || auth.uid()::text || ':enrollment:' || p_request_id::text, 0));
  v_fingerprint := md5(jsonb_build_object('person',p_person,'guardians',p_guardians,
    'class',p_class_group_id,'year',p_academic_year_id,'admission',p_admission_date)::text);
  SELECT metadata INTO v_previous FROM public.audit_logs
    WHERE school_id=p_school_id AND actor_user_id=auth.uid() AND request_id=p_request_id
      AND action='students.enrollment_created' ORDER BY id LIMIT 1;
  IF FOUND THEN
    IF v_previous->>'fingerprint' IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'Este pedido já foi concluído com outros dados. Abra uma nova matrícula.' USING ERRCODE='22023';
    END IF;
    RETURN v_previous->'result';
  END IF;

  -- Mesma regra de tenant-limits.ts/usage-sync.ts, aplicada também na RPC:
  -- limite do tenant prevalece sobre plano; <=0/NULL não limita; conta não-inactivos.
  -- O bloqueio serializa pedidos novos deste fluxo, mesmo com requestIds distintos.
  PERFORM 1 FROM public.schools WHERE id=p_school_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Escola não encontrada.' USING ERRCODE='22023'; END IF;
  SELECT COALESCE(t.max_students,p.max_students) INTO v_limit
    FROM public.schools s LEFT JOIN public.tenants t ON t.id=s.tenant_id
    LEFT JOIN public.plans p ON p.id=t.plan_id WHERE s.id=p_school_id;
  IF v_limit > 0 AND (SELECT count(*) FROM public.students
      WHERE school_id=p_school_id AND status<>'inactive') >= v_limit THEN
    RAISE EXCEPTION 'Limite de alunos do plano atingido. Actualize o plano no portal comercial SIGA Plus.' USING ERRCODE='23514';
  END IF;

  IF p_class_group_id IS NOT NULL THEN
    SELECT * INTO v_group FROM public.class_groups
      WHERE id=p_class_group_id AND school_id=p_school_id AND status='active' FOR UPDATE;
    IF NOT FOUND OR v_group.academic_year_id <> p_academic_year_id THEN
      RAISE EXCEPTION 'A turma tem de pertencer à escola e ao ano lectivo seleccionados.' USING ERRCODE='22023';
    END IF;
  END IF;
  -- Valida todos os encarregados antes de criar a pessoa, sem vínculos cruzados.
  IF (SELECT count(*) FROM jsonb_array_elements(p_guardians) g
      WHERE COALESCE((g->>'is_primary')::boolean,false)) > 1
    OR (SELECT count(*) FROM jsonb_array_elements(p_guardians)) <>
       (SELECT count(DISTINCT g->>'guardian_person_id') FROM jsonb_array_elements(p_guardians) g) THEN
    RAISE EXCEPTION 'Indique encarregados distintos e apenas um principal.' USING ERRCODE='22023';
  END IF;
  FOR v_guardian IN SELECT value FROM jsonb_array_elements(p_guardians) LOOP
    IF jsonb_typeof(v_guardian) IS DISTINCT FROM 'object'
      OR COALESCE(v_guardian->>'relationship','') NOT IN ('mother','father','guardian','sibling','grandparent','other')
      OR NOT EXISTS (SELECT 1 FROM public.people WHERE school_id=p_school_id
        AND id=NULLIF(v_guardian->>'guardian_person_id','')::uuid AND status='active' AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'Encarregado inválido para esta escola.' USING ERRCODE='22023';
    END IF;
  END LOOP;
  v_person := private.create_person_bundle(p_school_id,p_person,'[]'::jsonb,ARRAY['aluno'], '{}'::jsonb);
  SELECT * INTO STRICT v_student FROM public.students
    WHERE school_id=p_school_id AND person_id=(v_person->>'id')::uuid;
  -- create_person_bundle usa CURRENT_DATE; conservar a data de admissão pedida.
  IF v_date > (now() AT TIME ZONE 'Africa/Luanda')::date THEN
    RAISE EXCEPTION 'A data de admissão não pode ser futura.' USING ERRCODE='22023';
  END IF;
  UPDATE public.students SET admission_date=v_date WHERE id=v_student.id AND school_id=p_school_id;
  FOR v_guardian IN SELECT value FROM jsonb_array_elements(p_guardians) LOOP
    INSERT INTO public.student_guardians(school_id,student_id,guardian_person_id,relationship,
      is_primary,is_financially_responsible,is_pickup_authorized,created_by)
    VALUES(p_school_id,v_student.id,(v_guardian->>'guardian_person_id')::uuid,v_guardian->>'relationship',
      COALESCE((v_guardian->>'is_primary')::boolean,false),
      COALESCE((v_guardian->>'is_primary')::boolean,false),
      COALESCE((v_guardian->>'authorized_pickup')::boolean,true),auth.uid());
  END LOOP;
  IF p_class_group_id IS NOT NULL THEN
    v_enrollment := private.enroll_student(p_school_id,v_student.id,p_class_group_id,v_date);
  END IF;
  v_result := jsonb_build_object('id',v_student.id,'student_number',v_student.student_number,
    'person_id',v_student.person_id,'status',CASE WHEN v_enrollment IS NULL THEN 'applicant' ELSE 'active' END,
    'enrollment_number',v_enrollment->>'enrollmentNumber');
  INSERT INTO public.student_status_history(school_id,student_id,previous_status,new_status,reason,changed_by)
    VALUES(p_school_id,v_student.id,NULL,v_result->>'status',
      CASE WHEN v_enrollment IS NULL THEN 'Nova matrícula interna' ELSE 'Nova matrícula interna com turma' END
        || CASE WHEN NULLIF(btrim(p_person->>'notes'),'') IS NULL THEN '' ELSE E'\nObservações: ' || btrim(p_person->>'notes') END,auth.uid());
  INSERT INTO public.audit_logs(school_id,actor_user_id,action,entity_type,entity_id,request_id,metadata)
    VALUES(p_school_id,auth.uid(),'students.enrollment_created','student',v_student.id,p_request_id,
      jsonb_build_object('fingerprint',v_fingerprint,'result',v_result));
  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION private.enroll_new_student_atomic(uuid,uuid,jsonb,jsonb,uuid,uuid,date) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION private.enroll_new_student_atomic(uuid,uuid,jsonb,jsonb,uuid,uuid,date) TO authenticated;
CREATE OR REPLACE FUNCTION public.siga_enroll_new_student_atomic(
  p_school_id uuid,p_request_id uuid,p_person jsonb,p_guardians jsonb,
  p_class_group_id uuid,p_academic_year_id uuid,p_admission_date date
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $function$
  SELECT private.enroll_new_student_atomic(p_school_id,p_request_id,p_person,p_guardians,
    p_class_group_id,p_academic_year_id,p_admission_date);
$function$;
REVOKE ALL ON FUNCTION public.siga_enroll_new_student_atomic(uuid,uuid,jsonb,jsonb,uuid,uuid,date) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.siga_enroll_new_student_atomic(uuid,uuid,jsonb,jsonb,uuid,uuid,date) TO authenticated;

-- Criar/reactivar e fechar o anterior são uma só transacção.
CREATE OR REPLACE FUNCTION private.save_active_academic_year(
  p_school_id uuid,p_year_id uuid,p_name text,p_starts_on date,p_ends_on date
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_year public.academic_years%ROWTYPE;
  v_created boolean := false;
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_aal2() OR NOT public.is_school_member(p_school_id)
    OR private.sga_app_role(p_school_id) <> 'Administrador'
    OR EXISTS (SELECT 1 FROM public.staff_module_grants WHERE school_id=p_school_id
      AND user_id=auth.uid() AND module_key='pedagogica' AND level IN ('Nenhum','Leitura')) THEN
    RAISE EXCEPTION 'Sem autorização para activar o ano. Confirme o vínculo e o 2FA.' USING ERRCODE='42501';
  END IF;
  -- Também cobre a primeira criação, quando ainda não há linha em academic_years.
  PERFORM 1 FROM public.schools WHERE id=p_school_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Escola não encontrada.' USING ERRCODE='22023'; END IF;
  IF p_year_id IS NOT NULL THEN
    IF p_name IS NOT NULL OR p_starts_on IS NOT NULL OR p_ends_on IS NOT NULL THEN
      RAISE EXCEPTION 'Dados de activação inválidos.' USING ERRCODE='22023';
    END IF;
    SELECT * INTO v_year FROM public.academic_years WHERE id=p_year_id AND school_id=p_school_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ano lectivo não encontrado.' USING ERRCODE='22023'; END IF;
  ELSE
    IF COALESCE(length(btrim(p_name)),0) NOT BETWEEN 1 AND 120
      OR p_starts_on IS NULL OR p_ends_on IS NULL OR p_ends_on <= p_starts_on THEN
      RAISE EXCEPTION 'Indique o nome e as datas válidas do ano lectivo.' USING ERRCODE='22023';
    END IF;
    SELECT * INTO v_year FROM public.academic_years WHERE school_id=p_school_id AND name=btrim(p_name) FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO public.academic_years(school_id,name,starts_on,ends_on,status,created_by,updated_by)
        VALUES(p_school_id,btrim(p_name),p_starts_on,p_ends_on,'draft',auth.uid(),auth.uid()) RETURNING * INTO v_year;
      v_created := true;
    ELSE
      -- Reenvio não pode alterar as datas de um ano que já existe.
      IF v_year.starts_on IS DISTINCT FROM p_starts_on OR v_year.ends_on IS DISTINCT FROM p_ends_on THEN
        RAISE EXCEPTION 'Já existe um ano lectivo com este nome.' USING ERRCODE='23505';
      END IF;
    END IF;
  END IF;
  UPDATE public.academic_years SET status='closed',updated_by=auth.uid()
    WHERE school_id=p_school_id AND status='active' AND id<>v_year.id;
  UPDATE public.academic_years SET status='active',updated_by=auth.uid()
    WHERE school_id=p_school_id AND id=v_year.id;
  RETURN jsonb_build_object('id',v_year.id,'name',v_year.name,'created',v_created);
END;
$function$;
REVOKE ALL ON FUNCTION private.save_active_academic_year(uuid,uuid,text,date,date) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION private.save_active_academic_year(uuid,uuid,text,date,date) TO authenticated;
CREATE OR REPLACE FUNCTION public.siga_save_active_academic_year(
  p_school_id uuid,p_year_id uuid,p_name text,p_starts_on date,p_ends_on date
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $function$ SELECT private.save_active_academic_year(p_school_id,p_year_id,p_name,p_starts_on,p_ends_on); $function$;
REVOKE ALL ON FUNCTION public.siga_save_active_academic_year(uuid,uuid,text,date,date) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.siga_save_active_academic_year(uuid,uuid,text,date,date) TO authenticated;
NOTIFY pgrst, 'reload schema';
