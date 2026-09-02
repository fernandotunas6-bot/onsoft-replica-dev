import { normalizeText } from "../engine/normalize";
import type { RowImporter } from "../engine/types";
import {
  classGroupNameOf,
  findClassGroup,
  findStudentByIdentifier,
  loadAcademicImportCache,
  studentIdentifierOf,
} from "./academic-import-core";

function rpcAuthError(error: { code?: string; message?: string }) {
  return error.code === "42501" || /is_aal2|autorização|autorizacao/i.test(error.message ?? "");
}

function enrollmentDateOf(normalized: Record<string, unknown>): string {
  const value = normalizeText(
    normalized["enrollment_date"] ?? normalized["data_matricula"] ?? normalized["Data da Matrícula"],
  );
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Date().toISOString().slice(0, 10);
}

export const matriculasImporter: RowImporter = {
  module: "matriculas",

  async loadRefCache(ctx) {
    return loadAcademicImportCache(ctx.db, ctx.schoolId, ctx.academicYearId);
  },

  analyzeRow(normalized, cache) {
    const identifier = studentIdentifierOf(normalized);
    const className = classGroupNameOf(normalized);
    const errors: string[] = [];
    if (!identifier) errors.push("Aluno (Processo ou BI) é obrigatório.");
    if (!className) errors.push("Turma é obrigatória.");

    const student = identifier ? findStudentByIdentifier(identifier, cache) : null;
    const group = className ? findClassGroup(className, cache) : null;
    if (identifier && !student) errors.push(`Aluno "${identifier}" não encontrado.`);
    if (className && !group) errors.push(`Turma "${className}" não encontrada no ano lectivo activo.`);
    if (errors.length) return { status: "error", warnings: [], errors };

    const existing = cache.enrollments?.find(
      (row) => row.student_id === student!.id && row.class_group_id === group!.id,
    );
    if (existing) {
      return {
        status: "duplicate",
        warnings: ["O aluno já possui matrícula activa nesta turma."],
        errors: [],
        duplicate_of: existing.id,
      };
    }
    return { status: "valid", warnings: [], errors: [] };
  },

  async commitRow(normalized, ctx, cache) {
    const identifier = studentIdentifierOf(normalized);
    const className = classGroupNameOf(normalized);
    const student = findStudentByIdentifier(identifier, cache);
    const group = findClassGroup(className, cache);
    if (!student || !group) {
      return {
        status: "error",
        warnings: [],
        errors: [!student ? `Aluno "${identifier}" não encontrado.` : `Turma "${className}" não encontrada.`],
        audits: [],
      };
    }

    const existing = cache.enrollments?.find(
      (row) => row.student_id === student.id && row.class_group_id === group.id,
    );
    if (existing) {
      if (ctx.duplicateStrategy === "ignore") {
        return { status: "ignored", target_record_id: existing.id, warnings: [], errors: [], audits: [] };
      }
      return {
        status: ctx.dryRun ? "will_update" : "imported",
        target_record_id: existing.id,
        warnings: ["Matrícula existente mantida; não foi criada duplicação."],
        errors: [],
        audits: [],
      };
    }

    if (ctx.dryRun) {
      return {
        status: "will_insert",
        target_record_id: student.id,
        warnings: ["Nova matrícula seria criada."],
        errors: [],
        audits: [],
      };
    }

    const { data, error } = await ctx.sessionSupabase.rpc("enroll_student", {
      school_id: ctx.schoolId,
      student_id: student.id,
      class_group_id: group.id,
      enrolled_on: enrollmentDateOf(normalized),
    });
    if (error) {
      return {
        status: "error",
        warnings: [],
        errors: [
          rpcAuthError(error)
            ? "Esta conta precisa de 2FA activo para criar matrículas."
            : `Falha ao matricular aluno: ${error.message}`,
        ],
        audits: [],
      };
    }

    const enrollmentId =
      typeof data === "object" && data && "enrollmentId" in data
        ? String((data as { enrollmentId: unknown }).enrollmentId)
        : student.id;
    cache.enrollments?.push({
      id: enrollmentId,
      student_id: student.id,
      class_group_id: group.id,
      academic_year_id: ctx.academicYearId,
      status: "active",
    });
    return {
      status: "imported",
      target_record_id: enrollmentId,
      warnings: [],
      errors: [],
      audits: [
        {
          table_name: "enrollments",
          target_id: enrollmentId,
          action_type: "inserted",
          after_data: { student_id: student.id, class_group_id: group.id },
        },
      ],
    };
  },
};
