/**
 * Única origem financeira no portal do aluno: contratos -> faturas -> recibos
 * emitidos no SIGA. Não existe um segundo livro de pagamentos para o website.
 * O webhook do fornecedor nunca é autorizado através desta consulta.
 */
import { resolveVisibleStudent } from "@/features/dashboard/student-access";
import { readAllPages, ID_CHUNK_SIZE } from "@/integrations/supabase/read-all-pages";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { invoiceNetTotal } from "@/features/finance/invoice-settlement";

const cents = (amount: number) => Math.round((Number(amount) || 0) * 100);
const kz = (amount: number) => amount / 100;
const empty = () => ({
  billed: 0,
  paid: 0,
  outstanding: 0,
  invoices: [] as Array<{
    number: string;
    competenceMonth: string | null;
    dueDate: string | null;
    status: "paid" | "partially_paid" | "open";
    total: number;
    paid: number;
    outstanding: number;
  }>,
  receipts: [] as Array<{ number: string; paidOn: string | null; amount: number }>,
  moreInvoices: false,
  moreReceipts: false,
});

export async function loadMyStudentFinance(userId: string, schoolId: string) {
  const visible = await resolveVisibleStudent(userId);
  if (!visible || visible.schoolId !== schoolId) {
    throw Object.assign(new Error("Sem acesso ao financeiro deste estudante."), {
      statusCode: 403,
    });
  }
  const { db, studentId } = visible;
  const enrollments = await readAllPages((from, to) =>
    db
      .from("enrollments")
      .select("id")
      .eq("school_id", schoolId)
      .eq("student_id", studentId)
      .order("id")
      .range(from, to),
  );
  if (enrollments.error)
    throw publicDatabaseError(enrollments.error, "Não foi possível consultar matrículas.");
  const result = empty();
  if (!enrollments.data.length) return result;

  const contracts = [];
  for (let i = 0; i < enrollments.data.length; i += ID_CHUNK_SIZE) {
    const ids = enrollments.data.slice(i, i + ID_CHUNK_SIZE).map((r) => r.id);
    const page = await readAllPages((from, to) =>
      db
        .from("finance_contracts")
        .select("id")
        .eq("school_id", schoolId)
        .in("enrollment_id", ids)
        .order("id")
        .range(from, to),
    );
    if (page.error)
      throw publicDatabaseError(page.error, "Não foi possível consultar contratos financeiros.");
    contracts.push(...page.data);
  }
  if (!contracts.length) return result;

  const invoices = [];
  for (let i = 0; i < contracts.length; i += ID_CHUNK_SIZE) {
    const ids = contracts.slice(i, i + ID_CHUNK_SIZE).map((r) => r.id);
    const page = await readAllPages((from, to) =>
      db
        .from("finance_invoices")
        .select("id, invoice_number, competence_month, due_date, status, amount, discount_amount, penalty_amount")
        .eq("school_id", schoolId)
        .in("contract_id", ids)
        .order("id")
        .range(from, to),
    );
    if (page.error)
      throw publicDatabaseError(page.error, "Não foi possível consultar faturas.");
    invoices.push(...page.data.filter((r) => r.status !== "cancelled"));
  }
  if (!invoices.length) return result;

  const receipts = [];
  for (let i = 0; i < invoices.length; i += ID_CHUNK_SIZE) {
    const ids = invoices.slice(i, i + ID_CHUNK_SIZE).map((r) => r.id);
    const page = await readAllPages((from, to) =>
      db
        .from("finance_receipts")
        .select("id, invoice_id, receipt_number, amount, paid_on, status")
        .eq("school_id", schoolId)
        .in("invoice_id", ids)
        .eq("status", "issued")
        .order("id")
        .range(from, to),
    );
    if (page.error)
      throw publicDatabaseError(page.error, "Não foi possível consultar recibos.");
    receipts.push(...page.data);
  }

  const paidByInvoice = new Map<string, number>();
  for (const receipt of receipts) {
    paidByInvoice.set(
      receipt.invoice_id,
      (paidByInvoice.get(receipt.invoice_id) ?? 0) + cents(receipt.amount),
    );
  }

  let billedCents = 0;
  let paidCents = 0;
  const rows = invoices.map((invoice) => {
    const total = Math.max(0, cents(invoiceNetTotal(invoice)));
    const received = Math.min(total, Math.max(0, paidByInvoice.get(invoice.id) ?? 0));
    const outstanding = Math.max(0, total - received);
    billedCents += total;
    paidCents += received;
    return {
      number: invoice.invoice_number ?? "—",
      competenceMonth: invoice.competence_month ?? null,
      dueDate: invoice.due_date ?? null,
      status: (outstanding === 0 ? "paid" : received > 0 ? "partially_paid" : "open") as
        | "paid"
        | "partially_paid"
        | "open",
      total: kz(total),
      paid: kz(received),
      outstanding: kz(outstanding),
    };
  });
  // O ecrã mostra os últimos 50 lançamentos, mas os totais abrangem todos.
  result.billed = kz(billedCents);
  result.paid = kz(paidCents);
  result.outstanding = kz(Math.max(0, billedCents - paidCents));
  result.moreInvoices = rows.length > 50;
  result.invoices = rows.slice(-50).reverse();
  result.moreReceipts = receipts.length > 50;
  result.receipts = receipts
    .slice(-50)
    .reverse()
    .map((r) => ({ number: r.receipt_number, paidOn: r.paid_on, amount: Number(r.amount) }));
  return result;
}
