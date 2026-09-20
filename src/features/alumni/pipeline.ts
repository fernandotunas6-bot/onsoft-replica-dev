import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { loadSgaAdminClient, requireSgaWriter } from "@/integrations/supabase/sga-admin";
import {
  alumniEventRegistrationInputSchema,
  alumniOpportunityApplicationInputSchema,
  mentoringMatchInputSchema,
  mentoringStatusInputSchema,
} from "./schemas";

const pipelineListSchema = z.object({
  opportunityId: z.string().uuid().optional(),
  eventId: z.string().uuid().optional(),
  status: z.string().trim().max(40).optional(),
  limit: z.number().int().min(1).max(300).default(200),
});

async function adminContext(userId: string) {
  const membership = await requireSgaWriter(userId, ["Administrador", "Secretaria"]);
  const db = await loadSgaAdminClient();
  return { membership, db };
}

async function hydrateAlumni(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  schoolId: string,
  alumniIds: string[],
) {
  const uniqueIds = [...new Set(alumniIds.filter(Boolean))];
  if (!uniqueIds.length)
    return new Map<string, { fullName: string; studentNumber: string | null }>();

  const { data: profiles, error } = await db
    .from("alumni_profiles")
    .select("id, person_id, student_id")
    .eq("school_id", schoolId)
    .in("id", uniqueIds);
  if (error) throw publicDatabaseError(error, "Não foi possível carregar os Alumni do pipeline.");

  const personIds = (profiles ?? []).map((row) => row.person_id);
  const studentIds = (profiles ?? []).map((row) => row.student_id);
  const [{ data: people }, { data: students }] = await Promise.all([
    personIds.length
      ? db.from("people").select("id, full_name").eq("school_id", schoolId).in("id", personIds)
      : Promise.resolve({ data: [] }),
    studentIds.length
      ? db
          .from("students")
          .select("id, student_number")
          .eq("school_id", schoolId)
          .in("id", studentIds)
      : Promise.resolve({ data: [] }),
  ]);
  const peopleById = new Map((people ?? []).map((row) => [row.id, row]));
  const studentsById = new Map((students ?? []).map((row) => [row.id, row]));

  return new Map(
    (profiles ?? []).map((profile) => [
      profile.id,
      {
        fullName: peopleById.get(profile.person_id)?.full_name ?? "Alumni",
        studentNumber: studentsById.get(profile.student_id)?.student_number ?? null,
      },
    ]),
  );
}

export const listOpportunityApplicationPipeline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => pipelineListSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { membership, db } = await adminContext(context.userId);
    let query = db
      .from("alumni_opportunity_applications")
      .select(
        "id, opportunity_id, alumni_id, status, applied_at, notes, created_at, updated_at, alumni_opportunities(title, organization, opportunity_type, status)",
      )
      .eq("school_id", membership.schoolId)
      .order("updated_at", { ascending: false })
      .limit(data.limit);
    if (data.opportunityId) query = query.eq("opportunity_id", data.opportunityId);
    if (data.status) query = query.eq("status", data.status);
    const { data: rows, error } = await query;
    if (error)
      throw publicDatabaseError(error, "Não foi possível carregar o pipeline de candidaturas.");
    const alumni = await hydrateAlumni(
      db,
      membership.schoolId,
      (rows ?? []).map((row) => row.alumni_id),
    );
    return (rows ?? []).map((row) => ({
      ...row,
      alumni: alumni.get(row.alumni_id) ?? { fullName: "Alumni", studentNumber: null },
    }));
  });

export const updateOpportunityApplicationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => alumniOpportunityApplicationInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { membership, db } = await adminContext(context.userId);
    const { data: existing, error: existingError } = await db
      .from("alumni_opportunity_applications")
      .select("id, applied_at")
      .eq("school_id", membership.schoolId)
      .eq("opportunity_id", data.opportunityId)
      .eq("alumni_id", data.alumniId)
      .maybeSingle();
    if (existingError)
      throw publicDatabaseError(existingError, "Não foi possível validar a candidatura.");
    if (!existing) throw new Error("Candidatura não encontrada nesta escola.");

    const patch: Record<string, unknown> = {
      status: data.status,
      notes: data.notes,
      updated_at: new Date().toISOString(),
    };
    if (data.status === "applied" && !existing.applied_at)
      patch.applied_at = new Date().toISOString();
    const { error } = await db
      .from("alumni_opportunity_applications")
      .update(patch)
      .eq("id", existing.id)
      .eq("school_id", membership.schoolId);
    if (error) throw publicDatabaseError(error, "Não foi possível actualizar a candidatura.");
    return { ok: true };
  });

export const listEventRegistrationPipeline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => pipelineListSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { membership, db } = await adminContext(context.userId);
    let query = db
      .from("alumni_event_registrations")
      .select(
        "id, event_id, alumni_id, status, registered_at, checked_in_at, alumni_events(title, event_type, starts_at, location, status)",
      )
      .eq("school_id", membership.schoolId)
      .order("registered_at", { ascending: false })
      .limit(data.limit);
    if (data.eventId) query = query.eq("event_id", data.eventId);
    if (data.status) query = query.eq("status", data.status);
    const { data: rows, error } = await query;
    if (error) throw publicDatabaseError(error, "Não foi possível carregar inscrições de eventos.");
    const alumni = await hydrateAlumni(
      db,
      membership.schoolId,
      (rows ?? []).map((row) => row.alumni_id),
    );
    return (rows ?? []).map((row) => ({
      ...row,
      alumni: alumni.get(row.alumni_id) ?? { fullName: "Alumni", studentNumber: null },
    }));
  });

export const updateEventRegistrationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => alumniEventRegistrationInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { membership, db } = await adminContext(context.userId);
    const patch: Record<string, unknown> = { status: data.status };
    if (data.status === "attended") patch.checked_in_at = new Date().toISOString();
    if (data.status !== "attended") patch.checked_in_at = null;
    const { error } = await db
      .from("alumni_event_registrations")
      .update(patch)
      .eq("school_id", membership.schoolId)
      .eq("event_id", data.eventId)
      .eq("alumni_id", data.alumniId);
    if (error)
      throw publicDatabaseError(error, "Não foi possível actualizar a presença no evento.");
    return { ok: true };
  });

export const listMentorshipPipeline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => pipelineListSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { membership, db } = await adminContext(context.userId);
    let query = db
      .from("alumni_mentorships")
      .select(
        "id, mentor_alumni_id, mentee_alumni_id, focus_area, status, requested_at, started_at, completed_at, notes, created_at, updated_at",
      )
      .eq("school_id", membership.schoolId)
      .order("updated_at", { ascending: false })
      .limit(data.limit);
    if (data.status) query = query.eq("status", data.status);
    const { data: rows, error } = await query;
    if (error) throw publicDatabaseError(error, "Não foi possível carregar as mentorias.");
    const alumni = await hydrateAlumni(
      db,
      membership.schoolId,
      (rows ?? []).flatMap((row) => [row.mentor_alumni_id, row.mentee_alumni_id]),
    );
    return (rows ?? []).map((row) => ({
      ...row,
      mentor: alumni.get(row.mentor_alumni_id) ?? { fullName: "Alumni", studentNumber: null },
      mentee: alumni.get(row.mentee_alumni_id) ?? { fullName: "Alumni", studentNumber: null },
    }));
  });

export const createMentorshipFromPipeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => mentoringMatchInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { membership, db } = await adminContext(context.userId);
    const { count: mentorCount } = await db
      .from("alumni_profiles")
      .select("id", { count: "exact", head: true })
      .eq("school_id", membership.schoolId)
      .eq("id", data.mentorAlumniId);
    const { count: menteeCount } = await db
      .from("alumni_profiles")
      .select("id", { count: "exact", head: true })
      .eq("school_id", membership.schoolId)
      .eq("id", data.menteeAlumniId);
    if (!mentorCount || !menteeCount)
      throw new Error("Mentor ou mentorado não pertence a esta escola.");
    const { data: created, error } = await db
      .from("alumni_mentorships")
      .insert({
        school_id: membership.schoolId,
        mentor_alumni_id: data.mentorAlumniId,
        mentee_alumni_id: data.menteeAlumniId,
        focus_area: data.focusArea,
        notes: data.notes,
        status: "requested",
      })
      .select("id")
      .single();
    if (error) throw publicDatabaseError(error, "Não foi possível criar a mentoria.");
    return created;
  });

export const updateMentorshipPipelineStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => mentoringStatusInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { membership, db } = await adminContext(context.userId);
    const patch: Record<string, unknown> = {
      status: data.status,
      updated_at: new Date().toISOString(),
    };
    if (data.status === "active") patch.started_at = new Date().toISOString();
    if (data.status === "completed") patch.completed_at = new Date().toISOString();
    const { error } = await db
      .from("alumni_mentorships")
      .update(patch)
      .eq("school_id", membership.schoolId)
      .eq("id", data.mentorshipId);
    if (error) throw publicDatabaseError(error, "Não foi possível actualizar a mentoria.");
    return { ok: true };
  });
