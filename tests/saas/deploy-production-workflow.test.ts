import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OPTIONAL_WORKER_SECRETS, REQUIRED_WORKER_SECRETS } from "../../scripts/worker-secrets.mjs";

const workflow = readFileSync(
  join(process.cwd(), ".github/workflows/deploy-production.yml"),
  "utf8",
);
const job = (name: string) => {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  const next = workflow.slice(start + 1).search(/\n {2}[a-z-]+:\n/);
  return workflow.slice(start, next === -1 ? undefined : start + 1 + next);
};

describe("workflow de publicação em produção", () => {
  it("só publica a partir da main, depois da verificação, no ambiente production", () => {
    expect(workflow).toMatch(/push:\n\s+branches: \[main\]/);
    expect(workflow).toMatch(/workflow_dispatch:/);
    const deploy = job("deploy");
    expect(deploy).toMatch(/needs: verify/);
    expect(deploy).toMatch(/environment:\n\s+name: production/);
    const verify = job("verify");
    for (const check of ["typecheck", "lint", "bun run test"]) expect(verify).toContain(check);
  });

  it("depois de publicar, confirma o health do PayFlow (503 sem base) e o SIGA", () => {
    const deploy = job("deploy");
    expect(deploy).toContain("https://payflow.portal-siga.com/api/v1/health");
    expect(deploy).toMatch(/curl -fsS/);
    expect(deploy.indexOf("deploy-all.mjs")).toBeLessThan(deploy.indexOf("/api/v1/health"));
  });

  it("uma publicação de cada vez, nunca cancelada a meio", () => {
    expect(workflow).toMatch(
      /concurrency:\n\s+group: deploy-production\n\s+cancel-in-progress: false/,
    );
  });

  it("passa ao deploy todos os segredos que o Worker do SIGA conhece", () => {
    const names = [...REQUIRED_WORKER_SECRETS, ...OPTIONAL_WORKER_SECRETS];
    expect(names.length).toBeGreaterThan(10);
    for (const name of names) {
      // `||` permite um segredo com outro nome (ex.: SUPABASE_SECRET_KEY) como recurso.
      expect(workflow, name).toMatch(
        new RegExp(`${name}: \\$\\{\\{ secrets\\.${name}( \\|\\|| \\}\\})`),
      );
    }
  });
});
