import { normalizeText } from "../engine/normalize";
import type { ImportRefCache, RowImporter } from "../engine/types";
import { normalizeShift, resolveGradeLevel, uniqueExactMatch } from "./academic-core";

type Ref = { id: string; code: string; name: string };
type TurmaRef = Ref & { academic_year_id: string };
type TurmasCache = ImportRefCache & {
  academicYearId: string | null;
  gradeLevels: Ref[];
  campuses: Ref[];
  existingGroups: TurmaRef[];
};

function valueOf(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && normalizeText(value)) return value;
  }
  return null;
}

export const turmasImporter: RowImporter = {
  module: "turmas",

  async loadRefCache(ctx) {
    const [grades, campuses, groups] = await Promise.all([
      ctx.db.from("grade_levels").select("id, code, name").eq("school_id", ctx.schoolId),
      ctx.db.from("campuses").select("id, code, name").eq("school_id", ctx.schoolId),
      (() => {
        let query = ctx.db
          .from("class_groups")
          .select("id, code, name, academic_year_id")
          .eq("school_id", ctx.schoolId);
        if (ctx.academicYearId) query = query.eq("academic_year_id", ctx.academicYearId);
        return query;
      })(),
    ]);
    if (grades.error) throw new Error(`Não foi possível carregar classes: ${grades.error.message}`);
    if (campuses.error)
      throw new Error(`Não foi possível carregar campi/salas: ${campuses.error.message}`);
    if (groups.error) throw new Error(`Não foi possível carregar turmas: ${groups.error.message}`);
    return {
      existingPeople: [],
      classGroups: [],
      studentByPersonId: new Map(),
      academicYearId: ctx.academicYearId,
      gradeLevels: (grades.data ?? []).map((row) => ({
        id: String(row.id),
        code: String(row.code ?? ""),
        name: String(row.name ?? ""),
      })),
      campuses: (campuses.data ?? []).map((row) => ({
        id: String(row.id),
        code: String(row.code ?? ""),
        name: String(row.name ?? ""),
      })),
      existingGroups: (groups.data ?? []).map((row) => ({
        id: String(row.id),
        code: String(row.code ?? ""),
        name: String(row.name ?? ""),
        academic_year_id: String(row.academic_year_id ?? ""),
      })),
    } as TurmasCache;
  },

  analyzeRow(normalized, rawCache) {
    const cache = rawCache as TurmasCache;
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!cache.academicYearId) errors.push("Seleccione um ano lectivo antes de importar turmas.");
    const code = normalizeText(valueOf(normalized, "code", "codigo", "Código"));
    const name = normalizeText(valueOf(normalized, "name", "nome", "Turma"));
    const gradeValue = valueOf(normalized, "grade_level", "classe", "Classe");
    const shiftValue = valueOf(normalized, "shift", "turno", "Turno");
    if (!code) errors.push("Código da turma é obrigatório.");
    if (!name) errors.push("Nome da turma é obrigatório.");
    if (!gradeValue) errors.push("Classe/nível é obrigatório.");
    const grade = resolveGradeLevel(gradeValue, cache.gradeLevels);
    if (grade.ambiguous)
      errors.push(`Classe "${normalizeText(gradeValue)}" é ambígua; use o código exacto.`);
    else if (gradeValue && !grade.row)
      errors.push(`Classe "${normalizeText(gradeValue)}" não encontrada nesta escola.`);
    else if (grade.viaCatalog)
      warnings.push(
        `Classe "${normalizeText(gradeValue)}" associada a «${grade.row!.name}» (${grade.row!.code}). Confirme antes de gravar.`,
      );
    const shift = normalizeShift(shiftValue);
    if (!shift) errors.push("Turno inválido. Use Manhã, Tarde ou Noite.");

    const campusValue = valueOf(normalized, "campus", "campus_code", "campus_nome");
    if (campusValue) {
      const campus = uniqueExactMatch(campusValue, cache.campuses, [(r) => r.code, (r) => r.name]);
      if (campus.ambiguous) errors.push(`Campus "${normalizeText(campusValue)}" é ambíguo.`);
      else if (!campus.row)
        errors.push(`Campus "${normalizeText(campusValue)}" não encontrado nesta escola.`);
    }
    const roomValue = valueOf(normalized, "room", "sala", "Sala");
    if (roomValue) {
      warnings.push(
        `Sala "${normalizeText(roomValue)}" não pertence à estrutura class_groups; será tratada no módulo salas/horarios.`,
      );
    }

    if (errors.length) return { status: "error", warnings, errors };
    const existing = uniqueExactMatch(code || name, cache.existingGroups, [
      (r) => r.code,
      (r) => r.name,
    ]);
    if (existing.ambiguous)
      return {
        status: "error",
        warnings,
        errors: ["Código/nome da turma corresponde a mais de uma turma no ano lectivo."],
      };
    if (existing.row) {
      return {
        status: "duplicate",
        warnings: ["Turma já existe neste ano lectivo.", ...warnings],
        errors: [],
        duplicate_of: existing.row.id,
      };
    }
    return { status: warnings.length ? "warning" : "valid", warnings, errors: [] };
  },

  async commitRow(normalized, ctx, rawCache) {
    const cache = rawCache as TurmasCache;
    const analysis = this.analyzeRow(normalized, rawCache);
    if (analysis.status === "error" || !ctx.academicYearId) {
      return { status: "error", warnings: analysis.warnings, errors: analysis.errors, audits: [] };
    }
    const code = normalizeText(valueOf(normalized, "code", "codigo", "Código"));
    const name = normalizeText(valueOf(normalized, "name", "nome", "Turma"));
    const gradeValue = valueOf(normalized, "grade_level", "classe", "Classe");
    const shift = normalizeShift(valueOf(normalized, "shift", "turno", "Turno"))!;
    const grade = resolveGradeLevel(gradeValue, cache.gradeLevels).row!;
    const roomValue = valueOf(normalized, "room", "sala", "Sala");
    const campusValue = valueOf(normalized, "campus", "campus_code", "campus_nome");
    const campus = campusValue
      ? uniqueExactMatch(campusValue, cache.campuses, [(r) => r.code, (r) => r.name]).row
      : null;
    const capacityRaw = Number(valueOf(normalized, "capacity", "capacidade", "Capacidade"));
    const capacity = Number.isInteger(capacityRaw) && capacityRaw > 0 ? capacityRaw : 30;
    const existing = uniqueExactMatch(code || name, cache.existingGroups, [
      (r) => r.code,
      (r) => r.name,
    ]).row;

    if (existing) {
      if (ctx.duplicateStrategy === "ignore") {
        return {
          status: "ignored",
          target_record_id: existing.id,
          warnings: ["Turma existente ignorada."],
          errors: [],
          audits: [],
        };
      }
      if (ctx.dryRun) {
        return {
          status: "will_update",
          target_record_id: existing.id,
          warnings: [],
          errors: [],
          audits: [],
        };
      }
      const before = { ...existing };
      const patch = {
        name,
        grade_level_id: grade.id,
        campus_id: campus?.id ?? null,
        shift,
        capacity,
        status: "active",
        updated_by: ctx.userId,
      };
      const { error } = await ctx.db
        .from("class_groups")
        .update(patch)
        .eq("id", existing.id)
        .eq("school_id", ctx.schoolId)
        .eq("academic_year_id", ctx.academicYearId);
      if (error) return { status: "error", warnings: [], errors: [error.message], audits: [] };
      return {
        status: "imported",
        target_record_id: existing.id,
        warnings: ["Turma existente actualizada."],
        errors: [],
        audits: [
          {
            table_name: "class_groups",
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
      .from("class_groups")
      .insert({
        school_id: ctx.schoolId,
        academic_year_id: ctx.academicYearId,
        grade_level_id: grade.id,
        campus_id: campus?.id ?? null,
        code,
        name,
        shift,
        capacity,
        status: "active",
        created_by: ctx.userId,
        updated_by: ctx.userId,
      })
      .select("id, code, name, academic_year_id")
      .single();
    if (error || !created)
      return {
        status: "error",
        warnings: [],
        errors: [error?.message ?? "Não foi possível criar a turma."],
        audits: [],
      };
    const ref = {
      id: String(created.id),
      code: String(created.code),
      name: String(created.name),
      academic_year_id: String(created.academic_year_id),
    };
    cache.existingGroups.push(ref);
    return {
      status: "imported",
      target_record_id: ref.id,
      warnings: [],
      errors: [],
      audits: [
        { table_name: "class_groups", target_id: ref.id, action_type: "inserted", after_data: ref },
      ],
    };
  },
};
