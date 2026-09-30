import type { TablesUpdate } from "@/integrations/supabase/types";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  loadSgaAdminClient,
  requireSgaWriterForWrite,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";
import {
  alumniEngagementInputSchema,
  alumniEventInputSchema,
  alumniEventRegistrationInputSchema,
  alumniExperienceInputSchema,
  alumniIdInputSchema,
  deleteAlumniExperienceInputSchema,
  listAlumniInputSchema,
  listAlumniOpportunitiesInputSchema,
  mentoringMatchInputSchema,
  mentoringStatusInputSchema,
  upsertAlumniInputSchema,
  upsertAlumniOpportunityInputSchema,
} from "./schemas";

async function resolveContext(userId: string) {
  const membership = await resolveSgaMembershipAdmin(userId);
  if (!membership) throw new Error("Sem membership activa nesta escola.");
  const db = await loadSgaAdminClient();
  return { membership, db };
}

async function assertAlumniInSchool(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  schoolId: string,
  alumniId: string,
) {
  const { data, error } = await db
    .from("alumni_profiles")
    .select("id, student_id, person_id")
    .eq("school_id", schoolId)
    .eq("id", alumniId)
    .maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível validar o Alumni.");
  if (!data) throw new Error("Alumni não encontrado nesta escola.");
  return data;
}

export const listAlumni = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listAlumniInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const { membership, db } = await resolveContext(context.userId);

    let query = db
      .from("alumni_profiles")
      .select(
        "id, student_id, person_id, graduation_year, graduation_grade, graduation_course, headline, biography, current_company, current_role, employment_status, industry, city, province, country, linkedin_url, website_url, skills, interests, available_for_mentoring, seeking_mentor, open_to_opportunities, directory_visibility, contact_consent, verified_at, last_engagement_at, profile_completion, created_at, updated_at",
      )
      .eq("school_id", membership.schoolId)
      .order("graduation_year", { ascending: false, nullsFirst: false })
      .range(data.offset, data.offset + data.limit - 1);

    if (data.graduationYear) query = query.eq("graduation_year", data.graduationYear);
    if (data.employmentStatus) query = query.eq("employment_status", data.employmentStatus);
    if (data.mentoringOnly) query = query.eq("available_for_mentoring", true);
    if (data.opportunitiesOnly) query = query.eq("open_to_opportunities", true);
    if (data.verifiedOnly) query = query.not("verified_at", "is", null);
    if (data.province) query = query.eq("province", data.province);

    const { data: profiles, error } = await query;
    if (error) throw publicDatabaseError(error, "Não foi possível carregar a rede Alumni.");

    const rows = profiles ?? [];
    const studentIds = rows.map((row) => row.student_id);
    const personIds = rows.map((row) => row.person_id);
    const [{ data: students }, { data: people }] = await Promise.all([
      studentIds.length
        ? db
            .from("students")
            .select("id, student_number")
            .eq("school_id", membership.schoolId)
            .in("id", studentIds)
        : Promise.resolve({ data: [] as Array<{ id: string; student_number: string }> }),
      personIds.length
        ? db
            .from("people")
            .select("id, full_name, email, phone, photo_url")
            .eq("school_id", membership.schoolId)
            .in("id", personIds)
        : Promise.resolve({
            data: [] as Array<{
              id: string;
              full_name: string;
              email: string | null;
              phone: string | null;
              photo_url: string | null;
            }>,
          }),
    ]);

    const studentsById = new Map((students ?? []).map((row) => [row.id, row]));
    const peopleById = new Map((people ?? []).map((row) => [row.id, row]));
    const text = data.query.toLowerCase();
    const mapped = rows.map((profile) => {
      const student = studentsById.get(profile.student_id);
      const person = peopleById.get(profile.person_id);
      return {
        ...profile,
        student_number: student?.student_number ?? "—",
        full_name: person?.full_name ?? "—",
        email: person?.email ?? null,
        phone: person?.phone ?? null,
        photo_url: person?.photo_url ?? null,
      };
    });

    if (!text) return mapped;
    return mapped.filter((row) =>
      [
        row.full_name,
        row.student_number,
        row.email ?? "",
        row.current_company ?? "",
        row.current_role ?? "",
        row.industry ?? "",
        row.city ?? "",
        row.province ?? "",
        row.graduation_course ?? "",
      ].some((value) => String(value).toLowerCase().includes(text)),
    );
  });

export const getAlumniProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => alumniIdInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const { membership, db } = await resolveContext(context.userId);
    const profile = await assertAlumniInSchool(db, membership.schoolId, data.alumniId);

    const { data: fullProfile, error } = await db
      .from("alumni_profiles")
      .select("*")
      .eq("school_id", membership.schoolId)
      .eq("id", profile.id)
      .single();
    if (error) throw publicDatabaseError(error, "Não foi possível carregar o perfil Alumni.");

    const [
      { data: person },
      { data: student },
      { data: enrollments },
      { data: experiences },
      { data: engagements },
      { data: mentorships },
      { data: applications },
      { data: registrations },
    ] = await Promise.all([
      db
        .from("people")
        // `date_of_birth`, não `birth_date`: a coluna de `people` chama-se assim.
        // O nome errado faz o PostgREST recusar o select inteiro, e como o erro
        // não é lido aqui, o perfil Alumni ficava sem dados pessoais nenhuns.
        .select("id, full_name, email, phone, photo_url, date_of_birth")
        .eq("school_id", membership.schoolId)
        .eq("id", profile.person_id)
        .maybeSingle(),
      db
        .from("students")
        .select("id, student_number, status, admission_date")
        .eq("school_id", membership.schoolId)
        .eq("id", profile.student_id)
        .maybeSingle(),
      db
        .from("enrollments")
        // `enrolled_on`, não `enrolled_at`.
        .select("id, academic_year_id, class_group_id, status, enrolled_on")
        .eq("school_id", membership.schoolId)
        .eq("student_id", profile.student_id)
        .order("enrolled_on", { ascending: false }),
      db
        .from("alumni_experiences")
        .select("*")
        .eq("school_id", membership.schoolId)
        .eq("alumni_id", profile.id)
        .order("started_on", { ascending: false, nullsFirst: false }),
      db
        .from("alumni_engagements")
        .select("*")
        .eq("school_id", membership.schoolId)
        .eq("alumni_id", profile.id)
        .order("occurred_at", { ascending: false })
        .limit(50),
      db
        .from("alumni_mentorships")
        .select("*")
        .eq("school_id", membership.schoolId)
        .or(`mentor_alumni_id.eq.${profile.id},mentee_alumni_id.eq.${profile.id}`)
        .order("created_at", { ascending: false }),
      db
        .from("alumni_opportunity_applications")
        .select("*, alumni_opportunities(title, organization, opportunity_type, status)")
        .eq("school_id", membership.schoolId)
        .eq("alumni_id", profile.id)
        .order("created_at", { ascending: false }),
      db
        .from("alumni_event_registrations")
        .select("*, alumni_events(title, event_type, starts_at, status)")
        .eq("school_id", membership.schoolId)
        .eq("alumni_id", profile.id)
        .order("registered_at", { ascending: false }),
    ]);

    return {
      profile: fullProfile,
      person,
      student,
      enrollments: enrollments ?? [],
      experiences: experiences ?? [],
      engagements: engagements ?? [],
      mentorships: mentorships ?? [],
      applications: applications ?? [],
      eventRegistrations: registrations ?? [],
    };
  });

export const getAlumniOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const { membership, db } = await resolveContext(context.userId);
    const [
      { count: total },
      { count: mentors },
      { count: opportunities },
      { count: activeMentorships },
      { count: upcomingEvents },
      { data: profiles },
      { data: contributions },
    ] = await Promise.all([
      db
        .from("alumni_profiles")
        .select("id", { count: "exact", head: true })
        .eq("school_id", membership.schoolId),
      db
        .from("alumni_profiles")
        .select("id", { count: "exact", head: true })
        .eq("school_id", membership.schoolId)
        .eq("available_for_mentoring", true),
      db
        .from("alumni_opportunities")
        .select("id", { count: "exact", head: true })
        .eq("school_id", membership.schoolId)
        .eq("status", "published"),
      db
        .from("alumni_mentorships")
        .select("id", { count: "exact", head: true })
        .eq("school_id", membership.schoolId)
        .eq("status", "active"),
      db
        .from("alumni_events")
        .select("id", { count: "exact", head: true })
        .eq("school_id", membership.schoolId)
        .eq("status", "published")
        .gte("starts_at", new Date().toISOString()),
      db
        .from("alumni_profiles")
        .select(
          "employment_status, open_to_opportunities, verified_at, graduation_year, profile_completion, province",
        )
        .eq("school_id", membership.schoolId),
      db
        .from("alumni_contributions")
        .select("amount, currency, hours")
        .eq("school_id", membership.schoolId),
    ]);

    const rows = profiles ?? [];
    const employed = rows.filter((row) =>
      ["employed", "self_employed"].includes(row.employment_status),
    ).length;
    const verified = rows.filter((row) => Boolean(row.verified_at)).length;
    const openToOpportunities = rows.filter((row) => row.open_to_opportunities).length;
    const cohorts = [...new Set(rows.map((row) => row.graduation_year).filter(Boolean))].length;
    const provinces = [...new Set(rows.map((row) => row.province).filter(Boolean))].length;
    const averageCompletion = rows.length
      ? Math.round(rows.reduce((sum, row) => sum + (row.profile_completion ?? 0), 0) / rows.length)
      : 0;
    const aoaContributions = (contributions ?? [])
      .filter((row) => row.currency === "AOA")
      .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
    const volunteerHours = (contributions ?? []).reduce(
      (sum, row) => sum + Number(row.hours ?? 0),
      0,
    );

    return {
      total: total ?? 0,
      employed,
      mentors: mentors ?? 0,
      opportunities: opportunities ?? 0,
      activeMentorships: activeMentorships ?? 0,
      upcomingEvents: upcomingEvents ?? 0,
      verified,
      openToOpportunities,
      cohorts,
      provinces,
      averageCompletion,
      aoaContributions,
      volunteerHours,
      employmentRate: rows.length ? Math.round((employed / rows.length) * 100) : 0,
      verificationRate: rows.length ? Math.round((verified / rows.length) * 100) : 0,
    };
  });

export const bootstrapGraduatedStudents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterForWrite("pessoas", context.userId);
    const db = await loadSgaAdminClient();
    const { data: graduated, error } = await db
      .from("students")
      .select("id, person_id")
      .eq("school_id", membership.schoolId)
      .eq("status", "graduated");
    if (error) throw publicDatabaseError(error, "Não foi possível localizar alunos concluídos.");
    if (!graduated?.length) return { created: 0 };

    const ids = graduated.map((row) => row.id);
    const { data: existing } = await db
      .from("alumni_profiles")
      .select("student_id")
      .eq("school_id", membership.schoolId)
      .in("student_id", ids);
    const existingIds = new Set((existing ?? []).map((row) => row.student_id));
    const missing = graduated.filter((row) => !existingIds.has(row.id));
    if (!missing.length) return { created: 0 };

    const { error: insertError } = await db.from("alumni_profiles").insert(
      missing.map((row) => ({
        school_id: membership.schoolId,
        student_id: row.id,
        person_id: row.person_id,
      })),
    );
    if (insertError) throw publicDatabaseError(insertError, "Não foi possível activar os Alumni.");
    return { created: missing.length };
  });

export const upsertAlumniProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => upsertAlumniInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterForWrite("pessoas", context.userId);
    const db = await loadSgaAdminClient();
    const { data: student, error: studentError } = await db
      .from("students")
      .select("id, person_id")
      .eq("school_id", membership.schoolId)
      .eq("id", data.studentId)
      .maybeSingle();
    if (studentError)
      throw publicDatabaseError(studentError, "Não foi possível validar o ex-aluno.");
    if (!student) throw new Error("Aluno não encontrado nesta escola.");

    const payload = {
      school_id: membership.schoolId,
      student_id: student.id,
      person_id: student.person_id,
      graduation_year: data.graduationYear,
      graduation_grade: data.graduationGrade,
      graduation_course: data.graduationCourse,
      headline: data.headline,
      biography: data.biography,
      current_company: data.currentCompany,
      current_role: data.currentRole,
      employment_status: data.employmentStatus,
      industry: data.industry,
      city: data.city,
      province: data.province,
      country: data.country,
      linkedin_url: data.linkedinUrl,
      website_url: data.websiteUrl,
      skills: data.skills,
      interests: data.interests,
      available_for_mentoring: data.availableForMentoring,
      seeking_mentor: data.seekingMentor,
      open_to_opportunities: data.openToOpportunities,
      directory_visibility: data.directoryVisibility,
      contact_consent: data.contactConsent,
      updated_at: new Date().toISOString(),
    };
    const { data: profile, error } = await db
      .from("alumni_profiles")
      .upsert(payload, { onConflict: "school_id,student_id" })
      .select("id")
      .single();
    if (error) throw publicDatabaseError(error, "Não foi possível guardar o perfil Alumni.");
    return profile;
  });

export const verifyAlumniProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => alumniIdInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterForWrite("pessoas", context.userId);
    const db = await loadSgaAdminClient();
    await assertAlumniInSchool(db, membership.schoolId, data.alumniId);
    const { error } = await db
      .from("alumni_profiles")
      .update({ verified_at: new Date().toISOString() })
      .eq("school_id", membership.schoolId)
      .eq("id", data.alumniId);
    if (error) throw publicDatabaseError(error, "Não foi possível verificar o perfil Alumni.");
    return { ok: true };
  });

export const upsertAlumniExperience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => alumniExperienceInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterForWrite("pessoas", context.userId);
    const db = await loadSgaAdminClient();
    await assertAlumniInSchool(db, membership.schoolId, data.alumniId);
    const payload = {
      school_id: membership.schoolId,
      alumni_id: data.alumniId,
      kind: data.kind,
      organization: data.organization,
      title: data.title,
      field: data.field,
      location: data.location,
      started_on: data.startedOn,
      ended_on: data.endedOn,
      is_current: data.isCurrent,
      description: data.description,
      updated_at: new Date().toISOString(),
    };
    const result = data.experienceId
      ? await db
          .from("alumni_experiences")
          .update(payload)
          .eq("school_id", membership.schoolId)
          .eq("alumni_id", data.alumniId)
          .eq("id", data.experienceId)
          .select("id")
          .single()
      : await db.from("alumni_experiences").insert(payload).select("id").single();
    if (result.error)
      throw publicDatabaseError(result.error, "Não foi possível guardar a experiência Alumni.");
    return result.data;
  });

export const deleteAlumniExperience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => deleteAlumniExperienceInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterForWrite("pessoas", context.userId);
    const db = await loadSgaAdminClient();
    const { error } = await db
      .from("alumni_experiences")
      .delete()
      .eq("school_id", membership.schoolId)
      .eq("alumni_id", data.alumniId)
      .eq("id", data.experienceId);
    if (error) throw publicDatabaseError(error, "Não foi possível remover a experiência Alumni.");
    return { ok: true };
  });

export const listAlumniOpportunities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listAlumniOpportunitiesInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const { membership, db } = await resolveContext(context.userId);
    let query = db
      .from("alumni_opportunities")
      .select("*")
      .eq("school_id", membership.schoolId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status) query = query.eq("status", data.status);
    if (data.type) query = query.eq("opportunity_type", data.type);
    const { data: rows, error } = await query;
    if (error) throw publicDatabaseError(error, "Não foi possível carregar oportunidades Alumni.");
    const text = data.query.toLowerCase();
    return text
      ? (rows ?? []).filter((row) =>
          [row.title, row.organization ?? "", row.location ?? "", row.description ?? ""].some(
            (value) => String(value).toLowerCase().includes(text),
          ),
        )
      : (rows ?? []);
  });

export const upsertAlumniOpportunity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => upsertAlumniOpportunityInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterForWrite("pessoas", context.userId);
    const db = await loadSgaAdminClient();
    if (data.createdByAlumniId)
      await assertAlumniInSchool(db, membership.schoolId, data.createdByAlumniId);
    const payload = {
      school_id: membership.schoolId,
      created_by_alumni_id: data.createdByAlumniId,
      title: data.title,
      organization: data.organization,
      opportunity_type: data.opportunityType,
      description: data.description,
      location: data.location,
      remote_allowed: data.remoteAllowed,
      application_url: data.applicationUrl,
      starts_at: data.startsAt,
      expires_at: data.expiresAt,
      status: data.status,
      updated_at: new Date().toISOString(),
    };
    const result = data.opportunityId
      ? await db
          .from("alumni_opportunities")
          .update(payload)
          .eq("school_id", membership.schoolId)
          .eq("id", data.opportunityId)
          .select("id")
          .single()
      : await db.from("alumni_opportunities").insert(payload).select("id").single();
    if (result.error)
      throw publicDatabaseError(result.error, "Não foi possível guardar a oportunidade Alumni.");
    return result.data;
  });

export const createMentorshipMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => mentoringMatchInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterForWrite("pessoas", context.userId);
    const db = await loadSgaAdminClient();
    await Promise.all([
      assertAlumniInSchool(db, membership.schoolId, data.mentorAlumniId),
      assertAlumniInSchool(db, membership.schoolId, data.menteeAlumniId),
    ]);
    const { data: mentorship, error } = await db
      .from("alumni_mentorships")
      .insert({
        school_id: membership.schoolId,
        mentor_alumni_id: data.mentorAlumniId,
        mentee_alumni_id: data.menteeAlumniId,
        focus_area: data.focusArea,
        notes: data.notes,
      })
      .select("id")
      .single();
    if (error) throw publicDatabaseError(error, "Não foi possível criar a relação de mentoria.");
    return mentorship;
  });

export const updateMentorshipStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => mentoringStatusInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterForWrite("pessoas", context.userId);
    const db = await loadSgaAdminClient();
    const patch: TablesUpdate<"alumni_mentorships"> = {
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

export const recordAlumniEngagement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => alumniEngagementInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterForWrite("pessoas", context.userId);
    const db = await loadSgaAdminClient();
    await assertAlumniInSchool(db, membership.schoolId, data.alumniId);
    const occurredAt = data.occurredAt ?? new Date().toISOString();
    const { error } = await db.from("alumni_engagements").insert({
      school_id: membership.schoolId,
      alumni_id: data.alumniId,
      kind: data.kind,
      title: data.title,
      occurred_at: occurredAt,
      value_numeric: data.valueNumeric,
      notes: data.notes,
    });
    if (error) throw publicDatabaseError(error, "Não foi possível registar a interação Alumni.");
    await db
      .from("alumni_profiles")
      .update({ last_engagement_at: occurredAt })
      .eq("school_id", membership.schoolId)
      .eq("id", data.alumniId);
    return { ok: true };
  });

export const listAlumniEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const { membership, db } = await resolveContext(context.userId);
    const { data, error } = await db
      .from("alumni_events")
      .select("*")
      .eq("school_id", membership.schoolId)
      .order("starts_at", { ascending: true })
      .limit(200);
    if (error) throw publicDatabaseError(error, "Não foi possível carregar eventos Alumni.");
    return data ?? [];
  });

export const upsertAlumniEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => alumniEventInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterForWrite("pessoas", context.userId);
    const db = await loadSgaAdminClient();
    const payload = {
      school_id: membership.schoolId,
      title: data.title,
      description: data.description,
      event_type: data.eventType,
      location: data.location,
      online_url: data.onlineUrl,
      starts_at: data.startsAt,
      ends_at: data.endsAt,
      capacity: data.capacity,
      status: data.status,
      updated_at: new Date().toISOString(),
    };
    const result = data.eventId
      ? await db
          .from("alumni_events")
          .update(payload)
          .eq("school_id", membership.schoolId)
          .eq("id", data.eventId)
          .select("id")
          .single()
      : await db.from("alumni_events").insert(payload).select("id").single();
    if (result.error)
      throw publicDatabaseError(result.error, "Não foi possível guardar o evento Alumni.");
    return result.data;
  });

export const registerAlumniForEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => alumniEventRegistrationInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterForWrite("pessoas", context.userId);
    const db = await loadSgaAdminClient();
    await assertAlumniInSchool(db, membership.schoolId, data.alumniId);
    const { error } = await db.from("alumni_event_registrations").upsert(
      {
        school_id: membership.schoolId,
        event_id: data.eventId,
        alumni_id: data.alumniId,
        status: data.status,
      },
      { onConflict: "event_id,alumni_id" },
    );
    if (error)
      throw publicDatabaseError(error, "Não foi possível actualizar a inscrição no evento.");
    return { ok: true };
  });
