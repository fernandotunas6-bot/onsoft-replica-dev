/**
 * Grava na base o plano de `planSchoolStructure` (níveis, cursos, classes,
 * disciplinas e currículos) pela mesma escrita do «modelo de estrutura»
 * (`applyCurriculumPlan`), mais o campus. Idempotente pelas chaves da base —
 * repetir só acrescenta o que falta; nada é apagado nem renomeado (as 40
 * escolas que nasceram com «Ensino Geral · 10ª Classe» mantêm o que têm).
 *
 * Não cria turmas nem períodos: turmas são decisão da escola (quantas, que
 * turno), e os períodos precisam das datas reais do calendário.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { pedagogySettingsSchema } from "@/features/school/schemas";
import { planSchoolStructure, type SchoolStructurePlan } from "./school-structure-plan";
import { applyCurriculumPlan, type ApplyDb } from "./curriculum-templates-apply";

type Options = { strict?: boolean };

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
  const { schoolId, userId } = input;
  if (!input.plan.levels.length) return { seeded: [] };
  // Disciplinas e currículos exigem autor (created_by NOT NULL): sem utilizador,
  // só níveis, cursos e classes.
  const plan: SchoolStructurePlan = userId
    ? input.plan
    : { ...input.plan, subjects: [], curriculum: [] };
  try {
    // A mesma escrita do «modelo de estrutura»: idempotente pelas chaves da base.
    const { created } = await applyCurriculumPlan(
      db as unknown as ApplyDb,
      {
        schoolId,
        userId: userId ?? "",
      },
      plan,
    );
    const seeded = [
      created.niveis && `${created.niveis} nível(is) de ensino`,
      created.cursos && `${created.cursos} curso(s)`,
      created.classes && `${created.classes} classe(s)`,
      created.disciplinas && `${created.disciplinas} disciplina(s)`,
      created.curriculos && `${created.curriculos} currículo(s)`,
    ].filter(Boolean) as string[];
    // As turmas (criadas depois pela escola) exigem um campus.
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
      if (!error) seeded.push("campus");
    }
    return { seeded };
  } catch (error) {
    if (options.strict) throw error;
    console.warn("[school-structure]", error instanceof Error ? error.message : error);
    return { seeded: [] };
  }
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
  // Classes por curso: «10CL» de CFB e «10CL» de CEJ são classes diferentes.
  const [{ data: programs }, { data: grades }] = await Promise.all([
    db.from("programs").select("id, code").eq("school_id", schoolId),
    db.from("grade_levels").select("program_id, code").eq("school_id", schoolId),
  ]);
  const programId = new Map(
    (programs ?? []).map((row: { id: string; code: string }) => [String(row.code), String(row.id)]),
  );
  const existing = new Set(
    (grades ?? []).map(
      (row: { program_id: string; code: string }) => `${row.program_id}|${row.code}`,
    ),
  );
  return {
    teachingLevels: teaching.teachingLevels,
    pendingGrades: plan.grades.filter((grade) => {
      const id = programId.get(grade.programCode);
      return !id || !existing.has(`${id}|${grade.code}`);
    }).length,
  };
}
