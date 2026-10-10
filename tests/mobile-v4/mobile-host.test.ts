import { describe, expect, it } from "vitest";
import { isMobileHost, routeMobileHostRequest } from "@/lib/mobile-host";
import { isReservedSubdomain } from "@/lib/saas/platform-domain";

const at = (path: string, init?: RequestInit) =>
  routeMobileHostRequest(new Request(`https://m.portal-siga.com${path}`, init));

describe("host móvel m.portal-siga.com", () => {
  it("reconhece só o subdomínio m da plataforma", () => {
    expect(isMobileHost("m.portal-siga.com")).toBe(true);
    expect(isMobileHost("M.Portal-Siga.com.")).toBe(true);
    expect(isMobileHost("portal-siga.com")).toBe(false);
    expect(isMobileHost("escola.portal-siga.com")).toBe(false);
    expect(isMobileHost("m.escola.portal-siga.com")).toBe(false);
    expect(isMobileHost("m.portal-siga.com.evil.test")).toBe(false);
  });

  it("nenhuma escola pode ficar com m ou mobile", () => {
    expect(isReservedSubdomain("m")).toBe(true);
    expect(isReservedSubdomain("mobile")).toBe(true);
  });

  it("deixa passar só a API Mobile", () => {
    expect(at("/api/mobile-v4/session")).toBeNull();
    expect(at("/api/mobile-v4/schools/x/commands", { method: "POST" })).toBeNull();
  });

  it("fecha o resto do portal neste host", async () => {
    for (const path of ["/api/saas/tenants/lookup", "/api", "/_serverFn/abc"]) {
      const response = at(path)!;
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toContain("no-store");
    }
    expect(at("/mobile/assets/nao-existe.js")!.status).toBe(404);
    expect(at("/login", { method: "POST" })!.status).toBe(405);
  });

  it("leva a raiz e páginas do portal para a app", () => {
    for (const path of ["/", "/login", "/dashboard?x=1"]) {
      const response = at(path)!;
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/mobile/");
    }
  });
});
