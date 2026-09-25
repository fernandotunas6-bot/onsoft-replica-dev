CREATE TABLE public.payment_gateway_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'appypay',
  invoice_id uuid NOT NULL,
  student_name text,
  method text NOT NULL,
  merchant_transaction_id text NOT NULL UNIQUE,
  provider_charge_id text UNIQUE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  reference_entity text,
  reference_number text,
  phone_number text,
  status text NOT NULL DEFAULT 'pending',
  status_message text,
  receipt_number text,
  reconciled_at timestamptz,
  last_webhook_at timestamptz,
  raw_last_payload jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_gateway_charges_invoice ON public.payment_gateway_charges(school_id, invoice_id);
CREATE INDEX idx_gateway_charges_status ON public.payment_gateway_charges(school_id, status);
GRANT SELECT ON public.payment_gateway_charges TO authenticated;
GRANT ALL ON public.payment_gateway_charges TO service_role;
ALTER TABLE public.payment_gateway_charges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros da escola vêem cobranças" ON public.payment_gateway_charges
  FOR SELECT TO authenticated USING (public.is_school_member(school_id));
CREATE TRIGGER trg_gateway_charges_updated BEFORE UPDATE ON public.payment_gateway_charges
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();