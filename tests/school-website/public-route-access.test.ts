import { describe, expect, it } from "vitest";
import { isPublicAppPath } from "@/lib/public-paths";

describe("websites escolares — fronteira pública do router", () => {
  it("permite ler o website escolar sem autenticação", () => {
    expect(isPublicAppPath("/site")).toBe(true);
    expect(isPublicAppPath("/api/public/school-site")).toBe(true);
  });

  it("mantém o editor e o portal atrás de AuthGate", () => {
    expect(isPublicAppPath("/")).toBe(false);
    expect(isPublicAppPath("/configuracoes/site")).toBe(false);
    expect(isPublicAppPath("/configuracoes/boas-vindas")).toBe(false);
    expect(isPublicAppPath("/configuracoes")).toBe(false);
  });

  it("não transforma urls que apenas começam com 'site' em públicas", () => {
    for (const pathname of [
      "/site/admin",
      "/site/preview",
      "/api/public/school-site/editor",
      "/site-admin",
      "/site_privado",
      "/api/public/school-site-private",
      "/configuracoes/site/preview",
      "/escolas/portal",
    ]) {
      expect(isPublicAppPath(pathname)).toBe(false);
    }
  });
});
