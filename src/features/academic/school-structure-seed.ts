/**
 * Grava na base o plano de `planSchoolStructure`: níveis, cursos, classes,
 * campus e disciplinas do tronco comum. Idempotente por código — repetir só
 * acrescenta o que falta; nada é apagado nem renomeado (as 40 escolas que
 * nasceram com «Ensino Geral · 10ª Classe» mantêm o que têm).
 *
 * Não cria turmas nem períodos: turmas são decisão da escola (quantas, que
 * turno), e os períodos precisam das datas reais do calendário.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { pedagogySettingsSchema } from "@/features/school/schemas";
import { planSchoolStructure, type SchoolStructurePlan } from "./school-structure-plan";

type Options = { strict?: boolean };

function fail(
  error: { code?: string; message?: string } | null,
  context: string,
  options: Options,
) {
  if (!error) return;
  if (options.strict) throw publicDatabaseError(error, context);
  console.warn(`[school-structure] ${context}:`, error.message);
}

/** Níveis e cursos guardados em Definições → Pedagógico (ou vindos do registo). */
export async function loadSchoolTeachingContext(db: SupabaseClient, schoolId: string) {
  const { data } = await db
    .from("school_settings")
    .select("value")
    .eq("school_id", schoolId)
    .eq("domain", "pedagogy")
    .maybeSingle();
  const parsed = pedagogySettingsSchema.safeParse(data?.value ?? {});
  return parsed.success
    ? { teachingLevels: parsed.data.teachingLevels, courses: parsed.data.courses }
    : { teachingLevels: [], courses: [] };
}

export async function seedSchoolStructure(
  db: SupabaseClient,
  input: { schoolId: string; userId: string | null; plan: SchoolStructurePlan },
  options: Options = {},
): Promise<{ seeded: string[] }> {
  const { schoolId, userId, plan } = input;
  const seeded: string[] = [];
  if (!plan.levels.length) return { seeded };

  // Níveis
  const { data: levelRows } = await db
    .from("academic_levels")
    .select("id, code")
    .eq("school_id", schoolId);
  const levelIdByCode = new Map(
    (levelRows ?? []).map((row: { id: string; code: string }) => [row.code, row.id]),
  );
  const newLevels = plan.levels.filter((level) => !levelIdByCode.has(level.code));
  if (newLevels.length) {
    const { data, error } = await db
      .from("academic_levels")
      .insert(newLevels.map((level) => ({ school_id: schoolId, ...level, is_active: true })))
      .select("id, code");
    fail(error, "Não foi possível criar os níveis de ensino", options);
    for (const row of (data ?? []) as Array<{ id: string; code: string }>) {
      levelIdByCode.set(row.code, row.id);
    }
    if (data?.length) seeded.push(`${data.length} nível(is) de ensino`);
  }

  // Cursos
  const { data: programRows } = await db
    .from("programs")
    .select("id, code")
    .eq("school_id", schoolId);
  const programIdByCode = new Map(
    (programRows ?? []).map((row: { id: string; code: string }) => [row.code, row.id]),
  );
  const newPrograms = plan.programs
    .filter((program) => !programIdByCode.has(program.code))
    .filter((program) => levelIdByCode.has(program.levelCode));
  if (newPrograms.length) {
    const { data, error } = await db
      .from("programs")
      .insert(
        newPrograms.map((program) => ({
          school_id: schoolId,
          academic_level_id: levelIdByCode.get(program.levelCode),
          code: program.code,
          name: program.name,
          kind: program.kind,
          is_active: true,
        })),
      )
      .select("id, code");
    fail(error, "Não foi possível criar os cursos", options);
    for (const row of (data ?? []) as Array<{ id: string; code: string }>) {
      programIdByCode.set(row.code, row.id);
    }
    if (data?.length) seeded.push(`${data.length} curso(s)`);
  }

  // Classes
  const { data: gradeRows } = await db
    .from("grade_levels")
    .select("code")
    .eq("school_id", schoolId);
  const existingGrades = new Set((gradeRows ?? []).map((row: { code: string }) => row.code));
  const newGrades = plan.grades
    .filter((grade) => !existingGrades.has(grade.code))
    .filter((grade) => programIdByCode.has(grade.programCode));
  if (newGrades.length) {
    const { error } = await db.from("grade_levels").insert(
      newGrades.map((grade) => ({
        school_id: schoolId,
        program_id: programIdByCode.get(grade.programCode),
        code: grade.code,
        name: grade.name,
        sequence: grade.sequence,
        is_active: true,
      })),
    );
    fail(error, "Não foi possível criar as classes", options);
    if (!error) seeded.push(`${newGrades.length} classe(s)`);
  }

  // Campus (as turmas exigem um)
  const { data: campus } = await db
    .from("campuses")
    .select("id")
    .eq("school_id", schoolId)
    .limit(1)
    .maybeSingle();
  if (!campus?.id) {
    const { error } = await db
      .from("campuses")
      .insert({ school_id: schoolId, code: "SEDE", name: "Campus Principal", is_active: true });
    fail(error, "Não foi possível criar o campus", options);
    if (!error) seeded.push("campus");
  }

  // Disciplinas do tronco comum (created_by/updated_by são NOT NULL)
  if (userId && plan.subjects.length) {
    const { data: subjectRows } = await db
      .from("subjects")
      .select("code, name")
      .eq("school_id", schoolId);
    // Por código e por nome: escolas antigas têm «Língua Portuguesa» com o
    // código PORT, e o plano usa LP — não se cria a mesma disciplina duas vezes.
    const normalize = (value: unknown) =>
      String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase();
    const existingCodes = new Set(
      (subjectRows ?? []).map((row: { code: string }) => String(row.code).toUpperCase()),
    );
    const existingNames = new Set(
      (subjectRows ?? []).map((row: { name: string }) => normalize(row.name)),
    );
    const newSubjects = plan.subjects.filter(
      (subject) =>
        !existingCodes.has(subject.code.toUpperCase()) &&
        !existingNames.has(normalize(subject.name)),
    );
    if (newSubjects.length) {
      const { error } = await db.from("subjects").insert(
        newSubjects.map((subject) => ({
          school_id: schoolId,
          code: subject.code,
          name: subject.name,
          short_name: subject.short_name,
          status: "active",
          created_by: userId,
          updated_by: userId,
        })),
      );
      fail(error, "Não foi possível criar as disciplinas", options);
      if (!error) seeded.push(`${newSubjects.length} disciplina(s)`);
    }
  }

  return { seeded };
}

/** Estrutura a partir do contexto guardado da escola; vazio se não houver níveis. */
export async function seedSchoolStructureFromSettings(
  db: SupabaseClient,
  input: { schoolId: string; userId: string | null },
  options: Options = {},
): Promise<{ seeded: string[]; hasContext: boolean }> {
  const context = await loadSchoolTeachingContext(db, input.schoolId);
  if (!context.teachingLevels.length) return { seeded: [], hasContext: false };
  const plan = planSchoolStructure(context.teachingLevels, context.courses);
  const result = await seedSchoolStructure(db, { ...input, plan }, options);
  return { ...result, hasContext: true };
}

/** Quantas classes do plano ainda não existem (0 = estrutura em dia). */
export async function countPendingStructure(
  db: SupabaseClient,
  schoolId: string,
): Promise<{ teachingLevels: string[]; pendingGrades: number }> {
  const teaching = await loadSchoolTeachingContext(db, schoolId);
  if (!teaching.teachingLevels.length) return { teachingLevels: [], pendingGrades: 0 };
  const plan = planSchoolStructure(teaching.teachingLevels, teaching.courses);
  const { data } = await db.from("grade_levels").select("code").eq("school_id", schoolId);
  const existing = new Set((data ?? []).map((row: { code: string }) => String(row.code)));
  return {
    teachingLevels: teaching.teachingLevels,
    pendingGrades: plan.grades.filter((grade) => !existing.has(grade.code)).length,
  };
}
