-- Idempotent treasury expense workflow. Accounting rows remain append-only;
-- reversals will be represented by explicit counter-entries, never deletion.
CREATE OR REPLACE FUNCTION public.record_cash_expense(
  p_document_number text,
  p_description text,
  p_category text,
  p_amount numeric,
  p_method text,
  p_reference text DEFAULT NULL,
  p_occurred_at timestamptz DEFAULT now()
)
RETURNS public.cash_entries
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  school uuid := (SELECT public.current_school_id());
  entry public.cash_entries;
BEGIN
  IF NOT COALESCE((SELECT public.can_manage_finance()), false) THEN
    RAISE EXCEPTION 'insufficient permissions to record expense' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(p_document_number), '') IS NULL THEN
    RAISE EXCEPTION 'expense document number is required';
  END IF;
  IF NULLIF(btrim(p_description), '') IS NULL OR char_length(btrim(p_description)) > 500 THEN
    RAISE EXCEPTION 'expense description is invalid';
  END IF;
  IF NULLIF(btrim(p_category), '') IS NULL OR char_length(btrim(p_category)) > 80 THEN
    RAISE EXCEPTION 'expense category is invalid';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'expense amount must be positive';
  END IF;
  IF p_method NOT IN ('cash', 'multicaixa', 'transfer', 'express') THEN
    RAISE EXCEPTION 'invalid expense method';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(school::text || ':' || btrim(p_document_number), 0)
  );

  SELECT * INTO entry FROM public.cash_entries
  WHERE school_id = school AND document_number = btrim(p_document_number);
  IF FOUND THEN
    IF entry.direction = 'out'
      AND entry.description = btrim(p_description)
      AND entry.category = btrim(p_category)
      AND entry.amount = p_amount
      AND entry.method = p_method
    THEN
      RETURN entry;
    END IF;
    RAISE EXCEPTION 'cash document number already used';
  END IF;

  PERFORM set_config('app.finance_workflow_user', (SELECT auth.uid())::text, true);

  INSERT INTO public.cash_entries (
    school_id, document_number, direction, category, description, amount,
    method, reference, occurred_at, created_by
  ) VALUES (
    school, btrim(p_document_number), 'out', btrim(p_category), btrim(p_description),
    p_amount, p_method, NULLIF(btrim(p_reference), ''), COALESCE(p_occurred_at, now()),
    (SELECT auth.uid())
  ) RETURNING * INTO entry;

  RETURN entry;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_cash_expense(
  text, text, text, numeric, text, text, timestamptz
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_cash_expense(
  text, text, text, numeric, text, text, timestamptz
) TO authenticated;
