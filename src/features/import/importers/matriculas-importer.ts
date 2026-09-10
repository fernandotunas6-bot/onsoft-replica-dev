import { normalizeText } from "../engine/normalize";
import type { ImportRefCache, RowImporter } from "../engine/types";
import {
  loadClassGroupRefs,
  loadStudentRefs,
  normalizedEnrollmentDate,
  resolveClassGroup,
  resolveStudent,
  studentIdentifierOf,
  type ClassGroupRef,
  type StudentRef,
} from "./academic-core";

type EnrollmentRef = {
  id: string;
  student_id: string;
  academic_year_id: string;
  class_group_id: string;
  status: string;
  enrolled_on: string;
};

type MatriculasCache = ImportRefCache & {
  academicYearId: string | null;
  students: StudentRef[];
  groups: ClassGroupRef[];
  enrollmentByStudent: Map<string, EnrollmentRef>;
};

function classValue(row: Record<string, unknown>) {
  return row["class_group"] ?? row["turma"] ?? row["Turma"];
}

export const matriculasImporter: RowImporter = {
  module: "matriculas",

  async loadRefCache(ctx) {
    const [students, groups, enrollmentRows] = await Promise.all([
      loadStudentRefs(ctx.db, ctx.schoolId),
      loadClassGroupRefs(ctx.db, ctx.schoolId, ctx.academicYearId),
      ctx.academicYearId
        ? ctx.db
            .from("enrollments")
            .select("id, student_id, academic_year_id, class_group_id, status, enrolled_on")
            .eq("school_id", ctx.schoolId)
            .eq("academic_year_id", ctx.academicYearId)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (enrollmentRows.error) {
      throw new Error(`Não foi possível carregar matrículas: ${enrollmentRows.error.message}`);
    }
    return {
      existingPeople: [],
      classGroups: groups.map((g) => ({ id: g.id, name: g.name })),
      studentByPersonId: new Map(),
      academicYearId: ctx.academicYearId,
      students,
      groups,
      enrollmentByStudent: new Map(
        (enrollmentRows.data ?? []).map((row) => [
          String(row.student_id),
          {
            id: String(row.id),
            student_id: String(row.student_id),
            academic_year_id: String(row.academic_year_id),
            class_group_id: String(row.class_group_id),
            status: String(row.status ?? "pending"),
            enrolled_on: String(row.enrolled_on ?? ""),
          },
        ]),
      ),
    } as MatriculasCache;
  },

  analyzeRow(normalized, rawCache) {
    const cache = rawCache as MatriculasCache;
    const errors: string[] = [];
    if (!cache.academicYearId)
      errors.push("Seleccione o ano lectivo do job antes de importar matrículas.");
    const identifier = studentIdentifierOf(normalized);
    if (!identifier) errors.push("Processo ou BI do aluno é obrigatório.");
    const student = resolveStudent(identifier, cache.students);
    if (student.ambiguous)
      errors.push(
        `Identificador "${identifier}" corresponde a mais de um aluno; use o nº de processo exacto.`,
      );
    else if (identifier && !student.row)
      errors.push(`Aluno "${identifier}" não encontrado nesta escola.`);
    const groupText = normalizeText(classValue(normalized));
    if (!groupText) errors.push("Turma é obrigatória.");
    const group = resolveClassGroup(groupText, cache.groups);
    if (group.ambiguous) errors.push(`Turma "${groupText}" é ambígua; use o código exacto.`);
    else if (groupText && !group.row)
      errors.push(`Turma "${groupText}" não encontrada no ano lectivo seleccionado.`);

    const groupYear = group.row?.academic_year_id;
    if (groupYear && cache.academicYearId && groupYear !== cache.academicYearId) {
      errors.push("A turma indicada não pertence ao ano lectivo do processo de importação.");
    }
    if (errors.length) return { status: "error", warnings: [], errors };
    const existing = student.row ? cache.enrollmentByStudent.get(student.row.id) : null;
    if (existing) {
      return {
        status: "duplicate",
        warnings: [
          existing.class_group_id === group.row!.id
            ? "Aluno já está matriculado nesta turma/ano lectivo."
            : "Aluno já possui matrícula neste ano lectivo; a estratégia update poderá transferi-lo para a turma indicada.",
        ],
        errors: [],
        duplicate_of: existing.id,
      };
    }
    return { status: "valid", warnings: [], errors: [] };
  },

  async commitRow(normalized, ctx, rawCache) {
    const cache = rawCache as MatriculasCache;
    const analysis = this.analyzeRow(normalized, rawCache);
    if (analysis.status === "error" || !ctx.academicYearId) {
      return { status: "error", warnings: analysis.warnings, errors: analysis.errors, audits: [] };
    }
    const student = resolveStudent(studentIdentifierOf(normalized), cache.students).row!;
    const group = resolveClassGroup(classValue(normalized), cache.groups).row!;
    const enrolledOn = normalizedEnrollmentDate(
      normalized["enrollment_date"] ??
        normalized["data_matricula"] ??
        normalized["Data da Matrícula"],
    );
    const existing = cache.enrollmentByStudent.get(student.id);

    if (existing) {
      if (ctx.duplicateStrategy === "ignore") {
        return {
          status: "ignored",
          target_record_id: existing.id,
          warnings: ["Matrícula existente ignorada."],
          errors: [],
          audits: [],
        };
      }
      if (ctx.duplicateStrategy === "create_new") {
        return {
          status: "error",
          target_record_id: existing.id,
          warnings: [],
          errors: [
            "Não é permitido criar uma segunda matrícula do mesmo aluno no mesmo ano lectivo.",
          ],
          audits: [],
        };
      }
      if (ctx.dryRun)
        return {
          status: "will_update",
          target_record_id: existing.id,
          warnings: [],
          errors: [],
          audits: [],
        };
      const before = { ...existing };
      const patch = {
        class_group_id: group.id,
        enrolled_on: enrolledOn,
        status: "active",
        updated_by: ctx.userId,
      };
      const { error } = await ctx.db
        .from("enrollments")
        .update(patch)
        .eq("id", existing.id)
        .eq("school_id", ctx.schoolId)
        .eq("academic_year_id", ctx.academicYearId)
        .eq("student_id", student.id);
      if (error) return { status: "error", warnings: [], errors: [error.message], audits: [] };
      Object.assign(existing, patch);
      return {
        status: "imported",
        target_record_id: existing.id,
        warnings: ["Matrícula existente actualizada."],
        errors: [],
        audits: [
          {
            table_name: "enrollments",
            target_id: existing.id,
            action_type: "updated",
            before_data: before,
            after_data: { ...before, ...patch },
          },
        ],
      };
    }

    if (ctx.dryRun) return { status: "will_insert", warnings: [], errors: [], audits: [] };
    const { data: created, error } = await ctx.db
      .from("enrollments")
      .insert({
        school_id: ctx.schoolId,
        student_id: student.id,
        academic_year_id: ctx.academicYearId,
        class_group_id: group.id,
        status: "active",
        enrolled_on: enrolledOn,
        created_by: ctx.userId,
        updated_by: ctx.userId,
      })
      .select("id, student_id, academic_year_id, class_group_id, status, enrolled_on")
      .single();
    if (error || !created)
      return {
        status: "error",
        warnings: [],
        errors: [error?.message ?? "Não foi possível criar a matrícula."],
        audits: [],
      };
    const ref: EnrollmentRef = {
      id: String(created.id),
      student_id: String(created.student_id),
      academic_year_id: String(created.academic_year_id),
      class_group_id: String(created.class_group_id),
      status: String(created.status ?? "active"),
      enrolled_on: String(created.enrolled_on ?? enrolledOn),
    };
    cache.enrollmentByStudent.set(student.id, ref);
    return {
      status: "imported",
      target_record_id: ref.id,
      warnings: [],
      errors: [],
      audits: [
        { table_name: "enrollments", target_id: ref.id, action_type: "inserted", after_data: ref },
      ],
    };
  },
};
