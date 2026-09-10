import { normalizeText } from "../engine/normalize";
import type { ImportRefCache, RowImporter } from "../engine/types";
import { loadStudentRefs, uniqueExactMatch, type StudentRef } from "./academic-core";

type EnrollmentRecord = { id: string; student_id: string; final_average: number | null };
type PautasCache = ImportRefCache & {
  students: StudentRef[];
  enrollmentByStudentId: Map<string, EnrollmentRecord>;
};

function valueOf(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && normalizeText(value)) return value;
  }
  return null;
}

export const pautasImporter: RowImporter = {
  module: "pautas",

  async loadRefCache(ctx) {
    const [students, enrollments] = await Promise.all([
      loadStudentRefs(ctx.db, ctx.schoolId),
      ctx.db
        .from("enrollments")
        .select("id, student_id, final_average")
        .eq("school_id", ctx.schoolId)
        .eq("status", "active"),
    ]);

    if (enrollments.error) {
      throw new Error(`Não foi possível carregar matrículas: ${enrollments.error.message}`);
    }

    const enrollmentByStudentId = new Map(
      (enrollments.data ?? []).map((e) => [
        String(e.student_id),
        {
          id: String(e.id),
          student_id: String(e.student_id),
          final_average: e.final_average !== null ? Number(e.final_average) : null,
        },
      ]),
    );

    return {
      existingPeople: [],
      classGroups: [],
      studentByPersonId: new Map(),
      students,
      enrollmentByStudentId,
    } as PautasCache;
  },

  analyzeRow(normalized, rawCache) {
    const cache = rawCache as PautasCache;
    const errors: string[] = [];
    const warnings: string[] = [];

    const studentIdent = normalizeText(
      valueOf(normalized, "student_identifier", "aluno", "processo", "bi_aluno"),
    );
    const scoreVal = valueOf(
      normalized,
      "final_average",
      "media_final",
      "resultado",
      "classificacao",
    );

    if (!studentIdent) errors.push("Identificador do aluno (Nº Processo ou BI) é obrigatório.");
    if (scoreVal === null || scoreVal === undefined) {
      errors.push("Média final da pauta é obrigatória.");
    }

    const scoreNum = Number(String(scoreVal).replace(",", ".").trim());
    if (isNaN(scoreNum) || scoreNum < 0 || scoreNum > 20) {
      errors.push("Média final deve estar na escala angolana de 0 a 20 valores.");
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
    } else if (!cache.enrollmentByStudentId.has(studentMatch.row.id)) {
      errors.push(`Aluno "${studentIdent}" não possui matrícula activa para lançamento de pauta.`);
    }

    if (errors.length) return { status: "error", warnings, errors };

    return { status: "valid", warnings, errors: [] };
  },

  async commitRow(normalized, ctx, rawCache) {
    const cache = rawCache as PautasCache;
    const analysis = this.analyzeRow(normalized, rawCache);
    if (analysis.status === "error") {
      return { status: "error", warnings: analysis.warnings, errors: analysis.errors, audits: [] };
    }

    const studentIdent = normalizeText(
      valueOf(normalized, "student_identifier", "aluno", "processo", "bi_aluno"),
    )!;
    const scoreVal = valueOf(
      normalized,
      "final_average",
      "media_final",
      "resultado",
      "classificacao",
    )!;
    const scoreNum = Math.round(Number(String(scoreVal).replace(",", ".").trim()) * 10) / 10;

    const studentMatch = uniqueExactMatch(studentIdent, cache.students, [
      (s) => s.student_number,
      (s) => s.national_id,
    ]);
    const student = studentMatch.row!;
    const enrollment = cache.enrollmentByStudentId.get(student.id)!;

    const { error } = await ctx.db
      .from("enrollments")
      .update({ final_average: scoreNum })
      .eq("id", enrollment.id)
      .eq("school_id", ctx.schoolId);

    if (error) {
      return {
        status: "error",
        warnings: analysis.warnings,
        errors: [`Erro ao gravar média final na pauta: ${error.message}`],
        audits: [],
      };
    }

    enrollment.final_average = scoreNum;
    return {
      status: "imported",
      warnings: analysis.warnings,
      errors: [],
      audits: [],
      target_record_id: enrollment.id,
    };
  },
};
