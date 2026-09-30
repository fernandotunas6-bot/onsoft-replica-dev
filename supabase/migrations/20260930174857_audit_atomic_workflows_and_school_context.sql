-- Audit remediation. Additive, idempotent; existing tables and functions preserved.
-- Request school is a preference, never an authority: validate membership.
CREATE OR REPLACE FUNCTION public.current_school_id()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_requested text := NULLIF(COALESCE(NULLIF(current_setting('request.headers', true), ''), '{}')::jsonb->>'x-siga-school-id', '');
  v_school uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  IF v_requested IS NOT NULL THEN
    BEGIN v_school := v_requested::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Escola seleccionada inválida.' USING ERRCODE='42501';
    END;
    IF NOT EXISTS (SELECT 1 FROM public.school_memberships WHERE user_id=auth.uid() AND school_id=v_school AND status='active') THEN
      RAISE EXCEPTION 'Sem vínculo activo com a escola seleccionada.' USING ERRCODE='42501';
    END IF;
    RETURN v_school;
  END IF;
  SELECT school_id INTO v_school FROM public.school_memberships
    WHERE user_id=auth.uid() AND status='active' ORDER BY created_at, id LIMIT 1;
  RETURN v_school;
END $fn$;
REVOKE ALL ON FUNCTION public.current_school_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_school_id() TO authenticated, service_role;

-- Retain code semantics for legacy consumers, but choose roles in the same school.
CREATE OR REPLACE FUNCTION public.current_profile_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
  SELECT COALESCE((
    SELECT r.code FROM public.school_memberships sm
      JOIN public.member_roles mr ON mr.membership_id=sm.id
      JOIN public.roles r ON r.id=mr.role_id AND r.school_id=sm.school_id
    WHERE sm.user_id=auth.uid() AND sm.school_id=public.current_school_id() AND sm.status='active'
    ORDER BY CASE WHEN lower(r.code) IN ('owner','admin','administrador') THEN 0 ELSE 1 END, mr.role_id
    LIMIT 1
  ), 'Utilizador');
$fn$;

-- No global-profile fallback for school authorisation.
CREATE OR REPLACE FUNCTION private.sga_app_role(p_school_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
  SELECT COALESCE((
    SELECT CASE lower(btrim(r.code))
      WHEN 'owner' THEN 'Administrador' WHEN 'admin' THEN 'Administrador' WHEN 'administrador' THEN 'Administrador'
      WHEN 'secretary' THEN 'Secretaria' WHEN 'secretaria' THEN 'Secretaria'
      WHEN 'treasury' THEN 'Tesouraria' WHEN 'tesouraria' THEN 'Tesouraria' WHEN 'finance' THEN 'Tesouraria'
      WHEN 'teacher' THEN 'Professor' WHEN 'professor' THEN 'Professor'
      WHEN 'guardian' THEN 'Encarregado' WHEN 'encarregado' THEN 'Encarregado' WHEN 'parent' THEN 'Encarregado'
      WHEN 'student' THEN 'Aluno' WHEN 'aluno' THEN 'Aluno' ELSE 'Utilizador' END
    FROM public.school_memberships sm
      JOIN public.member_roles mr ON mr.membership_id=sm.id
      JOIN public.roles r ON r.id=mr.role_id AND r.school_id=sm.school_id
    WHERE sm.user_id=auth.uid() AND sm.school_id=p_school_id AND sm.status='active'
    ORDER BY CASE WHEN lower(r.code) IN ('owner','admin','administrador') THEN 0 ELSE 1 END, mr.role_id LIMIT 1
  ), 'Utilizador');
$fn$;
REVOKE ALL ON FUNCTION private.sga_app_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.sga_app_role(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.create_person_bundle(
  p_school_id uuid, p_person jsonb, p_documents jsonb, p_roles text[], p_guardian jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_person public.people%ROWTYPE;
  v_doc jsonb;
  v_role text;
  v_teacher_number bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_aal2()
    OR private.sga_app_role(p_school_id) NOT IN ('Administrador','Secretaria')
    OR NOT private.has_permission(p_school_id,'people.records.create')
    OR EXISTS (SELECT 1 FROM public.staff_module_grants WHERE school_id=p_school_id AND user_id=auth.uid() AND module_key='pessoas' AND level IN ('Nenhum','Leitura')) THEN
    RAISE EXCEPTION 'Sem autorização para cadastrar pessoas. Confirme o vínculo e o 2FA.' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(p_person) IS DISTINCT FROM 'object' OR jsonb_typeof(p_documents) IS DISTINCT FROM 'array'
    OR COALESCE(length(btrim(p_person->>'full_name')),0) NOT BETWEEN 2 AND 250
    OR EXISTS (SELECT 1 FROM unnest(p_roles) r WHERE r IS NULL OR r NOT IN ('aluno','professor','encarregado','funcionario','diretor','coordenador','utilizador','fornecedor','contacto_institucional')) THEN
    RAISE EXCEPTION 'Dados de cadastro inválidos.' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.people(school_id,full_name,preferred_name,date_of_birth,sex,national_id,email,phone,status,province,municipality,commune,address,created_by,updated_by)
  VALUES(p_school_id,btrim(p_person->>'full_name'),NULLIF(p_person->>'preferred_name',''),
    NULLIF(p_person->>'date_of_birth','')::date,NULLIF(p_person->>'sex',''),NULLIF(p_person->>'national_id',''),
    NULLIF(p_person->>'email',''),NULLIF(p_person->>'phone',''),'active',NULLIF(p_person->>'province',''),
    NULLIF(p_person->>'municipality',''),NULLIF(p_person->>'commune',''),NULLIF(p_person->>'address',''),auth.uid(),auth.uid())
  RETURNING * INTO v_person;
  FOR v_doc IN SELECT value FROM jsonb_array_elements(p_documents) LOOP
    IF jsonb_typeof(v_doc) IS DISTINCT FROM 'object' OR v_doc->>'document_type' IS NULL OR v_doc->>'document_type' NOT IN ('bi','passaporte','cedula','outro') OR COALESCE(btrim(v_doc->>'document_number'),'')='' THEN
      RAISE EXCEPTION 'Documento inválido.' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.person_documents(school_id,person_id,document_type,document_number,issued_at,expires_at,file_id,file_name,created_by,updated_by)
    VALUES(p_school_id,v_person.id,v_doc->>'document_type',v_doc->>'document_number',
      NULLIF(v_doc->>'issued_at','')::date,NULLIF(v_doc->>'expires_at','')::date,NULLIF(v_doc->>'file_id','')::uuid,
      NULLIF(v_doc->>'file_name',''),auth.uid(),auth.uid());
  END LOOP;
  IF COALESCE(v_person.national_id,'') ~ '^[0-9]{9}[A-Z]{2}[0-9]{3}$' AND NOT EXISTS(
    SELECT 1 FROM public.person_documents WHERE school_id=p_school_id AND person_id=v_person.id AND document_type='bi'
  ) THEN
    INSERT INTO public.person_documents(school_id,person_id,document_type,document_number,created_by,updated_by)
      VALUES(p_school_id,v_person.id,'bi',v_person.national_id,auth.uid(),auth.uid());
  END IF;
  FOR v_role IN SELECT DISTINCT r FROM unnest(p_roles) r WHERE r IS NULL OR r NOT IN ('aluno','professor') LOOP
    INSERT INTO public.person_roles(school_id,person_id,role,active,created_by,updated_by)
      VALUES(p_school_id,v_person.id,v_role,true,auth.uid(),auth.uid());
  END LOOP;
  IF 'professor'=ANY(p_roles) THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_school_id::text || ':teacher-number',0));
    SELECT COALESCE(max(substring(employee_number from 5)::bigint),0)+1 INTO v_teacher_number
      FROM public.teachers WHERE school_id=p_school_id AND employee_number ~ '^DOC-[0-9]+$';
    INSERT INTO public.teachers(school_id,person_id,employee_number,hired_on,employment_type,highest_qualification,status,created_by,updated_by)
      VALUES(p_school_id,v_person.id,'DOC-'||lpad(v_teacher_number::text,6,'0'),CURRENT_DATE,'permanent','bachelor','active',auth.uid(),auth.uid());
  END IF;
  IF 'aluno'=ANY(p_roles) THEN
    PERFORM private.register_student(p_school_id,v_person.id,CURRENT_DATE,
      NULLIF(p_guardian->>'person_id','')::uuid,NULLIF(p_guardian->>'relationship',''),
      COALESCE((p_guardian->>'primary')::boolean,false),COALESCE((p_guardian->>'financial')::boolean,false),true);
  END IF;
  RETURN to_jsonb(v_person);
END $fn$;
REVOKE ALL ON FUNCTION private.create_person_bundle(uuid,jsonb,jsonb,text[],jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.create_person_bundle(uuid,jsonb,jsonb,text[],jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.siga_create_person_bundle(p_school_id uuid,p_person jsonb,p_documents jsonb,p_roles text[],p_guardian jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $fn$ SELECT private.create_person_bundle(p_school_id,p_person,p_documents,p_roles,p_guardian); $fn$;
REVOKE ALL ON FUNCTION public.siga_create_person_bundle(uuid,jsonb,jsonb,text[],jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.siga_create_person_bundle(uuid,jsonb,jsonb,text[],jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION private.reverse_finance_receipt(p_school_id uuid,p_receipt_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_receipt public.finance_receipts%ROWTYPE;
  v_invoice public.finance_invoices%ROWTYPE;
  v_paid numeric;
  v_net numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_aal2()
    OR private.sga_app_role(p_school_id) NOT IN ('Administrador','Tesouraria')
    OR NOT private.has_permission(p_school_id,'finance.payments.create')
    OR EXISTS (SELECT 1 FROM public.staff_module_grants WHERE school_id=p_school_id AND user_id=auth.uid() AND module_key='financeiro' AND level IN ('Nenhum','Leitura')) THEN
    RAISE EXCEPTION 'Sem autorização para estornar. Confirme o vínculo e o 2FA.' USING ERRCODE='42501';
  END IF;
  IF COALESCE(length(btrim(p_reason)),0) < 3 THEN RAISE EXCEPTION 'Indique o motivo do estorno.' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_receipt FROM public.finance_receipts WHERE id=p_receipt_id AND school_id=p_school_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recibo não encontrado.' USING ERRCODE='22023'; END IF;
  -- Same lock order as register_payment: invoice first, then receipt.
  IF v_receipt.invoice_id IS NOT NULL THEN
    SELECT * INTO v_invoice FROM public.finance_invoices WHERE id=v_receipt.invoice_id AND school_id=p_school_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Factura do recibo não encontrada.' USING ERRCODE='22023'; END IF;
  END IF;
  SELECT * INTO v_receipt FROM public.finance_receipts WHERE id=p_receipt_id AND school_id=p_school_id FOR UPDATE;
  IF v_receipt.status <> 'issued' THEN RAISE EXCEPTION 'Este recibo já foi estornado.' USING ERRCODE='22023'; END IF;
  UPDATE public.finance_receipts SET status='reversed',reversed_at=now(),reversed_by=auth.uid(),reversal_reason=btrim(p_reason)
    WHERE id=p_receipt_id AND school_id=p_school_id RETURNING * INTO v_receipt;
  IF v_invoice.id IS NOT NULL AND v_invoice.status <> 'cancelled' THEN
    SELECT COALESCE(sum(amount),0) INTO v_paid FROM public.finance_receipts WHERE invoice_id=v_invoice.id AND school_id=p_school_id AND status='issued';
    v_net := greatest(v_invoice.amount-COALESCE(v_invoice.discount_amount,0),0);
    UPDATE public.finance_invoices SET status=CASE WHEN round(v_paid,2)>=round(v_net,2) AND v_paid>0 THEN 'paid' WHEN v_paid>0 THEN 'partially_paid' ELSE 'open' END
      WHERE id=v_invoice.id AND school_id=p_school_id;
  END IF;
  RETURN to_jsonb(v_receipt);
END $fn$;
REVOKE ALL ON FUNCTION private.reverse_finance_receipt(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.reverse_finance_receipt(uuid,uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.siga_reverse_finance_receipt(p_school_id uuid,p_receipt_id uuid,p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $fn$ SELECT private.reverse_finance_receipt(p_school_id,p_receipt_id,p_reason); $fn$;
REVOKE ALL ON FUNCTION public.siga_reverse_finance_receipt(uuid,uuid,text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.siga_reverse_finance_receipt(uuid,uuid,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
