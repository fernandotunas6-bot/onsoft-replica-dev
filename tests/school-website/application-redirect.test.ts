import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `/candidatura/` do website: com campanha aberta leva ao formulário oficial do
 * SIGA (`/matricula/<campanha>`), mesmo numa escola que só publica a
 * identidade; sem campanha não fica servida como candidatura.
 */
const mocks = vi.hoisted(() => ({
  admissions: { isOpen: true, path: "/matricula/inscricoes-2026" } as {
    isOpen: boolean;
    path: string | null;
  },
}));
vi.mock("@/integrations/supabase/sga-admin", () => ({ loadSgaAdminClient: vi.fn() }));
vi.mock("@/features/school-website/school-sites", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/features/school-website/school-sites")>();
  const { readWebsiteState } = await import("@/features/school-website/content-model");
  return {
    ...original,
    loadSchoolSite: async (request: Request) => {
      const selection = original.schoolSiteRequest(new URL(request.url));
      if (!selection) return null;
      return {
        schoolId: "school-a",
        publicCode: "SCHOOL-A",
        name: "Escola A",
        logoUrl: null,
        slug: "escola-a",
        origin: "https://escola-a.portal-siga.com",
        basePath: "/site",
        homePath: "/",
        portalUrl: "https://escola-a.portal-siga.com/portal?escola=escola-a",
        allowedOrigins: [],
        // Escola nova: ainda sem publicação — âmbito só de identidade.
        state: readWebsiteState(null),
        page: selection.page,
      };
    },
  };
});
vi.mock("@/features/school-website/publication", async () => {
  const { websiteTemplate } = await import("@/features/school-website/content-model");
  return {
    loadSchoolPublication: async () => ({
      apiVersion: 1,
      templateVersion: websiteTemplate.version,
      values: {},
      unavailablePrograms: [],
      admissions: mocks.admissions,
    }),
  };
});
vi.mock("@/features/school-website/blog-server", () => ({
  loadPublishedSchoolBlog: async () => ({ posts: [] }),
}));

const { handleSchoolWebsite } = await import("@/features/school-website/site-http");
const get = (path: string) =>
  handleSchoolWebsite(new Request(`https://escola-a.portal-siga.com${path}`));

beforeEach(() => {
  mocks.admissions = { isOpen: true, path: "/matricula/inscricoes-2026" };
});

describe("e-inscrição pelo website da escola", () => {
  it("com campanha aberta, a candidatura vai para o formulário oficial do SIGA", async () => {
    for (const path of ["/site/candidatura/", "/site/candidatura"]) {
      const response = await get(path);
      expect(response?.status).toBe(302);
      expect(response?.headers.get("location")).toBe(
        "https://escola-a.portal-siga.com/matricula/inscricoes-2026",
      );
    }
  });

  it("o formulário oficial é servido pelo SIGA, não pelo website", () => {
    return import("@/features/school-website/school-sites").then(({ schoolSiteRequest }) =>
      expect(
        schoolSiteRequest(new URL("https://escola-a.portal-siga.com/matricula/inscricoes-2026")),
      ).toBeNull(),
    );
  });

  it("sem campanha aberta, a escola nova não serve a candidatura de demonstração", async () => {
    mocks.admissions = { isOpen: false, path: null };
    const response = await get("/site/candidatura/");
    expect(response?.status).toBe(404);
    expect(await response?.text()).not.toContain("CANDIDATURA DEMONSTRATIVA");
  });
});
