/**
 * Leituras partilhadas por exames e resultado final (só servidor): pauta
 * anual, regra com que foi gerada, nomes dos alunos.
 */
import type { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { ROUNDING_METHODS, type RoundingMethod } from "./assessment-model";
import { absencePercentageFromStatuses, type BreakdownEntry, type EngineRule } from "./exam-engine";

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
  const sheetRows = (rows ?? []) as Row[];
  const absences = await absenceByEnrollment(
    db,
    schoolId,
    yearId,
    classGroupId,
    sheetRows.map((r) => str(r.enrollment_id)),
  );
  return {
    id: str(sheet.id),
    status: str(sheet.status),
    rule,
    rows: sheetRows.map((r) => ({
      enrollmentId: str(r.enrollment_id),
      // As presenças do SIGA mandam; a percentagem gravada na pauta só serve de
      // recurso (build_grade_sheet lê `attendance_records`, que o SIGA não usa).
      absencePercentage: absences.has(str(r.enrollment_id))
        ? absences.get(str(r.enrollment_id))!
        : numOrNull(r.absence_percentage),
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

/**
 * Faltas por matrícula a partir das presenças do SIGA (`siga_attendance_*`),
 * que é onde a chamada grava. Só entram matrículas com aulas registadas.
 */
export async function absenceByEnrollment(
  db: Db,
  schoolId: string,
  yearId: string,
  classGroupId: string,
  enrollmentIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (!enrollmentIds.length) return result;
  const { data: enrollments } = await db
    .from("enrollments")
    .select("id, student_id")
    .eq("school_id", schoolId)
    .in("id", enrollmentIds);
  const enrollmentOfStudent = new Map(
    ((enrollments ?? []) as Row[]).map((e) => [str(e.student_id), str(e.id)]),
  );
  if (!enrollmentOfStudent.size) return result;

  const { data: sessions, error: sessionsError } = await db
    .from("siga_attendance_sessions")
    .select("id")
    .eq("school_id", schoolId)
    .eq("academic_year_id", yearId)
    .eq("class_group_id", classGroupId)
    .limit(5000);
  if (sessionsError || !sessions?.length) return result;
  const sessionIds = (sessions as Row[]).map((s) => str(s.id));

  const statuses = new Map<string, string[]>();
  for (let i = 0; i < sessionIds.length; i += 200) {
    for (let from = 0; ; from += 1000) {
      const { data: records, error } = await db
        .from("siga_attendance_records")
        .select("student_id, status")
        .eq("school_id", schoolId)
        .in("session_id", sessionIds.slice(i, i + 200))
        .range(from, from + 999);
      if (error) return result;
      for (const r of (records ?? []) as Row[]) {
        const enrollmentId = enrollmentOfStudent.get(str(r.student_id));
        if (!enrollmentId) continue;
        const list = statuses.get(enrollmentId) ?? [];
        list.push(str(r.status));
        statuses.set(enrollmentId, list);
      }
      if (!records || records.length < 1000) break;
    }
  }
  for (const [enrollmentId, list] of statuses) {
    const pct = absencePercentageFromStatuses(list);
    if (pct != null) result.set(enrollmentId, pct);
  }
  return result;
}

/** Nota de aprovação do modelo de avaliação em vigor; sem modelo, a da escala angolana. */
export async function loadActivePassingValue(db: Db, schoolId: string): Promise<number> {
  const { data } = await db
    .from("assessment_rule_sets")
    .select("passing_value")
    .eq("school_id", schoolId)
    .eq("code", "DEFAULT")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  const value = data?.passing_value == null ? NaN : Number(data.passing_value);
  return Number.isFinite(value) ? value : 10;
}
