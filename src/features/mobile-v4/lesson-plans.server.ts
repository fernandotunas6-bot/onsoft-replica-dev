/**
 * Planos de aula do professor no Mobile V4 — as regras de
 * `src/features/lesson-plans/server.ts`, mas só das turmas-disciplinas que o
 * professor lecciona (o portal mostra ao pessoal os da escola inteira). Os
 * rascunhos entram: são do professor. Só leitura: um plano gera as avaliações
 * da pauta, por isso criar e editar fica no portal.
 *
 * `siga_lesson_plans` liga-se à turma e à disciplina, não à turma-disciplina:
 * o par (class_group_id, subject_id) tem de corresponder a uma única
 * turma-disciplina do catálogo do professor.
 */
import type { requireMobileAcademicAccess } from "./authorization";
import type { MobileAcademicScope } from "./academic-scope.server";
import type { AcademicCatalog } from "../../../mobile-flutter/contracts/domain/catalog";
import {
  LESSON_PLAN_CONTENT_MAX,
  parseAcademicLessonPlans,
  type AcademicLessonPlans,
} from "../../../mobile-flutter/contracts/domain/lesson-plans";
import { MobileApiError } from "./errors";

type Db = Awaited<ReturnType<typeof requireMobileAcademicAccess>>["db"];
async function read<T>(
  query: PromiseLike<{ data: T[] | null; count: number | null; error: unknown }>,
): Promise<T[]> {
  const r = await query;
  if (r.error || !r.data || r.count == null || r.count !== r.data.length)
    throw new MobileApiError(503, "LESSON_PLANS_UNAVAILABLE");
  return r.data;
}
const filled = (v: string | null | undefined) => (v && v.trim() ? v : null);

export async function readMobileLessonPlans(
  db: Db,
  scope: MobileAcademicScope,
  catalog: AcademicCatalog,
  userId: string,
): Promise<AcademicLessonPlans> {
  if (scope.role !== "professor") throw new MobileApiError(403, "LESSON_PLANS_TEACHER_ONLY");
  const response: AcademicLessonPlans = { schoolId: scope.schoolId, role: "professor", plans: [] };
  const mine = catalog.classes.filter((c) => c.teacher?.id === scope.teacherId);
  if (!mine.length) return response;
  const byPair = new Map<string, string>();
  for (const c of mine) byPair.set(`${c.classGroupId}:${c.subjectId}`, c.classSubjectId);

  const rows = await read<{
    id: string;
    class_group_id: string;
    subject_id: string;
    term: number;
    title: string;
    content: string | null;
    file_name: string | null;
    status: string;
    updated_at: string;
  }>(
    db
      .from("siga_lesson_plans")
      .select(
        "id, class_group_id, subject_id, term, title, content, file_name, status, updated_at",
        { count: "exact" },
      )
      .eq("school_id", scope.schoolId)
      .in("class_group_id", [...new Set(mine.map((c) => c.classGroupId))])
      .in("subject_id", [...new Set(mine.map((c) => c.subjectId))])
      .in("status", ["draft", "published"])
      .limit(1000),
  );
  // O filtro por turma e por disciplina, em separado, ainda deixa passar pares
  // que o professor não lecciona (a sua turma A com a disciplina que dá na B).
  const plans = rows.filter((p) => byPair.has(`${p.class_group_id}:${p.subject_id}`));
  if (!plans.length) return response;

  // Em pedaços: centenas de IDs num só GET davam um URL demasiado longo.
  const planIds = plans.map((p) => p.id);
  const chunks: string[][] = [];
  for (let i = 0; i < planIds.length; i += 150) chunks.push(planIds.slice(i, i + 150));
  const components = (
    await Promise.all(
      chunks.map((chunk) =>
        read<{
          lesson_plan_id: string;
          kind: string;
          name: string;
          planned_count: number;
          sequence: number;
        }>(
          db
            .from("siga_lesson_plan_components")
            .select("lesson_plan_id, kind, name, planned_count, sequence", { count: "exact" })
            .eq("school_id", scope.schoolId)
            .in("lesson_plan_id", chunk)
            .limit(5000),
        ),
      ),
    )
  ).flat();

  response.plans = plans
    .map((p) => ({
      id: p.id,
      classSubjectId: byPair.get(`${p.class_group_id}:${p.subject_id}`)!,
      term: p.term as 1 | 2 | 3,
      title: p.title.trim(),
      content: filled(p.content)?.slice(0, LESSON_PLAN_CONTENT_MAX) ?? null,
      fileName: filled(p.file_name),
      status: p.status as "draft" | "published",
      updatedAt: p.updated_at,
      components: components
        .filter((c) => c.lesson_plan_id === p.id)
        .sort((a, b) => a.sequence - b.sequence)
        .map((c) => ({
          kind: c.kind as "avaliacao" | "prova",
          name: c.name.trim(),
          plannedCount: c.planned_count,
        })),
    }))
    .sort(
      (a, b) =>
        a.term - b.term || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
    );
  try {
    return parseAcademicLessonPlans(
      response,
      { userId, schoolId: scope.schoolId, role: scope.role },
      catalog,
    );
  } catch {
    throw new MobileApiError(503, "LESSON_PLANS_INCONSISTENT");
  }
}
