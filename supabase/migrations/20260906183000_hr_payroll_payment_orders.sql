-- SIGA / Onsoft — ordens de pagamento salarial
-- Separa folha aprovada, ordem de pagamento e saída efectiva de caixa.

CREATE TABLE public.hr_payment_settings (
  school_id uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  require_dual_control boolean NOT NULL DEFAULT true,
  default_method text NOT NULL DEFAULT 'transfer' CHECK (default_method IN ('transfer','cash','other')),
  allow_manual_confirmation boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  version integer NOT NULL DEFAULT 1
);

CREATE TABLE public.hr_payment_destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  employment_id uuid NOT NULL REFERENCES public.hr_employments(id),
  method text NOT NULL DEFAULT 'transfer' CHECK (method IN ('transfer','cash','other')),
  beneficiary_name text NOT NULL,
  bank_name text,
  iban text,
  account_number text,
  destination_reference text,
  is_primary boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CHECK (
    method <> 'transfer'
    OR iban IS NOT NULL
    OR account_number IS NOT NULL
    OR destination_reference IS NOT NULL
  )
);

CREATE UNIQUE INDEX hr_payment_destinations_primary_idx
  ON public.hr_payment_destinations (school_id, employment_id)
  WHERE is_primary AND active AND deleted_at IS NULL;

CREATE TABLE public.hr_payroll_payment_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  payroll_run_id uuid NOT NULL REFERENCES public.hr_payroll_runs(id),
  batch_number text NOT NULL,
  method text NOT NULL DEFAULT 'transfer' CHECK (method IN ('transfer','cash','other')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft','awaiting_authorization','authorized','processing','partial','completed','failed','cancelled'
  )),
  total_amount_kz numeric(16,2) NOT NULL DEFAULT 0 CHECK (total_amount_kz >= 0),
  payable_count integer NOT NULL DEFAULT 0 CHECK (payable_count >= 0),
  blocked_count integer NOT NULL DEFAULT 0 CHECK (blocked_count >= 0),
  prepared_at timestamptz NOT NULL DEFAULT now(),
  prepared_by uuid NOT NULL REFERENCES auth.users(id),
  authorized_at timestamptz,
  authorized_by uuid REFERENCES auth.users(id),
  execution_reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  version integer NOT NULL DEFAULT 1,
  UNIQUE (school_id, payroll_run_id),
  UNIQUE (school_id, batch_number)
);

CREATE TABLE public.hr_payroll_payment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.hr_payroll_payment_batches(id) ON DELETE CASCADE,
  payroll_item_id uuid NOT NULL REFERENCES public.hr_payroll_items(id),
  employment_id uuid NOT NULL REFERENCES public.hr_employments(id),
  destination_id uuid REFERENCES public.hr_payment_destinations(id),
  beneficiary_name text NOT NULL,
  destination_label text,
  amount_kz numeric(14,2) NOT NULL CHECK (amount_kz >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'blocked','pending','authorized','processing','paid','failed','cancelled'
  )),
  block_reason text,
  provider_reference text,
  failure_reason text,
  paid_at timestamptz,
  confirmed_by uuid REFERENCES auth.users(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  version integer NOT NULL DEFAULT 1,
  UNIQUE (batch_id, payroll_item_id)
);

CREATE INDEX hr_payroll_payment_batches_status_idx
  ON public.hr_payroll_payment_batches (school_id, status, created_at DESC);
CREATE INDEX hr_payroll_payment_items_status_idx
  ON public.hr_payroll_payment_items (school_id, batch_id, status);

CREATE OR REPLACE FUNCTION public.hr_assert_payment_destination_school()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE v_school uuid;
BEGIN
  SELECT school_id INTO v_school FROM public.hr_employments WHERE id = NEW.employment_id;
  IF v_school IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'HR cross-school payment destination reference';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.hr_assert_payment_item_school()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE v_school uuid;
BEGIN
  SELECT school_id INTO v_school FROM public.hr_payroll_payment_batches WHERE id = NEW.batch_id;
  IF v_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'HR cross-school payment batch reference'; END IF;
  SELECT school_id INTO v_school FROM public.hr_payroll_items WHERE id = NEW.payroll_item_id;
  IF v_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'HR cross-school payroll item payment reference'; END IF;
  SELECT school_id INTO v_school FROM public.hr_employments WHERE id = NEW.employment_id;
  IF v_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'HR cross-school payment employment reference'; END IF;
  IF NEW.destination_id IS NOT NULL THEN
    SELECT school_id INTO v_school FROM public.hr_payment_destinations WHERE id = NEW.destination_id;
    IF v_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'HR cross-school destination reference'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER hr_payment_destinations_same_school
  BEFORE INSERT OR UPDATE ON public.hr_payment_destinations
  FOR EACH ROW EXECUTE FUNCTION public.hr_assert_payment_destination_school();
CREATE TRIGGER hr_payroll_payment_items_same_school
  BEFORE INSERT OR UPDATE ON public.hr_payroll_payment_items
  FOR EACH ROW EXECUTE FUNCTION public.hr_assert_payment_item_school();

CREATE TRIGGER hr_payment_settings_set_updated_at BEFORE UPDATE ON public.hr_payment_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER hr_payment_destinations_set_updated_at BEFORE UPDATE ON public.hr_payment_destinations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER hr_payroll_payment_batches_set_updated_at BEFORE UPDATE ON public.hr_payroll_payment_batches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER hr_payroll_payment_items_set_updated_at BEFORE UPDATE ON public.hr_payroll_payment_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();

GRANT SELECT, INSERT, UPDATE ON public.hr_payment_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.hr_payment_destinations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.hr_payroll_payment_batches TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.hr_payroll_payment_items TO authenticated;
GRANT ALL ON public.hr_payment_settings, public.hr_payment_destinations,
  public.hr_payroll_payment_batches, public.hr_payroll_payment_items TO service_role;

ALTER TABLE public.hr_payment_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payment_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payment_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payment_destinations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payroll_payment_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payroll_payment_batches FORCE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payroll_payment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payroll_payment_items FORCE ROW LEVEL SECURITY;

CREATE POLICY "HR payment settings own school" ON public.hr_payment_settings
  FOR ALL TO authenticated
  USING (school_id = (SELECT public.current_school_id()) AND (SELECT public.current_profile_role()) IN ('Administrador','Tesouraria'))
  WITH CHECK (school_id = (SELECT public.current_school_id()) AND (SELECT public.current_profile_role()) IN ('Administrador','Tesouraria'));
CREATE POLICY "HR payment destinations own school" ON public.hr_payment_destinations
  FOR ALL TO authenticated
  USING (school_id = (SELECT public.current_school_id()) AND (SELECT public.current_profile_role()) IN ('Administrador','Tesouraria'))
  WITH CHECK (school_id = (SELECT public.current_school_id()) AND (SELECT public.current_profile_role()) IN ('Administrador','Tesouraria'));
CREATE POLICY "HR payment batches own school" ON public.hr_payroll_payment_batches
  FOR ALL TO authenticated
  USING (school_id = (SELECT public.current_school_id()) AND (SELECT public.current_profile_role()) IN ('Administrador','Tesouraria'))
  WITH CHECK (school_id = (SELECT public.current_school_id()) AND (SELECT public.current_profile_role()) IN ('Administrador','Tesouraria'));
CREATE POLICY "HR payment items own school" ON public.hr_payroll_payment_items
  FOR ALL TO authenticated
  USING (school_id = (SELECT public.current_school_id()) AND (SELECT public.current_profile_role()) IN ('Administrador','Tesouraria'))
  WITH CHECK (school_id = (SELECT public.current_school_id()) AND (SELECT public.current_profile_role()) IN ('Administrador','Tesouraria'));

CREATE OR REPLACE FUNCTION public.hr_create_payroll_payment_batch(p_payroll_run_id uuid)
RETURNS public.hr_payroll_payment_batches
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_school uuid := public.current_school_id();
  v_role text := public.current_profile_role();
  v_run public.hr_payroll_runs;
  v_settings public.hr_payment_settings;
  v_batch public.hr_payroll_payment_batches;
  v_batch_number text;
BEGIN
  IF v_school IS NULL OR v_role NOT IN ('Administrador','Tesouraria') THEN
    RAISE EXCEPTION 'Insufficient payroll payment permission';
  END IF;

  SELECT * INTO v_run FROM public.hr_payroll_runs
  WHERE id = p_payroll_run_id AND school_id = v_school FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll run not found'; END IF;
  IF v_run.status <> 'approved' THEN RAISE EXCEPTION 'Payroll run must be approved before payment order'; END IF;

  SELECT * INTO v_batch FROM public.hr_payroll_payment_batches
  WHERE school_id = v_school AND payroll_run_id = v_run.id;
  IF FOUND THEN RETURN v_batch; END IF;

  SELECT * INTO v_settings FROM public.hr_payment_settings WHERE school_id = v_school;
  IF NOT FOUND THEN
    v_settings.require_dual_control := true;
    v_settings.default_method := 'transfer';
  END IF;

  v_batch_number := format('SAL-%s-%s-%s', v_run.competence_year, lpad(v_run.competence_month::text,2,'0'), substr(replace(v_run.id::text,'-',''),1,8));

  INSERT INTO public.hr_payroll_payment_batches (
    school_id, payroll_run_id, batch_number, method, status,
    total_amount_kz, payable_count, blocked_count,
    prepared_by, created_by, updated_by
  ) VALUES (
    v_school, v_run.id, v_batch_number, v_settings.default_method, 'draft',
    0, 0, 0, auth.uid(), auth.uid(), auth.uid()
  ) RETURNING * INTO v_batch;

  INSERT INTO public.hr_payroll_payment_items (
    school_id, batch_id, payroll_item_id, employment_id, destination_id,
    beneficiary_name, destination_label, amount_kz, status, block_reason,
    created_by, updated_by
  )
  SELECT
    v_school,
    v_batch.id,
    pi.id,
    pi.employment_id,
    dest.id,
    COALESCE(dest.beneficiary_name, p.full_name, 'Beneficiário'),
    CASE
      WHEN dest.method = 'transfer' AND dest.iban IS NOT NULL THEN concat('IBAN ••••', right(regexp_replace(dest.iban, '\s', '', 'g'), 4))
      WHEN dest.method = 'transfer' AND dest.account_number IS NOT NULL THEN concat('Conta ••••', right(dest.account_number, 4))
      WHEN dest.method = 'cash' THEN 'Pagamento em numerário'
      ELSE dest.destination_reference
    END,
    pi.net_amount_kz,
    CASE WHEN dest.id IS NULL THEN 'blocked' ELSE 'pending' END,
    CASE WHEN dest.id IS NULL THEN 'Destino de pagamento não configurado' ELSE NULL END,
    auth.uid(), auth.uid()
  FROM public.hr_payroll_items pi
  JOIN public.hr_employments e ON e.id = pi.employment_id AND e.school_id = v_school
  JOIN public.people p ON p.id = e.person_id AND p.school_id = v_school
  LEFT JOIN LATERAL (
    SELECT d.* FROM public.hr_payment_destinations d
    WHERE d.school_id = v_school
      AND d.employment_id = pi.employment_id
      AND d.active
      AND d.deleted_at IS NULL
    ORDER BY d.is_primary DESC, d.created_at DESC
    LIMIT 1
  ) dest ON true
  WHERE pi.payroll_run_id = v_run.id
    AND pi.school_id = v_school
    AND pi.status = 'approved'
    AND pi.net_amount_kz > 0;

  UPDATE public.hr_payroll_payment_batches b
  SET total_amount_kz = COALESCE((SELECT sum(i.amount_kz) FROM public.hr_payroll_payment_items i WHERE i.batch_id = b.id AND i.status <> 'cancelled'),0),
      payable_count = COALESCE((SELECT count(*) FROM public.hr_payroll_payment_items i WHERE i.batch_id = b.id AND i.status = 'pending'),0),
      blocked_count = COALESCE((SELECT count(*) FROM public.hr_payroll_payment_items i WHERE i.batch_id = b.id AND i.status = 'blocked'),0),
      status = CASE WHEN EXISTS (SELECT 1 FROM public.hr_payroll_payment_items i WHERE i.batch_id = b.id AND i.status = 'blocked') THEN 'draft' ELSE 'awaiting_authorization' END,
      updated_by = auth.uid()
  WHERE b.id = v_batch.id
  RETURNING * INTO v_batch;

  RETURN v_batch;
END;
$$;

CREATE OR REPLACE FUNCTION public.hr_authorize_payroll_payment_batch(p_batch_id uuid)
RETURNS public.hr_payroll_payment_batches
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_school uuid := public.current_school_id();
  v_role text := public.current_profile_role();
  v_settings public.hr_payment_settings;
  v_batch public.hr_payroll_payment_batches;
BEGIN
  IF v_school IS NULL OR v_role NOT IN ('Administrador','Tesouraria') THEN RAISE EXCEPTION 'Insufficient payment authorization permission'; END IF;
  SELECT * INTO v_batch FROM public.hr_payroll_payment_batches WHERE id = p_batch_id AND school_id = v_school FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment batch not found'; END IF;
  IF v_batch.status NOT IN ('draft','awaiting_authorization') THEN RAISE EXCEPTION 'Payment batch is not awaiting authorization'; END IF;
  IF EXISTS (SELECT 1 FROM public.hr_payroll_payment_items WHERE batch_id = v_batch.id AND status = 'blocked') THEN
    RAISE EXCEPTION 'Payment batch has blocked beneficiaries';
  END IF;

  SELECT * INTO v_settings FROM public.hr_payment_settings WHERE school_id = v_school;
  IF COALESCE(v_settings.require_dual_control, true) AND v_batch.prepared_by = auth.uid() THEN
    RAISE EXCEPTION 'Dual control requires a different user to authorize the payment batch';
  END IF;

  UPDATE public.hr_payroll_payment_items
  SET status = 'authorized', updated_by = auth.uid()
  WHERE batch_id = v_batch.id AND status = 'pending';

  UPDATE public.hr_payroll_payment_batches
  SET status = 'authorized', authorized_at = now(), authorized_by = auth.uid(), updated_by = auth.uid()
  WHERE id = v_batch.id
  RETURNING * INTO v_batch;
  RETURN v_batch;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hr_create_payroll_payment_batch(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hr_authorize_payroll_payment_batch(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_create_payroll_payment_batch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_authorize_payroll_payment_batch(uuid) TO authenticated;

COMMENT ON TABLE public.hr_payroll_payment_batches IS
  'Ordem salarial derivada de folha aprovada; autorização não equivale a transferência nem saída de caixa.';

NOTIFY pgrst, 'reload schema';