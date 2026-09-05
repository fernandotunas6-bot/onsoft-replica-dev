import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
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
  upsertFeePlanSettingsInputSchema,
  syncStudentToPayflowInputSchema,
} from "./schemas";
import { insertFinanceArchive } from "@/features/arquivos/archive-finance-core";
import { stableDocumentCode } from "@/features/arquivos/document-code";
import { canWriteFileArea } from "@/features/arquivos/kinds";
import { DEFAULT_FEE_ITEMS, DEFAULT_FEE_PLAN_NAME } from "./fee-plan-defaults";
import {
  generateMulticaixaReference,
  generateMobileWalletOptions,
  resolveSchoolEmisEntity,
  isGatewayPaymentChannel,
  normalizePaymentReference,
} from "./emiss-multicaixa";
import { loadPersonNamesById } from "@/features/people/lookup";
import {
  invoiceDateInSaftPeriod,
  mapFinanceInvoiceToSaftItem,
  saftExportBlocked,
  saftPeriodBounds,
  validateSaftSchoolReadiness,
} from "./saft-export";

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
  const peopleById = await loadPersonNamesById(db, schoolId, personIds);
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
        missingActiveFeePlan: true,
      };
    }
    const db = await loadSgaAdminClient();
    const [{ error: penaltyError }, { error: prefsError }, { error: cashExpensesError }, feePlanResult] =
      await Promise.all([
        db.from("finance_invoices").select("id, penalty_amount").limit(1),
        db.from("notification_preferences").select("id").limit(1),
        db.from("siga_cash_expenses").select("id").limit(1),
        db
          .from("fee_plans")
          .select("id")
          .eq("school_id", membership.schoolId)
          .eq("status", "active")
          .limit(1)
          .maybeSingle(),
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
    const feePlanError = feePlanResult.error;
    const missingActiveFeePlan = Boolean(
      !feePlanResult.data?.id &&
      (!feePlanError || !isMissingSgaTable(feePlanError)),
    );
    if (feePlanError && !isMissingSgaTable(feePlanError)) {
      throw publicDatabaseError(feePlanError, "Não foi possível validar o plano financeiro.");
    }
    return {
      ready:
        !missingPenaltyAmount && !missingNotificationPreferences && !missingActiveFeePlan,
      missingPenaltyAmount,
      missingNotificationPreferences,
      missingCashExpenses: isMissingSgaTable(cashExpensesError),
      missingActiveFeePlan,
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
    const monthlyMap = new Map<string, { billed: number; received: number; expense: number }>();
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
        const current = monthlyMap.get(month) ?? { billed: 0, received: 0, expense: 0 };
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
      const expenseAmount = Number(expense.amount ?? 0);
      cashOut += expenseAmount;
      const category = String(expense.category ?? "Despesa");
      expenseCategoryMap.set(category, (expenseCategoryMap.get(category) ?? 0) + expenseAmount);
      const expenseMonth = String(expense.occurred_at ?? "").slice(0, 7);
      if (expenseMonth) {
        const current = monthlyMap.get(expenseMonth) ?? { billed: 0, received: 0, expense: 0 };
        current.expense += expenseAmount;
        monthlyMap.set(expenseMonth, current);
      }
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
          expense: values.expense,
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

export const generateInvoicePaymentReference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { invoiceId: string; amount: number }) => data)
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Tesouraria",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();
    const { data: invoice, error: invoiceError } = await db
      .from("finance_invoices")
      .select("id")
      .eq("id", data.invoiceId)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (invoiceError) {
      throw publicDatabaseError(invoiceError, "Não foi possível validar a fatura.");
    }
    if (!invoice?.id) throw new Error("Fatura não encontrada nesta escola.");

    const emisEntity = await resolveSchoolEmisEntity(db, membership.schoolId);
    const mcx = generateMulticaixaReference(emisEntity, data.invoiceId, data.amount);
    const wallets = generateMobileWalletOptions(data.amount, data.invoiceId);
    return {
      multicaixa: mcx,
      mobileWallets: wallets,
      emisEntity,
    };
  });

/**
 * Confirmação manual de um pagamento por referência Multicaixa/carteira móvel.
 * Não existe integração real com um webhook EMIS — quem chama esta função está a
 * atestar que viu o comprovativo do pagamento. Continua gated a Administrador/Tesouraria.
 */
export const confirmManualMulticaixaPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (data: { invoiceId: string; amount: number; reference: string; method?: string }) => data,
  )
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Tesouraria",
    ]);

    const payResult = await recordInvoicePayment({
      data: {
        invoiceId: data.invoiceId,
        amount: data.amount,
        method: data.method ?? "multicaixa_express",
        receiptNumber: `MCX-CONF-${data.reference.replace(/\s+/g, "")}`,
      },
    });

    const db = await loadSgaAdminClient();
    const normRef = normalizePaymentReference(data.reference);
    await db
      .from("finance_payment_plans")
      .update({ status: "settled", updated_at: new Date().toISOString() })
      .eq("school_id", membership.schoolId)
      .eq("invoice_id", data.invoiceId)
      .in("status", ["pending_gateway", "scheduled"]);

    await db
      .from("finance_payment_plans")
      .update({ status: "settled", updated_at: new Date().toISOString() })
      .eq("school_id", membership.schoolId)
      .eq("reference", normRef)
      .in("status", ["pending_gateway", "scheduled"]);

    return {
      success: true,
      paidAt: new Date().toISOString(),
      receiptId: payResult.id,
      receiptNumber: payResult.receipt_number,
      message: `Pagamento de ${data.amount} AOA confirmado manualmente pela tesouraria. Recibo oficial ${payResult.receipt_number} emitido.`,
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

    let reference = data.reference?.trim() || null;
    let invoiceAmount: number | null = null;
    if (data.invoiceId) {
      const { data: invoiceRow } = await db
        .from("finance_invoices")
        .select("total_amount, amount, discount_amount")
        .eq("id", data.invoiceId)
        .eq("school_id", membership.schoolId)
        .maybeSingle();
      if (invoiceRow) {
        invoiceAmount =
          Number(invoiceRow.total_amount ?? 0) ||
          Number(invoiceRow.amount ?? 0) - Number(invoiceRow.discount_amount ?? 0);
      }
    }
    if (!reference && data.invoiceId && isGatewayPaymentChannel(data.channel) && invoiceAmount) {
      const emisEntity = await resolveSchoolEmisEntity(db, membership.schoolId);
      const generated = generateMulticaixaReference(emisEntity, data.invoiceId, invoiceAmount);
      reference = normalizePaymentReference(generated.reference);
    }

    const { data: plan, error } = await db
      .from("finance_payment_plans")
      .insert({
        school_id: membership.schoolId,
        invoice_id: data.invoiceId ?? null,
        student_id: data.studentId ?? null,
        channel: data.channel,
        installments: data.installments,
        reference,
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

export type GatewayWebhookEventSummary = {
  id: string;
  created_at: string;
  ok: boolean;
  http_status: number;
  channel: string;
  message: string;
  reference: string;
  invoice_id: string | null;
  amount: number;
};

export const listGatewayWebhookEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        channel: z.enum(["multicaixa_express", "unitel_money"]).optional(),
        limit: z.number().int().min(1).max(20).optional(),
      })
      .parse(input ?? {});
  })
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Tesouraria",
    ]);
    const db = await loadSgaAdminClient();
    let query = db
      .from("finance_gateway_webhook_events")
      .select(
        "id, created_at, ok, http_status, channel, message, reference, invoice_id, amount",
      )
      .eq("school_id", membership.schoolId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 5);
    if (data.channel) {
      query = query.eq("channel", data.channel);
    }
    const { data: rows, error } = await query;
    if (error) {
      if (error.code === "42P01" || /does not exist|schema cache/i.test(error.message)) {
        return [] as GatewayWebhookEventSummary[];
      }
      throw publicDatabaseError(error, "Não foi possível carregar eventos de webhook.");
    }
    return (rows ?? []) as GatewayWebhookEventSummary[];
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

export type FeePlanItemSummary = {
  id: string;
  name: string;
  kind: string;
  amount: number;
  is_active: boolean;
};

async function loadFeePlanSettingsForSchool(schoolId: string) {
  const db = await loadSgaAdminClient();
  const { data: plan, error: planError } = await db
    .from("fee_plans")
    .select("id, name, status")
    .eq("school_id", schoolId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (planError && !isMissingSgaTable(planError)) {
    throw publicDatabaseError(planError, "Não foi possível carregar o plano financeiro.");
  }
  if (!plan?.id) {
    return { ready: false, plan: null, items: [] as FeePlanItemSummary[] };
  }

  const { data: items, error: itemsError } = await db
    .from("fee_items")
    .select("id, name, kind, amount, is_active")
    .eq("school_id", schoolId)
    .eq("fee_plan_id", plan.id)
    .order("kind");
  if (itemsError && !isMissingSgaTable(itemsError)) {
    throw publicDatabaseError(itemsError, "Não foi possível carregar os itens de taxa.");
  }

  return {
    ready: true,
    plan: { id: plan.id as string, name: String(plan.name), status: String(plan.status) },
    items: (items ?? []).map((row) => ({
      id: row.id as string,
      name: String(row.name),
      kind: String(row.kind),
      amount: Number(row.amount),
      is_active: Boolean(row.is_active),
    })),
  };
}

export const listFeePlanSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Tesouraria",
      "Secretaria",
    ]);
    return loadFeePlanSettingsForSchool(membership.schoolId);
  });

export const upsertFeePlanSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => upsertFeePlanSettingsInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Tesouraria",
    ]);
    const db = await loadSgaAdminClient();

    let planId: string;
    const { data: existingPlan } = await db
      .from("fee_plans")
      .select("id")
      .eq("school_id", membership.schoolId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (existingPlan?.id) {
      planId = existingPlan.id as string;
      const { error: updateErr } = await db
        .from("fee_plans")
        .update({ name: data.planName })
        .eq("id", planId)
        .eq("school_id", membership.schoolId);
      if (updateErr) throw publicDatabaseError(updateErr, "Não foi possível actualizar o plano.");
    } else {
      const { data: created, error: createErr } = await db
        .from("fee_plans")
        .insert({
          school_id: membership.schoolId,
          name: data.planName || DEFAULT_FEE_PLAN_NAME,
          status: "active",
        })
        .select("id")
        .single();
      if (createErr) {
        throw publicDatabaseError(createErr, "Não foi possível criar o plano financeiro.");
      }
      planId = created.id as string;
    }

    const desired = [
      { kind: "tuition", name: "Propina mensal", amount: data.tuitionAmount },
      { kind: "enrollment", name: "Taxa de matrícula", amount: data.enrollmentAmount },
    ] as const;

    for (const item of desired) {
      const { data: existingItem } = await db
        .from("fee_items")
        .select("id")
        .eq("school_id", membership.schoolId)
        .eq("fee_plan_id", planId)
        .eq("kind", item.kind)
        .limit(1)
        .maybeSingle();

      if (existingItem?.id) {
        const { error } = await db
          .from("fee_items")
          .update({ name: item.name, amount: item.amount, is_active: true })
          .eq("id", existingItem.id)
          .eq("school_id", membership.schoolId);
        if (error) throw publicDatabaseError(error, "Não foi possível actualizar o item de taxa.");
      } else {
        const { error } = await db.from("fee_items").insert({
          school_id: membership.schoolId,
          fee_plan_id: planId,
          name: item.name,
          kind: item.kind,
          amount: item.amount,
          is_active: true,
        });
        if (error) throw publicDatabaseError(error, "Não foi possível criar o item de taxa.");
      }
    }

    return loadFeePlanSettingsForSchool(membership.schoolId);
  });

export const exportSaftAoXml = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    const { generateSaftInputSchema } = require("./saft-generator");
    return generateSaftInputSchema.parse(input);
  })
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
      "Tesouraria",
    ]);
    const db = await loadSgaAdminClient();

    const [{ data: schoolSetting }, { data: agtSetting }] = await Promise.all([
      db
        .from("school_settings")
        .select("value")
        .eq("school_id", membership.schoolId)
        .eq("domain", "school")
        .maybeSingle(),
      db
        .from("school_settings")
        .select("value")
        .eq("school_id", membership.schoolId)
        .eq("domain", "agt")
        .maybeSingle(),
    ]);

    const schoolVal = (schoolSetting?.value as Record<string, unknown>) ?? {};
    const agtVal = (agtSetting?.value as Record<string, unknown>) ?? {};
    const schoolInfo = {
      nif: String(schoolVal["nif"] ?? schoolVal["taxId"] ?? ""),
      name: String(schoolVal["name"] ?? schoolVal["schoolName"] ?? "Instituição Escolar SIGA"),
      address: String(schoolVal["address"] ?? "Luanda"),
      city: String(schoolVal["city"] ?? "Luanda"),
    };

    const readiness = validateSaftSchoolReadiness(schoolInfo);
    if (saftExportBlocked(readiness)) {
      throw new Error(readiness.find((issue) => issue.level === "error")?.message ?? "Exportação bloqueada.");
    }

    const period = saftPeriodBounds(data);
    const { data: invoices, error } = await db
      .from("finance_invoices")
      .select(
        "id, contract_id, fee_item_id, invoice_number, amount, discount_amount, status, created_at",
      )
      .eq("school_id", membership.schoolId)
      .gte("created_at", `${period.start}T00:00:00`)
      .lte("created_at", `${period.end}T23:59:59`)
      .order("created_at", { ascending: true });

    if (error) {
      throw publicDatabaseError(error, "Não foi possível carregar as faturas para o SAFT-AO.");
    }

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

    const [{ data: contracts }, { data: feeItems }] = await Promise.all([
      contractIds.length
        ? db.from("finance_contracts").select("id, enrollment_id").in("id", contractIds)
        : Promise.resolve({ data: [] as Array<{ id: string; enrollment_id: string }> }),
      feeIds.length
        ? db.from("fee_items").select("id, name").in("id", feeIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    ]);

    const enrollmentIds = [
      ...new Set((contracts ?? []).map((row) => row.enrollment_id).filter(Boolean)),
    ];
    const { data: enrollments } = enrollmentIds.length
      ? await db.from("enrollments").select("id, student_id").in("id", enrollmentIds)
      : { data: [] as Array<{ id: string; student_id: string }> };

    const studentIds = [...new Set((enrollments ?? []).map((row) => row.student_id))];
    const students = studentIds.length
      ? await loadStudentDirectory(db, membership.schoolId, studentIds)
      : [];
    const studentById = new Map(students.map((row) => [row.student_id, row]));
    const enrollmentById = new Map((enrollments ?? []).map((row) => [row.id, row]));
    const contractById = new Map((contracts ?? []).map((row) => [row.id, row]));
    const feeById = new Map((feeItems ?? []).map((row) => [row.id, row]));

    const formattedInvoices = (invoices ?? [])
      .map(
        (invoice: {
          id: string;
          contract_id: string | null;
          fee_item_id: string | null;
          invoice_number: string;
          amount: number;
          discount_amount: number;
          status: string;
          created_at: string;
        }) => {
          const contract = invoice.contract_id ? contractById.get(invoice.contract_id) : null;
          const enrollment = contract ? enrollmentById.get(contract.enrollment_id) : null;
          const student = enrollment ? studentById.get(enrollment.student_id) : null;
          const fee = invoice.fee_item_id ? feeById.get(invoice.fee_item_id) : null;
          return mapFinanceInvoiceToSaftItem({
            id: invoice.id,
            invoice_number: invoice.invoice_number,
            created_at: invoice.created_at,
            amount: Number(invoice.amount ?? 0),
            discount_amount: Number(invoice.discount_amount ?? 0),
            status: invoice.status,
            description: fee?.name ?? "Propina e Serviços Escolares",
            customerName: student?.full_name ?? "Estudante SIGA",
            studentId: enrollment?.student_id ?? null,
            fiscalYear: data.fiscalYear,
          });
        },
      )
      .filter((item) => invoiceDateInSaftPeriod(item.date, period.start, period.end));

    const softwareCertificateNumber =
      typeof agtVal["software_certified"] === "string" && agtVal["software_certified"].trim()
        ? agtVal["software_certified"].trim()
        : undefined;

    const { buildSaftAoXml } = await import("./saft-generator");
    const xml = buildSaftAoXml(schoolInfo, formattedInvoices, {
      ...data,
      softwareCertificateNumber,
    });

    const warnings = [
      ...readiness.filter((issue) => issue.level === "warn").map((issue) => issue.message),
      ...(formattedInvoices.length === 0
        ? [`Nenhuma fatura no período ${period.start} — ${period.end}.`]
        : []),
    ];

    return {
      success: true,
      filename: `SAFT-AO_${schoolInfo.nif}_${data.fiscalYear}.xml`,
      xml,
      invoiceCount: formattedInvoices.length,
      warnings,
    };
  });

/** Abre o painel PayFlow /admin via SSO assinado (anti-replay no PayFlow). */
export const createPayflowAdminLaunch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Tesouraria",
      "Secretaria",
    ]);

    const { mapSigaRoleToPayflowAdmin, buildPayflowSsoClaims, createPayflowSsoAssertion } =
      await import("./payflow-sso");
    const role = mapSigaRoleToPayflowAdmin(membership.appRole);
    if (!role) {
      throw new Error("O seu cargo não tem acesso ao painel PayFlow.");
    }

    const secret = process.env.PAYFLOW_SSO_SECRET?.trim() ?? "";
    if (secret.length < 32) {
      throw new Error(
        "PAYFLOW_SSO_SECRET não está configurado no servidor SIGA (mín. 32 caracteres).",
      );
    }

    const db = await loadSgaAdminClient();
    const { data: school, error: schoolError } = await db
      .from("schools")
      .select("id, tenant_id, name")
      .eq("id", membership.schoolId)
      .maybeSingle();
    if (schoolError) {
      throw publicDatabaseError(schoolError, "Não foi possível resolver a escola para o PayFlow.");
    }
    const tenantId =
      typeof school?.tenant_id === "string" && school.tenant_id.trim()
        ? school.tenant_id.trim()
        : membership.schoolId;

    const { getPayflowAdminUrl, getPayflowUrl } = await import("@/lib/ecosystem-urls");
    const adminUrl = getPayflowAdminUrl();
    const exchangeUrl = getPayflowUrl("/api/v1/sso/exchange");
    if (!adminUrl || !exchangeUrl) {
      throw new Error("VITE_PAYFLOW_URL não está configurada.");
    }

    const { data: profile } = await db
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();

    const claims = buildPayflowSsoClaims({
      userId: context.userId,
      tenantId,
      schoolId: membership.schoolId,
      role,
      name: typeof profile?.full_name === "string" ? profile.full_name : undefined,
    });
    const assertion = await createPayflowSsoAssertion(claims, secret);

    return {
      assertion,
      exchangeUrl,
      adminUrl,
      role,
      schoolId: membership.schoolId,
      expiresAt: new Date(claims.exp * 1000).toISOString(),
    };
  });

/**
 * Sincroniza escola + aluno + faturas abertas + IBAN para o PayFlow
 * (`POST /api/v1/education/sync`, autenticado com PAYFLOW_INTEGRATION_API_KEY).
 */
export const syncStudentToPayflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => syncStudentToPayflowInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Tesouraria",
      "Secretaria",
    ]);

    const apiKey = process.env.PAYFLOW_INTEGRATION_API_KEY?.trim() ?? "";
    if (apiKey.length < 24) {
      throw new Error(
        "PAYFLOW_INTEGRATION_API_KEY não está configurada no servidor SIGA (mín. 24 caracteres).",
      );
    }
    const { getPayflowUrl } = await import("@/lib/ecosystem-urls");
    const syncUrl = getPayflowUrl("/api/v1/education/sync");
    if (!syncUrl) throw new Error("VITE_PAYFLOW_URL não está configurada.");

    const {
      toPayflowStudentCode,
      derivePayflowPaymentPin,
      toPayflowSchoolCode,
      mapEnrollmentStatusToPayflow,
      mapInvoiceStatusToPayflow,
      kzToMinorUnits,
      buildPayflowBankAccount,
    } = await import("./payflow-education-sync");
    const { loadSchoolSettingsBundle } = await import("@/features/school/server");

    const db = await loadSgaAdminClient();
    const { data: student, error: studentError } = await db
      .from("students")
      .select("id, student_number, status, person_id, school_id")
      .eq("id", data.studentId)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (studentError) throw publicDatabaseError(studentError, "Não foi possível carregar o aluno.");
    if (!student) throw new Error("Aluno não encontrado nesta escola.");

    const { data: schoolRow } = await db
      .from("schools")
      .select("id, tenant_id, name")
      .eq("id", membership.schoolId)
      .maybeSingle();
    const schoolName = typeof schoolRow?.name === "string" ? schoolRow.name : "Escola";
    const tenantId =
      typeof schoolRow?.tenant_id === "string" && schoolRow.tenant_id.trim()
        ? schoolRow.tenant_id.trim()
        : membership.schoolId;

    const { data: person } = await db
      .from("people")
      .select("id, full_name, email, phone")
      .eq("id", student.person_id)
      .eq("school_id", membership.schoolId)
      .maybeSingle();

    const { data: enrollment } = await db
      .from("enrollments")
      .select("id, class_group_id, academic_year_id, status")
      .eq("student_id", student.id)
      .eq("school_id", membership.schoolId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (!enrollment?.id || !enrollment.academic_year_id || !enrollment.class_group_id) {
      throw new Error(
        "O aluno precisa de matrícula activa com turma e ano lectivo para sincronizar com o PayFlow.",
      );
    }

    const { data: classGroup } = await db
      .from("class_groups")
      .select("id, name")
      .eq("id", enrollment.class_group_id)
      .eq("school_id", membership.schoolId)
      .maybeSingle();

    const { data: guardians } = await db
      .from("student_guardians")
      .select("guardian_person_id, is_primary")
      .eq("student_id", student.id)
      .eq("school_id", membership.schoolId)
      .order("is_primary", { ascending: false })
      .limit(1);
    const guardianId = guardians?.[0]?.guardian_person_id
      ? String(guardians[0].guardian_person_id)
      : null;

    let financialResponsible:
      | { name: string; email: string; phone: string }
      | undefined;
    if (guardianId) {
      const { data: guardianPerson } = await db
        .from("people")
        .select("full_name, email, phone")
        .eq("id", guardianId)
        .eq("school_id", membership.schoolId)
        .maybeSingle();
      if (guardianPerson?.full_name) {
        financialResponsible = {
          name: String(guardianPerson.full_name),
          email: typeof guardianPerson.email === "string" ? guardianPerson.email : "",
          phone: typeof guardianPerson.phone === "string" ? guardianPerson.phone : "",
        };
      }
    }

    const { data: contracts } = await db
      .from("finance_contracts")
      .select("id")
      .eq("school_id", membership.schoolId)
      .eq("enrollment_id", enrollment.id);
    const contractIds = (contracts ?? []).map((c) => c.id as string);
    let invoiceRows: Array<{
      id: string;
      invoice_number: string | null;
      competence_month: string | null;
      amount: number | null;
      discount_amount: number | null;
      due_date: string | null;
      status: string;
      fee_item_id: string | null;
    }> = [];
    if (contractIds.length) {
      const { data: invoices, error: invoicesError } = await db
        .from("finance_invoices")
        .select(
          "id, invoice_number, competence_month, amount, discount_amount, due_date, status, fee_item_id",
        )
        .eq("school_id", membership.schoolId)
        .in("contract_id", contractIds)
        .order("due_date", { ascending: false })
        .limit(100);
      if (invoicesError) {
        throw publicDatabaseError(invoicesError, "Não foi possível carregar as faturas do aluno.");
      }
      invoiceRows = (invoices ?? []) as typeof invoiceRows;
    }

    const feeIds = [
      ...new Set(invoiceRows.map((row) => row.fee_item_id).filter(Boolean)),
    ] as string[];
    const { data: feeItems } = feeIds.length
      ? await db.from("fee_items").select("id, name").in("id", feeIds)
      : { data: [] as Array<{ id: string; name: string }> };
    const feeNameById = new Map((feeItems ?? []).map((f) => [f.id, f.name]));

    const settings = await loadSchoolSettingsBundle(db, membership.schoolId);
    const bank = buildPayflowBankAccount({
      schoolId: membership.schoolId,
      accountHolder: settings.banking.account_holder || schoolName,
      bankName: settings.banking.bank_name,
      iban: settings.banking.iban,
      currency: settings.currency || "AOA",
    });

    const payload = {
      school: {
        id: membership.schoolId,
        tenant_id: tenantId,
        code: toPayflowSchoolCode(membership.schoolId, schoolName),
        name: schoolName.slice(0, 160),
      },
      student: {
        id: student.id,
        code: toPayflowStudentCode(student.student_number, student.id),
        enrollment_id: enrollment.id,
        academic_year_id: enrollment.academic_year_id,
        class_id: enrollment.class_group_id,
        guardian_id: guardianId,
        full_name: (person?.full_name || "Aluno").slice(0, 160),
        class_name: (classGroup?.name || "").slice(0, 120),
        enrollment_status: mapEnrollmentStatusToPayflow(student.status, enrollment.status),
        financial_responsible: financialResponsible,
        payment_pin: derivePayflowPaymentPin(student.id),
      },
      invoices: invoiceRows
        .map((invoice) => {
          const net = Number(invoice.amount ?? 0) - Number(invoice.discount_amount ?? 0);
          const amount = kzToMinorUnits(net);
          if (amount <= 0) return null;
          const due = invoice.due_date || new Date().toISOString().slice(0, 10);
          const feeName = invoice.fee_item_id ? feeNameById.get(invoice.fee_item_id) : null;
          return {
            id: invoice.id,
            code: String(invoice.invoice_number || invoice.id).slice(0, 60),
            description: String(feeName || "Propina escolar").slice(0, 180),
            period: String(invoice.competence_month || "").slice(0, 80),
            amount,
            currency: "AOA",
            due_date: due,
            status: mapInvoiceStatusToPayflow(invoice.status, invoice.due_date),
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null),
      bank_accounts: bank ? [bank] : [],
    };

    const response = await fetch(syncUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => ({}))) as {
      data?: {
        student_code?: string;
        invoices_received?: number;
        bank_accounts_received?: number;
        synced_at?: string;
      };
      error?: { message?: string; code?: string };
    };
    if (!response.ok) {
      throw new Error(
        body.error?.message ||
          `PayFlow recusou a sincronização (HTTP ${response.status}).`,
      );
    }

    return {
      ok: true as const,
      studentCode: body.data?.student_code ?? payload.student.code,
      invoicesSynced: body.data?.invoices_received ?? payload.invoices.length,
      bankAccountsSynced: body.data?.bank_accounts_received ?? payload.bank_accounts.length,
      syncedAt: body.data?.synced_at ?? new Date().toISOString(),
      payerUrl: getPayflowUrl("/aluno/pagar"),
      warning:
        payload.bank_accounts.length === 0
          ? "IBAN da escola não sincronizado — configure Definições → Financeiro."
          : null,
    };
  });

/**
 * Sincroniza só a conta IBAN da escola para o PayFlow
 * (`POST /api/v1/bank-accounts/sync`, com upsert opcional da escola).
 */
export const syncSchoolBankToPayflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Tesouraria",
    ]);

    const apiKey = process.env.PAYFLOW_INTEGRATION_API_KEY?.trim() ?? "";
    if (apiKey.length < 24) {
      throw new Error(
        "PAYFLOW_INTEGRATION_API_KEY não está configurada no servidor SIGA (mín. 24 caracteres).",
      );
    }
    const { getPayflowUrl } = await import("@/lib/ecosystem-urls");
    const syncUrl = getPayflowUrl("/api/v1/bank-accounts/sync");
    if (!syncUrl) throw new Error("VITE_PAYFLOW_URL não está configurada.");

    const { toPayflowSchoolCode, buildPayflowBankAccount } = await import(
      "./payflow-education-sync"
    );
    const { loadSchoolSettingsBundle } = await import("@/features/school/server");
    const { validateAngolaIban } = await import("@/lib/angola-banking");

    const db = await loadSgaAdminClient();
    const { data: schoolRow } = await db
      .from("schools")
      .select("id, tenant_id, name")
      .eq("id", membership.schoolId)
      .maybeSingle();
    const schoolName = typeof schoolRow?.name === "string" ? schoolRow.name : "Escola";
    const tenantId =
      typeof schoolRow?.tenant_id === "string" && schoolRow.tenant_id.trim()
        ? schoolRow.tenant_id.trim()
        : membership.schoolId;

    const settings = await loadSchoolSettingsBundle(db, membership.schoolId);
    const ibanCheck = validateAngolaIban(settings.banking.iban || "");
    if (!ibanCheck.ok) {
      throw new Error(
        ibanCheck.error ||
          "Configure um IBAN angolano válido em Definições → Financeiro antes de sincronizar.",
      );
    }

    const bank = buildPayflowBankAccount({
      schoolId: membership.schoolId,
      accountHolder: settings.banking.account_holder || schoolName,
      bankName: settings.banking.bank_name || "Banco",
      iban: ibanCheck.compact || settings.banking.iban,
      currency: settings.currency || "AOA",
    });
    if (!bank) {
      throw new Error("Dados bancários incompletos (titular, banco e IBAN).");
    }

    const payload = {
      ...bank,
      scope: "school" as const,
      school_id: membership.schoolId,
      school: {
        id: membership.schoolId,
        tenant_id: tenantId,
        code: toPayflowSchoolCode(membership.schoolId, schoolName),
        name: schoolName.slice(0, 160),
      },
    };

    const response = await fetch(syncUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => ({}))) as {
      data?: { id?: string; iban?: string; synced_at?: string };
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(
        body.error?.message ||
          `PayFlow recusou a sincronização da conta (HTTP ${response.status}).`,
      );
    }

    return {
      ok: true as const,
      accountId: body.data?.id ?? bank.id,
      ibanMasked: body.data?.iban ?? null,
      syncedAt: body.data?.synced_at ?? new Date().toISOString(),
    };
  });
