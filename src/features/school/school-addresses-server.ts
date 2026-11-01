/**
 * Endereços públicos da escola da sessão: website institucional e portal
 * SIGA Plus. Usados na área do cliente (Assinatura) e no assistente de
 * configuração, para o Administrador saber onde a escola fica na internet
 * depois de a criar no WEB.
 *
 * A escola vem sempre da membership no servidor, nunca de um identificador do
 * browser. A regra dos endereços é a de `schoolSiteLinks` (domínio próprio
 * verificado → subdomínio da plataforma → `/escolas/<slug>/`), para o link
 * mostrado ser exactamente o que o Worker serve.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadSgaAdminClient, resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";
import { schoolSiteLinks } from "@/features/school-website/school-sites";
import { resolveSchoolAdmissions } from "@/features/school-website/admissions";
import { readWebsiteState, WEBSITE_DOMAIN } from "@/features/school-website/content-model";

export type SchoolAddresses = {
  /** Website institucional público da escola. */
  websiteUrl: string;
  /** Portal SIGA Plus da escola: entrada da equipa, alunos e encarregados. */
  portalUrl: string;
  /**
   * Formulário oficial de inscrição (`/matricula/<campanha>`) quando há uma
   * campanha aberta — o mesmo destino do botão «Candidatura» do website.
   */
  enrollmentUrl: string | null;
};

export const getMySchoolAddresses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SchoolAddresses | null> => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem escola activa.");
    if (membership.appRole !== "Administrador") {
      throw new Error("Só o Administrador da escola vê os endereços da instalação.");
    }
    const db = await loadSgaAdminClient();
    const links = await schoolSiteLinks(db, membership.schoolId);
    if (!links) return null;
    const settings = await db
      .from("school_settings")
      .select("value")
      .eq("school_id", membership.schoolId)
      .eq("domain", WEBSITE_DOMAIN)
      .maybeSingle();
    const campaignSlug = settings.error
      ? null
      : readWebsiteState(settings.data?.value).published?.content.campaignSlug;
    const admissions = await resolveSchoolAdmissions(db, membership.schoolId, campaignSlug).catch(
      () => null,
    );
    const enrollmentUrl =
      admissions?.isOpen && admissions.path
        ? `${new URL(links.portalUrl).origin}${admissions.path}`
        : null;
    return { websiteUrl: links.websiteUrl, portalUrl: links.portalUrl, enrollmentUrl };
  });
