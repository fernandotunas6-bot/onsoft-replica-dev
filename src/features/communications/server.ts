import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  loadSgaAdminClient,
  requireSgaWriterForWrite,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";
import {
  archiveAnnouncementInputSchema,
  createAnnouncementInputSchema,
  listAnnouncementsInputSchema,
  updateAnnouncementInputSchema,
  updateAnnouncementStatusInputSchema,
} from "./schemas";

// Table: public.school_announcements
// Status values: 'draft' | 'scheduled' | 'sent'  (no 'archived' — use soft-delete deleted_at instead)

const ANNOUNCEMENT_STAFF_ROLES = ["Administrador", "Secretaria", "Tesouraria", "Professor"];

/**
 * Públicos que um aluno, encarregado ou outro utilizador pode ler. O aviso aos
 * encarregados em dívida só chega a quem tem uma factura vencida por pagar de
 * um educando.
 */
export async function visibleAnnouncementAudiences(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  membership: { schoolId: string; appRole: string; allAppRoles?: readonly string[] },
  userId: string,
): Promise<string[]> {
  const roles = membership.allAppRoles?.length ? membership.allAppRoles : [membership.appRole];
  const audiences = new Set<string>();
  if (roles.includes("Aluno")) {
    ["all_guardians", "students_secondary", "students_finalists"].forEach((a) => audiences.add(a));
  }
  if (roles.includes("Encarregado")) {
    audiences.add("all_guardians");
    const { loadStudentScope } = await import("@/features/students/student-scope");
    const scope = await loadStudentScope(db as never, membership, userId);
    if (
      !scope.all &&
      scope.studentIds.length &&
      (await hasOverdueInvoice(db, membership.schoolId, scope.studentIds))
    ) {
      audiences.add("guardians_with_debt");
    }
  }
  return [...audiences];
}

async function hasOverdueInvoice(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  schoolId: string,
  studentIds: string[],
): Promise<boolean> {
  const { data: enrollments } = await db
    .from("enrollments")
    .select("id")
    .eq("school_id", schoolId)
    .in("student_id", studentIds);
  const enrollmentIds = (enrollments ?? []).map((row: { id: string }) => row.id);
  if (!enrollmentIds.length) return false;
  const { data: contracts } = await db
    .from("finance_contracts")
    .select("id")
    .eq("school_id", schoolId)
    .in("enrollment_id", enrollmentIds);
  const contractIds = (contracts ?? []).map((row: { id: string }) => row.id);
  if (!contractIds.length) return false;
  const { count } = await db
    .from("finance_invoices")
    .select("id", { count: "exact", head: true })
    .eq("school_id", schoolId)
    .in("contract_id", contractIds)
    .in("status", ["open", "partially_paid"])
    .lt("due_date", new Date().toISOString().slice(0, 10));
  return (count ?? 0) > 0;
}

export const listSchoolAnnouncements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listAnnouncementsInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");
    const db = await loadSgaAdminClient();

    // Não há tarefa agendada: os comunicados cuja hora já passou são publicados
    // quando alguém abre a lista, para não ficarem "agendados" para sempre.
    const nowIso = new Date().toISOString();
    await db
      .from("school_announcements")
      .update({ status: "sent", published_at: nowIso })
      .eq("school_id", membership.schoolId)
      .eq("status", "scheduled")
      .lte("scheduled_for", nowIso)
      .is("deleted_at", null);

    let query = db
      .from("school_announcements")
      .select(
        "id, title, body, audience, channel, status, scheduled_for, published_at, created_at, updated_at",
      )
      .eq("school_id", membership.schoolId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.status) {
      query = query.eq("status", data.status);
    }
    // Rascunhos e agendados são do pessoal. Os outros vêem só os comunicados
    // do seu público: antes viam todos menos os do corpo docente — incluindo o
    // aviso de cobrança aos encarregados em dívida e os de antigos alunos.
    const roles: string[] = membership.allAppRoles ?? [membership.appRole];
    if (!ANNOUNCEMENT_STAFF_ROLES.some((role) => roles.includes(role))) {
      const audiences = await visibleAnnouncementAudiences(db, membership, context.userId);
      if (!audiences.length) return [];
      query = query.eq("status", "sent").in("audience", audiences);
    }

    const { data: announcements, error } = await query;
    if (error) {
      throw publicDatabaseError(error, "Não foi possível carregar os comunicados.");
    }
    return (announcements ?? []).map((row: Record<string, unknown>) => ({
      id: String(row["id"] ?? ""),
      title: String(row["title"] ?? ""),
      body: String(row["body"] ?? ""),
      audience: String(row["audience"] ?? "all_guardians"),
      channel: String(row["channel"] ?? "portal"),
      status: String(row["status"] ?? "draft"),
      scheduled_for: row["scheduled_for"] ? String(row["scheduled_for"]) : null,
      published_at: row["published_at"] ? String(row["published_at"]) : null,
      created_at: String(row["created_at"] ?? ""),
      updated_at: row["updated_at"] ? String(row["updated_at"]) : null,
    }));
  });

export const createSchoolAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createAnnouncementInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria"],
    );
    const db = await loadSgaAdminClient();

    const publishedAt = data.status === "sent" ? new Date().toISOString() : null;
    const { data: announcement, error } = await db
      .from("school_announcements")
      .insert({
        school_id: membership.schoolId,
        title: data.title,
        body: data.body,
        audience: data.audience,
        channel: data.channel,
        status: data.status,
        scheduled_for: data.scheduledFor ?? null,
        published_at: publishedAt,
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select(
        "id, title, body, audience, channel, status, scheduled_for, published_at, created_at, updated_at",
      )
      .single();
    if (error) throw publicDatabaseError(error, "Não foi possível criar o comunicado.");
    return {
      ...announcement,
      channel: announcement.channel ?? data.channel,
      status: announcement.status ?? data.status,
      scheduled_for: announcement.scheduled_for ?? data.scheduledFor ?? null,
    };
  });

export const updateSchoolAnnouncementStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateAnnouncementStatusInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria"],
    );
    const db = await loadSgaAdminClient();
    const patch = {
      status: data.status,
      published_at: data.status === "sent" ? new Date().toISOString() : null,
      scheduled_for: data.status === "scheduled" ? (data.scheduledFor ?? null) : null,
      updated_by: context.userId,
    };

    const { data: announcement, error } = await db
      .from("school_announcements")
      .update(patch)
      .eq("id", data.id)
      .eq("school_id", membership.schoolId)
      .is("deleted_at", null)
      .select(
        "id, title, body, audience, channel, status, scheduled_for, published_at, created_at, updated_at",
      )
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível actualizar o comunicado.");
    if (!announcement) throw new Error("Comunicado não encontrado.");
    return {
      ...announcement,
      channel: announcement.channel ?? "portal",
      status: announcement.status,
      scheduled_for: announcement.scheduled_for ?? data.scheduledFor ?? null,
    };
  });

export const updateSchoolAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateAnnouncementInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria"],
    );
    const db = await loadSgaAdminClient();
    const { data: announcement, error } = await db
      .from("school_announcements")
      .update({
        title: data.title,
        body: data.body,
        updated_by: context.userId,
      })
      .eq("id", data.id)
      .eq("school_id", membership.schoolId)
      .is("deleted_at", null)
      .select(
        "id, title, body, audience, channel, status, scheduled_for, published_at, created_at, updated_at",
      )
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível actualizar o comunicado.");
    if (!announcement) throw new Error("Comunicado não encontrado.");
    return {
      ...announcement,
      channel: announcement.channel ?? "portal",
      status: announcement.status,
      scheduled_for: announcement.scheduled_for ?? null,
    };
  });

export const archiveSchoolAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => archiveAnnouncementInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria"],
    );
    const db = await loadSgaAdminClient();
    // Soft-delete: set deleted_at instead of status 'archived' (not in DB constraint)
    const { data: announcement, error } = await db
      .from("school_announcements")
      .update({
        deleted_at: new Date().toISOString(),
        updated_by: context.userId,
      })
      .eq("id", data.id)
      .eq("school_id", membership.schoolId)
      .is("deleted_at", null)
      .select(
        "id, title, body, audience, channel, status, scheduled_for, published_at, created_at, updated_at",
      )
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível arquivar o comunicado.");
    if (!announcement) throw new Error("Comunicado não encontrado.");
    return {
      ...announcement,
      channel: announcement.channel ?? "portal",
      status: "cancelled" as const,
      scheduled_for: null,
    };
  });
