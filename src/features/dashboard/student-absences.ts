/**
 * Faltas do aluno por disciplina, no ano lectivo da matrícula activa, com o
 * limite de faltas do modelo de avaliação em vigor (`maximum_absence_percentage`).
 *
 * Contam as aulas da chamada do SIGA não canceladas; uma falta justificada
 * (`excused`) e uma aula sem registo (`not_registered`) não entram na
 * percentagem — a mesma regra de `absencePercentageFromStatuses`, que a pauta e os
 * sinais de risco usam. Só o Aluno (a sua ficha) e o Encarregado (a de um
 * educando ligado) recebem dados (`resolveVisibleStudent`).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ID_CHUNK_SIZE, readAllPages, readInChunks } from "@/integrations/supabase/read-all-pages";
import { resolveVisibleStudent } from "@/features/dashboard/student-access";

export type SubjectAbsenceStatus = "ok" | "warning" | "over" | "unknown";

export type SubjectAbsences = {
  subjectId: string;
  subjectName: string;
  /** Aulas que contam para a percentagem (sem justificadas nem sem registo). */
  lessons: number;
  absences: number;
  excused: number;
  late: number;
  /** Faltas sobre as aulas que contam, 0–100, com duas casas; null sem aulas. */
  percentage: number | null;
  /**
   * Quantas faltas ainda cabem no limite, sobre as aulas dadas até hoje (null sem
   * limite). Negativo quando já passou.
   */
  remaining: number | null;
  status: SubjectAbsenceStatus;
};

export type StudentAbsences = {
  /** Limite do modelo em vigor, em %; null quando a escola não o definiu. */
  limitPercentage: number | null;
  subjects: SubjectAbsences[];
  totals: { lessons: number; absences: number; percentage: number | null };
};

const EMPTY: StudentAbsences = {
  limitPercentage: null,
  subjects: [],
  totals: { lessons: 0, absences: 0, percentage: null },
};

/** A partir daqui (em fracção do limite), a disciplina fica em aviso. */
export const WARNING_SHARE = 0.75;

const pct = (absent: number, lessons: number) =>
  lessons > 0 ? Math.round((absent * 10000) / lessons) / 100 : null;

/**
 * O cálculo, sem base de dados: uma linha por registo de chamada do aluno, já com
 * a disciplina da aula. Ordena da pior situação para a melhor.
 */
export function summarizeSubjectAbsences(
  records: Array<{ subjectId: string; status: string }>,
  subjectNames: Map<string, string>,
  limitPercentage: number | null,
): StudentAbsences {
  const limit =
    limitPercentage != null && Number.isFinite(limitPercentage) && limitPercentage > 0
      ? limitPercentage
      : null;
  const bySubject = new Map<
    string,
    { lessons: number; absences: number; excused: number; late: number }
  >();
  for (const r of records) {
    if (!r.subjectId) continue;
    const s = bySubject.get(r.subjectId) ?? { lessons: 0, absences: 0, excused: 0, late: 0 };
    if (r.status === "excused") s.excused += 1;
    else if (r.status !== "not_registered") {
      s.lessons += 1;
      if (r.status === "absent") s.absences += 1;
      if (r.status === "late") s.late += 1;
    }
    bySubject.set(r.subjectId, s);
  }

  const subjects: SubjectAbsences[] = [...bySubject.entries()].map(([subjectId, s]) => {
    const percentage = pct(s.absences, s.lessons);
    const remaining = limit == null ? null : Math.floor((limit * s.lessons) / 100) - s.absences;
    let status: SubjectAbsenceStatus = "unknown";
    if (limit != null && percentage != null) {
      status = percentage > limit ? "over" : percentage >= limit * WARNING_SHARE ? "warning" : "ok";
    }
    return {
      subjectId,
      subjectName: subjectNames.get(subjectId) ?? "Disciplina",
      lessons: s.lessons,
      absences: s.absences,
      excused: s.excused,
      late: s.late,
      percentage,
      remaining,
      status,
    };
  });
  const rank: Record<SubjectAbsenceStatus, number> = { over: 0, warning: 1, ok: 2, unknown: 3 };
  subjects.sort(
    (a, b) =>
      rank[a.status] - rank[b.status] ||
      (b.percentage ?? 0) - (a.percentage ?? 0) ||
      a.subjectName.localeCompare(b.subjectName, "pt"),
  );

  const lessons = subjects.reduce((sum, s) => sum + s.lessons, 0);
  const absences = subjects.reduce((sum, s) => sum + s.absences, 0);
  return {
    limitPercentage: limit,
    subjects,
    totals: { lessons, absences, percentage: pct(absences, lessons) },
  };
}

const inputSchema = z.object({ studentId: z.string().guid().optional() });

export const getMyAbsencesBySubject = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => inputSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<StudentAbsences> => {
    const visible = await resolveVisibleStudent(context.userId, data.studentId);
    if (!visible) return EMPTY;
    const { db, schoolId, studentId } = visible;

    const { data: enrollment } = await db
      .from("enrollments")
      .select("class_group_id")
      .eq("school_id", schoolId)
      .eq("student_id", studentId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!enrollment?.class_group_id) return EMPTY;
    const [{ data: group }, { data: rule }] = await Promise.all([
      db
        .from("class_groups")
        .select("academic_year_id")
        .eq("school_id", schoolId)
        .eq("id", String(enrollment.class_group_id))
        .maybeSingle(),
      db
        .from("assessment_rule_sets")
        .select("maximum_absence_percentage")
        .eq("school_id", schoolId)
        .eq("code", "DEFAULT")
        .eq("status", "active")
        .limit(1)
        .maybeSingle(),
    ]);
    const yearId = group?.academic_year_id ? String(group.academic_year_id) : null;
    if (!yearId) return EMPTY;
    const limit =
      rule?.maximum_absence_percentage == null ? null : Number(rule.maximum_absence_percentage);

    // Os registos do aluno; depois só as aulas deste ano que não foram canceladas.
    const records = await readAllPages<{ session_id: string; status: string }>((from, to) =>
      db
        .from("siga_attendance_records")
        .select("session_id, status")
        .eq("school_id", schoolId)
        .eq("student_id", studentId)
        .order("id", { ascending: true })
        .range(from, to),
    );
    if (records.error) throw new Error("Não foi possível ler as faltas.");
    const sessions = await readInChunks<{ id: string; subject_id: string | null }>(
      records.data.map((r) => String(r.session_id)),
      (chunk) =>
        db
          .from("siga_attendance_sessions")
          .select("id, subject_id")
          .eq("school_id", schoolId)
          .eq("academic_year_id", yearId)
          .neq("status", "cancelled")
          .in("id", chunk),
      ID_CHUNK_SIZE,
    );
    if (sessions.error) throw new Error("Não foi possível ler as faltas.");
    const subjectOf = new Map(
      sessions.data.map((s) => [String(s.id), s.subject_id ? String(s.subject_id) : ""]),
    );
    const rows = records.data
      .filter((r) => subjectOf.has(String(r.session_id)))
      .map((r) => ({ subjectId: subjectOf.get(String(r.session_id))!, status: String(r.status) }));

    const subjectIds = [...new Set(rows.map((r) => r.subjectId).filter(Boolean))];
    const names = await readInChunks<{ id: string; name: string | null }>(subjectIds, (chunk) =>
      db.from("subjects").select("id, name").eq("school_id", schoolId).in("id", chunk),
    );
    const subjectNames = new Map(
      names.data.map((s) => [String(s.id), String(s.name ?? "Disciplina")]),
    );
    return summarizeSubjectAbsences(rows, subjectNames, limit);
  });
