import type { requireMobileAcademicAccess } from "./authorization";
import type { MobileAcademicScope } from "./academic-scope.server";
import type { AcademicCatalog } from "../../../mobile-v4/src/domain/catalog";
import { parseAcademicResults } from "../../../mobile-v4/src/domain/results";
import { MobileApiError } from "./errors";
type Db = Awaited<ReturnType<typeof requireMobileAcademicAccess>>["db"];
async function read<T>(
  query: PromiseLike<{ data: T[] | null; count: number | null; error: unknown }>,
): Promise<T[]> {
  const r = await query;
  if (r.error || !r.data || r.count == null || r.count !== r.data.length)
    throw new MobileApiError(503, "RESULTS_UNAVAILABLE");
  return r.data;
}
/** Only a student's own rows from currently published sheets. No observations,
 * subject breakdowns, drafts, historic assignments or inferred calculations. */
export async function readMobileResults(
  db: Db,
  scope: MobileAcademicScope,
  catalog: AcademicCatalog,
  userId: string,
) {
  if (scope.role !== "aluno") throw new MobileApiError(403, "RESULTS_STUDENT_ONLY");
  const response = {
    schoolId: scope.schoolId,
    role: "aluno" as const,
    sheets: [] as import("../../../mobile-v4/src/domain/results").AcademicResults["sheets"],
  };
  if (!scope.enrollmentIds.length || !catalog.classes.length) return response;
  const sheets = await read<{
    id: string;
    class_group_id: string;
    academic_year_id: string;
    title: string;
    kind: string;
    published_at: string | null;
  }>(
    db
      .from("grade_sheets")
      .select("id, class_group_id, academic_year_id, title, kind, published_at", { count: "exact" })
      .eq("school_id", scope.schoolId)
      .eq("status", "published")
      .in("class_group_id", scope.classGroupIds)
      .limit(1000),
  );
  const visible = sheets.filter((s) =>
    catalog.classes.some(
      (c) => c.classGroupId === s.class_group_id && c.academicYearId === s.academic_year_id,
    ),
  );
  if (visible.some((s) => !s.published_at)) throw new MobileApiError(503, "RESULTS_INCONSISTENT");
  if (!visible.length) return response;
  const rows = await read<{
    grade_sheet_id: string;
    enrollment_id: string;
    continuous_average: number | null;
    exam_average: number | null;
    term_average: number | null;
    result: string;
  }>(
    db
      .from("grade_sheet_rows")
      .select(
        "grade_sheet_id, enrollment_id, continuous_average, exam_average, term_average, result",
        { count: "exact" },
      )
      .eq("school_id", scope.schoolId)
      .in(
        "grade_sheet_id",
        visible.map((s) => s.id),
      )
      .in("enrollment_id", scope.enrollmentIds)
      .limit(1000),
  );
  response.sheets = rows
    .map((r) => {
      const s = visible.find((s) => s.id === r.grade_sheet_id)!;
      return {
        id: s.id,
        classGroupId: s.class_group_id,
        academicYearId: s.academic_year_id,
        enrollmentId: r.enrollment_id,
        title: s.title,
        kind: s.kind as "term" | "annual",
        publishedAt: s.published_at!,
        continuousAverage: r.continuous_average,
        examAverage: r.exam_average,
        termAverage: r.term_average,
        result:
          r.result as import("../../../mobile-v4/src/domain/results").AcademicResults["sheets"][number]["result"],
      };
    })
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id));
  try {
    return parseAcademicResults(
      response,
      { userId, schoolId: scope.schoolId, role: scope.role },
      catalog,
    );
  } catch {
    throw new MobileApiError(503, "RESULTS_INCONSISTENT");
  }
}
