import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { publicWebsiteContent, websiteTemplate, type WebsiteState } from "./content-model";
import { schoolIdentityValues, type SchoolSiteIdentity } from "./site-identity";

/**
 * Identidade por omissão de uma escola que ainda não publicou nada.
 *
 * Sem isto o site servia o modelo tal como foi compilado — o nome, os cursos e
 * as notícias do ISPAB sob o endereço da escola. Era o estado das 48 escolas
 * da produção a 2026-10-21: nenhuma tinha linha `school_website`. A identidade
 * vem da própria escola, logo a correcção não depende de semeadura nenhuma; o
 * que a criação da escola semeia é o ponto de partida *editável*, não a
 * condição para o site estar certo.
 */
export async function loadSchoolPublication(
  schoolId: string,
  state: WebsiteState,
  identity?: SchoolSiteIdentity,
) {
  const publication = publicWebsiteContent(state);
  const values = {
    ...(publication ? {} : identity ? schoolIdentityValues(identity) : {}),
    ...(publication?.values ?? {}),
  };
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
