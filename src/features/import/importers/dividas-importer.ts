import { normalizeText } from "../engine/normalize";
import type { ImportRefCache, RowImporter } from "../engine/types";
import { loadStudentRefs, uniqueExactMatch, type StudentRef } from "./academic-core";

type DividasCache = ImportRefCache & {
  students: StudentRef[];
  existingInvoiceNumbers: Set<string>;
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
    const [students, invoiceRows] = await Promise.all([
      loadStudentRefs(ctx.db, ctx.schoolId),
      ctx.db.from("invoices").select("number").eq("school_id", ctx.schoolId),
    ]);

    if (invoiceRows.error) {
      throw new Error(`Não foi possível carregar faturas existentes: ${invoiceRows.error.message}`);
    }

    const existingInvoiceNumbers = new Set(
      (invoiceRows.data ?? []).map((r) => normalizeText(r.number)).filter(Boolean),
    );

    return {
      existingPeople: [],
      classGroups: [],
      studentByPersonId: new Map(),
      students,
      existingInvoiceNumbers,
    } as DividasCache;
  },

  analyzeRow(normalized, rawCache) {
    const cache = rawCache as DividasCache;
    const errors: string[] = [];
    const warnings: string[] = [];

    const studentIdent = normalizeText(
      valueOf(normalized, "student_identifier", "aluno", "processo", "bi_aluno"),
    );
    const amountVal = Number(valueOf(normalized, "amount_due", "valor", "montante", "saldo"));
    const invoiceNum = normalizeText(valueOf(normalized, "invoice_number", "fatura", "guia"));

    if (!studentIdent) errors.push("Identificador do aluno (Nº Processo ou BI) é obrigatório.");
    if (!amountVal || isNaN(amountVal) || amountVal <= 0) {
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

    return { status: warnings.length ? "warning" : "valid", warnings, errors: [] };
  },

  async commitRow(normalized, ctx, rawCache) {
    const cache = rawCache as DividasCache;
    const analysis = this.analyzeRow(normalized, rawCache);
    if (analysis.status === "error") {
      return { status: "error", warnings: analysis.warnings, errors: analysis.errors, audits: [] };
    }

    const studentIdent = normalizeText(
      valueOf(normalized, "student_identifier", "aluno", "processo", "bi_aluno"),
    )!;
    const amount = Number(valueOf(normalized, "amount_due", "valor", "montante", "saldo"))!;
    const desc =
      normalizeText(valueOf(normalized, "month_ref", "mes", "referencia", "descricao")) ||
      "Propina em atraso";
    const dueDate =
      normalizeText(valueOf(normalized, "due_date", "vencimento", "data_vencimento")) ||
      new Date().toISOString();
    const statusVal =
      normalizeText(valueOf(normalized, "status", "estado", "situacao")) || "overdue";

    const studentMatch = uniqueExactMatch(studentIdent, cache.students, [
      (s) => s.student_number,
      (s) => s.national_id,
    ]);
    const student = studentMatch.row!;

    const invoiceNum =
      normalizeText(valueOf(normalized, "invoice_number", "fatura", "guia")) ||
      `FT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    if (cache.existingInvoiceNumbers.has(invoiceNum)) {
      return {
        status: "duplicate",
        warnings: analysis.warnings,
        errors: [],
        audits: [],
        target_record_id: invoiceNum,
      };
    }

    const { data, error } = await ctx.db
      .from("invoices")
      .insert({
        school_id: ctx.schoolId,
        student_id: student.id,
        number: invoiceNum,
        description: desc,
        due_on: dueDate,
        currency: "AOA",
        subtotal: amount,
        total_amount: amount,
        amount_paid: 0,
        status: statusVal,
      })
      .select("id")
      .single();

    if (error) {
      return {
        status: "error",
        warnings: analysis.warnings,
        errors: [`Erro ao registar dívida: ${error.message}`],
        audits: [],
      };
    }

    cache.existingInvoiceNumbers.add(invoiceNum);
    return {
      status: "imported",
      warnings: analysis.warnings,
      errors: [],
      audits: [],
      target_record_id: String(data.id),
    };
  },
};
