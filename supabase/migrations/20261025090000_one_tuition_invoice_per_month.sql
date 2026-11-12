-- Uma propina por aluno e por mês, garantida na base.
--
-- `issueInvoice` (src/features/finance/server.ts) já recusa a segunda propina do mesmo
-- mês, mas verifica e insere em dois passos: duas emissões em paralelo — duplo clique,
-- duas pessoas na secretaria, uma emissão em lote a correr ao mesmo tempo — passam as
-- duas pela verificação e o aluno fica com duas propinas do mesmo mês.
--
-- Um índice único não serve: o tipo da taxa (`tuition`) está em `fee_items`, não na
-- fatura, e o preço da classe e o geral são itens diferentes do mesmo tipo. Por isso um
-- gatilho: tranca o par (contrato, mês) com um advisory lock da transacção e só depois
-- procura outra propina não anulada. A segunda emissão espera pela primeira e, quando a
-- primeira faz COMMIT, encontra-a.
--
-- Só actua em INSERT de propinas com mês de competência. Faturas existentes não mudam.

CREATE FUNCTION private.finance_invoice_one_tuition_per_month()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_kind text;
  v_existing text;
begin
  if NEW.competence_month is null or NEW.fee_item_id is null or NEW.contract_id is null then
    return NEW;
  end if;
  select kind into v_kind from public.fee_items
  where id = NEW.fee_item_id and school_id = NEW.school_id;
  if v_kind is distinct from 'tuition' then
    return NEW;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('finance_tuition:' || NEW.contract_id::text || ':' || NEW.competence_month::text, 0)
  );

  select i.invoice_number into v_existing
  from public.finance_invoices i
  join public.fee_items f on f.id = i.fee_item_id and f.kind = 'tuition'
  where i.school_id = NEW.school_id
    and i.contract_id = NEW.contract_id
    and i.competence_month = NEW.competence_month
    and i.status <> 'cancelled'
  limit 1;
  if v_existing is not null then
    raise exception using errcode = '22023',
      message = 'Este aluno já tem a propina deste mês. Anule-a antes de emitir outra.';
  end if;
  return NEW;
end;
$function$;

REVOKE ALL ON FUNCTION private.finance_invoice_one_tuition_per_month() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER finance_invoices_one_tuition_per_month
  BEFORE INSERT ON public.finance_invoices
  FOR EACH ROW EXECUTE FUNCTION private.finance_invoice_one_tuition_per_month();
