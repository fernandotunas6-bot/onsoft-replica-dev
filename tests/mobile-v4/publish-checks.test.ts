import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/saas/platform-guard", () => ({ resolveBearerSession: vi.fn() }));
vi.mock("@/integrations/supabase/sga-admin", () => ({ loadSgaAdminClient: vi.fn() }));
vi.mock("@/features/mobile-v4/session-core.server", () => ({ loadMobileV4Session: vi.fn() }));
vi.mock("@/features/mobile-v4/operations-core.server", () => ({
  loadMobileV4Workspace: vi.fn(),
  loadMobileV4AcademicCatalog: vi.fn(),
  loadMobileV4Attendance: vi.fn(),
  loadMobileV4Results: vi.fn(),
  loadMobileV4Gradebooks: vi.fn(),
  loadMobileV4LessonPlans: vi.fn(),
  loadMobileV4Documents: vi.fn(),
  loadMobileV4Finance: vi.fn(),
  loadMobileV4Chat: vi.fn(),
  loadMobileV4ChatContacts: vi.fn(),
  loadMobileV4ChatAttachment: vi.fn(),
  applyMobileV4ChatCommand: vi.fn(),
  loadMobileV4ChatCapabilities: vi.fn(),
  loadMobileV4Notifications: vi.fn(),
  applyMobileV4NotificationsRead: vi.fn(),
  applyMobileV4AttendanceCall: vi.fn(),
  applyMobileV4Command: vi.fn(),
}));

import { handleMobileV4Http, type MobileHttpDependencies } from "@/features/mobile-v4/http.server";
// @ts-expect-error — módulo JS do script de publicação, sem tipos.
import { verify, withPagesOrigin, readPagesOrigin } from "../../mobile-v4/scripts/publish.mjs";

const BASE = "https://abcd1234.siga-plus-mobile-v4.pages.dev";
const refuseAll = new Proxy({} as MobileHttpDependencies, {
  get: (_t, key) =>
    key === "authenticate"
      ? async () => {
          throw new Error("sem sessão");
        }
      : async () => {
          throw new Error("não devia chegar aqui");
        },
});
/** O Mobile publicado: a página e a API real, sem nenhuma sessão válida. */
const deployed = (deps = refuseAll) =>
  (async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    if (!path.startsWith("/api/"))
      return new Response("<!doctype html>", { headers: { "content-type": "text/html" } });
    return handleMobileV4Http(new Request(url, init), deps);
  }) as typeof fetch;

describe("verificações da publicação do Mobile", () => {
  it("passam contra a API real, sem sessão", async () => {
    expect(await verify(BASE, deployed())).toEqual([]);
  });

  it("apanham uma rota em falta e uma página que não abre", async () => {
    const broken = (async (url: string, init?: RequestInit) =>
      url.includes("/documents")
        ? new Response("{}", { status: 404 })
        : url.endsWith(".dev/")
          ? new Response("erro", { status: 502 })
          : deployed()(url, init)) as typeof fetch;
    const failures = await verify(BASE, broken);
    expect(failures.some((f: string) => f.startsWith("página"))).toBe(true);
    expect(failures.some((f: string) => f.startsWith("documents sem token"))).toBe(true);
  });

  it("só aceita como destino um URL fixo de deployment", () => {
    const config =
      '{ "vars": { "PAGES_ORIGIN": "https://361b8072.siga-plus-mobile-v4.pages.dev" } }';
    expect(readPagesOrigin(withPagesOrigin(config, BASE))).toBe(BASE);
    for (const bad of [
      "https://staging-mobile-v4-pr116.siga-plus-mobile-v4.pages.dev",
      "https://abcd1234.outro.pages.dev",
      "http://abcd1234.siga-plus-mobile-v4.pages.dev",
    ])
      expect(() => withPagesOrigin(config, bad)).toThrow();
  });
});
