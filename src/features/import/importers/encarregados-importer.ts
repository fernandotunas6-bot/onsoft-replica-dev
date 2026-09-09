import { findBestPersonMatch } from "../engine/dedupe";
import { normalizeText } from "../engine/normalize";
import type { ImportRefCache, RowImporter } from "../engine/types";
import { loadExistingPeople, resolveOrCreatePerson } from "./people-core";
import { loadStudentRefs, uniqueExactMatch, type StudentRef } from "./academic-core";

type EncarregadosCache = ImportRefCache & {
  students: StudentRef[];
  existingGuardians: Set<string>; // key: `${student_id}:${guardian_person_id}`
};

function valueOf(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && normalizeText(value)) return value;
  }
  return null;
}

export const encarregadosImporter: RowImporter = {
  module: "encarregados",

  async loadRefCache(ctx) {
    const [existingPeople, students, guardianRows] = await Promise.all([
      loadExistingPeople(ctx.db, ctx.schoolId),
      loadStudentRefs(ctx.db, ctx.schoolId),
      ctx.db
        .from("student_guardians")
        .select("student_id, guardian_person_id")
        .eq("school_id", ctx.schoolId),
    ]);

    if (guardianRows.error) {
      throw new Error(`Não foi possível carregar encarregados existentes: ${guardianRows.error.message}`);
    }

    const existingGuardians = new Set(
      (guardianRows.data ?? []).map(
        (r) => `${r.student_id}:${r.guardian_person_id}`,
      ),
    );

    return {
      existingPeople,
      classGroups: [],
      studentByPersonId: new Map(),
      students,
      existingGuardians,
    } as EncarregadosCache;
  },

  analyzeRow(normalized, rawCache) {
    const cache = rawCache as EncarregadosCache;
    const errors: string[] = [];
    const warnings: string[] = [];

    const studentIdent = normalizeText(
      valueOf(normalized, "student_identifier", "aluno", "processo", "bi_aluno"),
    );
    const guardianName = normalizeText(
      valueOf(normalized, "guardian_name", "encarregado", "nome_encarregado"),
    );
    const phone = normalizeText(valueOf(normalized, "phone", "telefone", "contacto"));

    if (!studentIdent) errors.push("Identificador do aluno (Nº Processo ou BI) é obrigatório.");
    if (!guardianName) errors.push("Nome do encarregado é obrigatório.");
    if (!phone) errors.push("Telefone do encarregado é obrigatório.");

    if (errors.length) return { status: "error", warnings, errors };

    const studentMatch = uniqueExactMatch(studentIdent, cache.students, [
      (s) => s.student_number,
      (s) => s.national_id,
    ]);

    if (studentMatch.ambiguous) {
      errors.push(`Identificador do aluno "${studentIdent}" é ambíguo; use o número exacto.`);
    } else if (!studentMatch.row) {
      errors.push(`Aluno "${studentIdent}" não encontrado no sistema.`);
    }

    if (errors.length) return { status: "error", warnings, errors };

    // Verificar se já existe como pessoa e relação
    const personMatch = findBestPersonMatch(
      { full_name: guardianName, national_id: normalizeText(valueOf(normalized, "id_number", "bi")), phone },
      cache.existingPeople,
    );

    if (personMatch && studentMatch.row) {
      const relKey = `${studentMatch.row.id}:${personMatch.record.id}`;
      if (cache.existingGuardians.has(relKey)) {
        return {
          status: "duplicate",
          warnings: ["Encarregado já associado a este educando."],
          errors: [],
          duplicate_of: relKey,
        };
      }
    }

    return { status: "valid", warnings, errors: [] };
  },

  async commitRow(normalized, ctx, rawCache) {
    const cache = rawCache as EncarregadosCache;
    const analysis = this.analyzeRow(normalized, rawCache);
    if (analysis.status === "error") {
      return { status: "error", warnings: analysis.warnings, errors: analysis.errors, audits: [] };
    }

    const studentIdent = normalizeText(
      valueOf(normalized, "student_identifier", "aluno", "processo", "bi_aluno"),
    )!;
    const guardianName = normalizeText(
      valueOf(normalized, "guardian_name", "encarregado", "nome_encarregado"),
    )!;
    const phone = normalizeText(valueOf(normalized, "phone", "telefone", "contacto"))!;
    const nationalId = normalizeText(valueOf(normalized, "id_number", "bi"));
    const email = normalizeText(valueOf(normalized, "email", "correio"));
    const relationship =
      normalizeText(valueOf(normalized, "relationship_type", "parentesco")) || "Encarregado";
    const isFinancial =
      normalizeText(valueOf(normalized, "is_financial_responsible", "responsavel_financeiro")) ===
      "Sim";

    const studentMatch = uniqueExactMatch(studentIdent, cache.students, [
      (s) => s.student_number,
      (s) => s.national_id,
    ]);
    const student = studentMatch.row!;

    // Criar ou reaproveitar a pessoa encarregada
    const person = await resolveOrCreatePerson(
      ctx.db,
      ctx.schoolId,
      {
        full_name: guardianName,
        national_id: nationalId,
        phone,
        email,
      },
      cache.existingPeople,
      normalized,
    );

    const relKey = `${student.id}:${person.id}`;
    if (cache.existingGuardians.has(relKey)) {
      return {
        status: "duplicate",
        warnings: ["Encarregado já associado a este educando."],
        errors: [],
        audits: person.audits,
        target_record_id: relKey,
      };
    }

    const { error: relError } = await ctx.db.from("student_guardians").upsert({
      school_id: ctx.schoolId,
      student_id: student.id,
      guardian_person_id: person.id,
      relationship,
      is_primary: isFinancial,
      authorized_pickup: true,
    });

    if (relError) {
      return {
        status: "error",
        warnings: analysis.warnings,
        errors: [`Erro ao associar encarregado: ${relError.message}`],
        audits: person.audits,
      };
    }

    cache.existingGuardians.add(relKey);
    return {
      status: "created",
      warnings: analysis.warnings,
      errors: [],
      audits: person.audits,
      target_record_id: relKey,
    };
  },
};
