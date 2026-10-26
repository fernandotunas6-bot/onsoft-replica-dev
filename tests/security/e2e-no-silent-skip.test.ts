import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const pythonE2E = readFileSync(resolve(root, "scripts/siga/e2e-ecosystem-playwright.py"), "utf8");

describe("E2E remoto: erros reais não se tornam sucesso", () => {
  it("prepare-ci-env falha se a chave de serviço de staging não existir", () => {
    const result = spawnSync(process.execPath, ["scripts/siga/prepare-ci-env.mjs"], {
      cwd: root,
      env: { ...process.env, SUPABASE_SECRET_KEY: "" },
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("SUPABASE_SECRET_KEY é obrigatório");
    expect(result.stdout).not.toContain("sincronizados");
  });

  it("Python @live não permite silenciar a ausência do browser", () => {
    expect(pythonE2E).toContain('if not LIVE and os.environ.get("SIGA_E2E_SKIP_UI") == "1":');
    expect(pythonE2E).not.toContain('if os.environ.get("SIGA_E2E_SKIP_UI") == "1":');
  });

  it("Python @live inclui as falhas de limpeza no resultado final", () => {
    expect(pythonE2E).toContain("outcome = subprocess.run(");
    expect(pythonE2E).toContain("if outcome.returncode != 0:");
    expect(pythonE2E).toContain("failures.append(");
    expect(pythonE2E).toContain('cleanup_e2e_tenant(slug, failures, payload["admin_email"])');
    expect(pythonE2E).toContain("cleanup_e2e_tenant(slug, failures, email)");
  });
});
