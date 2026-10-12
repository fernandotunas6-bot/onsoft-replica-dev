import type { requireMobileAcademicAccess } from "./authorization";
import type { MobileAcademicScope } from "./academic-scope.server";
import { parseStudentFinance, type StudentFinance } from "../../../mobile-v4/src/domain/finance";
import { MobileApiError } from "./errors";
type Db = Awaited<ReturnType<typeof requireMobileAcademicAccess>>["db"];
async function read<T>(
  q: PromiseLike<{ data: T[] | null; count: number | null; error: unknown }>,
): Promise<T[]> {
  const r = await q;
  if (r.error || !r.data || r.count == null || r.count !== r.data.length)
    throw new MobileApiError(503, "FINANCE_UNAVAILABLE");
  return r.data;
}
function cents(v: number) {
  const n = Math.round(v * 100);
  if (!Number.isFinite(v) || v < 0 || !Number.isSafeInteger(n) || Math.abs(v * 100 - n) > 0.000001)
    throw new MobileApiError(503, "FINANCE_INCONSISTENT");
  return n;
}
/** Own student's current and historical enrollment invoices, never a teacher's roster finances. */
export async function readMobileFinance(
  db: Db,
  scope: MobileAcademicScope,
  userId: string,
): Promise<StudentFinance> {
  if (scope.role !== "aluno" || !scope.studentId)
    throw new MobileApiError(403, "FINANCE_STUDENT_ONLY");
  const response: StudentFinance = {
    schoolId: scope.schoolId,
    userId,
    role: "aluno",
    invoices: [],
  };
  const enrollments = await read<{ id: string }>(
    db
      .from("enrollments")
      .select("id", { count: "exact" })
      .eq("school_id", scope.schoolId)
      .eq("student_id", scope.studentId)
      .limit(1000),
  );
  if (!enrollments.length) return response;
  const contracts = await read<{ id: string }>(
    db
      .from("finance_contracts")
      .select("id", { count: "exact" })
      .eq("school_id", scope.schoolId)
      .in(
        "enrollment_id",
        enrollments.map((e) => e.id),
      )
      .limit(1000),
  );
  if (!contracts.length) return response;
  const invoices = await read<{
    id: string;
    invoice_number: string;
    fee_item_id: string;
    competence_month: string | null;
    due_date: string;
    status: string;
    amount: number;
    discount_amount: number;
    penalty_amount: number;
  }>(
    db
      .from("finance_invoices")
      .select(
        "id, invoice_number, fee_item_id, competence_month, due_date, status, amount, discount_amount, penalty_amount",
        { count: "exact" },
      )
      .eq("school_id", scope.schoolId)
      .in(
        "contract_id",
        contracts.map((c) => c.id),
      )
      .limit(1000),
  );
  if (!invoices.length) return response;
  const labels = await read<{ id: string; name: string }>(
    db
      .from("fee_items")
      .select("id, name", { count: "exact" })
      .eq("school_id", scope.schoolId)
      .in("id", [...new Set(invoices.map((i) => i.fee_item_id))])
      .limit(1000),
  );
  if (invoices.some((i) => !labels.some((l) => l.id === i.fee_item_id)))
    throw new MobileApiError(503, "FINANCE_INCONSISTENT");
  const receipts = await read<{
    id: string;
    invoice_id: string;
    receipt_number: string;
    amount: number;
    paid_on: string;
    payment_method: string;
    status: string;
  }>(
    db
      .from("finance_receipts")
      .select("id, invoice_id, receipt_number, amount, paid_on, payment_method, status", {
        count: "exact",
      })
      .eq("school_id", scope.schoolId)
      .in(
        "invoice_id",
        invoices.map((i) => i.id),
      )
      .limit(1000),
  );
  response.invoices = invoices
    .map((i) => ({
      id: i.id,
      number: i.invoice_number,
      label: labels.find((l) => l.id === i.fee_item_id)!.name,
      competence: i.competence_month,
      due: i.due_date,
      status: i.status as StudentFinance["invoices"][number]["status"],
      amountCents: cents(i.amount),
      discountCents: cents(i.discount_amount),
      penaltyCents: cents(i.penalty_amount),
      receipts: receipts
        .filter((r) => r.invoice_id === i.id)
        .map((r) => ({
          id: r.id,
          number: r.receipt_number,
          amountCents: cents(r.amount),
          paidOn: r.paid_on,
          method: r.payment_method as "cash" | "bank_transfer" | "card" | "other",
          status: r.status as "issued" | "reversed",
        })),
    }))
    .sort((a, b) => b.due.localeCompare(a.due) || a.id.localeCompare(b.id));
  try {
    return parseStudentFinance(response, { schoolId: scope.schoolId, userId, role: scope.role });
  } catch {
    throw new MobileApiError(503, "FINANCE_INCONSISTENT");
  }
}
