import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  loadSgaAdminClient,
  requireSgaWriterFor,
  requireSgaWriterForWrite,
} from "@/integrations/supabase/sga-admin";
import { updateSettingsDomainValue } from "@/features/school/settings-domains";
import {
  changeWebsiteSchema,
  changeWebsiteState,
  readWebsiteState,
  WEBSITE_DOMAIN,
} from "./content-model";

export const getSchoolWebsiteEditor = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const member = await requireSgaWriterFor("gestao", context.supabase, context.userId, [
      "Administrador",
    ]);
    const db = await loadSgaAdminClient();
    const [settings, school, programs, campaigns] = await Promise.all([
      db
        .from("school_settings")
        .select("value")
        .eq("school_id", member.schoolId)
        .eq("domain", WEBSITE_DOMAIN)
        .maybeSingle(),
      db.from("schools").select("public_code, name").eq("id", member.schoolId).single(),
      db
        .from("programs")
        .select("id, name")
        .eq("school_id", member.schoolId)
        .eq("is_active", true)
        .order("name"),
      db.from("enrollment_forms").select("slug, title, is_open").eq("school_id", member.schoolId),
    ]);
    if (settings.error || school.error || programs.error || campaigns.error)
      throw new Error("Não foi possível carregar o editor do website.");
    return {
      state: readWebsiteState(settings.data?.value),
      school: school.data,
      programs: programs.data ?? [],
      campaigns: campaigns.data ?? [],
    };
  });

export const changeSchoolWebsite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => changeWebsiteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const member = await requireSgaWriterForWrite("gestao", context.supabase, context.userId, [
      "Administrador",
    ]);
    const db = await loadSgaAdminClient();
    if (data.draft) {
      if (data.draft.campaignSlug) {
        const campaign = await db
          .from("enrollment_forms")
          .select("slug")
          .eq("school_id", member.schoolId)
          .eq("slug", data.draft.campaignSlug)
          .maybeSingle();
        if (campaign.error || !campaign.data)
          throw new Error("A campanha de candidaturas não pertence a esta escola.");
      }
      const ids = [...new Set(Object.values(data.draft.programBindings))];
      if (ids.length) {
        const programs = await db
          .from("programs")
          .select("id")
          .eq("school_id", member.schoolId)
          .eq("is_active", true)
          .in("id", ids);
        if (programs.error || programs.data?.length !== ids.length)
          throw new Error("Um dos cursos ligados não está activo nesta escola.");
      }
    }
    // Record the request before mutation: an audit failure cannot silently allow publication.
    const audit = await db.from("audit_logs").insert({
      school_id: member.schoolId,
      actor_user_id: context.userId,
      action: `school.website.${data.action}_requested`,
      entity_type: "school_settings",
      metadata: { expected_revision: data.expectedRevision },
    });
    if (audit.error)
      throw new Error("Não foi possível registar a alteração na auditoria. Tente novamente.");
    // school_id always comes from the validated, active membership, never the editor.
    const state = await updateSettingsDomainValue(
      db,
      member.schoolId,
      WEBSITE_DOMAIN,
      (current) => changeWebsiteState(current, data),
      context.userId,
    );
    return state;
  });
