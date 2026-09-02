import { describe, expect, it } from "vitest";
import { isAllowedEcosystemOrigin } from "@/lib/ecosystem-cors";
import { isPublicAppPath } from "@/lib/public-paths";

describe("ecosystem CORS origins", () => {
  it("allows the local WEB origin", () => {
    expect(isAllowedEcosystemOrigin("http://localhost:5174", ["web"])).toBe(true);
  });

  it("rejects an arbitrary origin", () => {
    expect(isAllowedEcosystemOrigin("https://evil.example", ["web"])).toBe(false);
  });

  it("rejects a missing origin", () => {
    expect(isAllowedEcosystemOrigin(null, ["web"])).toBe(false);
  });
});

describe("public ecosystem paths", () => {
  it("treats SaaS HTTP APIs as public", () => {
    expect(isPublicAppPath("/api/saas/signup")).toBe(true);
    expect(isPublicAppPath("/api/saas/plans")).toBe(true);
    expect(isPublicAppPath("/api/saas/me")).toBe(true);
    expect(isPublicAppPath("/api/saas/usage/sync")).toBe(true);
  });

  it("treats SaaS and create-school bridges as public", () => {
    expect(isPublicAppPath("/saas-admin")).toBe(true);
    expect(isPublicAppPath("/criar-escola")).toBe(true);
  });
});
