CREATE INDEX cash_entries_category_reporting_idx
  ON public.cash_entries (school_id, direction, category)
  WHERE status = 'posted';

CREATE OR REPLACE FUNCTION public.finance_category_summary()
RETURNS TABLE (
  direction text,
  category text,
  amount numeric,
  entry_count bigint
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
