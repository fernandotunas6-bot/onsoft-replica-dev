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
        /hr_teacher_lesson_occurrences|schema cache|does not exist|relation .* does not exist/i.test(
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

export type HrTeacherLessonOccurrence = {
  id: string;
  teacher_id: string;
  employment_id: string;
  lesson_date: string;
  scheduled_starts_at: string;
  scheduled_ends_at: string;
  quantity: number;
  status: "scheduled" | "confirmed" | "rejected" | "cancelled";
  evidence_method: "manual" | "qr" | "attendance_import" | "system" | null;
  evidence_ref: string | null;
  compensation_event_id: string | null;
};

export const listHrTeacherLessonOccurrences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HrTeacherLessonOccurrence[]> => {
    const membership = await requireHrLessonReader(context.userId);
    const db = await loadSgaAdminClient();
    const { data, error } = await db
      .from("hr_teacher_lesson_occurrences")
      .select(
        "id, teacher_id, employment_id, lesson_date, scheduled_starts_at, scheduled_ends_at, quantity, status, evidence_method, evidence_ref, compensation_event_id",
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

    return (data ?? []).map((row) => ({
      id: String(row.id),
      teacher_id: String(row.teacher_id),
      employment_id: String(row.employment_id),
      lesson_date: String(row.lesson_date),
      scheduled_starts_at: String(row.scheduled_starts_at),
      scheduled_ends_at: String(row.scheduled_ends_at),
      quantity: Number(row.quantity ?? 1),
      status: row.status as HrTeacherLessonOccurrence["status"],
      evidence_method: (row.evidence_method ?? null) as HrTeacherLessonOccurrence["evidence_method"],
      evidence_ref: row.evidence_ref ? String(row.evidence_ref) : null,
      compensation_event_id: row.compensation_event_id
        ? String(row.compensation_event_id)
        : null,
    }));
  });
