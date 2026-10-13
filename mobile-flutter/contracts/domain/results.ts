import type { Context } from "./model";
import type { AcademicCatalog } from "./catalog";

export interface AcademicResults {
  schoolId: string;
  role: "aluno";
  sheets: {
    id: string;
    classGroupId: string;
    academicYearId: string;
    enrollmentId: string;
    title: string;
    kind: "term" | "annual";
    publishedAt: string;
    continuousAverage: number | null;
    examAverage: number | null;
    termAverage: number | null;
    result: "pending" | "pass" | "fail" | "incomplete";
  }[];
}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, expected: string[]) =>
  Object.keys(v).length === expected.length && expected.every((k) => k in v);
const uuid = (v: unknown) =>
  typeof v === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const average = (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v));
/** Published institutional averages, not inferred subject scores or a fixed grading scale. */
export function parseAcademicResults(
  value: unknown,
  ctx: Context,
  catalog: AcademicCatalog,
): AcademicResults {
  const invalid = (): never => {
    throw new Error("Contrato de resultados inválido.");
  };
  if (
    !object(value) ||
    !keys(value, ["schoolId", "role", "sheets"]) ||
    ctx.role !== "aluno" ||
    value.role !== ctx.role ||
    value.schoolId !== ctx.schoolId ||
    catalog.role !== ctx.role ||
    catalog.schoolId !== ctx.schoolId ||
    !Array.isArray(value.sheets) ||
    value.sheets.length > 1000
  )
    return invalid();
  const seen = new Set<string>();
  for (const s of value.sheets) {
    if (
      !object(s) ||
      !keys(s, [
        "id",
        "classGroupId",
        "academicYearId",
        "enrollmentId",
        "title",
        "kind",
        "publishedAt",
        "continuousAverage",
        "examAverage",
        "termAverage",
        "result",
      ]) ||
      !uuid(s.id) ||
      !uuid(s.classGroupId) ||
      !uuid(s.academicYearId) ||
      !uuid(s.enrollmentId) ||
      typeof s.title !== "string" ||
      !s.title.trim() ||
      s.title.length > 500 ||
      !["term", "annual"].includes(String(s.kind)) ||
      typeof s.publishedAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(s.publishedAt) ||
      !Number.isFinite(Date.parse(s.publishedAt)) ||
      !["pending", "pass", "fail", "incomplete"].includes(String(s.result)) ||
      !average(s.continuousAverage) ||
      !average(s.examAverage) ||
      !average(s.termAverage)
    )
      return invalid();
    const key = `${s.id}:${s.enrollmentId}`;
    if (
      seen.has(key) ||
      !catalog.classes.some(
        (c) =>
          c.classGroupId === s.classGroupId &&
          c.academicYearId === s.academicYearId &&
          c.students.some((p) => p.enrollmentId === s.enrollmentId && p.userId === ctx.userId),
      )
    )
      return invalid();
    seen.add(key);
  }
  return value as unknown as AcademicResults;
}
