import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repo = resolve(__dirname, "../..");
const script = resolve(repo, "scripts/siga/prepare-ci-env.mjs");

/** Executa o preflight em processo isolado, sem credenciais nem rede. */
function prepare(env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [script], {
    cwd: repo,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH ?? "",
      ...env,
    },
  });
}

describe("preparação do E2E @live é fail-closed", () => {
  it("falha quando a chave de staging está ausente", () => {
    const result = prepare({ SIGA_E2E_LIVE: "1" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("staging incompleto");
    expect(result.stdout).not.toContain("preparado");
  });

  it("falha quando @live usa true e a chave está vazia", () => {
    const result = prepare({ SIGA_E2E_LIVE: "true", SUPABASE_SECRET_KEY: "" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("SUPABASE_SECRET_KEY");
  });

  it("preserva skip explícito para ensaios não live sem chave", () => {
    const result = prepare({ SIGA_E2E_LIVE: "0" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("sem @live");
  });

  it("recusa credencial fictícia sem endereço e chave pública", () => {
    const result = prepare({ SIGA_E2E_LIVE: "1", SUPABASE_SECRET_KEY: "fixture-not-real" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("SUPABASE_URL");
    expect(result.stderr).not.toContain("fixture-not-real");
  });

  it("recusa projecto de produção antes de escrever qualquer .env", () => {
    const result = prepare({
      SIGA_E2E_LIVE: "1",
      SIGA_E2E_ALLOW_WRITES: "1",
      SIGA_E2E_PROJECT_REF: "xodgfmxiaunpamctfeea",
      SUPABASE_URL: "https://xodgfmxiaunpamctfeea.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "fixture-publishable",
      SUPABASE_SECRET_KEY: "fixture-secret",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/produção/);
    expect(result.stderr).not.toContain("fixture-secret");
  });
});
