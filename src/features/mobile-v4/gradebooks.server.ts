import type { requireMobileAcademicAccess } from "./authorization";
import type { MobileAcademicScope } from "./academic-scope.server";
import type { AcademicCatalog } from "../../../mobile-v4/src/domain/catalog";
import {
  parseAcademicGradebooks,
  type AcademicGradebooks,
} from "../../../mobile-v4/src/domain/gradebooks";
import { MobileApiError } from "./errors";
type Db = Awaited<ReturnType<typeof requireMobileAcademicAccess>>["db"];
async function read<T>(
  query: PromiseLike<{ data: T[] | null; count: number | null; error: unknown }>,
): Promise<T[]> {
  const r = await query;
  if (r.error || !r.data || r.count == null || r.count !== r.data.length)
    throw new MobileApiError(503, "GRADEBOOKS_UNAVAILABLE");
  return r.data;
}
export async function readMobileGradebooks(
  db: Db,
  scope: MobileAcademicScope,
  catalog: AcademicCatalog,
  userId: string,
): Promise<AcademicGradebooks> {
  if (scope.role !== "professor") throw new MobileApiError(403, "GRADEBOOKS_TEACHER_ONLY");
  const response: AcademicGradebooks = { schoolId: scope.schoolId, role: "professor", books: [] };
  if (!scope.classSubjectIds.length) return response;
  const raw = await read<{
    id: string;
    class_subject_id: string;
    class_group_id: string;
    academic_year_id: string;
    term_id: string;
    status: string;
  }>(
    db
      .from("gradebooks")
      .select("id, class_subject_id, class_group_id, academic_year_id, term_id, status", {
        count: "exact",
      })
      .eq("school_id", scope.schoolId)
      .in("class_subject_id", scope.classSubjectIds)
      .limit(1000),
  );
  const books = raw.filter((b) =>
    catalog.classes.some(
      (c) =>
        c.classSubjectId === b.class_subject_id &&
        c.classGroupId === b.class_group_id &&
        c.academicYearId === b.academic_year_id &&
        c.teacher?.id === scope.teacherId,
    ),
  );
  if (!books.length) return response;
  const terms = await read<{
    id: string;
    academic_year_id: string;
    name: string;
    sequence: number;
  }>(
    db
      .from("terms")
      .select("id, academic_year_id, name, sequence", { count: "exact" })
      .eq("school_id", scope.schoolId)
      .in("id", [...new Set(books.map((b) => b.term_id))])
      .limit(1000),
  );
  if (
    books.some(
      (b) => !terms.some((t) => t.id === b.term_id && t.academic_year_id === b.academic_year_id),
    )
  )
    throw new MobileApiError(503, "GRADEBOOKS_INCONSISTENT");
  const items = await read<{
    id: string;
    gradebook_id: string;
    code: string;
    name: string;
    kind: string;
    max_score: number;
    sequence: number;
    assessed_on: string | null;
  }>(
    db
      .from("grade_items")
      .select("id, gradebook_id, code, name, kind, max_score, sequence, assessed_on", {
        count: "exact",
      })
      .eq("school_id", scope.schoolId)
      .in(
        "gradebook_id",
        books.map((b) => b.id),
      )
      .limit(1000),
  );
  const enrollments = [
    ...new Set(catalog.classes.flatMap((c) => c.students.map((s) => s.enrollmentId))),
  ];
  const scores =
    items.length && enrollments.length
      ? await read<{ grade_item_id: string; enrollment_id: string; score: number; status: string }>(
          db
            .from("grade_scores")
            .select("grade_item_id, enrollment_id, score, status", { count: "exact" })
            .eq("school_id", scope.schoolId)
            .in(
              "grade_item_id",
              items.map((i) => i.id),
            )
            .in("enrollment_id", enrollments)
            .limit(1000),
        )
      : [];
  response.books = books
    .map((b) => {
      const term = terms.find((t) => t.id === b.term_id)!;
      const c = catalog.classes.find((c) => c.classSubjectId === b.class_subject_id)!;
      const allowed = new Set(c.students.map((s) => s.enrollmentId));
      return {
        id: b.id,
        classSubjectId: b.class_subject_id,
        term: { id: term.id, name: term.name, sequence: term.sequence },
        status: b.status as AcademicGradebooks["books"][number]["status"],
        items: items
          .filter((i) => i.gradebook_id === b.id)
          .map((i) => ({
            id: i.id,
            code: i.code,
            name: i.name,
            kind: i.kind as AcademicGradebooks["books"][number]["items"][number]["kind"],
            maxScore: i.max_score,
            sequence: i.sequence,
            assessedOn: i.assessed_on,
            scores: scores
              .filter((s) => s.grade_item_id === i.id && allowed.has(s.enrollment_id))
              .map((s) => ({
                enrollmentId: s.enrollment_id,
                value: s.score,
                status: s.status as "draft" | "submitted" | "locked",
              })),
          }))
          .sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id)),
      };
    })
    .sort(
      (a, b) =>
        a.term.sequence - b.term.sequence ||
        a.classSubjectId.localeCompare(b.classSubjectId) ||
        a.id.localeCompare(b.id),
    );
  try {
    return parseAcademicGradebooks(
      response,
      { schoolId: scope.schoolId, userId, role: scope.role },
      catalog,
    );
  } catch {
    throw new MobileApiError(503, "GRADEBOOKS_INCONSISTENT");
  }
}
