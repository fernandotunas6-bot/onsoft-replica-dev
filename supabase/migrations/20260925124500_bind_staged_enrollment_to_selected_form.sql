-- A candidatura institucional deve usar exactamente o formulário autorizado pela UI,
-- nunca o primeiro formulário aberto por acaso.
CREATE OR REPLACE FUNCTION public.submit_approved_school_enrollment(
 p_request_id uuid,p_user_id uuid,p_payload jsonb
) RETURNS uuid LANGUAGE plpgsql
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
 r public.school_access_requests%rowtype;
 f public.enrollment_forms%rowtype;
 v_application_id uuid;
 v_slug text;
BEGIN
 SELECT * INTO r FROM public.school_access_requests
 WHERE id=p_request_id AND user_id=p_user_id FOR UPDATE;
 IF NOT FOUND OR r.status <> 'preapproved' OR
   r.enrollment_application_id IS NOT NULL OR r.requested_role <> 'student' THEN
  RAISE EXCEPTION 'Acesso à candidatura não autorizado ou já utilizado';
 END IF;
 v_slug := trim(coalesce(p_payload->>'enrollmentFormSlug',''));
 IF v_slug = '' THEN
  RAISE EXCEPTION 'Indique o formulário de matrícula autorizado';
 END IF;
 SELECT * INTO f FROM public.enrollment_forms
 WHERE school_id=r.school_id AND slug=v_slug
 AND is_open AND deleted_at IS NULL;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Formulário encerrado ou não pertence à escola autorizada';
 END IF;
 IF jsonb_typeof(p_payload->'person') <> 'object' OR
   length(trim(coalesce(p_payload#>>'{person,full_name}',''))) < 3 THEN
  RAISE EXCEPTION 'Dados pessoais obrigatórios em falta';
 END IF;
 INSERT INTO public.enrollment_applications(
  school_id,form_id,full_name,payload,status,created_by,updated_by
 ) VALUES (r.school_id,f.id,trim(p_payload#>>'{person,full_name}'),
  p_payload||jsonb_build_object('accessRequestId',r.id),
  'pending',p_user_id,p_user_id) RETURNING id INTO v_application_id;
 UPDATE public.school_access_requests SET
  enrollment_application_id=v_application_id,
  full_name=trim(p_payload#>>'{person,full_name}'),
  status='enrollment_pending',updated_at=now() WHERE id=r.id;
 RETURN v_application_id;
END
$function$;
REVOKE ALL ON FUNCTION public.submit_approved_school_enrollment(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_approved_school_enrollment(uuid,uuid,jsonb) TO service_role;
