-- CAPTURADA da produção (supabase_migrations.schema_migrations, versão 20261001070135).
-- Aplicada a 2026-10-01 07:01 UTC fora do repositório; trazida para cá a 2026-10-02
-- (auditoria 11, O4). Corpo sem alterações, confirmado por md5 contra o registo.
-- @@corpo-capturado@@
-- Alteração e auditoria do destino salarial numa única transacção.
CREATE OR REPLACE FUNCTION private.hr_payment_destination_label(p_iban text,p_account text,p_reference text,p_method text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN COALESCE(NULLIF(p_iban,''),NULLIF(p_account,''),NULLIF(p_reference,'')) IS NOT NULL THEN
  CASE WHEN NULLIF(p_iban,'') IS NOT NULL THEN 'IBAN' WHEN NULLIF(p_account,'') IS NOT NULL THEN 'Conta' ELSE 'Referência' END || ' ••••' ||
  CASE WHEN length(regexp_replace(COALESCE(NULLIF(p_iban,''),NULLIF(p_account,''),p_reference),'\s','','g'))>4
   THEN right(regexp_replace(COALESCE(NULLIF(p_iban,''),NULLIF(p_account,''),p_reference),'\s','','g'),4) ELSE '' END
 WHEN p_method='cash' THEN 'Numerário' ELSE 'Outro' END;
$$;
REVOKE ALL ON FUNCTION private.hr_payment_destination_label(text,text,text,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.hr_upsert_payment_destination(p_school_id uuid,p_employment_id uuid,p_destination jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_actor uuid:=auth.uid(); v_old public.hr_payment_destinations; v_id uuid;
 v_method text; v_beneficiary text; v_bank text; v_iban text; v_account text; v_reference text; v_key text;
BEGIN
 IF v_actor IS NULL OR NOT COALESCE(private.is_aal2(),false)
  OR COALESCE(private.sga_app_role(p_school_id),'') NOT IN ('Administrador','Tesouraria')
  OR NOT COALESCE(private.has_permission(p_school_id,'finance.payments.create'),false)
  OR EXISTS(SELECT 1 FROM public.staff_module_grants WHERE school_id=p_school_id AND user_id=v_actor AND module_key='financeiro' AND level IN ('Nenhum','Leitura')) THEN
  RAISE EXCEPTION 'Sem autorização para alterar o destino salarial. Confirme o vínculo e o 2FA.' USING ERRCODE='42501';
 END IF;
 IF p_destination IS NULL OR jsonb_typeof(p_destination)<>'object' THEN RAISE EXCEPTION 'Destino inválido.' USING ERRCODE='22023'; END IF;
 FOREACH v_key IN ARRAY ARRAY['method','beneficiaryName','bankName','iban','accountNumber','destinationReference'] LOOP
  IF p_destination ? v_key AND jsonb_typeof(p_destination->v_key)<>'string' THEN
   RAISE EXCEPTION 'Campo de destino inválido: %',v_key USING ERRCODE='22023';
  END IF;
 END LOOP;
 v_method:=btrim(p_destination->>'method'); v_beneficiary:=btrim(p_destination->>'beneficiaryName');
 v_bank:=NULLIF(btrim(p_destination->>'bankName'),''); v_iban:=NULLIF(btrim(p_destination->>'iban'),'');
 v_account:=NULLIF(btrim(p_destination->>'accountNumber'),''); v_reference:=NULLIF(btrim(p_destination->>'destinationReference'),'');
 IF v_method IS NULL OR v_method NOT IN ('transfer','cash','other')
  OR COALESCE(length(v_beneficiary),0) NOT BETWEEN 2 AND 160 OR COALESCE(length(v_bank),0)>160
  OR COALESCE(length(v_iban),0)>64 OR COALESCE(length(v_account),0)>80 OR COALESCE(length(v_reference),0)>160
  OR (v_method='transfer' AND v_iban IS NULL AND v_account IS NULL AND v_reference IS NULL) THEN
  RAISE EXCEPTION 'Dados do destino salarial inválidos.' USING ERRCODE='22023';
 END IF;
 -- O bloqueio do vínculo serializa também a primeira criação, quando ainda não há destino.
 PERFORM 1 FROM public.hr_employments WHERE id=p_employment_id AND school_id=p_school_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Vínculo funcional não encontrado.' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_old FROM public.hr_payment_destinations WHERE school_id=p_school_id AND employment_id=p_employment_id AND is_primary AND active AND deleted_at IS NULL FOR UPDATE;
 IF FOUND THEN
  IF ROW(v_old.method,v_old.beneficiary_name,v_old.bank_name,v_old.iban,v_old.account_number,v_old.destination_reference)
   IS NOT DISTINCT FROM ROW(v_method,v_beneficiary,v_bank,v_iban,v_account,v_reference) THEN
   RETURN jsonb_build_object('saved',true,'id',v_old.id,'unchanged',true);
  END IF;
  UPDATE public.hr_payment_destinations SET method=v_method,beneficiary_name=v_beneficiary,bank_name=v_bank,
   iban=v_iban,account_number=v_account,destination_reference=v_reference,updated_by=v_actor WHERE id=v_old.id RETURNING id INTO v_id;
 ELSE
  INSERT INTO public.hr_payment_destinations(school_id,employment_id,method,beneficiary_name,bank_name,iban,account_number,destination_reference,is_primary,active,created_by,updated_by)
   VALUES(p_school_id,p_employment_id,v_method,v_beneficiary,v_bank,v_iban,v_account,v_reference,true,true,v_actor,v_actor) RETURNING id INTO v_id;
 END IF;
 INSERT INTO public.audit_logs(school_id,actor_user_id,action,entity_type,entity_id,metadata)
 VALUES(p_school_id,v_actor,'hr.payment_destination.changed','hr_payment_destination',v_id,
  jsonb_build_object('employment_id',p_employment_id,
   'before',CASE WHEN v_old.id IS NULL THEN NULL ELSE jsonb_build_object('method',v_old.method,
    'destination',private.hr_payment_destination_label(v_old.iban,v_old.account_number,v_old.destination_reference,v_old.method),'beneficiary',v_old.beneficiary_name) END,
   'after',jsonb_build_object('method',v_method,'destination',private.hr_payment_destination_label(v_iban,v_account,v_reference,v_method),'beneficiary',v_beneficiary)));
 RETURN jsonb_build_object('saved',true,'id',v_id);
END $$;
REVOKE ALL ON FUNCTION private.hr_upsert_payment_destination(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.hr_upsert_payment_destination(uuid,uuid,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.hr_upsert_payment_destination(p_school_id uuid,p_employment_id uuid,p_destination jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT private.hr_upsert_payment_destination(p_school_id,p_employment_id,p_destination);
$$;
REVOKE ALL ON FUNCTION public.hr_upsert_payment_destination(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hr_upsert_payment_destination(uuid,uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
