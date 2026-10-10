import { normalizeNumber, normalizeText } from "../engine/normalize";
import type { ImportRefCache, RowImporter } from "../engine/types";
import { subjectCatalogKey } from "@/features/education-catalog/normalize";
import { uniqueExactMatch } from "./academic-core";

type Ref = { id: string; code: string; name: string };
type DisciplinasCache = ImportRefCache & {
  existingSubjects: Ref[];
};

function valueOf(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && normalizeText(value)) return value;
  }
  return null;
}

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

    // O mesmo código, o mesmo nome, ou a mesma disciplina do catálogo escrita de
    // outra forma («Matematica», «Ed. Física»). Antes só se via o código: «MATEM
    // | Matemática» numa escola com «MAT | Matemática» criava outra Matemática.
    const byCode = uniqueExactMatch(code, cache.existingSubjects, [(r) => r.code]);
    const byName = byCode.row
      ? byCode
      : uniqueExactMatch(name, cache.existingSubjects, [(r) => r.name]);
    const catalogKey = byName.row ? null : subjectCatalogKey(name);
    const byCatalog = catalogKey
      ? cache.existingSubjects.filter((r) => subjectCatalogKey(r.name) === catalogKey)
      : [];
    const existing = byName.row ?? (byCatalog.length === 1 ? byCatalog[0]! : null);
    if (existing) {
      const same = byCode.row ? "o mesmo código" : byName.row ? "o mesmo nome" : "outra grafia";
      return {
        status: "duplicate",
        warnings: [
          `Disciplina já cadastrada nesta instituição (${same}): «${existing.name}» (${existing.code}).`,
        ],
        errors: [],
        duplicate_of: existing.id,
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
