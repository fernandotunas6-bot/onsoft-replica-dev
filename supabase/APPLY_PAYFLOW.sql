-- SIGA Plus / PayFlow — canonical SGA patch
-- Run order:
--   1. APPLY_IN_SQL_EDITOR.sql
--   2. APPLY_ENROLLMENT_AND_PREMIUM.sql
--   3. APPLY_SAAS_PLATFORM.sql
--   4. APPLY_DIGITAL_IDENTITY.sql
--   5. PAYFLOW_PREFLIGHT.sql
--   6. APPLY_PAYFLOW.sql
--
-- This file is intentionally idempotent and extends the current SGA financial
-- model. It never recreates finance_invoices or finance_receipts.

-- PayFlow orchestration layer.
-- This migration intentionally does NOT create a second accounting ledger.
-- finance_invoices / finance_receipts remain the SIGA financial source of truth.
-- Public checkout access is served by trusted server routes; anon/authenticated
-- receive no direct grants on PayFlow tables.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.payflow_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.payflow_touch_updated_at() FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.payflow_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (label = btrim(label) AND char_length(label) BETWEEN 2 AND 80),
  bank_name text NOT NULL CHECK (bank_name = btrim(bank_name) AND char_length(bank_name) BETWEEN 2 AND 120),
  account_holder text NOT NULL CHECK (
    account_holder = btrim(account_holder) AND char_length(account_holder) BETWEEN 2 AND 160
  ),
  iban text NOT NULL CHECK (
    iban = upper(replace(iban, ' ', '')) AND char_length(iban) BETWEEN 15 AND 34
  ),
  swift text CHECK (swift IS NULL OR char_length(btrim(swift)) BETWEEN 8 AND 11),
  currency text NOT NULL DEFAULT 'AOA' CHECK (currency = 'AOA'),
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  verification_status text NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'pending', 'verified', 'rejected')),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (school_id, iban)
);

CREATE UNIQUE INDEX IF NOT EXISTS payflow_bank_accounts_one_default_idx
  ON public.payflow_bank_accounts (school_id)
  WHERE is_default AND is_active;
CREATE INDEX IF NOT EXISTS payflow_bank_accounts_active_idx
  ON public.payflow_bank_accounts (school_id, is_active, created_at DESC);

CREATE TABLE IF NOT EXISTS public.payflow_checkouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_token text NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex')
    CHECK (public_token ~ '^[0-9a-f]{32}$'),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  invoice_id uuid,
  student_id uuid,
  source_type text NOT NULL DEFAULT 'invoice'
    CHECK (source_type IN ('invoice', 'subscription', 'service', 'package', 'other')),
  source_id uuid,
  merchant_name text NOT NULL CHECK (
    merchant_name = btrim(merchant_name) AND char_length(merchant_name) BETWEEN 2 AND 160
  ),
  title text NOT NULL CHECK (title = btrim(title) AND char_length(title) BETWEEN 2 AND 180),
  description text,
  payer_name text,
  payer_email text,
  payer_phone text,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'AOA' CHECK (currency = 'AOA'),
  status text NOT NULL DEFAULT 'open'
    CHECK (
      status IN (
        'draft', 'open', 'pending', 'proof_submitted', 'under_review',
        'verified', 'paid', 'expired', 'cancelled', 'failed'
      )
    ),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  paid_at timestamptz,
  cancelled_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (public_token)
);

CREATE INDEX IF NOT EXISTS payflow_checkouts_school_recent_idx
  ON public.payflow_checkouts (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payflow_checkouts_school_status_idx
  ON public.payflow_checkouts (school_id, status, expires_at);
CREATE INDEX IF NOT EXISTS payflow_checkouts_invoice_idx
  ON public.payflow_checkouts (school_id, invoice_id)
  WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payflow_checkouts_student_idx
  ON public.payflow_checkouts (school_id, student_id, created_at DESC)
  WHERE student_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.payflow_checkout_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_id uuid NOT NULL REFERENCES public.payflow_checkouts(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (label = btrim(label) AND char_length(label) BETWEEN 1 AND 180),
  description text,
  quantity numeric(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_amount numeric(14,2) NOT NULL CHECK (unit_amount >= 0),
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS payflow_checkout_items_checkout_idx
  ON public.payflow_checkout_items (checkout_id, created_at);

CREATE TABLE IF NOT EXISTS public.payflow_payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_id uuid NOT NULL REFERENCES public.payflow_checkouts(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  method text NOT NULL CHECK (
    method IN ('bank_transfer', 'multicaixa_express', 'unitel_money', 'kwik', 'paypay', 'manual')
  ),
  provider text NOT NULL CHECK (
    provider IN ('bank_transfer', 'emis', 'unitel_money', 'kwik', 'paypay', 'manual')
  ),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'AOA' CHECK (currency = 'AOA'),
  status text NOT NULL DEFAULT 'requires_action'
    CHECK (
      status IN (
        'requires_action', 'pending', 'proof_submitted', 'under_review',
        'verified', 'succeeded', 'failed', 'cancelled', 'expired'
      )
    ),
  idempotency_key text NOT NULL CHECK (
    idempotency_key = btrim(idempotency_key) AND char_length(idempotency_key) BETWEEN 8 AND 160
  ),
  provider_reference text,
  external_transaction_id text,
  expires_at timestamptz,
  verified_at timestamptz,
  succeeded_at timestamptz,
  failure_code text,
  failure_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (school_id, idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS payflow_intents_provider_external_unique_idx
  ON public.payflow_payment_intents (provider, external_transaction_id)
  WHERE external_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payflow_intents_checkout_idx
  ON public.payflow_payment_intents (checkout_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payflow_intents_school_status_idx
  ON public.payflow_payment_intents (school_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.payflow_bank_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id uuid NOT NULL UNIQUE REFERENCES public.payflow_payment_intents(id) ON DELETE CASCADE,
  checkout_id uuid NOT NULL REFERENCES public.payflow_checkouts(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  bank_account_id uuid NOT NULL REFERENCES public.payflow_bank_accounts(id) ON DELETE RESTRICT,
  reference text NOT NULL CHECK (
    reference = btrim(reference) AND char_length(reference) BETWEEN 6 AND 80
  ),
  expected_amount numeric(14,2) NOT NULL CHECK (expected_amount > 0),
  currency text NOT NULL DEFAULT 'AOA' CHECK (currency = 'AOA'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (
      status IN (
        'pending', 'proof_submitted', 'under_review', 'matched',
        'mismatch', 'verified', 'expired', 'cancelled'
      )
    ),
  proof_storage_path text,
  proof_sha256 text CHECK (
    proof_sha256 IS NULL OR proof_sha256 ~ '^[0-9a-f]{64}$'
  ),
  proof_received_at timestamptz,
  bank_transaction_id text,
  bank_posted_at timestamptz,
  bank_amount numeric(14,2) CHECK (bank_amount IS NULL OR bank_amount > 0),
  bank_reference text,
  reconciliation_note text,
  verified_at timestamptz,
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, reference)
);

CREATE UNIQUE INDEX IF NOT EXISTS payflow_bank_transfer_bank_tx_unique_idx
  ON public.payflow_bank_transfers (school_id, bank_transaction_id)
  WHERE bank_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payflow_bank_transfers_review_idx
  ON public.payflow_bank_transfers (school_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.payflow_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  checkout_id uuid NOT NULL REFERENCES public.payflow_checkouts(id) ON DELETE RESTRICT,
  intent_id uuid NOT NULL REFERENCES public.payflow_payment_intents(id) ON DELETE RESTRICT,
  invoice_id uuid,
  provider text NOT NULL,
  method text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'AOA' CHECK (currency = 'AOA'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (
      status IN (
        'pending', 'verified', 'settled', 'failed',
        'reversed', 'partial_refund', 'refunded'
      )
    ),
  reference text,
  external_transaction_id text,
  idempotency_key text NOT NULL CHECK (
    idempotency_key = btrim(idempotency_key) AND char_length(idempotency_key) BETWEEN 8 AND 160
  ),
  finance_receipt_id uuid,
  finance_receipt_number text,
  verified_at timestamptz,
  settled_at timestamptz,
  reversed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS payflow_transactions_external_unique_idx
  ON public.payflow_transactions (provider, external_transaction_id)
  WHERE external_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payflow_transactions_school_recent_idx
  ON public.payflow_transactions (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payflow_transactions_invoice_idx
  ON public.payflow_transactions (school_id, invoice_id)
  WHERE invoice_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.payflow_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES public.payflow_transactions(id) ON DELETE RESTRICT,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'AOA' CHECK (currency = 'AOA'),
  status text NOT NULL DEFAULT 'requested'
    CHECK (
      status IN ('requested', 'approved', 'processing', 'succeeded', 'failed', 'cancelled')
    ),
  reason text NOT NULL CHECK (reason = btrim(reason) AND char_length(reason) BETWEEN 3 AND 800),
  provider_refund_id text,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  completed_at timestamptz,
  failure_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS payflow_refunds_school_status_idx
  ON public.payflow_refunds (school_id, status, requested_at DESC);
CREATE INDEX IF NOT EXISTS payflow_refunds_transaction_idx
  ON public.payflow_refunds (transaction_id, requested_at DESC);

CREATE TABLE IF NOT EXISTS public.payflow_reconciliation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  checkout_id uuid REFERENCES public.payflow_checkouts(id) ON DELETE SET NULL,
  intent_id uuid REFERENCES public.payflow_payment_intents(id) ON DELETE SET NULL,
  transaction_id uuid REFERENCES public.payflow_transactions(id) ON DELETE SET NULL,
  transfer_id uuid REFERENCES public.payflow_bank_transfers(id) ON DELETE SET NULL,
  source text NOT NULL CHECK (
    source IN ('proof', 'bank_statement', 'bank_api', 'gateway_webhook', 'manual')
  ),
  result text NOT NULL CHECK (
    result IN ('received', 'matched', 'mismatch', 'verified', 'rejected', 'duplicate', 'error')
  ),
  bank_transaction_id text,
  expected_amount numeric(14,2),
  observed_amount numeric(14,2),
  expected_reference text,
  observed_reference text,
  reason text,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payflow_reconciliation_school_recent_idx
  ON public.payflow_reconciliation_events (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payflow_reconciliation_transfer_idx
  ON public.payflow_reconciliation_events (transfer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.payflow_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  provider text NOT NULL,
  event_key text NOT NULL,
  event_type text,
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'processing', 'processed', 'failed', 'ignored')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 100),
  last_error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object'),
  UNIQUE (provider, event_key)
);

CREATE INDEX IF NOT EXISTS payflow_webhooks_status_idx
  ON public.payflow_webhook_events (status, received_at DESC);
CREATE INDEX IF NOT EXISTS payflow_webhooks_school_recent_idx
  ON public.payflow_webhook_events (school_id, received_at DESC)
  WHERE school_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.payflow_notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  checkout_id uuid REFERENCES public.payflow_checkouts(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp', 'portal')),
  template_key text NOT NULL CHECK (
    template_key = btrim(template_key) AND char_length(template_key) BETWEEN 2 AND 100
  ),
  recipient_hint text,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'cancelled')),
  provider_message_id text,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
  last_error text,
  queued_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS payflow_notifications_school_recent_idx
  ON public.payflow_notification_events (school_id, queued_at DESC);
CREATE INDEX IF NOT EXISTS payflow_notifications_status_idx
  ON public.payflow_notification_events (status, queued_at);

CREATE TABLE IF NOT EXISTS public.payflow_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_kind text NOT NULL DEFAULT 'system'
    CHECK (actor_kind IN ('user', 'system', 'gateway', 'bank', 'support')),
  action text NOT NULL CHECK (action = btrim(action) AND char_length(action) BETWEEN 2 AND 120),
  entity_type text NOT NULL CHECK (
    entity_type = btrim(entity_type) AND char_length(entity_type) BETWEEN 2 AND 80
  ),
  entity_id uuid,
  result text NOT NULL DEFAULT 'success'
    CHECK (result IN ('success', 'denied', 'failed', 'noop')),
  request_id text,
  ip_hash text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payflow_audit_school_recent_idx
  ON public.payflow_audit_events (school_id, created_at DESC)
  WHERE school_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payflow_audit_entity_idx
  ON public.payflow_audit_events (entity_type, entity_id, created_at DESC)
  WHERE entity_id IS NOT NULL;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'payflow_bank_accounts',
    'payflow_checkouts',
    'payflow_checkout_items',
    'payflow_payment_intents',
    'payflow_bank_transfers',
    'payflow_transactions',
    'payflow_refunds',
    'payflow_reconciliation_events',
    'payflow_webhook_events',
    'payflow_notification_events',
    'payflow_audit_events'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', table_name);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', table_name);
  END LOOP;
END;
$$;

DROP TRIGGER IF EXISTS payflow_bank_accounts_touch ON public.payflow_bank_accounts;
CREATE TRIGGER payflow_bank_accounts_touch
  BEFORE UPDATE ON public.payflow_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION private.payflow_touch_updated_at();

DROP TRIGGER IF EXISTS payflow_checkouts_touch ON public.payflow_checkouts;
CREATE TRIGGER payflow_checkouts_touch
  BEFORE UPDATE ON public.payflow_checkouts
  FOR EACH ROW EXECUTE FUNCTION private.payflow_touch_updated_at();

DROP TRIGGER IF EXISTS payflow_intents_touch ON public.payflow_payment_intents;
CREATE TRIGGER payflow_intents_touch
  BEFORE UPDATE ON public.payflow_payment_intents
  FOR EACH ROW EXECUTE FUNCTION private.payflow_touch_updated_at();

DROP TRIGGER IF EXISTS payflow_bank_transfers_touch ON public.payflow_bank_transfers;
CREATE TRIGGER payflow_bank_transfers_touch
  BEFORE UPDATE ON public.payflow_bank_transfers
  FOR EACH ROW EXECUTE FUNCTION private.payflow_touch_updated_at();

DROP TRIGGER IF EXISTS payflow_transactions_touch ON public.payflow_transactions;
CREATE TRIGGER payflow_transactions_touch
  BEFORE UPDATE ON public.payflow_transactions
  FOR EACH ROW EXECUTE FUNCTION private.payflow_touch_updated_at();

-- Add relational integrity to the current SGA finance model when those tables exist.
DO $$
BEGIN
  IF to_regclass('public.finance_invoices') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'payflow_checkouts_invoice_fkey'
     )
  THEN
    ALTER TABLE public.payflow_checkouts
      ADD CONSTRAINT payflow_checkouts_invoice_fkey
      FOREIGN KEY (invoice_id) REFERENCES public.finance_invoices(id)
      ON DELETE SET NULL NOT VALID;
  END IF;

  IF to_regclass('public.finance_receipts') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'payflow_transactions_receipt_fkey'
     )
  THEN
    ALTER TABLE public.payflow_transactions
      ADD CONSTRAINT payflow_transactions_receipt_fkey
      FOREIGN KEY (finance_receipt_id) REFERENCES public.finance_receipts(id)
      ON DELETE SET NULL NOT VALID;
  END IF;
END;
$$;

-- Private bucket: proofs are only uploaded/read through trusted server routes.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'payflow-proofs',
      'payflow-proofs',
      false,
      10485760,
      ARRAY['application/pdf', 'image/jpeg', 'image/png']::text[]
    )
    ON CONFLICT (id) DO UPDATE SET
      public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
  END IF;
END;
$$;

COMMENT ON TABLE public.payflow_checkouts IS
  'PayFlow public checkout orchestration. Accounting remains in SIGA finance_invoices/finance_receipts.';
COMMENT ON TABLE public.payflow_transactions IS
  'PayFlow transaction lifecycle; finance_receipt_id links to the official SIGA receipt after AAL2 settlement.';
COMMENT ON TABLE public.payflow_bank_transfers IS
  'Bank transfer instructions/proof/reconciliation. A proof upload never confirms payment by itself.';



-- ---------------------------------------------------------------------------
-- SGA-specific hardening for tables introduced by APPLY_ENROLLMENT_AND_PREMIUM.
-- ---------------------------------------------------------------------------

ALTER TABLE public.school_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_integrations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_integrations FROM anon;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.school_integrations FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.school_integrations TO authenticated;
GRANT ALL ON public.school_integrations TO service_role;

DROP POLICY IF EXISTS "Manage school integrations in own school" ON public.school_integrations;
DROP POLICY IF EXISTS "PayFlow read integrations" ON public.school_integrations;
DROP POLICY IF EXISTS "PayFlow create integrations" ON public.school_integrations;
DROP POLICY IF EXISTS "PayFlow update integrations" ON public.school_integrations;

CREATE POLICY "PayFlow read integrations"
  ON public.school_integrations
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_school_member(school_id))
    AND (
      (SELECT public.has_school_permission(school_id, 'finance.read'))
      OR (SELECT public.has_school_permission(school_id, 'finance.payment'))
    )
  );

CREATE POLICY "PayFlow create integrations"
  ON public.school_integrations
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_school_member(school_id))
    AND (SELECT public.has_school_permission(school_id, 'finance.payment'))
  );

CREATE POLICY "PayFlow update integrations"
  ON public.school_integrations
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_school_member(school_id))
    AND (SELECT public.has_school_permission(school_id, 'finance.payment'))
  )
  WITH CHECK (
    (SELECT public.is_school_member(school_id))
    AND (SELECT public.has_school_permission(school_id, 'finance.payment'))
  );

ALTER TABLE public.finance_payment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_payment_plans FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_payment_plans FROM anon;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.finance_payment_plans FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.finance_payment_plans TO authenticated;
GRANT ALL ON public.finance_payment_plans TO service_role;

DROP POLICY IF EXISTS "Manage payment plans in own school" ON public.finance_payment_plans;
DROP POLICY IF EXISTS "PayFlow read payment plans" ON public.finance_payment_plans;
DROP POLICY IF EXISTS "PayFlow create payment plans" ON public.finance_payment_plans;
DROP POLICY IF EXISTS "PayFlow update payment plans" ON public.finance_payment_plans;

CREATE POLICY "PayFlow read payment plans"
  ON public.finance_payment_plans
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_school_member(school_id))
    AND (
      (SELECT public.has_school_permission(school_id, 'finance.read'))
      OR (SELECT public.has_school_permission(school_id, 'finance.plans'))
    )
  );

CREATE POLICY "PayFlow create payment plans"
  ON public.finance_payment_plans
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_school_member(school_id))
    AND (SELECT public.has_school_permission(school_id, 'finance.plans'))
  );

CREATE POLICY "PayFlow update payment plans"
  ON public.finance_payment_plans
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_school_member(school_id))
    AND (SELECT public.has_school_permission(school_id, 'finance.plans'))
  )
  WITH CHECK (
    (SELECT public.is_school_member(school_id))
    AND (SELECT public.has_school_permission(school_id, 'finance.plans'))
  );

-- Existing payment plans were historically created without relational FKs.
-- Do not silently validate bad rows: fail with a count so data can be repaired.
DO $$
DECLARE
  orphan_invoices integer;
  orphan_students integer;
BEGIN
  SELECT count(*) INTO orphan_invoices
  FROM public.finance_payment_plans p
  WHERE p.invoice_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.finance_invoices i
      WHERE i.id = p.invoice_id AND i.school_id = p.school_id
    );

  SELECT count(*) INTO orphan_students
  FROM public.finance_payment_plans p
  WHERE p.student_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.students s
      WHERE s.id = p.student_id AND s.school_id = p.school_id
    );

  IF orphan_invoices > 0 OR orphan_students > 0 THEN
    RAISE EXCEPTION
      'PayFlow integrity check failed: % orphan invoice plan(s), % orphan student plan(s). Repair data before applying foreign keys.',
      orphan_invoices, orphan_students;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'finance_payment_plans_invoice_fkey'
  ) THEN
    ALTER TABLE public.finance_payment_plans
      ADD CONSTRAINT finance_payment_plans_invoice_fkey
      FOREIGN KEY (invoice_id)
      REFERENCES public.finance_invoices(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'finance_payment_plans_student_fkey'
  ) THEN
    ALTER TABLE public.finance_payment_plans
      ADD CONSTRAINT finance_payment_plans_student_fkey
      FOREIGN KEY (student_id)
      REFERENCES public.students(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS finance_payment_plans_active_reference_unique_idx
  ON public.finance_payment_plans (school_id, reference)
  WHERE reference IS NOT NULL
    AND status IN ('pending_gateway', 'scheduled');

-- The PayFlow migration creates cross-schema FKs as NOT VALID to stay safe in
-- historical/local schemas. On the real SGA, validate them now.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payflow_checkouts_invoice_fkey' AND NOT convalidated
  ) THEN
    ALTER TABLE public.payflow_checkouts
      VALIDATE CONSTRAINT payflow_checkouts_invoice_fkey;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payflow_transactions_receipt_fkey' AND NOT convalidated
  ) THEN
    ALTER TABLE public.payflow_transactions
      VALIDATE CONSTRAINT payflow_transactions_receipt_fkey;
  END IF;
END;
$$;

-- Production invariant: a proof is evidence, never settlement.
COMMENT ON COLUMN public.payflow_bank_transfers.proof_storage_path IS
  'Evidence only. Uploading a proof must never set a checkout/payment to paid without reconciliation.';


SELECT
  'payflow-apply-ok' AS result,
  count(*) FILTER (WHERE tablename LIKE 'payflow_%') AS payflow_tables_with_rls
FROM pg_tables
WHERE schemaname = 'public';
