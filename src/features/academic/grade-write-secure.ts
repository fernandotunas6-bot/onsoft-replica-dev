import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { loadSgaAdminClient, requireSgaWriter } from "@/integrations/supabase/sga-admin";
import { pedagogySettingsSchema } from "@/features/school/schemas";
import { upsertSgaTermGrade, upsertSgaTermGradesBatch } from "./sga-grades";
import { upsertTermGradeInputSchema, upsertTermGradesBatchInputSchema } from "./schemas";

async function assertTermOpen(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  schoolId: string,
  term: number,
) {
  const { data, error } = await db
    .from("school_settings")
    .select("value")
    .eq("school_id", schoolId)
    .eq("domain", "pedagogy")
    .maybeSingle();
  if (error) {
    throw publicDatabaseError(error, "Não foi possível validar o estado do período.");
  }
  const pedagogy = pedagogySettingsSchema.safeParse(data?.value ?? {}).data;
  if (pedagogy?.closedTerms.includes(term as 1 | 2 | 3)) {
    throw new Error(
      `O ${term}º trimestre está fechado. O director pode reabrir a pauta em Configurações → Pedagógico.`,
    );
  }
}

async function assertTeacherOwnsGradeTargets(params: {
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>;
  schoolId: string;
  userId: string;
  subjectId: string;
  enrollmentIds: string[];
}) {
  const { db, schoolId, userId, subjectId, enrollmentIds } = params;
  if (enrollmentIds.length === 0) return;

  const { data: teacher, error: teacherError } = await db
    .from("teachers")
    .select("id")
    .eq("school_id", schoolId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (teacherError) {
    throw publicDatabaseError(teacherError, "Não foi possível validar o professor.");
  }
  if (!teacher?.id) {
    throw new Error("A conta de professor não está vinculada a um docente activo nesta escola.");
  }

  const uniqueEnrollmentIds = [...new Set(enrollmentIds)];
  const { data: enrollments, error: enrollmentError } = await db
    .from("enrollments")
    .select("id, class_group_id")
    .eq("school_id", schoolId)
    .in("id", uniqueEnrollmentIds)
    .in("status", ["active", "pending"]);
  if (enrollmentError) {
    throw publicDatabaseError(enrollmentError, "Não foi possível validar as matrículas.");
  }
  if ((enrollments ?? []).length !== uniqueEnrollmentIds.length) {
    throw new Error("Uma ou mais matrículas não pertencem a esta escola ou já não aceitam notas.");
  }

  const classGroupIds = [
    ...new Set(
      (enrollments ?? [])
        .map((row) => String(row.class_group_id ?? ""))
        .filter(Boolean),
    ),
  ];
  if (classGroupIds.length === 0) {
    throw new Error("A matrícula precisa de uma turma válida antes do lançamento de notas.");
  }

  const { data: assignments, error: assignmentError } = await db
    .from("class_subjects")
    .select("class_group_id")
    .eq("school_id", schoolId)
    .eq("subject_id", subjectId)
    .eq("teacher_id", teacher.id)
    .eq("status", "active")
    .in("class_group_id", classGroupIds);
  if (assignmentError) {
    throw publicDatabaseError(
      assignmentError,
      "Não foi possível validar a atribuição do professor à turma e disciplina.",
    );
  }

  const authorizedGroups = new Set(
    (assignments ?? []).map((row) => String(row.class_group_id)),
  );
  const unauthorized = classGroupIds.filter((id) => !authorizedGroups.has(id));
  if (unauthorized.length > 0) {
    throw new Error(
      "O professor só pode lançar notas nas turmas e disciplinas que lhe foram atribuídas.",
    );
  }
}

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
    await assertTermOpen(db, membership.schoolId, data.term);

    if (membership.appRole === "Professor") {
      await assertTeacherOwnsGradeTargets({
        db,
        schoolId: membership.schoolId,
        userId: context.userId,
        subjectId: data.subjectId,
        enrollmentIds: [data.enrollmentId],
      });
    }

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
    await assertTermOpen(db, membership.schoolId, data.term);

    if (membership.appRole === "Professor") {
      await assertTeacherOwnsGradeTargets({
        db,
        schoolId: membership.schoolId,
        userId: context.userId,
        subjectId: data.subjectId,
        enrollmentIds: data.rows.map((row) => row.enrollmentId),
      });
    }

    return upsertSgaTermGradesBatch({
      db,
      schoolId: membership.schoolId,
      userId: context.userId,
      subjectId: data.subjectId,
      term: data.term,
      rows: data.rows,
    });
  });
