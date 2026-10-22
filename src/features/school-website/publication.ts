import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { publicWebsiteContent, websiteTemplate, type WebsiteState } from "./content-model";

export async function loadSchoolPublication(schoolId: string, state: WebsiteState) {
  const publication = publicWebsiteContent(state);
  const values = { ...(publication?.values ?? {}) };
  const unavailablePrograms: string[] = [];
  const db = await loadSgaAdminClient();
  const bindings = state.published?.content.programBindings ?? {};
  const ids = [...new Set(Object.values(bindings))];
  if (ids.length) {
    const result = await db
      .from("programs")
      .select("id, name")
      .eq("school_id", schoolId)
      .eq("is_active", true)
      .in("id", ids);
    if (result.error) throw new Error("Program lookup failed");
    const names = new Map(result.data.map((program) => [program.id, program.name]));
    for (const [key, id] of Object.entries(bindings)) {
      const name = names.get(id);
      if (name) values[key] = name;
      else unavailablePrograms.push(key);
    }
  }
  const slug = state.published?.content.campaignSlug;
  let admissions: { isOpen: boolean; path: string | null } | null = null;
  if (slug) {
    const campaign = await db
      .from("enrollment_forms")
      .select("is_open")
      .eq("school_id", schoolId)
      .eq("slug", slug)
      .maybeSingle();
    if (campaign.error) throw new Error("Campaign lookup failed");
    const isOpen = campaign.data?.is_open === true;
    admissions = { isOpen, path: isOpen ? `/matricula/${encodeURIComponent(slug)}` : null };
  }
  return {
    ...publication,
    apiVersion: 1,
    templateVersion: publication?.templateVersion ?? websiteTemplate.version,
    values,
    unavailablePrograms,
    admissions,
  };
}
