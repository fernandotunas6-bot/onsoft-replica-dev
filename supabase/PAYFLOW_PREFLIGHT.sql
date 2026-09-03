-- PayFlow SGA preflight.
-- Run before APPLY_PAYFLOW.sql on the real SGA project.
-- This script performs no writes; it raises an exception when a required object is missing.

DO $$
DECLARE
  missing text[] := ARRAY[]::text[];
  fn_count integer;
BEGIN
  IF to_regclass('public.schools') IS NULL THEN missing := array_append(missing, 'public.schools'); END IF;
  IF to_regclass('public.school_memberships') IS NULL THEN missing := array_append(missing, 'public.school_memberships'); END IF;
  IF to_regclass('public.roles') IS NULL THEN missing := array_append(missing, 'public.roles'); END IF;
  IF to_regclass('public.permissions') IS NULL THEN missing := array_append(missing, 'public.permissions'); END IF;
  IF to_regclass('public.school_integrations') IS NULL THEN missing := array_append(missing, 'public.school_integrations'); END IF;
  IF to_regclass('public.finance_payment_plans') IS NULL THEN missing := array_append(missing, 'public.finance_payment_plans'); END IF;
  IF to_regclass('public.finance_invoices') IS NULL THEN missing := array_append(missing, 'public.finance_invoices'); END IF;
  IF to_regclass('public.finance_receipts') IS NULL THEN missing := array_append(missing, 'public.finance_receipts'); END IF;

  SELECT count(*) INTO fn_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'register_payment';
  IF fn_count = 0 THEN missing := array_append(missing, '*.register_payment(...)'); END IF;

  SELECT count(*) INTO fn_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'has_school_permission';
  IF fn_count = 0 THEN missing := array_append(missing, 'public.has_school_permission(uuid,text)'); END IF;

  IF array_length(missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'PayFlow preflight failed. Missing: %', array_to_string(missing, ', ');
  END IF;
END;
$$;

DO $$
DECLARE
  missing_columns text[] := ARRAY[]::text[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='finance_invoices' AND column_name='school_id'
  ) THEN missing_columns := array_append(missing_columns, 'finance_invoices.school_id'); END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='finance_invoices' AND column_name='amount'
  ) THEN missing_columns := array_append(missing_columns, 'finance_invoices.amount'); END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='finance_invoices' AND column_name='discount_amount'
  ) THEN missing_columns := array_append(missing_columns, 'finance_invoices.discount_amount'); END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='finance_invoices' AND column_name='status'
  ) THEN missing_columns := array_append(missing_columns, 'finance_invoices.status'); END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='finance_receipts' AND column_name='receipt_number'
  ) THEN missing_columns := array_append(missing_columns, 'finance_receipts.receipt_number'); END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='finance_receipts' AND column_name='invoice_id'
  ) THEN missing_columns := array_append(missing_columns, 'finance_receipts.invoice_id'); END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='finance_receipts' AND column_name='payment_method'
  ) THEN missing_columns := array_append(missing_columns, 'finance_receipts.payment_method'); END IF;

  IF array_length(missing_columns, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'PayFlow preflight failed. Missing columns: %', array_to_string(missing_columns, ', ');
  END IF;
END;
$$;

SELECT
  'payflow-preflight-ok' AS result,
  current_database() AS database_name,
  now() AS checked_at;
