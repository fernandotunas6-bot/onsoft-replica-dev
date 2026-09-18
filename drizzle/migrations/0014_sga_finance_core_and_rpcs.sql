-- ============================================================
-- Compatibility columns expected by the application code
-- ============================================================
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS student_number text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS admission_date date;
UPDATE public.students SET student_number = registration_number WHERE student_number IS NULL;
UPDATE public.students SET admission_date = admitted_on WHERE admission_date IS NULL;

CREATE OR REPLACE FUNCTION public.sync_student_compat_columns()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.student_number IS NULL THEN NEW.student_number := NEW.registration_number; END IF;
  IF NEW.registration_number IS NULL THEN NEW.registration_number := NEW.student_number; END IF;
  IF NEW.admission_date IS NULL THEN NEW.admission_date := NEW.admitted_on; END IF;
  IF NEW.admitted_on IS NULL THEN NEW.admitted_on := NEW.admission_date; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS students_compat_sync ON public.students;
CREATE TRIGGER students_compat_sync BEFORE INSERT OR UPDATE ON public.students
FOR EACH ROW EXECUTE FUNCTION public.sync_student_compat_columns();

ALTER TABLE public.people ADD COLUMN IF NOT EXISTS national_id text;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS user_id uuid;
UPDATE public.people SET national_id = nif WHERE national_id IS NULL;

ALTER TABLE public.student_guardians ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.student_guardians ADD COLUMN IF NOT EXISTS is_pickup_authorized boolean NOT NULL DEFAULT true;
ALTER TABLE public.student_guardians ADD COLUMN IF NOT EXISTS financial_responsibility boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS student_guardians_id_key ON public.student_guardians (id);

ALTER TABLE public.enrollments ADD COLUMN IF NOT EXISTS enrollment_number text;

-- ============================================================
-- Finance schema (SGA shape used by the application)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fee_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
GRANT SELECT ON public.fee_plans TO authenticated;
GRANT ALL ON public.fee_plans TO service_role;
ALTER TABLE public.fee_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fee_plans read members" ON public.fee_plans;
CREATE POLICY "fee_plans read members" ON public.fee_plans FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));

CREATE TABLE IF NOT EXISTS public.fee_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  fee_plan_id uuid NOT NULL REFERENCES public.fee_plans(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'tuition',
  amount numeric(14,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fee_items TO authenticated;
GRANT ALL ON public.fee_items TO service_role;
ALTER TABLE public.fee_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fee_items read members" ON public.fee_items;
CREATE POLICY "fee_items read members" ON public.fee_items FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));

CREATE TABLE IF NOT EXISTS public.finance_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  enrollment_id uuid NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  fee_plan_id uuid REFERENCES public.fee_plans(id) ON DELETE SET NULL,
  discount_percentage numeric(5,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.finance_contracts TO authenticated;
GRANT ALL ON public.finance_contracts TO service_role;
ALTER TABLE public.finance_contracts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "finance_contracts read members" ON public.finance_contracts;
CREATE POLICY "finance_contracts read members" ON public.finance_contracts FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));

CREATE TABLE IF NOT EXISTS public.finance_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES public.finance_contracts(id) ON DELETE SET NULL,
  fee_item_id uuid REFERENCES public.fee_items(id) ON DELETE SET NULL,
  invoice_number text NOT NULL,
  competence_month date,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  discount_amount numeric(14,2) NOT NULL DEFAULT 0,
  penalty_amount numeric(14,2) NOT NULL DEFAULT 0,
  total_amount numeric(14,2) GENERATED ALWAYS AS (amount - discount_amount + penalty_amount) STORED,
  due_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'open',
  issued_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_invoices_status_check CHECK (status IN ('open','partial','paid','cancelled')),
  CONSTRAINT finance_invoices_number_key UNIQUE (school_id, invoice_number)
);
CREATE INDEX IF NOT EXISTS finance_invoices_school_created_idx ON public.finance_invoices (school_id, created_at DESC);
GRANT SELECT ON public.finance_invoices TO authenticated;
GRANT ALL ON public.finance_invoices TO service_role;
ALTER TABLE public.finance_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "finance_invoices read members" ON public.finance_invoices;
CREATE POLICY "finance_invoices read members" ON public.finance_invoices FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));

CREATE TABLE IF NOT EXISTS public.finance_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.finance_invoices(id) ON DELETE SET NULL,
  receipt_number text NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  paid_on date NOT NULL DEFAULT CURRENT_DATE,
  payment_method text NOT NULL DEFAULT 'cash',
  status text NOT NULL DEFAULT 'posted',
  reversal_reason text,
  reversed_at timestamptz,
  reversed_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_receipts_status_check CHECK (status IN ('posted','reversed')),
  CONSTRAINT finance_receipts_number_key UNIQUE (school_id, receipt_number)
);
CREATE INDEX IF NOT EXISTS finance_receipts_invoice_idx ON public.finance_receipts (invoice_id);
GRANT SELECT ON public.finance_receipts TO authenticated;
GRANT ALL ON public.finance_receipts TO service_role;
ALTER TABLE public.finance_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "finance_receipts read members" ON public.finance_receipts;
CREATE POLICY "finance_receipts read members" ON public.finance_receipts FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));

CREATE TABLE IF NOT EXISTS public.siga_cash_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  document_number text NOT NULL,
  description text NOT NULL,
  category text NOT NULL DEFAULT 'Despesa',
  amount numeric(14,2) NOT NULL DEFAULT 0,
  method text NOT NULL DEFAULT 'cash',
  reference text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'posted',
  reversal_reason text,
  reversed_at timestamptz,
  reversed_by uuid,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT siga_cash_expenses_status_check CHECK (status IN ('posted','reversed'))
);
CREATE INDEX IF NOT EXISTS siga_cash_expenses_school_idx ON public.siga_cash_expenses (school_id, occurred_at DESC);
GRANT SELECT ON public.siga_cash_expenses TO authenticated;
GRANT ALL ON public.siga_cash_expenses TO service_role;
ALTER TABLE public.siga_cash_expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "siga_cash_expenses read members" ON public.siga_cash_expenses;
CREATE POLICY "siga_cash_expenses read members" ON public.siga_cash_expenses FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));

CREATE TABLE IF NOT EXISTS public.finance_payment_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.finance_invoices(id) ON DELETE SET NULL,
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'cash',
  installments integer NOT NULL DEFAULT 1,
  reference text,
  notes text,
  status text NOT NULL DEFAULT 'pending_gateway',
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.finance_payment_plans TO authenticated;
GRANT ALL ON public.finance_payment_plans TO service_role;
ALTER TABLE public.finance_payment_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "finance_payment_plans read members" ON public.finance_payment_plans;
CREATE POLICY "finance_payment_plans read members" ON public.finance_payment_plans FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));

CREATE TABLE IF NOT EXISTS public.finance_gateway_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  ok boolean NOT NULL DEFAULT false,
  http_status integer NOT NULL DEFAULT 200,
  channel text NOT NULL DEFAULT 'multicaixa_express',
  message text NOT NULL DEFAULT '',
  reference text NOT NULL DEFAULT '',
  invoice_id uuid,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.finance_gateway_webhook_events TO authenticated;
GRANT ALL ON public.finance_gateway_webhook_events TO service_role;
ALTER TABLE public.finance_gateway_webhook_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gateway events read members" ON public.finance_gateway_webhook_events;
CREATE POLICY "gateway events read members" ON public.finance_gateway_webhook_events FOR SELECT TO authenticated
  USING (school_id IS NOT NULL AND public.is_school_member(school_id));

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid,
  user_id uuid,
  in_app_enabled boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT true,
  sms_enabled boolean NOT NULL DEFAULT false,
  whatsapp_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notification prefs own" ON public.notification_preferences;
CREATE POLICY "notification prefs own" ON public.notification_preferences FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- updated_at triggers
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fee_plans','fee_items','finance_contracts','finance_invoices','finance_receipts','siga_cash_expenses','finance_payment_plans','notification_preferences']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON public.%I', t);
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t);
  END LOOP;
END $$;

-- ============================================================
-- RPCs used by the application
-- ============================================================
CREATE OR REPLACE FUNCTION public.next_school_document_number(school_id uuid, prefix text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_seq bigint;
BEGIN
  SELECT count(*) + 1 INTO v_seq FROM public.audit_logs
   WHERE audit_logs.school_id = next_school_document_number.school_id
     AND action = 'document_number'
     AND entity = prefix;
  INSERT INTO public.audit_logs (school_id, action, entity, entity_id, actor_id)
  VALUES (next_school_document_number.school_id, 'document_number', prefix, gen_random_uuid(), auth.uid());
  RETURN prefix || '-' || to_char(now(), 'YYYY') || '-' || lpad(v_seq::text, 5, '0');
END $$;

CREATE OR REPLACE FUNCTION public.register_student(
  school_id uuid,
  person_id uuid,
  admission_date date DEFAULT CURRENT_DATE,
  guardian_person_id uuid DEFAULT NULL,
  relationship text DEFAULT NULL,
  primary_guardian boolean DEFAULT false,
  financial_responsibility boolean DEFAULT false,
  pickup_authorization boolean DEFAULT true
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_number text;
  v_student public.students;
BEGIN
  IF NOT public.is_school_member(register_student.school_id) THEN
    RAISE EXCEPTION 'Sem permissão nesta escola.';
  END IF;
  SELECT 'A' || to_char(now(), 'YYYY') || lpad((count(*) + 1)::text, 4, '0')
    INTO v_number FROM public.students s WHERE s.school_id = register_student.school_id;
  WHILE EXISTS (SELECT 1 FROM public.students s WHERE s.school_id = register_student.school_id AND s.registration_number = v_number) LOOP
    v_number := v_number || 'B';
  END LOOP;

  INSERT INTO public.students (school_id, person_id, registration_number, student_number, status, admitted_on, admission_date, created_by)
  VALUES (register_student.school_id, register_student.person_id, v_number, v_number, 'active',
          register_student.admission_date, register_student.admission_date, auth.uid())
  RETURNING * INTO v_student;

  IF register_student.guardian_person_id IS NOT NULL THEN
    INSERT INTO public.student_guardians (school_id, student_id, guardian_person_id, relationship,
      is_primary, is_pickup_authorized, authorized_pickup, financial_responsibility, created_by)
    VALUES (register_student.school_id, v_student.id, register_student.guardian_person_id,
      COALESCE(register_student.relationship, 'other'), COALESCE(register_student.primary_guardian, false),
      COALESCE(register_student.pickup_authorization, true), COALESCE(register_student.pickup_authorization, true),
      COALESCE(register_student.financial_responsibility, false), auth.uid());
  END IF;

  RETURN json_build_object('studentId', v_student.id, 'studentNumber', v_student.registration_number, 'status', v_student.status);
END $$;

CREATE OR REPLACE FUNCTION public.enroll_student(
  school_id uuid,
  student_id uuid,
  class_group_id uuid,
  enrolled_on date DEFAULT CURRENT_DATE
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_year uuid;
  v_number text;
  v_enrollment public.enrollments;
BEGIN
  IF NOT public.is_school_member(enroll_student.school_id) THEN
    RAISE EXCEPTION 'Sem permissão nesta escola.';
  END IF;
  SELECT cg.academic_year_id INTO v_year FROM public.class_groups cg
   WHERE cg.id = enroll_student.class_group_id AND cg.school_id = enroll_student.school_id;
  IF v_year IS NULL THEN RAISE EXCEPTION 'Turma não encontrada nesta escola.'; END IF;

  SELECT id INTO v_enrollment.id FROM public.enrollments e
   WHERE e.school_id = enroll_student.school_id AND e.student_id = enroll_student.student_id
     AND e.academic_year_id = v_year AND e.status IN ('pending','active') LIMIT 1;
  IF v_enrollment.id IS NOT NULL THEN
    UPDATE public.enrollments SET class_group_id = enroll_student.class_group_id, status = 'active',
      enrolled_on = enroll_student.enrolled_on, updated_at = now(), updated_by = auth.uid()
     WHERE id = v_enrollment.id RETURNING * INTO v_enrollment;
    RETURN json_build_object('enrollmentId', v_enrollment.id,
      'enrollmentNumber', COALESCE(v_enrollment.enrollment_number, v_enrollment.id::text));
  END IF;

  SELECT 'M' || to_char(now(), 'YYYY') || lpad((count(*) + 1)::text, 5, '0')
    INTO v_number FROM public.enrollments e WHERE e.school_id = enroll_student.school_id;

  INSERT INTO public.enrollments (school_id, student_id, academic_year_id, class_group_id, status,
    enrolled_on, enrollment_number, created_by)
  VALUES (enroll_student.school_id, enroll_student.student_id, v_year, enroll_student.class_group_id,
    'active', enroll_student.enrolled_on, v_number, auth.uid())
  RETURNING * INTO v_enrollment;

  RETURN json_build_object('enrollmentId', v_enrollment.id, 'enrollmentNumber', v_enrollment.enrollment_number);
END $$;

CREATE OR REPLACE FUNCTION public.register_payment(
  school_id uuid,
  invoice_id uuid,
  amount numeric,
  payment_method text DEFAULT 'cash',
  paid_on date DEFAULT CURRENT_DATE
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invoice public.finance_invoices;
  v_paid numeric;
  v_total numeric;
  v_number text;
  v_receipt public.finance_receipts;
  v_status text;
BEGIN
  IF NOT public.is_school_member(register_payment.school_id) THEN
    RAISE EXCEPTION 'Sem permissão nesta escola.';
  END IF;
  IF register_payment.payment_method NOT IN ('cash','bank_transfer','card','other') THEN
    RAISE EXCEPTION 'Método de pagamento inválido.';
  END IF;
  IF register_payment.amount IS NULL OR register_payment.amount <= 0 THEN
    RAISE EXCEPTION 'Valor do pagamento inválido.';
  END IF;

  SELECT * INTO v_invoice FROM public.finance_invoices fi
   WHERE fi.id = register_payment.invoice_id AND fi.school_id = register_payment.school_id FOR UPDATE;
  IF v_invoice.id IS NULL THEN RAISE EXCEPTION 'Fatura não encontrada nesta escola.'; END IF;
  IF v_invoice.status = 'cancelled' THEN RAISE EXCEPTION 'Esta fatura está cancelada.'; END IF;

  v_total := v_invoice.amount - v_invoice.discount_amount + v_invoice.penalty_amount;
  SELECT COALESCE(sum(fr.amount), 0) INTO v_paid FROM public.finance_receipts fr
   WHERE fr.invoice_id = v_invoice.id AND fr.status <> 'reversed';
  IF v_paid + register_payment.amount > v_total + 0.005 THEN
    RAISE EXCEPTION 'O valor excede o saldo em aberto da fatura (% Kz).', round(v_total - v_paid, 2);
  END IF;

  SELECT 'REC-' || to_char(now(), 'YYYY') || '-' || lpad((count(*) + 1)::text, 5, '0')
    INTO v_number FROM public.finance_receipts fr WHERE fr.school_id = register_payment.school_id;
  WHILE EXISTS (SELECT 1 FROM public.finance_receipts fr WHERE fr.school_id = register_payment.school_id AND fr.receipt_number = v_number) LOOP
    v_number := v_number || 'B';
  END LOOP;

  INSERT INTO public.finance_receipts (school_id, invoice_id, receipt_number, amount, paid_on, payment_method, status, created_by)
  VALUES (register_payment.school_id, v_invoice.id, v_number, register_payment.amount,
          register_payment.paid_on, register_payment.payment_method, 'posted', auth.uid())
  RETURNING * INTO v_receipt;

  v_paid := v_paid + register_payment.amount;
  v_status := CASE WHEN v_paid >= v_total - 0.005 THEN 'paid' WHEN v_paid > 0 THEN 'partial' ELSE 'open' END;
  UPDATE public.finance_invoices SET status = v_status, updated_at = now() WHERE id = v_invoice.id;

  RETURN json_build_object('receiptId', v_receipt.id, 'receiptNumber', v_receipt.receipt_number, 'invoiceStatus', v_status);
END $$;

REVOKE ALL ON FUNCTION public.register_student(uuid, uuid, date, uuid, text, boolean, boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enroll_student(uuid, uuid, uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_payment(uuid, uuid, numeric, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.next_school_document_number(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_student(uuid, uuid, date, uuid, text, boolean, boolean, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enroll_student(uuid, uuid, uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.register_payment(uuid, uuid, numeric, text, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_school_document_number(uuid, text) TO authenticated, service_role;