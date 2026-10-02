-- Minimal finance directory: treasury sees billing identity, never the full
-- personal profile. Trigger-maintained rows keep invoice lookup fast.
CREATE TABLE public.finance_students (
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  full_name text NOT NULL,
  registration_number text NOT NULL,
  student_status text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id),
  CONSTRAINT finance_students_school_student_fkey
    FOREIGN KEY (school_id, student_id)
    REFERENCES public.students (school_id, id) ON DELETE CASCADE
);

CREATE INDEX finance_students_school_name_idx
  ON public.finance_students (school_id, full_name);

INSERT INTO public.finance_students (
  school_id, student_id, full_name, registration_number, student_status
)
SELECT student.school_id, student.id, person.full_name,
  student.registration_number, student.status
FROM public.students AS student
JOIN public.people AS person
  ON person.school_id = student.school_id AND person.id = student.person_id;

CREATE OR REPLACE FUNCTION private.sync_finance_student_from_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.finance_students (
    school_id, student_id, full_name, registration_number, student_status, updated_at
  )
  SELECT NEW.school_id, NEW.id, person.full_name,
    NEW.registration_number, NEW.status, now()
  FROM public.people AS person
  WHERE person.school_id = NEW.school_id AND person.id = NEW.person_id
  ON CONFLICT (student_id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    registration_number = EXCLUDED.registration_number,
    student_status = EXCLUDED.student_status,
    updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.sync_finance_student_from_person()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.finance_students AS finance_student
  SET full_name = NEW.full_name, updated_at = now()
  FROM public.students AS student
  WHERE student.school_id = NEW.school_id
    AND student.person_id = NEW.id
    AND finance_student.school_id = student.school_id
    AND finance_student.student_id = student.id;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.sync_finance_student_from_student()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.sync_finance_student_from_person()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER students_sync_finance_directory
  AFTER INSERT OR UPDATE OF registration_number, status ON public.students
  FOR EACH ROW EXECUTE FUNCTION private.sync_finance_student_from_student();
CREATE TRIGGER people_sync_finance_directory
  AFTER UPDATE OF full_name ON public.people
  FOR EACH ROW EXECUTE FUNCTION private.sync_finance_student_from_person();

-- A student record may never be reassigned to another person after financial
-- history exists. Replace the generic identity trigger with this stricter set.
DROP TRIGGER students_protect_identity ON public.students;
CREATE TRIGGER students_protect_identity BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION private.reject_immutable_column_changes(
    'id', 'school_id', 'person_id', 'created_at', 'created_by'
  );

GRANT SELECT ON public.finance_students TO authenticated;
GRANT ALL ON public.finance_students TO service_role;
ALTER TABLE public.finance_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_students FORCE ROW LEVEL SECURITY;

CREATE POLICY "Finance roles read billing student directory"
  ON public.finance_students FOR SELECT TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.can_manage_finance())
  );

-- Direct Data API writes cannot create accounting records. SECURITY INVOKER
-- workflows set this transaction-local marker only after validating the role.
CREATE OR REPLACE FUNCTION private.require_finance_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF current_setting('app.finance_workflow_user', true)
    IS DISTINCT FROM (SELECT auth.uid())::text
  THEN
    RAISE EXCEPTION 'financial writes require an approved workflow'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.require_finance_workflow()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER invoices_require_workflow
  BEFORE INSERT OR UPDATE OF student_id, enrollment_id, status, subtotal,
    discount_amount, late_fee_amount, total_amount, amount_paid
  ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION private.require_finance_workflow();
CREATE TRIGGER invoice_items_require_workflow BEFORE INSERT ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION private.require_finance_workflow();
CREATE TRIGGER payments_require_workflow BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION private.require_finance_workflow();
CREATE TRIGGER payment_allocations_require_workflow BEFORE INSERT ON public.payment_allocations
  FOR EACH ROW EXECUTE FUNCTION private.require_finance_workflow();
CREATE TRIGGER cash_entries_require_workflow BEFORE INSERT OR UPDATE ON public.cash_entries
  FOR EACH ROW EXECUTE FUNCTION private.require_finance_workflow();

CREATE OR REPLACE FUNCTION public.issue_invoice(
  p_student_id uuid,
  p_number text,
  p_due_on date,
  p_description text,
  p_items jsonb,
  p_enrollment_id uuid DEFAULT NULL,
  p_issued_on date DEFAULT CURRENT_DATE
)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  school uuid := (SELECT public.current_school_id());
  invoice public.invoices;
  item jsonb;
  subtotal numeric(14,2) := 0;
  quantity numeric(10,2);
  unit_price numeric(14,2);
  discount numeric(14,2);
BEGIN
  IF NOT COALESCE((SELECT public.can_manage_finance()), false) THEN
    RAISE EXCEPTION 'insufficient permissions to issue invoice' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(p_number), '') IS NULL THEN
    RAISE EXCEPTION 'invoice number is required';
  END IF;
  IF p_due_on IS NULL OR p_due_on < COALESCE(p_issued_on, CURRENT_DATE) THEN
    RAISE EXCEPTION 'invoice due date is invalid';
  END IF;
  IF p_items IS NULL
    OR jsonb_typeof(p_items) <> 'array'
    OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 50
  THEN
    RAISE EXCEPTION 'invoice requires between 1 and 50 items';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.finance_students
    WHERE school_id = school AND student_id = p_student_id
  ) THEN
    RAISE EXCEPTION 'billing student not found';
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    quantity := COALESCE(NULLIF(item ->> 'quantity', '')::numeric, 1);
    unit_price := NULLIF(item ->> 'unit_price', '')::numeric;
    discount := COALESCE(NULLIF(item ->> 'discount_amount', '')::numeric, 0);
    IF NULLIF(btrim(item ->> 'category'), '') IS NULL
      OR NULLIF(btrim(item ->> 'description'), '') IS NULL
      OR quantity <= 0 OR unit_price IS NULL OR unit_price < 0
      OR discount < 0 OR discount > quantity * unit_price
    THEN
      RAISE EXCEPTION 'invalid invoice item';
    END IF;
    subtotal := subtotal + (quantity * unit_price) - discount;
  END LOOP;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(school::text || ':' || btrim(p_number), 0)
  );

  SELECT * INTO invoice FROM public.invoices
  WHERE school_id = school AND number = btrim(p_number);
  IF FOUND THEN
    IF invoice.student_id = p_student_id
      AND invoice.total_amount = subtotal
      AND invoice.due_on = p_due_on
    THEN
      RETURN invoice;
    END IF;
    RAISE EXCEPTION 'invoice number already used';
  END IF;

  PERFORM set_config('app.finance_workflow_user', (SELECT auth.uid())::text, true);

  INSERT INTO public.invoices (
    school_id, student_id, enrollment_id, number, description,
    issued_on, due_on, subtotal, total_amount, created_by
  ) VALUES (
    school, p_student_id, p_enrollment_id, btrim(p_number), NULLIF(btrim(p_description), ''),
    COALESCE(p_issued_on, CURRENT_DATE), p_due_on, subtotal, subtotal, (SELECT auth.uid())
  ) RETURNING * INTO invoice;

  FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.invoice_items (
      school_id, invoice_id, category, description, quantity,
      unit_price, discount_amount, created_by
    ) VALUES (
      school, invoice.id, btrim(item ->> 'category'), btrim(item ->> 'description'),
      COALESCE(NULLIF(item ->> 'quantity', '')::numeric, 1),
      NULLIF(item ->> 'unit_price', '')::numeric,
      COALESCE(NULLIF(item ->> 'discount_amount', '')::numeric, 0),
      (SELECT auth.uid())
    );
  END LOOP;

  RETURN invoice;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.issue_invoice(uuid, text, date, text, jsonb, uuid, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_invoice(uuid, text, date, text, jsonb, uuid, date)
  TO authenticated;
