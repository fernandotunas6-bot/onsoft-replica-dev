import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  loadSgaAdminClient,
  requireSgaWriter,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";
import {
  createLessonPlanInputSchema,
  deleteLessonPlanInputSchema,
  getLessonPlanInputSchema,
  listLessonPlansInputSchema,
  updateLessonPlanInputSchema,
  type LessonPlanComponentInput,
} from "./schemas";

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;

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
      const { error } = await db
        .from("siga_lesson_plan_components")
        .update({ planned_count: component.plannedCount, sequence: sequence + 1 })
        .eq("id", existingRow.id);
      if (error) throw publicDatabaseError(error, "Não foi possível actualizar um componente.");

      const { data: items } = await db
        .from("siga_assessment_items")
        .select("id")
        .eq("lesson_plan_component_id", existingRow.id);
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
          const { data: scores } = await db
            .from("siga_assessment_scores")
            .select("item_id")
            .in("item_id", excessIds);
          const scoredItemIds = new Set((scores ?? []).map((row: { item_id: string }) => row.item_id));
          const removable = excessIds.filter((id: string) => !scoredItemIds.has(id));
          if (removable.length) {
            await db.from("siga_assessment_items").delete().in("id", removable);
          }
        }
      }
    }
  }
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
    if (data.classGroupId) query = query.eq("class_group_id", data.classGroupId);
    if (data.subjectId) query = query.eq("subject_id", data.subjectId);
    if (data.term) query = query.eq("term", data.term);

    const { data: plans, error } = await query;
    if (error) {
      if (isMissingRelation(error)) return { available: false, plans: [] };
      throw publicDatabaseError(error, "Não foi possível carregar os planos de aula.");
    }
    const rows = plans ?? [];
    const filtered = data.query
      ? rows.filter((row: { title: string }) =>
          row.title.toLowerCase().includes(data.query!.trim().toLowerCase()),
        )
      : rows;

    const planIds = filtered.map((row: { id: string }) => row.id);
    const { data: components } = planIds.length
      ? await db
          .from("siga_lesson_plan_components")
          .select("id, lesson_plan_id, kind, name, planned_count, sequence")
          .in("lesson_plan_id", planIds)
          .order("sequence", { ascending: true })
      : { data: [] as Array<Record<string, unknown>> };

    const classGroupIds = [...new Set(filtered.map((row: { class_group_id: string }) => row.class_group_id))];
    const subjectIds = [...new Set(filtered.map((row: { subject_id: string }) => row.subject_id))];
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
    const componentsByPlan = new Map<string, Array<Record<string, unknown>>>();
    for (const component of components ?? []) {
      const list = componentsByPlan.get(String(component.lesson_plan_id)) ?? [];
      list.push(component);
      componentsByPlan.set(String(component.lesson_plan_id), list);
    }

    return {
      available: true,
      plans: filtered.map((row: Record<string, unknown>) => ({
        ...row,
        class_group_name: classGroupById.get(String(row.class_group_id)) ?? "—",
        subject_name: subjectById.get(String(row.subject_id)) ?? "—",
        components: componentsByPlan.get(String(row.id)) ?? [],
      })),
    };
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
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
      "Professor",
    ]);
    const db = await loadSgaAdminClient();
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
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
      "Professor",
    ]);
    const db = await loadSgaAdminClient();
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
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
      "Professor",
    ]);
    const db = await loadSgaAdminClient();
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
