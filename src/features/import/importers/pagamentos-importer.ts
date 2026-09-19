import { normalizeDate, normalizeNumber, normalizeText } from "../engine/normalize";
import type { ImportRefCache, RowImporter } from "../engine/types";
import { loadStudentRefs, uniqueExactMatch, type StudentRef } from "./academic-core";
import {
  loadExistingReceiptNumbers,
  loadOpenInvoiceRefs,
  mapPaymentMethod,
  parseCompetenceMonth,
  registerReceiptDirect,
  type OpenInvoiceRef,
} from "./finance-core";

type PagamentosCache = ImportRefCache & {
  students: StudentRef[];
  openInvoices: OpenInvoiceRef[];
  existingReceiptNumbers: Set<string>;
};

function valueOf(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && normalizeText(value)) return value;
  }
  return null;
}

/**
 * Que fatura este pagamento liquida, por ordem de especificidade:
 *
 *   1. o nº de fatura indicado na folha — se não bater, é erro, não se adivinha outra;
 *   2. o mês de referência ("Fevereiro 2026") contra a competência da fatura;
 *   3. na falta dos dois, a mais antiga em aberto com saldo — a prática corrente de tesouraria.
 */
function resolveTargetInvoice(
  studentId: string,
  invoiceNumberHint: string | null,
  competenceMonthHint: string | null,
  invoices: OpenInvoiceRef[],
): { invoice: OpenInvoiceRef | null; wrongNumber: boolean; wrongMonth: boolean } {
  const forStudent = invoices.filter((row) => row.student_id === studentId && row.remaining > 0);

  if (invoiceNumberHint) {
    const match = forStudent.find((row) => row.invoice_number === invoiceNumberHint);
    return { invoice: match ?? null, wrongNumber: !match, wrongMonth: false };
  }

  if (competenceMonthHint) {
    const match = forStudent.find(
      (row) => row.competence_month?.slice(0, 7) === competenceMonthHint,
    );
    if (match) return { invoice: match, wrongNumber: false, wrongMonth: false };
    // Mês indicado mas sem fatura em aberto nesse mês: não liquidar outra por engano.
    return { invoice: null, wrongNumber: false, wrongMonth: true };
  }

  return { invoice: forStudent[0] ?? null, wrongNumber: false, wrongMonth: false };
}

export const pagamentosImporter: RowImporter = {
  module: "pagamentos",

  async loadRefCache(ctx) {
    const [students, openInvoices, existingReceiptNumbers] = await Promise.all([
      loadStudentRefs(ctx.db, ctx.schoolId),
      loadOpenInvoiceRefs(ctx.db, ctx.schoolId),
      loadExistingReceiptNumbers(ctx.db, ctx.schoolId),
    ]);

    return {
      existingPeople: [],
      classGroups: [],
      studentByPersonId: new Map(),
      students,
      openInvoices,
      existingReceiptNumbers,
    } as PagamentosCache;
  },

  analyzeRow(normalized, rawCache) {
    const cache = rawCache as PagamentosCache;
    const errors: string[] = [];
    const warnings: string[] = [];

    const studentIdent = normalizeText(
      valueOf(normalized, "student_identifier", "student_number", "aluno", "processo", "bi_aluno"),
    );
    const amountVal = normalizeNumber(valueOf(normalized, "amount", "valor", "montante"));
    const invoiceNum =
      normalizeText(valueOf(normalized, "invoice_number", "fatura", "guia")) || null;
    const receiptNum =
      normalizeText(valueOf(normalized, "receipt_number", "recibo", "comprovativo")) || null;

    if (!studentIdent) errors.push("Identificador do aluno (Nº Processo ou BI) é obrigatório.");
    if (!amountVal || amountVal <= 0) {
      errors.push("Valor do pagamento deve ser um número positivo em Kwanzas.");
    }

    if (errors.length) return { status: "error", warnings, errors };

    if (receiptNum && cache.existingReceiptNumbers.has(receiptNum)) {
      return {
        status: "duplicate",
        warnings: [`Recibo nº "${receiptNum}" já existe no sistema.`],
        errors: [],
        duplicate_of: receiptNum,
      };
    }

    const studentMatch = uniqueExactMatch(studentIdent, cache.students, [
      (s) => s.student_number,
      (s) => s.national_id,
    ]);

    if (studentMatch.ambiguous) {
      errors.push(`Identificador do aluno "${studentIdent}" é ambíguo; use o número exacto.`);
    } else if (!studentMatch.row) {
      errors.push(`Aluno "${studentIdent}" não encontrado nesta escola.`);
    }

    if (errors.length) return { status: "error", warnings, errors };

    const monthRef = valueOf(normalized, "month_ref", "mes", "referencia");
    const { invoice, wrongNumber, wrongMonth } = resolveTargetInvoice(
      studentMatch.row!.id,
      invoiceNum,
      parseCompetenceMonth(monthRef),
      cache.openInvoices,
    );
    if (!invoice) {
      if (wrongNumber) {
        errors.push(`Fatura nº "${invoiceNum}" não encontrada em aberto para este aluno.`);
      } else if (wrongMonth) {
        errors.push(
          `Este aluno não tem fatura em aberto para "${normalizeText(monthRef)}". Importe a dívida desse mês primeiro, ou indique o nº da fatura a liquidar.`,
        );
      } else {
        errors.push(
          "Este aluno não tem nenhuma fatura em aberto para aplicar este pagamento. Importe a dívida primeiro.",
        );
      }
      return { status: "error", warnings, errors };
    }
    if (amountVal! > invoice.remaining + 0.01) {
      errors.push(
        `Valor do pagamento (${amountVal}) excede o saldo em aberto da fatura ${invoice.invoice_number} (${invoice.remaining.toFixed(2)} Kz).`,
      );
      return { status: "error", warnings, errors };
    }

    return { status: warnings.length ? "warning" : "valid", warnings, errors: [] };
  },

  async commitRow(normalized, ctx, rawCache) {
    const cache = rawCache as PagamentosCache;
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
      valueOf(normalized, "student_identifier", "student_number", "aluno", "processo", "bi_aluno"),
    )!;
    const amount = normalizeNumber(valueOf(normalized, "amount", "valor", "montante"))!;
    const method = mapPaymentMethod(
      valueOf(normalized, "payment_method", "payment_channel", "forma_pagamento", "canal"),
    );
    const paidOn =
      normalizeDate(valueOf(normalized, "payment_date", "data_pagamento", "data")) ||
      new Date().toISOString().slice(0, 10);
    const invoiceNum =
      normalizeText(valueOf(normalized, "invoice_number", "fatura", "guia")) || null;
    const receiptHint = normalizeText(
      valueOf(normalized, "receipt_number", "recibo", "comprovativo"),
    );

    const student = uniqueExactMatch(studentIdent, cache.students, [
      (s) => s.student_number,
      (s) => s.national_id,
    ]).row!;
    const { invoice } = resolveTargetInvoice(
      student.id,
      invoiceNum,
      parseCompetenceMonth(valueOf(normalized, "month_ref", "mes", "referencia")),
      cache.openInvoices,
    );
    if (!invoice) {
      return {
        status: "error",
        warnings: analysis.warnings,
        errors: ["Este aluno não tem nenhuma fatura em aberto para aplicar este pagamento."],
        audits: [],
      };
    }

    if (ctx.dryRun) {
      return {
        status: "will_insert",
        warnings: analysis.warnings,
        errors: [],
        audits: [],
        target_record_id: invoice.id,
      };
    }

    let result;
    try {
      result = await registerReceiptDirect(ctx.db, {
        schoolId: ctx.schoolId,
        invoiceId: invoice.id,
        invoiceAmount: invoice.amount,
        amount,
        paymentMethod: method,
        paidOn,
        receivedBy: ctx.userId,
        receiptNumberHint: receiptHint,
      });
    } catch (err) {
      return {
        status: "error",
        warnings: analysis.warnings,
        errors: [err instanceof Error ? err.message : "Erro ao registar pagamento."],
        audits: [],
      };
    }

    invoice.remaining = Math.max(0, invoice.remaining - amount);
    cache.existingReceiptNumbers.add(result.receiptNumber);

    return {
      status: "imported",
      warnings: analysis.warnings,
      errors: [],
      audits: [
        {
          table_name: "finance_receipts",
          target_id: result.receiptId,
          action_type: "inserted",
          after_data: {
            school_id: ctx.schoolId,
            invoice_id: invoice.id,
            receipt_number: result.receiptNumber,
            amount,
            payment_method: method,
          },
        },
      ],
      target_record_id: result.receiptId,
    };
  },
};
