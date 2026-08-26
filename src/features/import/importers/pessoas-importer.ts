import type { RowImporter } from "../engine/types";
import { findBestPersonMatch } from "../engine/dedupe";
import { loadExistingPeople, personCandidateFromRow, resolveOrCreatePerson } from "./people-core";

export const pessoasImporter: RowImporter = {
  module: "pessoas",

  async loadRefCache(ctx) {
    return {
      existingPeople: await loadExistingPeople(ctx.db, ctx.schoolId),
      classGroups: [],
      studentByPersonId: new Map(),
    };
  },

  analyzeRow(normalized, cache) {
    const candidate = personCandidateFromRow(normalized);
    if (!candidate) {
      return { status: "error", warnings: [], errors: ["Nome completo é obrigatório."] };
    }
    const match = findBestPersonMatch(candidate, cache.existingPeople);
    if (match) {
      return {
        status: "duplicate",
        warnings: [
          `Possível duplicado (${Math.round(match.score * 100)}%): ${match.reasons.join(", ")}`,
        ],
        errors: [],
        duplicate_of: match.record.id,
      };
    }
    return { status: "valid", warnings: [], errors: [] };
  },

  async commitRow(normalized, ctx, cache) {
    const candidate = personCandidateFromRow(normalized);
    if (!candidate) {
      return {
        status: "error",
        warnings: [],
        errors: ["Nome completo é obrigatório."],
        audits: [],
      };
    }
    const result = await resolveOrCreatePerson(candidate, cache.existingPeople, ctx);
    return {
      status: ctx.dryRun ? (result.created ? "will_insert" : "will_update") : "imported",
      target_record_id: result.personId,
      warnings: result.match
        ? [`Associado a pessoa existente (${Math.round(result.match.score * 100)}%)`]
        : [],
      errors: [],
      audits: result.audits,
    };
  },
};
