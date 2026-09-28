/**
 * Grava o plano da instituição (institution-profile) numa escola acabada de
 * criar: níveis, cursos/programas, classes, disciplinas, períodos, turnos,
 * salas e as definições pedagógicas que filtram o que a escola vê.
 *
 * Só acrescenta: cada insert ignora o que já existe (chaves únicas por escola).
 * Uma falha numa parte fica registada e não desfaz a escola — o Administrador
 * completa-a depois em Pedagógica.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { regulationForCountry } from "@/features/academic/higher-ed-regulation";
import type { InstitutionPlan } from "./institution-profile";

type Warn = (context: string, message: string) => void;

export async function applyInstitutionPlan(
  db: SupabaseClient,
  input: { schoolId: string; adminUserId: string; plan: InstitutionPlan },
  warn: Warn = (context, message) => console.warn(`[institution-bootstrap] ${context}:`, message),
): Promise<{ seeded: string[] }> {
  const { schoolId, adminUserId, plan } = input;
  const audit = { created_by: adminUserId, updated_by: adminUserId };
  const seeded: string[] = [];

  // Níveis
  if (plan.academicLevels.length) {
    const { error } = await db.from("academic_levels").upsert(
      plan.academicLevels.map((level) => ({ school_id: schoolId, ...level, is_active: true })),
      { onConflict: "school_id,code", ignoreDuplicates: true },
    );
    if (error) warn("níveis", error.message);
    else seeded.push("níveis de ensino");
  }
  const { data: levelRows } = await db
    .from("academic_levels")
    .select("id, code")
    .eq("school_id", schoolId);
  const levelId = new Map((levelRows ?? []).map((row) => [String(row.code), String(row.id)]));

  // Programas (um por nível do ensino geral e técnico)
  const programs = plan.programs.filter((program) => levelId.has(program.levelCode));
  if (programs.length) {
    const { error } = await db.from("programs").upsert(
      programs.map((program) => ({
        school_id: schoolId,
        academic_level_id: levelId.get(program.levelCode),
        code: program.code,
        name: program.name,
        kind: program.kind,
        is_active: true,
      })),
      { onConflict: "school_id,code", ignoreDuplicates: true },
    );
    if (error) warn("programas", error.message);
  }
  const { data: programRows } = await db
    .from("programs")
    .select("id, code")
    .eq("school_id", schoolId);
  const programId = new Map((programRows ?? []).map((row) => [String(row.code), String(row.id)]));

  // Classes
  const grades = plan.gradeLevels.filter((grade) => programId.has(grade.programCode));
  if (grades.length) {
    const { error } = await db.from("grade_levels").upsert(
      grades.map((grade) => ({
        school_id: schoolId,
        program_id: programId.get(grade.programCode),
        code: grade.code,
        name: grade.name,
        sequence: grade.sequence,
        is_active: true,
      })),
      { onConflict: "school_id,program_id,code", ignoreDuplicates: true },
    );
    if (error) warn("classes", error.message);
    else seeded.push("classes");
  }

  // Disciplinas
  if (plan.subjects.length) {
    const { error } = await db.from("subjects").upsert(
      plan.subjects.map((subject) => ({
        school_id: schoolId,
        ...subject,
        status: "active",
        ...audit,
      })),
      { onConflict: "school_id,code", ignoreDuplicates: true },
    );
    if (error) warn("disciplinas", error.message);
    else seeded.push("disciplinas");
  }

  // Períodos do ano lectivo activo
  const { data: year } = await db
    .from("academic_years")
    .select("id")
    .eq("school_id", schoolId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (year?.id) {
    const { error } = await db.from("terms").upsert(
      plan.terms.map((term) => ({
        school_id: schoolId,
        academic_year_id: year.id,
        ...term,
        created_by: adminUserId,
        updated_by: adminUserId,
      })),
      { onConflict: "school_id,academic_year_id,sequence", ignoreDuplicates: true },
    );
    if (error) warn("períodos", error.message);
    else seeded.push(plan.evaluationPeriods === 2 ? "semestres" : "trimestres");
  }

  // Turnos
  if (plan.shifts.length) {
    const { error } = await db.from("school_shifts").upsert(
      plan.shifts.map((shift) => ({ school_id: schoolId, ...shift, status: "active", ...audit })),
      { onConflict: "school_id,code", ignoreDuplicates: true },
    );
    if (error) warn("turnos", error.message);
    else seeded.push("turnos");
  }

  // Salas
  if (plan.rooms.length) {
    const { error } = await db.from("rooms").upsert(
      plan.rooms.map((room) => ({ school_id: schoolId, ...room, status: "active", ...audit })),
      { onConflict: "school_id,code", ignoreDuplicates: true },
    );
    if (error) warn("salas", error.message);
    else seeded.push("salas");
  }

  // Definições pedagógicas: o que a escola vê em Pedagógica, pautas e matrícula.
  // Numa escola já em uso junta os níveis aos que existem, sem apagar nenhum.
  const { data: pedagogy } = await db
    .from("school_settings")
    .select("id, version, value")
    .eq("school_id", schoolId)
    .eq("domain", "pedagogy")
    .maybeSingle();
  if (!pedagogy?.id) {
    const { error } = await db.from("school_settings").insert({
      school_id: schoolId,
      domain: "pedagogy",
      version: 1,
      value: {
        teachingLevels: plan.teachingLevels,
        courses: plan.courses,
        closedTerms: [],
        gradingProfile: null,
      },
      changed_by: adminUserId,
    });
    if (error) warn("definições pedagógicas", error.message);
  } else {
    const current = (pedagogy.value ?? {}) as Record<string, unknown>;
    const list = (value: unknown) =>
      Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
    const { error } = await db
      .from("school_settings")
      .update({
        value: {
          ...current,
          teachingLevels: [...new Set([...list(current.teachingLevels), ...plan.teachingLevels])],
          courses: [...new Set([...list(current.courses), ...plan.courses])],
        },
        version: Number(pedagogy.version ?? 1) + 1,
        changed_by: adminUserId,
      })
      .eq("id", pedagogy.id)
      .eq("school_id", schoolId);
    if (error) warn("definições pedagógicas", error.message);
  }

  // Regulamento do ensino superior pelo país do sistema de ensino. Só se a
  // escola ainda não tiver um: o que o Administrador guardou não se toca.
  if (plan.hasHigherEducation) {
    const { data: regulation } = await db
      .from("school_settings")
      .select("id")
      .eq("school_id", schoolId)
      .eq("domain", "higher_education")
      .maybeSingle();
    if (!regulation?.id) {
      const { error } = await db.from("school_settings").insert({
        school_id: schoolId,
        domain: "higher_education",
        version: 1,
        value: regulationForCountry(plan.country),
        changed_by: adminUserId,
      });
      if (error) warn("regulamento do ensino superior", error.message);
      else seeded.push("regulamento");
    }
  }

  return { seeded };
}
