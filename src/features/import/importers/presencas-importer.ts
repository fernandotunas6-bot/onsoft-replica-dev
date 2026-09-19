import { normalizeText } from "../engine/normalize";
import type { ImportRefCache, RowImporter } from "../engine/types";
import { loadStudentRefs, uniqueExactMatch, type StudentRef } from "./academic-core";

type EnrollmentRecord = { id: string; student_id: string; attendance_rate: number | null };
type PresencasCache = ImportRefCache & {
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

export const presencasImporter: RowImporter = {
  module: "presencas",

  async loadRefCache(ctx) {
    const [students, enrollments] = await Promise.all([
      loadStudentRefs(ctx.db, ctx.schoolId),
      ctx.db
        .from("enrollments")
        .select("id, student_id, attendance_rate")
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
          attendance_rate: e.attendance_rate !== null ? Number(e.attendance_rate) : null,
        },
      ]),
    );

    return {
      existingPeople: [],
      classGroups: [],
      studentByPersonId: new Map(),
      students,
      enrollmentByStudentId,
    } as PresencasCache;
  },

  analyzeRow(normalized, rawCache) {
    const cache = rawCache as PresencasCache;
    const errors: string[] = [];
    const warnings: string[] = [];

    const studentIdent = normalizeText(
      valueOf(normalized, "student_identifier", "aluno", "processo", "bi_aluno"),
    );
    const rateVal = valueOf(
      normalized,
      "attendance_rate",
      "presenca",
      "taxa_presenca",
      "assiduidade",
    );

    if (!studentIdent) errors.push("Identificador do aluno (Nº Processo ou BI) é obrigatório.");
    if (rateVal === null || rateVal === undefined) {
      errors.push("Taxa de assiduidade ou percentagem de presenças é obrigatória.");
    }

    const rateNum = Number(String(rateVal).replace("%", "").trim());
    if (isNaN(rateNum) || rateNum < 0 || rateNum > 100) {
      errors.push("Taxa de assiduidade deve ser uma percentagem válida entre 0 e 100.");
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
    } else if (!cache.enrollmentByStudentId.has(studentMatch.row.id)) {
      errors.push(`Aluno "${studentIdent}" não possui matrícula activa no ano lectivo corrente.`);
    }

    if (errors.length) return { status: "error", warnings, errors };

    return { status: "valid", warnings, errors: [] };
  },

  async commitRow(normalized, ctx, rawCache) {
    const cache = rawCache as PresencasCache;
    const analysis = this.analyzeRow(normalized, rawCache);
    if (analysis.status === "error") {
      return { status: "error", warnings: analysis.warnings, errors: analysis.errors, audits: [] };
    }

    const studentIdent = normalizeText(
      valueOf(normalized, "student_identifier", "aluno", "processo", "bi_aluno"),
    )!;
    const rateVal = valueOf(
      normalized,
      "attendance_rate",
      "presenca",
      "taxa_presenca",
      "assiduidade",
    )!;
    const rateNum = Math.round(Number(String(rateVal).replace("%", "").trim()));

    const studentMatch = uniqueExactMatch(studentIdent, cache.students, [
      (s) => s.student_number,
      (s) => s.national_id,
    ]);
    const student = studentMatch.row!;
    const enrollment = cache.enrollmentByStudentId.get(student.id)!;

    if (ctx.dryRun) {
      return {
        status: "will_update",
        warnings: analysis.warnings,
        errors: [],
        audits: [],
        target_record_id: enrollment.id,
      };
    }

    const { error } = await ctx.db
      .from("enrollments")
      .update({ attendance_rate: rateNum })
      .eq("id", enrollment.id)
      .eq("school_id", ctx.schoolId);

    if (error) {
      return {
        status: "error",
        warnings: analysis.warnings,
        errors: [`Erro ao gravar taxa de assiduidade: ${error.message}`],
        audits: [],
      };
    }

    enrollment.attendance_rate = rateNum;
    return {
      status: "imported",
      warnings: analysis.warnings,
      errors: [],
      audits: [],
      target_record_id: enrollment.id,
    };
  },
};
