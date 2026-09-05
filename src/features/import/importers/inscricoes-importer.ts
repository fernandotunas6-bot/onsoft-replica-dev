import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeText } from "../engine/normalize";
import type { ImportRefCache, RowImporter } from "../engine/types";
import { loadExistingPeople, personCandidateFromRow, resolveOrCreatePerson } from "./people-core";

type InscricoesCache = ImportRefCache & {
  existingApplicantNumbers: Set<string>;
};

function valueOf(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && normalizeText(value)) return value;
  }
  return null;
}

export const inscricoesImporter: RowImporter = {
  module: "inscricoes",

  async loadRefCache(ctx) {
    const [existingPeople, studentRows] = await Promise.all([
      loadExistingPeople(ctx.db, ctx.schoolId),
      ctx.db.from("students").select("student_number").eq("school_id", ctx.schoolId),
    ]);

    const existingApplicantNumbers = new Set(
      (studentRows.data ?? []).map((s) => normalizeText(s.student_number)).filter(Boolean),
    );

    return {
      existingPeople,
      classGroups: [],
      studentByPersonId: new Map(),
      existingApplicantNumbers,
    } as InscricoesCache;
  },

  analyzeRow(normalized, rawCache) {
    const cache = rawCache as InscricoesCache;
    const errors: string[] = [];
    const warnings: string[] = [];

    const candidate = personCandidateFromRow(normalized);
    if (!candidate?.full_name) {
      errors.push("Nome completo do candidato é obrigatório.");
    }

    const appNumber = normalizeText(
      valueOf(normalized, "application_number", "numero_candidatura", "processo", "inscricao"),
    );

    if (appNumber && cache.existingApplicantNumbers.has(appNumber)) {
      warnings.push(`Candidatura "${appNumber}" já existe no sistema; dados serão consolidados.`);
    }

    if (errors.length) return { status: "error", warnings, errors };

    return { status: "valid", warnings, errors: [] };
  },

  async commitRow(normalized, ctx, rawCache) {
    const cache = rawCache as InscricoesCache;
    const analysis = this.analyzeRow(normalized, rawCache);
    if (analysis.status === "error") {
      return { status: "error", warnings: analysis.warnings, errors: analysis.errors, audits: [] };
    }

    const personRes = await resolveOrCreatePerson(normalized, ctx, cache);
    if (personRes.status === "error") {
      return { status: "error", warnings: analysis.warnings, errors: personRes.errors, audits: [] };
    }

    const appNumber = normalizeText(
      valueOf(normalized, "application_number", "numero_candidatura", "processo", "inscricao"),
    ) || `CAND-${Date.now().toString().slice(-6)}`;

    const { data: student, error: studentError } = await ctx.db
      .from("students")
      .insert({
        school_id: ctx.schoolId,
        person_id: personRes.person.id,
        student_number: appNumber,
        status: "applicant",
      })
      .select("id")
      .single();

    if (studentError) {
      return {
        status: "error",
        warnings: analysis.warnings,
        errors: [`Erro ao registar candidatura do aluno: ${studentError.message}`],
        audits: personRes.audits,
      };
    }

    cache.existingApplicantNumbers.add(appNumber);
    return {
      status: "created",
      warnings: analysis.warnings,
      errors: [],
      audits: personRes.audits,
      entity_id: student.id,
    };
  },
};
