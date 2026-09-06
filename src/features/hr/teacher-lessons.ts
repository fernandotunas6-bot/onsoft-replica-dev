import { createHash, randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { loadSgaAdminClient, resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";

const HR_LESSON_ROLES = new Set(["Administrador", "Tesouraria"]);

function missingTeacherLessonSchema(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
      (error.code === "42P01" ||
        error.code === "PGRST205" ||
        /hr_teacher_(lesson_occurrences|qr_sessions)|schema cache|does not exist|relation .* does not exist/i.test(
          error.message ?? "",
        )),
  );
}

async function requireHrLessonReader(userId: string) {
  const membership = await resolveSgaMembershipAdmin(userId);
  if (!membership) throw new Error("Sem vínculo activo com uma escola.");
  if (!HR_LESSON_ROLES.has(membership.appRole)) {
    throw new Error("Sem permissão para consultar ocorrências remuneráveis de professores.");
  }
  return membership;
}

function qrTokenHash(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function qrPurpose(value: unknown): "check_in" | "check_out" {
  if (value === "check_in" || value === "check_out") return value;
  throw new Error("Finalidade QR inválida.");
}

function requiredId(value: unknown, label: string) {
  const id = String(value ?? "").trim();
  if (!id) throw new Error(`${label} é obrigatório.`);
  return id;
}

export type HrTeacherLessonOccurrence = {
  id: string;
  teacher_id: string;
  employment_id: string;
  lesson_date: string;
  scheduled_starts_at: string;
  scheduled_ends_at: string;
  actual_started_at: string | null;
  actual_ended_at: string | null;
  quantity: number;
  status: "scheduled" | "confirmed" | "rejected" | "cancelled";
  evidence_method: "manual" | "qr" | "attendance_import" | "system" | null;
  evidence_ref: string | null;
  compensation_event_id: string | null;
};

function mapOccurrence(row: Record<string, unknown>): HrTeacherLessonOccurrence {
  return {
    id: String(row.id),
    teacher_id: String(row.teacher_id),
    employment_id: String(row.employment_id),
    lesson_date: String(row.lesson_date),
    scheduled_starts_at: String(row.scheduled_starts_at),
    scheduled_ends_at: String(row.scheduled_ends_at),
    actual_started_at: row.actual_started_at ? String(row.actual_started_at) : null,
    actual_ended_at: row.actual_ended_at ? String(row.actual_ended_at) : null,
    quantity: Number(row.quantity ?? 1),
    status: row.status as HrTeacherLessonOccurrence["status"],
    evidence_method: (row.evidence_method ?? null) as HrTeacherLessonOccurrence["evidence_method"],
    evidence_ref: row.evidence_ref ? String(row.evidence_ref) : null,
    compensation_event_id: row.compensation_event_id ? String(row.compensation_event_id) : null,
  };
}

export const listHrTeacherLessonOccurrences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HrTeacherLessonOccurrence[]> => {
    const membership = await requireHrLessonReader(context.userId);
    const db = await loadSgaAdminClient();
    const { data, error } = await db
      .from("hr_teacher_lesson_occurrences")
      .select(
        "id, teacher_id, employment_id, lesson_date, scheduled_starts_at, scheduled_ends_at, actual_started_at, actual_ended_at, quantity, status, evidence_method, evidence_ref, compensation_event_id",
      )
      .eq("school_id", membership.schoolId)
      .is("deleted_at", null)
      .order("lesson_date", { ascending: false })
      .order("scheduled_starts_at", { ascending: false })
      .limit(250);

    if (error) {
      if (missingTeacherLessonSchema(error)) return [];
      throw publicDatabaseError(error, "Não foi possível carregar as aulas remuneráveis.");
    }

    return (data ?? []).map((row) => mapOccurrence(row as Record<string, unknown>));
  });

export const listMyTeacherLessonOccurrences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HrTeacherLessonOccurrence[]> => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem vínculo activo com uma escola.");
    const db = await loadSgaAdminClient();

    const { data: teacher, error: teacherError } = await db
      .from("teachers")
      .select("id")
      .eq("school_id", membership.schoolId)
      .eq("user_id", context.userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (teacherError) {
      throw publicDatabaseError(teacherError, "Não foi possível identificar o professor autenticado.");
    }
    if (!teacher?.id) return [];

    const { data, error } = await db
      .from("hr_teacher_lesson_occurrences")
      .select(
        "id, teacher_id, employment_id, lesson_date, scheduled_starts_at, scheduled_ends_at, actual_started_at, actual_ended_at, quantity, status, evidence_method, evidence_ref, compensation_event_id",
      )
      .eq("school_id", membership.schoolId)
      .eq("teacher_id", teacher.id)
      .is("deleted_at", null)
      .order("lesson_date", { ascending: false })
      .order("scheduled_starts_at", { ascending: false })
      .limit(120);

    if (error) {
      if (missingTeacherLessonSchema(error)) return [];
      throw publicDatabaseError(error, "Não foi possível carregar as suas aulas e presenças.");
    }

    return (data ?? []).map((row) => mapOccurrence(row as Record<string, unknown>));
  });

export const createTeacherLessonQr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    const value = (input ?? {}) as Record<string, unknown>;
    return {
      occurrenceId: requiredId(value.occurrenceId, "A ocorrência"),
      purpose: qrPurpose(value.purpose),
    };
  })
  .handler(async ({ data, context }) => {
    const membership = await requireHrLessonReader(context.userId);
    const db = await loadSgaAdminClient();

    const { data: occurrence, error: occurrenceError } = await db
      .from("hr_teacher_lesson_occurrences")
      .select("id, school_id, status, actual_started_at, actual_ended_at")
      .eq("id", data.occurrenceId)
      .eq("school_id", membership.schoolId)
      .is("deleted_at", null)
      .maybeSingle();

    if (occurrenceError) {
      throw publicDatabaseError(occurrenceError, "Não foi possível validar a aula para QR.");
    }
    if (!occurrence) throw new Error("Aula não encontrada.");
    if (occurrence.status === "rejected" || occurrence.status === "cancelled") {
      throw new Error("Esta aula não aceita registo de presença.");
    }
    if (data.purpose === "check_in" && occurrence.actual_started_at) {
      throw new Error("O professor já efectuou o check-in desta aula.");
    }
    if (data.purpose === "check_out" && !occurrence.actual_started_at) {
      throw new Error("O check-in deve ser efectuado antes do check-out.");
    }
    if (data.purpose === "check_out" && occurrence.actual_ended_at) {
      throw new Error("O professor já efectuou o check-out desta aula.");
    }

    await db
      .from("hr_teacher_qr_sessions")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
        revoked_by: context.userId,
      })
      .eq("school_id", membership.schoolId)
      .eq("occurrence_id", data.occurrenceId)
      .eq("purpose", data.purpose)
      .eq("status", "active");

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
    const { data: session, error } = await db
      .from("hr_teacher_qr_sessions")
      .insert({
        school_id: membership.schoolId,
        occurrence_id: data.occurrenceId,
        purpose: data.purpose,
        token_hash: qrTokenHash(token),
        expires_at: expiresAt,
        created_by: context.userId,
      })
      .select("id, expires_at")
      .single();

    if (error) {
      throw publicDatabaseError(error, "Não foi possível gerar o QR temporário da aula.");
    }

    return {
      sessionId: String(session.id),
      token,
      purpose: data.purpose,
      expiresAt: String(session.expires_at),
    };
  });

export const redeemTeacherLessonQr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    const token = String((input as { token?: unknown } | null)?.token ?? "").trim();
    if (token.length < 32 || token.length > 256) throw new Error("QR inválido.");
    return { token };
  })
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("hr_redeem_teacher_qr", {
      p_token_hash: qrTokenHash(data.token),
    });

    if (error) {
      throw publicDatabaseError(error, "Não foi possível validar a presença por QR.");
    }

    const row = Array.isArray(result) ? result[0] : result;
    if (!row) throw new Error("O QR não produziu um registo de presença válido.");

    return {
      occurrenceId: String(row.occurrence_id),
      purpose: String(row.purpose) as "check_in" | "check_out",
      compensationEventId: row.compensation_event_id ? String(row.compensation_event_id) : null,
      occurrenceStatus: String(row.occurrence_status),
    };
  });
