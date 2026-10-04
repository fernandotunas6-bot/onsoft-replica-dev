import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  NOT_WORKER_SECRETS,
  OPTIONAL_WORKER_SECRETS,
  OPTIONAL_WORKER_VARS,
  REQUIRED_WORKER_SECRETS,
  collectWorkerSecrets,
  collectWorkerVars,
} from "../../scripts/worker-secrets.mjs";

const SENSITIVE = /(KEY|SECRET|TOKEN|PASSWORD|_SID|FROM_NUMBER)$/;

function envNamesReadBy(dir: string, out = new Set<string>()) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) envNamesReadBy(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) {
      const code = readFileSync(full, "utf8");
      for (const m of code.matchAll(/process\.env(?:\?\.|\.|\[")([A-Z0-9_]+)/g)) out.add(m[1]);
      // Helpers locais (`env("APPYPAY_CLIENT_SECRET")`): escapavam a esta verificação.
      for (const m of code.matchAll(/\benv\("([A-Z][A-Z0-9_]+)"\)/g)) out.add(m[1]);
    }
  }
  return out;
}

describe("segredos do worker", () => {
  it("toda a chave sensível lida pelo servidor vai como segredo cifrado (ou está justificada)", () => {
    const known = new Set([
      ...REQUIRED_WORKER_SECRETS,
      ...OPTIONAL_WORKER_SECRETS,
      ...Object.keys(NOT_WORKER_SECRETS),
    ]);
    const missing = [...envNamesReadBy(join(process.cwd(), "src"))]
      .filter((name) => SENSITIVE.test(name) && !known.has(name))
      .sort();
    expect(
      missing,
      `Acrescente a scripts/worker-secrets.mjs (ou justifique em NOT_WORKER_SECRETS): ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("só envia as que estão definidas; o .env local tem prioridade", () => {
    const secrets = collectWorkerSecrets(
      { SUPABASE_SERVICE_ROLE_KEY: "local", SIGA_CRON_SECRET: "cron" },
      { SUPABASE_SERVICE_ROLE_KEY: "ambiente", TWILIO_AUTH_TOKEN: "tw", RESEND_API_KEY: "" },
    );
    expect(secrets).toEqual([
      ["SUPABASE_SERVICE_ROLE_KEY", "local"],
      ["SIGA_CRON_SECRET", "cron"],
      ["TWILIO_AUTH_TOKEN", "tw"],
    ]);
  });

  it("o script de publicação não põe segredos em vars (texto simples)", () => {
    const script = readFileSync(join(process.cwd(), "scripts/deploy-cf.mjs"), "utf8");
    const varsBlock = script.slice(
      script.indexOf("config.vars = {"),
      script.indexOf("};", script.indexOf("config.vars = {")),
    );
    for (const name of [...REQUIRED_WORKER_SECRETS, ...OPTIONAL_WORKER_SECRETS]) {
      expect(varsBlock).not.toMatch(new RegExp(`^\\s*${name}\\s*[:,]`, "m"));
    }
  });

  it("toda a variável que o servidor lê tem destino na publicação", () => {
    const script = readFileSync(join(process.cwd(), "scripts/deploy-cf.mjs"), "utf8");
    const varsBlock = script.slice(script.indexOf("config.vars = {"));
    const known = new Set([
      ...REQUIRED_WORKER_SECRETS,
      ...OPTIONAL_WORKER_SECRETS,
      ...OPTIONAL_WORKER_VARS,
      ...Object.keys(NOT_WORKER_SECRETS),
    ]);
    const missing = [...envNamesReadBy(join(process.cwd(), "src"))]
      .filter((name) => !name.startsWith("VITE_") && !known.has(name))
      .filter((name) => !new RegExp(`\\b${name}\\b`).test(varsBlock))
      .sort();
    expect(
      missing,
      `Sem destino na publicação (worker-secrets.mjs ou vars de deploy-cf.mjs): ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("a publicação mantém as variáveis do painel e só envia config definida", () => {
    const script = readFileSync(join(process.cwd(), "scripts/deploy-cf.mjs"), "utf8");
    expect(script).toMatch(/config\.keep_vars = true/);
    expect(
      collectWorkerVars({ PLATFORM_DOMAIN: "x.ao" }, { APPYPAY_ENV: "", ZOOM_CLIENT_ID: "z" }),
    ).toEqual([
      ["PLATFORM_DOMAIN", "x.ao"],
      ["ZOOM_CLIENT_ID", "z"],
    ]);
    for (const name of OPTIONAL_WORKER_VARS) {
      expect(OPTIONAL_WORKER_SECRETS, `${name} não pode ser segredo e var`).not.toContain(name);
    }
  });
});
