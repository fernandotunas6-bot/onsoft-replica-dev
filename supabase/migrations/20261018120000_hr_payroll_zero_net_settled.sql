-- RH: itens da folha com líquido zero (ou negativo) deixam de prender a folha.
--
-- A ordem de pagamento só leva os itens com `net_amount_kz > 0`
-- (hr_create_payroll_payment_batch). Ao autorizar, todos os itens `approved` da
-- folha passam a `processing` — também os de líquido zero, que nunca terão
-- pagamento para confirmar. Como a folha só passa a `paid` quando nenhum item
-- está fora de `paid`/`cancelled`, uma folha com um colaborador de líquido zero
-- (faltas, descontos iguais ao bruto) ficava em `processing` para sempre.
--
-- Aditivo: não reescreve as funções de pagamento (os corpos na produção podem
-- ter mudado). Um gatilho BEFORE UPDATE em hr_payroll_items dá como liquidado,
-- no mesmo passo, o item sem nada a pagar que sai de `approved`. A transição
-- approved → paid já é permitida pelo gatilho de bloqueio
-- (hr_block_locked_payroll_item_mutation). Os valores não mudam.
--
-- Depois, acerta os itens já presos em `processing` com líquido zero e tenta
-- fechar as folhas que ficaram só à espera deles. Cada folha num bloco próprio:
-- se uma guarda da produção recusar, essa folha fica como estava (aviso) e a
-- migração continua. Idempotente.

CREATE OR REPLACE FUNCTION public.hr_settle_zero_net_payroll_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF OLD.status = 'approved'
     AND NEW.status = 'processing'
     AND COALESCE(NEW.net_amount_kz, 0) <= 0 THEN
    NEW.status := 'paid';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_settle_zero_net_payroll_item() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS hr_payroll_items_settle_zero_net ON public.hr_payroll_items;
CREATE TRIGGER hr_payroll_items_settle_zero_net
  BEFORE UPDATE OF status ON public.hr_payroll_items
  FOR EACH ROW EXECUTE FUNCTION public.hr_settle_zero_net_payroll_item();

-- Itens já presos.
UPDATE public.hr_payroll_items pi
SET status = 'paid'
FROM public.hr_payroll_runs r
WHERE r.id = pi.payroll_run_id
  AND r.school_id = pi.school_id
  AND r.status = 'processing'
  AND pi.status = 'processing'
  AND COALESCE(pi.net_amount_kz, 0) <= 0;

-- Folhas que só esperavam por eles (pelo menos um item pago, nenhum por pagar).
DO $$
DECLARE
  v_run record;
BEGIN
  FOR v_run IN
    SELECT r.id
    FROM public.hr_payroll_runs r
    WHERE r.status = 'processing'
      AND EXISTS (SELECT 1 FROM public.hr_payroll_items i
                  WHERE i.payroll_run_id = r.id AND i.status = 'paid')
      AND NOT EXISTS (SELECT 1 FROM public.hr_payroll_items i
                      WHERE i.payroll_run_id = r.id AND i.status NOT IN ('paid', 'cancelled'))
  LOOP
    BEGIN
      UPDATE public.hr_payroll_runs
      SET status = 'paid', paid_at = COALESCE(paid_at, now())
      WHERE id = v_run.id AND status = 'processing';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Folha % ficou em processing: %', v_run.id, SQLERRM;
    END;
  END LOOP;
END $$;
