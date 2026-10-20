import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultSchoolSiteSettings,
  withPublication,
  withoutPublication,
} from "@/features/school-site/schema";

type Row = Record<string, unknown> | null;
const mock = vi.hoisted(() => ({
  records: {} as Record<string, Row>,
  queries: [] as Array<{ table: string; filters: Array<[string, unknown]> }>,
  failures: {} as Record<string, boolean>,
  ordering: [] as Array<{ table: string; column: string; ascending: boolean }>,
  limits: [] as Array<{ table: string; count: number }>,
}));

vi.mock("@/integrations/supabase/sga-admin", () => ({
  loadSgaAdminClient: async () => ({
    from: (table: string) => {
      const filters: Array<[string, unknown]> = [];
      mock.queries.push({ table, filters });
      const chain = {
        select: () => chain,
        order: (column: string, options: { ascending: boolean }) => {
          mock.ordering.push({ table, column, ascending: options.ascending });
          return chain;
        },
        limit: (count: number) => {
          mock.limits.push({ table, count });
          return chain;
        },
        eq: (field: string, value: unknown) => {
          filters.push([field, value]);
          return chain;
        },
        maybeSingle: async () => ({
          data: mock.records[table] ?? null,
          error: mock.failures[table] ? { message: "Database unavailable" } : null,
        }),
      };
      return chain;
    },
  }),
}));

import { loadPublishedSchoolSite } from "@/features/school-site/public-server";

const HOSTNAME = "escola-exemplo.portal-siga.com";

beforeEach(() => {
  vi.stubEnv("SCHOOL_SITES_ENABLED", "true");
  mock.queries.length = 0;
  mock.ordering.length = 0;
  mock.limits.length = 0;
  mock.failures = {};
  mock.records = {
    tenant_domains: { tenant_id: "tenant-a" },
    tenants: {
      id: "tenant-a",
      status: "active",
      subscription_status: "active",
      trial_ends_at: null,
      billing_exempt: false,
    },
    schools: {
      id: "school-a",
      name: "Escola A",
      status: "active",
      email: "institucional@escola.test",
      phone: "+244000000000",
      address: "Angola",
    },
    school_settings: {
      value: withPublication(defaultSchoolSiteSettings("Escola A")),
    },
  };
});

afterEach(() => vi.unstubAllEnvs());

describe("school-site API — isolamento público por hostname", () => {
  it("nunca consulta o banco nem disponibiliza sites se a migração não foi activada", async () => {
    vi.stubEnv("SCHOOL_SITES_ENABLED", "false");
    expect(await loadPublishedSchoolSite(HOSTNAME)).toBeNull();
    expect(mock.queries).toHaveLength(0);
  });
  it("consulta domínio exacto e escola do tenant, não identidade fornecida pelo browser", async () => {
    const site = await loadPublishedSchoolSite(HOSTNAME);
    expect(site?.schoolName).toBe("Escola A");
    expect(mock.queries[0]).toEqual({
      table: "tenant_domains",
      filters: [
        ["hostname", HOSTNAME],
        ["status", "active"],
      ],
    });
    expect(mock.queries.find((entry) => entry.table === "schools")?.filters).toEqual([
      ["tenant_id", "tenant-a"],
    ]);
    expect(mock.queries.find((entry) => entry.table === "school_settings")?.filters).toEqual([
      ["school_id", "school-a"],
      ["domain", "school_website"],
    ]);
    expect(JSON.stringify(site)).not.toContain("tenant-a");
    expect(JSON.stringify(site)).not.toContain("school-a");
    expect(JSON.stringify(site)).not.toContain("draft");
  });

  it("não expõe contactos se a escola não consentiu", async () => {
    const site = await loadPublishedSchoolSite(HOSTNAME);
    expect(site?.contact).toBeNull();
  });

  it("não publica nem transfere um mero rascunho", async () => {
    mock.records.school_settings = { value: defaultSchoolSiteSettings("Escola A") };
    expect(await loadPublishedSchoolSite(HOSTNAME)).toBeNull();
  });

  it("não ressuscita uma publicação antiga depois da última versão despublicada", async () => {
    const oldPublished = withPublication(defaultSchoolSiteSettings("Escola A"));
    mock.records.school_settings = {
      version: 3,
      value: withoutPublication(oldPublished),
    };
    expect(await loadPublishedSchoolSite(HOSTNAME)).toBeNull();
    expect(mock.ordering).toContainEqual({
      table: "school_settings",
      column: "version",
      ascending: false,
    });
    expect(mock.limits).toContainEqual({ table: "school_settings", count: 1 });
  });

  it("não serve escola de outro hostname, tenant arquivado ou escola arquivada", async () => {
    mock.records.tenant_domains = null;
    expect(await loadPublishedSchoolSite(HOSTNAME)).toBeNull();

    mock.records.tenant_domains = { tenant_id: "tenant-a" };
    mock.records.tenants = { ...mock.records.tenants, status: "archived" };
    expect(await loadPublishedSchoolSite(HOSTNAME)).toBeNull();

    mock.records.tenants = { ...mock.records.tenants, status: "active" };
    mock.records.schools = { ...mock.records.schools, status: "archived" };
    expect(await loadPublishedSchoolSite(HOSTNAME)).toBeNull();
  });

  it("recusa hostname manipulado antes de consultar o banco", async () => {
    expect(await loadPublishedSchoolSite("escola.portal-siga.com:443")).toBeNull();
    expect(await loadPublishedSchoolSite("host/../../outro")).toBeNull();
    expect(mock.queries).toHaveLength(0);
  });

  it("falha fechado com schema desconhecido ou DB indisponível", async () => {
    mock.records.school_settings = { value: { wrongSchema: true } };
    await expect(loadPublishedSchoolSite(HOSTNAME)).rejects.toThrow();

    mock.failures = { tenant_domains: true };
    await expect(loadPublishedSchoolSite(HOSTNAME)).rejects.toThrow(
      "Falha ao resolver o domínio institucional",
    );
  });
});
