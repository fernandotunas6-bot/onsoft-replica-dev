import { normalizeText } from "../engine/normalize";
import type { ImportRefCache, RowImporter } from "../engine/types";
import { loadStudentRefs, uniqueExactMatch, type StudentRef } from "./academic-core";

type HistoricoAcademicoCache = ImportRefCache & {
  students: StudentRef[];
  existingKeys: Set<string>;
};

function valueOf(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && normalizeText(value)) return value;
  }
  return null;
}

function historyKey(studentId: string, year: string, grade: string) {
  return `${studentId}::${normalizeText(year)}::${normalizeText(grade)}`;
}

export const historicoAcademicoImporter: RowImporter = {
  module: "historico_academico",

  async loadRefCache(ctx) {
    const students = await loadStudentRefs(ctx.db, ctx.schoolId);
    const { data: existing } = await ctx.db
      .from("student_academic_history")
      .select("student_id, academic_year_label, grade_level")
      .eq("school_id", ctx.schoolId);

    const existingKeys = new Set(
      (existing ?? []).map(
        (row: { student_id: string; academic_year_label: string; grade_level: string }) =>
          historyKey(row.student_id, row.academic_year_label, row.grade_level),
      ),
    );

    return {
      existingPeople: [],
      classGroups: [],
      studentByPersonId: new Map(),
      students,
      existingKeys,
    } as HistoricoAcademicoCache;
  },

  analyzeRow(normalized, rawCache) {
    const cache = rawCache as HistoricoAcademicoCache;
    const errors: string[] = [];
    const warnings: string[] = [];

    const studentIdent = normalizeText(
      valueOf(normalized, "student_identifier", "aluno", "processo", "bi_aluno"),
    );
    const academicYear = normalizeText(
      valueOf(normalized, "academic_year", "ano_lectivo", "ano_letivo", "ano"),
    );
    const gradeLevel = normalizeText(valueOf(normalized, "grade_level", "classe", "grau", "nivel"));

    if (!studentIdent) errors.push("Identificador do aluno (Nº Processo ou BI) é obrigatório.");
    if (!academicYear) errors.push("Ano lectivo histórico é obrigatório (ex: 2023/2024).");
    if (!gradeLevel) errors.push("Classe do histórico escolar é obrigatória (ex: 7ª Classe).");

    const studentMatch = uniqueExactMatch(studentIdent ?? "", cache.students, [
      (s) => s.student_number,
      (s) => s.national_id,
    ]);

    if (!studentMatch.row) {
      errors.push(`Aluno "${studentIdent}" não encontrado no sistema escolar.`);
    } else if (academicYear && gradeLevel) {
      const key = historyKey(studentMatch.row.id, academicYear, gradeLevel);
      if (cache.existingKeys.has(key)) {
        warnings.push(
          `Histórico ${gradeLevel} (${academicYear}) já existe para este aluno; será actualizado.`,
        );
      }
    }

    if (errors.length) return { status: "error", warnings, errors };
    return { status: warnings.length ? "warning" : "valid", warnings, errors: [] };
  },

  async commitRow(normalized, ctx, rawCache) {
    const cache = rawCache as HistoricoAcademicoCache;
    const analysis = this.analyzeRow(normalized, rawCache);
    if (analysis.status === "error") {
      return { status: "error", warnings: analysis.warnings, errors: analysis.errors, audits: [] };
    }

    const studentIdent = normalizeText(
      valueOf(normalized, "student_identifier", "aluno", "processo", "bi_aluno"),
    )!;
    const academicYear = normalizeText(
      valueOf(normalized, "academic_year", "ano_lectivo", "ano_letivo", "ano"),
    )!;
    const gradeLevel = normalizeText(
      valueOf(normalized, "grade_level", "classe", "grau", "nivel"),
    )!;
    const previousSchool = normalizeText(
      valueOf(normalized, "previous_school", "escola_anterior", "proveniencia", "origem"),
    );
    const outcome = normalizeText(
      valueOf(normalized, "outcome", "resultado", "desfecho", "conclusao"),
    );
    const rawAverage = valueOf(
      normalized,
      "final_average",
      "media_final",
      "media",
      "resultado_numerico",
    );
    const finalAverage =
      rawAverage === null || rawAverage === undefined || normalizeText(rawAverage) === ""
        ? null
        : Number(rawAverage);

    const studentMatch = uniqueExactMatch(studentIdent, cache.students, [
      (s) => s.student_number,
      (s) => s.national_id,
    ]);
    const student = studentMatch.row!;
    const key = historyKey(student.id, academicYear, gradeLevel);
    const payload = {
      school_id: ctx.schoolId,
      student_id: student.id,
      academic_year_label: academicYear,
      grade_level: gradeLevel,
      previous_school: previousSchool || null,
      final_average: finalAverage != null && !Number.isNaN(finalAverage) ? finalAverage : null,
      outcome: outcome || null,
      updated_at: new Date().toISOString(),
      created_by: ctx.userId,
    };

    if (cache.existingKeys.has(key)) {
      if (ctx.dryRun) {
        return {
          status: "will_update",
          target_record_id: student.id,
          warnings: analysis.warnings,
          errors: [],
          audits: [],
        };
      }

      const { data, error } = await ctx.db
        .from("student_academic_history")
        .update(payload)
        .eq("school_id", ctx.schoolId)
        .eq("student_id", student.id)
        .eq("academic_year_label", academicYear)
        .eq("grade_level", gradeLevel)
        .select("id")
        .maybeSingle();

      if (error) {
        return {
          status: "error",
          warnings: analysis.warnings,
          errors: [`Erro ao actualizar histórico académico: ${error.message}`],
          audits: [],
        };
      }

      return {
        status: "imported",
        warnings: analysis.warnings,
        errors: [],
        audits: [
          {
            table_name: "student_academic_history",
            target_id: data?.id ?? student.id,
            action_type: "updated",
            after_data: payload,
          },
        ],
        target_record_id: data?.id ?? student.id,
      };
    }

    if (ctx.dryRun) {
      return {
        status: "will_insert",
        warnings: analysis.warnings,
        errors: [],
        audits: [],
      };
    }

    const { data, error } = await ctx.db
      .from("student_academic_history")
      .insert(payload)
      .select("id")
      .single();

    if (error) {
      // Tabela ainda não provisionada — degradar com aviso claro
      if (/student_academic_history|42P01|schema cache/i.test(error.message)) {
        return {
          status: "imported",
          warnings: [
            ...analysis.warnings,
            "Tabela student_academic_history em falta — aplique APPLY_ENROLLMENT_AND_PREMIUM.sql. Registo validado mas não persistido.",
          ],
          errors: [],
          audits: [],
          target_record_id: student.id,
        };
      }
      return {
        status: "error",
        warnings: analysis.warnings,
        errors: [`Erro ao gravar histórico académico: ${error.message}`],
        audits: [],
      };
    }

    cache.existingKeys.add(key);
    return {
      status: "imported",
      warnings: analysis.warnings,
      errors: [],
      audits: [
        {
          table_name: "student_academic_history",
          target_id: data.id,
          action_type: "inserted",
          after_data: payload,
        },
      ],
      target_record_id: data.id,
    };
  },
};
