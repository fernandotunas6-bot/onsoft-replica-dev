import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const TEST_REF = "stagingreleasevalidation123";
const REQUIRED = {
  STAGING_SUPABASE_PROJECT_ID: TEST_REF,
  STAGING_SUPABASE_URL: `https://${TEST_REF}.supabase.co`,
  STAGING_SUPABASE_PUBLISHABLE_KEY: "test-public-key",
  STAGING_SUPABASE_SECRET_KEY: "test-private-key",
};

function runPreflight(overrides: Record<string, string>) {
  return spawnSync(process.execPath, ["scripts/siga/release-staging-preflight.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, ...REQUIRED, ...overrides },
  });
}

describe("homologação de release: staging isolado obrigatório", () => {
  it("aceita apenas configuração sintética completa e coerente", () => {
    const result = runPreflight({});
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Staging isolado validado");
    expect(result.stdout).not.toContain(REQUIRED.STAGING_SUPABASE_SECRET_KEY);
  });

  it("falha quando falta qualquer segredo de staging", () => {
    for (const name of Object.keys(REQUIRED)) {
      const result = runPreflight({ [name]: "" });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(name);
      expect(result.stderr).not.toContain(REQUIRED.STAGING_SUPABASE_SECRET_KEY);
    }
  });

  it("recusa explicitamente a base de produção", () => {
    const ref = "xodgfmxiaunpamctfeea";
    const result = runPreflight({
      STAGING_SUPABASE_PROJECT_ID: ref,
      STAGING_SUPABASE_URL: `https://${ref}.supabase.co`,
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("produção nunca é permitida");
  });

  it("recusa URL de outro projecto mesmo com id de staging", () => {
    const result = runPreflight({
      STAGING_SUPABASE_URL: "https://projetodiferente.supabase.co",
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("projecto inesperado");
  });
});
