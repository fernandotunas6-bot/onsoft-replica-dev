CREATE OR REPLACE FUNCTION public.can_manage_documents()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT public.current_profile_role()) IN ('Administrador', 'Secretaria'),
    false
  );
$$;

REVOKE EXECUTE ON FUNCTION public.can_manage_documents() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_documents() TO authenticated;

CREATE TABLE public.document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  fee_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  turnaround_days smallint NOT NULL DEFAULT 1 CHECK (turnaround_days BETWEEN 0 AND 120),
  requires_payment boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT document_templates_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT document_templates_school_code_key UNIQUE (school_id, code),
  CONSTRAINT document_templates_name_valid CHECK (
    name = btrim(name) AND char_length(name) BETWEEN 2 AND 160
  )
);

INSERT INTO public.document_templates (
  school_id, code, name, fee_amount, turnaround_days, requires_payment
)
SELECT school.id, seed.code, seed.name, seed.fee, seed.days, true
FROM public.schools AS school
CROSS JOIN (VALUES
  ('enrollment_declaration', 'Declaração de Matrícula', 2500::numeric, 1::smallint),
  ('grade_declaration', 'Declaração com Notas', 3500::numeric, 2::smallint),
  ('completion_certificate', 'Certificado de Habilitações', 15000::numeric, 5::smallint),
  ('report_card', 'Boletim de Notas', 1500::numeric, 1::smallint),
  ('transfer_request', 'Pedido de Transferência', 5000::numeric, 3::smallint)
) AS seed(code, name, fee, days)
ON CONFLICT (school_id, code) DO NOTHING;

CREATE TABLE public.document_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  request_number text NOT NULL CHECK (
    request_number = btrim(request_number)
    AND char_length(request_number) BETWEEN 1 AND 64
  ),
  student_id uuid NOT NULL,
  template_id uuid NOT NULL,
  template_name text NOT NULL,
  fee_amount numeric(14,2) NOT NULL CHECK (fee_amount >= 0),
  status text NOT NULL CHECK (
    status IN ('pending_payment', 'queued', 'processing', 'ready', 'delivered', 'cancelled')
  ),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'urgent')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  due_on date NOT NULL,
  completed_at timestamptz,
  assigned_to uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT document_requests_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT document_requests_school_number_key UNIQUE (school_id, request_number),
  CONSTRAINT document_requests_student_fkey FOREIGN KEY (school_id, student_id)
    REFERENCES public.students (school_id, id),
  CONSTRAINT document_requests_template_fkey FOREIGN KEY (school_id, template_id)
    REFERENCES public.document_templates (school_id, id)
);

CREATE TABLE public.document_request_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  previous_status text,
  new_status text NOT NULL,
  reason text,
  changed_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_request_history_request_fkey
    FOREIGN KEY (school_id, request_id)
    REFERENCES public.document_requests (school_id, id) ON DELETE CASCADE
);

CREATE INDEX document_requests_queue_idx
  ON public.document_requests (school_id, status, due_on, priority);
CREATE INDEX document_requests_student_recent_idx
  ON public.document_requests (school_id, student_id, requested_at DESC);
CREATE INDEX document_request_history_request_idx
  ON public.document_request_status_history (school_id, request_id, created_at DESC);

CREATE TRIGGER document_templates_set_updated_at BEFORE UPDATE ON public.document_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER document_requests_set_updated_at BEFORE UPDATE ON public.document_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER document_templates_protect_identity BEFORE UPDATE ON public.document_templates
  FOR EACH ROW EXECUTE FUNCTION private.reject_immutable_column_changes(
    'id', 'school_id', 'created_at', 'created_by'
  );
CREATE TRIGGER document_requests_protect_identity BEFORE UPDATE ON public.document_requests
  FOR EACH ROW EXECUTE FUNCTION private.reject_immutable_column_changes(
    'id', 'school_id', 'request_number', 'student_id', 'template_id', 'template_name',
    'fee_amount', 'requested_at', 'created_at', 'created_by'
  );

CREATE OR REPLACE FUNCTION private.require_document_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF current_setting('app.document_workflow_user', true)
    IS DISTINCT FROM (SELECT auth.uid())::text
  THEN
    RAISE EXCEPTION 'document writes require an approved workflow' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.require_document_workflow()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER document_requests_require_workflow
  BEFORE INSERT OR UPDATE OF status, student_id, template_id, fee_amount
  ON public.document_requests
  FOR EACH ROW EXECUTE FUNCTION private.require_document_workflow();

CREATE OR REPLACE FUNCTION private.record_document_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.document_request_status_history (
      school_id, request_id, previous_status, new_status, reason, changed_by
    ) VALUES (
      NEW.school_id,
      NEW.id,
      CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
      NEW.status,
      NULLIF(current_setting('app.document_status_reason', true), ''),
      (SELECT auth.uid())
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.record_document_status_change()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER document_requests_record_status
  AFTER INSERT OR UPDATE OF status ON public.document_requests
  FOR EACH ROW EXECUTE FUNCTION private.record_document_status_change();

GRANT SELECT ON public.document_templates, public.document_requests,
  public.document_request_status_history TO authenticated;
GRANT INSERT, UPDATE ON public.document_requests TO authenticated;
GRANT ALL ON public.document_templates, public.document_requests,
  public.document_request_status_history TO service_role;

ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.document_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.document_request_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_request_status_history FORCE ROW LEVEL SECURITY;

CREATE POLICY "Document roles read templates" ON public.document_templates
  FOR SELECT TO authenticated
  USING (school_id = (SELECT public.current_school_id()) AND (SELECT public.can_manage_documents()));
CREATE POLICY "Document roles read requests" ON public.document_requests
  FOR SELECT TO authenticated
  USING (school_id = (SELECT public.current_school_id()) AND (SELECT public.can_manage_documents()));
CREATE POLICY "Document workflows create requests" ON public.document_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND created_by = (SELECT auth.uid())
    AND (SELECT public.can_manage_documents())
  );
CREATE POLICY "Document roles update requests" ON public.document_requests
  FOR UPDATE TO authenticated
  USING (school_id = (SELECT public.current_school_id()) AND (SELECT public.can_manage_documents()))
  WITH CHECK (school_id = (SELECT public.current_school_id()) AND (SELECT public.can_manage_documents()));
CREATE POLICY "Document roles read request history" ON public.document_request_status_history
  FOR SELECT TO authenticated
  USING (school_id = (SELECT public.current_school_id()) AND (SELECT public.can_manage_documents()));

CREATE OR REPLACE FUNCTION public.create_document_request(
  p_student_id uuid,
  p_template_id uuid,
  p_request_number text,
  p_priority text DEFAULT 'normal',
  p_due_on date DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS public.document_requests
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  school uuid := (SELECT public.current_school_id());
  template public.document_templates;
  request public.document_requests;
  calculated_due date;
BEGIN
  IF NOT COALESCE((SELECT public.can_manage_documents()), false) THEN
    RAISE EXCEPTION 'insufficient permissions to create document request' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(p_request_number), '') IS NULL THEN
    RAISE EXCEPTION 'document request number is required';
  END IF;
  IF p_priority NOT IN ('normal', 'urgent') THEN
    RAISE EXCEPTION 'invalid document priority';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.students
    WHERE school_id = school AND id = p_student_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'student not found';
  END IF;

  SELECT * INTO template FROM public.document_templates
  WHERE school_id = school AND id = p_template_id AND active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'document template not found';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(school::text || ':' || btrim(p_request_number), 0)
  );
  SELECT * INTO request FROM public.document_requests
  WHERE school_id = school AND request_number = btrim(p_request_number);
  IF FOUND THEN
    IF request.student_id = p_student_id AND request.template_id = p_template_id THEN
      RETURN request;
    END IF;
    RAISE EXCEPTION 'document request number already used';
  END IF;

  calculated_due := COALESCE(
    p_due_on,
    CURRENT_DATE + CASE
      WHEN p_priority = 'urgent' THEN GREATEST(1, CEIL(template.turnaround_days / 2.0)::integer)
      ELSE template.turnaround_days
    END
  );
  IF calculated_due < CURRENT_DATE THEN
    RAISE EXCEPTION 'document due date cannot be in the past';
  END IF;

  PERFORM set_config('app.document_workflow_user', (SELECT auth.uid())::text, true);
  PERFORM set_config('app.document_status_reason', 'Pedido registado', true);

  INSERT INTO public.document_requests (
    school_id, request_number, student_id, template_id, template_name,
    fee_amount, status, priority, due_on, assigned_to, notes, created_by
  ) VALUES (
    school, btrim(p_request_number), p_student_id, template.id, template.name,
    template.fee_amount,
    CASE WHEN template.requires_payment AND template.fee_amount > 0
      THEN 'pending_payment' ELSE 'queued' END,
    p_priority, calculated_due, (SELECT auth.uid()), NULLIF(btrim(p_notes), ''),
    (SELECT auth.uid())
  ) RETURNING * INTO request;

  RETURN request;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_document_request(uuid, uuid, text, text, date, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_document_request(uuid, uuid, text, text, date, text)
  TO authenticated;

CREATE TRIGGER document_requests_audit_change
  AFTER INSERT OR UPDATE ON public.document_requests
  FOR EACH ROW EXECUTE FUNCTION private.audit_domain_change();
