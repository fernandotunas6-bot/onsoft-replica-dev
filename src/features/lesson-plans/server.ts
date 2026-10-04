import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  loadSgaAdminClient,
  requireSgaWriterForWrite,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";
import { assertAssessmentTermNotLocked } from "@/features/academic/sga-grades";
import {
  createLessonPlanInputSchema,
  deleteLessonPlanInputSchema,
  getLessonPlanInputSchema,
  listLessonPlansInputSchema,
  updateLessonPlanInputSchema,
  type LessonPlanComponentInput,
} from "./schemas";

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;

export type LessonPlanSummary = {
  id: string;
  class_group_id: string;
  subject_id: string;
  term: 1 | 2 | 3;
  title: string;
  content: string | null;
  file_id: string | null;
  file_name: string | null;
  status: "draft" | "published";
  updated_at: string;
  created_by: string | null;
  class_group_name: string;
  subject_name: string;
  components: Array<{
    id: string;
    kind: "avaliacao" | "prova";
    name: string;
    planned_count: number;
    sequence: number;
  }>;
};

export type LessonPlansResult = { available: boolean; plans: LessonPlanSummary[] };

function isMissingRelation(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    /schema cache|does not exist|siga_lesson_plans|PGRST/i.test(error.message ?? "")
  );
}

/**
 * Traduz um componente do plano (avaliação/prova, nome do professor) para os campos
 * já usados pelo Centro de Avaliação — reaproveita siga_assessment_items/scores em
 * vez de duplicar o motor de notas. "avaliação" alimenta o MAC, "prova" o NPP (a
 * NPT continua reservada à prova trimestral única lançada directamente na pauta).
 */
function assessmentFieldsForKind(kind: LessonPlanComponentInput["kind"]) {
  return kind === "avaliacao"
    ? { kind: "continua" as const, component: "MAC" as const }
    : { kind: "prova" as const, component: "NPP" as const };
}

function itemNamesFor(name: string, plannedCount: number) {
  if (plannedCount <= 1) return [name];
  return Array.from({ length: plannedCount }, (_, index) => `${name} ${index + 1}`);
}

async function materializeComponentItems(
  db: Db,
  schoolId: string,
  userId: string,
  componentId: string,
  params: {
    classGroupId: string;
    subjectId: string;
    term: number;
    kind: LessonPlanComponentInput["kind"];
    name: string;
    plannedCount: number;
  },
) {
  const fields = assessmentFieldsForKind(params.kind);
  const names = itemNamesFor(params.name, params.plannedCount);
  const { error } = await db.from("siga_assessment_items").insert(
    names.map((itemName) => ({
      school_id: schoolId,
      class_group_id: params.classGroupId,
      subject_id: params.subjectId,
      term: params.term,
      name: itemName,
      kind: fields.kind,
      component: fields.component,
      max_score: 20,
      counts_toward_pauta: true,
      allow_recovery: true,
      lesson_plan_component_id: componentId,
      created_by: userId,
      updated_by: userId,
    })),
  );
  if (error) {
    throw publicDatabaseError(
      error,
      "Plano guardado, mas não foi possível criar as avaliações no Centro de Avaliação.",
    );
  }
}

async function saveComponents(
  db: Db,
  schoolId: string,
  userId: string,
  lessonPlanId: string,
  scope: { classGroupId: string; subjectId: string; term: number },
  components: LessonPlanComponentInput[],
) {
  const { data: existing, error: existingError } = await db
    .from("siga_lesson_plan_components")
    .select("id, kind, name, planned_count")
    .eq("lesson_plan_id", lessonPlanId);
  if (existingError && !isMissingRelation(existingError)) {
    throw publicDatabaseError(existingError, "Não foi possível ler os componentes do plano.");
  }
  const existingRows = (existing ?? []) as Array<{
    id: string;
    kind: string;
    name: string;
    planned_count: number;
  }>;

  // Criar ou retirar avaliações mexe na pauta: com o período fechado ou a
  // pauta homologada, o plano não altera avaliações (confirmado uma vez).
  let termChecked = false;
  const ensureTermOpen = async () => {
    if (termChecked) return;
    await assertAssessmentTermNotLocked(db, schoolId, scope.classGroupId, scope.term);
    termChecked = true;
  };

  const keyOf = (kind: string, name: string) => `${kind}:${name.trim().toLowerCase()}`;
  const existingByKey = new Map(existingRows.map((row) => [keyOf(row.kind, row.name), row]));
  const nextKeys = new Set(components.map((row) => keyOf(row.kind, row.name)));

  // Remove definições que já não constam do plano — os itens do Centro de Avaliação
  // já gerados por elas ficam (FK lesson_plan_component_id é ON DELETE SET NULL), para
  // nunca apagar uma nota já lançada.
  const toRemove = existingRows.filter((row) => !nextKeys.has(keyOf(row.kind, row.name)));
  if (toRemove.length) {
    const { error } = await db
      .from("siga_lesson_plan_components")
      .delete()
      .eq("school_id", schoolId)
      .in(
        "id",
        toRemove.map((row) => row.id),
      );
    if (error) throw publicDatabaseError(error, "Não foi possível actualizar os componentes.");
  }

  for (const [sequence, component] of components.entries()) {
    const key = keyOf(component.kind, component.name);
    const existingRow = existingByKey.get(key);
    if (!existingRow) {
      await ensureTermOpen();
      const { data: created, error } = await db
        .from("siga_lesson_plan_components")
        .insert({
          school_id: schoolId,
          lesson_plan_id: lessonPlanId,
          kind: component.kind,
          name: component.name,
          planned_count: component.plannedCount,
          sequence: sequence + 1,
        })
        .select("id")
        .single();
      if (error) throw publicDatabaseError(error, "Não foi possível guardar um componente.");
      await materializeComponentItems(db, schoolId, userId, created.id as string, {
        ...scope,
        kind: component.kind,
        name: component.name,
        plannedCount: component.plannedCount,
      });
      continue;
    }

    if (existingRow.planned_count !== component.plannedCount) {
      await ensureTermOpen();
      const { error } = await db
        .from("siga_lesson_plan_components")
        .update({ planned_count: component.plannedCount, sequence: sequence + 1 })
        .eq("id", existingRow.id)
        .eq("school_id", schoolId);
      if (error) throw publicDatabaseError(error, "Não foi possível actualizar um componente.");

      const { data: items, error: itemsError } = await db
        .from("siga_assessment_items")
        .select("id")
        .eq("lesson_plan_component_id", existingRow.id)
        .eq("school_id", schoolId);
      // Sem esta contagem criava de novo todas as avaliações (duplicadas) ou
      // decidia mal quais sobram.
      if (itemsError) {
        throw publicDatabaseError(itemsError, "Não foi possível ler as avaliações do componente.");
      }
      const currentCount = items?.length ?? 0;
      if (component.plannedCount > currentCount) {
        const missing = component.plannedCount - currentCount;
        await materializeComponentItems(db, schoolId, userId, existingRow.id, {
          ...scope,
          kind: component.kind,
          name: component.name,
          plannedCount: missing,
        });
      } else if (component.plannedCount < currentCount) {
        // Só remove itens sem notas lançadas — nunca destrói trabalho já avaliado.
        const excessIds = (items ?? [])
          .slice(component.plannedCount)
          .map((row: { id: string }) => row.id);
        if (excessIds.length) {
          const { data: scores, error: scoresError } = await db
            .from("siga_assessment_scores")
            .select("item_id")
            .eq("school_id", schoolId)
            .in("item_id", excessIds);
          // Se a leitura falhar não se sabe quais têm notas: não se apaga nada.
          if (scoresError) {
            throw publicDatabaseError(scoresError, "Não foi possível confirmar as notas lançadas.");
          }
          const scoredItemIds = new Set(
            (scores ?? []).map((row: { item_id: string }) => row.item_id),
          );
          const removable = excessIds.filter((id: string) => !scoredItemIds.has(id));
          if (removable.length) {
            const { error: removeError } = await db
              .from("siga_assessment_items")
              .delete()
              .eq("school_id", schoolId)
              .in("id", removable);
            if (removeError) {
              throw publicDatabaseError(
                removeError,
                "Não foi possível retirar as avaliações a mais.",
              );
            }
          }
        }
      }
    }
  }
}

function isLessonPlanStaff(membership: { appRole: string; allAppRoles?: string[] }) {
  const roles = membership.allAppRoles ?? [membership.appRole];
  return ["Administrador", "Secretaria", "Professor"].some((role) => roles.includes(role));
}

async function ownTeacherIds(db: Db, schoolId: string, userId: string) {
  const ids = new Set<string>();
  const { data: direct } = await db
    .from("teachers")
    .select("id")
    .eq("school_id", schoolId)
    .eq("user_id", userId)
    .eq("status", "active");
  for (const row of direct ?? []) ids.add(String(row.id));
  const { data: person } = await db
    .from("people")
    .select("id")
    .eq("school_id", schoolId)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (person?.id) {
    const { data: byPerson } = await db
      .from("teachers")
      .select("id")
      .eq("school_id", schoolId)
      .eq("person_id", String(person.id))
      .eq("status", "active");
    for (const row of byPerson ?? []) ids.add(String(row.id));
  }
  return ids;
}

/**
 * O plano gera avaliações na pauta da turma: a disciplina tem de ser da turma
 * (nesta escola) e um professor só planeia as turmas/disciplinas que lecciona.
 * A coordenação (Administrador, Secretaria) planeia qualquer uma.
 */
async function assertLessonPlanScope(
  db: Db,
  membership: { schoolId: string; appRole: string; allAppRoles?: string[] },
  userId: string,
  classGroupId: string,
  subjectId: string,
) {
  const { data: classSubject, error } = await db
    .from("class_subjects")
    .select("id, teacher_id")
    .eq("school_id", membership.schoolId)
    .eq("class_group_id", classGroupId)
    .eq("subject_id", subjectId)
    .limit(1)
    .maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível validar a turma e a disciplina.");
  if (!classSubject) throw new Error("Esta disciplina não pertence à turma escolhida.");
  const roles = membership.allAppRoles ?? [membership.appRole];
  if (roles.includes("Administrador") || roles.includes("Secretaria")) return;
  const mine = await ownTeacherIds(db, membership.schoolId, userId);
  if (!classSubject.teacher_id || !mine.has(String(classSubject.teacher_id))) {
    throw new Error("Só pode planear as turmas e disciplinas que lecciona.");
  }
}

async function loadPlanScope(db: Db, schoolId: string, planId: string) {
  const { data: plan, error } = await db
    .from("siga_lesson_plans")
    .select("id, class_group_id, subject_id")
    .eq("id", planId)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível carregar o plano de aula.");
  if (!plan) throw new Error("Plano de aula não encontrado.");
  return { classGroupId: String(plan.class_group_id), subjectId: String(plan.subject_id) };
}

export const listLessonPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listLessonPlansInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) return { available: true, plans: [] };
    const db = await loadSgaAdminClient();

    let query = db
      .from("siga_lesson_plans")
      .select(
        "id, class_group_id, subject_id, term, title, content, file_id, file_name, status, updated_at, created_by",
      )
      .eq("school_id", membership.schoolId)
      .order("updated_at", { ascending: false })
      .limit(data.limit);
    // Rascunhos são do corpo docente; alunos e encarregados só vêem os publicados.
    if (!isLessonPlanStaff(membership)) query = query.eq("status", "published");
    if (data.classGroupId) query = query.eq("class_group_id", data.classGroupId);
    if (data.subjectId) query = query.eq("subject_id", data.subjectId);
    if (data.term) query = query.eq("term", data.term);

    const { data: plans, error } = await query;
    if (error) {
      if (isMissingRelation(error)) return { available: false, plans: [] };
      throw publicDatabaseError(error, "Não foi possível carregar os planos de aula.");
    }
    const rows = (plans ?? []) as Array<Record<string, unknown>>;
    const filtered = data.query
      ? rows.filter((row) =>
          String(row["title"] ?? "")
            .toLowerCase()
            .includes(data.query!.trim().toLowerCase()),
        )
      : rows;

    const planIds = filtered.map((row) => String(row["id"] ?? ""));
    const { data: components } = planIds.length
      ? await db
          .from("siga_lesson_plan_components")
          .select("id, lesson_plan_id, kind, name, planned_count, sequence")
          .in("lesson_plan_id", planIds)
          .order("sequence", { ascending: true })
      : { data: [] as Array<Record<string, unknown>> };

    const classGroupIds = [
      ...new Set(filtered.map((row) => String(row["class_group_id"] ?? "")).filter(Boolean)),
    ];
    const subjectIds = [
      ...new Set(filtered.map((row) => String(row["subject_id"] ?? "")).filter(Boolean)),
    ];
    const [{ data: classGroups }, { data: subjects }] = await Promise.all([
      classGroupIds.length
        ? db.from("class_groups").select("id, name").in("id", classGroupIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
      subjectIds.length
        ? db.from("subjects").select("id, name").in("id", subjectIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    ]);
    const classGroupById = new Map((classGroups ?? []).map((row) => [row.id, row.name]));
    const subjectById = new Map((subjects ?? []).map((row) => [row.id, row.name]));
    const componentsByPlan = new Map<string, LessonPlanSummary["components"]>();
    for (const component of (components ?? []) as Array<Record<string, unknown>>) {
      const planId = String(component["lesson_plan_id"] ?? "");
      const list = componentsByPlan.get(planId) ?? [];
      list.push({
        id: String(component["id"] ?? ""),
        kind: component["kind"] === "prova" ? "prova" : "avaliacao",
        name: String(component["name"] ?? ""),
        planned_count: Number(component["planned_count"] ?? 0),
        sequence: Number(component["sequence"] ?? 0),
      });
      componentsByPlan.set(planId, list);
    }

    return {
      available: true,
      plans: filtered.map((row): LessonPlanSummary => {
        const classGroupId = String(row["class_group_id"] ?? "");
        const subjectId = String(row["subject_id"] ?? "");
        return {
          id: String(row["id"] ?? ""),
          class_group_id: classGroupId,
          subject_id: subjectId,
          term: Number(row["term"] ?? 1) as 1 | 2 | 3,
          title: String(row["title"] ?? ""),
          content: (row["content"] as string | null) ?? null,
          file_id: (row["file_id"] as string | null) ?? null,
          file_name: (row["file_name"] as string | null) ?? null,
          status: row["status"] === "published" ? "published" : "draft",
          updated_at: String(row["updated_at"] ?? ""),
          created_by: (row["created_by"] as string | null) ?? null,
          class_group_name: classGroupById.get(classGroupId) ?? "—",
          subject_name: subjectById.get(subjectId) ?? "—",
          components: componentsByPlan.get(String(row["id"] ?? "")) ?? [],
        };
      }),
    } satisfies LessonPlansResult;
  });

export const getLessonPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => getLessonPlanInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");
    const db = await loadSgaAdminClient();
    const { data: plan, error } = await db
      .from("siga_lesson_plans")
      .select(
        "id, class_group_id, subject_id, term, title, content, file_id, file_name, status, updated_at",
      )
      .eq("id", data.id)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível carregar o plano de aula.");
    if (!plan) throw new Error("Plano de aula não encontrado.");
    if (!isLessonPlanStaff(membership) && plan.status !== "published") {
      throw new Error("Plano de aula não encontrado.");
    }
    const { data: components } = await db
      .from("siga_lesson_plan_components")
      .select("id, kind, name, planned_count, sequence")
      .eq("lesson_plan_id", data.id)
      .order("sequence", { ascending: true });
    return { ...plan, components: components ?? [] };
  });

export const createLessonPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createLessonPlanInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria", "Professor"],
    );
    const db = await loadSgaAdminClient();
    await assertLessonPlanScope(db, membership, context.userId, data.classGroupId, data.subjectId);
    const { data: created, error } = await db
      .from("siga_lesson_plans")
      .insert({
        school_id: membership.schoolId,
        class_group_id: data.classGroupId,
        subject_id: data.subjectId,
        term: data.term,
        title: data.title,
        content: data.content ?? null,
        file_id: data.fileId ?? null,
        file_name: data.fileName ?? null,
        status: data.status,
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("id")
      .single();
    if (error) {
      if (isMissingRelation(error)) {
        throw new Error(
          "Tabelas de planos de aula em falta. Corra supabase/APPLY_ENROLLMENT_AND_PREMIUM.sql.",
        );
      }
      throw publicDatabaseError(error, "Não foi possível criar o plano de aula.");
    }

    await saveComponents(
      db,
      membership.schoolId,
      context.userId,
      created.id as string,
      { classGroupId: data.classGroupId, subjectId: data.subjectId, term: data.term },
      data.components,
    );

    return { id: created.id as string };
  });

export const updateLessonPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateLessonPlanInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria", "Professor"],
    );
    const db = await loadSgaAdminClient();
    const current = await loadPlanScope(db, membership.schoolId, data.id);
    await assertLessonPlanScope(
      db,
      membership,
      context.userId,
      current.classGroupId,
      current.subjectId,
    );
    await assertLessonPlanScope(db, membership, context.userId, data.classGroupId, data.subjectId);
    const { data: updated, error } = await db
      .from("siga_lesson_plans")
      .update({
        class_group_id: data.classGroupId,
        subject_id: data.subjectId,
        term: data.term,
        title: data.title,
        content: data.content ?? null,
        file_id: data.fileId ?? null,
        file_name: data.fileName ?? null,
        status: data.status,
        updated_by: context.userId,
      })
      .eq("id", data.id)
      .eq("school_id", membership.schoolId)
      .select("id")
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível actualizar o plano de aula.");
    if (!updated) throw new Error("Plano de aula não encontrado.");

    await saveComponents(
      db,
      membership.schoolId,
      context.userId,
      data.id,
      { classGroupId: data.classGroupId, subjectId: data.subjectId, term: data.term },
      data.components,
    );

    return { id: data.id };
  });

export const deleteLessonPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => deleteLessonPlanInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria", "Professor"],
    );
    const db = await loadSgaAdminClient();
    const current = await loadPlanScope(db, membership.schoolId, data.id);
    await assertLessonPlanScope(
      db,
      membership,
      context.userId,
      current.classGroupId,
      current.subjectId,
    );
    // Apagar o plano remove as suas definições de componentes (cascade); os itens do
    // Centro de Avaliação já gerados ficam (SET NULL), incluindo notas já lançadas.
    const { error } = await db
      .from("siga_lesson_plans")
      .delete()
      .eq("id", data.id)
      .eq("school_id", membership.schoolId);
    if (error) throw publicDatabaseError(error, "Não foi possível remover o plano de aula.");
    return { id: data.id };
  });
