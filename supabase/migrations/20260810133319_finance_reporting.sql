-- Server-side financial aggregates stay accurate beyond client pagination.
CREATE INDEX invoices_reporting_idx
  ON public.invoices (school_id, issued_on, due_on)
  WHERE deleted_at IS NULL AND status <> 'void';

CREATE INDEX cash_entries_reporting_idx
  ON public.cash_entries (school_id, occurred_at, direction)
  WHERE status = 'posted';

CREATE OR REPLACE FUNCTION public.finance_summary()
RETURNS TABLE (
  billed numeric,
  received numeric,
  outstanding numeric,
  overdue numeric,
  cash_in numeric,
  cash_out numeric,
  cash_balance numeric,
  invoice_count bigint,
  open_invoice_count bigint,
  overdue_invoice_count bigint,
  billed_student_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
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
  month_start date,
  billed numeric,
  received numeric,
  cash_in numeric,
  cash_out numeric
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
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
  LEFT JOIN invoices_by_month
    ON invoices_by_month.month_start = months.month_start
  LEFT JOIN cash_by_month
    ON cash_by_month.month_start = months.month_start
  ORDER BY months.month_start;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finance_summary() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.finance_monthly_summary(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.finance_monthly_summary(integer) TO authenticated;
