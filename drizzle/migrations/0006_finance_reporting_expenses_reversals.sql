CREATE INDEX invoices_reporting_idx
  ON public.invoices (school_id, issued_on, due_on)
  WHERE deleted_at IS NULL AND status <> 'void';

CREATE INDEX cash_entries_reporting_idx
  ON public.cash_entries (school_id, occurred_at, direction)
  WHERE status = 'posted';

CREATE OR REPLACE FUNCTION public.finance_summary()
RETURNS TABLE (
  billed numeric, received numeric, outstanding numeric, overdue numeric,
  cash_in numeric, cash_out numeric, cash_balance numeric,
  invoice_count bigint, open_invoice_count bigint, overdue_invoice_count bigint,
  billed_student_count bigint
)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  school uuid := (SELECT public.current_school_id());
BEGIN
  IF NOT COALESCE((SELECT public.can_manage_finance()), false) THEN
    RAISE EXCEPTION 'insufficient permissions to read finance summary' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH invoice_totals AS (
    SELECT
      COALESCE(sum(total_amount), 0) AS billed,
      COALESCE(sum(amount_paid), 0) AS received,
      COALESCE(sum(total_amount - amount_paid), 0) AS outstanding,
      COALESCE(sum(total_amount - amount_paid) FILTER (
        WHERE due_on < CURRENT_DATE AND status IN ('issued', 'partial')
      ), 0) AS overdue,
      count(*) AS invoice_count,
      count(*) FILTER (WHERE status IN ('issued', 'partial')) AS open_invoice_count,
      count(*) FILTER (
        WHERE due_on < CURRENT_DATE AND status IN ('issued', 'partial')
      ) AS overdue_invoice_count,
      count(DISTINCT student_id) AS billed_student_count
    FROM public.invoices
    WHERE school_id = school AND deleted_at IS NULL AND status <> 'void'
  ), cash_totals AS (
    SELECT
      COALESCE(sum(amount) FILTER (WHERE direction = 'in'), 0) AS cash_in,
      COALESCE(sum(amount) FILTER (WHERE direction = 'out'), 0) AS cash_out
    FROM public.cash_entries
    WHERE school_id = school AND status = 'posted'
  )
  SELECT invoice_totals.billed, invoice_totals.received,
    invoice_totals.outstanding, invoice_totals.overdue,
    cash_totals.cash_in, cash_totals.cash_out,
    cash_totals.cash_in - cash_totals.cash_out,
    invoice_totals.invoice_count, invoice_totals.open_invoice_count,
    invoice_totals.overdue_invoice_count, invoice_totals.billed_student_count
  FROM invoice_totals CROSS JOIN cash_totals;
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_monthly_summary(p_months integer DEFAULT 12)
RETURNS TABLE (
  month_start date, billed numeric, received numeric, cash_in numeric, cash_out numeric
)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  school uuid := (SELECT public.current_school_id());
  month_count integer := LEAST(GREATEST(COALESCE(p_months, 12), 1), 36);
BEGIN
  IF NOT COALESCE((SELECT public.can_manage_finance()), false) THEN
    RAISE EXCEPTION 'insufficient permissions to read finance reporting' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH months AS (
    SELECT generate_series(
      date_trunc('month', CURRENT_DATE) - make_interval(months => month_count - 1),
      date_trunc('month', CURRENT_DATE),
      interval '1 month'
    )::date AS month_start
  ), invoices_by_month AS (
    SELECT date_trunc('month', issued_on)::date AS month_start,
      sum(total_amount) AS billed, sum(amount_paid) AS received
    FROM public.invoices
    WHERE school_id = school AND deleted_at IS NULL AND status <> 'void'
      AND issued_on >= (SELECT min(months.month_start) FROM months)
    GROUP BY 1
  ), cash_by_month AS (
    SELECT date_trunc('month', occurred_at)::date AS month_start,
      sum(amount) FILTER (WHERE direction = 'in') AS cash_in,
      sum(amount) FILTER (WHERE direction = 'out') AS cash_out
    FROM public.cash_entries
    WHERE school_id = school AND status = 'posted'
      AND occurred_at >= (SELECT min(months.month_start) FROM months)
    GROUP BY 1
  )
  SELECT months.month_start,
    COALESCE(invoices_by_month.billed, 0), COALESCE(invoices_by_month.received, 0),
    COALESCE(cash_by_month.cash_in, 0), COALESCE(cash_by_month.cash_out, 0)
  FROM months
  LEFT JOIN invoices_by_month ON invoices_by_month.month_start = months.month_start
  LEFT JOIN cash_by_month ON cash_by_month.month_start = months.month_start
  ORDER BY months.month_start;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finance_summary() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.finance_monthly_summary(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.finance_monthly_summary(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_cash_expense(
  p_document_number text,
  p_description text,
  p_category text,
  p_amount numeric,
  p_method text,
  p_reference text DEFAULT NULL,
  p_occurred_at timestamptz DEFAULT now()
)
RETURNS public.cash_entries LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
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
  text, text, text, numeric, text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_cash_expense(
  text, text, text, numeric, text, text, timestamptz) TO authenticated;

CREATE TABLE public.financial_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  cash_entry_id uuid NOT NULL,
  payment_id uuid,
  reason text NOT NULL CHECK (reason = btrim(reason) AND char_length(reason) BETWEEN 3 AND 500),
  reversed_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financial_reversals_cash_entry_key UNIQUE (cash_entry_id),
  CONSTRAINT financial_reversals_cash_entry_fkey FOREIGN KEY (school_id, cash_entry_id)
    REFERENCES public.cash_entries (school_id, id),
  CONSTRAINT financial_reversals_payment_fkey FOREIGN KEY (school_id, payment_id)
    REFERENCES public.payments (school_id, id)
);

CREATE INDEX financial_reversals_school_recent_idx
  ON public.financial_reversals (school_id, created_at DESC);

GRANT SELECT, INSERT ON public.financial_reversals TO authenticated;
GRANT ALL ON public.financial_reversals TO service_role;
ALTER TABLE public.financial_reversals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_reversals FORCE ROW LEVEL SECURITY;

CREATE POLICY "Finance roles read reversals"
  ON public.financial_reversals FOR SELECT TO authenticated
  USING (school_id = (SELECT public.current_school_id()) AND (SELECT public.can_manage_finance()));
CREATE POLICY "Finance workflows create reversals"
  ON public.financial_reversals FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND reversed_by = (SELECT auth.uid())
    AND (SELECT public.can_manage_finance())
  );

CREATE TRIGGER financial_reversals_require_workflow
  BEFORE INSERT ON public.financial_reversals
  FOR EACH ROW EXECUTE FUNCTION private.require_finance_workflow();

CREATE OR REPLACE FUNCTION public.reverse_cash_entry(p_cash_entry_id uuid, p_reason text)
RETURNS public.financial_reversals LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  school uuid := (SELECT public.current_school_id());
  entry public.cash_entries;
  payment public.payments;
  reversal public.financial_reversals;
  allocation record;
  new_paid numeric(14,2);
BEGIN
  IF NOT COALESCE((SELECT public.can_manage_finance()), false) THEN
    RAISE EXCEPTION 'insufficient permissions to reverse cash entry' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'reversal reason must contain between 3 and 500 characters';
  END IF;

  SELECT * INTO entry FROM public.cash_entries
  WHERE school_id = school AND id = p_cash_entry_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cash entry not found';
  END IF;

  SELECT * INTO reversal FROM public.financial_reversals
  WHERE school_id = school AND cash_entry_id = entry.id;
  IF FOUND THEN
    RETURN reversal;
  END IF;
  IF entry.status <> 'posted' THEN
    RAISE EXCEPTION 'cash entry is not reversible';
  END IF;

  PERFORM set_config('app.finance_workflow_user', (SELECT auth.uid())::text, true);
  PERFORM set_config('app.audit_reason', btrim(p_reason), true);

  IF entry.payment_id IS NOT NULL THEN
    SELECT * INTO payment FROM public.payments
    WHERE school_id = school AND id = entry.payment_id
    FOR UPDATE;
    IF NOT FOUND OR payment.status <> 'confirmed' THEN
      RAISE EXCEPTION 'confirmed payment not found for cash entry';
    END IF;

    FOR allocation IN
      SELECT invoice_id, sum(amount) AS amount
      FROM public.payment_allocations
      WHERE school_id = school AND payment_id = payment.id
      GROUP BY invoice_id
      ORDER BY invoice_id
    LOOP
      UPDATE public.invoices
      SET amount_paid = amount_paid - allocation.amount,
          status = CASE WHEN amount_paid - allocation.amount = 0 THEN 'issued' ELSE 'partial' END
      WHERE school_id = school
        AND id = allocation.invoice_id
        AND amount_paid >= allocation.amount
      RETURNING amount_paid INTO new_paid;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'invoice balance is inconsistent during reversal';
      END IF;
    END LOOP;

    UPDATE public.payments SET status = 'reversed' WHERE id = payment.id;
  END IF;

  UPDATE public.cash_entries SET status = 'reversed' WHERE id = entry.id;

  INSERT INTO public.financial_reversals (
    school_id, cash_entry_id, payment_id, reason, reversed_by
  ) VALUES (
    school, entry.id, entry.payment_id, btrim(p_reason), (SELECT auth.uid())
  ) RETURNING * INTO reversal;

  RETURN reversal;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reverse_cash_entry(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_cash_entry(uuid, text) TO authenticated;

CREATE INDEX cash_entries_category_reporting_idx
  ON public.cash_entries (school_id, direction, category)
  WHERE status = 'posted';

CREATE OR REPLACE FUNCTION public.finance_category_summary()
RETURNS TABLE (direction text, category text, amount numeric, entry_count bigint)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  school uuid := (SELECT public.current_school_id());
BEGIN
  IF NOT COALESCE((SELECT public.can_manage_finance()), false) THEN
    RAISE EXCEPTION 'insufficient permissions to read finance categories' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT entry.direction, entry.category, sum(entry.amount), count(*)
  FROM public.cash_entries AS entry
  WHERE entry.school_id = school AND entry.status = 'posted'
  GROUP BY entry.direction, entry.category
  ORDER BY entry.direction, sum(entry.amount) DESC, entry.category;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finance_category_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_category_summary() TO authenticated;
