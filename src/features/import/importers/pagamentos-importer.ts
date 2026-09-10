import { normalizeText } from "../engine/normalize";
import type { ImportRefCache, RowImporter } from "../engine/types";
import { loadStudentRefs, uniqueExactMatch, type StudentRef } from "./academic-core";

type PagamentosCache = ImportRefCache & {
  students: StudentRef[];
  existingReceipts: Set<string>;
};

function valueOf(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && normalizeText(value)) return value;
  }
  return null;
}

export const pagamentosImporter: RowImporter = {
  module: "pagamentos",

  async loadRefCache(ctx) {
    const [students, paymentRows] = await Promise.all([
      loadStudentRefs(ctx.db, ctx.schoolId),
      ctx.db.from("payments").select("receipt_number").eq("school_id", ctx.schoolId),
    ]);

    if (paymentRows.error) {
      throw new Error(
        `Não foi possível carregar pagamentos existentes: ${paymentRows.error.message}`,
      );
    }

    const existingReceipts = new Set(
      (paymentRows.data ?? []).map((r) => normalizeText(r.receipt_number)).filter(Boolean),
    );

    return {
      existingPeople: [],
      classGroups: [],
      studentByPersonId: new Map(),
      students,
      existingReceipts,
    } as PagamentosCache;
  },

  analyzeRow(normalized, rawCache) {
    const cache = rawCache as PagamentosCache;
    const errors: string[] = [];
    const warnings: string[] = [];

    const studentIdent = normalizeText(
      valueOf(normalized, "student_identifier", "aluno", "processo", "bi_aluno"),
    );
    const amountVal = Number(valueOf(normalized, "amount", "valor", "montante"));
    const receiptNum = normalizeText(
      valueOf(normalized, "receipt_number", "recibo", "comprovativo"),
    );

    if (!studentIdent) errors.push("Identificador do aluno (Nº Processo ou BI) é obrigatório.");
    if (!amountVal || isNaN(amountVal) || amountVal <= 0) {
      errors.push("Valor do pagamento deve ser um número positivo em Kwanzas.");
    }

    if (errors.length) return { status: "error", warnings, errors };

    const studentMatch = uniqueExactMatch(studentIdent, cache.students, [
      (s) => s.student_number,
      (s) => s.national_id,
    ]);

    if (studentMatch.ambiguous) {
      errors.push(`Identificador do aluno "${studentIdent}" é ambíguo; use o número exacto.`);
    } else if (!studentMatch.row) {
      errors.push(`Aluno "${studentIdent}" não encontrado nesta escola.`);
    }

    if (receiptNum && cache.existingReceipts.has(receiptNum)) {
      return {
        status: "duplicate",
        warnings: [`Recibo nº "${receiptNum}" já existe no sistema.`],
        errors: [],
        duplicate_of: receiptNum,
      };
    }

    return { status: warnings.length ? "warning" : "valid", warnings, errors: [] };
  },

  async commitRow(normalized, ctx, rawCache) {
    const cache = rawCache as PagamentosCache;
    const analysis = this.analyzeRow(normalized, rawCache);
    if (analysis.status === "error") {
      return { status: "error", warnings: analysis.warnings, errors: analysis.errors, audits: [] };
    }

    const studentIdent = normalizeText(
      valueOf(normalized, "student_identifier", "aluno", "processo", "bi_aluno"),
    )!;
    const amount = Number(valueOf(normalized, "amount", "valor", "montante"))!;
    const method =
      normalizeText(valueOf(normalized, "payment_method", "forma_pagamento", "canal")) ||
      "Multicaixa";
    const dateVal =
      normalizeText(valueOf(normalized, "payment_date", "data_pagamento", "data")) ||
      new Date().toISOString();
    const reference = normalizeText(valueOf(normalized, "month_ref", "mes", "referencia"));

    const studentMatch = uniqueExactMatch(studentIdent, cache.students, [
      (s) => s.student_number,
      (s) => s.national_id,
    ]);
    const student = studentMatch.row!;

    const receiptNum =
      normalizeText(valueOf(normalized, "receipt_number", "recibo", "comprovativo")) ||
      `REC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    if (cache.existingReceipts.has(receiptNum)) {
      return {
        status: "ignored",
        warnings: analysis.warnings.length
          ? analysis.warnings
          : [`Recibo "${receiptNum}" já existe. Linha ignorada.`],
        errors: [],
        audits: [],
        target_record_id: receiptNum,
      };
    }

    if (ctx.dryRun) {
      return {
        status: "will_insert",
        warnings: analysis.warnings,
        errors: [],
        audits: [],
        target_record_id: receiptNum,
      };
    }

    const { data, error } = await ctx.db
      .from("payments")
      .insert({
        school_id: ctx.schoolId,
        student_id: student.id,
        receipt_number: receiptNum,
        paid_at: dateVal,
        amount,
        currency: "AOA",
        method,
        reference,
        status: "completed",
      })
      .select("id")
      .single();

    if (error || !data) {
      return {
        status: "error",
        warnings: analysis.warnings,
        errors: [`Erro ao registar pagamento: ${error?.message ?? "falha no banco"}`],
        audits: [],
      };
    }

    cache.existingReceipts.add(receiptNum);
    return {
      status: "imported",
      warnings: analysis.warnings,
      errors: [],
      audits: [
        {
          table_name: "payments",
          target_id: String(data.id),
          action_type: "inserted",
          after_data: {
            school_id: ctx.schoolId,
            student_id: student.id,
            receipt_number: receiptNum,
            amount,
            method,
          },
        },
      ],
      target_record_id: String(data.id),
    };
  },
};
