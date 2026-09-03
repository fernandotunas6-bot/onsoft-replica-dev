export * from "./server";

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  loadSgaAdminClient,
  requireSgaWriter,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";
import { pedagogySettingsSchema } from "@/features/school/schemas";
import { upsertSgaTermGrade, upsertSgaTermGradesBatch } from "./sga-grades";
import {
  createAssessmentInputSchema,
  updateAssessmentInputSchema,
  deleteAssessmentInputSchema,
  listAssessmentsInputSchema,
  upsertAssessmentScoresInputSchema,
  upsertTermGradeInputSchema,
  upsertTermGradesBatchInputSchema,
} from "./schemas";

function isMissingRelation(error: { code?: string; message?: string } | null) {
  return (
    error?.code === "42P01" ||
    /schema cache|does not exist|relation .* does not exist/i.test(String(error?.message ?? ""))
  );
}

async function assertTermOpen(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  schoolId: string,
  term: number,
) {
  const { data } = await db
    .from("school_settings")
    .select("value")
    .eq("school_id", schoolId)
    .eq("domain", "pedagogy")
    .maybeSingle();
  const pedagogy = pedagogySettingsSchema.safeParse(data?.value ?? {}).data;
  if (pedagogy?.closedTerms.includes(term as 1 | 2 | 3)) {
    throw new Error(
      `O ${term}º trimestre está fechado. O director pode reabrir a pauta em Configurações → Pedagógico.`,
    );
  }
}

type Membership = NonNullable<Awaited<ReturnType<typeof resolveSgaMembershipAdmin>>>;
type AdminDb = Awaited<ReturnType<typeof loadSgaAdminClient>>;

async function resolveCurrentTeacherId(db: AdminDb, membership: Membership, userId: string) {
  const { data: teachers, error } = await db
    .from("teachers")
    .select("id")
    .eq("school_id", membership.schoolId)
    .eq("user_id", userId)
    .limit(2);
  if (error) throw publicDatabaseError(error, "Não foi possível validar o professor autenticado.");
  if ((teachers ?? []).length !== 1) {
    throw new Error("O utilizador não possui um vínculo docente único nesta escola.");
  }
  return String(teachers![0].id);
}

async function assertTeacherAssignment({
  db,
  membership,
  userId,
  classGroupId,
  subjectId,
}: {
  db: AdminDb;
  membership: Membership;
  userId: string;
  classGroupId: string;
  subjectId: string;
}) {
  if (membership.appRole !== "Professor") return;
  const teacherId = await resolveCurrentTeacherId(db, membership, userId);
  const { data: assignment, error } = await db
    .from("class_subjects")
    .select("id")
    .eq("school_id", membership.schoolId)
    .eq("class_group_id", classGroupId)
    .eq("subject_id", subjectId)
    .eq("teacher_id", teacherId)
    .eq("status", "active")
    .maybeSingle();
  if (error) {
    throw publicDatabaseError(error, "Não foi possível validar a atribuição do professor.");
  }
  if (!assignment?.id) {
    throw new Error("Sem permissão: esta turma/disciplina não está atribuída ao professor autenticado.");
  }
}

async function assertEnrollmentBatchInClass({
  db,
  membership,
  classGroupId,
  enrollmentIds,
}: {
  db: AdminDb;
  membership: Membership;
  classGroupId: string;
  enrollmentIds: string[];
}) {
  const uniqueIds = [...new Set(enrollmentIds)];
  if (uniqueIds.length === 0) return;
  const { data: rows, error } = await db
    .from("enrollments")
    .select("id")
    .eq("school_id", membership.schoolId)
    .eq("class_group_id", classGroupId)
    .in("id", uniqueIds);
  if (error) throw publicDatabaseError(error, "Não foi possível validar as matrículas da turma.");
  if ((rows ?? []).length !== uniqueIds.length) {
    throw new Error("Uma ou mais matrículas não pertencem à turma da avaliação.");
  }
}

async function assertTermGradeScope({
  db,
  membership,
  userId,
  subjectId,
  enrollmentIds,
}: {
  db: AdminDb;
  membership: Membership;
  userId: string;
  subjectId: string;
  enrollmentIds: string[];
}) {
  const uniqueIds = [...new Set(enrollmentIds)];
  if (uniqueIds.length === 0) return;
  const { data: enrollments, error } = await db
    .from("enrollments")
    .select("id, class_group_id")
    .eq("school_id", membership.schoolId)
    .in("id", uniqueIds);
  if (error) throw publicDatabaseError(error, "Não foi possível validar as matrículas da pauta.");
  if ((enrollments ?? []).length !== uniqueIds.length) {
    throw new Error("Uma ou mais matrículas não pertencem à escola corrente.");
  }
  if (membership.appRole !== "Professor") return;
  const classGroupIds = [...new Set((enrollments ?? []).map((row) => String(row.class_group_id)))];
  for (const classGroupId of classGroupIds) {
    await assertTeacherAssignment({ db, membership, userId, classGroupId, subjectId });
  }
}

export const listAssessments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listAssessmentsInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) return { available: false, items: [], scores: [] };
    const db = await loadSgaAdminClient();

    if (membership.appRole === "Professor") {
      if (!data.classGroupId || !data.subjectId) {
        throw new Error("Professor deve seleccionar uma turma e disciplina atribuídas.");
      }
      await assertTeacherAssignment({
        db,
        membership,
        userId: context.userId,
        classGroupId: data.classGroupId,
        subjectId: data.subjectId,
      });
    }

    let query = db
      .from("siga_assessment_items")
      .select(
        "id, class_group_id, subject_id, term, name, kind, component, assessed_on, max_score, counts_toward_pauta, allow_recovery, description, updated_at",
      )
      .eq("school_id", membership.schoolId)
      .order("assessed_on", { ascending: true });
    if (data.classGroupId) query = query.eq("class_group_id", data.classGroupId);
    if (data.subjectId) query = query.eq("subject_id", data.subjectId);
    if (data.term) query = query.eq("term", data.term);
    const { data: items, error } = await query;
    if (error) {
      if (isMissingRelation(error)) return { available: false, items: [], scores: [] };
      throw publicDatabaseError(error, "Não foi possível carregar as avaliações.");
    }
    const itemIds = (items ?? []).map((item) => String(item.id));
    const { data: scores, error: scoreError } = itemIds.length
      ? await db
          .from("siga_assessment_scores")
          .select("id, item_id, enrollment_id, score, previous_score, updated_at")
          .eq("school_id", membership.schoolId)
          .in("item_id", itemIds)
      : { data: [], error: null };
    if (scoreError && !isMissingRelation(scoreError)) {
      throw publicDatabaseError(scoreError, "Não foi possível carregar as notas das avaliações.");
    }
    return { available: true, items: items ?? [], scores: scores ?? [] };
  });

export const createAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createAssessmentInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
      "Professor",
    ]);
    const db = await loadSgaAdminClient();
    await assertTeacherAssignment({
      db,
      membership,
      userId: context.userId,
      classGroupId: data.classGroupId,
      subjectId: data.subjectId,
    });
    await assertTermOpen(db, membership.schoolId, data.term);
    const { data: created, error } = await db
      .from("siga_assessment_items")
      .insert({
        school_id: membership.schoolId,
        class_group_id: data.classGroupId,
        subject_id: data.subjectId,
        term: data.term,
        name: data.name,
        kind: data.kind,
        component: data.component,
        assessed_on: data.assessedOn ?? null,
        max_score: data.maxScore,
        counts_toward_pauta: data.countsTowardPauta,
        allow_recovery: data.allowRecovery,
        description: data.description ?? null,
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("id, name, kind, component")
      .single();
    if (error) {
      if (isMissingRelation(error)) {
        throw new Error("Tabelas de avaliações em falta. Corra supabase/APPLY_ENROLLMENT_AND_PREMIUM.sql.");
      }
      throw publicDatabaseError(error, "Não foi possível criar a avaliação.");
    }
    return created;
  });

export const upsertAssessmentScores = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => upsertAssessmentScoresInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
      "Professor",
    ]);
    const db = await loadSgaAdminClient();
    const { data: item, error: itemError } = await db
      .from("siga_assessment_items")
      .select("id, term, class_group_id, subject_id")
      .eq("id", data.itemId)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (itemError) throw publicDatabaseError(itemError, "Não foi possível validar a avaliação.");
    if (!item?.id || !item.class_group_id || !item.subject_id) throw new Error("Avaliação não encontrada.");
    await assertTeacherAssignment({
      db,
      membership,
      userId: context.userId,
      classGroupId: String(item.class_group_id),
      subjectId: String(item.subject_id),
    });
    await assertEnrollmentBatchInClass({
      db,
      membership,
      classGroupId: String(item.class_group_id),
      enrollmentIds: data.rows.map((row) => row.enrollmentId),
    });
    await assertTermOpen(db, membership.schoolId, Number(item.term));

    const enrollmentIds = data.rows.map((row) => row.enrollmentId);
    const { data: existingRows, error: existingError } = await db
      .from("siga_assessment_scores")
      .select("id, score, enrollment_id")
      .eq("school_id", membership.schoolId)
      .eq("item_id", data.itemId)
      .in("enrollment_id", enrollmentIds);
    if (existingError) throw publicDatabaseError(existingError, "Não foi possível verificar as notas existentes.");
    const existingByEnrollment = new Map(
      (existingRows ?? []).map((row) => [String(row.enrollment_id), row]),
    );
    const toInsert = data.rows.filter((row) => !existingByEnrollment.has(row.enrollmentId));
    const toUpdate = data.rows.filter((row) => existingByEnrollment.has(row.enrollmentId));
    const [insertResult, ...updateResults] = await Promise.all([
      toInsert.length
        ? db.from("siga_assessment_scores").insert(
            toInsert.map((row) => ({
              school_id: membership.schoolId,
              item_id: data.itemId,
              enrollment_id: row.enrollmentId,
              score: row.score,
              recorded_by: context.userId,
            })),
          )
        : Promise.resolve({ error: null }),
      ...toUpdate.map((row) => {
        const existing = existingByEnrollment.get(row.enrollmentId)!;
        return db
          .from("siga_assessment_scores")
          .update({
            previous_score: existing.score,
            score: row.score,
            recorded_by: context.userId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .eq("school_id", membership.schoolId);
      }),
    ]);
    if (insertResult.error) throw publicDatabaseError(insertResult.error, "Não foi possível lançar as notas.");
    for (const result of updateResults) {
      if (result.error) throw publicDatabaseError(result.error, "Não foi possível actualizar as notas.");
    }
    return { saved: data.rows.length };
  });

export const upsertTermGrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => upsertTermGradeInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
      "Professor",
    ]);
    const db = await loadSgaAdminClient();
    await assertTermGradeScope({
      db,
      membership,
      userId: context.userId,
      subjectId: data.subjectId,
      enrollmentIds: [data.enrollmentId],
    });
    await assertTermOpen(db, membership.schoolId, data.term);
    return upsertSgaTermGrade({
      db,
      schoolId: membership.schoolId,
      userId: context.userId,
      enrollmentId: data.enrollmentId,
      subjectId: data.subjectId,
      term: data.term,
      mac: data.mac,
      npp: data.npp,
      npt: data.npt,
    });
  });

export const upsertTermGradesBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => upsertTermGradesBatchInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
      "Professor",
    ]);
    const db = await loadSgaAdminClient();
    await assertTermGradeScope({
      db,
      membership,
      userId: context.userId,
      subjectId: data.subjectId,
      enrollmentIds: data.rows.map((row) => row.enrollmentId),
    });
    await assertTermOpen(db, membership.schoolId, data.term);
    return upsertSgaTermGradesBatch({
      db,
      schoolId: membership.schoolId,
      userId: context.userId,
      subjectId: data.subjectId,
      term: data.term,
      rows: data.rows,
    });
  });

export const updateAssessmentItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateAssessmentInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
      "Professor",
    ]);
    const db = await loadSgaAdminClient();
    const { data: item, error: itemError } = await db
      .from("siga_assessment_items")
      .select("id, class_group_id, subject_id, term")
      .eq("id", data.id)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (itemError) throw publicDatabaseError(itemError, "Não foi possível validar a avaliação.");
    if (!item?.id || !item.class_group_id || !item.subject_id) throw new Error("Avaliação não encontrada.");
    await assertTeacherAssignment({
      db,
      membership,
      userId: context.userId,
      classGroupId: String(item.class_group_id),
      subjectId: String(item.subject_id),
    });
    await assertTermOpen(db, membership.schoolId, Number(item.term));
    const { data: updated, error } = await db
      .from("siga_assessment_items")
      .update({
        name: data.name,
        kind: data.kind,
        component: data.component,
        assessed_on: data.assessedOn ?? null,
        max_score: data.maxScore,
        counts_toward_pauta: data.countsTowardPauta,
        allow_recovery: data.allowRecovery,
        description: data.description ?? null,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("school_id", membership.schoolId)
      .select("id, name, kind, component, term")
      .single();
    if (error) throw publicDatabaseError(error, "Não foi possível atualizar a avaliação.");
    return { success: true, item: updated };
  });

export const deleteAssessmentItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => deleteAssessmentInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
      "Professor",
    ]);
    const db = await loadSgaAdminClient();
    const { data: item, error: itemError } = await db
      .from("siga_assessment_items")
      .select("id, class_group_id, subject_id, term")
      .eq("id", data.itemId)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (itemError) throw publicDatabaseError(itemError, "Não foi possível validar a avaliação.");
    if (!item?.id || !item.class_group_id || !item.subject_id) throw new Error("Avaliação não encontrada.");
    await assertTeacherAssignment({
      db,
      membership,
      userId: context.userId,
      classGroupId: String(item.class_group_id),
      subjectId: String(item.subject_id),
    });
    await assertTermOpen(db, membership.schoolId, Number(item.term));

    const { count, error: countErr } = await db
      .from("siga_assessment_scores")
      .select("*", { count: "exact", head: true })
      .eq("item_id", data.itemId)
      .eq("school_id", membership.schoolId);
    if (countErr && !isMissingRelation(countErr)) {
      throw publicDatabaseError(countErr, "Não foi possível verificar as notas da avaliação.");
    }
    if ((count ?? 0) > 0 && !data.force) {
      throw new Error(
        `Esta avaliação possui ${count} nota(s) lançada(s). Confirme que pretende eliminar todas as notas associadas.`,
      );
    }
    if ((count ?? 0) > 0) {
      const { error } = await db
        .from("siga_assessment_scores")
        .delete()
        .eq("item_id", data.itemId)
        .eq("school_id", membership.schoolId);
      if (error) throw publicDatabaseError(error, "Não foi possível eliminar as notas associadas.");
    }
    const { error } = await db
      .from("siga_assessment_items")
      .delete()
      .eq("id", data.itemId)
      .eq("school_id", membership.schoolId);
    if (error) throw publicDatabaseError(error, "Não foi possível eliminar a avaliação.");
    return { success: true, deletedScoresCount: count ?? 0 };
  });
