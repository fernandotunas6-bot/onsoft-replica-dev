import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock("@/integrations/supabase/sga-admin", () => ({ loadSgaAdminClient: mocks.db }));
import { loadSchoolSite, schoolSiteLinks } from "@/features/school-website/school-sites";
import { getPlatformDomain } from "@/lib/saas/platform-domain";
import { schoolWebsiteTestDb } from "./fake-db";
const domain = getPlatformDomain();
let tables: Record<string, Record<string, unknown>[]>;
beforeEach(() => {
  tables = {
    tenant_domains: [
      {
        tenant_id: "tenant-a",
        hostname: `escola-a.${domain}`,
        type: "siga_subdomain",
        status: "active",
        verified_at: null,
      },
      {
        tenant_id: "tenant-b",
        hostname: "www.escola-b.ao",
        type: "custom_domain",
        status: "active",
        verified_at: "2026-10-21",
      },
    ],
    tenants: [
      { id: "tenant-a", slug: "escola-a", status: "active" },
      { id: "tenant-b", slug: "escola-b", status: "active" },
    ],
    schools: [
      {
        id: "school-a",
        tenant_id: "tenant-a",
        public_code: "SCHOOL-A",
        name: "Escola A",
        status: "active",
        email: "private@example.com",
      },
      {
        id: "school-b",
        tenant_id: "tenant-b",
        public_code: "SCHOOL-B",
        name: "Escola B",
        status: "active",
      },
    ],
    school_settings: [],
  };
  mocks.db.mockImplementation(async () => schoolWebsiteTestDb(tables));
});
describe("resolução e propriedade dos websites escolares", () => {
  it("a escola vem do hostname registado, nunca de X-Forwarded-Host", async () => {
    const result = await loadSchoolSite(
      new Request(`https://escola-a.${domain}/`, {
        headers: { "X-Forwarded-Host": "www.escola-b.ao" },
      }),
    );
    expect(result?.name).toBe("Escola A");
    expect(result?.schoolId).toBe("school-a");
    expect(JSON.stringify(result)).not.toContain("private@example.com");
    expect(result?.portalUrl).toContain("/portal?escola=escola-a");
  });
  it("só um domínio próprio verificado e activo apresenta o site da escola", async () => {
    const url = new Request("https://www.escola-b.ao/");
    expect((await loadSchoolSite(url))?.name).toBe("Escola B");
    tables.tenant_domains[1].verified_at = null;
    expect(await loadSchoolSite(url)).toBeNull();
    tables.tenant_domains[1].verified_at = "2026-10-21";
    tables.tenant_domains[1].status = "pending";
    expect(await loadSchoolSite(url)).toBeNull();
    expect(await loadSchoolSite(new Request("https://unknown.example/"))).toBeNull();
  });
  it("bloqueios do tenant e arquivo da escola também se aplicam ao site", async () => {
    tables.tenants[0].status = "suspended";
    expect(await loadSchoolSite(new Request(`https://escola-a.${domain}/`))).toBeNull();
    tables.tenants[0].status = "active";
    tables.schools[0].status = "archived";
    expect(await loadSchoolSite(new Request(`https://escola-a.${domain}/`))).toBeNull();
  });
  it("a página partilhada resolve a mesma escola sem depender do wildcard DNS", async () => {
    const result = await loadSchoolSite(new Request(`https://${domain}/escolas/escola-b/blog/`));
    expect(result).toMatchObject({
      schoolId: "school-b",
      basePath: "/escolas/escola-b",
      page: "/blog/",
    });
  });
  it("o administrador recebe o domínio próprio verificado e um endereço alternativo", async () => {
    const db = schoolWebsiteTestDb(tables);
    const result = await schoolSiteLinks(db as never, "school-b");
    expect(result?.websiteUrl).toBe("https://www.escola-b.ao/");
    expect(result?.fallbackUrl).toContain("/escolas/escola-b/");
    expect(db.calls.find((call) => call.table === "tenant_domains")?.filters).toContainEqual([
      "tenant_id",
      "tenant-b",
    ]);
  });
});
