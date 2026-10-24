import { beforeEach, describe, expect, it, vi } from "vitest";
import { schoolWebsiteTestDb } from "./fake-db";
import { changeWebsiteState, websiteTemplate } from "@/features/school-website/content-model";
const mocks = vi.hoisted(() => ({ db: vi.fn(), posts: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (options: unknown) => options }));
vi.mock("@/integrations/supabase/sga-admin", () => ({ loadSgaAdminClient: mocks.db }));
vi.mock("@/features/school-website/blog-server", () => ({ loadPublishedSchoolBlog: mocks.posts }));
import { Route as ContentRoute } from "@/routes/api/public/school-content/$code";
import { Route as BlogRoute } from "@/routes/api/public/school-blog/$code";
const text = websiteTemplate.fields.find((field) => field.kind === "text" && !field.dataPath)!;
const state = (title: string) =>
  changeWebsiteState(null, {
    action: "publish",
    expectedRevision: 0,
    draft: {
      templateVersion: websiteTemplate.version,
      websiteUrl: "https://external.example",
      values: { [text.key]: title },
      programBindings: {},
      campaignSlug: "",
    },
  });
type Endpoint = {
  server: {
    handlers: { GET: (input: { request: Request; params: { code: string } }) => Promise<Response> };
  };
};
const endpoints = [
  ["conteúdo", ContentRoute],
  ["blog", BlogRoute],
] as const;
let tables: Record<string, Record<string, unknown>[]>;
beforeEach(() => {
  vi.clearAllMocks();
  const published = state("PUBLICAÇÃO-A");
  const edited = changeWebsiteState(published, {
    action: "save",
    expectedRevision: 1,
    draft: { ...published.draft, values: { [text.key]: "RASCUNHO-SECRETO-A" } },
  });
  tables = {
    schools: [
      { id: "school-a", public_code: "AA", status: "active", tenant_id: "tenant-a" },
      { id: "school-b", public_code: "BB", status: "active", tenant_id: "tenant-b" },
    ],
    tenants: [
      { id: "tenant-a", status: "active", subscription_status: "active" },
      { id: "tenant-b", status: "active", subscription_status: "active" },
    ],
    tenant_domains: [
      {
        tenant_id: "tenant-a",
        hostname: "a.example",
        status: "active",
        type: "siga_subdomain",
        verified_at: null,
      },
      {
        tenant_id: "tenant-b",
        hostname: "b.example",
        status: "active",
        type: "custom_domain",
        verified_at: "2026-10-24",
      },
    ],
    school_settings: [
      { school_id: "school-a", domain: "school_website", value: edited },
      { school_id: "school-b", domain: "school_website", value: state("PUBLICAÇÃO-B") },
    ],
  };
  mocks.db.mockImplementation(async () => schoolWebsiteTestDb(tables));
  mocks.posts.mockImplementation(async (schoolId: string) => ({
    posts: [{ slug: "noticia", title: schoolId, body: "publicado" }],
    total: 1,
  }));
});
const request = (route: unknown, code = "AA", origin?: string) =>
  (route as Endpoint).server.handlers.GET({
    request: new Request(`https://siga.example/api/public/endpoint/${code}`, {
      headers: origin ? { Origin: origin } : {},
    }),
    params: { code },
  });
describe.each(endpoints)("API pública de %s", (_name, route) => {
  it.each(["inactive", "suspended", "archived", "provisioning", "unknown", null])(
    "recusa escola em estado %s",
    async (status) => {
      tables.schools[0].status = status;
      expect((await request(route)).status).toBe(404);
      expect(mocks.posts).not.toHaveBeenCalled();
    },
  );
  it("não aceita origem de outra escola, domínio pendente, não verificado ou tipo desconhecido", async () => {
    expect((await request(route, "AA", "https://b.example")).status).toBe(403);
    const own = tables.tenant_domains[0];
    for (const change of [
      { status: "pending", type: "custom_domain", verified_at: "2026-10-24" },
      { status: "active", type: "custom_domain", verified_at: null },
      { status: "active", type: "unknown", verified_at: "2026-10-24" },
    ]) {
      Object.assign(own, change);
      expect((await request(route, "AA", "https://a.example")).status).toBe(403);
    }
  });
  it("entrega apenas dados publicados da escola resolvida e impede cache partilhada", async () => {
    const response = await request(route, "AA", "https://a.example");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://a.example");
    expect(await response.text()).not.toMatch(/RASCUNHO-SECRETO|PUBLICAÇÃO-B|school-b/);
    if (route === BlogRoute) expect(mocks.posts).toHaveBeenCalledWith("school-a", 0, undefined);
  });
  it("falha fechado para tenant suspenso", async () => {
    tables.tenants[0].status = "suspended";
    expect((await request(route)).status).toBe(404);
  });
});
