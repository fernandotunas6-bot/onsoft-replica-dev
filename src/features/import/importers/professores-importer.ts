import { findBestPersonMatch } from "../engine/dedupe";
import { normalizeText } from "../engine/normalize";
import type { ImportRefCache, RowImporter } from "../engine/types";
import { loadExistingPeople, personCandidateFromRow, resolveOrCreatePerson } from "./people-core";
import { schoolTodayIso } from "@/lib/school-date";
import { insertTeacherWithNextNumber } from "@/features/people/teacher-number";

type ProfessorCache = ImportRefCache & {
  teacherByPersonId: Map<string, { id: string; employee_number: string; status: string }>;
};

export const professoresImporter: RowImporter = {
  module: "professores",

  async loadRefCache(ctx) {
    const [existingPeople, teacherRows] = await Promise.all([
      loadExistingPeople(ctx.db, ctx.schoolId),
      ctx.db
        .from("teachers")
        .select("id, person_id, employee_number, status")
        .eq("school_id", ctx.schoolId),
    ]);
    if (teacherRows.error) {
      throw new Error(`Não foi possível carregar professores: ${teacherRows.error.message}`);
    }
    const teacherByPersonId = new Map(
      (teacherRows.data ?? []).map((row) => [
        String(row.person_id),
        {
          id: String(row.id),
          employee_number: String(row.employee_number ?? ""),
          status: String(row.status ?? "active"),
        },
      ]),
    );
    return {
      existingPeople,
      classGroups: [],
      studentByPersonId: new Map(),
      teacherByPersonId,
    } as ProfessorCache;
  },

  analyzeRow(normalized, rawCache) {
    const cache = rawCache as ProfessorCache;
    const candidate = personCandidateFromRow(normalized);
    const errors: string[] = [];
    if (!candidate) errors.push("Nome completo do professor é obrigatório.");
    if (!candidate?.national_id) errors.push("BI/documento do professor é obrigatório.");
    if (!candidate?.phone) errors.push("Telefone do professor é obrigatório.");
    if (errors.length) return { status: "error", warnings: [], errors };

    const match = findBestPersonMatch(candidate!, cache.existingPeople);
    if (match) {
      const existingTeacher = cache.teacherByPersonId.get(match.record.id);
      return {
        status: "duplicate",
        warnings: [
          existingTeacher
            ? `Professor já cadastrado (${existingTeacher.employee_number || "sem nº funcional"}).`
            : "Pessoa já existe; será reutilizada e ligada como professor.",
        ],
        errors: [],
        duplicate_of: existingTeacher?.id ?? match.record.id,
      };
    }
    return { status: "valid", warnings: [], errors: [] };
  },

  async commitRow(normalized, ctx, rawCache) {
    const cache = rawCache as ProfessorCache;
    const candidate = personCandidateFromRow(normalized);
    if (!candidate?.national_id || !candidate.phone) {
      return {
        status: "error",
        warnings: [],
        errors: ["Nome, BI/documento e telefone do professor são obrigatórios."],
        audits: [],
      };
    }

    const personResult = await resolveOrCreatePerson(candidate, cache.existingPeople, ctx);
    const existingTeacher = cache.teacherByPersonId.get(personResult.personId);
    if (existingTeacher) {
      if (ctx.dryRun) {
        return {
          status: "will_update",
          target_record_id: existingTeacher.id,
          warnings: ["Professor existente seria reutilizado/actualizado."],
          errors: [],
          audits: personResult.audits,
        };
      }
      if (ctx.duplicateStrategy === "ignore") {
        return {
          status: "ignored",
          target_record_id: existingTeacher.id,
          warnings: ["Professor existente ignorado conforme a estratégia escolhida."],
          errors: [],
          audits: personResult.audits,
        };
      }
      const before = { ...existingTeacher };
      const { error } = await ctx.db
        .from("teachers")
        .update({ status: "active", updated_by: ctx.userId })
        .eq("id", existingTeacher.id)
        .eq("school_id", ctx.schoolId);
      if (error) {
        return {
          status: "error",
          warnings: [],
          errors: [error.message],
          audits: personResult.audits,
        };
      }
      return {
        status: "imported",
        target_record_id: existingTeacher.id,
        warnings: ["Professor existente actualizado."],
        errors: [],
        audits: [
          ...personResult.audits,
          {
            table_name: "teachers",
            target_id: existingTeacher.id,
            action_type: "updated",
            before_data: before,
            after_data: { ...before, status: "active" },
          },
        ],
      };
    }

    if (ctx.dryRun) {
      return {
        status: "will_insert",
        target_record_id: personResult.personId,
        warnings: ["Novo professor seria criado."],
        errors: [],
        audits: personResult.audits,
      };
    }

    // A mesma numeração que «Novo professor» (DOC-000123), e não um pedaço do id.
    const { data: teacher, error } = await insertTeacherWithNextNumber(
      ctx.db,
      ctx.schoolId,
      (employeeNumber) =>
        ctx.db
          .from("teachers")
          .insert({
            school_id: ctx.schoolId,
            person_id: personResult.personId,
            employee_number: employeeNumber,
            hired_on: schoolTodayIso(),
            employment_type: "permanent",
            highest_qualification: "bachelor",
            status: "active",
            created_by: ctx.userId,
            updated_by: ctx.userId,
          })
          .select("id, employee_number, status")
          .single(),
    );
    if (error || !teacher) {
      return {
        status: "error",
        warnings: [],
        errors: [`Não foi possível criar o professor: ${error?.message ?? "erro desconhecido"}`],
        audits: personResult.audits,
      };
    }

    cache.teacherByPersonId.set(personResult.personId, {
      id: String(teacher.id),
      employee_number: String(teacher.employee_number ?? ""),
      status: String(teacher.status ?? "active"),
    });
    const specialty = normalizeText(normalized["specialty"] ?? normalized["especialidade"]);
    return {
      status: "imported",
      target_record_id: String(teacher.id),
      warnings: specialty
        ? [
            `Especialidade "${specialty}" não foi gravada em teachers porque o schema não possui esse campo; a atribuição deve ser feita no módulo pedagógico/teacher_subjects.`,
          ]
        : [],
      errors: [],
      audits: [
        ...personResult.audits,
        {
          table_name: "teachers",
          target_id: String(teacher.id),
          action_type: "inserted",
          after_data: {
            employee_number: teacher.employee_number,
            person_id: personResult.personId,
          },
        },
      ],
    };
  },
};
