import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/sga-admin", () => ({ loadSgaAdminClient: vi.fn() }));
import { schoolSiteRequest, type SchoolSite } from "@/features/school-website/school-sites";
import { getPlatformDomain } from "@/lib/saas/platform-domain";
import { readWebsiteState, websiteTemplate } from "@/features/school-website/content-model";
import {
  applyWebsiteValues,
  renderSchoolWebsite,
  schoolWebsiteHref,
} from "@/features/school-website/render-site";
const domain = getPlatformDomain();
const site = (name = "Escola A"): SchoolSite => ({
  schoolId: "school-a",
  publicCode: "SCHOOL-A",
  name,
  logoUrl: null,
  slug: "escola-a",
  origin: `https://escola-a.${domain}`,
  basePath: "/site",
  homePath: "/",
  portalUrl: `https://escola-a.${domain}/portal?escola=escola-a`,
  allowedOrigins: [],
  state: readWebsiteState(null),
});
const publication = {
  apiVersion: 1,
  templateVersion: websiteTemplate.version,
  values: {},
  unavailablePrograms: [],
  admissions: null,
};
describe("website no endereço de cada escola", () => {
  it("o subdomínio e um domínio próprio seleccionam a página pública; o portal permanece operacional", () => {
    expect(schoolSiteRequest(new URL(`https://escola-a.${domain}/`))).toMatchObject({
      mode: "hostname",
      value: `escola-a.${domain}`,
      page: "/",
    });
    expect(schoolSiteRequest(new URL("https://www.escola.ao/site/cursos/"))).toMatchObject({
      mode: "hostname",
      page: "/cursos/",
    });
    for (const path of ["/portal", "/faturas", "/calendario", "/api/public/school-content/CODE"])
      expect(schoolSiteRequest(new URL(`https://escola-a.${domain}${path}`))).toBeNull();
  });
  it("o endereço partilhado só funciona no domínio central e não aceita slugs inválidos", () => {
    expect(schoolSiteRequest(new URL(`https://${domain}/escolas/escola-a/blog/`))).toMatchObject({
      mode: "slug",
      value: "escola-a",
      basePath: "/escolas/escola-a",
      page: "/blog/",
    });
    expect(schoolSiteRequest(new URL("https://evil.example/escolas/escola-a/blog/"))).toBeNull();
    expect(schoolSiteRequest(new URL(`https://${domain}/escolas/admin/`))).toBeNull();
    expect(schoolSiteRequest(new URL(`https://admin.${domain}/`))).toBeNull();
  });
  it("cada resposta recebe só a identidade da sua escola, sem alterar o template partilhado", () => {
    const a = renderSchoolWebsite(site("Escola A"), "/", publication, undefined, [])!;
    const b = renderSchoolWebsite(
      { ...site("Escola B"), schoolId: "school-b", publicCode: "SCHOOL-B" },
      "/",
      publication,
      undefined,
      [],
    )!;
    expect(a).toContain("Escola A");
    expect(a).not.toContain("Escola B");
    expect(b).toContain("Escola B");
    expect(b).not.toContain("Escola A");
    expect(a).not.toContain("ISPAB");
    expect(a).toContain('href="/site/cursos/"');
    expect(a).toContain('src="/_school-website/app.js"');
    expect(a).toContain('"storageId":"SCHOOL-A"');
    expect(b).toContain('"storageId":"SCHOOL-B"');
  });
  it("os links públicos não tomam os caminhos dos módulos privados", () => {
    expect(schoolWebsiteHref("/calendario/", site())).toBe("/site/calendario/");
    expect(schoolWebsiteHref("/login/", site())).toContain("/portal?escola=escola-a");
    expect(schoolWebsiteHref("/matricula/campaign", site())).toBe("/matricula/campaign");
    expect(schoolWebsiteHref("/api/private", site())).toBe("/api/private");
    expect(schoolWebsiteHref("https://other.example/", site())).toBe("https://other.example/");
  });
  it("metadados e texto editado são escapados sem interpretar substituições $&", () => {
    const html = applyWebsiteValues(
      '<h1><!--site:heading-->Inicial<!--/site--></h1><img src="/old" data-site-fields="src:photo">',
      { heading: "<script>alert(1)</script> $&", photo: "https://images.example/$&.webp" },
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain('src="https://images.example/$&amp;.webp"');
  });
  it("o bootstrap impede fechar o elemento script com conteúdo publicado", () => {
    const html = renderSchoolWebsite(site(), "/", {
      ...publication,
      values: { test: "</script><script>alert(1)</script>" },
    })!;
    expect(html).toContain("\\u003c/script>");
    expect(html.match(/<script\b/g)).toHaveLength(2);
  });
});
