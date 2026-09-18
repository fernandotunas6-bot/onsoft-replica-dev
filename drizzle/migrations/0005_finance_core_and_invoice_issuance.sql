CREATE OR REPLACE FUNCTION public.can_manage_finance()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT COALESCE((SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria'), false);
$$;

REVOKE EXECUTE ON FUNCTION public.can_manage_finance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_finance() TO authenticated;

ALTER TABLE public.enrollments
  ADD CONSTRAINT enrollments_school_id_student_key UNIQUE (school_id, id, student_id);

CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  enrollment_id uuid,
  number text NOT NULL CHECK (number = btrim(number) AND char_length(number) BETWEEN 1 AND 64),
  description text,
  issued_on date NOT NULL DEFAULT CURRENT_DATE,
  due_on date NOT NULL,
  currency text NOT NULL DEFAULT 'AOA' CHECK (currency = 'AOA'),
  status text NOT NULL DEFAULT 'issued'
    CHECK (status IN ('draft', 'issued', 'partial', 'paid', 'void')),
  subtotal numeric(14,2) NOT NULL CHECK (subtotal >= 0),
  discount_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  late_fee_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (late_fee_amount >= 0),
  total_amount numeric(14,2) NOT NULL CHECK (total_amount >= 0),
  amount_paid numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT invoices_dates_valid CHECK (due_on >= issued_on),
  CONSTRAINT invoices_totals_valid CHECK (
    total_amount = subtotal - discount_amount + late_fee_amount AND amount_paid <= total_amount
  ),
  CONSTRAINT invoices_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT invoices_school_id_student_key UNIQUE (school_id, id, student_id),
  CONSTRAINT invoices_school_number_key UNIQUE (school_id, number),
  CONSTRAINT invoices_student_fkey FOREIGN KEY (school_id, student_id)
    REFERENCES public.students (school_id, id),
  CONSTRAINT invoices_enrollment_fkey FOREIGN KEY (school_id, enrollment_id, student_id)
    REFERENCES public.enrollments (school_id, id, student_id)
);

CREATE TABLE public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  quantity numeric(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price numeric(14,2) NOT NULL CHECK (unit_price >= 0),
  discount_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  line_total numeric(14,2) GENERATED ALWAYS AS ((quantity * unit_price) - discount_amount) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  CONSTRAINT invoice_items_total_valid CHECK ((quantity * unit_price) >= discount_amount),
  CONSTRAINT invoice_items_invoice_fkey FOREIGN KEY (school_id, invoice_id)
    REFERENCES public.invoices (school_id, id) ON DELETE CASCADE
);

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  receipt_number text NOT NULL CHECK (
    receipt_number = btrim(receipt_number) AND char_length(receipt_number) BETWEEN 1 AND 64
  ),
  paid_at timestamptz NOT NULL DEFAULT now(),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'AOA' CHECK (currency = 'AOA'),
  method text NOT NULL CHECK (method IN ('cash', 'multicaixa', 'transfer', 'express')),
  reference text,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'reversed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT payments_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT payments_school_id_student_key UNIQUE (school_id, id, student_id),
  CONSTRAINT payments_school_receipt_key UNIQUE (school_id, receipt_number),
  CONSTRAINT payments_student_fkey FOREIGN KEY (school_id, student_id)
    REFERENCES public.students (school_id, id)
);

CREATE TABLE public.payment_allocations (
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  student_id uuid NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  PRIMARY KEY (payment_id, invoice_id),
  CONSTRAINT payment_allocations_payment_fkey FOREIGN KEY (school_id, payment_id, student_id)
    REFERENCES public.payments (school_id, id, student_id),
  CONSTRAINT payment_allocations_invoice_fkey FOREIGN KEY (school_id, invoice_id, student_id)
    REFERENCES public.invoices (school_id, id, student_id)
);

CREATE TABLE public.cash_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  payment_id uuid,
  document_number text NOT NULL CHECK (
    document_number = btrim(document_number) AND char_length(document_number) BETWEEN 1 AND 64
  ),
  direction text NOT NULL CHECK (direction IN ('in', 'out')),
  category text NOT NULL,
  description text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('cash', 'multicaixa', 'transfer', 'express')),
  reference text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'reversed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT cash_entries_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT cash_entries_school_document_key UNIQUE (school_id, document_number),
  CONSTRAINT cash_entries_payment_fkey FOREIGN KEY (school_id, payment_id)
    REFERENCES public.payments (school_id, id)
);

CREATE INDEX invoices_open_idx ON public.invoices (school_id, due_on, student_id)
  WHERE status IN ('issued', 'partial') AND deleted_at IS NULL;
CREATE INDEX invoice_items_invoice_idx ON public.invoice_items (school_id, invoice_id);
CREATE INDEX payments_student_recent_idx ON public.payments (school_id, student_id, paid_at DESC);
CREATE INDEX payment_allocations_invoice_idx ON public.payment_allocations (school_id, invoice_id);
CREATE INDEX cash_entries_recent_idx ON public.cash_entries (school_id, occurred_at DESC);
CREATE UNIQUE INDEX cash_entries_confirmed_payment_idx ON public.cash_entries (payment_id)
  WHERE payment_id IS NOT NULL AND status = 'posted';

CREATE TRIGGER invoices_set_updated_at BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER payments_set_updated_at BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER cash_entries_set_updated_at BEFORE UPDATE ON public.cash_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();

CREATE TRIGGER invoices_protect_identity BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION private.reject_immutable_column_changes(
    'id', 'school_id', 'student_id', 'created_at', 'created_by');
CREATE TRIGGER payments_protect_identity BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION private.reject_immutable_column_changes(
    'id', 'school_id', 'student_id', 'amount', 'created_at', 'created_by');
CREATE TRIGGER cash_entries_protect_identity BEFORE UPDATE ON public.cash_entries
  FOR EACH ROW EXECUTE FUNCTION private.reject_immutable_column_changes(
    'id', 'school_id', 'payment_id', 'document_number', 'direction', 'amount',
    'created_at', 'created_by');

GRANT SELECT ON public.invoices, public.invoice_items, public.payments,
  public.payment_allocations, public.cash_entries TO authenticated;
GRANT INSERT, UPDATE ON public.invoices TO authenticated;
GRANT INSERT ON public.invoice_items, public.payments, public.payment_allocations,
  public.cash_entries TO authenticated;
GRANT UPDATE ON public.payments, public.cash_entries TO authenticated;
GRANT ALL ON public.invoices, public.invoice_items, public.payments,
  public.payment_allocations, public.cash_entries TO service_role;

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_allocations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cash_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_entries FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'invoices', 'invoice_items', 'payments', 'payment_allocations', 'cash_entries'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated '
      || 'USING (public.is_school_member(school_id) '
      || 'AND (SELECT public.can_manage_finance()))',
      'Finance roles read ' || table_name, table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated '
      || 'WITH CHECK (public.is_school_member(school_id) '
      || 'AND created_by = (SELECT auth.uid()) '
      || 'AND (SELECT public.can_manage_finance()))',
      'Finance roles create ' || table_name, table_name);
  END LOOP;
END;
$$;

CREATE POLICY "Finance roles update invoices" ON public.invoices
  FOR UPDATE TO authenticated
  USING (public.is_school_member(school_id) AND (SELECT public.can_manage_finance()))
  WITH CHECK (public.is_school_member(school_id) AND (SELECT public.can_manage_finance()));
CREATE POLICY "Finance roles update payments" ON public.payments
  FOR UPDATE TO authenticated
  USING (public.is_school_member(school_id) AND (SELECT public.can_manage_finance()))
  WITH CHECK (public.is_school_member(school_id) AND (SELECT public.can_manage_finance()));
CREATE POLICY "Finance roles update cash entries" ON public.cash_entries
  FOR UPDATE TO authenticated
  USING (public.is_school_member(school_id) AND (SELECT public.can_manage_finance()))
  WITH CHECK (public.is_school_member(school_id) AND (SELECT public.can_manage_finance()));

CREATE TABLE public.finance_students (
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  full_name text NOT NULL,
  registration_number text NOT NULL,
  student_status text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id),
  CONSTRAINT finance_students_school_student_fkey FOREIGN KEY (school_id, student_id)
    REFERENCES public.students (school_id, id) ON DELETE CASCADE
);

CREATE INDEX finance_students_school_name_idx ON public.finance_students (school_id, full_name);

INSERT INTO public.finance_students (school_id, student_id, full_name, registration_number, student_status)
SELECT student.school_id, student.id, person.full_name, student.registration_number, student.status
FROM public.students AS student
JOIN public.people AS person
  ON person.school_id = student.school_id AND person.id = student.person_id;

CREATE OR REPLACE FUNCTION private.sync_finance_student_from_student()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.finance_students (
    school_id, student_id, full_name, registration_number, student_status, updated_at
  )
  SELECT NEW.school_id, NEW.id, person.full_name, NEW.registration_number, NEW.status, now()
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
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
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

REVOKE EXECUTE ON FUNCTION private.sync_finance_student_from_student() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.sync_finance_student_from_person() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER students_sync_finance_directory
  AFTER INSERT OR UPDATE OF registration_number, status ON public.students
  FOR EACH ROW EXECUTE FUNCTION private.sync_finance_student_from_student();
CREATE TRIGGER people_sync_finance_directory
  AFTER UPDATE OF full_name ON public.people
  FOR EACH ROW EXECUTE FUNCTION private.sync_finance_student_from_person();

DROP TRIGGER students_protect_identity ON public.students;
CREATE TRIGGER students_protect_identity BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION private.reject_immutable_column_changes(
    'id', 'school_id', 'person_id', 'created_at', 'created_by');

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

CREATE OR REPLACE FUNCTION private.require_finance_workflow()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF current_setting('app.finance_workflow_user', true) IS DISTINCT FROM (SELECT auth.uid())::text
  THEN
    RAISE EXCEPTION 'financial writes require an approved workflow' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.require_finance_workflow() FROM PUBLIC, anon, authenticated;

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
RETURNS public.invoices LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
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
    SELECT 1 FROM public.finance_students WHERE school_id = school AND student_id = p_student_id
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

REVOKE EXECUTE ON FUNCTION public.issue_invoice(uuid, text, date, text, jsonb, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_invoice(uuid, text, date, text, jsonb, uuid, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_invoice_payment(
  p_invoice_id uuid,
  p_receipt_number text,
  p_amount numeric,
  p_method text,
  p_reference text DEFAULT NULL,
  p_paid_at timestamptz DEFAULT now()
)
RETURNS public.payments LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  school uuid := (SELECT public.current_school_id());
  invoice public.invoices;
  payment public.payments;
BEGIN
  IF NOT COALESCE((SELECT public.can_manage_finance()), false) THEN
    RAISE EXCEPTION 'insufficient permissions to record payment' USING ERRCODE = '42501';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'payment amount must be positive';
  END IF;
  IF NULLIF(btrim(p_receipt_number), '') IS NULL THEN
    RAISE EXCEPTION 'receipt number is required';
  END IF;
  IF p_method NOT IN ('cash', 'multicaixa', 'transfer', 'express') THEN
    RAISE EXCEPTION 'invalid payment method';
  END IF;

  PERFORM set_config('app.finance_workflow_user', (SELECT auth.uid())::text, true);

  SELECT * INTO invoice FROM public.invoices
  WHERE id = p_invoice_id AND school_id = school AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice not found';
  END IF;

  SELECT * INTO payment FROM public.payments
  WHERE school_id = school AND receipt_number = btrim(p_receipt_number);
  IF FOUND THEN
    IF payment.amount = p_amount
      AND payment.method = p_method
      AND EXISTS (
        SELECT 1 FROM public.payment_allocations
        WHERE school_id = school AND payment_id = payment.id AND invoice_id = invoice.id
      )
    THEN
      RETURN payment;
    END IF;
    RAISE EXCEPTION 'receipt number already used for another payment';
  END IF;

  IF invoice.status NOT IN ('issued', 'partial') THEN
    RAISE EXCEPTION 'invoice is not payable';
  END IF;
  IF p_amount > invoice.total_amount - invoice.amount_paid THEN
    RAISE EXCEPTION 'payment exceeds outstanding invoice amount';
  END IF;

  INSERT INTO public.payments (
    school_id, student_id, receipt_number, paid_at, amount, method, reference, created_by
  ) VALUES (
    school, invoice.student_id, btrim(p_receipt_number), COALESCE(p_paid_at, now()),
    p_amount, p_method, NULLIF(btrim(p_reference), ''), (SELECT auth.uid())
  ) RETURNING * INTO payment;

  INSERT INTO public.payment_allocations (
    school_id, payment_id, invoice_id, student_id, amount, created_by
  ) VALUES (
    school, payment.id, invoice.id, invoice.student_id, p_amount, (SELECT auth.uid())
  );

  INSERT INTO public.cash_entries (
    school_id, payment_id, document_number, direction, category, description, amount, method,
    reference, occurred_at, created_by
  ) VALUES (
    school, payment.id, payment.receipt_number, 'in', 'invoice_payment',
    'Payment ' || payment.receipt_number || ' for invoice ' || invoice.number,
    p_amount, p_method, payment.reference, payment.paid_at, (SELECT auth.uid())
  );

  UPDATE public.invoices
  SET amount_paid = amount_paid + p_amount,
      status = CASE WHEN amount_paid + p_amount = total_amount THEN 'paid' ELSE 'partial' END
  WHERE id = invoice.id;

  RETURN payment;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_invoice_payment(uuid, text, numeric, text, text, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment(uuid, text, numeric, text, text, timestamptz)
  TO authenticated;

CREATE TRIGGER invoices_audit_change AFTER INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION private.audit_domain_change();
CREATE TRIGGER payments_audit_change AFTER INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION private.audit_domain_change();
CREATE TRIGGER cash_entries_audit_change AFTER INSERT OR UPDATE ON public.cash_entries
  FOR EACH ROW EXECUTE FUNCTION private.audit_domain_change();
