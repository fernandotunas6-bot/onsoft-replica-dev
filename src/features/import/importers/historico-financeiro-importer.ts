import { normalizeText } from "../engine/normalize";
import type { ImportRefCache, RowImporter } from "../engine/types";
import { loadStudentRefs, uniqueExactMatch, type StudentRef } from "./academic-core";

type HistoricoFinanceiroCache = ImportRefCache & {
  students: StudentRef[];
  existingInvoices: Set<string>;
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
    const [students, invoicesRes] = await Promise.all([
      loadStudentRefs(ctx.db, ctx.schoolId),
      ctx.db.from("invoices").select("number").eq("school_id", ctx.schoolId),
    ]);

    const existingInvoices = new Set(
      (invoicesRes.data ?? []).map((i) => normalizeText(i.number)).filter(Boolean),
    );

    return {
      existingPeople: [],
      classGroups: [],
      studentByPersonId: new Map(),
      students,
      existingInvoices,
    } as HistoricoFinanceiroCache;
  },

  analyzeRow(normalized, rawCache) {
    const cache = rawCache as HistoricoFinanceiroCache;
    const errors: string[] = [];
    const warnings: string[] = [];

    const studentIdent = normalizeText(
      valueOf(normalized, "student_identifier", "aluno", "processo", "bi_aluno"),
    );
    const amountVal = Number(valueOf(normalized, "amount", "valor", "total", "montante"));
    const invoiceNumber = normalizeText(
      valueOf(normalized, "invoice_number", "numero_fatura", "recibo", "documento"),
    );

    if (!studentIdent) errors.push("Identificador do aluno (Nº Processo ou BI) é obrigatório.");
    if (!amountVal || isNaN(amountVal) || amountVal <= 0) {
      errors.push("Valor financeiro histórico deve ser um montante positivo em Kwanzas.");
    }

    const studentMatch = uniqueExactMatch(studentIdent ?? "", cache.students, [
      (s) => s.student_number,
      (s) => s.national_id,
    ]);

    if (!studentMatch.row) {
      errors.push(`Aluno "${studentIdent}" não encontrado no cadastro escolar.`);
    }

    if (errors.length) return { status: "error", warnings, errors };
    return { status: "valid", warnings, errors: [] };
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
    const amountVal = Number(valueOf(normalized, "amount", "valor", "total", "montante"));
    const invoiceNumber =
      normalizeText(
        valueOf(normalized, "invoice_number", "numero_fatura", "recibo", "documento"),
      ) || `HIST-${Date.now().toString().slice(-6)}`;
    const description =
      normalizeText(valueOf(normalized, "description", "descricao", "historico", "motivo")) ||
      "Registo financeiro consolidado de exercício anterior";

    const studentMatch = uniqueExactMatch(studentIdent, cache.students, [
      (s) => s.student_number,
      (s) => s.national_id,
    ]);
    const student = studentMatch.row!;

    const today = new Date().toISOString().split("T")[0];
    const { data: invoice, error: invoiceError } = await ctx.db
      .from("invoices")
      .insert({
        school_id: ctx.schoolId,
        student_id: student.id,
        number: invoiceNumber,
        description,
        issued_on: today,
        due_on: today,
        currency: "AOA",
        status: "paid",
        subtotal: amountVal,
        total_amount: amountVal,
        amount_paid: amountVal,
      })
      .select("id")
      .single();

    if (invoiceError) {
      return {
        status: "error",
        warnings: analysis.warnings,
        errors: [`Erro ao gravar histórico financeiro: ${invoiceError.message}`],
        audits: [],
      };
    }

    cache.existingInvoices.add(invoiceNumber);
    return {
      status: "imported",
      warnings: analysis.warnings,
      errors: [],
      audits: [],
      target_record_id: invoice.id,
    };
  },
};
