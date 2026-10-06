import { requireAal2 } from "@/features/hr/require-aal2";
import { createServerFn } from "@tanstack/react-start";
import { readSettingsDomain } from "@/features/school/settings-domains";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { reportSigaError } from "@/lib/ops-report";
import { dynamicTablesClient, sgaClient } from "@/integrations/supabase/sga";
import {
  loadSgaAdminClient,
  requireSgaWriterFor,
  requireSgaWriterForWrite,
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
// Só o schema (zod puro, sem dependências pesadas) entra estaticamente; o
// gerador de XML continua a ser carregado dinamicamente dentro do handler.
import { generateSaftInputSchema } from "./saft-generator";
import { invoiceNetTotal } from "./invoice-settlement";
import { lateFeeFor, paidOnIso, todayIso } from "./late-fee";
import {
  feeItemMatcher,
  gradeTuitionCode,
  isMissingGradeColumn,
  pickFeeItem,
  toFeeItemRow,
  type FeeItemRow,
} from "./fee-items";
import { insertFinanceArchive } from "@/features/arquivos/archive-finance-core";
import { stableDocumentCode } from "@/features/arquivos/document-code";
import { canWriteFileArea } from "@/features/arquivos/kinds";
import {
  DEFAULT_FEE_ITEMS,
  DEFAULT_FEE_PLAN_CODE,
  DEFAULT_FEE_PLAN_NAME,
} from "./fee-plan-defaults";
import {
  generateMulticaixaReference,
  resolveConfiguredSchoolEmisEntity,
  type MobileWalletPayment,
  isGatewayPaymentChannel,
  normalizePaymentReference,
} from "./emiss-multicaixa";
import { loadPersonNamesById } from "@/features/people/lookup";
import {
  invoiceDateInSaftPeriod,
  mapFinanceInvoiceToSaftItem,
  mapFinanceReceiptToSaftPayment,
  saftCertificationWarning,
  saftExportBlocked,
  saftPeriodBounds,
  validateSaftSchoolReadiness,
} from "./saft-export";
import { higherEdFeeCodeForCategory } from "@/features/higher-ed/fees";
import { schoolTodayIso } from "@/lib/school-date";
import {
  formatInvoiceNumber,
  invoiceYearForSchool,
  loadNextInvoiceSequence,
} from "./invoice-numbering";

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

/** Também usada pelos importadores (dividas/historico_financeiro) para escolher o item de taxa. */
export function categoryToFeeKind(category: string) {
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

/**
 * Desconto de irmãos: a escola configura a percentagem em Definições → Cobrança
 * (school_settings, domain "billing", campo sibling_discount_percent — ver
 * school/server.ts:174). Até aqui essa percentagem nunca era lida ao criar o
 * contrato financeiro, que gravava discount_percentage sempre a 0
 * (docs/auditoria/06-auditoria.md, achado P1).
 *
 * "Irmão" = outro aluno com matrícula activa na escola que partilha pelo menos
 * um encarregado (student_guardians.guardian_person_id) com o aluno da fatura.
 */
async function resolveSiblingDiscountPercent(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  schoolId: string,
  studentId: string,
): Promise<number> {
  const { data: guardians } = await db
    .from("student_guardians")
    .select("guardian_person_id")
    .eq("school_id", schoolId)
    .eq("student_id", studentId);
  const guardianIds = (guardians ?? [])
    .map((g) => g.guardian_person_id)
    .filter((id): id is string => Boolean(id));
  if (guardianIds.length === 0) return 0;

  const { data: siblingLinks } = await db
    .from("student_guardians")
    .select("student_id")
    .eq("school_id", schoolId)
    .in("guardian_person_id", guardianIds)
    .neq("student_id", studentId);
  const siblingIds = [...new Set((siblingLinks ?? []).map((s) => s.student_id))];
  if (siblingIds.length === 0) return 0;

  const { data: activeSibling } = await db
    .from("enrollments")
    .select("id")
    .eq("school_id", schoolId)
    .eq("status", "active")
    .in("student_id", siblingIds)
    .limit(1)
    .maybeSingle();
  if (!activeSibling) return 0;

  const billing = await readSettingsDomain(db, schoolId, "billing");
  return billing.sibling_discount_percent;
}

async function personIdForInvoice(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  schoolId: string,
  invoiceId: string,
) {
  const { data: invoice } = await db
    .from("finance_invoices")
    .select("id, invoice_number, amount, discount_amount, penalty_amount, contract_id")
    .eq("id", invoiceId)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (!invoice?.contract_id) {
    return {
      personId: null as string | null,
      studentNumber: null as string | null,
      invoiceNumber: invoice?.invoice_number ? String(invoice.invoice_number) : null,
      amount: invoice ? invoiceNetTotal(invoice) : 0,
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
      amount: invoiceNetTotal(invoice),
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
      amount: invoiceNetTotal(invoice),
    };
  }
  const student = await personIdForStudent(db, schoolId, String(enrollment.student_id));
  return {
    ...student,
    invoiceNumber: String(invoice.invoice_number ?? ""),
    amount: invoiceNetTotal(invoice),
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
        missingActiveFeePlan: true,
      };
    }
    const db = await loadSgaAdminClient();
    // `notification_preferences` saiu da verificação: a tabela já não existe na
    // produção (2026-09-28) e os gatilhos das faturas não dependem dela. A
    // verificação antiga dava a base como incompleta e bloqueava a emissão de
    // faturas em /faturas.
    const [{ error: penaltyError }, { error: cashExpensesError }, feePlanResult] =
      await Promise.all([
        db.from("finance_invoices").select("id, penalty_amount").limit(1),
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
      !feePlanResult.data?.id && (!feePlanError || !isMissingSgaTable(feePlanError)),
    );
    if (feePlanError && !isMissingSgaTable(feePlanError)) {
      throw publicDatabaseError(feePlanError, "Não foi possível validar o plano financeiro.");
    }
    return {
      ready: !missingPenaltyAmount && !missingActiveFeePlan,
      missingPenaltyAmount,
      missingCashExpenses: isMissingSgaTable(cashExpensesError),
      missingActiveFeePlan,
    };
  });

export const listFinanceStudents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => financeListInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterFor("financeiro", context.supabase, context.userId, [
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
            "id, amount, discount_amount, penalty_amount, due_date, status, competence_month, fee_item_id, contract_id, created_at",
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

    const today = schoolTodayIso();
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
      const amount = invoiceNetTotal(invoice);
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
    const membership = await requireSgaWriterFor("financeiro", context.supabase, context.userId, [
      "Administrador",
      "Tesouraria",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();

    const { data: invoices, error } = await db
      .from("finance_invoices")
      .select(
        "id, contract_id, fee_item_id, invoice_number, competence_month, amount, discount_amount, penalty_amount, due_date, status, created_at",
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
    // A multa que um pagamento registado hoje levaria (late-fee.ts): a tesouraria vê-a
    // antes de receber, em vez de a fatura ficar «parcial» depois.
    const billing = await readSettingsDomain(db, membership.schoolId, "billing");
    const today = todayIso();

    return (invoices ?? []).map(
      (invoice: {
        id: string;
        contract_id: string | null;
        fee_item_id: string | null;
        invoice_number: string;
        amount: number;
        discount_amount: number;
        penalty_amount: number;
        due_date: string;
        status: string;
        created_at: string;
      }) => {
        const contract = invoice.contract_id ? contractById.get(invoice.contract_id) : null;
        const enrollment = contract ? enrollmentById.get(contract.enrollment_id) : null;
        const student = enrollment ? studentById.get(enrollment.student_id) : null;
        const fee = invoice.fee_item_id ? feeById.get(invoice.fee_item_id) : null;
        const total = invoiceNetTotal(invoice);
        const paid = paidByInvoice.get(invoice.id) ?? 0;
        let status = mapInvoiceStatus(invoice.status);
        if (status !== "void" && paid > 0 && paid < total) status = "partial";
        if (status !== "void" && paid >= total && total > 0) status = "paid";
        const open = status !== "void" && status !== "paid";
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
          penalty_amount: Number(invoice.penalty_amount ?? 0),
          late_fee_today: {
            counter: open ? lateFeeFor(invoice, billing, today, "counter") : 0,
            electronic: open ? lateFeeFor(invoice, billing, today, "electronic") : 0,
          },
          status,
        };
      },
    );
  });

export const listCashEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => financeListInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterFor("financeiro", context.supabase, context.userId, [
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
    const membership = await requireSgaWriterForWrite(
      "financeiro",
      context.supabase,
      context.userId,
      ["Administrador", "Tesouraria"],
    );
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
      paid_on: paidOnIso(data.paidAt),
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

const paymentReferenceInputSchema = z.object({
  invoiceId: z.string().uuid(),
  /** Sem valor, a referência é do que falta pagar (com a multa de um pagamento hoje). */
  amount: z.number().positive().max(100_000_000).optional(),
});

export const generateInvoicePaymentReference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => paymentReferenceInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const membership = await requireSgaWriterForWrite(
      "financeiro",
      context.supabase,
      context.userId,
      ["Administrador", "Tesouraria", "Secretaria"],
    );
    const db = await loadSgaAdminClient();
    const { data: invoice, error: invoiceError } = await db
      .from("finance_invoices")
      .select("id, status, amount, discount_amount, penalty_amount, due_date")
      .eq("id", data.invoiceId)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (invoiceError) {
      throw publicDatabaseError(invoiceError, "Não foi possível validar a fatura.");
    }
    if (!invoice?.id) throw new Error("Fatura não encontrada nesta escola.");
    if (invoice.status === "paid" || invoice.status === "cancelled") {
      throw new Error("Esta fatura já não tem valor por pagar.");
    }
    const { data: receipts } = await db
      .from("finance_receipts")
      .select("amount")
      .eq("school_id", membership.schoolId)
      .eq("invoice_id", data.invoiceId)
      .eq("status", "issued");
    const alreadyPaid = (receipts ?? []).reduce(
      (sum: number, r: { amount: unknown }) => sum + Number(r.amount || 0),
      0,
    );
    // A referência é paga electronicamente: se hoje já é depois da tolerância, a liquidação
    // (webhook ou confirmação manual) aplica a multa, e a referência tem de a incluir.
    const billing = await readSettingsDomain(db, membership.schoolId, "billing");
    const lateFee = lateFeeFor(invoice, billing, todayIso(), "electronic");
    const due = Math.round((invoiceNetTotal(invoice) + lateFee - alreadyPaid) * 100) / 100;
    if (due <= 0.009) throw new Error("Esta fatura já não tem valor por pagar.");
    const amount = data.amount ?? due;
    if (amount > due + 0.01) {
      throw new Error(`O valor é maior do que o que falta pagar (${due.toFixed(2)} Kz).`);
    }

    // Sem a entidade EMIS da escola configurada não há referência: nunca uma
    // entidade de exemplo, que podia levar o encarregado a pagar a outra pessoa.
    const emisEntity = await resolveConfiguredSchoolEmisEntity(db, membership.schoolId);
    if (!emisEntity) {
      throw new Error(
        "A entidade EMIS da escola não está configurada. Defina-a em Definições → Integrações → Multicaixa antes de gerar referências.",
      );
    }
    const mcx = generateMulticaixaReference(emisEntity, data.invoiceId, amount);
    return {
      multicaixa: mcx,
      /** Multa por atraso incluída no valor (0 quando não há). */
      lateFee,
      // Só carteiras configuradas pela escola; nenhuma está ainda — nunca dados de exemplo.
      mobileWallets: [] as MobileWalletPayment[],
      emisEntity,
    };
  });

/**
 * Confirmação manual de um pagamento por referência Multicaixa/carteira móvel.
 * Não existe integração real com um webhook EMIS — quem chama esta função está a
 * atestar que viu o comprovativo do pagamento. Continua gated a Administrador/Tesouraria.
 */
const confirmManualPaymentInputSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.number().positive().max(100_000_000),
  reference: z.string().trim().min(3).max(40),
  method: z.string().trim().max(40).optional(),
});

export const confirmManualMulticaixaPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => confirmManualPaymentInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const membership = await requireSgaWriterForWrite(
      "financeiro",
      context.supabase,
      context.userId,
      ["Administrador", "Tesouraria"],
    );

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
    // O pagamento já está registado e repetir podia duplicá-lo: não se lança,
    // mas um plano que fica "pendente" com a fatura paga tem de ficar visível.
    for (const [column, value] of [
      ["invoice_id", data.invoiceId],
      ["reference", normRef],
    ] as const) {
      const { error: planError } = await db
        .from("finance_payment_plans")
        .update({ status: "settled", updated_at: new Date().toISOString() })
        .eq("school_id", membership.schoolId)
        .eq(column, value)
        .in("status", ["pending_gateway", "scheduled"]);
      if (planError) {
        reportSigaError("finance.payment_plan.settle_failed", planError, {
          school_id: membership.schoolId,
          invoice_id: data.invoiceId,
          by: column,
        });
      }
    }

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
    requireAal2(context.claims, "Esta operação financeira");
    const membership = await requireSgaWriterForWrite(
      "financeiro",
      context.supabase,
      context.userId,
      ["Administrador", "Tesouraria"],
    );
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

    const { data: updated, error } = await db
      .from("finance_invoices")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancelled_by: context.userId,
        cancellation_reason: data.reason ?? null,
      })
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
    const membership = await requireSgaWriterForWrite(
      "financeiro",
      context.supabase,
      context.userId,
      ["Administrador", "Tesouraria", "Secretaria"],
    );
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
      .select("id, discount_percentage")
      .eq("enrollment_id", enrollment.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (!contract) {
      const siblingDiscountPercent = await resolveSiblingDiscountPercent(
        db,
        membership.schoolId,
        data.studentId,
      );
      const { data: createdContract, error: contractError } = await db
        .from("finance_contracts")
        .insert({
          school_id: membership.schoolId,
          enrollment_id: enrollment.id,
          fee_plan_id: plan.id,
          discount_percentage: siblingDiscountPercent,
          status: "active",
          created_by: context.userId,
        })
        .select("id, discount_percentage")
        .single();
      if (contractError) {
        throw publicDatabaseError(contractError, "Não foi possível criar o contrato financeiro.");
      }
      contract = createdContract;
    }
    const contractDiscountPercent = Number(contract.discount_percentage ?? 0);

    // Classe do aluno (pela turma): a propina e a matrícula usam o preço da classe, se a
    // escola o definiu; senão o preço geral (fee-items.ts).
    const { data: classGroup } = enrollment.class_group_id
      ? await db
          .from("class_groups")
          .select("grade_level_id")
          .eq("school_id", membership.schoolId)
          .eq("id", enrollment.class_group_id)
          .maybeSingle()
      : { data: null };
    const gradeLevelId = classGroup?.grade_level_id ? String(classGroup.grade_level_id) : null;

    // Emolumento do Ensino Superior: o item certo pelo código, não o primeiro activo.
    const feeCode = higherEdFeeCodeForCategory(data.category);
    const kind = feeCode ? null : categoryToFeeKind(data.category);
    // `select("*")`: a coluna da classe só existe depois de 20261005150000.
    const { data: itemRows, error: itemsError } = await db
      .from("fee_items")
      .select("*")
      .eq("school_id", membership.schoolId)
      .eq("fee_plan_id", plan.id)
      .eq("is_active", true);
    if (itemsError) {
      throw publicDatabaseError(itemsError, "Não foi possível ler o plano de propinas.");
    }
    const feeItem = pickFeeItem(
      (itemRows ?? []).map((row) => toFeeItemRow(row as Record<string, unknown>)),
      feeItemMatcher({ feeCode, kind }),
      kind ? gradeLevelId : null,
    );
    if (!feeItem) {
      throw new Error(
        feeCode
          ? "Este emolumento ainda não está definido. Defina o valor em Ensino Superior → Emolumentos."
          : "Não há item de taxa activo para esta categoria.",
      );
    }
    // Sem valor escrito, o preço do item (o da classe, se houver).
    const amount = data.amount ?? feeItem.amount;
    if (!(amount > 0)) {
      throw new Error(
        "Indique o valor: esta categoria ainda não tem preço no plano de propinas (Definições › Cobrança).",
      );
    }
    const discountAmount =
      contractDiscountPercent > 0
        ? Math.round(((amount * contractDiscountPercent) / 100) * 100) / 100
        : 0;

    const competenceMonth = (data.issuedOn ?? schoolTodayIso()).slice(0, 7) + "-01";

    // Número gerado pelo servidor (nunca pelo cliente) para nunca aceitar texto livre
    // (ex.: nº de processo do aluno colado por engano) na numeração fiscal FT-AAAA/NNNN.
    const invoiceYear = invoiceYearForSchool();
    let sequence = await loadNextInvoiceSequence(db, membership.schoolId, invoiceYear);

    let invoice: Record<string, unknown> | null = null;
    let invoiceNumber = "";
    let error: { code?: string; message: string } | null = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      invoiceNumber = formatInvoiceNumber(invoiceYear, sequence);
      const result = await db
        .from("finance_invoices")
        .insert({
          school_id: membership.schoolId,
          contract_id: contract.id,
          fee_item_id: feeItem.id,
          invoice_number: invoiceNumber,
          competence_month: competenceMonth,
          amount,
          discount_amount: discountAmount,
          penalty_amount: 0,
          due_date: data.dueOn,
          status: "open",
          issued_by: context.userId,
        })
        .select("*")
        .single();
      if (!result.error) {
        invoice = result.data;
        error = null;
        break;
      }
      error = result.error;
      if (result.error.code === "23505") {
        sequence += 1;
        continue;
      }
      break;
    }
    if (error) {
      if (/penalty_amount/i.test(error.message)) {
        throw new Error(
          "A base SGA precisa da coluna finance_invoices.penalty_amount. No SQL Editor do projecto xodgfmxiaunpamctfeea execute supabase/APPLY_IN_SQL_EDITOR.sql.",
        );
      }
      throw publicDatabaseError(error, "Não foi possível emitir a fatura.");
    }
    if (!invoice) throw new Error("Não foi possível emitir a fatura.");

    const student = await personIdForStudent(db, membership.schoolId, data.studentId);
    const documentCode = stableDocumentCode("fatura", String(invoice.id ?? invoiceNumber));
    const archived = await archiveFinanceQuietly(db, {
      schoolId: membership.schoolId,
      userId: context.userId,
      role: membership.appRole,
      category: "fatura",
      title: `Fatura ${invoiceNumber}`,
      description: `Fatura escolar ${invoiceNumber} (${data.category}). ${data.description?.trim() || "Documento de cobrança arquivado na biblioteca."} Processo ${student.studentNumber ?? "—"}.`,
      relatedPersonId: student.personId,
      sourceLabel: invoiceNumber,
      amountLabel: formatAmountKz(amount),
      documentCode,
    });

    const { queuePayflowStudentSyncBestEffort } = await import("./payflow-sync-execute");
    queuePayflowStudentSyncBestEffort({
      schoolId: membership.schoolId,
      studentId: data.studentId,
    });

    return {
      ...invoice,
      invoice_number: invoiceNumber,
      /** Valor da fatura: o escrito ou o preço do plano (o da classe do aluno). */
      amount,
      library_document_code: archived?.documentCode ?? documentCode,
      library_file_id: archived?.fileId ?? null,
    };
  });

export const recordCashExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => recordCashExpenseInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    requireAal2(context.claims, "Esta operação financeira");
    const membership = await requireSgaWriterForWrite(
      "financeiro",
      context.supabase,
      context.userId,
      ["Administrador", "Tesouraria"],
    );
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
    requireAal2(context.claims, "Esta operação financeira");
    const membership = await requireSgaWriterForWrite(
      "financeiro",
      context.supabase,
      context.userId,
      ["Administrador", "Tesouraria"],
    );
    const db = await loadSgaAdminClient();

    // Saber primeiro de que tipo é o movimento, para não confundir "não é um recibo" com
    // "recibo já estornado" — a RPC devolve a mesma mensagem nos dois casos.
    const { data: existente, error: leituraError } = await db
      .from("finance_receipts")
      .select("id, status")
      .eq("id", data.cashEntryId)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (leituraError) {
      throw publicDatabaseError(leituraError, "Não foi possível localizar o lançamento.");
    }

    if (existente?.id) {
      // Do main: sem isto, estornar duas vezes devolvia a mensagem genérica da RPC e
      // ninguém percebia que o recibo já tinha sido anulado. A RPC continua a ser a
      // guarda a sério — esta verificação é só para a mensagem ser útil.
      if (existente.status === "reversed") {
        throw new Error("Este recibo já foi estornado.");
      }
      const { data: receipt, error } = await context.supabase.rpc("siga_reverse_finance_receipt", {
        p_school_id: membership.schoolId,
        p_receipt_id: data.cashEntryId,
        p_reason: data.reason,
      });
      if (error)
        throw publicDatabaseError(
          error,
          "Não foi possível estornar o recibo. O lançamento permanece inalterado.",
        );
      return receipt;
    }

    // Uma saída de caixa que pagou um salário não se anula aqui: o salário
    // ficava «pago» com o dinheiro devolvido ao caixa, e a ordem e a folha
    // diziam o contrário do caixa.
    const { data: payrollLink, error: payrollLinkError } = await db
      .from("hr_payroll_payment_items")
      .select("id, status")
      .eq("school_id", membership.schoolId)
      .eq("cash_expense_id", data.cashEntryId)
      .limit(1)
      .maybeSingle();
    if (payrollLinkError && !isMissingSgaTable(payrollLinkError)) {
      throw publicDatabaseError(payrollLinkError, "Não foi possível verificar a despesa.");
    }
    if (payrollLink?.id) {
      throw new Error(
        "Esta saída pagou um salário e não se anula no caixa: a folha continuaria a dar o salário como pago. Anule-a em Recursos Humanos → Pagamentos («Anular pagamento»): a saída, o salário e a folha voltam atrás juntos.",
      );
    }

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
    requireAal2(context.claims, "Esta operação financeira");
    const membership = await requireSgaWriterForWrite(
      "financeiro",
      context.supabase,
      context.userId,
      ["Administrador", "Tesouraria"],
    );
    const db = await loadSgaAdminClient();

    let reference = data.reference?.trim() || null;
    let amountDue: number | null = null;
    if (data.invoiceId) {
      const { data: invoiceRow, error: invoiceError } = await db
        .from("finance_invoices")
        // `total_amount` não existe em `finance_invoices` (as colunas são
        // `amount`, `discount_amount` e `penalty_amount`).
        .select("id, amount, discount_amount, penalty_amount, due_date, status")
        .eq("id", data.invoiceId)
        .eq("school_id", membership.schoolId)
        .maybeSingle();
      if (invoiceError)
        throw publicDatabaseError(invoiceError, "Não foi possível validar a fatura.");
      if (!invoiceRow) throw new Error("Fatura não encontrada nesta escola.");
      if (invoiceRow.status === "paid" || invoiceRow.status === "cancelled") {
        throw new Error("Esta fatura já não tem valor por pagar.");
      }
      // A referência é do que falta pagar, não do total da fatura.
      const { data: receipts } = await db
        .from("finance_receipts")
        .select("amount")
        .eq("school_id", membership.schoolId)
        .eq("invoice_id", data.invoiceId)
        .eq("status", "issued");
      const paid = (receipts ?? []).reduce(
        (sum: number, row: { amount: unknown }) => sum + Number(row.amount || 0),
        0,
      );
      // Paga-se por referência (electrónico): inclui a multa de um pagamento hoje.
      const billing = await readSettingsDomain(db, membership.schoolId, "billing");
      const lateFee = lateFeeFor(invoiceRow, billing, todayIso(), "electronic");
      amountDue = Math.max(
        Math.round((invoiceNetTotal(invoiceRow) + lateFee - paid) * 100) / 100,
        0,
      );
    }
    if (data.studentId) {
      const { data: studentRow, error: studentError } = await db
        .from("students")
        .select("id")
        .eq("id", data.studentId)
        .eq("school_id", membership.schoolId)
        .maybeSingle();
      if (studentError)
        throw publicDatabaseError(studentError, "Não foi possível validar o aluno.");
      if (!studentRow) throw new Error("Aluno não encontrado nesta escola.");
    }
    if (!reference && data.invoiceId && isGatewayPaymentChannel(data.channel) && amountDue) {
      // Nunca uma entidade de exemplo: sem a entidade EMIS da escola, não há referência.
      const emisEntity = await resolveConfiguredSchoolEmisEntity(db, membership.schoolId);
      if (!emisEntity) {
        throw new Error(
          "A entidade EMIS da escola não está configurada. Defina-a em Definições → Integrações → Multicaixa, ou indique a referência.",
        );
      }
      const generated = generateMulticaixaReference(emisEntity, data.invoiceId, amountDue);
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
      // A referência gerada (Multicaixa) também vai no talão, não só a escrita à mão.
      description: `Talão de plano de pagamento (${channelLabel}, ${data.installments} prestação(ões)). Referência ${reference ?? "—"}. Processo ${studentNumber ?? "—"}. Arquivado automaticamente.`,
      relatedPersonId: personId,
      sourceLabel: reference ?? plan.id,
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
    const membership = await requireSgaWriterFor("financeiro", context.supabase, context.userId, [
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
    const membership = await requireSgaWriterFor("financeiro", context.supabase, context.userId, [
      "Administrador",
      "Tesouraria",
    ]);
    const db = await loadSgaAdminClient();
    let query = db
      .from("finance_gateway_webhook_events")
      .select("id, created_at, ok, http_status, channel, message, reference, invoice_id, amount")
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

/** Estados de um plano que ainda se podem cancelar (os mesmos que a liquidação fecha). */
const CANCELLABLE_PLAN_STATUSES = ["pending_gateway", "scheduled"];

export const cancelPaymentPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => cancelPaymentPlanInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    requireAal2(context.claims, "Esta operação financeira");
    const membership = await requireSgaWriterForWrite(
      "financeiro",
      context.supabase,
      context.userId,
      ["Administrador", "Tesouraria"],
    );
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
    // Só cancela o que ainda está por liquidar: se o pagamento for confirmado entre a
    // leitura acima e esta escrita, um plano «settled» não pode voltar a «cancelled».
    const { data: plan, error } = await db
      .from("finance_payment_plans")
      .update({
        status: "cancelled",
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.planId)
      .eq("school_id", membership.schoolId)
      .in("status", CANCELLABLE_PLAN_STATUSES)
      .select("id, status")
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível cancelar o plano.");
    if (!plan) {
      throw new Error("O plano mudou entretanto (liquidado ou cancelado). Actualize a lista.");
    }
    return plan;
  });

export type FeePlanItemSummary = {
  id: string;
  name: string;
  kind: string;
  amount: number;
  is_active: boolean;
  /** Preço de uma classe (null = preço geral). */
  grade_level_id: string | null;
};

/** Classe com o preço da propina dela (null = usa a propina geral). */
export type GradeTuitionPrice = {
  grade_level_id: string;
  name: string;
  program: string | null;
  amount: number | null;
};

/** A coluna fee_items.grade_level_id existe (migração 20261005150000 aplicada)? */
async function gradePricingAvailable(db: Awaited<ReturnType<typeof loadSgaAdminClient>>) {
  const { error } = await dynamicTablesClient(db)
    .from("fee_items")
    .select("grade_level_id")
    .limit(1);
  if (!error) return true;
  if (isMissingSgaTable(error) || isMissingGradeColumn(error)) return false;
  throw publicDatabaseError(error, "Não foi possível ler o plano de propinas.");
}

/** As classes activas da escola, com o curso, para os preços por classe. */
async function loadGradeLevels(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  schoolId: string,
) {
  const [{ data: grades, error }, { data: programs }] = await Promise.all([
    db
      .from("grade_levels")
      .select("id, name, program_id, sequence")
      .eq("school_id", schoolId)
      .eq("is_active", true)
      .order("sequence"),
    db.from("programs").select("id, name").eq("school_id", schoolId),
  ]);
  if (error) throw publicDatabaseError(error, "Não foi possível carregar as classes.");
  const programName = new Map((programs ?? []).map((row) => [String(row.id), String(row.name)]));
  return (grades ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    program: row.program_id ? (programName.get(String(row.program_id)) ?? null) : null,
  }));
}

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

  // `select("*")`: a coluna da classe só existe depois de 20261005150000.
  const { data: items, error: itemsError } = await db
    .from("fee_items")
    .select("*")
    .eq("school_id", schoolId)
    .eq("fee_plan_id", plan.id)
    .order("kind");
  if (itemsError && !isMissingSgaTable(itemsError)) {
    throw publicDatabaseError(itemsError, "Não foi possível carregar os itens de taxa.");
  }
  const rows: FeeItemRow[] = (items ?? []).map((row) =>
    toFeeItemRow(row as Record<string, unknown>),
  );
  const gradePricing = await gradePricingAvailable(db);
  const grades = gradePricing ? await loadGradeLevels(db, schoolId) : [];
  const gradePrices: GradeTuitionPrice[] = grades.map((grade) => {
    const item = rows.find(
      (row) => row.is_active && row.kind === "tuition" && row.grade_level_id === grade.id,
    );
    return {
      grade_level_id: grade.id,
      name: grade.name,
      program: grade.program,
      amount: item ? item.amount : null,
    };
  });

  return {
    ready: true,
    plan: { id: plan.id as string, name: String(plan.name), status: String(plan.status) },
    // O resumo e o formulário mostram os preços gerais; os das classes vêm em gradePrices.
    items: rows
      .filter((row) => !row.grade_level_id)
      .map((row) => ({
        id: row.id,
        name: row.name,
        kind: row.kind,
        amount: row.amount,
        is_active: row.is_active,
        grade_level_id: null,
      })),
    /** false até a migração 20261005150000 ser aplicada. */
    gradePricing,
    gradePrices,
  };
}

export const listFeePlanSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await requireSgaWriterFor("financeiro", context.supabase, context.userId, [
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
    const membership = await requireSgaWriterForWrite(
      "financeiro",
      context.supabase,
      context.userId,
      ["Administrador", "Tesouraria"],
    );
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
      // fee_plans.academic_year_id é NOT NULL: sem o resolver aqui o insert
      // rebentava com 23502 e o painel voltava ao estado inicial sem dizer
      // porquê — o plano de propinas nunca chegava a ser criado.
      const { data: activeYear, error: yearErr } = await db
        .from("academic_years")
        .select("id")
        .eq("school_id", membership.schoolId)
        .eq("status", "active")
        .order("starts_on", { ascending: false })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (yearErr) throw publicDatabaseError(yearErr, "Não foi possível resolver o ano lectivo.");
      if (!activeYear?.id) {
        throw new Error(
          "Defina primeiro o ano lectivo da escola (Calendário Lectivo → «Definir ano lectivo»). O plano de propinas pertence a um ano lectivo.",
        );
      }

      const { data: created, error: createErr } = await db
        .from("fee_plans")
        .insert({
          school_id: membership.schoolId,
          academic_year_id: activeYear.id,
          code: DEFAULT_FEE_PLAN_CODE,
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

    // `code` e `frequency` são NOT NULL sem default em fee_items — sem eles o
    // insert falhava com 23502 e o painel não criava nenhuma propina.
    const desired = [
      {
        kind: "tuition",
        code: "TUITION",
        frequency: "monthly",
        name: "Propina mensal",
        amount: data.tuitionAmount,
      },
      {
        kind: "enrollment",
        code: "ENROLLMENT",
        frequency: "once",
        name: "Taxa de matrícula",
        amount: data.enrollmentAmount,
      },
    ] as const;

    // O preço geral é o item sem classe: os preços das classes (mesmo tipo) não contam.
    const { data: planItemRows, error: planItemsError } = await db
      .from("fee_items")
      .select("*")
      .eq("school_id", membership.schoolId)
      .eq("fee_plan_id", planId);
    if (planItemsError) {
      throw publicDatabaseError(planItemsError, "Não foi possível ler os itens de taxa.");
    }
    const planItems = (planItemRows ?? []).map((row) =>
      toFeeItemRow(row as Record<string, unknown>),
    );
    for (const item of desired) {
      const existingItem =
        planItems.find((row) => row.kind === item.kind && !row.grade_level_id && row.is_active) ??
        planItems.find((row) => row.kind === item.kind && !row.grade_level_id) ??
        null;

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
          code: item.code,
          name: item.name,
          kind: item.kind,
          frequency: item.frequency,
          amount: item.amount,
          is_active: true,
        });
        if (error) throw publicDatabaseError(error, "Não foi possível criar o item de taxa.");
      }
    }

    return loadFeePlanSettingsForSchool(membership.schoolId);
  });

const gradeTuitionPricesInputSchema = z.object({
  prices: z
    .array(
      z.object({
        gradeLevelId: z.string().uuid(),
        /** null ou vazio: a classe deixa de ter preço próprio e usa a propina geral. */
        amount: z.number().positive().max(999_999_999_999.99).nullable(),
      }),
    )
    .max(500),
});

/**
 * Preço da propina por classe no plano activo: cria, actualiza ou desliga o item de cada
 * classe (o histórico das faturas fica, porque o item não se apaga).
 */
export const saveGradeTuitionPrices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => gradeTuitionPricesInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "financeiro",
      context.supabase,
      context.userId,
      ["Administrador", "Tesouraria"],
    );
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;
    if (!(await gradePricingAvailable(db))) {
      throw new Error(
        "Os preços por classe ainda não estão disponíveis nesta base: falta aplicar docs/agents/SIGA_aplicar_propina_por_classe.sql.",
      );
    }
    const { data: plan } = await db
      .from("fee_plans")
      .select("id")
      .eq("school_id", schoolId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (!plan?.id) throw new Error("Active primeiro o plano de propinas (propina geral).");

    const grades = new Map(
      (await loadGradeLevels(db, schoolId)).map((grade) => [grade.id, grade] as const),
    );
    const { data: itemRows, error: itemsError } = await db
      .from("fee_items")
      .select("*")
      .eq("school_id", schoolId)
      .eq("fee_plan_id", plan.id)
      .eq("kind", "tuition");
    if (itemsError) throw publicDatabaseError(itemsError, "Não foi possível ler os preços.");
    const items = (itemRows ?? []).map((row) => toFeeItemRow(row as Record<string, unknown>));
    const table = dynamicTablesClient(db);

    for (const price of data.prices) {
      const grade = grades.get(price.gradeLevelId);
      if (!grade) throw new Error("Classe não encontrada nesta escola.");
      const existing = items.find((item) => item.grade_level_id === price.gradeLevelId) ?? null;
      if (price.amount === null) {
        if (existing?.is_active) {
          const { error } = await db
            .from("fee_items")
            .update({ is_active: false })
            .eq("school_id", schoolId)
            .eq("id", existing.id);
          if (error) throw publicDatabaseError(error, "Não foi possível retirar o preço.");
        }
        continue;
      }
      const name = `Propina mensal — ${grade.name}${grade.program ? ` (${grade.program})` : ""}`;
      const { error } = existing
        ? await db
            .from("fee_items")
            .update({ amount: price.amount, name: name.slice(0, 120), is_active: true })
            .eq("school_id", schoolId)
            .eq("id", existing.id)
        : await table.from("fee_items").insert({
            school_id: schoolId,
            fee_plan_id: plan.id,
            code: gradeTuitionCode(price.gradeLevelId),
            name: name.slice(0, 120),
            kind: "tuition",
            frequency: "monthly",
            amount: price.amount,
            is_active: true,
            grade_level_id: price.gradeLevelId,
          });
      if (error) throw publicDatabaseError(error, "Não foi possível guardar o preço da classe.");
    }
    return loadFeePlanSettingsForSchool(schoolId);
  });

export const exportSaftAoXml = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => generateSaftInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriterFor("financeiro", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
      "Tesouraria",
    ]);
    const db = await loadSgaAdminClient();

    // Os dados fiscais da escola vivem na tabela `schools` (não há domínio
    // «school» em school_settings: lê-lo deixava a exportação sempre bloqueada).
    const [{ data: schoolRow }, { data: agtSetting }] = await Promise.all([
      db
        .from("schools")
        .select("name, nif, address, city, municipality")
        .eq("id", membership.schoolId)
        .maybeSingle(),
      db
        .from("school_settings")
        .select("value")
        .eq("school_id", membership.schoolId)
        .eq("domain", "agt")
        .maybeSingle(),
    ]);

    const agtVal = (agtSetting?.value as Record<string, unknown>) ?? {};
    const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    // Sem valores inventados: o que faltar fica vazio e aparece nos avisos.
    const schoolInfo = {
      nif: text(schoolRow?.nif),
      name: text(schoolRow?.name),
      address: text(schoolRow?.address),
      city: text(schoolRow?.city) || text(schoolRow?.municipality),
    };

    const readiness = validateSaftSchoolReadiness(schoolInfo);
    if (saftExportBlocked(readiness)) {
      throw new Error(
        readiness.find((issue) => issue.level === "error")?.message ?? "Exportação bloqueada.",
      );
    }

    type InvoiceRow = {
      id: string;
      contract_id: string | null;
      fee_item_id: string | null;
      invoice_number: string;
      amount: number;
      discount_amount: number;
      status: string;
      created_at: string;
      cancelled_at: string | null;
    };
    type ReceiptRow = {
      id: string;
      invoice_id: string | null;
      receipt_number: string | null;
      amount: number;
      paid_on: string | null;
      payment_method: string | null;
      status: string;
      reversed_at: string | null;
      created_at: string | null;
    };
    const invoiceColumns =
      "id, contract_id, fee_item_id, invoice_number, amount, discount_amount, status, created_at, cancelled_at";

    const period = saftPeriodBounds(data);
    const [{ data: invoiceRows, error }, { data: receiptRows, error: receiptsError }] =
      await Promise.all([
        db
          .from("finance_invoices")
          .select(invoiceColumns)
          .eq("school_id", membership.schoolId)
          .gte("created_at", `${period.start}T00:00:00`)
          .lte("created_at", `${period.end}T23:59:59`)
          .order("created_at", { ascending: true }),
        db
          .from("finance_receipts")
          .select(
            "id, invoice_id, receipt_number, amount, paid_on, payment_method, status, reversed_at, created_at",
          )
          .eq("school_id", membership.schoolId)
          .gte("paid_on", period.start)
          .lte("paid_on", period.end)
          .order("paid_on", { ascending: true }),
      ]);

    if (error) {
      throw publicDatabaseError(error, "Não foi possível carregar as faturas para o SAFT-AO.");
    }
    if (receiptsError) {
      throw publicDatabaseError(
        receiptsError,
        "Não foi possível carregar os recibos para o SAFT-AO.",
      );
    }
    const invoices = (invoiceRows ?? []) as InvoiceRow[];
    const receipts = (receiptRows ?? []) as ReceiptRow[];

    // Recibos do período podem liquidar faturas emitidas antes: carregá-las
    // também (só para o número, a data e o aluno; não entram nas faturas).
    const invoiceById = new Map(invoices.map((row) => [row.id, row]));
    const missingInvoiceIds = [
      ...new Set(
        receipts
          .map((row) => row.invoice_id)
          .filter((id): id is string => Boolean(id) && !invoiceById.has(id as string)),
      ),
    ];
    if (missingInvoiceIds.length) {
      const { data: earlier } = await db
        .from("finance_invoices")
        .select(invoiceColumns)
        .eq("school_id", membership.schoolId)
        .in("id", missingInvoiceIds);
      for (const row of (earlier ?? []) as InvoiceRow[]) invoiceById.set(row.id, row);
    }
    const allInvoices = [...invoiceById.values()];

    const contractIds = [
      ...new Set(allInvoices.map((row) => row.contract_id).filter(Boolean)),
    ] as string[];
    const feeIds = [
      ...new Set(allInvoices.map((row) => row.fee_item_id).filter(Boolean)),
    ] as string[];

    const [{ data: contracts }, { data: feeItems }] = await Promise.all([
      contractIds.length
        ? db
            .from("finance_contracts")
            .select("id, enrollment_id")
            .eq("school_id", membership.schoolId)
            .in("id", contractIds)
        : Promise.resolve({ data: [] as Array<{ id: string; enrollment_id: string }> }),
      feeIds.length
        ? db
            .from("fee_items")
            .select("id, name")
            .eq("school_id", membership.schoolId)
            .in("id", feeIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    ]);

    const enrollmentIds = [
      ...new Set((contracts ?? []).map((row) => row.enrollment_id).filter(Boolean)),
    ];
    const { data: enrollments } = enrollmentIds.length
      ? await db
          .from("enrollments")
          .select("id, student_id")
          .eq("school_id", membership.schoolId)
          .in("id", enrollmentIds)
      : { data: [] as Array<{ id: string; student_id: string }> };

    const studentIds = [...new Set((enrollments ?? []).map((row) => row.student_id))];
    const students = studentIds.length
      ? await loadStudentDirectory(db, membership.schoolId, studentIds)
      : [];
    const studentById = new Map(students.map((row) => [row.student_id, row]));
    const enrollmentById = new Map((enrollments ?? []).map((row) => [row.id, row]));
    const contractById = new Map((contracts ?? []).map((row) => [row.id, row]));
    const feeById = new Map((feeItems ?? []).map((row) => [row.id, row]));

    const invoiceParty = (invoice: InvoiceRow | undefined) => {
      const contract = invoice?.contract_id ? contractById.get(invoice.contract_id) : null;
      const enrollment = contract ? enrollmentById.get(contract.enrollment_id) : null;
      const student = enrollment ? studentById.get(enrollment.student_id) : null;
      const fee = invoice?.fee_item_id ? feeById.get(invoice.fee_item_id) : null;
      return {
        customerName: student?.full_name ?? "Consumidor final",
        studentId: enrollment?.student_id ?? null,
        description: fee?.name ?? "Propinas e serviços escolares",
      };
    };

    const formattedInvoices = invoices
      .map((invoice) => {
        const party = invoiceParty(invoice);
        return mapFinanceInvoiceToSaftItem({
          id: invoice.id,
          invoice_number: invoice.invoice_number,
          created_at: invoice.created_at,
          amount: Number(invoice.amount ?? 0),
          discount_amount: Number(invoice.discount_amount ?? 0),
          status: invoice.status,
          cancelled_at: invoice.cancelled_at,
          description: party.description,
          customerName: party.customerName,
          studentId: party.studentId,
          fiscalYear: data.fiscalYear,
        });
      })
      .filter((item) => invoiceDateInSaftPeriod(item.date, period.start, period.end));

    const formattedPayments = receipts.map((receipt) => {
      const invoice = receipt.invoice_id ? invoiceById.get(receipt.invoice_id) : undefined;
      const party = invoiceParty(invoice);
      return mapFinanceReceiptToSaftPayment({
        ...receipt,
        amount: Number(receipt.amount ?? 0),
        customerName: party.customerName,
        studentId: party.studentId,
        description: party.description,
        sourceInvoiceNo: invoice?.invoice_number ?? null,
        sourceInvoiceDate: invoice?.created_at ?? null,
      });
    });

    const softwareCertificateNumber =
      typeof agtVal["software_certified"] === "string" && agtVal["software_certified"].trim()
        ? agtVal["software_certified"].trim()
        : undefined;

    const { buildSaftAoXml } = await import("./saft-generator");
    const xml = buildSaftAoXml(
      schoolInfo,
      formattedInvoices,
      { ...data, softwareCertificateNumber },
      formattedPayments,
    );

    const warnings = [
      saftCertificationWarning(softwareCertificateNumber),
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
      paymentCount: formattedPayments.length,
      warnings,
    };
  });

/** Abre o painel PayFlow /admin via SSO assinado (anti-replay no PayFlow). */
export const createPayflowAdminLaunch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterForWrite(
      "financeiro",
      context.supabase,
      context.userId,
      ["Administrador", "Tesouraria", "Secretaria"],
    );

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
    const membership = await requireSgaWriterForWrite(
      "financeiro",
      context.supabase,
      context.userId,
      ["Administrador", "Tesouraria", "Secretaria"],
    );
    const { executePayflowStudentSync } = await import("./payflow-sync-execute");
    return executePayflowStudentSync({
      schoolId: membership.schoolId,
      studentId: data.studentId,
    });
  });

/**
 * Sincroniza só a conta IBAN da escola para o PayFlow
 * (`POST /api/v1/bank-accounts/sync`, com upsert opcional da escola).
 */
export const syncSchoolBankToPayflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterForWrite(
      "financeiro",
      context.supabase,
      context.userId,
      ["Administrador", "Tesouraria"],
    );

    const apiKey = process.env.PAYFLOW_INTEGRATION_API_KEY?.trim() ?? "";
    if (apiKey.length < 24) {
      throw new Error(
        "PAYFLOW_INTEGRATION_API_KEY não está configurada no servidor SIGA (mín. 24 caracteres).",
      );
    }
    const { getPayflowUrl } = await import("@/lib/ecosystem-urls");
    const syncUrl = getPayflowUrl("/api/v1/bank-accounts/sync");
    if (!syncUrl) throw new Error("VITE_PAYFLOW_URL não está configurada.");

    const { toPayflowSchoolCode, buildPayflowBankAccount } =
      await import("./payflow-education-sync");
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
