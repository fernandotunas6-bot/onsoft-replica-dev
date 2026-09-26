/**
 * Leituras partilhadas por exames e resultado final (só servidor): pauta
 * anual, regra com que foi gerada, nomes dos alunos.
 */
import type { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { ROUNDING_METHODS, type RoundingMethod } from "./assessment-model";
import type { BreakdownEntry, EngineRule } from "./exam-engine";

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;
type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v));
const numOrNull = (v: unknown) => (v == null || v === "" ? null : Number(v));

/** Estados da pauta anual que já valem como ponto de partida para exames. */
export const OFFICIAL_SHEET_STATUSES = ["homologated", "published", "closed"];

const MISSING_TABLE = "Falta aplicar a migração dos exames (20260926220000) na base de dados.";

export function examDbError(error: { message?: string; code?: string }, fallback: string) {
  if (error.code === "42P01" || /siga_exam_/i.test(error.message ?? "")) {
    return new Error(MISSING_TABLE);
  }
  return publicDatabaseError(error, fallback);
}

export async function activeYearId(db: Db, schoolId: string, requested?: string) {
  if (requested) return requested;
  const { data } = await db
    .from("academic_years")
    .select("id")
    .eq("school_id", schoolId)
    .eq("status", "active")
    .order("starts_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ? String(data.id) : null;
}

/** Regra com que a pauta foi gerada (e a escala dela), no formato do motor. */
export async function loadEngineRule(db: Db, schoolId: string, ruleSetId: string | null) {
  let query = db
    .from("assessment_rule_sets")
    .select("passing_value, maximum_absence_percentage, rounding_method, formula, grading_scale_id")
    .eq("school_id", schoolId);
  query = ruleSetId
    ? query.eq("id", ruleSetId)
    : query.eq("code", "DEFAULT").eq("status", "active");
  const { data: rule } = await query.limit(1).maybeSingle();
  if (!rule) return null;
  const { data: scale } = rule.grading_scale_id
    ? await db
        .from("grading_scales")
        .select("decimal_places")
        .eq("school_id", schoolId)
        .eq("id", str(rule.grading_scale_id))
        .maybeSingle()
    : { data: null };
  const rounding = str(rule.rounding_method);
  const formula = (rule.formula ?? {}) as Row;
  const engine: EngineRule = {
    passingValue: Number(rule.passing_value),
    maximumAbsencePercentage: numOrNull(rule.maximum_absence_percentage),
    roundingMethod: (ROUNDING_METHODS as readonly string[]).includes(rounding)
      ? (rounding as RoundingMethod)
      : "nearest",
    decimalPlaces: Number(scale?.decimal_places ?? 0) || 0,
    keySubjectsCauseFailure: formula.keySubjectsCauseFailure !== false,
  };
  return engine;
}

export type AnnualSheet = {
  id: string;
  status: string;
  rule: EngineRule | null;
  rows: Array<{
    enrollmentId: string;
    absencePercentage: number | null;
    sheetResult: string | null;
    breakdown: BreakdownEntry[];
  }>;
};

export async function loadAnnualSheet(
  db: Db,
  schoolId: string,
  yearId: string,
  classGroupId: string,
): Promise<AnnualSheet | null> {
  const { data: sheet } = await db
    .from("grade_sheets")
    .select("id, status, rule_set_id")
    .eq("school_id", schoolId)
    .eq("academic_year_id", yearId)
    .eq("class_group_id", classGroupId)
    .eq("kind", "annual")
    .limit(1)
    .maybeSingle();
  if (!sheet) return null;
  const [{ data: rows }, rule] = await Promise.all([
    db
      .from("grade_sheet_rows")
      .select("enrollment_id, absence_percentage, result, subject_breakdown")
      .eq("school_id", schoolId)
      .eq("grade_sheet_id", str(sheet.id)),
    loadEngineRule(db, schoolId, sheet.rule_set_id ? str(sheet.rule_set_id) : null),
  ]);
  return {
    id: str(sheet.id),
    status: str(sheet.status),
    rule,
    rows: ((rows ?? []) as Row[]).map((r) => ({
      enrollmentId: str(r.enrollment_id),
      absencePercentage: numOrNull(r.absence_percentage),
      sheetResult: r.result ? str(r.result) : null,
      breakdown: Array.isArray(r.subject_breakdown)
        ? (r.subject_breakdown as BreakdownEntry[])
        : [],
    })),
  };
}

export async function studentNames(db: Db, schoolId: string, enrollmentIds: string[]) {
  const names = new Map<string, { name: string; studentId: string; personId: string }>();
  if (!enrollmentIds.length) return names;
  const { data: enrollments } = await db
    .from("enrollments")
    .select("id, student_id")
    .eq("school_id", schoolId)
    .in("id", enrollmentIds);
  const studentIds = ((enrollments ?? []) as Row[]).map((e) => str(e.student_id));
  const { data: students } = studentIds.length
    ? await db
        .from("students")
        .select("id, person_id")
        .eq("school_id", schoolId)
        .in("id", studentIds)
    : { data: [] as Row[] };
  const personIds = ((students ?? []) as Row[]).map((s) => str(s.person_id));
  const { data: people } = personIds.length
    ? await db.from("people").select("id, full_name").eq("school_id", schoolId).in("id", personIds)
    : { data: [] as Row[] };
  const personName = new Map(((people ?? []) as Row[]).map((p) => [str(p.id), str(p.full_name)]));
  const personOf = new Map(((students ?? []) as Row[]).map((s) => [str(s.id), str(s.person_id)]));
  for (const e of (enrollments ?? []) as Row[]) {
    const personId = personOf.get(str(e.student_id)) ?? "";
    names.set(str(e.id), {
      name: personName.get(personId) || "Aluno",
      studentId: str(e.student_id),
      personId,
    });
  }
  return names;
}
