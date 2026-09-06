import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { loadSgaAdminClient, resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";

const HR_EXCEPTION_ROLES = new Set(["Administrador", "Tesouraria"]);

async function requireHrExceptionManager(userId: string) {
  const membership = await resolveSgaMembershipAdmin(userId);
  if (!membership) throw new Error("Sem vínculo activo com uma escola.");
  if (!HR_EXCEPTION_ROLES.has(membership.appRole)) {
    throw new Error("Sem permissão para gerir exceções de presença docente.");
  }
  return membership;
}

function requiredId(value: unknown, label: string) {
  const id = String(value ?? "").trim();
  if (!id) throw new Error(`${label} é obrigatório.`);
  return id;
}

function requiredText(value: unknown, label: string) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} é obrigatório.`);
  if (text.length > 500) throw new Error(`${label} é demasiado longo.`);
  return text;
}

function isoDate(value: unknown, label = "Data") {
  const text = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`${label} inválida.`);
  return text;
}

function hhmm(value: unknown, label: string) {
  const text = String(value ?? "").trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) throw new Error(`${label} inválida.`);
  return text;
}

export const assignTeacherSubstitute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    const value = (input ?? {}) as Record<string, unknown>;
    return {
      occurrenceId: requiredId(value.occurrenceId, "A ocorrência"),
      substituteTeacherId: requiredId(value.substituteTeacherId, "O professor substituto"),
      reason: requiredText(value.reason, "O motivo"),
    };
  })
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
  .validator((input: unknown) => {
    const value = (input ?? {}) as Record<string, unknown>;
    const startsAt = hhmm(value.startsAt, "Hora inicial");
    const endsAt = hhmm(value.endsAt, "Hora final");
    if (endsAt <= startsAt) throw new Error("A hora final deve ser posterior à hora inicial.");
    return {
      classSubjectId: requiredId(value.classSubjectId, "A disciplina/turma"),
      lessonDate: isoDate(value.lessonDate),
      startsAt,
      endsAt,
      reason: requiredText(value.reason, "O motivo"),
    };
  })
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
  .validator((input: unknown) => {
    const value = (input ?? {}) as Record<string, unknown>;
    return { occurrenceId: requiredId(value.occurrenceId, "A ocorrência") };
  })
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
  .validator((input: unknown) => {
    const value = (input ?? {}) as Record<string, unknown>;
    const lateGraceMinutes = Number(value.lateGraceMinutes);
    const earlyLeaveGraceMinutes = Number(value.earlyLeaveGraceMinutes);
    const minimumAttendancePercent = Number(value.minimumAttendancePercent);
    const outsideGraceMode = value.outsideGraceMode === "proportional" ? "proportional" : "review";

    if (!Number.isInteger(lateGraceMinutes) || lateGraceMinutes < 0 || lateGraceMinutes > 120) {
      throw new Error("Tolerância de atraso inválida.");
    }
    if (
      !Number.isInteger(earlyLeaveGraceMinutes) ||
      earlyLeaveGraceMinutes < 0 ||
      earlyLeaveGraceMinutes > 120
    ) {
      throw new Error("Tolerância de saída inválida.");
    }
    if (
      !Number.isFinite(minimumAttendancePercent) ||
      minimumAttendancePercent < 0 ||
      minimumAttendancePercent > 100
    ) {
      throw new Error("Percentagem mínima de presença inválida.");
    }

    return {
      name: String(value.name ?? "Política padrão").trim() || "Política padrão",
      lateGraceMinutes,
      earlyLeaveGraceMinutes,
      minimumAttendancePercent,
      outsideGraceMode,
    };
  })
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
