import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadSgaAdminClient, requireSgaWriterFor } from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";

function nonEmptyIds(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

const MAX_STUDENT_MATCHES = 20;
const MAX_INVOICES_FOR_STUDENT_SEARCH = 150;

export function receiptLikeTerm(text: string): string {
  return "%" + text.replace(/[%_\\]/g, "\\const day = z.string()") + "%";
}

/**
 * Resolve a pesquisa antes da paginação de recibos; filtrar nomes no cliente
 * mostraria totais errados e deixaria de encontrar recibos noutras páginas.
 * Limites explícitos recusam pesquisas demasiado amplas sem cortar os resultados.
 */
async function matchingStudentInvoiceIds(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  schoolId: string,
  studentQuery: string,
): Promise<string[]> {
  const pattern = receiptLikeTerm(studentQuery);
  const [numberMatches, peopleMatches] = await Promise.all([
    db.from("students")
      .select("id")
      .eq("school_id", schoolId)
      .ilike("student_number", pattern)
      .limit(MAX_STUDENT_MATCHES + 1),
    db.from("people")
      .select("id")
      .eq("school_id", schoolId)
      .ilike("full_name", pattern)
      .limit(MAX_STUDENT_MATCHES + 1),
  ]);
  if (numberMatches.error || peopleMatches.error) {
    throw publicDatabaseError(
      numberMatches.error ?? peopleMatches.error!,
      "Não foi possível pesquisar os estudantes.",
    );
  }
  if (
    (numberMatches.data?.length ?? 0) > MAX_STUDENT_MATCHES ||
    (peopleMatches.data?.length ?? 0) > MAX_STUDENT_MATCHES
  ) {
    throw new Error("Há demasiados estudantes com esse nome. Escreva mais caracteres ou use o processo.");
  }

  const peopleIds = nonEmptyIds((peopleMatches.data ?? []).map((row) => row.id));
  const byPeople = peopleIds.length
    ? await db.from("students")
      .select("id")
      .eq("school_id", schoolId)
      .in("person_id", peopleIds)
      .limit(MAX_STUDENT_MATCHES + 1)
    : { data: [], error: null };
  if (byPeople.error) throw publicDatabaseError(byPeople.error, "Não foi possível pesquisar os estudantes.");
  const studentIds = nonEmptyIds([
    ...(numberMatches.data ?? []).map((row) => row.id),
    ...(byPeople.data ?? []).map((row) => row.id),
  ]);
  if (studentIds.length > MAX_STUDENT_MATCHES) {
    throw new Error("A pesquisa abrange demasiados estudantes. Refine o nome ou processo.");
  }
  if (!studentIds.length) return [];

  const limit = MAX_INVOICES_FOR_STUDENT_SEARCH + 1;
  const enrollments = await db.from("enrollments")
    .select("id")
    .eq("school_id", schoolId)
    .in("student_id", studentIds)
    .limit(limit);
  if (enrollments.error) throw publicDatabaseError(enrollments.error, "Não foi possível procurar as matrículas.");
  if ((enrollments.data?.length ?? 0) >= limit) {
    throw new Error("Pesquisa demasiado ampla. Use o processo do estudante.");
  }
  const enrollmentIds = nonEmptyIds((enrollments.data ?? []).map((row) => row.id));
  if (!enrollmentIds.length) return [];

  const contracts = await db.from("finance_contracts")
    .select("id")
    .eq("school_id", schoolId)
    .in("enrollment_id", enrollmentIds)
    .limit(limit);
  if (contracts.error) throw publicDatabaseError(contracts.error, "Não foi possível procurar os contratos.");
  if ((contracts.data?.length ?? 0) >= limit) {
    throw new Error("Pesquisa demasiado ampla. Use o processo do estudante.");
  }
  const contractIds = nonEmptyIds((contracts.data ?? []).map((row) => row.id));
  if (!contractIds.length) return [];

  const invoices = await db.from("finance_invoices")
    .select("id")
    .eq("school_id", schoolId)
    .in("contract_id", contractIds)
    .limit(limit);
  if (invoices.error) throw publicDatabaseError(invoices.error, "Não foi possível procurar as faturas.");
  if ((invoices.data?.length ?? 0) >= limit) {
    throw new Error("Existem demasiadas faturas para esta pesquisa. Indique um número de fatura.");
  }
  return nonEmptyIds((invoices.data ?? []).map((row) => row.id));
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal(""));

/** Consulta paginada dos recibos da escola autenticada. Nunca grava pagamentos. */
export const receiptRegisterInputSchema = z
  .object({
    receiptNumber: z.string().trim().max(100).default(""),
    invoiceNumber: z.string().trim().max(100).default(""),
    studentQuery: z.string().trim().max(90).default(""),
    status: z.enum(["all", "issued", "reversed"]).default("all"),
    method: z.string().trim().max(40).default("all"),
    from: day.default(""),
    to: day.default(""),
    page: z.number().int().min(1).max(100000).default(1),
    pageSize: z.number().int().min(1).max(100).default(25),
  })
  .refine((row) => !row.from || !row.to || row.from <= row.to, {
    message: "O início do período não pode ultrapassar o fim.",
    path: ["to"],
  });

export const listReceiptRegister = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => receiptRegisterInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterFor(
      "financeiro",
      context.supabase,
      context.userId,
      ["Administrador", "Tesouraria", "Secretaria"],
    );
    const schoolId = membership.schoolId;
    // Cliente privilegiado exclusivamente no servidor, com RBAC e escola obrigatórios.
    // Segue o mesmo contrato de leitura de getInvoiceDetail.
    const db = await loadSgaAdminClient();
    const empty = { rows: [], total: 0, page: data.page, pageSize: data.pageSize };

    let invoiceId: string | null = null;
    if (data.invoiceNumber) {
      const { data: invoice, error } = await db
        .from("finance_invoices")
        .select("id")
        .eq("school_id", schoolId)
        .eq("invoice_number", data.invoiceNumber)
        .maybeSingle();
      if (error) throw publicDatabaseError(error, "Não foi possível procurar a fatura.");
      if (!invoice) return empty;
      invoiceId = invoice.id;
    }

    const matchingIds = data.studentQuery
      ? await matchingStudentInvoiceIds(db, schoolId, data.studentQuery)
      : null;
    if (matchingIds !== null && matchingIds.length === 0) return empty;
    if (invoiceId && matchingIds !== null && !matchingIds.includes(invoiceId)) return empty;

    let query = db
      .from("finance_receipts")
      .select(
        "id, invoice_id, receipt_number, amount, paid_on, payment_method, status, reversal_reason, external_id",
        { count: "exact" },
      )
      .eq("school_id", schoolId);

    if (invoiceId) query = query.eq("invoice_id", invoiceId);
    else if (matchingIds !== null) query = query.in("invoice_id", matchingIds);
    if (data.receiptNumber) {
      // Escapar os caracteres especiais de LIKE para não ampliar uma pesquisa.
      query = query.ilike("receipt_number", receiptLikeTerm(data.receiptNumber));
    }
    if (data.status !== "all") query = query.eq("status", data.status);
    if (data.method !== "all") query = query.eq("payment_method", data.method);
    if (data.from) query = query.gte("paid_on", data.from);
    if (data.to) query = query.lte("paid_on", data.to);

    const start = (data.page - 1) * data.pageSize;
    const { data: receipts, error, count } = await query
      .order("paid_on", { ascending: false })
      .order("id", { ascending: false })
      .range(start, start + data.pageSize - 1);

    if (error) throw publicDatabaseError(error, "Não foi possível carregar os recibos.");
    const receiptRows = receipts ?? [];
    if (!receiptRows.length) return { ...empty, total: count ?? 0 };

    const invoiceIds = nonEmptyIds(receiptRows.map((row) => row.invoice_id));
    const { data: invoices, error: invoiceError } = invoiceIds.length ? await db
      .from("finance_invoices")
      .select("id, invoice_number, contract_id")
      .eq("school_id", schoolId)
      .in("id", invoiceIds) : { data: [], error: null };
    if (invoiceError) throw publicDatabaseError(invoiceError, "Não foi possível ligar os recibos às faturas.");
    const invoiceMap = new Map((invoices ?? []).map((row) => [row.id, row]));

    const contractIds = nonEmptyIds((invoices ?? []).map((row) => row.contract_id));
    const contracts = contractIds.length
      ? await db.from("finance_contracts")
          .select("id, enrollment_id")
          .eq("school_id", schoolId)
          .in("id", contractIds)
      : { data: [], error: null };
    if (contracts.error) throw publicDatabaseError(contracts.error, "Não foi possível consultar os contratos.");
    const enrollmentIds = nonEmptyIds((contracts.data ?? []).map((row) => row.enrollment_id));
    const enrollments = enrollmentIds.length
      ? await db.from("enrollments")
          .select("id, student_id")
          .eq("school_id", schoolId)
          .in("id", enrollmentIds)
      : { data: [], error: null };
    if (enrollments.error) throw publicDatabaseError(enrollments.error, "Não foi possível consultar as matrículas.");
    const studentIds = nonEmptyIds((enrollments.data ?? []).map((row) => row.student_id));
    const students = studentIds.length
      ? await db.from("students")
          .select("id, person_id, student_number")
          .eq("school_id", schoolId)
          .in("id", studentIds)
      : { data: [], error: null };
    if (students.error) throw publicDatabaseError(students.error, "Não foi possível consultar os alunos.");
    const personIds = nonEmptyIds((students.data ?? []).map((row) => row.person_id));
    const people = personIds.length
      ? await db.from("people")
          .select("id, full_name")
          .eq("school_id", schoolId)
          .in("id", personIds)
      : { data: [], error: null };
    if (people.error) throw publicDatabaseError(people.error, "Não foi possível consultar os nomes.");

    const contractById = new Map((contracts.data ?? []).map((row) => [row.id, row]));
    const enrollmentById = new Map((enrollments.data ?? []).map((row) => [row.id, row]));
    const studentById = new Map((students.data ?? []).map((row) => [row.id, row]));
    const personById = new Map((people.data ?? []).map((row) => [row.id, row]));

    return {
      page: data.page,
      pageSize: data.pageSize,
      total: count ?? 0,
      rows: receiptRows.map((receipt) => {
        const invoice = invoiceMap.get(receipt.invoice_id);
        const contract = contractById.get(invoice?.contract_id ?? "");
        const enrollment = enrollmentById.get(contract?.enrollment_id ?? "");
        const student = studentById.get(enrollment?.student_id ?? "");
        const person = personById.get(student?.person_id ?? "");
        return {
          id: receipt.id,
          invoiceId: invoice?.id ?? receipt.invoice_id,
          invoiceNumber: invoice?.invoice_number ?? "",
          receiptNumber: receipt.receipt_number,
          amount: Number(receipt.amount ?? 0),
          paidOn: receipt.paid_on ?? "",
          method: receipt.payment_method ?? "",
          status: receipt.status,
          reversalReason: receipt.reversal_reason ?? "",
          externalId: receipt.external_id ?? "",
          studentName: person?.full_name ?? "Aluno",
          studentNumber: student?.student_number ?? "",
        };
      }),
    };
  });
