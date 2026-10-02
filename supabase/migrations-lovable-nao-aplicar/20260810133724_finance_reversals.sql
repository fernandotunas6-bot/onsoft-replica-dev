-- Append-only reversal ledger. Original rows are retained and marked reversed;
-- invoice balances are restored atomically when the entry came from a payment.
CREATE TABLE public.financial_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  cash_entry_id uuid NOT NULL,
  payment_id uuid,
  reason text NOT NULL CHECK (
    reason = btrim(reason) AND char_length(reason) BETWEEN 3 AND 500
  ),
  reversed_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financial_reversals_cash_entry_key UNIQUE (cash_entry_id),
  CONSTRAINT financial_reversals_cash_entry_fkey
    FOREIGN KEY (school_id, cash_entry_id)
    REFERENCES public.cash_entries (school_id, id),
  CONSTRAINT financial_reversals_payment_fkey
    FOREIGN KEY (school_id, payment_id)
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
  USING (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.can_manage_finance())
  );
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

CREATE OR REPLACE FUNCTION public.reverse_cash_entry(
  p_cash_entry_id uuid,
  p_reason text
)
RETURNS public.financial_reversals
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
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
          status = CASE
            WHEN amount_paid - allocation.amount = 0 THEN 'issued'
            ELSE 'partial'
          END
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
