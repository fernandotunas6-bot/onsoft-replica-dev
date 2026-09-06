import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { loadSgaAdminClient, resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";
import {
  assignTeacherSubstituteInputSchema,
  createExtraTeacherLessonInputSchema,
  occurrenceIdInputSchema,
  teacherAttendancePolicyInputSchema,
} from "@/features/hr/schemas";

const HR_EXCEPTION_ROLES = new Set(["Administrador", "Tesouraria"]);

async function requireHrExceptionManager(userId: string) {
  const membership = await resolveSgaMembershipAdmin(userId);
  if (!membership) throw new Error("Sem vínculo activo com uma escola.");
  if (!HR_EXCEPTION_ROLES.has(membership.appRole)) {
    throw new Error("Sem permissão para gerir exceções de presença docente.");
  }
  return membership;
}

export const assignTeacherSubstitute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => assignTeacherSubstituteInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireHrExceptionManager(context.userId);
    const { data: occurrenceId, error } = await context.supabase.rpc(
      "hr_assign_teacher_substitute",
      {
        p_occurrence_id: data.occurrenceId,
        p_substitute_teacher_id: data.substituteTeacherId,
        p_reason: data.reason,
      },
    );

    if (error) {
      throw publicDatabaseError(error, "Não foi possível atribuir o professor substituto.");
    }

    return { occurrenceId: String(occurrenceId) };
  });

export const createExtraTeacherLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createExtraTeacherLessonInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireHrExceptionManager(context.userId);
    const { data: occurrenceId, error } = await context.supabase.rpc(
      "hr_create_extra_teacher_lesson",
      {
        p_class_subject_id: data.classSubjectId,
        p_lesson_date: data.lessonDate,
        p_starts_at: data.startsAt,
        p_ends_at: data.endsAt,
        p_reason: data.reason,
      },
    );

    if (error) {
      throw publicDatabaseError(error, "Não foi possível criar a aula extraordinária.");
    }

    return { occurrenceId: String(occurrenceId) };
  });

export const evaluateTeacherLessonAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => occurrenceIdInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireHrExceptionManager(context.userId);
    const { data: result, error } = await context.supabase.rpc(
      "hr_evaluate_teacher_lesson_attendance",
      {
        p_occurrence_id: data.occurrenceId,
      },
    );

    if (error) {
      throw publicDatabaseError(error, "Não foi possível avaliar a tolerância da presença.");
    }

    const row = Array.isArray(result) ? result[0] : result;
    if (!row) throw new Error("A avaliação não devolveu resultado.");

    return {
      attendancePercent: Number(row.attendance_percent ?? 0),
      payableQuantity:
        row.payable_quantity === null || row.payable_quantity === undefined
          ? null
          : Number(row.payable_quantity),
      exceptionStatus: String(row.exception_status),
    };
  });

export const getTeacherAttendancePolicy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await requireHrExceptionManager(context.userId);
    const db = await loadSgaAdminClient();
    const { data, error } = await db
      .from("hr_teacher_attendance_policies")
      .select(
        "id, name, late_grace_minutes, early_leave_grace_minutes, minimum_attendance_percent, outside_grace_mode, active",
      )
      .eq("school_id", membership.schoolId)
      .eq("active", true)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") {
        return {
          id: null,
          name: "Política padrão",
          lateGraceMinutes: 10,
          earlyLeaveGraceMinutes: 10,
          minimumAttendancePercent: 80,
          outsideGraceMode: "review" as const,
        };
      }
      throw publicDatabaseError(error, "Não foi possível carregar a política de presença docente.");
    }

    return {
      id: data?.id ? String(data.id) : null,
      name: data?.name ? String(data.name) : "Política padrão",
      lateGraceMinutes: Number(data?.late_grace_minutes ?? 10),
      earlyLeaveGraceMinutes: Number(data?.early_leave_grace_minutes ?? 10),
      minimumAttendancePercent: Number(data?.minimum_attendance_percent ?? 80),
      outsideGraceMode: (data?.outside_grace_mode ?? "review") as "review" | "proportional",
    };
  });

export const saveTeacherAttendancePolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => teacherAttendancePolicyInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireHrExceptionManager(context.userId);
    const db = await loadSgaAdminClient();

    const { data: existing, error: readError } = await db
      .from("hr_teacher_attendance_policies")
      .select("id")
      .eq("school_id", membership.schoolId)
      .eq("active", true)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (readError) {
      throw publicDatabaseError(readError, "Não foi possível validar a política de presença.");
    }

    const payload = {
      school_id: membership.schoolId,
      name: data.name,
      late_grace_minutes: data.lateGraceMinutes,
      early_leave_grace_minutes: data.earlyLeaveGraceMinutes,
      minimum_attendance_percent: data.minimumAttendancePercent,
      outside_grace_mode: data.outsideGraceMode,
      active: true,
      updated_by: context.userId,
    };

    if (existing?.id) {
      const { error } = await db
        .from("hr_teacher_attendance_policies")
        .update(payload)
        .eq("id", existing.id)
        .eq("school_id", membership.schoolId);
      if (error)
        throw publicDatabaseError(error, "Não foi possível actualizar a política de presença.");
      return { id: String(existing.id), created: false };
    }

    const { data: created, error } = await db
      .from("hr_teacher_attendance_policies")
      .insert({ ...payload, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw publicDatabaseError(error, "Não foi possível criar a política de presença.");
    return { id: String(created.id), created: true };
  });
