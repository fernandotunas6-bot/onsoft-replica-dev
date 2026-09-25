import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  loadSgaAdminClient,
  requireSgaWriterFor,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";
import {
  alumniContributionInputSchema,
  alumniOpportunityApplicationInputSchema,
  alumniSurveyInputSchema,
  alumniSurveyResponseInputSchema,
} from "./schemas";

async function assertAlumni(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  schoolId: string,
  alumniId: string,
) {
  const { data, error } = await db
    .from("alumni_profiles")
    .select("id")
    .eq("school_id", schoolId)
    .eq("id", alumniId)
    .maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível validar o Alumni.");
  if (!data) throw new Error("Alumni não encontrado nesta escola.");
}

export const applyToAlumniOpportunity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => alumniOpportunityApplicationInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterFor("pessoas", context.userId);
    const db = await loadSgaAdminClient();
    await assertAlumni(db, membership.schoolId, data.alumniId);
    const { data: opportunity, error: opportunityError } = await db
      .from("alumni_opportunities")
      .select("id, status")
      .eq("school_id", membership.schoolId)
      .eq("id", data.opportunityId)
      .maybeSingle();
    if (opportunityError)
      throw publicDatabaseError(opportunityError, "Não foi possível validar a oportunidade.");
    if (!opportunity) throw new Error("Oportunidade não encontrada nesta escola.");

    const { error } = await db.from("alumni_opportunity_applications").upsert(
      {
        school_id: membership.schoolId,
        opportunity_id: data.opportunityId,
        alumni_id: data.alumniId,
        status: data.status,
        applied_at: ["applied", "shortlisted", "accepted", "rejected"].includes(data.status)
          ? new Date().toISOString()
          : null,
        notes: data.notes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "opportunity_id,alumni_id" },
    );
    if (error)
      throw publicDatabaseError(error, "Não foi possível actualizar a candidatura Alumni.");
    return { ok: true };
  });

export const listAlumniSurveys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");
    const db = await loadSgaAdminClient();
    const { data, error } = await db
      .from("alumni_surveys")
      .select("*")
      .eq("school_id", membership.schoolId)
      .order("created_at", { ascending: false });
    if (error) throw publicDatabaseError(error, "Não foi possível carregar pesquisas Alumni.");
    return data ?? [];
  });

export const upsertAlumniSurvey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => alumniSurveyInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterFor("pessoas", context.userId);
    const db = await loadSgaAdminClient();
    const payload = {
      school_id: membership.schoolId,
      title: data.title,
      description: data.description,
      purpose: data.purpose,
      schema_json: data.schemaJson,
      status: data.status,
      opens_at: data.opensAt,
      closes_at: data.closesAt,
      updated_at: new Date().toISOString(),
    };
    const result = data.surveyId
      ? await db
          .from("alumni_surveys")
          .update(payload)
          .eq("school_id", membership.schoolId)
          .eq("id", data.surveyId)
          .select("id")
          .single()
      : await db.from("alumni_surveys").insert(payload).select("id").single();
    if (result.error)
      throw publicDatabaseError(result.error, "Não foi possível guardar a pesquisa Alumni.");
    return result.data;
  });

export const submitAlumniSurveyResponse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => alumniSurveyResponseInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterFor("pessoas", context.userId);
    const db = await loadSgaAdminClient();
    await assertAlumni(db, membership.schoolId, data.alumniId);
    const { data: survey, error: surveyError } = await db
      .from("alumni_surveys")
      .select("id, status")
      .eq("school_id", membership.schoolId)
      .eq("id", data.surveyId)
      .maybeSingle();
    if (surveyError) throw publicDatabaseError(surveyError, "Não foi possível validar a pesquisa.");
    if (!survey) throw new Error("Pesquisa não encontrada nesta escola.");
    const { error } = await db.from("alumni_survey_responses").upsert(
      {
        school_id: membership.schoolId,
        survey_id: data.surveyId,
        alumni_id: data.alumniId,
        response_json: data.responseJson,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: "survey_id,alumni_id" },
    );
    if (error) throw publicDatabaseError(error, "Não foi possível guardar a resposta da pesquisa.");
    return { ok: true };
  });

export const recordAlumniContribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => alumniContributionInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterFor("pessoas", context.userId);
    const db = await loadSgaAdminClient();
    await assertAlumni(db, membership.schoolId, data.alumniId);
    const occurredAt = data.occurredAt ?? new Date().toISOString();
    const { error } = await db.from("alumni_contributions").insert({
      school_id: membership.schoolId,
      alumni_id: data.alumniId,
      contribution_type: data.contributionType,
      amount: data.amount,
      currency: data.currency,
      hours: data.hours,
      designation: data.designation,
      occurred_at: occurredAt,
      reference: data.reference,
      notes: data.notes,
    });
    if (error) throw publicDatabaseError(error, "Não foi possível registar a contribuição Alumni.");

    await Promise.all([
      db.from("alumni_engagements").insert({
        school_id: membership.schoolId,
        alumni_id: data.alumniId,
        kind: data.contributionType === "volunteer_hours" ? "volunteer" : "donation",
        title: data.designation || "Contribuição Alumni",
        occurred_at: occurredAt,
        value_numeric: data.amount ?? data.hours ?? null,
        notes: data.notes,
      }),
      db
        .from("alumni_profiles")
        .update({ last_engagement_at: occurredAt })
        .eq("school_id", membership.schoolId)
        .eq("id", data.alumniId),
    ]);
    return { ok: true };
  });

export const getAlumniImpactAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");
    const db = await loadSgaAdminClient();
    const [
      { data: profiles },
      { data: contributions },
      { data: responses },
      { data: events },
      { data: mentorships },
    ] = await Promise.all([
      db
        .from("alumni_profiles")
        .select(
          "graduation_year, employment_status, industry, province, country, skills, profile_completion",
        )
        .eq("school_id", membership.schoolId),
      db
        .from("alumni_contributions")
        .select("contribution_type, amount, currency, hours, occurred_at")
        .eq("school_id", membership.schoolId),
      db
        .from("alumni_survey_responses")
        .select("survey_id, submitted_at")
        .eq("school_id", membership.schoolId),
      db
        .from("alumni_event_registrations")
        .select("event_id, status")
        .eq("school_id", membership.schoolId),
      db.from("alumni_mentorships").select("status").eq("school_id", membership.schoolId),
    ]);

    const rows = profiles ?? [];
    const byEmployment = Object.fromEntries(
      [...new Set(rows.map((row) => row.employment_status))].map((status) => [
        status,
        rows.filter((row) => row.employment_status === status).length,
      ]),
    );
    const byProvince = Object.fromEntries(
      [...new Set(rows.map((row) => row.province).filter(Boolean))].map((province) => [
        province,
        rows.filter((row) => row.province === province).length,
      ]),
    );
    const byCohort = Object.fromEntries(
      [...new Set(rows.map((row) => row.graduation_year).filter(Boolean))].map((year) => [
        String(year),
        rows.filter((row) => row.graduation_year === year).length,
      ]),
    );
    return {
      byEmployment,
      byProvince,
      byCohort,
      surveyResponses: (responses ?? []).length,
      eventRegistrations: (events ?? []).length,
      eventAttendance: (events ?? []).filter((row) => row.status === "attended").length,
      activeMentorships: (mentorships ?? []).filter((row) => row.status === "active").length,
      completedMentorships: (mentorships ?? []).filter((row) => row.status === "completed").length,
      contributions: contributions ?? [],
    };
  });
