import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalEntityKey, findBestEntityMatch, findBestPersonMatch } from "../engine/dedupe";
import { normalizeText } from "../engine/normalize";
import type { AuditEntry, ImportRefCache, RowImporter } from "../engine/types";
import { loadExistingPeople, personCandidateFromRow, resolveOrCreatePerson } from "./people-core";
import { selectAllPages } from "../engine/paged";
import {
  enrollStudentRpc,
  registerStudentRpc,
  rpcFailureError,
} from "@/features/students/enrollment-core";

async function loadStudentsByPersonId(
  db: SupabaseClient,
  schoolId: string,
): Promise<Map<string, { id: string; student_number: string }>> {
  type Row = { id: string; student_number: string; person_id: string };
  const data = await selectAllPages<Row>(
    (from, to) =>
      db
        .from("students")
        .select("id, student_number, person_id")
        .eq("school_id", schoolId)
        .order("id", { ascending: true })
        .range(from, to) as unknown as PromiseLike<{
        data: Row[] | null;
        error: { message: string } | null;
      }>,
    "Não foi possível carregar alunos",
  );
  const map = new Map<string, { id: string; student_number: string }>();
  for (const row of data) {
    map.set(row.person_id, { id: row.id, student_number: row.student_number });
  }
  return map;
}

async function loadClassGroups(
  db: SupabaseClient,
  schoolId: string,
  academicYearId: string | null,
): Promise<Array<{ id: string; name: string }>> {
  let query = db.from("class_groups").select("id, name").eq("school_id", schoolId);
  if (academicYearId) query = query.eq("academic_year_id", academicYearId);
  const { data } = await query;
  return (data ?? []) as Array<{ id: string; name: string }>;
}

function guardianNameOf(normalized: Record<string, unknown>): string {
  return normalizeText(
    normalized["guardian_name"] ?? normalized["encarregado"] ?? normalized["Encarregado"],
  );
}

function classNameOf(normalized: Record<string, unknown>): string {
  return normalizeText(normalized["class_group"] ?? normalized["turma"] ?? normalized["Turma"]);
}

export const alunosImporter: RowImporter = {
  module: "alunos",

  async loadRefCache(ctx) {
    const [existingPeople, classGroups, studentByPersonId] = await Promise.all([
      loadExistingPeople(ctx.db, ctx.schoolId),
      loadClassGroups(ctx.db, ctx.schoolId, ctx.academicYearId),
      loadStudentsByPersonId(ctx.db, ctx.schoolId),
    ]);
    return { existingPeople, classGroups, studentByPersonId };
  },

  analyzeRow(normalized, cache: ImportRefCache) {
    const candidate = personCandidateFromRow(normalized);
    if (!candidate) {
      return { status: "error", warnings: [], errors: ["Nome completo do aluno é obrigatório."] };
    }
    const match = findBestPersonMatch(candidate, cache.existingPeople);
    const warnings: string[] = [];

    const className = classNameOf(normalized);
    if (className && !findBestEntityMatch(className, cache.classGroups, (g) => g.name)) {
      warnings.push(`Turma "${className}" não encontrada — não será matriculado numa turma.`);
    }

    const guardianName = guardianNameOf(normalized);
    if (guardianName) {
      const found = cache.existingPeople.some(
        (p) => canonicalEntityKey(p.full_name) === canonicalEntityKey(guardianName),
      );
      if (!found) {
        warnings.push(
          `Encarregado "${guardianName}" não encontrado em Pessoas — crie-o primeiro para ligar automaticamente.`,
        );
      }
    }

    if (match) {
      return {
        status: "duplicate",
        warnings: [
          `Possível duplicado (${Math.round(match.score * 100)}%): ${match.reasons.join(", ")}`,
          ...warnings,
        ],
        errors: [],
        duplicate_of: match.record.id,
      };
    }
    return { status: warnings.length ? "warning" : "valid", warnings, errors: [] };
  },

  async commitRow(normalized, ctx, cache) {
    const candidate = personCandidateFromRow(normalized);
    if (!candidate) {
      return {
        status: "error",
        warnings: [],
        errors: ["Nome completo do aluno é obrigatório."],
        audits: [],
      };
    }

    // Um aluno novo conta para o limite do plano. Verifica-se antes de criar a
    // pessoa, para a recusa não deixar uma ficha sem aluno.
    if (!ctx.dryRun && ctx.assertCanAddStudent) {
      const match =
        ctx.duplicateStrategy === "create_new"
          ? null
          : findBestPersonMatch(candidate, cache.existingPeople);
      if (!match || !cache.studentByPersonId.has(match.record.id)) {
        try {
          await ctx.assertCanAddStudent();
        } catch (error) {
          return {
            status: "error",
            warnings: [],
            errors: [
              error instanceof Error ? error.message : "Limite de alunos do plano atingido.",
            ],
            audits: [],
          };
        }
      }
    }

    const personResult = await resolveOrCreatePerson(candidate, cache.existingPeople, ctx);
    const warnings: string[] = [];
    const audits: AuditEntry[] = [...personResult.audits];

    if (ctx.dryRun) {
      return {
        status: personResult.created ? "will_insert" : "will_update",
        target_record_id: personResult.personId,
        warnings: personResult.created
          ? ["Novo aluno seria criado."]
          : ["Aluno existente seria reutilizado."],
        errors: [],
        audits,
      };
    }

    let student = cache.studentByPersonId.get(personResult.personId) ?? null;
    if (!student) {
      const registered = await registerStudentRpc(ctx.sessionSupabase, {
        schoolId: ctx.schoolId,
        personId: personResult.personId,
      });
      if (!registered.ok) {
        return {
          status: "error",
          warnings: [],
          errors: [
            rpcFailureError(registered, { fallback: "Não foi possível registar o aluno." }).message,
          ],
          audits,
        };
      }
      student = {
        id: registered.value.studentId,
        student_number: registered.value.studentNumber,
      };
      cache.studentByPersonId.set(personResult.personId, student);
      audits.push({
        table_name: "students",
        target_id: student.id,
        action_type: "inserted",
        after_data: { school_id: ctx.schoolId, ...student },
      });
    }

    const guardianName = guardianNameOf(normalized);
    if (guardianName) {
      const guardianMatch = cache.existingPeople.find(
        (p) => canonicalEntityKey(p.full_name) === canonicalEntityKey(guardianName),
      );
      if (guardianMatch) {
        const { error: guardianError } = await ctx.db.from("student_guardians").insert({
          school_id: ctx.schoolId,
          student_id: student.id,
          guardian_person_id: guardianMatch.id,
          relationship: "guardian",
          is_primary: true,
          is_pickup_authorized: true,
          created_by: ctx.userId,
        });
        if (guardianError && !/duplicate|unique|23505/i.test(guardianError.message)) {
          warnings.push(`Não foi possível associar o encarregado: ${guardianError.message}`);
        } else if (!guardianError) {
          audits.push({
            table_name: "student_guardians",
            target_id: student.id,
            action_type: "inserted",
            after_data: {
              school_id: ctx.schoolId,
              student_id: student.id,
              guardian_person_id: guardianMatch.id,
            },
          });
        }
      } else {
        warnings.push(`Encarregado "${guardianName}" não encontrado — não foi associado.`);
      }
    }

    const className = classNameOf(normalized);
    if (className && ctx.academicYearId) {
      const found = findBestEntityMatch(className, cache.classGroups, (g) => g.name);
      if (found) {
        const enrolled = await enrollStudentRpc(ctx.sessionSupabase, {
          schoolId: ctx.schoolId,
          studentId: student.id,
          classGroupId: found.id,
        });
        if (!enrolled.ok) {
          const reason = rpcFailureError(enrolled, {
            fallback: "Não foi possível criar a matrícula.",
          }).message;
          warnings.push(`Não foi possível matricular na turma "${className}": ${reason}`);
        } else {
          // enroll_student devolve o id: já não é preciso procurá-lo para a reversão.
          audits.push({
            table_name: "enrollments",
            target_id: enrolled.value.enrollmentId,
            action_type: "inserted",
            after_data: {
              school_id: ctx.schoolId,
              student_id: student.id,
              academic_year_id: ctx.academicYearId,
              class_group_id: found.id,
            },
          });
        }
      } else {
        warnings.push(
          `Turma "${className}" não encontrada — aluno não foi matriculado numa turma.`,
        );
      }
    }

    return { status: "imported", target_record_id: student.id, warnings, errors: [], audits };
  },
};
