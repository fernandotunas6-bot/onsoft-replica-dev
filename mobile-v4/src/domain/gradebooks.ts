import type { AcademicCatalog } from "./catalog";
import type { Context } from "./model";
export const itemKinds = [
  "continuous",
  "assignment",
  "test",
  "term_exam",
  "exam",
  "resit",
  "recovery",
  "informative",
] as const;
export interface AcademicGradebooks {
  schoolId: string;
  role: "professor";
  books: {
    id: string;
    classSubjectId: string;
    term: { id: string; name: string; sequence: number };
    status: "draft" | "open" | "submitted" | "closed";
    items: {
      id: string;
      code: string;
      name: string;
      kind: (typeof itemKinds)[number];
      maxScore: number;
      sequence: number;
      assessedOn: string | null;
      scores: { enrollmentId: string; value: number; status: "draft" | "submitted" | "locked" }[];
    }[];
  }[];
}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, expected: string[]) =>
  Object.keys(v).length === expected.length && expected.every((k) => k in v);
const uuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const text = (v: unknown, max: number): v is string =>
  typeof v === "string" && !!v.trim() && v.length <= max;
const positive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const sequence = (v: unknown) => positive(v) && Number.isInteger(v);
const date = (v: unknown) =>
  v === null ||
  (typeof v === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    Number.isFinite(Date.parse(v)) &&
    new Date(v).toISOString().slice(0, 10) === v);
/** Teacher-only internal components. Closed/locked never implies published to students. */
export function parseAcademicGradebooks(
  value: unknown,
  ctx: Context,
  catalog: AcademicCatalog,
): AcademicGradebooks {
  const invalid = (): never => {
    throw new Error("Contrato de diários inválido.");
  };
  if (
    !object(value) ||
    !keys(value, ["schoolId", "role", "books"]) ||
    ctx.role !== "professor" ||
    value.role !== ctx.role ||
    value.schoolId !== ctx.schoolId ||
    catalog.role !== ctx.role ||
    catalog.schoolId !== ctx.schoolId ||
    !Array.isArray(value.books) ||
    value.books.length > 1000
  )
    return invalid();
  const bookIds = new Set<string>(),
    pairs = new Set<string>(),
    itemIds = new Set<string>();
  let totalItems = 0,
    totalScores = 0;
  for (const book of value.books) {
    if (
      !object(book) ||
      !keys(book, ["id", "classSubjectId", "term", "status", "items"]) ||
      !uuid(book.id) ||
      bookIds.has(book.id) ||
      !uuid(book.classSubjectId) ||
      !object(book.term) ||
      !keys(book.term, ["id", "name", "sequence"]) ||
      !uuid(book.term.id) ||
      !text(book.term.name, 500) ||
      !sequence(book.term.sequence) ||
      !["draft", "open", "submitted", "closed"].includes(String(book.status)) ||
      !Array.isArray(book.items)
    )
      return invalid();
    const c = catalog.classes.find((c) => c.classSubjectId === book.classSubjectId);
    const pair = `${book.classSubjectId}:${book.term.id}`;
    if (!c || c.teacher?.userId !== ctx.userId || pairs.has(pair)) return invalid();
    pairs.add(pair);
    bookIds.add(book.id);
    const codes = new Set<string>();
    for (const item of book.items) {
      if (
        ++totalItems > 1000 ||
        !object(item) ||
        !keys(item, [
          "id",
          "code",
          "name",
          "kind",
          "maxScore",
          "sequence",
          "assessedOn",
          "scores",
        ]) ||
        !uuid(item.id) ||
        itemIds.has(item.id) ||
        typeof item.code !== "string" ||
        !/^[A-Z0-9_-]{2,30}$/.test(item.code) ||
        codes.has(item.code) ||
        !text(item.name, 120) ||
        !itemKinds.includes(item.kind as (typeof itemKinds)[number]) ||
        !positive(item.maxScore) ||
        !sequence(item.sequence) ||
        !date(item.assessedOn) ||
        !Array.isArray(item.scores)
      )
        return invalid();
      itemIds.add(item.id);
      codes.add(item.code);
      const enrollments = new Set<string>();
      for (const score of item.scores) {
        if (
          ++totalScores > 1000 ||
          !object(score) ||
          !keys(score, ["enrollmentId", "value", "status"]) ||
          !uuid(score.enrollmentId) ||
          enrollments.has(score.enrollmentId) ||
          !c.students.some((s) => s.enrollmentId === score.enrollmentId) ||
          typeof score.value !== "number" ||
          !Number.isFinite(score.value) ||
          score.value < 0 ||
          score.value > item.maxScore ||
          !["draft", "submitted", "locked"].includes(String(score.status))
        )
          return invalid();
        enrollments.add(score.enrollmentId);
      }
    }
  }
  return value as unknown as AcademicGradebooks;
}
