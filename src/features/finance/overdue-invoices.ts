import type { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { selectAllPages } from "@/features/import/engine/paged";
import { invoiceNetTotal, sumPaidByInvoice } from "./invoice-settlement";

type AdminDb = Awaited<ReturnType<typeof loadSgaAdminClient>>;

/**
 * Faturas em atraso da escola: por pagar (abertas ou parcialmente pagas), vencidas
 * antes de `today` e ainda com valor em falta. Lê só essas faturas, em páginas, e só
 * os recibos delas. O painel e o sino liam as primeiras 250 (ou 5 000) faturas e
 * recibos da escola sem ordem: acima disso, uma fatura paga cujo recibo ficasse fora
 * do corte contava como em atraso.
 */
export async function countOverdueInvoices(
  db: AdminDb,
  schoolId: string,
  today: string,
): Promise<number> {
  type Row = {
    id: string;
    amount: number;
    discount_amount: number | null;
    penalty_amount: number | null;
  };
  const invoices = await selectAllPages<Row>(
    (from, to) =>
      db
        .from("finance_invoices")
        .select("id, amount, discount_amount, penalty_amount")
        .eq("school_id", schoolId)
        .in("status", ["open", "partially_paid"])
        .lt("due_date", today)
        .order("id", { ascending: true })
        .range(from, to) as unknown as PromiseLike<{
        data: Row[] | null;
        error: { message: string } | null;
      }>,
    "Não foi possível ler as faturas em atraso",
  );
  if (!invoices.length) return 0;
  const receipts: Array<{ invoice_id: string; amount: number; status: string }> = [];
  for (let i = 0; i < invoices.length; i += 200) {
    const ids = invoices.slice(i, i + 200).map((row) => row.id);
    const { data, error } = await db
      .from("finance_receipts")
      .select("invoice_id, amount, status")
      .eq("school_id", schoolId)
      .in("invoice_id", ids);
    if (error) throw new Error(`Não foi possível ler os recibos: ${error.message}`);
    receipts.push(...((data ?? []) as typeof receipts));
  }
  const paid = sumPaidByInvoice(receipts);
  return invoices.filter((row) => invoiceNetTotal(row) - (paid.get(row.id) ?? 0) > 0.004).length;
}
