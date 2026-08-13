import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { sgaClient } from "@/integrations/supabase/sga";
import {
  loadSgaAdminClient,
  requireSgaWriter,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";
import {
  financeListInputSchema,
  issueInvoiceInputSchema,
  recordCashExpenseInputSchema,
  recordInvoicePaymentInputSchema,
  createPaymentPlanInputSchema,
  reverseCashEntryInputSchema,
  cancelInvoiceInputSchema,
  cancelPaymentPlanInputSchema,
} from "./schemas";
import { insertFinanceArchive } from "@/features/arquivos/archive-finance-core";
import { stableDocumentCode } from "@/features/arquivos/document-code";
import { canWriteFileArea } from "@/features/arquivos/kinds";

const REPORTING_PAGE_SIZE = 1000;
const REPORTING_MAX_PAGES = 30;

export type CashEntrySummary = {
  id: string;
  document_number: string;
  occurred_at: string;
  description: string;
  category: string;
  method: string;
  status: "posted" | "reversed";
  direction: "in" | "out";
  amount: number;
};

/**
 * Pagina até esgotar os registos (ou até um tecto de segurança de 30 000), em vez
 * do antigo `.limit(500)` sem `.order()` — que truncava o relatório financeiro
 * "Oficial" em silêncio e sem garantia de serem os 500 mais recentes assim que a
 * escola ultrapassasse esse número de facturas/recibos.
 */
async function fetchAllRows<T>(
  fallbackMessage: string,
  buildPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { code?: string; message?: string } | null }>,
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  for (let page = 0; page < REPORTING_MAX_PAGES; page += 1) {
    const from = page * REPORTING_PAGE_SIZE;
    const to = from + REPORTING_PAGE_SIZE - 1;
    const { data, error } = await buildPage(from, to);
    if (error) throw publicDatabaseError(error, fallbackMessage);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < REPORTING_PAGE_SIZE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

function isMissingSgaTable(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
    (error.code === "42P01" ||
      error.code === "PGRST205" ||
      /schema cache|does not exist|relation .* does not exist/i.test(error.message ?? "")),
  );
}

function categoryToFeeKind(category: string) {
  const value = category.trim().toLowerCase();
  if (value.includes("matr")) return "enrollment";
  if (value.includes("mens") || value.includes("prop")) return "tuition";
  return null;
}

function mapInvoiceStatus(status: string) {
  if (status === "open") return "issued";
  if (status === "cancelled") return "void";
  return status;
}

function formatAmountKz(amount: number) {
  return `${amount.toLocaleString("pt-PT", { maximumFractionDigits: 2 })} Kz`;
}

async function personIdForStudent(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  schoolId: string,
  studentId: string,
) {
  const { data } = await db
    .from("students")
    .select("person_id, student_number")
    .eq("id", studentId)
    .eq("school_id", schoolId)
    .maybeSingle();
  return {
    personId: data?.person_id ? String(data.person_id) : null,
    studentNumber: data?.student_number ? String(data.student_number) : null,
  };
}

async function personIdForInvoice(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  schoolId: string,
  invoiceId: string,
) {
  const { data: invoice } = await db
    .from("finance_invoices")
    .select("id, invoice_number, amount, discount_amount, contract_id")
    .eq("id", invoiceId)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (!invoice?.contract_id) {
    return {
      personId: null as string | null,
      studentNumber: null as string | null,
      invoiceNumber: invoice?.invoice_number ? String(invoice.invoice_number) : null,
      amount: Number(invoice?.amount ?? 0) - Number(invoice?.discount_amount ?? 0),
    };
  }
  const { data: contract } = await db
    .from("finance_contracts")
    .select("enrollment_id")
    .eq("id", invoice.contract_id)
    .maybeSingle();
  if (!contract?.enrollment_id) {
    return {
      personId: null,
      studentNumber: null,
      invoiceNumber: String(invoice.invoice_number ?? ""),
      amount: Number(invoice.amount ?? 0) - Number(invoice.discount_amount ?? 0),
    };
  }
  const { data: enrollment } = await db
    .from("enrollments")
    .select("student_id")
    .eq("id", contract.enrollment_id)
    .maybeSingle();
  if (!enrollment?.student_id) {
    return {
      personId: null,
      studentNumber: null,
      invoiceNumber: String(invoice.invoice_number ?? ""),
      amount: Number(invoice.amount ?? 0) - Number(invoice.discount_amount ?? 0),
    };
  }
  const student = await personIdForStudent(db, schoolId, String(enrollment.student_id));
  return {
    ...student,
    invoiceNumber: String(invoice.invoice_number ?? ""),
    amount: Number(invoice.amount ?? 0) - Number(invoice.discount_amount ?? 0),
  };
}

async function archiveFinanceQuietly(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  input: {
    schoolId: string;
    userId: string;
    role: string;
    category: "recibo" | "talao" | "fatura" | "outro";
    title: string;
    description: string;
    relatedPersonId?: string | null;
    sourceLabel?: string;
    amountLabel?: string;
    documentCode?: string;
  },
) {
  try {
    const area = canWriteFileArea(input.role, "secretaria") ? "secretaria" : "escola";
    if (!canWriteFileArea(input.role, area)) return null;
    return await insertFinanceArchive(db, {
      schoolId: input.schoolId,
      userId: input.userId,
      area,
      category: input.category,
      title: input.title,
      description: input.description,
      relatedPersonId: input.relatedPersonId,
      sourceLabel: input.sourceLabel,
      amountLabel: input.amountLabel,
      documentCode: input.documentCode,
    });
  } catch {
    return null;
  }
}

async function loadStudentDirectory(
  db: ReturnType<typeof sgaClient>,
  schoolId: string,
  studentIds?: string[],
) {
  let query = db
    .from("students")
    .select("id, student_number, person_id, status")
    .eq("school_id", schoolId);
  if (studentIds?.length) query = query.in("id", studentIds);
  const { data: students, error } = await query.limit(250);
  if (error) throw publicDatabaseError(error, "Não foi possível carregar os alunos.");
  const personIds = [
    ...new Set((students ?? []).map((row: { person_id: string }) => row.person_id)),
  ];
  const { data: people } = personIds.length
    ? await db.from("people").select("id, full_name").in("id", personIds)
    : { data: [] as Array<{ id: string; full_name: string }> };
  const peopleById = new Map((people ?? []).map((row) => [row.id, row.full_name]));
  return (students ?? []).map(
    (student: { id: string; student_number: string; person_id: string }) => ({
      student_id: student.id,
      full_name: peopleById.get(student.person_id) ?? "Aluno",
      registration_number: student.student_number,
    }),
  );
}

export const getFinanceSchemaStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) {
      return {
        ready: false,
        missingPenaltyAmount: true,
        missingNotificationPreferences: false,
      };
    }
    const db = await loadSgaAdminClient();
    const [{ error: penaltyError }, { error: prefsError }, { error: cashExpensesError }] =
      await Promise.all([
        db.from("finance_invoices").select("id, penalty_amount").limit(1),
        db.from("notification_preferences").select("id").limit(1),
        db.from("siga_cash_expenses").select("id").limit(1),
      ]);
    const missingPenaltyAmount = Boolean(
      penaltyError && /penalty_amount/i.test(penaltyError.message),
    );
    let missingNotificationPreferences = Boolean(
      prefsError &&
      (/notification_preferences|schema cache|does not exist|42P01|PGRST/i.test(
        prefsError.message,
      ) ||
        prefsError.code === "42P01" ||
        prefsError.code === "PGRST205"),
    );
    if (!missingNotificationPreferences) {
      const { error: colError } = await db
        .from("notification_preferences")
        .select("id, in_app_enabled, email_enabled, whatsapp_enabled")
        .limit(1);
      if (
        colError &&
        /in_app_enabled|email_enabled|whatsapp_enabled|column/i.test(colError.message)
      ) {
        missingNotificationPreferences = true;
      }
    }
    if (penaltyError && !missingPenaltyAmount) {
      throw publicDatabaseError(penaltyError, "Não foi possível validar o schema financeiro.");
    }
    if (cashExpensesError && !isMissingSgaTable(cashExpensesError)) {
      throw publicDatabaseError(
        cashExpensesError,
        "Não foi possível validar as despesas de caixa.",
      );
    }
    return {
      ready: !missingPenaltyAmount && !missingNotificationPreferences,
      missingPenaltyAmount,
      missingNotificationPreferences,
      missingCashExpenses: isMissingSgaTable(cashExpensesError),
    };
  });

export const listFinanceStudents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => financeListInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Tesouraria",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();
    const students = await loadStudentDirectory(db, membership.schoolId);
    return students.slice(0, data.limit);
  });

export const getFinanceReporting = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) {
      return {
        summary: {
          billed: 0,
          received: 0,
          outstanding: 0,
          overdue: 0,
          invoice_count: 0,
          open_invoice_count: 0,
          overdue_invoice_count: 0,
          billed_student_count: 0,
          cash_in: 0,
          cash_out: 0,
          cash_balance: 0,
          truncated: false,
        },
        monthly: [],
        categories: [],
      };
    }
    if (!["Administrador", "Tesouraria"].includes(membership.appRole)) {
      throw new Error("Sem permissão para consultar o resumo financeiro.");
    }
    const db = await loadSgaAdminClient();

    const { error: cashExpensesSchemaError } = await db
      .from("siga_cash_expenses")
      .select("id")
      .limit(1);
    if (cashExpensesSchemaError && !isMissingSgaTable(cashExpensesSchemaError)) {
      throw publicDatabaseError(
        cashExpensesSchemaError,
        "Não foi possível validar as despesas de caixa.",
      );
    }
    const cashExpensesAvailable = !isMissingSgaTable(cashExpensesSchemaError);

    const [invoicesPaged, receiptsPaged, expensesPaged, { data: feeItems }] = await Promise.all([
      fetchAllRows("Não foi possível calcular o resumo financeiro.", (from, to) =>
        db
          .from("finance_invoices")
          .select(
            "id, amount, discount_amount, due_date, status, competence_month, fee_item_id, contract_id, created_at",
          )
          .eq("school_id", membership.schoolId)
          .order("created_at", { ascending: true })
          .range(from, to),
      ),
      fetchAllRows("Não foi possível calcular os recebimentos.", (from, to) =>
        db
          .from("finance_receipts")
          .select("id, amount, paid_on, status, invoice_id")
          .eq("school_id", membership.schoolId)
          .order("paid_on", { ascending: true })
          .range(from, to),
      ),
      cashExpensesAvailable
        ? fetchAllRows("Não foi possível calcular as despesas.", (from, to) =>
            db
              .from("siga_cash_expenses")
              .select("id, amount, category, occurred_at, status")
              .eq("school_id", membership.schoolId)
              .order("occurred_at", { ascending: true })
              .range(from, to),
          )
        : Promise.resolve({ rows: [] as Array<Record<string, unknown>>, truncated: false }),
      db.from("fee_items").select("id, name, kind").eq("school_id", membership.schoolId),
    ]);
    const invoices = invoicesPaged.rows;
    const receipts = receiptsPaged.rows;
    const expenses = expensesPaged.rows;
    const truncated = invoicesPaged.truncated || receiptsPaged.truncated || expensesPaged.truncated;

    const today = new Date().toISOString().slice(0, 10);
    const activeInvoices = (invoices ?? []).filter(
      (invoice: { status: string }) => invoice.status !== "cancelled",
    );
    const contractIds = [
      ...new Set(
        activeInvoices
          .map((invoice: { contract_id: string | null }) => invoice.contract_id)
          .filter(Boolean),
      ),
    ] as string[];
    const { data: contracts } = contractIds.length
      ? await db.from("finance_contracts").select("id, enrollment_id").in("id", contractIds)
      : { data: [] as Array<{ id: string; enrollment_id: string }> };
    const enrollmentIds = [
      ...new Set((contracts ?? []).map((row) => row.enrollment_id).filter(Boolean)),
    ];
    const { data: enrollments } = enrollmentIds.length
      ? await db.from("enrollments").select("id, student_id").in("id", enrollmentIds)
      : { data: [] as Array<{ id: string; student_id: string }> };
    const enrollmentById = new Map((enrollments ?? []).map((row) => [row.id, row]));
    const contractById = new Map((contracts ?? []).map((row) => [row.id, row]));

    const paidByInvoice = new Map<string, number>();
    let cashIn = 0;
    let cashOut = 0;
    for (const receipt of receipts ?? []) {
      if (receipt.status === "reversed") continue;
      cashIn += Number(receipt.amount ?? 0);
      paidByInvoice.set(
        String(receipt.invoice_id),
        (paidByInvoice.get(String(receipt.invoice_id)) ?? 0) + Number(receipt.amount ?? 0),
      );
    }

    let billed = 0;
    let outstanding = 0;
    let overdue = 0;
    let openCount = 0;
    let overdueCount = 0;
    const billedStudents = new Set<string>();
    const monthlyMap = new Map<string, { billed: number; received: number }>();
    const categoryMap = new Map<string, number>();
    const expenseCategoryMap = new Map<string, number>();
    const feeById = new Map(
      (feeItems ?? []).map((item: { id: string; name: string; kind: string }) => [item.id, item]),
    );

    for (const invoice of activeInvoices) {
      const amount = Number(invoice.amount ?? 0) - Number(invoice.discount_amount ?? 0);
      const paid = paidByInvoice.get(String(invoice.id)) ?? 0;
      const openAmount = Math.max(amount - paid, 0);
      billed += amount;
      outstanding += openAmount;
      if (openAmount > 0) {
        openCount += 1;
        if (invoice.due_date && invoice.due_date < today) {
          overdue += openAmount;
          overdueCount += 1;
        }
      }
      const contract = invoice.contract_id ? contractById.get(String(invoice.contract_id)) : null;
      const enrollment = contract ? enrollmentById.get(contract.enrollment_id) : null;
      if (enrollment?.student_id) billedStudents.add(String(enrollment.student_id));
      const month = String(invoice.competence_month || invoice.created_at || "").slice(0, 7);
      if (month) {
        const current = monthlyMap.get(month) ?? { billed: 0, received: 0 };
        current.billed += amount;
        current.received += Math.min(paid, amount);
        monthlyMap.set(month, current);
      }
      const fee = invoice.fee_item_id ? feeById.get(String(invoice.fee_item_id)) : null;
      const category = fee?.name || fee?.kind || "Outro";
      categoryMap.set(category, (categoryMap.get(category) ?? 0) + amount);
    }

    for (const expense of expenses) {
      if (expense.status === "reversed") continue;
      cashOut += Number(expense.amount ?? 0);
      const category = String(expense.category ?? "Despesa");
      expenseCategoryMap.set(
        category,
        (expenseCategoryMap.get(category) ?? 0) + Number(expense.amount ?? 0),
      );
    }

    return {
      summary: {
        billed,
        received: cashIn,
        outstanding,
        overdue,
        invoice_count: activeInvoices.length,
        open_invoice_count: openCount,
        overdue_invoice_count: overdueCount,
        billed_student_count: billedStudents.size,
        cash_in: cashIn,
        cash_out: cashOut,
        cash_balance: cashIn - cashOut,
        truncated,
      },
      monthly: [...monthlyMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, values]) => ({
          month_start: `${month}-01`,
          billed: values.billed,
          received: values.received,
        })),
      categories: [
        ...[...categoryMap.entries()].map(([category, total]) => ({
          category,
          direction: "in" as "in" | "out",
          amount: total,
        })),
        ...[...expenseCategoryMap.entries()].map(([category, total]) => ({
          category,
          direction: "out" as "in" | "out",
          amount: total,
        })),
      ],
    };
  });

export const listInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => financeListInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Tesouraria",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();

    const { data: invoices, error } = await db
      .from("finance_invoices")
      .select(
        "id, contract_id, fee_item_id, invoice_number, competence_month, amount, discount_amount, due_date, status, created_at",
      )
      .eq("school_id", membership.schoolId)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw publicDatabaseError(error, "Não foi possível carregar as faturas.");

    const invoiceIds = (invoices ?? []).map((row: { id: string }) => row.id);
    const contractIds = [
      ...new Set(
        (invoices ?? [])
          .map((row: { contract_id: string | null }) => row.contract_id)
          .filter(Boolean),
      ),
    ] as string[];
    const feeIds = [
      ...new Set(
        (invoices ?? [])
          .map((row: { fee_item_id: string | null }) => row.fee_item_id)
          .filter(Boolean),
      ),
    ] as string[];

    const [{ data: contracts }, { data: feeItems }, { data: receipts }] = await Promise.all([
      contractIds.length
        ? db.from("finance_contracts").select("id, enrollment_id").in("id", contractIds)
        : Promise.resolve({ data: [] as Array<{ id: string; enrollment_id: string }> }),
      feeIds.length
        ? db.from("fee_items").select("id, name, kind").in("id", feeIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string; kind: string }> }),
      invoiceIds.length
        ? db
            .from("finance_receipts")
            .select("invoice_id, amount, status")
            .in("invoice_id", invoiceIds)
        : Promise.resolve({
            data: [] as Array<{ invoice_id: string; amount: number; status: string }>,
          }),
    ]);

    const enrollmentIds = [
      ...new Set((contracts ?? []).map((row) => row.enrollment_id).filter(Boolean)),
    ];
    const { data: enrollments } = enrollmentIds.length
      ? await db.from("enrollments").select("id, student_id").in("id", enrollmentIds)
      : { data: [] as Array<{ id: string; student_id: string }> };
    const studentIds = [...new Set((enrollments ?? []).map((row) => row.student_id))];
    const students = await loadStudentDirectory(db, membership.schoolId, studentIds);
    const studentById = new Map(students.map((row) => [row.student_id, row]));
    const enrollmentById = new Map((enrollments ?? []).map((row) => [row.id, row]));
    const contractById = new Map((contracts ?? []).map((row) => [row.id, row]));
    const feeById = new Map((feeItems ?? []).map((row) => [row.id, row]));
    const paidByInvoice = new Map<string, number>();
    for (const receipt of receipts ?? []) {
      if (receipt.status === "reversed") continue;
      paidByInvoice.set(
        receipt.invoice_id,
        (paidByInvoice.get(receipt.invoice_id) ?? 0) + Number(receipt.amount ?? 0),
      );
    }

    return (invoices ?? []).map(
      (invoice: {
        id: string;
        contract_id: string | null;
        fee_item_id: string | null;
        invoice_number: string;
        amount: number;
        discount_amount: number;
        due_date: string;
        status: string;
        created_at: string;
      }) => {
        const contract = invoice.contract_id ? contractById.get(invoice.contract_id) : null;
        const enrollment = contract ? enrollmentById.get(contract.enrollment_id) : null;
        const student = enrollment ? studentById.get(enrollment.student_id) : null;
        const fee = invoice.fee_item_id ? feeById.get(invoice.fee_item_id) : null;
        const total = Number(invoice.amount ?? 0) - Number(invoice.discount_amount ?? 0);
        const paid = paidByInvoice.get(invoice.id) ?? 0;
        let status = mapInvoiceStatus(invoice.status);
        if (status !== "void" && paid > 0 && paid < total) status = "partial";
        if (status !== "void" && paid >= total && total > 0) status = "paid";
        return {
          id: invoice.id,
          number: invoice.invoice_number,
          student_id: enrollment?.student_id ?? null,
          student_name: student?.full_name ?? "Aluno",
          registration_number: student?.registration_number ?? "Sem processo",
          description: fee?.name ?? "Fatura escolar",
          issued_on: invoice.created_at?.slice(0, 10) ?? null,
          due_on: invoice.due_date,
          total_amount: total,
          amount_paid: paid,
          status,
        };
      },
    );
  });

export const listCashEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => financeListInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Tesouraria",
    ]);
    const db = await loadSgaAdminClient();

    const [{ data: receipts, error: receiptsError }, { data: expenses, error: expensesError }] =
      await Promise.all([
        db
          .from("finance_receipts")
          .select(
            "id, receipt_number, amount, paid_on, payment_method, status, invoice_id, reversal_reason, created_at",
          )
          .eq("school_id", membership.schoolId)
          .order("paid_on", { ascending: false })
          .limit(data.limit),
        db
          .from("siga_cash_expenses")
          .select(
            "id, document_number, description, category, amount, method, occurred_at, status, reversal_reason",
          )
          .eq("school_id", membership.schoolId)
          .order("occurred_at", { ascending: false })
          .limit(data.limit),
      ]);
    if (receiptsError) {
      throw publicDatabaseError(receiptsError, "Não foi possível carregar os movimentos de caixa.");
    }
    if (expensesError && !isMissingSgaTable(expensesError)) {
      throw publicDatabaseError(expensesError, "Não foi possível carregar as despesas de caixa.");
    }

    const receiptEntries: CashEntrySummary[] = (receipts ?? []).map(
      (receipt: Record<string, unknown>) => ({
        id: String(receipt["id"] ?? ""),
        document_number: String(receipt["receipt_number"] ?? ""),
        occurred_at: String(receipt["paid_on"] ?? receipt["created_at"] ?? ""),
        description:
          receipt["status"] === "reversed"
            ? `Recibo anulado${receipt["reversal_reason"] ? `: ${receipt["reversal_reason"]}` : ""}`
            : "Recebimento de fatura",
        category: "Recebimento",
        method: String(receipt["payment_method"] ?? "cash"),
        status: receipt["status"] === "reversed" ? "reversed" : "posted",
        direction: "in" as const,
        amount: Number(receipt["amount"] ?? 0),
      }),
    );
    const expenseEntries: CashEntrySummary[] = isMissingSgaTable(expensesError)
      ? []
      : (expenses ?? []).map((expense: Record<string, unknown>) => ({
          id: String(expense["id"] ?? ""),
          document_number: String(expense["document_number"] ?? ""),
          occurred_at: String(expense["occurred_at"] ?? ""),
          description:
            expense["status"] === "reversed"
              ? `Despesa anulada${expense["reversal_reason"] ? `: ${expense["reversal_reason"]}` : ""}`
              : String(expense["description"] ?? ""),
          category: String(expense["category"] ?? "Despesa"),
          method: String(expense["method"] ?? "cash"),
          status: expense["status"] === "reversed" ? "reversed" : "posted",
          direction: "out" as const,
          amount: Number(expense["amount"] ?? 0),
        }));
    return [...receiptEntries, ...expenseEntries]
      .sort((left, right) => String(right.occurred_at).localeCompare(String(left.occurred_at)))
      .slice(0, data.limit);
  });

/**
 * private.register_payment só aceita este conjunto (é validado dentro da função).
 * Os métodos premium angolanos (Multicaixa Express, Unitel Money) não têm
 * equivalente 1:1 — o método original fica registado na descrição do arquivo.
 */
function mapPaymentMethodForLedger(method: string): "cash" | "bank_transfer" | "card" | "other" {
  if (method === "cash") return "cash";
  if (method === "transfer") return "bank_transfer";
  if (method === "multicaixa" || method === "multicaixa_express" || method === "express") {
    return "card";
  }
  return "other";
}

export const recordInvoicePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => recordInvoicePaymentInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Tesouraria",
    ]);
    const db = await loadSgaAdminClient();

    // register_payment tranca a fatura (FOR UPDATE), valida o saldo em aberto e gera
    // o número do recibo atomicamente — evita a corrida de dois pagamentos simultâneos
    // sobre a mesma fatura que o insert directo anterior não protegia.
    // Corre no client da SESSÃO (não no admin) para auth.uid()/aal2 resolverem.
    const { data: outcome, error } = await context.supabase.rpc("register_payment", {
      school_id: membership.schoolId,
      invoice_id: data.invoiceId,
      amount: data.amount,
      payment_method: mapPaymentMethodForLedger(data.method),
      paid_on: (data.paidAt ?? new Date().toISOString()).slice(0, 10),
    });
    if (error) {
      if (error.code === "42501" || /is_aal2|autorização/i.test(error.message ?? "")) {
        throw new Error(
          "Esta conta precisa de verificação em duas etapas (2FA) activa para registar pagamentos.",
        );
      }
      throw publicDatabaseError(error, "Não foi possível registrar o pagamento.");
    }
    const result = outcome as {
      receiptId: string;
      receiptNumber: string;
      invoiceStatus: string;
    };

    const linked = await personIdForInvoice(db, membership.schoolId, data.invoiceId);
    const documentCode = stableDocumentCode("recibo", result.receiptId);
    const noteExtra = data.receiptNumber
      ? ` Referência do funcionário: ${data.receiptNumber}.`
      : "";
    const archived = await archiveFinanceQuietly(db, {
      schoolId: membership.schoolId,
      userId: context.userId,
      role: membership.appRole,
      category: "recibo",
      title: `Recibo ${result.receiptNumber}`,
      description: `Recibo financeiro emitido na tesouraria. Fatura ${linked.invoiceNumber ?? data.invoiceId}. Número oficial ${result.receiptNumber}. Método original: ${data.method}.${noteExtra} Arquivado automaticamente na biblioteca SIGA.`,
      relatedPersonId: linked.personId,
      sourceLabel: result.receiptNumber,
      amountLabel: formatAmountKz(Number(data.amount)),
      documentCode,
    });

    return {
      id: result.receiptId,
      receipt_number: result.receiptNumber,
      invoice_status: result.invoiceStatus,
      library_document_code: archived?.documentCode ?? documentCode,
      library_file_id: archived?.fileId ?? null,
    };
  });

export const cancelInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => cancelInvoiceInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Tesouraria",
    ]);
    const db = await loadSgaAdminClient();
    const { data: invoice, error: invoiceError } = await db
      .from("finance_invoices")
      .select("id, status, amount, discount_amount")
      .eq("id", data.invoiceId)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (invoiceError)
      throw publicDatabaseError(invoiceError, "Não foi possível localizar a fatura.");
    if (!invoice) throw new Error("Fatura não encontrada.");
    if (invoice.status === "cancelled") throw new Error("Esta fatura já está cancelada.");
    if (invoice.status === "paid") {
      throw new Error(
        "Não é possível cancelar uma fatura já liquidada. Anule os recibos primeiro.",
      );
    }

    const { data: receipts, error: receiptsError } = await db
      .from("finance_receipts")
      .select("amount, status")
      .eq("invoice_id", data.invoiceId)
      .eq("school_id", membership.schoolId);
    if (receiptsError) {
      throw publicDatabaseError(receiptsError, "Não foi possível verificar os recibos da fatura.");
    }
    const paid = (receipts ?? [])
      .filter((row: { status: string }) => row.status !== "reversed")
      .reduce((sum: number, row: { amount: number }) => sum + Number(row.amount ?? 0), 0);
    if (paid > 0) {
      throw new Error("Esta fatura já tem recibos. Anule os lançamentos antes de cancelar.");
    }

    void data.reason;
    const { data: updated, error } = await db
      .from("finance_invoices")
      .update({ status: "cancelled" })
      .eq("id", data.invoiceId)
      .eq("school_id", membership.schoolId)
      .select("id, status")
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível cancelar a fatura.");
    if (!updated) throw new Error("Fatura não encontrada.");
    return updated;
  });

export const issueInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => issueInvoiceInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Tesouraria",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();

    const { data: studentCheck, error: studentCheckError } = await db
      .from("students")
      .select("id")
      .eq("id", data.studentId)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (studentCheckError)
      throw publicDatabaseError(studentCheckError, "Não foi possível validar o aluno.");
    if (!studentCheck) throw new Error("Aluno não encontrado nesta escola.");

    const { data: enrollment } = await db
      .from("enrollments")
      .select("id, academic_year_id, class_group_id")
      .eq("student_id", data.studentId)
      .eq("school_id", membership.schoolId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (!enrollment) {
      throw new Error(
        "Este aluno ainda não tem matrícula activa. Atribua uma turma em Alunos antes de emitir a fatura.",
      );
    }

    const { data: plan } = await db
      .from("fee_plans")
      .select("id")
      .eq("school_id", membership.schoolId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (!plan?.id) throw new Error("Não há plano financeiro activo na escola.");

    let { data: contract } = await db
      .from("finance_contracts")
      .select("id")
      .eq("enrollment_id", enrollment.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (!contract) {
      const { data: createdContract, error: contractError } = await db
        .from("finance_contracts")
        .insert({
          school_id: membership.schoolId,
          enrollment_id: enrollment.id,
          fee_plan_id: plan.id,
          discount_percentage: 0,
          status: "active",
          created_by: context.userId,
        })
        .select("id")
        .single();
      if (contractError) {
        throw publicDatabaseError(contractError, "Não foi possível criar o contrato financeiro.");
      }
      contract = createdContract;
    }

    const kind = categoryToFeeKind(data.category);
    let feeQuery = db
      .from("fee_items")
      .select("id, name, amount")
      .eq("school_id", membership.schoolId)
      .eq("fee_plan_id", plan.id)
      .eq("is_active", true);
    if (kind) feeQuery = feeQuery.eq("kind", kind);
    const { data: feeItem } = await feeQuery.limit(1).maybeSingle();
    if (!feeItem?.id) throw new Error("Não há item de taxa activo para esta categoria.");

    const competenceMonth =
      (data.issuedOn ?? new Date().toISOString().slice(0, 10)).slice(0, 7) + "-01";
    const { data: invoice, error } = await db
      .from("finance_invoices")
      .insert({
        school_id: membership.schoolId,
        contract_id: contract.id,
        fee_item_id: feeItem.id,
        invoice_number: data.number,
        competence_month: competenceMonth,
        amount: data.amount,
        discount_amount: 0,
        penalty_amount: 0,
        due_date: data.dueOn,
        status: "open",
        issued_by: context.userId,
      })
      .select("*")
      .single();
    if (error) {
      if (/penalty_amount/i.test(error.message)) {
        throw new Error(
          "A base SGA precisa da coluna finance_invoices.penalty_amount. No SQL Editor do projecto xodgfmxiaunpamctfeea execute supabase/APPLY_IN_SQL_EDITOR.sql.",
        );
      }
      if (
        /notification_preferences|in_app_enabled|email_enabled|whatsapp_enabled/i.test(
          error.message,
        )
      ) {
        throw new Error(
          "O trigger de faturas precisa do schema de notification_preferences (in_app_enabled, email_enabled, sms_enabled, whatsapp_enabled). Execute supabase/APPLY_IN_SQL_EDITOR.sql no SQL Editor do SGA.",
        );
      }
      throw publicDatabaseError(error, "Não foi possível emitir a fatura.");
    }

    const student = await personIdForStudent(db, membership.schoolId, data.studentId);
    const documentCode = stableDocumentCode("fatura", String(invoice.id ?? data.number));
    const archived = await archiveFinanceQuietly(db, {
      schoolId: membership.schoolId,
      userId: context.userId,
      role: membership.appRole,
      category: "fatura",
      title: `Fatura ${data.number}`,
      description: `Fatura escolar ${data.number} (${data.category}). ${data.description?.trim() || "Documento de cobrança arquivado na biblioteca."} Processo ${student.studentNumber ?? "—"}.`,
      relatedPersonId: student.personId,
      sourceLabel: data.number,
      amountLabel: formatAmountKz(Number(data.amount)),
      documentCode,
    });

    return {
      ...invoice,
      library_document_code: archived?.documentCode ?? documentCode,
      library_file_id: archived?.fileId ?? null,
    };
  });

export const recordCashExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => recordCashExpenseInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Tesouraria",
    ]);
    const db = await loadSgaAdminClient();
    const { data: expense, error } = await db
      .from("siga_cash_expenses")
      .insert({
        school_id: membership.schoolId,
        document_number: data.documentNumber,
        description: data.description,
        category: data.category,
        amount: data.amount,
        method: data.method,
        reference: data.reference ?? null,
        occurred_at: data.occurredAt ?? new Date().toISOString(),
        status: "posted",
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("id, document_number, description, category, amount, method, occurred_at, status")
      .single();
    if (error) throw publicDatabaseError(error, "Não foi possível registar a despesa de caixa.");

    const documentCode = stableDocumentCode("despesa", String(expense.id));
    const archived = await archiveFinanceQuietly(db, {
      schoolId: membership.schoolId,
      userId: context.userId,
      role: membership.appRole,
      category: "outro",
      title: `Despesa ${expense.document_number}`,
      description: `Despesa de caixa: ${expense.description}. Categoria ${expense.category}. Referência ${data.reference ?? "—"}. Arquivada automaticamente na biblioteca SIGA.`,
      sourceLabel: expense.document_number,
      amountLabel: formatAmountKz(Number(expense.amount)),
      documentCode,
    });
    return {
      ...expense,
      library_document_code: archived?.documentCode ?? documentCode,
      library_file_id: archived?.fileId ?? null,
    };
  });

export const reverseCashEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => reverseCashEntryInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Tesouraria",
    ]);
    const db = await loadSgaAdminClient();

    const { data: receipt, error } = await db
      .from("finance_receipts")
      .update({
        status: "reversed",
        reversed_at: new Date().toISOString(),
        reversed_by: context.userId,
        reversal_reason: data.reason,
      })
      .eq("id", data.cashEntryId)
      .eq("school_id", membership.schoolId)
      .select("*")
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível anular o lançamento.");
    if (receipt) return receipt;

    const { data: expense, error: expenseError } = await db
      .from("siga_cash_expenses")
      .update({
        status: "reversed",
        reversed_at: new Date().toISOString(),
        reversed_by: context.userId,
        reversal_reason: data.reason,
        updated_by: context.userId,
      })
      .eq("id", data.cashEntryId)
      .eq("school_id", membership.schoolId)
      .eq("status", "posted")
      .select("*")
      .maybeSingle();
    if (expenseError) throw publicDatabaseError(expenseError, "Não foi possível anular a despesa.");
    if (!expense) throw new Error("Movimento não encontrado ou já anulado.");
    return expense;
  });

export const createPaymentPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createPaymentPlanInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Tesouraria",
    ]);
    const db = await loadSgaAdminClient();
    const { data: plan, error } = await db
      .from("finance_payment_plans")
      .insert({
        school_id: membership.schoolId,
        invoice_id: data.invoiceId ?? null,
        student_id: data.studentId ?? null,
        channel: data.channel,
        installments: data.installments,
        reference: data.reference ?? null,
        notes: data.notes ?? null,
        status: "pending_gateway",
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("id, channel, installments, status, reference")
      .single();
    if (error) throw publicDatabaseError(error, "Não foi possível criar o plano de pagamento.");

    let personId: string | null = null;
    let studentNumber: string | null = null;
    if (data.studentId) {
      const student = await personIdForStudent(db, membership.schoolId, data.studentId);
      personId = student.personId;
      studentNumber = student.studentNumber;
    } else if (data.invoiceId) {
      const linked = await personIdForInvoice(db, membership.schoolId, data.invoiceId);
      personId = linked.personId;
      studentNumber = linked.studentNumber;
    }
    const documentCode = stableDocumentCode("talao", String(plan.id));
    const channelLabel = String(data.channel).replaceAll("_", " ");
    const archived = await archiveFinanceQuietly(db, {
      schoolId: membership.schoolId,
      userId: context.userId,
      role: membership.appRole,
      category: "talao",
      title: `Talão ${channelLabel}`,
      description: `Talão de plano de pagamento (${channelLabel}, ${data.installments} prestação(ões)). Referência ${data.reference ?? "—"}. Processo ${studentNumber ?? "—"}. Arquivado automaticamente.`,
      relatedPersonId: personId,
      sourceLabel: data.reference ?? plan.id,
      documentCode,
    });

    return {
      ...plan,
      library_document_code: archived?.documentCode ?? documentCode,
      library_file_id: archived?.fileId ?? null,
    };
  });

export const listPaymentPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Tesouraria",
    ]);
    const db = await loadSgaAdminClient();
    const { data, error } = await db
      .from("finance_payment_plans")
      .select("id, channel, installments, status, reference, created_at")
      .eq("school_id", membership.schoolId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      if (error.code === "42P01" || /does not exist|schema cache/i.test(error.message)) {
        return [];
      }
      throw publicDatabaseError(error, "Não foi possível carregar os planos de pagamento.");
    }
    return data ?? [];
  });

export const cancelPaymentPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => cancelPaymentPlanInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Tesouraria",
    ]);
    const db = await loadSgaAdminClient();
    const { data: existing, error: loadError } = await db
      .from("finance_payment_plans")
      .select("id, status")
      .eq("id", data.planId)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (loadError) throw publicDatabaseError(loadError, "Não foi possível ler o plano.");
    if (!existing) throw new Error("Plano não encontrado.");
    if (existing.status === "cancelled") throw new Error("Este plano já está cancelado.");
    if (existing.status === "settled") {
      throw new Error("Não é possível cancelar um plano já liquidado.");
    }
    const { data: plan, error } = await db
      .from("finance_payment_plans")
      .update({
        status: "cancelled",
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.planId)
      .eq("school_id", membership.schoolId)
      .select("id, status")
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível cancelar o plano.");
    if (!plan) throw new Error("Plano não encontrado.");
    return plan;
  });
