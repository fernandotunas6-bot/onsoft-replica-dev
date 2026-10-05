import { normalizeDate, normalizeMoney, normalizeText } from "../engine/normalize";
import type { ImportRefCache, RowImporter } from "../engine/types";
import { loadStudentRefs, uniqueExactMatch, type StudentRef } from "./academic-core";
import {
  ensureFinanceContract,
  insertInvoiceWithNumber,
  loadEnrollmentFinanceRefs,
  loadFeeItemRefs,
  loadFeePlanRefs,
  parseCompetenceMonth,
  resolveEnrollmentForStudent,
  resolveFeeItemForPlan,
  resolveFeePlanForYear,
  type EnrollmentFinanceRef,
  type FeeItemRef,
  type FeePlanRef,
} from "./finance-core";
import { schoolTodayIso } from "@/lib/school-date";

type DividasCache = ImportRefCache & {
  students: StudentRef[];
  enrollments: EnrollmentFinanceRef[];
  feePlans: FeePlanRef[];
  feeItems: FeeItemRef[];
  existingInvoiceNumbers: Set<string>;
  contractCache: Map<string, string>;
  invoiceYear: number;
  invoiceSequence: number;
};

function valueOf(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && normalizeText(value)) return value;
  }
  return null;
}

export const dividasImporter: RowImporter = {
  module: "dividas",

  async loadRefCache(ctx) {
    const [students, enrollments, feePlans, feeItems, invoiceRows] = await Promise.all([
      loadStudentRefs(ctx.db, ctx.schoolId),
      loadEnrollmentFinanceRefs(ctx.db, ctx.schoolId),
      loadFeePlanRefs(ctx.db, ctx.schoolId),
      loadFeeItemRefs(ctx.db, ctx.schoolId),
      ctx.db.from("finance_invoices").select("invoice_number").eq("school_id", ctx.schoolId),
    ]);

    if (invoiceRows.error) {
      throw new Error(`Não foi possível carregar faturas existentes: ${invoiceRows.error.message}`);
    }

    const existingInvoiceNumbers = new Set(
      (invoiceRows.data ?? []).map((r) => normalizeText(r.invoice_number)).filter(Boolean),
    );

    return {
      existingPeople: [],
      classGroups: [],
      studentByPersonId: new Map(),
      students,
      enrollments,
      feePlans,
      feeItems,
      existingInvoiceNumbers,
      contractCache: new Map(),
      invoiceYear: new Date().getFullYear(),
      invoiceSequence: 1,
    } as DividasCache;
  },

  analyzeRow(normalized, rawCache) {
    const cache = rawCache as DividasCache;
    const errors: string[] = [];
    const warnings: string[] = [];

    const studentIdent = normalizeText(
      valueOf(normalized, "student_identifier", "aluno", "processo", "bi_aluno"),
    );
    const amountVal = normalizeMoney(
      valueOf(normalized, "amount_due", "valor", "montante", "saldo"),
    );
    const invoiceNum = normalizeText(valueOf(normalized, "invoice_number", "fatura", "guia"));

    if (!studentIdent) errors.push("Identificador do aluno (Nº Processo ou BI) é obrigatório.");
    if (!amountVal || amountVal <= 0) {
      errors.push("Valor em dívida deve ser um número positivo em Kwanzas.");
    }

    if (errors.length) return { status: "error", warnings, errors };

    const studentMatch = uniqueExactMatch(studentIdent, cache.students, [
      (s) => s.student_number,
      (s) => s.national_id,
    ]);

    if (studentMatch.ambiguous) {
      errors.push(`Identificador do aluno "${studentIdent}" é ambíguo; use o número exacto.`);
    } else if (!studentMatch.row) {
      errors.push(`Aluno "${studentIdent}" não encontrado no sistema escolar.`);
    }

    if (errors.length) return { status: "error", warnings, errors };

    if (invoiceNum && cache.existingInvoiceNumbers.has(invoiceNum)) {
      return {
        status: "duplicate",
        warnings: [`Fatura nº "${invoiceNum}" já existe no sistema.`],
        errors: [],
        duplicate_of: invoiceNum,
      };
    }

    const enrollment = resolveEnrollmentForStudent(studentMatch.row!.id, cache.enrollments, null);
    if (!enrollment) {
      errors.push(
        "Este aluno ainda não tem matrícula activa. Atribua uma turma em Alunos antes de importar dívidas.",
      );
    }

    const feePlan = resolveFeePlanForYear(cache.feePlans, enrollment?.academic_year_id ?? null);
    if (!feePlan) {
      errors.push(
        "Não há plano financeiro activo na escola. Configure em Financeiro → Configurar Propinas antes de importar dívidas.",
      );
    }

    if (errors.length) return { status: "error", warnings, errors };

    const feeItem = feePlan
      ? resolveFeeItemForPlan(
          cache.feeItems,
          feePlan.id,
          valueOf(normalized, "month_ref", "mes", "referencia"),
        )
      : null;
    if (!feeItem) {
      errors.push("Não há item de taxa activo no plano financeiro para lançar esta dívida.");
      return { status: "error", warnings, errors };
    }

    return { status: warnings.length ? "warning" : "valid", warnings, errors: [] };
  },

  async commitRow(normalized, ctx, rawCache) {
    const cache = rawCache as DividasCache;
    const analysis = this.analyzeRow(normalized, rawCache);
    if (analysis.status === "error") {
      return { status: "error", warnings: analysis.warnings, errors: analysis.errors, audits: [] };
    }
    if (analysis.status === "duplicate") {
      return {
        status: "duplicate",
        warnings: analysis.warnings,
        errors: [],
        audits: [],
        target_record_id: analysis.duplicate_of,
      };
    }

    const studentIdent = normalizeText(
      valueOf(normalized, "student_identifier", "aluno", "processo", "bi_aluno"),
    )!;
    const amount = normalizeMoney(valueOf(normalized, "amount_due", "valor", "montante", "saldo"))!;
    const monthRef = valueOf(normalized, "month_ref", "mes", "referencia", "descricao");
    const dueDate =
      normalizeDate(valueOf(normalized, "due_date", "vencimento", "data_vencimento")) ||
      schoolTodayIso();
    const invoiceNum =
      normalizeText(valueOf(normalized, "invoice_number", "fatura", "guia")) || null;

    const student = uniqueExactMatch(studentIdent, cache.students, [
      (s) => s.student_number,
      (s) => s.national_id,
    ]).row!;
    const enrollment = resolveEnrollmentForStudent(student.id, cache.enrollments, null)!;
    const feePlan = resolveFeePlanForYear(cache.feePlans, enrollment.academic_year_id)!;
    const feeItem = resolveFeeItemForPlan(cache.feeItems, feePlan.id, monthRef)!;

    if (invoiceNum && cache.existingInvoiceNumbers.has(invoiceNum)) {
      return {
        status: "duplicate",
        warnings: analysis.warnings,
        errors: [],
        audits: [],
        target_record_id: invoiceNum,
      };
    }

    if (ctx.dryRun) {
      return {
        status: "will_insert",
        warnings: analysis.warnings,
        errors: [],
        audits: [],
        target_record_id: null,
      };
    }

    let contractId: string;
    try {
      contractId = await ensureFinanceContract(
        ctx.db,
        ctx.schoolId,
        enrollment.id,
        feePlan.id,
        ctx.userId,
        cache.contractCache,
      );
    } catch (err) {
      return {
        status: "error",
        warnings: analysis.warnings,
        errors: [err instanceof Error ? err.message : "Erro ao resolver contrato financeiro."],
        audits: [],
      };
    }

    // A competência é o mês a que a dívida respeita ("Janeiro 2026"), não o mês em que vence —
    // uma propina de Janeiro pode vencer em Fevereiro. É por este campo que o importador de
    // `pagamentos` casa o recibo com a fatura certa, por isso tem de respeitar o mês declarado.
    const competenceMonth = `${parseCompetenceMonth(monthRef) ?? dueDate.slice(0, 7)}-01`;

    let created;
    try {
      created = await insertInvoiceWithNumber(
        ctx.db,
        {
          school_id: ctx.schoolId,
          contract_id: contractId,
          fee_item_id: feeItem.id,
          competence_month: competenceMonth,
          amount,
          discount_amount: 0,
          due_date: dueDate,
          status: "open",
          issued_by: ctx.userId,
        },
        cache.invoiceYear,
        cache.invoiceSequence,
        invoiceNum,
      );
    } catch (err) {
      return {
        status: "error",
        warnings: analysis.warnings,
        errors: [err instanceof Error ? err.message : "Erro ao registar dívida."],
        audits: [],
      };
    }

    cache.invoiceSequence = created.nextSequence;
    cache.existingInvoiceNumbers.add(created.invoice_number);
    return {
      status: "imported",
      warnings: analysis.warnings,
      errors: [],
      audits: [
        {
          table_name: "finance_invoices",
          target_id: created.id,
          action_type: "inserted",
          after_data: {
            school_id: ctx.schoolId,
            contract_id: contractId,
            invoice_number: created.invoice_number,
            amount,
            due_date: dueDate,
          },
        },
      ],
      target_record_id: created.id,
    };
  },
};
