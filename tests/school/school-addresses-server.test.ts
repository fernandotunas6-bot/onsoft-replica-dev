import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `getMySchoolAddresses`: website e portal da escola da sessão, só para o
 * Administrador. A escola vem da membership no servidor, nunca do browser.
 */

const mocks = vi.hoisted(() => ({
  membership: { schoolId: "school-a", appRole: "Administrador" } as {
    schoolId: string;
    appRole: string;
  } | null,
  linkSchoolIds: [] as string[],
  links: {
    websiteUrl: "https://liceu.portal-siga.com/",
    fallbackUrl: "https://portal-siga.com/escolas/liceu/",
    portalUrl: "https://liceu.portal-siga.com/portal?escola=liceu",
    domains: [{ hostname: "liceu.portal-siga.com" }],
  } as Record<string, unknown> | null,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      validator: () => builder,
      handler: (fn: unknown) => fn,
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/sga-admin", () => ({
  resolveSgaMembershipAdmin: async () => mocks.membership,
  loadSgaAdminClient: async () => ({}),
}));
vi.mock("@/features/school-website/school-sites", () => ({
  schoolSiteLinks: async (_db: unknown, schoolId: string) => {
    mocks.linkSchoolIds.push(schoolId);
    return mocks.links;
  },
}));

const { getMySchoolAddresses } = await import("@/features/school/school-addresses-server");
const call = getMySchoolAddresses as unknown as (input: {
  context: { userId: string };
}) => Promise<unknown>;

beforeEach(() => {
  mocks.membership = { schoolId: "school-a", appRole: "Administrador" };
  mocks.linkSchoolIds = [];
});

describe("getMySchoolAddresses", () => {
  it("devolve só o website e o portal da escola da membership", async () => {
    await expect(call({ context: { userId: "u1" } })).resolves.toEqual({
      websiteUrl: "https://liceu.portal-siga.com/",
      portalUrl: "https://liceu.portal-siga.com/portal?escola=liceu",
    });
    expect(mocks.linkSchoolIds).toEqual(["school-a"]);
  });

  it("recusa quem não é Administrador da escola", async () => {
    mocks.membership = { schoolId: "school-a", appRole: "Secretaria" };
    await expect(call({ context: { userId: "u1" } })).rejects.toThrow(/Administrador/);
    expect(mocks.linkSchoolIds).toEqual([]);
  });

  it("recusa sem escola activa", async () => {
    mocks.membership = null;
    await expect(call({ context: { userId: "u1" } })).rejects.toThrow(/Sem escola activa/);
  });
});
