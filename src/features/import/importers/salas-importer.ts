import { normalizeText } from "../engine/normalize";
import type { ImportRefCache, RowImporter } from "../engine/types";
import { uniqueExactMatch } from "./academic-core";

type Ref = { id: string; code: string; name: string };
type SalasCache = ImportRefCache & {
  existingRooms: Ref[];
};

function valueOf(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && normalizeText(value)) return value;
  }
  return null;
}

export const salasImporter: RowImporter = {
  module: "salas",

  async loadRefCache(ctx) {
    const { data, error } = await ctx.db
      .from("rooms")
      .select("id, code, name")
      .eq("school_id", ctx.schoolId);
    if (error) throw new Error(`Não foi possível carregar salas: ${error.message}`);
    return {
      existingPeople: [],
      classGroups: [],
      studentByPersonId: new Map(),
      existingRooms: (data ?? []).map((r) => ({
        id: String(r.id),
        code: String(r.code ?? ""),
        name: String(r.name ?? ""),
      })),
    } as SalasCache;
  },

  analyzeRow(normalized, rawCache) {
    const cache = rawCache as SalasCache;
    const errors: string[] = [];
    const warnings: string[] = [];

    const code = normalizeText(valueOf(normalized, "code", "codigo", "sala"));
    const name = normalizeText(valueOf(normalized, "name", "nome", "designacao"));

    if (!code) errors.push("Código da sala é obrigatório.");
    if (!name) errors.push("Nome da sala é obrigatório.");

    if (errors.length) return { status: "error", warnings, errors };

    const existing = uniqueExactMatch(code || name, cache.existingRooms, [
      (r) => r.code,
      (r) => r.name,
    ]);
    if (existing.row) {
      return {
        status: "duplicate",
        warnings: ["Sala já cadastrada nesta instituição."],
        errors: [],
        duplicate_of: existing.row.id,
      };
    }

    return { status: "valid", warnings, errors: [] };
  },

  async commitRow(normalized, ctx, rawCache) {
    const cache = rawCache as SalasCache;
    const analysis = this.analyzeRow(normalized, rawCache);
    if (analysis.status === "error") {
      return { status: "error", warnings: analysis.warnings, errors: analysis.errors, audits: [] };
    }

    const code = normalizeText(valueOf(normalized, "code", "codigo", "sala"))!;
    const name = normalizeText(valueOf(normalized, "name", "nome", "designacao"))!;
    const capacity = Number(valueOf(normalized, "capacity", "capacidade", "lotacao")) || null;

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
      .from("rooms")
      .insert({
        school_id: ctx.schoolId,
        code,
        name,
        capacity,
        status: "active",
      })
      .select("id")
      .single();

    if (error) {
      return {
        status: "error",
        warnings: analysis.warnings,
        errors: [`Erro ao gravar sala: ${error.message}`],
        audits: [],
      };
    }

    cache.existingRooms.push({ id: String(data.id), code, name });
    return {
      status: "created",
      warnings: analysis.warnings,
      errors: [],
      audits: [],
      target_record_id: String(data.id),
    };
  },
};
