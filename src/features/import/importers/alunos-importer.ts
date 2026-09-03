import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalEntityKey, findBestEntityMatch, findBestPersonMatch } from "../engine/dedupe";
import { normalizeText } from "../engine/normalize";
import type { AuditEntry, ImportRefCache, RowImporter } from "../engine/types";
import { loadExistingPeople, personCandidateFromRow, resolveOrCreatePerson } from "./people-core";

function rpcAuthError(error: { code?: string; message?: string }) {
  return error.code === "42501" || /is_aal2|autorização|autorizacao/i.test(error.message ?? "");
}

async function loadStudentsByPersonId(
  db: SupabaseClient,
  schoolId: string,
): Promise<Map<string, { id: string; student_number: string }>> {
  const { data } = await db
    .from("students")
    .select("id, student_number, person_id")
    .eq("school_id", schoolId);
  const map = new Map<string, { id: string; student_number: string }>();
  for (const row of (data ?? []) as Array<{
    id: string;
    student_number: string;
    person_id: string;
  }>) {
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
      const { data: registered, error: registerError } = await ctx.sessionSupabase.rpc(
        "register_student",
        {
          school_id: ctx.schoolId,
          person_id: personResult.personId,
          admission_date: new Date().toISOString().slice(0, 10),
          guardian_person_id: null,
          relationship: null,
          primary_guardian: false,
          financial_responsibility: false,
          pickup_authorization: true,
        },
      );
      if (registerError) {
        if (rpcAuthError(registerError)) {
          return {
            status: "error",
            warnings: [],
            errors: ["Esta conta precisa de 2FA activo para matricular alunos (register_student)."],
            audits,
          };
        }
        return {
          status: "error",
          warnings: [],
          errors: [`Falha ao registar aluno: ${registerError.message}`],
          audits,
        };
      }
      const outcome = registered as { studentId: string; studentNumber: string };
      student = { id: outcome.studentId, student_number: outcome.studentNumber };
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
        const { error: enrollError } = await ctx.sessionSupabase.rpc("enroll_student", {
          school_id: ctx.schoolId,
          student_id: student.id,
          class_group_id: found.id,
          enrolled_on: new Date().toISOString().slice(0, 10),
        });
        if (enrollError && !rpcAuthError(enrollError)) {
          warnings.push(
            `Não foi possível matricular na turma "${className}": ${enrollError.message}`,
          );
        } else if (enrollError) {
          warnings.push(
            "Esta conta precisa de 2FA activo para matricular numa turma (enroll_student).",
          );
        } else {
          const { data: enrollment, error: enrollmentLookupError } = await ctx.db
            .from("enrollments")
            .select("id")
            .eq("school_id", ctx.schoolId)
            .eq("student_id", student.id)
            .eq("academic_year_id", ctx.academicYearId)
            .eq("class_group_id", found.id)
            .in("status", ["pending", "active"])
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (enrollmentLookupError || !enrollment?.id) {
            warnings.push(
              "Matrícula criada, mas não foi possível resolver o ID para auditoria/rollback.",
            );
          } else {
            audits.push({
              table_name: "enrollments",
              target_id: String(enrollment.id),
              action_type: "inserted",
              after_data: {
                school_id: ctx.schoolId,
                student_id: student.id,
                academic_year_id: ctx.academicYearId,
                class_group_id: found.id,
              },
            });
          }
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
