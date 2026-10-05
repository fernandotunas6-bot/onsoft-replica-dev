import { normalizeNumber, normalizeText } from "../engine/normalize";
import {
  invoiceYearForSchool,
  loadNextInvoiceSequence,
} from "@/features/finance/invoice-numbering";
import type { AuditEntry, ImportRefCache, RowImporter } from "../engine/types";
import {
  loadAcademicYearRefs,
  loadStudentRefs,
  uniqueExactMatch,
  type AcademicYearRef,
  type StudentRef,
} from "./academic-core";
import {
  ensureFinanceContract,
  insertInvoiceWithNumber,
  loadEnrollmentFinanceRefs,
  loadFeeItemRefs,
  loadFeePlanRefs,
  registerReceiptDirect,
  resolveEnrollmentForStudent,
  resolveFeeItemForPlan,
  resolveFeePlanForYear,
  type EnrollmentFinanceRef,
  type FeeItemRef,
  type FeePlanRef,
} from "./finance-core";

type HistoricoFinanceiroCache = ImportRefCache & {
  students: StudentRef[];
  academicYears: AcademicYearRef[];
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

export const historicoFinanceiroImporter: RowImporter = {
  module: "historico_financeiro",

  async loadRefCache(ctx) {
    const [students, academicYears, enrollments, feePlans, feeItems, invoicesRes] =
      await Promise.all([
        loadStudentRefs(ctx.db, ctx.schoolId),
        loadAcademicYearRefs(ctx.db, ctx.schoolId),
        loadEnrollmentFinanceRefs(ctx.db, ctx.schoolId),
        loadFeePlanRefs(ctx.db, ctx.schoolId),
        loadFeeItemRefs(ctx.db, ctx.schoolId),
        ctx.db.from("finance_invoices").select("invoice_number").eq("school_id", ctx.schoolId),
      ]);

    const existingInvoiceNumbers = new Set(
      (invoicesRes.data ?? []).map((i) => normalizeText(i.invoice_number)).filter(Boolean),
    );
    const invoiceYear = invoiceYearForSchool();

    return {
      existingPeople: [],
      classGroups: [],
      studentByPersonId: new Map(),
      students,
      academicYears,
      enrollments,
      feePlans,
      feeItems,
      existingInvoiceNumbers,
      contractCache: new Map(),
      invoiceYear,
      // Continua a numeração da escola: começar em 1 colidia com as faturas do ano.
      invoiceSequence: await loadNextInvoiceSequence(ctx.db, ctx.schoolId, invoiceYear),
    } as HistoricoFinanceiroCache;
  },

  analyzeRow(normalized, rawCache) {
    const cache = rawCache as HistoricoFinanceiroCache;
    const errors: string[] = [];
    const warnings: string[] = [];

    const studentIdent = normalizeText(
      valueOf(normalized, "student_identifier", "aluno", "processo", "bi_aluno"),
    );
    const academicYearName = normalizeText(
      valueOf(normalized, "academic_year", "ano_lectivo", "ano"),
    );
    const totalBilled = normalizeNumber(
      valueOf(normalized, "total_billed", "total_faturado", "faturado"),
    );
    const totalPaid = normalizeNumber(valueOf(normalized, "total_paid", "total_pago", "liquidado"));

    if (!studentIdent) errors.push("Identificador do aluno (Nº Processo ou BI) é obrigatório.");
    if (!academicYearName) errors.push("Ano lectivo do balanço é obrigatório (ex.: 2025/2026).");
    if (totalBilled === null || totalBilled < 0) {
      errors.push("Total faturado no ano deve ser um número não negativo.");
    }
    if (totalPaid === null || totalPaid < 0) {
      errors.push("Total pago/liquidado deve ser um número não negativo.");
    }
    if (totalBilled !== null && totalPaid !== null && totalPaid > totalBilled + 0.01) {
      errors.push("Total pago não pode ser maior do que o total faturado.");
    }

    if (errors.length) return { status: "error", warnings, errors };

    const studentMatch = uniqueExactMatch(studentIdent, cache.students, [
      (s) => s.student_number,
      (s) => s.national_id,
    ]);
    if (studentMatch.ambiguous) {
      errors.push(`Identificador do aluno "${studentIdent}" é ambíguo; use o número exacto.`);
    } else if (!studentMatch.row) {
      errors.push(`Aluno "${studentIdent}" não encontrado no cadastro escolar.`);
    }

    const yearMatch = uniqueExactMatch(academicYearName, cache.academicYears, [(y) => y.name]);
    if (!yearMatch.row) {
      errors.push(`Ano lectivo "${academicYearName}" não está configurado nesta escola.`);
    }

    if (errors.length) return { status: "error", warnings, errors };

    const enrollment = resolveEnrollmentForStudent(
      studentMatch.row!.id,
      cache.enrollments,
      yearMatch.row!.id,
    );
    if (!enrollment) {
      errors.push(`Aluno não tem matrícula no ano lectivo "${academicYearName}".`);
    }

    const feePlan = resolveFeePlanForYear(cache.feePlans, yearMatch.row!.id);
    if (!feePlan) {
      errors.push(
        `Não há plano financeiro activo para o ano lectivo "${academicYearName}". Configure em Financeiro → Configurar Propinas.`,
      );
    }

    if (errors.length) return { status: "error", warnings, errors };

    const feeItem = resolveFeeItemForPlan(cache.feeItems, feePlan!.id, "mensalidade");
    if (!feeItem) {
      errors.push("Não há item de taxa activo no plano financeiro para lançar este histórico.");
      return { status: "error", warnings, errors };
    }

    if (totalBilled! > 0) {
      return { status: "valid", warnings, errors: [] };
    }
    warnings.push("Total faturado é zero; nenhuma fatura será criada para este aluno.");
    return { status: "warning", warnings, errors: [] };
  },

  async commitRow(normalized, ctx, rawCache) {
    const cache = rawCache as HistoricoFinanceiroCache;
    const analysis = this.analyzeRow(normalized, rawCache);
    if (analysis.status === "error") {
      return { status: "error", warnings: analysis.warnings, errors: analysis.errors, audits: [] };
    }

    const studentIdent = normalizeText(
      valueOf(normalized, "student_identifier", "aluno", "processo", "bi_aluno"),
    )!;
    const academicYearName = normalizeText(
      valueOf(normalized, "academic_year", "ano_lectivo", "ano"),
    );
    const totalBilled = normalizeNumber(
      valueOf(normalized, "total_billed", "total_faturado", "faturado"),
    )!;
    const totalPaid =
      normalizeNumber(valueOf(normalized, "total_paid", "total_pago", "liquidado")) ?? 0;

    if (totalBilled <= 0) {
      return {
        status: "ignored",
        warnings: analysis.warnings,
        errors: [],
        audits: [],
        target_record_id: null,
      };
    }

    const student = uniqueExactMatch(studentIdent, cache.students, [
      (s) => s.student_number,
      (s) => s.national_id,
    ]).row!;
    const academicYear = uniqueExactMatch(academicYearName, cache.academicYears, [
      (y) => y.name,
    ]).row!;
    const enrollment = resolveEnrollmentForStudent(student.id, cache.enrollments, academicYear.id)!;
    const feePlan = resolveFeePlanForYear(cache.feePlans, academicYear.id)!;
    const feeItem = resolveFeeItemForPlan(cache.feeItems, feePlan.id, "mensalidade")!;

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

    const dueDate = academicYear.ends_on || `${academicYear.name.slice(0, 4)}-12-31`;
    const competenceMonth = `${(academicYear.starts_on || dueDate).slice(0, 7)}-01`;

    let created;
    try {
      created = await insertInvoiceWithNumber(
        ctx.db,
        {
          school_id: ctx.schoolId,
          contract_id: contractId,
          fee_item_id: feeItem.id,
          competence_month: competenceMonth,
          amount: totalBilled,
          discount_amount: 0,
          due_date: dueDate,
          status: "open",
          issued_by: ctx.userId,
        },
        cache.invoiceYear,
        cache.invoiceSequence,
        null,
      );
    } catch (err) {
      return {
        status: "error",
        warnings: analysis.warnings,
        errors: [err instanceof Error ? err.message : "Erro ao gravar histórico financeiro."],
        audits: [],
      };
    }
    cache.invoiceSequence = created.nextSequence;
    cache.existingInvoiceNumbers.add(created.invoice_number);

    const audits: AuditEntry[] = [
      {
        table_name: "finance_invoices",
        target_id: created.id,
        action_type: "inserted",
        after_data: {
          school_id: ctx.schoolId,
          contract_id: contractId,
          invoice_number: created.invoice_number,
          amount: totalBilled,
        },
      },
    ];

    if (totalPaid > 0) {
      try {
        const receipt = await registerReceiptDirect(ctx.db, {
          schoolId: ctx.schoolId,
          invoiceId: created.id,
          invoiceAmount: totalBilled,
          amount: totalPaid,
          paymentMethod: "other",
          paidOn: dueDate,
          receivedBy: ctx.userId,
          receiptNumberHint: null,
        });
        audits.push({
          table_name: "finance_receipts",
          target_id: receipt.receiptId,
          action_type: "inserted",
          after_data: {
            school_id: ctx.schoolId,
            invoice_id: created.id,
            receipt_number: receipt.receiptNumber,
            amount: totalPaid,
          },
        });
      } catch (err) {
        return {
          status: "error",
          warnings: [
            ...analysis.warnings,
            `Fatura ${created.invoice_number} foi criada, mas o recibo de liquidação falhou.`,
          ],
          errors: [err instanceof Error ? err.message : "Erro ao registar liquidação histórica."],
          audits,
          target_record_id: created.id,
        };
      }
    }

    return {
      status: "imported",
      warnings: analysis.warnings,
      errors: [],
      audits,
      target_record_id: created.id,
    };
  },
};
