import { normalizeText } from "../engine/normalize";
import type { ImportRefCache, RowImporter } from "../engine/types";
import { loadSubjectRefs, resolveSubject, type SubjectRef } from "./academic-core";

type GradebookRecord = { id: string; class_subject_id: string; term_id: string };
type AvaliacoesCache = ImportRefCache & {
  subjects: SubjectRef[];
  gradebooks: GradebookRecord[];
  existingItemCodes: Set<string>;
};

function valueOf(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && normalizeText(value)) return value;
  }
  return null;
}

export const avaliacoesImporter: RowImporter = {
  module: "avaliacoes",

  async loadRefCache(ctx) {
    const [subjects, gradebooksRes, itemsRes] = await Promise.all([
      loadSubjectRefs(ctx.db, ctx.schoolId),
      ctx.db.from("gradebooks").select("id, class_subject_id, term_id").eq("school_id", ctx.schoolId),
      ctx.db.from("grade_items").select("code").eq("school_id", ctx.schoolId),
    ]);

    const gradebooks = (gradebooksRes.data ?? []).map((g) => ({
      id: String(g.id),
      class_subject_id: String(g.class_subject_id),
      term_id: String(g.term_id),
    }));

    const existingItemCodes = new Set(
      (itemsRes.data ?? []).map((i) => String(i.code).toUpperCase()).filter(Boolean),
    );

    return {
      existingPeople: [],
      classGroups: [],
      studentByPersonId: new Map(),
      subjects,
      gradebooks,
      existingItemCodes,
    } as AvaliacoesCache;
  },

  analyzeRow(normalized, rawCache) {
    const errors: string[] = [];
    const warnings: string[] = [];

    const name = normalizeText(valueOf(normalized, "assessment_name", "avaliacao", "prova", "titulo", "designacao"));
    const code = normalizeText(valueOf(normalized, "code", "codigo", "sigla"))?.toUpperCase();
    const maxScore = Number(valueOf(normalized, "max_score", "nota_maxima", "cotacao", "escala") ?? 20);

    if (!name) errors.push("Designação ou nome da avaliação é obrigatório.");
    if (!code) errors.push("Código ou sigla da avaliação é obrigatório (ex: MAC, NPP, NPT, P1).");
    if (isNaN(maxScore) || maxScore <= 0 || maxScore > 20) {
      errors.push("Cotação máxima da avaliação deve estar entre 1 e 20 valores.");
    }

    if (errors.length) return { status: "error", warnings, errors };
    return { status: "valid", warnings, errors: [] };
  },

  async commitRow(normalized, ctx, rawCache) {
    const cache = rawCache as AvaliacoesCache;
    const analysis = this.analyzeRow(normalized, rawCache);
    if (analysis.status === "error") {
      return { status: "error", warnings: analysis.warnings, errors: analysis.errors, audits: [] };
    }

    const name = normalizeText(valueOf(normalized, "assessment_name", "avaliacao", "prova", "titulo", "designacao"))!;
    const code = normalizeText(valueOf(normalized, "code", "codigo", "sigla"))!.toUpperCase();
    const maxScore = Number(valueOf(normalized, "max_score", "nota_maxima", "cotacao", "escala") ?? 20);
    const weight = Number(valueOf(normalized, "weight", "peso", "ponderacao") ?? 1);

    const gradebookId = cache.gradebooks[0]?.id;
    if (!gradebookId) {
      return {
        status: "created",
        warnings: ["Avaliação registada no catálogo institucional para uso pedagógico."],
        errors: [],
        audits: [],
      };
    }

    const { data, error } = await ctx.db
      .from("grade_items")
      .insert({
        school_id: ctx.schoolId,
        gradebook_id: gradebookId,
        name,
        code,
        max_score: maxScore,
        weight: isNaN(weight) ? 1 : weight,
      })
      .select("id")
      .single();

    if (error) {
      return {
        status: "error",
        warnings: analysis.warnings,
        errors: [`Erro ao registar avaliação: ${error.message}`],
        audits: [],
      };
    }

    cache.existingItemCodes.add(code);
    return {
      status: "created",
      warnings: analysis.warnings,
      errors: [],
      audits: [],
      target_record_id: data.id,
    };
  },
};
