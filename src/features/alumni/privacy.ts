import type { TablesInsert } from "@/integrations/supabase/types";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { loadSgaAdminClient, resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";

const preferencesSchema = z.object({
  emailEnabled: z.boolean(),
  smsEnabled: z.boolean(),
  whatsappEnabled: z.boolean(),
  opportunitiesEnabled: z.boolean(),
  eventsEnabled: z.boolean(),
  mentoringEnabled: z.boolean(),
  surveysEnabled: z.boolean(),
  fundraisingEnabled: z.boolean(),
  contactConsent: z.boolean(),
  directoryVisibility: z.enum(["private", "school", "alumni"]),
});

async function ownContext(userId: string) {
  const membership = await resolveSgaMembershipAdmin(userId);
  if (!membership) throw new Error("Sem vínculo activo com uma escola.");
  const db = await loadSgaAdminClient();
  const { data: profile, error } = await db
    .from("alumni_profiles")
    .select("id, contact_consent, directory_visibility")
    .eq("school_id", membership.schoolId)
    .eq("auth_user_id", userId)
    .eq("self_service_enabled", true)
    .maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível validar o seu perfil Alumni.");
  if (!profile) throw new Error("O seu Portal Alumni ainda não está activado.");
  return { membership, db, profile };
}

export const getMyAlumniPrivacy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { membership, db, profile } = await ownContext(context.userId);
    const { data: preferences, error } = await db
      .from("alumni_communication_preferences")
      .select(
        "email_enabled, sms_enabled, whatsapp_enabled, opportunities_enabled, events_enabled, mentoring_enabled, surveys_enabled, fundraising_enabled",
      )
      .eq("school_id", membership.schoolId)
      .eq("alumni_id", profile.id)
      .maybeSingle();
    if (error)
      throw publicDatabaseError(error, "Não foi possível carregar as preferências Alumni.");

    return {
      contactConsent: profile.contact_consent,
      directoryVisibility: profile.directory_visibility,
      emailEnabled: preferences?.email_enabled ?? true,
      smsEnabled: preferences?.sms_enabled ?? false,
      whatsappEnabled: preferences?.whatsapp_enabled ?? false,
      opportunitiesEnabled: preferences?.opportunities_enabled ?? true,
      eventsEnabled: preferences?.events_enabled ?? true,
      mentoringEnabled: preferences?.mentoring_enabled ?? true,
      surveysEnabled: preferences?.surveys_enabled ?? true,
      fundraisingEnabled: preferences?.fundraising_enabled ?? false,
    };
  });

export const updateMyAlumniPrivacy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => preferencesSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { membership, db, profile } = await ownContext(context.userId);
    const previous = {
      contactConsent: profile.contact_consent,
      directoryVisibility: profile.directory_visibility,
    };
    const now = new Date().toISOString();

    const [profileResult, preferenceResult] = await Promise.all([
      db
        .from("alumni_profiles")
        .update({
          contact_consent: data.contactConsent,
          directory_visibility: data.directoryVisibility,
          updated_at: now,
        })
        .eq("school_id", membership.schoolId)
        .eq("id", profile.id),
      db.from("alumni_communication_preferences").upsert(
        {
          school_id: membership.schoolId,
          alumni_id: profile.id,
          email_enabled: data.emailEnabled,
          sms_enabled: data.smsEnabled,
          whatsapp_enabled: data.whatsappEnabled,
          opportunities_enabled: data.opportunitiesEnabled,
          events_enabled: data.eventsEnabled,
          mentoring_enabled: data.mentoringEnabled,
          surveys_enabled: data.surveysEnabled,
          fundraising_enabled: data.fundraisingEnabled,
          updated_at: now,
        },
        { onConflict: "school_id,alumni_id" },
      ),
    ]);
    if (profileResult.error)
      throw publicDatabaseError(
        profileResult.error,
        "Não foi possível actualizar a privacidade Alumni.",
      );
    if (preferenceResult.error)
      throw publicDatabaseError(
        preferenceResult.error,
        "Não foi possível guardar as preferências de comunicação.",
      );

    const auditRows: TablesInsert<"alumni_privacy_audit">[] = [
      {
        school_id: membership.schoolId,
        alumni_id: profile.id,
        auth_user_id: context.userId,
        action: "consent_update",
        previous_value: previous,
        new_value: data,
        occurred_at: now,
      },
    ];
    if (previous.directoryVisibility !== data.directoryVisibility) {
      auditRows.push({
        school_id: membership.schoolId,
        alumni_id: profile.id,
        auth_user_id: context.userId,
        action: "visibility_update",
        previous_value: { directoryVisibility: previous.directoryVisibility },
        new_value: { directoryVisibility: data.directoryVisibility },
        occurred_at: now,
      });
    }
    const { error: auditError } = await db.from("alumni_privacy_audit").insert(auditRows);
    if (auditError)
      throw publicDatabaseError(
        auditError,
        "As preferências foram guardadas, mas a auditoria falhou.",
      );
    return { ok: true };
  });

export const listMyAlumniPrivacyAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { membership, db, profile } = await ownContext(context.userId);
    const { data, error } = await db
      .from("alumni_privacy_audit")
      .select("id, action, previous_value, new_value, occurred_at")
      .eq("school_id", membership.schoolId)
      .eq("alumni_id", profile.id)
      .order("occurred_at", { ascending: false })
      .limit(50);
    if (error)
      throw publicDatabaseError(error, "Não foi possível carregar a auditoria de privacidade.");
    return data ?? [];
  });
