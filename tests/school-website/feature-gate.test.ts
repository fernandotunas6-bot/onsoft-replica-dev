import { afterEach, describe, expect, it, vi } from "vitest";
import { requireSchoolSitesEnabled, schoolSitesEnabled } from "@/features/school-site/feature-gate";

afterEach(() => vi.unstubAllEnvs());

describe("school sites — activação explícita e segura", () => {
  it("mantém sites desligados se flag estiver ausente", () => {
    vi.stubEnv("SCHOOL_SITES_ENABLED", "");
    expect(schoolSitesEnabled()).toBe(false);
    expect(() => requireSchoolSitesEnabled()).toThrow("segurança dos rascunhos");
  });

  it("não permite activação por valores ambíguos", () => {
    for (const value of ["1", "TRUE", "yes", "on", "false"]) {
      vi.stubEnv("SCHOOL_SITES_ENABLED", value);
      expect(schoolSitesEnabled()).toBe(false);
    }
  });

  it("só permite activação com true exacto após validação do rollout", () => {
    vi.stubEnv("SCHOOL_SITES_ENABLED", "true");
    expect(schoolSitesEnabled()).toBe(true);
    expect(() => requireSchoolSitesEnabled()).not.toThrow();
  });
});
