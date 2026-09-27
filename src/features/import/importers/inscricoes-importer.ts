import { normalizeText } from "../engine/normalize";
import type { ImportRefCache, RowImporter } from "../engine/types";
import { loadExistingPeople, personCandidateFromRow, resolveOrCreatePerson } from "./people-core";

type ApplicationRef = { id: string; application_number: string | null; full_name: string };
type InscricoesCache = ImportRefCache & {
  applications: ApplicationRef[];
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
    const [existingPeople, applicationsResult] = await Promise.all([
      loadExistingPeople(ctx.db, ctx.schoolId),
      ctx.db
        .from("enrollment_applications")
        .select("id, full_name, payload")
        .eq("school_id", ctx.schoolId)
        .is("deleted_at", null),
    ]);

    if (applicationsResult.error) {
      throw new Error(
        `Não foi possível carregar candidaturas existentes: ${applicationsResult.error.message}`,
      );
    }

    const applications = (applicationsResult.data ?? []).map((row) => {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      return {
        id: String(row.id),
        application_number: normalizeText(payload.application_number),
        full_name: String(row.full_name ?? ""),
      };
    });

    return {
      existingPeople,
      classGroups: [],
      studentByPersonId: new Map(),
      applications,
    } as InscricoesCache;
  },

  analyzeRow(normalized, rawCache) {
    const cache = rawCache as InscricoesCache;
    const errors: string[] = [];
    const warnings: string[] = [];

    const candidate = personCandidateFromRow(normalized);
    if (!candidate?.full_name) errors.push("Nome completo do candidato é obrigatório.");

    const appNumber = normalizeText(
      valueOf(normalized, "application_number", "numero_candidatura", "processo", "inscricao"),
    );

    if (appNumber) {
      const existing = (cache.applications ?? []).find((a) => a.application_number === appNumber);
      if (existing) {
        warnings.push(
          `Candidatura "${appNumber}" já existe no sistema; a candidatura existente será actualizada conforme a estratégia.`,
        );
        return { status: "duplicate", warnings, errors: [], duplicate_of: existing.id };
      }
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

    const candidate = personCandidateFromRow(normalized);
    if (!candidate) {
      return {
        status: "error",
        warnings: analysis.warnings,
        errors: ["Dados do candidato insuficientes."],
        audits: [],
      };
    }

    // O número e o duplicado são resolvidos ANTES de a pessoa ser criada. Estava ao
    // contrário: `resolveOrCreatePerson` corria primeiro, e uma candidatura repetida com
    // estratégia "ignorar" deixava atrás de si uma pessoa criada que ninguém pediu — e com
    // "create_new" devolvia erro depois de já a ter gravado. Ignorar uma linha tem de não
    // tocar em nada.
    const appNumber = normalizeText(
      valueOf(normalized, "application_number", "numero_candidatura", "processo", "inscricao"),
    );
    const existing = appNumber
      ? ((cache.applications ?? []).find((a) => a.application_number === appNumber) ?? null)
      : null;

    if (existing && ctx.duplicateStrategy === "ignore") {
      return {
        status: "ignored",
        warnings: analysis.warnings,
        errors: [],
        audits: [],
        target_record_id: existing.id,
      };
    }
    if (existing && ctx.duplicateStrategy === "create_new") {
      return {
        status: "error",
        warnings: analysis.warnings,
        errors: ["Não é permitido criar uma segunda candidatura com o mesmo número."],
        audits: [],
        target_record_id: existing.id,
      };
    }

    const personRes = await resolveOrCreatePerson(candidate, cache.existingPeople, ctx);

    const payload = {
      application_number: appNumber || null,
      person: {
        full_name: candidate.full_name,
        national_id: candidate.national_id || null,
        phone: candidate.phone || null,
        email: candidate.email || null,
        birth_date: candidate.birth_date || null,
        gender: candidate.gender || null,
      },
      grade_level: normalizeText(valueOf(normalized, "grade_level", "classe", "grau", "nivel")),
      course_choice: normalizeText(
        valueOf(normalized, "course_choice", "curso", "curso_pretendido"),
      ),
      application_date: normalizeText(
        valueOf(normalized, "application_date", "data_inscricao", "data"),
      ),
    };

    if (ctx.dryRun) {
      return {
        status: existing ? "will_update" : "will_insert",
        warnings: analysis.warnings,
        errors: [],
        audits: personRes.audits,
        target_record_id: existing?.id ?? null,
      };
    }

    if (existing) {
      const { data: before, error: beforeError } = await ctx.db
        .from("enrollment_applications")
        .select("*")
        .eq("id", existing.id)
        .eq("school_id", ctx.schoolId)
        .single();
      if (beforeError || !before) {
        return {
          status: "error",
          warnings: analysis.warnings,
          errors: [
            `Não foi possível carregar a candidatura antes da actualização: ${beforeError?.message ?? "registo não encontrado"}`,
          ],
          audits: personRes.audits,
        };
      }

      const { data: updated, error } = await ctx.db
        .from("enrollment_applications")
        .update({
          full_name: candidate.full_name,
          payload,
          updated_by: ctx.userId,
        })
        .eq("id", existing.id)
        .eq("school_id", ctx.schoolId)
        .select("id, full_name, payload")
        .single();

      if (error || !updated) {
        return {
          status: "error",
          warnings: analysis.warnings,
          errors: [`Erro ao actualizar candidatura: ${error?.message ?? "registo não encontrado"}`],
          audits: personRes.audits,
        };
      }

      return {
        status: "imported",
        warnings: analysis.warnings,
        errors: [],
        audits: [
          ...personRes.audits,
          {
            table_name: "enrollment_applications",
            target_id: String(updated.id),
            action_type: "updated",
            before_data: before,
            after_data: updated,
          },
        ],
        target_record_id: String(updated.id),
      };
    }

    const { data: created, error } = await ctx.db
      .from("enrollment_applications")
      .insert({
        school_id: ctx.schoolId,
        full_name: candidate.full_name,
        payload,
        status: "pending",
        created_by: ctx.userId,
        updated_by: ctx.userId,
      })
      .select("id, full_name, payload, status")
      .single();

    if (error || !created) {
      return {
        status: "error",
        warnings: analysis.warnings,
        errors: [`Erro ao criar candidatura: ${error?.message ?? "erro desconhecido"}`],
        audits: personRes.audits,
      };
    }

    // `appNumber || null` e não `appNumber`: sem número, `normalizeText` devolve string
    // vazia, e a cache ficava a afirmar `""` enquanto a linha gravada tem `null` no
    // payload. Duas respostas para a mesma pergunta, dependendo de onde se perguntasse.
    (cache.applications ??= []).push({
      id: String(created.id),
      application_number: appNumber || null,
      full_name: candidate.full_name,
    });

    return {
      status: "imported",
      warnings: analysis.warnings,
      errors: [],
      audits: [
        ...personRes.audits,
        {
          table_name: "enrollment_applications",
          target_id: String(created.id),
          action_type: "inserted",
          after_data: created,
        },
      ],
      target_record_id: String(created.id),
    };
  },
};
