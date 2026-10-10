import type { requireMobileAcademicAccess } from "./authorization";
import type { MobileAcademicScope } from "./academic-scope.server";
import type { AcademicCatalog } from "../../../mobile-v4/src/domain/catalog";
import type { AcademicAttendance, AttendanceRange } from "../../../mobile-v4/src/domain/attendance";
import { MobileApiError } from "./errors";
type Db = Awaited<ReturnType<typeof requireMobileAcademicAccess>>["db"];
async function read<T>(
  query: PromiseLike<{ data: T[] | null; count: number | null; error: unknown }>,
): Promise<T[]> {
  const r = await query;
  if (r.error || !r.data || r.count == null || r.count !== r.data.length)
    throw new MobileApiError(503, "ATTENDANCE_UNAVAILABLE");
  return r.data;
}
type Session = {
  id: string;
  class_group_id: string;
  subject_id: string;
  academic_year_id: string | null;
  teacher_id: string | null;
  lesson_date: string;
  starts_at: string | null;
  ends_at: string | null;
  status: string;
};
const unique = (ids: string[]) => [...new Set(ids)];
/** Read-only legacy Sga attendance projection. No notes, payroll fields,
 * implicit attendance, unrelated pupils or automatic session materialisation. */
export async function readMobileAttendance(
  db: Db,
  scope: MobileAcademicScope,
  catalog: AcademicCatalog,
  range: AttendanceRange,
): Promise<AcademicAttendance> {
  const result: AcademicAttendance = {
    schoolId: scope.schoolId,
    role: scope.role,
    ...range,
    sessions: [],
    teacherLessons: [],
  };
  if (!catalog.classes.length) return result;
  let query = db
    .from("siga_attendance_sessions")
    .select(
      "id, class_group_id, subject_id, academic_year_id, teacher_id, lesson_date, starts_at, ends_at, status",
      { count: "exact" },
    )
    .eq("school_id", scope.schoolId)
    .in("class_group_id", scope.classGroupIds)
    .in("subject_id", unique(catalog.classes.map((c) => c.subjectId)))
    .gte("lesson_date", range.from)
    .lte("lesson_date", range.to);
  if (scope.role === "professor") query = query.eq("teacher_id", scope.teacherId!);
  const rows = await read<Session>(query.limit(1000));
  const visible = rows.flatMap((row) => {
    const matches = catalog.classes.filter(
      (c) => c.classGroupId === row.class_group_id && c.subjectId === row.subject_id,
    );
    if (!matches.length) return []; // group/subject cross-product is not an assignment.
    if (matches.length !== 1) throw new MobileApiError(503, "ATTENDANCE_INCONSISTENT");
    const c = matches[0];
    if (row.academic_year_id && row.academic_year_id !== c.academicYearId) return [];
    if (row.teacher_id && row.teacher_id !== c.teacher?.id) return []; // previous/unrelated teacher.
    if (!["pending", "completed", "cancelled"].includes(row.status))
      throw new MobileApiError(503, "ATTENDANCE_INCONSISTENT");
    return [{ row, c }];
  });
  const complete = visible.filter((s) => s.row.status === "completed");
  const students = unique(catalog.classes.flatMap((c) => c.students.map((s) => s.studentId)));
  let records: { session_id: string; student_id: string; status: string }[] = [];
  if (complete.length && students.length) {
    let rq = db
      .from("siga_attendance_records")
      .select("session_id, student_id, status", { count: "exact" })
      .eq("school_id", scope.schoolId)
      .in(
        "session_id",
        complete.map((s) => s.row.id),
      )
      .in("student_id", students);
    if (scope.role === "aluno") rq = rq.eq("student_id", scope.studentId!);
    records = await read(rq.limit(1000));
  }
  result.sessions = visible
    .map(({ row, c }) => {
      const allowed = new Set(c.students.map((s) => s.studentId));
      const seen = new Set<string>();
      const marks = records
        .filter((r) => r.session_id === row.id && allowed.has(r.student_id))
        .map((r) => {
          if (
            seen.has(r.student_id) ||
            !["present", "absent", "excused", "late", "early_exit", "not_registered"].includes(
              r.status,
            )
          )
            throw new MobileApiError(503, "ATTENDANCE_INCONSISTENT");
          seen.add(r.student_id);
          return {
            studentId: r.student_id,
            status: r.status as AcademicAttendance["sessions"][number]["records"][number]["status"],
          };
        });
      return {
        id: row.id,
        classSubjectId: c.classSubjectId,
        date: row.lesson_date,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        status: row.status as AcademicAttendance["sessions"][number]["status"],
        records: marks,
      };
    })
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.startsAt ?? "").localeCompare(b.startsAt ?? "") ||
        a.id.localeCompare(b.id),
    );
  if (scope.role === "professor") {
    const lessons = await read<{
      id: string;
      class_subject_id: string;
      lesson_date: string;
      scheduled_starts_at: string;
      scheduled_ends_at: string;
      status: string;
    }>(
      db
        .from("hr_teacher_lesson_occurrences")
        .select(
          "id, class_subject_id, lesson_date, scheduled_starts_at, scheduled_ends_at, status",
          { count: "exact" },
        )
        .eq("school_id", scope.schoolId)
        .eq("teacher_id", scope.teacherId!)
        .is("deleted_at", null)
        .in("class_subject_id", scope.classSubjectIds)
        .gte("lesson_date", range.from)
        .lte("lesson_date", range.to)
        .limit(1000),
    );
    result.teacherLessons = lessons
      .map((l) => {
        if (!["scheduled", "confirmed", "rejected", "cancelled"].includes(l.status))
          throw new MobileApiError(503, "ATTENDANCE_INCONSISTENT");
        return {
          id: l.id,
          classSubjectId: l.class_subject_id,
          date: l.lesson_date,
          startsAt: l.scheduled_starts_at,
          endsAt: l.scheduled_ends_at,
          status: l.status as AcademicAttendance["teacherLessons"][number]["status"],
        };
      })
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          a.startsAt.localeCompare(b.startsAt) ||
          a.id.localeCompare(b.id),
      );
  }
  return result;
}
