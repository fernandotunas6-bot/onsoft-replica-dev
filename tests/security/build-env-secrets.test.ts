import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildEnvWithoutSecrets, isBuildSecretName } from "../../scripts/siga/build-env.mjs";

/**
 * Análise 22, P2-2: os builds das cinco apps corriam com ~40 segredos da produção no
 * ambiente. Uma dependência comprometida no build lia-os de `process.env`.
 */
const read = (path: string) => readFileSync(resolve(__dirname, "../..", path), "utf8");

describe("ambiente dos builds sem segredos", () => {
  it("tira segredos e mantém o que é público ou necessário", () => {
    const env = buildEnvWithoutSecrets({
      PATH: "/usr/bin",
      HOME: "/home/ci",
      NODE_ENV: "production",
      CI: "true",
      CLOUDFLARE_ACCOUNT_ID: "conta",
      VITE_SUPABASE_URL: "https://x.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
      VITE_HCAPTCHA_SITE_KEY: "site",
      NEXT_PUBLIC_PAYFLOW_ENABLED: "",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
      SUPABASE_SERVICE_ROLE_KEY: "segredo",
      SUPABASE_SECRET_KEY: "sb_secret_x",
      SUPABASE_JWT_SECRET: "jwt",
      CLOUDFLARE_API_TOKEN: "cf",
      OTP_PEPPER_SECRET: "pepper",
      TWILIO_ACCOUNT_SID: "sid",
      TWILIO_AUTH_TOKEN: "twilio",
      GOOGLE_SERVICE_ACCOUNT_KEY: "{}",
      ZOHO_MAIL_REFRESH_TOKEN: "zoho",
      PAYFLOW_INTEGRATION_API_KEY: "k",
      ACTIONS_RUNTIME_TOKEN: "gh",
      UNDEFINED_VALUE: undefined,
    });
    expect(Object.keys(env).sort()).toEqual(
      [
        "CI",
        "CLOUDFLARE_ACCOUNT_ID",
        "HOME",
        "NEXT_PUBLIC_PAYFLOW_ENABLED",
        "NODE_ENV",
        "PATH",
        "SUPABASE_PUBLISHABLE_KEY",
        "VITE_HCAPTCHA_SITE_KEY",
        "VITE_SUPABASE_PUBLISHABLE_KEY",
        "VITE_SUPABASE_URL",
      ].sort(),
    );
  });

  it("todos os segredos conhecidos do Worker ficam fora", async () => {
    const { OPTIONAL_WORKER_SECRETS, REQUIRED_WORKER_SECRETS } =
      await import("../../scripts/worker-secrets.mjs");
    for (const name of [...REQUIRED_WORKER_SECRETS, ...OPTIONAL_WORKER_SECRETS]) {
      expect(isBuildSecretName(name), name).toBe(true);
    }
  });

  it("os scripts de publicação dão aos builds o ambiente filtrado", () => {
    const all = read("scripts/deploy-all.mjs");
    expect(all.match(/execSync\("npm run build", \{[^}]*env: buildEnv \}\)/g)).toHaveLength(4);
    expect(all).not.toMatch(/execSync\("npm run build", \{[^}]*env: mergedEnv/);
    expect(read("scripts/deploy-cf.mjs")).toMatch(
      /execSync\("npx vite build --mode production", \{\s*stdio: "inherit",\s*env: buildEnvWithoutSecrets\(/,
    );
  });

  it("os workflows não instalam a versão mais recente do bun sem querer", () => {
    for (const name of ["ci", "deploy-production", "security-postgres", "ecosystem-e2e-live"]) {
      expect(read(`.github/workflows/${name}.yml`), name).not.toContain("bun-version: latest");
    }
  });
});
