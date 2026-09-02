import { describe, expect, it } from "vitest";
import { isE2ETenantSlug } from "../../tests/e2e/helpers/sga-live-admin";

describe("isE2ETenantSlug", () => {
  it("aceita slugs dos testes @live", () => {
    expect(isE2ETenantSlug("e2e-mf2abc123")).toBe(true);
    expect(isE2ETenantSlug("web-mf2abc123")).toBe(true);
    expect(isE2ETenantSlug("mat-mf2abc123")).toBe(true);
    expect(isE2ETenantSlug("gw-mf2abc123")).toBe(true);
  });

  it("rejeita slugs de produção ou demo", () => {
    expect(isE2ETenantSlug("dom-afonso-demo")).toBe(false);
    expect(isE2ETenantSlug("escola-real")).toBe(false);
  });
});

describe("cleanupE2ETenantBySlug", () => {
  it("recusa slug fora do padrão E2E", async () => {
    const { cleanupE2ETenantBySlug } = await import("../../tests/e2e/helpers/sga-live-admin");
    await expect(cleanupE2ETenantBySlug("dom-afonso-demo")).rejects.toThrow(/Refusing cleanup/);
  });
});
