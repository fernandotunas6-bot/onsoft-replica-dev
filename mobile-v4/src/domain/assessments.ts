import type { AcademicCatalog } from "./catalog";
import type { Context } from "./model";

/** Avaliações do professor com as notas lançadas e a versão de cada nota. */
export interface TeacherAssessments {
  schoolId: string;
  items: TeacherAssessment[];
}
export interface TeacherAssessment {
  id: string;
  classSubjectId: string;
  term: number;
  name: string;
  kind: string;
  assessedOn: string | null;
  maxScore: number | null;
  scores: { enrollmentId: string; score: number | null; updatedAt: string | null }[];
}
export interface ScoreEntry {
  enrollmentId: string;
  score: number | null;
  expectedUpdatedAt: string | null;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function fail(): never {
  throw new Error("Contrato das avaliações inválido.");
}
const finiteOrNull = (value: unknown) =>
  value === null ? null : typeof value === "number" && Number.isFinite(value) ? value : fail();
const textOrNull = (value: unknown) =>
  value === null ? null : typeof value === "string" ? value : fail();

/** Falha fechada: escola, disciplina e alunos têm de vir do âmbito autorizado. */
export function parseTeacherAssessments(
  data: unknown,
  ctx: Context,
  catalog: AcademicCatalog,
): TeacherAssessments {
  if (ctx.role !== "professor" || catalog.schoolId !== ctx.schoolId) fail();
  if (!data || typeof data !== "object" || Array.isArray(data)) fail();
  const raw = data as Record<string, unknown>;
  if (raw.schoolId !== ctx.schoolId || !Array.isArray(raw.items)) fail();
  const classes = new Map(catalog.classes.map((c) => [c.classSubjectId, c]));
  const seen = new Set<string>();
  const items = raw.items.map((entry): TeacherAssessment => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) fail();
    const item = entry as Record<string, unknown>;
    if (typeof item.id !== "string" || !uuid.test(item.id) || seen.has(item.id)) fail();
    seen.add(item.id);
    const group = typeof item.classSubjectId === "string" && classes.get(item.classSubjectId);
    if (!group) fail();
    if (typeof item.term !== "number" || ![1, 2, 3].includes(item.term)) fail();
    if (typeof item.name !== "string" || typeof item.kind !== "string") fail();
    if (!Array.isArray(item.scores)) fail();
    const roster = new Set(group.students.map((s) => s.enrollmentId));
    const marked = new Set<string>();
    const scores = item.scores.map((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) fail();
      const row = value as Record<string, unknown>;
      if (typeof row.enrollmentId !== "string" || marked.has(row.enrollmentId)) fail();
      marked.add(row.enrollmentId);
      return {
        enrollmentId: row.enrollmentId,
        score: finiteOrNull(row.score),
        updatedAt: textOrNull(row.updatedAt),
      };
    });
    return {
      id: item.id,
      classSubjectId: group.classSubjectId,
      term: item.term,
      name: item.name,
      kind: item.kind,
      assessedOn: textOrNull(item.assessedOn),
      maxScore: finiteOrNull(item.maxScore),
      // Notas de quem já saiu da turma não se mostram nem se reenviam.
      scores: scores.filter((row) => roster.has(row.enrollmentId)),
    };
  });
  return { schoolId: ctx.schoolId, items };
}

/** Texto do campo → nota (vírgula ou ponto); vazio apaga. `undefined` = inválida. */
export function parseScoreInput(text: string, maxScore: number | null): number | null | undefined {
  const trimmed = text.trim().replace(",", ".");
  if (!trimmed) return null;
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return value > (maxScore ?? 20) ? undefined : value;
}
