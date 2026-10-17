import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Nº de aluno de cada factura: factura → contrato → matrícula → aluno.
 *
 * Para listas que guardam só o nome (cobranças electrónicas). Em lotes, para o URL
 * não passar do limite; uma leitura que falhe deixa a factura sem número em vez de
 * falhar a lista.
 */
export async function studentNumbersForInvoices(
  db: Pick<SupabaseClient, "from">,
  schoolId: string,
  invoiceIds: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const ids = [...new Set(invoiceIds.filter(Boolean))];
  const read = async <T>(table: string, columns: string, column: string, values: string[]) => {
    const rows: T[] = [];
    for (let i = 0; i < values.length; i += 150) {
      const { data, error } = await db
        .from(table)
        .select(columns)
        .eq("school_id", schoolId)
        .in(column, values.slice(i, i + 150));
      if (!error) rows.push(...((data ?? []) as T[]));
    }
    return rows;
  };
  if (!ids.length) return result;
  const invoices = await read<{ id: string; contract_id: string | null }>(
    "finance_invoices",
    "id, contract_id",
    "id",
    ids,
  );
  const contractIds = [...new Set(invoices.map((i) => i.contract_id).filter(Boolean))] as string[];
  const contracts = contractIds.length
    ? await read<{ id: string; enrollment_id: string | null }>(
        "finance_contracts",
        "id, enrollment_id",
        "id",
        contractIds,
      )
    : [];
  const enrollmentIds = [
    ...new Set(contracts.map((c) => c.enrollment_id).filter(Boolean)),
  ] as string[];
  const enrollments = enrollmentIds.length
    ? await read<{ id: string; student_id: string }>(
        "enrollments",
        "id, student_id",
        "id",
        enrollmentIds,
      )
    : [];
  const studentIds = [...new Set(enrollments.map((e) => e.student_id))];
  const students = studentIds.length
    ? await read<{ id: string; student_number: string }>(
        "students",
        "id, student_number",
        "id",
        studentIds,
      )
    : [];
  const contractOf = new Map(contracts.map((c) => [c.id, c.enrollment_id]));
  const studentOf = new Map(enrollments.map((e) => [e.id, e.student_id]));
  const numberOf = new Map(students.map((s) => [s.id, s.student_number]));
  for (const invoice of invoices) {
    const enrollmentId = invoice.contract_id ? contractOf.get(invoice.contract_id) : null;
    const studentId = enrollmentId ? studentOf.get(enrollmentId) : null;
    const number = studentId ? numberOf.get(studentId) : null;
    if (number) result.set(invoice.id, number);
  }
  return result;
}
