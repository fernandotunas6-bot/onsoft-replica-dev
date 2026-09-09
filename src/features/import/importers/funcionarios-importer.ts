import { findBestPersonMatch } from "../engine/dedupe";
import { normalizeText } from "../engine/normalize";
import type { ImportRefCache, RowImporter } from "../engine/types";
import { loadExistingPeople, resolveOrCreatePerson, type PersonCandidate } from "./people-core";

type FuncionariosCache = ImportRefCache & {
  existingRoleKeys: Set<string>; // key: `${person_id}:${normalized_role}`
};

function valueOf(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && normalizeText(value)) return value;
  }
  return null;
}

export const funcionariosImporter: RowImporter = {
  module: "funcionarios",

  async loadRefCache(ctx) {
    const [existingPeople, roleRows] = await Promise.all([
      loadExistingPeople(ctx.db, ctx.schoolId),
      ctx.db.from("person_roles").select("person_id, role").eq("school_id", ctx.schoolId),
    ]);

    if (roleRows.error) {
      throw new Error(`Não foi possível carregar cargos existentes: ${roleRows.error.message}`);
    }

    const existingRoleKeys = new Set(
      (roleRows.data ?? []).map((r) => `${r.person_id}:${normalizeText(r.role)}`),
    );

    return {
      existingPeople,
      classGroups: [],
      studentByPersonId: new Map(),
      existingRoleKeys,
    } as FuncionariosCache;
  },

  analyzeRow(normalized, rawCache) {
    const cache = rawCache as FuncionariosCache;
    const errors: string[] = [];
    const warnings: string[] = [];

    const fullName = normalizeText(valueOf(normalized, "full_name", "nome", "funcionario"));
    const idNumber = normalizeText(valueOf(normalized, "id_number", "bi", "documento"));
    const phone = normalizeText(valueOf(normalized, "phone", "telefone", "contacto"));
    const roleTitle = normalizeText(valueOf(normalized, "role_title", "cargo", "funcao"));

    if (!fullName) errors.push("Nome completo do funcionário é obrigatório.");
    if (!idNumber) errors.push("Nº do Bilhete de Identidade é obrigatório.");
    if (!phone) errors.push("Telefone de contacto é obrigatório.");
    if (!roleTitle) errors.push("Cargo ou função do funcionário é obrigatório.");

    if (errors.length) return { status: "error", warnings, errors };

    const personMatch = findBestPersonMatch(
      { full_name: fullName, national_id: idNumber, phone },
      cache.existingPeople,
    );

    if (personMatch) {
      const roleKey = `${personMatch.record.id}:${roleTitle}`;
      if (cache.existingRoleKeys.has(roleKey)) {
        return {
          status: "duplicate",
          warnings: [`Funcionário já possui o cargo de "${roleTitle}".`],
          errors: [],
          duplicate_of: roleKey,
        };
      }
    }

    return { status: "valid", warnings, errors: [] };
  },

  async commitRow(normalized, ctx, rawCache) {
    const cache = rawCache as FuncionariosCache;
    const analysis = this.analyzeRow(normalized, rawCache);
    if (analysis.status === "error") {
      return { status: "error", warnings: analysis.warnings, errors: analysis.errors, audits: [] };
    }

    const fullName = normalizeText(valueOf(normalized, "full_name", "nome", "funcionario"))!;
    const idNumber = normalizeText(valueOf(normalized, "id_number", "bi", "documento"))!;
    const phone = normalizeText(valueOf(normalized, "phone", "telefone", "contacto"))!;
    const email = normalizeText(valueOf(normalized, "email", "correio"));
    const roleTitle = normalizeText(valueOf(normalized, "role_title", "cargo", "funcao"))!;

    const candidate: PersonCandidate = {
      full_name: fullName,
      national_id: idNumber || null,
      phone: phone || null,
      email: email || null,
      birth_date: null,
      gender: null,
    };
    const person = await resolveOrCreatePerson(candidate, cache.existingPeople, ctx);

    const roleKey = `${person.personId}:${roleTitle}`;
    if (cache.existingRoleKeys.has(roleKey)) {
      return {
        status: "duplicate",
        warnings: analysis.warnings,
        errors: [],
        audits: person.audits,
        target_record_id: roleKey,
      };
    }

    if (ctx.dryRun) {
      return {
        status: person.created ? "will_insert" : "will_update",
        warnings: analysis.warnings,
        errors: [],
        audits: person.audits,
        target_record_id: roleKey,
      };
    }

    const { error: roleError } = await ctx.db.from("person_roles").insert({
      school_id: ctx.schoolId,
      person_id: person.personId,
      role: roleTitle,
      active: true,
    });

    if (roleError) {
      return {
        status: "error",
        warnings: analysis.warnings,
        errors: [`Erro ao associar cargo ao funcionário: ${roleError.message}`],
        audits: person.audits,
      };
    }

    cache.existingRoleKeys.add(roleKey);
    return {
      status: "imported",
      warnings: analysis.warnings,
      errors: [],
      audits: person.audits,
      target_record_id: roleKey,
    };
  },
};
