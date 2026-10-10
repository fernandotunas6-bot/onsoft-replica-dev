import { normalizeNumber, normalizeText, valueOf } from "../engine/normalize";
import type { ImportRefCache, RowImporter } from "../engine/types";
import { uniqueExactMatch } from "./academic-core";

type Ref = { id: string; code: string; name: string };
type DisciplinasCache = ImportRefCache & {
  existingSubjects: Ref[];
};

export const disciplinasImporter: RowImporter = {
  module: "disciplinas",

  async loadRefCache(ctx) {
    const { data, error } = await ctx.db
      .from("subjects")
      .select("id, code, name")
      .eq("school_id", ctx.schoolId);
    if (error) throw new Error(`Não foi possível carregar disciplinas: ${error.message}`);
    return {
      existingPeople: [],
      classGroups: [],
      studentByPersonId: new Map(),
      existingSubjects: (data ?? []).map((r) => ({
        id: String(r.id),
        code: String(r.code ?? ""),
        name: String(r.name ?? ""),
      })),
    } as DisciplinasCache;
  },

  analyzeRow(normalized, rawCache) {
    const cache = rawCache as DisciplinasCache;
    const errors: string[] = [];
    const warnings: string[] = [];

    const code = normalizeText(valueOf(normalized, "code", "codigo", "sigla"));
    const name = normalizeText(valueOf(normalized, "name", "nome", "disciplina"));

    if (!code) errors.push("Código/sigla da disciplina é obrigatório.");
    if (!name) errors.push("Nome da disciplina é obrigatório.");

    if (errors.length) return { status: "error", warnings, errors };

    const existing = uniqueExactMatch(code || name, cache.existingSubjects, [
      (r) => r.code,
      (r) => r.name,
    ]);
    if (existing.row) {
      return {
        status: "duplicate",
        warnings: ["Disciplina já cadastrada nesta instituição."],
        errors: [],
        duplicate_of: existing.row.id,
      };
    }

    // `subjects` guarda a carga ANUAL (`annual_hours`); a folha já pediu horas semanais.
    // Não se converte por um multiplicador inventado — avisa-se, e grava-se o que veio.
    const horas = normalizeNumber(
      valueOf(normalized, "annual_hours", "workload_hours", "carga_horaria", "horas", "tempos"),
    );
    if (horas !== null && horas > 0 && horas < 30) {
      warnings.push(
        `Carga horária de ${horas}h parece semanal, mas é gravada como carga ANUAL. Confirme o valor.`,
      );
    }

    return { status: warnings.length ? "warning" : "valid", warnings, errors: [] };
  },

  async commitRow(normalized, ctx, rawCache) {
    const cache = rawCache as DisciplinasCache;
    const analysis = this.analyzeRow(normalized, rawCache);
    if (analysis.status === "error") {
      return { status: "error", warnings: analysis.warnings, errors: analysis.errors, audits: [] };
    }

    const code = normalizeText(valueOf(normalized, "code", "codigo", "sigla"))!;
    const name = normalizeText(valueOf(normalized, "name", "nome", "disciplina"))!;
    const annualHours =
      normalizeNumber(
        valueOf(normalized, "annual_hours", "workload_hours", "carga_horaria", "horas", "tempos"),
      ) ?? null;

    if (analysis.status === "duplicate") {
      return {
        status: "duplicate",
        warnings: analysis.warnings,
        errors: [],
        audits: [],
        target_record_id: analysis.duplicate_of,
      };
    }

    if (ctx.dryRun) {
      return {
        status: "will_insert",
        warnings: analysis.warnings,
        errors: [],
        audits: [],
        target_record_id: null,
      };
    }

    const { data, error } = await ctx.db
      .from("subjects")
      .insert({
        school_id: ctx.schoolId,
        code,
        name,
        annual_hours: annualHours,
        status: "active",
        created_by: ctx.userId,
        updated_by: ctx.userId,
      })
      .select("id")
      .single();

    if (error) {
      return {
        status: "error",
        warnings: analysis.warnings,
        errors: [`Erro ao gravar disciplina: ${error.message}`],
        audits: [],
      };
    }

    cache.existingSubjects.push({ id: String(data.id), code, name });
    return {
      status: "imported",
      warnings: analysis.warnings,
      errors: [],
      audits: [
        {
          table_name: "subjects",
          target_id: String(data.id),
          action_type: "inserted",
          after_data: {
            school_id: ctx.schoolId,
            code,
            name,
            annual_hours: annualHours,
            status: "active",
          },
        },
      ],
      target_record_id: String(data.id),
    };
  },
};
