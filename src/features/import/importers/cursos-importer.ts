import { normalizeText } from "../engine/normalize";
import type { ImportRefCache, RowImporter } from "../engine/types";
import { uniqueExactMatch } from "./academic-core";

type Ref = { id: string; code: string; name: string };
type CursosCache = ImportRefCache & {
  existingCourses: Ref[];
};

function valueOf(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && normalizeText(value)) return value;
  }
  return null;
}

export const cursosImporter: RowImporter = {
  module: "cursos",

  async loadRefCache(ctx) {
    const { data, error } = await ctx.db
      .from("courses")
      .select("id, code, name")
      .eq("school_id", ctx.schoolId);
    if (error) throw new Error(`Não foi possível carregar cursos: ${error.message}`);
    return {
      existingPeople: [],
      classGroups: [],
      studentByPersonId: new Map(),
      existingCourses: (data ?? []).map((r) => ({
        id: String(r.id),
        code: String(r.code ?? ""),
        name: String(r.name ?? ""),
      })),
    } as CursosCache;
  },

  analyzeRow(normalized, rawCache) {
    const cache = rawCache as CursosCache;
    const errors: string[] = [];
    const warnings: string[] = [];

    const code = normalizeText(valueOf(normalized, "code", "codigo", "sigla"));
    const name = normalizeText(valueOf(normalized, "name", "nome", "designacao"));

    if (!code) errors.push("Código ou sigla do curso é obrigatório.");
    if (!name) errors.push("Nome completo do curso é obrigatório.");

    if (errors.length) return { status: "error", warnings, errors };

    const existing = uniqueExactMatch(code || name, cache.existingCourses, [
      (r) => r.code,
      (r) => r.name,
    ]);
    if (existing.row) {
      return {
        status: "duplicate",
        warnings: ["Curso já cadastrado nesta instituição."],
        errors: [],
        duplicate_of: existing.row.id,
      };
    }

    return { status: "valid", warnings, errors: [] };
  },

  async commitRow(normalized, ctx, rawCache) {
    const cache = rawCache as CursosCache;
    const analysis = this.analyzeRow(normalized, rawCache);
    if (analysis.status === "error") {
      return { status: "error", warnings: analysis.warnings, errors: analysis.errors, audits: [] };
    }

    const code = normalizeText(valueOf(normalized, "code", "codigo", "sigla"))!;
    const name = normalizeText(valueOf(normalized, "name", "nome", "designacao"))!;

    if (analysis.status === "duplicate") {
      return {
        status: "duplicate",
        warnings: analysis.warnings,
        errors: [],
        audits: [],
        target_record_id: analysis.duplicate_of,
      };
    }

    const { data, error } = await ctx.db
      .from("courses")
      .insert({
        school_id: ctx.schoolId,
        code,
        name,
        status: "active",
      })
      .select("id")
      .single();

    if (error) {
      return {
        status: "error",
        warnings: analysis.warnings,
        errors: [`Erro ao gravar curso: ${error.message}`],
        audits: [],
      };
    }

    cache.existingCourses.push({ id: String(data.id), code, name });
    return {
      status: "created",
      warnings: analysis.warnings,
      errors: [],
      audits: [],
      target_record_id: String(data.id),
    };
  },
};
