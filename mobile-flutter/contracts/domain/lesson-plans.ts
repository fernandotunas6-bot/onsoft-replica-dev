import type { AcademicCatalog } from "./catalog";
import type { Context } from "./model";

/**
 * Planos de aula do professor: só das turmas-disciplinas que lecciona, com os
 * rascunhos (são dele). Só leitura — criar e editar fica no portal, porque um
 * plano gera as avaliações da pauta da turma.
 */
export interface AcademicLessonPlans {
  schoolId: string;
  role: "professor";
  plans: {
    id: string;
    classSubjectId: string;
    term: 1 | 2 | 3;
    title: string;
    content: string | null;
    fileName: string | null;
    status: "draft" | "published";
    updatedAt: string;
    components: { kind: "avaliacao" | "prova"; name: string; plannedCount: number }[];
  }[];
}

export const LESSON_PLAN_CONTENT_MAX = 50_000;

const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, expected: string[]) =>
  Object.keys(v).length === expected.length && expected.every((k) => k in v);
const uuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const text = (v: unknown, max: number): v is string =>
  typeof v === "string" && !!v.trim() && v.length <= max;
const optional = (v: unknown, max: number) => v === null || text(v, max);
const instant = (v: unknown) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v) &&
  Number.isFinite(Date.parse(v));

export function parseAcademicLessonPlans(
  value: unknown,
  ctx: Context,
  catalog: AcademicCatalog,
): AcademicLessonPlans {
  const invalid = (): never => {
    throw new Error("Contrato de planos de aula inválido.");
  };
  if (
    !object(value) ||
    !keys(value, ["schoolId", "role", "plans"]) ||
    ctx.role !== "professor" ||
    value.role !== ctx.role ||
    value.schoolId !== ctx.schoolId ||
    catalog.role !== ctx.role ||
    catalog.schoolId !== ctx.schoolId ||
    !Array.isArray(value.plans) ||
    value.plans.length > 1000
  )
    return invalid();
  const ids = new Set<string>();
  let components = 0;
  for (const plan of value.plans) {
    if (
      !object(plan) ||
      !keys(plan, [
        "id",
        "classSubjectId",
        "term",
        "title",
        "content",
        "fileName",
        "status",
        "updatedAt",
        "components",
      ]) ||
      !uuid(plan.id) ||
      ids.has(plan.id) ||
      !uuid(plan.classSubjectId) ||
      ![1, 2, 3].includes(plan.term as number) ||
      !text(plan.title, 300) ||
      !optional(plan.content, LESSON_PLAN_CONTENT_MAX) ||
      !optional(plan.fileName, 300) ||
      !["draft", "published"].includes(String(plan.status)) ||
      !instant(plan.updatedAt) ||
      !Array.isArray(plan.components)
    )
      return invalid();
    const c = catalog.classes.find((c) => c.classSubjectId === plan.classSubjectId);
    if (!c || c.teacher?.userId !== ctx.userId) return invalid();
    ids.add(plan.id);
    for (const component of plan.components) {
      if (
        ++components > 5000 ||
        !object(component) ||
        !keys(component, ["kind", "name", "plannedCount"]) ||
        !["avaliacao", "prova"].includes(String(component.kind)) ||
        !text(component.name, 200) ||
        typeof component.plannedCount !== "number" ||
        !Number.isInteger(component.plannedCount) ||
        component.plannedCount < 0 ||
        component.plannedCount > 100
      )
        return invalid();
    }
  }
  return value as unknown as AcademicLessonPlans;
}
