import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { loadSgaAdminClient, requireSgaWriter } from "@/integrations/supabase/sga-admin";
import {
  createAssessmentInputSchema,
  updateAssessmentInputSchema,
  upsertAssessmentScoresInputSchema,
} from "./schemas";
import * as legacy from "./server-legacy";

async function resolveTeacherId(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  schoolId: string,
  userId: string,
) {
  const { data, error } = await db
    .from("teachers")
    .select("id")
    .eq("school_id", schoolId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível validar o professor.");
  if (!data?.id) {
    throw new Error("A conta de professor não está vinculada a um docente activo nesta escola.");
  }
  return String(data.id);
}

async function assertTeacherAssignment(params: {
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>;
  schoolId: string;
  userId: string;
  classGroupId: string;
  subjectId: string;
}) {
  const teacherId = await resolveTeacherId(params.db, params.schoolId, params.userId);
  const { data, error } = await params.db
    .from("class_subjects")
    .select("id")
    .eq("school_id", params.schoolId)
    .eq("class_group_id", params.classGroupId)
    .eq("subject_id", params.subjectId)
    .eq("teacher_id", teacherId)
    .eq("status", "active")
    .maybeSingle();
  if (error) {
    throw publicDatabaseError(error, "Não foi possível validar a atribuição pedagógica.");
  }
  if (!data?.id) {
    throw new Error(
      "O professor só pode gerir avaliações das turmas e disciplinas que lhe foram atribuídas.",
    );
  }
}

async function loadAssessmentContext(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  schoolId: string,
  itemId: string,
) {
  const { data, error } = await db
    .from("siga_assessment_items")
    .select("id, class_group_id, subject_id, term")
    .eq("id", itemId)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível validar a avaliação.");
  if (!data?.id) throw new Error("Avaliação não encontrada nesta escola.");
  return {
    id: String(data.id),
    classGroupId: String(data.class_group_id),
    subjectId: String(data.subject_id),
    term: Number(data.term),
  };
}

async function assertEnrollmentRowsBelongToAssessmentClass(params: {
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>;
  schoolId: string;
  classGroupId: string;
  enrollmentIds: string[];
}) {
  const uniqueIds = [...new Set(params.enrollmentIds)];
  if (!uniqueIds.length) return;
  const { data, error } = await params.db
    .from("enrollments")
    .select("id, class_group_id, status")
    .eq("school_id", params.schoolId)
    .in("id", uniqueIds)
    .in("status", ["active", "pending"]);
  if (error) {
    throw publicDatabaseError(error, "Não foi possível validar as matrículas da avaliação.");
  }
  if ((data ?? []).length !== uniqueIds.length) {
    throw new Error("Uma ou mais matrículas não pertencem a esta escola ou já não aceitam notas.");
  }
  if ((data ?? []).some((row) => String(row.class_group_id ?? "") !== params.classGroupId)) {
    throw new Error("Todas as notas da avaliação devem pertencer à turma da própria avaliação.");
  }
}

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
    if (membership.appRole === "Professor") {
      const db = await loadSgaAdminClient();
      await assertTeacherAssignment({
        db,
        schoolId: membership.schoolId,
        userId: context.userId,
        classGroupId: data.classGroupId,
        subjectId: data.subjectId,
      });
    }
    return legacy.createAssessment({ data });
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
    if (membership.appRole === "Professor") {
      const db = await loadSgaAdminClient();
      const item = await loadAssessmentContext(db, membership.schoolId, data.id);
      await assertTeacherAssignment({
        db,
        schoolId: membership.schoolId,
        userId: context.userId,
        classGroupId: item.classGroupId,
        subjectId: item.subjectId,
      });
    }
    return legacy.updateAssessmentItem({ data });
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
    const item = await loadAssessmentContext(db, membership.schoolId, data.itemId);

    await assertEnrollmentRowsBelongToAssessmentClass({
      db,
      schoolId: membership.schoolId,
      classGroupId: item.classGroupId,
      enrollmentIds: data.rows.map((row) => row.enrollmentId),
    });

    if (membership.appRole === "Professor") {
      await assertTeacherAssignment({
        db,
        schoolId: membership.schoolId,
        userId: context.userId,
        classGroupId: item.classGroupId,
        subjectId: item.subjectId,
      });
    }

    return legacy.upsertAssessmentScores({ data });
  });
