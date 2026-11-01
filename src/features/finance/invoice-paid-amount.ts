import type { sgaClient } from "@/integrations/supabase/sga";
import { readAllPages } from "@/integrations/supabase/read-all-pages";
import { publicDatabaseError } from "@/integrations/supabase/server-error";

/** Chamar depois da guarda financeira; nunca transformar erro de recibos em saldo zero. */
export async function readInvoicePaidAmount(
  db: ReturnType<typeof sgaClient>,
  schoolId: string,
  invoiceId: string,
) {
  const { data, error } = await readAllPages((from, to) =>
    db
      .from("finance_receipts")
      .select("id, amount")
      .eq("school_id", schoolId)
      .eq("invoice_id", invoiceId)
      .eq("status", "issued")
      .order("id")
      .range(from, to),
  );
  if (error)
    throw publicDatabaseError(
      error,
      "Não foi possível conferir os pagamentos desta factura. Tente novamente.",
    );
  if (data.length >= 100_000)
    throw new Error(
      "Não foi possível conferir todos os pagamentos desta factura. Contacte a administração.",
    );
  return data.reduce((sum, receipt) => sum + Math.round(Number(receipt.amount) * 100), 0) / 100;
}
